import {alertState, nextCheck, openMs} from '../extension/lib/alerts.js';
import {arrange, bubbleLimit, bubbleSlots, overflowText} from '../extension/lib/bubbles.js';
import {BUBBLE_GAP, layout, pillHeight, pillTop, radiusAt, shapeFor} from '../extension/lib/geometry.js';
import {fresh, motionOn, pollAllowed, tickMs, tickRate} from '../extension/lib/power.js';
import {draggedAway} from '../extension/lib/drag.js';
import {isHeadsetOutput, themeTitle} from '../extension/lib/words.js';
import {finished, readWork} from '../extension/lib/sessions.js';
import {pick} from '../extension/lib/rank.js';
import {test, equal, done} from './harness.js';

const at = (id, kind, time, extra = {}) => ({id, kind, at: time, ...extra});
const media = at('media', 'media', 1);
const timer = at('timer', 'timer', 2);
const rec = at('rec', 'recording', 3);
const claude = at('claude', 'claude', 4);
const progress = at('dl', 'progress', 5);
const call = at('call', 'call', 6);
const note = at('note', 'notification', 7, {hint: true});
const ids = list => list.map(slot => slot.activity?.id ?? overflowText(slot.overflow));

// geometry
test('pill at a 32 px bar is 26 high, 3 from the top', () => equal([pillHeight(32), pillTop(32, 26)], [26, 3]));
test('pill sizes small, standard, large', () => equal(['small', 'standard', 'large'].map(s => pillHeight(32, s)), [22, 26, 30]));
test('pill never fills the bar', () => equal([pillHeight(20, 'large'), pillHeight(10)], [18, 16]));
test('idle pill 124 x 26, round', () => equal(shapeFor('idle', 'compact', 26), {width: 124, height: 26, radius: 13}));
test('idle pill grows 3.5 % under the pointer', () => equal(shapeFor('idle', 'hover', 26), {width: 128, height: 27, radius: 13}));
test('compact widths from the canvas', () => equal(
    ['media', 'timer', 'osd', 'battery'].map(look => shapeFor(look, 'compact', 26).width), [292, 236, 300, 270]));
test('music beside a bubble narrows to 236', () => equal(shapeFor('media', 'compact', 26, {duo: true}).width, 236));
test('opened sizes from the canvas', () => equal(
    ['media', 'file', 'call', 'notification'].map(look => Object.values(shapeFor(look, 'opened', 26))),
    [[452, 184, 42], [452, 156, 40], [452, 78, 39], [452, 78, 36]]));
test('a taller bar scales the island', () => equal(shapeFor('media', 'opened', 39), {width: 678, height: 276, radius: 63}));
test('radius is round while low, then held', () => equal([radiusAt(26, 42), radiusAt(60, 42), radiusAt(184, 42)], [13, 30, 42]));
test('idle island centred on the monitor', () => equal(
    layout({monitor: {x: 0, y: 0, width: 1280}, bar: 32, pill: 26, shape: shapeFor('idle', 'compact', 26)}).island,
    {x: 578, y: 3, width: 124, height: 26, radius: 13}));
test('island and one bubble are centred as a group (canvas: 268 wide)', () => {
    const {island, bubbles} = layout({monitor: {x: 0, y: 0, width: 1440}, bar: 32, pill: 26,
        shape: shapeFor('media', 'compact', 26, {duo: true}), bubbles: 1});
    equal([island.x, bubbles[0].x, bubbles[0].x + 26 - island.x], [(1440 - 268) / 2, (1440 - 268) / 2 + 236 + BUBBLE_GAP, 268]);
});
test('opened island keeps the compact centre, bubbles stay in the bar', () => {
    const args = {monitor: {x: 1280, y: 0, width: 1024}, bar: 32, pill: 26, bubbles: 2};
    const compact = layout({...args, shape: shapeFor('media', 'compact', 26)});
    const opened = layout({...args, shape: shapeFor('media', 'opened', 26), compactWidth: 292});
    equal([compact.island.x + 146, opened.island.x + 226, opened.bubbles[0].x === compact.bubbles[0].x], [compact.island.x + 146, compact.island.x + 146, true]);
});
test('fullscreen top edge override', () => equal(
    layout({monitor: {x: 0, y: 0, width: 800}, bar: 32, pill: 26, shape: shapeFor('idle', 'compact', 26), top: 6}).island.y, 6));

// bubbles
test('bubble setting held to 0..10', () => equal([-2, 0, 3, 10, 14, 'x'].map(bubbleLimit), [0, 0, 3, 10, 10, 3]));
test('the rest waits in rank order', () => equal(arrange([media, timer, rec, claude]).waiting.map(a => a.id), ['timer', 'claude', 'media']));
test('main is what rank.js picks', () => equal(arrange([media, timer, rec]).main.id, pick([media, timer, rec]).main.id));
test('a hint shows; all that lasts waits', () => equal(
    [arrange([media, note]).main.id, arrange([media, note]).waiting.map(a => a.id)], ['note', ['media']]));
test('a call wins, the rest waits', () => equal(arrange([media, call, rec]).waiting.map(a => a.id), ['rec', 'media']));
test('dismissed things wait at the end', () => equal(
    arrange([media, timer, rec], new Set(['timer'])).waiting.map(a => a.id), ['media', 'timer']));
test('0 bubbles shows none', () => equal(bubbleSlots([media, timer], 0), []));
test('3 bubbles, 2 waiting', () => equal(ids(bubbleSlots([media, timer], 3)), ['media', 'timer']));
test('3 bubbles, 3 waiting: no overflow', () => equal(ids(bubbleSlots([media, timer, claude], 3)), ['media', 'timer', 'claude']));
test('3 bubbles, 5 waiting: last counts +3', () => equal(ids(bubbleSlots([media, timer, claude, rec, progress], 3)), ['media', 'timer', '+3']));
test('1 bubble, 2 waiting: only +2', () => equal(ids(bubbleSlots([media, timer], 1)), ['+2']));
test('10 bubbles, 12 waiting', () => {
    const many = Array.from({length: 12}, (_, i) => at(`p${i}`, 'progress', i));
    const slots = bubbleSlots(many, 10);
    equal([slots.length, overflowText(slots[9].overflow)], [10, '+3']);
});
test('nothing waiting, no bubbles', () => equal(bubbleSlots([], 10), []));

// power
test('idle: nothing ticks', () => equal(tickRate({visible: false}), 0));
test('music level 20 fps, spinner 30 fps', () => equal([tickRate({kind: 'level'}), tickRate({kind: 'spinner'})], [20, 30]));
test('fullscreen and animations off stop ticks', () => equal([tickRate({fullscreen: true}), tickRate({animations: false})], [0, 0]));
test('still for 60 s stops', () => equal([tickRate({still: 59999}), tickRate({still: 60000})], [20, 0]));
test('battery slows to 10 fps, calm stops', () => equal(
    [tickRate({kind: 'spinner', onBattery: true}), tickRate({onBattery: true, calm: true})], [10, 0]));
test('level animation off', () => equal([tickRate({levelAnimation: false}), tickRate({kind: 'spinner', levelAnimation: false})], [0, 30]));
test('tick intervals', () => equal([tickMs(20), tickMs(30), tickMs(0)], [50, 33, null]));
test('motion off with animations off or calm on battery', () => equal(
    [motionOn(), motionOn({animations: false}), motionOn({onBattery: true, calm: true}), motionOn({onBattery: true})], [true, false, false, true]));
test('polls only while running or hovered', () => equal(
    [pollAllowed('running', {running: true}), pollAllowed('running'), pollAllowed('hover', {hovered: true}), pollAllowed('always', {running: true})],
    [true, false, true, false]));
test('GPU cache 5 s', () => equal([fresh(0, 4999), fresh(0, 5000), fresh(null, 1)], [true, false, false]));

// alerts
test('open times', () => equal(['notification', 'call', 'file'].map(kind => openMs(kind)), [5000, 6000, 8000]));
test('open time follows the length setting', () => equal([openMs('notification', 'short'), openMs('notification', 'long')], [3000, 8000]));
test('a notification opens, then goes', () => equal(
    [alertState({kind: 'notification', at: 0}, 4999), alertState({kind: 'notification', at: 0}, 5000)], ['opened', 'gone']));
test('a ringing call shrinks to compact and stays', () => equal(alertState({kind: 'call', at: 0, lasting: true}, 6000), 'compact'));
test('the pointer holds it open', () => equal(alertState({kind: 'notification', at: 0}, 99999, {hovered: true}), 'opened'));
test('the pointer holds a volume change opened', () => equal(alertState({kind: 'osd', at: 0}, 99999, {hovered: true}), 'opened'));
test('own duration, scaled by the length setting', () => equal(
    [alertState({kind: 'notification', at: 0, duration: 9000}, 8999), alertState({kind: 'notification', at: 0, duration: 9000}, 9000),
        nextCheck({kind: 'notification', at: 0, duration: 1000}, 0, {length: 'long'})], ['opened', 'gone', 1600]));
test('sticky stays and asks for no timeout', () => equal(
    [alertState({kind: 'notification', at: 0, sticky: true}, 1e9), nextCheck({kind: 'notification', at: 0, sticky: true}, 0)], ['opened', null]));
test('a kind that opens on request', () => equal(alertState({kind: 'timer', at: 0, opens: true, duration: 6000}, 10), 'opened'));
test('volume opens while it changes, then goes', () => equal([alertState({kind: 'osd', at: 0}, 100), alertState({kind: 'osd', at: 0}, 1500)], ['opened', 'gone']));
test('a new use of the microphone opens, then rests in the bar', () => equal(
    [0, 2999, 3000].map(now => alertState({kind: 'privacy', at: 0, opens: true, lasting: true, duration: 3000}, now)), ['opened', 'opened', 'compact']));
test('the pointer opens a ringing call again', () => equal(alertState({kind: 'call', at: 0, lasting: true}, 99999, {hovered: true}), 'opened'));
test('an unfolded message grows by its lines', () => equal(
    [1, 3, 5].map(lines => shapeFor('notification', 'opened', 26, {lines}).height), [78, 112, 146]));
test('next check when the time runs out, none while hovered', () => equal(
    [nextCheck({kind: 'file', at: 1000}, 2000), nextCheck({kind: 'file', at: 0}, 9000), nextCheck({kind: 'file', at: 0}, 0, {hovered: true})],
    [7000, null, null]));

test('charging rests beside music, below it in rank', () => {
    const charge = at('battery', 'battery', 8, {lasting: true, opensFor: true});
    const {main, bubble} = pick([charge, media]);
    equal([main.id, bubble.id], ['media', 'battery']);
});
test('charging ranks below progress', () => equal(arrange([at('battery', 'battery', 9), progress]).main.id, 'dl'));
test('a pull needs 40 px sideways', () => equal(
    [draggedAway(100, 139), draggedAway(100, 140), draggedAway(100, 60), draggedAway(100, 100), draggedAway(100, 120, 10)],
    [false, true, true, false, true]));
test('headsets are told from speakers', () => equal([
    isHeadsetOutput({iconName: 'audio-headphones-symbolic', name: 'Headphones'}),
    isHeadsetOutput({iconName: 'audio-speakers-symbolic', name: 'Built-in Audio'}),
    isHeadsetOutput({iconName: 'audio-card-symbolic', name: 'WH-1000XM5 (Bluetooth)'}),
], [true, false, true]));
test('colour scheme words', () => equal(['prefer-dark', 'default', 'prefer-light'].map(themeTitle), ['Dark mode', 'Light mode', 'Light mode']));
test('status is its own kind in the bar', () => equal(shapeFor('status', 'compact', 26).width, 260));
test('a status rests beside music', () => {
    const {main, bubble} = pick([media, at('dnd', 'status', 9, {lasting: true, opensFor: true})]);
    equal([main.id, bubble.id], ['media', 'dnd']);
});
const file = (id, status, extra = {}) => ({sessionId: id, pid: id.length, status, cwd: '/home/toms/git/islands', startedAt: 1, statusUpdatedAt: 5, ...extra});
test('only busy and alive sessions work, newest first', () => {
    const {working, idle} = readWork([
        file('a', 'busy', {statusUpdatedAt: 5, name: 'Old'}), file('bb', 'busy', {statusUpdatedAt: 9}), file('ccc', 'idle'),
        file('dddd', 'busy', {pid: 999}), null, {pid: 1, status: 'busy'},
    ], pid => pid !== 999);
    equal([working.map(s => s.id), working.map(s => s.name), [...idle]], [['bb', 'a'], ['islands', 'Old'], ['ccc']]);
});
test('a session without a name or folder is Claude', () => equal(readWork([file('a', 'busy', {cwd: '', name: ''})], () => true).working[0].name, 'Claude'));
test('done means idle now, not crashed', () => equal(
    finished(new Map([['a', {}], ['b', {}], ['c', {}]]), new Set(['b', 'x'])), ['b']));
done('islands');
