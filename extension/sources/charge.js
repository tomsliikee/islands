// The laptop's battery, from UPower's display device: plugging in the
// charger opens the island for 3 s and it then rests in the bar with the
// charge until unplugged; unplugging, a full battery and the 20 % mark
// open briefly, the 10 % mark stays until the charger is in. A
// computer without a battery (the desktop PC) has no display device of
// kind battery, and this source then does nothing.

import Gio from 'gi://Gio';

import {colors} from '../lib/tokens.js';
import {chargeChange} from '../lib/words.js';

const NAME = 'org.freedesktop.UPower';
const PATH = '/org/freedesktop/UPower/devices/DisplayDevice';
const IFACE = 'org.freedesktop.UPower.Device';
// UPower: Type 2 is a battery; State 1 charging, 4 fully charged.
const BATTERY = 2;
const CHARGING = 1;
const FULL = 4;
const SHOW_MS = 3000;

export function readCharge(props) {
    if (!props || props.Type !== BATTERY || props.IsPresent === false)
        return null;
    return {percent: Math.round(props.Percentage ?? 0), charging: props.State === CHARGING || props.State === FULL, full: props.State === FULL};
}

export class ChargeSource {
    constructor(island) {
        this._island = island;
        this._charge = null;
        this._at = 0;
        this._cancellable = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null,
            NAME, PATH, IFACE, this._cancellable, (_source, result) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch {
                    return;
                }
                this._proxy.connect('g-properties-changed', () => this._read());
                this._charge = this._current();
                // Already plugged in at start: rests in the bar at once
                // (an opening time long past), without opening.
                if (this._charge?.charging && !this._charge.full && this._island.allows('battery'))
                    this._island.set(this._lasting(this._charge, 0));
            });
    }

    _current() {
        const get = name => this._proxy?.get_cached_property(name)?.unpack();
        return readCharge({Type: get('Type'), IsPresent: get('IsPresent'), Percentage: get('Percentage'), State: get('State')});
    }

    // For headless checks: as if UPower said so.
    pretend(charge) {
        this._changed(charge);
    }

    _read() {
        this._changed(this._current());
    }

    _changed(charge) {
        const before = this._charge;
        this._charge = charge;
        if (!this._island.allows('battery'))
            return;
        const event = chargeChange(before, charge);
        if (!event)
            return;
        const percent = `${charge.percent} %`;
        if (event === 'plugged' || event === 'level') {
            // Opens once when plugged in, then rests in the bar; the
            // percent moving on does not open it again.
            if (event === 'plugged')
                this._at = Date.now();
            this._island.set(this._lasting(charge, this._at));
        } else if (event === 'unplugged') {
            this._island.set({id: 'battery', kind: 'battery', hint: true, opens: true, source: 'battery', at: Date.now(), duration: SHOW_MS,
                icon: 'battery-good-symbolic', title: 'On battery', short: percent, key: `unplugged:${charge.percent}`});
        } else if (event === 'full') {
            this._island.set({id: 'battery', kind: 'battery', hint: true, opens: true, source: 'battery', at: Date.now(), duration: SHOW_MS,
                icon: 'battery-full-charged-symbolic', color: colors.dark.up, title: 'Fully charged', short: percent});
        } else if (event === 'low20') {
            this._island.set({id: 'battery', kind: 'battery', hint: true, opens: true, source: 'battery', at: Date.now(), duration: SHOW_MS * 2,
                icon: 'battery-caution-symbolic', title: `Battery at ${charge.percent} %`, short: percent});
        } else if (event === 'low10') {
            // Stays in the bar until the charger is plugged in.
            this._island.set({id: 'battery', kind: 'battery', lasting: true, opensFor: true, opens: true, source: 'battery',
                at: Date.now(), duration: SHOW_MS * 2, icon: 'battery-caution-symbolic', color: colors.dark.down,
                title: `Battery at ${charge.percent} %`, short: percent, note: 'Plug in the charger soon'});
        }
    }

    // The charging island: opened for SHOW_MS from `at`, then compact.
    _lasting(charge, at) {
        return {id: 'battery', kind: 'battery', lasting: true, opensFor: true, opens: true, source: 'battery',
            duration: SHOW_MS, at, icon: 'battery-good-charging-symbolic', color: colors.dark.up,
            title: 'Charging', short: `${charge.percent} %`};
    }

    destroy() {
        this._cancellable.cancel();
        this._proxy = null;
        this._island.remove('battery');
    }
}
