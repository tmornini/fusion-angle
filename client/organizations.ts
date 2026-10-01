import type {
    OrganizationEntity,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type { RequestContext } from './request-context.ts';
import { compareIdentifiers } from '../shared/identifier.ts';

// The organization verbs — RequestContext first, HTTP-verb
// naming; `getOrganization` takes the id and `putOrganization`
// the held message it latches. `getOrganizations` lists the
// caller's live seats at the identity nest, by id: the
// collection orders by write, and an organization's edit
// must move neither the boot fallback's first reachable
// organization nor the switcher's options.
export async function getOrganizations(
    ctx: RequestContext,
): Promise<HttpMessage<OrganizationEntity>[]> {
    return (await ctx.GETCollection<OrganizationEntity>(
        'identities/' + ctx.identity.id
            + '/organizations/',
    )).sort((a, b) => compareIdentifiers(
        a.body().toValue().id, b.body().toValue().id,
    ));
}

export function getOrganization(
    ctx: RequestContext,
    id: string,
): Promise<HttpMessage<OrganizationEntity>> {
    return ctx.GET<OrganizationEntity>('organizations/' + id);
}

// The PUT latches the held head, so an edit landing since the
// page read it refuses this one with a 412 rather than being
// overwritten.
export function putOrganization(
    ctx: RequestContext,
    held: HttpMessage<OrganizationEntity>,
    body: Omit<OrganizationEntity, 'id'>,
): Promise<HttpMessage<OrganizationEntity>> {
    return ctx.PUT<OrganizationEntity>(
        'organizations/' + held.body().toValue().id,
        body,
        [held],
    );
}
