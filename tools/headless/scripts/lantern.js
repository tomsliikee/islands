// Lantern grows out of the island and back (run with
// ISLANDS_WITH="material-search@thomashaiden=<lantern>/extension"): a click
// on the empty island, then Lantern's own toggle (its shortcut).
export default async function ({island, shot, sleep, note, moveTo, move, click, Main}) {
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

    // Back from Lantern with the pointer gone from the island: no hover
    // look and no glance on the way (St kept the island's hover while it
    // was hidden). Sampled every 16 ms for 400 ms after the close.
    // Empty: a real Ollama on this machine would show its model.
    island._settings.set_strv('disabled-sources', island.activities.map(activity => activity.source ?? activity.kind));
    island.update();
    note(`left: ${island.activities.filter(activity => island.allows(activity.source ?? activity.kind)).map(activity => activity.id).join(', ') || 'none'}`);
    island.setGlance(() => ({items: [{icon: 'weather-clear-symbolic', text: '3° · Clear sky'}]}));
    move(island.view.shape);
    await sleep(800);
    note(`glance on hover: mode=${island._state?.mode} kind=${island._state?.kind} main=${island._state?.main?.id}:${island._state?.main?.source}:${island._state?.main?.title}`);
    await click(island.view.shape);
    await sleep(500);
    moveTo(640, 500);
    await sleep(300);
    lantern._panel.close();
    const seen = new Set();
    for (let ms = 0; ms < 1200; ms += 16) {
        await sleep(16);
        if (island.shown)
            seen.add(`${island._state.mode}/${island._state.kind} ${island.view.shape.width}x${island.view.shape.height}`);
    }
    note(`${[...seen].some(entry => !entry.startsWith('idle/')) ? 'FAIL' : 'ok'} after Lantern: ${[...seen].join(', ')} hovered=${island._hovered}`);
    // The pointer comes back: hover works again.
    move(island.view.shape);
    await sleep(500);
    note(`${island._hovered ? 'ok' : 'FAIL'} hover again: mode=${island._state?.mode} kind=${island._state?.kind}`);
}
