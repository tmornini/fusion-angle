import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { RequestError } from '../shared/http-errors.ts';
import {
    validateIdentityTokenRevocationEntity,
} from '../api/validators.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    postIdentityLogoutEverywhere,
} from
    '../client/identity-token-revocations.ts';
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
    return { db, ctx: inPageContext(db, await devToken()) };
}

// Phase Final Task 2: identity_token_revocations ROW half
// stripped — append count lives on the message plane.

Deno.test('logout-everywhere on a membership-less'
    + ' identity is forbidden',
async () => {
    const { db, ctx } = await setup();
    const target = generateIdentifier();
    const before = (await db.messagePairs.getAll()).length;
    const err = await assertRejects(
        () => postIdentityLogoutEverywhere(ctx, target),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assert(err.message.startsWith(
        'forbidden: PUT /identities/' + target
            + '/token-revocations/',
    ));
    assert(err.message.includes(
        'names an identity outside this organization',
    ));
    assertStrictEquals(
        (await deriveTokenRevocationsFor(db, target)).length,
        0,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
