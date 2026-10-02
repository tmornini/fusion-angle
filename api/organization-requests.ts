import type { DbAdapter } from './db.ts';
import type { Id } from '../shared/types.ts';
import {
    wholeCollectionSelection,
    wholeHeadSelection,
    type HeadSelection,
} from './head-reads.ts';
import {
    attemptFor,
    canonicalPath,
    runWrite,
    type MessagePair,
} from './message-pair.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_FORBIDDEN,
    HTTP_NOT_FOUND,
} from '../shared/http-errors.ts';
import { param } from './document-family.ts';
import {
    defaultOrganizationPrefix,
} from './derive-default-organization.ts';
import {
    membershipOf,
    membershipsOfIdentity,
} from './memberships.ts';
import {
    validateDefaultOrganizationBody,
} from './validators.ts';

// GET /identities/:id/organizations/ — the organization
// heads the path identity holds an accepted membership in. Self or
// admin. Caller claims must not shape another identity's
// list.
export async function selectIdentityOrganizations(
    db: DbAdapter,
    params: string[],
    actor: Id,
    _organization: Id | undefined,
    roles: readonly string[],
): Promise<HeadSelection> {
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
    return db.readTransaction(async (view) => {
        const heads =
            await view.messagePairs.getCollectionHeadPairs(
                canonicalPath(undefined, '/organizations/'),
            );
        const accepted = new Set(
            (await membershipsOfIdentity(
                view, identityId,
            )).map((membership) => membership.organization_id),
        );
        return wholeCollectionSelection(
            heads.filter((head) => accepted.has(head.name)),
            'stateless',
        );
    });
}

// PUT/GET /identities/:id/default-organization — a simple
// document. Authorized by tree ownership (caller === :id).
// PUT { organization_id } must name an accepted membership, else 400
// and nothing is stored. GET serves that document's head
// or 404s if never SET. No public DELETE. Revoke does not
// rewrite this document. Self-only stays here:
// admin-everywhere on `/` is not a substitute.
export async function selectIdentityDefaultOrganization(
    db: DbAdapter,
    p: string[],
    actor: Id,
): Promise<HeadSelection> {
    const identityId = param(p, 0);
    if (actor !== identityId) {
        throw new ApiError(
            'forbidden: an identity may act only'
                + ' within its own tree',
            HTTP_FORBIDDEN,
        );
    }
    const head = await db.messagePairs.getHeadPair(
        defaultOrganizationPrefix(identityId), '',
    );
    if (head === null) {
        throw new ApiError('not found', HTTP_NOT_FOUND);
    }
    return wholeHeadSelection(
        head, 'stateless', 'identity_default_organization',
        identityId,
    );
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
    const { organization_id: organization } =
        validateDefaultOrganizationBody(payload);
    if (
        await membershipOf(
            db, organization, identityId,
        ) === null
    ) {
        throw new ApiError(
            'organization_id is not an accepted membership',
            HTTP_BAD_REQUEST,
        );
    }
    if (pair !== undefined) {
        await runWrite(db, attemptFor([pair]), [pair]);
    }
}
