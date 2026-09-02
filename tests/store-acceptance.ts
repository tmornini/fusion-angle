import { assert, assertStrictEquals } from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';

// Parameterized store acceptance. ./test-postgres will
// invoke this factory; the memory runner keeps ./validate
// covering the cases without Postgres.

const AT = '2026-01-01T00:00:00.000000Z';
const IDEA_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FLOW_PREFIX = '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/';

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
    headers?: Readonly<Record<string, string>>,
    operationId?: string,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        ...(headers !== undefined
            ? { headers } : {}),
        operationId: operationId ?? TEST_OPERATION_ID,
    });
}

function ideaDocument(
    title: string,
    _stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
}

function projectDocument(
    title: string,
    _stateEventId: string,
): Record<string, unknown> {
    return {
        title,
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-06-01',
        estimated_cost: 1000,
        actual_cost: 0,
        position: 1,
        state: 'submitted',
    };
}

function emptyDelta(): Record<string, unknown> {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

function flowFields(name: string): Record<string, unknown> {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
    };
}

function flowCreate(id: string): Record<string, unknown> {
    return {
        id,
        flow: flowFields('Acceptance'),
        projectFlowId: generateIdentifier(),
        projectFlow: {
            project_id: generateIdentifier(),
            flow_id: id,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: generateIdentifier(),
        initialStateAt: AT,
        graphDelta: emptyDelta(),
    };
}

function flowDocument(
    name: string,
    stateEventId: string,
): Record<string, unknown> {
    return {
        ...flowFields(name),
        state: 'updated',
        state_at: AT,
        state_event_id: stateEventId,
        graph: { nodes: [], edges: [] },
        graphDelta: emptyDelta(),
        revivals: [],
    };
}

async function messagePairsAt(
    db: DbAdapter,
    collection: string,
    uriId: string,
): Promise<number> {
    const rows = await db.messagePairs.getAllWhere(
        'uri_collection', collection,
    );
    return rows.filter((row) => row.uri_id === uriId)
        .length;
}

export function defineStoreAcceptance(
    name: string,
    open: () => Promise<DbAdapter>,
): void {
    async function ready(): Promise<{
        readonly db: DbAdapter;
        readonly token: string;
    }> {
        const db = await open();
        await seedAdminSchema(db);
        return { db, token: await organizationToken() };
    }

    Deno.test(name + ': get live PUT', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tcoFxeBipRIaYftXqNfjIg', token,
            ideaDocument('Live', 'ev-sa-live'),
        ));
        assertStrictEquals(put.status, 201);
        const putEtag = put.headers.get('ETag');
        assert(putEtag !== null && putEtag !== '');
        const got = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tcoFxeBipRIaYftXqNfjIg', token),
        );
        assertStrictEquals(got.status, 200);
        assertStrictEquals(got.headers.get('ETag'), putEtag);
        const body = await got.json() as { title: string };
        assertStrictEquals(body.title, 'Live');
    });

    Deno.test(name + ': DELETE head is gone', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                + 'tOGidMXUNrBnbXkIQWSpag', token,
            { type: 'member', at: '2026-01-01T00:00:00.000000Z' },
        ));
        assertStrictEquals(put.status, 201);
        const del = await handleRequest(
            db, req(
                'DELETE',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                    + 'tOGidMXUNrBnbXkIQWSpag',
                token,
            ),
        );
        assertStrictEquals(del.status, 204);
        const got = await handleRequest(
            db, req(
                'GET',
                '/organizations/AjdvjuECVZEgZoFajaIEkg/members/'
                    + 'tOGidMXUNrBnbXkIQWSpag',
                token,
            ),
        );
        assertStrictEquals(got.status, 404);
    });

    Deno.test(name + ': same-body PUT is 200', async () => {
        const { db, token } = await ready();
        const body = ideaDocument('Same', 'ev-sa-same');
        const first = await handleRequest(
            db, req('PUT'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tlQsXUYcTRtLtuHsWqBJBQ', token, body),
        );
        assertStrictEquals(first.status, 201);
        const firstEtag = first.headers.get('ETag');
        assertStrictEquals(
            await messagePairsAt(db, IDEA_PREFIX, 'tlQsXUYcTRtLtuHsWqBJBQ'),
            1,
        );
        const second = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tlQsXUYcTRtLtuHsWqBJBQ', token, body,
            undefined, generateIdentifier(),
        ));
        assertStrictEquals(second.status, 200);
        assertStrictEquals(second.headers.get('ETag'), firstEtag);
        assertStrictEquals(
            await messagePairsAt(db, IDEA_PREFIX, 'tlQsXUYcTRtLtuHsWqBJBQ'),
            1,
        );
    });

    Deno.test(name + ': exact retry keeps status', async () => {
        const { db, token } = await ready();
        const body = ideaDocument('Retry', 'ev-sa-retry');
        const first = await handleRequest(
            db, req('PUT'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tjrZLujBtBVqFwOsBDWdQQ', token, body),
        );
        assertStrictEquals(first.status, 201);
        const firstId = first.headers.get('Response-ID');
        const firstOp = first.headers.get('Operation-ID');
        const firstBytes = await first.text();
        const second = await handleRequest(
            db, req('PUT'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tjrZLujBtBVqFwOsBDWdQQ', token, body),
        );
        assertStrictEquals(second.status, 201);
        assertStrictEquals(
            second.headers.get('Operation-ID'), firstOp,
        );
        assertStrictEquals(
            second.headers.get('Response-ID'), firstId,
        );
        assertStrictEquals(await second.text(), firstBytes);
        assertStrictEquals(
            await messagePairsAt(db, IDEA_PREFIX, 'tjrZLujBtBVqFwOsBDWdQQ'),
            1,
        );
    });

    Deno.test(name + ': address miss is 404', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'tiYxjzuiloksGbOADnuMWA', token,
            projectDocument('Other', 'ev-sa-miss'),
        ));
        assertStrictEquals(put.status, 201);
        const got = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tiYxjzuiloksGbOADnuMWA', token),
        );
        assertStrictEquals(got.status, 404);
    });

    Deno.test(name + ': If-Match stale is 412', async () => {
        const { db, token } = await ready();
        const created = await handleRequest(db, req(
            'POST', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/', token
                , flowCreate('tYhGBKEoBjBYeqTcJWMNVQ'),
        ));
        assertStrictEquals(created.status, 201);
        const live = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'tYhGBKEoBjBYeqTcJWMNVQ', token),
        );
        assertStrictEquals(live.status, 200);
        const liveEtag = live.headers.get('ETag');
        const liveBody = await live.json() as {
            name: string;
        };
        assertStrictEquals(liveBody.name, 'Acceptance');
        const before = await messagePairsAt(
            db, FLOW_PREFIX, 'tYhGBKEoBjBYeqTcJWMNVQ',
        );
        const stale = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'tYhGBKEoBjBYeqTcJWMNVQ', token,
            flowDocument('Stale', generateIdentifier()),
            { 'if-match': '"' + generateIdentifier() + '"' },
        ));
        assertStrictEquals(stale.status, 412);
        assertStrictEquals(
            await messagePairsAt(db, FLOW_PREFIX, 'tYhGBKEoBjBYeqTcJWMNVQ'),
            before,
        );
        const again = await handleRequest(
            db, req('GET'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/flows/'
                + 'tYhGBKEoBjBYeqTcJWMNVQ', token),
        );
        assertStrictEquals(again.status, 200);
        assertStrictEquals(again.headers.get('ETag'), liveEtag);
        const againBody = await again.json() as {
            name: string;
        };
        assertStrictEquals(againBody.name, liveBody.name);
    });
}
