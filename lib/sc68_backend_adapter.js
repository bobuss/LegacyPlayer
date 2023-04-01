/*
 sc68_worklet_adapter.js: Adapts SC68 backend to workletAudioProcessor API

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

const SAMPLES_PER_BUFFER = 1024; //1024

const backend_module = backend_SC68();

let sc68BackendInitOnce = false;    // must be global (otherwise reinit of backend may fail)

class SC68BackendAdapter extends EmsHEAP16BackendAdapter {

    constructor() {
        super(backend_module, 2);
        this.currentTrack;
        this.replayCache = {}
        this.songInfo = {}
        this.worklet = null
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        // load the song's binary data
        const buf = this.Module._malloc(data.length);
        this.Module.HEAPU8.set(data, buf);

        let timeout = -1;    // means: keep built-in timeout
        if ((typeof options != 'undefined') && typeof options.timeout != 'undefined') {
            timeout = options.timeout * 1000;
        }
        const ret = this.Module.ccall('emu_init', 'number',
            ['number', 'number', 'number', 'number', 'number'],
            [sc68BackendInitOnce, sampleRate, timeout, buf, data.length]);

        sc68BackendInitOnce = true;
        this.Module._free(buf);

        if (ret == 0) {
            const inputSampleRate = this.Module.ccall('emu_get_sample_rate', 'number');
            this.resetSampleRate(sampleRate, inputSampleRate);
        }
        console.log('loadMusicData ret=' + ret)
        return ret;
    }

    evalTrackOptions(options) {
        const track = options.track ? options.track : 0;    // frontend counts from 0
        this.currentTrack = track + 1;                    // sc68 starts counting at 1

        // for sc68 "0" means "all"..
        const ret = this.Module.ccall('emu_change_subsong', 'number', ['number'], [this.currentTrack]);

        // it seems that the above doesn't work and that manual seeking has to be used instead..
        if (this.currentTrack > 1) {
            let o = new Object();
            let seek = 0;

            for (let i = 1; i < this.currentTrack; i++) {
                seek += this.getSongLength(i);
            }

            // hack; seeking doesnt seem to work before emu_compute_audio_samples is called
            this.Module.ccall('emu_compute_audio_samples', 'number');
            this.seekPlaybackPosition(seek);
        }

        return ret;
    }

    getSongLength(track) {
        const numAttr = 7;
        const ret = this.Module.ccall('emu_get_track_info', 'number', ['number'], [track]);
        const array = this.Module.HEAP32.subarray(ret >> 2, (ret >> 2) + numAttr);
        return parseInt(this.Module.UTF8ToString(array[5]));
    }

    seekPlaybackPosition(pos) {
        return this.Module.ccall('emu_seek_position', 'number', ['number'], [pos]);
    }

    getAudioBuffer() {
        const ptr = this.Module.ccall('emu_get_audio_buffer', 'number');
        // make it a this.Module.HEAP16 pointer
        return ptr >> 1;    // 2 x 16 bit samples
    }

    getAudioBufferLength() {
        return this.Module.ccall('emu_get_audio_buffer_length', 'number');
    }

    computeAudioSamples() {

        const status = this.Module.ccall('emu_compute_audio_samples', 'number');

        const isError = this.Module.ccall('emu_is_error', 'number', ['number'], [status]);

        if (isError) {
            return -1;
        } else {
            const isWaiting = this.Module.ccall('emu_is_waiting', 'number', ['number'], [status]);

            if (isWaiting) {
                // eventually the "replay" will be loaded and normal
                // processing will resume
                //ScriptNodePlayer.getInstance().setWait(true);
                return -1;
            } else {
                if (this.Module.ccall('emu_is_track_change', 'number', ['number'], [status])) {
                    console.log('emu_is_track_change')
                    return 0;
                }
                else if (this.Module.ccall('emu_is_loop', 'number', ['number'], [status])) {
                    console.log('emu_is_loop')
                    return 1;
                }
                else if (this.Module.ccall('emu_is_end', 'number', ['number'], [status])) {
                    console.log('emu_is_end')
                    return 1;
                }
                return 0;
            }
        }
    }

    getMaxPlaybackPosition() {
        return this.Module.ccall('emu_get_max_position', 'number');
    }

    getPlaybackPosition() {
        return this.Module.ccall('emu_get_current_position', 'number');
    }

    updateSongInfo(filename) {
        const numAttr = 7;
        const ret = this.Module.ccall('emu_get_track_info', 'number', ['number'], [this.currentTrack]);
        const array = this.Module.HEAP32.subarray(ret >> 2, (ret >> 2) + numAttr);

        this.songInfo.title = this.Module.UTF8ToString(array[0]);
        if (!this.songInfo.title.length) this.songInfo.title = filename.replace(/^.*[\\\/]/, '');
        this.songInfo.author = this.Module.UTF8ToString(array[1]);
        this.songInfo.composer = this.Module.UTF8ToString(array[2]);
        this.songInfo.replay = this.Module.UTF8ToString(array[3]);
        this.songInfo.hwname = this.Module.UTF8ToString(array[4]);
        this.songInfo.songInMillis = parseInt(this.Module.UTF8ToString(array[5]));
        this.songInfo.numberOfTracks = parseInt(this.Module.UTF8ToString(array[6]));

        return this.songInfo
    }

    isStereo() {
        return this.getChannels() == 2;
    }

    mapBackendFilename(name) {
        return this.Module.UTF8ToString(name);
    }

    fileRequestCallback(name) {
        const fullFilename = this.mapBackendFilename(name);

        const ret = this.loadReplay(fullFilename)

        if (ret != 0) {
            this.worklet.port.postMessage({
                type: 'fileRequestCallback',
                fullFilename: fullFilename
            });
        }
        return ret
    }

    loadReplay(name) {
        if (name in this.replayCache) {
            const byteArray = this.replayCache[name];
            console.log('loading Replay ' + name)
            const bytes = new Uint8Array(name.length + 1);    // we dont have any unicode here

            let i
            for (i = 0; i < name.length; i++) {
                bytes[i] = name.charCodeAt(i) & 0xff;
            }

            bytes[i] = 0;
            const keybuf = this.Module._malloc(bytes.length);
            this.Module.HEAPU8.set(bytes, keybuf);
            const buf = this.Module._malloc(byteArray.length);
            this.Module.HEAPU8.set(byteArray, buf);
            const ret = this.Module.ccall('emu_set_binary_data', 'number', ['number', 'number', 'number', 'number'], [keybuf, bytes.length, buf, byteArray.length]);
            console.log('emu_set_binary_data status=' + ret)
            this.Module._free(keybuf);
            this.Module._free(buf);

            return 0
        } else {
            return -1
        }
    }

    registerFileData(name, byteArray) {
        this.replayCache[name] = byteArray

        this.worklet.port.postMessage({
            type: 'retryPrepareTrackForPlayback'
        });
    }
}


const backendAdapter = new SC68BackendAdapter()

const window = {
    fileRequestCallback: function (name) {
        return backendAdapter.fileRequestCallback(name)
    }
}
