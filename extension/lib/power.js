// What the island may spend, worked out from plain values so the rules can
// be tested without a shell. At rest it spends nothing: no timer, no poll,
// no frame. Everything else is allowed only while it can be seen.

// A level (music) and a spinner (something working) tick at these rates;
// on battery with the calm setting they slow to BATTERY_FPS or stop.
export const LEVEL_FPS = 20;
export const SPINNER_FPS = 30;
export const BATTERY_FPS = 10;
// A tick that has shown no change for this long stops until the next change.
export const STILL_MS = 60000;
// The GPU's reading is shared for this long between hovers.
export const GPU_CACHE_MS = 5000;

// Whether springs move or values are set at once: off with the desktop's
// animations off, and on battery when the calm setting is on.
export function motionOn({animations = true, onBattery = false, calm = false} = {}) {
    return animations && !(onBattery && calm);
}

// Frames per second for a level or spinner, 0 when it must not tick.
//   kind: 'level' | 'spinner'; visible: the island can be seen (not
//   hidden, not locked away, its monitor not covered by a fullscreen
//   window unless it shows there); still: ms since the shown value last
//   changed; levelAnimation: the setting "level animation".
export function tickRate({kind = 'level', visible = true, fullscreen = false, onBattery = false, calm = false,
    animations = true, levelAnimation = true, still = 0} = {}) {
    if (!visible || fullscreen || !animations || still >= STILL_MS)
        return 0;
    if (kind === 'level' && !levelAnimation)
        return 0;
    if (onBattery && calm)
        return 0;
    const rate = kind === 'spinner' ? SPINNER_FPS : LEVEL_FPS;
    return onBattery ? Math.min(rate, BATTERY_FPS) : rate;
}

// The interval in ms for a rate, null for 0 fps.
export function tickMs(rate) {
    return rate > 0 ? Math.round(1000 / rate) : null;
}

// Whether a source may poll now. Polls exist only while their thing runs
// ('running') or only while the island is hovered ('hover').
export function pollAllowed(when, {running = false, hovered = false} = {}) {
    if (when === 'running')
        return running;
    if (when === 'hover')
        return hovered;
    return false;
}

// Whether a cached reading taken at `at` still counts at `now`.
export function fresh(at, now, ms = GPU_CACHE_MS) {
    return at !== null && at !== undefined && now - at < ms;
}
