// The phone through NectarLink: its music comes through MPRIS (media.js),
// its calls, texts and files only as notifications (banners.js). What is
// left is its widget state file, watched: connected, name and battery, for
// the glance on hover, and a short word when it connects or runs low.

import GLib from 'gi://GLib';

import {phoneLow, phoneText, readPhone} from '../lib/signals.js';
import {Watch} from './watch.js';

const PATH = GLib.build_filenamev([GLib.get_user_data_dir(), 'Nectarlink', 'widget-state.json']);

export class PhoneSource {
    constructor(island, path = PATH) {
        this._island = island;
        this._phone = null;
        this._watch = new Watch(path, () => this._read());
        this._read(true);
    }

    get glance() {
        const text = this._island.allows('phone') ? phoneText(this._phone) : null;
        return text ? {id: 'phone', icon: 'phone-symbolic', text} : null;
    }

    _read(first = false) {
        const before = this._phone;
        const phone = readPhone(this._watch.read());
        this._phone = phone;
        if (first || !this._island.allows('phone'))
            return;
        if (phone?.connected && !before?.connected) {
            this._island.set({id: 'phone', kind: 'osd', hint: true, source: 'phone', duration: 3000,
                icon: 'phone-symbolic', title: `${phone.phone || 'Phone'} connected`});
        } else if (phoneLow(before, phone)) {
            this._island.set({id: 'phone', kind: 'osd', hint: true, source: 'phone', duration: 3000,
                icon: 'battery-caution-symbolic', title: `${phone.phone || 'Phone'} at ${Math.round(phone.battery)} %`});
        }
    }

    destroy() {
        this._watch.destroy();
        this._island.remove('phone');
    }
}
