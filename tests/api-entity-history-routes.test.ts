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
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';
import { parseIfMatch } from '../api/message-pair.ts';
import { sharedMockDb } from './mock-seed.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

// GET <family>/:id/versions/ — Phase A3 of states-URI
// elimination. Per trio family (ideas, projects, records,
// flows, objectives): document-PUT lifecycle → 200 DESC
// current-first; foreign miss at this address → 404;
// absent → 404. Shared handler builder wraps
// derive*StateHistory (ASC) with DESC + missedReadError.
// Product versions live under organizations/:id/.

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
    etag?: string;
}

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
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

function assertDesc(rows: HistoryEvent[]): void {
    for (let i = 1; i < rows.length; i++) {
        const prev = rows[i - 1]!;
        const cur = rows[i]!;
        const ordered =
            prev.at > cur.at
            || (prev.at === cur.at && prev.id > cur.id);
        assert(
            ordered,
            'history must be (at, id) DESC',
        );
    }
}

// -- Ideas --------------------------------------------------

function ideaBody(
    title: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
) {
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
            ideaBody(
                'Hist Idea',
                'active',
                '2026-03-01T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
            token,
            ideaBody(
                'Hist Idea',
                'in_review',
                '2026-03-02T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(t.status, 201);
}

function versionOf(res: Response): string {
    const tag = parseIfMatch(res.headers.get('ETag') ?? '');
    assert(tag !== undefined, 'PUT must advertise ETag');
    return tag;
}

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ 200 DESC; /history 404; '
    + '/versions/:etag serves that revision',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        const genesis = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id,
                DEV_TOKEN,
                ideaBody(
                    'Hist Idea',
                    'active',
                    '2026-03-01T00:00:00.000000Z',
                    generateIdentifier(),
                ),
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
                ideaBody(
                    'Hist Idea Revised',
                    'in_review',
                    '2026-03-02T00:00:00.000000Z',
                    generateIdentifier(),
                ),
            ),
        );
        assertStrictEquals(later.status, 201);
        const v2 = versionOf(later);
        assertNotStrictEquals(xDyDkxEPwtcNmJVknUHDsg, v2);

        const index = await handleRequest(
            db,
            req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id +
                '/versions/', DEV_TOKEN),
        );
        assertStrictEquals(index.status, 200);
        const rows = await index.json() as {
            id: string;
            title: string;
            state: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.title, 'Hist Idea Revised');
        assertStrictEquals(rows[0]!.state, 'in_review');
        assertStrictEquals(rows[1]!.id, id);
        assertStrictEquals(rows[1]!.title, 'Hist Idea');
        assertStrictEquals(rows[1]!.state, 'active');
        assertStrictEquals('state_at' in rows[0]!, false);

        const retired = await handleRequest(
            db,
            req('GET', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id +
                '/history', DEV_TOKEN),
        );
        assertStrictEquals(retired.status, 404);

        const first = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id
                    + '/versions/' + xDyDkxEPwtcNmJVknUHDsg,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(first.status, 200);
        const firstBody = await first.json() as {
            id: string;
            title: string;
            state: string;
        };
        assertStrictEquals(firstBody.id, id);
        assertStrictEquals(firstBody.title, 'Hist Idea');
        assertStrictEquals(firstBody.state, 'active');
        assertStrictEquals(versionOf(first), xDyDkxEPwtcNmJVknUHDsg);

        const second = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id
                    + '/versions/' + v2,
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(second.status, 200);
        const secondBody = await second.json() as {
            id: string;
            title: string;
            state: string;
        };
        assertStrictEquals(secondBody.title, 'Hist Idea Revised');
        assertStrictEquals(secondBody.state, 'in_review');
        assertStrictEquals(versionOf(second), v2);
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/: 200 DESC current-first',
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
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'in_review');
        assertStrictEquals(rows[1]!.id, id);
        assertStrictEquals(rows[1]!.state, 'active');
        assertStrictEquals('state_at' in rows[0]!, false);
    },
);

Deno.test(
    'GET organizations/:id/ideas/:id/versions/ foreign'
    + ' → 404 at this address',
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
            (await list.json() as { id: string }[])[0]!;
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
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'in_review');
    },
);

// -- Projects -----------------------------------------------

function projectBody(
    title: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
) {
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
            projectBody(
                'Hist Project',
                'submitted',
                '2026-03-01T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/' + id,
            token,
            projectBody(
                'Hist Project',
                'under_review',
                '2026-03-02T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(t.status, 201);
}

Deno.test(
    'GET organizations/:id/projects/:id/versions: 200 DESC current-first',
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
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'under_review');
        assertStrictEquals(rows[1]!.id, id);
        assertStrictEquals(rows[1]!.state, 'submitted');
        assertStrictEquals('state_at' in rows[0]!, false);
    },
);

Deno.test(
    'GET organizations/:id/projects/:id/versions foreign'
    + ' → 404 at this address',
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
            (await list.json() as { id: string }[])[0]!;
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

function recordBody(
    name: string,
    state: string,
    _stateAt: string,
    _stateEventId: string,
) {
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
            recordBody(
                'Hist Record',
                'active',
                '2026-03-01T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/' + id,
            token,
            recordBody(
                'Hist Record',
                'archived',
                '2026-03-02T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(t.status, 201);
}

Deno.test(
    'GET nested record-types/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedRecordLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/record-types/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'archived');
        assertStrictEquals(rows[1]!.id, id);
        assertStrictEquals(rows[1]!.state, 'active');
        assertStrictEquals('state_at' in rows[0]!, false);
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
            (await list.json() as { id: string }[])[0]!;
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

// -- Flows (locked concurrency) -----------------------------

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
        ),
    );
    assertStrictEquals(g.status, 201);
    const headId = g.headers.get('Response-ID');
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
    assertStrictEquals(t.status, 201);
    return { ev1, ev2 };
}

Deno.test(
    'GET organizations/:id/flows/:id/versions: 200 DESC current-first',
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
                '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, ev2);
        assertStrictEquals(rows[0]!.state, 'updated');
        assertStrictEquals(rows[1]!.id, ev1);
        assertStrictEquals(rows[1]!.state, 'active');
        assertDesc(rows);
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
        const rows = await res.json() as HistoryEvent[];
        assertStrictEquals(rows.length, 1);
        assertStrictEquals(rows[0]!.etag, pairId);
        assertStrictEquals(
            isIdentifier(rows[0]!.etag ?? ''),
            true,
        );
        assertStrictEquals('version' in rows[0]!, false);
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
        assertStrictEquals(second.status, 201);
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
        assertStrictEquals(third.status, 201);
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
        const rows = await res.json() as HistoryEvent[];
        assertStrictEquals(rows.length, 3);
        const etags = rows.map((row) => row.etag);
        assertEquals(etags, [etagA2, etagB, etagA]);
        assertStrictEquals(new Set(etags).size, 3);
        for (const etag of etags) {
            assertStrictEquals(isIdentifier(etag ?? ''), true);
        }
        assertStrictEquals('version' in rows[0]!, false);
    },
);

Deno.test(
    'GET organizations/:id/flows/:id/versions foreign'
    + ' → 404 at this address',
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
            (await list.json() as { id: string }[])[0]!;
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

function objectiveBody(
    state: string,
    _stateAt: string,
    _stateEventId: string,
) {
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
            objectiveBody(
                'active',
                '2026-03-01T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id,
            token,
            objectiveBody(
                'archived',
                '2026-03-02T00:00:00.000000Z',
                generateIdentifier(),
            ),
        ),
    );
    assertStrictEquals(t.status, 201);
}

Deno.test(
    'GET organizations/:id/objectives/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = generateIdentifier();
        await seedObjectiveLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/objectives/' + id
                    + '/versions/',
                DEV_TOKEN,
            ),
        );
        assertStrictEquals(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
            etag: string;
            at: string;
            member_id: string;
        }[];
        assertStrictEquals(rows.length, 2);
        assertStrictEquals(rows[0]!.id, id);
        assertStrictEquals(rows[0]!.state, 'archived');
        assertStrictEquals(rows[1]!.id, id);
        assertStrictEquals(rows[1]!.state, 'active');
        assertStrictEquals('state_at' in rows[0]!, false);
        assertStrictEquals(typeof rows[0]!.etag, 'string');
        assertNotStrictEquals(rows[0]!.etag, '');
        assertNotStrictEquals(
            rows[0]!.etag, rows[1]!.etag,
        );
        assert(rows[0]!.at > rows[1]!.at);
        assertStrictEquals(typeof rows[0]!.member_id, 'string');
        assertNotStrictEquals(rows[0]!.member_id, '');
        assertStrictEquals(
            rows[0]!.member_id, rows[1]!.member_id,
        );
    },
);

Deno.test(
    'GET organizations/:id/objectives/:id/versions foreign'
    + ' → 404 at this address',
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
            (await list.json() as { id: string }[])[0]!;
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
