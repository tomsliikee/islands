// Volume, brightness and the other on-screen displays, from Halo's
// sources/osd.js: GNOME's own windows stay quiet and the island shows the
// level instead (canvas: 300 x 26 for 1.5 s). GNOME shows one through
// OsdWindowManager._showOsdWindow, for every way in (the volume keys, the
// brightness keys, gnome-settings-daemon over D-Bus), so that one method
// is shadowed on the manager and given back on destroy.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {isMuted, levelShare, osdKind} from '../lib/words.js';

const ID = 'osd';
// How long a level stays after the last change (canvas: 1.5 s).
const LEVEL_MS = 1500;

export class OsdSource {
    constructor(island) {
        this._island = island;
        this._manager = Main.osdWindowManager;
        const original = this._manager._showOsdWindow;
        this._manager._showOsdWindow = (monitorIndex, gicon, label, level, maxLevel) => {
            if (!this._show(monitorIndex, gicon, label, level, maxLevel))
                original.call(this._manager, monitorIndex, gicon, label, level, maxLevel);
        };
    }

    destroy() {
        // The prototype's method comes back.
        delete this._manager._showOsdWindow;
        this._island.remove(ID);
    }

    // Returns false when GNOME should show it after all.
    _show(monitorIndex, gicon, label, level, maxLevel) {
        if (!this._island.allows('osd'))
            return false;
        // Only the main monitor has an island; the others stay quiet too.
        if (monitorIndex !== -1 && monitorIndex !== Main.layoutManager.primaryIndex)
            return true;
        const iconName = gicon?.get_names?.()[0] ?? gicon?.to_string?.() ?? '';
        const kind = osdKind(iconName);
        const muted = isMuted(iconName);
        const hasLevel = typeof level === 'number' && level >= 0 && !(muted && kind === 'volume');
        const share = hasLevel ? levelShare(level, maxLevel) : null;
        this._island.set({
            id: ID, kind: 'osd', hint: true, duration: LEVEL_MS,
            icon: gicon ?? 'dialog-information-symbolic',
            share,
            short: hasLevel ? `${Math.round(level * 100)}` : '',
            title: hasLevel ? '' : label || (muted ? 'Muted' : 'Changed'),
            key: `${iconName}:${share === null ? label : Math.round(share * 100)}`,
        });
        return true;
    }
}
