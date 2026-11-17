// What the glance tells about this computer itself: memory in use, what is
// free on the home drive, the battery and the uptime. Read when the glance
// asks, from /proc and /sys, and kept for CACHE_MS so a hover that updates
// often does not read the files again each time. Nothing is polled.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {memoryLeft} from '../lib/health.js';
import {statsItems} from '../lib/words.js';

const CACHE_MS = 5000;
const POWER = '/sys/class/power_supply';

function text(path) {
    try {
        const [ok, bytes] = GLib.file_get_contents(path);
        return ok ? new TextDecoder().decode(bytes).trim() : null;
    } catch {
        return null;
    }
}

// The first battery in /sys (BAT0, BAT1): {percent, charging}, or null on a
// computer without one.
function readBattery() {
    try {
        const dir = Gio.File.new_for_path(POWER);
        const names = [];
        const children = dir.enumerate_children('standard::name', Gio.FileQueryInfoFlags.NONE, null);
        for (let info = children.next_file(null); info; info = children.next_file(null))
            names.push(info.get_name());
        const name = names.sort().find(entry => text(`${POWER}/${entry}/type`) === 'Battery');
        if (!name)
            return null;
        const percent = Number.parseFloat(text(`${POWER}/${name}/capacity`));
        const status = text(`${POWER}/${name}/status`);
        return Number.isFinite(percent) ? {percent, charging: status === 'Charging' || status === 'Full'} : null;
    } catch {
        return null;
    }
}

function readDiskFree() {
    try {
        const info = Gio.File.new_for_path(GLib.get_home_dir()).query_filesystem_info('filesystem::free', null);
        const free = info.get_attribute_uint64('filesystem::free');
        return free > 0 ? free : null;
    } catch {
        return null;
    }
}

export class MachineSource {
    constructor(island, batteryIconFor) {
        this._island = island;
        this._batteryIconFor = batteryIconFor;
        this._at = 0;
        this._items = [];
    }

    // [{id, icon, text}] for memory, disk, battery and uptime.
    get glance() {
        const now = GLib.get_monotonic_time() / 1000;
        if (now - this._at < CACHE_MS)
            return this._items;
        this._at = now;
        const left = memoryLeft(text('/proc/meminfo'));
        const uptime = Number.parseFloat(text('/proc/uptime')?.split(' ')[0]);
        this._items = statsItems({
            battery: readBattery(),
            memoryUsed: left === null ? null : 1 - left,
            diskFree: readDiskFree(),
            uptime: Number.isFinite(uptime) ? uptime : null,
        }, this._batteryIconFor);
        return this._items;
    }

    destroy() {
        this._island = null;
        this._items = [];
    }
}
