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
