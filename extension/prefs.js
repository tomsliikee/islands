// Islands' settings, in Adwaita. The first thing on the page points to Top
// Bar Organizer: the clock is not part of the island, and moving it out of
// the centre is that extension's job.

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const ORGANIZER = 'top-bar-organizer@julian.gse.jsts.xyz';
const ORGANIZER_URL = 'https://gitlab.gnome.org/june/top-bar-organizer';
const LANTERN = 'material-search@thomashaiden';
// Same list as extension.js CONFLICTING (prefs cannot import the shell's modules).
const CONFLICTING = {
    'halo@thomashaiden': 'Halo',
    'dynamic-music-pill@andbal': 'Dynamic Music Pill',
    'dynamic-panel@velhlkj.com': 'Dynamic Panel',
};
import {GLANCE_PARTS} from './lib/glance.js';

// Activity sources with a switch each, in the island's fixed order.
// Sources whose message opens by itself and so may rest as a bubble after.
const BUBBLE_AFTER = new Set(['call', 'privacy', 'timer', 'notification', 'events', 'file', 'claude-work', 'claude',
    'torch', 'battery', 'weather', 'updates', 'drives', 'dnd', 'audio']);

const SOURCES = [
    ['call', 'Calls', 'From the phone over NectarLink, Discord or a meeting'],
    ['privacy', 'Camera, microphone, screen sharing', 'Opens when one starts, then a bubble each while in use'],
    ['timer', 'Timers and alarms', 'GNOME Clocks, stopwatch'],
    ['notification', 'Notifications', 'Discord, mail, calendar and all others'],
    ['events', 'Events starting soon', 'From your calendars, ten minutes ahead and at the start'],
    ['file', 'Files', 'LocalSend and downloads'],
    ['claude-work', 'Claude working', 'Rests in the bar with its name and time while a Claude Code session is busy'],
    ['claude', 'Claude', 'Finished answers; usage from Tally on hover'],
    ['phone', 'Phone', 'NectarLink: connected and battery on hover, a word when it runs low'],
    ['torch', 'Torch', 'An app that eats power, with a button to freeze it; CPU and GPU on hover'],
    ['media', 'Media', 'All MPRIS players, NectarLink included'],
    ['progress', 'Progress', 'Browser downloads, Steam updates, a loaded Ollama model'],
    ['battery', 'Charging and battery', 'Laptop only: charger in or out, 20 % and 10 % left'],
    ['weather', 'Rain soon', 'From GNOME\'s weather; the sky and temperature on hover'],
    ['updates', 'System updates', 'When PackageKit finds new ones'],
    ['audio', 'Sound output', 'A word when the output switches; a headset rests in the bar, with its battery'],
    ['drives', 'Drives', 'A USB stick or disk plugged in, with Open and Eject; rests in the bar while plugged in'],
    ['locks', 'Caps Lock and Num Lock', 'A word when one is switched'],
    ['dnd', 'Do not disturb', 'Opens when switched on and rests in the bar while it is on'],
    ['theme', 'Dark and light mode', 'A word when it is switched'],
    ['clipboard', 'Clipboard', 'A preview of what was copied (off at first: it speaks on every copy)'],
];

// Whether an extension is installed for this user or system-wide. The
// settings run inside org.gnome.Shell.Extensions itself, so asking that
// service over D-Bus would wait on its own reply; the folders are read.
function installed(uuid) {
    const dirs = [GLib.get_user_data_dir(), ...GLib.get_system_data_dirs()];
    return dirs.some(dir => GLib.file_test(`${dir}/gnome-shell/extensions/${uuid}/metadata.json`, GLib.FileTest.EXISTS));
}

// Whether an extension is switched on (installed and in enabled-extensions).
function enabled(uuid) {
    const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
    return installed(uuid) && !shell.get_boolean('disable-user-extensions') && shell.get_strv('enabled-extensions').includes(uuid);
}

function launch(argv) {
    try {
        Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
    } catch (error) {
        console.warn(`Islands: could not start ${argv[0]}: ${error.message}`);
    }
}

function switchRow(settings, key, title, subtitle = '') {
    const row = new Adw.SwitchRow({title, subtitle});
    settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
    return row;
}

// A combo row for an enum key: choices [[nick, label], ...].
// A switch row for one piece of the glance: it adds or takes its id from
// the glance-items list.
function glanceRow(settings, id, title, subtitle) {
    const row = new Adw.SwitchRow({title, subtitle});
    const sync = () => {
        const on = settings.get_strv('glance-items').includes(id);
        if (row.active !== on)
            row.active = on;
    };
    sync();
    row.connect('notify::active', () => {
        const rest = settings.get_strv('glance-items').filter(item => item !== id);
        settings.set_strv('glance-items', row.active ? [...rest, id] : rest);
    });
    const handler = settings.connect('changed::glance-items', sync);
    row.connect('destroy', () => settings.disconnect(handler));
    return row;
}

function choiceRow(settings, key, title, subtitle, choices) {
    const row = new Adw.ComboRow({title, subtitle, model: Gtk.StringList.new(choices.map(([, label]) => label))});
    const sync = () => {
        const index = choices.findIndex(([nick]) => nick === settings.get_string(key));
        if (index >= 0 && row.selected !== index)
            row.selected = index;
    };
    sync();
    row.connect('notify::selected', () => settings.set_string(key, choices[row.selected][0]));
    const id = settings.connect(`changed::${key}`, sync);
    row.connect('destroy', () => settings.disconnect(id));
    return row;
}

export default class IslandsPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 860);
        const page = new Adw.PreferencesPage({title: 'Islands', icon_name: 'preferences-desktop-display-symbolic'});
        window.add(page);

        page.add(this._organizerGroup());
        const conflicts = this._conflictGroup();
        if (conflicts)
            page.add(conflicts);

        const look = new Adw.PreferencesGroup({title: 'Look'});
        look.add(choiceRow(settings, 'style', 'Style', 'Blur My Shell\'s blur while it is on, else black', [
            ['auto', 'Automatic'], ['black', 'Black'],
        ]));
        look.add(choiceRow(settings, 'size', 'Size', 'Compact height 22, 26 or 30 px at a 32 px bar', [
            ['small', 'Small'], ['standard', 'Standard'], ['large', 'Large'],
        ]));
        look.add(choiceRow(settings, 'idle', 'While nothing goes on', '', [
            ['shape', 'Show the shape'], ['hidden', 'Hide'],
        ]));
        const bubbles = new Adw.SpinRow({
            title: 'Bubbles beside the island',
            subtitle: 'The last one counts the rest as +N; 0 shows none',
            adjustment: new Gtk.Adjustment({lower: 0, upper: 10, step_increment: 1, page_increment: 1}),
        });
        settings.bind('bubbles', bubbles, 'value', Gio.SettingsBindFlags.DEFAULT);
        look.add(bubbles);
        page.add(look);

        const behaviour = new Adw.PreferencesGroup({title: 'Behaviour'});
        behaviour.add(choiceRow(settings, 'click', 'Click on the island', 'The empty island always opens the search', [
            ['open', 'Open the activity'], ['app', 'Open its app'],
        ]));
        behaviour.add(switchRow(settings, 'hover-glance', 'Glance on hover', 'Next event, weather and stats while the island is empty'));
        behaviour.add(switchRow(settings, 'full-message', 'Show the whole message', 'A message under the pointer unfolds to all its text; off: five lines at most'));
        behaviour.add(switchRow(settings, 'hover-open', 'Open on hover', 'After 400 ms, without a click'));
        behaviour.add(switchRow(settings, 'pointer-pull', 'Pointer pull', 'The pointer is drawn in slightly under the island, as on the MacBook'));
        behaviour.add(switchRow(settings, 'notifications', 'Notifications in the island', 'Replaces the banners at the top'));
        behaviour.add(switchRow(settings, 'osd', 'Volume and brightness', 'Replaces GNOME\'s display at the bottom'));
        behaviour.add(choiceRow(settings, 'fullscreen', 'In fullscreen', '', [
            ['activities', 'Running things only'], ['off', 'Off'],
        ]));
        behaviour.add(choiceRow(settings, 'alert-length', 'Short messages stay', 'Notification 5 s, call 6 s, file 8 s at normal', [
            ['short', 'Shorter'], ['normal', 'Normal'], ['long', 'Longer'],
        ]));
        page.add(behaviour);

        const glance = new Adw.PreferencesGroup({title: 'Glance on hover', description: 'What the empty island shows under the pointer, set into centred lines by topic. At most five lines show; what a computer does not have is left out.'});
        for (const [id, title, subtitle] of GLANCE_PARTS)
            glance.add(glanceRow(settings, id, title, subtitle));
        page.add(glance);

        const activities = new Adw.PreferencesGroup({title: 'Activities', description: 'The order is fixed: a call before a recording, before a timer, and so on down this list.'});
        for (const [source, title, subtitle] of SOURCES)
            activities.add(this._sourceRow(settings, source, title, subtitle));
        page.add(activities);

        const note = new Adw.EntryRow({title: 'Quick note file (right click on the empty island)', show_apply_button: true});
        note.text = settings.get_string('quick-note-file');
        note.connect('apply', () => settings.set_string('quick-note-file', note.text.trim()));
        activities.add(note);

        const lantern = new Adw.PreferencesGroup({title: 'Lantern'});
        const lanternThere = installed(LANTERN);
        const lanternRow = switchRow(settings, 'lantern', 'Open Lantern from the island',
            lanternThere ? 'A click on the empty island grows Lantern out of it' : 'Lantern is not installed: a click opens the overview');
        lanternRow.sensitive = lanternThere;
        lantern.add(lanternRow);
        page.add(lantern);

        const power = new Adw.PreferencesGroup({title: 'Power'});
        power.add(switchRow(settings, 'calm-on-battery', 'Calm on battery', 'No springs and no moving level on battery'));
        power.add(switchRow(settings, 'level-animation', 'Level animation', 'The level beside the music moves while it plays'));
        page.add(power);
    }

    _organizerGroup() {
        const group = new Adw.PreferencesGroup();
        const there = installed(ORGANIZER);
        const row = new Adw.ActionRow({
            title: 'Arrange the clock and the bar: Top Bar Organizer',
            subtitle: there
                ? 'The middle of the bar belongs to the island. Move the clock aside with Top Bar Organizer.'
                : 'Top Bar Organizer is not installed. Install it to move the clock out of the middle.',
        });
        const button = new Gtk.Button({label: there ? 'Open' : 'Install', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => there
            ? launch(['gnome-extensions', 'prefs', ORGANIZER])
            : Gtk.show_uri(null, ORGANIZER_URL, 0));
        row.add_suffix(button);
        row.activatable_widget = button;
        group.add(row);
        return group;
    }

    _conflictGroup() {
        const active = Object.entries(CONFLICTING)
            .filter(([uuid]) => enabled(uuid))
            .map(([, name]) => name);
        if (active.length === 0)
            return null;
        const group = new Adw.PreferencesGroup();
        group.add(new Adw.ActionRow({
            title: `Also on: ${active.join(', ')}`,
            subtitle: 'They change the same bar, media or banners. Switch them off in Extensions to avoid two islands.',
            css_classes: ['warning'],
        }));
        return group;
    }

    // A source's row: its switch and, for what opens by itself, a second
    // switch inside it: after its time it rests as a bubble.
    _sourceRow(settings, source, title, subtitle) {
        const expandable = BUBBLE_AFTER.has(source);
        const row = expandable
            ? new Adw.ExpanderRow({title, subtitle, show_enable_switch: true})
            : new Adw.SwitchRow({title, subtitle});
        const set = value => {
            if (expandable)
                row.enable_expansion = value;
            else
                row.active = value;
        };
        const get = () => (expandable ? row.enable_expansion : row.active);
        if (expandable)
            row.add_row(this._bubbleRow(settings, source));
        const sync = () => {
            set(!settings.get_strv('disabled-sources').includes(source));
        };
        sync();
        row.connect(expandable ? 'notify::enable-expansion' : 'notify::active', () => {
            const off = new Set(settings.get_strv('disabled-sources'));
            if (get())
                off.delete(source);
            else
                off.add(source);
            const next = [...off].sort();
            if (next.join() !== settings.get_strv('disabled-sources').join())
                settings.set_strv('disabled-sources', next);
        });
        const id = settings.connect('changed::disabled-sources', sync);
        row.connect('destroy', () => settings.disconnect(id));
        return row;
    }

    _bubbleRow(settings, source) {
        const row = new Adw.SwitchRow({title: 'Then rest as a bubble', subtitle: 'After it has been open, it shrinks into a bubble beside the island instead of the island itself'});
        const sync = () => {
            const on = settings.get_strv('bubble-after').includes(source);
            if (row.active !== on)
                row.active = on;
        };
        sync();
        row.connect('notify::active', () => {
            const rest = settings.get_strv('bubble-after').filter(item => item !== source);
            const next = row.active ? [...rest, source].sort() : rest;
            if (next.join() !== settings.get_strv('bubble-after').join())
                settings.set_strv('bubble-after', next);
        });
        const id = settings.connect('changed::bubble-after', sync);
        row.connect('destroy', () => settings.disconnect(id));
        return row;
    }
}
