import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedRootAdmin } from './root-admin-fixture.ts';
import {
    getIdentities,
    getIdentityRoster,
    postIdentityCreation,
} from '../web-app/app/adapters/identities.ts';
import {
    getProviderEvents,
} from '../web-app/app/adapters/identity-providers.ts';
import {
    getTokenChainsFor,
} from '../web-app/app/adapters/identity-tokens.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
    return {
        db,
        ctx: createRequestContext(db, await devToken()),
    };
}

test('getIdentities returns every identity row', async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'p1', {
        kind: 'person',
        pii: {
            name: 'Ada', email: 'ada@x.io',
            phone: '1', bio: 'b',
        },
    });
    await postIdentityCreation(ctx, 's1', {
        kind: 'service', secret: 'shh',
    });
    const all = await getIdentities(ctx);
    const ids = all.map(i => i.idForLink()).sort();
    assert.deepEqual(ids, ['p1', 's1']);
});

test('getIdentityRoster joins pii; person carries fields',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'p1', {
        kind: 'person',
        pii: {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        },
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'p1');
    assert.ok(row, 'roster row for p1 exists');
    assert.equal(row.kind, 'person');
    assert.equal(row.pii.erased, false);
    if (!row.pii.erased) {
        assert.equal(row.pii.name, 'Ada');
        assert.equal(row.pii.email, 'ada@x.io');
        assert.equal(row.pii.phone, '555');
        assert.equal(row.pii.bio, 'builds');
    }
});

test('getIdentityRoster reports service identity as erased',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 's1', {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 's1');
    assert.ok(row, 'roster row for s1 exists');
    assert.equal(row.kind, 'service');
    assert.equal(row.pii.erased, true);
});

test('getIdentityRoster reports erased person as erased',
async () => {
    const { ctx } = await setup();
    await postIdentityCreation(ctx, 'p1', {
        kind: 'person',
        pii: {
            name: 'Ada', email: 'ada@x.io',
            phone: '555', bio: 'builds',
        },
    });
    await ctx.DELETE('identity-pii/p1');
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 'p1');
    assert.ok(row, 'roster row for p1 exists');
    assert.equal(row.kind, 'person');
    assert.equal(row.pii.erased, true);
});

test('getProviderEvents returns one identity\'s link log',
async () => {
    const { ctx } = await setup();
    await ctx.PUT('identity-providers/e1', {
        identity_id: 'p1', provider: 'google',
        provider_subject: 'g-1', action: 'linked',
        at: '2026-01-01T00:00:00.000Z',
    });
    await ctx.PUT('identity-providers/e2', {
        identity_id: 'p1', provider: 'google',
        provider_subject: 'g-1', action: 'unlinked',
        at: '2026-01-02T00:00:00.000Z',
    });
    await ctx.PUT('identity-providers/e3', {
        identity_id: 'other', provider: 'github',
        provider_subject: 'h-1', action: 'linked',
        at: '2026-01-03T00:00:00.000Z',
    });
    const events = await getProviderEvents(ctx, 'p1');
    assert.equal(events.length, 2);
    assert.equal(
        events.every(e => e.providerSubject === 'g-1'),
        true,
    );
});

test('getTokenChainsFor groups one identity\'s tokens',
async () => {
    const { ctx } = await setup();
    await ctx.PUT('identity-tokens/t1', {
        jti: 'j1', identity_id: 'p1', action: 'issued',
        chain_id: 'c1', parent_jti: '',
        at: '2026-01-01T00:00:00.000Z',
    });
    await ctx.PUT('identity-tokens/t2', {
        jti: 'j2', identity_id: 'p1', action: 'issued',
        chain_id: 'c1', parent_jti: 'j1',
        at: '2026-01-02T00:00:00.000Z',
    });
    await ctx.PUT('identity-tokens/t3', {
        jti: 'j3', identity_id: 'p1', action: 'issued',
        chain_id: 'c2', parent_jti: '',
        at: '2026-01-03T00:00:00.000Z',
    });
    await ctx.PUT('identity-tokens/t4', {
        jti: 'j4', identity_id: 'other', action: 'issued',
        chain_id: 'c3', parent_jti: '',
        at: '2026-01-04T00:00:00.000Z',
    });
    const chains = await getTokenChainsFor(ctx, 'p1');
    assert.equal(chains.length, 2);
    const c1 = chains.find(c => c.chainId === 'c1');
    assert.ok(c1, 'chain c1 present');
    assert.equal(c1.events.length, 2);
    const c2 = chains.find(c => c.chainId === 'c2');
    assert.ok(c2, 'chain c2 present');
    assert.equal(c2.events.length, 1);
});
