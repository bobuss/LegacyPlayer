//
// Needs
// - lib/psgplay.js
//


const maxFramesPerChunk = 4096;

class PSGPlayWorkletProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.libpsgplay = libpsgplay()

        this.sampleRate = 44100;
        this.filename = ''
        this.psgplayPtr
        this.bufferPtr
        this.duration = 0
        this.decrunchedBytes = 0
        this.track

        // container for song infos like: name, author, etc
        this.songInfo = {};

        // --------------- player status stuff ----------
        this.isPaused = true;          // 'end' of a song also triggers this state

        // setup asyc completion of initialization
        this.isSongReady = false;    // initialized (including file-loads that might have been necessary)

        // onmessage binding
        this.port.onmessage = this.onmessage.bind(this);
    }

    onmessage(e) {
        const { data } = e;
        debug('onmessage ' + data.type)
        switch (data.type) {
            case 'loadMusicData':
                this.isSongReady = this.loadMusicData(data.sampleRate, data.path, data.filename, data.data, data.options)
            break;

            case 'play':
                this.isPaused = false;
                break;

            case 'pause':
                this.isPaused = true;
                break;
        }
    }

    cleanup() {
        if (this.psgplayPtr) {
            this.libpsgplay._psgplay_free(this.psgplayPtr);
        }
        if (this.bufferPtr) {
            this.libpsgplay._free(this.cleanupbufferPtr);
        }
        if (this.decrunchedBytes) {
            this.libpsgplay._free(this.decrunchedBytes);
        }
    };

    loadMusicData(sampleRate, path, filename, data, options) {
        this.filename = filename

        const byteArray = new Int8Array(data);
        this.bufferPtr = this.libpsgplay._malloc(maxFramesPerChunk*4);

        const longPtr = this.libpsgplay._malloc(4);

        if (this.libpsgplay._ice_identify(byteArray, byteArray.byteLength)){
            // arguments
            const s = this.libpsgplay._ice_decrunched_size(byteArray, byteArray.byteLength);
            this.decrunchedBytes = this.libpsgplay._malloc(s);

            if (this.libpsgplay._ice_decrunch(this.decrunchedBytes, byteArray, byteArray.byteLength) == -1) {
                debug("ICE decrunch failed\n");
                return false;
            }

            if(!this.track) {
                if (this.libpsgplay._sndh_tag_default_subtune(longPtr, this.decrunchedBytes, s)) {
                    this.track = libpsgplay.HEAP32[longPtr/4];
                } else {
                    this.track=1;
                }
            }

            if (this.libpsgplay._sndh_tag_subtune_time(longPtr, this.track, this.decrunchedBytes, s)) {
                this.duration = this.libpsgplay.HEAPF32.subarray(longPtr/4 , longPtr/4 + 1)[0];
            }
            this.psgplayPtr = this.libpsgplay._psgplay_init(this.decrunchedBytes, s, this.track, this.sampleRate);

        } else {

            if(!this.track) {
                if(this.libpsgplay._sndh_tag_default_subtune(longPtr,byteArray, byteArray.byteLength)) {
                    this.track = this.libpsgplay.HEAP32[longPtr/4];
                } else {
                    this.track=1;
                }
            }

            if (this.libpsgplay._sndh_tag_subtune_time(longPtr,this.track,byteArray, byteArray.byteLength)) {
                this.duration = this.libpsgplay.HEAPF32.subarray(longPtr/4 , longPtr/4 + 1)[0];
            }

            this.psgplayPtr = this.libpsgplay._psgplay_init(byteArray, byteArray.byteLength, this.track, this.sampleRate);

      }

      if (longPtr) {
          this.libpsgplay._free(longPtr);
      }
      this.isSongReady = true
      return true
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
            let ended = false

            debug(this.psgplayPtr)
            debug( this.bufferPtr)
            while (framesToRender > 0) {
                let framesPerChunk = Math.min(framesToRender, maxFramesPerChunk);
                debug(framesPerChunk)
                //let actualFramesPerChunk = this.libpsgplay.ccall('psgplay_read_stereo','number',['number','number','number'],[this.psgplayPtr, this.bufferPtr, framesPerChunk]);
                let actualFramesPerChunk = this.libpsgplay._psgplay_read_stereo(this.psgplayPtr, this.bufferPtr, framesPerChunk)
                debug(1)
                let rawAudio = this.libpsgplay.HEAP16.subarray(this.bufferPtr/2 , this.bufferPtr/2 + actualFramesPerChunk*2);

                for (let i = 0; i < actualFramesPerChunk; ++i) {
                    outputL[framesRendered + i] = (rawAudio[i*2])/0x8000;
                    outputR[framesRendered + i] = (rawAudio[i*2+1])/0x8000;
                }
                framesToRender -= actualFramesPerChunk;
                framesRendered += actualFramesPerChunk;
                if (actualFramesPerChunk < framesPerChunk) {
                    break;
                }
            }
            if (ended) {
                //this.disconnect();
                this.cleanup();
                //error ? processNode.player.fireEvent('onError', { type: 'openmpt' }) : processNode.player.fireEvent('onEnded');
                this.isPaused = true;  // stop playback (or this will retrigger again and again before new song is started)
                this.port.postMessage({
                    type: 'onTrackEnd'
                });
            }
        }

        return true
    }
}


registerProcessor('psgplay-worklet-processor', PSGPlayWorkletProcessor);
