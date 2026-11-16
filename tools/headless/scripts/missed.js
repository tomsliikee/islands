// A missed enter (2026-11-16): the one notify::hover St sends came while the
// pick missed the island (or the hover was cleared under the pointer). The
// pointer is on the island, St's hover says nothing more; a small move over
// it must still hover and open.
export default async function ({island, settings, sleep, note, moveTo, Main}) {
    settings.set_boolean('hover-open', true);
    moveTo(640, 600);
    island.set({id: 'media', kind: 'media', title: 'Midnight Drive', note: 'Low Tide', short: 'Midnight Drive', icon: 'audio-x-generic-symbolic'});
    await sleep(900);
    const {x, y, width, height} = island.view.shape;
    const cx = Math.round(x + width / 2), cy = Math.round(y + height / 2);

    // Swallow the enter: the island hears nothing from notify::hover.
    const real = island.view._handlers.onHover;
    island.view._handlers.onHover = () => {};
    moveTo(cx, cy);
    await sleep(300);
    island.view._handlers.onHover = real;
    note(`enter missed: hovered=${island._hovered} st=${island.view.shape.hover} mode=${island._state.mode}`);

    // A small move on the island.
    moveTo(cx + 3, cy);
    await sleep(900);
    note(`after move: hovered=${island._hovered} mode=${island._state.mode}`);

    // Leaving still closes.
    moveTo(640, 600);
    await sleep(900);
    note(`left: hovered=${island._hovered} mode=${island._state.mode}`);
}
