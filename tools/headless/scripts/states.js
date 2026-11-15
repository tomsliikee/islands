// The island in each state it can be put in without real sources: idle,
// idle under the pointer, a compact activity, the same opened, a short
// message, then the style switched between black and Blur My Shell's blur
// (with ISLANDS_WITH=blur-my-shell@aunetx).
const geometry = island => {
    const {x, y, width, height} = island.view.shape;
    return `${x},${y} ${width}x${height} opacity=${island.view.shape.opacity} radius=${island.view.shape.get_style()}`;
};

export default async function ({island, settings, shot, sleep, note, moveTo, move, click, Main}) {
    const prefix = settings.get_string('style') === 'auto' && island.view.blurred ? 'blur' : 'black';
    note(`bar height ${Main.panel.height}, blurred ${island.view.blurred}`);
    moveTo(640, 500);
    await sleep(800);
    note(`idle: ${geometry(island)}`);
    await shot(`${prefix}-idle`);

    move(island.view.shape);
    await sleep(900);
    note(`idle hover: ${geometry(island)}`);
    await shot(`${prefix}-idle-hover`);
    moveTo(640, 500);
    await sleep(900);
    note(`idle after hover: ${geometry(island)}`);

    island.set({id: 'timer', kind: 'timer', title: '04:32', icon: 'alarm-symbolic', color: '#ff9f0a'});
    await sleep(900);
    note(`timer compact: ${geometry(island)}`);
    await shot(`${prefix}-timer`);

    island.set({id: 'media', kind: 'media', title: 'Midnight Drive', note: 'Low Tide', short: 'Midnight Drive', icon: 'audio-x-generic-symbolic'});
    await sleep(900);
    note(`timer + media (bubble): ${geometry(island)} bubbles=${island.view.bubbleActors.length}`);
    await shot(`${prefix}-duo`);

    await click(island.view.shape);
    await sleep(1000);
    note(`opened by click: ${geometry(island)}`);
    await shot(`${prefix}-opened`);
    await click(island.view.shape);
    await sleep(1000);
    note(`closed by click: ${geometry(island)}`);
    moveTo(640, 500);

    island.set({id: 'note', kind: 'notification', hint: true, title: 'Claude Code · islands', note: 'Draft done, 4 artboards published', when: 'now', icon: 'dialog-information-symbolic'});
    await sleep(900);
    note(`notification: ${geometry(island)}`);
    await shot(`${prefix}-notification`);
    await sleep(5000);
    note(`notification after 5.9 s: ${geometry(island)} has=${island.activities.some(a => a.id === 'note')}`);

    island.remove('timer');
    island.remove('media');
    await sleep(1000);
    note(`back to idle: ${geometry(island)} bubbles=${island.view.bubbleActors.length}`);

    settings.set_string('style', 'black');
    await sleep(600);
    note(`style black: blurred=${island.view.blurred} class=${island.view.shape.style_class}`);
    await shot('switched-black-idle');
    settings.set_string('style', 'auto');
    await sleep(800);
    note(`style auto: blurred=${island.view.blurred} class=${island.view.shape.style_class}`);
}
