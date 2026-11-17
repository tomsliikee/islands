import {readCharge} from '../extension/sources/charge.js';
import {chargeChange} from '../extension/lib/words.js';
import {test, equal, done} from './harness.js';

const c = (percent, charging, full = false) => ({percent, charging, full});

test('no battery (the desktop PC)', () => equal([readCharge({Type: 0}), readCharge(null), readCharge({Type: 2, IsPresent: false})], [null, null, null]));
test('battery discharging', () => equal(readCharge({Type: 2, IsPresent: true, Percentage: 81.6, State: 2}), {percent: 82, charging: false, full: false}));
test('charging or full counts as plugged in', () => equal(
    [readCharge({Type: 2, Percentage: 50, State: 1}).charging, readCharge({Type: 2, Percentage: 100, State: 4}).charging], [true, true]));
test('only state 4 is full', () => equal(
    [readCharge({Type: 2, Percentage: 50, State: 1}).full, readCharge({Type: 2, Percentage: 100, State: 4}).full], [false, true]));

test('plugged', () => equal(chargeChange(c(82, false), c(82, true)), 'plugged'));
test('unplugged', () => equal(chargeChange(c(82, true), c(82, false)), 'unplugged'));
test('full on plug', () => equal(chargeChange(c(100, false), c(100, true, true)), 'full'));
test('full while charging', () => equal(chargeChange(c(99, true), c(100, true, true)), 'full'));
test('level', () => equal([chargeChange(c(50, true), c(51, true)), chargeChange(c(50, true), c(50, true))], ['level', null]));
test('low marks', () => equal([
    chargeChange(c(21, false), c(19, false)), chargeChange(c(11, false), c(9, false)), chargeChange(c(50, false), c(49, false)),
], ['low20', 'low10', null]));
test('no battery', () => equal([chargeChange(null, c(5, false)), chargeChange(c(5, false), null)], [null, null]));
done('charge');
