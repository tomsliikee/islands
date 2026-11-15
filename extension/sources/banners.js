// Notifications, calls and ringing alarms, from Halo's sources/banners.js:
// GNOME's banners stay down and the island shows the notification instead
// (canvas: 452 x 78 for 5 s, then back). The message tray keeps deciding
// whether a banner may show at all (Do not disturb, fullscreen, urgency)
// and calls _showNotification when it would show one; that method is
// shadowed on the tray and hands the notification to the island.
//
// GNOME does not keep a notification's category. Calls are known by it
// ("call", "call.incoming"), so the D-Bus method that receives
// notifications is shadowed too, only to note the category on the way.
// The extension is not active on the lock screen; GNOME's own lock screen
// list shows what came meanwhile.

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';

import {initials, isDecline, plainText} from '../lib/words.js';
import {CLAUDE} from './claude.js';

// A critical notification stays longer.
const CRITICAL_MS = 9000;
// GNOME Clocks rings its alarms and timers with a notification.
const CLOCKS = 'org.gnome.clocks';

function appIdOf(source) {
    return source?._appId ?? source?.app?.get_id?.()?.replace(/\.desktop$/, '') ?? null;
}

// The running app a notification came from, or null.
function appOf(source) {
    if (source?.app)
        return source.app;
    const appId = appIdOf(source);
    if (!appId)
        return null;
    const system = Shell.AppSystem.get_default();
    return system.lookup_app(`${appId}.desktop`) ?? system.lookup_heuristic_basename(appId) ?? null;
}

// A click on a notification: its default action, and the app's window to
// the front. Electron apps (Discord) often send no default action, and
// GNOME's activate() alone then does nothing visible.
function activate(notification) {
    // Asked first: activate() may destroy the notification and its source.
    const app = appOf(notification.source);
    notification.activate();
    if (app && app.get_state() === Shell.AppState.RUNNING)
        app.activate();
}

function whenText(datetime) {
    if (!datetime)
        return 'now';
    const seconds = GLib.DateTime.new_now_local().difference(datetime) / 1e6;
    if (seconds < 60)
        return 'now';
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} min ago`;
    return datetime.format('%H:%M');
}

export class BannerSource {
    constructor(island) {
        this._island = island;
        this._tray = Main.messageTray;
        this._shown = new Map();
        this._nextCategory = null;
        this._count = 0;

        const tray = this._tray;
        const showNotification = tray._showNotification;
        tray._showNotification = () => {
            const notification = tray._notificationQueue[0];
            if (!notification || !this._takes(notification)) {
                showNotification.call(tray);
                return;
            }
            tray._notificationQueue.shift();
            tray.emit('queue-changed');
            this._show(notification);
        };

        this._daemon = Main.notificationDaemon?._fdoNotificationDaemon ?? null;
        const notify = this._daemon?.NotifyAsync;
        if (notify) {
            this._daemon.NotifyAsync = (params, invocation) => {
                const hints = params[6] ?? {};
                const category = hints.category?.deepUnpack?.() ?? hints.category ?? null;
                this._nextCategory = typeof category === 'string' ? category : null;
                try {
                    return notify.call(this._daemon, params, invocation);
                } finally {
                    this._nextCategory = null;
                }
            };
        }
    }

    destroy() {
        delete this._tray._showNotification;
        if (this._daemon)
            delete this._daemon.NotifyAsync;
        for (const [notification, id] of this._shown) {
            notification.disconnectObject(this);
            this._island.remove(id);
        }
        this._shown.clear();
    }

    _isCall(notification) {
        const category = notification._islandsCategory ?? this._nextCategory;
        return typeof category === 'string' && category.startsWith('call');
    }

    // 'call', 'alarm' or 'notification'.
    _kindOf(notification) {
        if (this._isCall(notification))
            return 'call';
        if (appIdOf(notification.source) === CLOCKS)
            return 'alarm';
        return 'notification';
    }

    _takes(notification) {
        const kind = this._kindOf(notification);
        return this._island.allows(kind === 'alarm' ? 'timer' : kind);
    }

    _show(notification) {
        if (this._nextCategory)
            notification._islandsCategory = this._nextCategory;
        const kind = this._kindOf(notification);
        // An updated notification keeps its place in the island.
        const id = this._shown.get(notification) ?? `notification:${++this._count}`;
        this._shown.set(notification, id);
        notification.disconnectObject(this);
        notification.connectObject('destroy', () => {
            this._shown.delete(notification);
            this._island.remove(id);
        }, this);

        const source = notification.source;
        const actions = notification.actions.map(action => ({
            label: action.label,
            decline: isDecline(action.label),
            activate: () => action.activate(),
        }));
        const onAction = action => {
            action.activate();
            this._island.remove(id);
        };
        // Seen in the island is seen: it does not come back as a banner. A
        // transient notification goes once it was shown, as GNOME does
        // after its banner.
        const acknowledge = () => {
            notification.acknowledged = true;
            if (notification.isTransient)
                notification.destroy(MessageTray.NotificationDestroyedReason.EXPIRED);
        };
        const title = notification.title || source?.title || '';
        const body = plainText(notification.body);
        const app = source?.title ?? '';

        if (kind === 'call') {
            // Opens for 6 s, then rings on in the bar with its two buttons
            // until answered, declined or gone.
            this._island.set({
                id, kind: 'call', opensFor: true, lasting: true, source: 'call',
                title, note: body || app || 'Incoming call', initials: initials(title),
                icon: notification.gicon ?? null,
                actions, onAction,
                onActivate: () => activate(notification),
                onDismiss: acknowledge,
            });
            return;
        }

        if (kind === 'alarm') {
            // Rings until stopped or snoozed: it lasts, with its buttons.
            this._island.set({
                id, kind: 'alarm', opensFor: true, opens: true, duration: 8000, lasting: true,
                look: actions.length > 0 ? 'actions' : null, source: 'timer',
                title: notification.title || 'Alarm', short: notification.title || 'Alarm', note: body,
                icon: source?.icon ?? 'alarm-symbolic', when: whenText(notification.datetime),
                actions, onAction,
                onActivate: () => activate(notification),
                onDismiss: acknowledge,
            });
            return;
        }

        const critical = notification.urgency === MessageTray.Urgency.CRITICAL;
        // Claude Code (and the Claude app) say an answer is ready this way;
        // the Claude switch decides about them, and they wear its colour.
        const claude = /claude/i.test(`${app} ${appIdOf(source) ?? ''}`);
        this._island.set({
            id, kind: 'notification', hint: true, source: claude ? 'claude' : 'notification',
            color: claude ? CLAUDE : null,
            look: actions.length > 0 ? 'actions' : null,
            sticky: critical && actions.length > 0,
            duration: critical ? CRITICAL_MS : null,
            title, short: app || title, note: body,
            icon: notification.gicon ?? source?.icon ?? 'dialog-information-symbolic',
            when: whenText(notification.datetime),
            actions, onAction,
            onActivate: () => activate(notification),
            onExpire: acknowledge,
            onDismiss: acknowledge,
        });
    }
}
