import {readCharge} from '../extension/sources/charge.js';
import {test, equal, done} from './harness.js';

test('no battery (the desktop PC)', () => equal([readCharge({Type: 0}), readCharge(null), readCharge({Type: 2, IsPresent: false})], [null, null, null]));
test('battery discharging', () => equal(readCharge({Type: 2, IsPresent: true, Percentage: 81.6, State: 2}), {percent: 82, charging: false}));
test('charging or full counts as plugged in', () => equal(
    [readCharge({Type: 2, Percentage: 50, State: 1}).charging, readCharge({Type: 2, Percentage: 100, State: 4}).charging], [true, true]));
done('charge');
