import type {
    OrganizationEntity,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';

// The organization vessel adapter — RequestContext is the sole
// argument, HTTP-verb naming. `getOrganizations` is the
// enumerate: the gate scopes GET /organizations to the
// caller's memberships, so this returns only reachable orgs.
export async function getOrganizations(
    ctx: RequestContext,
): Promise<OrganizationEntity[]> {
    return ctx.GET<OrganizationEntity[]>('organizations');
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
