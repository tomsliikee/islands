// A long message with buttons, held under the pointer (2026-11-24): the
// text ends in "…" inside the island and the buttons stay below it.
export default async function ({island, settings, shot, sleep, note, moveTo, move}) {
    settings.set_boolean('hover-open', true);
    moveTo(640, 600);
    const long = 'The build finished and every test passed. '.repeat(12);
    island.set({id: 'long', kind: 'notification', look: 'actions', hint: true, title: 'Claude Code · islands', note: long, when: 'now',
        icon: 'dialog-information-symbolic', actions: [{label: 'Open'}, {label: 'Later'}]});
    await sleep(900);
    move(island.view.shape);
    await sleep(1200);
    const {x, y, width, height} = island.view.shape;
    note(`long hovered: ${x},${y} ${width}x${height} full=${Boolean(island._state.activity?.fullText)} lines=${island._state.activity?.noteLines}`);
    await shot('long-message');
}
