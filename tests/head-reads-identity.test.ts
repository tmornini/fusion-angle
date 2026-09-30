import { assertEquals, assertStrictEquals } from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { seededMockDb } from './mock-seed.ts';
import { organizationToken } from './token-fixtures.ts';
import { apiRequest } from './http-fixtures.ts';

const ME = 'XXZruirZyAOoRpNxaDnpSA';

Deno.test('an erased PII answers 410', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const path = '/identities/' + ME + '/pii';
    const before = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    assertStrictEquals(before.status, 200);
    await before.body?.cancel();
    const erased = await handleRequest(db, apiRequest({
        method: 'DELETE', path, token,
    }));
    assertStrictEquals(erased.status, 204);
    const after = await handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
    assertStrictEquals(after.status, 410);
    assertEquals(await after.json(), {
        error: 'Gone: identity_pii/' + ME,
    });
});
