// The island's sizes in every state, from the design canvas. The canvas
// measures at a 32 px bar with a 26 px pill; everything here is bound to
// the real bar height, so a taller or shorter bar scales the island with it.
// All results are whole logical pixels, so nothing is drawn between pixels
// and a resting island never asks for another frame.

// The pill on the canvas: 3 px below the bar's top edge, bar height − 6.
export const CANVAS_PILL = 26;
const TOP = 3;

// A compact height of 22, 26 or 30 px at the canvas' 32 px bar.
export const SIZE_OFFSET = {small: -4, standard: 0, large: 4};

// The gap between the island and a bubble, and between bubbles.
export const BUBBLE_GAP = 6;

// Width at rest in the bar (the pill's height is always the bar's). null
// means the look has no compact form of its own and uses the idle width.
export const COMPACT_WIDTH = {
    idle: 124,
    media: 292,
    timer: 236,
    alarm: 236,
    // Beside a bubble the canvas narrows music to 236.
    duo: 236,
    osd: 300,
    battery: 270,
    status: 260,
    call: 236,
    recording: 236,
    privacy: 236,
    claude: 260,
    progress: 260,
    file: 260,
    notification: 300,
    actions: 300,
};

// Opened below the bar: [width, height, radius].
export const OPENED = {
    media: [452, 184, 42],
    file: [452, 156, 40],
    call: [452, 78, 39],
    notification: [452, 78, 36],
    note: [452, 78, 36],
    // A notification or alarm with buttons below its text.
    actions: [452, 132, 38],
    // The glance on hover: two lines, then 26 px more for each line; one
    // line alone is lower.
    glance: [452, 78, 36],
    glance1: [452, 52, 26],
    glance3: [452, 104, 38],
    glance4: [452, 130, 40],
    glance5: [452, 156, 40],
    timer: [452, 110, 40],
    alarm: [452, 110, 40],
    claude: [452, 110, 40],
    progress: [452, 110, 40],
    recording: [452, 78, 36],
    privacy: [452, 78, 36],
    osd: [452, 78, 36],
    battery: [452, 78, 36],
    status: [452, 78, 36],
};

// One more line of a message's body (13 px text) when it unfolds.
export const NOTE_LINE = 17;

// Lantern, grown out of the island.
export const LANTERN = {width: 680, radius: 32};

// The idle pill grows this much under the pointer (the canvas: 3.5 %).
export const HOVER_GROW = 0.035;

// The pill's height for a bar of `bar` px and a size setting.
export function pillHeight(bar, size = 'standard') {
    const height = bar - 6 + (SIZE_OFFSET[size] ?? 0);
    return Math.max(16, Math.min(bar - 2, Math.round(height)));
}

// How much the canvas' widths grow or shrink for this pill.
export function scaleFor(pill) {
    return pill / CANVAS_PILL;
}

// Where the pill sits below the bar's top edge: centred in the bar.
export function pillTop(bar, pill) {
    return Math.max(0, Math.round((bar - pill) / 2));
}

// {width, height, radius} for a look in a state:
//   state 'compact' rests in the bar, 'opened' hangs below it,
//   'hover' is compact grown a little (the idle pill under the pointer).
//   lines: an opened message unfolded to this many lines of its body.
export function shapeFor(look, state, pill, {duo = false, lines = 1} = {}) {
    const scale = scaleFor(pill);
    if (state === 'opened') {
        const [width, height, radius] = OPENED[look] ?? OPENED.notification;
        const more = Math.max(0, Math.round(lines) - 1) * NOTE_LINE;
        return {width: Math.round(width * scale), height: Math.round((height + more) * scale), radius: Math.round(radius * scale)};
    }
    let width = COMPACT_WIDTH[duo && look === 'media' ? 'duo' : look] ?? COMPACT_WIDTH.idle;
    width = Math.round(width * scale);
    let height = pill;
    if (state === 'hover') {
        width = Math.round(width * (1 + HOVER_GROW));
        height = Math.round(pill * (1 + HOVER_GROW));
    }
    return {width, height, radius: Math.floor(height / 2)};
}

// The corner radius on the way between shapes: round at the ends while the
// shape is low, then held at the opened look's radius. max is the larger
// radius of the two shapes the spring moves between.
export function radiusAt(height, max) {
    return Math.max(0, Math.min(Math.floor(height / 2), Math.round(max)));
}

// Lays the island and its bubbles out on a monitor. The island with its
// bubbles is centred as one group in the bar, as on the canvas, so a bubble
// coming in moves the island half a bubble to the left. An opened island
// hangs from the same top edge and keeps its own centre; the bubbles stay
// in the bar beside where the compact island was.
//   monitor {x, y, width}; bar: the bar's height; shape: the island's;
//   compactWidth: the island's width in the bar (for where bubbles go);
//   bubbles: how many; top: an override for the top edge (fullscreen).
export function layout({monitor, bar, pill, shape, compactWidth = shape.width, bubbles = 0, top = null}) {
    const y = monitor.y + (top ?? pillTop(bar, pill));
    const row = bubbles > 0 ? bubbles * (pill + BUBBLE_GAP) : 0;
    const centre = monitor.x + Math.round(monitor.width / 2) - Math.round(row / 2);
    const islandX = centre - Math.round(shape.width / 2);
    const compactRight = centre + Math.round(compactWidth / 2);
    const dots = Array.from({length: bubbles}, (_, i) => ({
        x: compactRight + BUBBLE_GAP + i * (pill + BUBBLE_GAP),
        y,
        size: pill,
    }));
    return {island: {x: islandX, y, width: shape.width, height: shape.height, radius: shape.radius}, bubbles: dots};
}
