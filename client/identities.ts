import {
    Identity,
    type AIMemberEntity,
    type ClientRegistrationEntity,
    type ClientStatus,
    type Id,
    type IdentityEntity,
    type IdentityPiiEntity,
    type MemberPii,
} from '../shared/types.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
    HTTP_FORBIDDEN,
    HTTP_GONE,
} from '../shared/http-errors.ts';
import type { RequestContext } from './request-context.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';

// The identity surfaces derive from these stores: roster
// and detail read identities + PII + the AI facet; the
// detail's credential state reads identity_credentials.
const identityChanges =
    createSubscriptionChannel();

export function subscribeIdentityChanges(
    fn: () => void,
): () => void {
    return identityChanges.subscribe(fn);
}

export async function getIdentity(
    ctx: RequestContext,
    id: Id,
): Promise<Identity> {
    const entity = (await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    )).body().toValue();
    return new Identity(entity);
}

// The display name for a person identity whose PII is absent —
// erased, or never recorded. An identity is NOT a member, so
// this is distinct from the member-domain MEMBER_WITHOUT_PII_NAME:
// each domain names the absence in its own vocabulary.
export const IDENTITY_WITHOUT_PII_NAME = 'Identity without PII';

// The display name for a service identity with no name visible
// to the caller — a bare credentialed service, or one owned by
// another org. The service analog of IDENTITY_WITHOUT_PII_NAME.
export const UNNAMED_SERVICE_NAME = 'Service account';

// A service identity's display facet — named (its ai_members
// row is visible) or not. The nameless branch carries no id;
// the CALLER redacts it, mirroring the erased PII branch.
export type ServiceFacet =
    | {
        readonly named: true;
        readonly name: string;
        readonly detail: string;
    }
    | { readonly named: false };

// One roster row, discriminated by kind. A person carries its
// PII facet (present or erased); a service carries its service
// facet (named or not). Neither branch ever falls back to the
// raw id — the CALLER decides how to render an absent name.
export type IdentityRosterRow =
    | {
        readonly kind: 'person';
        readonly id: Id;
        readonly pii: MemberPii;
    }
    | {
        readonly kind: 'service';
        readonly id: Id;
        readonly service: ServiceFacet;
    };

function serviceFacet(
    row: AIMemberEntity | undefined,
): ServiceFacet {
    return row
        ? {
            named: true,
            name: row.name,
            detail: row.description,
        }
        : { named: false };
}

// GET identities, then fill each person via nested
// GET identities/:id/pii. Service rows stay unnamed
// (serviceFacet(undefined)); an AI member has a service
// identity, so it reads as a row too.
export async function getIdentityRoster(
    ctx: RequestContext,
): Promise<IdentityRosterRow[]> {
    const identities = (await ctx.GETCollection<IdentityEntity>(
        'identities/',
    )).map((m) => m.body().toValue());
    return Promise.all(identities.map(async identity =>
        identity.kind === 'service'
            ? {
                kind: 'service',
                id: identity.id,
                service: serviceFacet(undefined),
            }
            : {
                kind: 'person',
                id: identity.id,
                pii: await getMemberPii(ctx, identity.id),
            }));
}

// Nested facet only. 404 (absent), 410 (erased), and 403
// (not self, not admin) all surface as erased —
// the CALLER, not this adapter, decides the display.
export async function getMemberPii(
    ctx: RequestContext,
    id: Id,
): Promise<MemberPii> {
    try {
        const message = await ctx.GET<IdentityPiiEntity>(
            `identities/${id}/pii`,
        );
        const row = message.body().toValue();
        return {
            erased: false,
            name: row.name,
            email: row.email,
            phone: row.phone,
            bio: row.bio,
            message,
        };
    } catch (error) {
        if (error instanceof RequestError
            && (error.status === HTTP_NOT_FOUND
                || error.status === HTTP_GONE
                || error.status === HTTP_FORBIDDEN)) {
            return { erased: true };
        }
        throw error;
    }
}

// One service identity's display facet — its name from the
// ai-members row, or { named: false } when that row is not
// visible. Mirrors getMemberPii; the CALLER redacts an
// absent name rather than leaking the id.
export async function getServiceFacet(
    _ctx: RequestContext,
    _id: Id,
): Promise<ServiceFacet> {
    return serviceFacet(undefined);
}

// An erase over held PII names the head it replaces; over
// absent PII there is no head to name.
export async function deleteIdentityPii(
    ctx: RequestContext,
    id: Id,
    current: MemberPii,
): Promise<void> {
    await ctx.DELETE(
        `identities/${id}/pii`,
        current.erased ? undefined : [current.message],
    );
    identityChanges.notify();
}

// The client-registration facet as a tagged union: absence
// (never registered, or deregistered) is a branch, never a
// null — the CALLER renders the unregistered state. Wire
// snake_case crosses to domain camelCase HERE (the adapter
// is the divorce point of vocabulary). A registration
// keeps the message it was read from, so a write over it
// names the head it replaces.
export type ClientRegistration =
    | {
        readonly registered: true;
        readonly grantTypes: string;
        readonly redirectUris: string;
        readonly jwks: string;
        readonly aud: string;
        readonly status: ClientStatus;
        readonly message: HttpMessage<ClientRegistrationEntity>;
    }
    | { readonly registered: false };

export interface ClientRegistrationFields {
    readonly grantTypes: string;
    readonly redirectUris: string;
    readonly jwks: string;
    readonly aud: string;
    readonly status: ClientStatus;
}

export async function getClientRegistration(
    ctx: RequestContext,
    id: Id,
): Promise<ClientRegistration> {
    try {
        const message =
            await ctx.GET<ClientRegistrationEntity>(
                `identities/${id}/registration`,
            );
        const row = message.body().toValue();
        return {
            registered: true,
            grantTypes: row.grant_types,
            redirectUris: row.redirect_uris,
            jwks: row.jwks,
            aud: row.aud,
            status: row.status,
            message,
        };
    } catch (err) {
        if (
            err instanceof RequestError
            && (err.status === HTTP_NOT_FOUND
                || err.status === HTTP_GONE)
        ) {
            return { registered: false };
        }
        throw err;
    }
}

// A write over a held registration names the head it
// replaces; an unregistered identity has none, so its
// first registration goes unlatched.
export async function putClientRegistration(
    ctx: RequestContext,
    id: Id,
    fields: ClientRegistrationFields,
    current: ClientRegistration,
): Promise<HttpMessage<ClientRegistrationEntity>> {
    const saved = await ctx.PUT<ClientRegistrationEntity>(
        `identities/${id}/registration`,
        {
            grant_types: fields.grantTypes,
            redirect_uris: fields.redirectUris,
            jwks: fields.jwks,
            aud: fields.aud,
            status: fields.status,
        },
        current.registered ? [current.message] : undefined,
    );
    identityChanges.notify();
    return saved;
}

export async function deleteClientRegistration(
    ctx: RequestContext,
    id: Id,
    current: ClientRegistration,
): Promise<void> {
    await ctx.DELETE(
        `identities/${id}/registration`,
        current.registered ? [current.message] : undefined,
    );
    identityChanges.notify();
}
