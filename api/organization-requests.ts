import {
    currentDefaultOrganizationFor,
} from './authorization.ts';
import {
    subjectOrganizations,
    identityDefaultOrganization,
} from './authentication.ts';
import {
    errorJson,
    HTTP_BAD_REQUEST,
    HTTP_UNAUTHORIZED,
    HTTP_FORBIDDEN,
} from './http-errors.ts';
import {
    authenticateRequest,
    parseObjectBody,
    callerOrganizationIds,
} from './request-auth.ts';
import {
    validateTimestampField,
} from './validators.ts';
import {
    type IncomingContext,
    type AuthenticatedContext,
} from './request-context.ts';

// GET /organizations — the caller's reachable orgs, derived
// fresh from the membership ledger (never the token claim, so
// it cannot be stale). The authoritative source the embedded
// `orgs` claim is a snapshot of.
async function enumerateMyOrganizations(
    ctx: AuthenticatedContext,
): Promise<Response> {
    const mine =
        await callerOrganizationIds(ctx.base, ctx.principal);
    const organizations = await ctx.base.organizations.getAll();
    return Response.json(
        organizations.filter(o => mine.has(o.id)),
    );
}

// PUT/GET /identities/:id/default-org — the read/write face of
// the identity_default_organizations ledger. Authorized by tree ownership
// (caller === :id), not the admin role policy: an identity owns
// its own subtree. PUT appends a NEW event only when the org
// changes (an idempotent repeat writes nothing), and only if the
// org is one of the identity's memberships (no dangling default).
export async function identityDefaultOrganizationRequest(
    ctx: IncomingContext,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const authed =
        await authenticateRequest(ctx, request);
    if (typeof authed === 'string') {
        return Response.json(
            { error: authed },
            { status: HTTP_UNAUTHORIZED },
        );
    }
    const identityId = segments[1]!;
    if (authed.principal.id !== identityId) {
        return Response.json(
            {
                error: 'forbidden: an identity may act only'
                    + ' within its own tree',
            },
            { status: HTTP_FORBIDDEN },
        );
    }
    if (ctx.method === 'GET') {
        return Response.json({
            organization_id:
                await identityDefaultOrganization(
                    ctx.base, identityId,
                ),
        });
    }
    if (ctx.method === 'PUT') {
        const parse = await parseObjectBody(request);
        if (!parse.ok) {
            return Response.json(
                { error: 'Invalid JSON body' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const body = parse.body;
        const organization = body.organization_id;
        if (typeof organization !== 'string') {
            return Response.json(
                { error: 'organization_id is required' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const eventId = body.eventId;
        if (typeof eventId !== 'string') {
            return Response.json(
                { error: 'eventId is required' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        if (eventId === '') {
            return Response.json(
                { error: 'eventId must be non-empty' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        let at: string;
        try {
            at = validateTimestampField(body, 'at',
                'identity_default_organizations');
        } catch {
            return Response.json(
                { error: 'at is required and must be'
                    + ' a valid RFC-3339 timestamp' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const memberOrganizations =
            await subjectOrganizations(ctx.base, identityId);
        if (!memberOrganizations.includes(organization)) {
            return Response.json(
                {
                    error: 'forbidden: org is not one of the'
                        + " identity's memberships",
                },
                { status: HTTP_FORBIDDEN },
            );
        }
        const rows =
            await ctx.base.identityDefaultOrganizations.getAll();
        if (
            currentDefaultOrganizationFor(rows, identityId) === organization
        ) {
            return new Response(null, { status: 204 });
        }
        await ctx.base.identityDefaultOrganizations.put(
            eventId, {
                identity_id: identityId,
                organization_id: organization,
                at,
            });
        return new Response(null, { status: 204 });
    }
    return Response.json(
        {
            error: 'Method ' + ctx.method
                + ' not allowed',
        },
        { status: 405 },
    );
}

// GET /organizations enumerates the caller's OWN membership
// orgs — identity-scoped like /invitations, so it gates on
// authentication, not a role. enumerateMyOrganizations self-fences to
// the caller's memberships, so a roleless member sees only
// their own orgs and can boot the shell.
export async function organizationsEnumerationRequest(
    ctx: IncomingContext,
    request: Request,
): Promise<Response> {
    const authed =
        await authenticateRequest(ctx, request);
    if (typeof authed === 'string') {
        return errorJson(authed, HTTP_UNAUTHORIZED);
    }
    return enumerateMyOrganizations(authed);
}
