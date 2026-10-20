import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { apiRequest } from './http-fixtures.ts';
import { claimToken, DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const BODY = {
    name: 'Nightly import',
    description: 'Loads the ledger export',
};

function servicePath(organization: string, id = ''): string {
    return '/organizations/' + organization
        + '/services/' + id;
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Only the members statement creates a service (Task 6),
// so the PUT is class B: it rewrites a live head or
// nothing (RFC 6585 §3; RFC 9110 §13.2.1).
Deno.test('a services PUT with no precondition is 428',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: servicePath(STARK, generateIdentifier()),
        token: DEV_TOKEN,
        body: BODY,
    }));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
});

Deno.test('a services PUT never creates', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const headers of [
        { 'If-None-Match': '*' },
        { 'If-Match': '"' + generateIdentifier() + '"' },
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: servicePath(STARK, id),
            token: DEV_TOKEN,
            body: BODY,
            headers,
        }));
        assertStrictEquals(res.status, 404);
        assertEquals(await res.json(), {
            error: 'Not found: services/' + id,
        });
    }
    assertStrictEquals(
        await db.messagePairs.getHeadPair(
            servicePath(STARK), id,
        ),
        null,
    );
});

Deno.test('another organization reaches no service of ours',
async () => {
    const db = await freshDb();
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: servicePath(STARK),
        token: wayne,
    }));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});
