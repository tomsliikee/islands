// Lantern grows out of the island and back (run with
// ISLANDS_WITH="material-search@thomashaiden=<lantern>/extension"): a click
// on the empty island, then Lantern's own toggle (its shortcut).
export default async function ({island, shot, sleep, note, moveTo, click, Main}) {
    const lantern = Main.extensionManager.lookup('material-search@thomashaiden')?.stateObj;
    if (!lantern?._panel) {
        note('FAIL Lantern is not running');
        return;
    }
    const capsule = lantern._panel._capsule;
    const geometry = () => `${capsule.x},${capsule.y} ${capsule.width}x${capsule.height} open=${lantern._panel.isOpen} island shown=${island.shown} opacity=${island.view.shape.opacity}`;
    moveTo(640, 500);
    await sleep(800);
    note(`island: ${island.view.shape.x},${island.view.shape.y} ${island.view.shape.width}x${island.view.shape.height}`);
    await click(island.view.shape);
    for (const ms of [30, 90, 200, 600]) {
        await sleep(ms === 30 ? 30 : ms - [30, 90, 200, 600][[30, 90, 200, 600].indexOf(ms) - 1]);
        note(`after click +${ms} ms: ${geometry()}`);
        if (ms === 90)
            await shot('lantern-growing');
    }
    await shot('lantern-open');
    lantern._panel.close();
    await sleep(120);
    note(`closing +120 ms: ${geometry()}`);
    await shot('lantern-shrinking');
    await sleep(700);
    note(`closed: ${geometry()}`);
    await shot('lantern-closed');

    // Lantern's shortcut: the same growth.
    lantern.toggle();
    await sleep(700);
    note(`shortcut: ${geometry()}`);
    lantern.toggle();
    await sleep(900);
    note(`shortcut closed: ${geometry()}`);

    // With the setting off, Lantern opens in its usual place.
    island._settings.set_boolean('lantern', false);
    lantern.toggle();
    await sleep(700);
    note(`setting off: ${geometry()}`);
    lantern.toggle();
    await sleep(700);
    island._settings.set_boolean('lantern', true);
}
