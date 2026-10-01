import type { Id, InvitationState } from '../shared/types.ts';
import {
    nowUtc,
} from '../shared/types.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
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

// One invitation as the invitee sees it: the inviting org, who
// invited them, when, and the current lifecycle state. An
// absent related row (erased inviter PII, vanished org) is an
// absent key — never a '' sentinel.
export interface InvitationView {
    readonly id: Id;
    readonly organizationId: Id;
    readonly organizationName?: string;
    readonly invitedByName?: string;
    readonly invitedAt: string;
    readonly state: InvitationState;
}

// One outstanding invitation as the inviting admin sees it: the
// invitee email they sent it to, and when. Erased invitee PII
// is an absent key.
export interface SentInvitation {
    readonly id: Id;
    readonly organizationId: Id;
    readonly identityId: Id;
    readonly inviteeEmail?: string;
    readonly invitedAt: string;
    readonly state: InvitationState;
}

interface InviteeRow {
    id: Id;
    organization_id: Id;
    organization_name?: string;
    identity_id: Id;
    invited_by_name?: string;
    at: string;
    state: InvitationState;
}

interface SentRow {
    id: Id;
    organization_id: Id;
    identity_id: Id;
    invitee_email?: string;
    at: string;
    state: InvitationState;
}

// The caller's own invitations across every org — the org fence
// cannot serve this, so the server fences by the verified
// identity. Callers filter to `pending` for the actionable set.
export async function getInvitations(
    ctx: RequestContext,
): Promise<InvitationView[]> {
    const rows = (await ctx.GET<InviteeRow[]>(
        'identities/' + ctx.identity.id
            + '/invitations/',
    )).body().toValue();
    return rows.map(inviteeViewOf);
}

function inviteeViewOf(row: InviteeRow): InvitationView {
    return {
        id: row.id,
        organizationId: row.organization_id,
        ...(row.organization_name !== undefined
            ? { organizationName: row.organization_name }
            : {}),
        ...(row.invited_by_name !== undefined
            ? { invitedByName: row.invited_by_name }
            : {}),
        invitedAt: row.at,
        state: row.state,
    };
}

function invitationPath(ctx: RequestContext, id: Id): string {
    return 'identities/' + ctx.identity.id + '/invitations/' + id;
}

// The active org's outstanding invitations, for an admin — the
// inviter-side counterpart of getInvitations.
export async function getSentInvitations(
    ctx: RequestContext,
): Promise<SentInvitation[]> {
    const rows = (await ctx.GET<SentRow[]>(
        'organizations/'
            + activeOrganization(ctx)
            + '/invitations/',
    )).body().toValue();
    return rows.map(row => ({
        id: row.id,
        organizationId: row.organization_id,
        identityId: row.identity_id,
        ...(row.invitee_email !== undefined
            ? { inviteeEmail: row.invitee_email }
            : {}),
        invitedAt: row.at,
        state: row.state,
    }));
}

// Invite an EXISTING identity, by email, to the admin's active
// org. The server resolves the email to an identity (the PII
// fence forbids a client-side identity picker) and appends a
// pending invitation. The outcome is returned in the domain's
// own words so the page need not read HTTP status: 'sent' covers
// a fresh grant AND a re-grant of an outstanding one (both 200);
// the server's expected 404 / 409 become 'no-identity' /
// 'already-member'. An unexpected fault still throws.
export type InvitationGrantOutcome =
    | 'sent'
    | 'no-identity'
    | 'already-member';

export async function postInvitationGrant(
    ctx: RequestContext,
    email: string,
): Promise<InvitationGrantOutcome> {
    const invitationId = generateIdentifier();
    const grantEventId = generateIdentifier();
    const grantAt = nowUtc();
    try {
        await ctx.POST(
            'organizations/'
                + activeOrganization(ctx)
                + '/invitations/',
            {
                email, invitationId, grantEventId, grantAt,
            },
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
    const read = await ctx.GET<InviteeRow>(
        invitationPath(ctx, id),
    );
    await ctx.PUT(
        invitationPath(ctx, id),
        {
            state: 'accepted',
            membershipId: generateIdentifier(),
            eventId: generateIdentifier(),
            at: nowUtc(),
        },
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
    const read = await ctx.GET<InviteeRow>(
        invitationPath(ctx, id),
    );
    await ctx.PUT(
        invitationPath(ctx, id),
        {
            state: 'declined',
            eventId: generateIdentifier(),
            at: nowUtc(),
        },
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
    const read = await ctx.GET<SentRow>(path);
    await ctx.PUT(
        path,
        {
            state: 'revoked',
            eventId: generateIdentifier(),
            at: nowUtc(),
        },
        [read],
    );
    invitationChanges.notify();
}
