import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { GET, GETCollection } from './in-page-facade.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    claimToken,
    DEV_TOKEN,
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { firstProviderModel } from './member-fixtures.ts';
import { getModelsByProvider } from '../api/provider-models.ts';
import {
    apiRequest,
    partBodiesOf,
} from './http-fixtures.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { operationIdHeader } from
    './operation-id-header.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../api/backend-memory.ts';
import type {
    CollectionHeadRead,
    StorageBackend,
    Tx,
} from '../api/db.ts';
import { MEMBERSHIPS_PATH } from '../api/memberships.ts';
import { canonicalPath } from '../api/message-pair.ts';


const AT = '2026-01-01T00:00:00.000000Z';
const REMOVED_AT = '2026-01-01T00:00:01.000000Z';

function agentFields(name: string) {
    return {
        name,
        description: 'A standing agent',
        skill_focus: 'drafting',
        model: firstProviderModel().id,
    };
}

function req(
    method: string, path: string, token: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
    });
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function emptyDelta() {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function graphNode(
    memberIds: string[],
    agentIds?: string[],
) {
    return {
        id: generateIdentifier(),
        name: 'Step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds,
        ...(agentIds === undefined
            ? {}
            : { agentIds }),
        attributes: [],
        taskInstructions: '',
    };
}

function flowDocument(
    name: string,
    stateEventId: string,
    graph: { nodes: unknown[]; edges: unknown[] },
) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: AT,
        state_event_id: stateEventId,
        graph,
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';

function aiPath(organization: string, id = ''): string {
    return '/organizations/' + organization
        + '/ai-agents/' + id;
}

Deno.test('an AI document lives under its organization',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const body = agentFields('Scoped agent');
    await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: body,
    });
    const got = await handleRequest(db, req(
        'GET', aiPath(STARK, id), DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    assertEquals(await got.json(), { id, ...body });
    const listed = await handleRequest(db, req(
        'GET', aiPath(STARK), DEV_TOKEN,
    ));
    assertStrictEquals(listed.status, 200);
    assertEquals(
        (await partBodiesOf<{ id: string }>(listed))
            .map((row) => row.id),
        [id],
    );
});

// Foreign path 403 at the organization fence; a Stark id
// under Wayne's own path does not exist there (404).
Deno.test('another organization reads no AI of ours',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Stark agent'),
    });
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const foreignPath = await handleRequest(db, req(
        'GET', aiPath(STARK, id), wayne,
    ));
    assertStrictEquals(foreignPath.status, 403);
    await foreignPath.body?.cancel();
    const foreignId = await handleRequest(db, req(
        'GET', aiPath(WAYNE, id), wayne,
    ));
    assertStrictEquals(foreignId.status, 404);
    await foreignId.body?.cancel();
    assertEquals(
        await GETCollection(
            db, aiPath(WAYNE).slice(1), wayne,
            operationIdHeader(),
        ),
        [],
    );
});

// A Stark AI made by the statement is a seated identity
// too: its id still does not exist under Wayne's own path
// (404), and Stark's path is the fence (403).
Deno.test('a foreign AI member id is absent under our path',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const created = await handleRequest(db, req(
        'POST',
        '/organizations/' + STARK + '/memberships/',
        DEV_TOKEN,
        {
            id,
            kind: 'ai',
            membership: { type: 'member', at: AT },
            ai: agentFields('Stark member'),
        },
    ));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const foreignId = await handleRequest(db, req(
        'GET', aiPath(WAYNE, id), wayne,
    ));
    assertStrictEquals(foreignId.status, 404);
    await foreignId.body?.cancel();
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: aiPath(WAYNE, id),
        token: wayne,
        body: agentFields('Wayne member'),
        headers: { 'If-Match': '"' + generateIdentifier() + '"' },
    }));
    assertStrictEquals(put.status, 404);
    await put.body?.cancel();
    const foreignPath = await handleRequest(db, req(
        'GET', aiPath(STARK, id), wayne,
    ));
    assertStrictEquals(foreignPath.status, 403);
    await foreignPath.body?.cancel();
});

Deno.test('the global ai-agents routes are gone',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const [method, path, body] of [
        ['GET', '/ai-agents/', undefined],
        ['GET', '/ai-agents/' + id, undefined],
        ['PUT', '/ai-agents/' + id, agentFields('Global')],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, DEV_TOKEN, body,
        ));
        assertStrictEquals(res.status, 404, method + path);
        await res.body?.cancel();
    }
});

// Only the members statement creates an AI, so the PUT is
// class B: it rewrites a live head or nothing (RFC 6585 §3;
// RFC 9110 §13.2.1).
Deno.test('an AI PUT with no precondition is 428',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PUT', aiPath(STARK, generateIdentifier()), DEV_TOKEN,
        agentFields('Unconditional'),
    ));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
});

Deno.test('an AI PUT never creates', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const headers of [
        { 'If-None-Match': '*' },
        { 'If-Match': '"' + generateIdentifier() + '"' },
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: aiPath(STARK, id),
            token: DEV_TOKEN,
            body: agentFields('Absent agent'),
            headers,
        }));
        assertStrictEquals(res.status, 404);
        assertEquals(await res.json(), {
            error: 'Not found: ai-agents/' + id,
        });
    }
    assertStrictEquals(
        await db.messagePairs.getHeadPair(aiPath(STARK), id),
        null,
    );
});

Deno.test('an AI PUT rewrites the four fields; GET'
+ ' returns them', async () => {
    const db = await freshDb();
    const seatedModel = [...getModelsByProvider().values()]
        .flat()[1]!;
    assert(seatedModel.id !== firstProviderModel().id);
    await postMember(db, {
        id: 'UuvoBhQJUSEsiJwscXPkUg',
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: { ...agentFields('Seated agent'), model: seatedModel.id },
    });
    const head = await handleRequest(db, req(
        'GET', aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg'), DEV_TOKEN,
    ));
    assertStrictEquals(head.status, 200);
    await head.body?.cancel();
    const etag = head.headers.get('ETag');
    assert(etag !== null);
    const body = {
        ...agentFields('Drafting agent'),
        description: 'A rewritten agent',
        skill_focus: 'routing',
    };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg'),
        token: DEV_TOKEN,
        body,
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(put.status, 200);
    const written = await put.json() as {
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    };
    assertStrictEquals(written.id, 'UuvoBhQJUSEsiJwscXPkUg');
    assertStrictEquals(written.name, body.name);
    assertStrictEquals(written.description, body.description);
    assertStrictEquals(written.skill_focus, body.skill_focus);
    assertStrictEquals(written.model, body.model);
    const got = (await GET<{
        id: string;
        name: string;
        description: string;
        skill_focus: string;
        model: string;
    }>(db, aiPath(STARK, 'UuvoBhQJUSEsiJwscXPkUg').slice(1), DEV_TOKEN,
        operationIdHeader())).body().toValue();
    assertEquals(got, written);
});

Deno.test('a flow write with an AI member id in memberIds'
+ ' is 400', async () => {
    const db = await freshDb();
    const agentId = generateIdentifier();
    await postMember(db, {
        id: agentId,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: {
            name: 'Bot',
            description: '',
            skill_focus: '',
            model: firstProviderModel().id,
        },
    });
    const token = await organizationToken();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aMyiZpZbsEboXnIrwnEjNA',
        token,
        body: flowDocument(
            'Blocked',
            generateIdentifier(),
            {
                nodes: [graphNode([agentId])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
});

Deno.test('a flow write with agentIds naming a live'
+ ' AI agent is 201 or 200', async () => {
    const db = await freshDb();
    await postMember(db, {
        id: 'UxpkDaNMmbWLvCTkyrFfGA',
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Live agent'),
    });
    const token = await organizationToken();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + 'aJJKPwIzmbFseMhGUrFyFQ',
        token,
        body: flowDocument(
            'With agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], ['UxpkDaNMmbWLvCTkyrFfGA'])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assert(
        res.status === 201 || res.status === 200,
        'expected 201 or 200, got ' + res.status,
    );
    const flow = (await GET<{
        graph: {
            nodes: { agentIds?: string[] }[];
        };
    }>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
        + 'aJJKPwIzmbFseMhGUrFyFQ', token, operationIdHeader()))
        .body().toValue();
    const node = flow.graph.nodes[0]!;
    assertEquals(node.agentIds, ['UxpkDaNMmbWLvCTkyrFfGA']);
});

// The statement's answer names the membership head its
// removal latches.
async function postMember(
    db: MemoryDbAdapter,
    body: Record<string, unknown>,
): Promise<string> {
    const response = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/memberships/',
        token: await organizationToken(),
        body,
    }));
    assertStrictEquals(response.status, 201);
    await response.body?.cancel();
    const etag = response.headers.get('ETag');
    assert(etag !== null);
    return etag;
}

// An AI is live while its membership is accepted. Removal
// is one membership write: the document stays, the AI
// leaves agentIds, and its id stays refused in memberIds.
Deno.test('a flow write naming a removed AI member in'
+ ' agentIds is 400', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const etag = await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Removed agent'),
    });
    const removed = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/invitations/'
            + membershipNameOf(STARK, id),
        token: await organizationToken(),
        body: { state: 'removed', at: REMOVED_AT },
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/'
            + generateIdentifier(),
        token: await organizationToken(),
        body: flowDocument(
            'Removed agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], [id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    await res.body?.cancel();
    const got = await handleRequest(db, req(
        'GET', aiPath(STARK, id), DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    await got.body?.cancel();
});

Deno.test('a flow write naming a removed AI member in'
+ ' memberIds is 400', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const etag = await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Removed agent'),
    });
    const removed = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/invitations/'
            + membershipNameOf(STARK, id),
        token: await organizationToken(),
        body: { state: 'removed', at: REMOVED_AT },
        headers: { 'If-Match': etag },
    }));
    assertStrictEquals(removed.status, 200);
    await removed.body?.cancel();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/'
            + generateIdentifier(),
        token: await organizationToken(),
        body: flowDocument(
            'Removed member',
            generateIdentifier(),
            {
                nodes: [graphNode([id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    assertStrictEquals(res.status, 400);
    assertEquals(await res.json(), {
        error: 'memberIds may name person identities only,'
            + ' not AI agents or services',
    });
});

// A memory backend that fires one armed hook right after a
// standalone read of `organization`'s memberships answers,
// alone or in a head batch: the window a law read outside
// its write's transaction leaves open. Keyed on the
// organization half alone, so a read of the caller's own
// membership, by name or by identity, passes untouched. A
// transaction's head batches fire nothing; it counts them.
function membershipReadHooked(organization: string): {
    readonly backend: StorageBackend;
    readonly arm: (hook: () => Promise<void>) => void;
    readonly take: () => (() => Promise<void>) | undefined;
    readonly transactionBatches: () => number;
} {
    const inner = new MemoryStorageBackend();
    let armed: (() => Promise<void>) | undefined;
    let batches = 0;
    const take = () => {
        const hook = armed;
        armed = undefined;
        return hook;
    };
    const organizationRead = (
        path: string,
        contains: Readonly<Record<string, string>>,
    ): boolean => path === MEMBERSHIPS_PATH
        && Object.keys(contains).length === 1
        && contains['organization_id'] === organization;
    const hooked = (tx: Tx): Tx => ({
        ...tx,
        getCollectionHeadPairsContaining: async <
            T extends { id: string },
        >(
            path: string,
            contains: Readonly<Record<string, string>>,
        ): Promise<T[]> => {
            const heads = await tx
                .getCollectionHeadPairsContaining<T>(
                    path, contains,
                );
            const hook = organizationRead(path, contains)
                ? take()
                : undefined;
            if (hook !== undefined) await hook();
            return heads;
        },
        getCollectionHeadPairsBatch: async <
            T extends { id: string },
        >(reads: readonly CollectionHeadRead[]): Promise<T[][]> => {
            const answers = await tx
                .getCollectionHeadPairsBatch<T>(reads);
            const hook = reads.some((read) => 'contains' in read
                && organizationRead(read.path, read.contains))
                ? take()
                : undefined;
            if (hook !== undefined) await hook();
            return answers;
        },
    });
    const counted = (tx: Tx): Tx => ({
        ...tx,
        getCollectionHeadPairsBatch: <T extends { id: string }>(
            reads: readonly CollectionHeadRead[],
        ): Promise<T[][]> => {
            batches += 1;
            return tx.getCollectionHeadPairsBatch<T>(reads);
        },
    });
    const backend: StorageBackend = {
        read: (fn) => inner.read((tx) => fn(hooked(tx))),
        transaction: (mode, fn) => inner.transaction(
            mode, (tx) => fn(counted(tx)),
        ),
        seedTransaction: (fn) => inner.seedTransaction(fn),
        ensureTable: () => inner.ensureTable(),
        executeLedger: (attempt, rows, now, tx) =>
            inner.executeLedger(attempt, rows, now, tx),
        hasSchema: () => inner.hasSchema(),
        postSchemaCreation: () => inner.postSchemaCreation(),
        deleteSchema: () => inner.deleteSchema(),
    };
    return {
        backend,
        arm: (hook) => {
            armed = hook;
        },
        take,
        transactionBatches: () => batches,
    };
}

// The law's reads share the write's transaction, so a
// removal cannot land between the law and the write: the
// PUT is refused, or its flow head precedes the removal.
Deno.test('a flow PUT reads its agents in the transaction'
+ ' it writes in', async () => {
    const hooked = membershipReadHooked(STARK);
    const db = new BackedDbAdapter(
        hooked.backend,
        async () => {},
        async () => {},
        () => {},
    );
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const etag = await postMember(db, {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Raced agent'),
    });
    const token = await organizationToken();
    const membership = membershipNameOf(STARK, id);
    const removal = async () => {
        const removed = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/organizations/' + STARK + '/invitations/'
                + membership,
            token,
            body: { state: 'removed', at: REMOVED_AT },
            headers: { 'If-Match': etag },
        }));
        assertStrictEquals(removed.status, 200);
        await removed.body?.cancel();
    };
    hooked.arm(removal);
    const flowId = generateIdentifier();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/organizations/' + STARK + '/flows/' + flowId,
        token,
        body: flowDocument(
            'Raced agent',
            generateIdentifier(),
            {
                nodes: [graphNode([], [id])],
                edges: [],
            },
        ),
        headers: { 'if-none-match': '*' },
    }));
    await res.body?.cancel();
    // Unfired, the removal follows the PUT, as it would
    // had it arrived after the write.
    await hooked.take()?.();
    const rows = await db.messagePairs.getAll();
    const flowAt = rows.findIndex((row) =>
        row.path === canonicalPath(STARK, '/flows/')
        && row.name === flowId);
    const removalAt = rows.findLastIndex((row) =>
        row.path === MEMBERSHIPS_PATH
        && row.name === membership
        && row.method === 'PUT');
    assert(
        res.status === 400
            || (flowAt >= 0 && flowAt < removalAt),
        'flow PUT answered ' + res.status + ' and landed at '
            + flowAt + ', after the removal at ' + removalAt,
    );
});

// A create body whose one node seats `memberId`: a create
// graph carries no agentIds, so its law reads only whether
// a memberIds entry names a program.
function flowCreateBody(flowId: string, memberId: string) {
    const nodeId = generateIdentifier();
    return {
        id: flowId,
        flow: {
            name: 'Raced create',
            is_locked: false,
            is_auto_layout: false,
            is_auto_fit: false,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId: generateIdentifier(),
        projectFlow: {
            project_id: 'pnXmXrxOWayANgDLdCjuBw',
            flow_id: flowId,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: AT,
        graphDelta: {
            ...emptyDelta(),
            nodes: [{
                id: nodeId,
                flow_id: flowId,
                name: 'Step',
                position_x: 0,
                position_y: 0,
                is_create: true,
                is_archive: false,
                task_instructions: '',
                at: AT,
            }],
            memberEvents: [{
                id: generateIdentifier(),
                flow_node_id: nodeId,
                member_id: memberId,
                action: 'added',
                at: AT,
            }],
        },
    };
}

// The create's law reads share its write's transaction, so
// an AI made in that window cannot slip into memberIds: the
// POST is refused, or its flow head precedes the AI.
Deno.test('a flow create reads its programs in the'
+ ' transaction it writes in', async () => {
    const hooked = membershipReadHooked(STARK);
    const db = new BackedDbAdapter(
        hooked.backend,
        async () => {},
        async () => {},
        () => {},
    );
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const creation = async () => {
        await postMember(db, {
            id,
            kind: 'ai',
            membership: { type: 'member', at: AT },
            ai: agentFields('Raced program'),
        });
    };
    hooked.arm(creation);
    const flowId = generateIdentifier();
    const res = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/flows/',
        token: await organizationToken(),
        body: flowCreateBody(flowId, id),
    }));
    await res.body?.cancel();
    // Unfired, the AI follows the POST, as it would had it
    // arrived after the write.
    await hooked.take()?.();
    const rows = await db.messagePairs.getAll();
    const flowAt = rows.findIndex((row) =>
        row.path === canonicalPath(STARK, '/flows/')
        && row.name === flowId);
    const programAt = rows.findIndex((row) =>
        row.path === canonicalPath(STARK, '/ai-agents/')
        && row.name === id);
    assert(
        res.status === 400
            || (flowAt >= 0 && flowAt < programAt),
        'flow POST answered ' + res.status + ' and landed at '
            + flowAt + ', after the AI at ' + programAt,
    );
});

// A hooked memory db holding one AI member. A lawless graph
// seats that AI in memberIds; batches counts the roster
// reads the law runs in a write's transaction.
async function flowLawFixture(): Promise<{
    readonly put: (
        flowId: string,
        nodes: unknown[],
        headers: Record<string, string>,
    ) => Promise<Response>;
    readonly lawless: () => unknown[];
    readonly batches: () => number;
}> {
    const hooked = membershipReadHooked(STARK);
    const db = new BackedDbAdapter(
        hooked.backend,
        async () => {},
        async () => {},
        () => {},
    );
    await seedAdminSchema(db);
    const token = await organizationToken();
    const agentId = generateIdentifier();
    await postMember(db, {
        id: agentId,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: agentFields('Lawless agent'),
    });
    return {
        put: (flowId, nodes, headers) => handleRequest(
            db,
            apiRequest({
                method: 'PUT',
                path: '/organizations/' + STARK + '/flows/'
                    + flowId,
                token,
                body: flowDocument(
                    'Flow', generateIdentifier(), {
                        nodes,
                        edges: [],
                    },
                ),
                headers,
            }),
        ),
        lawless: () => [graphNode([agentId])],
        batches: hooked.transactionBatches,
    };
}

async function etagOf(
    response: Response,
    status: number,
): Promise<string> {
    assertStrictEquals(response.status, status);
    await response.body?.cancel();
    const etag = response.headers.get('ETag');
    assert(etag !== null);
    return etag;
}

// Preconditions come before the content (RFC 9110 §13.2.2):
// a latch the head refuses answers 412 whatever the graph
// says, and the law's roster read never runs for it.
Deno.test('a stale flow PUT answers 412 before the'
+ ' law', async () => {
    const fixture = await flowLawFixture();
    const flowId = generateIdentifier();
    const old = await etagOf(await fixture.put(
        flowId, [], { 'if-none-match': '*' },
    ), 201);
    await etagOf(await fixture.put(
        flowId, [], { 'If-Match': old },
    ), 200);
    const before = fixture.batches();
    const stale = await fixture.put(
        flowId, fixture.lawless(), { 'If-Match': old },
    );
    await stale.body?.cancel();
    assertStrictEquals(stale.status, 412);
    assertStrictEquals(fixture.batches(), before);
});

Deno.test('a flow PUT latching a flow never written'
+ ' answers 412 before the law', async () => {
    const fixture = await flowLawFixture();
    const before = fixture.batches();
    const absent = await fixture.put(
        generateIdentifier(),
        fixture.lawless(),
        { 'If-Match': '"' + generateIdentifier() + '"' },
    );
    await absent.body?.cancel();
    assertStrictEquals(absent.status, 412);
    assertStrictEquals(fixture.batches(), before);
});

Deno.test('a flow genesis over a live flow answers 412'
+ ' before the law', async () => {
    const fixture = await flowLawFixture();
    const flowId = generateIdentifier();
    await etagOf(await fixture.put(
        flowId, [], { 'if-none-match': '*' },
    ), 201);
    const before = fixture.batches();
    const genesis = await fixture.put(
        flowId, fixture.lawless(), { 'if-none-match': '*' },
    );
    await genesis.body?.cancel();
    assertStrictEquals(genesis.status, 412);
    assertStrictEquals(fixture.batches(), before);
});

// The skip's other side: a latch naming the live head
// lands, so the law runs once and refuses the graph.
Deno.test('a current flow PUT still answers the'
+ ' law', async () => {
    const fixture = await flowLawFixture();
    const flowId = generateIdentifier();
    const live = await etagOf(await fixture.put(
        flowId, [], { 'if-none-match': '*' },
    ), 201);
    const before = fixture.batches();
    const current = await fixture.put(
        flowId, fixture.lawless(), { 'If-Match': live },
    );
    assertStrictEquals(current.status, 400);
    assertEquals(await current.json(), {
        error: 'memberIds may name person identities only,'
            + ' not AI agents or services',
    });
    assertStrictEquals(fixture.batches(), before + 1);
});

// postFlowDocumentOp skips the law for an If-None-Match: *
// PUT over a PUT head, a verdict that stays stale only while
// no DELETE can land at a flow. A flow DELETE breaks this
// pin: revisit that skip before landing one.
Deno.test('a flow takes no DELETE, which the'
+ ' If-None-Match: * skip relies on', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const path = '/organizations/' + STARK + '/flows/'
        + generateIdentifier();
    const live = await etagOf(await handleRequest(db, apiRequest({
        method: 'PUT',
        path,
        token,
        body: flowDocument('Flow', generateIdentifier(), {
            nodes: [],
            edges: [],
        }),
        headers: { 'if-none-match': '*' },
    })), 201);
    const deleted = await handleRequest(db, apiRequest({
        method: 'DELETE',
        path,
        token,
        headers: { 'If-Match': live },
    }));
    await deleted.body?.cancel();
    assertStrictEquals(deleted.status, 405);
});
