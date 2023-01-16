/*
 sc68_adapter.js: Adapts SC68 backend to generic WebAudio/ScriptProcessor player.

 version 1.1

     Copyright (C) 2015 Juergen Wothke
     Copyright (C) 2022 Bertrand Tornil

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
import { EmsHEAP16BackendAdapter } from './ems_heap16_backend_adapter.js'
import backend_SC68 from './sc68.js'

const backend_module =  await backend_SC68();
console.log(backend_module)

var sc68BackendInitOnce = false;	// must be global (otherwise reinit of backend may fail)

export class SC68BackendAdapter extends EmsHEAP16BackendAdapter {

    constructor() {
        super(backend_module, 2);
        this._currentTrack;
        this._replayCache = new Array();
    }

    getAudioBuffer() {
        var ptr = this.Module.ccall('emu_get_audio_buffer', 'number');
        // make it a this.Module.HEAP16 pointer
        return ptr >> 1;	// 2 x 16 bit samples
    }

    getAudioBufferLength() {
        var len = this.Module.ccall('emu_get_audio_buffer_length', 'number');
        return len;
    }

    computeAudioSamples() {
        var status = this.Module.ccall('emu_compute_audio_samples', 'number');

        var isError = this.Module.ccall('emu_is_error', 'number', ['number'], [status]);
        if (isError) {
            return -1;
        } else {
            var isWaiting = this.Module.ccall('emu_is_waiting', 'number', ['number'], [status]);

            if (isWaiting) {
                // eventually the "replay" will be loaded and normal
                // processing will resume
                ScriptNodePlayer.getInstance().setWait(true);
                return -1;
            } else {
                if (this.Module.ccall('emu_is_track_change', 'number', ['number'], [status])) {
                    //ScriptNodePlayer.getInstance().trace('emu_is_track_change')
                    return 0;
                }
                else if (this.Module.ccall('emu_is_loop', 'number', ['number'], [status])) {
                    //ScriptNodePlayer.getInstance().trace('emu_is_loop')
                    return 1;
                }
                else if (this.Module.ccall('emu_is_end', 'number', ['number'], [status])) {
                    //ScriptNodePlayer.getInstance().trace('emu_is_end')
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

    seekPlaybackPosition(pos) {
        return this.Module.ccall('emu_seek_position', 'number', ['number'], [pos]);
    }

    getPathAndFilename(filename) {
        return ['/', filename];
    }

    loadMusicData(sampleRate, path, filename, data, options) {
        // load the song's binary data
        var buf = this.Module._malloc(data.length);
        this.Module.HEAPU8.set(data, buf);

        var timeout = -1;	// means: keep built-in timeout
        if ((typeof options != 'undefined') && typeof options.timeout != 'undefined') {
            timeout = options.timeout * 1000;
        }
        var ret = this.Module.ccall('emu_init', 'number',
            ['number', 'number', 'number', 'number', 'number'],
            [sc68BackendInitOnce, sampleRate, timeout, buf, data.length]);

        sc68BackendInitOnce = true;
        this.Module._free(buf);

        if (ret == 0) {
            var inputSampleRate = this.Module.ccall('emu_get_sample_rate', 'number');
            this.resetSampleRate(sampleRate, inputSampleRate);
        }

        return ret;
    }

    evalTrackOptions(options) {
        if (typeof options.timeout != 'undefined') {
            // FIXME quite redundant - since sc68 also has a timeout.. (see above)
            ScriptNodePlayer.getInstance().setPlaybackTimeout(options.timeout * 1000);
        }
        var track = options.track ? options.track : 0;	// frontend counts from 0
        this._currentTrack = track + 1;					// sc68 starts counting at 1

        // for sc68 "0" means "all"..
        var ret = this.Module.ccall('emu_change_subsong', 'number', ['number'], [this._currentTrack]);

        // it seems that the above doesn't work and that manual seeking has to be used instead..
        if (this._currentTrack > 1) {
            var o = new Object();
            var seek = 0;
            var i;
            for (i = 1; i < this._currentTrack; i++) {
                seek += this.getSongLength(i);
            }

            // hack; seeking doesnt seem to work before emu_compute_audio_samples is called
            this.Module.ccall('emu_compute_audio_samples', 'number');
            this.seekPlaybackPosition(seek);
        }

        return ret;
    }

    teardown() {
    }

    getSongInfoMeta() {
        return {
            title: String,
            author: String,
            composer: String,
            replay: String,
            hwname: String,
            songInMillis: Number,
            numberOfTracks: Number
        };
    }

    getSongLength(track) {
        var numAttr = 7;
        ret = this.Module.ccall('emu_get_track_info', 'number', ['number'], [track]);
        var array = this.Module.HEAP32.subarray(ret >> 2, (ret >> 2) + numAttr);
        return parseInt(this.Module.UTF8ToString(array[5]));
    }

    updateSongInfo(filename, result) {
        var numAttr = 7;
        const ret = this.Module.ccall('emu_get_track_info', 'number', ['number'], [this._currentTrack]);

        var array = this.Module.HEAP32.subarray(ret >> 2, (ret >> 2) + numAttr);
        result.title = this.Module.UTF8ToString(array[0]);
        result.author = this.Module.UTF8ToString(array[1]);
        result.composer = this.Module.UTF8ToString(array[2]);
        result.replay = this.Module.UTF8ToString(array[3]);
        result.hwname = this.Module.UTF8ToString(array[4]);
        result.songInMillis = parseInt(this.Module.UTF8ToString(array[5]));
        result.numberOfTracks = parseInt(this.Module.UTF8ToString(array[6]));
    }


    // --------------------------- async file loading stuff -------------------------

    mapBackendFilename(name) {
        var input = this.Module.UTF8ToString(name);

        if (input && (input in this._replayCache)) {
            this.setCachedReplay(input);
        }

        return "replay/" + input + ".bin";	// only sc68 replays are loaded here
    }

    cacheReplay(name, data) {
        //ScriptNodePlayer.getInstance().trace("cache replay: [" + name + "] length: " + data.length);
        this._replayCache[name] = data;
    }

    registerFileData(pathFilenameArray, byteArray) {
        //ScriptNodePlayer.getInstance().trace("loaded: [" + pathFilenameArray[1] + "] length: " + byteArray.length);

        var name = pathFilenameArray[1];
        var replay = "replay/";

        if (name.substring(0, replay.length) == replay) {
            // only 'replay' filed need to be handled here
            name = name.substring(replay.length);
            name = name.substring(0, name.length - 4);	// also crop ".bin" (that we added above)

            this.cacheReplay(name, byteArray);
        }
        return 1;	// anything but undefined
    }

    setCachedReplay(name) {
        if (name) {
            var replay = this._replayCache[name];

            if (replay) {
                //ScriptNodePlayer.getInstance().trace(
                //    "set cached replay: [" + name + "] length: " + replay.length);

                var bytes = new Uint8Array(name.length + 1);	// we dont have any unicode here
                var i;
                for (i = 0; i < name.length; i++) {
                    var c = name.charCodeAt(i);
                    bytes[i] = c & 0xff;
                }
                bytes[i] = 0;
                var keybuf = this.Module._malloc(bytes.length);
                this.Module.HEAPU8.set(bytes, keybuf);
                var buf = this.Module._malloc(replay.length);
                this.Module.HEAPU8.set(replay, buf);
                var ret = this.Module.ccall('emu_set_binary_data', 'number', ['number', 'number', 'number', 'number'], [keybuf, bytes.length, buf, replay.length]);
                this.Module._free(keybuf);
                this.Module._free(buf);
            }
        }
    }

}
