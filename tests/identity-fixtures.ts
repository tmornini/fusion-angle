import type { DbAdapter } from '../api/db.ts';
import { nowUtc, SYSTEM_MEMBER_ID, type Id } from '../api/types.ts';
import {
    postIdentityDocumentOp,
    postIdentityPiiDocumentOp,
    postIdentityCredentialDocumentOp,
    postIdentityProviderDocumentOp,
    identityDocumentBodyOf,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import {
    appendMessagePair,
    formWritePair,
    type MessagePair,
} from '../api/message-pair.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

// Below-facade pair formation for the seeded writes below
// (Phase 10 Task 8's fixture budget, finding 18) — the SAME
// mechanism tests/member-fixtures.ts uses: every write rides
// the SAME exported api/routes.ts op a live PUT would, with a
// pair formed from the SAME WRITE_RESPONSE_SPECS entry, so a
// message-derived read sees a fixture-seeded identity exactly
// as it would a live-written one. Every id and field value
// stays IDENTICAL to the raw puts these replace — only the
// write MECHANISM changes. identities is GLOBAL plane (family-
// registry.ts: organizationNested:false), so `organization`
// stays undefined throughout, the drift-identities.test.ts
// GLOBAL_PLANE_PLACEHOLDER precedent.

async function identityDocumentPair(
    id: Id,
    kind: 'person' | 'service',
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identities/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for identities/:id',
        );
    }
    const body = identityDocumentBodyOf(kind);
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

async function identityCredentialDocumentPair(
    id: Id,
    cid: Id,
    fields: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec =
        WRITE_RESPONSE_SPECS['identities/:id/credentials/:cid'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identities/:id/credentials/:cid',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identities/${id}/credentials/${cid}`,
        routePattern: 'identities/:id/credentials/:cid',
        routeSegments: [
            'identities', ':id', 'credentials', ':cid',
        ],
        pathSegments: ['identities', id, 'credentials', cid],
        headerFields: [],
        body: fields,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id, cid], fields, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

async function identityProviderDocumentPair(
    id: Id,
    body: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec = WRITE_RESPONSE_SPECS['identity-providers/:id'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identity-providers/:id',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identity-providers/${id}`,
        routePattern: 'identity-providers/:id',
        routeSegments: ['identity-providers', ':id'],
        pathSegments: ['identity-providers', id],
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

// One identity-providers/:id document — a link/unlink event,
// GLOBAL plane (no organization_id field). Session B's own
// fixture (identity-providers had no exported below-facade op
// until the controller-sanctioned extraction this session
// lands), needed so a raw-put provider row does not go
// derivation-invisible once GET identity-providers flips.
export async function seedIdentityProvider(
    db: DbAdapter,
    id: string,
    body: Record<string, unknown>,
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityProviderDocumentOp(
        db, id, body, SYSTEM_MEMBER_ID,
        await identityProviderDocumentPair(id, body, requestAt),
    );
}

// The PII facet alone — the identities/:id/pii document, no
// identities/:id row alongside it. Callers whose identities row
// stays a raw put (never read through a flipping GET in their
// own file) use this rather than seedPersonIdentity, so the row
// SET stays exactly what it was — only PII gains a pair.
export async function seedIdentityPii(
    db: DbAdapter,
    id: string,
    pii: {
        name: string; email: string;
        phone: string; bio: string;
    },
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityPiiDocumentOp(
        db, id, pii, SYSTEM_MEMBER_ID,
        await identityPiiDocumentPair(id, pii, requestAt),
    );
}

// One identities/:id/credentials/:cid document. `id` is the
// owning identity; `cid` is the credential's own row id (the
// storage key raw puts addressed as e.g. 'cred-' + id).
export async function seedIdentityCredential(
    db: DbAdapter,
    id: string,
    cid: string,
    fields: Record<string, unknown>,
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityCredentialDocumentOp(
        db, cid, fields, SYSTEM_MEMBER_ID,
        await identityCredentialDocumentPair(
            id, cid, fields, requestAt,
        ),
    );
}

export async function seedPersonIdentity(
    db: DbAdapter,
    id: string,
    pii: {
        name: string; email: string;
        phone: string; bio: string;
    },
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityDocumentOp(
        db, id, identityDocumentBodyOf('person'),
        SYSTEM_MEMBER_ID,
        await identityDocumentPair(id, 'person', requestAt),
    );
    await seedIdentityPii(db, id, pii);
}

export async function seedServiceIdentity(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const requestAt = nowUtc();
    await postIdentityDocumentOp(
        db, id, identityDocumentBodyOf('service'),
        SYSTEM_MEMBER_ID,
        await identityDocumentPair(id, 'service', requestAt),
    );
}

// One identities/:id/registration document pair — the
// clients-elimination facet. Chainless below-facade append
// (headPairId undefined): deriveDocumentsAt's (at, id)
// reduction decides currency; Supersedes is provenance-only.
async function clientRegistrationDocumentPair(
    id: Id,
    fields: Record<string, unknown>,
    requestAt: string,
): Promise<MessagePair> {
    const spec =
        WRITE_RESPONSE_SPECS['identities/:id/registration'];
    if (spec === undefined || !('status' in spec)) {
        throw new Error(
            'no per-write response spec for'
            + ' identities/:id/registration',
        );
    }
    return formWritePair({
        method: 'PUT',
        pathname: `/identities/${id}/registration`,
        routePattern: 'identities/:id/registration',
        routeSegments: ['identities', ':id', 'registration'],
        pathSegments: ['identities', id, 'registration'],
        headerFields: [],
        body: fields,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: undefined,
        responseStatus: spec.status,
        responseBody: spec.successBody?.(
            [id], fields, SYSTEM_MEMBER_ID, undefined,
        ),
        operationId: TEST_OPERATION_ID,
    });
}

export async function seedClientRegistration(
    db: DbAdapter,
    id: string,
    fields: Record<string, unknown>,
): Promise<void> {
    const pair = await clientRegistrationDocumentPair(
        id, fields, nowUtc(),
    );
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}

// A deregistration tombstone: a DELETE-method pair at the
// slot — deriveDocumentsAt excludes a DELETE head, so the
// facet reads as absent afterward.
export async function seedClientRegistrationTombstone(
    db: DbAdapter,
    id: string,
): Promise<void> {
    const pair = await formWritePair({
        method: 'DELETE',
        pathname: `/identities/${id}/registration`,
        routePattern: 'identities/:id/registration',
        routeSegments: ['identities', ':id', 'registration'],
        pathSegments: ['identities', id, 'registration'],
        headerFields: [],
        body: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: nowUtc(),
        organization: undefined,
        responseStatus: 204,
        responseBody: undefined,
        operationId: TEST_OPERATION_ID,
    });
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
        },
    );
}
