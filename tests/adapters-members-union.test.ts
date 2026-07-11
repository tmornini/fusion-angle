// @ts-expect-error — Node global stub
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
    Id,
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
    postMemberDocumentOp,
    postHumanMemberDocumentOp,
    postMembershipDocumentOp,
    memberDocumentBodyOf,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';

// Below-facade pair formation for this file's raw-write
// re-points (finding 18's fixture budget) — the SAME mechanism
// tests/member-fixtures.ts uses (Step 1), LOCAL here because
// this file needs bodies member-fixtures.ts never forms: a
// system-typed member document, and a human member with NO
// identity_pii row (the erased-PII scenario below). 'members/:id'
// and 'memberships/:id' share ONE flat WriteResponseSpec shape;
// 'human-members/:id' carries a PER-VERB spec instead (the
// ai-members/:id precedent) — the same split
// tests/member-fixtures.ts's own memberDocumentPair/
// detailDocumentPair pair draws, mirrored here rather than
// forced into one shape.
async function flatDocumentPair(
    routePattern: 'members/:id' | 'memberships/:id',
    id: Id,
    body: Record<string, unknown>,
    organization: Id | undefined,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS[routePattern];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for ' + routePattern,
        );
    }
    const segment = routePattern.split('/')[0]!;
    return formWritePair({
        method: 'PUT',
        pathname: `/${segment}/${id}`,
        routePattern,
        routeSegments: [segment, ':id'],
        pathSegments: [segment, id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, organization,
        ),
        headPairId: undefined,
    });
}

async function humanDetailPair(
    id: Id,
    detail: Record<string, unknown>,
): Promise<MessagePair> {
    const entry = WRITE_RESPONSE_SPECS['human-members/:id'];
    if (
        entry === undefined
        || 'status' in entry
        || entry.put === undefined
    ) {
        throw new Error(
            'no per-write response spec for human-members/:id',
        );
    }
    const spec = entry.put;
    return formWritePair({
        method: 'PUT',
        pathname: `/human-members/${id}`,
        routePattern: 'human-members/:id',
        routeSegments: ['human-members', ':id'],
        pathSegments: ['human-members', id],
        headerFields: [],
        body: detail,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], detail, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
}

async function setupSeeded(): Promise<{
    db: MemoryDbAdapter;
}> {
    const db = new MemoryDbAdapter();
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
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(
            db, 'hw_sarah', 'Sarah Chen',
        );
        // Lifecycle rides the members/:id document trio —
        // the same path a live PUT members/:id state change
        // would take (states-address retirement).
        const systemBody = memberDocumentBodyOf('system', {
            state: 'active',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-system',
        });
        await postMemberDocumentOp(
            db, 'system', systemBody, SYSTEM_MEMBER_ID,
            await flatDocumentPair(
                'members/:id', 'system', systemBody, undefined,
            ),
        );
        const ctx = createRequestContext(db, await devToken());
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
        const ctx = createRequestContext(db, await devToken());
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
        const ctx = createRequestContext(db, await devToken());
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
        const ctx = createRequestContext(db, await devToken());
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
        const ctx = createRequestContext(db, await devToken());
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
        const { ctx } = await adminContext();
        const members = await getMembers(ctx);
        assert.deepEqual(members, []);
    },
);

test(
    'memberName degrades visibly when a human'
    + ' has no identity_pii row (erased)',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        // Lifecycle rides the members/:id document trio —
        // same path as the system-member seed above.
        const memberBody = memberDocumentBodyOf('human', {
            state: 'active',
            stateAt: '2026-01-01T00:00:00.000000Z',
            stateEventId: 'st-member_without_pii',
        });
        await postMemberDocumentOp(
            db, 'member_without_pii', memberBody,
            SYSTEM_MEMBER_ID,
            await flatDocumentPair(
                'members/:id', 'member_without_pii',
                memberBody, undefined,
            ),
        );
        const detail = {
            title: 'product_manager',
            department: 'Product',
            strengths: '[]' as never,
            team_dimensions: '{}' as never,
        };
        await postHumanMemberDocumentOp(
            db, 'member_without_pii', detail, SYSTEM_MEMBER_ID,
            await humanDetailPair('member_without_pii', detail),
        );
        // Erasure removes PII, not the membership — the member
        // still belongs to the org, so the join still finds it.
        const membershipBody = {
            organization_id: '1',
            identity_id: 'member_without_pii',
            at: '2020-01-01T00:00:00.000000Z',
        };
        await postMembershipDocumentOp(
            db, 'mb-member_without_pii', membershipBody,
            SYSTEM_MEMBER_ID,
            await flatDocumentPair(
                'memberships/:id', 'mb-member_without_pii',
                membershipBody, '1',
            ),
        );
        const ctx = createRequestContext(db, await devToken());
        const map = await getMemberMap(ctx);
        assert.equal(
            memberName(map, 'member_without_pii'),
            MEMBER_WITHOUT_PII_NAME,
        );
    },
);
