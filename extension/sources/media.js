// Music and videos that play, from Halo's sources/media.js: the compact
// player while something plays, the large one when the island is clicked.
// The players come from GNOME's own MPRIS list in the date menu (all
// players, NectarLink's phone music included).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const ID = 'media';
const MPRIS_PATH = '/org/mpris/MediaPlayer2';
const MPRIS_PLAYER = 'org.mpris.MediaPlayer2.Player';

function coverIcon(url) {
    if (!url)
        return null;
    try {
        return new Gio.FileIcon({file: Gio.File.new_for_uri(url)});
    } catch {
        return null;
    }
}

// A scroll on the player: the volume a step up or down through GNOME's own
// output slider, shown as the volume keys show it.
const VOLUME_STEP = 0.05;
function nudgeVolume(steps) {
    const output = Main.panel.statusArea.quickSettings?._volumeOutput;
    const slider = output?._output?.slider;
    if (!slider)
        return;
    const max = slider.maximum_value ?? 1;
    slider.value = Math.max(0, Math.min(max, slider.value + steps * VOLUME_STEP));
    const icon = output._indicator?.gicon ?? new Gio.ThemedIcon({name: 'audio-volume-high-symbolic'});
    Main.osdWindowManager.showAll(icon, null, slider.value, max);
}

export class MediaSource {
    constructor(island) {
        this._island = island;
        this._player = null;
        this._position = {at: 0, value: 0};
        this._cancellable = new Gio.Cancellable();
        this._source = Main.panel.statusArea.dateMenu?._messageList?._messageView?._mediaSource ?? null;
        this._source?.connectObject(
            'player-added', () => this._choose(),
            'player-removed', () => this._choose(), this);
        this._choose();
    }

    destroy() {
        this._cancellable.cancel();
        this._source?.disconnectObject(this);
        this._player?.disconnectObject(this);
        this._player = null;
        this._island.remove(ID);
    }

    // The playing player, else the one shown before, else none.
    _choose() {
        const players = this._source?.players ?? [];
        const player = players.find(p => p.status === 'Playing') ??
            (players.includes(this._player) ? this._player : null);
        if (player !== this._player) {
            this._player?.disconnectObject(this);
            this._player = player;
            player?.connectObject('changed', () => this._changed(), this);
            this._readPosition();
        }
        this._update();
    }

    _changed() {
        // Another player may have started.
        const players = this._source?.players ?? [];
        if (this._player?.status !== 'Playing' && players.some(p => p.status === 'Playing')) {
            this._choose();
            return;
        }
        this._readPosition();
        this._update();
    }

    // MPRIS does not announce the position as it moves; it is read on a
    // change and counted on from there by the look while it shows.
    _readPosition() {
        const player = this._player;
        if (!player?._busName)
            return;
        Gio.DBus.session.call(player._busName, MPRIS_PATH, 'org.freedesktop.DBus.Properties', 'Get',
            new GLib.Variant('(ss)', [MPRIS_PLAYER, 'Position']), null, Gio.DBusCallFlags.NONE, 1000, this._cancellable,
            (bus, result) => {
                try {
                    const [value] = bus.call_finish(result).recursiveUnpack();
                    this._position = {at: GLib.get_monotonic_time(), value: Number(value) || 0};
                    this._update();
                } catch {
                    // Not every player tells its position.
                }
            });
    }

    _length() {
        try {
            const metadata = this._player?._playerProxy?.Metadata ?? {};
            const length = metadata['mpris:length'];
            return Number(length?.deepUnpack?.() ?? length ?? 0) || 0;
        } catch {
            return 0;
        }
    }

    _update() {
        const player = this._player;
        const playing = player?.status === 'Playing';
        if (!player || !this._island.allows('media')) {
            this._island.remove(ID);
            return;
        }
        // A paused player stays, with its play button, until the player goes
        // or a right click sends it aside; it only comes up while playing.
        if (!playing && !this._island.has(ID))
            return;
        const {at, value} = this._position;
        const app = player.app?.get_name() ?? '';
        const artists = (player.trackArtists ?? []).filter(Boolean).join(', ');
        const title = player.trackTitle || app || 'Playing';
        const length = this._length();
        this._island.set({
            id: ID, kind: 'media', source: 'media',
            title, note: artists || app, short: title,
            icon: 'audio-x-generic-symbolic',
            cover: coverIcon(player.trackCoverUrl),
            playing, length,
            position: value,
            positionAt: () => value + (playing ? GLib.get_monotonic_time() - at : 0),
            // What the looks show: a new track, play/pause, a seek.
            key: `${title}:${artists}:${player.trackCoverUrl}:${playing}:${at}:${length}`,
            // The player's own window, by its desktop file or MPRIS Raise.
            onActivate: player.app || player._mprisProxy?.CanRaise ? () => player.raise() : null,
            onPlay: () => player.playPause(),
            onPrevious: player.canGoPrevious ? () => player.previous() : null,
            onNext: player.canGoNext ? () => player.next() : null,
            onScroll: steps => nudgeVolume(steps),
        });
    }
}
