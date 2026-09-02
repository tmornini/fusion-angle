import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    claimToken,
    devToken,
    organizationToken,
} from './token-fixtures.ts';
import {
    ideaBody,
    organizationRow,
    seedAdminSchema,
    seedOrganizationDocument,
} from './test-fixtures.ts';
import { SYSTEM_MEMBER_ID } from
    '../api/types.ts';
import {
    seedIdentityCredential,
    seedIdentityPii,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import {
    postWorkOrderTransitionOp,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
} from '../api/message-pair.ts';
import {
    deriveIdentityPii,
    deriveIdentityPiiRows,
    deriveCredential,
} from '../api/derive-identity-spine.ts';
import { deriveOrganization } from
    '../api/derive-organizations.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';

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

// `current` holds admin in org A (the administered org) and
// in org 'AjdvjuECVZEgZoFajaIEkg' (seedRootAdmin), and is a member of both.
// Ideas
// exist in both A and B. Roles are per-org since Phase 3, so
// the org-A grant authorizes the facade tests; seedRootAdmin's
// org 'AjdvjuECVZEgZoFajaIEkg' grant + membership keep the flat-token
// enumerate
// test authorized.
async function twoOrganizations(): Promise<{
    db: MemoryDbAdapter;
    organizationA: string;
    organizationB: string;
}> {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    await seedAdminSchema(db);
    // A real organizations/:id document (Phase 13 Task 3's fixture
    // prerequisite): deriveMembershipsForIdentity enumerates via
    // deriveOrganizations before probing an org's own membership
    // prefix, so an org referenced only by a membership/role-grant
    // pair stays derivation-invisible without its own document.
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedMembershipPair(
        db, generateIdentifier(), organizationA, 'XXZruirZyAOoRpNxaDnpSA',
    );
    // Seeded through the live document PUT so UQTJZvCoKlFjEoDlDUwekw's
    // message
    // pair exists — GET ideas / GET organizations/:id/ideas/:id derive from
    // the
    // ledger. No foreign b1 seed: ideas table is retired
    // (Phase Final Stage B); A-only visibility is proven by
    // UQTJZvCoKlFjEoDlDUwekw alone (current is never a member of B).
    const { organization_id: _organizationId, ...a1Fields } =
        ideaBody(organizationA, 'mine');
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA
            + '/ideas/UQTJZvCoKlFjEoDlDUwekw',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
        {
            ...a1Fields,
            state: 'active',
        },
    ));
    return { db, organizationA, organizationB };
}

Deno.test('a facade GET returns only the bound org rows',
async () => {
    const { db, organizationA } = await twoOrganizations();
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + organizationA + '/ideas/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA)));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assertEquals(rows.map(r => r.id), ['UQTJZvCoKlFjEoDlDUwekw']);
});

Deno.test('a facade into a non-member org is 403', async () => {
    const { db, organizationA, organizationB } = await twoOrganizations();
    const res = await handleRequest(db, req(
        'GET', '/organizations/' + organizationB + '/ideas/',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA)));
    assertStrictEquals(res.status, 403);
});

Deno.test('a facade PUT stamps the bound org over a forged body',
async () => {
    const { db, organizationA, organizationB } = await twoOrganizations();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA
            + '/ideas/UZgNCkZlSJcSaAmAJuSkcw',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
        {
            id: 'UZgNCkZlSJcSaAmAJuSkcw',
            ...ideaBody(organizationB, 'forged'),
            state: 'active',
        }));
    assertStrictEquals(res.status, 201);
    // Phase Final Task 2: ideas row half stripped — org stamp
    // is on the wire/message plane (WRITE_RESPONSE_SPECS), not a
    // row. GET re-derives organization_id from the bound org.
    const wire = await res.json() as {
        organization_id: string;
    };
    assertStrictEquals(wire.organization_id, organizationA);
    const getRes = await handleRequest(db, req(
        'GET', '/organizations/' + organizationA
            + '/ideas/UZgNCkZlSJcSaAmAJuSkcw',
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
    ));
    assertStrictEquals(getRes.status, 200);
    const got = await getRes.json() as {
        organization_id: string;
    };
    assertStrictEquals(got.organization_id, organizationA);
});

Deno.test('enumerate returns only the caller member orgs',
async () => {
    const { db, organizationA } = await twoOrganizations();
    // Seeded through the live document PUT (not a raw
    // db.organizations.put) so organizationA has a message pair — the
    // GET /identities/:id/organizations/ derives from
    // the ledger, not the old organizations table. organizationB stays a
    // raw row: `current` is never a member of B, so the
    // membership filter excludes it whether or not it derives.
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA,
        await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organizationRow('Acme'),
    ));
    // Phase Final Stage B: organizations table retired
    // — B need not derive for membership-filter
    // exclusion of non-members.
    // Enumerate is the path identity's live seats.
    const token = await claimToken({
        organizations: ['AjdvjuECVZEgZoFajaIEkg', organizationA],
        roles: ['admin:AjdvjuECVZEgZoFajaIEkg', 'admin:' + organizationA],
    });
    const res = await handleRequest(db, req(
        'GET', '/identities/XXZruirZyAOoRpNxaDnpSA/organizations/',
        token));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as { id: string }[];
    // 'XXZruirZyAOoRpNxaDnpSA' is ALSO a member of seedRootAdmin's own org
    // 'AjdvjuECVZEgZoFajaIEkg'
    // (Phase 13 Task 3's fixture prerequisite gave it a real,
    // derivable organizations/:id document) — fixture-faithful,
    // not a narrowing of what this case proves.
    assertEquals(
        rows.map(r => r.id).sort(),
        ['AjdvjuECVZEgZoFajaIEkg', organizationA].sort(),
    );
});

Deno.test('the facade requires a bearer token', async () => {
    const { db, organizationA } = await twoOrganizations();
    const res = await handleRequest(db, new Request(
        `${BASE}/organizations/` + organizationA + '/ideas'));
    assertStrictEquals(res.status, 401);
});

// ---- A content-tier member (type:"member") ----
// Not admin. GET /identities/:id/organizations/ is
// the path identity's live seats;
// admin surfaces (members, memberships, orgs write) stay
// admin-gated. Content surfaces (ideas) are member-permitted.

async function contentMemberDb(): Promise<{
    db: MemoryDbAdapter;
    organizationA: string;
}> {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    // seedAdminSchema (not bare postSchemaCreation) so `current`
    // can create org A through the live document PUT below —
    // GET /identities/:id/organizations/ derives
    // from the ledger, so a raw db.organizations.put would be
    // invisible to it. `current` never appears in an assertion
    // here; it exists only to author the org A document.
    await seedAdminSchema(db);
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA,
        await devToken('XXZruirZyAOoRpNxaDnpSA'),
        organizationRow('Acme'),
    ));
    // B stays a raw row: toccYYkLEABmlbpHJalgtQ is never a member of B, so
    // the
    // membership filter excludes it whether or not it derives.
    // Phase Final Stage B: organizations table retired
    // — B need not derive for membership-filter
    // exclusion of non-members.
    await seedMembershipPair(
        db, generateIdentifier(), organizationA, 'toccYYkLEABmlbpHJalgtQ',
    );
    return { db, organizationA };
}

Deno.test('a content-tier member enumerates only their member orgs',
async () => {
    const { db, organizationA } = await contentMemberDb();
    const res = await handleRequest(db, req(
        'GET', '/identities/toccYYkLEABmlbpHJalgtQ/organizations/',
        await organizationToken('toccYYkLEABmlbpHJalgtQ', organizationA)));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assertEquals(rows.map(r => r.id), [organizationA]);
});

Deno.test('a content-tier member is still denied admin reads',
async () => {
    const { db, organizationA } = await contentMemberDb();
    // GET /members is member-tier (roster display); memberships
    // is the admin-only surface.
    const res = await handleRequest(db, req(
        'GET', '/memberships',
        await organizationToken('toccYYkLEABmlbpHJalgtQ', organizationA)));
    assertStrictEquals(res.status, 404);
});

Deno.test('a content-tier member is still denied admin writes',
async () => {
    const { db, organizationA } = await contentMemberDb();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA,
        await organizationToken('toccYYkLEABmlbpHJalgtQ', organizationA),
        organizationRow('Hijack')));
    assertStrictEquals(res.status, 403);
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
        flow_graph: {
            flowId: 'f', name: 'f', lockTimeout: 0,
            nodes: [], edges: [],
        },
        position: 0,
    };
}

interface ChainIds {
    idea: string;
    project: string;
    flow: string;
    objective: string;
    record: string;
    workOrder: string;
    projectFlow: string;
    flowWorkOrder: string;
    flowRecord: string;
    ideaSubmission: string;
    objectiveRevision: string;
    baselineScore: string;
    actualScore: string;
    transitionEvent: string;
    fieldValue: string;
    attribute: string;
}

function mintChainIds(): ChainIds {
    return {
        idea: generateIdentifier(),
        project: generateIdentifier(),
        flow: generateIdentifier(),
        objective: generateIdentifier(),
        record: generateIdentifier(),
        workOrder: generateIdentifier(),
        projectFlow: generateIdentifier(),
        flowWorkOrder: generateIdentifier(),
        flowRecord: generateIdentifier(),
        ideaSubmission: generateIdentifier(),
        objectiveRevision: generateIdentifier(),
        baselineScore: generateIdentifier(),
        actualScore: generateIdentifier(),
        transitionEvent: generateIdentifier(),
        fieldValue: generateIdentifier(),
        attribute: generateIdentifier(),
    };
}

// Seed a full parent→leaf chain in `organization`.
// `identity` authors the ONE seed write that now rides the wire
// (the project-flow join, below) — it must hold a role in
// `organization` (deepDb grants 'XXZruirZyAOoRpNxaDnpSA' admin in A and pb
// admin in B, solely for this).
async function seedChain(
    db: MemoryDbAdapter, organization: string,
    identity: string,
): Promise<ChainIds> {
    const ids = mintChainIds();
    // Seeded through the wire (NAMED re-pin: the READ-side
    // message-plane fence, api/derive-states.ts's
    // resolveOwningOrganization, resolves an org-nested entity's
    // owner ONLY from a genuine response row at its own uri_id —
    // a raw db.ideas.put leaves none, so 'i'+s's own 'se'+s
    // state event would resolve as a visible ORPHAN, not a
    // fenced-hidden foreign row, once the bulk lifecycle
    // collection is flipped), mirroring twoOrganizations()'s
    // own UQTJZvCoKlFjEoDlDUwekw precedent above.
    const { organization_id: _organizationId, ...ideaFields } =
        ideaBody(organization, 'idea');
    await handleRequest(db, req(
        'PUT', '/organizations/' + organization
            + '/ideas/' + ids.idea,
        await organizationToken(identity, organization),
        {
            ...ideaFields,
            state: 'active',
        },
    ));
    // Phase Final Task 2: projects row half stripped — seed
    // through the live document PUT so the message plane owns it.
    const {
        organization_id: _projectOrganizationId,
        ...projectFields
    } = projectBody(organization);
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/projects/' + ids.project,
        await organizationToken(identity, organization),
        {
            ...projectFields,
            state: 'submitted',
        },
    ));
    // Phase Final Stage B: flows table retired — seed through
    // the live document PUT so the message plane owns it.
    const {
        organization_id: _flowOrganizationId,
        ...flowFields
    } = flowBody(organization);
    const flowWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/flows/' + ids.flow,
        await organizationToken(identity, organization),
        {
            ...flowFields,
            state: 'active',
            state_at: T8_AT,
            state_event_id: generateIdentifier(),
            graph: { nodes: [], edges: [] },
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
    assertStrictEquals(flowWrite.status, 201);
    // Phase Final Task 2: objectives row half stripped — seed
    // through the live document PUT with the lifecycle trio
    // (states-address retirement) so the message plane owns it
    // (nested revisions/scores re-pins already ride pairs).
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/objectives/' + ids.objective,
        await organizationToken(identity, organization),
        {
            position: 0,
            state: 'active',
        },
    ));
    // Phase Final Stage B: records table retired — seed
    // through nested record-types PUT (admin-only schema
    // mutation; claimToken when identity is not `current`).
    const recToken = identity === 'XXZruirZyAOoRpNxaDnpSA'
        ? await organizationToken(identity, organization)
        : await claimToken({
            sub: identity,
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        });
    const recWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/record-types/' + ids.record,
        recToken,
        {
            name: 'r', description: 'd', position: 0,
            state: 'active',
        },
    ));
    assertStrictEquals(recWrite.status, 201);
    // Phase Final Stage B: work_orders table retired — seed
    // through the live document PUT so the message plane owns it.
    const {
        organization_id: _woOrganizationId,
        ...woFields
    } = workOrderBody(organization);
    const woWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/work-orders/' + ids.workOrder,
        await organizationToken(identity, organization),
        woFields,
    ));
    assertStrictEquals(woWrite.status, 201);
    // Phase Final Stage B: flow_versions table retired with
    // flows (no residual seed).
    // NAMED re-pin (Phase 4 Task 8): the flipped GET
    // organizations/:id/projects/:id/flows derives from the message ledger,
    // not
    // the raw project_flows table — a raw db.projectFlows.put
    // leaves no pair at this address, so the link must land
    // through the SAME wire-reachable PUT the live route serves.
    // The two OTHER nested-flow sub-collections (versions/
    // records) genuinely stay old-plane, each with its own
    // reason at its own phase; work-orders LEAVES this list
    // below (Task 7).
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/projects/' + ids.project
            + '/flows/' + ids.projectFlow,
        await organizationToken(identity, organization),
        {
            project_id: ids.project, flow_id: ids.flow,
            at: T8_AT,
        },
    ));
    // NAMED re-pin (Task 7): the flipped GET organizations/:id/flows/:id/
    // work-orders derives from the message ledger too, the SAME
    // reason as the project-flow join above — a raw
    // db.flowWorkOrders.put leaves no pair at this address.
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/flows/' + ids.flow
            + '/work-orders/' + ids.flowWorkOrder,
        await organizationToken(identity, organization),
        {
            flow_id: ids.flow, work_order_id: ids.workOrder,
            at: T8_AT,
        },
    ));
    // NAMED re-pin (Task 7): the flipped GET
    // organizations/:id/flows/:id/records
    // derives from the message ledger too, the SAME reason as
    // the flow-work-order join above — a raw db.flowRecords.put
    // leaves no pair at this address.
    const bindingWrite = await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/flows/' + ids.flow
            + '/records/' + ids.flowRecord,
        await organizationToken(identity, organization),
        {
            flow_id: ids.flow, record_id: ids.record,
            at: T8_AT,
        },
    ));
    assertStrictEquals(bindingWrite.status, 201);
    // Phase Final Stage B: idea_submissions table retired —
    // seed through the live nested PUT so the message plane owns
    // the leaf (same shape as objective_revisions below).
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/ideas/' + ids.idea
            + '/submissions/' + ids.ideaSubmission,
        await organizationToken(identity, organization),
        {
            idea_id: ids.idea, member_id: SYSTEM_MEMBER_ID,
            at: T8_AT,
        },
    ));
    // NAMED re-pin (Task 7 + Phase Final Task 2): the flipped
    // GET organizations/:id/objectives/:id/revisions and GET
    // organizations/:id/projects/:id/
    // objective-<kind>-scores routes derive from the message
    // ledger — a raw put leaves no pair at these addresses.
    // Objectives themselves are message-plane seeded above.
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/objectives/' + ids.objective
            + '/revisions/' + ids.objectiveRevision,
        await organizationToken(identity, organization),
        {
            objective_id: ids.objective, name: 'n',
            description: 'd', member_id: SYSTEM_MEMBER_ID,
            at: T8_AT,
        },
    ));
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/projects/' + ids.project
            + '/objective-baseline-scores/' + ids.baselineScore,
        await organizationToken(identity, organization),
        {
            project_id: ids.project,
            objective_id: ids.objective,
            score: 1, member_id: SYSTEM_MEMBER_ID, at: T8_AT,
        },
    ));
    await handleRequest(db, req(
        'PUT',
        '/organizations/' + organization
            + '/projects/' + ids.project
            + '/objective-actual-scores/' + ids.actualScore,
        await organizationToken(identity, organization),
        {
            project_id: ids.project,
            objective_id: ids.objective,
            score: 2, member_id: SYSTEM_MEMBER_ID, at: T8_AT,
        },
    ));
    // Transition op with a fieldValues fold — the sole SFV
    // source after the states-address retirement (leaf pairs
    // and states/:id writes are gone). transitionEventId
    // keeps the se* ids the fence tests name.
    // Task 8 CUT: legacy bag is below-gate (stored SFV truth).
    const body: Record<string, unknown> = {
        transitionEventId: ids.transitionEvent,
        targetState: 'n-start',
        fieldValues: [{
            id: ids.fieldValue,
            fields: {
                state_event_id: ids.transitionEvent,
                attribute_id: ids.attribute,
                value: 'v',
            },
        }],
        release: null,
        transitionAt: T8_AT,
    };
    const woId = ids.workOrder;
    const pathSegments = [
        'organizations', organization,
        'work-orders', woId, 'transition',
    ];
    const pattern = 'organizations/:id/work-orders/:id/transition';
    const messagePair = await formWriteMessagePair({
        method: 'POST',
        pathname: '/' + pathSegments.join('/'),
        routePattern: pattern,
        routeSegments: pattern.split('/'),
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: identity,
        requestAt: T8_AT,
        organization,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await postWorkOrderTransitionOp(
        db, woId, body, identity,
        undefined, [], messagePair,
    );
    return ids;
}

// Two full chains (A, B) plus the identity spine; `current` is
// admin + member of A ONLY. `pa` is a co-member in A; `pb` is a
// member of B only, so its PII / credentials / member-lifecycle
// events stay invisible to A. Member events name the org-less
// member id directly (member.id === identity.id).
//
// Below-facade pair formation for pa/pb's memberships (Phase 10
// Task 8 Session B): gate 15's THREE-WAY fence derives visibility
// from the membership MESSAGE PLANE (api/routes.ts), so a raw
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
    _membershipId: string,
    organization: string,
    identityId: string,
    asAdmin = identityId === 'XXZruirZyAOoRpNxaDnpSA',
): Promise<void> {
    const type = asAdmin ? 'admin' : 'member';
    const { seedSeat } = await import(
        './root-admin-fixture.ts'
    );
    await seedSeat(
        db, organization, identityId, type, T8_AT,
    );
}

interface DeepDb {
    db: MemoryDbAdapter;
    organizationA: string;
    organizationB: string;
    pa: string;
    pb: string;
    paCred: string;
    pbCred: string;
    chainA: ChainIds;
    chainB: ChainIds;
}

async function deepDb(): Promise<DeepDb> {
    const db = memoryDbAdapter();
    const organizationA = generateIdentifier();
    const organizationB = generateIdentifier();
    const pa = generateIdentifier();
    const pb = generateIdentifier();
    const paCred = 'XWKijniEuoqRNhnRQdJHEA';
    const pbCred = 'XWjyCmjaGkYOFYNSanBvhg';
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
    // own membership prefix, so 'XXZruirZyAOoRpNxaDnpSA'/pb's
    // membership/role-
    // grant pairs below need A/B to already be derivable, not the
    // other way around.
    await seedOrganizationDocument(db, organizationA, 'Acme');
    await seedOrganizationDocument(db, organizationB, 'Beta');
    await seedMembershipPair(db, generateIdentifier(), organizationA
        , 'XXZruirZyAOoRpNxaDnpSA');
    for (const [id, organization, admin] of [
        [pa, organizationA, false], [pb, organizationB, true],
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
        await seedIdentityCredential(
            db, id,
            id === pa ? paCred : pbCred,
            {
            identity_id: id, kind: 'password',
            status: 'set', secret: 'HASH-' + id, at: T8_AT,
        });
        await seedMembershipPair(
            db, generateIdentifier(), organization, id, admin,
        );
    }
    // Grants pb admin in B TOO (on top of its plain
    // membership above) — solely so seedChain's project-flow
    // join can land through the wire-reachable :pfid PUT (the
    // flipped GET organizations/:id/projects/:id/flows route reads only the
    // message ledger). No case in this file exercises pb's OWN
    // authorization, so this is inert everywhere but the seed.
    // Member document trios for pa/pb (states/:id retired).
    // seMem-* event ids keep the collection-fence assertions
    // stable. Members are global-plane; ownership rides the
    // membership pairs already seeded above.
    for (const [id, organization, author] of [
        [pa, organizationA, 'XXZruirZyAOoRpNxaDnpSA'],
        [pb, organizationB, pb],
    ] as const) {
        // author is admin of the target org — claim roles must
        // say so (organizationToken only admins `current`).
        const authorToken = author === 'XXZruirZyAOoRpNxaDnpSA'
            ? await organizationToken(author, organization)
            : await claimToken({
                sub: author,
                organization,
                organizations: [organization],
                roles: ['admin:' + organization],
            });
        const memberWrite = await handleRequest(db, req(
            'PUT', '/identities/' + id,
            authorToken,
            { kind: 'person' },
        ));
        assert(
            memberWrite.status === 201
            || memberWrite.status === 200,
        );
    }
    const chainA = await seedChain(
        db, organizationA, 'XXZruirZyAOoRpNxaDnpSA',
    );
    const chainB = await seedChain(db, organizationB, pb);
    // isA's message pair, on top of the raw row seedChain already
    // wrote above: the flipped GET organizations/:id/ideas/:id/submissions
    // route
    // (Phase 2 Task 5) derives from the ledger at this idea's
    // submissions address, so the ideas LEAF_CASES case below
    // needs a pair to find it. isB stays a raw row — it is read
    // only through org A's facade, which the fence hides either
    // way.
    await handleRequest(db, req(
        'PUT', '/organizations/' + organizationA + '/ideas/'
            + chainA.idea + '/submissions/'
            + chainA.ideaSubmission,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA),
        { idea_id: chainA.idea, member_id: SYSTEM_MEMBER_ID,
            at: T8_AT },
    ));
    return {
        db, organizationA, organizationB, pa, pb,
        paCred, pbCred, chainA, chainB,
    };
}

async function facadeGet(
    db: MemoryDbAdapter, organizationA: string, path: string,
): Promise<Response> {
    return handleRequest(db, req(
        'GET', '/organizations/' + organizationA + path,
        await organizationToken('XXZruirZyAOoRpNxaDnpSA', organizationA)));
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

function leafCases(fx: DeepDb): LeafCase[] {
    return [
        {
            name: 'organizations/:id/ideas/:id/submissions/',
            aPath: '/ideas/' + fx.chainA.idea
                + '/submissions/',
            bPath: '/ideas/' + fx.chainB.idea
                + '/submissions/',
            a: fx.chainA.ideaSubmission,
            b: fx.chainB.ideaSubmission,
        },
        {
            name: 'organizations/:id/objectives/:id/revisions/',
            aPath: '/objectives/' + fx.chainA.objective
                + '/revisions/',
            bPath: '/objectives/' + fx.chainB.objective
                + '/revisions/',
            a: fx.chainA.objectiveRevision,
            b: fx.chainB.objectiveRevision,
        },
    ];
}

const LEAF_CASE_NAMES = [
    'organizations/:id/ideas/:id/submissions/',
    'organizations/:id/objectives/:id/revisions/',
] as const;

for (const name of LEAF_CASE_NAMES) {
    Deno.test('nested ' + name + ' lists only the bound parent',
    async () => {
        const fx = await deepDb();
        const c = leafCases(fx).find(x => x.name === name)!;
        // Pair-plane foreign presence.
        const foreign = await handleRequest(fx.db, req(
            'GET',
            '/organizations/' + fx.organizationB + c.bPath,
            await organizationToken(fx.pb, fx.organizationB),
        ));
        assertStrictEquals(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert(
            foreignRows.some((r) => r.id === c.b),
            'foreign ' + c.b + ' missing on B plane',
        );
        const res = await facadeGet(fx.db, fx.organizationA, c.aPath);
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assertEquals(rows.map(r => r.id), [c.a]);
    });

    Deno.test('nested ' + name + ' hides a foreign-org parent',
    async () => {
        const fx = await deepDb();
        const c = leafCases(fx).find(x => x.name === name)!;
        // The B-org parent's collection, read through the A
        // facade, is fenced empty — the row resolves to org B.
        const res = await facadeGet(fx.db, fx.organizationA, c.bPath);
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assertEquals(rows.map(r => r.id), []);
    });
}

// The three flow-subordinate resources nest under
// organizations/:id/flows/:id.
// The collection is fetched at
// organizations/AjdvjuECVZEgZoFajaIEkg/flows/fA/<seg> — the SERVER
// filters to the parent flow — and the leaf at
// organizations/AjdvjuECVZEgZoFajaIEkg/flows/fA/<seg>/<id>. The org fence
// still rides the facade
// re-entry, so a foreign leaf 404s through its parent flow's org.
// Phase Final Task 2: work-orders + flow_records foreign
// presence is proven via B-org wire GET (row plane empty).
interface NestedFlowCase {
    seg: string;
    hasGetById?: boolean;
}

// versions row RETIRED (Phase 15 Task 7) with the routes.
const NESTED_FLOW_CASES: NestedFlowCase[] = [
    { seg: 'records', hasGetById: true },
    { seg: 'work-orders' },
];

function nestedFlowIds(fx: DeepDb, seg: string): {
    a: string; b: string;
} {
    if (seg === 'records') {
        return {
            a: fx.chainA.flowRecord, b: fx.chainB.flowRecord,
        };
    }
    return {
        a: fx.chainA.flowWorkOrder,
        b: fx.chainB.flowWorkOrder,
    };
}

for (const c of NESTED_FLOW_CASES) {
    Deno.test('nested organizations/:id/flows/:id/' + c.seg
        + ' lists only the bound flow',
    async () => {
        const fx = await deepDb();
        const ids = nestedFlowIds(fx, c.seg);
        const foreign = await handleRequest(fx.db, req(
            'GET',
            '/organizations/' + fx.organizationB + '/flows/'
                + fx.chainB.flow + '/' + c.seg + '/',
            await organizationToken(fx.pb, fx.organizationB),
        ));
        assertStrictEquals(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert(
            foreignRows.some((r) => r.id === ids.b),
            'foreign ' + ids.b + ' missing on B plane',
        );
        const res = await facadeGet(
            fx.db, fx.organizationA,
            '/flows/' + fx.chainA.flow + '/' + c.seg + '/');
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assertEquals(rows.map(r => r.id), [ids.a]);
    });

    if (c.hasGetById) {
        Deno.test('nested organizations/:id/flows/:id/' + c.seg +
            ' 404s a foreign id',
        async () => {
            const fx = await deepDb();
            const ids = nestedFlowIds(fx, c.seg);
            // Prove foreign join exists on B plane.
            const foreign = await handleRequest(fx.db, req(
                'GET',
                '/organizations/' + fx.organizationB + '/flows/'
                    + fx.chainB.flow + '/' + c.seg
                    + '/' + ids.b,
                await organizationToken(fx.pb, fx.organizationB),
            ));
            assertStrictEquals(foreign.status, 200);
            const res = await facadeGet(
                fx.db, fx.organizationA,
                '/flows/' + fx.chainA.flow + '/' + c.seg
                    + '/' + ids.b);
            assertStrictEquals(res.status, 404);
        });
    }
}

// organizations/:id/flows/:id/tags/:name (Phase 14 Task 9): PAIR-PLANE ONLY,
// so it
// cannot join NESTED_FLOW_CASES above (no backing table for
// `store` to probe). A DIRECT fence, not the facade re-entry:
// fB belongs to org B (seeded via seedChain(db, 'B', 'B', 'pb')
// in deepDb()), so a tag written there through 'pb's org-B token
// lands at the '/organizations/B/flows/fB/tags/' address; a read
// of the SAME path with 'XXZruirZyAOoRpNxaDnpSA's org-A-scoped token resolves
// an entirely different '/organizations/A/...' prefix — the
// same structural fence every org-nested address rides, with no
// tag-specific code of its own.
Deno.test('nested organizations/:id/flows/:id/tags 404s a foreign-org flow',
    async () => {
    const fx = await deepDb();
    const tagged = await handleRequest(fx.db, req(
        'PUT', '/organizations/' + fx.organizationB + '/flows/'
            + fx.chainB.flow
            + '/tags/xDyDkxEPwtcNmJVknUHDsg',
        await organizationToken(fx.pb, fx.organizationB),
        { flow_response_id: generateIdentifier() },
    ));
    assertStrictEquals(tagged.status, 201);

    const res = await handleRequest(fx.db, req(
        'GET', '/organizations/' + fx.organizationA + '/flows/'
            + fx.chainB.flow
            + '/tags/xDyDkxEPwtcNmJVknUHDsg',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        ),
    ));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: flow_tags/xDyDkxEPwtcNmJVknUHDsg',
    );
});

// The three project-subordinate resources nest under
// organizations/:id/projects/:id. The collection is fetched at
// organizations/AjdvjuECVZEgZoFajaIEkg/projects/pA/<seg> —
// the SERVER filters to the parent project — so the foreign
// row, bound to project pB, is excluded. The org fence still
// rides the facade re-entry. None exposes a leaf GET /:id (the
// leaves carry only PUT, or PUT+DELETE for flows), so no
// foreign-id 404 case applies. Phase Final Task 2: foreign
// presence is proven via B-org wire GET (row plane empty).
const NESTED_PROJECT_SEGS = [
    'flows',
    'objective-baseline-scores',
    'objective-actual-scores',
] as const;

function nestedProjectIds(
    fx: DeepDb, seg: string,
): { a: string; b: string } {
    if (seg === 'flows') {
        return {
            a: fx.chainA.projectFlow,
            b: fx.chainB.projectFlow,
        };
    }
    if (seg === 'objective-baseline-scores') {
        return {
            a: fx.chainA.baselineScore,
            b: fx.chainB.baselineScore,
        };
    }
    return {
        a: fx.chainA.actualScore, b: fx.chainB.actualScore,
    };
}

for (const seg of NESTED_PROJECT_SEGS) {
    Deno.test('nested organizations/:id/projects/:id/' + seg
        + ' lists only the bound project',
    async () => {
        const fx = await deepDb();
        const ids = nestedProjectIds(fx, seg);
        // Foreign join/score exists on B's message plane.
        const foreign = await handleRequest(fx.db, req(
            'GET',
            '/organizations/' + fx.organizationB + '/projects/'
                + fx.chainB.project + '/' + seg + '/',
            await organizationToken(fx.pb, fx.organizationB),
        ));
        assertStrictEquals(foreign.status, 200);
        const foreignRows = await foreign.json() as {
            id: string;
        }[];
        assert(
            foreignRows.some((r) => r.id === ids.b),
            'foreign ' + ids.b + ' missing on B plane',
        );
        const res = await facadeGet(
            fx.db, fx.organizationA,
            '/projects/' + fx.chainA.project
                + '/' + seg + '/');
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assertEquals(rows.map(r => r.id), [ids.a]);
    });
}

// Bulk lifecycle collection RETIRED (states-URI elimination
// C3). Org isolation force lives on per-item work-order
// history and objective versions. Nested field-values
// collection retired (C4) — field values fold on work-order
// history; family history pins ownership below.

// C4: field-values fence re-homes onto work-order history
// (inline field_values on transition rows).
Deno.test('organizations/:id/work-orders/:id/history fold'
    + ' carries own field_values',
async () => {
    const fx = await deepDb();
    // Phase Final Stage B: state_field_values table retired —
    // prove foreign transition fold via B history, then A's
    // history carries only A's fold.
    const foreign = await handleRequest(fx.db, req(
        'GET', '/organizations/' + fx.organizationB
            + '/work-orders/' + fx.chainB.workOrder
            + '/history',
        await organizationToken(fx.pb, fx.organizationB),
    ));
    assertStrictEquals(foreign.status, 200);
    const foreignRows = await foreign.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const foreignTe = foreignRows.find(
        r => r.id === fx.chainB.transitionEvent,
    );
    assert(
        foreignTe !== undefined,
        'transition missing on B',
    );
    assert(
        foreignTe!.field_values.some(
            r => r.id === fx.chainB.fieldValue,
        ),
        'foreign SFV fold missing',
    );
    const res = await facadeGet(
        fx.db, fx.organizationA,
        '/work-orders/' + fx.chainA.workOrder + '/history');
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as {
        id: string;
        field_values: { id: string }[];
    }[];
    const ownTe = rows.find(
        r => r.id === fx.chainA.transitionEvent,
    );
    assert(
        ownTe !== undefined, 'transition missing on A',
    );
    assertEquals(
        ownTe!.field_values.map(r => r.id),
        [fx.chainA.fieldValue],
    );
});

Deno.test('organizations/:id/work-orders/:id/history 404s a foreign work'
+ ' order', async () => {
    const fx = await deepDb();
    // woB is B-org; never written at A's address → 404.
    const res = await facadeGet(
        fx.db, fx.organizationA,
        '/work-orders/' + fx.chainB.workOrder + '/history');
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: work_orders/' + fx.chainB.workOrder,
    );
});

// Family versions route (states-URI elimination C1): fence
// rides organizations/:id/ideas/:id/versions. A miss at this address is 404.
Deno.test('ideas history gates on parent ownership',
async () => {
    const fx = await deepDb();
    const mine = await facadeGet(
        fx.db, fx.organizationA,
        '/ideas/' + fx.chainA.idea + '/versions/');
    assertStrictEquals(mine.status, 200);
    const mineRows = await mine.json() as { id: string }[];
    assert(mineRows.length >= 1);
    // iB exists on the message plane (seedChain PUT), but A does
    // not own it — the history-leak bug. Phase Final Task 2:
    // no ideas row to assert; B-org GET proves presence.
    const bOwns = await handleRequest(fx.db, req(
        'GET', '/organizations/' + fx.organizationB + '/ideas/'
            + fx.chainB.idea,
        await organizationToken(fx.pb, fx.organizationB),
    ));
    assertStrictEquals(bOwns.status, 200);
    const foreign = await facadeGet(
        fx.db, fx.organizationA,
        '/ideas/' + fx.chainB.idea + '/versions/');
    assertStrictEquals(foreign.status, 404);
    const body = await foreign.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Not found: ideas/' + fx.chainB.idea,
    );
});

Deno.test('flat identity-pii is 404; nested foreign GET 403s',
async () => {
    const fx = await deepDb();
    const res = await handleRequest(fx.db, req(
        'GET', '/identity-pii',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(res.status, 404);
    // Message plane proves pb's pii still exists while the
    // collection is gone. Nested GET of a FOREIGN-org
    // identity: authorizeIdentityPii allows admin; the org
    // fence should still 403 pb.
    assertStrictEquals(
        (await deriveIdentityPii(fx.db, fx.pb)).id, fx.pb);
    const foreign = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pb + '/pii',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(foreign.status, 403);
    const foreignBody =
        await foreign.json() as { error: string };
    assertStrictEquals(
        foreignBody.error,
        'forbidden: identity_pii/' + fx.pb + ' belongs to a'
        + ' different organization',
    );
});

Deno.test('nested identities/:id/credentials hide secret, members',
async () => {
    const fx = await deepDb();
    // pa is a co-member of A — its nested collection lists the
    // credential with the secret projected out.
    const res = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pa + '/credentials/',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(res.status, 200);
    const rows = await res.json() as Array<{
        id: string;
        identity_id: string;
        secret?: string;
    }>;
    assertEquals(rows.map(r => r.id), [fx.paCred]);
    for (const r of rows) {
        assertStrictEquals(r.secret, undefined);
    }
    // pb is a B-only member — its nested collection 403s
    // through the A facade (honest foreign ownership).
    // Phase Final Task 2: message plane proves pb's credential
    // exists while fence 403s under A.
    assertStrictEquals(
        (await deriveCredential(fx.db, fx.pb, fx.pbCred)).id,
        fx.pbCred);
    // Phase Final Stage B: identity spine tables retired.
    const other = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pb + '/credentials/',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(other.status, 403);
    const otherBody = await other.json() as { error: string };
    assertStrictEquals(
        otherBody.error,
        'forbidden: identity_credentials/' + fx.pb
            + ' belongs to a'
        + ' different organization',
    );
    // a single read projects secret out too
    const one = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pa
            + '/credentials/' + fx.paCred,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(one.status, 200);
    assertStrictEquals(
        (await one.json() as { secret?: string }).secret,
        undefined);
    // a non-member credential 403s
    const foreign = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pb
            + '/credentials/' + fx.pbCred,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(foreign.status, 403);
    const foreignBody =
        await foreign.json() as { error: string };
    assertStrictEquals(
        foreignBody.error,
        'forbidden: identity_credentials/' + fx.pbCred
            + ' belongs to'
        + ' a different organization',
    );
});

// identity-credentials stays ADMIN-ONLY after nesting: the
// /identities surface carries no member-tier entry, so the
// nested credentials route falls to the root admin tier. Admin
// reads it; a plain member is denied, exactly as the flat
// /identity-credentials route was.
Deno.test('nested credentials are admin-only (member denied)',
async () => {
    const fx = await deepDb();
    // pa's membership type:"member" bakes claim role member:A
    // via organizationToken — admin surface stays denied.
    const asAdmin = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pa + '/credentials/',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(asAdmin.status, 200);
    const asMember = await handleRequest(fx.db, req(
        'GET', '/identities/' + fx.pa + '/credentials/',
        await organizationToken(fx.pa, fx.organizationA)));
    assertStrictEquals(asMember.status, 403);
});

Deno.test('organizations/:id 403s a non-member org', async () => {
    const fx = await deepDb();
    const mine = await handleRequest(fx.db, req(
        'GET', '/organizations/' + fx.organizationA,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(mine.status, 200);
    // Phase Final Task 2: organizations ROW half stripped —
    // B still has a pair (seedOrganizationDocument), so
    // derive finds it; the membership fence 403s.
    assertStrictEquals(
        (await deriveOrganization(fx.db, fx.organizationB)).id,
        fx.organizationB);
    const foreign = await handleRequest(fx.db, req(
        'GET', '/organizations/' + fx.organizationB,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(foreign.status, 403);
    const body = await foreign.json() as { error: string };
    assertStrictEquals(
        body.error,
        'forbidden: organizations/' + fx.organizationB
            + ' belongs to a different'
        + ' organization',
    );
});

Deno.test('organizations/:id 404s a genuinely absent org',
async () => {
    const fx = await deepDb();
    const res = await handleRequest(fx.db, req(
        'GET', '/organizations/oLbQcDdzGHmpcoUKyvlTnQ',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(res.status, 404);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error, 'Not found: /organizations/oLbQcDdzGHmpcoUKyvlTnQ',
    );
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

Deno.test('identity-pii shows an orphan with no membership',
async () => {
    const fx = await deepDb();
    const orphan = generateIdentifier();
    await seedIdentityPii(fx.db, orphan, {
        name: 'orphan', email: 'orphan@x.com',
        phone: '', bio: '',
    });
    const retired = await handleRequest(fx.db, req(
        'GET', '/identity-pii',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(retired.status, 404);
    const ids = new Set(
        (await deriveIdentityPiiRows(fx.db)).map(r => r.id));
    assert(ids.has(orphan));
    assertStrictEquals(
        (await deriveIdentityPii(fx.db, orphan)).id,
        orphan);
    const res = await handleRequest(fx.db, req(
        'GET', '/identities/' + orphan + '/pii',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(res.status, 200);
});

Deno.test('nested credentials show an orphan with no membership',
async () => {
    const fx = await deepDb();
    const orphan = generateIdentifier();
    const credId = generateIdentifier();
    await seedIdentityCredential(fx.db, orphan, credId, {
        identity_id: orphan, kind: 'password',
        status: 'set', secret: 'HASH-orphan', at: T8_AT,
    });
    // orphan has no membership → null owner → visible orphan in
    // its own nested collection, read through the A facade.
    const res = await handleRequest(fx.db, req(
        'GET', '/identities/' + orphan + '/credentials/',
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        )));
    assertStrictEquals(res.status, 200);
    const ids = (await res.json() as Array<{
        identity_id: string;
    }>).map(r => r.identity_id);
    assertEquals(ids, [orphan]);
});

// Orphan states/:id writes retired with the address. Pin
// that a ghost body is a router 404 (no injection path).
// Path is built without a contiguous slash-states token so
// the vocabulary gate stays clean. Collection isolation
// force lives on A2/A5 history legs.
Deno.test('states/:id orphan write is router 404', async () => {
    const fx = await deepDb();
    const retiredAppend = ['', 'states', 'seGhost'].join('/');
    const ghost = await handleRequest(fx.db, req(
        'PUT', retiredAppend,
        await organizationToken(
            'XXZruirZyAOoRpNxaDnpSA', fx.organizationA,
        ),
        { entity_id: 'ghost', state: 'active', at: T8_AT },
    ));
    assertStrictEquals(ghost.status, 404);
});
