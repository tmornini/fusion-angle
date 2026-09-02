import {
    assert,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getMembers,
    getMemberMap,
    memberName,
    isHumanMember,
    isAIMember,
    MEMBER_WITHOUT_PII_NAME,
    fillHumanMemberProfile,
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
    formWriteMessagePair,
} from '../api/message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const NULL_STORAGE: Partial<Storage> = {
    getItem: () => null,
    setItem: () => {},
};

async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
    humanId: string;
    aiId: string;
}> {
    const db = memoryDbAdapter();
    const humanId = generateIdentifier();
    const aiId = generateIdentifier();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, humanId, 'Sarah Test',
    );
    await seedAIMember(
        db, aiId, 'Claude Opus',
    );
    return { db, humanId, aiId };
}

Deno.test(
    'getMembers omits system; getMemberMap'
    + ' resolves it as an author',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, generateIdentifier(), 'Sarah Chen',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const roster = await getMembers(ctx);
        assert(
            !roster.some(
                w => w.idForLink() === SYSTEM_MEMBER_ID,
            ),
            'roster excludes the system member',
        );
        const map = await getMemberMap(ctx);
        assertStrictEquals(
            memberName(map, SYSTEM_MEMBER_ID),
            SYSTEM_MEMBER_NAME,
        );
    }),
);

Deno.test(
    'getMembers returns humans and AIs unioned'
    + ' with correct kind discriminator',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, humanId, aiId } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const members = await getMembers(ctx);
        assertStrictEquals(members.length, 3);
        const human = members.find(
            m => m.idForLink() === humanId,
        );
        const ai = members.find(isAIMember)!;
        assert(human);
        assert(isHumanMember(human));
        assert(ai);
        assertStrictEquals(human.kind, 'human');
        assertStrictEquals(ai.kind, 'ai');
        assertStrictEquals(
            ai.idForLink(), aiId,
        );
    }),
);

// Former adapters-state-events pin: bulk member lifecycle
// is the GET-stamped members collection — spans kinds and
// never admits a foreign entity id (idea) as a member.
Deno.test(
    'getMembers spans kinds and excludes an idea',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, humanId, aiId } = await setupSeeded();
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'fndCYAsXazdzMUlEGMNIZw', {
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
        assert(ids.includes(humanId));
        assert(ids.includes(aiId));
        assert(
            !ids.includes('fndCYAsXazdzMUlEGMNIZw'),
            'idea must not leak into members',
        );
    }),
);

Deno.test(
    'getMemberMap keys by id with both kinds'
    + ' present',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, humanId, aiId } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assertStrictEquals(map.size, 4);
        const human = map.get(humanId)!;
        const ai = map.get(aiId)!;
        assert(human);
        assert(ai);
        assertStrictEquals(human.kind, 'human');
        assertStrictEquals(ai.kind, 'ai');
    }),
);

Deno.test(
    'memberName returns the display name for'
    + ' both human and AI kinds',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, humanId, aiId } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assertStrictEquals(
            memberName(map, humanId),
            'Sarah Test',
        );
        assertStrictEquals(
            memberName(map, aiId),
            'Claude Opus',
        );
    }),
);

Deno.test(
    'memberName is polymorphic across human'
    + ' and AI kinds',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, humanId, aiId } = await setupSeeded();
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assertStrictEquals(
            memberName(map, humanId),
            'Sarah Test',
        );
        assertStrictEquals(
            memberName(map, aiId),
            'Claude Opus',
        );
    }),
);

Deno.test(
    'memberName throws on missing id (matches'
    + ' personName contract)',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const map = new Map<MemberId, Member>();
        assertThrows(
            () => memberName(map, 'hw_missing'),
            Error,
            'unknown member',
        );
    }),
);

Deno.test(
    'getMembers on a schema-only db is the'
    + ' seated root admin',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await adminContext();
        const members = await getMembers(ctx);
        assertStrictEquals(members.length, 1);
        assertStrictEquals(
            members[0]?.idForLink(), 'XXZruirZyAOoRpNxaDnpSA',
        );
        assert(
            members[0] !== undefined
            && isHumanMember(members[0]),
        );
        assertStrictEquals(
            memberName(
                await getMemberMap(ctx), 'XXZruirZyAOoRpNxaDnpSA',
            ),
            MEMBER_WITHOUT_PII_NAME,
        );
    }),
);

Deno.test(
    'memberName degrades visibly when a human'
    + ' has no identity_pii row (erased)',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
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
        const memberId = generateIdentifier();
        const messagePair = await formWriteMessagePair({
            method: 'PUT',
            pathname: '/identities/' + memberId,
            routePattern: 'identities/:id',
            routeSegments: ['identities', ':id'],
            pathSegments: [
                'identities', memberId,
            ],
            headerFields: [],
            body: identityBody,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            requestAt: nowUtc(),
            organization: undefined,
            responseStatus: spec.status,
            responseBody: spec.successBody?.(
                [memberId], identityBody,
                SYSTEM_MEMBER_ID, undefined,
            ),
            operationId: TEST_OPERATION_ID,
        });
        await postIdentityDocumentOp(
            db, memberId, identityBody,
            SYSTEM_MEMBER_ID, messagePair,
        );
        await seedSeat(
            db, 'AjdvjuECVZEgZoFajaIEkg', memberId, 'member',
        );
        const ctx = createRequestContext(db, await organizationToken());
        const map = await getMemberMap(ctx);
        assertStrictEquals(
            memberName(map, memberId),
            MEMBER_WITHOUT_PII_NAME,
        );
    }),
);

Deno.test(
    'getMembers fills live PII names; an erased'
    + ' slot stays Member without PII',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await adminContext();
        const aliceId = generateIdentifier();
        const agentId = generateIdentifier();
        await seedHumanMember(
            db, aliceId, 'Alice Test',
        );
        await seedAIMember(
            db, agentId, 'Claude Opus',
        );
        const members = await getMembers(ctx);
        const alice = members.find(
            m => m.idForLink() === aliceId,
        );
        assert(alice && isHumanMember(alice));
        const pii = alice.pii();
        assert(!pii.erased);
        if (!pii.erased) {
            assertStrictEquals(pii.name, 'Alice Test');
        }
        const agent = members.find(
            m => m.idForLink() === agentId,
        );
        assert(agent && isAIMember(agent));
        assertStrictEquals(agent.name(), 'Claude Opus');
        const map = await getMemberMap(ctx);
        assertStrictEquals(
            memberName(map, aliceId), 'Alice Test',
        );
    }),
);

Deno.test(
    'fillHumanMemberProfile copies identity title'
    + ' and department onto list rows',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { db, ctx } = await adminContext();
        const aliceId = generateIdentifier();
        await seedHumanMember(
            db, aliceId, 'Alice Test',
        );
        const filled = await fillHumanMemberProfile(
            ctx, await getMembers(ctx),
        );
        const alice = filled.find(
            m => m.idForLink() === aliceId,
        );
        assert(alice && isHumanMember(alice));
        const profile = alice.profile();
        assertStrictEquals(profile.present, true);
        if (profile.present) {
            assertStrictEquals(
                profile.title, 'product_manager',
            );
            assertStrictEquals(
                profile.department, 'Product',
            );
        }
    }),
);

Deno.test(
    'fillHumanMemberProfile does not throw when an'
    + ' identity document is absent',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const { ctx } = await adminContext();
        const filled = await fillHumanMemberProfile(
            ctx, await getMembers(ctx),
        );
        assert(filled.some(isHumanMember));
    }),
);
