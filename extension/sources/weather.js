// Rain soon, from GNOME's own weather client (the one the date menu
// keeps): its 'changed' signal is heard, and it refreshes when GNOME
// refreshes it; Islands asks the network for nothing. Told once when rain
// comes within the hour; the glance shows the temperature and the sky.


import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {newRain, rainSoon} from '../lib/weather.js';
import {rainText} from '../lib/words.js';

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
        const temperature = info.get_temp_summary?.() ?? '';
        const sky = info.get_sky?.() || info.get_conditions?.() || '';
        const rain = this._rain !== null ? (this._rain === 0 ? 'raining' : `rain in ${this._rain} min`) : '';
        return {icon: info.get_symbolic_icon_name(), text: [temperature, sky, rain].filter(text => text && text !== '-').join(' · ')};
    }

    _changed(first = false) {
        const info = this._info();
        if (!info)
            return;
        const now = Date.now();
        const forecasts = (info.get_forecast_list?.() ?? []).map(forecast => {
            const [valid, timestamp] = forecast.get_value_update();
            return valid ? {at: timestamp * 1000, icon: forecast.get_symbolic_icon_name()} : null;
        }).filter(Boolean);
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

