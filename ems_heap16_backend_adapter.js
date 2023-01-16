import { AudioBackendAdapterBase } from './audio_backend_adapter_base.js'

/*
* Emscripten based backends that produce 16-bit sample data.
*
* NOTE: This impl adds handling for asynchronously initialized 'backends', i.e.
*       the 'backend' that is passed in, may not yet be usable (see WebAssebly based impls:
    *       here a respective "onRuntimeInitialized" event will eventually originate from the 'backend').
*       The 'backend' allows to register a "adapterCallback" hook to propagate the event - which is
*       used here. The player typically observes the backend-adapter and when the adapter state changes, a
*       "notifyAdapterReady" is triggered so that the player is notified of the change.
*/
export class EmsHEAP16BackendAdapter extends AudioBackendAdapterBase {

    constructor(backend, channels) {
        super(channels, 2)
        this.Module = backend;

        // required if WASM (asynchronously loaded) is used in the backend impl
        this.Module["adapterCallback"] = function () {   // when Module is ready
            this.doOnAdapterReady();  // hook allows to perform additional initialization
            this.notifyAdapterReady();  // propagate to change to player
        }.bind(this);

        if (!window.Math.fround) { window.Math.fround = window.Math.round; } // < Chrome 38 hack
    }

    doOnAdapterReady() { }
    // noop, to be overridden in subclasses

    /* async emscripten init means that adapter may not immediately be ready - see async WASM compilation */
    isAdapterReady() {
        if (typeof this.Module.notReady === "undefined") return true; // default for backward compatibility
        return !this.Module.notReady;
    }

    registerEmscriptenFileData(pathFilenameArray, data) {
        // create a virtual emscripten FS for all the songs that are touched.. so the compiled code will
        // always find what it is looking for.. some players will look to additional resource files in the same folder..

        // Unfortunately the FS.findObject() API is not exported.. so it's exception catching time
        try {
            this.Module.FS_createPath("/", pathFilenameArray[0], true, true);
        } catch (e) {
        }
        var f;
        try {
            if (typeof this.Module.FS_createDataFile == 'undefined') {
                f = true;  // backend without FS (ignore for drag&drop files)
            } else {
                f = this.Module.FS_createDataFile(pathFilenameArray[0], pathFilenameArray[1], data, true, true);

                var p = ScriptNodePlayer.getInstance().trace("registerEmscriptenFileData: [" +
                    pathFilenameArray[0] + "][" + pathFilenameArray[1] + "] size: " + data.length);
            }
        } catch (err) {
            // file may already exist, e.g. drag/dropped again.. just keep entry

        }
        return f;
    }

    readFloatSample(buffer, idx) {
        return (this.Module.HEAP16[buffer + idx]) / 0x8000;
    }

    // certain songs use an unfavorable L/R separation - e.g. bass on one channel - that is
    // not nice to listen to. This "panning" impl allows to "mono"-ify those songs.. (this._pan=1
    // creates mono)
    applyPanning(buffer, len, pan) {
        pan = pan * 256.0 / 2.0;

        var i, l, r, m;
        for (i = 0; i < len * 2; i += 2) {
            l = this.Module.HEAP16[buffer + i];
            r = this.Module.HEAP16[buffer + i + 1];
            m = (r - l) * pan;

            var nl = ((l << 8) + m) >> 8;
            var nr = ((r << 8) - m) >> 8;
            this.Module.HEAP16[buffer + i] = nl;
            this.Module.HEAP16[buffer + i + 1] = nr;
        }
    }

}

