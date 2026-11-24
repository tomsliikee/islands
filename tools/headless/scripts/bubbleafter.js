// A long message and "bubble after" (2026-11-24): the whole text unfolds
// under the pointer; once its time is over a source set to rest as a
// bubble leaves a bubble beside the island, others leave.
export default async function ({island, settings, shot, sleep, note, moveTo, move}) {
    settings.set_boolean('hover-open', true);
    settings.set_strv('bubble-after', ['notification']);
    moveTo(640, 600);
    const long = 'The build finished and every test passed. '.repeat(14);
    island.set({id: 'long', kind: 'notification', hint: true, source: 'notification', title: 'Claude Code · islands', note: long, when: 'now',
        icon: 'dialog-information-symbolic', duration: 3000});
    await sleep(900);
    move(island.view.shape);
    await sleep(1200);
    note(`whole: ${island.view.shape.width}x${island.view.shape.height} lines=${island._state.activity?.noteLines}`);
    await shot('whole-message');
    moveTo(640, 600);
    await sleep(4500);
    note(`after: has=${island.has('long')} mode=${island._state.mode} bubbles=${island._state.slots?.length}`);
    await shot('bubble-after');
    settings.set_boolean('full-message', false);
    island.set({id: 'cut', kind: 'notification', hint: true, source: 'notification', title: 'Cut', note: long, when: 'now', icon: 'dialog-information-symbolic'});
    await sleep(900);
    move(island.view.shape);
    await sleep(1200);
    note(`capped: ${island.view.shape.width}x${island.view.shape.height} lines=${island._state.activity?.noteLines}`);
}
