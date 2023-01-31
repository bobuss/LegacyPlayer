//
// Needs
// - lib/pt.js
//

class PTWorkletProcessor extends AudioWorkletProcessor {

    sampleRate = 44100;
    filename = '';
    player;
    isSongReady = false;
    mixval = 8.0;
    chvu = new Float32Array(32);
    publishChannelVU = true
    stereoSeparation = 100; // from 0 (mono) to 200 (original full separation)

    // container for song infos like: name, author, etc
    songInfo = {};

    constructor() {
        super();

        this.player = new Protracker();
        this.format = 'mod'
        this.mixingBufferSize = Math.floor(this.sampleRate / 50);
        this.mixingBufferL = new Array(this.mixingBufferSize);
        this.mixingBufferR = new Array(this.mixingBufferSize);

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
                this.endofsong = false;
                this.player.endofsong = false;
                this.player.paused = false;
                this.player.initialize();
                this.player.flags = 1 + 2;
                this.player.playing = true;
                this.playing = true;

                this.chvu = new Float32Array(this.player.channels);
                for (let i = 0; i < this.player.channels; i++) this.chvu[i] = 0.0;
                break;

            case 'pause':
                this.isPaused = true;
                break;

            case 'setStereoSeparation':
                this.setStereoSeparation(data.stereoSeparation)
                break;

        }
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        this.filename = filename
        this.player.clearsong();
        if (this.player.parse(data)) {
            // copy static data from player
            this.songInfo = {
                'title': this.player.title,
                'signature': this.player.signature,
                'songlen': this.player.songlen,
                'channels': this.player.channels,
                'patterns': this.player.patterns,
                'filter': this.player.filter,
                'mixval': this.player.mixval // usually 8.0, though
            }

            const samplenames = new Array(32)
            for (let i = 0; i < 32; i++)
                samplenames[i] = "";

            if (this.format == 'xm' || this.format == 'it') {
                for (let i = 0; i < this.player.instrument.length; i++) samplenames[i] = this.player.instrument[i].name;
            } else {
                for (let i = 0; i < this.player.sample.length; i++) samplenames[i] = this.player.sample[i].name;
            }
            this.songInfo['samplenames'] = samplenames

            this.port.postMessage({
                type: 'songInfoUpdated',
                songInfo: this.songInfo
            });

            this.isSongReady = true
            this.loading = false;

        }

        return true
    }

    setStereoSeparation(stereoSeparation) {
        stereoSeparation = Math.max(0, stereoSeparation)
        stereoSeparation = Math.min(200, stereoSeparation)
        this.stereoSeparation = stereoSeparation
    }

    process(inputs, outputs) {

        const outputL = outputs[0][0];
        const outputR = outputs[0][1];

        let framesToRender = outputL.length;
        var bufs = new Array(outputL, outputR);

        if ((!this.isSongReady) || this.isPaused) {

            for (let i = 0; i < framesToRender; i++) {
                outputL[i] = 0;
                outputR[i] = 0;
            }

        } else {
            //this.player.repeat = this.repeat;
            this.player.mix(this.player, bufs, framesToRender);


            // apply stereo separation and soft clipping
            var outp = new Float32Array(2);
            for (var s = 0; s < framesToRender; s++) {
                outp[0] = bufs[0][s];
                outp[1] = bufs[1][s];

                // apply stero separation
                const thissampleL = outp[0]
                const thissampleR = outp[1]
                outp[0] =  thissampleL + ( 1 - (this.stereoSeparation / 200)) * thissampleR
                outp[1] =  thissampleR + ( 1 - (this.stereoSeparation / 200)) * thissampleL

                // scale down and soft clip
                outp[0] /= this.mixval; outp[0] = 0.5 * (Math.abs(outp[0] + 0.975) - Math.abs(outp[0] - 0.975));
                outp[1] /= this.mixval; outp[1] = 0.5 * (Math.abs(outp[1] + 0.975) - Math.abs(outp[1] - 0.975));

                bufs[0][s] = outp[0];
                bufs[1][s] = outp[1];
            }

            this.row = this.player.row;
            this.position = this.player.position;
            this.speed = this.player.speed;
            this.bpm = this.player.bpm;
            this.endofsong = this.player.endofsong;

            //if (this.player.filter != this.filter) {
            //    this.setfilter(this.player.filter);
            //}

            if (this.endofsong && this.playing) {
                this.isPaused = true;  // stop playback (or this will retrigger again and again before new song is started)
                this.port.postMessage({
                    type: 'onTrackEnd'
                });
            }

            if (this.delayfirst > 0) this.delayfirst--;
            this.delayload = 0;

            // update this.chvu from player channel vu
            for (var i = 0; i < this.player.channels; i++) {
                this.chvu[i] = this.chvu[i] * 0.25 + this.player.chvu[i] * 0.75;
                this.player.chvu[i] = 0.0;
            }

            if (this.publishChannelVU) {
                this.port.postMessage({
                    type: 'chvu',
                    chvu: this.chvu
                });
            }

        }

        return true
    }

}


registerProcessor('pt-worklet-processor', PTWorkletProcessor);

