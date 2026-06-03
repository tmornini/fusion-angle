import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import {
    getHumanMemberMap,
    getCurrentHumanMember,
} from '../web-app/app/adapters/members.ts';
import {
    memberName,
} from '../web-app/app/adapters/members-union.ts';
import {
    type Member,
    type MemberId,
} from '../api/types.ts';
import {
    makeHumanMember,
    seedHumanMember,
} from './member-fixtures.ts';

test(
    'memberName returns name for known human id',
    () => {
        const map = new Map<MemberId, Member>([
            [
                'u1',
                makeHumanMember('u1', 'Alice Adams'),
            ],
        ]);
        assert.equal(
            memberName(map, 'u1'),
            'Alice Adams',
        );
    },
);

test('memberName throws for unknown id', () => {
    const map = new Map<MemberId, Member>();
    assert.throws(
        () => memberName(map, 'missing'),
        /unknown member/,
    );
});

test(
    'getHumanMemberMap fetches members via adapter',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanMember(db, 'u1', 'Alice Adams');
        const ctx = createRequestContext(db, devToken());
        const map = await getHumanMemberMap(ctx);
        assert.equal(map.size, 1);
        const pii = map.get('u1')?.pii();
        assert.equal(
            pii !== undefined && !pii.erased
                ? pii.name
                : undefined,
            'Alice Adams',
        );
    },
);

test('Fresh ctx re-fetches each call', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await seedHumanMember(db, 'u1', 'Alice Adams');
    const m1 = await getHumanMemberMap(
        createRequestContext(db, devToken()),
    );
    await seedHumanMember(db, 'u2', 'Bob Brown');
    const m2 = await getHumanMemberMap(
        createRequestContext(db, devToken()),
    );
    assert.notEqual(m1, m2);
    assert.equal(m1.size, 1);
    assert.equal(m2.size, 2);
});

test(
    'getCurrentHumanMember returns the identity',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanMember(
            db, 'current', 'Alice Adams',
        );
        const row = await getCurrentHumanMember(
            createRequestContext(db, devToken()),
        );
        assert.equal(row.id, 'current');
        assert.equal(row.type, 'human');
    },
);

test(
    'RequestContext requestId is stable'
    + ' and unique',
    () => {
        const db = new MemoryDbAdapter();
        const a = createRequestContext(db, devToken());
        const b = createRequestContext(db, devToken());
        assert.equal(
            a.requestId, a.requestId,
        );
        assert.notEqual(
            a.requestId, b.requestId,
        );
        assert.ok(a.requestId.length > 0);
    },
);
