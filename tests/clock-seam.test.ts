import { assertStrictEquals } from '@std/assert';
import {
    msSinceUtc, setClockForTest, resetClock,
} from '../api/types.ts';

Deno.test('msSinceUtc reads the injected test clock', () => {
    const base = '2026-07-11T00:00:00.000000Z';
    setClockForTest(() =>
        new Date(base).getTime() + 5000);
    try {
        assertStrictEquals(msSinceUtc(base), 5000);
    } finally {
        resetClock();
    }
});
