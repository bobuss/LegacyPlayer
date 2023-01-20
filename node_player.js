/**
* Generic AudioWorkletProcessor based WebAudio music player (end user API).
*
* Original work by Juergen Wothke: https://bitbucket.org/wothke/webaudio-player/src/master/
*
* Terms of Use: This software is licensed under a CC BY-NC-SA
* (http://creativecommons.org/licenses/by-nc-sa/4.0/).
*/

const SUPPORTED_PROCESSORS = ['sc68', 'openmpt']

export class NodePlayer {

    constructor(canvas) {

        const audioWorkletSupport = !!AudioWorkletNode.toString().match(/native code/);
        if (!audioWorkletSupport) {
            alert('Browser not supporter. Needs AudioWorklet')
        }

        this.spectrumEnabled = false
        this.canvas;
        this.canvasContext;

        // container for song infos like: name, author, etc
        this.songInfo = {};

        // general WebAudio stuff
        this.gainNode;
        this.analyzerNode;
        this.audioWorkletNodes = {}
        this.processorName;

        // --------------- player status stuff ----------

        this.playing = false;
        this.lasFullFilename;
        this.lastData;
        this.lastTrack;

        // hooks
        this.onPlayerReady = function () { console.log('onPlayerReady') }
        this.onTrackReadyToPlay = function () { console.log('onTrackReadyToPlay') }
        this.onTrackEnd = function () { console.log('onTrackEnd') }

        this.createAudioContext()
    }

    createAudioContext() {

        console.log('Creating audio context...');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        this.sampleRate = this.audioContext.sampleRate;
        this.correctSampleRate = this.sampleRate;

        if (this.isAppleShit()) {
            this.iOSHack(this.audioContext);
        }

        this.analyzerNode = this.audioContext.createAnalyser();

        this.gainNode = this.audioContext.createGain();

        // this.analyzerNode.fftSize = 256;// Math.pow(2, 11);
        // this.analyzerNode.minDecibels = -90;
        // this.analyzerNode.maxDecibels = -10;
        // this.analyzerNode.smoothingTimeConstant = 0.65;

        return

    }

    async setWorkletProcessor(processorName) {
        if (!processorName in SUPPORTED_PROCESSORS) {
            console.log('Processor not supported')
            return false
        } else {
            //this.processorName = processorName
            if (this.audioWorkletNodes[processorName] === undefined) {
                const timestamp = Date.now()

                await this.audioContext.audioWorklet.addModule(processorName + "_worklet_processor.js?" + timestamp)

                this.audioWorkletNodes[processorName] = new AudioWorkletNode(
                    this.audioContext,
                    processorName + '-worklet-processor'
                );
                // onmessage
                this.audioWorkletNodes[processorName].port.onmessage = this.onmessage.bind(this);
                this.audioWorkletNodes[processorName].connect(this.gainNode);
                this.gainNode.connect(this.analyzerNode);
                this.analyzerNode.connect(this.audioContext.destination);
                console.log('registered ' + processorName + '-worklet-processor')
            } else {
                // stop any playing on the current audioWorklet
                this.pause()
            }
            this.processorName = processorName
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

                        this.audioWorkletNodes[this.processorName].port.postMessage({
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

        await this.setWorkletProcessor(processorName)

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
        const path = filename.substring(0, filename.lastIndexOf("/"));
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

            this.audioWorkletNodes[this.processorName].port.postMessage({
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

    // ******* basic playback features

    /*
    * start audio playback
    */
    play(options) {
        // on Safari macOS/iOS, the audioContext is suspended if it's not created
        // in the event handler of a user action: we attempt to resume it.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.audioWorkletNodes[this.processorName].port.postMessage({
            type: 'play',
            options: options
        })
        this.playing = true;
        this.render();
    }

    /*
    * pause audio playback
    */
    pause() {
        this.audioWorkletNodes[this.processorName].port.postMessage({
            type: 'pause'
        })
        this.playing = false;
    }

    setTrack(track) {
        this.audioWorkletNodes[this.processorName].port.postMessage({
            type: 'setTrack',
            track: track
        })
    }

    /*
    * set the playback volume (input between 0 and 1)
    */
    setVolume(value) {
        if (typeof this.gainNode != 'undefined') {
            this.gainNode.gain.value = value;
        }
    }


    getVolume() {
        if (typeof this.gainNode != 'undefined') {
            return this.gainNode.gain.value;
        }
        return -1;
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

    /*
    * is playback in stereo?
    * TODO: use worklet
    */
    isStereo() {
        //return this.backendAdapter.getChannels() == 2;
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

            this.audioWorkletNodes[this.processorName].port.postMessage({
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
        this.canvasContext.clearRect(0, 0, this.canvas.width * 4, this.canvas.height);

        if (this.analyzerNode === undefined) {
            return
        }

        const style = "rgb(43, 156, 212)",
            edgeThreshold = 0,
            pos = 0;



        const timeData = new Float32Array(this.analyzerNode.frequencyBinCount);
        let risingEdge = 0;

        this.analyzerNode.getFloatTimeDomainData(timeData);

        this.canvasContext.fillStyle = "rgba(255,255,255,0.8)";
        this.canvasContext.strokeStyle = style;
        this.canvasContext.fillStyle = style;

        // this.canvasContext.beginPath();

        while (timeData[risingEdge] > 0 &&
            risingEdge <= this.canvas.width &&
            risingEdge < timeData.length) {
            risingEdge++;
        }

        if (risingEdge >= this.canvas.width) { risingEdge = 0; }


        while (timeData[risingEdge] < edgeThreshold &&
            risingEdge <= this.canvas.width &&
            risingEdge < timeData.length) {
            risingEdge++;
        }

        if (risingEdge >= this.canvas.width) { risingEdge = 0; }

        for (let x = risingEdge; x < timeData.length && x - risingEdge < this.canvas.width; x++) {
            const y = this.canvas.height - (((timeData[x] + 1) / 2) * this.canvas.height);
            // this.canvasContext.moveTo(x - risingEdge + i * this.canvas.width, y-1);
            // this.canvasContext.lineTo(x - risingEdge + i * this.canvas.width, y);
            this.canvasContext.fillRect(x - risingEdge + pos * this.canvas.width, y, 1, 1);
        }
    }
}

