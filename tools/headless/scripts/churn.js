// What a burst of changes costs: the volume keys held down (a new level
// every 50 ms), a download that grows every second, the same island asked
// to update while it springs, and a music player that sends changes. For
// each: how often the content was built anew, and how many frames the
// stage drew until all rests.

const LEVELS = 15;

export default async function ({island, sleep, note, frames, moveTo}) {
    moveTo(640, 500);
    await sleep(2000);
    const view = island.view;
    let builds = 0;
    const build = view._build.bind(view);
    view._build = (...args) => {
        builds++;
        return build(...args);
    };
    const count = async (name, act, ms) => {
        builds = 0;
        const acting = act();
        const drawn = await frames(ms);
        await acting;
        note(`${name}: ${builds} builds, ${drawn} frames`);
    };

    // The volume keys held: one OSD per 50 ms, then rest.
    let level = 0;
    await count('volume held (15 steps)', async () => {
        for (let i = 0; i < LEVELS; i++) {
            level += 1 / LEVELS;
            island.set({id: 'osd', kind: 'osd', hint: true, duration: 1500, icon: 'audio-volume-high-symbolic',
                share: level, short: `${Math.round(level * 100)}`, title: '', key: `vol:${Math.round(level * 100)}`});
            await sleep(50);
        }
    }, 3000);
    island.remove('osd');
    await sleep(1500);

    // A download growing: a new size each 300 ms for 3 s.
    await count('download growing (10 sizes)', async () => {
        for (let i = 1; i <= 10; i++) {
            island.set({id: 'download:x.iso', kind: 'progress', source: 'progress', icon: 'folder-download-symbolic',
                title: 'x.iso', short: `${i * 10} MB`, note: `${i * 10} MB so far`});
            await sleep(300);
        }
    }, 4000);
    island.remove('download:x.iso');
    await sleep(1500);

    // A message opens; update() is asked every 30 ms while it grows.
    await count('message opening, update() every 30 ms', async () => {
        island.set({id: 'n', kind: 'notification', hint: true, duration: 4000, title: 'Hello', note: 'A message', icon: 'mail-unread-symbolic'});
        for (let i = 0; i < 20; i++) {
            island.update();
            await sleep(30);
        }
    }, 2500);
    const restingWidth = view.shape.width;
    note(`message opened: shape ${view.shape.width} x ${view.shape.height} (rests at ${restingWidth})`);
    island.remove('n');
    await sleep(1500);

    // Music: the same track, its position read anew (a player's chatter).
    const base = {id: 'media', kind: 'media', source: 'media', title: 'Song', note: 'Artist', short: 'Song',
        icon: 'audio-x-generic-symbolic', playing: true, length: 200e6, position: 0, positionAt: () => 0};
    island.set({...base, key: 'Song:Artist::true:0:200000000'});
    await sleep(1500);
    await count('music, position read 10 times', async () => {
        for (let i = 1; i <= 10; i++) {
            island.set({...base, key: `Song:Artist::true:${i}:200000000`});
            await sleep(200);
        }
    }, 2500);
    island.remove('media');
    await sleep(1500);
    note(`idle after all: ${await frames(2000)} frames`);
}
