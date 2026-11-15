// What records or watches: the screen recording (GNOME's screenshot UI),
// screen sharing, the camera and the microphone in use. Read from GNOME's
// own indicators, which already follow PipeWire and PulseAudio (as Halo's
// shared/system.js does); nothing is polled. Sharing, camera and microphone
// are one activity each. A red mark for the screen,
// green for camera and microphone, as the canvas has it.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {colors} from '../lib/tokens.js';
import {clockText} from '../lib/words.js';

const RED = colors.dark.down;
const GREEN = colors.dark.up;
// How long a new use stays opened below the bar.
const OPEN_MS = 3000;

const USES = [
    {id: 'sharing', on: '_sharing', icon: 'screen-shared-symbolic', title: 'Sharing the screen', short: 'Sharing', color: RED},
    {id: 'camera', on: '_camera', icon: 'camera-web-symbolic', title: 'Camera in use', short: 'Camera', color: GREEN},
    {id: 'microphone', on: '_microphone', icon: 'audio-input-microphone-symbolic', title: 'Microphone in use', short: 'Microphone', color: GREEN},
];

export class PrivacySource {
    constructor(island) {
        this._island = island;
        this._since = 0;
        this._watched = [];
        const qs = Main.panel.statusArea.quickSettings;
        this._watch(qs?._camera, ['notify::visible']);
        this._watch(qs?._volumeInput?._indicator, ['notify::visible', 'style-changed']);
        this._watch(Main.panel.statusArea.screenSharing, ['notify::visible']);
        Main.screenshotUI.connectObject('notify::screencast-in-progress', () => {
            this._since = Main.screenshotUI.screencast_in_progress ? Date.now() : 0;
            this._update();
        }, this);
        this._since = Main.screenshotUI.screencast_in_progress ? Date.now() : 0;
        // The quick settings' indicators come after an import; look again
        // once the shell is idle.
        this._idleId = GLib.idle_add(GLib.PRIORITY_LOW, () => {
            this._idleId = 0;
            const late = Main.panel.statusArea.quickSettings;
            this._watch(late?._camera, ['notify::visible']);
            this._watch(late?._volumeInput?._indicator, ['notify::visible', 'style-changed']);
            this._update();
            return GLib.SOURCE_REMOVE;
        });
        this._update();
    }

    _watch(actor, signals) {
        if (!actor || this._watched.includes(actor))
            return;
        this._watched.push(actor);
        for (const signal of signals)
            actor.connectObject(signal, () => this._update(), this);
    }

    get _camera() {
        return Boolean(Main.panel.statusArea.quickSettings?._camera?.visible);
    }

    get _microphone() {
        const indicator = Main.panel.statusArea.quickSettings?._volumeInput?._indicator;
        return Boolean(indicator?.visible && indicator.has_style_class_name('privacy-indicator'));
    }

    get _sharing() {
        return Boolean(Main.panel.statusArea.screenSharing?.visible);
    }

    _update() {
        if (this._since && this._island.allows('privacy')) {
            const since = this._since;
            this._island.set({
                id: 'recording', kind: 'recording', source: 'privacy', color: RED,
                icon: 'media-record-symbolic', title: 'Recording the screen', short: clockText(0),
                timeAt: () => clockText(Date.now() - since),
                key: `${since}`,
                onActivate: () => Main.screenshotUI.stopScreencast?.(),
            });
        } else {
            this._island.remove('recording');
        }
        // Each use is its own activity (and bubble): it opens below the
        // bar when it starts, then rests in the bar while it lasts.
        const allowed = this._island.allows('privacy');
        for (const use of USES) {
            const id = `privacy:${use.id}`;
            if (!allowed || !this[use.on]) {
                this._island.remove(id);
                continue;
            }
            if (this._island.has(id))
                continue;
            this._island.set({
                id, kind: 'privacy', source: 'privacy', opensFor: true, opens: true, lasting: true, duration: OPEN_MS,
                icon: use.icon, color: use.color, title: use.title, short: use.short,
            });
        }
    }

    destroy() {
        if (this._idleId)
            GLib.source_remove(this._idleId);
        this._idleId = 0;
        for (const actor of this._watched)
            actor.disconnectObject(this);
        this._watched = [];
        Main.screenshotUI.disconnectObject(this);
        this._island.remove('recording');
        for (const use of USES)
            this._island.remove(`privacy:${use.id}`);
    }
}
