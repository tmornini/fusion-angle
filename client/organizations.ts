import type {
    IdeaEntity,
    MembershipReadEntity,
    OrganizationEntity,
    ProjectEntity,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import {
    activeOrganization,
    type RequestContext,
} from './request-context.ts';
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

// The organization's ideas, projects, and people matching
// `text`, best match first within each.
export interface OrganizationMatches {
    readonly ideas: readonly HttpMessage<IdeaEntity>[];
    readonly projects: readonly HttpMessage<ProjectEntity>[];
    readonly members:
        readonly HttpMessage<MembershipReadEntity>[];
}

// Each part names its document in its content-location,
// /organizations/:id/<family>/:id, and the family sorts it.
// A family this client does not know is a server it does
// not know, so the search fails rather than drop the part.
export async function queryOrganization(
    ctx: RequestContext,
    text: string,
): Promise<OrganizationMatches> {
    const parts = await ctx.QUERY(
        'organizations/' + activeOrganization(ctx), { q: text },
    );
    const ideas: HttpMessage<IdeaEntity>[] = [];
    const projects: HttpMessage<ProjectEntity>[] = [];
    const members: HttpMessage<MembershipReadEntity>[] = [];
    for (const part of parts) {
        const location = part.query('header.content-location')
            .toText();
        const family = location.split('/')[3];
        if (family === 'ideas') {
            ideas.push(part as HttpMessage<IdeaEntity>);
        } else if (family === 'projects') {
            projects.push(part as HttpMessage<ProjectEntity>);
        } else if (family === 'invitations') {
            members.push(part as HttpMessage<MembershipReadEntity>);
        } else {
            throw new Error(
                'an organization search part names an unknown'
                    + ' family: ' + location,
            );
        }
    }
    return { ideas, projects, members };
}
