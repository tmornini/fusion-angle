import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad } from '../api/mock-data.ts';
import { SNAPSHOT_SCHEMA_VERSION_KEY } from '../api/db.ts';

// Characterization pin for the mock-data decomposition (F-030):
// every verbatim-move commit that splits api/mock-data.ts into
// per-entity seed modules MUST leave this green. The seed is
// PRNG-deterministic, so the exact rows it produces are stable.
// Per table we pin the row count and a hash over the sorted ids:
// the count catches a dropped or added entity; the hash catches an
// id that changed (a move that reorders PRNG draws keeps the count
// but shifts every id). On a deliberate seed change, regenerate by
// dumping the live fingerprint.

// FNV-1a, 32-bit: offset basis and prime.
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashIds(ids: string[]): string {
    let h = FNV_OFFSET;
    const joined = ids.join(',');
    for (let i = 0; i < joined.length; i++) {
        h ^= joined.charCodeAt(i);
        h = Math.imul(h, FNV_PRIME);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
}

type TableFingerprint = { count: number; hash: string };

const EXPECTED: Record<string, TableFingerprint> = {
    // All dual-written families RETIRED (Phase Final Task 2):
    // seed row halves stripped; pairs stay at
    // EXPECTED_PAIR_COUNT 1513. Tables empty until Stage B
    // deletion. SFV seed leaf pairs SURVIVE (WRS + 7 pairs).
    // clients remains empty (no seed dual-write; hash pin).
    'clients': { count: 0, hash: '811c9dc5' },
};

// requests/responses are EXCLUDED from this fingerprint (Task
// 4): every pair-wired seed op now forms its own message pair
// (api/mock-data/seed-message-pairs.ts), whose id
// (generateCryptoSafeBase62) and envelope `at` (the seed's own
// arrival moment / nowUtc()) are mint-fresh on every run BY
// DESIGN — the two message tables can never be pinned by a row-
// id hash the way the rest of the seed can. Determinism of the
// OLD plane (every table above) is what invisibility pins; the
// two message tables' DETERMINISTIC coverage (pair count,
// balance, per-family address, hash-verify) moved to
// tests/mock-data-pairs.test.ts. The reserved schema-version
// marker (Phase 12 Task 6) is excluded too — it is a scalar,
// not a row array, so `rows.map` below would throw on it.
// All dual-written families + states excluded with Phase Final
// Task 2 seed row-half strip (EXPECTED rows retired; tables
// empty until Stage B deletion; pair-plane pins live in
// mock-data-pairs.test.ts).
const EXCLUDED_TABLES = new Set([
    'requests', 'responses', SNAPSHOT_SCHEMA_VERSION_KEY,
    // ideas..work-orders and records families deleted
    'objectives', 'objective_revisions',
    'members', 'human_members', 'ai_members',
    'memberships', 'invitations',
    'identities', 'identity_pii', 'identity_credentials',
    'identity_token_revocations',
    'identity_default_organizations',
    'role_grants', 'identity_providers',
    'organizations', 'states',
]);

async function seededFingerprint(): Promise<
    Record<string, TableFingerprint>
> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    const snap = JSON.parse(await db.getSnapshot()) as Record<
        string, Array<{ id: string }>
    >;
    const fp: Record<string, TableFingerprint> = {};
    for (const [table, rows] of Object.entries(snap)) {
        if (EXCLUDED_TABLES.has(table)) continue;
        const ids = rows.map(r => r.id).sort();
        fp[table] = { count: ids.length, hash: hashIds(ids) };
    }
    return fp;
}

test('mock-data seed fingerprint is unchanged', async () => {
    assert.deepEqual(await seededFingerprint(), EXPECTED);
});
