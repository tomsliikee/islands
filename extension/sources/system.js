// Small things the system does, each told briefly in the bar: something
// copied (a preview of it), Caps Lock or Num Lock switched, Do not disturb
// switched, the sound output
// switched (with a headset's battery when UPower knows it), a drive
// plugged in (with buttons to open or eject it). All from signals.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {copiedText, isHeadsetOutput, lockTitle, themeTitle} from '../lib/words.js';

const SHORT_MS = 2000;

// UPower's device kinds for what sits on a head: 17 headset, 19 headphones.
const HEADSET_KINDS = new Set([17, 19]);

export class ClipboardSource {
    constructor(island) {
        this._island = island;
        this._selection = global.display.get_selection();
        this._id = this._selection.connect('owner-changed', (_selection, type) => {
            if (type === Meta.SelectionType.SELECTION_CLIPBOARD && this._island.allows('clipboard'))
                this._read();
        });
    }

    _read() {
        St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_clipboard, text) => {
            if (!text?.trim() || !this._island)
                return;
            this._island.set({id: 'clipboard', kind: 'osd', hint: true, source: 'clipboard', duration: SHORT_MS,
                icon: 'edit-copy-symbolic', title: copiedText(text, 36), key: text.slice(0, 80)});
        });
    }

    destroy() {
        this._selection.disconnect(this._id);
        this._island.remove('clipboard');
        this._island = null;
    }
}

// Caps Lock and Num Lock: GNOME shows nothing when they switch; the
// keyboard map says so with a signal.
export class LocksSource {
    constructor(island) {
        this._island = island;
        this._keymap = Clutter.get_default_backend().get_default_seat().get_keymap();
        this._caps = this._keymap.get_caps_lock_state();
        this._num = this._keymap.get_num_lock_state();
        this._id = this._keymap.connect('state-changed', () => this._changed());
    }

    _changed() {
        const caps = this._keymap.get_caps_lock_state();
        const num = this._keymap.get_num_lock_state();
        const which = caps !== this._caps ? 'caps' : num !== this._num ? 'num' : null;
        this._caps = caps;
        this._num = num;
        if (!which || !this._island.allows('locks'))
            return;
        const on = which === 'caps' ? caps : num;
        this._island.set({id: 'locks', kind: 'osd', hint: true, source: 'locks', duration: SHORT_MS,
            icon: 'input-keyboard-symbolic', title: lockTitle(which, on), key: `${which}:${on}`});
    }

    destroy() {
        this._keymap.disconnect(this._id);
        this._island.remove('locks');
    }
}

export class DndSource {
    constructor(island) {
        this._island = island;
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.notifications'});
        this._id = this._settings.connect('changed::show-banners', () => {
            if (!this._island.allows('dnd'))
                return;
            const quiet = !this._settings.get_boolean('show-banners');
            if (quiet) {
                // Opens, then rests in the bar while it is on.
                this._island.set({id: 'dnd', kind: 'status', source: 'dnd', opensFor: true, opens: true, lasting: true,
                    duration: SHORT_MS, icon: 'notifications-disabled-symbolic', title: 'Do not disturb', short: 'Do not disturb'});
                return;
            }
            this._island.set({id: 'dnd', kind: 'osd', hint: true, source: 'dnd', duration: SHORT_MS, at: Date.now(),
                icon: 'preferences-system-notifications-symbolic', title: 'Notifications on'});
        });
    }

    destroy() {
        this._settings.disconnect(this._id);
        this._island.remove('dnd');
    }
}

export class AudioSource {
    constructor(island) {
        this._island = island;
        this._control = Main.panel.statusArea.quickSettings?._volumeOutput?._control ?? null;
        this._ready = false;
        this._id = this._control?.connect('active-output-update', (control, id) => this._switched(control, id)) ?? 0;
        // The first output after start is not a switch.
        this._readyId = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 5, () => {
            this._readyId = 0;
            this._ready = true;
            return GLib.SOURCE_REMOVE;
        });
        this._headsetAt = 0;
        this._cancellable = new Gio.Cancellable();
    }

    _switched(control, id) {
        if (!this._ready || !this._island.allows('audio'))
            return;
        const device = control.lookup_output_id(id);
        if (!device)
            return;
        const name = device.description || device.origin || 'Output';
        const headset = isHeadsetOutput({iconName: device.get_icon_name?.() ?? '', name});
        const icon = device.get_gicon?.() ?? 'audio-speakers-symbolic';
        // A headset opens, then rests in the bar while it is the output;
        // another output is a word.
        const show = battery => this._island.set(headset
            ? {id: 'audio', kind: 'status', source: 'audio', opensFor: true, opens: true, lasting: true, duration: SHORT_MS * 1.5,
                at: this._headsetAt, icon, title: battery === null ? name : `${name} · ${battery} %`, short: name}
            : {id: 'audio', kind: 'osd', hint: true, source: 'audio', duration: SHORT_MS * 1.5, at: Date.now(),
                icon, title: battery === null ? name : `${name} · ${battery} %`});
        if (headset)
            this._headsetAt = Date.now();
        else
            this._island.remove('audio');
        show(null);
        this._headsetBattery(battery => {
            if (battery !== null)
                show(battery);
        });
    }

    // A Bluetooth headset's battery, asked once per switch from UPower.
    _headsetBattery(done) {
        Gio.DBus.system.call('org.freedesktop.UPower', '/org/freedesktop/UPower', 'org.freedesktop.UPower', 'EnumerateDevices',
            null, new GLib.VariantType('(ao)'), Gio.DBusCallFlags.NO_AUTO_START, 1000, this._cancellable, (bus, result) => {
                let paths = [];
                try {
                    [paths] = bus.call_finish(result).deepUnpack();
                } catch {
                    done(null);
                    return;
                }
                const found = paths.find(path => /headset|headphone|audio/i.test(path));
                if (!found) {
                    done(null);
                    return;
                }
                bus.call('org.freedesktop.UPower', found, 'org.freedesktop.DBus.Properties', 'GetAll',
                    new GLib.Variant('(s)', ['org.freedesktop.UPower.Device']), null, Gio.DBusCallFlags.NONE, 1000, this._cancellable,
                    (b, r) => {
                        try {
                            const [props] = b.call_finish(r).recursiveUnpack();
                            done(HEADSET_KINDS.has(props.Type) || /headset|headphone/i.test(found) ? Math.round(props.Percentage) : null);
                        } catch {
                            done(null);
                        }
                    });
            });
    }

    destroy() {
        if (this._id)
            this._control.disconnect(this._id);
        if (this._readyId)
            GLib.source_remove(this._readyId);
        this._cancellable.cancel();
        this._island.remove('audio');
    }
}

// Dark or light mode switched: a word, then gone.
export class ThemeSource {
    constructor(island) {
        this._island = island;
        this._settings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._id = this._settings.connect('changed::color-scheme', () => {
            if (!this._island.allows('theme'))
                return;
            const dark = this._settings.get_string('color-scheme') === 'prefer-dark';
            this._island.set({id: 'theme', kind: 'osd', hint: true, source: 'theme', duration: SHORT_MS, at: Date.now(),
                icon: dark ? 'weather-clear-night-symbolic' : 'weather-clear-symbolic',
                title: themeTitle(this._settings.get_string('color-scheme'))});
        });
    }

    destroy() {
        this._settings.disconnect(this._id);
        this._island.remove('theme');
    }
}

export class DrivesSource {
    constructor(island) {
        this._island = island;
        this._monitor = Gio.VolumeMonitor.get();
        this._ids = [
            this._monitor.connect('mount-added', (_monitor, mount) => this._added(mount)),
            this._monitor.connect('mount-removed', (_monitor, mount) => this._removed(mount)),
        ];
    }

    _removable(mount) {
        return mount.can_eject() || (mount.can_unmount() && Boolean(mount.get_drive()?.is_removable()));
    }

    _added(mount) {
        if (!this._removable(mount) || !this._island.allows('drives'))
            return;
        const name = mount.get_name();
        const id = `drive:${name}`;
        const open = () => Gio.AppInfo.launch_default_for_uri(mount.get_root().get_uri(), global.create_app_launch_context(0, -1));
        this._island.set({
            id, kind: 'status', source: 'drives', look: 'actions', opensFor: true, opens: true, lasting: true, duration: 6000,
            icon: mount.get_symbolic_icon() ?? 'drive-removable-media-symbolic',
            title: name, short: name, note: 'Connected',
            actions: [
                {label: 'Open', activate: open},
                {label: 'Eject', activate: () => mount.eject_with_operation(Gio.MountUnmountFlags.NONE, null, null, null)},
            ],
            onAction: action => {
                action.activate();
                this._island.remove(id);
            },
            onActivate: open,
        });
    }

    _removed(mount) {
        const name = mount.get_name();
        this._island.remove(`drive:${name}`);
        if (!this._island.allows('drives'))
            return;
        this._island.set({id: `drive-gone:${name}`, kind: 'osd', hint: true, source: 'drives', duration: SHORT_MS,
            icon: 'drive-removable-media-symbolic', title: `${name} can be removed`});
    }

    destroy() {
        for (const id of this._ids)
            this._monitor.disconnect(id);
    }
}
