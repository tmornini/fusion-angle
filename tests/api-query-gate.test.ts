import { assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { QUERY_TEXT_MAX_LENGTH } from '../shared/search-match.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { seedOrganizationDocument } from
    './root-admin-fixture.ts';
import { organizationToken } from './token-fixtures.ts';
import { apiRequest, framedRequest } from './http-fixtures.ts';
import { generateIdentifier } from '../shared/identifier.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const OTHER = 'BBjWJsjYIDkTRKIIPrzWRw';
// The ideas collection offers GET but no QUERY.
const IDEAS = '/organizations/' + STARK + '/ideas/';
const REFUSED_Q = 'QUERY body requires a string q';

async function basis(): Promise<MemoryDbAdapter> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedOrganizationDocument(db, STARK, 'Stark');
    await seedOrganizationDocument(db, OTHER, 'Other');
    return db;
}

function memberToken(): Promise<string> {
    return organizationToken(generateIdentifier(), STARK);
}

async function errorOf(response: Response): Promise<string> {
    const { error } = await response.json() as { error: string };
    return error;
}

Deno.test('a member QUERY on a route without the slot is 405',
async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: { q: 'x' },
    }));
    assertStrictEquals(response.status, 405);
    assertStrictEquals(
        await errorOf(response),
        'Method QUERY not allowed on ' + IDEAS,
    );
});

Deno.test('QUERY with invalid JSON is 400', async () => {
    const db = await basis();
    const response = await handleRequest(db, framedRequest(
        'http://localhost' + IDEAS,
        {
            method: 'QUERY',
            headers: {
                'Content-Type': 'application/json',
                'Authorization':
                    'Bearer ' + await memberToken(),
            },
            body: '{not valid json',
        },
    ));
    assertStrictEquals(response.status, 400);
    assertStrictEquals(
        await errorOf(response),
        'Invalid JSON body for QUERY ' + IDEAS,
    );
});

Deno.test('QUERY with an array body is 400', async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: [{ q: 'x' }],
    }));
    assertStrictEquals(response.status, 400);
    assertStrictEquals(
        await errorOf(response),
        'Invalid JSON body for QUERY ' + IDEAS,
    );
});

Deno.test('QUERY with no q is 400', async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: { text: 'x' },
    }));
    assertStrictEquals(response.status, 400);
    assertStrictEquals(await errorOf(response), REFUSED_Q);
});

Deno.test('QUERY with a numeric q is 400', async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: { q: 7 },
    }));
    assertStrictEquals(response.status, 400);
    assertStrictEquals(await errorOf(response), REFUSED_Q);
});

Deno.test('a q of the most characters passes the gate',
async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: { q: 'x'.repeat(QUERY_TEXT_MAX_LENGTH) },
    }));
    // The ideas route has no slot: past the gate is 405.
    assertStrictEquals(response.status, 405);
    await response.body?.cancel();
});

Deno.test('a q one character too long is 400', async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        token: await memberToken(),
        body: { q: 'x'.repeat(QUERY_TEXT_MAX_LENGTH + 1) },
    }));
    assertStrictEquals(response.status, 400);
    assertStrictEquals(
        await errorOf(response),
        'QUERY body requires a string q of at most 256'
            + ' characters',
    );
});

Deno.test('QUERY on a foreign organization path is 403',
async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: '/organizations/' + OTHER + '/ideas/',
        token: await memberToken(),
        body: { q: 'x' },
    }));
    assertStrictEquals(response.status, 403);
    assertEquals(
        await errorOf(response),
        'forbidden: path organization does not match'
            + ' the token organization',
    );
});

Deno.test('QUERY on the foreign organization document is 403',
async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: '/organizations/' + OTHER,
        token: await memberToken(),
        body: { q: 'x' },
    }));
    // The path fence, not the GET's membership fence: the
    // document read's exemption is GET's alone.
    assertStrictEquals(response.status, 403);
    assertEquals(
        await errorOf(response),
        'forbidden: path organization does not match'
            + ' the token organization',
    );
});

Deno.test('QUERY without a bearer is 401', async () => {
    const db = await basis();
    const response = await handleRequest(db, apiRequest({
        method: 'QUERY',
        path: IDEAS,
        body: { q: 'x' },
    }));
    assertStrictEquals(response.status, 401);
    await response.body?.cancel();
});

// A byte body, unlike a string one, gets no Content-Type
// from the Request constructor.
async function queryTyped(
    headers: Readonly<Record<string, string>>,
): Promise<Response> {
    const db = await basis();
    return handleRequest(db, framedRequest(
        'http://localhost' + IDEAS,
        {
            method: 'QUERY',
            headers: {
                ...headers,
                'Authorization':
                    'Bearer ' + await memberToken(),
            },
            body: new TextEncoder().encode(
                JSON.stringify({ q: 'x' }),
            ),
        },
    ));
}

Deno.test('a QUERY without Content-Type is 400', async () => {
    const response = await queryTyped({});
    assertStrictEquals(response.status, 400);
    assertStrictEquals(
        await errorOf(response),
        'QUERY ' + IDEAS + ' requires a Content-Type',
    );
});

Deno.test('a QUERY with text/plain is 415', async () => {
    const response = await queryTyped({
        'Content-Type': 'text/plain',
    });
    assertStrictEquals(response.status, 415);
    assertStrictEquals(
        await errorOf(response),
        'QUERY ' + IDEAS + ' takes application/json',
    );
});

Deno.test('a QUERY with a charset passes the gate', async () => {
    const response = await queryTyped({
        'Content-Type': 'application/json; charset=utf-8',
    });
    // The ideas route has no slot: past the gate is 405.
    assertStrictEquals(response.status, 405);
    await response.body?.cancel();
});
