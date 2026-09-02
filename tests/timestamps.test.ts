import { assert, assertMatch } from '@std/assert';
import { nowUtc } from '../api/types.ts';

// The Office of Time: persist RFC-3339 zulu at the fullest
// resolution the environment provides. SCHEMA.md documents the
// 6-digit microsecond width; nowUtc is the canonical mint and
// must match it so the append-only `states` log holds one width
// (mixed 3-vs-6-digit strings sort wrong under lexical compare).
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

Deno.test('nowUtc mints 6-digit microsecond zulu', () => {
    assertMatch(nowUtc(), ZULU_6);
});

Deno.test('nowUtc is parseable to a real instant', () => {
    assert(!Number.isNaN(Date.parse(nowUtc())));
});

Deno.test('nowUtc is strictly increasing across 10k mints', () => {
    let prev = nowUtc();
    for (let i = 0; i < 10_000; i++) {
        const next = nowUtc();
        assert(
            next > prev,
            next + ' not after ' + prev,
        );
        assertMatch(next, ZULU_6);
        prev = next;
    }
});
