import { SAMPLES_PER_BUFFER } from './constants.js'

/*
* Abstract 'audio backend adapter'.
*
* Not for "end users"! Base infrastructure for the integration of new backends:
*
* Must be subclassed for the integration of a specific backend: It adapts the APIs provided by a
* specific backend to the ones required by the player (e.g. access to raw sample data.) It
* provides hooks that can be used to pass loaded files to the backend. The adapter also has
* built-in resampling logic so that exactly the sampleRate required by the player is provided).
*
* Most backends are pretty straight forward: A music file is input and the backend plays it. Things are
* more complicated if the backend code relies on additional files - maybe depending on the input -
* that must be loaded in order to play the music. The problem arises because in the traditional runtime
* environment files are handled synchronously: the code waits until the file is loaded and then uses it.
*
* "Unfortunately" there is no blocking file-load available to JavaScript on a web page. So unless some
* virtual filesystem is built-up beforehand (containing every file that the backend could possibly ever
* try to load) the backend code is stuck with an asynchronous file loading scheme, and the original
* backend code must be changed to a model that deals with browser's "file is not yet ready" response.
*
* The player offers a trial & error approach to deal with asynchronous file-loading. The backend code
* is expected (i.e. it must be adapted accordingly) to attempt a file-load call (which is handled by
* an async web request linked to some sort of result cache). If the requested data isn't cached yet,
* then the backend code is expected to fail but return a corresponding error status back to the
* player (i.e. the player then knows that the code failed because some file wasn't available yet - and
* as soon as the file-load is completed it retries the whole initialization sequence).
*  (see "fileRequestCallback()" for more info)
*/



export class AudioBackendAdapterBase {

    constructor(channels, bytesPerSample) {

        this._resampleBuffer = new Float32Array();
        this._channels = channels;
        this._bytesPerSample = bytesPerSample;
        this._sampleRate = 44100;
        this._inputSampleRate = 44100;
        this._observer;
        this._manualSetupComplete = true;  // override if necessary

    }


    // ************* core functions that must be defined by a subclass

    /**
    * Fills the audio buffer with the next batch of samples
    * Return 0: OK, -1: temp issue - waiting for file, 1: end, 2: error
    */
    computeAudioSamples() { this.error("computeAudioSamples"); }

    /**
    * Load the song's binary data into the backend as a first step towards playback.
    * The subclass can either use the 'data' directly or us the 'filename' to retrieve it indirectly
    * (e.g. when regular file I/O APIs are used).
    */
    loadMusicData(sampleRate, path, filename, data, options) { this.error("loadMusicData"); }

    /**
    * Second step towards playback: Select specific sub-song from the loaded song file.
    * Allows to select a specific sub-song and/or apply additional song setting..
    */
    evalTrackOptions(options) { this.error("evalTrackOptions"); }

    /**
    * Get info about currently selected music file and track. Respective info very much depends on
    * the specific backend - use getSongInfoMeta() to check for available attributes.
    */
    updateSongInfo(filename, result) { this.error("updateSongInfo"); }

    /**
    * Advertises the song attributes that can be provided by this backend.
    */
    getSongInfoMeta() { this.error("getSongInfoMeta"); }


    // ************* sample buffer and format related

    /**
    * Return: pointer to memory buffer that contains the sample data
    */
    getAudioBuffer() { this.error("getAudioBuffer"); }

    /**
    * Return: length of the audio buffer in 'ticks' (e.g. mono buffer with 1 8-bit
    *         sample= 1; stereo buffer with 1 32-bit * sample for each channel also= 1)
    */
    getAudioBufferLength() { this.error("getAudioBufferLength"); }

    /**
    * Reads one audio sample from the specified position.
    * Return sample value in range: -1..1
    */
    readFloatSample(buffer, idx) { this.error("readFloatSample"); }

    /**
    * @param pan 0..2 (1 creates mono)
    */
    applyPanning(buffer, len, pan) { this.error("applyPanning"); }

    /**
    * Return size one sample in bytes
    */
    getBytesPerSample() {
        return this._bytesPerSample;
    }

    /**
    * Number of channels, i.e. 1= mono, 2= stereo
    */
    getChannels() {
        return this._channels;
    }

    // ************* optional: setup related
    /*
    * Implement if subclass needs additional setup logic.
    */
    isAdapterReady() {
        return true;
    }

    /*
    * Creates the URL used to retrieve the song file.
    */
    mapInternalFilename(overridePath, defaultPath, uri) {
        return ((overridePath) ? overridePath : defaultPath) + uri;  // this._basePath ever needed?
    }
    /*
    * Allows to map the filenames used in the emulation to external URLs.
    */
    mapUrl(filename) {
        return filename;
    }

    /*
    * Allows to perform some file input based manual setup sequence (e.g. setting some BIOS).
    * return 0: step successful & init completed, -1: error, 1: step successful
    */
    uploadFile(filename, options) {
        return 0;
    }

    /*
    * Check if this AudioBackendAdapterBase still needs manually performed
    * setup steps (see uploadFile())
    */
    isManualSetupComplete() {
        return this._manualSetupComplete;
    }

    /**
    * Cleanup backend before playing next music file
    */
    teardown() { this.error("teardown"); }

    // ************* optional: song "position seek" functionality (only available in backend)

    /**
    * Return: default 0 = seeking not supported
    */
    getMaxPlaybackPosition() { return 0; }

    /**
    * Return: default 0
    */
    getPlaybackPosition() { return 0; }

    /**
    * Move playback to 'pos': must be between 0 and getMaxPlaybackPosition()
    * Return: 0 if successful
    */
    seekPlaybackPosition(pos) { return -1; }

    // ************* optional: async file-loading related (only if needed)

    /**
    * Transform input filename into path/filename expected by the backend
    * Return array with 2 elements: 0: basePath (backend specific - most don't need one),
    *        1: filename (incl. the remainder of the path)
    */
    getPathAndFilename(filename) { this.error("getPathAndFilename"); }

    /**
    * Let backend store a loaded file in such a way that it can later deal with it.
    * Return a filehandle meaningful to the used backend
    */
    registerFileData(pathFilenameArray, data) { this.error("registerFileData"); }

    // if filename/path used by backend does not match the one used by the browser
    mapBackendFilename(name) { return name; }

    // introduced for backward-compatibility..
    mapCacheFileName(name) { return name; }
    /*
    * Backend may "push" update of song attributes (like author, copyright, etc)
    */
    handleBackendSongAttributes(backendAttr, target) { this.error("handleBackendSongAttributes"); }


    // ************* built-in utility functions
    mapUri2Fs(uri) {    // use extended ASCII that most likely isn't used in filenames
        // replace chars that cannot be used in file/foldernames
        let out = uri.replace(/\/\//, "Ã½Ã½");
        out = out.replace(/\?/, "Ã¿");
        out = out.replace(/:/, "Ã¾");
        out = out.replace(/\*/, "Ã¼");
        out = out.replace(/"/, "Ã»");
        out = out.replace(/</, "Ã¹");
        out = out.replace(/>/, "Ã¸");
        out = out.replace(/\|/, "Ã·");
        return out;
    }
    mapFs2Uri(fs) {
        let out = fs.replace(/Ã½Ã½/, "//");
        out = out.replace(/Ã¿/, "?");
        out = out.replace(/Ã¾/, ":");
        out = out.replace(/Ã¼/, "*");
        out = out.replace(/Ã»/, "\"");
        out = out.replace(/Ã¹/, "<");
        out = out.replace(/Ã¸/, ">");
        out = out.replace(/Ã·/, "|");
        return out;
    }

    // used for interaction with player
    setObserver(o) {
        this._observer = o;
    }

    notifyAdapterReady() {
        if (typeof this._observer !== "undefined") this._observer.notify();
    }

    error(name) {
        alert("fatal error: abstract method '" + name + "' must be defined");
    }

    resetSampleRate(sampleRate, inputSampleRate) {
        if (sampleRate > 0) { this._sampleRate = sampleRate; }
        if (inputSampleRate > 0) { this._inputSampleRate = inputSampleRate; }

        const s = Math.round(SAMPLES_PER_BUFFER * this._sampleRate / this._inputSampleRate) * this.getChannels();

        if (s > this._resampleBuffer.length) {
            this._resampleBuffer = this.allocResampleBuffer(s);
        }
    }

    allocResampleBuffer(s) {
        return new Float32Array(s);
    }

    getCopiedAudio(input, len, funcReadFloat, resampleOutput) {
        // just copy the rescaled values so there is no need for special handling in playback loop
        for (let i = 0; i < len * this._channels; i++) {
            resampleOutput[i] = funcReadFloat(input, i);
        }
        return len;
    }

    getResampledAudio(input, len) {
        return this.getResampledFloats(input, len, this._sampleRate, this._inputSampleRate);
    }

    getResampledFloats(input, len, sampleRate, inputSampleRate) {
        let resampleLen;
        if (sampleRate == inputSampleRate) {
            resampleLen = this.getCopiedAudio(input, len, this.readFloatSample.bind(this), this._resampleBuffer);
        } else {
            resampleLen = Math.round(len * sampleRate / inputSampleRate);
            const bufSize = resampleLen * this._channels;  // for each of the x channels

            if (bufSize > this._resampleBuffer.length) { this._resampleBuffer = this.allocResampleBuffer(bufSize); }

            // only mono and interleaved stereo data is currently implemented..
            this.resampleToFloat(this._channels, 0, input, len, this.readFloatSample.bind(this), this._resampleBuffer, resampleLen);
            if (this._channels == 2) {
                this.resampleToFloat(this._channels, 1, input, len, this.readFloatSample.bind(this), this._resampleBuffer, resampleLen);
            }
        }
        return resampleLen;
    }

    // utility
    resampleToFloat(channels, channelId, inputPtr, len, funcReadFloat, resampleOutput, resampleLen) {
        // Bresenham (line drawing) algorithm based resampling
        const x0 = 0;
        const y0 = 0;
        const x1 = resampleLen - 0;
        const y1 = len - 0;

        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        const err = dx + dy;
        let e2;

        let i;
        for (; ;) {
            i = (x0 * channels) + channelId;
            resampleOutput[i] = funcReadFloat(inputPtr, (y0 * channels) + channelId);

            if (x0 >= x1 && y0 >= y1) { break; }
            e2 = 2 * err;
            if (e2 > dy) { err += dy; x0 += sx; }
            if (e2 < dx) { err += dx; y0 += sy; }
        }
    }

    getResampleBuffer() {
        return this._resampleBuffer;
    }

}



