import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
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
import {
    seedAdminSchema,
} from './test-fixtures.ts';

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
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, 'u1', 'Alice Adams');
        const ctx = createRequestContext(db, DEV_TOKEN);
        const map = await getHumanMemberMap(ctx);
        assert.ok(map.has('u1'));
        const pii = map.get('u1')?.pii();
        assert.ok(pii !== undefined && !pii.erased);
        if (pii !== undefined && !pii.erased) {
            assert.equal(pii.name, 'Alice Adams');
        }
        assert.equal(
            memberName(map, 'u1'),
            'Alice Adams',
        );
    },
);

test('Fresh ctx re-fetches each call', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(db, 'u1', 'Alice Adams');
    const m1 = await getHumanMemberMap(
        createRequestContext(db, DEV_TOKEN),
    );
    await seedHumanMember(db, 'u2', 'Bob Brown');
    const m2 = await getHumanMemberMap(
        createRequestContext(db, DEV_TOKEN),
    );
    assert.notEqual(m1, m2);
    assert.ok(m1.has('u1'));
    assert.ok(!m1.has('u2'));
    assert.ok(m2.has('u1'));
    assert.ok(m2.has('u2'));
});

test(
    'getCurrentHumanMember returns the identity',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'current', 'Alice Adams',
        );
        const row = await getCurrentHumanMember(
            createRequestContext(db, DEV_TOKEN),
        );
        assert.equal(row.id, 'current');
    },
);

test(
    'RequestContext requestId is stable'
    + ' and unique',
    () => {
        const db = memoryDbAdapter();
        const a = createRequestContext(db, DEV_TOKEN);
        const b = createRequestContext(db, DEV_TOKEN);
        assert.equal(
            a.requestId, a.requestId,
        );
        assert.notEqual(
            a.requestId, b.requestId,
        );
        assert.ok(a.requestId.length > 0);
    },
);

// The client vessel mints one requestId; the wire verbs must
// hoist it so incomingContext reuses it (pair-plane request
// message carries the header) instead of minting a second
// unrelated trace that reportFault cannot correlate.
test(
    'client requestId rides the wire as x-request-id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, DEV_TOKEN);
        await ctx.PUT(
            'identities/trace-me',
            { kind: 'person' },
        );
        const rows = await db.requests.getAll();
        assert.ok(
            rows.some(
                r => r.message.includes(ctx.requestId),
            ),
            'stored pair must carry the client requestId',
        );
    },
);
