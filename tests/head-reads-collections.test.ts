import {
    assert,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seededMockDb } from './mock-seed.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    assertPartIsDocumentGet,
    assertPartsAreHeads,
    partsOf,
} from './http-fixtures.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';

const STREAM: readonly [string, (id: string) => string][] = [
    ['/identities/', (id) => '/identities/' + id],
    ['/ai-agents/', (id) => '/ai-agents/' + id],
    ...['ideas', 'projects', 'work-orders', 'objectives'].map(
        (family) => [
            '/organizations/' + STARK + '/' + family + '/',
            (id: string) => '/organizations/' + STARK + '/'
                + family + '/' + id,
        ] as [string, (id: string) => string],
    ),
];

for (const [collection, documentOf] of STREAM) {
    Deno.test(collection + ' serves its heads as parts',
    async () => {
        const db = await seededMockDb();
        const token = await organizationToken();
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection, token,
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<{ id: string }>(got);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        const first = parts[0]!;
        await assertPartIsDocumentGet(
            db, token, first, documentOf(first.body().toValue().id),
        );
    });
}

Deno.test('an empty collection answers 204', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/organizations/' + STARK + '/ideas/',
        token,
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
    assert(got.headers.get('request-id') !== null);
});
