// Torch, a power meter, over D-Bus (io.github.tomsliikee.Torch): its
// State property comes with PropertiesChanged, nothing is polled. An app
// Torch marks as eating power is told once, with a button that freezes it
// (Torch's Freeze). The glance on hover shows CPU and GPU from the same
// state; Torch measures faster only while the island is hovered (Watch).

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import {machineText, newEaters, readTorch} from '../lib/signals.js';

const NAME = 'io.github.tomsliikee.Torch';
const PATH = '/io/github/tomsliikee/Torch';

function appName(id) {
    return Shell.AppSystem.get_default().lookup_app(`${id}.desktop`)?.get_name() ?? id;
}

export class TorchSource {
    constructor(island) {
        this._island = island;
        this._state = null;
        this._proxy = null;
        this._cancellable = new Gio.Cancellable();
        Gio.DBusProxy.new_for_bus(Gio.BusType.SESSION, Gio.DBusProxyFlags.DO_NOT_AUTO_START, null,
            NAME, PATH, NAME, this._cancellable, (_source, result) => {
                try {
                    this._proxy = Gio.DBusProxy.new_for_bus_finish(result);
                } catch {
                    return;
                }
                this._proxy.connect('g-properties-changed', () => this._read());
                // Torch started after the shell: its first state tells nothing.
                this._proxy.connect('notify::g-name-owner', () => this._read(true));
                this._read(true);
            });
        this._unhover = island.onHover(hovered => this._watch(hovered));
    }

    get glance() {
        const text = this._island.allows('torch') ? machineText(this._state) : null;
        return text ? {icon: 'power-profile-performance-symbolic', text} : null;
    }

    _read(first = false) {
        const text = this._proxy?.get_cached_property('State')?.unpack();
        if (typeof text !== 'string')
            return;
        const before = this._state;
        this._state = readTorch(text);
        if (first || !this._island.allows('torch'))
            return;
        for (const app of newEaters(before, this._state)) {
            const name = appName(app.id);
            this._island.set({
                id: `torch:${app.id}`, kind: 'notification', hint: true, source: 'torch',
                look: app.mayFreeze ? 'actions' : null,
                icon: 'power-profile-performance-symbolic', title: `${name} eats power`, short: `${name} eats power`,
                note: app.cpu !== null ? `${Math.round(app.cpu)} % of the processor` : 'Torch noticed it',
                actions: app.mayFreeze ? [{label: 'Freeze', activate: () => this._call('Freeze', app.id)}] : [],
                onAction: action => {
                    action.activate();
                    this._island.remove(`torch:${app.id}`);
                },
            });
        }
    }

    _call(method, ...args) {
        if (!this._proxy?.g_name_owner)
            return;
        this._proxy.call(method, new GLib.Variant(`(${args.map(arg => (typeof arg === 'boolean' ? 'b' : 's')).join('')})`, args),
            Gio.DBusCallFlags.NONE, 2000, this._cancellable, (proxy, result) => {
                try {
                    proxy.call_finish(result);
                } catch (error) {
                    console.warn(`Islands: Torch ${method}: ${error.message}`);
                }
            });
    }

    // Torch measures every few seconds anyway; while the glance is open
    // it is asked to measure quicker, and told again when it closes.
    _watch(hovered) {
        if (this._watching === hovered || !this._proxy || !this._island.allows('torch'))
            return;
        this._watching = hovered;
        this._call('Watch', hovered);
    }

    destroy() {
        this._unhover();
        // Told without the cancellable, which goes now.
        if (this._watching && this._proxy?.g_name_owner)
            this._proxy.call('Watch', new GLib.Variant('(b)', [false]), Gio.DBusCallFlags.NONE, 2000, null, null);
        this._cancellable.cancel();
        this._proxy = null;
    }
}
