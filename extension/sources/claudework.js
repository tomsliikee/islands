// Claude Code at work: while a session is busy it rests in the bar in
// Claude's colour with its name and how long it has been going; when it is
// idle again a short "Done" with the time. Read from the small files
// Claude Code keeps per session (~/.claude/sessions/<pid>.json), watched
// with the kernel's file monitor, so nothing polls. A first look at start
// shows what already goes on without opening it.
//
// Opened it shows what the session does, from its transcript: the step of
// its task list, the tool it runs, the model and its context. Only the
// transcripts of working sessions are watched, and only what was added
// since the last read is read. A session waiting for an answer opens again.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {finished, readWork} from '../lib/sessions.js';
import {emptyWork, modelName, stepOf, takeText, tokensText, toolText, transcriptPath} from '../lib/transcript.js';
import {clockText} from '../lib/words.js';
import {CLAUDE} from './claude.js';
import {Watch} from './watch.js';

const DIR = GLib.build_filenamev([GLib.get_home_dir(), '.claude', 'sessions']);
const OPEN_MS = 3000;
const DONE_MS = 4000;
const ICON = 'chat-message-new-symbolic';
export const DONE_PREFIX = 'claude-done:';
// A first read takes the transcript's end only; a long session's task list
// is set again near its end.
const FIRST_BYTES = 256 * 1024;

// One session's transcript, read as it grows.
class Transcript {
    constructor(path, onChange) {
        this.work = emptyWork();
        this._file = Gio.File.new_for_path(path);
        this._offset = -1;
        this._rest = new Uint8Array(0);
        this._watch = new Watch(path, () => {
            if (this._read())
                onChange();
        }, {changed: true, rateMs: 1000});
        this._read();
    }

    // Reads what was added; true when there was something.
    _read() {
        let size;
        try {
            size = this._file.query_info('standard::size', Gio.FileQueryInfoFlags.NONE, null).get_size();
        } catch {
            return false;
        }
        if (size < this._offset) {
            // Written anew: start over.
            this.work = emptyWork();
            this._offset = -1;
        }
        const first = this._offset < 0;
        const from = first ? Math.max(0, size - FIRST_BYTES) : this._offset;
        if (size <= from)
            return false;
        let bytes;
        try {
            const stream = this._file.read(null);
            stream.seek(from, GLib.SeekType.SET, null);
            bytes = stream.read_bytes(size - from, null).toArray();
            stream.close(null);
        } catch {
            return false;
        }
        this._offset = from + bytes.length;
        let all = first ? bytes : new Uint8Array([...this._rest, ...bytes]);
        // A read from the middle starts after its first line break.
        if (first && from > 0)
            all = all.subarray(all.indexOf(10) + 1);
        // Only whole lines; the rest waits for its end.
        const end = all.lastIndexOf(10);
        this._rest = all.slice(end + 1);
        if (end < 0)
            return false;
        this.work = takeText(this.work, new TextDecoder().decode(all.subarray(0, end)));
        return true;
    }

    destroy() {
        this._watch.destroy();
    }
}

export class ClaudeWorkSource {
    constructor(island, dir = DIR) {
        this._island = island;
        this._dir = dir;
        this._working = new Map();
        this._shown = new Map();
        this._transcripts = new Map();
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
            this._island.set({id: `${DONE_PREFIX}${id}`, kind: 'notification', hint: true, bubble: false, source: 'claude-work', at: now,
                duration: DONE_MS, icon: ICON, color: CLAUDE, title: 'Claude is done', short: 'Done',
                note: `${session.name} · ${clockText(now - session.since)}`});
        }
        const next = new Map();
        for (const session of working) {
            const before = this._working.get(session.id);
            // The time counts from the start of the work, not from the
            // last wait for an answer.
            this._island.remove(`${DONE_PREFIX}${session.id}`);
            next.set(session.id, before ? {...session, since: before.since} : session);
        }
        for (const id of this._working.keys()) {
            if (!next.has(id)) {
                this._island.remove(`claude-work:${id}`);
                this._transcripts.get(id)?.destroy();
                this._transcripts.delete(id);
            }
        }
        this._working = next;
        if (allowed) {
            for (const session of next.values()) {
                const before = this._shown.get(session.id);
                // Opens once when it starts, and again when it begins to
                // wait for an answer; not for what already went on when
                // the shell started.
                let at = before ? before.at : (this._first ? 0 : now);
                if (before && session.waiting && !before.waiting)
                    at = now;
                this._shown.set(session.id, {at, waiting: session.waiting});
                if (!this._transcripts.has(session.id)) {
                    const path = transcriptPath(GLib.get_home_dir(), session.entry);
                    this._transcripts.set(session.id, new Transcript(path, () => this._show(session.id)));
                }
                this._show(session.id);
            }
        } else {
            for (const session of next.values())
                this._island.remove(`claude-work:${session.id}`);
        }
        for (const id of this._shown.keys()) {
            if (!next.has(id))
                this._shown.delete(id);
        }
        this._first = false;
    }

    _show(id) {
        const session = this._working.get(id);
        const shown = this._shown.get(id);
        if (!session || !shown || !this._island.allows('claude-work'))
            return;
        const work = this._transcripts.get(id)?.work ?? emptyWork();
        const {since, waiting} = session;
        const step = stepOf(work.plan);
        this._island.set({id: `claude-work:${id}`, kind: 'claude', source: 'claude-work',
            opensFor: true, opens: true, lasting: true, duration: OPEN_MS, at: shown.at,
            icon: ICON, color: CLAUDE, title: session.name, folder: session.folder,
            short: session.name, waiting, step, said: work.said,
            tool: work.tool && !work.tool.done ? toolText(work.tool) : '',
            about: [session.folder, modelName(work.model), tokensText(work.context)].filter(Boolean).join(' · '),
            key: `${id}:${session.name}:${waiting}:${step?.index}/${step?.total}:${step?.text}:${work.said}:${toolText(work.tool)}:${work.tool?.done}:${work.context}`,
            clockAt: () => clockText(Date.now() - since),
            timeAt: () => waiting ? 'Needs you' : `${session.name} · ${clockText(Date.now() - since)}`});
    }

    destroy() {
        this._watch.destroy();
        for (const transcript of this._transcripts.values())
            transcript.destroy();
        this._transcripts.clear();
        for (const id of this._working.keys())
            this._island.remove(`claude-work:${id}`);
    }
}
