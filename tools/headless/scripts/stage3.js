// The system's small things where the headless shell can produce it: something copied, Do
// not disturb, rain soon from a stand-in weather client, the updates
// message, the quick note typed and saved, and the glance with weather.
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';

export default async function ({extension, island, settings, shot, sleep, note, moveTo, move, click}) {
    const shape = () => `${island._state?.main?.source ?? 'idle'}/${island._state?.mode} ${island.view.shape.width}x${island.view.shape.height} "${island._state?.activity?.title ?? ''}"`;
    moveTo(640, 500);
    await sleep(800);

    settings.set_strv('disabled-sources', []);
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, 'npm run build && gjs -m tests/islands.test.js');
    await sleep(700);
    note(`copied: ${shape()}`);
    await shot('m3-clipboard');
    await sleep(2200);

    const notifications = new (await import('gi://Gio')).default.Settings({schema_id: 'org.gnome.desktop.notifications'});
    notifications.set_boolean('show-banners', false);
    await sleep(700);
    note(`dnd: ${shape()}`);
    notifications.set_boolean('show-banners', true);
    await sleep(2500);

    // Rain from a stand-in for GNOME's weather client.
    const weather = extension._sources.find(source => source.constructor.name === 'WeatherSource');
    const now = Date.now() / 1000;
    let sky = 'weather-clear-symbolic';
    const info = {
        is_valid: () => true, get_symbolic_icon_name: () => sky, get_value_temp: () => [true, 12], get_value_sky: () => [true, 0], get_sky: () => 'Clear sky',
        get_forecast_list: () => [{get_value_update: () => [true, now + 25 * 60], get_symbolic_icon_name: () => 'weather-showers-symbolic'}],
    };
    weather._client = {available: true, loading: false, hasLocation: true, info};
    weather._changed(true);
    weather._rain = null;
    weather._changed();
    await sleep(800);
    note(`rain: ${shape()} note=${island._state?.activity?.note}`);
    await shot('m3-rain');
    await sleep(5000);

    extension._sources.find(source => source.constructor.name === 'UpdatesSource').tell(7);
    await sleep(800);
    note(`updates: ${shape()}`);
    await sleep(5000);

    // The quick note.
    const file = `${GLib.get_user_cache_dir()}/vault/Inbox.md`;
    settings.set_string('quick-note-file', file);
    await sleep(300);
    await click(island.view.shape, Clutter.BUTTON_SECONDARY);
    await sleep(900);
    note(`quick note open: ${shape()} key focus=${global.stage.key_focus?.constructor.name}`);
    const seat = Clutter.get_default_backend().get_default_seat();
    const keyboard = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
    const time = () => GLib.get_monotonic_time();
    const type = async text => {
        for (const char of text) {
            const keyval = Clutter.unicode_to_keysym(char.codePointAt(0));
            keyboard.notify_keyval(time(), keyval, Clutter.KeyState.PRESSED);
            keyboard.notify_keyval(time(), keyval, Clutter.KeyState.RELEASED);
            await sleep(20);
        }
    };
    await type('call the dentist');
    await sleep(300);
    await shot('m3-note');
    keyboard.notify_keyval(time(), Clutter.KEY_Return, Clutter.KeyState.PRESSED);
    keyboard.notify_keyval(time(), Clutter.KEY_Return, Clutter.KeyState.RELEASED);
    await sleep(900);
    let written = '';
    try {
        written = new TextDecoder().decode(GLib.file_get_contents(file)[1]);
    } catch {}
    note(`quick note saved: ${shape()} file=${JSON.stringify(written)}`);

    move(island.view.shape);
    await sleep(1200);
    note(`glance: ${JSON.stringify(island._state?.activity?.items?.map(item => item.text))}`);
    await shot('m3-glance');
    moveTo(640, 500);
    await sleep(800);
}
