// The island's state: what is going on, what shows, and how. Sources call
// set(activity) and remove(id); the pointer and the settings change how it
// shows. Every change works the state out again from plain values
// (lib/bubbles.js, lib/geometry.js, lib/alerts.js) and hands it to the
// view, which springs there. Nothing here runs while nothing changes: the
// only timeouts are a pending hover-open and the end of a short message.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {alertState, nextCheck} from './lib/alerts.js';
import {arrange, bubbleSlots} from './lib/bubbles.js';
import {layout, pillHeight, shapeFor} from './lib/geometry.js';
import {accumulate, scrollIntent} from './lib/rank.js';
import {motionOn} from './lib/power.js';
import {setMotion} from './views/choreo.js';
import {IslandView} from './views/island.js';

// The canvas' setting "open on hover": after 400 ms without a click.
const HOVER_OPEN_MS = 400;
// The pointer may be off the island this long before it counts as gone: a
// shape on its way between sizes is not under it for a moment.
const LEAVE_GRACE_MS = 160;
// A touchpad swipe up by this much (Clutter's scroll units, about 10 px
// each) sends away what is opened.
const SWIPE_AWAY = 3;
// In fullscreen the island floats this far below the edge (canvas F).
const FULLSCREEN_TOP = 6;

// Settings that switch a whole family of sources, besides the per-source
// switches in disabled-sources.
const FAMILY_KEYS = {osd: 'osd', notification: 'notifications', call: 'notifications'};

// Looks whose text the pointer unfolds (geometry.js grows them by lines).
const FULL_TEXT = new Set(['notification', 'actions', 'alarm']);

export class Island {
    // settings: Gio.Settings of org.gnome.shell.extensions.islands;
    // actions: {openIdle(rect), secondaryIdle()} for a click and a right
    // click on the empty island;
    // battery: an object with `onBattery` and connect('changed').
    constructor(settings, actions = {}, battery = null) {
        this._settings = settings;
        this._actions = actions;
        this._battery = battery;
        this._activities = new Map();
        this._dismissed = new Set();
        this._focus = null;
        this._expanded = null;
        this._hovered = false;
        this._hoverOpen = false;
        this._hoverId = 0;
        this._alertId = 0;
        this._glance = null;
        this._hidden = false;
        this._scrollSum = 0;
        this._outsideId = 0;
        this._grab = null;
        this._leaveId = 0;
        this._peek = null;
        this._peekId = 0;
        this._peekWanted = null;
        this._hoverSuppressed = false;
        this._swipe = 0;
        this._swiped = false;
        this._swipeAt = 0;
        this._touchpad = new Gio.Settings({schema_id: 'org.gnome.desktop.peripherals.touchpad'});
        this._powerListeners = new Set();
        this._lookListeners = new Set();
        this._hoverListeners = new Set();

        this.view = new IslandView({
            onClick: button => this._click(button),
            onHover: hovered => this._hover(hovered),
            onMotion: () => this._motion(),
            onBubble: (slot, button) => this._bubble(slot, button),
            onScroll: event => this._scroll(event),
            context: activity => this._context(activity),
        });

        this._settingsId = settings.connect('changed', () => this.update());
        this._interface = St.Settings.get();
        this._animationsId = this._interface.connect('notify::enable-animations', () => this.update());
        this._batteryId = battery?.connect('changed', () => this.update()) ?? 0;
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this.update());
        this._panelId = Main.panel.connect('notify::height', () => this.update());
        this._fullscreenId = global.display.connect('in-fullscreen-changed', () => this.update());
        this._overviewIds = ['showing', 'hidden'].map(signal => Main.overview.connect(signal, () => this.update()));
        this.update();
    }

    // A source's activity: {id, kind, at, hint?, title, short?, note?, icon?,
    // color?, lasting?, sticky?, duration?, source?, onActivate?(),
    // onExpire?(), onDismiss?(), onScroll?(steps)} plus what its look reads.
    // The same id replaces what was there.
    set(activity) {
        const before = this._activities.get(activity.id);
        // An updated message keeps its time; a new one starts its own.
        const at = activity.at ?? (activity.hint && before ? before.at : Date.now());
        this._activities.set(activity.id, {...activity, at});
        this.update();
    }

    remove(id) {
        if (!this._activities.delete(id))
            return;
        this._forget(id);
        this.update();
    }

    has(id) {
        return this._activities.has(id);
    }

    // Opens an activity below the bar, as a click on it would.
    open(id) {
        this._expanded = id;
        this.update();
    }

    // The id of what is opened below the bar, or null.
    get expanded() {
        return this._state?.mode === 'opened' ? this._state.activity?.id ?? null : null;
    }

    get activities() {
        return [...this._activities.values()];
    }

    // Whether a source (by name, as in disabled-sources) may show.
    allows(source) {
        const key = FAMILY_KEYS[source];
        if (key && !this._settings.get_boolean(key))
            return false;
        return !this._settings.get_strv('disabled-sources').includes(source);
    }

    // Called with no arguments whenever what shows changes (for sources
    // that tick only while their opened look is seen). Returns a remover.
    onLook(callback) {
        this._lookListeners.add(callback);
        return () => this._lookListeners.delete(callback);
    }

    // What the island shows on hover while nothing goes on: a provider
    // () => {items: [{icon, text}]} or null.
    setGlance(provider) {
        this._glance = provider;
        this.update();
    }

    // Hides the whole island for a while (Lantern grown out of it).
    // instant: no fade, for a hand-over where something else takes its
    // place in the same frame.
    setHidden(hidden, {instant = false} = {}) {
        this._hidden = hidden;
        this._instant = instant;
        this.update();
        this._instant = false;
    }

    // Whether the island shows now (not hidden, not in the overview...).
    get shown() {
        return Boolean(this._state?.visible);
    }

    // The island's rectangle now, for what grows out of it.
    get rect() {
        const {x, y, width, height} = this.view.shape;
        return {x, y, width, height};
    }

    // The empty island at rest in the bar: what Lantern shrinks into when
    // the pointer has left (the island is grown under it while it is
    // asked, and would otherwise shrink a second time on the way back).
    get restRect() {
        const {x, y, width, height} = this._state?.rest ?? this.rect;
        return {x, y, width, height};
    }

    // What looks may spend now (lib/power.js reads it).
    get power() {
        const settings = this._settings;
        return {
            visible: Boolean(this._state?.visible),
            fullscreen: Boolean(this._fullscreen),
            onBattery: Boolean(this._battery?.onBattery),
            calm: settings.get_boolean('calm-on-battery'),
            animations: this._interface.enable_animations,
            levelAnimation: settings.get_boolean('level-animation'),
        };
    }

    // Called with true when the pointer comes onto the island (or its
    // bubbles) and false when it leaves. Returns a remover.
    onHover(callback) {
        this._hoverListeners.add(callback);
        return () => this._hoverListeners.delete(callback);
    }

    // Looks follow the power state through this.
    onPower(callback) {
        this._powerListeners.add(callback);
        return () => this._powerListeners.delete(callback);
    }

    _context(activity) {
        return {
            activity,
            power: () => this.power,
            onPower: callback => this.onPower(callback),
            remove: () => this.remove(activity.id),
        };
    }

    _forget(id) {
        this._dismissed.delete(id);
        if (this._expanded === id)
            this._expanded = null;
        if (this._focus === id)
            this._focus = null;
        if (this._peek === id)
            this._peek = null;
    }

    // The state as plain values, worked out from what goes on now.
    state(now = Date.now()) {
        const settings = this._settings;
        const monitor = Main.layoutManager.primaryMonitor;
        const bar = Main.panel.height || 32;
        const pill = pillHeight(bar, settings.get_string('size'));
        const length = settings.get_string('alert-length');

        // Short messages whose time is over leave.
        for (const activity of [...this._activities.values()]) {
            if (activity.hint && alertState(activity, now, {length, hovered: this._holds(activity)}) === 'gone') {
                this._activities.delete(activity.id);
                this._forget(activity.id);
                activity.onExpire?.();
            }
        }
        const live = this.activities.filter(activity => this.allows(activity.source ?? activity.kind));
        // A bubble under the pointer shows its activity for as long as the
        // pointer stays (a peek); it does not take the island's place.
        const peek = this._hovered && this._peek && live.some(activity => activity.id === this._peek) ? this._peek : null;
        const dismissed = peek ? new Set([...this._dismissed].filter(id => id !== peek)) : this._dismissed;
        const {main, waiting} = arrange(live, dismissed, peek ?? this._focus);

        let mode = 'idle';
        let kind = 'idle';
        let activity = main;
        if (main) {
            kind = main.kind;
            // A message, or something lasting that opens when it comes (a
            // ringing call, an alarm), is opened while its time runs.
            const timed = main.hint || main.opensFor
                ? alertState({...main, lasting: main.lasting || !main.hint}, now, {length, hovered: this._holds(main)})
                : null;
            if (timed === 'opened' || main.hint)
                mode = timed;
            else if (this._expanded === main.id || main.id === peek
                || (this._hoverOpen && !this._hoverSuppressed && settings.get_boolean('hover-open')))
                mode = 'opened';
            else
                mode = 'compact';
        } else if (this._hovered) {
            const glance = settings.get_boolean('hover-glance') ? this._glance?.() : null;
            if (glance?.items?.length) {
                const lines = Math.min(5, glance.items.length);
                activity = {id: 'glance', kind: 'glance', look: lines === 2 ? 'glance' : `glance${lines}`,
                    items: glance.items.slice(0, lines), key: glance.items.map(item => item.text).join('|')};
                kind = 'glance';
                mode = 'opened';
            } else {
                mode = 'hover';
            }
        }

        this._fullscreen = monitor?.inFullscreen ?? false;
        const fullscreenMode = settings.get_string('fullscreen');
        let visible = !this._hidden && !Main.overview.visible && !Main.sessionMode.isLocked;
        if (mode === 'idle' && settings.get_string('idle') === 'hidden')
            visible = false;
        if (this._fullscreen && (fullscreenMode === 'off' || !main))
            visible = false;

        const slots = bubbleSlots(waiting, settings.get_int('bubbles'));
        const duo = slots.length > 0;
        // A source may pick a look of another size (a notification with
        // buttons is taller than one without).
        const look = activity ? activity.look ?? kind : 'idle';
        // A message the pointer holds shows its whole text: the island
        // grows by the lines its body needs.
        const lines = mode === 'opened' && activity && this._holds(activity) && activity.note && FULL_TEXT.has(look)
            ? this.view.noteLines(activity.note, shapeFor(look, 'opened', pill).width)
            : 1;
        const shape = shapeFor(look, mode === 'idle' ? 'compact' : mode, pill, {duo, lines});
        const compactWidth = shapeFor(main ? main.look ?? main.kind : 'idle', 'compact', pill, {duo}).width;
        const place = at => layout({
            monitor: monitor ?? {x: 0, y: 0, width: 1280},
            bar, pill, shape: at, compactWidth,
            bubbles: slots.length,
            top: this._fullscreen ? FULLSCREEN_TOP : null,
        }).island;
        const rest = place(shapeFor('idle', 'compact', pill, {duo}));
        const frame = layout({
            monitor: monitor ?? {x: 0, y: 0, width: 1280},
            bar, pill, shape, compactWidth,
            bubbles: slots.length,
            top: this._fullscreen ? FULLSCREEN_TOP : null,
        });
        // The content is built for one size; a new size or new content
        // builds it anew. A source's `key` names what its look shows.
        const key = activity
            ? `${activity.id}:${mode}:${shape.width}:${activity.key ?? `${activity.title}:${activity.note}:${activity.short}:${activity.icon}`}`
            : `idle:${mode}`;
        // What the content is built as: a look may take a new key in place
        // while this stays the same.
        const base = activity ? `${activity.id}:${mode}:${shape.width}:${shape.height}:${look}` : key;
        const shown = lines > 1 ? {...activity, fullText: true} : activity;
        return {frame, rest, key: `${key}:${lines}`, base, activity: shown, mode, kind, slots, visible, pill, main, peek, instant: Boolean(this._instant)};
    }

    update() {
        this._checkHover();
        const now = Date.now();
        const before = this._state;
        const state = this.state(now);
        this._state = state;
        setMotion({expressiveMotion: motionOn({
            animations: this._interface.enable_animations,
            onBattery: Boolean(this._battery?.onBattery),
            calm: this._settings.get_boolean('calm-on-battery'),
        }), motionSpeed: 'normal'});
        this.view.setBlur(this._settings.get_string('style') === 'auto');
        this.view.show(state);
        this._scheduleAlert(now);
        // Opened by a click (pinned), not by the pointer or a message.
        const look = state.activity?.look ?? state.kind;
        this._watchOutside(state.visible && state.mode === 'opened' && this._expanded === state.main?.id
            && !state.activity?.hint && look !== 'note' && state.activity?.id !== 'glance');
        for (const callback of this._powerListeners)
            callback();
        if (before?.key !== state.key || before?.mode !== state.mode) {
            for (const callback of this._lookListeners)
                callback();
        }
    }

    // One timeout for the next short message to end, none otherwise.
    _scheduleAlert(now) {
        if (this._alertId) {
            GLib.source_remove(this._alertId);
            this._alertId = 0;
        }
        const length = this._settings.get_string('alert-length');
        const waits = this.activities.filter(activity => activity.hint || activity.opensFor)
            .map(activity => nextCheck(activity, now, {length, hovered: this._holds(activity)}))
            .filter(ms => ms !== null);
        if (waits.length === 0)
            return;
        this._alertId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, Math.min(...waits)), () => {
            this._alertId = 0;
            this.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    // While an activity is opened by a click, a press anywhere else closes
    // it, as on the Mac. A press on a window goes to the window without
    // the stage seeing it, so the island holds the input while it is
    // pinned open, as GNOME's menus do: the press outside closes it and
    // goes nowhere else; Esc closes it too.
    _watchOutside(on) {
        if (on && !this._outsideId) {
            try {
                this._grab = Main.pushModal(this.view.group, {actionMode: Shell.ActionMode.POPUP});
            } catch (error) {
                this._grab = null;
                console.warn(`Islands: no modal grab: ${error.message}`);
            }
            // Under the grab a press goes to the island's group alone, a
            // key to the stage.
            this._outsideOn = this._grab ? [this.view.group, global.stage] : [global.stage];
            this._outsideId = 1;
            this._outsideIds = this._outsideOn.map(actor => actor.connect('captured-event', (_actor, event) => {
                const type = event.type();
                if (type === Clutter.EventType.KEY_PRESS && event.get_key_symbol() === Clutter.KEY_Escape) {
                    this._close();
                    return Clutter.EVENT_STOP;
                }
                if (type !== Clutter.EventType.BUTTON_PRESS && type !== Clutter.EventType.TOUCH_BEGIN)
                    return Clutter.EVENT_PROPAGATE;
                const [x, y] = event.get_coords();
                const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
                if (target && (this.view.shape.contains(target) || this.view.bubbleActors.some(b => b.contains(target))))
                    return Clutter.EVENT_PROPAGATE;
                this._close();
                return this._grab ? Clutter.EVENT_STOP : Clutter.EVENT_PROPAGATE;
            }));
        } else if (!on && this._outsideId) {
            this._outsideOn.forEach((actor, i) => actor.disconnect(this._outsideIds[i]));
            this._outsideId = 0;
            this._outsideOn = null;
            this._outsideIds = null;
            if (this._grab)
                Main.popModal(this._grab);
            this._grab = null;
        }
    }

    // Closes what is opened, and keeps the pointer from opening it again
    // until it has left.
    _close() {
        this._expanded = null;
        this._hoverOpen = false;
        this._peek = null;
        this._hoverSuppressed = this._hovered;
        this._clearTimeouts(['_hoverId', '_peekId']);
        this.update();
    }

    _clearTimeouts(names) {
        for (const name of names) {
            if (this[name])
                GLib.source_remove(this[name]);
            this[name] = 0;
        }
    }

    // The pointer holds a message open, also one that had shrunk already
    // (it opens again after HOVER_OPEN_MS, so a pointer on its way past
    // does not move buttons under itself).
    _holds(activity) {
        return this._hovered && this._held === activity.id;
    }

    // St keeps `hover` set while the island is hidden (Lantern grown out
    // of it), while a modal grab holds the pointer (the quick note), or on
    // a bubble that stepped aside under the pointer, so it may still be set
    // once the pointer has long gone. Before each state the pointer is
    // asked where it really is; a stale hover is dropped and would
    // otherwise flash the hover look or the glance, or keep it open.
    _checkHover() {
        if (!this._hovered || this._leaveId || this.view.pointerInside())
            return;
        // Still where the shown island is heading (on its way to a new
        // size): not gone yet.
        const to = this._state?.visible ? this._state.frame.island : null;
        const [x, y] = global.get_pointer();
        if (to && x >= to.x && x < to.x + to.width && y >= to.y && y < to.y + to.height)
            return;
        this._setHovered(false);
        this.view.clearHover();
    }

    // St's hover flags only say that something changed; where the pointer
    // is comes from the pointer itself. Leaving waits LEAVE_GRACE_MS, so a
    // shape on its way to a new size does not lose the pointer in between.
    _hover(_hovered) {
        const inside = this.view.pointerInside();
        this._wantPeek(inside ? this.view.bubbleAtPointer() : null);
        if (inside) {
            this._clearTimeouts(['_leaveId']);
            if (!this._hovered) {
                this._setHovered(true);
                this.update();
            }
            return;
        }
        if (!this._hovered || this._leaveId)
            return;
        this._leaveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, LEAVE_GRACE_MS, () => {
            this._leaveId = 0;
            if (!this.view.pointerInside()) {
                this._setHovered(false);
                this.view.clearHover();
                this.update();
            }
            return GLib.SOURCE_REMOVE;
        });
    }

    // The pointer moves over the island or a bubble: Clutter picked it there,
    // so it is inside, whatever the one enter before said. Only acts when
    // the hover was missed or a leave is pending; otherwise free.
    _motion() {
        if (this._hovered && !this._leaveId)
            return;
        this._clearTimeouts(['_leaveId']);
        this._wantPeek(this.view.bubbleAtPointer());
        if (!this._hovered) {
            this._setHovered(true);
            this.update();
        }
    }

    // A bubble under the pointer: its activity shows after HOVER_OPEN_MS.
    _wantPeek(slot) {
        const id = slot?.activity?.id ?? null;
        if (id === this._peekWanted)
            return;
        this._peekWanted = id;
        this._clearTimeouts(['_peekId']);
        if (!id || id === this._peek)
            return;
        this._peekId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_MS, () => {
            this._peekId = 0;
            this._peek = id;
            this.update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _setHovered(hovered) {
        this._hovered = hovered;
        const main = this._state?.main;
        const timed = Boolean(main && (main.hint || main.opensFor));
        this._held = hovered && timed && this._state?.mode === 'opened' ? main.id : null;
        for (const callback of this._hoverListeners)
            callback(hovered);
        this._clearTimeouts(['_hoverId']);
        this._hoverOpen = false;
        if (!hovered) {
            this._hoverSuppressed = false;
            this._peek = null;
            this._peekWanted = null;
            this._clearTimeouts(['_peekId', '_leaveId']);
            return;
        }
        // A message that had shrunk opens again; a lasting activity opens
        // when "open on hover" is on.
        const reopen = timed && !this._held;
        if (main && !this._hoverSuppressed && (reopen || this._settings.get_boolean('hover-open'))) {
            this._hoverId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_MS, () => {
                this._hoverId = 0;
                this._hoverOpen = true;
                const now = this._state?.main;
                if (now && (now.hint || now.opensFor) && this._activities.has(now.id))
                    this._held = now.id;
                this.update();
                return GLib.SOURCE_REMOVE;
            });
        }
    }

    // What is opened goes away: a message for good (as a right click), a
    // ringing call or a new use of the microphone back to the bar, a
    // lasting activity back to its compact form.
    _sendAway(main) {
        if (main.hint) {
            this._activities.delete(main.id);
            this._forget(main.id);
            main.onDismiss?.();
        } else if (main.opensFor) {
            this._activities.set(main.id, {...main, at: 0});
        }
        this._held = null;
        this._close();
    }

    _click(button) {
        const main = this._state?.main;
        // Right click: what lasts steps aside into a bubble; a message goes.
        if (button === Clutter.BUTTON_SECONDARY && main) {
            if (main.hint)
                this._activities.delete(main.id);
            else
                this._dismissed.add(main.id);
            this._expanded = null;
            this._peek = null;
            main.onDismiss?.();
            this.update();
            return;
        }
        if (!main) {
            if (button === Clutter.BUTTON_SECONDARY)
                this._actions.secondaryIdle?.();
            else
                this._actions.openIdle?.(this.rect);
            return;
        }
        if (main.hint) {
            main.onActivate?.();
            if (!main.lasting) {
                this._activities.delete(main.id);
                this._forget(main.id);
            }
            this.update();
            return;
        }
        // The middle button always opens the activity below the bar.
        if (button !== Clutter.BUTTON_MIDDLE && this._settings.get_string('click') === 'app' && main.onActivate) {
            main.onActivate();
            return;
        }
        // Opened by the pointer (or a peek at a bubble): a click pins it
        // open, and a peeked bubble takes the island's place. Pinned: a
        // click closes it, and it stays closed under the pointer.
        if (this._expanded === main.id) {
            this._close();
            return;
        }
        if (this._peek === main.id) {
            this._focus = main.id;
            this._peek = null;
        }
        this._expanded = main.id;
        this.update();
    }

    _scroll(event) {
        const main = this._state?.main;
        if (main && this._state.mode === 'opened' && this._swipes(event, main))
            return;
        if (!main?.onScroll)
            return;
        const direction = event.get_scroll_direction();
        let dx = 0;
        let dy = 0;
        if (direction === Clutter.ScrollDirection.SMOOTH)
            [dx, dy] = event.get_scroll_delta();
        else
            dy = {[Clutter.ScrollDirection.UP]: -1, [Clutter.ScrollDirection.DOWN]: 1}[direction] ?? 0;
        const intent = scrollIntent(dx, dy, (event.get_state() & Clutter.ModifierType.SHIFT_MASK) !== 0);
        if (intent.axis !== 'y')
            return;
        const {sum, steps} = accumulate(this._scrollSum, intent.amount);
        this._scrollSum = sum;
        if (steps !== 0)
            main.onScroll(steps);
    }

    // Two fingers on the touchpad over what is opened: swiped up, it goes
    // (once per swipe). Wheels and the compact island scroll as before.
    // Returns whether the event was a touchpad swipe.
    _swipes(event, main) {
        if (event.get_scroll_direction() !== Clutter.ScrollDirection.SMOOTH)
            return false;
        const finger = event.get_scroll_source?.() === Clutter.ScrollSource.FINGER
            || event.get_source_device?.()?.get_device_type?.() === Clutter.InputDeviceType.TOUCHPAD_DEVICE;
        if (!finger)
            return false;
        const now = GLib.get_monotonic_time();
        // A pause starts a new swipe.
        if (now - this._swipeAt > 300000) {
            this._swipe = 0;
            this._swiped = false;
        }
        this._swipeAt = now;
        const [, dy] = event.get_scroll_delta();
        // With natural scrolling the content follows the fingers: fingers
        // up scroll down (dy > 0).
        this._swipe += this._touchpad.get_boolean('natural-scroll') ? dy : -dy;
        if (!this._swiped && this._swipe >= SWIPE_AWAY) {
            this._swiped = true;
            this._sendAway(main);
        }
        if (event.get_scroll_finish_flags?.() & Clutter.ScrollFinishFlags.VERTICAL) {
            this._swipe = 0;
            this._swiped = false;
        }
        return true;
    }

    _bubble(slot, button) {
        if (slot?.overflow) {
            // The first hidden by the overflow comes forward.
            const {waiting} = arrange(this.activities, this._dismissed, this._focus);
            const limit = this._settings.get_int('bubbles');
            slot = {activity: waiting[Math.max(0, limit - 1)]};
        }
        const activity = slot?.activity;
        if (!activity)
            return;
        if (button === Clutter.BUTTON_SECONDARY) {
            this._dismissed.add(activity.id);
        } else {
            this._dismissed.delete(activity.id);
            this._focus = activity.id;
            this._expanded = null;
        }
        this.update();
    }

    destroy() {
        this._clearTimeouts(['_hoverId', '_alertId', '_leaveId', '_peekId']);
        this._watchOutside(false);
        this._settings.disconnect(this._settingsId);
        this._interface.disconnect(this._animationsId);
        if (this._batteryId)
            this._battery.disconnect(this._batteryId);
        Main.layoutManager.disconnect(this._monitorsId);
        Main.panel.disconnect(this._panelId);
        global.display.disconnect(this._fullscreenId);
        for (const id of this._overviewIds)
            Main.overview.disconnect(id);
        this._powerListeners.clear();
        this._lookListeners.clear();
        this._hoverListeners.clear();
        this.view.destroy();
        this._activities.clear();
    }
}
