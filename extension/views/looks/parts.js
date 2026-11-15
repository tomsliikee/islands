// Small parts the looks share: labels, round buttons, a level bar. Built
// from the stylesheet's classes; colours come from Insights Mono's dark
// tokens (lib/tokens.js) where a part needs one inline.

import Clutter from 'gi://Clutter';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {colors} from '../../lib/tokens.js';
import {iconOf, updatable} from './registry.js';

export {updatable};

export const ink = colors.dark;

export function label(text, styleClass, props = {}) {
    const actor = new St.Label({text: text ?? '', style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...props});
    actor.clutter_text.ellipsize = Pango.EllipsizeMode.END;
    return actor;
}

export function icon(source, styleClass, props = {}) {
    const gicon = iconOf({icon: source});
    return new St.Icon({gicon, style_class: styleClass, y_align: Clutter.ActorAlign.CENTER, ...props});
}

export function column(children, props = {}) {
    const box = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, y_align: Clutter.ActorAlign.CENTER, ...props});
    for (const child of children.filter(Boolean))
        box.add_child(child);
    return box;
}

export function row(children, props = {}) {
    const box = new St.BoxLayout({...props});
    for (const child of children.filter(Boolean))
        box.add_child(child);
    return box;
}

// A round button with an icon; tone 'up' (answer), 'down' (decline) or
// none. The click goes to onClick and stops there, so the island under it
// does not take it as its own click.
export function roundButton(iconName, onClick, {size = 44, tone = null, accessible = ''} = {}) {
    const button = new St.Button({
        style_class: `islands-round${tone ? ` islands-round-${tone}` : ''}`,
        width: size, height: size,
        style: `border-radius: ${Math.floor(size / 2)}px;`,
        y_align: Clutter.ActorAlign.CENTER,
        accessible_name: accessible,
        child: icon(iconName, size < 30 ? 'islands-round-icon-small' : 'islands-round-icon'),
    });
    button.connect('clicked', () => onClick?.());
    return button;
}

// A wide button with a label, for a notification's actions.
export function textButton(text, onClick) {
    const button = new St.Button({style_class: 'islands-action', label: text, x_expand: true, can_focus: true});
    button.connect('clicked', () => onClick?.());
    return button;
}

// A thin bar that fills from the left: share 0..1. The fill spans the bar
// and is scaled, so a new share asks for no new layout.
export class LevelBar {
    constructor(props = {}) {
        this.actor = new St.Widget({style_class: 'islands-bar', layout_manager: new Clutter.BinLayout(), y_align: Clutter.ActorAlign.CENTER, ...props});
        this._fill = new St.Widget({style_class: 'islands-bar-fill', x_expand: true, y_expand: true});
        this._fill.set_pivot_point(0, 0.5);
        this.actor.add_child(this._fill);
        this.share = 0;
    }

    set share(share) {
        this._fill.scale_x = Math.max(0, Math.min(1, share || 0));
    }
}
