//
// Needs
// - lib/utils.js
// - lib/ft2.js
//

class FT2WorkletProcessor extends AudioWorkletProcessor {

    sampleRate = 44100;
    filename = '';
    player;
    isSongReady = false;
    mixval = 8.0;
    chvu = new Float32Array(32);
    stereoSeparation = 100; // from 0 (mono) to 200 (original full separation)

    // container for song infos like: name, author, etc
    songInfo = {};

    publishChannelVU = true
    publishSongPosition = true

    constructor() {
        super();

        this.player = new Fasttracker();
        this.format = 'xm'
        this.mixingBufferSize = Math.floor(this.sampleRate / 50);
        this.mixingBufferL = new Array(this.mixingBufferSize);
        this.mixingBufferR = new Array(this.mixingBufferSize);

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
                this.endofsong = false;
                this.player.initialize();
                this.player.flags = 1 + 2;
                this.player.playing = true;
                this.player.paused = false;
                this.isPaused = true;
                this.chvu = new Float32Array(this.player.channels);
                for (let i = 0; i < this.player.channels; i++) this.chvu[i] = 0.0;
                break;

            case 'play':
                this.isPaused = false;
                break;

            case 'pause':
                this.isPaused = true;
                break;

            case 'seek':
                this.seek(data.position);
                break;
        }
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        this.filename = filename
        this.player.clearsong();
        if (this.player.parse(data)) {
            this.isSongReady = true
            this.loading = false;
        }

        return true
    }

    seek(position) {
        if (this.player) {
            this.player.tick = 0;
            this.player.row = 0;
            this.player.position = position;
            this.player.flags = 1 + 2;
            if (this.player.position < 0) this.player.position = 0;
            if (this.player.position >= this.player.songlen) this.stop();
        }
        this.position = this.player.position;
        this.row = this.player.row;
    }

    updateSongInfo() {
        let data = {};
        // copy static data from player
        data = {
            'title': this.player.title,
            'signature': this.player.signature,
            'positionNr': this.player.songlen,
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
        data['samplenames'] = samplenames

        return data;
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
                outp[0] = thissampleL + (1 - (this.stereoSeparation / 200)) * thissampleR
                outp[1] = thissampleR + (1 - (this.stereoSeparation / 200)) * thissampleL

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

            if (this.endofsong) {
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

            if (this.publishSongPosition) {
                this.port.postMessage({
                    'type': 'songPositionUpdated',
                    'position': this.player.position
                })
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


registerProcessor('ft2-worklet-processor', FT2WorkletProcessor);

