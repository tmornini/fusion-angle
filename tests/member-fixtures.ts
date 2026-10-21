import type { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    HumanMember,
    AIMember,
    SYSTEM_MEMBER_ID,
    nowUtc,
    type Id,
    type IdentityPiiEntity,
    type MembershipEntity,
} from '../shared/types.ts';
import {
    getModelsByProvider,
} from '../api/provider-models.ts';
import {
    postIdentityDocumentOp,
    postIdentityPiiDocumentOp,
    identityDocumentBodyOf,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    formWriteMessagePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { handleRequest } from '../api/api.ts';
import { apiRequest } from './http-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedSeat } from './root-admin-fixture.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { membershipNameOf } from
    '../shared/membership-name.ts';
import { responseMessage } from './fixtures/response-message.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';

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

// The accepted membership a built member was read through.
function seatedMembership(
    id: string,
): HttpMessage<MembershipEntity> {
    return responseMessage<MembershipEntity>({
        id: membershipNameOf(
            MEMBER_ORGANIZATION, id,
        ),
        organization_id: MEMBER_ORGANIZATION,
        identity_id: id,
        type: 'member',
        state: 'accepted',
        at: '2026-01-01T00:00:00.000000Z',
    });
}

export function makeHumanMember(
    id: string,
    name: string,
): HumanMember {
    const pii = {
        name,
        email: `${id}@example.com`.toLowerCase(),
        phone: '',
        bio: '',
    };
    return new HumanMember(
        memberParentEntity(id, 'human'),
        { present: true, ...humanDetail() },
        {
            erased: false,
            ...pii,
            message: responseMessage<IdentityPiiEntity>({
                id, ...pii,
            }),
        },
        seatedMembership(id),
    );
}

export function makeAIMember(
    id: string,
    name: string,
): AIMember {
    return new AIMember(
        memberParentEntity(id, 'ai'),
        { id, name, ...aiDetail() },
        seatedMembership(id),
    );
}

const MEMBER_ORGANIZATION: Id = 'AjdvjuECVZEgZoFajaIEkg';

async function identityDocumentMessagePair(
    id: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identities/:id'];
    if (spec === undefined || !('conditional' in spec)) {
        throw new Error(
            'no per-write response spec for identities/:id',
        );
    }
    return formWriteMessagePair({
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
        responseBody: spec.successBody?.(
            [id], body, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
}

async function identityPiiDocumentMessagePair(
    id: Id,
    pii: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identities/:id/pii'];
    if (spec === undefined || !('conditional' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identities/:id/pii',
        );
    }
    return formWriteMessagePair({
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
        responseBody: spec.successBody?.(
            [id], pii, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
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
        await identityDocumentMessagePair(
            id, identityBody, requestAt,
        ),
    );
    await postIdentityPiiDocumentOp(
        db, id, pii, SYSTEM_MEMBER_ID,
        await identityPiiDocumentMessagePair(id, pii, requestAt),
    );
    await seedSeat(db, MEMBER_ORGANIZATION, id, 'member');
}

// An AI lands through the statement, as Tony would seat
// one: a service identity, an accepted membership, and the
// organization's AI document under one id.
export async function seedAIMember(
    db: MemoryDbAdapter,
    id: string,
    name: string,
): Promise<void> {
    const created = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + MEMBER_ORGANIZATION
            + '/memberships/',
        token: await organizationToken(),
        body: {
            id,
            kind: 'ai',
            membership: { type: 'member', at: nowUtc() },
            ai: { name, ...aiDetail() },
        },
    }));
    if (created.status !== 201) {
        throw new Error(
            'seedAIMember: ' + created.status + ' '
            + await created.text(),
        );
    }
    await created.body?.cancel();
}

export async function seedCurrentMember(
    db: MemoryDbAdapter,
): Promise<void> {
    await seedHumanMember(db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User');
}
