import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad, postBootstrap } from '../api/mock-data.ts';
import { sha256Hex } from '../shared/digest.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { buildAiMembers } from '../api/mock-data/ai-members.ts';
import { OBJECTIVE_SEEDS } from '../api/mock-data/objectives.ts';
import { customerProfileRecordId } from '../api/mock-data/records.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';

// Task 4: the seed's pair-wired op-invocations (human-members,
// ideas, flows, ai-members, records, objectives) each form a
// message pair in pass 1, before the seed's one transaction
// opens — see api/mock-data/seed-message-pairs.ts. This is the
// DETERMINISTIC coverage the fingerprint test excludes for the
// two message tables (mock-data-fingerprint.test.ts).

// The exact op-invocation count postMockDataLoad drives through
// a pair-capable op: 11 human-members + 11 ideas + 4 flows (of
// 5 — seed-flow-org2 is a direct write, no project_flows join)
// + 4 ai-members + 2 records + 5 objectives (4 STARK +
// seed-objective-org2). A dropped or reordered invocation
// changes this count.
const EXPECTED_PAIR_COUNT = 37;

test('a mock-data seed populates balanced pairs',
async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    assert.ok(requests.length > 0);
});

test('the mock-data seed forms exactly the traced'
+ ' op-invocation count', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    assert.equal(requests.length, EXPECTED_PAIR_COUNT);
    assert.equal(
        (await db.responses.getAll()).length,
        EXPECTED_PAIR_COUNT,
    );
});

test('every seed op body carries a unique entity id, so no'
+ ' two request hashes collide', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const distinctHashes = new Set(
        requests.map(r => r.message_hash),
    );
    // A collision would silently drop a pair via
    // appendMessagePair's same-hash dedup skip.
    assert.equal(distinctHashes.size, requests.length);
});

test('a seeded idea create pair sits at its entity address',
async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstIdea = buildIdeas()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstIdea.id,
    );
    assert.ok(row, 'no request row for the seeded idea');
    assert.equal(row!.uri_prefix, '/organizations/1/ideas/');
});

test('a seeded human-member create pair sits at the global'
+ ' (non-org-nested) address', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === 'current');
    assert.ok(row, 'no request row for the current member');
    assert.equal(row!.uri_prefix, '/human-members/');
});

test('a seeded flow create pair sits at its org-nested'
+ ' entity address', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === 'h5mErVBQhwdMKwi1co30jB',
    );
    assert.ok(row, 'no request row for the seeded flow');
    assert.equal(row!.uri_prefix, '/organizations/1/flows/');
});

test('a seeded ai-member create pair sits at the global'
+ ' (non-org-nested) address', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstAiMember.id,
    );
    assert.ok(row, 'no request row for the seeded ai member');
    assert.equal(row!.uri_prefix, '/ai-members/');
});

test('a seeded record create pair sits at its org-nested'
+ ' entity address', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === customerProfileRecordId,
    );
    assert.ok(row, 'no request row for the seeded record');
    assert.equal(row!.uri_prefix, '/organizations/1/records/');
});

test('a seeded objective create pair sits at its org-nested'
+ ' entity address, per org', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const starkRow = requests.find(
        r => r.uri_id === starkSeed.id,
    );
    assert.ok(starkRow, 'no request row for the STARK objective');
    assert.equal(
        starkRow!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/objectives/`,
    );
    const org2Row = requests.find(
        r => r.uri_id === 'seed-objective-org2',
    );
    assert.ok(org2Row, 'no request row for the org-2 objective');
    assert.equal(
        org2Row!.uri_prefix,
        `/organizations/${ORGANIZATION_TWO}/objectives/`,
    );
});

test('a seeded objective pair\'s embedded revision author'
+ ' matches the actually written revision row', async () => {
    // Guards the pure pre-tx human-member-pool reconstruction
    // (seed-message-pairs.ts's humanMemberPoolsByOrganization)
    // against silently drifting from the in-tx DB-read
    // `memberFor` the baseline/actual-score deferral still
    // uses — the two are proven to agree; this fails loudly if
    // a future change (e.g. a reordered membership Promise.all)
    // ever breaks that proof.
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const revision = await db.objectiveRevisions.getById(
        `${starkSeed.id}:2026-01-01T00:00:00.000000Z`,
    );
    assert.ok(revision, 'no revision row for the STARK objective');
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === starkSeed.id);
    assert.ok(row, 'no request row for the STARK objective');
    const embedded = JSON.parse(row!.message) as {
        body: { revision: { member_id: string } };
    };
    assert.equal(
        embedded.body.revision.member_id,
        revision!.member_id,
    );
});

test('seed pairs verify against their hashes', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of await db.responses.getAll()) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});

test('a bootstrap seed populates exactly one balanced,'
+ ' hash-verified pair for the current member', async () => {
    const db = new MemoryDbAdapter();
    await postBootstrap(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, 1);
    assert.equal(responses.length, 1);
    assert.equal(requests[0]!.uri_id, 'current');
    assert.equal(requests[0]!.uri_prefix, '/human-members/');
    assert.equal(
        await sha256Hex(requests[0]!.message),
        requests[0]!.message_hash,
    );
    assert.equal(
        await sha256Hex(responses[0]!.message),
        responses[0]!.message_hash,
    );
});
