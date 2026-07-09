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
    type MessagePair,
} from '../api/message-pair.ts';

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
    // Seeded through the live document PUT (not a raw
    // db.ideas.put) so a1's message pair exists — the flipped
    // GET ideas / GET ideas/:id routes (Phase 2 Task 5) derive
    // from the ledger, not the old ideas table. b1 stays a raw
    // row: every case below reads it only through org B, which
    // `current` never fences into, so it is never derived.
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
    await db.ideas.put('b1', ideaBody('B', 'theirs'));
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
    const stored = await db.ideas.getById('a2');
    assert.equal(stored.organization_id, 'A');
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
    await db.organizations.put('B', organizationRow('Beta'));
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
    await db.organizations.put('B', organizationRow('Beta'));
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
    await db.projects.put('p' + s, projectBody(organization));
    await db.flows.put('f' + s, flowBody(organization));
    // Stays raw (NAMED contrast to the revisions/scores re-pins
    // below, Task 7): no test in this file reads GET
    // /objectives — only the nested objectives/:id/revisions and
    // projects/:id/objective-<kind>-scores JOINs are exercised.
    await db.objectives.put(
        'o' + s, { organization_id: organization, position: 0 });
    // Stays raw (NAMED contrast to the flow-record join below):
    // no flipped read in this file ever consumes the top-level
    // records/:id entity — only the nested flows/:id/records
    // JOIN is exercised here.
    await db.records.put('r' + s, {
        organization_id: organization, name: 'r',
        description: 'd', position: 0,
    });
    // Stays raw (NAMED contrast to the flow-work-order join
    // below): no flipped read in this file ever consumes the
    // top-level work-orders/:id entity — only the nested
    // flows/:id/work-orders JOIN is exercised here.
    await db.workOrders.put('wo' + s, workOrderBody(organization));
    await db.flowVersions.put('fv' + s, {
        flow_id: 'f' + s, name: 'v', is_locked: false,
        is_auto_layout: false, is_auto_fit: false,
        lock_timeout: 0,
        graph: jsonObjectField({ nodes: [], edges: [] }),
        at: T8_AT,
    });
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
    await db.ideaSubmissions.put('is' + s, {
        idea_id: 'i' + s, member_id: 'system', at: T8_AT,
    });
    // NAMED re-pin (Task 7): the flipped GET objectives/:id/
    // revisions and GET projects/:id/objective-<kind>-scores
    // routes derive from the message ledger too, the SAME
    // reason as the flow-record join above — a raw
    // db.objectiveRevisions.put/db.projectObjectiveBaselineScores
    // .put/db.projectObjectiveActualScores.put leaves no pair at
    // these addresses (db.objectives.put above stays raw — see
    // its own comment).
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
    await db.stateFieldValues.put('sfv' + s, {
        state_event_id: 'se' + s, attribute_id: 'x', value: 'v',
    });
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
        await db.members.put(id, { type: 'human' });
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
// read through the B parent's path.
interface LeafCase {
    name: string;
    aPath: string;
    bPath: string;
    store: (d: MemoryDbAdapter) => {
        getById(id: string): Promise<{ id: string }>;
    };
    a: string;
    b: string;
}

const LEAF_CASES: LeafCase[] = [
    { name: 'ideas/:id/submissions',
        aPath: '/ideas/iA/submissions',
        bPath: '/ideas/iB/submissions',
        store: d => d.ideaSubmissions, a: 'isA', b: 'isB' },
    { name: 'objectives/:id/revisions',
        aPath: '/objectives/oA/revisions',
        bPath: '/objectives/oB/revisions',
        store: d => d.objectiveRevisions,
        a: 'orevA', b: 'orevB' },
];

for (const c of LEAF_CASES) {
    test('nested ' + c.name + ' lists only the bound parent',
    async () => {
        const db = await deepDb();
        // Prove the foreign row EXISTS in storage, so exclusion
        // is the fence — the test fails on a regression.
        assert.equal(
            (await c.store(db).getById(c.b)).id, c.b);
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
interface NestedFlowCase {
    seg: string;
    store: (d: MemoryDbAdapter) => {
        getById(id: string): Promise<{ id: string }>;
    };
    a: string;
    b: string;
    hasGetById?: boolean;
}

const NESTED_FLOW_CASES: NestedFlowCase[] = [
    { seg: 'versions', hasGetById: true,
        store: d => d.flowVersions, a: 'fvA', b: 'fvB' },
    { seg: 'records', hasGetById: true,
        store: d => d.flowRecords, a: 'frA', b: 'frB' },
    { seg: 'work-orders',
        store: d => d.flowWorkOrders, a: 'fwoA', b: 'fwoB' },
];

for (const c of NESTED_FLOW_CASES) {
    test('nested flows/:id/' + c.seg
        + ' lists only the bound flow',
    async () => {
        const db = await deepDb();
        // Prove the foreign row EXISTS in storage, so exclusion
        // is the fence — the test fails on a regression.
        assert.equal(
            (await c.store(db).getById(c.b)).id, c.b);
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
            assert.equal(
                (await c.store(db).getById(c.b)).id, c.b);
            const res = await facadeGet(
                db, '/flows/fA/' + c.seg + '/' + c.b);
            assert.equal(res.status, 404);
        });
    }
}

// The three project-subordinate resources nest under
// projects/:id. The collection is fetched at projects/pA/<seg> —
// the SERVER filters to the parent project — so the foreign
// row, bound to project pB, is excluded. The org fence still
// rides the facade re-entry. None exposes a leaf GET /:id (the
// leaves carry only PUT, or PUT+DELETE for flows), so no
// foreign-id 404 case applies.
interface NestedProjectCase {
    seg: string;
    store: (d: MemoryDbAdapter) => {
        getById(id: string): Promise<{ id: string }>;
    };
    a: string;
    b: string;
}

const NESTED_PROJECT_CASES: NestedProjectCase[] = [
    { seg: 'flows',
        store: d => d.projectFlows, a: 'pfA', b: 'pfB' },
    { seg: 'objective-baseline-scores',
        store: d => d.projectObjectiveBaselineScores,
        a: 'bsA', b: 'bsB' },
    { seg: 'objective-actual-scores',
        store: d => d.projectObjectiveActualScores,
        a: 'asA', b: 'asB' },
];

for (const c of NESTED_PROJECT_CASES) {
    test('nested projects/:id/' + c.seg
        + ' lists only the bound project',
    async () => {
        const db = await deepDb();
        // Prove the foreign row EXISTS in storage, so exclusion
        // is the fence — the test fails on a regression.
        assert.equal(
            (await c.store(db).getById(c.b)).id, c.b);
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

test('states 404s a foreign event id', async () => {
    const db = await deepDb();
    assert.equal((await db.states.getById('seB')).id, 'seB');
    const res = await facadeGet(db, '/states/seB');
    assert.equal(res.status, 404);
});

test('nested states/:id/field-values fence follows the event',
async () => {
    const db = await deepDb();
    // Prove the foreign field value EXISTS in storage; the
    // nested collection (server-filtered to seA, then fenced
    // through its parent state event's org) returns only A's.
    assert.equal(
        (await db.stateFieldValues.getById('sfvB')).id,
        'sfvB');
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

test('entity-states gates on parent ownership', async () => {
    const db = await deepDb();
    const mine = await facadeGet(db, '/entity-states/iA');
    assert.equal(mine.status, 200);
    // iB exists, but A does not own it — the history-leak bug.
    assert.equal((await db.ideas.getById('iB')).id, 'iB');
    const foreign = await facadeGet(db, '/entity-states/iB');
    assert.equal(foreign.status, 404);
    const hist = await facadeGet(
        db, '/entity-states/iB/history');
    assert.equal(hist.status, 404);
});

test('identity-pii lists only co-members', async () => {
    const db = await deepDb();
    const res = await facadeGet(db, '/identity-pii');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('pa'));   // co-member of A
    assert.ok(!ids.has('pb'));  // member of B only
    assert.equal(
        (await db.identityPii.getById('pb')).id, 'pb');
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
    assert.equal(
        (await db.identityCredentials.getById('cred-pb')).id,
        'cred-pb');
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
    assert.equal(
        (await db.organizations.getById('B')).id, 'B');
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
