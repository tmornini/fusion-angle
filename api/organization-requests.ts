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
import {
    formWritePair,
    storedResponseFor,
    appendMessagePair,
    responseFromStored,
    hoistedHeaderFields,
    storedPairResponse,
} from './message-pair.ts';
import { deriveOrganizations } from './derive-organizations.ts';
import {
    deriveDefaultOrganization,
} from './derive-default-organization.ts';

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
        // Validate `at` for the wire body (pair-plane payload);
        // Phase Final Task 2 no longer stamps a row with it.
        try {
            validateTimestampField(body, 'at',
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
        // Event-append class: uriId is the body's OWN eventId
        // (fresh per write, never the identity from the URL) —
        // achieved by treating the eventId as a trailing :param
        // segment (messageAddress derives uriId from a route
        // whose LAST segment is a :param). No head-read, no
        // Supersedes, global plane (organization: undefined) —
        // this ledger is latest-wins by (at, id), not a document
        // chain. Formed pre-tx (crypto stays outside the
        // transaction body — the IndexedDB auto-commit
        // constraint). The response is ALWAYS 204/no-body, so
        // the pair's shape is identical whether or not the org
        // actually changes.
        const pair = await formWritePair({
            method: 'PUT',
            pathname: ctx.pathname,
            routePattern: 'identities/:id/default-org',
            routeSegments: [
                'identities', ':id', 'default-org', ':eventId',
            ],
            pathSegments: [
                'identities', identityId, 'default-org', eventId,
            ],
            headerFields: hoistedHeaderFields(request),
            body, requesterIdentityId: authed.principal.id,
            requestAt: ctx.requestAt, organization: undefined,
            responseStatus: 204, responseBody: undefined,
            headPairId: undefined,
        });
        const replay = await storedResponseFor(
            ctx.base, pair.requestHash);
        if (replay !== undefined) {
            return responseFromStored(replay);
        }
        // FLIPPED (Phase 13 Task 8): deriveDefaultOrganization
        // (Phase 11) reads this identity's own /default-org
        // prefix — a targeted, identity-keyed read, never a
        // full-ledger scan — replacing the SOLE remaining
        // production read of the identity_default_organizations
        // table. currentDefaultOrganizationFor (the reducer) and
        // its fallback wiring below are BYTE-UNCHANGED — only the
        // row source moves.
        const rows = await deriveDefaultOrganization(
            ctx.base, identityId);
        const changes = currentDefaultOrganizationFor(
            rows, identityId) !== organization;
        if (changes) {
            // Phase Final Task 2: identity_default_organizations
            // ROW half stripped — pure pair-plane write.
            await ctx.base.transaction(
                ['requests', 'responses'],
                async (view) => {
                    await appendMessagePair(view, pair);
                },
            );
            // This side channel returns from handleRequest
            // BEFORE the dispatch switch, so the generic
            // gate-side post hook (api.ts's postWriteNotification)
            // never fires for it — post its own scoped event so
            // cross-tab refresh of the identity-tokens page is
            // preserved. The idempotent no-change branch below
            // writes no ledger row, so it posts nothing — the
            // established "skip notification on no-op writes"
            // precedent (see git history).
            ctx.base.postNotification({
                kind: 'scoped',
                organizationIds: [],
                identityIds: [identityId],
            });
        } else {
            // The no-change branch still returns 2xx, so the
            // pair IS this request's only write — a minimal tx
            // over just the message-plane tables.
            await ctx.base.transaction(
                ['requests', 'responses'],
                async (view) => {
                    await appendMessagePair(view, pair);
                },
            );
        }
        return storedPairResponse(
            ctx.base, pair.requestHash,
            'identityDefaultOrganizationRequest',
        );
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
