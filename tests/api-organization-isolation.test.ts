import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import {
    ideaBody,
    organizationRow,
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { jsonObjectField, nowUtc, SYSTEM_MEMBER_ID } from
    '../api/types.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    postMembershipDocumentOp,
    postRoleGrantDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    appendMessagePair,
    type MessagePair,
} from '../api/message-pair.ts';
import {
    deriveIdentityPii,
    deriveCredential,
} from '../api/derive-identity-spine.ts';
import { deriveOrganization } from
    '../api/derive-organizations.ts';

const BASE = 'http://localhost';

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
            'Authorization': 'Bearer ' + token,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
    });
}

// `current` holds admin in org A (the administered org) and
// in org '1' (seedRootAdmin), and is a member of both. Ideas
// exist in both A and B. Roles are per-org since Phase 3, so
// the org-A grant authorizes the facade tests; seedRootAdmin's
// org '1' grant + membership keep the flat-token enumerate
// test authorized.
async function twoOrganizations(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    // A real organizations/:id document (Phase 13 Task 3's fixture
    // prerequisite): deriveMembershipsForIdentity enumerates via
    // deriveOrganizations before probing an org's own membership
    // prefix, so an org referenced only by a membership/role-grant
    // pair stays derivation-invisible without its own document.
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedRoleGrantPair(
        db, 'role-current-admin-a', 'A', 'current', 'admin',
        '2020-01-01T00:00:00.000000Z',
    );
    await seedMembershipPair(db, 'm-a', 'A', 'current');
    // Seeded through the live document PUT so a1's message
    // pair exists — GET ideas / GET ideas/:id derive from the
    // ledger. No foreign b1 seed: ideas table is retired
    // (Phase Final Stage B); A-only visibility is proven by
    // a1 alone (current is never a member of B).
    const { organization_id: _organizationId, ...a1Fields } =
        ideaBody('A', 'mine');
    await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/a1',
        await devToken('current'),
        {
            ...a1Fields,
            state: 'active',
            state_at: '2020-01-01T00:00:00.000000Z',
            state_event_id: 'ev-a1',
        },
    ));
    return db;
}

test('a facade GET returns only the bound org rows',
async () => {
    const db = await twoOrganizations();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas',
        await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a facade into a non-member org is 403', async () => {
    const db = await twoOrganizations();
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/ideas',
        await devToken('current')));
    assert.equal(res.status, 403);
});

test('a facade PUT stamps the bound org over a forged body',
async () => {
    const db = await twoOrganizations();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/a2',
        await devToken('current'),
        {
            id: 'a2', ...ideaBody('B', 'forged'),
            state: 'active',
            state_at: '2026-01-01T00:00:00.000000Z',
            state_event_id: 'ev-a2',
        }));
    assert.equal(res.status, 200);
    // Phase Final Task 2: ideas row half stripped — org stamp
    // is on the wire/pair plane (WRITE_RESPONSE_SPECS), not a
    // row. GET re-derives organization_id from the bound org.
    const wire = await res.json() as {
        organization_id: string;
    };
    assert.equal(wire.organization_id, 'A');
    const getRes = await handleRequest(db, req(
        'GET', '/organizations/A/ideas/a2',
        await devToken('current'),
    ));
    assert.equal(getRes.status, 200);
    const got = await getRes.json() as {
        organization_id: string;
    };
    assert.equal(got.organization_id, 'A');
});

test('enumerate returns only the caller member orgs',
async () => {
    const db = await twoOrganizations();
    // Seeded through the live document PUT (not a raw
    // db.organizations.put) so 'A' has a message pair — the
    // flipped GET /organizations (Phase 12 Task 5) derives from
    // the ledger, not the old organizations table. 'B' stays a
    // raw row: `current` is never a member of B, so the
    // membership filter excludes it whether or not it derives.
    await handleRequest(db, req(
        'PUT', '/organizations/A', await devToken('current'),
        organizationRow('Acme'),
    ));
    // Phase Final Stage B: organizations table retired
    // — B need not derive for membership-filter
    // exclusion of non-members.
    const res = await handleRequest(db, req(
        'GET', '/organizations', await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    // 'current' is ALSO a member of seedRootAdmin's own org '1'
    // (Phase 13 Task 3's fixture prerequisite gave it a real,
    // derivable organizations/:id document) — fixture-faithful,
    // not a narrowing of what this case proves.
    assert.deepEqual(rows.map(r => r.id), ['1', 'A']);
});

test('the facade requires a bearer token', async () => {
    const db = await twoOrganizations();
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/A/ideas`));
    assert.equal(res.status, 401);
});

// ---- A roleless member (membership, no role grant) ----
// The non-admin invitee. GET /organizations self-fences to
// the caller's own memberships, so it gates on authentication,
// not a role; org-owned reads and writes stay admin-gated.

async function rolelessMemberDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    // seedAdminSchema (not bare postSchemaCreation) so `current`
    // can create org A through the live document PUT below —
    // the flipped GET /organizations (Phase 12 Task 5) derives
    // from the ledger, so a raw db.organizations.put would be
    // invisible to it. `current` never appears in an assertion
    // here; it exists only to author the org A document.
    await seedAdminSchema(db);
    await handleRequest(db, req(
        'PUT', '/organizations/A', await devToken('current'),
        organizationRow('Acme'),
    ));
    // B stays a raw row: sarah is never a member of B, so the
    // membership filter excludes it whether or not it derives.
    // Phase Final Stage B: organizations table retired
    // — B need not derive for membership-filter
    // exclusion of non-members.
    await seedMembershipPair(db, 'm-sarah-a', 'A', 'sarah');
    return db;
}

test('a roleless member enumerates only their member orgs',
async () => {
    const db = await rolelessMemberDb();
    const res = await handleRequest(db, req(
        'GET', '/organizations', await devToken('sarah')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['A']);
});

test('a roleless member is still denied org-owned reads',
async () => {
    const db = await rolelessMemberDb();
    const res = await handleRequest(db, req(
        'GET', '/members', await devToken('sarah')));
    assert.equal(res.status, 403);
});

test('a roleless member is still denied org-owned writes',
async () => {
    const db = await rolelessMemberDb();
    const res = await handleRequest(db, req(
        'PUT', '/ideas/new-idea', await devToken('sarah'),
        { id: 'new-idea', ...ideaBody('A', 'sneak') }));
    assert.equal(res.status, 403);
});

// ---- T8: the parent-derived READ fence (server-side join) ----

const T8_AT = '2026-06-04T00:00:00.000000Z';

function projectBody(organization: string) {
    return {
        organization_id: organization, title: 't', description: 'd',
        progress: 0, start_date: '2026-06-04',
        target_end_date: '2026-06-04', estimated_cost: 0,
        actual_cost: 0, position: 0,
    };
}

function flowBody(organization: string) {
    return {
        organization_id: organization, name: 'f', is_locked: false,
        is_auto_layout: false, is_auto_fit: false,
        lock_timeout: 0,
    };
}

function workOrderBody(organization: string) {
    return {
        organization_id: organization, display_id: 'WO',
        flow_graph: jsonObjectField({
            flowId: 'f', name: 'f', lockTimeout: 0,
            nodes: [], edges: [],
        }),
        position: 0,
    };
}

// Seed a full parent→leaf chain in `org`, ids suffixed `s`.
// `identity` authors the ONE seed write that now rides the wire
// (the project-flow join, below) — it must hold a role in
// `organization` (deepDb grants 'current' admin in A and 'pb'
// admin in B, solely for this).
async function seedChain(
    db: MemoryDbAdapter, organization: string, s: string,
    identity: string,
): Promise<void> {
    // Seeded through the wire (NAMED re-pin: the READ-side
    // pair-plane fence, api/derive-states.ts's
    // resolveOwningOrganization, resolves an org-nested entity's
    // owner ONLY from a genuine response row at its own uri_id —
    // a raw db.ideas.put leaves none, so 'i'+s's own 'se'+s
    // state event would resolve as a visible ORPHAN, not a
    // fenced-hidden foreign row, once GET /states is flipped),
    // mirroring twoOrganizations()'s own a1 precedent above.
    const { organization_id: _organizationId, ...ideaFields } =
        ideaBody(organization, 'idea');
    await handleRequest(db, req(
        'PUT', '/organizations/' + organization + '/ideas/i' + s,
        await organizationToken(identity, organization),
        {
            ...ideaFields,
            state: 'active',
            state_at: T8_AT,
            state_event_id: 'i' + s + '-genesis',
        },
    ));
    // Phase Final Task 2: projects row half stripped — seed
    // through the live document PUT so the pair plane owns it.
    const {
        organization_id: _projectOrganizationId,
        ...projectFields
    } = projectBody(organization);
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization + '/projects/p' + s,
        await organizationToken(identity, organization),
        {
            ...projectFields,
            state: 'submitted',
            state_at: T8_AT,
            state_event_id: 'p' + s + '-genesis',
        },
    ));
    // Phase Final Stage B: flows table retired — seed through
    // the live document PUT so the pair plane owns it.
    const {
        organization_id: _flowOrganizationId,
        ...flowFields
    } = flowBody(organization);
    const flowWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization + '/flows/f' + s,
        await organizationToken(identity, organization),
        {
            ...flowFields,
            state: 'active',
            state_at: T8_AT,
            state_event_id: 'f' + s + '-genesis',
            graph: JSON.stringify({ nodes: [], edges: [] }),
            revivals: [],
            graphDelta: {
                nodes: [],
                edges: [],
                deletions: [],
                memberEvents: [],
                attributeEvents: [],
            },
        },
    ));
    assert.equal(flowWrite.status, 200);
    // Phase Final Task 2: objectives row half stripped — seed
    // through the live document PUT so the pair plane owns it
    // (nested revisions/scores re-pins already ride pairs).
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/objectives/o' + s,
        await organizationToken(identity, organization),
        { position: 0 },
    ));
    // Phase Final Stage B: records table retired — seed
    // through the live document PUT so the pair plane owns it.
    const recWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization + '/records/r' + s,
        await organizationToken(identity, organization),
        {
            name: 'r', description: 'd', position: 0,
            state: 'active', state_at: T8_AT,
            state_event_id: 'r' + s + '-genesis',
        },
    ));
    assert.equal(recWrite.status, 200);
    // Phase Final Stage B: work_orders table retired — seed
    // through the live document PUT so the pair plane owns it.
    const {
        organization_id: _woOrganizationId,
        ...woFields
    } = workOrderBody(organization);
    const woWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/work-orders/wo' + s,
        await organizationToken(identity, organization),
        woFields,
    ));
    assert.equal(woWrite.status, 200);
    // Phase Final Stage B: flow_versions table retired with
    // flows (no residual seed).
    // NAMED re-pin (Phase 4 Task 8): the flipped GET
    // projects/:id/flows derives from the message ledger, not
    // the raw project_flows table — a raw db.projectFlows.put
    // leaves no pair at this address, so the link must land
    // through the SAME wire-reachable PUT the live route serves.
    // The two OTHER nested-flow sub-collections (versions/
    // records) genuinely stay old-plane, each with its own
    // reason at its own phase; work-orders LEAVES this list
    // below (Task 7).
    await handleRequest(db, req(
        'PUT', '/projects/p' + s + '/flows/pf' + s,
        await organizationToken(identity, organization),
        { project_id: 'p' + s, flow_id: 'f' + s, at: T8_AT },
    ));
    // NAMED re-pin (Task 7): the flipped GET flows/:id/
    // work-orders derives from the message ledger too, the SAME
    // reason as the project-flow join above — a raw
    // db.flowWorkOrders.put leaves no pair at this address.
    await handleRequest(db, req(
        'PUT', '/flows/f' + s + '/work-orders/fwo' + s,
        await organizationToken(identity, organization),
        { flow_id: 'f' + s, work_order_id: 'wo' + s, at: T8_AT },
    ));
    // NAMED re-pin (Task 7): the flipped GET flows/:id/records
    // derives from the message ledger too, the SAME reason as
    // the flow-work-order join above — a raw db.flowRecords.put
    // leaves no pair at this address.
    await handleRequest(db, req(
        'PUT', '/flows/f' + s + '/records/fr' + s,
        await organizationToken(identity, organization),
        { flow_id: 'f' + s, record_id: 'r' + s, at: T8_AT },
    ));
    // Phase Final Stage B: idea_submissions table retired —
    // seed through the live nested PUT so the pair plane owns
    // the leaf (same shape as objective_revisions below).
    await handleRequest(db, req(
        'PUT',
        '/ideas/i' + s + '/submissions/is' + s,
        await organizationToken(identity, organization),
        {
            idea_id: 'i' + s, member_id: 'system', at: T8_AT,
        },
    ));
    // NAMED re-pin (Task 7 + Phase Final Task 2): the flipped
    // GET objectives/:id/revisions and GET projects/:id/
    // objective-<kind>-scores routes derive from the message
    // ledger — a raw put leaves no pair at these addresses.
    // Objectives themselves are pair-plane seeded above.
    await handleRequest(db, req(
        'PUT', '/objectives/o' + s + '/revisions/orev' + s,
        await organizationToken(identity, organization),
        {
            objective_id: 'o' + s, name: 'n',
            description: 'd', member_id: 'system', at: T8_AT,
        },
    ));
    await handleRequest(db, req(
        'PUT',
        '/projects/p' + s + '/objective-baseline-scores/bs' + s,
        await organizationToken(identity, organization),
        {
            project_id: 'p' + s, objective_id: 'o' + s,
            score: 1, member_id: 'system', at: T8_AT,
        },
    ));
    await handleRequest(db, req(
        'PUT',
        '/projects/p' + s + '/objective-actual-scores/as' + s,
        await organizationToken(identity, organization),
        {
            project_id: 'p' + s, objective_id: 'o' + s,
            score: 2, member_id: 'system', at: T8_AT,
        },
    ));
    // NAMED re-pin (Task 7): the flipped GET /states route
    // derives from the message ledger, not the raw states
    // table — a raw db.states.put leaves no pair at this
    // address, so the 'states lists only the bound org events'
    // test must land through the SAME wire-reachable PUT the
    // live route serves.
    await handleRequest(db, req(
        'PUT', '/states/se' + s,
        await organizationToken(identity, organization),
        { entity_id: 'i' + s, state: 'active', at: T8_AT },
    ));
    // NAMED re-pin (Phase 15 Task 7): leaf PUT
    // states/:id/field-values/:fvid retires; seed the SFV pair
    // below-gate via formWritePair + row put — WRITE_RESPONSE_
    // SPECS entry SURVIVES for seed address formation
    // (finding 7). Transition fold is work-order-only; these
    // nest under idea-backed se* events. Collection GET still
    // derives from the pair plane.
    await seedStateFieldValuePair(
        db, organization, 'se' + s, 'sfv' + s,
    );
}

// Below-gate SFV pair (leaf route retired; seed-formation
// WRITE_RESPONSE_SPECS entry remains).
async function seedStateFieldValuePair(
    db: MemoryDbAdapter,
    organization: string,
    stateEventId: string,
    fvId: string,
): Promise<void> {
    const spec = WRITE_RESPONSE_SPECS[
        'states/:id/field-values/:fvid'
    ];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no write response spec for field-values leaf',
        );
    }
    const body = {
        state_event_id: stateEventId,
        attribute_id: 'x',
        value: 'v',
    };
    const pair: MessagePair = await formWritePair({
        method: 'PUT',
        pathname: '/states/' + stateEventId
            + '/field-values/' + fvId,
        routePattern: 'states/:id/field-values/:fvid',
        routeSegments: [
            'states', ':id', 'field-values', ':fvid',
        ],
        pathSegments: [
            'states', stateEventId, 'field-values', fvId,
        ],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [stateEventId, fvId], body,
            SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    // Phase Final Stage B: state_field_values table retired —
    // seed pair only (WRITE_RESPONSE_SPECS still forms address).
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

// Two full chains (A, B) plus the identity spine; `current` is
// admin + member of A ONLY. `pa` is a co-member in A; `pb` is a
// member of B only, so its PII / credentials / member-lifecycle
// events stay invisible to A. Member events name the org-less
// member id directly (member.id === identity.id).
//
// Below-facade pair formation for pa/pb's memberships (Phase 10
// Task 8 Session B): gate 15's THREE-WAY fence derives visibility
// from the membership PAIR PLANE (api/routes.ts), so a raw
// db.memberships.put with no pair reads as an orphan (null owner,
// visible everywhere) rather than a foreign-org member — silently
// defeating the co-member/foreign distinction the tests below
// assert. Mirrors tests/member-fixtures.ts's own seedMembership,
// parameterized by organization (that fixture is hardcoded to
// ONE org; this file seeds two). Every id/field value stays
// IDENTICAL to the raw put this replaces — only the write
// mechanism changes.
async function seedMembershipPair(
    db: MemoryDbAdapter,
    membershipId: string,
    organization: string,
    identityId: string,
): Promise<void> {
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for memberships/:id',
        );
    }
    const body = {
        organization_id: organization,
        identity_id: identityId,
        at: T8_AT,
    };
    const pair: MessagePair = await formWritePair({
        method: 'PUT',
        pathname: `/memberships/${membershipId}`,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', membershipId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [membershipId], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postMembershipDocumentOp(
        db, membershipId, body, SYSTEM_MEMBER_ID, pair,
    );
}

// The role-grants twin of seedMembershipPair above (Phase 13
// Task 1): gate 4's own role check derives from the role_grants
// PAIR PLANE once it flips, so a raw db.roleGrants.put with no
// pair would go derivation-invisible. Parameterized by `role`
// and `at` (unlike seedMembershipPair's own hardcodes) since
// this file's role-grant call sites span both admin and member
// grants, at two distinct timestamps. Every id/field value stays
// IDENTICAL to the raw put this replaces — only the write
// mechanism changes.
async function seedRoleGrantPair(
    db: MemoryDbAdapter,
    roleGrantId: string,
    organization: string,
    identityId: string,
    role: string,
    at: string,
): Promise<void> {
    const spec = WRITE_RESPONSE_SPECS['role-grants/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for role-grants/:id',
        );
    }
    const body = {
        organization_id: organization,
        identity_id: identityId,
        role,
        action: 'granted',
        by_member_id: 'system',
        at,
    };
    const pair: MessagePair = await formWritePair({
        method: 'PUT',
        pathname: `/role-grants/${roleGrantId}`,
        routePattern: 'role-grants/:id',
        routeSegments: ['role-grants', ':id'],
        pathSegments: ['role-grants', roleGrantId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [roleGrantId], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
    await postRoleGrantDocumentOp(
        db, roleGrantId, body, SYSTEM_MEMBER_ID, pair,
    );
}

async function deepDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    // A's and B's own organizations/:id documents, FIRST and
    // below-facade (Phase 13 Task 3's fixture prerequisite): both
    // the flipped GET organizations/:id (Phase 12 Task 5) and the
    // gate-15 fence's own organization enumeration
    // (deriveOrganizations, routes.ts) derive from the ledger, so
    // a raw db.organizations.put — or a live PUT authenticated
    // with a token ALREADY scoped to the org it is creating —
    // leaves both derivation-invisible; deriveMembershipsForIdentity
    // enumerates via deriveOrganizations before probing an org's
    // own membership prefix, so 'current'/'pb's membership/role-
    // grant pairs below need A/B to already be derivable, not the
    // other way around.
    await seedOrganizationDocument(db, 'A', 'Acme');
    await seedOrganizationDocument(db, 'B', 'Beta');
    await seedRoleGrantPair(
        db, 'rg-current-a', 'A', 'current', 'admin', T8_AT,
    );
    await seedMembershipPair(db, 'mem-current-a', 'A', 'current');
    for (const [id, organization] of [
        ['pa', 'A'], ['pb', 'B'],
    ] as const) {
        // Re-pointed onto the SAME exported ops the live
        // identities/:id, identities/:id/pii and identities/:id/
        // credentials/:cid PUT routes use (finding 18's fixture
        // budget): the identity-pii/credentials facade GETs
        // exercised below are flip targets, so a raw put with no
        // pair would go derivation-invisible once Task 8 lands.
        await seedPersonIdentity(db, id, {
            name: id, email: id + '@x.com',
            phone: '', bio: '',
        });
        await seedIdentityCredential(db, id, 'cred-' + id, {
            identity_id: id, kind: 'password',
            status: 'set', secret: 'HASH-' + id, at: T8_AT,
        });
        await seedMembershipPair(db, 'mem-' + id, organization, id);
    }
    // Grants 'pb' admin in B TOO (on top of its plain
    // membership above) — solely so seedChain's project-flow
    // join can land through the wire-reachable :pfid PUT (the
    // flipped GET projects/:id/flows route reads only the
    // message ledger). No case in this file exercises 'pb's OWN
    // authorization, so this is inert everywhere but the seed.
    await seedRoleGrantPair(
        db, 'rg-pb-admin-b', 'B', 'pb', 'admin', T8_AT,
    );
    // NAMED re-pin (Task 7): the flipped GET /states route
    // derives from the message ledger, not the raw states
    // table — a raw db.states.put leaves no pair at this
    // address. Landed here (after pb's own admin grant above,
    // the only identity authorized to write in B) so both pa's
    // and pb's genesis event can ride the SAME wire-reachable
    // PUT the live route serves. pa's own event is authored by
    // 'current' (admin in A already) — no case in this file
    // exercises pa's OWN authorization either.
    for (const [id, organization, author] of [
        ['pa', 'A', 'current'], ['pb', 'B', 'pb'],
    ] as const) {
        await handleRequest(db, req(
            'PUT', '/states/seMem-' + id,
            await organizationToken(author, organization),
            { entity_id: id, state: 'active', at: T8_AT },
        ));
    }
    await seedChain(db, 'A', 'A', 'current');
    await seedChain(db, 'B', 'B', 'pb');
    // isA's message pair, on top of the raw row seedChain already
    // wrote above: the flipped GET ideas/:id/submissions route
    // (Phase 2 Task 5) derives from the ledger at this idea's
    // submissions address, so the ideas LEAF_CASES case below
    // needs a pair to find it. isB stays a raw row — it is read
    // only through org A's facade, which the fence hides either
    // way.
    await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/iA/submissions/isA',
        await devToken('current'),
        { idea_id: 'iA', member_id: 'system', at: T8_AT },
    ));
    return db;
}

async function facadeGet(
    db: MemoryDbAdapter, path: string,
): Promise<Response> {
    return handleRequest(db, req(
        'GET', '/organizations/A' + path,
        await devToken('current')));
}

// The two entity-subordinate resources nest under their parent
// (idea / objective). The collection is fetched at the A-org
// parent's nested path — the SERVER filters to that parent by its
// FK — and the org fence rides the facade re-entry, so the
// foreign leaf bound to the B-org parent stays hidden even when
// read through the B parent's path. Phase Final Stage B: both
// families prove foreign presence via B-org wire GET.
interface LeafCase {
    name: string;
    aPath: string;
    bPath: string;
    a: string;
    b: string;
}

const LEAF_CASES: LeafCase[] = [
    { name: 'ideas/:id/submissions',
        aPath: '/ideas/iA/submissions',
        bPath: '/ideas/iB/submissions',
        a: 'isA', b: 'isB' },
    { name: 'objectives/:id/revisions',
        aPath: '/objectives/oA/revisions',
        bPath: '/objectives/oB/revisions',
        a: 'orevA', b: 'orevB' },
];

for (const c of LEAF_CASES) {
    test('nested ' + c.name + ' lists only the bound parent',
    async () => {
        const db = await deepDb();
        // Pair-plane foreign presence.
        const foreign = await handleRequest(db, req(
            'GET',
            '/organizations/B' + c.bPath,
            await organizationToken('pb', 'B'),
        ));
        assert.equal(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert.ok(
            foreignRows.some((r) => r.id === c.b),
            'foreign ' + c.b + ' missing on B plane',
        );
        const res = await facadeGet(db, c.aPath);
        assert.equal(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assert.deepEqual(rows.map(r => r.id), [c.a]);
    });

    test('nested ' + c.name + ' hides a foreign-org parent',
    async () => {
        const db = await deepDb();
        // The B-org parent's collection, read through the A
        // facade, is fenced empty — the row resolves to org B.
        const res = await facadeGet(db, c.bPath);
        assert.equal(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assert.deepEqual(rows.map(r => r.id), []);
    });
}

// The three flow-subordinate resources nest under flows/:id.
// The collection is fetched at flows/fA/<seg> — the SERVER
// filters to the parent flow — and the leaf at
// flows/fA/<seg>/<id>. The org fence still rides the facade
// re-entry, so a foreign leaf 404s through its parent flow's org.
// Phase Final Task 2: work-orders + flow_records foreign
// presence is proven via B-org wire GET (row plane empty).
interface NestedFlowCase {
    seg: string;
    a: string;
    b: string;
    hasGetById?: boolean;
}

// versions row RETIRED (Phase 15 Task 7) with the routes.
const NESTED_FLOW_CASES: NestedFlowCase[] = [
    { seg: 'records', hasGetById: true, a: 'frA', b: 'frB' },
    { seg: 'work-orders', a: 'fwoA', b: 'fwoB' },
];

for (const c of NESTED_FLOW_CASES) {
    test('nested flows/:id/' + c.seg
        + ' lists only the bound flow',
    async () => {
        const db = await deepDb();
        const foreign = await handleRequest(db, req(
            'GET',
            '/organizations/B/flows/fB/' + c.seg,
            await organizationToken('pb', 'B'),
        ));
        assert.equal(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert.ok(
            foreignRows.some((r) => r.id === c.b),
            'foreign ' + c.b + ' missing on B plane',
        );
        const res = await facadeGet(
            db, '/flows/fA/' + c.seg);
        assert.equal(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assert.deepEqual(rows.map(r => r.id), [c.a]);
    });

    if (c.hasGetById) {
        test('nested flows/:id/' + c.seg + ' 404s a foreign id',
        async () => {
            const db = await deepDb();
            // Prove foreign join exists on B plane.
            const foreign = await handleRequest(db, req(
                'GET',
                '/organizations/B/flows/fB/' + c.seg
                + '/' + c.b,
                await organizationToken('pb', 'B'),
            ));
            assert.equal(foreign.status, 200);
            const res = await facadeGet(
                db, '/flows/fA/' + c.seg + '/' + c.b);
            assert.equal(res.status, 404);
        });
    }
}

// flows/:id/tags/:name (Phase 14 Task 9): PAIR-PLANE ONLY, so it
// cannot join NESTED_FLOW_CASES above (no backing table for
// `store` to probe). A DIRECT fence, not the facade re-entry:
// fB belongs to org B (seeded via seedChain(db, 'B', 'B', 'pb')
// in deepDb()), so a tag written there through 'pb's org-B token
// lands at the '/organizations/B/flows/fB/tags/' address; a read
// of the SAME path with 'current's org-A-scoped token resolves
// an entirely different '/organizations/A/...' prefix — the
// same structural fence every org-nested address rides, with no
// tag-specific code of its own.
test('nested flows/:id/tags 404s a foreign-org flow', async () => {
    const db = await deepDb();
    const tagged = await handleRequest(db, req(
        'PUT', '/flows/fB/tags/v1',
        await organizationToken('pb', 'B'),
        { flow_response_id: 'r-b-1' },
    ));
    assert.equal(tagged.status, 200);

    const res = await handleRequest(db, req(
        'GET', '/flows/fB/tags/v1',
        await organizationToken('current', 'A'),
    ));
    assert.equal(res.status, 404);
});

// The three project-subordinate resources nest under
// projects/:id. The collection is fetched at projects/pA/<seg> —
// the SERVER filters to the parent project — so the foreign
// row, bound to project pB, is excluded. The org fence still
// rides the facade re-entry. None exposes a leaf GET /:id (the
// leaves carry only PUT, or PUT+DELETE for flows), so no
// foreign-id 404 case applies. Phase Final Task 2: foreign
// presence is proven via B-org wire GET (row plane empty).
interface NestedProjectCase {
    seg: string;
    a: string;
    b: string;
}

const NESTED_PROJECT_CASES: NestedProjectCase[] = [
    { seg: 'flows', a: 'pfA', b: 'pfB' },
    { seg: 'objective-baseline-scores',
        a: 'bsA', b: 'bsB' },
    { seg: 'objective-actual-scores',
        a: 'asA', b: 'asB' },
];

for (const c of NESTED_PROJECT_CASES) {
    test('nested projects/:id/' + c.seg
        + ' lists only the bound project',
    async () => {
        const db = await deepDb();
        // Foreign join/score exists on B's pair plane.
        const foreign = await handleRequest(db, req(
            'GET',
            '/organizations/B/projects/pB/' + c.seg,
            await organizationToken('pb', 'B'),
        ));
        assert.equal(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert.ok(
            foreignRows.some((r) => r.id === c.b),
            'foreign ' + c.b + ' missing on B plane',
        );
        const res = await facadeGet(
            db, '/projects/pA/' + c.seg);
        assert.equal(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assert.deepEqual(rows.map(r => r.id), [c.a]);
    });
}

test('states lists only the bound org events', async () => {
    const db = await deepDb();
    const res = await facadeGet(db, '/states');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('seA'));        // A's idea event
    assert.ok(ids.has('seMem-pa'));   // A co-member event
    assert.ok(!ids.has('seB'));       // B's idea event hidden
    assert.ok(!ids.has('seMem-pb'));  // B-only member hidden
});

// STEALTH-WEAKENING trap (Phase 15 Task 7): bare GET
// states/:id retired — a router 404 would pass for ANY id.
// Re-point to the surviving collection GET which still
// fences by ownership. Phase Final Task 1(b): seB lives on
// the pair plane only (row half stripped); pin pair presence
// then prove the collection omits it.
test('states collection hides a foreign event id',
async () => {
    const db = await deepDb();
    const pairResponses = await db.responses.getAllWhere(
        'uri_id', 'seB',
    );
    assert.ok(
        pairResponses.some((r) =>
            /\/states\/$/.test(r.uri_prefix)
            && r.status >= 200 && r.status < 300),
        'seB must exist as a states/:id pair',
    );
    const res = await facadeGet(db, '/states');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[])
            .map(r => r.id));
    assert.ok(!ids.has('seB'));
});

test('nested states/:id/field-values fence follows the event',
async () => {
    const db = await deepDb();
    // Phase Final Stage B: state_field_values table retired —
    // prove foreign SFV pair exists via B facade, then A's
    // nested collection returns only A's.
    const foreign = await handleRequest(db, req(
        'GET', '/states/seB/field-values',
        await organizationToken('pb', 'B'),
    ));
    assert.equal(foreign.status, 200);
    const foreignRows =
        await foreign.json() as { id: string }[];
    assert.ok(
        foreignRows.some(r => r.id === 'sfvB'),
        'foreign SFV pair missing',
    );
    const res = await facadeGet(
        db, '/states/seA/field-values');
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['sfvA']);
});

test('nested states/:id/field-values hides a foreign event',
async () => {
    const db = await deepDb();
    // seB is a B-org event; its field values, read through the
    // A facade, are fenced empty (the multi-hop resolver lands
    // org B for sfvB).
    const res = await facadeGet(
        db, '/states/seB/field-values');
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), []);
});

// bare entity-states/:id RETIRED (Phase 15 Task 7); fence
// re-points to surviving /history (same Region A ownership
// guard). STEALTH-WEAKENING trap: do not leave a bare-route
// foreign-404 that would pass as router miss.
test('entity-states history gates on parent ownership',
async () => {
    const db = await deepDb();
    const mine = await facadeGet(
        db, '/entity-states/iA/history');
    assert.equal(mine.status, 200);
    const mineRows = await mine.json() as { id: string }[];
    assert.ok(mineRows.length >= 1);
    // iB exists on the pair plane (seedChain PUT), but A does
    // not own it — the history-leak bug. Phase Final Task 2:
    // no ideas row to assert; B-org GET proves presence.
    const bOwns = await handleRequest(db, req(
        'GET', '/organizations/B/ideas/iB',
        await organizationToken('pb', 'B'),
    ));
    assert.equal(bOwns.status, 200);
    const foreign = await facadeGet(
        db, '/entity-states/iB/history');
    assert.equal(foreign.status, 404);
});

test('identity-pii lists only co-members', async () => {
    const db = await deepDb();
    const res = await facadeGet(db, '/identity-pii');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('pa'));   // co-member of A
    assert.ok(!ids.has('pb'));  // member of B only
    // Phase Final Task 2: row half stripped — pair plane proves
    // pb's pii still exists while fence hides it from A.
    assert.equal(
        (await deriveIdentityPii(db, 'pb')).id, 'pb');
    // Phase Final Stage B: identity spine tables retired.
    // The single-PII read is now self-only (a member reads only
    // its own); a foreign read is a self-scope 403, identity-
    // independent so it still never confirms pb exists.
    const foreign = await facadeGet(db, '/identities/pb/pii');
    assert.equal(foreign.status, 403);
});

test('nested identities/:id/credentials hide secret, members',
async () => {
    const db = await deepDb();
    // pa is a co-member of A — its nested collection lists the
    // credential with the secret projected out.
    const res = await facadeGet(
        db, '/identities/pa/credentials');
    assert.equal(res.status, 200);
    const rows = await res.json() as Array<{
        id: string;
        identity_id: string;
        secret?: string;
    }>;
    assert.deepEqual(rows.map(r => r.id), ['cred-pa']);
    for (const r of rows) {
        assert.equal(r.secret, undefined);
    }
    // pb is a B-only member — its nested collection is fenced
    // empty through the A facade.
    // Phase Final Task 2: pair plane proves pb's credential
    // exists while fence empties the collection under A.
    assert.equal(
        (await deriveCredential(db, 'pb', 'cred-pb')).id,
        'cred-pb');
    // Phase Final Stage B: identity spine tables retired.
    const other = await facadeGet(
        db, '/identities/pb/credentials');
    assert.equal(other.status, 200);
    assert.deepEqual(
        (await other.json() as { id: string }[]).map(r => r.id),
        []);
    // a single read projects secret out too
    const one = await facadeGet(
        db, '/identities/pa/credentials/cred-pa');
    assert.equal(one.status, 200);
    assert.equal(
        (await one.json() as { secret?: string }).secret,
        undefined);
    // a non-member credential 404s
    const foreign = await facadeGet(
        db, '/identities/pb/credentials/cred-pb');
    assert.equal(foreign.status, 404);
});

// identity-credentials stays ADMIN-ONLY after nesting: the
// /identities surface carries no member-tier entry, so the
// nested credentials route falls to the root admin tier. Admin
// reads it; a plain member is denied, exactly as the flat
// /identity-credentials route was.
test('nested credentials are admin-only (member denied)',
async () => {
    const db = await deepDb();
    // Grant pa the member role in A so it resolves a non-admin
    // role through the gate (membership alone is roleless).
    await seedRoleGrantPair(
        db, 'rg-pa-member-a', 'A', 'pa', 'member', T8_AT,
    );
    const asAdmin = await handleRequest(db, req(
        'GET', '/organizations/A/identities/pa/credentials',
        await organizationToken('current', 'A')));
    assert.equal(asAdmin.status, 200);
    const asMember = await handleRequest(db, req(
        'GET', '/organizations/A/identities/pa/credentials',
        await organizationToken('pa', 'A')));
    assert.equal(asMember.status, 403);
});

test('organizations/:id 404s a non-member org', async () => {
    const db = await deepDb();
    const mine = await handleRequest(db, req(
        'GET', '/organizations/A',
        await organizationToken('current', 'A')));
    assert.equal(mine.status, 200);
    // Phase Final Task 2: organizations ROW half stripped —
    // B still has a pair (seedOrganizationDocument), so
    // derive finds it; the membership fence still 404s.
    assert.equal(
        (await deriveOrganization(db, 'B')).id, 'B');
    const foreign = await handleRequest(db, req(
        'GET', '/organizations/B',
        await organizationToken('current', 'A')));
    assert.equal(foreign.status, 404);
});

// ---- Orphan visibility (null owner → visible to all orgs) ----
// isVisible keeps a row whose owner resolves to null: an
// identity that belongs to NO org, or a state event whose
// entity matches nothing, is an orphan — visible to every
// tenant so an incomplete-but-harmless row is not mistaken for
// another tenant's data. The covenant above pins the
// co-member-visible and foreign-hidden branches; these pin the
// THIRD branch the membership resolvers pass through, so a
// keyed-read rewrite that silently drops the orphan would fail
// here.

test('identity-pii shows an orphan with no membership',
async () => {
    const db = await deepDb();
    await seedIdentityPii(db, 'orphan', {
        name: 'orphan', email: 'orphan@x.com',
        phone: '', bio: '',
    });
    const res = await facadeGet(db, '/identity-pii');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('orphan'));  // no membership → visible
    assert.ok(!ids.has('pb'));     // B-only → still hidden
});

test('nested credentials show an orphan with no membership',
async () => {
    const db = await deepDb();
    await seedIdentityCredential(db, 'orphan', 'cred-orphan', {
        identity_id: 'orphan', kind: 'password',
        status: 'set', secret: 'HASH-orphan', at: T8_AT,
    });
    // orphan has no membership → null owner → visible orphan in
    // its own nested collection, read through the A facade.
    const res = await facadeGet(
        db, '/identities/orphan/credentials');
    assert.equal(res.status, 200);
    const ids = (await res.json() as Array<{
        identity_id: string;
    }>).map(r => r.identity_id);
    assert.deepEqual(ids, ['orphan']);
});

test('states show an orphan event with no owner', async () => {
    const db = await deepDb();
    // NAMED re-pin (Task 7): the flipped GET /states route
    // derives from the message ledger, not the raw states
    // table — a raw db.states.put leaves no pair at this
    // address.
    await handleRequest(db, req(
        'PUT', '/states/seGhost',
        await organizationToken('current', 'A'),
        { entity_id: 'ghost', state: 'active', at: T8_AT },
    ));
    const res = await facadeGet(db, '/states');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('seGhost'));  // unowned → visible orphan
    assert.ok(!ids.has('seB'));     // B's event → still hidden
});
