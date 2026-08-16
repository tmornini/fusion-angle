import {
    currentDefaultOrganizationFor,
} from './authorization.ts';
import {
    HTTP_NO_CONTENT,
    HTTP_BAD_REQUEST,
    HTTP_FORBIDDEN,
    HTTP_NOT_FOUND,
    HTTP_METHOD_NOT_ALLOWED,
} from './http-errors.ts';
import {
    authenticateRequest,
    unauthorizedBearerResponse,
    parseObjectBody,
    callerOrganizationIds,
} from './request-auth.ts';
import {
    type IncomingContext,
    type AuthenticatedContext,
} from './request-context.ts';
import {
    formWritePair,
    storedResponseFor,
    appendMessagePair,
    sendWriteResponse,
    hoistedHeaderFields,
    storedPairResponse,
    requireOperationId,
    OPERATION_ID_HEADER,
} from './message-pair.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    deriveDefaultOrganization,
} from './derive-default-organization.ts';
import { membershipExistsFor } from './derive-memberships.ts';

// GET /organizations — the caller's reachable orgs, derived
// fresh from the membership ledger (never the token claim, so
// it cannot be stale). The authoritative source the embedded
// `orgs` claim is a snapshot of. The row list itself is now the
// PAIR-PLANE derivation (Phase 12 Task 5) — tests/drift-
// organizations.test.ts leg 1 pins this function's own output
// byte-identical to the row-plane read it replaces; the
// membership filter below is UNTOUCHED — this flip is the row
// SOURCE only, never the fence.
async function enumerateMyOrganizations(
    ctx: AuthenticatedContext,
): Promise<Response> {
    const mine =
        await callerOrganizationIds(ctx.base, ctx.principal);
    const organizations = await deriveOrganizations(ctx.base);
    return Response.json(
        organizations.filter(o => mine.has(o.id)),
    );
}

// PUT/GET /identities/:id/default-organization — a simple
// document. Authorized by tree ownership (caller === :id).
// PUT { organization_id } must name a live seat, else 400
// and nothing is stored. GET returns that document or 404
// if never SET. No public DELETE. Revoke does not rewrite
// this document.
export async function identityDefaultOrganizationRequest(
    ctx: IncomingContext,
    request: Request,
    segments: readonly string[],
): Promise<Response> {
    const authed =
        await authenticateRequest(ctx, request);
    if (typeof authed === 'string') {
        return unauthorizedBearerResponse(authed);
    }
    const denied = requireOperationId(
        request, ctx.method, false,
    );
    if (denied !== undefined) return denied;
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
        const rows = await deriveDefaultOrganization(
            ctx.base, identityId,
        );
        const set = currentDefaultOrganizationFor(
            rows, identityId,
        );
        if (set === null) {
            return Response.json(
                { error: 'not found' },
                { status: HTTP_NOT_FOUND },
            );
        }
        return Response.json({ organization_id: set });
    }
    if (ctx.method === 'PUT') {
        const parse = await parseObjectBody(request);
        if (!parse.ok) {
            return Response.json(
                { error: 'Invalid JSON body' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const organization = parse.body.organization_id;
        if (typeof organization !== 'string') {
            return Response.json(
                { error: 'organization_id is required' },
                { status: HTTP_BAD_REQUEST },
            );
        }
        if (
            !await membershipExistsFor(
                ctx.base, organization, identityId,
            )
        ) {
            return Response.json(
                {
                    error: 'organization_id is not a'
                        + ' live seat',
                },
                { status: HTTP_BAD_REQUEST },
            );
        }
        const document = {
            organization_id: organization,
        };
        const operationId = request.headers.get(
            OPERATION_ID_HEADER,
        );
        if (operationId === null || operationId === '') {
            throw new Error(
                'Operation-ID missing after require',
            );
        }
        const pair = await formWritePair({
            method: 'PUT',
            pathname: ctx.pathname,
            routePattern:
                'identities/:id/default-organization',
            routeSegments: [
                'identities', ':id', 'default-organization',
            ],
            pathSegments: [
                'identities', identityId,
                'default-organization',
            ],
            headerFields: hoistedHeaderFields(request),
            body: document,
            requesterIdentityId: authed.principal.id,
            requestAt: ctx.requestAt, organization: undefined,
            responseStatus: HTTP_NO_CONTENT,
            responseBody: undefined,
            operationId,
        });
        const replay = await storedResponseFor(
            ctx.base, pair.requestHash);
        if (replay !== undefined) {
            return sendWriteResponse(replay, 'PUT', true);
        }
        const rows = await deriveDefaultOrganization(
            ctx.base, identityId);
        const changes = currentDefaultOrganizationFor(
            rows, identityId) !== organization;
        await ctx.base.transaction(
            ['requests', 'responses'],
            async (view) => {
                await appendMessagePair(view, pair);
            },
        );
        if (changes) {
            ctx.base.postNotification({
                kind: 'scoped',
                organizationIds: [],
                identityIds: [identityId],
            });
        }
        return storedPairResponse(
            ctx.base, pair.requestHash,
            'identityDefaultOrganizationRequest',
            'PUT',
        );
    }
    return Response.json(
        {
            error: 'Method ' + ctx.method
                + ' not allowed',
        },
        { status: HTTP_METHOD_NOT_ALLOWED },
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
        return unauthorizedBearerResponse(authed);
    }
    return enumerateMyOrganizations(authed);
}
