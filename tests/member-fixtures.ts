import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanMember,
    AIMember,
    SYSTEM_MEMBER_ID,
    nowUtc,
    type Id,
    type MemberState,
} from '../api/types.ts';
import {
    getModelsByProvider,
} from '../api/provider-models.ts';
import {
    postAiMemberCreationOp,
    postHumanMemberCreationOp,
    postMembershipDocumentOp,
    memberDocumentBodyOf,
    aiMemberDetailBodyOf,
    humanMemberDetailBodyOf,
    WRITE_RESPONSE_SPECS,
    type MemberWritePairs,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';

// The catalog's first model — the fixture default.
export function firstProviderModel() {
    return [...getModelsByProvider()
        .values()][0]![0]!;
}

// Build/seed members in the post-normalization shape: a
// parent row (type only) plus a kind-specific detail row,
// sharing one id. The display name lives with the kind —
// ai_members.name, identity_pii.name. Fixtures use these
// so the two-table member shape lives in exactly one place.

function humanDetail() {
    return {
        title: 'product_manager',
        department: 'Product',
        strengths: '[]',
        team_dimensions: '{}',
    };
}

function aiDetail() {
    return {
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

export function makeHumanMember(
    id: string,
    name: string,
    state: MemberState = 'active',
): HumanMember {
    return new HumanMember(
        { id, type: 'human' },
        { id, ...humanDetail() },
        {
            erased: false,
            name,
            email: `${id}@example.com`.toLowerCase(),
            phone: '',
            bio: '',
        },
        state,
    );
}

export function makeAIMember(
    id: string,
    name: string,
    state: MemberState = 'active',
): AIMember {
    return new AIMember(
        { id, type: 'ai' },
        { id, name, ...aiDetail() },
        state,
    );
}

// Below-facade pair formation for the seeded writes below,
// re-pointed onto the SAME mechanism the live routes use:
// the shared members/:id document plus the kind's own
// operation + detail document postAiMemberCreationOp /
// postHumanMemberCreationOp append (api/routes.ts), formed
// via the SAME body builders (memberDocumentBodyOf,
// aiMemberDetailBodyOf, humanMemberDetailBodyOf) and the SAME
// WRITE_RESPONSE_SPECS a live PUT would answer through — so a
// later flip to message-derived reads sees a fixture-seeded
// member exactly as it would a live-written one. Every id,
// at, state, and field value stays IDENTICAL to the raw puts
// this replaces — only the write MECHANISM changes.

const MEMBER_ORGANIZATION: Id = '1';

async function memberDocumentPair(
    id: Id,
    type: 'human' | 'ai',
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['members/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for members/:id',
        );
    }
    const body = memberDocumentBodyOf(type);
    return formWritePair({
        method: 'PUT',
        pathname: `/members/${id}`,
        routePattern: 'members/:id',
        routeSegments: ['members', ':id'],
        pathSegments: ['members', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
}

async function detailDocumentPair(
    routePattern: 'ai-members/:id' | 'human-members/:id',
    id: Id,
    detail: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const entry = WRITE_RESPONSE_SPECS[routePattern];
    if (
        entry === undefined
        || 'status' in entry
        || entry.put === undefined
    ) {
        throw new Error(
            'no per-write response spec for ' + routePattern,
        );
    }
    const spec = entry.put;
    const segment = routePattern.split('/')[0]!;
    return formWritePair({
        method: 'PUT',
        pathname: `/${segment}/${id}`,
        routePattern,
        routeSegments: [segment, ':id'],
        pathSegments: [segment, id],
        headerFields: [],
        body: detail,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], detail, SYSTEM_MEMBER_ID, undefined,
        ),
        headPairId: undefined,
    });
}

async function memberCreateOperationPair(
    routePattern: 'human-members' | 'ai-members',
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    return formWritePair({
        method: 'POST',
        pathname: `/${routePattern}`,
        routePattern,
        routeSegments: [routePattern],
        pathSegments: [routePattern],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        headPairId: undefined,
    });
}

async function membershipDocumentPair(
    membershipId: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['memberships/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' memberships/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/memberships/${membershipId}`,
        routePattern: 'memberships/:id',
        routeSegments: ['memberships', ':id'],
        pathSegments: ['memberships', membershipId],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: MEMBER_ORGANIZATION,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [membershipId], body, SYSTEM_MEMBER_ID,
            MEMBER_ORGANIZATION,
        ),
        headPairId: undefined,
    });
}

// A member belongs to an org via the ledger — the member
// list derives from it, so a seeded member needs one.
async function seedMembership(
    db: MemoryDbAdapter, id: Id, requestAt: string,
): Promise<void> {
    const membershipId = `mb-${id}`;
    const body = {
        organization_id: MEMBER_ORGANIZATION,
        identity_id: id,
        at: '2020-01-01T00:00:00.000000Z',
    };
    await postMembershipDocumentOp(
        db, membershipId, body, SYSTEM_MEMBER_ID,
        await membershipDocumentPair(
            membershipId, body, requestAt,
        ),
    );
}

export async function seedHumanMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    const requestAt = nowUtc();
    const body = {
        id,
        pii: {
            name,
            email: `${id}@example.com`.toLowerCase(),
            phone: '',
            bio: '',
        },
        detail: humanDetail(),
        initialState: state,
        initialStateEventId: `st-${id}`,
        initialStateAt: '2026-01-01T00:00:00.000000Z',
    };
    const pairs: MemberWritePairs = {
        operation: await memberCreateOperationPair(
            'human-members', body, requestAt,
        ),
        memberDocument: await memberDocumentPair(
            id, 'human', requestAt,
        ),
        detailDocument: await detailDocumentPair(
            'human-members/:id', id,
            humanMemberDetailBodyOf(body), requestAt,
        ),
    };
    await postHumanMemberCreationOp(
        db, body, SYSTEM_MEMBER_ID, pairs,
    );
    await seedMembership(db, id, requestAt);
}

export async function seedAIMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
    state: MemberState = 'active',
): Promise<void> {
    const requestAt = nowUtc();
    const body = {
        id,
        detail: { name, ...aiDetail() },
        initialState: state,
        initialStateEventId: `st-${id}`,
        initialStateAt: '2026-01-01T00:00:00.000000Z',
    };
    const pairs: MemberWritePairs = {
        operation: await memberCreateOperationPair(
            'ai-members', body, requestAt,
        ),
        memberDocument: await memberDocumentPair(
            id, 'ai', requestAt,
        ),
        detailDocument: await detailDocumentPair(
            'ai-members/:id', id,
            aiMemberDetailBodyOf(body), requestAt,
        ),
    };
    await postAiMemberCreationOp(
        db, body, SYSTEM_MEMBER_ID, pairs,
    );
    await seedMembership(db, id, requestAt);
}

export async function seedCurrentMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanMember(db, 'current', 'Demo User');
}
