// Ollama's loaded models, from its /api/ps. Ollama tells nobody when a
// model loads, so this asks, but only while there is a reason: while
// tomsllama runs, while a model was loaded at the last look (until it
// unloads), and once when the glance opens. Otherwise nothing is asked.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import Soup from 'gi://Soup?version=3.0';

import {ollamaText, readOllama} from '../lib/signals.js';

const URL = 'http://127.0.0.1:11434/api/ps';
const ASK_S = 5;
const TOMSLLAMA = 'tomsllama.desktop';

function timeOf(ms) {
    return GLib.DateTime.new_from_unix_local(Math.floor(ms / 1000)).format('%H:%M');
}

export class OllamaSource {
    constructor(island) {
        this._island = island;
        this._models = [];
        this._session = new Soup.Session({timeout: 2});
        this._cancellable = null;
        this._askId = 0;
        this._apps = Shell.AppSystem.get_default();
        this._appsId = this._apps.connect('app-state-changed', (_system, app) => {
            if (app.get_id() === TOMSLLAMA)
                this._plan();
        });
        this._unhover = island.onHover(hovered => {
            if (hovered)
                this._ask();
        });
        this._plan();
    }

    get _tomsllama() {
        return this._apps.lookup_app(TOMSLLAMA)?.state === Shell.AppState.RUNNING;
    }

    get glance() {
        const model = this._island.allows('progress') ? this._models[0] : null;
        return model ? {icon: 'applications-science-symbolic', text: ollamaText(model, timeOf)} : null;
    }

    // Asking goes on while tomsllama runs or a model is loaded.
    _plan() {
        const wanted = this._tomsllama || this._models.length > 0;
        if (wanted && !this._askId) {
            this._ask();
            // A second timer: it wakes together with the session's others.
            this._askId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT_IDLE, ASK_S, () => {
                this._ask();
                return GLib.SOURCE_CONTINUE;
            });
        } else if (!wanted && this._askId) {
            GLib.source_remove(this._askId);
            this._askId = 0;
        }
    }

    _ask() {
        if (this._cancellable)
            return;
        const cancellable = new Gio.Cancellable();
        this._cancellable = cancellable;
        const message = Soup.Message.new('GET', URL);
        this._session.send_and_read_async(message, GLib.PRIORITY_DEFAULT, cancellable, (session, result) => {
            // Cancelled by destroy(): the island is gone, and planning again
            // would leave a timer running after Islands was switched off.
            if (cancellable.is_cancelled())
                return;
            let text = '';
            try {
                text = new TextDecoder().decode(session.send_and_read_finish(result).toArray());
            } catch {
                // Ollama is not running: nothing loaded.
            }
            this._cancellable = null;
            this._models = readOllama(text);
            this._show();
            this._plan();
        });
    }

    _show() {
        const model = this._models[0];
        if (!model || !this._island.allows('progress')) {
            this._island.remove('ollama');
            return;
        }
        const note = ollamaText(model, timeOf);
        // Asked every 5 s; the island hears of it only when it changed.
        if (this._island.has('ollama') && this._shown === `${model.name}|${note}`)
            return;
        this._shown = `${model.name}|${note}`;
        this._island.set({
            id: 'ollama', kind: 'progress', source: 'progress', icon: 'applications-science-symbolic',
            title: `${model.name} is loaded`, short: model.name, note,
        });
    }

    destroy() {
        this._unhover();
        this._apps.disconnect(this._appsId);
        if (this._askId)
            GLib.source_remove(this._askId);
        this._askId = 0;
        this._cancellable?.cancel();
        this._cancellable = null;
        this._island.remove('ollama');
    }
}
