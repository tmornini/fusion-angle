import type { DbAdapter } from './db.ts';
import { MESSAGE_TABLES } from './db.ts';
import type { Id, OrganizationEntity } from './types.ts';
import {
    appendMessagePair,
    type MessagePair,
} from './message-pair.ts';
import {
    currentDefaultOrganizationFor,
} from './authorization.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_FORBIDDEN,
    HTTP_NOT_FOUND,
} from './http-errors.ts';
import { param } from './document-family.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    deriveDefaultOrganization,
} from './derive-default-organization.ts';
import {
    deriveMembershipsForIdentity,
    membershipExistsFor,
} from './derive-memberships.ts';

// GET /identities/:id/organizations/ — the path
// identity's live seats. Self or admin. Caller
// claims must not shape another identity's list.
export async function getIdentityOrganizations(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<OrganizationEntity[]> {
    const identityId = param(params, 0);
    if (
        actor !== identityId
        && !roles.includes('admin')
    ) {
        throw new ApiError(
            'forbidden: identity organizations'
            + ' are self or admin',
            HTTP_FORBIDDEN,
        );
    }
    const memberships = await deriveMembershipsForIdentity(
        db, identityId,
    );
    const mine = new Set(
        memberships.map(m => m.organization_id),
    );
    const organizations = await deriveOrganizations(db);
    return organizations.filter(o => mine.has(o.id));
}

// PUT/GET /identities/:id/default-organization — a simple
// document. Authorized by tree ownership (caller === :id).
// PUT { organization_id } must name a live seat, else 400
// and nothing is stored. GET returns that document or 404
// if never SET. No public DELETE. Revoke does not rewrite
// this document. Self-only stays here: admin-everywhere
// on `/` is not a substitute.
export async function getIdentityDefaultOrganization(
    db: DbAdapter,
    p: string[],
    actor: Id,
): Promise<{ organization_id: string }> {
    const identityId = param(p, 0);
    if (actor !== identityId) {
        throw new ApiError(
            'forbidden: an identity may act only'
                + ' within its own tree',
            HTTP_FORBIDDEN,
        );
    }
    const rows = await deriveDefaultOrganization(
        db, identityId,
    );
    const set = currentDefaultOrganizationFor(
        rows, identityId,
    );
    if (set === null) {
        throw new ApiError('not found', HTTP_NOT_FOUND);
    }
    return { organization_id: set };
}

export async function putIdentityDefaultOrganization(
    db: DbAdapter,
    p: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
): Promise<void> {
    const identityId = param(p, 0);
    if (actor !== identityId) {
        throw new ApiError(
            'forbidden: an identity may act only'
                + ' within its own tree',
            HTTP_FORBIDDEN,
        );
    }
    const organization = payload.organization_id;
    if (typeof organization !== 'string') {
        throw new ApiError(
            'organization_id is required',
            HTTP_BAD_REQUEST,
        );
    }
    if (
        !await membershipExistsFor(
            db, organization, identityId,
        )
    ) {
        throw new ApiError(
            'organization_id is not a live seat',
            HTTP_BAD_REQUEST,
        );
    }
    await db.transaction(
        MESSAGE_TABLES,
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}
