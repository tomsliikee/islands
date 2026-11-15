// Rain soon, from a forecast as plain values ([{at (ms), icon}] in time
// order, icon a GWeather symbolic icon name), so it can be tested without
// GNOME's weather client.

const WET = /(showers|rain|storm|snow|drizzle)/;

export function isWet(icon) {
    return WET.test(icon ?? '');
}

// Minutes until the first wet forecast within `withinMin`, 0 when it is
// wet now, null when it stays dry.
export function rainSoon(now, current, forecasts, withinMin = 60) {
    if (isWet(current))
        return 0;
    for (const {at, icon} of forecasts ?? []) {
        const minutes = Math.round((at - now) / 60000);
        if (minutes < 0)
            continue;
        if (minutes > withinMin)
            break;
        if (isWet(icon))
            return minutes;
    }
    return null;
}

// A new rain worth telling: soon now and not soon at the last look.
export function newRain(before, after) {
    return after !== null && (before === null || before === undefined);
}

// The forecast entry closest to now ([{at (ms), ...}]), or null when none
// lies within `withinMin`. Stands in for current readings a station did
// not give (met.no gives forecasts only; METAR often leaves the sky out).
export function nearest(now, entries, withinMin = 90) {
    let best = null;
    for (const entry of entries ?? []) {
        const distance = Math.abs(entry.at - now);
        if (distance <= withinMin * 60000 && (!best || distance < Math.abs(best.at - now)))
            best = entry;
    }
    return best;
}

// The glance line: "3° · Clear sky · rain in 20 min". The temperature is a
// bare degree in GWeather's unit, as GNOME's date menu shows it.
export function glanceText({temp = null, sky = '', rainIn = null}) {
    const parts = [];
    if (Number.isFinite(temp))
        parts.push(`${Math.round(temp)}°`);
    if (sky)
        parts.push(sky);
    if (rainIn !== null)
        parts.push(rainIn === 0 ? 'raining' : `rain in ${rainIn} min`);
    return parts.join(' · ');
}

// GWeather's sky text, or '' for its placeholders ("-", "unknown",
// "invalid").
export function cleanSky(text) {
    const sky = (text ?? '').trim();
    return /^(-+|unknown|invalid)$/i.test(sky) ? '' : sky;
}
