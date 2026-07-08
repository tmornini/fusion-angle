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
    'members': { count: 16, hash: '0c164977' },
    'human_members': { count: 11, hash: 'd8852be1' },
    'ai_members': { count: 4, hash: 'dca9e5e0' },
    'identities': { count: 16, hash: '0c164977' },
    'identity_pii': { count: 11, hash: 'd8852be1' },
    'identity_credentials': { count: 12, hash: '4990628d' },
    'identity_token_revocations': { count: 0, hash: '811c9dc5' },
    'identity_default_organizations': { count: 11, hash: 'ab3efde4' },
    'role_grants': { count: 12, hash: '4b2311dd' },
    'identity_tokens': { count: 0, hash: '811c9dc5' },
    'clients': { count: 0, hash: '811c9dc5' },
    'identity_providers': { count: 0, hash: '811c9dc5' },
    'authorization_codes': { count: 0, hash: '811c9dc5' },
    'ideas': { count: 11, hash: 'bd305274' },
    'projects': { count: 17, hash: '0a37ad51' },
    'flows': { count: 5, hash: '96b40589' },
    'flow_versions': { count: 0, hash: '811c9dc5' },
    'flow_nodes': { count: 46, hash: '092df8dd' },
    'flow_edges': { count: 54, hash: '2bde60a6' },
    'flow_node_members': { count: 11, hash: '24b8b869' },
    'flow_node_attributes': { count: 16, hash: '5d9c33a6' },
    'project_flows': { count: 4, hash: 'b7d3ebef' },
    'work_orders': { count: 145, hash: 'b57d1e25' },
    'flow_work_orders': { count: 145, hash: 'ffdd07ec' },
    'state_field_values': { count: 7, hash: '95d00f3a' },
    'records': { count: 2, hash: '929ffdaa' },
    'record_attributes': { count: 14, hash: 'f3566e11' },
    'flow_records': { count: 3, hash: '1f726d32' },
    'organizations': { count: 2, hash: 'e13d8f06' },
    'memberships': { count: 16, hash: '2e3db33e' },
    'invitations': { count: 0, hash: '811c9dc5' },
    'idea_submissions': { count: 11, hash: '30925c13' },
    'objectives': { count: 5, hash: '67473fdc' },
    'objective_revisions': { count: 5, hash: 'dd09a688' },
    'project_objective_baseline_scores':
        { count: 49, hash: '01d7b8b0' },
    'project_objective_actual_scores':
        { count: 92, hash: 'f7c18b25' },
    'states': { count: 911, hash: '679a7541' },
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
const EXCLUDED_TABLES = new Set([
    'requests', 'responses', SNAPSHOT_SCHEMA_VERSION_KEY,
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
