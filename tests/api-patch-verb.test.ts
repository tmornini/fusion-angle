import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    organizationToken,
} from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest, TEST_OPERATION_ID,
} from './http-fixtures.ts';
import { writeAuthorizerFor } from
    '../api/write-authorizer.ts';
import {
    IF_MATCH_HEADER,
    hoistedHeaderFields,
} from '../api/message-pair.ts';

// Task 10: PATCH joins the platform verb alphabet. No route
// carries a patch handler yet — admin probes on handler-less
// routes answer 405; members still 403 at policy; unauth 401;
// unknown path 404. writeAuthorizerFor must include PATCH so
// a future flat PATCH cannot bypass the ownership fence.

const BASE = 'http://localhost';

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        token,
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('PATCH /organizations/1/ideas/idea-1 admin → 405 (known verb, no'
+ ' handler)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/1/ideas/idea-1', token, { set: {} },
    ));
    assert.equal(res.status, 405);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'Method PATCH not allowed on /organizations/1/ideas/idea-1',
    );
});

test('PATCH /organizations/1/ideas/idea-1 member → 403 (policy before'
+ ' verb gap)', async () => {
    const db = await freshDb();
    const token = await organizationToken('member1');
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/1/ideas/idea-1', token, { set: {} },
    ));
    assert.equal(res.status, 403);
    const body = await res.json() as { error: string };
    assert.equal(
        body.error,
        'forbidden: PATCH /organizations/1/ideas/idea-1 requires a role'
        + ' this principal lacks',
    );
});

test('PATCH /nowhere admin → 404', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/nowhere', token, {},
    ));
    assert.equal(res.status, 404);
});

test('PATCH unauthenticated → 401', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/1/ideas/idea-1', undefined, {},
    ));
    assert.equal(res.status, 401);
});

test('writeAuthorizerFor includes PATCH on organizations/:id/ideas/:id',
() => {
    const put = writeAuthorizerFor('organizations/:id/ideas/:id', 'PUT');
    const patch = writeAuthorizerFor(
        'organizations/:id/ideas/:id', 'PATCH',
    );
    const post = writeAuthorizerFor(
        'organizations/:id/ideas/:id', 'POST',
    );
    assert.deepEqual(put, {
        table: 'ideas', idParamIndex: 1,
    });
    assert.deepEqual(patch, put);
    assert.equal(post, undefined);
});

test('IF_MATCH_HEADER is if-match and is hoisted',
() => {
    assert.equal(IF_MATCH_HEADER, 'if-match');
    const request = new Request('http://x/', {
        headers: { 'if-match': '"pair-head-1"' },
    });
    const fields = hoistedHeaderFields(request);
    assert.ok(
        fields.some(
            f => f.name === 'if-match'
                && f.value === '"pair-head-1"',
        ),
        'if-match must be hoisted verbatim',
    );
});
