// What the island shows inside its shape, per kind of activity. A look is
// {compact(activity, pill), opened(activity, size)} returning an actor;
// kinds without a look of their own use the generic one: an icon and a
// title in the bar, an icon, title and note below it.
//
// Looks are built once per change of what shows, never per frame.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import St from 'gi://St';

const looks = new Map();

export function register(kind, look) {
    looks.set(kind, look);
}

export function lookFor(kind) {
    return looks.get(kind) ?? GENERIC;
}

// An activity's icon: a Gio.Icon, or the name of a themed icon.
export function iconOf(activity) {
    const icon = activity?.icon;
    if (!icon)
        return null;
    return typeof icon === 'string' ? new Gio.ThemedIcon({name: icon}) : icon;
}

function label(text, styleClass) {
    const actor = new St.Label({text: text ?? '', style_class: styleClass, y_align: Clutter.ActorAlign.CENTER});
    actor.clutter_text.ellipsize = 3; // Pango.EllipsizeMode.END
    return actor;
}

// Lets a built look take a newer state of the same activity in place
// (a volume step, a download that grew): update(activity) changes its
// labels and returns true, or returns false when the look must be built
// anew. Without it every change fades the content out and in again.
export function updatable(actor, update) {
    actor._islandsUpdate = update;
    return actor;
}

function colourStyle(activity) {
    return activity.color ? `color: ${activity.color};` : null;
}

export const GENERIC = {
    compact(activity, pill) {
        const box = new St.BoxLayout({style_class: 'islands-compact', height: pill, x_expand: true});
        const gicon = iconOf(activity);
        const iconActor = gicon ? new St.Icon({gicon, style_class: 'islands-compact-icon', y_align: Clutter.ActorAlign.CENTER}) : null;
        if (iconActor)
            box.add_child(iconActor);
        const title = label(activity.short ?? activity.title, 'islands-compact-title');
        title.x_expand = true;
        title.x_align = Clutter.ActorAlign.END;
        box.add_child(title);
        box.set_style(colourStyle(activity));
        return updatable(box, next => {
            const nextIcon = iconOf(next);
            if (Boolean(nextIcon) !== Boolean(iconActor))
                return false;
            if (iconActor)
                iconActor.gicon = nextIcon;
            title.text = next.short ?? next.title ?? '';
            box.set_style(colourStyle(next));
            return true;
        });
    },

    opened(activity, size) {
        const box = new St.BoxLayout({style_class: 'islands-opened', width: size.width, height: size.height});
        const art = new St.Bin({style_class: 'islands-opened-art', y_align: Clutter.ActorAlign.CENTER});
        const gicon = iconOf(activity);
        if (gicon)
            art.child = new St.Icon({gicon, style_class: 'islands-opened-icon'});
        box.add_child(art);
        const text = new St.BoxLayout({orientation: Clutter.Orientation.VERTICAL, x_expand: true, y_align: Clutter.ActorAlign.CENTER});
        const title = label(activity.title, 'islands-opened-title');
        text.add_child(title);
        const note = activity.note ? label(activity.note, 'islands-opened-note') : null;
        if (note)
            text.add_child(note);
        box.add_child(text);
        const when = activity.when ? label(activity.when, 'islands-opened-time') : null;
        if (when)
            box.add_child(when);
        return updatable(box, next => {
            const nextIcon = iconOf(next);
            if (Boolean(nextIcon) !== Boolean(gicon) || Boolean(next.note) !== Boolean(note) || Boolean(next.when) !== Boolean(when))
                return false;
            if (nextIcon)
                art.child.gicon = nextIcon;
            title.text = next.title ?? '';
            if (note)
                note.text = next.note;
            if (when)
                when.text = next.when;
            return true;
        });
    },
};
