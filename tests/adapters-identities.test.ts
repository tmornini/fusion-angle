import {
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdentity,
    deleteIdentityPii,
} from '../client/identities.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
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

async function assertOutside(
    fn: () => Promise<unknown>,
    method: string,
    path: string,
): Promise<void> {
    const err = await assertRejects(fn, RequestError);
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside(method, path) + ' ()',
    );
}

Deno.test('getIdentity refuses a membership-less person',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, ORPHAN, {
        name: 'P', email: 'p@x.io',
        phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const before = (await db.messagePairs.getAll()).length;
    await assertOutside(
        () => getIdentity(ctx, ORPHAN),
        'GET', '/identities/' + ORPHAN,
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});

Deno.test('an admin cannot erase a membership-less PII',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, ORPHAN, {
        name: 'P', email: 'p@x.io',
        phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const before = (await db.messagePairs.getAll()).length;
    await assertOutside(
        () => deleteIdentityPii(ctx, ORPHAN, { erased: true }),
        'DELETE', '/identities/' + ORPHAN + '/pii',
    );
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, before,
    );
});
