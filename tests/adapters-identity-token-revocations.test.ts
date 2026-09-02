import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    validateIdentityTokenRevocationEntity,
} from '../api/validators.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postIdentityLogoutEverywhere,
} from
    '../web-app/app/adapters/identity-token-revocations.ts';
import { deriveTokenRevocationsFor } from
    '../api/derive-identity-spine.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

Deno.test('validates a revocation body', () => {
    assertEquals(
        validateIdentityTokenRevocationEntity({
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-03T00:00:00.000000Z',
        }),
        {
            identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
});

Deno.test('rejects an extra key', () => {
    assertThrows(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: generateIdentifier(),
            at: 'x', extra: 1,
        }));
});

Deno.test('rejects an unparseable timestamp', () => {
    assertThrows(() =>
        validateIdentityTokenRevocationEntity({
            identity_id: generateIdentifier(),
            at: 'not-a-date',
        }));
});

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: createRequestContext(db, await devToken()) };
}

// Phase Final Task 2: identity_token_revocations ROW half
// stripped — append count lives on the message plane.

Deno.test('logout-everywhere appends, never splices',
async () => {
    // Revoke a subject OTHER than the writer's ('XXZruirZyAOoRpNxaDnpSA',
    // via devToken) so the second append's own Bearer is not
    // self-revoked by the first — the gate correctly revokes
    // the actor's stale token when it logs ITSELF out
    // everywhere. The latest-wins reduce is pinned at the
    // token-verify layer (access-token tests).
    const { db, ctx } = await setup();
    const target = generateIdentifier();
    await postIdentityLogoutEverywhere(ctx, target);
    await postIdentityLogoutEverywhere(ctx, target);
    const rows = await deriveTokenRevocationsFor(
        db, target,
    );
    assertStrictEquals(rows.length, 2);            // retained
    assert(rows.every(
        r => r.identity_id === target));
    // Phase Final Stage B: identity spine tables retired.
});
