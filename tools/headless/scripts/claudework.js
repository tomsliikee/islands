// Claude at work: session files in a scratch folder. A busy session rests
// in the bar with its name and time; a second one is a bubble; idle gives a
// short "Done"; a dead process is not "done"; a session that was busy at
// start does not open.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ClaudeWorkSource} from '../../../extension/sources/claudework.js';

export default async function ({island, shot, sleep, note, moveTo}) {
    const dir = GLib.dir_make_tmp('islands-sessions-XXXXXX');
    const write = (pid, id, status, name, since = Date.now()) => GLib.file_set_contents(`${dir}/${pid}.json`, JSON.stringify(
        {pid, sessionId: id, cwd: '/home/toms/git/demo', name, status, startedAt: since, statusUpdatedAt: since}));
    const shape = () => {
        const {x, y, width, height} = island.view.shape;
        const main = island._state?.main;
        return `${main?.id ?? 'idle'}/${island._state?.mode} ${x},${y} ${width}x${height} bubbles=${island.view.bubbleActors.length}`;
    };
    moveTo(640, 500);
    // Pids that exist: this process and its parent.
    const mine = 1;
    const other = 2;
    write(mine, 'one', 'busy', 'Already busy');
    const source = new ClaudeWorkSource(island, dir);
    await sleep(800);
    note(`busy at start: ${shape()} (compact, not opened)`);
    write(other, 'two', 'busy', 'Island work');
    await sleep(1200);
    note(`second starts: ${shape()}`);
    await shot('claudework-two');
    await sleep(3200);
    note(`second rests: ${shape()}`);
    write(other, 'two', 'idle', 'Island work');
    await sleep(900);
    note(`second done: ${island.activities.map(a => a.id).join(',')} ${shape()}`);
    await shot('claudework-done');
    await sleep(4500);
    note(`done gone: ${island.activities.map(a => a.id).join(',')}`);
    GLib.unlink(`${dir}/${mine}.json`);
    await sleep(900);
    note(`file removed (no done): ${island.activities.map(a => a.id).join(',')}`);
    source.destroy();
    GLib.unlink(`${dir}/${other}.json`);
    Gio.File.new_for_path(dir).delete(null);
}
