// A quick note from the island: a right click on the empty island opens a
// line to type into; Enter appends it to a Markdown file (an Obsidian
// inbox), Esc or a click elsewhere leaves. Off until a file is set in the
// settings (quick-note-file); nothing is written anywhere else.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ID = 'quicknote';

// "~/x.md" → absolute path; '' stays ''.
export function notePath(setting) {
    const path = (setting ?? '').trim();
    if (!path)
        return '';
    return path.startsWith('~/') ? GLib.build_filenamev([GLib.get_home_dir(), path.slice(2)]) : path;
}

// The line written for a note: "- 17:42 text".
export function noteLine(text, date) {
    const two = n => String(n).padStart(2, '0');
    return `- ${two(date.getHours())}:${two(date.getMinutes())} ${text.trim().replace(/\s*\n\s*/g, ' ')}\n`;
}

export class QuickNote {
    constructor(island, settings) {
        this._island = island;
        this._settings = settings;
    }

    get available() {
        return notePath(this._settings.get_string('quick-note-file')) !== '';
    }

    open() {
        const path = notePath(this._settings.get_string('quick-note-file'));
        if (!path)
            return false;
        this._island.set({
            id: ID, kind: 'notification', hint: true, sticky: true, look: 'note', source: 'quicknote',
            icon: 'document-edit-symbolic', title: 'Quick note', note: GLib.path_get_basename(path),
            onSave: text => {
                if (text.trim())
                    this._append(path, noteLine(text, new Date()));
                this._island.remove(ID);
            },
            onCancel: () => this._island.remove(ID),
        });
        return true;
    }

    _append(path, line) {
        try {
            const file = Gio.File.new_for_path(path);
            GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
            const stream = file.append_to(Gio.FileCreateFlags.NONE, null);
            stream.write_all(new TextEncoder().encode(line), null);
            stream.close(null);
        } catch (error) {
            console.warn(`Islands: quick note not written: ${error.message}`);
        }
    }

    destroy() {
        this._island.remove(ID);
    }
}
