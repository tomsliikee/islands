// What the island costs: painted frames while idle, while a compact
// activity rests, while the same state is set again and again, while music
// plays (the level ticks at 20 fps), with the level switched off, calm on
// battery, in fullscreen, and once the level has been still for a minute.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const here = GLib.path_get_dirname(GLib.path_get_dirname(GLib.getenv('ISLANDS_SCRIPT')));

export default async function ({extension, island, settings, sleep, note, frames, moveTo, launch}) {
    moveTo(640, 500);
    await sleep(2000);
    note(`idle 3 s: ${await frames(3000)} frames`);
    note(`idle, update() 30 times in 3 s: ${await frames(3000, () => island.update())} frames`);
    island.set({id: 'timer', kind: 'notification', title: 'Resting', icon: 'alarm-symbolic', at: 1});
    await sleep(1500);
    note(`compact activity resting 3 s: ${await frames(3000)} frames`);
    note(`same activity set 30 times in 3 s: ${await frames(3000, () => island.set({id: 'timer', kind: 'notification', title: 'Resting', icon: 'alarm-symbolic', at: 1}))} frames`);
    island.remove('timer');
    await sleep(1500);

    const player = Gio.Subprocess.new(['gjs', '-m', `${here}/mpris.js`, '120'], Gio.SubprocessFlags.NONE);
    await sleep(3000);
    note(`music playing 3 s: ${await frames(3000)} frames (level at 20 fps = 60)`);
    settings.set_boolean('level-animation', false);
    await sleep(500);
    note(`level animation off 3 s: ${await frames(3000)} frames`);
    settings.set_boolean('level-animation', true);
    extension._battery.pretend(true);
    await sleep(500);
    note(`on battery, calm 3 s: ${await frames(3000)} frames`);
    settings.set_boolean('calm-on-battery', false);
    await sleep(500);
    note(`on battery, not calm 3 s: ${await frames(3000)} frames (10 fps = 30)`);
    settings.set_boolean('calm-on-battery', true);
    extension._battery.pretend(false);
    await sleep(500);
    await launch('org.gnome.TextEditor.desktop', 3000);
    global.display.focus_window?.make_fullscreen();
    await sleep(1500);
    note(`fullscreen window (${Boolean(global.display.focus_window?.is_fullscreen())}), music 3 s: ${await frames(3000)} frames; island visible=${island._state.visible}`);
    global.display.focus_window?.unmake_fullscreen();
    global.display.focus_window?.delete(global.get_current_time());
    await sleep(1500);
    note(`music again 3 s: ${await frames(3000)} frames`);
    await sleep(58000);
    note(`music after more than 60 s without a change, 3 s: ${await frames(3000)} frames`);
    player.force_exit();
    await sleep(2000);
    note(`player gone, idle 3 s: ${await frames(3000)} frames; timeouts alert=${island._alertId} hover=${island._hoverId}`);
}
