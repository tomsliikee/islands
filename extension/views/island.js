// The island on screen: one St shape that springs between its sizes, its
// content (a look) that fades when it changes, and the bubbles beside it.
// Every frame comes from a spring or a fade that is on its way; once all
// are at rest nothing here asks for a frame.

import Clutter from 'gi://Clutter';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {draggedAway} from '../lib/drag.js';
import {radiusAt} from '../lib/geometry.js';
import {overflowText} from '../lib/bubbles.js';
import {ShapeBlur} from './blur.js';
import {SPRINGS, expressive, spring, stopSprings} from './choreo.js';
import {iconOf, lookFor} from './looks/registry.js';

// Content fades only, never overshoots: out in 90 ms, in over
// 170 ms after 110 ms.
const FADE_OUT_MS = 90;
const FADE_IN_MS = 170;
const FADE_IN_DELAY_MS = 110;
const BUBBLE_FADE_MS = 160;
// A new bubble slides in from under the island by this much.
const BUBBLE_ENTER = 12;
// What an opened message's text does not have of the island's width
// (padding, icon, gaps, the time), and how many lines it unfolds to.
const TEXT_INSET = 150;
const MAX_LINES = 5;

function fade(actor, opacity, duration, delay = 0, onComplete = null) {
    actor.remove_transition('opacity');
    if (!expressive() || duration <= 0) {
        actor.opacity = opacity;
        onComplete?.();
        return;
    }
    actor.ease({opacity, duration, delay, mode: Clutter.AnimationMode.EASE_OUT_CUBIC, onComplete});
}

export class IslandView {
    // handlers: onClick(button), onDragAway(), onHover(hovered), onBubble(slot, button),
    // onScroll(event), context(activity) => what a look may use.
    constructor(handlers) {
        this._handlers = handlers;
        this._blurOn = false;
        this._maxRadius = 13;
        this._contentKey = null;
        this._content = null;
        this._bubbles = [];
        this._shown = true;

        // A plain group above the bar; it takes no input itself, only the
        // shapes in it do. It adds no strut: windows keep the bar's.
        this.group = new St.Widget({name: 'islands', reactive: false});
        Main.layoutManager.addChrome(this.group);

        this.shape = new St.Widget({
            name: 'islands-shape',
            style_class: 'islands-shape',
            reactive: true,
            track_hover: true,
            clip_to_allocation: true,
            layout_manager: new Clutter.BinLayout(),
        });
        this.group.add_child(this.shape);
        this.shape.connect('notify::hover', () => this._handlers.onHover?.(this.shape.hover));
        // St sends one notify::hover per enter. If that one came while the
        // pick missed the shape (mid-resize, or a hover cleared under the
        // pointer), nothing else would come until the pointer left and came
        // back. A motion over the shape is proof the pointer is on it.
        // A press that moves sideways by DRAG_AWAY_PX is a pull: on release
        // the island is put away, and the release is not a click.
        this._pressX = null;
        this._dragged = false;
        this.shape.connect('button-press-event', (_actor, event) => {
            if (event.get_button() === Clutter.BUTTON_PRIMARY) {
                this._pressX = event.get_coords()[0];
                this._dragged = false;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        this.shape.connect('motion-event', (_actor, event) => {
            if (this._pressX !== null && !this._dragged && draggedAway(this._pressX, event.get_coords()[0]))
                this._dragged = true;
            this._handlers.onMotion?.();
            return Clutter.EVENT_PROPAGATE;
        });
        this.shape.connect('button-release-event', (_actor, event) => {
            const dragged = this._dragged;
            this._pressX = null;
            this._dragged = false;
            if (dragged && event.get_button() === Clutter.BUTTON_PRIMARY)
                this._handlers.onDragAway?.();
            else
                this._handlers.onClick?.(event.get_button());
            return Clutter.EVENT_STOP;
        });
        this.shape.connect('scroll-event', (_actor, event) => {
            this._handlers.onScroll?.(event);
            return Clutter.EVENT_STOP;
        });
        this._blur = null;
    }

    get hovered() {
        return this.shape.hover || this._bubbles.some(bubble => bubble.actor.hover);
    }

    // Whether the pointer is over the shown island or a bubble now.
    pointerInside() {
        if (!this._shown || !this.shape.reactive)
            return false;
        const [x, y] = global.get_pointer();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        return Boolean(target) && (this.shape.contains(target) || this._bubbles.some(bubble => bubble.actor.contains(target)));
    }

    // The bubble's slot under the pointer, or null.
    bubbleAtPointer() {
        if (!this._shown)
            return null;
        const [x, y] = global.get_pointer();
        const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
        return this._bubbles.find(bubble => target && bubble.actor.contains(target))?.slot ?? null;
    }

    // How many lines (1 to max, 5 by default) a message's body takes in an opened
    // island of this width, measured with the opened look's own style.
    noteLines(text, width, max = MAX_LINES) {
        if (!this._measure) {
            this._measure = new St.Label({style_class: 'islands-opened-note', opacity: 0, reactive: false});
            this._measure.clutter_text.line_wrap = true;
            this._measure.set_position(-10000, -10000);
            this.group.add_child(this._measure);
        }
        const measure = this._measure;
        // The text's room in GENERIC.opened: the width less the padding,
        // the icon and the time beside it.
        const room = Math.max(80, width - TEXT_INSET);
        measure.text = 'X';
        const [, line] = measure.get_preferred_height(room);
        measure.text = text;
        const [, all] = measure.get_preferred_height(room);
        return Math.max(1, Math.min(max, Math.round(all / Math.max(1, line))));
    }

    // Forgets a hover St kept from before; the next enter sets it anew.
    clearHover() {
        this.shape.hover = false;
        for (const bubble of this._bubbles)
            bubble.actor.hover = false;
    }

    // Blur My Shell's blur behind the shape and the bubbles, or plain black.
    setBlur(on) {
        if (on === this._blurOn)
            return;
        this._blurOn = on;
        if (on) {
            this._blur = new ShapeBlur(this.group, this.shape, () => radiusAt(this.shape.height, this._maxRadius), face => {
                this._face = face ?? '';
                this._applyStyle();
            });
            for (const bubble of this._bubbles)
                this._blurBubble(bubble);
        } else {
            this._blur?.destroy();
            this._blur = null;
            for (const bubble of this._bubbles) {
                bubble.blur?.destroy();
                bubble.blur = null;
            }
        }
    }

    get blurred() {
        return Boolean(this._blur?.active);
    }

    // Shows a state:
    //   frame: {island: {x, y, width, height, radius}, bubbles: [{x, y, size}]}
    //   key: what the content shows (changes fade the content)
    //   activity, mode ('idle' | 'compact' | 'hover' | 'opened'), look kind,
    //   slots: the bubbles' contents, visible: whether the island shows.
    show({frame, key, base = key, activity, mode, kind, slots, visible, pill, motion = null, instant = false}) {
        const {island} = frame;
        const growing = island.width * island.height > this.shape.width * this.shape.height;
        const chosen = motion ?? (mode === 'hover' || this._mode === 'hover' ? SPRINGS.hover : growing ? SPRINGS.grow : SPRINGS.shrink);
        this._mode = mode;
        // The corners stay round while low and hold the larger radius of
        // the two shapes on the way.
        this._maxRadius = Math.max(island.radius, this._targetRadius ?? island.radius);
        this._targetRadius = island.radius;

        this._setVisible(visible, instant);
        this._setContent(key, base, activity, () => this._build(kind, mode, activity, island, pill));

        const first = this.shape.width === 0;
        const to = {x: island.x, y: island.y, width: island.width, height: island.height};
        // A hand-over (Lantern gives the island back) takes the shape of
        // the new state at once: the one it left with is the one Lantern
        // shrank into, and springing from there would show a second step.
        if (first || instant) {
            stopSprings(this.shape);
            this.shape.set_position(to.x, to.y);
            this.shape.set_size(to.width, to.height);
            this._maxRadius = island.radius;
            this._frame();
        } else {
            spring(this.shape, to, {spring: chosen, round: true, onFrame: () => this._frame(), onDone: () => {
                this._maxRadius = island.radius;
                this._frame();
            }});
        }
        // An opened island is wider than its place in the bar; the bubbles
        // step out of its way until it closes.
        this._showBubbles(frame.bubbles, slots, visible && mode !== 'opened', first);
    }

    _build(kind, mode, activity, island, pill) {
        if (mode === 'idle' || !activity)
            return null;
        const look = lookFor(kind === 'glance' ? 'glance' : activity.look ?? kind);
        const context = this._handlers.context?.(activity) ?? {activity};
        if (mode === 'opened')
            return look.opened(activity, {width: island.width, height: island.height}, context);
        const actor = look.compact(activity, pill, context);
        actor.width = island.width;
        return actor;
    }

    _setContent(key, base, activity, build) {
        if (key === this._contentKey)
            return;
        // The same look for the same activity at the same size: it takes the
        // change in place when it can, without a fade.
        if (base === this._contentBase && this._content?._islandsUpdate?.(activity)) {
            this._contentKey = key;
            return;
        }
        this._contentKey = key;
        this._contentBase = base;
        const old = this._content;
        if (old) {
            this._content = null;
            fade(old, 0, FADE_OUT_MS, 0, () => old.destroy());
        }
        const actor = build();
        if (!actor)
            return;
        actor.x_align = Clutter.ActorAlign.CENTER;
        actor.y_align = Clutter.ActorAlign.START;
        actor.opacity = 0;
        this.shape.add_child(actor);
        this._content = actor;
        fade(actor, 255, FADE_IN_MS, old ? FADE_IN_DELAY_MS : 0);
    }

    // What follows the shape's size on each frame of its spring.
    _frame() {
        this._syncRadius();
        this._blur?.follow();
    }

    _syncRadius() {
        const radius = radiusAt(this.shape.height, this._maxRadius);
        if (radius === this._radius)
            return;
        this._radius = radius;
        this._applyStyle();
    }

    // The shape's inline style: its radius now, and the blur's face.
    _applyStyle() {
        this.shape.set_style(`border-radius: ${this._radius ?? 0}px;${this._face ?? ''}`);
    }

    _blurBubble(bubble) {
        bubble.blur = new ShapeBlur(this.group, bubble.actor, () => bubble.actor.height / 2, face => {
            bubble.face = face ?? '';
            this._styleBubble(bubble);
        });
    }

    _styleBubble(bubble) {
        const radius = Math.floor((bubble.size ?? bubble.actor.height) / 2);
        const color = bubble.slot?.activity?.color ? ` color: ${bubble.slot.activity.color};` : '';
        bubble.actor.set_style(`border-radius: ${radius}px;${color}${bubble.face ?? ''}`);
    }

    _setVisible(visible, instant = false) {
        if (visible === this._shown)
            return;
        this._shown = visible;
        this.shape.reactive = visible;
        if (instant) {
            this.shape.remove_transition('opacity');
            this.shape.opacity = visible ? 255 : 0;
            this.shape.visible = visible;
            this._blur?.follow();
        } else if (visible) {
            this.shape.show();
            fade(this.shape, 255, FADE_IN_MS);
        } else {
            fade(this.shape, 0, FADE_IN_MS, 0, () => {
                if (!this._shown)
                    this.shape.hide();
            });
        }
    }

    _newBubble() {
        const actor = new St.Button({style_class: 'islands-bubble', reactive: true, track_hover: true, can_focus: false});
        actor.set_pivot_point(0.5, 0.5);
        const bubble = {actor, key: null, blur: null};
        actor.connect('clicked', (_button, button) => this._handlers.onBubble?.(bubble.slot, button));
        actor.connect('notify::hover', () => this._handlers.onHover?.(this.hovered));
        actor.connect('motion-event', () => {
            this._handlers.onMotion?.();
            return Clutter.EVENT_PROPAGATE;
        });
        this.group.add_child(actor);
        if (this._blurOn)
            this._blurBubble(bubble);
        return bubble;
    }

    _fillBubble(bubble, slot, size) {
        bubble.slot = slot;
        const key = slot.overflow ? `+${slot.overflow}` : `${slot.activity.id}:${slot.activity.icon}:${slot.activity.color}`;
        if (key === bubble.key && size === bubble.size)
            return;
        if (key !== bubble.key) {
            const gicon = slot.activity ? iconOf(slot.activity) : null;
            bubble.actor.child = slot.overflow || !gicon
                ? new St.Label({text: slot.overflow ? overflowText(slot.overflow) : '', y_align: Clutter.ActorAlign.CENTER})
                : new St.Icon({gicon, style_class: 'islands-bubble-icon'});
        }
        bubble.key = key;
        bubble.size = size;
        this._styleBubble(bubble);
    }

    _showBubbles(frames, slots, visible, first) {
        // Gone bubbles shrink away.
        while (this._bubbles.length > slots.length) {
            const bubble = this._bubbles.pop();
            this._dropBubble(bubble);
        }
        slots.forEach((slot, i) => {
            const at = frames[i];
            let bubble = this._bubbles[i];
            const fresh = !bubble;
            if (fresh) {
                bubble = this._newBubble();
                this._bubbles.push(bubble);
                bubble.actor.set_position(at.x - BUBBLE_ENTER, at.y);
                bubble.actor.set_size(at.size, at.size);
                bubble.actor.opacity = 0;
                bubble.actor.set_scale(0.6, 0.6);
                bubble.blur?.follow();
            }
            this._fillBubble(bubble, slot, at.size);
            bubble.actor.reactive = visible;
            // A bubble stepping aside under the pointer gets no leave.
            if (!visible)
                bubble.actor.hover = false;
            if (first) {
                bubble.actor.set_position(at.x, at.y);
                bubble.actor.set_size(at.size, at.size);
                bubble.blur?.follow();
            } else {
                spring(bubble.actor, {x: at.x, y: at.y, width: at.size, height: at.size},
                    {spring: SPRINGS.grow, round: true, onFrame: () => bubble.blur?.follow()});
            }
            if (fresh || visible !== bubble.visible) {
                bubble.visible = visible;
                spring(bubble.actor, {scale_x: visible ? 1 : 0.6, scale_y: visible ? 1 : 0.6}, {spring: SPRINGS.pop});
                fade(bubble.actor, visible ? 255 : 0, BUBBLE_FADE_MS, fresh ? FADE_IN_DELAY_MS : 0);
            }
        });
    }

    _dropBubble(bubble) {
        bubble.actor.reactive = false;
        stopSprings(bubble.actor);
        spring(bubble.actor, {scale_x: 0.6, scale_y: 0.6}, {spring: SPRINGS.leave});
        fade(bubble.actor, 0, BUBBLE_FADE_MS, 0, () => {
            bubble.blur?.destroy();
            bubble.actor.destroy();
        });
    }

    // For headless checks: the bubbles' actors.
    get bubbleActors() {
        return this._bubbles.map(bubble => bubble.actor);
    }

    destroy() {
        this._blur?.destroy();
        this._blur = null;
        for (const bubble of this._bubbles)
            bubble.blur?.destroy();
        this._bubbles = [];
        stopSprings(this.shape);
        this.group.destroy();
    }
}
