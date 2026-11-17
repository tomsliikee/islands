// Pulling the island sideways with the mouse puts it away as a bubble, as
// a right click does. Worked out from plain values so it can be tested.

// How far (px) a press must move sideways to count as a pull, not a click.
export const DRAG_AWAY_PX = 40;

export function draggedAway(startX, x, threshold = DRAG_AWAY_PX) {
    return Math.abs(x - startX) >= threshold;
}
