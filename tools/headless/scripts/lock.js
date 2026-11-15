// Locking: Islands runs only in the user session, so on the lock screen
// none of its looks exist (nothing private can show) and GNOME's own OSD
// and banners are back; unlocking brings the island back.
export default async function ({island, sleep, note, Main}) {
    const lookup = () => Main.extensionManager.lookup('islands@thomashaiden');
    island.set({id: 'note', kind: 'notification', hint: true, title: 'Private message', sticky: true});
    await sleep(600);
    Main.screenShield.lock(false);
    await sleep(2500);
    const islands = lookup();
    note(`locked=${Main.sessionMode.isLocked} state=${islands.state} island actor=${Boolean(Main.layoutManager.uiGroup.get_children().find(a => a.name === 'islands'))} gnome osd own=${!Object.hasOwn(Main.osdWindowManager, '_showOsdWindow')}`);
    Main.screenShield.deactivate(false);
    await sleep(2500);
    note(`unlocked=${!Main.sessionMode.isLocked} state=${lookup().state} island actor=${Boolean(Main.layoutManager.uiGroup.get_children().find(a => a.name === 'islands'))}`);
}
