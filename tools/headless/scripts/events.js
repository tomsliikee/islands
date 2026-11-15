// Events from a stand-in calendar (the headless shell has none): one that
// starts in 10 minutes is told, the glance on hover shows the next one,
// and the source plans exactly one timeout for the next moment.
export default async function ({extension, island, shot, sleep, note, moveTo, move}) {
    const events = extension._events;
    const now = Date.now();
    const at = ms => new Date(now + ms);
    const fake = {
        hasCalendars: true, isLoading: false,
        getEvents: () => [
            {id: 'a', summary: 'Standup', date: at(10 * 60000 - 2000), end: at(40 * 60000)},
            {id: 'b', summary: 'Review', date: at(3 * 3600000), end: at(4 * 3600000)},
        ],
    };
    events._source?.disconnectObject(events);
    events._source = fake;
    events._look();
    await sleep(900);
    const main = island._state.main;
    note(`told: ${main?.title} / ${main?.note} mode=${island._state.mode}`);
    await shot('events-soon');
    note(`planned timeout: ${events._timeoutId ? 'yes' : 'no'}`);
    events._look();
    await sleep(200);
    note(`told twice? notifications=${island.activities.filter(a => a.source === 'events').length}`);
    island.remove('event:a');
    moveTo(640, 500);
    await sleep(800);
    move(island.view.shape);
    await sleep(900);
    note(`glance: mode=${island._state.mode} kind=${island._state.kind} ${island.view.shape.width}x${island.view.shape.height} title=${island._state.activity?.title} note=${island._state.activity?.note}`);
    await shot('events-glance');
    moveTo(640, 500);
    await sleep(900);
    note(`glance gone: mode=${island._state.mode} ${island.view.shape.width}x${island.view.shape.height}`);
}
