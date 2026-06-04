// @ts-expect-error - Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getMembers,
    getMemberMap,
    memberName,
    isHumanMember,
    isAIMember,
} from '../web-app/app/adapters/members-union.ts';
import type {
    MemberId,
    Member,
} from '../api/types.ts';
import {
    SYSTEM_MEMBER_NAME,
} from '../api/types.ts';
import {
    seedHumanMember,
    seedAIMember,
} from './member-fixtures.ts';
import {
    seedRootAdmin,
} from './root-admin-fixture.ts';

async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
}> {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedRootAdmin(db);
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
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        await seedHumanMember(
            db, 'hw_sarah', 'Sarah Chen',
        );
        await db.members.put('system', {
            type: 'system',
        });
        await db.states.record(
            'st-system', 'system',
            'active', 'system',
        );
        const ctx = createRequestContext(db, devToken());
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
        const ctx = createRequestContext(db, devToken());
        const members = await getMembers(ctx);
        assert.equal(members.length, 2);
        const human = members.find(isHumanMember)!;
        const ai = members.find(isAIMember)!;
        assert.ok(human);
        assert.ok(ai);
        assert.equal(human.kind, 'human');
        assert.equal(ai.kind, 'ai');
        assert.equal(
            human.idForLink(), 'hw_sarah_chen',
        );
        assert.equal(
            ai.idForLink(), 'ai_claude_opus',
        );
    },
);

test(
    'getMemberMap keys by id with both kinds'
    + ' present',
    async () => {
        const { db } = await setupSeeded();
        const ctx = createRequestContext(db, devToken());
        const map = await getMemberMap(ctx);
        assert.equal(map.size, 2);
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
        const ctx = createRequestContext(db, devToken());
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
        const ctx = createRequestContext(db, devToken());
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
    'getMembers on an empty database returns'
    + ' an empty array',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        const ctx = createRequestContext(db, devToken());
        const members = await getMembers(ctx);
        assert.deepEqual(members, []);
    },
);

test(
    'memberName degrades visibly when a human'
    + ' has no identity_pii row (erased)',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedRootAdmin(db);
        await db.members.put('hw_erased', {
            type: 'human',
        });
        await db.humanMembers.put('hw_erased', {
            title: 'product_manager',
            department: 'Product',
            strengths: '[]' as never,
            team_dimensions: '{}' as never,
        });
        await db.identities.put('hw_erased', {
            kind: 'person',
        });
        await db.states.record(
            'st-hw_erased', 'hw_erased',
            'active', 'system',
        );
        const ctx = createRequestContext(db, devToken());
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'hw_erased'),
            'Unknown member',
        );
    },
);
