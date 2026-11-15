// The island's state: what is going on, what shows, and how. Sources call
// set(activity) and remove(id); the pointer and the settings change how it
// shows. Every change works the state out again from plain values
// (lib/bubbles.js, lib/geometry.js, lib/alerts.js) and hands it to the
// view, which springs there. Nothing here runs while nothing changes: the
// only timeouts are a pending hover-open and the end of a short message.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
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
// In fullscreen the island floats this far below the edge (canvas F).
const FULLSCREEN_TOP = 6;

// Settings that switch a whole family of sources, besides the per-source
// switches in disabled-sources.
const FAMILY_KEYS = {osd: 'osd', notification: 'notifications', call: 'notifications'};

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
        this._powerListeners = new Set();
        this._lookListeners = new Set();
        this._hoverListeners = new Set();

        this.view = new IslandView({
            onClick: button => this._click(button),
            onHover: hovered => this._hover(hovered),
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
        const {main, waiting} = arrange(live, this._dismissed, this._focus);

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
            else if (this._expanded === main.id || (this._hoverOpen && settings.get_boolean('hover-open')))
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
        const shape = shapeFor(look, mode === 'idle' ? 'compact' : mode, pill, {duo});
        const compactWidth = shapeFor(main ? main.look ?? main.kind : 'idle', 'compact', pill, {duo}).width;
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
        const base = activity ? `${activity.id}:${mode}:${shape.width}:${look}` : key;
        return {frame, key, base, activity, mode, kind, slots, visible, pill, main, instant: Boolean(this._instant)};
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
        this._watchOutside(state.mode === 'opened' && !state.activity?.hint && state.activity?.id !== 'glance');
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
    // it, as on the Mac. The stage is watched only while it is open.
    _watchOutside(on) {
        if (on && !this._outsideId) {
            this._outsideId = global.stage.connect('captured-event', (_stage, event) => {
                if (event.type() !== Clutter.EventType.BUTTON_PRESS && event.type() !== Clutter.EventType.TOUCH_BEGIN)
                    return Clutter.EVENT_PROPAGATE;
                const [x, y] = event.get_coords();
                const target = global.stage.get_actor_at_pos(Clutter.PickMode.REACTIVE, x, y);
                if (target && (this.view.shape.contains(target) || this.view.bubbleActors.some(b => b.contains(target))))
                    return Clutter.EVENT_PROPAGATE;
                this._expanded = null;
                this._hoverOpen = false;
                this.update();
                return Clutter.EVENT_PROPAGATE;
            });
        } else if (!on && this._outsideId) {
            global.stage.disconnect(this._outsideId);
            this._outsideId = 0;
        }
    }

    // The pointer holds a message open that was open when it came; it
    // does not open one that has already shrunk (its buttons would move
    // away under the pointer).
    _holds(activity) {
        return this._hovered && this._held === activity.id;
    }

    // St keeps `hover` set while the island is hidden (Lantern grown out
    // of it) or while a modal grab holds the pointer (the quick note), so
    // it may still be set once the pointer has long gone. Before each
    // state the pointer is asked where it really is; a stale hover is
    // dropped and would otherwise flash the hover look or the glance.
    _checkHover() {
        if (!this._hovered || this.view.pointerInside())
            return;
        this._setHovered(false);
        this.view.clearHover();
    }

    _hover(hovered) {
        hovered = this.view.hovered || hovered;
        if (hovered === this._hovered)
            return;
        this._setHovered(hovered);
        this.update();
    }

    _setHovered(hovered) {
        this._hovered = hovered;
        const main = this._state?.main;
        this._held = hovered && this._state?.mode === 'opened' && (main?.hint || main?.opensFor) ? main.id : null;
        for (const callback of this._hoverListeners)
            callback(hovered);
        if (this._hoverId) {
            GLib.source_remove(this._hoverId);
            this._hoverId = 0;
        }
        this._hoverOpen = false;
        if (hovered && this._state?.main && this._settings.get_boolean('hover-open')) {
            this._hoverId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, HOVER_OPEN_MS, () => {
                this._hoverId = 0;
                this._hoverOpen = true;
                this.update();
                return GLib.SOURCE_REMOVE;
            });
        }
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
        this._expanded = this._expanded === main.id ? null : main.id;
        this.update();
    }

    _scroll(event) {
        const main = this._state?.main;
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
        for (const id of [this._hoverId, this._alertId]) {
            if (id)
                GLib.source_remove(id);
        }
        this._hoverId = this._alertId = 0;
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
