import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import type { StateEntity } from '../api/types.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import {
    deriveEventPairStates,
    resolveOwningOrganization,
    fenceStatesByOwner,
} from '../api/derive-states.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { seedIdentityPii } from './identity-fixtures.ts';

// Phase 11 Task 2: the event-pair reader (deriveEventPairStates)
// plus the PAIR-PLANE org fence (resolveOwningOrganization /
// fenceStatesByOwner, gate 4) — the derive-identity-spine.ts
// precedent applied to the states log. NOTHING reads this module
// in production yet (no route flip — Task 1's row-plane fence
// still serves live traffic); this file alone proves the
// machinery ahead of that later flip.

const BASE = 'http://localhost';
const AT = '2026-01-01T00:00:00.000000Z';
// Strictly later than AT: at an EQUAL `at`, latestByKey's
// (at, id) tiebreak falls to the larger event id, and
// 'idea-b-genesis' sorts after 'ev-b-delete' — an equal-`at`
// delete would lose the tiebreak and idea-b would never
// genuinely read as deleted.
const LATER = '2026-06-01T00:00:00.000000Z';

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// Below-facade pair formation (the member-fixtures.ts idiom):
// every write below authorizes through organizationToken, whose
// gate check derives from the role_grants/memberships pair plane
// once they flip, so a raw row here would go derivation-
// invisible. Every id/field value stays IDENTICAL to the raw
// puts these replace — only the write mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/memberships/' + id,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const organization = body.organization_id as string;
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/role-grants/' + id,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID, pair,
    );
}

// Two orgs (A, B), one admin identity each — admin (not member)
// because PUT /memberships/:id is admin-only (authorization.ts),
// and this suite's fixtures need ideas, memberships, invitations,
// and flows all live through ONE identity per org.
async function seed(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // A's and B's own organizations/:id documents, FIRST and
    // below-facade (Phase 13 Task 3's fixture prerequisite):
    // organizationIds (Phase 12 Task 5, api/derive-states.ts) is
    // the ALL-orgs scan resolveOwningOrganization/
    // resolveFlowGraphOwner both walk, and
    // deriveMembershipsForIdentity's own enumerate-then-probe (via
    // deriveOrganizations) needs A/B to already be derivable
    // before adminA's/adminB's role-grant/membership pairs below
    // can resolve — a live PUT authenticated with a token ALREADY
    // scoped to the org it is creating cannot bootstrap that org.
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(db, 'rg-a', {
        organization_id: 'A', identity_id: 'adminA',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedRoleGrantPair(db, 'rg-b', {
        organization_id: 'B', identity_id: 'adminB',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: AT,
    });
    await seedMembershipPair(db, 'm-a', {
        organization_id: 'A', identity_id: 'adminA', at: AT,
    });
    await seedMembershipPair(db, 'm-b', {
        organization_id: 'B', identity_id: 'adminB', at: AT,
    });
    return db;
}

function ideaDocument(title: string, stateEventId: string) {
    return {
        title, position: 0,
        problem_statement: '', target_users: '',
        proposed_solution: '', expected_outcome: '',
        success_metrics: '',
        state: 'active', state_at: AT,
        state_event_id: stateEventId,
    };
}

async function createIdea(
    db: MemoryDbAdapter, token: string, id: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'PUT', '/ideas/' + id, token,
        ideaDocument('Idea ' + id, id + '-genesis'),
    ));
    assert.equal(res.status, 200, 'idea genesis PUT failed');
}

// Phase 15 gate 6: grantInvitation resolves email via
// deriveIdentityPiiRows — seedIdentityPii dual-writes the row
// and the identities/:id/pii pair so email resolution works.
async function person(
    db: MemoryDbAdapter, id: string, name: string, email: string,
): Promise<void> {
    await seedIdentityPii(db, id, {
        name, email, phone: '', bio: '',
    });
}

function flowFields(name: string) {
    return {
        name, is_locked: false, is_auto_layout: false,
        is_auto_fit: false, lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function nodeRowBody(id: string, flowId: string) {
    return {
        id, flow_id: flowId, name: 'Node',
        position_x: 0, position_y: 0,
        is_create: true, is_archive: false,
        task_instructions: '', at: AT,
    };
}

async function createFlowWithNode(
    db: MemoryDbAdapter, token: string,
    flowId: string, nodeId: string,
): Promise<void> {
    const res = await handleRequest(db, req(
        'POST', '/flows', token,
        {
            id: flowId,
            flow: flowFields('Flow ' + flowId),
            projectFlowId: flowId + '-pf',
            projectFlow: {
                project_id: 'proj-x', flow_id: flowId, at: AT,
            },
            initialState: 'active',
            initialStateEventId: flowId + '-ev',
            initialStateAt: AT,
            graphDelta: {
                nodes: [nodeRowBody(nodeId, flowId)],
                edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
        },
    ));
    assert.equal(res.status, 204, 'flow creation POST failed');
}

// ---- 1. the event-pair mapping + H7 id-lex sort -----------------

// Phase Final Task 1(b): live PUT /states/:id is pair-plane-
// only. Drop the row-plane getById oracle; pin derived events
// against the 200 wire bodies (WRITE_RESPONSE_SPECS shape).
test('deriveEventPairStates maps live PUT /states/:id events'
+ ' byte-equal to the wire body, id-lex sorted regardless of'
+ ' insertion order (H7) — row-oracle half dropped at Task'
+ ' 1(b) strip', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    // Deliberately non-lexical insertion order.
    const first = await handleRequest(db, req(
        'PUT', '/states/zz-event', token,
        { entity_id: 'ghost-1', state: 'active', at: AT },
    ));
    assert.equal(first.status, 200);
    const firstBody = await first.json();
    const second = await handleRequest(db, req(
        'PUT', '/states/aa-event', token,
        { entity_id: 'ghost-1', state: 'archived', at: AT },
    ));
    assert.equal(second.status, 200);
    const secondBody = await second.json();

    const derived = await deriveEventPairStates(db);
    const oursIds = ['aa-event', 'zz-event'];
    const ours = derived.filter((row) => oursIds.includes(row.id));

    // H7: id-lex ascending, regardless of insertion order.
    assert.deepEqual(
        ours.map((row) => row.id), ['aa-event', 'zz-event'],
    );
    assert.deepEqual(ours[0], secondBody);
    assert.deepEqual(ours[1], firstBody);
});

test('deriveEventPairStates never includes a document family\'s'
+ ' own EMBEDDED trio event — only events posted through the'
+ ' dedicated states/:id address', async () => {
    const db = await seed();
    const token = await organizationToken('adminA', 'A');
    await createIdea(db, token, 'idea-embedded');
    const derived = await deriveEventPairStates(db);
    assert.ok(
        !derived.some((row) => row.id === 'idea-embedded-genesis'),
        'the embedded genesis event must not surface here — it'
        + ' is a LATER union source, not this one',
    );
});

// ---- 2. the fence's three legs + the deleted-entity leg --------

test('fenceStatesByOwner: own-org visible, foreign hidden,'
+ ' orphan visible, and a DELETED foreign entity still resolves'
+ ' to its true owner (parity with the fixed old plane)',
async () => {
    const db = await seed();
    const tokenA = await organizationToken('adminA', 'A');
    const tokenB = await organizationToken('adminB', 'B');
    await createIdea(db, tokenA, 'idea-a');
    await createIdea(db, tokenB, 'idea-b');

    const rows: StateEntity[] = [
        {
            id: 'ev-own', entity_id: 'idea-a',
            state: 'active', member_id: 'adminA', at: AT,
        },
        {
            id: 'ev-foreign', entity_id: 'idea-b',
            state: 'active', member_id: 'adminB', at: AT,
        },
        {
            id: 'ev-orphan', entity_id: 'ghost-x',
            state: 'active', member_id: 'adminA', at: AT,
        },
    ];
    const kept = await fenceStatesByOwner(db, rows, 'A');
    assert.deepEqual(
        kept.map((row) => row.id).sort(),
        ['ev-orphan', 'ev-own'],
    );

    // Org B deletes its own idea (Task 1's own case-7 precedent:
    // tests/api-states-ownership-fence.test.ts).
    const del = await handleRequest(db, req(
        'PUT', '/states/ev-b-delete', tokenB,
        { entity_id: 'idea-b', state: 'deleted', at: LATER },
    ));
    assert.equal(del.status, 200);

    // The pair-plane resolver still resolves idea-b to B, not
    // null — immune to the deleted-filter (pairs are append-only,
    // so idea-b's OWN document pair still names its org).
    assert.equal(
        await resolveOwningOrganization(db, 'idea-b', 'A'), 'B',
    );

    const stillHidden = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-b-again', entity_id: 'idea-b',
            state: 'active', member_id: 'adminB', at: AT,
        }],
        'A',
    );
    assert.deepEqual(stillHidden, []);
});

// ---- 3. the membership pair plane (org-less member/identity) ---

test('resolveOwningOrganization: an org-less identity resolves'
+ ' through its live membership pair (own-org visible, foreign'
+ ' hidden)', async () => {
    const db = await seed();
    const tokenA = await organizationToken('adminA', 'A');
    const res = await handleRequest(db, req(
        'PUT', '/memberships/ms-x', tokenA,
        { organization_id: 'A', identity_id: 'memberX', at: AT },
    ));
    assert.equal(res.status, 200);

    assert.equal(
        await resolveOwningOrganization(db, 'memberX', 'A'), 'A',
    );

    const kept = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-member', entity_id: 'memberX',
            state: 'active', member_id: 'adminA', at: AT,
        }],
        'B',
    );
    assert.deepEqual(kept, []);
});

test('resolveOwningOrganization: an identity holding memberships'
+ ' in BOTH organizations resolves the ASKING organization from'
+ ' either side (co-membership is asker-relative)', async () => {
    const db = await seed();
    const tokenA = await organizationToken('adminA', 'A');
    const tokenB = await organizationToken('adminB', 'B');
    const resA = await handleRequest(db, req(
        'PUT', '/memberships/ms-both-a', tokenA,
        { organization_id: 'A', identity_id: 'memberBoth', at: AT },
    ));
    assert.equal(resA.status, 200);
    const resB = await handleRequest(db, req(
        'PUT', '/memberships/ms-both-b', tokenB,
        { organization_id: 'B', identity_id: 'memberBoth', at: AT },
    ));
    assert.equal(resB.status, 200);

    assert.equal(
        await resolveOwningOrganization(db, 'memberBoth', 'A'), 'A',
    );
    assert.equal(
        await resolveOwningOrganization(db, 'memberBoth', 'B'), 'B',
    );
});

// ---- 4. the invitation's own organization_id body field --------

test('resolveOwningOrganization: an invitation resolves its'
+ ' owner from its own organization_id body field (own-org'
+ ' visible, foreign hidden)', async () => {
    const db = await seed();
    await person(db, 'invitee1', 'Invitee One', 'invitee1@x.com');
    const tokenA = await organizationToken('adminA', 'A');
    const res = await handleRequest(db, req(
        'POST', '/invitations', tokenA,
        {
            email: 'invitee1@x.com', invitationId: 'inv-x',
            grantEventId: 'ev-grant-x', grantAt: AT,
        },
    ));
    assert.equal(res.status, 200);

    assert.equal(
        await resolveOwningOrganization(db, 'inv-x', 'A'), 'A',
    );

    const kept = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-inv', entity_id: 'inv-x',
            state: 'active', member_id: 'adminA', at: AT,
        }],
        'B',
    );
    assert.deepEqual(kept, []);
});

// ---- 5. the flow's document-pair prefix (flow-node/edge) -------

test('resolveOwningOrganization: a flow-node id folds into its'
+ " flow's own document-pair prefix (own-org visible, foreign"
+ ' hidden)', async () => {
    const db = await seed();
    const tokenA = await organizationToken('adminA', 'A');
    await createFlowWithNode(db, tokenA, 'flow-x', 'node-x');

    assert.equal(
        await resolveOwningOrganization(db, 'node-x', 'A'), 'A',
    );

    const kept = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-node', entity_id: 'node-x',
            state: 'deleted', member_id: 'adminA', at: AT,
        }],
        'B',
    );
    assert.deepEqual(kept, []);
});

// ---- 6. a genuine orphan is never accidentally memoized as -----
// ---- foreign across a shared fence pass -------------------------

test('resolveOwningOrganization: a genuine orphan (no pair'
+ ' anywhere names it) resolves null from any organization',
async () => {
    const db = await seed();
    assert.equal(
        await resolveOwningOrganization(db, 'ghost-nowhere', 'A'),
        null,
    );
    assert.equal(
        await resolveOwningOrganization(db, 'ghost-nowhere', 'B'),
        null,
    );
});

// ---- 7. organizations self-as-owner (Phase 15 Task 1, gate 3) --

test('resolveOwningOrganization: an organizations document id'
+ ' resolves to itself (self-as-owner; own-org visible,'
+ ' foreign hidden)', async () => {
    const db = await seed();
    // seed() puts organizations A and B via PUT
    // /organizations/:id — each document id owns itself.
    assert.equal(
        await resolveOwningOrganization(db, 'A', 'A'), 'A',
    );
    assert.equal(
        await resolveOwningOrganization(db, 'A', 'B'), 'A',
    );
    assert.equal(
        await resolveOwningOrganization(db, 'B', 'B'), 'B',
    );
    assert.equal(
        await resolveOwningOrganization(db, 'B', 'A'), 'B',
    );

    // Fence: a state event on organization A is visible to A
    // and hidden from B.
    const keptA = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-org-a', entity_id: 'A',
            state: 'active', member_id: 'adminA', at: AT,
        }],
        'A',
    );
    assert.deepEqual(
        keptA.map((row) => row.id),
        ['ev-org-a'],
    );
    const keptB = await fenceStatesByOwner(
        db,
        [{
            id: 'ev-org-a2', entity_id: 'A',
            state: 'active', member_id: 'adminA', at: AT,
        }],
        'B',
    );
    assert.deepEqual(keptB, []);
});
