// Claude at work. In the bar its name and time, like a timer. Opened, what
// the session does: name and time on top; the step of its task list with a
// bar for the steps done (or what it last said, or what it waits for);
// below, dimmed, the tool it runs and folder, model and context.

import {Ticker} from '../ticker.js';
import {LevelBar, column, icon, label, row, updatable} from './parts.js';
import {TIMER} from './simple.js';

function mainLine(activity) {
    if (activity.waiting)
        return `Needs you · ${activity.waiting}`;
    if (activity.step)
        return `${activity.step.index}/${activity.step.total} · ${activity.step.text}`;
    return activity.said || 'Working';
}

export const CLAUDE = {
    compact: TIMER.compact,
    opened(activity, size, context) {
        const name = label(activity.title, 'islands-claude-name', {x_expand: true});
        const time = label(activity.clockAt?.() ?? '', 'islands-claude-time');
        const line = label(mainLine(activity), 'islands-claude-line');
        const bar = new LevelBar({x_expand: true, height: 4});
        const tool = label(activity.tool || (activity.waiting ? '' : 'Thinking'), 'islands-claude-foot', {x_expand: true});
        const about = label(activity.about ?? '', 'islands-claude-foot');
        const box = column([
            row([icon(activity.icon, 'islands-compact-icon'), name, time], {style_class: 'islands-claude-head'}),
            line,
            bar.actor,
            row([tool, about], {style_class: 'islands-claude-feet'}),
        ], {style_class: 'islands-claude-opened', width: size.width, height: size.height});
        const paint = next => {
            const colour = next.color ? `color: ${next.color};` : null;
            time.set_style(colour);
            name.text = next.title ?? '';
            line.text = mainLine(next);
            line.set_style(next.waiting ? colour : null);
            bar.share = next.step ? next.step.done / next.step.total : 0;
            bar.actor.opacity = next.step && !next.waiting ? 255 : 0;
            tool.text = next.tool || (next.waiting ? '' : 'Thinking');
            about.text = next.about ?? '';
        };
        paint(activity);
        let shown = activity;
        new Ticker(time, context, 'clock', () => {
            time.text = shown.clockAt?.() ?? '';
        }).poke(true);
        return updatable(box, next => {
            shown = next;
            paint(next);
            time.text = next.clockAt?.() ?? '';
            return true;
        });
    },
};
