// What sits beside the island as small bubbles, worked out from plain
// values. The island shows the one thing rank.js picks; everything else
// still going waits in bubbles to the right of it, in rank order. The
// setting allows 0 to 10 bubbles; when more wait than fit, the last bubble
// counts the rest as "+N".

import {byRank, pick} from './rank.js';

export const MAX_BUBBLES = 10;
export const DEFAULT_BUBBLES = 3;

// The setting held to what the bar can carry.
export function bubbleLimit(setting) {
    const count = Math.round(Number(setting));
    if (!Number.isFinite(count))
        return DEFAULT_BUBBLES;
    return Math.max(0, Math.min(MAX_BUBBLES, count));
}

// {main, waiting}: main as rank.js picks it, waiting the other lasting
// things in rank order. A hint (a short message) is never kept waiting: it
// shows or it is gone. Dismissed lasting things wait at the end, so a click
// on their bubble brings them back.
export function arrange(activities, dismissed = new Set(), focus = null) {
    const {main} = pick(activities, dismissed, focus);
    const lasting = activities.filter(activity => !activity.hint && activity !== main);
    const live = lasting.filter(activity => !dismissed.has(activity.id)).sort(byRank);
    const away = lasting.filter(activity => dismissed.has(activity.id)).sort(byRank);
    return {main, waiting: [...live, ...away]};
}

// The bubbles to draw for what waits: [{activity}] and, when more wait
// than `limit` allows, a last {overflow: n} that stands for n of them.
export function bubbleSlots(waiting, limit) {
    const max = bubbleLimit(limit);
    if (max === 0 || waiting.length === 0)
        return [];
    if (waiting.length <= max)
        return waiting.map(activity => ({activity}));
    const shown = waiting.slice(0, max - 1).map(activity => ({activity}));
    return [...shown, {overflow: waiting.length - (max - 1)}];
}

// The text of an overflow bubble.
export function overflowText(count) {
    return `+${count}`;
}
