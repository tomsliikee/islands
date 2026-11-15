// Rain soon, from GNOME's own weather client (the one the date menu
// keeps): its 'changed' signal is heard, and it refreshes when GNOME
// refreshes it; Islands asks the network for nothing. Told once when rain
// comes within the hour; the glance shows the temperature and the sky.


import GWeather from 'gi://GWeather?version=4.0';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {cleanSky, glanceText, nearest, newRain, rainSoon} from '../lib/weather.js';
import {rainText} from '../lib/words.js';

const UNIT = GWeather.TemperatureUnit.DEFAULT;

// A GWeather.Info's temperature (null when it has none) and sky ('' when
// it has none).
function reading(info) {
    const [hasTemp, temp] = info.get_value_temp(UNIT);
    const [hasSky] = info.get_value_sky();
    return {temp: hasTemp ? temp : null, sky: hasSky ? cleanSky(info.get_sky()) : ''};
}

export class WeatherSource {
    constructor(island) {
        this._island = island;
        this._client = Main.panel.statusArea.dateMenu?._weatherItem?._weatherClient ?? null;
        this._rain = null;
        this._id = this._client?.connect('changed', () => this._changed()) ?? 0;
        this._changed(true);
    }

    _info() {
        const client = this._client;
        if (!client?.available || client.loading || !client.hasLocation)
            return null;
        return client.info?.is_valid?.() ? client.info : null;
    }

    get glance() {
        const info = this._info();
        if (!info || !this._island.allows('weather'))
            return null;
        // The station's own reading when it has one, else the forecast
        // for this hour (the temperature in GWeather's unit, as GNOME's
        // date menu shows it).
        const own = reading(info);
        const forecast = own.temp !== null && own.sky ? null : nearest(Date.now(), this._forecasts(info))?.forecast;
        const guess = forecast ? reading(forecast) : {temp: null, sky: ''};
        const text = glanceText({temp: own.temp ?? guess.temp, sky: own.sky || guess.sky, rainIn: this._rain});
        return text ? {icon: info.get_symbolic_icon_name(), text} : null;
    }

    _forecasts(info) {
        return (info.get_forecast_list?.() ?? []).map(forecast => {
            const [valid, timestamp] = forecast.get_value_update();
            return valid && timestamp > 0 ? {at: timestamp * 1000, icon: forecast.get_symbolic_icon_name(), forecast} : null;
        }).filter(Boolean);
    }

    _changed(first = false) {
        const info = this._info();
        if (!info)
            return;
        const now = Date.now();
        const forecasts = this._forecasts(info);
        const before = this._rain;
        this._rain = rainSoon(now, info.get_symbolic_icon_name(), forecasts);
        if (first || !newRain(before, this._rain) || !this._island.allows('weather'))
            return;
        const {title, note} = rainText({rainIn: this._rain, warning: null});
        this._island.set({id: 'weather', kind: 'notification', hint: true, source: 'weather', duration: 5000,
            icon: 'weather-showers-symbolic', title, short: title, note: note ?? ''});
    }

    destroy() {
        if (this._id)
            this._client.disconnect(this._id);
        this._island.remove('weather');
    }
}

