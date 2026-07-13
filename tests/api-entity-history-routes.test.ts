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
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    ORGANIZATION_TWO,
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';

// GET <family>/:id/history — Phase A3 of states-URI
// elimination. Per trio family (ideas/projects/records/flows/
// objectives): document-PUT lifecycle → 200 DESC current-first;
// foreign → 403 honest family body; absent → 404. Shared
// handler builder wraps derive*StateHistory (ASC) with DESC +
// missedReadError. Org-nested facade rides free for one leg.

const BASE = 'http://localhost';

interface HistoryEvent {
    id: string;
    entity_id: string;
    state: string;
    member_id: string;
    at: string;
}

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Record<string, string>,
): Request {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(headers ?? {}),
    };
    if (token !== undefined) {
        h['Authorization'] = 'Bearer ' + token;
    }
    return new Request(`${BASE}${path}`, {
        method,
        headers: h,
        ...(body ? { body: JSON.stringify(body) } : {}),
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
        state_at: stateAt,
        state_event_id: stateEventId,
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
            '/ideas/' + id,
            token,
            ideaBody(
                'Hist Idea',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 200);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/ideas/' + id,
            token,
            ideaBody(
                'Hist Idea',
                'in_review',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 200);
}

test(
    'GET ideas/:id/history: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'idea-hist-1';
        await seedIdeaLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req('GET', '/ideas/' + id + '/history', DEV_TOKEN),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
        assert.equal(rows[0]!.state, 'in_review');
        assert.equal(rows[1]!.id, id + '-ev1');
        assert.equal(rows[1]!.state, 'active');
        for (const row of rows) {
            assert.equal(row.entity_id, id);
            assert.equal(row.member_id, 'current');
        }
        assertDesc(rows);
    },
);

test(
    'GET ideas/:id/history foreign → 403 honest body',
    async () => {
        const db = memoryDbAdapter();
        await postMockDataLoad(db);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/ideas',
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
                '/ideas/' + foreign.id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 403);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'forbidden: ideas/' + foreign.id
                + ' belongs to a different organization',
        );
        assert.equal(
            STARK_ORGANIZATION !== ORGANIZATION_TWO,
            true,
        );
    },
);

test(
    'GET ideas/:id/history absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-idea';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/ideas/' + missing + '/history',
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
    'org-nested facade /organizations/:org/ideas/:id/history'
    + ' rides free',
    async () => {
        const db = await freshDb();
        const id = 'idea-hist-facade';
        await seedIdeaLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/organizations/' + STARK_ORGANIZATION
                    + '/ideas/' + id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
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
        state_at: stateAt,
        state_event_id: stateEventId,
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
            '/projects/' + id,
            token,
            projectBody(
                'Hist Project',
                'submitted',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 200);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/projects/' + id,
            token,
            projectBody(
                'Hist Project',
                'under_review',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 200);
}

test(
    'GET projects/:id/history: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'project-hist-1';
        await seedProjectLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/projects/' + id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
        assert.equal(rows[0]!.state, 'under_review');
        assert.equal(rows[1]!.id, id + '-ev1');
        assert.equal(rows[1]!.state, 'submitted');
        assertDesc(rows);
    },
);

test(
    'GET projects/:id/history foreign → 403 honest body',
    async () => {
        const db = memoryDbAdapter();
        await postMockDataLoad(db);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/projects',
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
                '/projects/' + foreign.id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 403);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'forbidden: projects/' + foreign.id
                + ' belongs to a different organization',
        );
    },
);

test(
    'GET projects/:id/history absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-project';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/projects/' + missing + '/history',
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
        state_at: stateAt,
        state_event_id: stateEventId,
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
            '/records/' + id,
            token,
            recordBody(
                'Hist Record',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 200);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/records/' + id,
            token,
            recordBody(
                'Hist Record',
                'archived',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 200);
}

test(
    'GET records/:id/history: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'record-hist-1';
        await seedRecordLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/records/' + id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[1]!.id, id + '-ev1');
        assert.equal(rows[1]!.state, 'active');
        assertDesc(rows);
    },
);

test(
    'GET records/:id/history foreign → 403 honest body',
    async () => {
        const db = memoryDbAdapter();
        await postMockDataLoad(db);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/records',
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
                '/records/' + foreign.id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 403);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'forbidden: records/' + foreign.id
                + ' belongs to a different organization',
        );
    },
);

test(
    'GET records/:id/history absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-record';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/records/' + missing + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 404);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'Not found: records/' + missing,
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
        graph: JSON.stringify({ nodes: [], edges: [] }),
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
            '/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 200);
    const headId = g.headers.get('Response-ID');
    assert.ok(headId !== null);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/flows/' + id,
            token,
            flowDocBody(
                'Hist Flow',
                'updated',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
            { 'if-response-id': headId! },
        ),
    );
    assert.equal(t.status, 200);
}

test(
    'GET flows/:id/history: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'flow-hist-1';
        await seedFlowLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/flows/' + id + '/history',
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
    'GET flows/:id/history foreign → 403 honest body',
    async () => {
        const db = memoryDbAdapter();
        await postMockDataLoad(db);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/flows',
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
                '/flows/' + foreign.id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 403);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'forbidden: flows/' + foreign.id
                + ' belongs to a different organization',
        );
    },
);

test(
    'GET flows/:id/history absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-flow';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/flows/' + missing + '/history',
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
        state_at: stateAt,
        state_event_id: stateEventId,
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
            '/objectives/' + id,
            token,
            objectiveBody(
                'active',
                '2026-03-01T00:00:00.000000Z',
                id + '-ev1',
            ),
        ),
    );
    assert.equal(g.status, 200);
    const t = await handleRequest(
        db,
        req(
            'PUT',
            '/objectives/' + id,
            token,
            objectiveBody(
                'archived',
                '2026-03-02T00:00:00.000000Z',
                id + '-ev2',
            ),
        ),
    );
    assert.equal(t.status, 200);
}

test(
    'GET objectives/:id/history: 200 DESC current-first',
    async () => {
        const db = await freshDb();
        const id = 'objective-hist-1';
        await seedObjectiveLifecycle(db, id, DEV_TOKEN);
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/objectives/' + id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 200);
        const rows = await res.json() as HistoryEvent[];
        assert.equal(rows.length, 2);
        assert.equal(rows[0]!.id, id + '-ev2');
        assert.equal(rows[0]!.state, 'archived');
        assert.equal(rows[1]!.id, id + '-ev1');
        assert.equal(rows[1]!.state, 'active');
        assertDesc(rows);
    },
);

test(
    'GET objectives/:id/history foreign → 403 honest body',
    async () => {
        const db = memoryDbAdapter();
        await postMockDataLoad(db);
        const list = await handleRequest(
            db,
            req(
                'GET',
                '/objectives',
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
                '/objectives/' + foreign.id + '/history',
                DEV_TOKEN,
            ),
        );
        assert.equal(res.status, 403);
        const body = await res.json() as { error: string };
        assert.equal(
            body.error,
            'forbidden: objectives/' + foreign.id
                + ' belongs to a different organization',
        );
    },
);

test(
    'GET objectives/:id/history absent → 404',
    async () => {
        const db = await freshDb();
        const missing = 'no-such-objective';
        const res = await handleRequest(
            db,
            req(
                'GET',
                '/objectives/' + missing + '/history',
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
