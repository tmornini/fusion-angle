import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    msSinceUtc, setClockForTest, resetClock,
} from '../api/types.ts';

test('msSinceUtc reads the injected test clock', () => {
    const base = '2026-07-11T00:00:00.000000Z';
    setClockForTest(() =>
        new Date(base).getTime() + 5000);
    try {
        assert.equal(msSinceUtc(base), 5000);
    } finally {
        resetClock();
    }
});
