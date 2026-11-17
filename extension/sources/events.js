// A calendar event that starts soon (Evolution's calendars, through the
// source GNOME's date menu keeps for its month), from Halo's
// sources/events.js: told once ten minutes ahead and again as it starts.
//
// Halo asked once a minute; here one timeout waits for the next moment
// that is due, and the calendar's own 'changed' signal plans again.

import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {soonText} from '../lib/words.js';

const AHEAD_MS = 10 * 60 * 1000;
const NOW_MS = 60 * 1000;
const DAY_MS = 24 * 3600 * 1000;
// Plans further out than this are looked at again then, in case the clock
// was changed or the computer slept.
const LONGEST_WAIT_MS = 3 * 3600 * 1000;

export class EventsSource {
    constructor(island) {
        this._island = island;
        this._told = new Set();
        this._timeoutId = 0;
        this._source = Main.panel.statusArea.dateMenu?._eventSource ?? null;
        this._source?.connectObject('changed', () => this._look(), this);
        this._look();
    }

    destroy() {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        this._source?.disconnectObject(this);
    }

    // The next event today that has not ended, for the glance on hover:
    // {icon, text} or null.
    get glance() {
        const now = Date.now();
        if (!this._island.allows('events'))
            return null;
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        const next = this._events(now)
            .filter(event => event.end.getTime() > now && event.date.getTime() < midnight.getTime())
            .sort((a, b) => a.date - b.date)[0];
        if (!next)
            return null;
        const starts = next.date.getTime();
        const time = GLib.DateTime.new_from_unix_local(Math.floor(starts / 1000)).format('%H:%M');
        const when = starts <= now
            ? `now, until ${GLib.DateTime.new_from_unix_local(Math.floor(next.end.getTime() / 1000)).format('%H:%M')}`
            : `at ${time}`;
        return {id: 'event', icon: 'x-office-calendar-symbolic', text: `${next.summary || 'Event'} ${when}`};
    }

    _events(now) {
        const source = this._source;
        if (!source?.hasCalendars || source.isLoading)
            return [];
        try {
            return (source.getEvents(new Date(now - NOW_MS), new Date(now + DAY_MS)) ?? [])
                // All-day events are not news.
                .filter(event => event.end.getTime() - event.date.getTime() < DAY_MS);
        } catch {
            return [];
        }
    }

    _look() {
        const now = Date.now();
        const events = this._events(now);
        if (this._island.allows('events')) {
            for (const event of events) {
                const starts = event.date.getTime();
                if (starts < now - NOW_MS || starts > now + AHEAD_MS)
                    continue;
                const stage = starts - now <= NOW_MS ? 'now' : 'soon';
                const key = `${event.id}:${starts}:${stage}`;
                if (this._told.has(key))
                    continue;
                this._told.add(key);
                this._island.set({
                    id: `event:${event.id}`, kind: 'notification', hint: true, source: 'events', duration: 6000,
                    icon: 'x-office-calendar-symbolic',
                    title: event.summary || 'Event', short: event.summary || 'Event',
                    note: soonText(Math.max(0, (starts - now) / 1000)),
                });
            }
        }
        this._plan(events, now);
    }

    // The next moment something is due: ten minutes ahead of an event, or
    // its start.
    _plan(events, now) {
        if (this._timeoutId)
            GLib.source_remove(this._timeoutId);
        this._timeoutId = 0;
        const moments = events.flatMap(event => [event.date.getTime() - AHEAD_MS, event.date.getTime() - NOW_MS / 2])
            .filter(at => at > now);
        if (moments.length === 0)
            return;
        const wait = Math.min(LONGEST_WAIT_MS, Math.min(...moments) - now);
        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(1000, wait), () => {
            this._timeoutId = 0;
            this._look();
            return GLib.SOURCE_REMOVE;
        });
    }
}
