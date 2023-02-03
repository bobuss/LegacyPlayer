//
// Needs
// - lib/ahx.js
//

const SAMPLES_PER_BUFFER = 128;

class AHXWorkletProcessor extends AudioWorkletProcessor {

    pos = [0, 0, 0, 0]

    channels = 4;
    sampleRate = 44100;
    inputSampleRate = 44100;

    bufferSize = SAMPLES_PER_BUFFER;
    bufferFull = 0;
    bufferOffset = 0;

    repeatCount = 0 // -1 forever, 0 once, n multiple
    interpolationFilter = 0
    stereoSeparation = 100; // from 0 (mono) to 200 (original full separation)

    Player;
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

    publishChannelVU = true
    publishSongPosition = true


    constructor() {
        super();
        this.mixingBufferSize = Math.floor(this.sampleRate / 50);
        this.mixingBufferL = new Array(this.mixingBufferSize);
        this.mixingBufferR = new Array(this.mixingBufferSize);

        this.chvu = new Float32Array(this.channels);

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

            case 'play':
                this.isPaused = false;
                break;

            case 'pause':
                this.isPaused = true;
                break;

            case 'setTrack':
                // track number start at 0
                this.Player.InitSubsong(data.track - 1)
                break;

            case 'setStereoSeparation':
                this.setStereoSeparation(data.stereoSeparation)
                break;

            case 'seek':
                this.Player.Seek(Math.floor(data.position))
                break

        }
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        this.filename = filename
        const song = new AHXSong(data)
        this.Player = new AHXPlayer(song)
        return true
    }


    updateSongInfo() {
        const data = {
            'title': this.Player.Song.Name,
            'numberOfTracks': this.Player.Song.SubsongNr + 1,
            'restart': this.Player.Song.Restart,
            'positionNr': this.Player.Song.PositionNr,
            'trackLength': this.Player.Song.TrackLength,
            'trackNr': this.Player.Song.TrackNr,
            'instrumentNr': this.Player.Song.InstrumentNr,
            'subsongNr': this.Player.Song.SubsongNr,
            'revision': this.Player.Song.Revision,
            'speedMultiplier': this.Player.Song.SpeedMultiplier,
            'instruments': this.Player.Song.Instruments.map(x => x.Name)
        };
        return data;
    }


    setStereoSeparation(stereoSeparation) {
        stereoSeparation = Math.max(0, stereoSeparation)
        stereoSeparation = Math.min(200, stereoSeparation)
        this.stereoSeparation = stereoSeparation
    }


    mixChannel(v, mixingBuffer, mb, nrSamples) {
        if (this.Player.Voices[v].VoiceVolume == 0) return;
        var freq = 3579545.25 / this.Player.Voices[v].VoicePeriod; // #define Period2Freq(period) (3579545.25f / (period))
        var delta = Math.floor(freq * (1 << 16) / this.sampleRate);
        var samples_to_mix = nrSamples;
        var mixpos = 0;
        while (samples_to_mix) {
            if (this.pos[v] >= (0x280 << 16)) this.pos[v] -= 0x280 << 16;
            var thiscount = Math.min(samples_to_mix, Math.floor(((0x280 << 16) - this.pos[v] - 1) / delta) + 1);

            samples_to_mix -= thiscount;
            for (let i = 0; i < thiscount; i++) {
                mixingBuffer[mb + mixpos++] += this.Player.Voices[v].VoiceBuffer[this.pos[v] >> 16] * this.Player.Voices[v].VoiceVolume >> 6;
                this.pos[v] += delta;
            }
        } // while
    }


    mixChunk(nrSamples, mb) {
        // channels 0 & 3 goes to the left chan
        this.mixChannel(0, this.mixingBufferL, mb, nrSamples)
        this.mixChannel(3, this.mixingBufferL, mb, nrSamples)
        // 1 & 2 to the right, just like on a real Amiga
        this.mixChannel(1, this.mixingBufferR, mb, nrSamples)
        this.mixChannel(2, this.mixingBufferR, mb, nrSamples)

        mb += nrSamples;
        return mb;
    }

    mixBuffer() { // Output: 1 amiga(50hz)-frame of audio data
        for (let i = 0; i < this.mixingBufferSize; i++) {
            this.mixingBufferL[i] = 0;
            this.mixingBufferR[i] = 0;
        }

        let mb = 0;
        const nrSamples = Math.floor(this.mixingBufferSize / this.Player.Song.SpeedMultiplier);
        for (let f = 0; f < this.Player.Song.SpeedMultiplier; f++) {
            this.Player.PlayIRQ();

            if (this.Player.SongEndReached && this.playing) {
                this.port.postMessage({
                    type: 'onTrackEnd'
                });
            }

            mb = this.mixChunk(nrSamples, mb);
        } // frames

        if (this.publishSongPosition) {
            this.port.postMessage({
                'type': 'songPositionUpdated',
                'position': this.Player.PosNr
            })
        }
    }

    process(inputs, outputs) {

        let want = this.bufferSize;

        const outputL = outputs[0][0];
        const outputR = outputs[0][1];

        let out = 0;


        let framesToRender = outputL.length;

        if ((!this.isSongReady) || this.isPaused) {

            for (let i = 0; i < framesToRender; i++) {
                outputL[i] = 0;
                outputR[i] = 0;
            }

        } else {
            while(want > 0) {
                if (this.bufferFull == 0) {
                    this.mixBuffer();
                    this.bufferFull = this.mixingBufferSize;
                    this.bufferOffset = 0;
                }

                var can = Math.min(this.bufferFull - this.bufferOffset, want);

                want -= can;

                while (can-- > 0) {
                    var thissampleL = this.mixingBufferL[this.bufferOffset] / (128 * 4);
                    var thissampleR = this.mixingBufferR[this.bufferOffset] / (128 * 4);

                    // apply stero separation
                    var finalSamplerL =  thissampleL + ( 1 - (this.stereoSeparation / 200)) * thissampleR
                    var finalSamplerR =  thissampleR + ( 1 - (this.stereoSeparation / 200)) * thissampleL

                    // copy to output buffers
                    outputL[out] = finalSamplerL;
                    outputR[out] = finalSamplerR;

                    this.bufferOffset++
                    out++;
                }
                if (this.bufferOffset >= this.bufferFull) {
                    this.bufferOffset = this.bufferFull = 0;
                }

                // update this.chvu from player channel vu
                for (let i=0 ; i<this.channels ; i++) {
                    this.chvu[i] = this.Player.Voices[i].VoiceVolume / (64)
                }

                if (this.publishChannelVU) {
                    this.port.postMessage({
                        type: 'chvu',
                        chvu: this.chvu
                    });
                }

            }
        }

        return true
    }
}

registerProcessor('ahx-worklet-processor', AHXWorkletProcessor);

