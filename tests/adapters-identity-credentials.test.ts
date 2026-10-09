import {
    assert,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { seedIdentityCredential } from './identity-fixtures.ts';
import {
    postIdentityCredentialRevocation,
    getIdentityCredentialState,
} from
    '../client/identity-credentials.ts';
import { deriveCredentialsFor } from
    '../api/derive-identity-spine.ts';
import { RequestError } from '../shared/http-errors.ts';

const ORPHAN = 'pnXmXrxOWayANgDLdCjuBw';

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: inPageContext(db, await devToken()) };
}

// Phase Final Task 2: identity_credentials ROW half stripped —
// event count and active state live on the message plane.

Deno.test('an admin cannot revoke a membership-less'
    + ' credential',
async () => {
    const { db, ctx } = await setup();
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: 'phc-v1',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw', 'c2', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'rotated',
        secret: 'phc-v2',
        at: '2026-01-02T00:00:00.000000Z',
    });
    const before = (await db.messagePairs.getAll()).length;
    const err = await assertRejects(
        () => postIdentityCredentialRevocation(
            ctx, ORPHAN, 'password',
        ),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assert(err.message.startsWith(
        'forbidden: PUT /identities/' + ORPHAN
            + '/credentials/',
    ));
    assert(err.message.includes(
        'names an identity outside this organization',
    ));
    const events = await deriveCredentialsFor(db, ORPHAN);
    assertStrictEquals(events.length, 2);
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an admin cannot read a membership-less'
    + ' credential ledger',
async () => {
    const { db, ctx } = await setup();
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: 'super-secret',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const before = (await db.messagePairs.getAll()).length;
    const err = await assertRejects(
        () => getIdentityCredentialState(ctx, ORPHAN),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside(
            'GET',
            '/identities/' + ORPHAN + '/credentials/',
        ) + ' ()',
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an admin cannot read a membership-less'
    + ' credential by at',
async () => {
    const { db, ctx } = await setup();
    // Appended in REVERSE chronological order: the later
    // 'set' precedes the earlier 'revoked' in the array,
    // so array-order "last wins" would wrongly revoke.
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw'
        , 'WeXjAaAxGSpLpamfEuvcww', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'set',
        secret: '',
        at: '2026-02-01T00:00:00.000000Z',
    });
    await seedIdentityCredential(db, 'pnXmXrxOWayANgDLdCjuBw', 'c2', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw',
        kind: 'password',
        status: 'revoked',
        secret: '',
        at: '2026-01-01T00:00:00.000000Z',
    });
    const err = await assertRejects(
        () => getIdentityCredentialState(ctx, ORPHAN),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside(
            'GET',
            '/identities/' + ORPHAN + '/credentials/',
        ) + ' ()',
    );
    assertStrictEquals(
        (await deriveCredentialsFor(db, ORPHAN)).length, 2,
    );
});
