// The glance on hover with the machine pieces, at the three sizes
// (2026-11-17): centred lines, nothing cut off.
export default async function ({island, settings, shot, sleep, note, move, moveTo}) {
    settings.set_boolean('hover-glance', true);
    for (const activity of island.activities)
        island.remove(activity.id);
    for (const size of ['small', 'standard', 'large']) {
        settings.set_string('size', size);
        moveTo(640, 600);
        await sleep(800);
        move(island.view.shape);
        await sleep(1000);
        const g = island._state.activity;
        note(`${size}: mode=${island._state.mode} w=${island.view.shape.width} h=${island.view.shape.height} lines=${JSON.stringify(g?.items?.map(i => i.text))}`);
        await shot(`glance-${size}`);
    }
    settings.set_strv('glance-items', ['memory', 'uptime']);
    moveTo(640, 600);
    await sleep(800);
    move(island.view.shape);
    await sleep(1000);
    note(`two pieces: ${JSON.stringify(island._state.activity?.items?.map(i => i.text))}`);
    await shot('glance-two');
}
