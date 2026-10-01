import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import {
    getIdentity,
    getMemberPii,
    deleteIdentityPii,
} from '../client/identities.ts';
import { seedPersonIdentity } from './identity-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return { db, ctx: inPageContext(db, await devToken()) };
}

Deno.test('getIdentity reads kind', async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const id = await getIdentity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(id.isPerson(), true);
});

Deno.test('getMemberPii is present, then erased after delete',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    const before = await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(before.erased, false);
    await deleteIdentityPii(ctx, 'pnXmXrxOWayANgDLdCjuBw', before);
    const after = await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(after.erased, true);
});

Deno.test('erasing PII keeps identity and person kind',
async () => {
    const { db, ctx } = await setup();
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: 'AjdvjuECVZEgZoFajaIEkg', bio: 'b',
    });
    await deleteIdentityPii(
        ctx, 'pnXmXrxOWayANgDLdCjuBw',
        await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
    );
    assertStrictEquals(
        (await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw')).erased,
        true,
    );
    assertStrictEquals((await getIdentity(ctx
        , 'pnXmXrxOWayANgDLdCjuBw')).isPerson(), true);
});

Deno.test('a PII erase latches the held PII', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedPersonIdentity(db, 'pnXmXrxOWayANgDLdCjuBw', {
        name: 'P', email: 'p@x.io', phone: '', bio: 'b',
    });
    const { ctx, sent } = recordedContext(db, await devToken());
    const pii = await getMemberPii(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assert(!pii.erased);
    sent.length = 0;
    await deleteIdentityPii(ctx, 'pnXmXrxOWayANgDLdCjuBw', pii);
    assertEquals(sent.map((r) => [r.method, r.ifMatch]), [
        ['DELETE', pii.message.query('header.etag').toText()],
    ]);
});
