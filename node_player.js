import { SAMPLES_PER_BUFFER } from './constants.js'
import { FileCache } from './file_cache.js'


var setGlobalWebAudioCtx = function () {
    if (typeof window._gPlayerAudioCtx == 'undefined') {	// cannot be instantiated 2x (so make it global)
        var errText = 'Web Audio API is not supported in this browser';
        try {
            if ('AudioContext' in window) {
                window._gPlayerAudioCtx = new AudioContext();
            } else if ('webkitAudioContext' in window) {
                window._gPlayerAudioCtx = new webkitAudioContext();		// legacy stuff
            } else {
                alert(errText + e);
            }
        } catch (e) {
            alert(errText + e);
        }
    }
    try {
        if (window._gPlayerAudioCtx.state === 'suspended' && 'ontouchstart' in window) {	//iOS shit
            window._gPlayerAudioCtx.resume();
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

    // constructor(backendAdapter, onPlayerReady, onTrackReadyToPlay, onTrackEnd, onUpdate) {
    constructor() {
        // if (typeof backendAdapter === 'undefined') {
        //     alert("fatal error: backendAdapter not specified");
        // }
        // if (typeof onPlayerReady === 'undefined') {
        //     alert("fatal error: onPlayerReady not specified");
        // }
        // if (typeof onTrackReadyToPlay === 'undefined') {
        //     alert("fatal error: onTrackReadyToPlay not specified");
        // }
        // if (typeof onTrackEnd === 'undefined') {
        //     alert("fatal error: onTrackEnd not specified");
        // }

        // switch (backendType) {
        //     case 'sc68':
        //         this._backendAdapter = new SC68BackendAdapter();
        //         this._backendAdapter.setObserver(this);
        //         break;
        //     default:
        //         alert('you must provide a backend type.')
        // }

        this._traceSwitch = false;

        this._spectrumEnabled = false //spectrumEnabled;

        // container for song infos like: name, author, etc
        this._songInfo = {};

        // to remove
        this._basePath = ''

        // hooks that allow to react to specific events
        this._onTrackReadyToPlay = function () { } //onTrackReadyToPlay;
        this._onTrackEnd = function () { } //onTrackEnd;
        this._onPlayerReady = function () { } //onPlayerReady;
        this._onUpdate = function () { } //onUpdate;  // optional


        this._tickerStepWidth = 256;    // shortest available (i.e. tick every 256 samples)
        this._maxTicks = SAMPLES_PER_BUFFER / this._tickerStepWidth;
        this._maskTicks = this._maxTicks - 1;;
        this._cntTick = 0;
        this._baseTick = null;

        this._tickToggle = 0;  // track double buffering

        this._silenceStarttime = -1;
        this._silenceTimeout = 5; // by default 5 secs of silence will end a song

        // audio buffer handling
        this._sourceBuffer;
        this._sourceBufferLen;
        this._numberOfSamplesRendered = 0;
        this._numberOfSamplesToRender = 0;
        this._sourceBufferIdx = 0;

        // // additional timeout based "song end" handling
        this._currentPlaytime = 0;
        this._currentTimeout = -1;

        // general WebAudio stuff
        this._bufferSource;
        this._gainNode;
        this._analyzerNode;
        this._scriptNode;
        this._freqByteData = 0;

        this._pan = null;  // default: inactive

        // --------------- player status stuff ----------

        this._isPaused = false;          // 'end' of a song also triggers this state

        // setup asyc completion of initialization
        this._isPlayerReady = false;    // this state means that the player is initialized and can be used now
        this._isSongReady = false;    // initialized (including file-loads that might have been necessary)
        this._initInProgress = false;

        this._preLoadReady = false;

    }

    async load(url) {

        await this.initByUserGesture()


        await fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(response.status);
                }
                return response.arrayBuffer();
            })
            .then(buffer => {
                return this.prepareTrackForPlayback(url, buffer)
            })
            .catch(error => {
                // Handle/report error
            });


    }

    prepareTrackForPlayback(url, data) {
        this._isPaused = true;
        this._isSongReady = false;

        return this.initIfNeeded(data, {});
    }


    // ******* general
    notify() {  // used to handle asynchronously initialized backend impls
        if ((typeof this.deferredPreload !== "undefined") && this._backendAdapter.isAdapterReady()) {
            // now that the runtime is ready the "preload" can be started
            var files = this.deferredPreload[0];
            var onCompletionHandler = this.deferredPreload[1];
            delete this.deferredPreload;

            this.preload(files, files.length, onCompletionHandler);
        }

        if (!this._isPlayerReady && this._preLoadReady && this._backendAdapter.isAdapterReady() && this._backendAdapter.isManualSetupComplete()) {
            this._isPlayerReady = true;
            this._onPlayerReady();
        }
    }

    handleBackendEvent() { this.notify(); }
    // deprecated, use notify()!

    /**
    * Is the player ready for use? (i.e. initialization completed)
    */
    isReady() {
        return this._isPlayerReady;
    }


    /**
    * Change the default 5sec timeout  (0 means no timeout).
    */
    setSilenceTimeout(silenceTimeout) {
        // usecase: user may temporarily turn off output (see DeepSID) and player should not end song
        this._silenceTimeout = silenceTimeout;
    }


    /**
    * Turn on debug output to JavaScript console.
    */
    setTraceMode(on) {
        this._traceSwitch = on;
    }


    // ******* basic playback features

    /*
    * start audio playback
    */
    play() {
        this._isPaused = false;

        // this function isn't invoked directly from some "user gesture" (but
        // indirectly from "onload" handler) so it might not work on braindead iOS shit
        try { this._bufferSource.start(0); } catch (ignore) { }
    }

    /*
    * pause audio playback
    */
    pause() {
        if ((!this.isWaitingForFile()) && (!this._initInProgress) && this._isSongReady) {
            this._isPaused = true;
        }
    }

    isPaused() {
        return this._isPaused;
    }


    /*
    * resume audio playback
    */
    resume() {
        if ((!this.isWaitingForFile()) && (!this._initInProgress) && this._isSongReady) {
            this.play();
        }
    }

    /*
    * Gets the number/index of the currently playing audio buffer.
    */
    getBufNum() {
        return Math.floor(this._cntTick / this._maxTicks);
    }



    /*
    * Gets the index of the 'tick' that is currently playing.
    * allows to sync separately stored data with the audio playback.
    * note: requires use of a Ticker!
    */
    getCurrentTick() {
        return this._cntTick % this._maskTicks;
    }


    /*
    * Keeps track of WebAudio's double buffering
    */
    getTickToggle() {
        return this._tickToggle;
    }


    getScriptProcessorBufSize() {
        return SAMPLES_PER_BUFFER;
    }


    /*
    * set the playback volume (input between 0 and 1)
    */
    setVolume(value) {
        if (typeof this._gainNode != 'undefined') {
            this._gainNode.gain.value = value;
        }
    }


    getVolume() {
        if (typeof this._gainNode != 'undefined') {
            return this._gainNode.gain.value;
        }
        return -1;
    }

    /*
    * change onTrackEnd callback, for looping
    */
    setOnTrackEnd(onTrackEnd) {
        this._onTrackEnd = onTrackEnd;
    }

    /**
    * @value null=inactive; or range; -1 to 1 (-1 is original stereo, 0 creates "mono", 1 is inverted stereo)
    */
    setPanning(value) {
        this._pan = value;
    }


    /*
    * is playback in stereo?
    */
    isStereo() {
        return this._backendAdapter.getChannels() == 2;
    }


    /**
    * Get backend specific song infos like 'author', 'name', etc.
    */
    getSongInfo() {
        return this._songInfo;
    }


    /**
    * Get meta info about backend specific song infos, e.g. what attributes are available and what type are they.
    */
    getSongInfoMeta() {
        return this._backendAdapter.getSongInfoMeta();
    }


    /*
    * Manually defined playback time to use until 'end' of a track (only affects the
    * currently selected track).
    * @param t time in millis
    */
    setPlaybackTimeout(t) {
        this._currentPlaytime = 0;
        if (t < 0) {
            this._currentTimeout = -1;
        } else {
            this._currentTimeout = t / 1000 * this._correctSampleRate;
        }
    }

    /*
    * Timeout in seconds.
    */
    getPlaybackTimeout() {
        if (this._currentTimeout < 0) {
            return -1;
        } else {
            return Math.round(this._currentTimeout / this._correctSampleRate);
        }
    }


    getCurrentPlaytime() {
        //      return Math.round(this._currentPlaytime/this._correctSampleRate);
        return this._currentPlaytime / this._correctSampleRate;  // let user do the rounding in needed
    }


    // ******* access to frequency spectrum data (if enabled upon construction)

    getFreqByteData() {
        if (this._analyzerNode) {
            if (this._freqByteData === 0) {
                this._freqByteData = new Uint8Array(this._analyzerNode.frequencyBinCount);
            }
            this._analyzerNode.getByteFrequencyData(this._freqByteData);
        }
        return this._freqByteData;
    }


    // ******* song "position seek" related (if available with used backend)

    /**
    * Return: default 0 seeking not supported
    */
    getMaxPlaybackPosition() { return this._backendAdapter.getMaxPlaybackPosition(); }


    /**
    * Return: default 0
    */
    getPlaybackPosition() { return this._backendAdapter.getPlaybackPosition(); }


    /**
    * Move playback to 'pos': must be between 0 and getMaxSeekPosition()
    * Return: 0 if successful
    */
    seekPlaybackPosition(pos) { return this._backendAdapter.seekPlaybackPosition(pos); }


    // ******* (music) file input related


    /**
    * hack used for Worker - see asyncSetFileData below.
    */
    getCached(filename, options) {
        var fullFilename = ((options.basePath) ? options.basePath : this._basePath) + filename;  // this._basePath ever needed?
        var cacheFilename = this._backendAdapter.mapCacheFileName(fullFilename);


        var data = this.getCache().getFile(cacheFilename);
        return (typeof data == 'undefined') ? null : data;
    }


    isAppleShit() {
        return !!navigator.platform && /iPad|iPhone|iPod/.test(navigator.platform);
    }


    async initByUserGesture() {
        // try to setup as much as possible while it is "directly triggered"
        // by "user gesture" (i.e. here).. seems POS iOS does not correctly
        // recognize any async-indirections started from here.. bloody Apple idiots
        if (typeof this._sampleRate == 'undefined') {
            setGlobalWebAudioCtx();

            this._sampleRate = window._gPlayerAudioCtx.sampleRate;
            this._correctSampleRate = this._sampleRate;
            // TODO see how to put that in the worklet
            //this._backendAdapter.resetSampleRate(this._sampleRate, -1);
        } else {
            // just in case: handle Chrome's new bullshit "autoplay policy"
            if (window._gPlayerAudioCtx.state == "suspended") {
                try { window._gPlayerAudioCtx.resume(); } catch (e) { }
            }
        }

        if (typeof this._bufferSource != 'undefined') {
            try {
                this._bufferSource.stop(0);
            } catch (err) { }  // ignore for the benefit of Safari(OS X)
        } else {
            var ctx = window._gPlayerAudioCtx;

            if (this.isAppleShit()) this.iOSHack(ctx);

            this._analyzerNode = ctx.createAnalyser();
            // this._scriptNode = this.createScriptProcessor(ctx);
            const timestamp = Date.now()
            await ctx.audioWorklet.addModule("processor.js?" + timestamp);
            this._scriptNode = new AudioWorkletNode(
                ctx,
                'sc68-worklet'
            );

            this._scriptNode.port.postMessage({
                type: 'resetSampleRate',
                sampleRate: this._sampleRate
            })

            this._gainNode = ctx.createGain();

            this._scriptNode.connect(this._gainNode);

            // note: "panning" experiments using StereoPanner, ChannelSplitter / ChannelMerger
            // led to bloody useless results: rather implement respective "panning"
            // logic directly to get the exact effect that is needed here..

            if (this._spectrumEnabled) {
                this._gainNode.connect(this._analyzerNode);
                this._analyzerNode.connect(ctx.destination);
            } else {
                this._gainNode.connect(ctx.destination);

            }
            this._bufferSource = ctx.createBufferSource();
            if (!this._bufferSource.start) {
                this._bufferSource.start = this._bufferSource.noteOn;
                this._bufferSource.stop = this._bufferSource.noteOff;
            }
        }
    }

    // ******** internal utils (MUST NOT be ued outside of the player or respective backendAdapters --------------

    /**
    * Load music data and prepare to play a specific track.
    */


    trace(str) {
        if (this._traceSwitch) { console.log(str); }
    }

    getDefaultSampleRate() {
        return this._correctSampleRate;
    }

    initIfNeeded(data, options) {
        var status = this.loadMusicData(data, options);

        if (status < 0) {
            console.log('Failed in loadMusicData')
            this._isSongReady = false;
            this._initInProgress = false;

        } else if (status === 0) {
            //  this._isPaused= false;
            this._isSongReady = true;
            this._currentPlaytime = 0;
            this._initInProgress = false;

            this.trace("successfully completed init");

            // in scenarios where a synchronous file-load is involved this first call will typically fail
            // but trigger the file load
            //var ret = this._backendAdapter.evalTrackOptions(options);
            this._scriptNode.port.postMessage({
                type: 'evalTrackOptions',
                options: options
            })

            this.updateSongInfo();

            if ((this.lastUsedFilename == fullFilename)) {
                if (this._fileReadyNotify == fullFilename) {
                    // duplicate we already notified about.. probably some retry due to missing load-on-demand files
                    this.play();  // user had already expressed his wish to play
                } else {
                    this._silenceStarttime = -1;  // reset silence detection

                    this._onTrackReadyToPlay();
                }
                this._fileReadyNotify = fullFilename;
            }
            this._isPaused = false;
            return true;

        } else {
            this._initInProgress = false;
            // error that cannot be resolved.. (e.g. file not exists)
            this.trace("initIfNeeded - fatal error");
        }
        return false;
    }


    iOSHack(ctx) {
        try {
            var source = window._gPlayerAudioCtx.createBufferSource();
            if (!source.start) {
                source.start = source.noteOn;
                source.stop = source.noteOff;
            }

            source.buffer = window._gPlayerAudioCtx.createBuffer(1, 1, 22050);  // empty buffer
            source.connect(window._gPlayerAudioCtx.destination);

            source.start(0);

        } catch (ignore) { }
    }

    updateSongInfo() {
        this._songInfo = {};
        //this._backendAdapter.updateSongInfo(fullFilename, this._songInfo);
        this._scriptNode.port.postMessage({
            type: 'updateSongInfo',
            songInfo: this._songInfo
        })
    }

    loadMusicData(arrayBuffer, options) {

        if (arrayBuffer) {
            //var pfn = this._backendAdapter.getPathAndFilename(fullFilename);

            var data = new Uint8Array(arrayBuffer);

            //this._backendAdapter.registerFileData(pfn, data);  // in case the backend "needs" to retrieve the file by name

            //var ret = this._backendAdapter.loadMusicData(this._sampleRate, pfn[0], pfn[1], data, options);

            this.resetBuffer();
            this._scriptNode.port.postMessage({
                type: 'loadMusicData',
                sampleRate: this._sampleRate,
                data: data,
                options: options
            })

            return 0;
        }
    }

    resetBuffer() {
        this._numberOfSamplesRendered = 0;
        this._numberOfSamplesToRender = 0;
        this._sourceBufferIdx = 0;

        this._cntTick = 0;
        this._baseTick = null;
        this._tickToggle = 0;

    }

    resetSampleRate(sampleRate) {
        // override the default (correct) sample rate to make playback faster/slower
        this._backendAdapter.resetSampleRate(sampleRate, -1);

        if (sampleRate > 0) { this._sampleRate = sampleRate; }

        this.resetBuffer();
    }


    createScriptProcessor(audioCtx) {
        // use the number of channels that the backend wants
        var scriptNode = audioCtx.createScriptProcessor(SAMPLES_PER_BUFFER, 0, this._backendAdapter.getChannels());
        scriptNode.onaudioprocess = NodePlayer.prototype.genSamples.bind(this);
        //scriptNode.onaudioprocess = NodePlayer.genSamples.bind(this);	// doesn't work with dumbshit Chrome GC

        return scriptNode
    }


    fillEmpty(outSize, output1, output2) {
        var availableSpace = outSize - this._numberOfSamplesRendered;

        for (i = 0; i < availableSpace; i++) {
            output1[i + this._numberOfSamplesRendered] = 0;
            if (typeof output2 !== 'undefined') { output2[i + this._numberOfSamplesRendered] = 0; }
        }
        this._numberOfSamplesToRender = 0;
        this._numberOfSamplesRendered = outSize;
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

    preloadFile(fullFilename, onLoadedHandler, notifyOnCached) {
        // note is used for "preload" and for "backend callback" loading... return values
        // are only used for the later

        var cacheFilename = this._backendAdapter.mapCacheFileName(fullFilename);
        var data = this.getCache().getFile(cacheFilename);
        if (typeof data != 'undefined') {
            var retVal = 0;
            // the respective file has already been setup
            if (data == 0) {
                retVal = 1;
                this.trace("error: preloadFile could not get cached: " + fullFilename);
            } else {
                this.trace("preloadFile found cached file using name: " + cacheFilename);

                // but in cases were alias names as used for the same file (see modland shit)
                // the file may NOT yet have been registered in the FS
                // setup data in our virtual FS (the next access should then be OK)
                var pfn = this._backendAdapter.getPathAndFilename(fullFilename);
                var f = this._backendAdapter.registerFileData(pfn, data);
            }
            if (notifyOnCached)
                onLoadedHandler();  // trigger next in chain    needed for preload / but hurts "backend callback"
            return retVal;
        } else {
            this.trace("preloadFile FAILED to find cached file using name: " + cacheFilename);
        }

        // backend will be stuck without this file and we better make
        // sure to not use it before it has been properly reinitialized
        this._isPaused = true;
        this._isSongReady = false;

        // requested data not available.. we better load it for next time
        if (!(cacheFilename in this.getCache().getPendingMap())) {    // avoid duplicate loading
            this.getCache().getPendingMap()[cacheFilename] = 1;

            var oReq = new XMLHttpRequest();
            oReq.open("GET", this._backendAdapter.mapUrl(fullFilename), true);
            oReq.responseType = "arraybuffer";

            oReq.onload = function (oEvent) {
                var arrayBuffer = oReq.response;
                if (arrayBuffer) {
                    this.trace("preloadFile successfully loaded: " + fullFilename);

                    // setup data in our virtual FS (the next access should then be OK)
                    var pfn = this._backendAdapter.getPathAndFilename(fullFilename);
                    var data = new Uint8Array(arrayBuffer);
                    var f = this._backendAdapter.registerFileData(pfn, data);

                    this.trace("preloadFile cached file using name: " + cacheFilename);

                    this.getCache().setFile(cacheFilename, data);
                }
                if (!delete this.getCache().getPendingMap()[cacheFilename]) {
                    this.trace("remove file from pending failed: " + cacheFilename);
                }
                onLoadedHandler();
            }.bind(this);
            oReq.onreadystatuschange = function (oEvent) {
                if (oReq.readyState == 4 && oReq.status == 404) {
                    this.trace("preloadFile failed to load: " + fullFilename);

                    this.getCache().setFile(cacheFilename, 0);
                }
            }.bind(this);
            oReq.onerror = function (oEvent) {

                this.getCache().setFile(cacheFilename, 0);
            }.bind(this);

            oReq.send(null);
        }
        return -1;
    }

    tick(event) {

        // ticks occur at 256-samples intervals during actual playback - eventhough
        // the exact timing with which WebAudio triggers respective calls is undefined,
        // respective "ticks" should be more or less in sync with the main audio buffer
        // playback - and offer a much more fine grained timing measurement
        if (!this._isPaused && (this._baseTick != null)) {

            // test result: when used with a 16k buffer, then 64 ticks SHOULD occur for each buffer, but..
            // 1) 6 ticks are triggered before the first buffer is even requested.. (should be ignored)
            // 2) 15% of the time less than 64 ticks occur for a buffer.. (going as low as 61!).. respective
            //    ticks just stay lost, i.e. tick() based time tracking quickly gets out of sync with
            //    the actual audio playback.

            this._cntTick++;  // only approximative: must be re-synced with each audio buffer
        }
    }

    detectSilence(s) {
        if (this._silenceStarttime == 0) {  // i.e. song has been playing
            if (s == 0) {  // silence detected
                this._silenceStarttime = this._currentPlaytime;
            }
        } else if (s > 0) {  // i.e. false alarm or very start of playback
            this._silenceStarttime = 0;
        }
    }

    copySamplesStereo(resampleBuffer, output1, output2, outSize) {
        var i;
        var s = 0, l = 0, r = 0;
        var abs = Math.abs;
        if (this._numberOfSamplesRendered + this._numberOfSamplesToRender > outSize) {
            var availableSpace = outSize - this._numberOfSamplesRendered;

            for (i = 0; i < availableSpace; i++) {
                var ii = i + this._numberOfSamplesRendered;

                l = resampleBuffer[this._sourceBufferIdx++];
                r = resampleBuffer[this._sourceBufferIdx++];

                output1[ii] = l;
                output2[ii] = r;

                s += abs(l) + abs(r);
            }

            this._numberOfSamplesToRender -= availableSpace;
            this._numberOfSamplesRendered = outSize;
        } else {
            for (i = 0; i < this._numberOfSamplesToRender; i++) {
                var ii = i + this._numberOfSamplesRendered;

                l = resampleBuffer[this._sourceBufferIdx++];
                r = resampleBuffer[this._sourceBufferIdx++];

                output1[ii] = l;
                output2[ii] = r;

                s += abs(l) + abs(r);
            }
            this._numberOfSamplesRendered += this._numberOfSamplesToRender;
            this._numberOfSamplesToRender = 0;
        }
        this.detectSilence(s);
    }

    copySamplesMono(resampleBuffer, output1, outSize) {
        var i;
        var s = 0, o = 0;
        var abs = Math.abs;
        if (this._numberOfSamplesRendered + this._numberOfSamplesToRender > outSize) {
            var availableSpace = outSize - this._numberOfSamplesRendered;

            for (i = 0; i < availableSpace; i++) {
                var ii = i + this._numberOfSamplesRendered;

                o = resampleBuffer[this._sourceBufferIdx++];
                output1[ii] = o;

                s += abs(o);
            }
            this._numberOfSamplesToRender -= availableSpace;
            this._numberOfSamplesRendered = outSize;
        } else {

            for (i = 0; i < this._numberOfSamplesToRender; i++) {
                var ii = i + this._numberOfSamplesRendered;

                o = resampleBuffer[this._sourceBufferIdx++];
                output1[ii] = o;

                s += abs(o);
            }
            this._numberOfSamplesRendered += this._numberOfSamplesToRender;
            this._numberOfSamplesToRender = 0;
        }
        this.detectSilence(s);
    }


    // Avoid the async trial&error loading (if available) for those files that
    // we already know we'll be needing
    preloadFiles(files, onCompletionHandler) {
        this._isPaused = true;

        if (this._backendAdapter.isAdapterReady()) {
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
        if (typeof window._fileCache == 'undefined')
            window._fileCache = new FileCache();

        return window._fileCache;
    }

}

