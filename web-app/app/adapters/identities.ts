import {
    Identity,
    type Id,
    type IdentityEntity,
    type IdentityPiiEntity,
    type MemberPii,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

export async function getIdentity(
    ctx: RequestContext,
    id: Id,
): Promise<Identity> {
    const entity = await ctx.GET<IdentityEntity>(
        `identities/${id}`,
    );
    return new Identity(entity);
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
