import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateIdentityProviderEntity,
} from '../api/validators.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
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
    identityProviderEntityOf,
} from '../api/derive-identity-spine.ts';
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
    // Re-pointed (Phase 10 Task 8 Session B, closing session A's
    // named gap): getProvidersFor reads GET /identity-providers,
    // now flipped to derive-identity-spine.ts's
    // deriveIdentityProviders, so a raw put with no message pair
    // would go derivation-invisible. seedIdentityProvider forms
    // both — the SAME below-facade mechanism identity-fixtures.ts
    // uses throughout, riding the postIdentityProviderDocumentOp
    // extraction this session lands.
    await seedIdentityProvider(db, 'pl', {
        ...goodRow, identity_id: 'p2', action: 'linked',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await seedIdentityProvider(db, 'pe', {
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
        path: '/identity-providers/' + id,
        token: DEV_TOKEN,
        body: goodRow,
        operationId: TEST_OPERATION_ID,
    }));
    assert.equal(put.status, 201);
    const stored = JSON.parse(
        await storedPutBodyText(
            db, '/identity-providers/', id,
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
        stored, await deriveIdentityProvider(db, id),
    );
    assert.deepEqual(stored, await put.json());
});
