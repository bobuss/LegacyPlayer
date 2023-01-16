// cache all loaded files in global cache.
export class FileCache {

    constructor() {
        this._binaryFileMap = {};  // cache for loaded "file" binaries
        this._pendingFileMap = {};

        this._isWaitingForFile = false;  // signals that some file loading is still in progress
    }

    getFileMap () {
        return this._binaryFileMap;
    }

    getPendingMap () {
        return this._pendingFileMap;
    }

    setWaitingForFile (val) {
        this._isWaitingForFile = val;
    }

    isWaitingForFile () {
        return this._isWaitingForFile;
    }

    getFile (filename) {
        var data;
        if (filename in this._binaryFileMap) {
            data = this._binaryFileMap[filename];
        }
        return data;
    }

    // FIXME the unlimited caching of files should probably be restricted:
    // currently all loaded song data stays in memory as long as the page is opened
    // maybe just add some manual "reset"?
    setFile (filename, data) {
        this._binaryFileMap[filename] = data;
        this._isWaitingForFile = false;
    }

}
