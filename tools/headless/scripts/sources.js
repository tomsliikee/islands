// M1's sources through GNOME's real paths: the OSD call the volume keys
// make, D-Bus notifications (plain, with buttons, a call), a stand-in MPRIS
// player, Ledge's timers file, the screen-sharing indicator. Each is
// looked at in the bar and opened.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const here = GLib.path_get_dirname(GLib.path_get_dirname(GLib.getenv('ISLANDS_SCRIPT')));

export default async function ({island, settings, shot, sleep, note, moveTo, click, Main}) {
    const shape = () => {
        const {x, y, width, height} = island.view.shape;
        const main = island._state?.main;
        return `${main?.kind ?? 'idle'}/${island._state?.mode} ${x},${y} ${width}x${height}`;
    };
    const spawn = argv => Gio.Subprocess.new(argv, Gio.SubprocessFlags.NONE);
    moveTo(640, 500);
    await sleep(500);

    // OSD: as the volume keys show it.
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'audio-volume-medium-symbolic'}), null, 0.62, 1);
    await sleep(700);
    note(`osd volume: ${shape()} osd window visible=${Main.osdWindowManager._osdWindows?.some(w => w.visible) ?? 'n/a'}`);
    await shot('m1-osd');
    await sleep(1400);
    note(`osd after 2.1 s: ${shape()}`);
    Main.osdWindowManager.showAll(new Gio.ThemedIcon({name: 'caps-lock-symbolic'}), 'Caps Lock on', null, null);
    await sleep(600);
    note(`osd caps lock: ${shape()}`);
    await sleep(1600);

    // A notification, then one with buttons.
    spawn(['notify-send', '-a', 'Claude Code', '-i', 'dialog-information-symbolic', 'Claude Code · islands', 'Draft done, 4 artboards published']);
    await sleep(1200);
    note(`notification: ${shape()} banner shown by GNOME=${Boolean(Main.messageTray._banner)}`);
    await shot('m1-notification');
    await sleep(5000);
    note(`notification after 6.2 s: ${shape()}`);
    spawn(['notify-send', '-a', 'Mail', '-A', 'reply=Reply', '-A', 'archive=Archive', 'Anna', 'Are we still on for tonight?']);
    await sleep(1200);
    note(`notification with buttons: ${shape()}`);
    await shot('m1-notification-actions');
    await sleep(6000);

    // A call: opens for 6 s, then rings on in the bar with its buttons.
    spawn(['notify-send', '-a', 'NectarLink', '-h', 'string:category:call.incoming', '-A', 'decline=Decline', '-A', 'answer=Answer', 'Anna', 'Pixel 10 Pro']);
    await sleep(1200);
    note(`call: ${shape()}`);
    await shot('m1-call');
    await sleep(6000);
    note(`call after 7.2 s: ${shape()}`);
    await shot('m1-call-compact');
    const find = (actor, name) => actor.accessible_name === name ? actor
        : actor.get_children().map(child => find(child, name)).find(Boolean) ?? null;
    const decline = find(island.view.shape, 'Decline');
    note(`decline button found=${Boolean(decline)}`);
    if (decline) {
        await click(decline);
        await sleep(900);
    }
    note(`call declined: ${shape()} activities=${island.activities.map(a => a.kind).join(',')}`);

    // Music from a stand-in MPRIS player.
    const player = spawn(['gjs', '-m', `${here}/mpris.js`, '40']);
    await sleep(2500);
    note(`media: ${shape()} title=${island.activities.find(a => a.kind === 'media')?.title}`);
    await shot('m1-media');
    await click(island.view.shape);
    await sleep(1100);
    note(`media opened: ${shape()}`);
    await shot('m1-media-opened');
    moveTo(640, 600);
    await sleep(200);
    // A press elsewhere closes it.
    await click(Main.layoutManager.uiGroup);
    await sleep(1000);
    note(`media after a press elsewhere: ${shape()}`);

    // Ledge's timer, running.
    const state = GLib.get_user_state_dir();
    GLib.mkdir_with_parents(`${state}/ledge`, 0o755);
    const now = Date.now();
    GLib.file_set_contents(`${state}/ledge/timers.json`, JSON.stringify({timer: {mode: 'timer', duration: 272000, elapsed: 0, startedAt: now}}));
    await sleep(1500);
    note(`timer + media: ${shape()} bubbles=${island.view.bubbleActors.length}`);
    await shot('m1-timer-media');

    // Screen sharing as GNOME's indicator shows it.
    const sharing = Main.panel.statusArea.screenSharing;
    if (sharing) {
        sharing.visible = true;
        await sleep(1000);
        note(`sharing: ${shape()} bubbles=${island.view.bubbleActors.length}`);
        await shot('m1-sharing');
        sharing.visible = false;
        await sleep(800);
    }
    GLib.file_set_contents(`${state}/ledge/timers.json`, '{}');
    player.force_exit();
    await sleep(2500);
    note(`all over: ${shape()} activities=${island.activities.map(a => a.kind).join(',')}`);
}
