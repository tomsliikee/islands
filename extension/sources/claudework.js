// Claude Code at work: while a session is busy it rests in the bar in
// Claude's colour with its name and how long it has been going; when it is
// idle again a short "Done" with the time. Read from the small files
// Claude Code keeps per session (~/.claude/sessions/<pid>.json), watched
// with the kernel's file monitor, so nothing polls. A first look at start
// shows what already goes on without opening it.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {finished, readWork} from '../lib/sessions.js';
import {clockText} from '../lib/words.js';
import {CLAUDE} from './claude.js';
import {Watch} from './watch.js';

const DIR = GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'sessions']);
const OPEN_MS = 3000;
const DONE_MS = 4000;
const ICON = 'chat-message-new-symbolic';
export const DONE_PREFIX = 'claude-done:';

export class ClaudeWorkSource {
    constructor(island, dir = DIR) {
        this._island = island;
        this._dir = dir;
        this._working = new Map();
        this._at = new Map();
        this._first = true;
        this._watch = new Watch(dir, () => this._read(), {directory: true, changed: true, rateMs: 500});
        this._read();
    }

    // The session files, parsed; one that does not parse is skipped.
    _entries() {
        const entries = [];
        let list;
        try {
            list = Gio.File.new_for_path(this._dir).enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        } catch {
            return entries;
        }
        for (const info of list) {
            if (!info.get_name().endsWith('.json'))
                continue;
            try {
                const [, bytes] = GLib.file_get_contents(`${this._dir}/${info.get_name()}`);
                entries.push(JSON.parse(new TextDecoder().decode(bytes)));
            } catch {
                // Half-written: the next change reads it again.
            }
        }
        return entries;
    }

    _read() {
        const now = Date.now();
        const {working, idle} = readWork(this._entries(), pid => GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS));
        const allowed = this._island.allows('claude-work');
        const done = allowed ? finished(this._working, idle) : [];
        for (const id of done) {
            const session = this._working.get(id);
            this._island.set({id: `${DONE_PREFIX}${id}`, kind: 'notification', hint: true, source: 'claude-work', at: now,
                duration: DONE_MS, icon: ICON, color: CLAUDE, title: 'Claude is done', short: 'Done',
                note: `${session.name} · ${clockText(now - session.since)}`});
        }
        const next = new Map(working.map(session => [session.id, session]));
        for (const id of this._working.keys()) {
            if (!next.has(id))
                this._island.remove(`claude-work:${id}`);
        }
        if (allowed) {
            for (const session of working) {
                const before = this._working.get(session.id);
                // Opens once when it starts, but not for what already went
                // on when the shell started.
                const at = before ? this._at.get(session.id) : (this._first ? 0 : now);
                this._at.set(session.id, at);
                this._island.set({id: `claude-work:${session.id}`, kind: 'claude', source: 'claude-work',
                    opensFor: true, opens: true, lasting: true, duration: OPEN_MS, at,
                    icon: ICON, color: CLAUDE, title: `${session.name} · ${session.folder}`,
                    short: session.name, key: `${session.id}:${session.name}`,
                    timeAt: () => `${session.name} · ${clockText(Date.now() - session.since)}`});
            }
        } else {
            for (const session of working)
                this._island.remove(`claude-work:${session.id}`);
        }
        this._working = next;
        this._first = false;
    }

    destroy() {
        this._watch.destroy();
        for (const id of this._working.keys())
            this._island.remove(`claude-work:${id}`);
    }
}
