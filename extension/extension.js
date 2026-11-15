// Islands: a Dynamic Island in GNOME's top bar. This file only wires the
// parts together and takes them apart again; the island's state lives in
// island.js, its look in views/, the rules in lib/, what goes on in
// sources/.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import {ExtensionState} from 'resource:///org/gnome/shell/misc/extensionUtils.js';

import {Island} from './island.js';
import {BannerSource} from './sources/banners.js';
import {ChargeSource} from './sources/charge.js';
import {Battery} from './sources/battery.js';
import {ClaudeSource} from './sources/claude.js';
import {DownloadsSource} from './sources/downloads.js';
import {EventsSource} from './sources/events.js';
import {MediaSource} from './sources/media.js';
import {OllamaSource} from './sources/ollama.js';
import {OsdSource} from './sources/osd.js';
import {PhoneSource} from './sources/phone.js';
import {PrivacySource} from './sources/privacy.js';
import {QuickNote} from './sources/quicknote.js';
import {SteamSource} from './sources/steam.js';
import {AudioSource, ClipboardSource, DndSource, DrivesSource, LocksSource} from './sources/system.js';
import {TimerSource} from './sources/timer.js';
import {TorchSource} from './sources/torch.js';
import {UpdatesSource} from './sources/updates.js';
import {WeatherSource} from './sources/weather.js';
import {TimerStore} from './sources/timerstore.js';
import './views/looks/index.js';

// Extensions that change the same bar centre or take over the media and
// banners. Islands does not fight them: it says which are on, and the
// settings show a warning. Switching them off is the user's call.
export const CONFLICTING = {
    'halo@thomashaiden': 'Halo',
    'dynamic-music-pill@andbal': 'Dynamic Music Pill',
    'dynamic-panel@velhlkj.com': 'Dynamic Panel',
};

const LANTERN = 'material-search@thomashaiden';
// Lantern's growth out of the island takes about this long.
const LANTERN_OPENING_US = 700000;

export default class IslandsExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._battery = new Battery();
        this._island = new Island(this._settings, {
            openIdle: () => this._openIdle(),
            secondaryIdle: () => this._quickNote?.open(),
        }, this._battery);
        this._timers = new TimerStore();
        this._sources = [
            new OsdSource(this._island),
            new BannerSource(this._island),
            new MediaSource(this._island),
            new TimerSource(this._island, this._timers),
            new PrivacySource(this._island),
            new ChargeSource(this._island),
        ];
        this._events = new EventsSource(this._island);
        // Apps that tell what they do, each with a line for the glance:
        // the calendar, the weather, NectarLink, Tally, Torch and Ollama.
        this._glances = [
            this._events,
            new WeatherSource(this._island),
            new PhoneSource(this._island),
            new ClaudeSource(this._island),
            new TorchSource(this._island),
            new OllamaSource(this._island),
        ];
        this._sources.push(...this._glances, new DownloadsSource(this._island), new SteamSource(this._island));
        // The system's small things.
        this._quickNote = new QuickNote(this._island, this._settings);
        this._sources.push(
            new UpdatesSource(this._island),
            new ClipboardSource(this._island),
            new DndSource(this._island),
            new LocksSource(this._island),
            new AudioSource(this._island),
            new DrivesSource(this._island),
            this._quickNote,
        );
        // The glance on hover: one line from each source that has one.
        this._island.setGlance(() => {
            const items = (this._glances ?? []).map(source => source.glance).filter(Boolean);
            return items.length > 0 ? {items} : null;
        });
        const active = this.conflicts;
        if (active.length > 0)
            console.warn(`Islands: these extensions change the same bar centre: ${active.join(', ')}`);
    }

    disable() {
        this._closeLantern();
        for (const source of this._sources ?? [])
            source.destroy();
        this._sources = null;
        this._glances = null;
        this._quickNote = null;
        this._events = null;
        this._timers?.destroy();
        this._timers = null;
        this._island?.destroy();
        this._island = null;
        this._battery?.destroy();
        this._battery = null;
        this._settings = null;
    }

    // The names of the conflicting extensions that are running.
    get conflicts() {
        return Object.entries(CONFLICTING)
            .filter(([uuid]) => Main.extensionManager.lookup(uuid)?.state === ExtensionState.ACTIVE)
            .map(([, name]) => name);
    }

    // A click on the empty island: Lantern grows out of it when it can
    // (openFrom), else Lantern opens as usual, else the overview.
    _openIdle() {
        const lantern = Main.extensionManager.lookup(LANTERN);
        const running = lantern?.state === ExtensionState.ACTIVE ? lantern.stateObj : null;
        if (!this._settings.get_boolean('lantern') || !running) {
            Main.overview.toggle();
            return;
        }
        if (typeof running.openFrom !== 'function') {
            running.toggle?.();
            return;
        }
        const anchor = this.lanternAnchor();
        if (!anchor) {
            running.toggle?.();
            return;
        }
        if (!running.openFrom(anchor.rect, {onClosed: anchor.onClosed}))
            anchor.onClosed();
    }

    // Lends the island to Lantern: its rectangle to grow out of, and a
    // callback that brings the island back once Lantern has shrunk into
    // it. null while the island does not show or the setting is off.
    // Lantern's own shortcut asks here too (material-search toggle()).
    lanternAnchor() {
        // Pressed again while Lantern is still open or shrinking: the same
        // island rectangle, not the middle of the screen. The island is
        // hidden then, so it cannot be asked.
        if (this._lanternOpen && this._anchor)
            return this._anchor;
        const island = this._island;
        if (!island || !this._settings.get_boolean('lantern') || !island.shown)
            return null;
        // Lantern grows out of the island as it is under the pointer, and
        // shrinks into it as it will be: with the pointer gone the island
        // rests as a pill, and the shape Lantern left must be that one, not
        // the grown one (which would shrink again once shown). The first
        // moments keep the grown one so that the way out is not bent.
        const grown = island.rect;
        const rest = island.restRect;
        const since = GLib.get_monotonic_time();
        const near = () => {
            if (GLib.get_monotonic_time() - since < LANTERN_OPENING_US)
                return true;
            const [x, y] = global.get_pointer();
            return x >= grown.x && x < grown.x + grown.width && y >= grown.y && y < grown.y + grown.height;
        };
        const rect = {};
        for (const key of ['x', 'y', 'width', 'height'])
            Object.defineProperty(rect, key, {get: () => (near() ? grown : rest)[key], enumerable: true});
        island.setHidden(true, {instant: true});
        this._lanternOpen = true;
        this._anchor = {rect, onClosed: () => {
            this._lanternOpen = false;
            this._anchor = null;
            this._island?.setHidden(false, {instant: true});
        }};
        return this._anchor;
    }

    // Lantern grown out of the island goes back before the island goes.
    _closeLantern() {
        if (!this._lanternOpen)
            return;
        this._lanternOpen = false;
        Main.extensionManager.lookup(LANTERN)?.stateObj?._panel?.close?.();
    }
}
