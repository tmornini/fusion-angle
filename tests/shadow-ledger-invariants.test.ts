import { test } from 'node:test';
import { deriveIdeaStateHistory } from
    '../api/derive-ideas.ts';
import assert from 'node:assert/strict';
import {
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { requestMessageHash } from '../api/message-form.ts';
import { buildIdeas } from '../api/mock-data/ideas.ts';
import {
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
} from '../api/mock-data/seed-constants.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    storedWorkOrderFlowGraph,
    DEFAULT_LOCK_TIMEOUT,
} from '../api/types.ts';
import { seededMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const N_START = generateIdentifier();
const N_FINISH = generateIdentifier();
const INV_REC_1 = generateIdentifier();
const INV_REC_1_EV = generateIdentifier();
const INV_REC_1_ATTR = generateIdentifier();
const INV_CHAIN_1 = generateIdentifier();
const INV_FLOW_1_EV = generateIdentifier();
const INV_WO_CREATE_1 = generateIdentifier();
const INV_WO_CREATE_1_FWO = generateIdentifier();

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

// Standing shadow-ledger invariants (Task 5): properties every
// requests/responses pair must hold REGARDLESS of which family
// wrote it — orphan-freedom, hash integrity, header redaction,
// and envelope ordering. Exercised over a seeded mock-data world
// (api/mock-data.ts) PLUS a mixed live-write batch driven
// through handleRequest, so the invariants are proven against
// both write paths the ledger sees, not one in isolation. Step 2
// (below) previews the per-family drift check Phase 2 builds in
// full: a seeded idea's create-pair request must reproduce the
// entity's actual genesis row.

const BASE = 'http://localhost';
const AT = '2026-02-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

// The idea body OMITS organization_id — the org fence stamps
// it from the verified token before the store validates.
function ideaFields(title: string) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

// PUT /organizations/:id/ideas/:id now takes the FULL document (Decision 7):
// the
// entity fields plus the state trio. One fixed trio per idea
// id keeps both PUTs below a same-state edit.
function ideaPutBody(ideaId: string, title: string) {
    return {
        ...ideaFields(title),
        state: 'active',
    };
}

function recordFields(name: string, organization: string) {
    return {
        organization_id: organization,
        name,
        description: 'd',
        position: 1,
    };
}

// PUT /records/:id now takes the FULL document (Decision 7):
// the entity fields plus the state trio. A fixed trio keeps
// this PUT below a same-state edit.
function recordPutBody(
    recordId: string, name: string, organization: string,
) {
    return {
        ...recordFields(name, organization),
        state: 'active',
    };
}

// Task 7's additive pin: a GENESIS-shaped flows document PUT.
// A fresh id needs no If-Match (the locked class's
// genesis-with-neither-header-passes rule), so this addition is
// purely additive — deliberately NOT mirroring the ideas case's
// second-PUT chain above, which would need header threading for
// the locked class.
function flowDocumentBody(name: string, stateEventId: string) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: stateEventId,
        graph: { nodes: [], edges: [] },
        graphDelta: {
            nodes: [], edges: [], deletions: [],
            memberEvents: [], attributeEvents: [],
        },
        revivals: [],
    };
}

function workOrderFields(displayId: string, organization: string) {
    return {
        organization_id: organization,
        display_id: displayId,
        flow_graph: storedWorkOrderFlowGraph({
            name: 'Invariant Flow',
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [],
            edges: [],
        }),
        position: 1,
    };
}

// The workOrder facet reuses workOrderFields() — the SAME
// construction the entity-PUT case above already exercises —
// so the create's synthesized document pair and this literal
// are ONE source, never two divergent builds.
function workOrderCreateBody(
    id: string,
    flowWorkOrderId: string,
    flowId: string,
    organization: string,
) {
    return {
        id,
        workOrder: workOrderFields('INV-WO-CREATE', organization),
        flowWorkOrderId,
        flowWorkOrder: {
            flow_id: flowId,
            work_order_id: id,
            at: AT,
        },
        stateEventIds: [
            'ev-1-' + flowWorkOrderId,
            'ev-2-' + flowWorkOrderId,
            'ev-3-' + flowWorkOrderId,
        ],
        states: [N_START, N_FINISH, 'claimed'],
        stateEventAts: [
            '2026-02-01T00:00:02.000000Z',
            '2026-02-01T00:00:03.000000Z',
            '2026-02-01T00:00:04.000000Z',
        ],
    };
}

// Task 4's bundle synthesis: `attributes` defaults to empty so
// every prior call site is unaffected, but the mixed batch below
// now passes one, so the records-family create's own document
// and attribute pairs are exercised alongside the other six
// families in this same mix — not merely in isolation.
function createRecordBody(
    id: string, eventId: string, organization: string,
    attributes: Record<string, unknown>[] = [],
) {
    return {
        kind: 'create',
        id,
        record: {
            organization_id: organization,
            name: 'Invariant Record',
            description: 'd',
            position: 1,
        },
        attributes,
        initialState: 'active',
        initialStateEventId: eventId,
        initialStateAt: AT,
    };
}

// A mock-data seed (EXPECTED_PAIR_COUNT pre-formed pairs, see
// mock-data-pairs.test.ts) plus one live-write batch layered on
// top via handleRequest: one document PUT (Supersedes minted,
// ideas), one idea state-change trio PUT (states/:id retired),
// one FAILED write (work-order claim conflict 409), one create
// POST (records — Phase 6 Task 4's own bundle: operation +
// document + one attribute pair, not a single pair), one entity
// PUT (work-orders), one DELETE (records, superseding its own
// PUT), one operation POST (identity-tokens revocation), one
// GENESIS document PUT (flows — Task 7's additive pin), and one
// work-order CREATE (Phase 5 Task 3's own three-pair append —
// a genesis POST needs no headers, so this addition is purely
// additive) — five families beyond the seed's own, spanning
// both seeded orgs.
async function seededWithMixedBatch(): Promise<MemoryDbAdapter> {
    const db = await seededMockDb();
    const org1Token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION);
    const org2Token = await organizationToken(
        'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO);

    // Document PUT, twice — the second mints Supersedes
    // (ideas, org 1).
    const firstIdea = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'hwpssRPdIjwzeMdYPAhqrw', org1Token,
        ideaPutBody('hwpssRPdIjwzeMdYPAhqrw', 'Invariant Idea'),
    ));
    assert.equal(firstIdea.status, 201);
    const firstIdeaId = firstIdea.headers.get('Response-ID');
    const secondIdea = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'hwpssRPdIjwzeMdYPAhqrw', org1Token,
        ideaPutBody('hwpssRPdIjwzeMdYPAhqrw', 'Invariant Idea Revised'),
    ));
    assert.equal(secondIdea.status, 201);
    assert.equal(
        secondIdea.headers.get('Supersedes'), null,
    );

    // Idea state-change trio PUT (states/:id retired) — a
    // second lifecycle stamp on the same document address.
    const stateAppend = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'hwpssRPdIjwzeMdYPAhqrw', org1Token, {
            ...ideaFields('Invariant Idea Reviewed'),
            state: 'in_review',
        },
    ));
    assert.equal(stateAppend.status, 201);

    // Create POST (records, org 2) — Task 4's bundle: the
    // operation pair, its synthesized document pair, and one
    // synthesized attribute-PUT pair (the create balance is now
    // 2+N, not 1).
    const created = await handleRequest(db, req(
        'POST', '/organizations/' + ORGANIZATION_TWO
            + '/record-types/', org2Token,
        createRecordBody(
            INV_REC_1, INV_REC_1_EV, ORGANIZATION_TWO,
            [{
                id: INV_REC_1_ATTR,
                organization_id: ORGANIZATION_TWO,
                record_id: INV_REC_1,
                name: 'Field',
                attribute_type: 'text',
                sort_order: 0,
                options: [],
                constraints: [],
            }],
        ),
    ));
    assert.equal(created.status, 201);

    // DELETE — a fresh PUT then its tombstone (records, org 2).
    const recordPut = await handleRequest(db, req(
        'PUT', '/organizations/' + ORGANIZATION_TWO
            + '/record-types/ilBpwTboUzfhEGOmnoFkiQ', org2Token,
        recordPutBody(
            'ilBpwTboUzfhEGOmnoFkiQ', 'Invariant Record', ORGANIZATION_TWO,
        ),
    ));
    assert.equal(recordPut.status, 201);
    const recordDeleted = await handleRequest(db, req(
        'DELETE', '/organizations/' + ORGANIZATION_TWO
            + '/record-types/ilBpwTboUzfhEGOmnoFkiQ', org2Token,
    ));
    assert.equal(recordDeleted.status, 204);

    // Entity PUT (work-orders, org 1) — the entity-PUT hash path,
    // shared code but never route-exercised in this mixed batch
    // before now.
    const workOrderPut = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            + 'jAzfROfUUwRELEudEFwdGw', org1Token,
        workOrderFields('INV-WO-1', STARK_ORGANIZATION),
    ));
    assert.equal(workOrderPut.status, 201);

    // Operation POST (identity-tokens — global, not org-
    // nested): revoke a pre-seeded chain. The seed itself rides
    // the PUT route (not a raw store write): Phase 13 Task 6
    // flips revokeTokenChain's PRE-TX chain lookup onto the
    // message ledger, so a pair-less row is invisible to it —
    // the PUT route forms both the row AND its pair, the SAME
    // mechanism a live write uses.
    const tokenRootPut = await handleRequest(db, req(
        'PUT', '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/'
            + 'iynelXdEDRLXHNzEFQYtqQ',
        org1Token, {
            jti: 'hwrugEJrEVicRwurEJxFvw'
                , identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            action: 'issued', chain_id: INV_CHAIN_1, at: AT,
        },
    ));
    assert.equal(tokenRootPut.status, 201);
    const revoked = await handleRequest(db, req(
        'POST',
        '/identities/XXZruirZyAOoRpNxaDnpSA/tokens/hwrugEJrEVicRwurEJxFvw/'
            + 'revocation',
        org1Token, {},
    ));
    assert.equal(revoked.status, 201);

    // Genesis document PUT (flows, org 1) — a fresh id needs no
    // If-Match under the locked class.
    const flowGenesis = await handleRequest(db, req(
        'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'hoKOMoVEGhFjVEMIIFBbOQ', org1Token,
        flowDocumentBody('Invariant Flow', INV_FLOW_1_EV),
    ));
    assert.equal(flowGenesis.status, 201);

    // Work-order CREATE (org 1) — a genesis POST, joined to the
    // flow just created above: three pairs land (the operation
    // pair, its synthesized document pair, its synthesized join
    // pair), none of them route-exercised in this mixed batch
    // before now.
    const workOrderCreated = await handleRequest(db, req(
        'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/work-orders/'
            , org1Token,
        workOrderCreateBody(
            INV_WO_CREATE_1, INV_WO_CREATE_1_FWO,
            'hoKOMoVEGhFjVEMIIFBbOQ', STARK_ORGANIZATION,
        ),
    ));
    assert.equal(workOrderCreated.status, 201);

    // A FAILED write: 404 on an unknown route — must add
    // nothing to either table. (A claim conflict 409 still
    // exists on the claim op but needs a second member with
    // a live prior claim.)
    const failed = await handleRequest(db, req(
        'PUT', '/oRAKQvKtOmSHMZEjhEXaRw/x1', org1Token, {
            entity_id: 'hwpssRPdIjwzeMdYPAhqrw',
            state: 'promoted',
            at: '2026-02-01T00:00:01.000000Z',
        },
    ));
    assert.equal(failed.status, 404);

    return db;
}

test('every stored request message re-hashes to its own'
+ ' message_hash', async () => {
    const db = await seededWithMixedBatch();
    const requests = await db.pairs.getAll();
    assert.ok(requests.length > 0);
    for (const row of requests) {
        assert.equal(
            await requestMessageHash(row.request),
            row.request_hash,
            'requests row ' + row.id + ' hash mismatch',
        );
    }
});

// End-to-end spot check on verbatim storage: every write in
// the mixed batch above rode a real 'Authorization: Bearer'
// header (organizationToken mints a real HMAC JWT), so a live
// bearer JWT MUST appear in stored request messages — pairs
// hold the wire bytes. Mock-data seed pairs carry no header
// fields (api/mock-data/seed-message-pairs.ts); the mixed
// batch is the live-traffic half.
const BEARER_JWT =
    /Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/;

test('stored request messages carry the live bearer JWT',
async () => {
    const db = await seededWithMixedBatch();
    const requests = await db.pairs.getAll();
    assert.ok(requests.length > 0);
    const withBearer = requests.filter(
        row => BEARER_JWT.test(row.request),
    );
    assert.ok(
        withBearer.length > 0,
        'no stored request carried a bearer JWT',
    );
});

const RFC3339_ZULU_MICROS =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;

test('every pair\'s envelope timestamps are RFC-3339 zulu'
+ ' with 6-digit sub-second precision, and the request'
+ ' strictly precedes its own response', async () => {
    const db = await seededWithMixedBatch();
    const requests = await db.pairs.getAll();
    const responsesById = new Map(
        (await db.pairs.getAll()).map(r => [r.id, r]),
    );
    assert.ok(requests.length > 0);
    for (const request of requests) {
        assert.match(
            request.request_at, RFC3339_ZULU_MICROS,
            'request ' + request.id + ' at is malformed',
        );
        const response = responsesById.get(request.id);
        assert.ok(response, 'no response for ' + request.id);
        assert.match(
            response!.response_at, RFC3339_ZULU_MICROS,
            'response ' + request.id + ' at is malformed',
        );
        assert.ok(
            request.request_at < response!.response_at,
            'pair ' + request.id + ' response at does not'
                + ' strictly follow its request at',
        );
    }
});

// The first fiber of Phase 2's per-family drift check: a
// seeded idea's create-pair request message, parsed back, must
// reproduce the entity's ACTUAL genesis row on the states
// ledger — proof the shadow-ledger request is not merely
// present but semantically faithful to what was really written.
test('a seeded idea\'s create-pair request reproduces its'
+ ' actual genesis row in states', async () => {
    const db = await seededMockDb();
    const idea = buildIdeas()[0]!;
    const requests = await db.pairs.getAll();
    const createRow = requests.find(
        r => r.uri_id === idea.id
            && r.uri_collection
                === `/organizations/${STARK_ORGANIZATION}`
                    + '/ideas/',
    );
    assert.ok(createRow, 'no create pair for the seeded idea');
    const parsed = pairJsonOf(createRow!.request) as {
        body: {
            state: string;
        };
    };
    const history = await deriveIdeaStateHistory(
        db, STARK_ORGANIZATION, idea.id,
    );
    const genesis = history[0];
    assert.ok(genesis, 'derived state missing');
    assert.equal(genesis.entity_id, idea.id);
    assert.equal(genesis.state, parsed.body.state);
});
