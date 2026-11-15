// The looks of short and lasting things that are mostly text: the volume
// and brightness level (canvas 300 x 26), a call with its answer and
// decline buttons (452 x 78, then compact with small buttons in the bar),
// a notification or alarm with buttons, a timer, and a recording.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {Ticker} from '../ticker.js';
import {LevelBar, column, icon, label, roundButton, row, textButton, updatable} from './parts.js';
import {GENERIC, iconOf} from './registry.js';

// Volume, brightness, microphone, keyboard light: icon, level, number.
// Without a level (caps lock, a muted output) the icon and a word.
export const OSD = {
    compact(activity, pill) {
        const box = new St.BoxLayout({style_class: 'islands-osd', height: pill, x_expand: true});
        const glyph = icon(activity.icon, 'islands-compact-icon');
        box.add_child(glyph);
        const levelled = typeof activity.share === 'number';
        let bar = null;
        let text;
        if (levelled) {
            bar = new LevelBar({x_expand: true, height: 5});
            bar.share = activity.share;
            box.add_child(bar.actor);
            text = label(activity.short ?? '', 'islands-osd-number');
        } else {
            text = label(activity.title ?? '', 'islands-compact-title', {x_expand: true});
            text.x_align = Clutter.ActorAlign.END;
        }
        box.add_child(text);
        // Held volume keys step the level in place, with no fade per step.
        return updatable(box, next => {
            if ((typeof next.share === 'number') !== levelled)
                return false;
            glyph.gicon = iconOf({icon: next.icon});
            if (levelled) {
                bar.share = next.share;
                text.text = next.short ?? '';
            } else {
                text.text = next.title ?? '';
            }
            return true;
        });
    },
    // Opened while one acts: the icon, what it is, and a wide level with
    // its number; without a level the icon and the word (Caps Lock on).
    opened(activity, size) {
        const glyph = icon(activity.icon, 'islands-opened-icon');
        const levelled = typeof activity.share === 'number';
        const name = label(levelled ? activity.name ?? '' : activity.title ?? '', 'islands-opened-title');
        let bar = null;
        let number = null;
        let body;
        if (levelled) {
            bar = new LevelBar({x_expand: true, height: 6});
            bar.share = activity.share;
            number = label(activity.short ?? '', 'islands-osd-number');
            body = column([name, row([bar.actor, number], {style_class: 'islands-osd-level'})], {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        } else {
            body = column([name], {x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        }
        const box = row([glyph, body], {style_class: 'islands-opened islands-osd-opened', width: size.width, height: size.height});
        return updatable(box, next => {
            if ((typeof next.share === 'number') !== levelled)
                return false;
            glyph.gicon = iconOf({icon: next.icon});
            if (levelled) {
                bar.share = next.share;
                number.text = next.short ?? '';
                name.text = next.name ?? '';
            } else {
                name.text = next.title ?? '';
            }
            return true;
        });
    },
};

function callButtons(activity, size) {
    const decline = activity.actions?.find(action => action.decline);
    const answer = activity.actions?.find(action => !action.decline);
    return [
        decline ? roundButton('call-stop-symbolic', () => activity.onAction?.(decline), {size, tone: 'down', accessible: decline.label}) : null,
        answer ? roundButton('call-start-symbolic', () => activity.onAction?.(answer), {size, tone: 'up', accessible: answer.label}) : null,
    ];
}

// A call: who calls and two round buttons. In the bar the buttons shrink
// to the pill's height, so it can be answered without opening anything.
export const CALL = {
    compact(activity, pill) {
        const small = Math.max(16, pill - 6);
        return row([
            label(activity.title, 'islands-compact-title', {x_expand: true}),
            ...callButtons(activity, small),
        ], {style_class: 'islands-call-compact', height: pill, x_expand: true});
    },
    opened(activity, size) {
        const avatar = new St.Bin({style_class: 'islands-avatar', y_align: Clutter.ActorAlign.CENTER});
        const gicon = iconOf(activity);
        avatar.child = gicon ? new St.Icon({gicon, style_class: 'islands-opened-icon'}) : label(activity.initials ?? '', 'islands-avatar-text');
        return row([
            avatar,
            column([label(activity.note, 'islands-opened-note'), label(activity.title, 'islands-opened-title')], {x_expand: true}),
            ...callButtons(activity, 44),
        ], {style_class: 'islands-call', width: size.width, height: size.height});
    },
};

// A notification or a ringing alarm with buttons: the text on top, the
// buttons below (up to three).
export const ACTIONS = {
    compact: GENERIC.compact,
    opened(activity, size) {
        // The buttons keep their row (54 of 132 on the canvas); the text
        // takes the rest, more when it is unfolded.
        const head = GENERIC.opened(activity, {width: size.width, height: size.height - Math.round(size.width * 54 / 452)});
        head.style_class = 'islands-opened islands-actions-head';
        const buttons = row((activity.actions ?? []).slice(0, 3).map(action => textButton(action.label, () => activity.onAction?.(action))),
            {style_class: 'islands-actions-row', x_expand: true});
        return column([head, buttons], {width: size.width, height: size.height, y_align: Clutter.ActorAlign.START});
    },
};

// A running timer or stopwatch: icon and time in the bar, in the timer's
// colour; the time counts once a second while it shows.
export const TIMER = {
    compact(activity, pill, context) {
        const time = label(activity.timeAt?.() ?? activity.short ?? '', 'islands-compact-title', {x_expand: true});
        time.x_align = Clutter.ActorAlign.END;
        const box = row([icon(activity.icon, 'islands-compact-icon'), time], {style_class: 'islands-compact', height: pill, x_expand: true});
        if (activity.color)
            box.set_style(`color: ${activity.color};`);
        if (activity.timeAt)
            new Ticker(time, context, 'clock', () => {
                time.text = activity.timeAt();
            }).poke(true);
        return box;
    },
    opened(activity, size, context) {
        const time = label(activity.timeAt?.() ?? activity.short ?? '', 'islands-timer-big');
        const bar = new LevelBar({x_expand: true, height: 5});
        bar.share = activity.progressAt?.() ?? 0;
        const box = column([
            row([icon(activity.icon, 'islands-compact-icon'), label(activity.title, 'islands-opened-note', {x_expand: true}), time], {style_class: 'islands-timer-head'}),
            typeof activity.progressAt === 'function' ? bar.actor : null,
        ], {style_class: 'islands-timer-opened', width: size.width, height: size.height});
        if (activity.color)
            time.set_style(`color: ${activity.color};`);
        if (activity.timeAt)
            new Ticker(time, context, 'clock', () => {
                time.text = activity.timeAt();
                bar.share = activity.progressAt?.() ?? 0;
            }).poke(true);
        return box;
    },
};

// Charging and battery words: what it is on the left, the percent on the
// right, in the colour of the state (canvas: 270 x 26).
export const BATTERY = {
    compact(activity, pill) {
        const percent = label(activity.short ?? '', 'islands-compact-title');
        const glyph = icon(activity.icon, 'islands-compact-icon');
        const title = label(activity.title, 'islands-compact-title', {x_expand: true});
        const box = row([glyph, title, percent], {style_class: 'islands-battery', height: pill, x_expand: true});
        const colour = next => box.set_style(next.color ? `color: ${next.color};` : null);
        colour(activity);
        return updatable(box, next => {
            glyph.gicon = iconOf({icon: next.icon});
            title.text = next.title ?? '';
            percent.text = next.short ?? '';
            colour(next);
            return true;
        });
    },
    opened: GENERIC.opened,
};

// The glance on hover while nothing goes on: one line per thing worth a
// look (the next event, the phone, Claude's limits, the machine).
export const GLANCE = {
    compact: GENERIC.compact,
    opened(activity, size) {
        const rows = (activity.items ?? []).map((item, i) => row([
            icon(item.icon, 'islands-glance-icon'),
            label(item.text, i === 0 ? 'islands-glance-first' : 'islands-glance-line', {x_expand: true}),
        ], {style_class: 'islands-glance-row'}));
        return column(rows, {style_class: 'islands-glance', width: size.width, height: size.height});
    },
};

// A line to type a quick note into. The island holds the keyboard while it
// is open (a modal grab on the note); Enter saves, Esc or a press outside
// leaves.
export const NOTE = {
    compact: GENERIC.compact,
    opened(activity, size) {
        const entry = new St.Entry({style_class: 'islands-note-entry', hint_text: 'Note for the inbox', x_expand: true, can_focus: true,
            y_align: Clutter.ActorAlign.CENTER});
        const box = row([icon(activity.icon, 'islands-compact-icon'), entry],
            {style_class: 'islands-note', width: size.width, height: size.height, reactive: true});
        let grab = null;
        let done = false;
        const finish = save => {
            if (done)
                return;
            done = true;
            if (grab) {
                Main.popModal(grab);
                grab = null;
            }
            if (save)
                activity.onSave?.(entry.text);
            else
                activity.onCancel?.();
        };
        entry.clutter_text.connect('activate', () => finish(true));
        entry.clutter_text.connect('key-press-event', (_actor, event) => {
            if (event.get_key_symbol() !== Clutter.KEY_Escape)
                return Clutter.EVENT_PROPAGATE;
            finish(false);
            return Clutter.EVENT_STOP;
        });
        box.connect('button-press-event', (_actor, event) => {
            const [x, y] = event.get_coords();
            const [bx, by] = box.get_transformed_position();
            const [bw, bh] = box.get_transformed_size();
            if (x < bx || y < by || x > bx + bw || y > by + bh)
                finish(false);
            return Clutter.EVENT_PROPAGATE;
        });
        box.connect('notify::mapped', () => {
            if (box.mapped && !grab && !done) {
                grab = Main.pushModal(box);
                entry.grab_key_focus();
            }
        });
        box.connect('destroy', () => {
            if (grab) {
                Main.popModal(grab);
                grab = null;
            }
        });
        return box;
    },
};
