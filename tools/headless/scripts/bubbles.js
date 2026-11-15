// Bubbles for 0 to 10 allowed, with 12 things going on: the last bubble
// counts the rest.
export default async function ({island, settings, shot, sleep, note, moveTo}) {
    moveTo(640, 500);
    const kinds = ['call', 'recording', 'timer', 'file', 'claude', 'media', 'progress'];
    for (let i = 0; i < 12; i++)
        island.set({id: `a${i}`, kind: kinds[i % kinds.length], title: `Thing ${i}`, icon: 'emblem-system-symbolic', at: i});
    for (const count of [0, 1, 3, 10]) {
        settings.set_int('bubbles', count);
        await sleep(900);
        const labels = island.view.bubbleActors.map(actor => actor.child?.text ?? 'icon');
        note(`bubbles=${count}: drawn ${labels.length} [${labels.join(' ')}] island x=${island.view.shape.x} w=${island.view.shape.width}`);
        await shot(`bubbles-${count}`);
    }
    settings.set_int('bubbles', 3);
    for (let i = 0; i < 12; i++)
        island.remove(`a${i}`);
    await sleep(900);
    note(`all gone: drawn ${island.view.bubbleActors.length}`);
}
