// Claude at work: session files in a scratch folder. A busy session rests
// in the bar with its name and time; a second one is a bubble; idle gives a
// short "Done"; a dead process is not "done"; a session that was busy at
// start does not open.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ClaudeWorkSource} from '../../../extension/sources/claudework.js';

export default async function ({island, shot, sleep, note, moveTo}) {
    const dir = GLib.dir_make_tmp('islands-sessions-XXXXXX');
    const log = `${dir}/two.jsonl`;
    const write = (pid, id, status, name, since = Date.now(), extra = {}) => GLib.file_set_contents(`${dir}/${pid}.json`, JSON.stringify(
        {pid, sessionId: id, cwd: '/home/toms/git/demo', name, status, startedAt: since, statusUpdatedAt: since, logPath: log, ...extra}));
    // Transcript lines, appended as Claude Code does.
    const lines = [];
    const add = (...more) => {
        lines.push(...more.map(line => JSON.stringify(line)));
        GLib.file_set_contents(log, `${lines.join('\n')}\n`);
    };
    const usage = {input_tokens: 2, cache_read_input_tokens: 81000, output_tokens: 40};
    const use = (id, name, input) => ({type: 'assistant', message: {model: 'claude-opus-5-5', usage, content: [{type: 'tool_use', id, name, input}]}});
    const plan = (items, input = {}) => use(`p${lines.length}`, 'mcp__ccd_turn__update_plan',
        items ? {items: items.map(([content, status]) => ({content, status}))} : input);
    const opened = () => {
        const content = island.view._content;
        const texts = [];
        const walk = actor => {
            if (actor.text !== undefined && actor.visible)
                texts.push(actor.text);
            for (const child of actor.get_children?.() ?? [])
                walk(child);
        };
        if (content)
            walk(content);
        return texts.join(' | ');
    };
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
    add(plan([['Read the code', 'completed'], ['Write the parser', 'in_progress'], ['Test it', 'pending']]),
        use('b1', 'Bash', {description: 'Run the unit tests', command: 'gjs -m t.js'}));
    write(other, 'two', 'busy', 'Island work');
    await sleep(1200);
    note(`second starts: ${shape()} :: ${opened()}`);
    await shot('claudework-two');
    add({type: 'user', message: {content: [{type: 'tool_result', tool_use_id: 'b1'}]}}, plan(null, {advance: true}),
        use('e1', 'Edit', {file_path: '/home/toms/git/demo/island.js'}));
    await sleep(1500);
    note(`step moved: ${shape()} :: ${opened()}`);
    await shot('claudework-step');
    await sleep(2000);
    note(`second rests: ${shape()}`);
    write(other, 'two', 'waiting', 'Island work', Date.now(), {waitingFor: 'permission'});
    await sleep(900);
    note(`waiting opens: ${shape()} :: ${opened()} compact=${island._state?.main?.timeAt?.()}`);
    await shot('claudework-waiting');
    write(other, 'two', 'busy', 'Island work');
    await sleep(3800);
    note(`back to work rests: ${shape()} activities=${island.activities.map(a => a.id).join(',')}`);
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
    GLib.unlink(log);
    Gio.File.new_for_path(dir).delete(null);
}
