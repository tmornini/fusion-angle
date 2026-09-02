import { assert, assertEquals, assertStrictEquals } from '@std/assert';
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

function req(
    method: string,
    path: string,
    token?: string,
    body?: unknown,
): Request {
    return apiRequest({
        method,
        path,
        ...(token !== undefined ? { token } : {}),
        body,
        operationId: TEST_OPERATION_ID,
    });
}

async function freshDb(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

Deno.test('PATCH /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
    + 'gVvtDIaqhnkXZQcxZeSuiw admin → 405 (known verb, no'
+ ' handler)', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw', token, { set: {} },
    ));
    assertStrictEquals(res.status, 405);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'Method PATCH not allowed on /organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/gVvtDIaqhnkXZQcxZeSuiw',
    );
});

Deno.test('PATCH /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
    + 'gVvtDIaqhnkXZQcxZeSuiw member → 403 (policy before'
+ ' verb gap)', async () => {
    const db = await freshDb();
    const token = await organizationToken('nkgaOHZISTQrILTfPThWCA');
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw', token, { set: {} },
    ));
    assertStrictEquals(res.status, 403);
    const body = await res.json() as { error: string };
    assertStrictEquals(
        body.error,
        'forbidden: PATCH /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw requires a role'
        + ' this principal lacks',
    );
});

Deno.test('PATCH /nowhere admin → 404', async () => {
    const db = await freshDb();
    const token = await organizationToken();
    const res = await handleRequest(db, req(
        'PATCH', '/nowhere', token, {},
    ));
    assertStrictEquals(res.status, 404);
});

Deno.test('PATCH unauthenticated → 401', async () => {
    const db = await freshDb();
    const res = await handleRequest(db, req(
        'PATCH', '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'gVvtDIaqhnkXZQcxZeSuiw', undefined, {},
    ));
    assertStrictEquals(res.status, 401);
});

Deno.test('writeAuthorizerFor includes PATCH on organizations/:id/ideas/:id',
() => {
    const put = writeAuthorizerFor('organizations/:id/ideas/:id', 'PUT');
    const patch = writeAuthorizerFor(
        'organizations/:id/ideas/:id', 'PATCH',
    );
    const post = writeAuthorizerFor(
        'organizations/:id/ideas/:id', 'POST',
    );
    assertEquals(put, {
        table: 'ideas', idParamIndex: 1,
    });
    assertEquals(patch, put);
    assertStrictEquals(post, undefined);
});

Deno.test('IF_MATCH_HEADER is if-match and is hoisted',
() => {
    assertStrictEquals(IF_MATCH_HEADER, 'if-match');
    const request = new Request('http://x/', {
        headers: { 'if-match': '"pair-head-1"' },
    });
    const fields = hoistedHeaderFields(request);
    assert(
        fields.some(
            f => f.name === 'if-match'
                && f.value === '"pair-head-1"',
        ),
        'if-match must be hoisted verbatim',
    );
});
