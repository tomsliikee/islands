// A tick for what moves while it shows (a music level, a spinner, a clock
// that counts): a GLib timeout at the rate lib/power.js allows, which
// exists only while the actor is mapped, the island can be seen and the
// power rules let it run. A level stops STILL_MS after its last change.

import GLib from 'gi://GLib';

import {STILL_MS, tickMs, tickRate} from '../lib/power.js';

export class Ticker {
    // actor: what shows the tick; context: the look's context (power(),
    // onPower()); kind: 'level' | 'spinner' | 'clock'; onTick(): draws.
    // A clock ticks once a second whatever the power says, while it shows.
    constructor(actor, context, kind, onTick) {
        this._actor = actor;
        this._context = context;
        this._kind = kind;
        this._onTick = onTick;
        this._id = 0;
        this._ms = null;
        this._changedAt = Date.now();
        this._running = true;
        this._unpower = context.onPower?.(() => this.sync()) ?? null;
        this._mapId = actor.connect('notify::mapped', () => this.sync());
        actor.connect('destroy', () => this.destroy());
        this.sync();
    }

    // What it shows changed (a new track, play pressed): it may move again.
    poke(running = this._running) {
        this._running = running;
        this._changedAt = Date.now();
        this.sync();
    }

    _wanted() {
        if (!this._actor || !this._actor.mapped || !this._running)
            return null;
        const power = this._context.power?.() ?? {};
        if (this._kind === 'clock')
            return power.visible === false ? null : 1000;
        return tickMs(tickRate({...power, kind: this._kind, still: Date.now() - this._changedAt}));
    }

    sync() {
        const ms = this._wanted();
        if (ms === this._ms)
            return;
        if (this._id)
            GLib.source_remove(this._id);
        this._id = 0;
        this._ms = ms;
        if (ms === null)
            return;
        const tick = () => {
            this._onTick();
            // A level rests once it has moved long enough without news.
            if (this._kind !== 'clock' && Date.now() - this._changedAt >= STILL_MS) {
                this._id = 0;
                this._ms = null;
                this._onTick(true);
                return GLib.SOURCE_REMOVE;
            }
            return GLib.SOURCE_CONTINUE;
        };
        // A clock shows whole seconds: GLib's second timer wakes together
        // with the other second timers of the session instead of on its own.
        this._id = this._kind === 'clock'
            ? GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, Math.round(ms / 1000), tick)
            : GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, tick);
    }

    destroy() {
        if (this._id)
            GLib.source_remove(this._id);
        this._id = 0;
        this._unpower?.();
        this._unpower = null;
        if (this._mapId && this._actor)
            this._actor.disconnect(this._mapId);
        this._mapId = 0;
        this._actor = null;
    }
}
