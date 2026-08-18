import type {
    OrganizationEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

// The organization vessel adapter — RequestContext is the sole
// argument, HTTP-verb naming. `getOrganizations` lists the
// caller's live seats at the identity nest.
export async function getOrganizations(
    ctx: RequestContext,
): Promise<OrganizationEntity[]> {
    return ctx.GET<OrganizationEntity[]>(
        'identities/' + ctx.identity.id
            + '/organizations/',
    );
}

export async function getOrganization(
    ctx: RequestContext,
    id: string,
): Promise<OrganizationEntity> {
    return ctx.GET<OrganizationEntity>(
        'organizations/' + id,
    );
}

export async function putOrganization(
    ctx: RequestContext,
    id: string,
    fields: Omit<OrganizationEntity, 'id'>,
): Promise<void> {
    await ctx.PUT('organizations/' + id, fields);
}
