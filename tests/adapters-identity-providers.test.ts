import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityProviderEntity,
} from '../api/validators.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { MESSAGE_TABLES } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN, devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    getProvidersFor,
} from '../web-app/app/adapters/identity-providers.ts';
import { seedIdentityProvider } from './identity-fixtures.ts';
import {
    deriveIdentityProvider,
    deriveIdentityProvidersFor,
    identityProviderEntityOf,
} from '../api/derive-identity-spine.ts';
import {
    appendMessagePair,
    formWritePair,
} from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import {
    apiRequest, TEST_OPERATION_ID, storedPutBodyText,
} from './http-fixtures.ts';

async function adminCtx() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db, ctx: createRequestContext(db, await devToken()),
    };
}

const goodRow = {
    identity_id: 'current',
    provider: 'google',
    provider_subject: 'sub-123',
    action: 'linked',
    at: '2026-06-03T00:00:00.000000Z',
};

test('validates an identity-provider link', () => {
    assert.deepEqual(
        validateIdentityProviderEntity(goodRow), goodRow);
});

test('rejects an unknown action', () => {
    assert.throws(() =>
        validateIdentityProviderEntity({
            ...goodRow, action: 'merged',
        }));
});

test('rejects an extra key', () => {
    assert.throws(() =>
        validateIdentityProviderEntity({
            ...goodRow, extra: 1,
        }));
});

// Phase Final Stage B: identity_providers table retired —
// store append pins live on pair-plane document tests.

test('an anonymous principal cannot read providers',
async () => {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const anon = createRequestContext(
        db, await devToken('anonymous'));
    await assert.rejects(() => getProvidersFor(anon, 'p2'));
});

test('linked providers are latest by at, not array order',
async () => {
    const { db, ctx } = await adminCtx();
    // Appended in REVERSE chronological order: the later
    // 'linked' precedes the earlier 'unlinked', so
    // array-order "last wins" would wrongly drop it.
    //
    // getProvidersFor reads GET /identities/:id/providers.
    await seedIdentityProvider(db, 'p2', 'pl', {
        ...goodRow, identity_id: 'p2', action: 'linked',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await seedIdentityProvider(db, 'p2', 'pe', {
        ...goodRow, identity_id: 'p2', action: 'unlinked',
        at: '2026-01-01T00:00:00.000000Z',
    });
    assert.deepEqual(
        await getProvidersFor(ctx, 'p2'), ['google']);
});

// G4: stored PUT = identityProviderEntityOf (GET derive).
test('stored PUT body equals identityProviderEntityOf',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = 'ip-g4';
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/current/providers/' + id,
        token: DEV_TOKEN,
        body: goodRow,
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identities/current/providers/', id,
        ),
    );
    const expected = identityProviderEntityOf({
        uriId: id,
        pairId: id,
        method: 'PUT',
        body: goodRow,
    });
    assert.equal(Object.keys(expected)[0], 'id');
    assert.deepEqual(stored, expected);
    assert.deepEqual(
        stored, await deriveIdentityProvider(db, 'current', id),
    );
    assert.deepEqual(stored, await put.json());
});

test('GET stamps identity_id from the path when PUT omits it',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = 'ip-omit';
    const withoutIdentity = {
        provider: goodRow.provider,
        provider_subject: goodRow.provider_subject,
        action: goodRow.action,
        at: goodRow.at,
    };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/current/providers/' + id,
        token: DEV_TOKEN,
        body: withoutIdentity,
        operationId: TEST_OPERATION_ID,
    }));
    assert.ok(put.status === 200 || put.status === 201);
    const list = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/current/providers/',
        token: DEV_TOKEN,
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(list.status, 200);
    const rows = await list.json() as readonly {
        readonly id: string;
        readonly identity_id: string;
    }[];
    const row = rows.find(r => r.id === id);
    assert.ok(row, 'omitted-id event is in the collection');
    assert.equal(row.identity_id, 'current');
    const leaf = await handleRequest(db, apiRequest({
        method: 'GET',
        path: '/identities/current/providers/' + id,
        token: DEV_TOKEN,
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(leaf.status, 200);
    const one = await leaf.json() as {
        readonly identity_id: string;
    };
    assert.equal(one.identity_id, 'current');
});

test('PUT 400s when identity_id disagrees with the path',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: '/identities/current/providers/ip-bad',
        token: DEV_TOKEN,
        body: { ...goodRow, identity_id: 'other' },
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(res.status, 400);
});

test('derive dual-reads leftover flat provider pairs',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = 'old-flat-1';
    const body = { ...goodRow, identity_id: 'p2' };
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/identity-providers/' + id,
        routePattern: 'identity-providers/:id',
        routeSegments: ['identity-providers', ':id'],
        pathSegments: ['identity-providers', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: 200,
        responseBody: identityProviderEntityOf({
            uriId: id,
            pairId: id,
            method: 'PUT',
            body,
        }),
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
    const rows = await deriveIdentityProvidersFor(db, 'p2');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, id);
    assert.deepEqual(
        rows[0],
        await deriveIdentityProvider(db, 'p2', id),
    );
});

test('same event id on both planes — nested wins',
async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const id = 'same-eid';
    const flatBody = {
        ...goodRow, identity_id: 'p2',
        provider: 'flat-google',
    };
    const flatPair = await formWritePair({
        method: 'PUT',
        pathname: '/identity-providers/' + id,
        routePattern: 'identity-providers/:id',
        routeSegments: ['identity-providers', ':id'],
        pathSegments: ['identity-providers', id],
        headerFields: [],
        body: flatBody,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: 200,
        responseBody: identityProviderEntityOf({
            uriId: id,
            pairId: id,
            method: 'PUT',
            body: flatBody,
        }),
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            await appendMessagePair(view, flatPair);
        },
    );
    await seedIdentityProvider(db, 'p2', id, {
        ...goodRow, identity_id: 'p2',
        provider: 'nested-github',
    });
    const rows = await deriveIdentityProvidersFor(db, 'p2');
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.provider, 'nested-github');
    assert.equal(
        (await deriveIdentityProvider(db, 'p2', id)).provider,
        'nested-github',
    );
});
