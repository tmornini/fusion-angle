import { TEST_OPERATION_ID } from './http-fixtures.ts';
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken, organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getMembers,
    getMemberMap,
    memberName,
    isHumanMember,
    isAIMember,
    MEMBER_WITHOUT_PII_NAME,
} from '../web-app/app/adapters/members-union.ts';
import type {
    MemberId,
    Member,
} from '../api/types.ts';
import {
    SYSTEM_MEMBER_NAME,
    SYSTEM_MEMBER_ID,
    nowUtc,
} from '../api/types.ts';
import {
    seedHumanMember,
    seedAIMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
} from '../api/message-pair.ts';
async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'hw_sarah_chen', 'Sarah Test',
    );
    await seedAIMember(
        db, 'ai_claude_opus', 'Claude Opus',
    );
    return { db };
}

test(
    'getMembers omits system; getMemberMap'
    + ' resolves it as an author',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'hw_sarah', 'Sarah Chen',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const roster = await getMembers(ctx);
        assert.ok(
            !roster.some(
                w => w.idForLink() === 'system',
            ),
            'roster excludes the system member',
        );
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'system'),
            SYSTEM_MEMBER_NAME,
        );
    },
);

test(
    'getMembers returns humans and AIs unioned'
    + ' with correct kind discriminator',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const members = await getMembers(ctx);
        assert.equal(members.length, 3);
        const human = members.find(
            m => m.idForLink() === 'hw_sarah_chen',
        );
        const ai = members.find(isAIMember)!;
        assert.ok(human);
        assert.ok(isHumanMember(human));
        assert.ok(ai);
        assert.equal(human.kind, 'human');
        assert.equal(ai.kind, 'ai');
        assert.equal(
            ai.idForLink(), 'ai_claude_opus',
        );
    },
);

// Former adapters-state-events pin: bulk member lifecycle
// is the GET-stamped members collection — spans kinds and
// never admits a foreign entity id (idea) as a member.
test(
    'getMembers spans kinds and excludes an idea',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        await ctx.PUT('organizations/1/ideas/i1', {
            title: 'I',
            position: 1,
            problem_statement: 'p',
            target_users: 't',
            proposed_solution: 's',
            expected_outcome: 'o',
            success_metrics: 'm',
            state: 'active',
        });
        const members = await getMembers(ctx);
        const ids = members.map(m => m.idForLink());
        assert.ok(ids.includes('hw_sarah_chen'));
        assert.ok(ids.includes('ai_claude_opus'));
        assert.ok(
            !ids.includes('i1'),
            'idea must not leak into members',
        );
    },
);

test(
    'getMemberMap keys by id with both kinds'
    + ' present',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assert.equal(map.size, 4);
        const human = map.get('hw_sarah_chen')!;
        const ai = map.get('ai_claude_opus')!;
        assert.ok(human);
        assert.ok(ai);
        assert.equal(human.kind, 'human');
        assert.equal(ai.kind, 'ai');
    },
);

test(
    'memberName returns the display name for'
    + ' both human and AI kinds',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'hw_sarah_chen'),
            'Sarah Test',
        );
        assert.equal(
            memberName(map, 'ai_claude_opus'),
            'Claude Opus',
        );
    },
);

test(
    'memberName is polymorphic across human'
    + ' and AI kinds',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'hw_sarah_chen'),
            'Sarah Test',
        );
        assert.equal(
            memberName(map, 'ai_claude_opus'),
            'Claude Opus',
        );
    },
);

test(
    'memberName throws on missing id (matches'
    + ' personName contract)',
    async () => {
        const map = new Map<MemberId, Member>();
        assert.throws(
            () => memberName(map, 'hw_missing'),
            /unknown member/,
        );
    },
);

test(
    'getMembers on a schema-only db is the'
    + ' seated root admin',
    async () => {
        const { ctx } = await adminContext();
        const members = await getMembers(ctx);
        assert.equal(members.length, 1);
        assert.equal(
            members[0]?.idForLink(), 'current',
        );
        assert.ok(
            members[0] !== undefined
            && isHumanMember(members[0]),
        );
        assert.equal(
            memberName(
                await getMemberMap(ctx), 'current',
            ),
            MEMBER_WITHOUT_PII_NAME,
        );
    },
);

test(
    'memberName degrades visibly when a human'
    + ' has no identity_pii row (erased)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const { seedSeat } = await import(
            './root-admin-fixture.ts'
        );
        const {
            postIdentityDocumentOp,
            identityDocumentBodyOf,
        } = await import('../api/routes.ts');
        const identityBody = identityDocumentBodyOf(
            'person', {
                title: 'product_manager',
                department: 'Product',
                strengths: [],
                team_dimensions: {},
            },
        );
        const spec = WRITE_RESPONSE_SPECS['identities/:id'];
        if (spec === undefined || !('status' in spec)) {
            throw new Error('no identities/:id spec');
        }
        const pair = await formWritePair({
            method: 'PUT',
            pathname: '/identities/member_without_pii',
            routePattern: 'identities/:id',
            routeSegments: ['identities', ':id'],
            pathSegments: [
                'identities', 'member_without_pii',
            ],
            headerFields: [],
            body: identityBody,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            requestAt: nowUtc(),
            organization: undefined,
            responseStatus: spec.status,
            responseBody: spec.successBody?.(
                ['member_without_pii'], identityBody,
                SYSTEM_MEMBER_ID, undefined,
            ),
            operationId: TEST_OPERATION_ID,
        });
        await postIdentityDocumentOp(
            db, 'member_without_pii', identityBody,
            SYSTEM_MEMBER_ID, pair,
        );
        await seedSeat(
            db, '1', 'member_without_pii', 'member',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'member_without_pii'),
            MEMBER_WITHOUT_PII_NAME,
        );
    },
);

test(
    'getMembers fills live PII names; an erased'
    + ' slot stays Member without PII',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'u1', 'Alice Test',
        );
        await seedAIMember(
            db, 'ai1', 'Claude Opus',
        );
        const members = await getMembers(ctx);
        const alice = members.find(
            m => m.idForLink() === 'u1',
        );
        assert.ok(alice && isHumanMember(alice));
        const pii = alice.pii();
        assert.ok(!pii.erased);
        if (!pii.erased) {
            assert.equal(pii.name, 'Alice Test');
        }
        const agent = members.find(
            m => m.idForLink() === 'ai1',
        );
        assert.ok(agent && isAIMember(agent));
        assert.equal(agent.name(), 'Claude Opus');
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'u1'), 'Alice Test',
        );
    },
);
