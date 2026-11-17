import {
    bytesText, isQuietFile, machineParts, machineText, newEaters, ollamaText, partialName, phoneLow, phoneText,
    readOllama, readPhone, readSteamLine, readTorch, steamName,
} from '../extension/lib/signals.js';
import {GLANCE_DEFAULT, glanceLines} from '../extension/lib/glance.js';
import {test, equal, done} from './harness.js';

// The shapes as the apps write them (read on 2026-11-15, values changed).
const nectar = '{"connected": true, "phone_name": "Pixel 10 Pro", "battery_level": 64, "battery_charging": false, "last_clip_preview": ""}';
const torch = JSON.stringify({
    processor: {percent: 12.4},
    apps: [
        {id: 'app.zen_browser.zen', cpu: 41, watts: null, eater: true, mayFreeze: true, frozen: false},
        {id: 'org.gnome.Shell', cpu: 2, eater: false},
        {id: 'steam', cpu: 30, eater: true, mayFreeze: true, frozen: true},
    ],
    performance: {celsius: 54, gpu: {percent: 19, celsius: 62}},
});

test('phone state', () => equal(readPhone(nectar), {connected: true, phone: 'Pixel 10 Pro', battery: 64, charging: false}));
test('phone state, broken file', () => equal([readPhone('{'), readPhone('')], [null, null]));
test('phone not connected says nothing', () => equal(phoneText(readPhone('{"connected": false}')), null));
test('phone text', () => equal(phoneText(readPhone(nectar)), 'Pixel 10 Pro · 64 %'));
test('phone low once on the way down, not while charging', () => equal([
    phoneLow({battery: 22}, {connected: true, battery: 19, charging: false}),
    phoneLow({battery: 19}, {connected: true, battery: 18, charging: false}),
    phoneLow({battery: 22}, {connected: true, battery: 19, charging: true}),
    phoneLow(null, {connected: false, battery: 5}),
], [true, false, false, false]));

test('torch state', () => {
    const state = readTorch(torch);
    equal([state.cpu, state.gpu, state.gpuCelsius, state.eaters.map(app => app.id)], [12.4, 19, 62, ['app.zen_browser.zen', 'steam']]);
});
test('torch, new eaters only, frozen left out', () => equal(
    newEaters({eaters: []}, readTorch(torch)).map(app => app.id), ['app.zen_browser.zen']));
test('torch, a known eater is not told again', () => equal(newEaters(readTorch(torch), readTorch(torch)), []));
test('machine text', () => equal(machineText(readTorch(torch)), 'CPU 12 % · GPU 19 % 62 °C'));
test('torch unreadable', () => equal([readTorch('nope'), machineText(null)], [null, null]));

test('steam: updating', () => equal(
    readSteamLine('[2026-08-03 20:29:06] AppID 431960 state changed : Fully Installed,Update Queued,Update Running,'),
    {appId: '431960', updating: true, running: false}));
test('steam: done and running', () => equal(
    readSteamLine('[2026-08-03 20:29:54] AppID 431960 state changed : Fully Installed,App Running,'),
    {appId: '431960', updating: false, running: true}));
test('steam: delayed update is not running', () => equal(
    readSteamLine('[2026-11-08 16:10:51] AppID 1493710 state changed : Update Required,Fully Installed, (Update delayed for 212953 secs)').updating, false));
test('steam: other lines', () => equal(readSteamLine('[2026-11-08 16:16:46] stats: (Invalid, 0) : 3864233 Bytes'), null));
test('steam name', () => equal([steamName('"AppState"\n{\n\t"appid"\t\t"431960"\n\t"name"\t\t"Wallpaper Engine"\n'), steamName('')], ['Wallpaper Engine', null]));

test('partial downloads', () => equal(
    ['film.mkv.part', 'setup.exe.crdownload', 'photo.jpg', 'x.part.txt'].map(partialName), ['film.mkv', 'setup.exe', null, null]));
test('quiet files', () => equal(
    ['.hidden', 'a.part', 'b.tmp', 'c~', 'photo.jpg', ''].map(isQuietFile), [true, true, true, true, false, true]));
test('bytes', () => equal([bytesText(830e3), bytesText(12.44e6), bytesText(4.7e9), bytesText(-1)], ['830 KB', '12.4 MB', '4.7 GB', '']));

test('ollama ps', () => equal(
    readOllama('{"models":[{"name":"qwen2.5:7b","size":5000000000,"size_vram":4700000000,"expires_at":"2026-11-15T17:42:00+01:00"}]}'),
    [{name: 'qwen2.5:7b', size: 4.7e9, expiresAt: Date.parse('2026-11-15T17:42:00+01:00')}]));
test('ollama nothing loaded or unreachable', () => equal([readOllama('{"models":[]}'), readOllama('')], [[], []]));
test('ollama text', () => equal(ollamaText({name: 'llama3', size: 4.7e9, expiresAt: 1}, () => '17:42'), 'llama3 · 4.7 GB · until 17:42'));

test('machine pieces: load with heat, heat left out when off', () => {
    const state = {cpu: 71.2, gpu: 17, celsius: 54.4, gpuCelsius: null, eaters: []};
    equal(machineParts(state).map(p => `${p.id}:${p.text}`), ['cpu:CPU 71 % 54 °C', 'gpu:GPU 17 %']);
    equal(machineParts(state, false).map(p => p.text), ['CPU 71 %', 'GPU 17 %']);
    equal(machineParts(null), []);
});
test('glance lines: pieces of a topic share a centred line, in order', () => equal(
    glanceLines([
        {id: 'cpu', icon: 'a', text: 'CPU 1 %'}, {id: 'gpu', icon: 'a', text: 'GPU 2 %'},
        {id: 'event', icon: 'e', text: 'Standup at 10:00'}, {id: 'weather', icon: 'w', text: '6°'},
        {id: 'disk', icon: 'd', text: '90 GB free'}, {id: 'memory', icon: 'm', text: 'RAM 40 %'},
    ], GLANCE_DEFAULT),
    [{icon: 'w', text: '6° · Standup at 10:00'}, {icon: 'a', text: 'CPU 1 % · GPU 2 %'}, {icon: 'm', text: 'RAM 40 % · 90 GB free'}]));
test('glance lines: switched off or empty pieces leave no line', () => equal(
    glanceLines([{id: 'cpu', icon: 'a', text: 'CPU 1 %'}, {id: 'uptime', icon: 'u', text: 'up 1 h'}, {id: 'weather', icon: 'w', text: ''}], ['cpu', 'weather']),
    [{icon: 'a', text: 'CPU 1 %'}]));
test('glance lines: a new piece gets its own line, five at most', () => equal(
    glanceLines(['weather', 'claude', 'cpu', 'memory', 'battery', 'x'].map(id => ({id, icon: id, text: id})), ['weather', 'claude', 'cpu', 'memory', 'battery', 'x']).length, 5));

done('signals');
