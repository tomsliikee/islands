// Claude Code writes a small file per session (~/.claude/sessions/<pid>.json)
// that says whether it is busy or idle. Worked out from plain values so it
// can be tested without files or processes.

// entries: the parsed files; alive(pid) tells whether the process is
// still there (a session that crashed leaves "busy" behind).
// Returns {working, idle}: working are the busy sessions, the newest
// first, as {id, name, folder, since, pid}; idle is a Set of the ids of
// sessions that are there and not busy.
export function readWork(entries, alive) {
    const working = [];
    const idle = new Set();
    for (const entry of entries) {
        if (!entry || typeof entry.sessionId !== 'string' || !alive(entry.pid))
            continue;
        if (entry.status !== 'busy') {
            idle.add(entry.sessionId);
            continue;
        }
        const folder = String(entry.cwd ?? '').split('/').filter(Boolean).at(-1) ?? '';
        const since = Number.isFinite(entry.statusUpdatedAt) ? entry.statusUpdatedAt : (entry.startedAt ?? 0);
        working.push({id: entry.sessionId, name: entry.name || folder || 'Claude', folder, since, pid: entry.pid});
    }
    working.sort((a, b) => b.since - a.since);
    return {working, idle};
}

// The ids of sessions that were working and now sit idle (a crashed or
// closed session is not "done").
export function finished(before, idle) {
    return [...before.keys()].filter(id => idle.has(id));
}
