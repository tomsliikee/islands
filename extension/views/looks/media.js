// Music: in the bar the cover on the left and a level on the right in the
// cover's colour (canvas 292 x 26); opened, the cover, title and artist,
// the time and the buttons (canvas 452 x 184).
//
// The level is not the sound's real loudness (that would mean reading the
// audio stream); its bars move at the rate lib/power.js allows while the
// music plays and come to rest a minute after the last change.

import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import St from 'gi://St';

import {trackTime} from '../../lib/words.js';
import {Ticker} from '../ticker.js';
import {LevelBar, column, ink, label, roundButton, row, updatable} from './parts.js';

const BARS = 5;
// The bars' heights as shares of the pill, one cycle the level walks through.
const WAVE = [0.23, 0.5, 0.35, 0.58, 0.27, 0.46, 0.62, 0.31, 0.54, 0.4];
// Ticks per point of the wave: at 20 fps one point per 200 ms.
const WAVE_TICKS = 4;

// The cover's mean colour, read once per cover from a 1 x 1 copy; only
// local files are read (a remote cover would mean a download).
const colours = new Map();
export function coverColour(gicon) {
    const file = gicon instanceof Gio.FileIcon ? gicon.get_file() : null;
    const path = file?.get_path();
    if (!path)
        return null;
    if (!colours.has(path)) {
        let colour = null;
        try {
            const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, 8, 8, false).scale_simple(1, 1, GdkPixbuf.InterpType.BILINEAR);
            const [r, g, b] = pixbuf.get_pixels();
            // Too dark a cover would vanish on black: lift it.
            const lift = Math.max(0, 140 - Math.max(r, g, b));
            colour = `rgb(${Math.min(255, r + lift)}, ${Math.min(255, g + lift)}, ${Math.min(255, b + lift)})`;
        } catch {
            colour = null;
        }
        colours.set(path, colour);
    }
    return colours.get(path);
}

function coverPath(activity) {
    return activity.cover instanceof Gio.FileIcon ? activity.cover.get_file().get_path() : null;
}

// Whether a newer state of the player shows the same thing (only the
// position was read anew, as players do on every little change).
function sameTrack(a, b) {
    return a.title === b.title && a.note === b.note && coverPath(a) === coverPath(b) &&
        Boolean(a.playing) === Boolean(b.playing) && Boolean(a.onPrevious) === Boolean(b.onPrevious) &&
        Boolean(a.onNext) === Boolean(b.onNext);
}

function cover(activity, size, radius) {
    const bin = new St.Bin({
        style_class: 'islands-cover',
        width: size, height: size,
        style: `border-radius: ${radius}px;`,
        y_align: Clutter.ActorAlign.CENTER,
    });
    if (activity.cover instanceof Gio.FileIcon && activity.cover.get_file().get_path())
        bin.set_style(`border-radius: ${radius}px; background-image: url("${activity.cover.get_file().get_path()}"); background-size: cover;`);
    else
        bin.child = new St.Icon({icon_name: 'audio-x-generic-symbolic', icon_size: Math.round(size * 0.55)});
    return bin;
}

export const MEDIA = {
    compact(activity, pill, context) {
        const box = new St.BoxLayout({style_class: 'islands-media-compact', height: pill, x_expand: true});
        const art = Math.round(pill * 19 / 26);
        box.add_child(cover(activity, art, Math.round(art * 5 / 19)));
        box.add_child(new St.Widget({x_expand: true}));
        const level = new St.BoxLayout({style_class: 'islands-level', y_align: Clutter.ActorAlign.CENTER});
        const colour = coverColour(activity.cover) ?? ink.ink;
        // Bars at their tallest, scaled down: a tick asks for no layout.
        const tallest = Math.round(pill * Math.max(...WAVE));
        const bars = Array.from({length: BARS}, () => {
            const bar = new St.Widget({style_class: 'islands-level-bar', height: tallest,
                style: `background-color: ${colour};`, y_align: Clutter.ActorAlign.CENTER});
            bar.set_pivot_point(0.5, 0.5);
            level.add_child(bar);
            return bar;
        });
        // The level walks one point of the wave per WAVE_TICKS ticks and
        // glides between the points, so it sways rather than flickers at
        // the same frame rate.
        let step = 0;
        const draw = rest => {
            const at = step / WAVE_TICKS;
            const whole = Math.floor(at);
            const part = at - whole;
            bars.forEach((bar, i) => {
                const from = WAVE[(whole + i * 3) % WAVE.length];
                const to = WAVE[(whole + 1 + i * 3) % WAVE.length];
                const share = rest || !activity.playing ? 0.2 : from + (to - from) * part;
                bar.scale_y = Math.max(3, pill * share) / tallest;
            });
            step++;
        };
        draw(!activity.playing);
        box.add_child(level);
        const ticker = new Ticker(level, context, 'level', rest => draw(rest));
        ticker.poke(Boolean(activity.playing));
        return updatable(box, next => sameTrack(activity, next));
    },

    opened(activity, size, context) {
        const scale = size.width / 452;
        const box = new St.BoxLayout({
            style_class: 'islands-media-opened',
            orientation: Clutter.Orientation.VERTICAL,
            width: size.width, height: size.height,
        });
        const art = Math.round(62 * scale);
        box.add_child(row([
            cover(activity, art, Math.round(14 * scale)),
            column([
                label(activity.title, 'islands-opened-title'),
                label(activity.note, 'islands-opened-note'),
            ], {x_expand: true}),
        ], {style_class: 'islands-media-head'}));

        const elapsed = label('', 'islands-media-time');
        const left = label('', 'islands-media-time');
        const bar = new LevelBar({x_expand: true});
        let current = activity;
        const drawTime = () => {
            const position = current.positionAt?.() ?? current.position ?? 0;
            const length = current.length ?? 0;
            elapsed.text = trackTime(position);
            left.text = length > 0 ? `-${trackTime(Math.max(0, length - position))}` : '';
            bar.share = length > 0 ? position / length : 0;
        };
        drawTime();
        box.add_child(row([elapsed, bar.actor, left], {style_class: 'islands-media-progress'}));
        if (activity.playing) {
            const ticker = new Ticker(bar.actor, context, 'clock', () => drawTime());
            ticker.poke(true);
        }

        const controls = row([
            activity.onPrevious ? roundButton('media-skip-backward-symbolic', () => activity.onPrevious(), {size: 36, tone: 'plain', accessible: 'Previous'}) : null,
            roundButton(activity.playing ? 'media-playback-pause-symbolic' : 'media-playback-start-symbolic', () => activity.onPlay?.(),
                {size: 44, tone: 'plain', accessible: activity.playing ? 'Pause' : 'Play'}),
            activity.onNext ? roundButton('media-skip-forward-symbolic', () => activity.onNext(), {size: 36, tone: 'plain', accessible: 'Next'}) : null,
        ], {style_class: 'islands-media-controls', x_align: Clutter.ActorAlign.CENTER});
        box.add_child(controls);
        // A seek or a new length: the time follows in place.
        return updatable(box, next => {
            if (!sameTrack(activity, next))
                return false;
            current = next;
            drawTime();
            return true;
        });
    },
};
