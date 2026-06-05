import {
    Identity,
    nowUtc,
    type Id,
    type IdentityEntity,
    type IdentityKind,
    type IdentityPiiEntity,
    type MemberPii,
} from '../../../api/types.ts';
import { hashPassword } from '../../../api/password-hash.ts';
import type { RequestContext, WriteOp } from './shared.ts';

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

export async function getIdentity(
    ctx: RequestContext,
    id: Id,
): Promise<Identity> {
    const entity = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return new Identity(entity);
}

// The whole identity collection (global spine — no org
// fence). Each row is wrapped so the caller speaks the
// domain, not the storage shape.
export async function getIdentities(
    ctx: RequestContext,
): Promise<Identity[]> {
    const rows = await ctx.GET<IdentityEntity[]>(
        'identities',
    );
    return rows.map(row => new Identity(row));
}

// One roster row: the identity discriminant plus its PII
// facet as the tagged union. A missing pii row — a service
// identity, or an erased person — is reported as erased.
// The CALLER decides display; this adapter bakes no
// 'Unknown' fallback (the erased branch carries no name).
export interface IdentityRosterRow {
    readonly id: Id;
    readonly kind: IdentityKind;
    readonly pii: MemberPii;
}

// Single-pass join of identities + identity-pii: read both
// collections in parallel, index the PII by id, then map
// each identity to its row. A present pii row → fields; an
// absent one → { erased: true }.
export async function getIdentityRoster(
    ctx: RequestContext,
): Promise<IdentityRosterRow[]> {
    const [identities, piiRows] = await Promise.all([
        ctx.GET<IdentityEntity[]>('identities'),
        ctx.GET<IdentityPiiEntity[]>('identity-pii'),
    ]);
    const piiById = new Map<Id, IdentityPiiEntity>();
    for (const row of piiRows) {
        piiById.set(row.id, row);
    }
    return identities.map(identity => {
        const row = piiById.get(identity.id);
        const pii: MemberPii = row
            ? {
                erased: false,
                name: row.name,
                email: row.email,
                phone: row.phone,
                bio: row.bio,
            }
            : { erased: true };
        return {
            id: identity.id,
            kind: identity.kind,
            pii,
        };
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

export async function putMemberPii(
    ctx: RequestContext,
    id: Id,
    pii: Omit<IdentityPiiEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`identity-pii/${id}`, { ...pii });
}

export async function deleteIdentityPii(
    ctx: RequestContext,
    id: Id,
): Promise<void> {
    await ctx.DELETE(`identity-pii/${id}`);
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

// Mint an identity by client-minted id + idempotent PUT
// (Commandment VII — no server INSERT). The identity
// stores carry no organization_id, so creation rides the
// GLOBAL spine, OFF the org facade. Person → identity +
// PII; service → identity + a hashed client_secret
// credential. Both halves ride one ctx.commit batch.
export async function postIdentityCreation(
    ctx: RequestContext,
    id: Id,
    spec: IdentityCreationSpec,
): Promise<void> {
    const ops: WriteOp[] = [{
        method: 'put',
        resource: `identities/${id}`,
        body: { kind: spec.kind },
    }];
    if (spec.kind === 'person') {
        ops.push({
            method: 'put',
            resource: `identity-pii/${id}`,
            body: { ...spec.pii },
        });
    } else {
        // Deterministic credential id off the identity id
        // so a retry overwrites the same row — no INSERT on
        // re-put (Commandment VII), matching the person
        // branch and the contract above.
        const credId = `${id}-client-secret`;
        ops.push({
            method: 'put',
            resource: `identity-credentials/${credId}`,
            body: {
                identity_id: id,
                kind: 'client_secret',
                status: 'set',
                secret: await hashPassword(spec.secret),
                at: nowUtc(),
            },
        });
    }
    await ctx.commit({ ops });
}
