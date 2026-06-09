import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nowUtc } from '../api/types.ts';

// The Office of Time: persist RFC-3339 zulu at the fullest
// resolution the environment provides. SCHEMA.md documents the
// 6-digit microsecond width; nowUtc is the canonical mint and
// must match it so the append-only `states` log holds one width
// (mixed 3-vs-6-digit strings sort wrong under lexical compare).
const ZULU_6 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

test('nowUtc mints 6-digit microsecond zulu', () => {
    assert.match(nowUtc(), ZULU_6);
});

test('nowUtc is parseable to a real instant', () => {
    assert.ok(!Number.isNaN(Date.parse(nowUtc())));
});
