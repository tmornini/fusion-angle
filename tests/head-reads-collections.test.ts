import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { seededMockDb } from './mock-seed.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    apiRequest,
    assertPartIsDocumentGet,
    assertPartsAreHeads,
    partsOf,
} from './http-fixtures.ts';
import { credentialReader } from '../api/routes.ts';
import type { Reader } from '../api/served-response.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

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

const ME = 'XXZruirZyAOoRpNxaDnpSA';
const AT = '2026-01-01T00:00:00.000000Z';

// The seed writes no token or provider of the admin's, so
// each collection gets two documents written through the
// gate before it is read.
async function identityCollectionsDb(token: string) {
    const db = await seededMockDb();
    const chain = generateIdentifier();
    for (const jti of [generateIdentifier(), generateIdentifier()]) {
        const put = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + ME + '/tokens/' + jti,
            token,
            body: {
                jti, identity_id: ME, action: 'issued',
                chain_id: chain, at: AT,
            },
        }));
        assert(put.ok, 'token PUT ' + put.status);
        await put.body?.cancel();
    }
    for (const provider of ['google', 'github']) {
        const put = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: '/identities/' + ME + '/providers/'
                + generateIdentifier(),
            token,
            body: {
                identity_id: ME, provider,
                provider_subject: 'sub-' + provider,
                action: 'linked', at: AT,
            },
        }));
        assert(put.ok, 'provider PUT ' + put.status);
        await put.body?.cancel();
    }
    return db;
}

const IDENTITY_COLLECTIONS: readonly [string, Reader][] = [
    ['credentials', credentialReader(['admin'])],
    ['tokens', { sees: 'whole' }],
    ['providers', { sees: 'whole' }],
];

for (const [family, reader] of IDENTITY_COLLECTIONS) {
    const collection = '/identities/' + ME + '/' + family + '/';
    Deno.test(collection + ' serves its heads as parts',
    async () => {
        const token = await organizationToken();
        const db = await identityCollectionsDb(token);
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
        await assertPartsAreHeads(db, parts, reader);
        for (const part of parts) {
            await assertPartIsDocumentGet(
                db, token, part,
                collection + part.body().toValue().id,
            );
        }
    });
}

// A credential's secret reaches no reader, admins included.
Deno.test('no credential part holds its secret', async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + ME + '/credentials/',
        token: await organizationToken(),
    }));
    const parts = await partsOf(got);
    assert(parts.length > 0, 'the admin holds credentials');
    for (const part of parts) {
        assert(!part.body().toText().includes('"secret"'));
    }
});

Deno.test('an identity\'s organizations are the organizations'
    + ' it holds a live seat in', async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: 'Seated', email: id.toLowerCase() + '@example.com',
        phone: '', bio: '',
    });
    await seedSeat(db, STARK, id, 'member');
    const token = await devToken(id);
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/organizations/',
        token,
    }));
    assertStrictEquals(got.status, 200);
    const parts = await partsOf<{ id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.map((part) => part.body().toValue().id),
        [STARK],
    );
    await assertPartIsDocumentGet(
        db, await organizationToken(id), parts[0]!,
        '/organizations/' + STARK,
    );
});

Deno.test('an identity with no seat has no organizations',
async () => {
    const db = await seededMockDb();
    const id = generateIdentifier();
    await seedPersonIdentity(db, id, {
        name: 'Unseated', email: id.toLowerCase() + '@example.com',
        phone: '', bio: '',
    });
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/' + id + '/organizations/',
        token: await devToken(id),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
});

const FLOWS = '/organizations/' + STARK + '/flows/';
// Customer Onboarding carries a record binding and 39 work
// orders; Fusion Angle Flow carries no work order.
const ONBOARDING = 'esKujtyQFYUJaVSXWwavzA';
const UNWORKED = 'GgfDbXOJUvvaCekCTcvhuw';

Deno.test(FLOWS + ' serves its heads as parts, each its'
    + ' document GET', async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const got = await handleRequest(db, apiRequest({
        method: 'GET', path: FLOWS, token,
    }));
    assertStrictEquals(got.status, 200);
    assertMatch(
        got.headers.get('content-type')!,
        /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
    );
    assertStrictEquals(got.headers.get('etag'), null);
    const parts = await partsOf<{ id: string }>(got);
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    for (const part of parts) {
        await assertPartIsDocumentGet(
            db, token, part, FLOWS + part.body().toValue().id,
        );
    }
});

Deno.test('a state-deleted flow is no part of its collection',
async () => {
    const db = await seededMockDb();
    const token = await organizationToken();
    const read = await handleRequest(db, apiRequest({
        method: 'GET', path: FLOWS + ONBOARDING, token,
    }));
    assertStrictEquals(read.status, 200);
    const stored = await read.json() as Record<string, unknown>;
    const { id: _id, ...body } = stored;
    const deleted = await handleRequest(db, apiRequest({
        method: 'PUT', path: FLOWS + ONBOARDING, token,
        headers: { 'if-match': read.headers.get('etag')! },
        body: {
            ...body,
            state: 'deleted', state_at: AT,
            state_event_id: generateIdentifier(),
            graphDelta: {
                nodes: [], edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
            revivals: [],
        },
    }));
    assertStrictEquals(deleted.status, 200);
    await deleted.body?.cancel();
    const parts = await partsOf<{ id: string }>(
        await handleRequest(db, apiRequest({
            method: 'GET', path: FLOWS, token,
        })),
    );
    await assertPartsAreHeads(db, parts, { sees: 'whole' });
    assertEquals(
        parts.filter((part) =>
            part.body().toValue().id === ONBOARDING),
        [],
    );
});

for (const join of ['records', 'work-orders']) {
    const collection = FLOWS + ONBOARDING + '/' + join + '/';
    Deno.test(collection + ' serves its join heads as parts',
    async () => {
        const db = await seededMockDb();
        const got = await handleRequest(db, apiRequest({
            method: 'GET', path: collection,
            token: await organizationToken(),
        }));
        assertStrictEquals(got.status, 200);
        assertMatch(
            got.headers.get('content-type')!,
            /^multipart\/mixed; boundary=[0-9a-f-]{36}$/,
        );
        assertStrictEquals(got.headers.get('etag'), null);
        const parts = await partsOf<{ flow_id: string }>(got);
        await assertPartsAreHeads(db, parts, { sees: 'whole' });
        for (const part of parts) {
            assertStrictEquals(
                part.body().toValue().flow_id, ONBOARDING,
            );
        }
    });
}

Deno.test('a flow with no work orders answers 204', async () => {
    const db = await seededMockDb();
    const got = await handleRequest(db, apiRequest({
        method: 'GET',
        path: FLOWS + UNWORKED + '/work-orders/',
        token: await organizationToken(),
    }));
    assertStrictEquals(got.status, 204);
    assertStrictEquals(await got.text(), '');
    assertMatch(got.headers.get('date')!, /GMT$/);
});
