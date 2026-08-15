import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { generateCryptoSafeBase62 } from
    '../shared/crypto-safe-base62.ts';
import { DEFAULT_LOCK_TIMEOUT } from '../api/types.ts';

// Parameterized store acceptance. ./test-postgres will
// invoke this factory; the memory runner keeps ./validate
// covering the cases without Postgres.

const AT = '2026-01-01T00:00:00.000000Z';
const IDEA_PREFIX = '/organizations/1/ideas/';
const FLOW_PREFIX = '/organizations/1/flows/';
const WIRE_REQUEST =
    'PUT /organizations/1/ideas/42 HTTP/1.1\r\n\r\n';

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
        token,
        body,
        headers,
        operationId: operationId ?? TEST_OPERATION_ID,
    });
}

function ideaDocument(
    title: string,
    stateEventId: string,
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
        state_at: AT,
        state_event_id: stateEventId,
    };
}

function membershipDocument(
    identityId: string,
): Record<string, unknown> {
    return {
        organization_id: '1',
        identity_id: identityId,
        type: 'member',
        at: AT,
    };
}

function projectDocument(
    title: string,
    stateEventId: string,
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
        state_at: AT,
        state_event_id: stateEventId,
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
        projectFlowId: id + '-pf',
        projectFlow: {
            project_id: 'sa-project',
            flow_id: id,
            at: AT,
        },
        initialState: 'active',
        initialStateEventId: id + '-ev',
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

function currentRequestRow(): Record<string, unknown> {
    return {
        id: 'rq1',
        uri_collection: '/organizations/1/ideas/',
        uri_id: '42',
        at: AT,
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: WIRE_REQUEST,
        method: 'PUT',
        operation_id: TEST_OPERATION_ID,
    };
}

function omit(
    row: Record<string, unknown>,
    key: string,
): Record<string, unknown> {
    const { [key]: _dropped, ...rest } = row;
    return rest;
}

function snapshotWithoutOperationId(): string {
    return JSON.stringify({
        requests: [
            omit(currentRequestRow(), 'operation_id'),
        ],
    });
}

function snapshotCanonicalJson(): string {
    return JSON.stringify({
        requests: [{
            ...currentRequestRow(),
            message: JSON.stringify({
                startLine: {
                    kind: 'request',
                    method: 'PUT',
                    target: '/organizations/1/ideas/42',
                    version: 'HTTP/1.1',
                },
            }),
        }],
    });
}

async function pairsAt(
    db: DbAdapter,
    collection: string,
    uriId: string,
): Promise<number> {
    const rows = await db.requests.getAllWhere(
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

    test(name + ': get live PUT', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/ideas/sa-live', token,
            ideaDocument('Live', 'ev-sa-live'),
        ));
        assert.equal(put.status, 201);
        const putEtag = put.headers.get('ETag');
        assert.ok(putEtag !== null && putEtag !== '');
        const got = await handleRequest(
            db, req('GET', '/ideas/sa-live', token),
        );
        assert.equal(got.status, 200);
        assert.equal(got.headers.get('ETag'), putEtag);
        const body = await got.json() as { title: string };
        assert.equal(body.title, 'Live');
    });

    test(name + ': DELETE head is gone', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/memberships/sa-del', token,
            membershipDocument('sa-del'),
        ));
        assert.equal(put.status, 201);
        const del = await handleRequest(
            db, req('DELETE', '/memberships/sa-del', token),
        );
        assert.equal(del.status, 204);
        const got = await handleRequest(
            db, req('GET', '/memberships/sa-del', token),
        );
        assert.equal(got.status, 404);
    });

    test(name + ': same-body PUT is 200', async () => {
        const { db, token } = await ready();
        const body = ideaDocument('Same', 'ev-sa-same');
        const first = await handleRequest(
            db, req('PUT', '/ideas/sa-same', token, body),
        );
        assert.equal(first.status, 201);
        const firstEtag = first.headers.get('ETag');
        assert.equal(
            await pairsAt(db, IDEA_PREFIX, 'sa-same'),
            1,
        );
        const second = await handleRequest(db, req(
            'PUT', '/ideas/sa-same', token, body,
            undefined, generateCryptoSafeBase62(),
        ));
        assert.equal(second.status, 200);
        assert.equal(second.headers.get('ETag'), firstEtag);
        assert.equal(
            await pairsAt(db, IDEA_PREFIX, 'sa-same'),
            1,
        );
    });

    test(name + ': exact retry keeps status', async () => {
        const { db, token } = await ready();
        const body = ideaDocument('Retry', 'ev-sa-retry');
        const first = await handleRequest(
            db, req('PUT', '/ideas/sa-retry', token, body),
        );
        assert.equal(first.status, 201);
        const firstId = first.headers.get('Response-ID');
        const firstOp = first.headers.get('Operation-ID');
        const firstBytes = await first.text();
        const second = await handleRequest(
            db, req('PUT', '/ideas/sa-retry', token, body),
        );
        assert.equal(second.status, 201);
        assert.equal(
            second.headers.get('Operation-ID'), firstOp,
        );
        assert.equal(
            second.headers.get('Response-ID'), firstId,
        );
        assert.equal(await second.text(), firstBytes);
        assert.equal(
            await pairsAt(db, IDEA_PREFIX, 'sa-retry'),
            1,
        );
    });

    test(name + ': address miss is 404', async () => {
        const { db, token } = await ready();
        const put = await handleRequest(db, req(
            'PUT', '/projects/sa-miss', token,
            projectDocument('Other', 'ev-sa-miss'),
        ));
        assert.equal(put.status, 201);
        const got = await handleRequest(
            db, req('GET', '/ideas/sa-miss', token),
        );
        assert.equal(got.status, 404);
    });

    test(name + ': If-Match stale is 412', async () => {
        const { db, token } = await ready();
        const created = await handleRequest(db, req(
            'POST', '/flows', token, flowCreate('sa-flow'),
        ));
        assert.equal(created.status, 201);
        const live = await handleRequest(
            db, req('GET', '/flows/sa-flow', token),
        );
        assert.equal(live.status, 200);
        const liveEtag = live.headers.get('ETag');
        const liveBody = await live.json() as {
            name: string;
        };
        assert.equal(liveBody.name, 'Acceptance');
        const before = await pairsAt(
            db, FLOW_PREFIX, 'sa-flow',
        );
        const stale = await handleRequest(db, req(
            'PUT', '/flows/sa-flow', token,
            flowDocument('Stale', 'sa-flow-a'),
            { 'if-match': '"' + 'b'.repeat(64) + '"' },
        ));
        assert.equal(stale.status, 412);
        assert.equal(
            await pairsAt(db, FLOW_PREFIX, 'sa-flow'),
            before,
        );
        const again = await handleRequest(
            db, req('GET', '/flows/sa-flow', token),
        );
        assert.equal(again.status, 200);
        assert.equal(again.headers.get('ETag'), liveEtag);
        const againBody = await again.json() as {
            name: string;
        };
        assert.equal(againBody.name, liveBody.name);
    });

    test(name + ': snapshot loud-reject', async () => {
        const { db } = await ready();
        const before = (await db.requests.getAll()).length;
        const missingOp = await handleRequest(db, req(
            'PUT', '/snapshots/import', undefined,
            { json: snapshotWithoutOperationId() },
        ));
        assert.equal(missingOp.status, 400);
        const missingBody = await missingOp.json() as {
            error: string;
        };
        assert.match(missingBody.error, /operation_id/);
        assert.match(
            missingBody.error, /Re-snapshot|reseed/,
        );
        const canon = await handleRequest(db, req(
            'PUT', '/snapshots/import', undefined,
            { json: snapshotCanonicalJson() },
        ));
        assert.equal(canon.status, 400);
        const canonBody = await canon.json() as {
            error: string;
        };
        assert.match(
            canonBody.error, /serializeWire|message/,
        );
        assert.match(
            canonBody.error, /Re-snapshot|reseed/,
        );
        assert.equal(
            (await db.requests.getAll()).length, before,
        );
    });
}
