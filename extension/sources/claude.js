// Claude's plan limits from Tally's cache, watched: the glance on hover
// shows them, and a limit crossing 80 % or 95 % is told once (Halo's
// lib/island/limits.js). Claude Code's own "answer ready" comes as a
// notification and is marked as Claude's in banners.js.

import GLib from 'gi://GLib';

import {crossed, readLimits} from '../lib/limits.js';
import {claudeItems, limitNote, limitTitle} from '../lib/words.js';
import {Watch} from './watch.js';

const DIR = GLib.build_filenamev([GLib.get_user_cache_dir(), 'tally']);
// Claude's colour, as the canvas gives it.
export const CLAUDE = '#d97757';

export class ClaudeSource {
    constructor(island, dir = DIR) {
        this._island = island;
        this._limits = null;
        this._probe = new Watch(`${dir}/limits.json`, () => this._read());
        this._statusline = new Watch(`${dir}/statusline.json`, () => this._read());
        this._read(true);
    }

    get glance() {
        if (!this._island.allows('claude'))
            return null;
        const [item] = claudeItems(this._limits, Date.now());
        return item ? {id: 'claude', icon: 'chat-message-new-symbolic', text: item.text} : null;
    }

    _read(first = false) {
        const before = this._limits;
        this._limits = readLimits(this._probe.read(), this._statusline.read(), Date.now());
        if (first || !this._island.allows('claude'))
            return;
        for (const crossing of crossed(before, this._limits)) {
            this._island.set({id: `claude:${crossing.window}`, kind: 'notification', hint: true, source: 'claude',
                icon: 'chat-message-new-symbolic', color: CLAUDE, title: limitTitle(crossing), short: limitTitle(crossing),
                note: limitNote(crossing, Date.now())});
        }
    }

    destroy() {
        this._probe.destroy();
        this._statusline.destroy();
    }
}
