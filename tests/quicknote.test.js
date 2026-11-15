import GLib from 'gi://GLib';

import {noteLine, notePath} from '../extension/sources/quicknote.js';
import {test, equal, done} from './harness.js';

test('no file, no notes', () => equal([notePath(''), notePath('  ')], ['', '']));
test('a home path', () => equal(notePath('~/vault/Inbox.md'), `${GLib.get_home_dir()}/vault/Inbox.md`));
test('the line', () => equal(noteLine('  buy milk\nand bread ', new Date(2026, 10, 15, 9, 5)), '- 09:05 buy milk and bread\n'));
done('quicknote');
