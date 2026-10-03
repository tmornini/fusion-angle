import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { DEV_TOKEN, organizationToken } from
    './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    ORGANIZATION_TWO,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../shared/types.ts';
import {
    attemptFor,
    formWriteMessagePair,
    parseIfMatch,
    runWrite,
} from '../api/message-pair.ts';
import { sharedMockDb } from './mock-seed.ts';
import {
    apiRequest,
    messageOfResponse,
    pairIdOf,
    partBodiesOf,
    partsOf,
} from './http-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

// GET <family>/:id/versions/ — Phase A3 of states-URI
// elimination. Per family (ideas, projects, records,
// flows, objectives): document-PUT lifecycle → 200 DESC
// current-first; foreign miss at this document → 404;
// absent → 404. Shared handler builder wraps
// derive*StateHistory (ASC) with DESC + missedReadError.
// Product versions live under organizations/:id/.

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        ...(headers !== undefined ? { headers } : {}),
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// -- Ideas --------------------------------------------------

function ideaBody(title: string, state: string) {
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

async function seedIdeaLifecycle(
    db: MemoryDbAdapter,
    id: string,
    token: string,
): Promise<void> {
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
            token,
            ideaBody('Hist Idea', 'active'),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
            token,
            ideaBody('Hist Idea', 'in_review'),
        ),
    );
    assertStrictEquals(t.status, 200);
}

function versionOf(res: Response): string {
    const tag = parseIfMatch(res.headers.get('ETag') ?? '');
    assert(tag !== undefined, 'PUT must advertise ETag');
    return tag;
}

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ 200 oldest'
    + ' first; /history 404; /versions/:etag serves that'
    + ' revision',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const genesis = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
                DEV_TOKEN,
                ideaBody('Hist Idea', 'active'),
            ),
        );
        assertStrictEquals(genesis.status, 201);
        const xDyDkxEPwtcNmJVknUHDsg = versionOf(genesis);
        const later = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
                DEV_TOKEN,
                ideaBody('Hist Idea Revised', 'in_review'),
            ),
        );
        assertStrictEquals(later.status, 200);
        const v2 = versionOf(later);
        assertNotStrictEquals(xDyDkxEPwtcNmJVknUHDsg, v2);

        const index = await handleRequest(
            db,
            req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id +
                '/versions/', DEV_TOKEN),
        );
        assertStrictEquals(index.status, 200);
        const parts = await partsOf<{
            id: string;
            title: string;
            state: string;
        }>(index);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[1]!.body().toValue();
        assertStrictEquals(oldest.id, id);
        assertStrictEquals(oldest.title, 'Hist Idea');
        assertStrictEquals(oldest.state, 'active');
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.title, 'Hist Idea Revised');
        assertStrictEquals(current.state, 'in_review');
        assertStrictEquals('state_at' in oldest, false);
        assertStrictEquals(
            parts[0]!.query('header.etag').toText()
                .slice(1, -1),
            xDyDkxEPwtcNmJVknUHDsg,
        );
        assertStrictEquals(
            parts[1]!.query('header.etag').toText()
                .slice(1, -1),
            v2,
        );

        const retired = await handleRequest(
            db,
            req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id +
                '/history', DEV_TOKEN),
        );
        assertStrictEquals(retired.status, 404);

        for (const part of parts) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(
                db,
                req(
                    'GET',
                    '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                        + id + '/versions/' + tag,
                    DEV_TOKEN,
                ),
            );
            assertStrictEquals(item.status, 200);
            assertStrictEquals(versionOf(item), tag);
            const served = await messageOfResponse(item);
            const body = served.body().toValue() as {
                id: string;
                title: string;
                state: string;
            };
            if (tag === xDyDkxEPwtcNmJVknUHDsg) {
                assertStrictEquals(body.id, id);
                assertStrictEquals(body.title, 'Hist Idea');
                assertStrictEquals(body.state, 'active');
            } else {
                assertStrictEquals(
                    body.title, 'Hist Idea Revised',
                );
                assertStrictEquals(body.state, 'in_review');
            }
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ 200'
    + ' oldest first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedIdeaLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id +
                '/versions/', DEV_TOKEN),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            id: string;
            state: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[1]!.body().toValue();
        assertStrictEquals(oldest.id, id);
        assertStrictEquals(oldest.state, 'active');
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.state, 'in_review');
        assertStrictEquals('state_at' in oldest, false);
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ foreign'
    + ' → 404 at this document',
    async () => {
        const db = await sharedMockDb();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/ideas/',
                await organizationToken(
                    'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
                ),
            ),
        );
        assertStrictEquals(list.status, 200);
        const foreign =
            (await partBodiesOf<{ id: string }>(list))[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + foreign.id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: ideas/' + foreign.id,
        );
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ absent → 404',
    async () => {
        const db = await freshDb();
        const missing = generateIdentifier();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + missing
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: ideas/' + missing,
        );
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ is 200',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedIdeaLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + STARK_ORGANIZATION
                    + '/ideas/' + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            id: string;
            state: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const current = parts[parts.length - 1]!
            .body().toValue();
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.state, 'in_review');
    },
);

// -- Projects -----------------------------------------------

function projectBody(title: string, state: string) {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-04-01',
        target_end_date: '2026-07-01',
        estimated_cost: 100,
        actual_cost: 0,
        position: 1,
        state,
    };
}

async function seedProjectLifecycle(
    db: MemoryDbAdapter,
    id: string,
    token: string,
): Promise<void> {
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id,
            token,
            projectBody('Hist Project', 'submitted'),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id,
            token,
            projectBody('Hist Project', 'under_review'),
        ),
    );
    assertStrictEquals(t.status, 200);
}

Deno.test(
    'GET organizations/:id/projects/:id/versions/ 200'
    + ' oldest first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedProjectLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            id: string;
            state: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[1]!.body().toValue();
        assertStrictEquals(oldest.id, id);
        assertStrictEquals(oldest.state, 'submitted');
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.state, 'under_review');
        assertStrictEquals('state_at' in oldest, false);
    },
);

Deno.test(
    'GET organizations/:id/projects/:id/versions/ each'
    + ' part equals the item its etag serves',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedProjectLifecycle(db, id, DEV_TOKEN);
        const index = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(index.status, 200);
        const parts = await partsOf(index);
        assertStrictEquals(parts.length, 2);
        for (const part of parts) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(
                db,
                req(
                    'GET',
                    '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                        + id + '/versions/' + tag,
                    DEV_TOKEN,
                ),
            );
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

Deno.test(
    'GET organizations/:id/projects/:id/versions/ of a'
    + ' state-deleted project is Gone',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const created = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + id,
                DEV_TOKEN,
                projectBody('Gone Project', 'submitted'),
            ),
        );
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        const tombstone = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + id,
                DEV_TOKEN,
                projectBody('Gone Project', 'deleted'),
            ),
        );
        assertStrictEquals(tombstone.status, 200);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: projects/' + id,
        });
        const item = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + id + '/versions/' + tag,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: projects/' + id,
        });
    },
);

Deno.test(
    'GET organizations/:id/projects/:id/versions foreign'
    + ' → 404 at this document',
    async () => {
        const db = await sharedMockDb();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/projects/',
                await organizationToken(
                    'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
                ),
            ),
        );
        assertStrictEquals(list.status, 200);
        const foreign =
            (await partBodiesOf<{ id: string }>(list))[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: projects/' + foreign.id,
        );
    },
);

Deno.test(
    'GET organizations/:id/projects/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = generateIdentifier();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + missing
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: projects/' + missing,
        );
    },
);

// -- Records ------------------------------------------------

function recordBody(name: string, state: string) {
    return {
        name,
        description: 'd',
        position: 1,
        state,
    };
}

async function seedRecordLifecycle(
    db: MemoryDbAdapter,
    id: string,
    token: string,
): Promise<void> {
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/' + id,
            token,
            recordBody('Hist Record', 'active'),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/' + id,
            token,
            recordBody('Hist Record', 'archived'),
        ),
    );
    assertStrictEquals(t.status, 200);
}

Deno.test(
    'GET nested record-types/:id/versions: 200 oldest'
    + ' first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedRecordLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            id: string;
            state: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[parts.length - 1]!
            .body().toValue();
        assertStrictEquals(oldest.id, id);
        assertStrictEquals(oldest.state, 'active');
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.state, 'archived');
        assertStrictEquals('state_at' in current, false);
    },
);

Deno.test(
    'GET nested record-types/:id/versions/ each'
    + ' part equals the item its etag serves',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedRecordLifecycle(db, id, DEV_TOKEN);
        const index = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(index.status, 200);
        const parts = await partsOf(index);
        assertStrictEquals(parts.length, 2);
        for (const part of parts) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(
                db,
                req(
                    'GET',
                    '/organizations/AjdvjuECVZEgZoFajaIEkg'
                        + '/record-types/' + id
                        + '/versions/' + tag,
                    DEV_TOKEN,
                ),
            );
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

Deno.test(
    'GET nested record-types/:id/versions/ of a'
    + ' deleted record type is Gone',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const created = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id,
                DEV_TOKEN,
                recordBody('Gone Record', 'active'),
            ),
        );
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        const removed = await handleRequest(
            db,
            req(
                'DELETE',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(removed.status, 204);
        await removed.body?.cancel();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: record_types/' + id,
        });
        const item = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + id + '/versions/' + tag,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: record_types/' + id,
        });
    },
);

Deno.test(
    'GET nested record-types/:id/versions foreign → 404',
    async () => {
        const db = await sharedMockDb();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/record-types/',
                await organizationToken(
                    'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
                ),
            ),
        );
        assertStrictEquals(list.status, 200);
        const foreign =
            (await partBodiesOf<{ id: string }>(list))[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: record_types/' + foreign.id,
        );
    },
);

Deno.test(
    'GET nested record-types/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = generateIdentifier();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/'
                    + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: record_types/' + missing,
        );
    },
);

// -- Flows (conditional required) --------------------------

function flowDocBody(
    name: string,
    state: string,
    stateAt: string,
    stateEventId: string,
) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
        graph: { nodes: [], edges: [] },
        revivals: [],
        graphDelta: {
            nodes: [],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
    };
}

async function seedFlowLifecycle(
    db: MemoryDbAdapter,
    id: string,
    token: string,
): Promise<{ ev1: string; ev2: string }> {
    const ev1 = generateIdentifier();
    const ev2 = generateIdentifier();
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'active',
                '2026-03-01T00:00:00.000000Z',
                ev1,
            ),
            { 'if-none-match': '*' },
        ),
    );
    assertStrictEquals(g.status, 201);
    const headId = pairIdOf(g);
    assert(headId !== null);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'updated',
                '2026-03-02T00:00:00.000000Z',
                ev2,
            ),
            { 'if-match': (
                await handleRequest(
                    db,
                    req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                        + '' + id, token),
                )
            ).headers.get('ETag')! },
        ),
    );
    assertStrictEquals(t.status, 200);
    return { ev1, ev2 };
}

function flowEtagOf(
    part: { query(path: string): { toText(): string } },
): string {
    return part.query('header.etag').toText().slice(1, -1);
}

Deno.test(
    'GET organizations/:id/flows/:id/versions/'
    + ' 200 oldest first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const { ev1, ev2 } = await seedFlowLifecycle(
            db, id, DEV_TOKEN,
        );
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            state: string;
            state_event_id: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[1]!.body().toValue();
        assertStrictEquals(oldest.state_event_id, ev1);
        assertStrictEquals(oldest.state, 'active');
        assertStrictEquals(current.state_event_id, ev2);
        assertStrictEquals(current.state, 'updated');
    },
);

Deno.test(
    'GET flows/:id/versions/ etag is the pair id,'
    + ' not version',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const genesis = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + id,
                DEV_TOKEN,
                flowDocBody(
                    'Hist Flow',
                    'active',
                    '2026-03-01T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                { 'if-none-match': '*' },
            ),
        );
        assertStrictEquals(genesis.status, 201);
        const pairId = versionOf(genesis);
        assertStrictEquals(isIdentifier(pairId), true);

        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            state: string;
            state_event_id: string;
        }>(res);
        assertStrictEquals(parts.length, 1);
        const body = parts[0]!.body().toValue();
        assertStrictEquals(flowEtagOf(parts[0]!), pairId);
        assertStrictEquals(
            isIdentifier(flowEtagOf(parts[0]!)),
            true,
        );
        assertStrictEquals('version' in body, false);
        assertStrictEquals(body.state, 'active');
    },
);

Deno.test(
    'GET flows/:id/versions/ A→B→A has three etags',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const path =
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + id;
        const first = await handleRequest(
            db,
            req(
                'PUT',
                path,
                DEV_TOKEN,
                flowDocBody(
                    'Hist Flow',
                    'active',
                    '2026-03-01T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                { 'if-none-match': '*' },
            ),
        );
        assertStrictEquals(first.status, 201);
        const etagA = versionOf(first);
        const second = await handleRequest(
            db,
            req(
                'PUT',
                path,
                DEV_TOKEN,
                flowDocBody(
                    'Hist Flow',
                    'updated',
                    '2026-03-02T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                { 'if-match': first.headers.get('ETag')! },
            ),
        );
        assertStrictEquals(second.status, 200);
        const etagB = versionOf(second);
        const third = await handleRequest(
            db,
            req(
                'PUT',
                path,
                DEV_TOKEN,
                flowDocBody(
                    'Hist Flow',
                    'active',
                    '2026-03-03T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                { 'if-match': second.headers.get('ETag')! },
            ),
        );
        assertStrictEquals(third.status, 200);
        const etagA2 = versionOf(third);
        assertNotStrictEquals(etagA, etagB);
        assertNotStrictEquals(etagB, etagA2);
        assertNotStrictEquals(etagA, etagA2);

        const res = await handleRequest(
            db,
            req(
                'GET',
                path + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf(res);
        assertStrictEquals(parts.length, 3);
        const etags = parts.map((part) => flowEtagOf(part));
        assertEquals(etags, [etagA, etagB, etagA2]);
        assertStrictEquals(new Set(etags).size, 3);
        for (const etag of etags) {
            assertStrictEquals(isIdentifier(etag), true);
        }
        const body = parts[0]!.body().toValue() as
            Record<string, unknown>;
        assertStrictEquals('version' in body, false);
    },
);

Deno.test(
    'GET organizations/:id/flows/:id/versions/ each'
    + ' part equals the item its etag serves',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedFlowLifecycle(db, id, DEV_TOKEN);
        const index = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(index.status, 200);
        const parts = await partsOf(index);
        assertStrictEquals(parts.length, 2);
        for (const part of parts) {
            const tag = flowEtagOf(part);
            const item = await handleRequest(
                db,
                req(
                    'GET',
                    '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                        + id + '/versions/' + tag,
                    DEV_TOKEN,
                ),
            );
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

Deno.test(
    'GET organizations/:id/flows/:id/versions/ of a'
    + ' state-deleted flow is Gone',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const path =
            '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
            + id;
        const created = await handleRequest(
            db,
            req(
                'PUT',
                path,
                DEV_TOKEN,
                flowDocBody(
                    'Gone Flow',
                    'active',
                    '2026-03-01T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                { 'if-none-match': '*' },
            ),
        );
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        const removed = await handleRequest(
            db,
            req(
                'PUT',
                path,
                DEV_TOKEN,
                flowDocBody(
                    'Gone Flow',
                    'deleted',
                    '2026-03-02T00:00:00.000000Z',
                    generateIdentifier(),
                ),
                {
                    'if-match': created.headers.get('ETag')!,
                },
            ),
        );
        assertStrictEquals(removed.status, 200);
        await removed.body?.cancel();
        const list = await handleRequest(
            db,
            req('GET', path + '/versions/', DEV_TOKEN),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: flows/' + id,
        });
        const item = await handleRequest(
            db,
            req(
                'GET',
                path + '/versions/' + tag,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: flows/' + id,
        });
    },
);

Deno.test(
    'GET organizations/:id/flows/:id/versions foreign'
    + ' → 404 at this document',
    async () => {
        const db = await sharedMockDb();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/flows/',
                await organizationToken(
                    'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
                ),
            ),
        );
        assertStrictEquals(list.status, 200);
        const foreign =
            (await partBodiesOf<{ id: string }>(list))[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + foreign.id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: flows/' + foreign.id,
        );
    },
);

Deno.test(
    'GET organizations/:id/flows/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = generateIdentifier();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + missing
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: flows/' + missing,
        );
    },
);

// -- Objectives ---------------------------------------------

function objectiveBody(state: string) {
    return {
        position: 1,
        state,
    };
}

async function seedObjectiveLifecycle(
    db: MemoryDbAdapter,
    id: string,
    token: string,
): Promise<void> {
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id,
            token,
            objectiveBody('active'),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id,
            token,
            objectiveBody('archived'),
        ),
    );
    assertStrictEquals(t.status, 200);
}

Deno.test(
    'GET organizations/:id/objectives/:id/versions/'
    + ' 200 oldest first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedObjectiveLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const parts = await partsOf<{
            id: string;
            state: string;
        }>(res);
        assertStrictEquals(parts.length, 2);
        const oldest = parts[0]!.body().toValue();
        const current = parts[1]!.body().toValue();
        assertStrictEquals(oldest.id, id);
        assertStrictEquals(oldest.state, 'active');
        assertStrictEquals(current.id, id);
        assertStrictEquals(current.state, 'archived');
        assertStrictEquals('state_at' in current, false);
        const oldestTag = parts[0]!.query('header.etag')
            .toText().slice(1, -1);
        const currentTag = parts[1]!.query('header.etag')
            .toText().slice(1, -1);
        assertStrictEquals(typeof currentTag, 'string');
        assertNotStrictEquals(currentTag, '');
        assertNotStrictEquals(currentTag, oldestTag);
        const oldestAt = parts[0]!.query(
            'header.response-at',
        ).toText();
        const currentAt = parts[1]!.query(
            'header.response-at',
        ).toText();
        assert(currentAt > oldestAt);
        const oldestMember = parts[0]!.query(
            'header.requester-identity-id',
        ).toText();
        const currentMember = parts[1]!.query(
            'header.requester-identity-id',
        ).toText();
        assertStrictEquals(typeof currentMember, 'string');
        assertNotStrictEquals(currentMember, '');
        assertStrictEquals(currentMember, oldestMember);
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions/ each'
    + ' part equals the item its etag serves',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedObjectiveLifecycle(db, id, DEV_TOKEN);
        const index = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(index.status, 200);
        const parts = await partsOf(index);
        assertStrictEquals(parts.length, 2);
        for (const part of parts) {
            const tag = part.query('header.etag').toText()
                .slice(1, -1);
            const item = await handleRequest(
                db,
                req(
                    'GET',
                    '/organizations/AjdvjuECVZEgZoFajaIEkg'
                        + '/objectives/' + id + '/versions/'
                        + tag,
                    DEV_TOKEN,
                ),
            );
            assertStrictEquals(item.status, 200);
            const served = await messageOfResponse(item);
            assertStrictEquals(
                served.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
                part.withFieldDeleted('date')
                    .withFieldDeleted('request-id')
                    .toWire(),
            );
        }
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions/ of'
    + ' a state-deleted objective is Gone',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const created = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id,
                DEV_TOKEN,
                objectiveBody('active'),
            ),
        );
        assertStrictEquals(created.status, 201);
        const tag = pairIdOf(created);
        assert(tag !== null);
        // The objective alphabet admits no deleted, so the
        // state-deleted head is formed below the facade.
        const deletedBody = {
            position: 1,
            state: 'deleted',
        };
        const messagePair = await formWriteMessagePair({
            method: 'PUT',
            pathname:
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id,
            routePattern: 'organizations/:id/objectives/:id',
            routeSegments: [
                'organizations', ':id', 'objectives', ':id',
            ],
            pathSegments: [
                'organizations', 'AjdvjuECVZEgZoFajaIEkg',
                'objectives', id,
            ],
            headerFields: [],
            body: deletedBody,
            requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
            requestAt: nowUtc(),
            organization: 'AjdvjuECVZEgZoFajaIEkg',
            responseBody: { id, ...deletedBody },
            operationId: generateIdentifier(),
            requestId: generateIdentifier(),
        });
        await runWrite(
            db, attemptFor([messagePair]), [messagePair],
        );
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(list.status, 410);
        assertEquals(await list.json(), {
            error: 'Gone: objectives/' + id,
        });
        const item = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + id + '/versions/' + tag,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(item.status, 410);
        assertEquals(await item.json(), {
            error: 'Gone: objectives/' + id,
        });
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions foreign'
    + ' → 404 at this document',
    async () => {
        const db = await sharedMockDb();
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + ORGANIZATION_TWO
                    + '/objectives/',
                await organizationToken(
                    'XXZruirZyAOoRpNxaDnpSA', ORGANIZATION_TWO,
                ),
            ),
        );
        assertStrictEquals(list.status, 200);
        const foreign =
            (await partBodiesOf<{ id: string }>(list))[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: objectives/' + foreign.id,
        );
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = generateIdentifier();
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/'
                    + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 404);
        const body = await res.json() as { error: string };
        assertStrictEquals(
            body.error,
            'Not found: objectives/' + missing,
        );
    },
);
