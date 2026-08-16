import {
    Identity,
    nowUtc,
    type AIMemberEntity,
    type ClientRegistrationEntity,
    type ClientStatus,
    type Id,
    type IdentityEntity,
    type IdentityKind,
    type IdentityPiiEntity,
    type MemberPii,
} from '../../../api/types.ts';
import {
    RequestError,
    HTTP_NOT_FOUND,
} from '../../../api/http-errors.ts';
import type { RequestContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

// Surface the domain class and PII shapes through the
// adapter barrel so presenters speak one tongue (mirrors
// members.ts re-exporting HumanMember).
export { Identity };
export type {
    Id,
    IdentityKind,
    IdentityPiiEntity,
    MemberPii,
    ClientStatus,
};

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
    const entity = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
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

function piiFacet(
    row: IdentityPiiEntity | undefined,
): MemberPii {
    return row
        ? {
            erased: false,
            name: row.name,
            email: row.email,
            phone: row.phone,
            bio: row.bio,
        }
        : { erased: true };
}

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

// Single-pass join of identities + identity-pii + ai-members:
// read all three in parallel, index the facets by id, then map
// each identity to its row. A person draws its name from
// identity-pii; a service draws its name from ai-members. The
// ai-members read is org-scoped while the identity spine is
// global, so a service owned by another org has no visible
// ai-members row and falls to { named: false } — the service
// analog of out-of-org PII redaction (no leak).
export async function getIdentityRoster(
    ctx: RequestContext,
): Promise<IdentityRosterRow[]> {
    const [identities, piiRows] =
        await Promise.all([
            ctx.GET<IdentityEntity[]>('identities'),
            ctx.GET<IdentityPiiEntity[]>('identity-pii'),
        ]);
    const piiById = new Map<Id, IdentityPiiEntity>();
    for (const row of piiRows) {
        piiById.set(row.id, row);
    }
    return identities.map(identity =>
        identity.kind === 'service'
            ? {
                kind: 'service',
                id: identity.id,
                service: serviceFacet(undefined),
            }
            : {
                kind: 'person',
                id: identity.id,
                pii: piiFacet(piiById.get(identity.id)),
            });
}

// Returns the tagged union. A missing pii row (erased, or a
// service identity) is reported as erased — the CALLER, not
// this adapter, decides what to display.
export async function getMemberPii(
    ctx: RequestContext,
    id: Id,
): Promise<MemberPii> {
    const all = await ctx.GET<IdentityPiiEntity[]>(
        'identity-pii',
    );
    const row = all.find(r => r.id === id);
    if (row === undefined) {
        return { erased: true };
    }
    return {
        erased: false,
        name: row.name,
        email: row.email,
        phone: row.phone,
        bio: row.bio,
    };
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

export async function deleteIdentityPii(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identities/${id}/pii`);
    identityChanges.notify();
}

// The client-registration facet as a tagged union: absence
// (never registered, or deregistered) is a branch, never a
// null — the CALLER renders the unregistered state. Wire
// snake_case crosses to domain camelCase HERE (the adapter
// is the divorce point of vocabulary).
export type ClientRegistration =
    | {
        readonly registered: true;
        readonly grantTypes: string;
        readonly redirectUris: string;
        readonly jwks: string;
        readonly aud: string;
        readonly status: ClientStatus;
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
        const row =
            await ctx.GET<ClientRegistrationEntity>(
                `identities/${id}/registration`,
            );
        return {
            registered: true,
            grantTypes: row.grant_types,
            redirectUris: row.redirect_uris,
            jwks: row.jwks,
            aud: row.aud,
            status: row.status,
        };
    } catch (err) {
        if (
            err instanceof RequestError
            && err.status === HTTP_NOT_FOUND
        ) {
            return { registered: false };
        }
        throw err;
    }
}

export async function putClientRegistration(
    ctx: RequestContext,
    id: Id,
    fields: ClientRegistrationFields,
): Promise<void> {
    await ctx.PUT(`identities/${id}/registration`, {
        grant_types: fields.grantTypes,
        redirect_uris: fields.redirectUris,
        jwks: fields.jwks,
        aud: fields.aud,
        status: fields.status,
    });
    identityChanges.notify();
}

export async function deleteClientRegistration(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identities/${id}/registration`);
    identityChanges.notify();
}

// A person identity carries PII; a service identity
// carries a hashed client_secret credential and no PII.
// The discriminant mirrors IdentityEntity.kind.
export type IdentityCreationSpec =
    | {
        readonly kind: 'person';
        readonly pii: Omit<IdentityPiiEntity, 'id'>;
    }
    | {
        readonly kind: 'service';
        readonly secret: string;
    };

// A person identity's second hop (its PII intake, PUT
// identities/:id/pii) failed after the first hop (the bare
// identity create) already landed — the torn-state acceptance
// Phase 10 Task 2 names: the identity now exists PII-less until
// a retry succeeds. Distinguished from a first-hop failure so
// the caller can name the partial state rather than reporting a
// blanket "failed to add identity".
export class IdentityPiiIntakeFailedError extends Error {
    readonly id: Id;
    constructor(id: Id, cause: unknown) {
        super(
            `identity ${id} was created, but its PII intake`
            + ' failed — it now carries no PII until a retry'
            + ' succeeds',
            { cause },
        );
        this.id = id;
    }
}

// Mint an identity by client-minted id + named POST
// (Commandment VII — no server INSERT; the composing puts
// are idempotent). The identity stores carry no
// organization_id, so creation rides the GLOBAL spine, OFF
// the org facade. Person → identity, then its PII via a
// separate PUT identities/:id/pii (Phase 10 Task 2's intake
// decomposition — the two hops are no longer one transaction,
// so a bad PII sub-object can no longer roll the identity back);
// service → identity + a client_secret credential, still
// one POST /identities transaction. The secret is hashed
// on the server write.
export async function postIdentityCreation(
    ctx: RequestContext,
    id: Id,
    spec: IdentityCreationSpec,
): Promise<void> {
    if (spec.kind === 'person') {
        await ctx.POST('identities', {
            id,
            kind: 'person',
        });
        try {
            await ctx.PUT(`identities/${id}/pii`, {
                ...spec.pii,
            });
        } catch (err) {
            throw new IdentityPiiIntakeFailedError(id, err);
        }
    } else {
        // Deterministic credential id off the identity id
        // so a retry overwrites the same row — no INSERT on
        // re-put (Commandment VII), matching the person
        // branch and the contract above.
        await ctx.POST('identities', {
            id,
            kind: 'service',
            credential: {
                id: `${id}-client-secret`,
                identity_id: id,
                kind: 'client_secret',
                status: 'set',
                secret: spec.secret,
                at: nowUtc(),
            },
        });
    }
    identityChanges.notify();
}
