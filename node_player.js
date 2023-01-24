/**
* Generic AudioWorkletProcessor based WebAudio music player (end user API).
*
* Original work by Juergen Wothke: https://bitbucket.org/wothke/webaudio-player/src/master/
*
* Terms of Use: This software is licensed under a CC BY-NC-SA
* (http://creativecommons.org/licenses/by-nc-sa/4.0/).
*/

const SUPPORTED_PROCESSORS = ['sc68', 'openmpt', 'ahx']


export class NodePlayer {

    spectrumEnabled = false
    scopes = [];

    // container for song infos like: name, author, etc
    songInfo = {};

    // general WebAudio stuff
    processors = {}

    splitter;
    merger;
    leftGain;
    rightGain;
    mainGain;

    leftAnalyser;
    rightAnalyser;
    mainAnalyser;

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
        this.onSongInfoUpdated = function () { console.log('onSongInfoUpdated') }


        if (this.isAppleShit()) {
            this.iOSHack(this.audioContext);
        }

        this.mainGain = this.audioContext.createGain();
        this.splitter = this.audioContext.createChannelSplitter(2);
        this.merger = this.audioContext.createChannelMerger(2);
        this.panNode = this.audioContext.createStereoPanner();

        // Split output in 2 branches for stero
        //  - dedicated analyser
        //  - dedicated volume
        //

        // LEFT
        this.leftGain = this.audioContext.createGain();
        this.leftAnalyser = this.createAnalyser();
        this.splitter.connect(this.leftGain, 0, 0);
        this.leftGain.connect(this.leftAnalyser);
        this.leftAnalyser.connect(this.merger, 0, 0);

        // RIGHT
        this.rightGain = this.audioContext.createGain();
        this.rightAnalyser = this.createAnalyser();
        this.splitter.connect(this.rightGain, 1, 0);
        this.rightGain.connect(this.rightAnalyser);
        this.rightAnalyser.connect(this.merger, 0, 1);

        // Main routing to destinatino
        this.mainAnalyser = this.createAnalyser()
        this.merger.connect(this.mainAnalyser);
        this.mainAnalyser.connect(this.mainGain)
        this.mainGain.connect(this.panNode)
        this.panNode.connect(this.audioContext.destination);
    }

    createAnalyser() {
        const analyser = this.audioContext.createAnalyser();
        // analysers parameters to tweak, certainly not the right place
        analyser.minDecibels = -140;
        analyser.maxDecibels = 0;
        analyser.fftSize = 128
        analyser.smoothingTimeConstant = 0.8;
        return analyser
    }

    async loadWorkletProcessor(processorName) {
        if (!processorName in SUPPORTED_PROCESSORS) {
            console.log('Processor not supported')
            return false
        } else {

            if (this.processors[processorName] === undefined) {

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

                this.processors[processorName] = audioWorkletNode,

                    console.log('registered ' + processorName + '-worklet-processor')
            } else {
                console.log(processorName + '-worklet-processor already registered')
            }
        }
    }

    selectWorkletProcessor(processorName) {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 && this.processorName in this.processors) {
            // stop and unplug the current worklet processor
            this.pause()
            this.audioWorkletNode.disconnect(this.splitter)
        }
        this.processorName = processorName
        this.audioWorkletNode.connect(this.splitter)
    }


    get audioWorkletNode() {
        if (SUPPORTED_PROCESSORS.indexOf(this.processorName) != -1 && this.processorName in this.processors) {
            return this.processors[this.processorName]
        }
    }


    async onmessage(event) {
        const { data } = event;

        switch (data.type) {

            case 'songInfoUpdated':
                this.songInfo = data.songInfo
                this.onSongInfoUpdated()
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
                type: 'updateSongInfo',
                filename: fullFilename
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
            }
        }
    }

    resume() {
        if (this.audioWorkletNode) {
            if (!this.playing) {
                this.audioWorkletNode.port.postMessage({
                    type: 'play'
                })
                this.playing = false;
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
        this.mainGain.gain.setValueAtTime(value, this.audioContext.currentTime);
    }

    getVolume() {
        return this.mainGain.gain.value;
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

    setOnSongInfoUpdated(onSongInfoUpdated) {
        this.onSongInfoUpdated = onSongInfoUpdated
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

    setStereoSeparation(stereoSeparation) {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                type: 'setStereoSeparation',
                stereoSeparation: stereoSeparation
            })
        }
    }

    setRepeatCount(repeatCount) {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.port.postMessage({
                type: 'setRepeatCount',
                repeatCount: repeatCount
            })
        }
    }

    /**
    To get a better result, we also play on the gain nodes bound to each individual channel (left and right)
    panning goes from -1 (left) to 1 (right)
        as a result:
        when the panning is [-1:0], the left gain goes from [0: 1]
        when the panning is [0:1], the right gain goes from [0: 1]
    */
    setPanning(panning) {
        panning = parseFloat(panning)
        this.panNode.pan.setValueAtTime(panning, this.audioContext.currentTime);
        this.leftGain.gain.value = 1
        this.rightGain.gain.value = 1

        if (panning < 0) {
            // left
            this.leftGain.gain.setValueAtTime(panning + 1, this.audioContext.currentTime);
        }
        else if (panning > 0) {
            // right
            this.rightGain.gain.setValueAtTime(1 - panning, this.audioContext.currentTime);
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

    addScopeToMain(scope) {
        scope.register_analyser(this.mainAnalyser)
        this.scopes.push(scope)
    }

    addScopeToLeftChannel(scope) {
        scope.register_analyser(this.leftAnalyser)
        this.scopes.push(scope)
    }

    addScopeToRightChannel(scope) {
        scope.register_analyser(this.rightAnalyser)
        this.scopes.push(scope)
    }

    enableSpectrum() {
        this.spectrumEnabled = true
    }

    disableSpectrum() {
        this.spectrumEnabled = false
    }

    render() {
        if (this.playing && this.spectrumEnabled && this.scopes.length != 0) {
            this.scopes.forEach((scope) => {
                scope.render();
            })
            requestAnimationFrame(this.render.bind(this));
        }
    }

}

