// Minimal DOM stubs so redirectToLogin (getPageName reads
// data-page; navigateTo sets window.location.href) runs in Node.
// @ts-expect-error — Node global stub
globalThis.window = { location: { href: '', search: '' } };
globalThis.document = {
    documentElement: { getAttribute: () => 'dashboard' },
} as unknown as Document;

import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    validateIdentityProviderEntity,
} from '../api/validators.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import {
    inPageClient,
    inPageContext,
} from './in-page-facade.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { UnauthorizedError } from '../shared/http-errors.ts';
import {
    getProvidersFor,
} from '../client/identity-providers.ts';
import { seedIdentityProvider } from './identity-fixtures.ts';
import {
    deriveIdentityProvider,
    identityProviderEntityOf,
} from '../api/derive-identity-spine.ts';
import {
    apiRequest, partBodiesOf, storedPutBodyText,
} from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function adminCtx() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db, ctx: inPageContext(db, await devToken()),
    };
}

const goodRow = {
    identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    provider: 'google',
    provider_subject: 'sub-123',
    action: 'linked',
    at: '2026-06-03T00:00:00.000000Z',
};

Deno.test('validates an identity-provider link', () => {
    assertEquals(
        validateIdentityProviderEntity(goodRow), goodRow);
});

Deno.test('rejects an unknown action', () => {
    assertThrows(() =>
        validateIdentityProviderEntity({
            ...goodRow, action: 'merged',
        }));
});

Deno.test('rejects an extra key', () => {
    assertThrows(() =>
        validateIdentityProviderEntity({
            ...goodRow, extra: 1,
        }));
});

// Phase Final Stage B: identity_providers table retired —
// store append pins live on message-plane document tests.

Deno.test('an anonymous principal cannot read providers',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const client = inPageClient(db);
    const anon = client.requestContext(
        await devToken('anonymous'));
    try {
        await assertRejects(
            () => getProvidersFor(anon, 'prBESZPjJDiuXCeZLmbiVw'),
            UnauthorizedError,
        );
    } finally {
        client.deleteRefreshChannel();
    }
});

Deno.test('linked providers are latest by at, not array order',
async () => {
    const { db, ctx } = await adminCtx();
    // Appended in REVERSE chronological order: the later
    // 'linked' precedes the earlier 'unlinked', so
    // array-order "last wins" would wrongly drop it.
    //
    // getProvidersFor reads GET /identities/:id/providers.
    await seedIdentityProvider(
        db, 'prBESZPjJDiuXCeZLmbiVw', generateIdentifier(), {
        ...goodRow, identity_id: 'prBESZPjJDiuXCeZLmbiVw', action: 'linked',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await seedIdentityProvider(
        db, 'prBESZPjJDiuXCeZLmbiVw', generateIdentifier(), {
        ...goodRow, identity_id: 'prBESZPjJDiuXCeZLmbiVw', action: 'unlinked',
        at: '2026-01-01T00:00:00.000000Z',
    });
    assertEquals(
        await getProvidersFor(ctx, 'prBESZPjJDiuXCeZLmbiVw'), ['google']);
});

// G4: stored PUT = identityProviderEntityOf (GET derive).
Deno.test('stored PUT body equals identityProviderEntityOf',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/XXZruirZyAOoRpNxaDnpSA/providers/' + id,
        token: DEV_TOKEN,
        body: goodRow,
    }));
    assertStrictEquals(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/XXZruirZyAOoRpNxaDnpSA/providers/', id,
        ),
    );
    const expected = identityProviderEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: goodRow,
    });
    assertStrictEquals(Object.keys(expected)[0], 'id');
    assertEquals(stored, expected);
    assertEquals(
        stored, await deriveIdentityProvider(db, 'XXZruirZyAOoRpNxaDnpSA'
            , id),
    );
    assertEquals(stored, await put.json());
});

Deno.test('GET stamps identity_id from the path when PUT omits it',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = generateIdentifier();
    const withoutIdentity = {
        provider: goodRow.provider,
        provider_subject: goodRow.provider_subject,
        action: goodRow.action,
        at: goodRow.at,
    };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/XXZruirZyAOoRpNxaDnpSA/providers/' + id,
        token: DEV_TOKEN,
        body: withoutIdentity,
    }));
    assert(put.status === 200 || put.status === 201);
    const list = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/XXZruirZyAOoRpNxaDnpSA/providers/',
        token: DEV_TOKEN,
    }));
    assertStrictEquals(list.status, 200);
    const rows = await partBodiesOf<{
        readonly id: string;
        readonly identity_id: string;
    }>(list);
    const row = rows.find(r => r.id === id);
    assert(row, 'omitted-id event is in the collection');
    assertStrictEquals(row.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
    const leaf = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/XXZruirZyAOoRpNxaDnpSA/providers/' + id,
        token: DEV_TOKEN,
    }));
    assertStrictEquals(leaf.status, 200);
    const one = await leaf.json() as {
        readonly identity_id: string;
    };
    assertStrictEquals(one.identity_id, 'XXZruirZyAOoRpNxaDnpSA');
});

Deno.test('PUT 400s when identity_id disagrees with the path',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/XXZruirZyAOoRpNxaDnpSA/providers/'
            + 'jMOAEoFPMIDxqTAtmGvVIg',
        token: DEV_TOKEN,
        body: {
            ...goodRow,
            identity_id: generateIdentifier(),
        },
    }));
    assertStrictEquals(res.status, 400);
});

