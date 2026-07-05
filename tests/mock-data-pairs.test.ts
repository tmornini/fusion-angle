import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { postMockDataLoad, postBootstrap } from '../api/mock-data.ts';
import { sha256Hex } from '../shared/digest.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import { buildAiMembers } from '../api/mock-data/ai-members.ts';
import { OBJECTIVE_SEEDS } from '../api/mock-data/objectives.ts';
import {
    customerProfileRecordId,
    buildRecordAttributes,
} from '../api/mock-data/records.ts';
import {
    buildWorkOrders,
    buildFlowWorkOrderJoins,
} from '../api/mock-data/work-orders.ts';
import {
    mockFlowRecords,
} from '../api/mock-data/seed-message-pairs.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    MOCK_SEED_TIMESTAMP,
} from '../api/mock-data/seed-constants.ts';

// Task 4: the seed's pair-wired op-invocations (human-members,
// ideas, idea-submissions, flows, ai-members, records,
// objectives) each form a message pair in pass 1, before the
// seed's one transaction opens — see
// api/mock-data/seed-message-pairs.ts. This is the
// DETERMINISTIC coverage the fingerprint test excludes for the
// two message tables (mock-data-fingerprint.test.ts).

// The exact op-invocation count postMockDataLoad drives through
// a pair-capable op: 11 human-members + 11 ideas +
// 11 idea-submissions (Phase 2 Task 4b: one per seeded idea,
// closing the prior seed-only gap) + 17 projects (16 Stark +
// seed-project-org2, Phase 3 Task 3) + 13 flow-family pairs
// (flows: 4 creates × 3 + 1 document = 13 flow-family pairs —
// Task 5's operation/document/join triple per create, plus
// Task 6's seed-flow-org2 genesis document) + 4 ai-members +
// 18 records-family (Phase 6 Task 4's bundle synthesis, the
// migration's first VARIABLE-cardinality one: 2 operations + 2
// documents + 14 attribute documents — one attribute-PUT
// invocation per seeded attribute, generalized from flows'
// fixed 1+1+1 to 1+1+N; every seeded attribute is genesis, so
// no attribute-DELETE invocation exists in the seed) +
// 3 flow-record joins (Phase 6 Task 5: the ONE genuine seed
// gap this migration found — the 3 seeded flow_records rows
// formed zero pairs before, one join pair per binding now,
// closed through postFlowRecordDocumentOp) +
// 5 objectives (4 STARK + seed-objective-org2) + 145 work-order
// documents + 145 flow-work-order joins (Phase 5 Task 4: the
// entity/join gap closed, one document pair and one join pair
// per seeded work order) = 383. A dropped or reordered
// invocation changes this count.
const EXPECTED_PAIR_COUNT = 383;

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

test('a seeded record\'s document pair sits at its'
+ ' entity address, its body carrying the entity plus the'
+ ' state trio (no id or organization_id key)', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    // The document pair shares its address with the operation
    // pair (records' createBodyIdField collapses both onto the
    // SAME uri_id) — distinguish it by its OWN 200 response, the
    // operation pair's being 204.
    const documentRow = requests.find(
        r => r.uri_id === customerProfileRecordId
            && r.uri_prefix === '/organizations/1/records/'
            && responseById.get(r.id)?.status === 200,
    );
    assert.ok(
        documentRow, 'no document pair for the seeded record',
    );
    // The id-strip covenant (verification finding, lens 4) made
    // falsifiable: a spurious id/organization_id key riding the
    // recorded body would drift from wire fidelity with no
    // address-only check catching it.
    const embedded = JSON.parse(documentRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        [
            'description', 'name', 'position',
            'state', 'state_at', 'state_event_id',
        ],
    );
});

test('a seeded record attribute\'s document pair sits at'
+ ' its own entity address, its body carrying no id or'
+ ' organization_id key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstAttribute = buildRecordAttributes()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstAttribute.id,
    );
    assert.ok(
        row, 'no request row for the seeded attribute',
    );
    assert.equal(
        row!.uri_prefix,
        '/organizations/1/record-attributes/',
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        [
            'attribute_type', 'constraints', 'name',
            'options', 'record_id', 'sort_order',
        ],
    );
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

test('a seeded work-order document pair sits at its org-nested'
+ ' entity address, its body carrying no id key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstWorkOrder = buildWorkOrders()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstWorkOrder.id,
    );
    assert.ok(row, 'no request row for the seeded work order');
    assert.equal(row!.uri_prefix, '/organizations/1/work-orders/');
    // The id-strip covenant (verification finding, lens 4): a
    // spurious `id` key riding the recorded body would drift
    // from wire fidelity with no address-only check catching
    // it, so the key set itself is the falsifiable pin.
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['display_id', 'flow_graph', 'organization_id', 'position'],
    );
});

test('a seeded flow-work-order join pair sits at its'
+ ' org-nested join address, its body carrying no id key',
async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstJoin = buildFlowWorkOrderJoins()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstJoin.id);
    assert.ok(row, 'no request row for the seeded join');
    assert.equal(
        row!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/flows/`
            + `${firstJoin.flow_id}/work-orders/`,
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'flow_id', 'work_order_id'],
    );
});

test('a seeded flow-record join pair sits at its org-nested'
+ ' join address, its body carrying no id key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstJoin = mockFlowRecords[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstJoin.id);
    assert.ok(row, 'no request row for the seeded join');
    assert.equal(
        row!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/flows/`
            + `${firstJoin.flow_id}/records/`,
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'flow_id', 'record_id'],
    );
});

test('every seeded STARK objective pair\'s embedded revision'
+ ' author matches the actually written revision row',
async () => {
    // Guards the pure pre-tx human-member-pool reconstruction
    // (seed-message-pairs.ts's humanMemberPoolsByOrganization)
    // against silently drifting from the in-tx DB-read
    // `memberFor` the baseline/actual-score deferral still
    // uses — the two are proven to agree (insertion-order trace
    // of the buffered-tx backend plus this check over ALL four
    // STARK objectives, not a single sample); this fails loudly
    // if a future change (e.g. a reordered membership
    // Promise.all) ever breaks that proof.
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    for (const starkSeed of OBJECTIVE_SEEDS) {
        const revision = await db.objectiveRevisions.getById(
            `${starkSeed.id}:${MOCK_SEED_TIMESTAMP}`,
        );
        assert.ok(
            revision,
            'no revision row for ' + starkSeed.id,
        );
        const row = requests.find(
            r => r.uri_id === starkSeed.id,
        );
        assert.ok(row, 'no request row for ' + starkSeed.id);
        const embedded = JSON.parse(row!.message) as {
            body: { revision: { member_id: string } };
        };
        assert.equal(
            embedded.body.revision.member_id,
            revision!.member_id,
        );
    }
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
