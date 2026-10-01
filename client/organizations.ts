import type {
    OrganizationEntity,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';

// The organization vessel adapter — RequestContext is the sole
// argument, HTTP-verb naming. `getOrganizations` lists the
// caller's live seats at the identity nest.
export async function getOrganizations(
    ctx: RequestContext,
): Promise<OrganizationEntity[]> {
    return (await ctx.GET<OrganizationEntity[]>(
        'identities/' + ctx.identity.id
            + '/organizations/',
    )).body().toValue();
}

export async function getOrganization(
    ctx: RequestContext,
    id: string,
): Promise<OrganizationEntity> {
    return (await ctx.GET<OrganizationEntity>(
        'organizations/' + id,
    )).body().toValue();
}

export async function putOrganization(
    ctx: RequestContext,
    id: string,
    fields: Omit<OrganizationEntity, 'id'>,
): Promise<void> {
    await ctx.PUT('organizations/' + id, fields);
}
