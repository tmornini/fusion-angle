import {
    Identity,
    nowUtc,
    type AIMemberEntity,
    type Id,
    type IdentityEntity,
    type IdentityKind,
    type IdentityPiiEntity,
    type MemberPii,
} from '../../../api/types.ts';
import { hashPassword } from '../../../shared/password-hash.ts';
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
    const [identities, piiRows, aiRows] =
        await Promise.all([
            ctx.GET<IdentityEntity[]>('identities'),
            ctx.GET<IdentityPiiEntity[]>('identity-pii'),
            ctx.GET<AIMemberEntity[]>('ai-members'),
        ]);
    const piiById = new Map<Id, IdentityPiiEntity>();
    for (const row of piiRows) {
        piiById.set(row.id, row);
    }
    const aiById = new Map<Id, AIMemberEntity>();
    for (const row of aiRows) {
        aiById.set(row.id, row);
    }
    return identities.map(identity =>
        identity.kind === 'service'
            ? {
                kind: 'service',
                id: identity.id,
                service: serviceFacet(
                    aiById.get(identity.id),
                ),
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
    ctx: RequestContext,
    id: Id,
): Promise<ServiceFacet> {
    const all = await ctx.GET<AIMemberEntity[]>(
        'ai-members',
    );
    return serviceFacet(all.find(r => r.id === id));
}

export async function deleteIdentityPii(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identities/${id}/pii`);
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

// Mint an identity by client-minted id + named POST
// (Commandment VII — no server INSERT; the composing puts
// are idempotent). The identity stores carry no
// organization_id, so creation rides the GLOBAL spine, OFF
// the org facade. Person → identity + PII; service →
// identity + a hashed client_secret credential. Both halves
// ride one POST /identities transaction. The secret is
// hashed HERE (client-side); the route touches no crypto.
export async function postIdentityCreation(
    ctx: RequestContext,
    id: Id,
    spec: IdentityCreationSpec,
): Promise<void> {
    if (spec.kind === 'person') {
        await ctx.POST('identities', {
            id,
            kind: 'person',
            pii: { ...spec.pii },
        });
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
                secret: await hashPassword(spec.secret),
                at: nowUtc(),
            },
        });
    }
    identityChanges.notify();
}
