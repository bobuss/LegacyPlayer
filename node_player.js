/**
* Generic AudioWorkletProcessor based WebAudio music player (end user API).
*
* Original work by Juergen Wothke: https://bitbucket.org/wothke/webaudio-player/src/master/
*
* Terms of Use: This software is licensed under a CC BY-NC-SA
* (http://creativecommons.org/licenses/by-nc-sa/4.0/).
*/

const SUPPORTED_PROCESSORS = [ 'sc68', 'openmpt' ]


export class NodePlayer {

    spectrumEnabled = false
    canvas;
    canvasContext;

    // container for song infos like: name, author, etc
    songInfo = {};

    // general WebAudio stuff
    audioRoutings = {}

    gainNode;
    panNode;
    audioWorklet;
    processorName;

    // --------------- player status stuff ----------

    playing = false;
    lasFullFilename;
    lastData;
    lastTrack;


    constructor(audioContext) {

        this.audioContext = audioContext
        this.sampleRate = this.audioContext.sampleRate;

        const audioWorkletSupport = !!AudioWorkletNode.toString().match(/native code/);
        if (!audioWorkletSupport) {
            alert('Browser not supporter. Needs AudioWorklet')
        }

        // hooks
        this.onPlayerReady = function () { console.log('onPlayerReady') }
        this.onTrackReadyToPlay = function () { console.log('onTrackReadyToPlay') }
        this.onTrackEnd = function () { console.log('onTrackEnd') }


        if (this.isAppleShit()) {
            this.iOSHack(this.audioContext);
        }

        this.gainNode = this.audioContext.createGain();
        this.panNode = this.audioContext.createStereoPanner();

        this.gainNode.connect(this.panNode)
        this.panNode.connect(this.audioContext.destination);
    }


    async loadWorkletProcessor(processorName) {
        if (!processorName in SUPPORTED_PROCESSORS) {
            console.log('Processor not supported')
            return false
        } else {

            if (this.audioRoutings[processorName] === undefined) {

                const timestamp = Date.now()

                await this.audioContext.audioWorklet.addModule(processorName + "_worklet_processor.js?" + timestamp)

                const audioWorkletNode = new AudioWorkletNode(
                    this.audioContext,
                    processorName + '-worklet-processor',
                    {
                        numberOfOutputs: 1,
                        outputChannelCount: [2]
                    }
                );
                audioWorkletNode.port.onmessage = this.onmessage.bind(this);
                audioWorkletNode.port.start()

                const splitter = this.audioContext.createChannelSplitter(2);
                audioWorkletNode.connect(splitter)

                const merger = this.audioContext.createChannelMerger(2);

                const channelGains = []
                const analyzerNodes = []

                for (let i = 0; i < 2 ; ++i) {
                    const channelGain = this.audioContext.createGain();
                    const analyser = this.audioContext.createAnalyser();

                    // analysers parameters to tweak
                    analyser.minDecibels = -140;
                    analyser.maxDecibels = 0;
                    analyser.fftSize = 2048
                    analyser.smoothingTimeConstant = 0.8;

                    splitter.connect(channelGain, i, 0)
                    channelGain.connect(analyser)
                    analyser.connect(merger, 0, i)
                    channelGains.push(channelGain)
                    analyzerNodes.push(analyser)
                }

                this.audioRoutings[processorName] = {
                    'audioWorkletNode': audioWorkletNode,
                    'channelGains': channelGains,
                    'analyzerNodes': analyzerNodes,
                    'merger': merger
                };

                console.log('registered ' + processorName + '-worklet-processor')
            } else {
                console.log(processorName + '-worklet-processor already registered')
            }
        }
    }

    selectWorkletProcessor(processorName) {
        if (this.processorName) {
            // stop and unplug the current worklet processor
            this.pause()
            this.merger.disconnect(this.gainNode);
        }
        this.processorName = processorName
        this.merger.connect(this.gainNode);
    }

    get merger() {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 ) {
            return this.audioRoutings[this.processorName]['merger'];
        }
    }

    get audioWorkletNode() {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 ) {
            return this.audioRoutings[this.processorName]['audioWorkletNode'];
        }
    }

    get channelGains() {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 ) {
            return this.audioRoutings[this.processorName]['channelGains'];
        }
    }


    get analyzerNodes() {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 ) {
            return this.audioRoutings[this.processorName]['analyzerNodes'];
        }
    }


    async onmessage(event) {
        const { data } = event;

        switch (data.type) {

            case 'songInfoUpdated':
                this.songInfo = data.songInfo
                break;

            case 'fileRequestCallback':
                const url = 'replay/' + data.fullFilename + '.bin';
                await fetch(url)
                    .then(response => {
                        if (!response.ok) {
                            throw new Error(response.status);
                        }
                        return response.arrayBuffer();
                    })
                    .then(buffer => {

                        this.audioWorkletNode.port.postMessage({
                            type: 'registerFileData',
                            name: data.fullFilename,
                            payload: new Uint8Array(buffer)
                        })

                    });
                break;

            case 'retryPrepareTrackForPlayback':
                console.log('retry')
                this.prepareTrackForPlayback(this.lasFullFilename, this.lastData, this.lastTrack)
                break;

            case 'onTrackEnd':
                this.onTrackEnd()
                break;

        }
    }


    async load(url, processorName, track = 1) {

        this.selectWorkletProcessor(processorName)

        await fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                return this.prepareTrackForPlayback(url, buffer, track)
            })
            .catch(error => {
                // Handle/report error
            });

    }


    getPathAndFilename(filename) {
        const sp = filename.split('/');
        const fn = sp[sp.length - 1];
        let path = filename.substring(0, filename.lastIndexOf("/"));
        if (path.lenght) path = path + "/";

        return [path, fn];
    }


    prepareTrackForPlayback(fullFilename, data, track) {
        // For retry
        this.lasFullFilename = fullFilename
        this.lastData = data
        this.lastTrack = track

        this.playing = false;

        const status = this.loadMusicData(fullFilename, data);

        if (status < 0) {
            console.log('Failed in loadMusicData')
        } else if (status === 0) {

            console.log("successfully completed init");

            // in scenarios where a synchronous file-load is involved this first call will typically fail
            // but trigger the file load
            this.setTrack(track)

            this.audioWorkletNode.port.postMessage({
                type: 'updateSongInfo'
            })

            console.log('prepareTrackForPlayback succeded')
            return true;

        } else {
            // error that cannot be resolved.. (e.g. file not exists)
            console.log("prepareTrackForPlayback - fatal error");
        }
        console.log('prepareTrackForPlayback failed')
        return false;
    }


    /*
    * start audio playback
    */
    play(options) {
        if (this.audioWorkletNode) {
            // on Safari macOS/iOS, the audioContext is suspended if it's not created
            // in the event handler of a user action: we attempt to resume it.
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }
            this.audioWorkletNode.port.postMessage({
                type: 'play',
                options: options
            })
            this.playing = true;
            this.render();
        }
    }

    /*
    * pause / resume audio playback
    */
    pause() {
        if (this.audioWorkletNode) {
            if (this.playing) {
                this.audioWorkletNode.port.postMessage({
                    type: 'pause'
                })
                this.playing = false;
            } else {
                this.audioWorkletNode.port.postMessage({
                    type: 'play'
                })
                this.playing = true;
                this.render();
            }
        }
    }

    stop() {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                type: 'pause'
            })
            this.playing = false;
        }
    }


    setTrack(track) {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                type: 'setTrack',
                track: track
            })
        }
    }


    /*
    * set the playback volume (input between 0 and 1)
    */
    setVolume(value) {
        this.gainNode.gain.setValueAtTime(value, this.audioContext.currentTime);
    }


    getVolume() {
        return this.gainNode.gain.value;
    }


    setOnTrackEndOnPlayerReady(onTrackEndOnPlayerReady) {
        this.onTrackEndOnPlayerReady = onTrackEndOnPlayerReady
    }


    setOnTrackReadyToPlay(onTrackReadyToPlay) {
        this.onTrackReadyToPlay = onTrackReadyToPlay
    }


    setOnTrackEnd(onTrackEnd) {
        this.onTrackEnd = onTrackEnd;
    }

    /**
    * Get backend specific song infos like 'author', 'name', etc.
    */
    getSongInfo() {
        return this.songInfo;
    }

    // ******* song "position seek" related (if available with used backend)

    /**
    * Return: default 0 seeking not supported
    * * TODO: use worklet
    */
    getMaxPlaybackPosition() {
        //    return this.backendAdapter.getMaxPlaybackPosition();
    }


    /**
    * Return: default 0
    * * TODO: use worklet
    */
    getPlaybackPosition() {
        //return this.backendAdapter.getPlaybackPosition();
    }


    /**
    * Move playback to 'pos': must be between 0 and getMaxSeekPosition()
    * Return: 0 if successful
    * * TODO: use worklet
    */
    seekPlaybackPosition(pos) {
        //return this.backendAdapter.seekPlaybackPosition(pos);
    }

    setStereoSeparation(stereoSeparation){
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                type: 'setStereoSeparation',
                stereoSeparation: stereoSeparation
            })
        }
    }

    /**
    To get a better result, we also play on the gain nodes bound to each individual channel (left and right)
    - panning goes from -1 (left) to 1 (right)
    - as aresult:
        - when the panning is [-1:0], the left gain goes from [0: 1]
        - when the panning is [0:1], the right gain goes from [0: 1]
    */
    setPanning(panning) {
        panning = parseFloat(panning)
        this.panNode.pan.setValueAtTime(panning, this.audioContext.currentTime);
        this.channelGains[0].gain.value = 1
        this.channelGains[1].gain.value = 1

        if (panning < 0) {
            // left
            this.channelGains[0].gain.setValueAtTime(panning + 1, this.audioContext.currentTime);
        }
        else if (panning > 0) {
            // right
            this.channelGains[1].gain.setValueAtTime(1 - panning, this.audioContext.currentTime);
        }

    }


    // ******* (music) file input related

    isAppleShit() {
        return !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
    }


    iOSHack(ctx) {
        try {
            let source = ctx.createBufferSource();
            if (!source.start) {
                source.start = source.noteOn;
                source.stop = source.noteOff;
            }

            source.buffer = ctx.createBuffer(1, 1, 22050);  // empty buffer
            source.connect(ctx.destination);

            source.start(0);

        } catch (ignore) { }
    }


    loadMusicData(fullFilename, arrayBuffer, options) {

        if (arrayBuffer) {

            const pfn = this.getPathAndFilename(fullFilename);
            const data = new Uint8Array(arrayBuffer);

            this.audioWorkletNode.port.postMessage({
                type: 'loadMusicData',
                sampleRate: this.sampleRate,
                path: pfn[1],
                filename: pfn[1],
                data: data,
                options: options
            })

            return 0;
        }
    }


    enableSpectrum(canvas) {
        this.canvas = canvas;
        this.canvasContext = this.canvas.getContext('2d');
        this.spectrumEnabled = true
    }


    render() {
        if (this.playing && this.spectrumEnabled && this.canvasContext !== undefined) {
            this.renderScope();
            requestAnimationFrame(this.render.bind(this));
        }
    }


    renderScope() {

        this.canvasContext.fillStyle = "transparent";

        this.canvasContext.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const num_analysers = this.analyzerNodes.length

        if (num_analysers == 0) {
            return
        }

        const style = "rgb(43, 156, 212)",
            edgeThreshold = 0;


        this.analyzerNodes.forEach((analyser, ai) => {

            const freqs = new Uint8Array(analyser.frequencyBinCount);
            const times = new Uint8Array(analyser.frequencyBinCount);

            // Get the frequency data from the currently playing music
            analyser.getByteFrequencyData(freqs);
            analyser.getByteTimeDomainData(times);

            const width = Math.floor(1/freqs.length, 10);
            const ia = 1-ai;

             // Draw the frequency domain chart.
            for (let i = 0; i < analyser.frequencyBinCount; i++) {
                const value = freqs[i];
                const percent = value / 256;
                var height = this.canvas.height  * percent;
                var offset = this.canvas.height - height - 1;
                var barWidth = this.canvas.width / 2 / analyser.frequencyBinCount;
                this.canvasContext.fillStyle = 'rgb(43, 156, 212)';
                this.canvasContext.fillRect(i * barWidth + (this.canvas.width / 2 * ia), offset, barWidth, height);
            }

            // Draw the time domain chart.
            for (let i = 0; i < analyser.frequencyBinCount; i++) {
                const value = times[i];
                const percent = value / 256;
                const height = this.canvas.height * percent;
                const offset = this.canvas.height - height - 1;
                var barWidth = this.canvas.width / 2 / analyser.frequencyBinCount;
                this.canvasContext.fillStyle = 'black';
                this.canvasContext.fillRect(i * barWidth + (this.canvas.width / 2 * ia), offset, 1, 2);
            }


            // let risingEdge = 0;

            // analyzerNode.getFloatTimeDomainData(timeData);

            // this.canvasContext.fillStyle = "rgba(255,255,255,0.8)";
            // this.canvasContext.strokeStyle = style;
            // this.canvasContext.fillStyle = style;

            // while (timeData[risingEdge] > 0 && risingEdge <= this.canvas.width / num_analysers && risingEdge < timeData.length) {
            //     risingEdge++;
            // }

            // if (risingEdge >= this.canvas.width / num_analysers) {
            //     risingEdge = 0;
            // }

            // while (timeData[risingEdge] < edgeThreshold && risingEdge <= this.canvas.width / num_analysers && risingEdge < timeData.length) {
            //     risingEdge++;
            // }

            // if (risingEdge >= this.canvas.width / num_analysers) {
            //     risingEdge = 0;
            // }

            // for (let x = risingEdge; x < timeData.length && x - risingEdge < this.canvas.width / num_analysers; x++) {
            //     const y = this.canvas.height - (((timeData[x] + 1) / 2) * this.canvas.height);
            //     // this.canvasContext.moveTo(x - risingEdge + i * this.canvas.width, y-1);
            //     // this.canvasContext.lineTo(x - risingEdge + i * this.canvas.width, y);
            //     this.canvasContext.fillRect(x - risingEdge + i * this.canvas.width / num_analysers, y, 1, 1);
            // }


        });

    }
}

