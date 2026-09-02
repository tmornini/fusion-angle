import { assert, assertStrictEquals, fail } from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    getIdentityRoster,
    postIdentityCreation,
} from '../web-app/app/adapters/identities.ts';
import {
    getProviderEvents,
} from '../web-app/app/adapters/identity-providers.ts';
import {
    getTokenChainsFor,
} from '../web-app/app/adapters/identity-tokens.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function setup() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: createRequestContext(db, await devToken()),
    };
}

Deno.test('getIdentityRoster joins pii; person carries fields',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
        kind: 'person',
        pii: {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        },
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'pnXmXrxOWayANgDLdCjuBw');
    assert(row, 'roster row for pnXmXrxOWayANgDLdCjuBw exists');
    assertStrictEquals(row.kind, 'person');
    if (row.kind === 'person' && !row.pii.erased) {
        assertStrictEquals(row.pii.name, 'Ada');
        assertStrictEquals(row.pii.email, 'ada@x.io');
        assertStrictEquals(row.pii.phone, '555');
        assertStrictEquals(row.pii.bio, 'builds');
    } else {
        fail('expected a present-pii person row');
    }
});

Deno.test('getIdentityRoster reports a nameless service unnamed',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'syWUUcdBSbBgMwBiCrgbDw', {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'syWUUcdBSbBgMwBiCrgbDw');
    assert(row, 'roster row for syWUUcdBSbBgMwBiCrgbDw exists');
    assertStrictEquals(row.kind, 'service');
    if (row.kind === 'service') {
        assertStrictEquals(row.service.named, false);
    } else {
        fail('expected a service row');
    }
});

Deno.test('getIdentityRoster leaves a service unnamed'
+ ' (agents are not identities)',
async () => {
    const { ctx } = await setup();
    const serviceId = generateIdentifier();
    await postIdentityCreation(ctx, serviceId, {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === serviceId);
    assert(row, 'roster row for service exists');
    assertStrictEquals(row.kind, 'service');
    if (row.kind === 'service') {
        assertStrictEquals(row.service.named, false);
    } else {
        fail('expected a service row');
    }
});

Deno.test('getIdentityRoster reports erased person as erased',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
        kind: 'person',
        pii: {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        },
    });
    await ctx.DELETE('identities/pnXmXrxOWayANgDLdCjuBw/pii');
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'pnXmXrxOWayANgDLdCjuBw');
    assert(row, 'roster row for pnXmXrxOWayANgDLdCjuBw exists');
    assertStrictEquals(row.kind, 'person');
    assertStrictEquals(row.pii.erased, true);
});

Deno.test('getProviderEvents returns one identity\'s link log',
async () => {
    const { ctx } = await setup();
    await ctx.PUT('identities/pnXmXrxOWayANgDLdCjuBw/providers/'
        + 'YiJPbufDpkyrZcZCYbUJpg', {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw', provider: 'google',
        provider_subject: 'g-1', action: 'linked',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await ctx.PUT('identities/pnXmXrxOWayANgDLdCjuBw/providers/'
        + generateIdentifier(), {
        identity_id: 'pnXmXrxOWayANgDLdCjuBw', provider: 'google',
        provider_subject: 'g-1', action: 'unlinked',
        at: '2026-01-02T00:00:00.000000Z',
    });
    const otherId = generateIdentifier();
    await ctx.PUT('identities/' + otherId + '/providers/'
        + generateIdentifier(), {
        identity_id: otherId, provider: 'github',
        provider_subject: 'h-1', action: 'linked',
        at: '2026-01-03T00:00:00.000000Z',
    });
    const events = await getProviderEvents(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(events.length, 2);
    assertStrictEquals(
        events.every(e => e.providerSubject === 'g-1'),
        true,
    );
});

Deno.test('getTokenChainsFor groups one identity\'s tokens',
async () => {
    const { ctx } = await setup();
    const chain2 = generateIdentifier();
    const otherId = generateIdentifier();
    await ctx.PUT('identities/pnXmXrxOWayANgDLdCjuBw/tokens/'
        + generateIdentifier(), {
        jti: 'jmvogLnzTmiQlAkVvDHrvQ', identity_id: 'pnXmXrxOWayANgDLdCjuBw'
            , action: 'issued',
        chain_id: 'WeXjAaAxGSpLpamfEuvcww',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await ctx.PUT('identities/pnXmXrxOWayANgDLdCjuBw/tokens/'
        + generateIdentifier(), {
        jti: generateIdentifier(),
        identity_id: 'pnXmXrxOWayANgDLdCjuBw', action: 'issued',
        chain_id: 'WeXjAaAxGSpLpamfEuvcww',
        at: '2026-01-02T00:00:00.000000Z',
    });
    await ctx.PUT('identities/pnXmXrxOWayANgDLdCjuBw/tokens/'
        + generateIdentifier(), {
        jti: generateIdentifier(),
        identity_id: 'pnXmXrxOWayANgDLdCjuBw', action: 'issued',
        chain_id: chain2,
        at: '2026-01-03T00:00:00.000000Z',
    });
    await ctx.PUT('identities/' + otherId + '/tokens/'
        + generateIdentifier(), {
        jti: generateIdentifier(),
        identity_id: otherId, action: 'issued',
        chain_id: generateIdentifier(),
        at: '2026-01-04T00:00:00.000000Z',
    });
    const chains = await getTokenChainsFor(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(chains.length, 2);
    const WeXjAaAxGSpLpamfEuvcww = chains.find(
        c => c.chainId === 'WeXjAaAxGSpLpamfEuvcww');
    assert(WeXjAaAxGSpLpamfEuvcww, 'chain WeXjAaAxGSpLpamfEuvcww present');
    assertStrictEquals(WeXjAaAxGSpLpamfEuvcww.events.length, 2);
    const second = chains.find(c => c.chainId === chain2);
    assert(second, 'second chain present');
    assertStrictEquals(second.events.length, 1);
});
