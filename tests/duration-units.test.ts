import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMinAscending } from '../web-app/app/duration-units.ts';

test('formatMinAscending picks the largest unit ≥ 1', () => {
    assert.equal(formatMinAscending(0),       '0s');
    assert.equal(formatMinAscending(47),      '47s');
    assert.equal(formatMinAscending(59),      '59s');
    assert.equal(formatMinAscending(60),      '1m');
    assert.equal(formatMinAscending(90),      '1.5m');
    assert.equal(formatMinAscending(510),     '8.5m');
    assert.equal(formatMinAscending(600),     '10m');
    assert.equal(formatMinAscending(3599),    '60m');
    assert.equal(formatMinAscending(3600),    '1h');
    assert.equal(formatMinAscending(11520),   '3.2h');
    assert.equal(formatMinAscending(86400),   '1d');
    assert.equal(formatMinAscending(414720),  '4.8d');
    assert.equal(formatMinAscending(604800),  '1w');
    assert.equal(formatMinAscending(1270080), '2.1w');
    assert.equal(formatMinAscending(52 * 604800), '52w');
});

test('formatMinAscending rejects negative input', () => {
    assert.throws(() => formatMinAscending(-1), /negative/i);
});
