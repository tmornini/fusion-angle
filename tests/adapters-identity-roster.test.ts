import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    getIdentityRoster,
    postIdentityCreation,
} from '../client/identities.ts';
import {
    getProviderEvents,
} from '../client/identity-providers.ts';
import {
    getTokenChainsFor,
} from '../client/identity-tokens.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { RequestError } from '../shared/http-errors.ts';

function outside(method: string, path: string): string {
    return 'forbidden: ' + method + ' ' + path
        + ' names an identity outside this'
        + ' organization';
}

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: inPageContext(db, await devToken()),
    };
}

const PERSON = 'pnXmXrxOWayANgDLdCjuBw';
const SERVICE = 'syWUUcdBSbBgMwBiCrgbDw';

Deno.test('getIdentityRoster omits a membership-less person',
async () => {
    const { ctx } = await setup();
    await ctx.POST('identities/', { id: PERSON, kind: 'person' });
    const err = await assertRejects(
        () => ctx.PUT('identities/' + PERSON + '/pii', {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        }),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside('PUT', '/identities/' + PERSON + '/pii')
            + ' ()',
    );
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === PERSON),
        undefined,
    );
});

Deno.test('getIdentityRoster omits a membership-less service',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, SERVICE, {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === SERVICE),
        undefined,
    );
    const err = await assertRejects(
        () => ctx.GET('identities/' + SERVICE),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside('GET', '/identities/' + SERVICE) + ' ()',
    );
});

Deno.test('getIdentityRoster omits a fresh membership-less'
    + ' service',
async () => {
    const { ctx } = await setup();
    const serviceId = generateIdentifier();
    await postIdentityCreation(ctx, serviceId, {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === serviceId),
        undefined,
    );
    const err = await assertRejects(
        () => ctx.GET('identities/' + serviceId),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside('GET', '/identities/' + serviceId) + ' ()',
    );
});

Deno.test('an admin cannot erase a membership-less person',
async () => {
    const { ctx } = await setup();
    await ctx.POST('identities/', { id: PERSON, kind: 'person' });
    await assertRejects(
        () => ctx.PUT('identities/' + PERSON + '/pii', {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        }),
        RequestError,
    );
    const err = await assertRejects(
        () => ctx.DELETE('identities/' + PERSON + '/pii'),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message,
        outside(
            'DELETE', '/identities/' + PERSON + '/pii',
        ) + ' ()',
    );
    const roster = await getIdentityRoster(ctx);
    assertEquals(
        roster.find((row) => row.id === PERSON),
        undefined,
    );
});

Deno.test('an admin cannot read a membership-less'
    + ' provider log',
async () => {
    const { ctx } = await setup();
    const cid = 'YiJPbufDpkyrZcZCYbUJpg';
    const item = '/identities/' + PERSON
        + '/providers/' + cid;
    const err = await assertRejects(
        () => ctx.PUT(
            'identities/' + PERSON + '/providers/' + cid,
            {
                identity_id: PERSON, provider: 'google',
                provider_subject: 'g-1', action: 'linked',
                at: '2026-01-01T00:00:00.000000Z',
            },
        ),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside('PUT', item) + ' ()',
    );
    const read = await assertRejects(
        () => getProviderEvents(ctx, PERSON),
        RequestError,
    );
    assertStrictEquals(read.status, 403);
    assertStrictEquals(
        read.message,
        outside(
            'GET',
            '/identities/' + PERSON + '/providers/',
        ) + ' ()',
    );
});

Deno.test('an admin cannot read a membership-less'
    + ' token chain',
async () => {
    const { ctx } = await setup();
    const jti = 'jmvogLnzTmiQlAkVvDHrvQ';
    const item = '/identities/' + PERSON + '/tokens/' + jti;
    const err = await assertRejects(
        () => ctx.PUT(
            'identities/' + PERSON + '/tokens/' + jti,
            {
                jti, identity_id: PERSON, action: 'issued',
                chain_id: 'WeXjAaAxGSpLpamfEuvcww',
                at: '2026-01-01T00:00:00.000000Z',
            },
        ),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside('PUT', item) + ' ()',
    );
    const read = await assertRejects(
        () => getTokenChainsFor(ctx, PERSON),
        RequestError,
    );
    assertStrictEquals(read.status, 403);
    assertStrictEquals(
        read.message,
        outside(
            'GET', '/identities/' + PERSON + '/tokens/',
        ) + ' ()',
    );
});

Deno.test('an admin cannot rotate a membership-less'
    + ' token chain',
async () => {
    const { ctx } = await setup();
    const root = generateIdentifier();
    const item = '/identities/' + PERSON + '/tokens/' + root;
    const err = await assertRejects(
        () => ctx.PUT(
            'identities/' + PERSON + '/tokens/' + root,
            {
                jti: root, identity_id: PERSON,
                action: 'issued',
                chain_id: generateIdentifier(),
                at: '2026-01-01T00:00:00.000000Z',
            },
        ),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside('PUT', item) + ' ()',
    );
});

Deno.test('an admin cannot order a membership-less'
    + ' token chain',
async () => {
    const { ctx } = await setup();
    const identity = generateIdentifier();
    const jti = generateIdentifier();
    const item = '/identities/' + identity
        + '/tokens/' + jti;
    const err = await assertRejects(
        () => ctx.PUT(
            'identities/' + identity + '/tokens/' + jti,
            {
                jti, identity_id: identity, action: 'issued',
                chain_id: generateIdentifier(),
                at: '2026-01-02T00:00:00.000000Z',
            },
        ),
        RequestError,
    );
    assertStrictEquals(err.status, 403);
    assertStrictEquals(
        err.message, outside('PUT', item) + ' ()',
    );
    const read = await assertRejects(
        () => getTokenChainsFor(ctx, identity),
        RequestError,
    );
    assertStrictEquals(read.status, 403);
    assertStrictEquals(
        read.message,
        outside(
            'GET', '/identities/' + identity + '/tokens/',
        ) + ' ()',
    );
});
