import { EmsHEAP16BackendAdapter } from './ems_heap16_backend_adapter.js'

/*
* Emscripten based backends that produce 32-bit float sample data.
*
* NOTE: This impl adds handling for asynchronously initialized 'backends', i.e.
*       the 'backend' that is passed in, may not yet be usable (see WebAssebly based impls:
*       here a respective "onRuntimeInitialized" event will eventually originate from the 'backend').
*       The 'backend' allows to register a "adapterCallback" hook to propagate the event - which is
*       used here. The player typically observes the backend-adapter and when the adapter state changes, a
*       "notifyAdapterReady" is triggered so that the player is notified of the change.
*/
export class EmsHEAPF32BackendAdapter extends EmsHEAP16BackendAdapter {

    constructor(backend, channels) {
        super(backend, channels);
        this._bytesPerSample = 4;
    }

    readFloatSample(buffer, idx) {
        return (this.Module.HEAPF32[buffer + idx]);
    }

    // certain songs use an unfavorable L/R separation - e.g. bass on one channel - that is
    // not nice to listen to. This "panning" impl allows to "mono"-ify those songs.. (this._pan=1
    // creates mono)
    applyPanning(buffer, len, pan) {
        pan = pan * 256.0 / 2.0;
        var i, l, r, m;
        for (i = 0; i < len * 2; i += 2) {
            l = this.Module.HEAPF32[buffer + i];
            r = this.Module.HEAPF32[buffer + i + 1];
            m = (r - l) * pan;

            var nl = ((l * 256) + m) / 256;
            var nr = ((r * 256) - m) / 256;
            this.Module.HEAPF32[buffer + i] = nl;
            this.Module.HEAPF32[buffer + i + 1] = nr;
        }
    }
}
