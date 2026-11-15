// The companion apps through stand-ins, each through the path the
// real app uses: NectarLink's widget file, Tally's cache, a Torch D-Bus
// service, browser and LocalSend files in (a scratch) Downloads, Steam's
// content log (a scratch Steam folder), and the glance on hover.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const here = GLib.path_get_dirname(GLib.path_get_dirname(GLib.getenv('ISLANDS_SCRIPT')));
const extensionDir = `${GLib.path_get_dirname(GLib.path_get_dirname(here))}/extension`;

export default async function ({extension, island, shot, sleep, note, moveTo, move, click}) {
    const shape = () => {
        const {x, y, width, height} = island.view.shape;
        const main = island._state?.main;
        return `${main?.source ?? main?.kind ?? 'idle'}/${island._state?.mode} ${width}x${height} "${island._state?.activity?.title ?? ''}"`;
    };
    const write = (path, text) => {
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o755);
        GLib.file_set_contents(path, text);
    };
    moveTo(640, 500);
    // Written in place, as a browser or LocalSend writes (not through a
    // temporary name, which the source must also cope with; see below).
    const writeInPlace = (path, text) => {
        const stream = Gio.File.new_for_path(path).replace(null, false, Gio.FileCreateFlags.NONE, null);
        stream.write_all(new TextEncoder().encode(text), null);
        stream.close(null);
    };

    // NectarLink: the phone connects, then runs low.
    const phoneFile = `${GLib.get_user_data_dir()}/Nectarlink/widget-state.json`;
    write(phoneFile, JSON.stringify({connected: true, phone_name: 'Pixel 10 Pro', battery_level: 22, battery_charging: false}));
    await sleep(1500);
    note(`phone connects: ${shape()}`);
    await shot('m2-phone');
    await sleep(3000);
    write(phoneFile, JSON.stringify({connected: true, phone_name: 'Pixel 10 Pro', battery_level: 19, battery_charging: false}));
    await sleep(1500);
    note(`phone low: ${shape()}`);
    await sleep(3000);

    // Tally: the five hours pass 80 %.
    const tally = `${GLib.get_user_cache_dir()}/tally/limits.json`;
    const limits = percent => JSON.stringify({at: Date.now(), limits: {session: {percent, resetsAt: Date.now() + 3600e3}, week: {percent: 40, resetsAt: Date.now() + 5 * 86400e3}}});
    write(tally, limits(70));
    await sleep(1500);
    write(tally, limits(85));
    await sleep(1500);
    note(`claude limit: ${shape()} note=${island._state?.activity?.note}`);
    await shot('m2-claude');
    await sleep(5000);

    // Torch: TextEditor eats power (the stand-in says so after 4 s).
    const torch = Gio.Subprocess.new(['gjs', '-m', `${here}/torch.js`, '40'], Gio.SubprocessFlags.STDOUT_PIPE);
    await sleep(5500);
    note(`torch: ${shape()}`);
    await shot('m2-torch');
    const find = (actor, text) => (actor.label === text ? actor : actor.get_children().map(child => find(child, text)).find(Boolean) ?? null);
    const freeze = find(island.view.shape, 'Freeze');
    note(`freeze button found=${Boolean(freeze)}`);
    if (freeze) {
        await click(freeze);
        await sleep(800);
    }
    note(`after freeze: ${shape()}`);
    moveTo(640, 500);
    await sleep(1000);

    // Downloads: Zen's .part grows, then is renamed; LocalSend drops a file.
    const downloads = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_DOWNLOAD);
    note(`downloads folder: ${downloads}`);
    writeInPlace(`${downloads}/film.mkv.part`, 'x'.repeat(200000));
    await sleep(1800);
    writeInPlace(`${downloads}/film.mkv.part`, 'x'.repeat(2400000));
    await sleep(1800);
    note(`download running: ${shape()} note=${island.activities.find(a => a.id === 'download:film.mkv')?.note}`);
    await shot('m2-download');
    Gio.File.new_for_path(`${downloads}/film.mkv.part`).move(Gio.File.new_for_path(`${downloads}/film.mkv`), Gio.FileCopyFlags.NONE, null, null);
    await sleep(1800);
    note(`download done: ${shape()} note=${island._state?.activity?.note}`);
    await shot('m2-downloaded');
    await sleep(8500);
    writeInPlace(`${downloads}/IMG_2041.jpg`, 'y'.repeat(3400000));
    await sleep(1800);
    note(`localsend file: ${shape()}`);
    await sleep(8500);
    // Saved through a temporary name: one message, for the final name.
    GLib.file_set_contents(`${downloads}/notes.txt`, 'hello');
    await sleep(1800);
    note(`saved via a temporary name: ${shape()} file messages=${island.activities.filter(a => a.kind === 'file').map(a => a.title).join(' | ')}`);
    await sleep(8500);

    // Steam, from a scratch Steam folder with the same layout.
    const {SteamSource} = await import(`file://${extensionDir}/sources/steam.js`);
    const root = `${GLib.get_user_cache_dir()}/steam`;
    write(`${root}/logs/content_log.txt`, '[2026-11-15 10:00:00] start\n');
    write(`${root}/steamapps/appmanifest_431960.acf`, '"AppState"\n{\n\t"appid"\t\t"431960"\n\t"name"\t\t"Wallpaper Engine"\n}\n');
    const steam = new SteamSource(island, root);
    const append = line => {
        const stream = Gio.File.new_for_path(`${root}/logs/content_log.txt`).append_to(Gio.FileCreateFlags.NONE, null);
        stream.write_all(new TextEncoder().encode(`${line}\n`), null);
        stream.close(null);
    };
    append('[2026-11-15 10:00:01] AppID 431960 state changed : Fully Installed,Update Queued,Update Running,');
    await sleep(2000);
    note(`steam updating: ${shape()}`);
    await shot('m2-steam');
    append('[2026-11-15 10:00:09] AppID 431960 state changed : Fully Installed,');
    await sleep(2000);
    note(`steam done: ${shape()}`);
    steam.destroy();
    await sleep(3500);

    // The glance on hover: event (none here), phone, Claude, machine.
    move(island.view.shape);
    await sleep(1200);
    note(`glance: ${island._state?.mode} ${island.view.shape.width}x${island.view.shape.height} items=${JSON.stringify(island._state?.activity?.items?.map(item => item.text))}`);
    await shot('m2-glance');
    moveTo(640, 500);
    await sleep(1000);
    torch.force_exit();
    const [, out] = torch.communicate_utf8(null, null) ?? [];
    note(`torch heard: ${(out ?? '').trim().split('\n').filter(Boolean).join(' | ')}`);
}
