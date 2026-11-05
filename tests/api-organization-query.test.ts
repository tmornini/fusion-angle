import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedOrganizationDocument } from './test-fixtures.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    apiRequest,
    invitationLatched,
    partsOf,
} from './http-fixtures.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import { membershipNameOf } from '../shared/membership-name.ts';
import type { MembershipEntity } from '../shared/types.ts';

// The organization-root QUERY serves the ideas, projects,
// and people of the caller's organization whose served
// bodies and joins match the search text, grouped in that
// order and best first within each group. Each part names
// its document in its content-location. A part never
// matches on what the GET serving it would hide.

const TONY = 'XXZruirZyAOoRpNxaDnpSA';
const ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const OTHER_ORGANIZATION = 'BBjWJsjYIDkTRKIIPrzWRw';
const AT = '2026-04-01T00:00:00.000000Z';
const ROOT = '/organizations/' + ORGANIZATION;
const MEMBERSHIPS = ROOT + '/memberships/';
const ENGINEER = { title: 'Engineer', department: 'Product' };

type Profile = {
    readonly title: string,
    readonly department: string,
};

type Seated = {
    readonly id: string,
    readonly name: string,
    readonly token: string,
};

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method, path, token,
        ...(body !== undefined ? { body } : {}),
    });
}

async function sent(
    db: MemoryDbAdapter,
    request: Request,
    status: number,
): Promise<void> {
    const res = await handleRequest(db, request);
    assertStrictEquals(res.status, status);
    await res.body?.cancel();
}

async function basis(): Promise<{
    db: MemoryDbAdapter;
    admin: string;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, ORGANIZATION, 'Stark');
    await seedPersonIdentity(db, TONY, {
        name: 'Tony',
        email: 'tony@example.com',
        phone: '',
        bio: '',
    });
    return {
        db,
        admin: await organizationToken(TONY, ORGANIZATION),
    };
}

async function seat(
    db: MemoryDbAdapter,
    admin: string,
    body: Record<string, unknown>,
    type: MembershipEntity['type'],
): Promise<string> {
    const id = generateIdentifier();
    await sent(db, req(
        'POST', MEMBERSHIPS, admin,
        { id, ...body, membership: { type, at: AT } },
    ), 201);
    return membershipNameOf(ORGANIZATION, id);
}

async function human(
    db: MemoryDbAdapter,
    admin: string,
    name: string,
    email: string,
    profile: Profile,
): Promise<Seated> {
    const membership = await seat(db, admin, {
        kind: 'human',
        identity: { ...profile, strengths: [], team_dimensions: {} },
        pii: { name, email, phone: '', bio: '' },
    }, 'member');
    const id = membership.split(':')[1]!;
    return {
        id,
        name: membership,
        token: await organizationToken(id, ORGANIZATION),
    };
}

function ideaDocument(
    title: string,
    state: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
    };
}

function projectDocument(
    title: string,
    progress: number,
    state: string,
): Record<string, unknown> {
    return {
        title,
        description: 'd',
        progress,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
        state,
    };
}

async function idea(
    db: MemoryDbAdapter,
    admin: string,
    title: string,
    submitter: string,
): Promise<string> {
    const id = generateIdentifier();
    await sent(db, req(
        'PUT', ROOT + '/ideas/' + id, admin,
        ideaDocument(title, 'active'),
    ), 201);
    await sent(db, req(
        'PUT',
        ROOT + '/ideas/' + id + '/submissions/'
            + generateIdentifier(),
        admin,
        { idea_id: id, member_id: submitter, at: AT },
    ), 201);
    return id;
}

async function project(
    db: MemoryDbAdapter,
    admin: string,
    title: string,
    progress: number,
): Promise<string> {
    const id = generateIdentifier();
    await sent(db, req(
        'PUT', ROOT + '/projects/' + id, admin,
        projectDocument(title, progress, 'submitted'),
    ), 201);
    return id;
}

// The binding's path: its DELETE unbinds the flow.
async function bound(
    db: MemoryDbAdapter,
    admin: string,
    projectId: string,
    flowId: string,
): Promise<string> {
    const path = ROOT + '/projects/' + projectId + '/flows/'
        + generateIdentifier();
    await sent(db, req(
        'PUT', path, admin,
        { project_id: projectId, flow_id: flowId, at: AT },
    ), 201);
    return path;
}

function query(
    db: MemoryDbAdapter,
    token: string,
    body: unknown,
): Promise<Response> {
    return handleRequest(db, req('QUERY', ROOT, token, body));
}

// Each matching part's content-location, in answer order.
async function matched(
    db: MemoryDbAdapter,
    token: string,
    text: string,
): Promise<string[]> {
    const res = await query(db, token, { q: text });
    if (res.status === 204) {
        await res.body?.cancel();
        return [];
    }
    assertStrictEquals(res.status, 200);
    return (await partsOf(res)).map((part) =>
        part.query('header.content-location').toText());
}

function ideaAt(id: string): string {
    return ROOT + '/ideas/' + id;
}

function projectAt(id: string): string {
    return ROOT + '/projects/' + id;
}

function memberAt(membership: string): string {
    return ROOT + '/invitations/' + membership;
}

Deno.test('groups ideas, projects, members in that order',
async () => {
    const { db, admin } = await basis();
    const reader = await human(
        db, admin, 'Reader Person', 'reader@example.com', ENGINEER,
    );
    const zephyr = await human(
        db, admin, 'Zephyr Quinn', 'quinn@example.com', ENGINEER,
    );
    const rollout = await project(db, admin, 'Zephyr rollout', 0);
    const intake = await idea(db, admin, 'Zephyr intake', TONY);
    const res = await query(db, reader.token, { q: 'zephyr' });
    assertStrictEquals(res.status, 200);
    const parts = await partsOf<{ id: string }>(res);
    assertEquals(
        parts.map((part) =>
            part.query('header.content-location').toText()),
        [ideaAt(intake), projectAt(rollout), memberAt(zephyr.name)],
    );
    assertEquals(
        parts.map((part) => part.body().toValue().id),
        [intake, rollout, zephyr.name],
    );
});

Deno.test('ranks within a family', async () => {
    const { db, admin } = await basis();
    const typo = await idea(db, admin, 'Kestral plan', TONY);
    const exact = await idea(db, admin, 'Kestrel plan', TONY);
    assertEquals(
        await matched(db, admin, 'kestrel'),
        [ideaAt(exact), ideaAt(typo)],
    );
});

Deno.test('matches an idea by its submitter\'s name', async () => {
    const { db, admin } = await basis();
    const zebulon = await human(
        db, admin, 'Zebulon Quartermaine', 'zebulon@example.com',
        ENGINEER,
    );
    const harbor = await idea(db, admin, 'Harbor plan', zebulon.id);
    assertEquals(
        await matched(db, zebulon.token, 'quartermaine'),
        [ideaAt(harbor), memberAt(zebulon.name)],
    );
});

Deno.test('matches a project by a flow id it joins', async () => {
    const { db, admin } = await basis();
    const harbor = await project(db, admin, 'Harbor rollout', 0);
    const flowId = generateIdentifier();
    await bound(db, admin, harbor, flowId);
    assertEquals(
        await matched(db, admin, flowId), [projectAt(harbor)],
    );
});

// The top bar shows "Progress: 40%", so "40%" finds it; a
// near number is a one-edit match, ranked after the exact.
Deno.test('matches a project by its progress', async () => {
    const { db, admin } = await basis();
    await project(db, admin, 'Harbor rollout', 75);
    const near = await project(db, admin, 'Harbor rollout', 41);
    const exact = await project(db, admin, 'Harbor rollout', 40);
    assertEquals(
        await matched(db, admin, '40%'),
        [projectAt(exact), projectAt(near)],
    );
});

Deno.test('a deleted project does not match, even by id',
async () => {
    const { db, admin } = await basis();
    const gone = await project(db, admin, 'Harbor rollout', 0);
    await sent(db, req(
        'PUT', projectAt(gone), admin,
        projectDocument('Harbor rollout', 0, 'deleted'),
    ), 200);
    assertEquals(await matched(db, admin, gone), []);
    assertEquals(await matched(db, admin, 'harbor'), []);
});

// The project-flows GET drops a DELETE head.
Deno.test('a project does not match by a flow it unbinds',
async () => {
    const { db, admin } = await basis();
    const harbor = await project(db, admin, 'Harbor rollout', 0);
    const flowId = generateIdentifier();
    await sent(
        db,
        req('DELETE', await bound(db, admin, harbor, flowId), admin),
        204,
    );
    assertEquals(await matched(db, admin, flowId), []);
});

Deno.test('a deleted idea does not match, even by id', async () => {
    const { db, admin } = await basis();
    const gone = await idea(db, admin, 'Harbor plan', TONY);
    await sent(db, req(
        'PUT', ideaAt(gone), admin,
        ideaDocument('Harbor plan', 'deleted'),
    ), 200);
    assertEquals(await matched(db, admin, gone), []);
    assertEquals(await matched(db, admin, 'harbor'), []);
});

Deno.test('an erased member\'s email does not match', async () => {
    const { db, admin } = await basis();
    const zebulon = await human(
        db, admin, 'Zebulon Quartermaine', 'zebulon@example.com',
        ENGINEER,
    );
    await sent(
        db, req('DELETE', '/identities/' + zebulon.id + '/pii', admin),
        204,
    );
    assertEquals(await matched(db, admin, 'zebulon@example.com'), []);
});

// The identities/:id GET refuses every caller but an
// organization admin.
Deno.test('a member cannot match a profile title; an admin can',
async () => {
    const { db, admin } = await basis();
    const zebulon = await human(
        db, admin, 'Zebulon Quartermaine', 'zebulon@example.com',
        { title: 'Lighthouse Keeper', department: 'Maritime' },
    );
    assertEquals(
        await matched(db, zebulon.token, 'lighthouse keeper'), [],
    );
    assertEquals(
        await matched(db, admin, 'lighthouse keeper'),
        [memberAt(zebulon.name)],
    );
});

Deno.test('a member search keeps people only', async () => {
    const { db, admin } = await basis();
    await seat(db, admin, {
        kind: 'ai',
        ai: {
            name: 'Zephyr Assistant',
            description: 'Triages the overnight queue',
            skill_focus: 'routing',
            model: firstProviderModel().id,
        },
    }, 'member');
    assertEquals(await matched(db, admin, 'zephyr'), []);
});

Deno.test('a removed member does not match', async () => {
    const { db, admin } = await basis();
    const zebulon = await human(
        db, admin, 'Zebulon Quartermaine', 'zebulon@example.com',
        ENGINEER,
    );
    const res = await handleRequest(db, await invitationLatched(
        db, req(
            'PUT', memberAt(zebulon.name), admin,
            { state: 'removed', at: '2026-04-01T00:00:09.000000Z' },
        ),
    ));
    assertStrictEquals(res.status, 200);
    await res.body?.cancel();
    assertEquals(await matched(db, admin, 'zebulon'), []);
});

Deno.test('nothing matches is 204', async () => {
    const { db, admin } = await basis();
    await idea(db, admin, 'Harbor plan', TONY);
    const res = await query(db, admin, { q: 'xylophone quasar' });
    assertStrictEquals(res.status, 204);
    await res.body?.cancel();
});

Deno.test('a bad body is 400', async () => {
    const { db, admin } = await basis();
    const res = await query(db, admin, { q: 5 });
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
});

Deno.test('a foreign path is 403', async () => {
    const { db, admin } = await basis();
    const res = await handleRequest(db, req(
        'QUERY', '/organizations/' + OTHER_ORGANIZATION, admin,
        { q: 'harbor' },
    ));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});
