// Whether the computer runs on battery, from UPower's OnBattery property:
// one D-Bus proxy that is told when it changes, no polling. A desktop
// without UPower or without a battery counts as plugged in.

import Gio from 'gi://Gio';

import {EventEmitter} from 'resource:///org/gnome/shell/misc/signals.js';

export class Battery extends EventEmitter {
    constructor() {
        super();
        this.onBattery = false;
        this._proxy = null;
        this._cancellable = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(Gio.BusType.SYSTEM, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null,
            'org.freedesktop.UPower', '/org/freedesktop/UPower', 'org.freedesktop.UPower', this._cancellable,
            (_source, result) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch {
                    return;
                }
                this._proxy.connect('g-properties-changed', () => this._read());
                this._read();
            });
    }

    _read() {
        const value = this._proxy?.get_cached_property('OnBattery')?.unpack() === true;
        if (value === this.onBattery)
            return;
        this.onBattery = value;
        this.emit('changed');
    }

    // For tests: as if the battery said so.
    pretend(onBattery) {
        this.onBattery = onBattery;
        this.emit('changed');
    }

    destroy() {
        this._cancellable.cancel();
        this._proxy = null;
        this.disconnectAll?.();
    }
}
