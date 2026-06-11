import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { devToken, orgToken } from './token-fixtures.ts';
import {
    ideaBody,
    orgRow,
    seedAdminSchema,
} from './test-fixtures.ts';
import { jsonObjectField } from '../api/types.ts';

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
async function twoOrgs(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.roleGrants.put('role-current-admin-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system',
        at: '2020-01-01T00:00:00.000000Z',
    });
    await db.memberships.put('m-a', {
        organization_id: 'A', identity_id: 'current',
        at: '2026-06-04T00:00:00.000000Z',
    });
    await db.ideas.put('a1', ideaBody('A', 'mine'));
    await db.ideas.put('b1', ideaBody('B', 'theirs'));
    return db;
}

test('a facade GET returns only the bound org rows',
async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'GET', '/organizations/A/ideas',
        await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['a1']);
});

test('a facade into a non-member org is 403', async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'GET', '/organizations/B/ideas',
        await devToken('current')));
    assert.equal(res.status, 403);
});

test('a facade PUT stamps the bound org over a forged body',
async () => {
    const db = await twoOrgs();
    const res = await handleRequest(db, req(
        'PUT', '/organizations/A/ideas/a2',
        await devToken('current'),
        { id: 'a2', ...ideaBody('B', 'forged') }));
    assert.equal(res.status, 200);
    const stored = await db.ideas.getById('a2');
    assert.equal(stored.organization_id, 'A');
});

test('enumerate returns only the caller member orgs',
async () => {
    const db = await twoOrgs();
    await db.organizations.put('A', orgRow('Acme'));
    await db.organizations.put('B', orgRow('Beta'));
    const res = await handleRequest(db, req(
        'GET', '/organizations', await devToken('current')));
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['A']);
});

test('the facade requires a bearer token', async () => {
    const db = await twoOrgs();
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
    await db.postSchemaCreation();
    await db.organizations.put('A', orgRow('Acme'));
    await db.organizations.put('B', orgRow('Beta'));
    await db.memberships.put('m-sarah-a', {
        organization_id: 'A', identity_id: 'sarah',
        at: '2026-06-04T00:00:00.000000Z',
    });
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

function projectBody(org: string) {
    return {
        organization_id: org, title: 't', description: 'd',
        progress: 0, start_date: '2026-06-04',
        target_end_date: '2026-06-04', estimated_cost: 0,
        actual_cost: 0, position: 0,
    };
}

function flowBody(org: string) {
    return {
        organization_id: org, name: 'f', is_locked: false,
        is_auto_layout: false, is_auto_fit: false,
        lock_timeout: 0,
        graph: jsonObjectField({ nodes: [], edges: [] }),
    };
}

function workOrderBody(org: string) {
    return {
        organization_id: org, display_id: 'WO',
        flow_graph: jsonObjectField({
            flowId: 'f', name: 'f', lockTimeout: 0,
            nodes: [], edges: [],
        }),
        position: 0,
    };
}

// Seed a full parent→leaf chain in `org`, ids suffixed `s`.
async function seedChain(
    db: MemoryDbAdapter, org: string, s: string,
): Promise<void> {
    await db.ideas.put('i' + s, ideaBody(org, 'idea'));
    await db.projects.put('p' + s, projectBody(org));
    await db.flows.put('f' + s, flowBody(org));
    await db.objectives.put(
        'o' + s, { organization_id: org, position: 0 });
    await db.records.put('r' + s, {
        organization_id: org, name: 'r',
        description: 'd', position: 0,
    });
    await db.workOrders.put('wo' + s, workOrderBody(org));
    await db.flowVersions.put('fv' + s, {
        flow_id: 'f' + s, name: 'v', is_locked: false,
        is_auto_layout: false, is_auto_fit: false,
        lock_timeout: 0,
        graph: jsonObjectField({ nodes: [], edges: [] }),
        at: T8_AT,
    });
    await db.projectFlows.put('pf' + s, {
        project_id: 'p' + s, flow_id: 'f' + s, at: T8_AT,
    });
    await db.flowWorkOrders.put('fwo' + s, {
        flow_id: 'f' + s, work_order_id: 'wo' + s, at: T8_AT,
    });
    await db.flowRecords.put('fr' + s, {
        flow_id: 'f' + s, record_id: 'r' + s, at: T8_AT,
    });
    await db.ideaSubmissions.put('is' + s, {
        idea_id: 'i' + s, member_id: 'system', at: T8_AT,
    });
    await db.objectiveRevisions.put('orev' + s, {
        objective_id: 'o' + s, name: 'n',
        description: 'd', member_id: 'system', at: T8_AT,
    });
    await db.projectObjectiveBaselineScores.put('bs' + s, {
        project_id: 'p' + s, objective_id: 'o' + s,
        score: 1, member_id: 'system', at: T8_AT,
    });
    await db.projectObjectiveActualScores.put('as' + s, {
        project_id: 'p' + s, objective_id: 'o' + s,
        score: 2, member_id: 'system', at: T8_AT,
    });
    await db.states.put('se' + s, {
        entity_id: 'i' + s, state: 'active',
        member_id: 'system', at: T8_AT,
    });
    await db.stateFieldValues.put('sfv' + s, {
        state_event_id: 'se' + s, field_id: 'x', value: 'v',
    });
}

// Two full chains (A, B) plus the identity spine; `current` is
// admin + member of A ONLY. `pa` is a co-member in A; `pb` is a
// member of B only, so its PII / credentials / member-lifecycle
// events stay invisible to A. Member events name the org-less
// member id directly (member.id === identity.id).
async function deepDb(): Promise<MemoryDbAdapter> {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.organizations.put('A', orgRow('Acme'));
    await db.organizations.put('B', orgRow('Beta'));
    await db.roleGrants.put('rg-current-a', {
        organization_id: 'A', identity_id: 'current',
        role: 'admin', action: 'granted',
        by_member_id: 'system', at: T8_AT,
    });
    await db.memberships.put('mem-current-a', {
        organization_id: 'A', identity_id: 'current',
        at: T8_AT,
    });
    for (const [id, org] of [
        ['pa', 'A'], ['pb', 'B'],
    ] as const) {
        await db.members.put(id, { type: 'human' });
        await db.identities.put(id, { kind: 'person' });
        await db.identityPii.put(id, {
            name: id, email: id + '@x.com',
            phone: '', bio: '',
        });
        await db.identityCredentials.put('cred-' + id, {
            identity_id: id, kind: 'password',
            status: 'set', secret: 'HASH-' + id, at: T8_AT,
        });
        await db.memberships.put('mem-' + id, {
            organization_id: org, identity_id: id, at: T8_AT,
        });
        await db.states.put('seMem-' + id, {
            entity_id: id, state: 'active',
            member_id: 'system', at: T8_AT,
        });
    }
    await seedChain(db, 'A', 'A');
    await seedChain(db, 'B', 'B');
    return db;
}

async function facadeGet(
    db: MemoryDbAdapter, path: string,
): Promise<Response> {
    return handleRequest(db, req(
        'GET', '/organizations/A' + path,
        await devToken('current')));
}

interface LeafCase {
    route: string;
    store: (d: MemoryDbAdapter) => {
        getById(id: string): Promise<{ id: string }>;
    };
    a: string;
    b: string;
    // Only some leaf routes expose a GET /:id — the rest are
    // collection + POST only, so the foreign-id 404 is asserted
    // only where a point read exists.
    hasGetById?: boolean;
}

const LEAF_CASES: LeafCase[] = [
    { route: 'flow-versions', hasGetById: true,
        store: d => d.flowVersions, a: 'fvA', b: 'fvB' },
    { route: 'flow-records', hasGetById: true,
        store: d => d.flowRecords, a: 'frA', b: 'frB' },
    { route: 'project-flows',
        store: d => d.projectFlows, a: 'pfA', b: 'pfB' },
    { route: 'flow-work-orders',
        store: d => d.flowWorkOrders, a: 'fwoA', b: 'fwoB' },
    { route: 'idea-submissions',
        store: d => d.ideaSubmissions, a: 'isA', b: 'isB' },
    { route: 'objective-revisions',
        store: d => d.objectiveRevisions,
        a: 'orevA', b: 'orevB' },
    { route: 'project-objective-baseline-scores',
        store: d => d.projectObjectiveBaselineScores,
        a: 'bsA', b: 'bsB' },
    { route: 'project-objective-actual-scores',
        store: d => d.projectObjectiveActualScores,
        a: 'asA', b: 'asB' },
];

for (const c of LEAF_CASES) {
    test('leaf ' + c.route + ' lists only the bound org',
    async () => {
        const db = await deepDb();
        // Prove the foreign row EXISTS in storage, so exclusion
        // is the fence — the test fails on a regression.
        assert.equal(
            (await c.store(db).getById(c.b)).id, c.b);
        const res = await facadeGet(db, '/' + c.route);
        assert.equal(res.status, 200);
        const rows = await res.json() as { id: string }[];
        assert.deepEqual(rows.map(r => r.id), [c.a]);
    });

    if (c.hasGetById) {
        test('leaf ' + c.route + ' 404s a foreign id',
        async () => {
            const db = await deepDb();
            assert.equal(
                (await c.store(db).getById(c.b)).id, c.b);
            const res = await facadeGet(
                db, '/' + c.route + '/' + c.b);
            assert.equal(res.status, 404);
        });
    }
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

test('state-field-values fence follows the event',
async () => {
    const db = await deepDb();
    // Prove the foreign field value EXISTS in storage; the
    // collection fence (via its parent state event) hides it.
    assert.equal(
        (await db.stateFieldValues.getById('sfvB')).id,
        'sfvB');
    const res = await facadeGet(db, '/state-field-values');
    assert.equal(res.status, 200);
    const rows = await res.json() as { id: string }[];
    assert.deepEqual(rows.map(r => r.id), ['sfvA']);
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

test('identity-credentials hide secret and non-members',
async () => {
    const db = await deepDb();
    const res = await facadeGet(db, '/identity-credentials');
    assert.equal(res.status, 200);
    const rows = await res.json() as Array<{
        identity_id: string;
        secret?: string;
    }>;
    const ids = new Set(rows.map(r => r.identity_id));
    assert.ok(ids.has('pa'));
    assert.ok(!ids.has('pb'));
    for (const r of rows) {
        assert.equal(r.secret, undefined);
    }
    // a single read projects secret out too
    const one = await facadeGet(
        db, '/identity-credentials/cred-pa');
    assert.equal(one.status, 200);
    assert.equal(
        (await one.json() as { secret?: string }).secret,
        undefined);
    // a non-member credential 404s
    assert.equal(
        (await db.identityCredentials.getById('cred-pb')).id,
        'cred-pb');
    const foreign = await facadeGet(
        db, '/identity-credentials/cred-pb');
    assert.equal(foreign.status, 404);
});

test('organizations/:id 404s a non-member org', async () => {
    const db = await deepDb();
    const mine = await handleRequest(db, req(
        'GET', '/organizations/A',
        await orgToken('current', 'A')));
    assert.equal(mine.status, 200);
    assert.equal(
        (await db.organizations.getById('B')).id, 'B');
    const foreign = await handleRequest(db, req(
        'GET', '/organizations/B',
        await orgToken('current', 'A')));
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
    await db.identityPii.put('orphan', {
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

test('identity-credentials show an orphan with no membership',
async () => {
    const db = await deepDb();
    await db.identityCredentials.put('cred-orphan', {
        identity_id: 'orphan', kind: 'password',
        status: 'set', secret: 'HASH-orphan', at: T8_AT,
    });
    const res = await facadeGet(db, '/identity-credentials');
    assert.equal(res.status, 200);
    const ids = new Set((await res.json() as Array<{
        identity_id: string;
    }>).map(r => r.identity_id));
    assert.ok(ids.has('orphan'));  // no membership → visible
    assert.ok(!ids.has('pb'));     // B-only → still hidden
});

test('states show an orphan event with no owner', async () => {
    const db = await deepDb();
    await db.states.put('seGhost', {
        entity_id: 'ghost', state: 'active',
        member_id: 'system', at: T8_AT,
    });
    const res = await facadeGet(db, '/states');
    assert.equal(res.status, 200);
    const ids = new Set(
        (await res.json() as { id: string }[]).map(r => r.id));
    assert.ok(ids.has('seGhost'));  // unowned → visible orphan
    assert.ok(!ids.has('seB'));     // B's event → still hidden
});
