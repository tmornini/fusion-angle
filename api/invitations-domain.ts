import type { DbAdapter } from './db.ts';
import {
    EntityNotFoundError,
} from './db.ts';
import {
    assertInvitationState,
    ValidationError,
    type Id,
    type InvitationState,
} from './types.ts';
import {
    currentRolesForInOrganization,
} from './authorization.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { identityDefaultOrganization } from './authentication.ts';
import {
    errorJson,
    HTTP_BAD_REQUEST,
    HTTP_NOT_FOUND,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
    HTTP_CONFLICT,
} from './http-errors.ts';
import {
    authenticateRequest,
    parseObjectBody,
} from './request-auth.ts';
import {
    type IncomingContext,
    type AuthenticatedContext,
} from './request-context.ts';
import {
    pickString,
    validateTimestampField,
} from './validators.ts';

// The active org of the caller: the verified token claim, else
// the identity's resolved default. Null when the identity can
// reach no org — the same denial the main gate raises.
async function callerActiveOrganization(
    ctx: AuthenticatedContext,
): Promise<Id | null> {
    return ctx.principal.organization
        ?? await identityDefaultOrganization(
            ctx.base, ctx.principal.id,
        );
}

async function callerIsOrganizationAdmin(
    ctx: AuthenticatedContext,
    organization: Id,
): Promise<boolean> {
    const rows = await ctx.base.roleGrants
        .getAllWhere('identity_id', ctx.principal.id);
    return currentRolesForInOrganization(
        rows, ctx.principal.id, organization,
    ).includes('admin');
}

// An invitation's current state: the latest event on its id —
// states.getCurrentFor, the same (at, id) derivation every
// entity's lifecycle uses. Null when no event has been
// recorded.
async function currentInvitationState(
    adapter: DbAdapter,
    id: Id,
): Promise<InvitationState | null> {
    const latest = await adapter.states.getCurrentFor(id);
    return latest === null
        ? null
        : assertInvitationState(latest.state, 'invitation ' + id);
}

// The invitation surface: an identity/org-spanning workflow the
// org fence cannot host. The invitee reads and answers an
// invitation to an org they are NOT yet in, and acceptance
// writes the membership in the INVITATION's org — never the
// caller's active org, which the org-scoped store would stamp.
// So every op runs on the BASE adapter with an explicit guard,
// like identityDefaultOrganizationRequest: grant/revoke/sent require an
// admin role in the relevant org; accept/decline/read require
// the caller to BE the invitee. These never touch the
// admin-only ROUTE_POLICY, so a non-admin invitee can accept.
export async function invitationsRequest(
    ctx: IncomingContext,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const authed =
        await authenticateRequest(ctx, request);
    if (typeof authed === 'string') {
        return errorJson(authed, HTTP_UNAUTHORIZED);
    }
    const method = ctx.method;
    if (segments.length === 1) {
        if (method === 'GET') {
            return invitationsForInvitee(authed);
        }
        if (method === 'POST') {
            return grantInvitation(authed, request);
        }
    }
    if (segments.length === 2 && segments[1] === 'sent') {
        if (method === 'GET') {
            return sentInvitations(authed);
        }
    }
    if (segments.length === 3 && method === 'POST') {
        const id = segments[1]!;
        const op = segments[2]!;
        if (op === 'acceptance') {
            return acceptInvitation(authed, id, request);
        }
        if (op === 'decline') {
            return declineInvitation(authed, id, request);
        }
        if (op === 'revocation') {
            return revokeInvitation(authed, id, request);
        }
    }
    return errorJson(
        'Not found: /' + segments.join('/'), HTTP_NOT_FOUND,
    );
}

// The caller's own invitations, each enriched with the org name
// and the inviter's name for display. The first event is the
// grant (its actor is the inviter); the last event is the
// current state. The whole result is the caller's own — never
// another identity's.
async function invitationsForInvitee(
    ctx: AuthenticatedContext,
): Promise<Response> {
    const mine = (await ctx.base.invitations.getAll())
        .filter(inv =>
            inv.identity_id === ctx.principal.id);
    if (mine.length === 0) return Response.json([]);
    const organizationName = new Map(
        (await ctx.base.organizations.getAll())
            .map(o => [o.id, o.name]));
    const personName = new Map(
        (await ctx.base.identityPii.getAll())
            .map(p => [p.id, p.name]));
    // One states read serves every row — a per-invitation
    // getAllFor opened one transaction per invitation for the
    // same log.
    const events = await ctx.base.states.getAll();
    const latest = latestByKey(events, ev => ev.entity_id);
    const eventsFor = Map.groupBy(events, ev => ev.entity_id);
    const out = [];
    for (const inv of mine) {
        const current = latest.get(inv.id);
        if (current === undefined) continue;
        // The inviter is the actor of the grant ('pending') event —
        // found by state, not position, so a same-`at` tie cannot
        // misattribute it. An absent related row (erased PII,
        // vanished org) omits its key — absence on the wire is
        // the absent key, never a '' sentinel.
        const grant = eventsFor.get(inv.id)!
            .find(ev => ev.state === 'pending');
        const name = organizationName.get(inv.organization_id);
        const inviter = grant === undefined
            ? undefined
            : personName.get(grant.member_id);
        out.push({
            id: inv.id,
            organization_id: inv.organization_id,
            ...(name !== undefined
                ? { organization_name: name }
                : {}),
            identity_id: inv.identity_id,
            ...(inviter !== undefined
                ? { invited_by_name: inviter }
                : {}),
            at: inv.at,
            state: assertInvitationState(
                current.state, 'invitation ' + inv.id),
        });
    }
    return Response.json(out);
}

// The active org's outstanding (pending) invitations, for an
// admin. The invitee email rides along because the admin
// supplied it at grant time — need-to-know, not a PII leak.
async function sentInvitations(
    ctx: AuthenticatedContext,
): Promise<Response> {
    const organization = await callerActiveOrganization(ctx);
    if (organization === null) {
        return errorJson(
            'forbidden: identity has no organization',
            HTTP_FORBIDDEN);
    }
    if (!await callerIsOrganizationAdmin(ctx, organization)) {
        return errorJson(
            'forbidden: listing sent invitations requires'
            + ' an admin role', HTTP_FORBIDDEN);
    }
    const organizationInvites =
        (await ctx.base.invitations.getAll())
            .filter(inv => inv.organization_id === organization);
    if (organizationInvites.length === 0) return Response.json([]);
    const email = new Map(
        (await ctx.base.identityPii.getAll())
            .map(p => [p.id, p.email]));
    // One states read serves every row — getCurrentFor per
    // invitation opened one transaction each for the same log.
    const latest = latestByKey(
        await ctx.base.states.getAll(), ev => ev.entity_id);
    const out = [];
    for (const inv of organizationInvites) {
        const current = latest.get(inv.id);
        if (current === undefined) continue;
        const state = assertInvitationState(
            current.state, 'invitation ' + inv.id);
        if (state !== 'pending') continue;
        // Erased invitee PII omits the key — absence on the
        // wire is the absent key, never a '' sentinel.
        const inviteeEmail = email.get(inv.identity_id);
        out.push({
            id: inv.id,
            organization_id: organization,
            identity_id: inv.identity_id,
            ...(inviteeEmail !== undefined
                ? { invitee_email: inviteeEmail }
                : {}),
            at: inv.at,
            state: 'pending',
        });
    }
    return Response.json(out);
}

// Grant: an admin invites an EXISTING identity by email. The
// org is the admin's verified active org. Idempotent on an
// outstanding pending invite for the (org, identity) pair.
// New-identity creation and email delivery are deferred.
async function grantInvitation(
    ctx: AuthenticatedContext,
    request: Request,
): Promise<Response> {
    const organization = await callerActiveOrganization(ctx);
    if (organization === null) {
        return errorJson(
            'forbidden: identity has no organization',
            HTTP_FORBIDDEN);
    }
    if (!await callerIsOrganizationAdmin(ctx, organization)) {
        return errorJson(
            'forbidden: granting an invitation requires an'
            + ' admin role', HTTP_FORBIDDEN);
    }
    const parse = await parseObjectBody(request);
    if (!parse.ok) {
        return errorJson('Invalid JSON body', HTTP_BAD_REQUEST);
    }
    const body = parse.body;
    const email = typeof body.email === 'string'
        ? body.email : '';
    if (email === '') {
        return errorJson(
            'an "email" is required', HTTP_BAD_REQUEST);
    }
    let invitationId: string;
    let grantEventId: string;
    let grantAt: string;
    try {
        invitationId = pickString(body, 'invitationId');
        grantEventId = pickString(body, 'grantEventId');
        grantAt = validateTimestampField(
            body, 'grantAt', 'grant',
        );
    } catch (e) {
        if (e instanceof ValidationError) {
            return errorJson(e.message, HTTP_BAD_REQUEST);
        }
        throw e;
    }
    if (invitationId === '') {
        return errorJson(
            'invitationId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    if (grantEventId === '') {
        return errorJson(
            'grantEventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    // DEMO-TIER POSTURE: a missing email 404s and an already-member
    // 409s, so an org admin can tell whether an email maps to an
    // existing identity (even one in another org). This is a conscious
    // tradeoff — the admin needs to know the invite landed, and the
    // plan defers new-identity creation — of the same demo grade as the
    // client-shipped HMAC key. A server tier would resolve emails
    // without reflecting existence through the status code.
    const match = (await ctx.base.identityPii.getAll())
        .find(p => p.email === email);
    if (match === undefined) {
        return errorJson(
            'no identity with that email', HTTP_NOT_FOUND);
    }
    const identityId = match.id;
    // The member/pending checks and the write run in ONE transaction so
    // two concurrent grants cannot both pass the check and each append a
    // pending invitation (Commandment VII). The tx RETURNS its outcome
    // (a closure-mutated outer var would not narrow), mapped below.
    const result = await ctx.base.transaction(
        ['invitations', 'states', 'memberships'],
        async (view): Promise<GrantOutcome> => {
            const member = (await view.memberships.getAll())
                .some(m => m.identity_id === identityId
                    && m.organization_id === organization);
            if (member) return { kind: 'member' };
            const existing = await pendingInvitationFor(
                view, organization, identityId);
            if (existing !== null) {
                return {
                    kind: 'existing',
                    id: existing.id, at: existing.at,
                };
            }
            await view.invitations.put(invitationId, {
                organization_id: organization,
                identity_id: identityId,
                at: grantAt,
            });
            await view.states.postEvent(
                grantEventId, invitationId,
                'pending', ctx.principal.id, grantAt);
            return { kind: 'created' };
        },
    );
    if (result.kind === 'member') {
        return errorJson(
            'that identity is already a member of this'
            + ' organization', HTTP_CONFLICT);
    }
    // The invitee's bell is body/row-derived, not
    // path-derived — the named M3 case the generic
    // route-pattern post hook cannot reach, since this
    // domain runs off the dispatch switch entirely.
    ctx.base.postNotification({
        kind: 'scoped',
        organizationIds: [organization],
        identityIds: [identityId],
    });
    if (result.kind === 'existing') {
        return Response.json({
            id: result.id, organization_id: organization,
            identity_id: identityId, at: result.at,
            state: 'pending',
        });
    }
    return Response.json({
        id: invitationId, organization_id: organization,
        identity_id: identityId,
        at: grantAt, state: 'pending',
    });
}

type GrantOutcome =
    | { kind: 'member' }
    | { kind: 'existing'; id: Id; at: string }
    | { kind: 'created' };

// The org's outstanding pending invitation for an identity, or
// null. The grant idempotency check.
async function pendingInvitationFor(
    adapter: DbAdapter,
    organization: Id,
    identityId: Id,
): Promise<{ id: Id; at: string } | null> {
    const candidates = (await adapter.invitations.getAll())
        .filter(inv => inv.organization_id === organization
            && inv.identity_id === identityId);
    if (candidates.length === 0) return null;
    // One states read answers every candidate; on the grant
    // path this joins the already-open transaction.
    const latest = latestByKey(
        await adapter.states.getAll(), ev => ev.entity_id);
    for (const inv of candidates) {
        const current = latest.get(inv.id);
        if (current === undefined) continue;
        const state = assertInvitationState(
            current.state, 'invitation ' + inv.id);
        if (state === 'pending') {
            return { id: inv.id, at: inv.at };
        }
    }
    return null;
}

// Accept: the invitee turns a pending invitation into a real
// membership in the INVITATION's org, in one atomic batch with
// the 'accepted' event. Idempotent: a re-accept is a no-op; a
// non-pending invitation is a conflict.
async function acceptInvitation(
    ctx: AuthenticatedContext,
    id: Id,
    request: Request,
): Promise<Response> {
    const inv = await loadInvitation(ctx.base, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (inv.identity_id !== ctx.principal.id) {
        return errorJson(
            'forbidden: only the invitee may accept',
            HTTP_FORBIDDEN);
    }
    const parse = await parseObjectBody(request);
    if (!parse.ok) {
        return errorJson('Invalid JSON body', HTTP_BAD_REQUEST);
    }
    const body = parse.body;
    let membershipId: string;
    let eventId: string;
    let at: string;
    try {
        membershipId = pickString(body, 'membershipId');
        eventId = pickString(body, 'acceptEventId');
        at = validateTimestampField(
            body, 'acceptAt', 'accept',
        );
    } catch (e) {
        if (e instanceof ValidationError) {
            return errorJson(e.message, HTTP_BAD_REQUEST);
        }
        throw e;
    }
    if (membershipId === '') {
        return errorJson(
            'membershipId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    if (eventId === '') {
        return errorJson(
            'acceptEventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    // The pending check rides INSIDE the write transaction so a
    // concurrent revoke/decline cannot slip between the check and the
    // membership write — a revoke must actually stop access (Commandment
    // X / II). Mirrors grantAuthorizationCode's in-tx state gate.
    let conflict = false;
    await ctx.base.transaction(
        ['memberships', 'states'],
        async (view) => {
            const state = await currentInvitationState(view, id);
            if (state === 'accepted') return;   // idempotent no-op
            if (state !== 'pending') { conflict = true; return; }
            const already = (await view.memberships.getAll())
                .some(m =>
                    m.identity_id === ctx.principal.id
                    && m.organization_id
                        === inv.organization_id);
            if (!already) {
                await view.memberships.put(membershipId, {
                    organization_id: inv.organization_id,
                    identity_id: ctx.principal.id,
                    at,
                });
            }
            await view.states.postEvent(
                eventId, id, 'accepted', ctx.principal.id, at);
        },
    );
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    ctx.base.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return new Response(null, { status: 204 });
}

// Decline: the invitee appends 'declined'. No membership is
// written. Idempotent on an already-declined invitation.
async function declineInvitation(
    ctx: AuthenticatedContext,
    id: Id,
    request: Request,
): Promise<Response> {
    const inv = await loadInvitation(ctx.base, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (inv.identity_id !== ctx.principal.id) {
        return errorJson(
            'forbidden: only the invitee may decline',
            HTTP_FORBIDDEN);
    }
    const parse = await parseObjectBody(request);
    if (!parse.ok) {
        return errorJson('Invalid JSON body', HTTP_BAD_REQUEST);
    }
    const body = parse.body;
    let eventId: string;
    let at: string;
    try {
        eventId = pickString(body, 'declineEventId');
        at = validateTimestampField(
            body, 'declineAt', 'decline',
        );
    } catch (e) {
        if (e instanceof ValidationError) {
            return errorJson(e.message, HTTP_BAD_REQUEST);
        }
        throw e;
    }
    if (eventId === '') {
        return errorJson(
            'declineEventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    let conflict = false;
    await ctx.base.transaction(['states'], async (view) => {
        const state = await currentInvitationState(view, id);
        if (state === 'declined') return;   // idempotent no-op
        if (state !== 'pending') { conflict = true; return; }
        await view.states.postEvent(
            eventId, id, 'declined', ctx.principal.id, at);
    });
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    ctx.base.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return new Response(null, { status: 204 });
}

// Revoke: an admin of the invitation's org cancels a pending
// invite by appending 'revoked'. The invitation row persists as
// audit (mirrors postRoleRevocation). Idempotent on an
// already-revoked invitation.
async function revokeInvitation(
    ctx: AuthenticatedContext,
    id: Id,
    request: Request,
): Promise<Response> {
    const inv = await loadInvitation(ctx.base, id);
    if (inv === null) {
        return errorJson('Not found: /invitations/' + id,
            HTTP_NOT_FOUND);
    }
    if (!await callerIsOrganizationAdmin(
        ctx, inv.organization_id)) {
        return errorJson(
            'forbidden: revoking an invitation requires an'
            + ' admin role', HTTP_FORBIDDEN);
    }
    const parse = await parseObjectBody(request);
    if (!parse.ok) {
        return errorJson('Invalid JSON body', HTTP_BAD_REQUEST);
    }
    const body = parse.body;
    let eventId: string;
    let at: string;
    try {
        eventId = pickString(body, 'revokeEventId');
        at = validateTimestampField(
            body, 'revokeAt', 'revoke',
        );
    } catch (e) {
        if (e instanceof ValidationError) {
            return errorJson(e.message, HTTP_BAD_REQUEST);
        }
        throw e;
    }
    if (eventId === '') {
        return errorJson(
            'revokeEventId must be non-empty',
            HTTP_BAD_REQUEST,
        );
    }
    let conflict = false;
    await ctx.base.transaction(['states'], async (view) => {
        const state = await currentInvitationState(view, id);
        if (state === 'revoked') return;   // idempotent no-op
        if (state !== 'pending') { conflict = true; return; }
        await view.states.postEvent(
            eventId, id, 'revoked', ctx.principal.id, at);
    });
    if (conflict) {
        return errorJson(
            'invitation is not pending', HTTP_CONFLICT);
    }
    ctx.base.postNotification({
        kind: 'scoped',
        organizationIds: [inv.organization_id],
        identityIds: [inv.identity_id],
    });
    return new Response(null, { status: 204 });
}

// Read one invitation by id from the base store, or null when
// absent — the 404 the invitation routes raise.
async function loadInvitation(
    adapter: DbAdapter,
    id: Id,
): Promise<{ id: Id; organization_id: Id;
    identity_id: Id; at: string } | null> {
    try {
        return await adapter.invitations.getById(id);
    } catch (e) {
        if (e instanceof EntityNotFoundError) return null;
        throw e;
    }
}
