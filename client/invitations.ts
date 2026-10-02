import type {
    Id,
    InvitationState,
    MembershipEntity,
} from '../shared/types.ts';
import {
    nowUtc,
} from '../shared/types.ts';
import {
    activeOrganization,
    type RequestContext,
} from './request-context.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
    HTTP_CONFLICT,
} from '../shared/http-errors.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import { postSessionRefresh } from './session-refresh.ts';
import type { ClientSession } from './client-session.ts';
import {
    principalFromToken,
} from '../shared/access-token-decode.ts';

// The invitations surface refreshes whenever an invitation, its
// lifecycle event, or a membership (written on accept) changes —
// so a grant in one tab and an accept in another both settle.
const invitationChanges = createSubscriptionChannel();

export function subscribeInvitationChanges(
    fn: () => void,
): () => void {
    return invitationChanges.subscribe(fn);
}

// One membership as the invitee sees it. The id is the
// membership name. Names of the organization and the
// inviter are not on this wire.
export interface InvitationView {
    readonly id: Id;
    readonly organizationId: Id;
    readonly invitedAt: string;
    readonly state: InvitationState;
}

// One outstanding membership as the inviting admin sees
// it. The invitee's email is not on this wire.
export interface SentInvitation {
    readonly id: Id;
    readonly organizationId: Id;
    readonly identityId: Id;
    readonly invitedAt: string;
    readonly state: InvitationState;
}

function inviteeViewOf(row: MembershipEntity): InvitationView {
    return {
        id: row.id,
        organizationId: row.organization_id,
        invitedAt: row.at,
        state: row.state,
    };
}

function sentViewOf(row: MembershipEntity): SentInvitation {
    return {
        id: row.id,
        organizationId: row.organization_id,
        identityId: row.identity_id,
        invitedAt: row.at,
        state: row.state,
    };
}

// The caller's own memberships across every organization.
// The server fences by the verified identity. Callers
// filter to `pending` for the actionable set.
export async function getInvitations(
    ctx: RequestContext,
): Promise<InvitationView[]> {
    const parts = await ctx.GETCollection<MembershipEntity>(
        'identities/' + ctx.identity.id + '/invitations/',
    );
    return parts.map((part) =>
        inviteeViewOf(part.body().toValue()));
}

function invitationPath(ctx: RequestContext, id: Id): string {
    return 'identities/' + ctx.identity.id + '/invitations/' + id;
}

// The active organization's pending memberships. The box
// has no selector of its own yet, so the view is asked
// for pending.
export async function getSentInvitations(
    ctx: RequestContext,
): Promise<SentInvitation[]> {
    const parts = await ctx.GETCollection<MembershipEntity>(
        'organizations/'
            + activeOrganization(ctx)
            + '/invitations/?state=pending',
    );
    return parts.map((part) =>
        sentViewOf(part.body().toValue()));
}

// Invite an EXISTING identity, by email, to the admin's
// active organization. The server resolves the email.
// 'sent' covers a fresh grant and a repeated pending one.
// 404 and 409 become 'no-identity' and 'already-member'.
export type InvitationGrantOutcome =
    | 'sent'
    | 'no-identity'
    | 'already-member';

export async function postInvitationGrant(
    ctx: RequestContext,
    email: string,
): Promise<InvitationGrantOutcome> {
    try {
        await ctx.POST(
            'organizations/'
                + activeOrganization(ctx)
                + '/invitations/',
            { email, grantAt: nowUtc() },
        );
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_NOT_FOUND
        ) {
            return 'no-identity';
        }
        if (
            err instanceof RequestError
            && err.status === HTTP_CONFLICT
        ) {
            return 'already-member';
        }
        throw err;
    }
    invitationChanges.notify();
    return 'sent';
}

export class SessionRemintFailedError extends Error {
    constructor(cause: unknown) {
        super(
            'invitation accepted, but the session was not'
            + ' re-minted — sign in again to see the new'
            + ' organization',
            { cause },
        );
    }
}

// Accept an invitation — the server writes the membership in
// the invitation's org (type:"member") and appends 'accepted'
// in one atomic batch. Then remint via the refresh grant so
// the access token gains the new member:O claim (roles bake
// only at mint). The committed seat's bell rings either way.
export async function postInvitationAcceptance(
    ctx: RequestContext,
    id: Id,
    organizationId: Id,
): Promise<void> {
    const read = await ctx.GET<MembershipEntity>(
        invitationPath(ctx, id),
    );
    await ctx.PUT(
        invitationPath(ctx, id),
        { state: 'accepted', at: nowUtc() },
        [read],
    );
    try {
        await remintSessionClaims(ctx, organizationId);
    } finally {
        invitationChanges.notify();
    }
}

// Re-bake access-token roles from live memberships. The grant
// rides AFTER any in-flight facade refresh — one jti presented
// twice is replay, and replay revokes the chain — and the token
// it yields must list the accepted organization: a peer tab's
// broadcast can serve the mutex a token minted before the seat.
// One more grant, then a named failure. Two attempts, no loop.
// A refresh that fails after the accept committed is named,
// never swallowed — the page renders it. A 401 is the
// recovery layer's to recover.
async function remintSessionClaims(
    ctx: RequestContext,
    organizationId: Id,
): Promise<void> {
    if (
        !ctx.session.isCookieSession()
        && ctx.session.getSessionCredentials() === null
    ) {
        return;
    }
    const first = await postRemintRefresh(ctx);
    if (listsOrganization(first, organizationId)) {
        return;
    }
    const second = await postRemintRefresh(ctx);
    if (listsOrganization(second, organizationId)) {
        return;
    }
    throw new SessionRemintFailedError(new Error(
        'the re-minted token does not list ' + organizationId,
    ));
}

function listsOrganization(
    accessToken: string,
    organizationId: Id,
): boolean {
    const principal = principalFromToken(accessToken);
    if (principal.organization === organizationId) {
        return true;
    }
    return principal.organizations !== undefined
        && principal.organizations.includes(organizationId);
}

// The one try: it wraps only the refresh grant. The stored
// refresh token is read INSIDE the flight, after any earlier
// flight has rotated it.
async function postRemintRefresh(
    ctx: RequestContext,
): Promise<string> {
    let access: string | null;
    try {
        access = await ctx.session.runRefreshAfterInFlight(
            async () => {
                const creds = await postSessionRefresh(
                    ctx, storedRefreshToken(ctx.session),
                );
                ctx.session.putSessionCredentials(creds);
                return creds.accessToken;
            },
        );
    } catch (err) {
        throw new SessionRemintFailedError(err);
    }
    if (access === null) {
        throw new SessionRemintFailedError(new Error(
            'the refresh grant yielded no access token',
        ));
    }
    ctx.session.putSessionToken(access);
    return access;
}

function storedRefreshToken(session: ClientSession): string {
    if (session.isCookieSession()) {
        return '';
    }
    const stored = session.getSessionCredentials();
    if (stored === null) {
        throw new Error('no session credentials to re-mint');
    }
    return stored.refreshToken;
}

export async function postInvitationDecline(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    const read = await ctx.GET<MembershipEntity>(
        invitationPath(ctx, id),
    );
    await ctx.PUT(
        invitationPath(ctx, id),
        { state: 'declined', at: nowUtc() },
        [read],
    );
    invitationChanges.notify();
}

// Cancel a pending invitation (admin only). The invitation row
// persists as audit; a 'revoked' event supersedes the pending.
// The admin reads it on the organization nest, whose head tag
// the revocation latches.
export async function postInvitationRevocation(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    const path = 'organizations/'
        + activeOrganization(ctx)
        + '/invitations/' + id;
    const read = await ctx.GET<MembershipEntity>(path);
    await ctx.PUT(
        path,
        { state: 'revoked', at: nowUtc() },
        [read],
    );
    invitationChanges.notify();
}
