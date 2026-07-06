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
    buildScoreSeedProjects,
} from '../api/mock-data/seed-message-pairs.ts';
import { humanMemberPoolsByOrganization }
    from '../api/mock-data/seed-kit.ts';
import { buildMembers } from '../api/mock-data/members.ts';
import { buildSeedScoreRows } from '../api/mock-data/scores.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    MOCK_SEED_TIMESTAMP,
} from '../api/mock-data/seed-constants.ts';
import { SYSTEM_MEMBER_ID } from '../api/types.ts';

// Task 4: the seed's pair-wired op-invocations (human-members,
// ideas, idea-submissions, flows, ai-members, records,
// objectives, memberships, members) each form a message pair in
// pass 1, before the seed's one transaction opens — see
// api/mock-data/seed-message-pairs.ts. This is the
// DETERMINISTIC coverage the fingerprint test excludes for the
// two message tables (mock-data-fingerprint.test.ts).

// The exact op-invocation count postMockDataLoad drives through
// a pair-capable op: 45 member-family pairs (Phase 8 Task 4's
// create-time bundle: 11 human-members + 4 ai-members, each now
// an operation/member-document/detail-document triple — the
// objectives-family 1+1+1 precedent generalized to the roster —
// 15 ops + 15 member documents + 15 detail documents) +
// 17 membership-family pairs (Phase 8 Task 5: 16 membership
// documents — 11 human-member-organization rows (`current`
// counted twice for its two-organization membership) + 4
// ai-member rows — plus the system member's own members/:id
// document, closed through postMembershipDocumentOp /
// postMemberDocumentOp, the LAST whole-slice seed deferral) +
// 11 ideas +
// 11 idea-submissions (Phase 2 Task 4b: one per seeded idea,
// closing the prior seed-only gap) + 17 projects (16 Stark +
// seed-project-org2, Phase 3 Task 3) + 13 flow-family pairs
// (flows: 4 creates × 3 + 1 document = 13 flow-family pairs —
// Task 5's operation/document/join triple per create, plus
// Task 6's seed-flow-org2 genesis document) +
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
// 15 objectives-family (5 ops + 5 documents + 5 revisions —
// Phase 7 Task 3's fixed 1+1+1 bundle synthesis, the flows
// precedent, over the same 4 STARK + seed-objective-org2 set)
// + 145 work-order documents + 145 flow-work-order joins
// (Phase 5 Task 4: the entity/join gap closed, one document
// pair and one join pair per seeded work order) + 49 baseline
// documents + 92 actual documents (Phase 7 Task 5: the scores
// half of the Phase 0 seed deferral closes — one document pair
// per seeded baseline/actual-score row, closed through
// postBaselineScoreDocumentOp / postActualScoreDocumentOp) =
// 581. A dropped or reordered invocation changes this count.
const EXPECTED_PAIR_COUNT = 581;

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

test('a seeded ai-member\'s member-document pair sits at the'
+ ' shared members/:id address, its body carrying `type`'
+ ' alone', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const memberRow = requests.find(
        r => r.uri_id === firstAiMember.id
            && r.uri_prefix === '/members/',
    );
    assert.ok(
        memberRow,
        'no member-document pair for the seeded ai member',
    );
    const embedded = JSON.parse(memberRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, { type: 'ai' });
});

test('a seeded ai-member\'s detail-document pair sits at its'
+ ' entity address, its body carrying the four AI detail'
+ ' keys', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    // The detail-document pair shares its address with the
    // operation pair (the create-address-collapse precedent —
    // ai-members' own createBodyIdField), so distinguish it by
    // its OWN 200 response, the operation pair's being 204.
    const detailRow = requests.find(
        r => r.uri_id === firstAiMember.id
            && r.uri_prefix === '/ai-members/'
            && responseById.get(r.id)?.status === 200,
    );
    assert.ok(
        detailRow,
        'no detail-document pair for the seeded ai member',
    );
    const embedded = JSON.parse(detailRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['description', 'model', 'name', 'skill_focus'],
    );
});

test('a seeded system member\'s member-document pair sits at'
+ ' the shared members/:id address, its body carrying `type`'
+ ' alone', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const memberRow = requests.find(
        r => r.uri_id === SYSTEM_MEMBER_ID
            && r.uri_prefix === '/members/',
    );
    assert.ok(
        memberRow,
        'no member-document pair for the seeded system member',
    );
    const embedded = JSON.parse(memberRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, { type: 'system' });
});

test('a seeded membership document pair sits at its org-nested'
+ ' entity address, its body carrying the three membership'
+ ' keys', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === 'seed-membership-' + firstAiMember.id,
    );
    assert.ok(row, 'no request row for the seeded membership');
    assert.equal(
        row!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/memberships/`,
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'identity_id', 'organization_id'],
    );
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
    // The document pair now shares this address with the
    // operation pair (Task 3's create-time bundle), so a
    // positional/single .find() is unsafe — filter/count
    // instead (the H7/arrival-order hazard class).
    const starkRows = requests.filter(
        r => r.uri_id === starkSeed.id,
    );
    assert.equal(starkRows.length, 2);
    for (const row of starkRows) {
        assert.equal(
            row.uri_prefix,
            `/organizations/${STARK_ORGANIZATION}/objectives/`,
        );
    }
    const org2Rows = requests.filter(
        r => r.uri_id === 'seed-objective-org2',
    );
    assert.equal(org2Rows.length, 2);
    for (const row of org2Rows) {
        assert.equal(
            row.uri_prefix,
            `/organizations/${ORGANIZATION_TWO}/objectives/`,
        );
    }
});

test('a seeded objective\'s document pair sits at its'
+ ' entity address, its body carrying no organization_id'
+ ' key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const requests = await db.requests.getAll();
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    // The document pair shares its address with the operation
    // pair (objectives' createBodyIdField collapses both onto
    // the SAME uri_id) — distinguish it by its OWN 200
    // response, the operation pair's being 204.
    const documentRow = requests.find(
        r => r.uri_id === starkSeed.id
            && r.uri_prefix
                === `/organizations/${STARK_ORGANIZATION}`
                    + '/objectives/'
            && responseById.get(r.id)?.status === 200,
    );
    assert.ok(
        documentRow, 'no document pair for the seeded objective',
    );
    const embedded = JSON.parse(documentRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(Object.keys(embedded.body), ['position']);
});

test('a seeded objective\'s revision pair sits at its own'
+ ' entity address, its body carrying the five revision'
+ ' keys', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const revisionId = `${starkSeed.id}:${MOCK_SEED_TIMESTAMP}`;
    const requests = await db.requests.getAll();
    const revisionRow = requests.find(
        r => r.uri_id === revisionId
            && r.uri_prefix
                === `/organizations/${STARK_ORGANIZATION}`
                    + `/objectives/${starkSeed.id}/revisions/`,
    );
    assert.ok(
        revisionRow, 'no revision pair for the seeded objective',
    );
    const embedded = JSON.parse(revisionRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'description', 'member_id', 'name', 'objective_id'],
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

// Phase 7 Task 5: the scores half of the seed deferral closes —
// every seeded baseline/actual-score row now forms its own
// message pair, driven through postBaselineScoreDocumentOp /
// postActualScoreDocumentOp, mirroring the flow-record join
// precedent above (address + no-`id`-key body shape). The
// expected rows come straight from buildSeedScoreRows — the SAME
// pure builder pass 1 (seed-message-pairs.ts) and pass 2
// (mock-data.ts) both consume — so this test can never drift
// from what the seed actually wrote.
const scoreRows = buildSeedScoreRows(
    buildScoreSeedProjects(),
    humanMemberPoolsByOrganization(buildMembers()),
);

test('a seeded baseline-score pair sits at its org-nested'
+ ' entity address, its body carrying no id key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstBaseline = scoreRows.baselines[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstBaseline.id);
    assert.ok(row, 'no request row for the seeded baseline score');
    assert.equal(
        row!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/projects/`
            + `${firstBaseline.fields.project_id}`
            + '/objective-baseline-scores/',
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'member_id', 'objective_id', 'project_id', 'score'],
    );
});

test('a seeded actual-score pair sits at its org-nested'
+ ' entity address, its body carrying no id key', async () => {
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const firstActual = scoreRows.actuals[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstActual.id);
    assert.ok(row, 'no request row for the seeded actual score');
    assert.equal(
        row!.uri_prefix,
        `/organizations/${STARK_ORGANIZATION}/projects/`
            + `${firstActual.fields.project_id}`
            + '/objective-actual-scores/',
    );
    const embedded = JSON.parse(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'member_id', 'objective_id', 'project_id', 'score'],
    );
});

test('every seeded STARK objective pair\'s embedded revision'
+ ' author matches the actually written revision row',
async () => {
    // Guards the pure pre-tx human-member-pool reconstruction
    // (seed-message-pairs.ts's humanMemberPoolsByOrganization)
    // against a reordered-Promise.all regression: pass 1 forms
    // this pair before pass 2 writes any membership row, so the
    // two MUST already agree on which pool position each seeded
    // human occupies. Checked over ALL four STARK objectives, not
    // a single sample; the SAME pool also backs buildSeedScoreRows's
    // author pick (Phase 7 Task 5, its own STANDING content pins
    // in tests/mock-data-objectives.test.ts).
    const db = new MemoryDbAdapter();
    await postMockDataLoad(db);
    const requests = await db.requests.getAll();
    const responseById = new Map(
        (await db.responses.getAll()).map(r => [r.id, r]),
    );
    for (const starkSeed of OBJECTIVE_SEEDS) {
        const revision = await db.objectiveRevisions.getById(
            `${starkSeed.id}:${MOCK_SEED_TIMESTAMP}`,
        );
        assert.ok(
            revision,
            'no revision row for ' + starkSeed.id,
        );
        // The operation pair alone embeds the full create body
        // (its own `revision` sub-object) — the document pair
        // now sharing this address carries `{position}` only, so
        // select by the operation's OWN 204 response (the
        // document pair's being 200), never a positional first
        // match (the H7/arrival-order hazard class).
        const row = requests.find(
            r => r.uri_id === starkSeed.id
                && responseById.get(r.id)?.status === 204,
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

test('a bootstrap seed populates exactly five balanced,'
+ ' hash-verified pairs for the current member and the system'
+ ' member', async () => {
    const db = new MemoryDbAdapter();
    await postBootstrap(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    // Task 4: bootstrap's lone human-member create forms the
    // SAME 1+1+1 bundle the mock-data seed's own human-members
    // loop does — operation + detail document (shared
    // human-members address) + member document (its own
    // address). Task 5: bootstrap's OWN membership document and
    // the system member's OWN members/:id document close the
    // last two raw bootstrap writes — 3 + 2 = 5.
    assert.equal(requests.length, 5);
    assert.equal(responses.length, 5);
    const atEntity = requests.filter(
        r => r.uri_prefix === '/human-members/'
            && r.uri_id === 'current',
    );
    assert.equal(atEntity.length, 2);
    const atMember = requests.filter(
        r => r.uri_prefix === '/members/' && r.uri_id === 'current',
    );
    assert.equal(atMember.length, 1);
    const atSystemMember = requests.filter(
        r => r.uri_prefix === '/members/'
            && r.uri_id === SYSTEM_MEMBER_ID,
    );
    assert.equal(atSystemMember.length, 1);
    const atMembership = requests.filter(
        r => r.uri_prefix
            === `/organizations/${STARK_ORGANIZATION}/memberships/`
            && r.uri_id === 'bootstrap-membership-current',
    );
    assert.equal(atMembership.length, 1);
    for (const row of requests) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
    for (const row of responses) {
        assert.equal(
            await sha256Hex(row.message), row.message_hash,
        );
    }
});
