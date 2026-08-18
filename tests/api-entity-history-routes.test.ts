import { test } from 'node:test';
import assert from 'node:assert/strict';
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

// GET <family>/:id/versions/ — Phase A3 of states-URI
// elimination. Per trio family (ideas, projects, records,
// flows, objectives): document-PUT lifecycle → 200 DESC
// current-first; foreign miss at this address → 404;
// absent → 404. Shared handler builder wraps
// derive*StateHistory (ASC) with DESC + missedReadError.
// Product versions live under organizations/:id/.

const BASE = 'http://localhost';

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
    version?: string;
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
        token,
        body,
        headers,
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
        assert.ok(
            ordered,
            'history must be (at, id) DESC',
        );
    }
}

// -- Ideas --------------------------------------------------

function ideaBody(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
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
            '/organizations/1/ideas/' + id,
            token,
            ideaBody(
                'Hist Idea',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/ideas/' + id,
            token,
            ideaBody(
                'Hist Idea',
                'in_review',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 201);
}

function versionOf(res: Response): string {
    const tag = parseIfMatch(res.headers.get('ETag') ?? '');
    assert.ok(tag !== undefined, 'PUT must advertise ETag');
    return tag;
}

test(
    'GET organizations/:id/ideas/:id/versions/ 200 DESC; /history 404; '
    + '/versions/:etag serves that revision',
    async () => {
        const db = await freshDb();
        const id = 'idea-versions-1';
        const genesis = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/1/ideas/' + id,
                DEV_TOKEN,
                ideaBody(
                    'Hist Idea',
                    'active',
                    '2026-03-01T00:00:00.000000Z',
                    id + '-ev1',
                ),
            ),
        );
        assert.equal(genesis.status, 201);
        const v1 = versionOf(genesis);
        const later = await handleRequest(
            db,
            req(
                'PUT',
                '/organizations/1/ideas/' + id,
                DEV_TOKEN,
                ideaBody(
                    'Hist Idea Revised',
                    'in_review',
                    '2026-03-02T00:00:00.000000Z',
                    id + '-ev2',
                ),
            ),
        );
        assert.equal(later.status, 201);
        const v2 = versionOf(later);
        assert.notEqual(v1, v2);

        const index = await handleRequest(
            db,
            req('GET', '/organizations/1/ideas/' + id +
                '/versions/', DEV_TOKEN),
        );
        assert.equal(index.status, 200);
        const rows = await index.json() as {
            id: string;
            title: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.title, 'Hist Idea Revised');
        assert.equal(rows[0]!.state, 'in_review');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.title, 'Hist Idea');
        assert.equal(rows[1]!.state, 'active');
        assert.equal('state_at' in rows[0]!, false);

        const retired = await handleRequest(
            db,
            req('GET', '/organizations/1/ideas/' + id +
                '/history', DEV_TOKEN),
        );
        assert.equal(retired.status, 404);

        const first = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/ideas/' + id + '/versions/' + v1,
                DEV_TOKEN,
            ),
        );
        assert.equal(first.status, 200);
        const firstBody = await first.json() as {
            id: string;
            title: string;
            state: string;
        };
        assert.equal(firstBody.id, id);
        assert.equal(firstBody.title, 'Hist Idea');
        assert.equal(firstBody.state, 'active');
        assert.equal(versionOf(first), v1);

        const second = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/ideas/' + id + '/versions/' + v2,
                DEV_TOKEN,
            ),
        );
        assert.equal(second.status, 200);
        const secondBody = await second.json() as {
            id: string;
            title: string;
            state: string;
        };
        assert.equal(secondBody.title, 'Hist Idea Revised');
        assert.equal(secondBody.state, 'in_review');
        assert.equal(versionOf(second), v2);
    },
);

test(
    'GET organizations/:id/ideas/:id/versions/: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'idea-hist-1';
        await seedIdeaLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req('GET', '/organizations/1/ideas/' + id +
                '/versions/', DEV_TOKEN),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'in_review');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.state, 'active');
        assert.equal('state_at' in rows[0]!, false);
    },
);

test(
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
                    'current', ORGANIZATION_TWO,
                ),
            ),
        );
        assert.equal(list.status, 200);
        const foreign =
            (await list.json() as { id: string }[])[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/ideas/' + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: ideas/' + foreign.id,
        );
        assert.equal(
            STARK_ORGANIZATION !== ORGANIZATION_TWO,
            true,
        );
    },
);

test(
    'GET organizations/:id/ideas/:id/versions/ absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-idea';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/ideas/' + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: ideas/' + missing,
        );
    },
);

test(
    'GET organizations/:id/ideas/:id/versions/ is 200',
    async () => {
        const db = await freshDb();
        const id = 'idea-hist-facade';
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
        assert.equal(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'in_review');
    },
);

// -- Projects -----------------------------------------------

function projectBody(
    title: string,
    state: string,
    stateAt: string,
    stateEventId: string,
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
            '/organizations/1/projects/' + id,
            token,
            projectBody(
                'Hist Project',
                'submitted',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/projects/' + id,
            token,
            projectBody(
                'Hist Project',
                'under_review',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 201);
}

test(
    'GET organizations/:id/projects/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'project-hist-1';
        await seedProjectLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/projects/' + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'under_review');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.state, 'submitted');
        assert.equal('state_at' in rows[0]!, false);
    },
);

test(
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
                    'current', ORGANIZATION_TWO,
                ),
            ),
        );
        assert.equal(list.status, 200);
        const foreign =
            (await list.json() as { id: string }[])[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/projects/' + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: projects/' + foreign.id,
        );
    },
);

test(
    'GET organizations/:id/projects/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-project';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/projects/' + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: projects/' + missing,
        );
    },
);

// -- Records ------------------------------------------------

function recordBody(
    name: string,
    state: string,
    stateAt: string,
    stateEventId: string,
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
            '/organizations/1/record-types/' + id,
            token,
            recordBody(
                'Hist Record',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/record-types/' + id,
            token,
            recordBody(
                'Hist Record',
                'archived',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 201);
}

test(
    'GET nested record-types/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'record-hist-1';
        await seedRecordLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/record-types/' + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.state, 'active');
        assert.equal('state_at' in rows[0]!, false);
    },
);

test(
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
                    'current', ORGANIZATION_TWO,
                ),
            ),
        );
        assert.equal(list.status, 200);
        const foreign =
            (await list.json() as { id: string }[])[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/record-types/' + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: record_types/' + foreign.id,
        );
    },
);

test(
    'GET nested record-types/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-record';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/record-types/' + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
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
): Promise<void> {
    const g = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 201);
    const headId = g.headers.get('Response-ID');
    assert.ok(headId !== null);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'updated',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
            { 'if-match': (
                await handleRequest(
                    db,
                    req('GET', '/organizations/1/flows/' + id, token),
                )
            ).headers.get('ETag')! },
        ),
    );
    assert.equal(t.status, 201);
}

test(
    'GET organizations/:id/flows/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'flow-hist-1';
        await seedFlowLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/flows/' + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
        assert.equal(rows[0]!.state, 'updated');
        assert.equal(rows[1]!.id, id + '-ev1');
        assert.equal(rows[1]!.state, 'active');
        assertDesc(rows);
    },
);

test(
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
                    'current', ORGANIZATION_TWO,
                ),
            ),
        );
        assert.equal(list.status, 200);
        const foreign =
            (await list.json() as { id: string }[])[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/flows/' + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: flows/' + foreign.id,
        );
    },
);

test(
    'GET organizations/:id/flows/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-flow';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/flows/' + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: flows/' + missing,
        );
    },
);

// -- Objectives ---------------------------------------------

function objectiveBody(
    state: string,
    stateAt: string,
    stateEventId: string,
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
            '/organizations/1/objectives/' + id,
            token,
            objectiveBody(
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 201);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/organizations/1/objectives/' + id,
            token,
            objectiveBody(
                'archived',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 201);
}

test(
    'GET organizations/:id/objectives/:id/versions: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'objective-hist-1';
        await seedObjectiveLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/objectives/' + id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as {
            id: string;
            state: string;
        }[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id);
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[1]!.id, id);
        assert.equal(rows[1]!.state, 'active');
        assert.equal('state_at' in rows[0]!, false);
    },
);

test(
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
                    'current', ORGANIZATION_TWO,
                ),
            ),
        );
        assert.equal(list.status, 200);
        const foreign =
            (await list.json() as { id: string }[])[0]!;
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/objectives/' + foreign.id + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: objectives/' + foreign.id,
        );
    },
);

test(
    'GET organizations/:id/objectives/:id/versions absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-objective';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/1/objectives/' + missing + '/versions/',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: objectives/' + missing,
        );
    },
);
