/*
 vgm_adapter.js: Adapts vgmPlay backend to generic WebAudio/ScriptProcessor player.

 version 1.0

 	Copyright (C) 2015 Juergen Wothke

    Adapted to ES6 / audioworklet (c) 2023 Bertrand Tornil

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

const backend_module = backend_vgm();

class VGMBackendAdapter extends EmsHEAP16BackendAdapter {

    constructor() {
        super(backend_module, 2);
        this.songInfo = {};
    }

    getAudioBuffer() {
        var ptr=  this.Module.ccall('emu_get_audio_buffer', 'number');
        // make it a this.Module.HEAP16 pointer
        return ptr >> 1;	// 2 x 16 bit samples
    }

    getAudioBufferLength() {
        var len= this.Module.ccall('emu_get_audio_buffer_length', 'number');
        return len;
    }

    computeAudioSamples() {
        return this.Module.ccall('emu_compute_audio_samples', 'number');
    }

    getMaxPlaybackPosition() {
        return this.Module.ccall('emu_get_max_position', 'number');
    }

    getPlaybackPosition() {
        return this.Module.ccall('emu_get_position', 'number');
    }

    seekPlaybackPosition(pos) {
        return this.Module.ccall('emu_seek_position', 'number', ['number'], [pos]);
    }

    mapUrl(filename) {
        // PlayMOD hack: only 2 resource files used here
        // note: vgmplay will look for these files without the path prefix, i.e.
        // registerFileData must be implemented accoredingly
        if ((filename == "VGMPlay.ini") || (filename == "yrw801.rom") ) filename = this.resourcePath+filename;
        return filename;
    }

    getPathAndFilename(filename) {
        var sp = filename.split('/');	// avoid folders in our virtual Emscripten fs
        var fn = sp[sp.length-1];
        var path= '/'; // make it flat... filename.substring(0, filename.lastIndexOf("/"));	if (path.lenght) path= path+"/";
        return [path, fn];
    }

    registerFileData(name, byteArray) {
        return this.registerEmscriptenFileData("/", name, byteArray);
    }

    loadMusicData(sampleRate, path, filename, data) {
        var ret = this.Module.ccall('emu_init', 'number',
                            ['number', 'string', 'string'],
                            [sampleRate, path, filename]);

        if (ret == 0) {
            var inputSampleRate = this.Module.ccall('emu_get_sample_rate', 'number');
            this.resetSampleRate(sampleRate, inputSampleRate);
        }
        return ret;
    }

    evalTrackOptions(options) {
        if (typeof options.timeout != 'undefined') {
            ScriptNodePlayer.getInstance().setPlaybackTimeout(options.timeout*1000);
        }
        var id= (options && options.track) ? options.track : 0;
        var boostVolume= (options && options.boostVolume) ? options.boostVolume : 0;

        return this.Module.ccall('emu_set_subsong', 'number', ['number', 'number'], [id, boostVolume]);
    }

    teardown() {
        this.Module.ccall('emu_teardown', 'number');	// just in case
    }

    getSongInfoMeta() {
        return {title: String,
                author: String,
                desc: String,
                notes: String,
                program: String,	// deprecated use "system"
                system: String,
                chips: String,
                tracks: Number,
                currentTrack: Number
                };
    }

    unicodeToString(ptr) {
        ptr = ptr >> 2;	//32-bit
        var str = '';
        for (var i= 0; i< 255*4; i++) {	// use a limit just in case
            var ch = this.Module.HEAP32[ptr++];
            if (!ch) {
                return str;
            }
            str += String.fromCharCode(ch);
        }
    }

    updateSongInfo(filename) {
        var numAttr= 6;
        var ret = this.Module.ccall('emu_get_track_info', 'number');

        var array = this.Module.HEAP32.subarray(ret>>2, (ret>>2)+numAttr);
        this.songInfo.title= this.unicodeToString(array[0]);
        if (!this.songInfo.title.length) this.songInfo.title= filename.replace(/^.*[\\\/]/, '').split('.').slice(0, -1).join('.');
        this.songInfo.author= this.unicodeToString(array[1]);
        this.songInfo.desc= this.unicodeToString(array[2]);
        this.songInfo.notes= this.unicodeToString(array[3]);
        this.songInfo.system= this.unicodeToString(array[4]);
        this.songInfo.program= this.songInfo.system;	// deprecated
        this.songInfo.chips= this.Module.UTF8ToString(array[5]);
        var t= this.Module.UTF8ToString(array[6]);
        this.songInfo.tracks= parseInt(t);
        this.songInfo.currentTrack= 0;
        return this.songInfo;
    }

}
