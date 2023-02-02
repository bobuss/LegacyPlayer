//
// Needs
// - lib/libopenmpt.js
//

const SAMPLES_PER_BUFFER = 8192;

// libopenmpt constants
const OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT = 2
const OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH = 3


class OpenMPTWorkletProcessor extends AudioWorkletProcessor {

    filename = ''
    channels = 2;
    sampleRate = 44100;
    inputSampleRate = 44100;
    repeatCount = 0 // -1 forever, 0 once, n multiple
    interpolationFilter = 0
    stereoSeparation = 100; // from 0 (mono) to 200 (original full separation)

    modulePtr = 0;
    leftBufferPtr = 0;
    rightBufferPtr = 0
    resampleBuffer = new Float32Array();

    // container for song infos like: name, author, etc
    songInfo = {};

    // --------------- player status stuff ----------
    isPaused = true;          // 'end' of a song also triggers this state

    // setup asyc completion of initialization
    isSongReady = false;    // initialized (including file-loads that might have been necessary)


    constructor() {
        super();
        this.libopenmpt = libopenmpt()
        this.leftBufferPtr = this.libopenmpt._malloc(4 * SAMPLES_PER_BUFFER);
        this.rightBufferPtr = this.libopenmpt._malloc(4 * SAMPLES_PER_BUFFER);

        // onmessage binding
        this.port.onmessage = this.onmessage.bind(this);
    }

    onmessage(e) {
        const { data } = e;
        console.log('onmessage ' + data.type)
        switch (data.type) {

            case 'loadMusicData':
                this.isSongReady = this.loadMusicData(data.sampleRate, data.path, data.filename, data.data, data.options)
                if (this.isSongReady) {
                    this.songInfo = this.updateSongInfo(data.filename)
                    this.port.postMessage({
                        type: 'songInfoUpdated',
                        songInfo: this.songInfo
                    });
                }
                break;

            case 'evalTrackOptions':
                // not implemented
                break;

            case 'resetSampleRate':
                this.resetSampleRate(data.sampleRate, -1);
                break;

            case 'play':
                this.isPaused = false;
                break;

            case 'pause':
                this.isPaused = true;
                break;

            case 'registerFileData':
                //this.backendAdapter.registerFileData(data.name, data.payload)
                break;

            case 'setTrack':
                // not implemented
                break;

            case 'setStereoSeparation':
                this.setStereoSeparation(data.stereoSeparation)
                break;

            case 'seek':
                this.seek(data.position)
                break

        }
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        this.filename = filename

        const byteArray = new Int8Array(data);
        const ptrToFile = this.libopenmpt._malloc(byteArray.byteLength);

        this.libopenmpt.HEAPU8.set(byteArray, ptrToFile);
        this.modulePtr = this.libopenmpt._openmpt_module_create_from_memory(ptrToFile, byteArray.byteLength, 0, 0, 0);
        this.libopenmpt._free(ptrToFile);

        if (this.modulePtr !== null) {
            console.log('resetSampleRate')
            this.resetSampleRate(sampleRate, 44100);
            this._currentPath = path;
            this._currentFile = filename;
        } else {
            this._currentPath = this._undefined;
            this._currentFile = this._undefined;
        }

        return this.modulePtr !== null
    }

    resetSampleRate(sampleRate, inputSampleRate) {
        if (sampleRate > 0) { this.sampleRate = sampleRate; }
        if (inputSampleRate > 0) { this.inputSampleRate = inputSampleRate; }

        const s = Math.round(SAMPLES_PER_BUFFER * this.sampleRate / this.inputSampleRate) * this.channels;

        if (s > this.resampleBuffer.length) {
            this.resampleBuffer = new Float32Array(s);
        }
    }

    updateSongInfo() {
        const data = {};
        const keys = this.libopenmpt.UTF8ToString(this.libopenmpt._openmpt_module_get_metadata_keys(this.modulePtr)).split(';');
        let keyNameBuffer = 0;

        for (let i = 0; i < keys.length; i++) {
            keyNameBuffer = this.libopenmpt._malloc(keys[i].length + 1);
            this.libopenmpt.writeAsciiToMemory(keys[i], keyNameBuffer);
            data[keys[i]] = this.libopenmpt.UTF8ToString(this.libopenmpt._openmpt_module_get_metadata(this.modulePtr, keyNameBuffer));
            this.libopenmpt._free(keyNameBuffer);
        }

        const duration = this.libopenmpt._openmpt_module_get_duration_seconds(this.modulePtr)
        data['duration'] = duration

        const num_channels = this.libopenmpt._openmpt_module_get_num_channels(this.modulePtr)
        data['num_channels'] = num_channels

        const ctls = this.libopenmpt._openmpt_module_get_ctls(this.modulePtr)
        //console.log(ctls)
        return data;
    }

    setStereoSeparation(stereoSeparation) {
        stereoSeparation = Math.max(0, stereoSeparation)
        stereoSeparation = Math.min(200, stereoSeparation)
        this.stereoSeparation = stereoSeparation
    }

    seek(position) {
        return this.libopenmpt._openmpt_module_set_position_seconds(this.modulePtr, position);
    }

    process(inputs, outputs) {

        const outputL = outputs[0][0];
        const outputR = outputs[0][1];

        let framesToRender = outputL.length;

        if ((!this.isSongReady) || this.isPaused) {

            for (let i = 0; i < framesToRender; i++) {
                outputL[i] = 0;
                outputR[i] = 0;
            }

        } else {

            let framesRendered = 0;
            let ended = false;
            let error = false;


            // repeat behavior
            //
            // -1: repeat forever
            // 0: play once, repeat zero times (the default)
            // n>0: play once and repeat n times after that
            this.libopenmpt._openmpt_module_set_repeat_count(this.modulePtr, this.repeatCount);

            // Stereo separation from 0 (mono) to 100 (full separation)
            this.libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_STEREOSEPARATION_PERCENT, this.stereoSeparation);

            // interpolation filter
            //
            //   0: internal default
            //   1: no interpolation (zero order hold)
            //   2: linear interpolation
            //   4: cubic interpolation
            //   8: windowed sinc with 8 taps
            this.libopenmpt._openmpt_module_set_render_param(this.modulePtr, OPENMPT_MODULE_RENDER_INTERPOLATIONFILTER_LENGTH, this.interpolationFilter);

            while (framesToRender > 0) {
                let framesPerChunk = Math.min(framesToRender, SAMPLES_PER_BUFFER);
                let actualFramesPerChunk = this.libopenmpt._openmpt_module_read_float_stereo(this.modulePtr, this.sampleRate, framesPerChunk, this.leftBufferPtr, this.rightBufferPtr);

                if (actualFramesPerChunk == 0) {
                    ended = true;
                    // modulePtr will be 0 on openmpt: error: openmpt_module_read_float_stereo: ERROR: module * not valid or other openmpt error
                    error = !this.modulePtr;
                }

                let rawAudioLeft = this.libopenmpt.HEAPF32.subarray(this.leftBufferPtr / 4, this.leftBufferPtr / 4 + actualFramesPerChunk);
                let rawAudioRight = this.libopenmpt.HEAPF32.subarray(this.rightBufferPtr / 4, this.rightBufferPtr / 4 + actualFramesPerChunk);

                for (let i = 0; i < actualFramesPerChunk; ++i) {
                    outputL[framesRendered + i] = rawAudioLeft[i];
                    outputR[framesRendered + i] = rawAudioRight[i];
                }
                for (var i = actualFramesPerChunk; i < framesPerChunk; ++i) {
                    outputL[framesRendered + i] = 0;
                    outputR[framesRendered + i] = 0;
                }
                framesToRender -= framesPerChunk;
                framesRendered += framesPerChunk;
            }
            if (ended) {
                if (this.repeatCount == 0) {
                    this.seek(0)
                    this.isPaused = true;  // stop playback (or this will retrigger again and again before new song is started)
                };
                if (this.modulePtr != 0) {
                    this.libopenmpt._openmpt_module_destroy(this.modulePtr);
                }
                if (this.leftBufferPtr != 0) {
                    this.libopenmpt._free(this.leftBufferPtr);
                }
                if (this.rightBufferPtr != 0) {
                    this.libopenmpt._free(this.rightBufferPtr);
                }
                this.port.postMessage({
                    type: 'onTrackEnd'
                });
            }

        }

        return true
    }
}

registerProcessor('openmpt-worklet-processor', OpenMPTWorkletProcessor);
