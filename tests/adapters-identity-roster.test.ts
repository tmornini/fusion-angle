import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('getIdentityRoster joins pii; person carries fields',
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
    assert.ok(row, 'roster row for pnXmXrxOWayANgDLdCjuBw exists');
    assert.equal(row.kind, 'person');
    if (row.kind === 'person' && !row.pii.erased) {
        assert.equal(row.pii.name, 'Ada');
        assert.equal(row.pii.email, 'ada@x.io');
        assert.equal(row.pii.phone, '555');
        assert.equal(row.pii.bio, 'builds');
    } else {
        assert.fail('expected a present-pii person row');
    }
});

test('getIdentityRoster reports a nameless service unnamed',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'syWUUcdBSbBgMwBiCrgbDw', {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'syWUUcdBSbBgMwBiCrgbDw');
    assert.ok(row, 'roster row for syWUUcdBSbBgMwBiCrgbDw exists');
    assert.equal(row.kind, 'service');
    if (row.kind === 'service') {
        assert.equal(row.service.named, false);
    } else {
        assert.fail('expected a service row');
    }
});

test('getIdentityRoster leaves a service unnamed'
+ ' (agents are not identities)',
async () => {
    const { ctx } = await setup();
    const serviceId = generateIdentifier();
    await postIdentityCreation(ctx, serviceId, {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === serviceId);
    assert.ok(row, 'roster row for service exists');
    assert.equal(row.kind, 'service');
    if (row.kind === 'service') {
        assert.equal(row.service.named, false);
    } else {
        assert.fail('expected a service row');
    }
});

test('getIdentityRoster reports erased person as erased',
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
    assert.ok(row, 'roster row for pnXmXrxOWayANgDLdCjuBw exists');
    assert.equal(row.kind, 'person');
    assert.equal(row.pii.erased, true);
});

test('getProviderEvents returns one identity\'s link log',
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
    assert.equal(events.length, 2);
    assert.equal(
        events.every(e => e.providerSubject === 'g-1'),
        true,
    );
});

test('getTokenChainsFor groups one identity\'s tokens',
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
    assert.equal(chains.length, 2);
    const WeXjAaAxGSpLpamfEuvcww = chains.find(
        c => c.chainId === 'WeXjAaAxGSpLpamfEuvcww');
    assert.ok(WeXjAaAxGSpLpamfEuvcww, 'chain WeXjAaAxGSpLpamfEuvcww present');
    assert.equal(WeXjAaAxGSpLpamfEuvcww.events.length, 2);
    const second = chains.find(c => c.chainId === chain2);
    assert.ok(second, 'second chain present');
    assert.equal(second.events.length, 1);
});
