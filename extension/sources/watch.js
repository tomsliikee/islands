// A file or folder watched by Gio.FileMonitor, so a source learns of a
// change from the kernel and never polls. onChange(file, otherFile, event)
// is called for the events that matter.
//
// A file whose folder does not exist is not watched at all: GLib would
// look for the folder every few seconds, a wakeup that never ends on a
// computer without the app. The app's folder appears once it has run;
// the next enable (next login) then watches it.

import Gio from 'gi://Gio';

const INTERESTING = new Set([
    Gio.FileMonitorEvent.CHANGES_DONE_HINT, Gio.FileMonitorEvent.CREATED, Gio.FileMonitorEvent.DELETED,
    Gio.FileMonitorEvent.MOVED_IN, Gio.FileMonitorEvent.MOVED_OUT, Gio.FileMonitorEvent.RENAMED,
    Gio.FileMonitorEvent.CHANGED,
]);

export class Watch {
    // directory: watch a folder (its children) rather than one file;
    // changed: also report CHANGED (every write), rate-limited to rateMs.
    constructor(path, onChange, {directory = false, changed = false, rateMs = 1000} = {}) {
        this._file = Gio.File.new_for_path(path);
        this._onChange = onChange;
        this._changed = changed;
        this._monitor = null;
        const folder = directory ? this._file : this._file.get_parent();
        if (!folder?.query_exists(null))
            return;
        try {
            this._monitor = directory
                ? this._file.monitor_directory(Gio.FileMonitorFlags.WATCH_MOVES, null)
                : this._file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.set_rate_limit(rateMs);
            this._monitor.connect('changed', (_monitor, file, other, event) => {
                if (!INTERESTING.has(event) || (event === Gio.FileMonitorEvent.CHANGED && !this._changed))
                    return;
                this._onChange(file, other, event);
            });
        } catch (error) {
            console.warn(`Islands: cannot watch ${path}: ${error.message}`);
            this._monitor = null;
        }
    }

    get file() {
        return this._file;
    }

    // The file's text, or null when it cannot be read.
    read() {
        try {
            const [, bytes] = this._file.load_contents(null);
            return new TextDecoder().decode(bytes);
        } catch {
            return null;
        }
    }

    destroy() {
        this._monitor?.cancel();
        this._monitor = null;
    }
}
