// Two monitors (ISLANDS_MONITORS=2): the island sits on the primary one
// only, an OSD for the second monitor stays quiet; then the laptop
// battery's words through a stand-in for UPower.
import Gio from 'gi://Gio';

export default async function ({extension, island, shot, sleep, note, moveTo, Main}) {
    moveTo(640, 500);
    await sleep(800);
    const monitors = Main.layoutManager.monitors.map(m => `${m.index}:${m.x},${m.y} ${m.width}x${m.height}`).join(' ');
    note(`monitors ${monitors} primary=${Main.layoutManager.primaryIndex}`);
    const {x, width} = island.view.shape;
    const primary = Main.layoutManager.primaryMonitor;
    note(`island centre ${x + width / 2} (primary centre ${primary.x + primary.width / 2})`);
    island.set({id: 'media', kind: 'media', title: 'Track', icon: 'audio-x-generic-symbolic'});
    island.set({id: 'timer', kind: 'timer', title: '04:32', icon: 'alarm-symbolic'});
    await sleep(900);
    note(`with a bubble: island ${island.view.shape.x},${island.view.shape.y} bubble ${island.view.bubbleActors.map(b => `${b.x},${b.y}`).join(' ')}`);
    await shot('two-monitors');
    const other = Main.layoutManager.monitors.find(m => m.index !== Main.layoutManager.primaryIndex);
    if (other) {
        Main.osdWindowManager.showOne(other.index, new Gio.ThemedIcon({name: 'display-brightness-symbolic'}), null, 0.4, 1);
        await sleep(600);
        note(`OSD for monitor ${other.index}: island shows osd=${island.activities.some(a => a.id === 'osd')} GNOME window visible=${Main.osdWindowManager._osdWindows?.[other.index]?.visible ?? false}`);
    }
    island.remove('media');
    island.remove('timer');
    await sleep(900);

    const charge = extension._sources.find(source => source.constructor.name === 'ChargeSource');
    charge._charge = {percent: 82, charging: false};
    charge.pretend({percent: 82, charging: true});
    await sleep(700);
    note(`plugged in: ${island._state.main?.title} ${island._state.main?.short} ${island._state.mode} ${island.view.shape.width}x${island.view.shape.height}`);
    await shot('battery-charging');
    await sleep(3000);
    charge.pretend({percent: 82, charging: false});
    await sleep(3500);
    charge.pretend({percent: 21, charging: false});
    charge.pretend({percent: 19, charging: false});
    await sleep(700);
    note(`20 % passed: ${island._state.main?.title} ${island._state.mode}`);
    await sleep(6500);
    charge.pretend({percent: 9, charging: false});
    await sleep(900);
    note(`10 % passed: ${island._state.main?.title} ${island._state.mode} ${island.view.shape.width}x${island.view.shape.height}`);
    await shot('battery-low');
}
