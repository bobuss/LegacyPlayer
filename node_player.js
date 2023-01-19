import { SAMPLES_PER_BUFFER } from './constants.js'
import { FileCache } from './file_cache.js'


var setGlobalWebAudioCtx = function () {
    if (typeof window.gPlayerAudioCtx === undefined) {	// cannot be instantiated 2x (so make it global)
        var errText = 'Web Audio API is not supported in this browser';
        try {
            if ('AudioContext' in window) {
                window.gPlayerAudioCtx = new AudioContext();
            } else if ('webkitAudioContext' in window) {
                window.gPlayerAudioCtx = new webkitAudioContext();		// legacy stuff
            } else {
                alert(errText + e);
            }
        } catch (e) {
            alert(errText + e);
        }
    }
    try {
        if (window.gPlayerAudioCtx.state === 'suspended' && 'ontouchstart' in window) {	//iOS shit
            window.gPlayerAudioCtx.resume();
        }
    } catch (ignore) { }
}


/**
* Generic ScriptProcessor based WebAudio music player (end user API).
*
* <p>Deals with the WebAudio node pipeline, feeds the sample data chunks delivered by
* the backend into the WebAudio input buffers, provides basic file input facilities.
*
*/
export class NodePlayer {


    constructor(canvas) {

        this.canvas = canvas;
        this.canvasContext = this.canvas.getContext('2d');

        this.spectrumEnabled = true //spectrumEnabled;

        // container for song infos like: name, author, etc
        this.songInfo = {};

        this.silenceStarttime = -1;
        this.silenceTimeout = 5; // by default 5 secs of silence will end a song

        // audio buffer handling
        this.sourceBuffer;
        this.sourceBufferLen;
        this.numberOfSamplesRendered = 0;
        this.numberOfSamplesToRender = 0;
        this.sourceBufferIdx = 0;

        // // additional timeout based "song end" handling
        this.currentPlaytime = 0;
        this.currentTimeout = -1;

        // general WebAudio stuff
        this.gainNode;
        this.analyzerNode;
        this.scriptNode;

        this.pan = null;  // default: inactive

        // --------------- player status stuff ----------

        this.isPaused = false;          // 'end' of a song also triggers this state

        // setup asyc completion of initialization
        this.isPlayerReady = false;    // this state means that the player is initialized and can be used now
        this.isSongReady = false;    // initialized (including file-loads that might have been necessary)
        this.initInProgress = false;

        this.preLoadReady = false;

        this.lastData;

        this.createContext()
    }

    createContext() {

        console.log('Creating audio context...');
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

        this.sampleRate = this.audioContext.sampleRate;
        this.correctSampleRate = this.sampleRate;

        if (this.isAppleShit()) {
            this.iOSHack(this.audioContext);
        }

        this.analyzerNode = this.audioContext.createAnalyser();

        // this.analyzerNode.fftSize = 256;// Math.pow(2, 11);
        // this.analyzerNode.minDecibels = -90;
        // this.analyzerNode.maxDecibels = -10;
        // this.analyzerNode.smoothingTimeConstant = 0.65;

        const timestamp = Date.now()

        this.audioContext.audioWorklet.addModule("processor.js?" + timestamp).then(() => {
            this.scriptNode = new AudioWorkletNode(
                this.audioContext,
                'sc68-worklet'
            );

            this.gainNode = this.audioContext.createGain();

            this.scriptNode.connect(this.gainNode);

            // onmessage
            this.scriptNode.port.onmessage = this.onmessage.bind(this);

            if (this.spectrumEnabled) {
                this.gainNode.connect(this.analyzerNode);
                this.analyzerNode.connect(this.audioContext.destination);
            } else {
                this.gainNode.connect(this.audioContext.destination);

            }
        })

    }


    async onmessage(event) {
        const { data } = event;
        console.log('node_player ' + data.type)
        switch (data.type) {

            case 'songInfoUpdated':
                console.log(data.songInfo)
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

                        this.scriptNode.port.postMessage({
                            type: 'registerFileData',
                            name: data.fullFilename,
                            payload: new Uint8Array(buffer)
                        })

                    });
                break;

            case 'retryPrepareTrackForPlayback':
                console.log('retry')
                this.prepareTrackForPlayback(this.lastData)
                break;

        }
    }


    async load(url) {

        await fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                return this.prepareTrackForPlayback(buffer)
            })
            .catch(error => {
                // Handle/report error
            });

    }

    prepareTrackForPlayback(data) {
        // to allow retry
        this.lastData = data

        this.isPaused = true;
        this.isSongReady = false;

        const options = {}

        var status = this.loadMusicData(data, options);

        if (status < 0) {
            console.log('Failed in loadMusicData')
            this.isSongReady = false;
            this.initInProgress = false;

        } else if (status === 0) {
            //  this.isPaused= false;
            this.isSongReady = true;
            this.currentPlaytime = 0;
            this.initInProgress = false;

            console.log("successfully completed init");

            // in scenarios where a synchronous file-load is involved this first call will typically fail
            // but trigger the file load
            this.scriptNode.port.postMessage({
                type: 'evalTrackOptions',
                options: options
            })

            this.scriptNode.port.postMessage({
                type: 'updateSongInfo'
            })

            console.log('prepareTrackForPlayback succeded')
            return true;

        } else {
            this.initInProgress = false;
            // error that cannot be resolved.. (e.g. file not exists)
            console.log("prepareTrackForPlayback - fatal error");
        }
        console.log('prepareTrackForPlayback failed')
        return false;
    }


    // ******* general
    notify() {  // used to handle asynchronously initialized backend impls
        if ((typeof this.deferredPreload !== "undefined") && this.backendAdapter.isAdapterReady()) {
            // now that the runtime is ready the "preload" can be started
            var files = this.deferredPreload[0];
            var onCompletionHandler = this.deferredPreload[1];
            delete this.deferredPreload;

            this.preload(files, files.length, onCompletionHandler);
        }

        if (!this.isPlayerReady && this.preLoadReady && this.backendAdapter.isAdapterReady() && this.backendAdapter.isManualSetupComplete()) {
            this.isPlayerReady = true;
            this.onPlayerReady();
        }
    }

    /**
    * Is the player ready for use? (i.e. initialization completed)
    */
    isReady() {
        return this.isPlayerReady;
    }

    // ******* basic playback features

    /*
    * start audio playback
    */
    play() {
        // on Safari macOS/iOS, the audioContext is suspended if it's not created
        // in the event handler of a user action: we attempt to resume it.
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
        this.scriptNode.port.postMessage({
            type: 'play'
        })
        this.playing = true;
        this.render();
    }

    /*
    * pause audio playback
    */
    pause() {
        this.scriptNode.port.postMessage({
            type: 'pause'
        })
        this.playing = false;
    }

    isPaused() {
        return this.isPaused;
    }


    /*
    * resume audio playback
    */
    resume() {
        if ((!this.isWaitingForFile()) && (!this.initInProgress) && this.isSongReady) {
            this.play();
        }
    }

    getScriptProcessorBufSize() {
        return SAMPLES_PER_BUFFER;
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

    /*
    * change onTrackEnd callback, for looping
    */
    setOnTrackEnd(onTrackEnd) {
        this.onTrackEnd = onTrackEnd;
    }

    /**
    * @value null=inactive; or range; -1 to 1 (-1 is original stereo, 0 creates "mono", 1 is inverted stereo)
    */
    setPanning(value) {
        this.pan = value;
    }


    /*
    * is playback in stereo?
    */
    isStereo() {
        return this.backendAdapter.getChannels() == 2;
    }


    /**
    * Get backend specific song infos like 'author', 'name', etc.
    */
    getSongInfo() {
        return this.songInfo;
    }


    /**
    * Get meta info about backend specific song infos, e.g. what attributes are available and what type are they.
    */
    getSongInfoMeta() {
        return this.backendAdapter.getSongInfoMeta();
    }


    /*
    * Manually defined playback time to use until 'end' of a track (only affects the
    * currently selected track).
    * @param t time in millis
    */
    setPlaybackTimeout(t) {
        this.currentPlaytime = 0;
        if (t < 0) {
            this.currentTimeout = -1;
        } else {
            this.currentTimeout = t / 1000 * this.correctSampleRate;
        }
    }

    /*
    * Timeout in seconds.
    */
    getPlaybackTimeout() {
        if (this.currentTimeout < 0) {
            return -1;
        } else {
            return Math.round(this.currentTimeout / this.correctSampleRate);
        }
    }


    getCurrentPlaytime() {
        //      return Math.round(this.currentPlaytime/this.correctSampleRate);
        return this.currentPlaytime / this.correctSampleRate;  // let user do the rounding in needed
    }

    // ******* song "position seek" related (if available with used backend)

    /**
    * Return: default 0 seeking not supported
    */
    getMaxPlaybackPosition() { return this.backendAdapter.getMaxPlaybackPosition(); }


    /**
    * Return: default 0
    */
    getPlaybackPosition() { return this.backendAdapter.getPlaybackPosition(); }


    /**
    * Move playback to 'pos': must be between 0 and getMaxSeekPosition()
    * Return: 0 if successful
    */
    seekPlaybackPosition(pos) { return this.backendAdapter.seekPlaybackPosition(pos); }


    // ******* (music) file input related

    isAppleShit() {
        return !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
    }


    iOSHack(ctx) {
        try {
            var source = ctx.createBufferSource();
            if (!source.start) {
                source.start = source.noteOn;
                source.stop = source.noteOff;
            }

            source.buffer = ctx.createBuffer(1, 1, 22050);  // empty buffer
            source.connect(ctx.destination);

            source.start(0);

        } catch (ignore) { }
    }

    loadMusicData(arrayBuffer, options) {

        if (arrayBuffer) {

            var data = new Uint8Array(arrayBuffer);

            this.scriptNode.port.postMessage({
                type: 'loadMusicData',
                sampleRate: this.sampleRate,
                data: data,
                options: options
            })

            return 0;
        }
    }




    // -------------------------------------------------------------------------------------------------------

    preload(files, id, onCompletionHandler) {
        if (id === 0) {
            // we are done preloading
            onCompletionHandler();
        } else {
            id--;
            var funcCompleted = function () { this.preload(files, id, onCompletionHandler); }.bind(this); // trigger next load
            this.preloadFile(files[id], funcCompleted, true);
        }
    }


    // Avoid the async trial&error loading (if available) for those files that
    // we already know we'll be needing
    preloadFiles(files, onCompletionHandler) {
        this.isPaused = true;

        if (this.backendAdapter.isAdapterReady()) {
            // sync scenario: runtime is ready
            this.preload(files, files.length, onCompletionHandler);
        } else {
            // async scenario:  runtime is NOT ready (e.g. emscripten WASM)
            this["deferredPreload"] = [files, onCompletionHandler];
        }
    }



    isWaitingForFile() {
        return this.getCache().isWaitingForFile();
    }

    getCache() {
        if (typeof window.fileCache === undefined)
            window.fileCache = new FileCache();

        return window.fileCache;
    }


    render() {
        if (this.playing) {
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

        this.canvasContext.fillStyle = "rgba(255,255,255,0.8)";


        const timeData = new Float32Array(this.analyzerNode.frequencyBinCount);
        let risingEdge = 0;

        this.analyzerNode.getFloatTimeDomainData(timeData);

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

