import {
    ideaIsVisible,
    assertIdeaState,
    type OrganizationEntity,
    type MembershipEntity,
} from '../shared/types.ts';
import { byAtThenIdAscending } from '../shared/identifier.ts';
import {
    getOrganization as fetchOrganization,
    putOrganization,
} from './organizations.ts';
import {
    activeOrganization,
    type RequestContext,
} from './request-context.ts';
import { getProjects } from './projects.ts';
import { getIdeaEntities } from './ideas.ts';
import { getHumanMembers } from './members.ts';

export async function getOrganizationEntity(
    ctx: RequestContext,
): Promise<OrganizationEntity> {
    // The active org — the tenant the session is scoped to —
    // so the org page reflects an org switch. The session token
    // always carries it post-boot (activeOrganization crashes otherwise).
    return fetchOrganization(ctx, activeOrganization(ctx));
}

export async function getOrganizationSeats(
    ctx: RequestContext,
): Promise<MembershipEntity[]> {
    const organization = ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
    if (organization === undefined) {
        return [];
    }
    // The roster serves in write order; the seats read in
    // grant order, the one order a seat list has (see
    // buildHumanMemberMap), though today's readers only
    // count them.
    return (await ctx.GETCollection<MembershipEntity>(
        'organizations/' + organization
            + '/members/',
    )).map((m) => m.body().toValue())
        .toSorted(byAtThenIdAscending);
}

export interface OrganizationStats {
    projectsCurrent: number;
    ideasCurrent: number;
    activePeopleCount: number;
}

// Live counts from the source collections. getProjects
// drops deleted rows; we further exclude declined
// projects, non-visible ideas, and (when seats are not
// already in hand) count humans. The log is the truth —
// no stale denormalized counter sits between this
// reader and the entities it counts.
export async function getOrganizationStats(
    ctx: RequestContext,
    seatsP?: Promise<readonly MembershipEntity[]>,
): Promise<OrganizationStats> {
    const [projects, ideaMessages, activePeopleCount] =
        await Promise.all([
            getProjects(ctx),
            getIdeaEntities(ctx),
            seatsP !== undefined
                ? seatsP.then(seats => new Set(
                    seats.map(m => m.identity_id),
                ).size)
                : getHumanMembers(ctx).then(
                    humans => humans.length,
                ),
        ]);
    const projectsCurrent = projects.filter(
        p => p.stateValue() !== 'declined',
    ).length;
    const ideaRows = ideaMessages.map(m => m.body().toValue());
    const ideasCurrent = ideaRows.filter(row =>
        ideaIsVisible(
            assertIdeaState(
                row.state, 'idea ' + row.id,
            ),
        ),
    ).length;
    return {
        projectsCurrent,
        ideasCurrent,
        activePeopleCount,
    };
}

export interface GeneralInfoDraft {
    name: string;
    domain: string;
}

export async function
putOrganizationGeneralInfo(
    ctx: RequestContext,
    draft: GeneralInfoDraft,
): Promise<void> {
    const current = await getOrganizationEntity(ctx);
    const { id: _id, ...rest } = current;
    await putOrganization(
        ctx, activeOrganization(ctx), {
            ...rest,
            name: draft.name,
            domain: draft.domain,
        });
}
