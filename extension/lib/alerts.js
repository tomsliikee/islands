// Short messages that open the island and leave by themselves. Each kind
// stays open for its own time, then the island shrinks back to what lasts
// (or to the compact form of the message itself, such as a call's small
// answer and decline bubbles). The pointer on the island holds it open.

// How long each kind stays open, in ms (notification 5 s, call
// 6 s, file 8 s). A volume change stays 1.5 s after its last step.
export const OPEN_MS = {notification: 5000, call: 6000, file: 8000, osd: 1500, battery: 3000};
const DEFAULT_MS = 5000;

// The setting "length of short messages".
export const LENGTHS = {short: 0.6, normal: 1, long: 1.6};

export function openMs(kind, length = 'normal') {
    return Math.round((OPEN_MS[kind] ?? DEFAULT_MS) * (LENGTHS[length] ?? 1));
}

// Kinds whose message opens the island below the bar while one acts (a
// volume step, Caps Lock); the others (battery) change only its compact
// form.
export const OPENS = new Set(['notification', 'call', 'file', 'osd']);

// A message may bring its own time (`duration`, in ms at normal length);
// a sticky one (a critical notification with buttons) stays until acted on.
function untilOf(alert, length) {
    if (alert.sticky)
        return Infinity;
    const ms = alert.duration ? Math.round(alert.duration * (LENGTHS[length] ?? 1)) : openMs(alert.kind, length);
    return alert.at + ms;
}

// What a short message is doing at `now`:
//   'opened' while its time runs or the pointer holds it,
//   'compact' after that for kinds that stay (a call still ringing),
//   'gone' for kinds that leave.
// alert {kind, at, lasting, opens, duration, sticky}: lasting is true for
// what goes on after its time (a ringing call); opens makes a kind open
// below the bar that otherwise would not (a timer that ran out).
export function alertState(alert, now, {length = 'normal', hovered = false} = {}) {
    if (hovered)
        return OPENS.has(alert.kind) || alert.opens ? 'opened' : 'compact';
    const until = untilOf(alert, length);
    if (now < until)
        return OPENS.has(alert.kind) || alert.opens ? 'opened' : 'compact';
    return alert.lasting ? 'compact' : 'gone';
}

// When to look again (ms from now), or null when nothing changes by time.
// The pointer leaving restarts nothing: the message shrinks at once if its
// time is over.
export function nextCheck(alert, now, {length = 'normal', hovered = false} = {}) {
    if (hovered)
        return null;
    const until = untilOf(alert, length);
    return now < until && until !== Infinity ? until - now : null;
}
