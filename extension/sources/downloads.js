// Files arriving in Downloads, watched (no polling): a browser's download
// in progress (Zen/Firefox ".part", Chrome ".crdownload") is a lasting
// activity with its size so far; when it is done, or when a file arrives
// on its own (LocalSend, the phone), a short message opens with buttons to
// open it or show it in its folder.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {bytesText, isQuietFile, partialName} from '../lib/signals.js';
import {Watch} from './watch.js';

const DOWNLOADS = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD) ??
    GLib.build_filenamev([GLib.get_home_dir(), 'Downloads']);
// A new file this soon after its partial file went is the same download.
const SAME_MS = 3000;
// A written file that keeps its name this long has arrived.
const SETTLE_MS = 500;

function sizeOf(file) {
    try {
        return file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size();
    } catch {
        return null;
    }
}

function launch(uri) {
    try {
        Gio.AppInfo.launch_default_for_uri(uri, global.create_app_launch_context(0, -1));
    } catch (error) {
        console.warn(`Islands: cannot open ${uri}: ${error.message}`);
    }
}

export class DownloadsSource {
    constructor(island, dir = DOWNLOADS) {
        this._island = island;
        this._dir = dir;
        // name it will have → {id, started}
        this._partials = new Map();
        // name → when its partial file went
        this._finished = new Map();
        // name → timeout id (0 while still being written)
        this._pending = new Map();
        this._watch = new Watch(dir, (file, other, event) => this._changed(file, other, event),
            {directory: true, changed: true, rateMs: 1000});
    }

    _changed(file, other, event) {
        const name = file.get_basename();
        const target = other?.get_basename() ?? null;
        const Event = Gio.FileMonitorEvent;
        if (event === Event.RENAMED) {
            // A partial file renamed to its final name (Zen, Firefox), a
            // file saved through a temporary name, or a rename by hand.
            const partial = partialName(name);
            if (partial !== null)
                this._endPartial(partial);
            this._unpend(name);
            if (target && partialName(target) !== null)
                this._progress(partialName(target), other);
            else if (target && !isQuietFile(target))
                this._arrived(target, partial !== null || this._recentlyFinished(target));
            return;
        }
        const partial = partialName(name);
        if (partial !== null) {
            if (event === Event.DELETED || event === Event.MOVED_OUT)
                this._endPartial(partial);
            else
                this._progress(partial, file);
            return;
        }
        if (event === Event.DELETED || event === Event.MOVED_OUT) {
            this._unpend(name);
            return;
        }
        if (isQuietFile(name))
            return;
        // A new file is news once it is written and keeps its name a
        // moment (a temporary name is renamed right after).
        if (event === Event.CREATED || event === Event.MOVED_IN)
            this._pending.set(name, 0);
        if ((event === Event.CHANGES_DONE_HINT || event === Event.MOVED_IN) && this._pending.has(name))
            this._settle(name);
    }

    _settle(name) {
        this._unpend(name, false);
        this._pending.set(name, GLib.timeout_add(GLib.PRIORITY_DEFAULT, SETTLE_MS, () => {
            this._pending.delete(name);
            if (GLib.file_test(GLib.build_filenamev([this._dir, name]), GLib.FileTest.EXISTS))
                this._arrived(name, this._recentlyFinished(name));
            return GLib.SOURCE_REMOVE;
        }));
    }

    _unpend(name, forget = true) {
        const id = this._pending.get(name);
        if (id)
            GLib.source_remove(id);
        if (forget)
            this._pending.delete(name);
    }

    _recentlyFinished(name) {
        const ended = this._finished.get(name);
        return ended !== undefined && Date.now() - ended < SAME_MS;
    }

    _progress(name, file) {
        if (!this._island.allows('progress'))
            return;
        const id = `download:${name}`;
        this._partials.set(name, {id});
        const size = sizeOf(file);
        this._island.set({
            id, kind: 'progress', source: 'progress', icon: 'folder-download-symbolic',
            title: name, short: size ? bytesText(size) : 'Downloading', note: size ? `${bytesText(size)} so far` : 'Downloading',
            onActivate: () => launch(Gio.File.new_for_path(this._dir).get_uri()),
        });
    }

    _endPartial(name) {
        const entry = this._partials.get(name);
        if (!entry)
            return;
        this._partials.delete(name);
        this._finished.set(name, Date.now());
        this._island.remove(entry.id);
    }

    _arrived(name, downloaded) {
        this._finished.delete(name);
        if (!this._island.allows('file'))
            return;
        const file = Gio.File.new_for_path(GLib.build_filenamev([this._dir, name]));
        const size = sizeOf(file);
        const id = `file:${name}`;
        this._island.set({
            id, kind: 'file', hint: true, source: 'file', look: 'actions',
            icon: 'folder-download-symbolic',
            title: downloaded ? `Downloaded ${name}` : `New in Downloads: ${name}`, short: name,
            note: size ? bytesText(size) : '',
            actions: [
                {label: 'Show in folder', activate: () => launch(Gio.File.new_for_path(this._dir).get_uri())},
                {label: 'Open', activate: () => launch(file.get_uri())},
            ],
            onAction: action => {
                action.activate();
                this._island.remove(id);
            },
            onActivate: () => launch(file.get_uri()),
        });
    }

    destroy() {
        this._watch.destroy();
        for (const id of this._pending.values()) {
            if (id)
                GLib.source_remove(id);
        }
        this._pending.clear();
        for (const {id} of this._partials.values())
            this._island.remove(id);
        this._partials.clear();
    }
}
