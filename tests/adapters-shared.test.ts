import {
    assert,
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../client/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    getHumanMemberMap,
    getCurrentHumanMember,
} from '../client/members.ts';
import {
    memberName,
} from '../client/members-union.ts';
import {
    type Member,
    type MemberId,
} from '../shared/types.ts';
import {
    makeHumanMember,
    seedHumanMember,
} from './member-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';

Deno.test(
    'memberName returns name for known human id',
    () => {
        const u1 = generateIdentifier();
        const map = new Map<MemberId, Member>([
            [
                u1,
                makeHumanMember(u1, 'Alice Adams'),
            ],
        ]);
        assertStrictEquals(
            memberName(map, u1),
            'Alice Adams',
        );
    },
);

Deno.test('memberName throws for unknown id', () => {
    const map = new Map<MemberId, Member>();
    assertThrows(
        () => memberName(map, generateIdentifier()),
        Error,
        'unknown member',
    );
});

Deno.test(
    'getHumanMemberMap fetches members via adapter',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const u1 = generateIdentifier();
        await seedHumanMember(db, u1, 'Alice Adams');
        const ctx = createRequestContext(db, DEV_TOKEN);
        const map = await getHumanMemberMap(ctx);
        assert(map.has(u1));
        const pii = map.get(u1)?.pii();
        assert(pii !== undefined && !pii.erased);
        if (pii !== undefined && !pii.erased) {
            assertStrictEquals(pii.name, 'Alice Adams');
        }
        assertStrictEquals(
            memberName(map, u1),
            'Alice Adams',
        );
    },
);

Deno.test('Fresh ctx re-fetches each call', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const u1 = generateIdentifier();
    const u2 = generateIdentifier();
    await seedHumanMember(db, u1, 'Alice Adams');
    const mFNSxZqywTSMXhgUTdTqtA = await getHumanMemberMap(
        createRequestContext(db, DEV_TOKEN),
    );
    await seedHumanMember(db, u2, 'Bob Brown');
    const m2 = await getHumanMemberMap(
        createRequestContext(db, DEV_TOKEN),
    );
    assertNotStrictEquals(mFNSxZqywTSMXhgUTdTqtA, m2);
    assert(mFNSxZqywTSMXhgUTdTqtA.has(u1));
    assert(!mFNSxZqywTSMXhgUTdTqtA.has(u2));
    assert(m2.has(u1));
    assert(m2.has(u2));
});

Deno.test(
    'getCurrentHumanMember returns the identity',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Alice Adams',
        );
        const row = await getCurrentHumanMember(
            createRequestContext(db, DEV_TOKEN),
        );
        assertStrictEquals(row.id, 'XXZruirZyAOoRpNxaDnpSA');
    },
);

Deno.test(
    'RequestContext operationId is stable'
    + ' and unique',
    () => {
        const db = memoryDbAdapter();
        const a = createRequestContext(db, DEV_TOKEN);
        const b = createRequestContext(db, DEV_TOKEN);
        assertStrictEquals(
            a.operationId, a.operationId,
        );
        assertNotStrictEquals(
            a.operationId, b.operationId,
        );
        assertStrictEquals(
            isIdentifier(a.operationId), true,
        );
        assertStrictEquals(
            isIdentifier(b.operationId), true,
        );
    },
);

// One context is one operation. PUT and DELETE store
// that same operation-id line, and the client sends
// no request-id.
Deno.test(
    'one context sends one operation-id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, DEV_TOKEN);
        const pii = 'identities/'
            + 'XXZruirZyAOoRpNxaDnpSA/pii';
        await ctx.PUT(pii, {
            name: 'Ada',
            email: 'ada@x.io',
            phone: '555',
            bio: 'builds',
        });
        await ctx.DELETE(pii);
        const line = '\noperation-id: '
            + ctx.operationId;
        const rows = (await db.messagePairs.getAll())
            .filter((row) => row.request.includes(pii));
        assertStrictEquals(rows.length, 2);
        for (const row of rows) {
            assertStrictEquals(
                row.request.includes('request-id:'),
                false,
            );
            assert(
                row.request.includes(line),
                'stored request must carry the'
                + ' context operation-id',
            );
        }
    },
);
