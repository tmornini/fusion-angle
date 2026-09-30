import {
    assert, assertEquals, assertStrictEquals,
} from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { messageStore } from '../api/message-store.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    pairIdOf,
} from './http-fixtures.ts';
import {
    compareIdentifiers, generateIdentifier,
} from '../shared/identifier.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../shared/types.ts';
import type { MessagePairEntity } from '../shared/types.ts';
import { ledgerFields } from './ledger-row.ts';

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
        ...(operationId !== undefined ? { operationId } : {}),
    });
}

function ideaDocument(title: string): Record<string, unknown> {
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

function projectDocument(title: string): Record<string, unknown> {
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
    name: string,
): Promise<number> {
    const rows = await db.messagePairs.getCollectionPairs(collection,
    );
    return rows.filter((row) => row.name === name)
        .length;
}

const ORDER_PATH = '/order-pin/';
const ORDER_REQUESTER = 'XXZruirZyAOoRpNxaDnpSA';
const ORDER_OPERATION = '0123456789ABCDEFGHIJKw';

function orderRow(
    id: string,
    name: string,
    responseAt: string,
    n: number,
): Promise<Omit<MessagePairEntity, 'id'>> {
    return ledgerFields({
        id,
        path: ORDER_PATH,
        name,
        requester_identity_id: ORDER_REQUESTER,
        method: 'PUT',
        response_at: responseAt,
        request: 'PUT ' + ORDER_PATH + name
            + ' HTTP/1.1\r\n'
            + 'x-n: ' + String(n) + '\r\n\r\n',
        response: 'HTTP/1.1 200 OK\r\n\r\n',
        operation_id: ORDER_OPERATION,
        // Distinct supersedes: one PUT or DELETE per
        // (path, name, supersedes).
        supersedes: id,
    });
}

const HEAD_PATH = '/head-pin/';

function pairRow(
    id: string,
    path: string,
    name: string,
    method: string,
    responseAt: string,
    n: number,
    supersedes?: string,
): Promise<Omit<MessagePairEntity, 'id'>> {
    return ledgerFields({
        id,
        path,
        name,
        requester_identity_id: ORDER_REQUESTER,
        method,
        response_at: responseAt,
        request: method + ' ' + path + name
            + ' HTTP/1.1\r\n'
            + 'x-n: ' + String(n) + '\r\n\r\n',
        response: 'HTTP/1.1 200 OK\r\n\r\n',
        operation_id: ORDER_OPERATION,
        // Distinct supersedes: one PUT or DELETE per
        // (path, name, supersedes).
        supersedes: supersedes ?? id,
    });
}

function stamp(k: number): string {
    return '2026-01-01T00:00:00.00000' + String(k) + 'Z';
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
            ideaDocument('Live'),
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
        const body = ideaDocument('Same');
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

    Deno.test(name + ': exact retry replays as 200', async () => {
        const { db, token } = await ready();
        const body = ideaDocument('Retry');
        const operationId = generateIdentifier();
        const first = await handleRequest(
            db, req('PUT'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tjrZLujBtBVqFwOsBDWdQQ', token, body,
                undefined, operationId),
        );
        assertStrictEquals(first.status, 201);
        const firstId = pairIdOf(first);
        const firstOp = first.headers.get('Operation-ID');
        const firstBytes = await first.text();
        const second = await handleRequest(
            db, req('PUT'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tjrZLujBtBVqFwOsBDWdQQ', token, body,
                undefined, operationId),
        );
        assertStrictEquals(second.status, 200);
        assertStrictEquals(
            second.headers.get('Operation-ID'), firstOp,
        );
        assertStrictEquals(
            pairIdOf(second), firstId,
        );
        assertStrictEquals(await second.text(), firstBytes);
        assertStrictEquals(
            await messagePairsAt(db, IDEA_PREFIX, 'tjrZLujBtBVqFwOsBDWdQQ'),
            1,
        );
    });

    Deno.test(name + ': a write carries the stored etag',
    async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'tWirePinAAAAAAAAAAAAAw', token,
            ideaDocument('Wire'),
        ));
        assertStrictEquals(put.status, 201);
        const etag = put.headers.get('ETag');
        assert(etag !== null && etag.startsWith('"'));
        assertStrictEquals(
            put.headers.get('Response-ID'), null,
        );
        const stored = await db.messagePairs.getById(
            etag.slice(1, -1),
        );
        if (stored === undefined) {
            throw new Error('stored pair missing');
        }
        assertStrictEquals(
            stored.response.includes('etag: ' + etag),
            true,
        );
    });

    Deno.test(name + ': document miss is 404', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'tiYxjzuiloksGbOADnuMWA', token,
            projectDocument('Other'),
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

    Deno.test(name + ': seam reads are (response_at, id)'
    + ' order', async () => {
        const { db } = await ready();
        const sorted = [
            generateIdentifier(),
            generateIdentifier(),
            generateIdentifier(),
        ].sort(compareIdentifiers);
        const first = sorted[0]!;
        const second = sorted[1]!;
        const third = sorted[2]!;
        const early = '2026-01-01T00:00:00.000001Z';
        const late = '2026-01-01T00:00:00.000002Z';
        // Appended newest-first, so insertion order
        // disagrees with the promised order on every row.
        await db.messagePairs.append(
            third, await orderRow(third, 'doc', late, 3),
        );
        await db.messagePairs.append(
            second, await orderRow(second, 'doc', early, 2),
        );
        await db.messagePairs.append(
            first, await orderRow(first, 'doc', early, 1),
        );
        const history = await db.messagePairs
            .getDocumentHistory(ORDER_PATH, 'doc');
        assertEquals(
            history.map((row) => row.id),
            [first, second, third],
        );
        const collection = await db.messagePairs
            .getCollectionPairs(ORDER_PATH);
        assertEquals(
            collection.map((row) => row.id),
            [first, second, third],
        );
    });

    Deno.test(name + ': collection head pairs are the live'
    + ' PUT heads in (response_at, id) order', async () => {
        const { db } = await ready();
        const revised1 = generateIdentifier();
        const revised2 = generateIdentifier();
        const deleted1 = generateIdentifier();
        const deleted2 = generateIdentifier();
        const posted1 = generateIdentifier();
        const posted2 = generateIdentifier();
        const posted3 = generateIdentifier();
        const untouched = generateIdentifier();
        const operated = generateIdentifier();
        const rows: [string, string, string, number][] = [
            [revised1, 'revised', 'PUT', 1],
            [deleted1, 'deleted', 'PUT', 2],
            [revised2, 'revised', 'PUT', 3],
            [deleted2, 'deleted', 'DELETE', 4],
            [posted1, 'posted', 'PUT', 5],
            [posted2, 'posted', 'POST', 6],
            [posted3, 'posted', 'PATCH', 7],
            [untouched, 'untouched', 'PUT', 8],
            [operated, 'operated', 'POST', 9],
        ];
        for (const [id, docName, method, k] of rows) {
            await db.messagePairs.append(
                id,
                await pairRow(
                    id, HEAD_PATH, docName, method, stamp(k), k,
                ),
            );
        }
        const heads = await db.messagePairs
            .getCollectionHeadPairs(HEAD_PATH);
        assertEquals(
            heads.map((row) => row.id),
            [revised2, posted1, untouched],
        );
        assertEquals(
            heads.map((row) => row.name),
            ['revised', 'posted', 'untouched'],
        );
        assert(heads.every((row) => row.method === 'PUT'));
    });

    Deno.test(name + ': head pair is the latest PUT or'
    + ' DELETE; POST and PATCH never displace it', async () => {
        const { db } = await ready();
        const put1 = generateIdentifier();
        const put2 = generateIdentifier();
        const post = generateIdentifier();
        const patch = generateIdentifier();
        const del = generateIdentifier();
        await db.messagePairs.append(
            put1,
            await pairRow(
                put1, HEAD_PATH, 'doc', 'PUT', stamp(1), 1,
            ),
        );
        assertStrictEquals(
            (await db.messagePairs.getHeadPair(HEAD_PATH, 'doc'))
                ?.id,
            put1,
        );
        await db.messagePairs.append(
            put2,
            await pairRow(
                put2, HEAD_PATH, 'doc', 'PUT', stamp(2), 2,
            ),
        );
        await db.messagePairs.append(
            post,
            await pairRow(
                post, HEAD_PATH, 'doc', 'POST', stamp(3), 3,
            ),
        );
        await db.messagePairs.append(
            patch,
            await pairRow(
                patch, HEAD_PATH, 'doc', 'PATCH', stamp(4), 4,
            ),
        );
        const afterOps = await db.messagePairs.getHeadPair(
            HEAD_PATH, 'doc',
        );
        assertStrictEquals(afterOps?.id, put2);
        assertStrictEquals(afterOps?.method, 'PUT');
        assertEquals(
            await db.messagePairs.getHead(HEAD_PATH, 'doc'),
            { id: put2, method: 'PUT' },
        );
        await db.messagePairs.append(
            del,
            await pairRow(
                del, HEAD_PATH, 'doc', 'DELETE', stamp(5), 5,
            ),
        );
        const afterDelete = await db.messagePairs.getHeadPair(
            HEAD_PATH, 'doc',
        );
        assertStrictEquals(afterDelete?.id, del);
        assertStrictEquals(afterDelete?.method, 'DELETE');
        assertStrictEquals(
            await messageStore(db).getDocumentHead(HEAD_PATH, 'doc'),
            null,
        );
        assertStrictEquals(
            await db.messagePairs.getHeadPair(HEAD_PATH, 'nothing'),
            null,
        );
        assertStrictEquals(
            await db.messagePairs.getHead(HEAD_PATH, 'nothing'),
            null,
        );
    });

    Deno.test(name + ': a second append of an id changes'
    + ' nothing and says so', async () => {
        const { db } = await ready();
        const id = generateIdentifier();
        const first = await pairRow(
            id, HEAD_PATH, 'once', 'PUT', stamp(1), 1,
        );
        // A different predecessor so only the primary
        // key conflicts. ON CONFLICT (id) does not
        // cover the succession index.
        const second = await pairRow(
            id, HEAD_PATH, 'once', 'PUT', stamp(2), 2,
            generateIdentifier(),
        );
        assertStrictEquals(
            await db.messagePairs.append(id, first), true,
        );
        assertStrictEquals(
            await db.messagePairs.append(id, second), false,
        );
        assertEquals(
            await db.messagePairs.getById(id),
            { id, ...first },
        );
    });

    Deno.test(name + ': padded stamps round-trip byte for'
    + ' byte', async () => {
        const { db } = await ready();
        const id = generateIdentifier();
        const row = await pairRow(
            id, HEAD_PATH, 'stamp', 'PUT',
            '2026-03-04T05:06:07.100000Z', 1,
        );
        await db.messagePairs.append(id, row);
        const stored = await db.messagePairs.getById(id);
        assertStrictEquals(
            stored.response_at,
            '2026-03-04T05:06:07.100000Z',
        );
    });
}
