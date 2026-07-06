import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
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
import {
    firstProviderModel,
} from './member-fixtures.ts';
import {
    postAiMemberDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';

async function setup() {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    return {
        db,
        ctx: createRequestContext(db, await devToken()),
    };
}

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
    await postIdentityCreation(ctx, 's1', {
        kind: 'service', secret: 'shh',
    });
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 's1');
    assert.ok(row, 'roster row for s1 exists');
    assert.equal(row.kind, 'service');
    if (row.kind === 'service') {
        assert.equal(row.service.named, false);
    } else {
        assert.fail('expected a service row');
    }
});

test('getIdentityRoster names a service from its ai-member',
async () => {
    const { db, ctx } = await setup();
    await postIdentityCreation(ctx, 's2', {
        kind: 'service', secret: 'shh',
    });
    // The ai-members detail write is re-pointed onto the message
    // pair postAiMemberDocumentOp appends (finding 18's fixture
    // budget): getIdentityRoster reads ctx.GET('ai-members'),
    // which is now ledger-derived, so a raw row here would never
    // surface in the round-trip this test exercises.
    const detail = {
        name: 'Grok 4.3',
        description: 'Fast reasoning model',
        skill_focus: '',
        model: firstProviderModel().id,
    };
    const entry = WRITE_RESPONSE_SPECS['ai-members/:id'];
    if (
        entry === undefined
        || 'status' in entry
        || entry.put === undefined
    ) {
        throw new Error(
            'no per-write response spec for ai-members/:id',
        );
    }
    const spec = entry.put;
    const pair = await formWritePair({
        method: 'PUT',
        pathname: '/ai-members/s2',
        routePattern: 'ai-members/:id',
        routeSegments: ['ai-members', ':id'],
        pathSegments: ['ai-members', 's2'],
        headerFields: [],
        body: detail,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            ['s2'], detail, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
    await postAiMemberDocumentOp(
        db, 's2', detail, SYSTEM_MEMBER_ID, pair,
    );
    const roster = await getIdentityRoster(ctx);
    const row = roster.find(r => r.id === 's2');
    assert.ok(row, 'roster row for s2 exists');
    assert.equal(row.kind, 'service');
    if (row.kind === 'service' && row.service.named) {
        assert.equal(row.service.name, 'Grok 4.3');
        assert.equal(
            row.service.detail, 'Fast reasoning model',
        );
    } else {
        assert.fail('expected a named service row');
    }
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
    await ctx.DELETE('identities/p1/pii');
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
        at: '2026-01-01T00:00:00.000000Z',
    });
    await ctx.PUT('identity-providers/e2', {
        identity_id: 'p1', provider: 'google',
        provider_subject: 'g-1', action: 'unlinked',
        at: '2026-01-02T00:00:00.000000Z',
    });
    await ctx.PUT('identity-providers/e3', {
        identity_id: 'other', provider: 'github',
        provider_subject: 'h-1', action: 'linked',
        at: '2026-01-03T00:00:00.000000Z',
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
        chain_id: 'c1',
        at: '2026-01-01T00:00:00.000000Z',
    });
    await ctx.PUT('identity-tokens/t2', {
        jti: 'j2', identity_id: 'p1', action: 'issued',
        chain_id: 'c1',
        at: '2026-01-02T00:00:00.000000Z',
    });
    await ctx.PUT('identity-tokens/t3', {
        jti: 'j3', identity_id: 'p1', action: 'issued',
        chain_id: 'c2',
        at: '2026-01-03T00:00:00.000000Z',
    });
    await ctx.PUT('identity-tokens/t4', {
        jti: 'j4', identity_id: 'other', action: 'issued',
        chain_id: 'c3',
        at: '2026-01-04T00:00:00.000000Z',
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
