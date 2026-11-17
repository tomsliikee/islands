// Hover, click, swipe and "opens big" (2026-11-15): hover-open, a click
// pins and a second click closes for good under the pointer; a press
// outside closes a pinned island; a bubble under the pointer peeks; a
// message reopens and unfolds under the pointer; a touchpad swipe up sends
// what is opened away; volume opens big; privacy uses are bubbles each.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const geometry = island => {
    const {x, y, width, height} = island.view.shape;
    return `${x},${y} ${width}x${height}`;
};

// The virtual pointer's finger scrolls do not reach the island headless
// (Mutter's virtual devices are no touchpad), so after trying them the
// same events are handed to the island as a touchpad would send them.
async function fingers(island, swipe, sleep) {
    for (let i = 0; i < 6; i++) {
        swipe(0, 1);
        await sleep(16);
    }
    await sleep(100);
    for (let i = 0; i < 6; i++) {
        island._scroll({
            get_scroll_direction: () => Clutter.ScrollDirection.SMOOTH,
            get_scroll_source: () => Clutter.ScrollSource.FINGER,
            get_scroll_delta: () => [0, 1],
            get_scroll_finish_flags: () => (i === 5 ? Clutter.ScrollFinishFlags.VERTICAL : Clutter.ScrollFinishFlags.NONE),
            get_state: () => 0,
        });
        await sleep(16);
    }
}

export default async function ({island, settings, shot, sleep, note, moveTo, move, click, hold, swipe, Main}) {
    settings.set_boolean('hover-open', true);
    moveTo(640, 600);
    island.set({id: 'media', kind: 'media', title: 'Midnight Drive', note: 'Low Tide', short: 'Midnight Drive', icon: 'audio-x-generic-symbolic'});
    await sleep(900);
    note(`media compact: ${geometry(island)} mode=${island._state.mode}`);

    // Hover opens, leaving closes.
    move(island.view.shape);
    await sleep(900);
    note(`hover-open: mode=${island._state.mode} ${geometry(island)}`);
    moveTo(640, 600);
    await sleep(900);
    note(`left: mode=${island._state.mode} hovered=${island._hovered}`);

    // Hover opens, a click pins, the pointer leaves: stays; a press outside
    // closes it.
    move(island.view.shape);
    await sleep(900);
    await click(island.view.shape);
    await sleep(300);
    note(`pinned: mode=${island._state.mode} expanded=${island._expanded} grab=${Boolean(island._grab)}`);
    moveTo(640, 600);
    await sleep(900);
    note(`pinned, pointer away: mode=${island._state.mode}`);
    hold(true);
    await sleep(60);
    hold(false);
    await sleep(900);
    note(`press outside: mode=${island._state.mode} grab=${Boolean(island._grab)}`);

    // Pinned, then a second click closes, and it stays closed under the
    // pointer until it leaves.
    move(island.view.shape);
    await sleep(900);
    await click(island.view.shape);
    await sleep(300);
    await click(island.view.shape);
    await sleep(1200);
    note(`second click: mode=${island._state.mode} suppressed=${island._hoverSuppressed}`);
    moveTo(640, 600);
    await sleep(900);
    move(island.view.shape);
    await sleep(900);
    note(`back on it: mode=${island._state.mode}`);
    moveTo(640, 600);
    await sleep(900);

    // Esc closes a pinned island (Mutter's virtual keyboard sends nothing
    // headless, so this only shows that the grab is there).
    await click(island.view.shape);
    await sleep(600);
    const keyboard = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const now = () => GLib.get_monotonic_time();
    note(`before esc: grab=${Boolean(island._grab)} mode=${island._state.mode} focus=${global.stage.key_focus}`);
        await sleep(300);
    // Evdev's KEY_ESC.
    keyboard.notify_key(now(), 1, Clutter.KeyState.PRESSED);
    await sleep(30);
    keyboard.notify_key(now(), 1, Clutter.KeyState.RELEASED);
    await sleep(900);
    note(`esc: mode=${island._state.mode} grab=${Boolean(island._grab)}`);
    moveTo(640, 600);
    await sleep(900);

    // A bubble under the pointer peeks; leaving goes back.
    island.set({id: 'timer', kind: 'timer', title: '04:32', short: '04:32', icon: 'alarm-symbolic', color: '#ff9f0a', at: 0});
    await sleep(900);
    const bubble = island.view.bubbleActors[0];
    note(`duo: main=${island._state.main?.id} bubbles=${island.view.bubbleActors.length}`);
    move(bubble);
    await sleep(1100);
    note(`peek: main=${island._state.main?.id} mode=${island._state.mode} ${geometry(island)}`);
    await shot('fixes-peek');
    moveTo(640, 600);
    await sleep(1000);
    note(`after peek: main=${island._state.main?.id} mode=${island._state.mode} hovered=${island._hovered}`);
    island.remove('timer');
    await sleep(600);

    // Swipe up over what is opened: it closes back to compact.
    move(island.view.shape);
    await sleep(900);
    await fingers(island, swipe, sleep);
    await sleep(900);
    note(`swiped media: mode=${island._state.mode}`);
    moveTo(640, 600);
    await sleep(900);

    // A message: under the pointer it unfolds; a swipe sends it away.
    const long = 'The build finished and every test passed. Four artboards were published, two need a look before the review tomorrow at nine.';
    island.set({id: 'msg', kind: 'notification', hint: true, title: 'Claude Code · islands', note: long, when: 'now', icon: 'dialog-information-symbolic',
        onDismiss: () => note('msg onDismiss')});
    await sleep(900);
    note(`message: mode=${island._state.mode} ${geometry(island)}`);
    move(island.view.shape);
    await sleep(900);
    note(`message hovered: mode=${island._state.mode} ${geometry(island)} full=${Boolean(island._state.activity?.fullText)}`);
    await shot('fixes-message-unfolded');
    await fingers(island, swipe, sleep);
    await sleep(900);
    note(`message swiped: has=${island.has('msg')} main=${island._state.main?.id}`);
    moveTo(640, 600);
    await sleep(900);

    // Volume opens big for its time, then goes.
    Main.osdWindowManager._showOsdWindow(-1, new Gio.ThemedIcon({name: 'audio-volume-medium-symbolic'}), null, 0.5, 1);
    await sleep(500);
    note(`volume: mode=${island._state.mode} ${geometry(island)} main=${island._state.main?.id}`);
    await shot('fixes-volume');
    await sleep(2500);
    note(`volume after 3 s: main=${island._state.main?.id} mode=${island._state.mode}`);

    // Three uses, three activities.
    for (const use of ['sharing', 'camera', 'microphone'])
        island.set({id: `privacy:${use}`, kind: 'privacy', source: 'privacy', opensFor: true, opens: true, lasting: true, duration: 3000,
            icon: 'camera-web-symbolic', title: use, short: use});
    await sleep(600);
    note(`privacy: mode=${island._state.mode} main=${island._state.main?.id} bubbles=${island.view.bubbleActors.length}`);
    await sleep(3200);
    note(`privacy after 3.8 s: mode=${island._state.mode}`);
    await shot('fixes-privacy');

    // Pulled sideways (the handler is called as the view does on a release
    // after 40 px; a real mouse drag is not driven by this rig): what
    // shows becomes a bubble, the empty island takes its place, a click on
    // the bubble brings it back; on the empty island a pull does nothing.
    for (const id of ['privacy:sharing', 'privacy:camera', 'privacy:microphone'])
        island.remove(id);
    island.set({id: 'media', kind: 'media', title: 'Midnight Drive', note: 'Low Tide', short: 'Midnight Drive', icon: 'audio-x-generic-symbolic'});
    await sleep(900);
    island._dragAway();
    await sleep(900);
    note(`pulled: main=${island._state.main?.id ?? 'none'} bubbles=${island.view.bubbleActors.length} ${geometry(island)}`);
    await shot('fixes-pulled');
    island._dragAway();
    await sleep(300);
    note(`pulled on the empty island: main=${island._state.main?.id ?? 'none'} bubbles=${island.view.bubbleActors.length}`);
    island._bubble({activity: island._activities.get('media')}, Clutter.BUTTON_PRIMARY);
    await sleep(900);
    note(`bubble clicked: main=${island._state.main?.id} bubbles=${island.view.bubbleActors.length}`);
}
