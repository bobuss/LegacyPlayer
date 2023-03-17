/*
AudioBackendAdapterBase, EmsHEAP16BackendAdapter

 version 1.0

     Copyright (C) 2015 Juergen Wothke

version 2.0

    Copyright (C) 2015 Juergen Wothke

version 2.1: ES6 syntax + AudioWorlket

    Copyright (C) 2023 Bertrand Tornil

 LICENSE

 This library is free software; you can redistribute it and/or modify it
 under the terms of the GNU General Public License as published by
 the Free Software Foundation; either version 2.1 of the License, or (at
 your option) any later version. This library is distributed in the hope
 that it will be useful, but WITHOUT ANY WARRANTY; without even the implied
 warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public
 License along with this library; if not, write to the Free Software
 Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301 USA
*/


class AudioBackendAdapterBase {

    constructor(channels, bytesPerSample) {

        this.resampleBuffer = new Float32Array();
        this.channels = channels;
        this.bytesPerSample = bytesPerSample;
        this.sampleRate = 44100;
        this.inputSampleRate = 44100;
        this.observer;
        this.manualSetupComplete = true;  // override if necessary

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
        return this.bytesPerSample;
    }

    /**
    * Number of channels, i.e. 1= mono, 2= stereo
    */
    getChannels() {
        return this.channels;
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
        return this.manualSetupComplete;
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


    error(name) {
        console.log("fatal error: abstract method '" + name + "' must be defined");
    }

    resetSampleRate(sampleRate, inputSampleRate) {
        if (sampleRate > 0) { this.sampleRate = sampleRate; }
        if (inputSampleRate > 0) { this.inputSampleRate = inputSampleRate; }

        const s = Math.round(SAMPLES_PER_BUFFER * this.sampleRate / this.inputSampleRate) * this.getChannels();

        if (s > this.resampleBuffer.length) {
            this.resampleBuffer = this.allocResampleBuffer(s);
        }
    }

    allocResampleBuffer(s) {
        return new Float32Array(s);
    }

    getCopiedAudio(input, len, funcReadFloat, resampleOutput) {
        // just copy the rescaled values so there is no need for special handling in playback loop
        for (let i = 0; i < len * this.channels; i++) {
            resampleOutput[i] = funcReadFloat(input, i);
        }
        //console.log(resampleOutput)
        return len;
    }

    getResampledAudio(input, len) {
        return this.getResampledFloats(input, len, this.sampleRate, this.inputSampleRate);
    }

    getResampledFloats(input, len, sampleRate, inputSampleRate) {

        let resampleLen;
        if (sampleRate == inputSampleRate) {
            resampleLen = this.getCopiedAudio(input, len, this.readFloatSample.bind(this), this.resampleBuffer);
        } else {
            resampleLen = Math.round(len * sampleRate / inputSampleRate);
            const bufSize = resampleLen * this.channels;  // for each of the x channels

            if (bufSize > this.resampleBuffer.length) { this.resampleBuffer = this.allocResampleBuffer(bufSize); }

            // only mono and interleaved stereo data is currently implemented..
            this.resampleToFloat(this.channels, 0, input, len, this.readFloatSample.bind(this), this.resampleBuffer, resampleLen);
            if (this.channels == 2) {
                this.resampleToFloat(this.channels, 1, input, len, this.readFloatSample.bind(this), this.resampleBuffer, resampleLen);
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
        return this.resampleBuffer;
    }

}


/*
* Emscripten based backends that produce 16-bit sample data.
*
*/
class EmsHEAP16BackendAdapter extends AudioBackendAdapterBase {

    constructor(backend, channels) {
        super(channels, 2)
        this.Module = backend;
    }

    readFloatSample(buffer, idx) {
        return (this.Module.HEAP16[buffer + idx]) / 0x8000;
    }

    // certain songs use an unfavorable L/R separation - e.g. bass on one channel - that is
    // not nice to listen to. This "panning" impl allows to "mono"-ify those songs.. (this.pan=1
    // creates mono)
    applyPanning(buffer, len, pan) {
        pan = pan * 256.0 / 2.0;

        for (let i = 0; i < len * 2; i += 2) {
            const l = this.Module.HEAP16[buffer + i];
            const r = this.Module.HEAP16[buffer + i + 1];
            let m = (r - l) * pan;

            const nl = ((l << 8) + m) >> 8;
            const nr = ((r << 8) - m) >> 8;
            this.Module.HEAP16[buffer + i] = nl;
            this.Module.HEAP16[buffer + i + 1] = nr;
        }
    }

}
