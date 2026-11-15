// The laptop's battery, from UPower's display device: a short word when
// the charger is plugged in or out (canvas: 270 x 26 for 3 s), and when the
// battery passes 20 % and 10 % on its way down (at 10 % it opens once). A
// computer without a battery (the desktop PC) has no display device of
// kind battery, and this source then does nothing.

import Gio from 'gi://Gio';

import {colors} from '../lib/tokens.js';
import {lowMark} from '../lib/words.js';

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
    return {percent: Math.round(props.Percentage ?? 0), charging: props.State === CHARGING || props.State === FULL};
}

export class ChargeSource {
    constructor(island) {
        this._island = island;
        this._charge = null;
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
        if (!charge || !before || !this._island.allows('battery'))
            return;
        if (charge.charging !== before.charging) {
            this._island.set({id: 'battery', kind: 'battery', hint: true, source: 'battery', duration: SHOW_MS,
                icon: charge.charging ? 'battery-good-charging-symbolic' : 'battery-good-symbolic',
                color: charge.charging ? colors.dark.up : null,
                title: charge.charging ? 'Charging' : 'On battery', short: `${charge.percent} %`,
                key: `${charge.charging}:${charge.percent}`});
            return;
        }
        const mark = lowMark(before, charge);
        if (mark !== null) {
            this._island.set({id: 'battery', kind: 'battery', hint: true, source: 'battery', duration: SHOW_MS * 2,
                opens: mark <= 10, icon: 'battery-caution-symbolic', color: mark <= 10 ? colors.dark.down : null,
                title: `Battery at ${charge.percent} %`, short: `${charge.percent} %`,
                note: mark <= 10 ? 'Plug in the charger soon' : ''});
        }
    }

    destroy() {
        this._cancellable.cancel();
        this._proxy = null;
        this._island.remove('battery');
    }
}
