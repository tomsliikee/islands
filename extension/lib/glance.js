// The glance on hover, as plain values: which pieces exist, which are on by
// default, and how the pieces that are on are set into centred lines.
// A piece is {id, icon, text}; a line is {icon, text} (one icon, the
// pieces of its topic joined with " · ").

// [id, title, subtitle] in the order the settings list them.
export const GLANCE_PARTS = [
    ['weather', 'Weather', 'Temperature and sky'],
    ['event', 'Next event', 'From your calendars, today'],
    ['claude', 'Claude limits', 'Five hours, week and when they start again (from Tally)'],
    ['ollama', 'Local model', 'A model that is loaded or answering'],
    ['phone', 'Phone', 'Battery and state over NectarLink'],
    ['cpu', 'Processor', 'Load, from Torch'],
    ['gpu', 'Graphics card', 'Load, from Torch'],
    ['temps', 'Temperatures', 'Processor and graphics card heat, from Torch'],
    ['memory', 'Memory', 'How much of the RAM is in use'],
    ['disk', 'Disk space', 'What is free on the home drive'],
    ['battery', 'Battery', 'Charge of this computer; nothing on a desktop'],
    ['uptime', 'Uptime', 'Since when the computer runs'],
];

export const GLANCE_DEFAULT = ['weather', 'event', 'claude', 'ollama', 'phone', 'cpu', 'gpu', 'temps', 'memory', 'disk', 'battery'];

// Pieces of one topic share a line, top to bottom. A piece that is in no
// line (a new one) gets a line of its own at the end.
const LINES = [
    ['weather', 'event'],
    ['claude', 'ollama', 'phone'],
    ['cpu', 'gpu'],
    ['memory', 'disk'],
    ['battery', 'uptime'],
];

// The most lines the island unfolds to.
export const GLANCE_MAX_LINES = 5;

// pieces: [{id, icon, text}]; enabled: ids that are on. Pieces of an id
// that is off, or without text, are left out; empty lines too.
export function glanceLines(pieces, enabled) {
    const on = new Set(enabled);
    const live = pieces.filter(piece => piece?.text && on.has(piece.id));
    const placed = new Set(LINES.flat());
    const groups = [...LINES, ...live.filter(piece => !placed.has(piece.id)).map(piece => [piece.id])];
    return groups
        .map(ids => ids.map(id => live.find(piece => piece.id === id)).filter(Boolean))
        .filter(group => group.length > 0)
        .map(group => ({icon: group[0].icon, text: group.map(piece => piece.text).join(' · ')}))
        .slice(0, GLANCE_MAX_LINES);
}
