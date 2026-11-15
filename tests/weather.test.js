import {cleanSky, glanceText, isWet, nearest, newRain, rainSoon} from '../extension/lib/weather.js';
import {test, equal, done} from './harness.js';

const at = minutes => minutes * 60000;
test('wet icons', () => equal(['weather-showers-symbolic', 'weather-storm-symbolic', 'weather-clear-symbolic', null].map(isWet), [true, true, false, false]));
test('wet now', () => equal(rainSoon(0, 'weather-showers-scattered-symbolic', []), 0));
test('rain in 40 min', () => equal(rainSoon(0, 'weather-clear-symbolic', [
    {at: at(-20), icon: 'weather-showers-symbolic'}, {at: at(20), icon: 'weather-few-clouds-symbolic'}, {at: at(40), icon: 'weather-showers-symbolic'},
]), 40));
test('rain later than an hour is not soon', () => equal(rainSoon(0, 'weather-clear-symbolic', [{at: at(90), icon: 'weather-storm-symbolic'}]), null));
test('dry', () => equal(rainSoon(0, 'weather-overcast-symbolic', [{at: at(30), icon: 'weather-fog-symbolic'}]), null));
test('told once until it was dry again', () => equal([newRain(null, 30), newRain(40, 30), newRain(null, null)], [true, false, false]));
test('nearest forecast within 90 min', () => equal([
    nearest(at(0), [{at: at(-50)}, {at: at(20)}, {at: at(80)}])?.at,
    nearest(at(0), [{at: at(100)}]),
    nearest(at(0), []),
], [at(20), null, null]));
test('sky placeholders are no sky', () => equal(['unknown', 'Unknown', '-', 'Invalid', ' Clear sky '].map(cleanSky), ['', '', '', '', 'Clear sky']));
test('glance line', () => equal([
    glanceText({temp: -0.6, sky: 'Clear sky', rainIn: null}),
    glanceText({temp: 3.4, sky: '', rainIn: 20}),
    glanceText({temp: null, sky: '', rainIn: 0}),
    glanceText({}),
], ['-1° · Clear sky', '3° · rain in 20 min', 'raining', '']));
done('weather');
