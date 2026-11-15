// What the shell does while nothing happens, with and without Islands
// (run once as is and once with ISLANDS_WITHOUT=1): painted frames and the
// shell's voluntary context switches (each one a wakeup of its main
// thread or a helper) over 20 s of rest.
import GLib from 'gi://GLib';

function switches() {
    const status = new TextDecoder().decode(GLib.file_get_contents('/proc/self/status')[1]);
    return Number(/voluntary_ctxt_switches:\s+(\d+)/.exec(status)?.[1] ?? 0);
}

export default async function ({sleep, note, frames, moveTo, island}) {
    moveTo(640, 500);
    // Let the start-up settle (fonts, caches, the first layouts).
    await sleep(8000);
    const rounds = [];
    for (let i = 0; i < 3; i++) {
        const before = switches();
        const painted = await frames(20000);
        rounds.push({frames: painted, wakeups: switches() - before});
    }
    note(`${island ? 'with Islands' : 'without Islands'}: ${rounds.map(r => `${r.frames} frames, ${r.wakeups} wakeups / 20 s`).join(' | ')}`);
}
