// Opens the settings window and shows it: the Top Bar Organizer hint must
// be the first thing on the page.
export default async function ({extension, shot, sleep, note}) {
    await sleep(1000);
    extension.openPreferences();
    await sleep(7000);
    const windows = global.get_window_actors().map(actor => actor.meta_window);
    note(`windows: ${JSON.stringify(windows.map(w => w.get_title()))}`);
    const window = windows.find(w => w.get_title()?.includes('Islands'));
    if (!window) {
        note('FAIL no settings window');
        return;
    }
    window.maximize();
    await sleep(1000);
    await shot('prefs');
}
