// The timer, the stopwatch and the pomodoro shared with Ledge and Halo
// (from Halo's sources/timer.js): the one that runs stays in the island
// with its time, and its end is told with a sound and a short message.
// GNOME Clocks keeps its running timers to itself (its settings hold only
// their lengths); its alarms and finished timers ring as notifications,
// which sources/banners.js shows.
//
// No tick here: the look counts the time once a second while it shows;
// the end is one timeout at the moment it is due.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {clockText, POMODORO_PHASES} from '../lib/words.js';
import {runningTimer} from '../lib/timers.js';

const ID = 'timer';
const LABELS = {timer: 'Timer', stopwatch: 'Stopwatch'};
// The canvas' timer colour (an activity's kind colour, canvas States).
const COLOR = '#ff9f0a';

export class TimerSource {
    constructor(island, store) {
        this._interface = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        this._island = island;
        this._store = store;
        this._endId = 0;
        this._store.connectObject('changed', () => this._update(), this);
        this._update();
    }

    destroy() {
        if (this._endId)
            GLib.source_remove(this._endId);
        this._endId = 0;
        this._store.disconnectObject(this);
        this._island.remove(ID);
    }

    _update() {
        const now = Date.now();
        for (const ended of this._store.settle(now))
            this._announce(ended);
        const running = runningTimer(this._store.timers, now);
        this._scheduleEnd(running, now);
        if (!running || !this._island.allows('timer')) {
            this._island.remove(ID);
            return;
        }
        const store = this._store;
        const shownNow = () => runningTimer(store.timers, Date.now());
        const text = state => state ? clockText(state.shown, {countdown: state.countdown}) : '';
        this._island.set({
            id: ID, kind: 'timer', source: 'timer', color: COLOR,
            icon: 'alarm-symbolic',
            title: running.kind === 'pomodoro' ? POMODORO_PHASES[running.phase] : LABELS[running.kind],
            short: text(running),
            timeAt: () => text(shownNow()),
            progressAt: running.countdown ? () => shownNow()?.progress ?? 1 : null,
            key: `${running.kind}:${running.phase ?? ''}:${running.countdown}`,
            // A scroll gives a countdown a minute more or less.
            onScroll: running.kind === 'timer' ? steps => store.stretchTimer(steps) : null,
        });
    }

    // One timeout for when the running countdown ends, none otherwise.
    _scheduleEnd(running, now) {
        if (this._endId)
            GLib.source_remove(this._endId);
        this._endId = 0;
        if (!running?.countdown || !running.endsAt)
            return;
        this._endId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1, running.endsAt - now + 50), () => {
            this._endId = 0;
            this._update();
            return GLib.SOURCE_REMOVE;
        });
    }

    _announce(ended) {
        global.display.get_sound_player().play_from_theme('complete', 'Timer', null);
        if (!this._island.allows('timer'))
            return;
        const text = ended.kind === 'timer'
            ? {title: 'Time is up', note: 'The timer has run out'}
            : {title: ended.phase === 'work' ? 'Focus is over' : 'The break is over', note: `Next: ${POMODORO_PHASES[ended.next]}`};
        this._island.set({id: 'hint:timer-end', kind: 'timer', hint: true, opens: true, duration: 6000, source: 'timer',
            icon: 'alarm-symbolic', color: COLOR, short: text.title, ...text});
    }
}
