// What records or watches: the screen recording (GNOME's screenshot UI),
// screen sharing, the camera and the microphone in use. Read from GNOME's
// own indicators, which already follow PipeWire and PulseAudio (as Halo's
// shared/system.js does); nothing is polled. A red mark for the screen,
// green for camera and microphone, as the canvas has it.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {colors} from '../lib/tokens.js';
import {clockText} from '../lib/words.js';

const RED = colors.dark.down;
const GREEN = colors.dark.up;

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
        const uses = [
            this._sharing && {icon: 'screen-shared-symbolic', title: 'Sharing the screen', color: RED},
            this._camera && {icon: 'camera-web-symbolic', title: 'Camera in use', color: GREEN},
            this._microphone && {icon: 'audio-input-microphone-symbolic', title: 'Microphone in use', color: GREEN},
        ].filter(Boolean);
        if (uses.length === 0 || !this._island.allows('privacy')) {
            this._island.remove('privacy');
            return;
        }
        this._island.set({
            id: 'privacy', kind: 'privacy', source: 'privacy',
            icon: uses[0].icon, color: uses[0].color,
            title: uses.map(use => use.title).join(', '), short: uses.length > 1 ? `${uses.length} in use` : uses[0].title,
            note: uses.length > 1 ? uses.slice(1).map(use => use.title).join(', ') : null,
        });
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
        this._island.remove('privacy');
    }
}
