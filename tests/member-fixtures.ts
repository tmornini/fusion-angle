import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanMember,
    AIMember,
    SYSTEM_MEMBER_ID,
    nowUtc,
    type Id,
} from '../api/types.ts';
import {
    getModelsByProvider,
} from '../api/provider-models.ts';
import {
    postIdentityDocumentOp,
    postIdentityPiiDocumentOp,
    postAiAgentDocumentOp,
    identityDocumentBodyOf,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';

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
        strengths: [],
        team_dimensions: {},
    };
}

function aiDetail() {
    return {
        description: '',
        skill_focus: '',
        model: firstProviderModel().id,
    };
}

function memberParentEntity(
    id: string,
    type: 'human' | 'ai',
) {
    return { id, type };
}

export function makeHumanMember(
    id: string,
    name: string,
): HumanMember {
    return new HumanMember(
        memberParentEntity(id, 'human'),
        { id, ...humanDetail() },
        {
            erased: false,
            name,
            email: `${id}@example.com`.toLowerCase(),
            phone: '',
            bio: '',
        },
    );
}

export function makeAIMember(
    id: string,
    name: string,
): AIMember {
    return new AIMember(
        memberParentEntity(id, 'ai'),
        { id, name, ...aiDetail() },
    );
}

const MEMBER_ORGANIZATION: Id = 'AjdvjuECVZEgZoFajaIEkg';

async function identityDocumentPair(
    id: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identities/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for identities/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identities/${id}`,
        routePattern: 'identities/:id',
        routeSegments: ['identities', ':id'],
        pathSegments: ['identities', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

async function identityPiiDocumentPair(
    id: Id,
    pii: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identities/:id/pii'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identities/:id/pii',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identities/${id}/pii`,
        routePattern: 'identities/:id/pii',
        routeSegments: ['identities', ':id', 'pii'],
        pathSegments: ['identities', id, 'pii'],
        headerFields: [],
        body: pii,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], pii, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

async function aiAgentDocumentPair(
    id: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['ai-agents/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for ai-agents/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/ai-agents/${id}`,
        routePattern: 'ai-agents/:id',
        routeSegments: ['ai-agents', ':id'],
        pathSegments: ['ai-agents', id],
        headerFields: [],
        body,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

export async function seedHumanMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    const requestAt = nowUtc();
    const detail = humanDetail();
    const identityBody = identityDocumentBodyOf(
        'person', detail,
    );
    const pii = {
        name,
        email: `${id}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
    await postIdentityDocumentOp(
        db, id, identityBody, SYSTEM_MEMBER_ID,
        await identityDocumentPair(
            id, identityBody, requestAt,
        ),
    );
    await postIdentityPiiDocumentOp(
        db, id, pii, SYSTEM_MEMBER_ID,
        await identityPiiDocumentPair(id, pii, requestAt),
    );
    await seedSeat(db, MEMBER_ORGANIZATION, id, 'member');
}

export async function seedAIMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    const requestAt = nowUtc();
    const body = { name, ...aiDetail() };
    await postAiAgentDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID,
        await aiAgentDocumentPair(id, body, requestAt),
    );
}

export async function seedCurrentMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
}
