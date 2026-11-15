// Switching on and off many times, with things going on and the island
// opened: nothing of Islands may stay behind, and no JS error may come.
export default async function ({extension, sleep, note, shot, Main}) {
    const children = () => Main.layoutManager.uiGroup.get_n_children();
    const before = children();
    const tracked = () => Main.layoutManager._trackedActors.length;
    const trackedBefore = tracked();
    note(`on: uiGroup children=${before} tracked=${trackedBefore}`);
    for (let i = 0; i < 10; i++) {
        const island = extension._island;
        island.set({id: 'media', kind: 'media', title: 'Track', icon: 'audio-x-generic-symbolic'});
        island.set({id: 'timer', kind: 'timer', title: '01:00', icon: 'alarm-symbolic'});
        if (i % 2 === 0)
            island._expanded = 'timer';
        island.set({id: `note${i}`, kind: 'notification', hint: true, title: 'Hello'});
        await sleep(i % 3 === 0 ? 40 : 300);
        extension.disable();
        await sleep(100);
        note(`off ${i}: uiGroup children=${children()} tracked=${tracked()} islands actor=${Boolean(Main.layoutManager.uiGroup.get_children().find(a => a.name === 'islands'))}`);
        extension.enable();
        await sleep(300);
    }
    extension.disable();
    await sleep(500);
    note(`disabled: uiGroup children=${children()} (on: ${before}, off should be one less) tracked=${tracked()} (on: ${trackedBefore})`);
    note(`GNOME's own back: osd=${!Object.hasOwn(Main.osdWindowManager, '_showOsdWindow')} banners=${!Object.hasOwn(Main.messageTray, '_showNotification')} notify=${!Object.hasOwn(Main.notificationDaemon?._fdoNotificationDaemon ?? {}, 'NotifyAsync')}`);
    await shot('off');
    extension.enable();
    await sleep(500);
    note(`enabled again: uiGroup children=${children()} tracked=${tracked()}`);
    await shot('on');
}
