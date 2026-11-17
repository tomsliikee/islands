// The empty island takes input only where it rests, so a bubble beside it
// stays clickable (2026-11-17).
export default async function ({island, settings, sleep, note, moveTo, move}) {
    settings.set_boolean('hover-glance', true);
    moveTo(640, 600);
    for (const activity of island.activities)
        island.remove(activity.id);
    island.set({id: 'timer', kind: 'timer', title: '04:32', short: '04:32', icon: 'alarm-symbolic', color: '#ff9f0a'});
    await sleep(700);
    for (const activity of island.activities)
        island._dismissed.add(activity.id);
    island._dismissed.delete('timer');
    island._dismissed.add('timer');
    island.update();
    await sleep(900);
    const bubble = island.view.bubbleActors[0];
    const shape = island.view.shape;
    note(`dismissed: main=${island._state.main?.id} bubbles=${island.view.bubbleActors.length} mode=${island._state.mode}`);

    move(shape);
    await sleep(1000);
    note(`on island: mode=${island._state.mode} w=${shape.width} hovered=${island._hovered}`);

    move(bubble);
    await sleep(1200);
    note(`on bubble: mode=${island._state.mode} main=${island._state.main?.id} shapeW=${shape.width} bubbleReactive=${bubble.reactive} hover=${bubble.hover}`);

    moveTo(640, 600);
    await sleep(900);
    note(`away: mode=${island._state.mode} hovered=${island._hovered}`);
}
