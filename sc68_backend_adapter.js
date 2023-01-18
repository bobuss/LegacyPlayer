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





    getPathAndFilename(filename) {
        return ['/', filename];
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
