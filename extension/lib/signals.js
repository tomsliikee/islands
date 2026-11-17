// Readers for the signals of the companion apps (NectarLink, Torch, Steam), from
// plain text so they can be tested without the apps: NectarLink's widget
// state, Torch's D-Bus state, Steam's content log, files in Downloads and
// Ollama's /api/ps. Anything unreadable gives null or an empty list.

function parse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

const finite = value => (Number.isFinite(value) ? value : null);

// ~/.local/share/Nectarlink/widget-state.json: {connected, phone_name,
// battery_level, battery_charging}. {connected, phone, battery, charging}.
export function readPhone(text) {
    const raw = parse(text);
    if (!raw || typeof raw !== 'object')
        return null;
    return {
        connected: raw.connected === true,
        phone: typeof raw.phone_name === 'string' ? raw.phone_name : '',
        battery: finite(raw.battery_level),
        charging: raw.battery_charging === true,
    };
}

// The phone's battery crossed 20 % on its way down: tell once, not while
// charging. Returns whether to tell.
export function phoneLow(before, after, mark = 20) {
    if (!after?.connected || after.charging || after.battery === null)
        return false;
    const was = before?.battery ?? 100;
    return was > mark && after.battery <= mark;
}

// The glance's phone item: "Pixel 10 Pro · 64 %", null when not connected.
export function phoneText(phone) {
    if (!phone?.connected)
        return null;
    const battery = phone.battery !== null ? `${Math.round(phone.battery)} %${phone.charging ? ' charging' : ''}` : '';
    return [phone.phone || 'Phone', battery].filter(Boolean).join(' · ');
}

// Torch's State property (JSON). {cpu, gpu, gpuCelsius, celsius, eaters}:
// eaters are the apps Torch marks as eating power that may be frozen.
export function readTorch(text) {
    const raw = parse(text);
    if (!raw || typeof raw !== 'object')
        return null;
    const apps = Array.isArray(raw.apps) ? raw.apps : [];
    const gpu = raw.performance?.gpu ?? null;
    return {
        cpu: finite(raw.processor?.percent),
        gpu: finite(gpu?.percent),
        gpuCelsius: finite(gpu?.celsius),
        celsius: finite(raw.performance?.celsius),
        eaters: apps.filter(app => app?.eater === true && typeof app.id === 'string')
            .map(app => ({id: app.id, cpu: finite(app.cpu), watts: finite(app.watts), mayFreeze: app.mayFreeze === true, frozen: app.frozen === true})),
    };
}

// Eaters that were not eaters in the reading before: the island tells
// each once.
export function newEaters(before, after) {
    const known = new Set((before?.eaters ?? []).map(app => app.id));
    return (after?.eaters ?? []).filter(app => !known.has(app.id) && !app.frozen);
}

// The glance's machine item: "CPU 12 % · GPU 19 % 62 °C".
export function machineText(torch) {
    if (!torch)
        return null;
    const parts = [];
    if (torch.cpu !== null)
        parts.push(`CPU ${Math.round(torch.cpu)} %`);
    if (torch.gpu !== null)
        parts.push(`GPU ${Math.round(torch.gpu)} %${torch.gpuCelsius !== null ? ` ${Math.round(torch.gpuCelsius)} °C` : ''}`);
    return parts.length > 0 ? parts.join(' · ') : null;
}

// The glance's machine pieces: [{id: 'cpu' | 'gpu', icon, text}]. Heat
// shows beside the load when `temps` is on and Torch knows it.
export function machineParts(torch, temps = true) {
    if (!torch)
        return [];
    const heat = celsius => (temps && celsius !== null ? ` ${Math.round(celsius)} °C` : '');
    const parts = [];
    if (torch.cpu !== null)
        parts.push({id: 'cpu', icon: 'power-profile-performance-symbolic', text: `CPU ${Math.round(torch.cpu)} %${heat(torch.celsius)}`});
    if (torch.gpu !== null)
        parts.push({id: 'gpu', icon: 'power-profile-performance-symbolic', text: `GPU ${Math.round(torch.gpu)} %${heat(torch.gpuCelsius)}`});
    return parts;
}

// One line of Steam's logs/content_log.txt about an app's state:
// {appId, updating, running} or null for other lines.
export function readSteamLine(line) {
    const match = /AppID (\d+) state changed : (.*)$/.exec(line ?? '');
    if (!match)
        return null;
    const flags = match[2].split(',').map(flag => flag.trim().replace(/\s*\(.*$/, '')).filter(Boolean);
    return {appId: match[1], updating: flags.includes('Update Running'), running: flags.includes('App Running')};
}

// An app's name from its appmanifest_<id>.acf ("name" "Counter-Strike 2").
export function steamName(manifest) {
    return /"name"\s+"([^"]*)"/.exec(manifest ?? '')?.[1] ?? null;
}

// A browser's file that is still being downloaded: the name it will have,
// or null. Firefox and Zen write "<name>.part", Chrome "<name>.crdownload".
export function partialName(fileName) {
    const match = /^(.+?)\.(part|crdownload)$/.exec(fileName ?? '');
    return match ? match[1] : null;
}

// Files in Downloads that are not news: hidden files, temporary names.
export function isQuietFile(fileName) {
    return !fileName || fileName.startsWith('.') || partialName(fileName) !== null ||
        /\.(tmp|download|crswap)$|~$/.test(fileName);
}

// "12.4 MB", "830 KB".
export function bytesText(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0)
        return '';
    if (bytes >= 1e9)
        return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes >= 1e6)
        return `${(bytes / 1e6).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

// Ollama's GET /api/ps: [{name, size, expiresAt (ms)}].
export function readOllama(text) {
    const raw = parse(text);
    const models = Array.isArray(raw?.models) ? raw.models : [];
    return models.filter(model => typeof model?.name === 'string').map(model => ({
        name: model.name,
        size: finite(model.size_vram ?? model.size),
        expiresAt: Number.isFinite(Date.parse(model.expires_at)) ? Date.parse(model.expires_at) : null,
    }));
}

// "qwen2.5:7b · 4.7 GB · until 17:42" for a loaded model.
export function ollamaText(model, timeOf) {
    return [model.name, model.size ? bytesText(model.size) : '', model.expiresAt ? `until ${timeOf(model.expiresAt)}` : '']
        .filter(Boolean).join(' · ');
}
