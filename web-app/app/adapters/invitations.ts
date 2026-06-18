import type { Id, InvitationState } from '../../../api/types.ts';
import {
    nowUtc,
} from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import type { RequestContext } from './shared.ts';
import { RequestError } from '../../../api/api.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    isInvitationState,
} from '../../../api/types.ts';
export type { InvitationState } from '../../../api/types.ts';

// The invitations surface refreshes whenever an invitation, its
// lifecycle event, or a membership (written on accept) changes —
// so a grant in one tab and an accept in another both settle.
const invitationChanges = createSubscriptionChannel(
    ['invitations', 'states', 'memberships'],
);

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
    const rows = await ctx.GET<InviteeRow[]>('invitations');
    return rows.map(row => ({
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
    }));
}

// The active org's outstanding invitations, for an admin — the
// inviter-side counterpart of getInvitations.
export async function getSentInvitations(
    ctx: RequestContext,
): Promise<SentInvitation[]> {
    const rows = await ctx.GET<SentRow[]>('invitations/sent');
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
    const invitationId = generateCryptoSafeBase62();
    const grantEventId = generateCryptoSafeBase62();
    const grantAt = nowUtc();
    try {
        await ctx.POST('invitations', {
            email, invitationId, grantEventId, grantAt,
        });
    } catch (err) {
        if (err instanceof RequestError && err.status === 404) {
            return 'no-identity';
        }
        if (err instanceof RequestError && err.status === 409) {
            return 'already-member';
        }
        throw err;
    }
    invitationChanges.notify();
    return 'sent';
}

// Accept an invitation — the server writes the membership in the
// invitation's org and appends 'accepted' in one atomic batch.
export async function postInvitationAcceptance(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    const membershipId = generateCryptoSafeBase62();
    const acceptEventId = generateCryptoSafeBase62();
    const acceptAt = nowUtc();
    await ctx.POST('invitations/' + id + '/acceptance', {
        membershipId, acceptEventId, acceptAt,
    });
    invitationChanges.notify();
}

export async function postInvitationDecline(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    const declineEventId = generateCryptoSafeBase62();
    const declineAt = nowUtc();
    await ctx.POST('invitations/' + id + '/decline', {
        declineEventId, declineAt,
    });
    invitationChanges.notify();
}

// Cancel a pending invitation (admin only). The invitation row
// persists as audit; a 'revoked' event supersedes the pending.
export async function postInvitationRevocation(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    const revokeEventId = generateCryptoSafeBase62();
    const revokeAt = nowUtc();
    await ctx.POST('invitations/' + id + '/revocation', {
        revokeEventId, revokeAt,
    });
    invitationChanges.notify();
}
