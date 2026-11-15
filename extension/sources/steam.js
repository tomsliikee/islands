// Steam's downloads and updates from its content log, watched: the lines
// it appends say when an app's update runs and when it is done. Only what
// was appended since the last look is read. Steam's log gives no live
// progress, so the island shows that it runs, not how far.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {readSteamLine, steamName} from '../lib/signals.js';
import {Watch} from './watch.js';

const STEAM = GLib.build_filenamev([GLib.get_home_dir(), '.steam', 'steam']);

export class SteamSource {
    constructor(island, root = STEAM) {
        this._island = island;
        this._root = root;
        this._updating = new Set();
        this._names = new Map();
        this._path = `${root}/logs/content_log.txt`;
        this._offset = this._size();
        this._watch = new Watch(this._path, () => this._read(), {changed: true, rateMs: 1000});
    }

    _size() {
        try {
            return Gio.File.new_for_path(this._path).query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size();
        } catch {
            return 0;
        }
    }

    // What was appended since the last look; a log that was started anew
    // is read from its beginning.
    _appended() {
        const size = this._size();
        if (size < this._offset)
            this._offset = 0;
        if (size === this._offset)
            return '';
        try {
            const stream = Gio.File.new_for_path(this._path).read(null);
            stream.seek(this._offset, GLib.SeekType.SET, null);
            const bytes = stream.read_bytes(size - this._offset, null);
            stream.close(null);
            this._offset = size;
            return new TextDecoder().decode(bytes.toArray());
        } catch {
            return '';
        }
    }

    _name(appId) {
        if (!this._names.has(appId)) {
            let name = null;
            try {
                const [, bytes] = Gio.File.new_for_path(`${this._root}/steamapps/appmanifest_${appId}.acf`).load_contents(null);
                name = steamName(new TextDecoder().decode(bytes));
            } catch {
                name = null;
            }
            this._names.set(appId, name ?? `App ${appId}`);
        }
        return this._names.get(appId);
    }

    _read() {
        for (const line of this._appended().split('\n')) {
            const state = readSteamLine(line);
            if (!state)
                continue;
            const id = `steam:${state.appId}`;
            if (state.updating && !this._updating.has(state.appId)) {
                this._updating.add(state.appId);
                if (this._island.allows('progress')) {
                    this._island.set({id, kind: 'progress', source: 'progress', icon: 'folder-download-symbolic',
                        title: this._name(state.appId), short: 'Steam update', note: 'Steam is updating it'});
                }
            } else if (!state.updating && this._updating.has(state.appId)) {
                this._updating.delete(state.appId);
                this._island.remove(id);
                if (this._island.allows('progress')) {
                    this._island.set({id: `${id}:done`, kind: 'osd', hint: true, source: 'progress', duration: 3000,
                        icon: 'object-select-symbolic', title: `${this._name(state.appId)} is up to date`});
                }
            }
        }
    }

    destroy() {
        this._watch.destroy();
        for (const appId of this._updating)
            this._island.remove(`steam:${appId}`);
        this._updating.clear();
    }
}
