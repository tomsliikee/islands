// Registers every look with the registry; imported once by the extension.

import {CLAUDE} from './claude.js';
import {MEDIA} from './media.js';
import {register} from './registry.js';
import {ACTIONS, BATTERY, CALL, GLANCE, NOTE, OSD, TIMER} from './simple.js';

register('media', MEDIA);
register('osd', OSD);
register('call', CALL);
register('actions', ACTIONS);
register('timer', TIMER);
register('alarm', ACTIONS);
register('recording', TIMER);
register('claude', CLAUDE);
register('glance', GLANCE);
register('note', NOTE);
register('battery', BATTERY);
