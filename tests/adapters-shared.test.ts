import {
    assert,
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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
import { generateIdentifier } from
    '../shared/identifier.ts';

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
    'RequestContext requestId is stable'
    + ' and unique',
    () => {
        const db = memoryDbAdapter();
        const a = createRequestContext(db, DEV_TOKEN);
        const b = createRequestContext(db, DEV_TOKEN);
        assertStrictEquals(
            a.requestId, a.requestId,
        );
        assertNotStrictEquals(
            a.requestId, b.requestId,
        );
        assert(a.requestId.length > 0);
    },
);

// The client vessel mints one requestId; the wire verbs must
// hoist it so incomingContext reuses it (message-plane request
// message carries the header) instead of minting a second
// unrelated trace that reportFault cannot correlate.
Deno.test(
    'client requestId rides the wire as request-id',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, DEV_TOKEN);
        await ctx.PUT(
            'identities/' + generateIdentifier(),
            { kind: 'person' },
        );
        const rows = await db.messagePairs.getAll();
        assert(
            rows.some(
                r => r.request.includes(
                    '\nrequest-id: ' + ctx.requestId,
                ),
            ),
            'stored pair must carry the client requestId',
        );
    },
);
