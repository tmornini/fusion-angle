import { assert, assertMatch } from '@std/assert';
import { logStampUtc } from '../server/log-stamp.ts';

// The Office of Time: RFC-3339 zulu at the fullest
// resolution the environment provides — six digits here.
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

Deno.test('logStampUtc stamps RFC-3339 zulu microseconds', () => {
    assertMatch(logStampUtc(), ZULU_6);
});

Deno.test('logStampUtc reads the wall clock', () => {
    const before = Date.now();
    const stamped = Date.parse(logStampUtc());
    const after = Date.now();
    assert(before <= stamped && stamped <= after);
});
