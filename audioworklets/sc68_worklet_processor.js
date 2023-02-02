//
// Needs
// - lib/sc68.js
// - lib/sc68_backend_adapter

const backendAdapter = new SC68BackendAdapter()

const window = {
    fileRequestCallback: function (name) {
        return backendAdapter.fileRequestCallback(name)
    }
}

class SC68WorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.backendAdapter = backendAdapter
        this.backendAdapter.worklet = this

        // this.traceSwitch = false;

        this.spectrumEnabled = false

        // // container for song infos like: name, author, etc
        this.songInfo = {};

        this.silenceStarttime = -1;
        this.silenceTimeout = 5; // by default 5 secs of silence will end a song

        // // audio buffer handling
        this.sourceBuffer;
        this.sourceBufferLen;
        this.numberOfSamplesRendered = 0;
        this.numberOfSamplesToRender = 0;
        this.sourceBufferIdx = 0;

        // volumes values for the 3 voices
        this.publishChannelVU = true;
        this.chvu = new Float32Array(32);

        // // additional timeout based "song end" handling
        this.currentPlaytime = 0;
        this.currentTimeout = -1;

        this.pan = null;  // default: inactive

        // // --------------- player status stuff ----------

        this.isPaused = true;          // 'end' of a song also triggers this state

        // // setup asyc completion of initialization
        this.isPlayerReady = false;    // this state means that the player is initialized and can be used now
        this.isSongReady = false;    // initialized (including file-loads that might have been necessary)
        this.initInProgress = false;


        this.port.onmessage = this.onmessage.bind(this);

    }

    onmessage(e) {
        const { data } = e;
        console.log('onmessage ' + data.type)
        switch (data.type) {

            case 'loadMusicData':
                this.songInfo = {}
                this.isSongReady = (this.backendAdapter.loadMusicData(data.sampleRate, data.path, data.filename, data.data, data.options) == 0)
                break;

            case 'evalTrackOptions':
                this.backendAdapter.evalTrackOptions(data.options);
                break;

            case 'resetSampleRate':
                this.backendAdapter.resetSampleRate(data.sampleRate, -1);
                break;

            case 'play':
                this.isPaused = false;
                break;

            case 'pause':
                this.isPaused = true;
                break;

            case 'registerFileData':
                this.backendAdapter.registerFileData(data.name, data.payload)
                break;

            case 'setTrack':
                this.backendAdapter.evalTrackOptions({track: data.track - 1})
                if (this.isSongReady) {
                    this.songInfo = this.backendAdapter.updateSongInfo(data.filename)
                    this.port.postMessage({
                        type: 'songInfoUpdated',
                        songInfo: this.songInfo
                    });
                }
                break;

        }
    }

    isStereo() {
        return this.backendAdapter.getChannels() == 2;
    }

    copySamplesMono(resampleBuffer, output1, outSize) {

        let s = 0,
            o = 0;

        if (this.numberOfSamplesRendered + this.numberOfSamplesToRender > outSize) {
            const availableSpace = outSize - this.numberOfSamplesRendered;

            for (let i = 0; i < availableSpace; i++) {
                const ii = i + this.numberOfSamplesRendered;

                o = resampleBuffer[this.sourceBufferIdx++];
                output1[ii] = o;

                s += Math.abs(o);
            }
            this.numberOfSamplesToRender -= availableSpace;
            this.numberOfSamplesRendered = outSize;
        } else {

            for (let i = 0; i < this.numberOfSamplesToRender; i++) {
                const ii = i + this.numberOfSamplesRendered;

                o = resampleBuffer[this.sourceBufferIdx++];
                output1[ii] = o;

                s += Math.abs(o);
            }
            this.numberOfSamplesRendered += this.numberOfSamplesToRender;
            this.numberOfSamplesToRender = 0;
        }
        this.detectSilence(s);
    }

    copySamplesStereo(resampleBuffer, output1, output2, outSize) {
        let s = 0;

        if (this.numberOfSamplesRendered + this.numberOfSamplesToRender > outSize) {
            const availableSpace = outSize - this.numberOfSamplesRendered;

            for (let i = 0; i < availableSpace; i++) {
                const ii = i + this.numberOfSamplesRendered;

                const l = resampleBuffer[this.sourceBufferIdx++];
                const r = resampleBuffer[this.sourceBufferIdx++];

                output1[ii] = l;
                output2[ii] = r;

                s += Math.abs(l) + Math.abs(r);
            }

            this.numberOfSamplesToRender -= availableSpace;
            this.numberOfSamplesRendered = outSize;
        } else {
            for (let i = 0; i < this.numberOfSamplesToRender; i++) {
                const ii = i + this.numberOfSamplesRendered;

                const l = resampleBuffer[this.sourceBufferIdx++];
                const r = resampleBuffer[this.sourceBufferIdx++];

                output1[ii] = l;
                output2[ii] = r;

                s += Math.abs(l) + Math.abs(r);
            }
            this.numberOfSamplesRendered += this.numberOfSamplesToRender;
            this.numberOfSamplesToRender = 0;
        }
        this.detectSilence(s);
    }

    detectSilence(s) {
        if (this.silenceStarttime == 0) {    // i.e. song has been playing
            if (s == 0) {    // silence detected
                this.silenceStarttime = this.currentPlaytime;
            }
        } else if (s > 0) {    // i.e. false alarm or very start of playback
            this.silenceStarttime = 0;
        }
    }

    fillEmpty(outSize, output1, output2) {
        const availableSpace = outSize - this.numberOfSamplesRendered;

        for (let i = 0; i < availableSpace; i++) {
            output1[i + this.numberOfSamplesRendered] = 0;
            if (typeof output2 !== 'undefined') { output2[i + this.numberOfSamplesRendered] = 0; }
        }
        this.numberOfSamplesToRender = 0;
        this.numberOfSamplesRendered = outSize;
    }

    process(inputs, outputs) {

        const genStereo = this.isStereo() && outputs[0].length > 1;

        const output1 = outputs[0][0];
        const output2 = outputs[0][1];

        if ((!this.isSongReady) || this.isPaused) {
            for (let i = 0; i < output1.length; i++) {
                output1[i] = 0;
                if (genStereo) { output2[i] = 0; }
            }
        } else {

            const outSize = output1.length;

            this.numberOfSamplesRendered = 0;

            while (this.numberOfSamplesRendered < outSize) {
                if (this.numberOfSamplesToRender === 0) {
                    let status;
                    if ((this.currentTimeout > 0) && (this.currentPlaytime > this.currentTimeout)) {
                        console.log("'song end' forced after " + this.currentTimeout / this.correctSampleRate + " secs");
                        status = 1;
                    } else {
                        status = this.backendAdapter.computeAudioSamples()
                    }

                    if (status !== 0) {
                        // no frame left
                        this.fillEmpty(outSize, output1, output2);

                        if (status < 0) {
                            console.log('stuck by file-load')
                            // file-load: emu just discovered that we need to load another file
                            // this.isPaused = true;
                            this.isSongReady = false;     // previous init is invalid
                            return true; // complete init sequence must be repeated
                        } else {
                            if (status > 1) {
                                this.trace("playback aborted with an error");
                            }

                            this.isPaused = true;  // stop playback (or this will retrigger again and again before new song is started)
                            this.port.postMessage({
                                type: 'onTrackEnd'
                            });
                            return;
                        }
                    }
                    // refresh just in case they are not using one fixed buffer..
                    this.sourceBuffer = this.backendAdapter.getAudioBuffer();
                    this.sourceBufferLen = this.backendAdapter.getAudioBufferLength();

                    if (this.pan != null)
                    this.backendAdapter.applyPanning(this.sourceBuffer, this.sourceBufferLen, this.pan + 1.0);

                    this.numberOfSamplesToRender = this.backendAdapter.getResampledAudio(this.sourceBuffer, this.sourceBufferLen);

                    this.sourceBufferIdx = 0;
                }

                const resampleBuffer = this.backendAdapter.getResampleBuffer();

                if (genStereo) {
                    this.copySamplesStereo(resampleBuffer, output1, output2, outSize);
                } else {
                    this.copySamplesMono(resampleBuffer, output1, outSize);
                }
            }
            // keep track how long we are playing: just filled one WebAudio buffer which will be played at
            this.currentPlaytime += outSize * this.correctSampleRate / this.sampleRate;

            // update this.chvu from player channel vu
            this.chvu[0] = this.backendAdapter.Module.ccall('emu_getVolVoice1', 'number') & 0xf;
            this.chvu[1] = this.backendAdapter.Module.ccall('emu_getVolVoice2', 'number') & 0xf;
            this.chvu[2] = this.backendAdapter.Module.ccall('emu_getVolVoice3', 'number') & 0xf;

            if (this.publishChannelVU) {
                this.port.postMessage({
                    type: 'chvu',
                    chvu: this.chvu.map(x => x/16)
                });
            }

            // silence detection at end of song
            if ((this.silenceStarttime > 0) && ((this.currentPlaytime - this.silenceStarttime) >= this.silenceTimeout * this.correctSampleRate) && (this.silenceTimeout > 0)) {
                this.isPaused = true;  // stop playback (or this will retrigger again and again before new song is started)
                this.port.postMessage({
                    type: 'onTrackEnd'
                });
            }
        }
        return true
    }
}


registerProcessor('sc68-worklet-processor', SC68WorkletProcessor);
