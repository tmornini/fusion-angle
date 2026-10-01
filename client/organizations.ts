import type {
    OrganizationEntity,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import { compareIdentifiers } from '../shared/identifier.ts';

// The organization vessel adapter — RequestContext is the sole
// argument, HTTP-verb naming. `getOrganizations` lists the
// caller's live seats at the identity nest, by id: the
// collection orders by write, and an organization's edit
// must move neither the boot fallback's first reachable
// organization nor the switcher's options.
export async function getOrganizations(
    ctx: RequestContext,
): Promise<OrganizationEntity[]> {
    return (await ctx.GETCollection<OrganizationEntity>(
        'identities/' + ctx.identity.id
            + '/organizations/',
    )).map((m) => m.body().toValue())
        .sort((a, b) => compareIdentifiers(a.id, b.id));
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
