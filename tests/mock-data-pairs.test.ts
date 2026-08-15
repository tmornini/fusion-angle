import { test } from 'node:test';
import {
    workOrderLifecycleStatesFor,
} from '../api/derive-states.ts';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postBootstrap } from '../api/mock-data.ts';
import { sharedMockDb } from './mock-seed.ts';
import { requestMessageHash } from '../api/message-form.ts';
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
    buildWorkOrderStateEvents,
} from '../api/mock-data/work-orders.ts';
import {
    mockFlowRecords,
    mockStateFieldValues,
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
import { deriveOrganization } from
    '../api/derive-organizations.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';

function pairJsonOf(message: string): {
    readonly body: Record<string, unknown>;
} {
    const body = HttpMessage.fromWire(message).body();
    return {
        body: body.exists()
            ? JSON.parse(body.toText()) as
                Record<string, unknown>
            : {},
    };
}

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
// 2 organizations documents (Phase 12 Task 3: the tenant root's
// own family onboards — Stark Industries + Wayne Enterprises,
// each forming its OWN organizations/:id document pair; Phase
// Final Task 2 strips the organizations ROW half — pairs alone
// remain) +
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
// precedent, over the same 4 STARK + seed-objective-org2 set;
// states-address retirement rides the genesis trio on those
// same create/document bodies — pair COUNT unchanged)
// + 145 work-order documents + 145 flow-work-order joins
// (Phase 5 Task 4: the entity/join gap closed, one document
// pair and one join pair per seeded work order) + 49 baseline
// documents + 92 actual documents (Phase 7 Task 5: the scores
// half of the Phase 0 seed deferral closes — one document pair
// per seeded baseline/actual-score row, closed through
// postBaselineScoreDocumentOp / postActualScoreDocumentOp) +
// 11 identity_pii document pairs (Phase 10 Task 2's intake
// decomposition: each seeded human's PUT identities/:id/pii,
// formerly folded into the human-members create body, now its
// own document address, closed through
// postIdentityPiiDocumentOp) +
// 11 identities-document pairs (Phase 10 Task 5: each seeded
// human-member create ALSO forms its own identities/:id document
// pair — the create-time bundle widens from a triple to a
// quadruple for human members only; an AI member forms no
// identities row — finding 10 — so its own bundle stays a
// triple) + 5 identities-document pairs (Phase 10 Task 6: the
// 4 AI members + the system member each form their OWN
// identities/:id document pair too — a standalone invocation,
// not a bundle-widening, since neither create-time bundle ever
// carried one) + 12 identity-credential document pairs (Phase 10
// Task 6: 11 human password credentials + the system client-
// secret credential, one identities/:id/credentials/:cid pair
// per row — formed by seedHumanCredentials' OWN local pass-1/
// pass-2 split, api/mock-data.ts, since a credential's hashed
// secret is unknown until PBKDF2 resolves and so can never join
// this file's shared pre-tx pass) + 0 role-grant document pairs
// (retired: membership type carries privilege; mint bakes
// claims) + 859 legacy work-order historical-trace transition
// op pairs (states-address retirement Task 12: 861 traces
// minus WO01's two value-bearing events, which migrate to the
// instance chain) + 6 WO-instance SoT chain pairs (Task 6:
// instance genesis + binding + Review/Complete new-shape ops
// each with a revision — net +4 vs 1494) + 11 identity-default-
// organization pairs (Phase 11 Task 8: one event-append pair
// per seeded human member at its identity-keyed
// /identities/:id/default-org/ address; Phase Final Task 2
// strips the identity_default_organizations ROW half — pairs
// alone remain) + 1 gate0001 Capture step (R1-FIX-A re-home)
// = 1498 after WO-instance SoT seed (+4: instance genesis +
// binding + 2 revisions — WO-instance SoT stack; the two new-
// shape ops replace the two dropped legacy transitions).
// System-member genesis folds into the members/:id document
// trio (states-address retirement Task 8) — no bare states/:id
// pair. A dropped or reordered invocation changes this count.
// Bootstrap absolute is 12 (was 13).
const EXPECTED_PAIR_COUNT = 1498;

test('a mock-data seed populates balanced pairs',
async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    assert.equal(requests.length, responses.length);
    assert.ok(requests.length > 0);
});

test('the mock-data seed forms exactly the traced'
+ ' op-invocation count', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    assert.equal(requests.length, EXPECTED_PAIR_COUNT);
    assert.equal(
        (await db.responses.getAll()).length,
        EXPECTED_PAIR_COUNT,
    );
});

test('every seed op body carries a unique entity id, so no'
+ ' two request hashes collide', async () => {
    const db = await sharedMockDb();
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
    const db = await sharedMockDb();
    const firstIdea = buildIdeas()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstIdea.id,
    );
    assert.ok(row, 'no request row for the seeded idea');
    assert.equal(row!.uri_collection, '/organizations/1/ideas/');
});

test('a seeded organizations pair sits at the global'
+ ' (non-org-nested) address, its actor is the system member,'
+ ' and its stored body\'s fields equal the derived'
+ ' organization exactly (Phase Final Task 2: organizations'
+ ' ROW half stripped — pair-plane truth)',
async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_collection === '/organizations/'
            && r.uri_id === STARK_ORGANIZATION,
    );
    assert.ok(row, 'no request row for the seeded organization');
    assert.equal(row!.requester_identity_id, SYSTEM_MEMBER_ID);
    const derived = await deriveOrganization(
        db, STARK_ORGANIZATION,
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, {
        name: derived.name,
        domain: derived.domain,
        next_billing: derived.next_billing,
        seats: derived.seats,
        projects_limit: derived.projects_limit,
        ideas_limit: derived.ideas_limit,
    });
    // Phase Final Stage B: organizations table retired.
});

test('a seeded human-member create pair sits at the global'
+ ' (non-org-nested) address', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === 'current');
    assert.ok(row, 'no request row for the current member');
    assert.equal(row!.uri_collection, '/human-members/');
});

test('a seeded human member\'s PII intake pair sits at its own'
+ ' identities/:id/pii address, its body carrying the four PII'
+ ' keys (Phase 10 Task 2\'s intake decomposition)', async () => {
    const db = await sharedMockDb();
    const firstMember = buildMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_collection
            === '/identities/' + firstMember.id + '/pii/',
    );
    assert.ok(row, 'no request row for the seeded PII intake');
    assert.equal(row!.uri_id, '');
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['bio', 'email', 'name', 'phone'],
    );
});

test('a seeded human member\'s identities-document pair sits at'
+ ' the shared identities/:id address, its body carrying `kind`'
+ ' alone (Phase 10 Task 5)', async () => {
    const db = await sharedMockDb();
    const firstMember = buildMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_collection === '/identities/'
            && r.uri_id === firstMember.id,
    );
    assert.ok(
        row, 'no request row for the seeded identities document',
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, { kind: 'person' });
});

test('a seeded flow create pair sits at its org-nested'
+ ' entity address', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === 'h5mErVBQhwdMKwi1co30jB',
    );
    assert.ok(row, 'no request row for the seeded flow');
    assert.equal(row!.uri_collection, '/organizations/1/flows/');
});

test('a seeded ai-member create pair sits at the global'
+ ' (non-org-nested) address', async () => {
    const db = await sharedMockDb();
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    // The operation pair shares its uri_id with its OWN detail-
    // document pair (ai-members/:id) and, since Phase 10 Task 6,
    // its OWN identities/:id document pair too — distinguish it
    // by POST (the document pairs are PUT), the detail-document
    // test's own precedent below (the H7/arrival-order hazard
    // class).
    const row = requests.find(
        r => r.uri_id === firstAiMember.id
            && r.method === 'POST',
    );
    assert.ok(row, 'no request row for the seeded ai member');
    assert.equal(row!.uri_collection, '/ai-members/');
});

test('a seeded ai-member\'s member-document pair sits at the'
+ ' shared members/:id address, its body carrying type plus'
+ ' the lifecycle trio', async () => {
    const db = await sharedMockDb();
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const memberRow = requests.find(
        r => r.uri_id === firstAiMember.id
            && r.uri_collection === '/members/',
    );
    assert.ok(
        memberRow,
        'no member-document pair for the seeded ai member',
    );
    const embedded = pairJsonOf(memberRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, {
        type: 'ai',
        state: 'active',
        state_at: MOCK_SEED_TIMESTAMP,
        state_event_id:
            `seed-member-${firstAiMember.id}-active`,
    });
});

test('a seeded ai-member\'s detail-document pair sits at its'
+ ' entity address, its body carrying the four AI detail'
+ ' keys', async () => {
    const db = await sharedMockDb();
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    // The detail-document pair shares its address with the
    // operation pair (the create-address-collapse precedent —
    // ai-members' own createBodyIdField), so distinguish it
    // by PUT, the operation pair being POST.
    const detailRow = requests.find(
        r => r.uri_id === firstAiMember.id
            && r.uri_collection === '/ai-members/'
            && r.method === 'PUT',
    );
    assert.ok(
        detailRow,
        'no detail-document pair for the seeded ai member',
    );
    const embedded = pairJsonOf(detailRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['description', 'model', 'name', 'skill_focus'],
    );
});

test('a seeded system member\'s member-document pair sits at'
+ ' the shared members/:id address, its body carrying type'
+ ' plus the lifecycle trio (genesis folded in)', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const memberRow = requests.find(
        r => r.uri_id === SYSTEM_MEMBER_ID
            && r.uri_collection === '/members/',
    );
    assert.ok(
        memberRow,
        'no member-document pair for the seeded system member',
    );
    const embedded = pairJsonOf(memberRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(embedded.body, {
        type: 'system',
        state: 'active',
        state_at: MOCK_SEED_TIMESTAMP,
        state_event_id:
            `seed-member-${SYSTEM_MEMBER_ID}-active`,
    });
});

test('a seeded membership document pair sits at its org-nested'
+ ' entity address, its body carrying the four membership'
+ ' keys', async () => {
    const db = await sharedMockDb();
    const firstAiMember = buildAiMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === 'seed-membership-' + firstAiMember.id,
    );
    assert.ok(row, 'no request row for the seeded membership');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/memberships/`,
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'identity_id', 'organization_id', 'type'],
    );
});

test('a seeded default-org pair sits at its identity-keyed'
+ ' address, its body carrying the three default-org keys',
async () => {
    const db = await sharedMockDb();
    const firstMember = buildMembers()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_collection
            === '/identities/' + firstMember.id + '/default-org/',
    );
    assert.ok(row, 'no request row for the seeded default-org event');
    assert.equal(row!.uri_id, 'seed-default-org-' + firstMember.id);
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'eventId', 'organization_id'],
    );
});

test('a seeded record create pair sits at its org-nested'
+ ' entity address', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === customerProfileRecordId,
    );
    assert.ok(row, 'no request row for the seeded record');
    // Task 4: wire family `records` stores at record-types.
    assert.equal(
        row!.uri_collection,
        '/organizations/1/record-types/',
    );
});

test('a seeded record\'s document pair sits at its'
+ ' entity address, its body carrying the entity plus the'
+ ' state trio (no id or organization_id key)', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    // The document pair shares its address with the operation
    // pair (records' createBodyIdField collapses both onto the
    // SAME uri_id) — distinguish it by PUT, the operation
    // pair being POST.
    const documentRow = requests.find(
        r => r.uri_id === customerProfileRecordId
            && r.uri_collection
                === '/organizations/1/record-types/'
            && r.method === 'PUT',
    );
    assert.ok(
        documentRow, 'no document pair for the seeded record',
    );
    // The id-strip covenant (verification finding, lens 4) made
    // falsifiable: a spurious id/organization_id key riding the
    // recorded body would drift from wire fidelity with no
    // address-only check catching it.
    const embedded = pairJsonOf(documentRow!.message) as {
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
+ ' its nested type-attributes address, its body carrying'
+ ' no id, organization_id, or record_id key and both ACL'
+ ' arrays', async () => {
    const db = await sharedMockDb();
    const firstAttribute = buildRecordAttributes()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstAttribute.id,
    );
    assert.ok(
        row, 'no request row for the seeded attribute',
    );
    assert.equal(
        row!.uri_collection,
        '/organizations/1/record-types/'
        + 'rec01CustProfRec0rdAB1/attributes/',
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        [
            'attribute_type', 'constraints', 'name',
            'options', 'read_roles', 'sort_order',
            'write_roles',
        ],
    );
});

test('a seeded objective create pair sits at its org-nested'
+ ' entity address, per org', async () => {
    const db = await sharedMockDb();
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
            row.uri_collection,
            `/organizations/${STARK_ORGANIZATION}/objectives/`,
        );
    }
    const org2Rows = requests.filter(
        r => r.uri_id === 'seed-objective-org2',
    );
    assert.equal(org2Rows.length, 2);
    for (const row of org2Rows) {
        assert.equal(
            row.uri_collection,
            `/organizations/${ORGANIZATION_TWO}/objectives/`,
        );
    }
});

test('a seeded objective\'s document pair sits at its'
+ ' entity address, body carrying position plus the'
+ ' lifecycle trio and no organization_id key', async () => {
    const db = await sharedMockDb();
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const requests = await db.requests.getAll();
    // The document pair shares its address with the operation
    // pair (objectives' createBodyIdField collapses both onto
    // the SAME uri_id) — distinguish it by PUT, the
    // operation pair being POST.
    const documentRow = requests.find(
        r => r.uri_id === starkSeed.id
            && r.uri_collection
                === `/organizations/${STARK_ORGANIZATION}`
                    + '/objectives/'
            && r.method === 'PUT',
    );
    assert.ok(
        documentRow, 'no document pair for the seeded objective',
    );
    const embedded = pairJsonOf(documentRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body),
        ['position', 'state', 'state_at', 'state_event_id'],
    );
    assert.equal(embedded.body.state, 'active');
    assert.equal(
        embedded.body.state_event_id,
        'seed-objective-' + starkSeed.id + '-active',
    );
});

test('a seeded objective\'s revision pair sits at its own'
+ ' entity address, its body carrying the five revision'
+ ' keys', async () => {
    const db = await sharedMockDb();
    const starkSeed = OBJECTIVE_SEEDS[0]!;
    const revisionId = `${starkSeed.id}:${MOCK_SEED_TIMESTAMP}`;
    const requests = await db.requests.getAll();
    const revisionRow = requests.find(
        r => r.uri_id === revisionId
            && r.uri_collection
                === `/organizations/${STARK_ORGANIZATION}`
                    + `/objectives/${starkSeed.id}/revisions/`,
    );
    assert.ok(
        revisionRow, 'no revision pair for the seeded objective',
    );
    const embedded = pairJsonOf(revisionRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'description', 'member_id', 'name', 'objective_id'],
    );
});

test('a seeded work-order document pair sits at its org-nested'
+ ' entity address, its body carrying no id key', async () => {
    const db = await sharedMockDb();
    const firstWorkOrder = buildWorkOrders()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(
        r => r.uri_id === firstWorkOrder.id,
    );
    assert.ok(row, 'no request row for the seeded work order');
    assert.equal(row!.uri_collection, '/organizations/1/work-orders/');
    // The id-strip covenant (verification finding, lens 4): a
    // spurious `id` key riding the recorded body would drift
    // from wire fidelity with no address-only check catching
    // it, so the key set itself is the falsifiable pin.
    const embedded = pairJsonOf(row!.message) as {
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
    const db = await sharedMockDb();
    const firstJoin = buildFlowWorkOrderJoins()[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstJoin.id);
    assert.ok(row, 'no request row for the seeded join');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/flows/`
            + `${firstJoin.flow_id}/work-orders/`,
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'flow_id', 'work_order_id'],
    );
});

test('a seeded flow-record join pair sits at its org-nested'
+ ' join address, its body carrying no id key', async () => {
    const db = await sharedMockDb();
    const firstJoin = mockFlowRecords[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstJoin.id);
    assert.ok(row, 'no request row for the seeded join');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/flows/`
            + `${firstJoin.flow_id}/records/`,
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'flow_id', 'record_id'],
    );
});

// Phase 11 Task 3: the work-order historical-trace carve-out
// closes — every trace event (211 hand-authored + 649 generated)
// and every state_field_value now forms its own pair too, Path A
// (the states / state_field_values rows themselves stay the SAME
// direct writes mock-data.ts already made).

function transitionRequestForEvent(
    requests: readonly { message: string; uri_collection: string;
        requester_identity_id: string }[],
    eventId: string,
): { message: string; uri_collection: string;
    requester_identity_id: string } | undefined {
    return requests.find((r) => {
        try {
            const embedded = pairJsonOf(r.message) as {
                body?: { transitionEventId?: string };
            };
            return embedded.body?.transitionEventId
                === eventId;
        } catch {
            return false;
        }
    });
}

test('a seeded work-order trace event\'s pair sits at its'
+ ' org-nested transition address, its body carrying the'
+ ' transition keys (states/:id retired)', async () => {
    const db = await sharedMockDb();
    const firstTrace = buildWorkOrderStateEvents()[0]!;
    const requests = await db.requests.getAll();
    const row = transitionRequestForEvent(
        requests, firstTrace.id,
    );
    assert.ok(row, 'no request row for the seeded transition');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/work-orders/`
            + `${firstTrace.entity_id}/transition/`,
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        [
            'fieldValues', 'release', 'targetState',
            'transitionAt', 'transitionEventId',
        ],
    );
    assert.equal(
        embedded.body['transitionEventId'], firstTrace.id,
    );
    assert.equal(
        embedded.body['targetState'], firstTrace.state,
    );
});

test('a seeded transition pair\'s stored request'
+ ' requester_identity_id matches its derived event\'s'
+ ' member_id (the role-grant precedent: fingerprints hash'
+ ' ids only, so a wrong-but-real member_id is otherwise'
+ ' fingerprint-invisible)', async () => {
    const db = await sharedMockDb();
    const firstTrace = buildWorkOrderStateEvents()[0]!;
    const requests = await db.requests.getAll();
    const row = transitionRequestForEvent(
        requests, firstTrace.id,
    );
    assert.ok(row, 'no request row for the seeded transition');
    const lifecycle = await workOrderLifecycleStatesFor(
        db, STARK_ORGANIZATION, firstTrace.entity_id,
    );
    const written = lifecycle.find(s => s.id === firstTrace.id)!;
    assert.ok(written, 'derived state missing');
    assert.equal(row!.requester_identity_id, written.member_id);
    // Index 0 is its work order's OWN first event, so a
    // regression that sources every trace pair's requester
    // from the work order's first-event member (rather than
    // the event's own) would pass the assertion above
    // undetected. Index 2 is the SAME work order's third
    // event, and its member_id diverges from index 0's —
    // only the per-event implementation matches it.
    const divergingTrace = buildWorkOrderStateEvents()[2]!;
    const divergingRow = transitionRequestForEvent(
        requests, divergingTrace.id,
    );
    assert.ok(
        divergingRow,
        'no request row for the diverging transition',
    );
    const divergingLifecycle =
        await workOrderLifecycleStatesFor(
            db, STARK_ORGANIZATION, divergingTrace.entity_id,
        );
    const divergingWritten = divergingLifecycle.find(
        s => s.id === divergingTrace.id,
    )!;
    assert.equal(
        divergingRow!.requester_identity_id,
        divergingWritten.member_id,
    );
});

test('a seeded state_field_value folds into its parent'
+ ' transition body (no bare leaf pair)', async () => {
    const db = await sharedMockDb();
    const firstFieldValue = mockStateFieldValues[0]!;
    const requests = await db.requests.getAll();
    // WO-instance SoT Task 6: value-bearing seed transitions
    // ride new-shape set[] (attribute_id ids); legacy bags
    // gone on WO01.
    const row = requests.find((r) => {
        try {
            const embedded = pairJsonOf(r.message) as {
                body?: {
                    set?: readonly {
                        attribute_id: string;
                        value: string;
                    }[];
                };
            };
            return (embedded.body?.set ?? []).some(
                (entry) =>
                    entry.attribute_id
                        === firstFieldValue.attribute_id
                    && entry.value === firstFieldValue.value,
            );
        } catch {
            return false;
        }
    });
    assert.ok(row, 'no transition carries the seeded field value');
    assert.match(
        row!.uri_collection,
        new RegExp(
            `^/organizations/${STARK_ORGANIZATION}`
                + '/work-orders/[^/]+/transition/$',
        ),
    );
    const embedded = pairJsonOf(row!.message) as {
        body: {
            set: readonly {
                attribute_id: string;
                value: string;
            }[];
            instance_id: string;
            record_type_id: string;
        };
    };
    const fold = embedded.body.set.find(
        (entry) =>
            entry.attribute_id
                === firstFieldValue.attribute_id,
    )!;
    assert.equal(fold.value, firstFieldValue.value);
    assert.equal(
        typeof embedded.body.instance_id, 'string',
    );
    assert.equal(
        typeof embedded.body.record_type_id, 'string',
    );
});

test('the mock-data seed\'s system-member genesis rides the'
+ ' members/:id document trio',
async () => {
    const db = await sharedMockDb();
    const eventId =
        `seed-member-${SYSTEM_MEMBER_ID}-active`;
    const requests = await db.requests.getAll();
    const memberRow = requests.find(
        r => r.uri_collection === '/members/'
            && r.uri_id === SYSTEM_MEMBER_ID,
    );
    assert.ok(memberRow, 'no system members/:id pair');
    const embedded = pairJsonOf(memberRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.equal(embedded.body.state_event_id, eventId);
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
    const db = await sharedMockDb();
    const firstBaseline = scoreRows.baselines[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstBaseline.id);
    assert.ok(row, 'no request row for the seeded baseline score');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/projects/`
            + `${firstBaseline.fields.project_id}`
            + '/objective-baseline-scores/',
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'member_id', 'objective_id', 'project_id', 'score'],
    );
});

test('a seeded actual-score pair sits at its org-nested'
+ ' entity address, its body carrying no id key', async () => {
    const db = await sharedMockDb();
    const firstActual = scoreRows.actuals[0]!;
    const requests = await db.requests.getAll();
    const row = requests.find(r => r.uri_id === firstActual.id);
    assert.ok(row, 'no request row for the seeded actual score');
    assert.equal(
        row!.uri_collection,
        `/organizations/${STARK_ORGANIZATION}/projects/`
            + `${firstActual.fields.project_id}`
            + '/objective-actual-scores/',
    );
    const embedded = pairJsonOf(row!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'member_id', 'objective_id', 'project_id', 'score'],
    );
});

test('every seeded STARK objective pair\'s embedded revision'
+ ' author matches the revision document pair body',
async () => {
    // Guards the pure pre-tx human-member-pool reconstruction
    // (seed-message-pairs.ts's humanMemberPoolsByOrganization)
    // against a reordered-Promise.all regression: pass 1 forms
    // this pair before pass 2 writes any membership row, so the
    // two MUST already agree on which pool position each seeded
    // human occupies. Phase Final Task 2: objective_revisions
    // ROW half stripped — compare create-op embedded revision
    // author against the revision document pair body.
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    for (const starkSeed of OBJECTIVE_SEEDS) {
        const revisionId =
            `${starkSeed.id}:${MOCK_SEED_TIMESTAMP}`;
        const revisionRow = requests.find(
            r => r.uri_id === revisionId
                && r.uri_collection.includes('/revisions/'),
        );
        assert.ok(
            revisionRow,
            'no revision pair for ' + starkSeed.id,
        );
        const revisionBody = pairJsonOf(
            revisionRow!.message,
        ) as { body: { member_id: string } };
        // The operation pair alone embeds the full create body
        // (its own `revision` sub-object) — the document pair
        // now sharing this address carries `{position}` only,
        // so select by POST, never a positional first match
        // (the H7/arrival-order hazard class).
        const row = requests.find(
            r => r.uri_id === starkSeed.id
                && r.method === 'POST',
        );
        assert.ok(row, 'no request row for ' + starkSeed.id);
        const embedded = pairJsonOf(row!.message) as {
            body: { revision: { member_id: string } };
        };
        assert.equal(
            embedded.body.revision.member_id,
            revisionBody.body.member_id,
        );
    }
});

test('a seeded credential\'s response body carries the full'
+ ' credential key set (Phase 10 Task 6 — content is'
+ ' nondeterministic per reseed, finding 13, so only the'
+ ' key set is falsifiable here)', async () => {
    const db = await sharedMockDb();
    const id = 'seed-cred-system-client-secret';
    const requests = await db.requests.getAll();
    const requestRow = requests.find(r => r.uri_id === id);
    assert.ok(requestRow, 'no request row for ' + id);
    const responses = await db.responses.getAll();
    const responseRow = responses.find(
        r => r.id === requestRow!.id,
    );
    assert.ok(responseRow, 'no response row for ' + id);
    const embedded = pairJsonOf(responseRow!.message) as {
        body: Record<string, unknown>;
    };
    assert.deepEqual(
        Object.keys(embedded.body).sort(),
        ['at', 'id', 'identity_id', 'kind', 'secret', 'status'],
    );
});

test('seeded memberships carry type and no role-grant'
+ ' pairs remain', async () => {
    const db = await sharedMockDb();
    const requests = await db.requests.getAll();
    assert.equal(
        requests.filter(r =>
            r.uri_collection.includes('/role-grants/')).length,
        0,
    );
    const membershipReqs = requests.filter(r =>
        r.uri_collection.includes('/memberships/'));
    assert.ok(membershipReqs.length > 0);
    for (const row of membershipReqs) {
        const embedded = pairJsonOf(row.message) as {
            body: Record<string, unknown>;
        };
        assert.ok(
            embedded.body.type === 'admin'
            || embedded.body.type === 'member',
            'membership ' + row.uri_id + ' missing type',
        );
    }
});

test('seed pairs verify against their hashes', async () => {
    const db = await sharedMockDb();
    for (const row of await db.requests.getAll()) {
        assert.equal(
            await requestMessageHash(row.message),
            row.message_hash,
        );
    }
});

test('a bootstrap seed populates exactly twelve balanced,'
+ ' hash-verified pairs for the current member and the system'
+ ' member', async () => {
    const db = memoryDbAdapter();
    await postBootstrap(db);
    const requests = await db.requests.getAll();
    const responses = await db.responses.getAll();
    // Task 4: bootstrap's lone human-member create forms the
    // SAME 1+1+1 bundle the mock-data seed's own human-members
    // loop does — operation + detail document (shared
    // human-members address) + member document (its own
    // address). Task 5: the current member's OWN identities/:id
    // document widens that bundle to 1+1+1+1 (4) — the SAME
    // fourth invocation the mock-data seed's own human-members
    // loop now forms per member. bootstrap's OWN membership
    // document and the system member's OWN members/:id document
    // close the last two raw bootstrap writes. Phase 10 Task 2:
    // the current member's OWN PII document pair
    // (identities/:id/pii) closes the intake decomposition's
    // bootstrap side — 4 + 2 + 1 = 7. Phase 10 Task 6 mirrors
    // the mock-data seed's own remaining raw writes: the system
    // member's OWN identities/:id document and the current
    // member's + the system member's OWN identity-credential
    // documents (formed by seedHumanCredentials' local pass-1/
    // pass-2 split, api/mock-data.ts) — 7 + 1 + 2 = 10. Role-
    // grant pair retired (membership type:"admin" is privilege).
    // Phase 11 Task 8: bootstrap's OWN default-org event
    // ('bootstrap-default-org-current') — 10 + 1 = 11. Phase 12
    // Task 3: bootstrap's OWN lone organizations pair
    // (STARK_ORGANIZATION) — 11 + 1 = 12.
    assert.equal(requests.length, 12);
    assert.equal(responses.length, 12);
    const atEntity = requests.filter(
        r => r.uri_collection === '/human-members/'
            && r.uri_id === 'current',
    );
    assert.equal(atEntity.length, 2);
    const atMember = requests.filter(
        r => r.uri_collection === '/members/' && r.uri_id === 'current',
    );
    assert.equal(atMember.length, 1);
    const atIdentity = requests.filter(
        r => r.uri_collection === '/identities/'
            && r.uri_id === 'current',
    );
    assert.equal(atIdentity.length, 1);
    const atSystemMember = requests.filter(
        r => r.uri_collection === '/members/'
            && r.uri_id === SYSTEM_MEMBER_ID,
    );
    assert.equal(atSystemMember.length, 1);
    const systemMemberEmbedded = pairJsonOf(
        atSystemMember[0]!.message,
    ) as { body: Record<string, unknown> };
    assert.equal(
        systemMemberEmbedded.body.state_event_id,
        'bootstrap-system-active',
    );
    const atMembership = requests.filter(
        r => r.uri_collection
            === `/organizations/${STARK_ORGANIZATION}/memberships/`
            && r.uri_id === 'bootstrap-membership-current',
    );
    assert.equal(atMembership.length, 1);
    const atPii = requests.filter(
        r => r.uri_collection === '/identities/current/pii/',
    );
    assert.equal(atPii.length, 1);
    const atDefaultOrganization = requests.filter(
        r => r.uri_collection === '/identities/current/default-org/'
            && r.uri_id === 'bootstrap-default-org-current',
    );
    assert.equal(atDefaultOrganization.length, 1);
    const atOrganization = requests.filter(
        r => r.uri_collection === '/organizations/'
            && r.uri_id === STARK_ORGANIZATION,
    );
    assert.equal(atOrganization.length, 1);
    for (const row of requests) {
        assert.equal(
            await requestMessageHash(row.message),
            row.message_hash,
        );
    }
});
