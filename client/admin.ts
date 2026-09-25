import {
    ideaIsVisible,
    assertIdeaState,
    type OrganizationEntity,
    type MembershipEntity,
} from '../shared/types.ts';
import {
    getOrganization as fetchOrganization,
    putOrganization,
} from './organizations.ts';
import { formatCalendarDate } from '../web-app/app/format.ts';
import {
    activeOrganization,
    type RequestContext,
} from './shared.ts';
import { getProjects } from './projects.ts';
import { getIdeaEntities } from './ideas.ts';
import { getHumanMembers } from './members.ts';

export type {
    OrganizationEntity,
} from '../shared/types.ts';

async function getOrganizationEntity(
    ctx: RequestContext,
): Promise<OrganizationEntity> {
    // The active org — the tenant the session is scoped to —
    // so the org page reflects an org switch. The session token
    // always carries it post-boot (activeOrganization crashes otherwise).
    return fetchOrganization(ctx, activeOrganization(ctx));
}

// Ledger-derived facts about the org, computed at read time:
// seat usage counts DISTINCT identities in the memberships
// ledger (org-fenced through the org-owned fence).
export interface OrganizationDerived {
    readonly usedSeats: number;
}

export class Organization {
    readonly #entity: OrganizationEntity;
    readonly #derived: OrganizationDerived;

    constructor(
        entity: OrganizationEntity,
        derived: OrganizationDerived,
    ) {
        this.#entity = entity;
        this.#derived = derived;
    }

    nameText(): string {
        return this.#entity.name;
    }

    domainText(): string {
        return this.#entity.domain;
    }

    toGeneralInfoDraft(): GeneralInfoDraft {
        return {
            name: this.#entity.name,
            domain: this.#entity.domain,
        };
    }

    seatsUsage(): {
        used: number;
        total: number;
        percent: number;
    } {
        const used = this.#derived.usedSeats;
        const total = this.#entity.seats;
        const percent = total > 0
            ? Math.min(
                100,
                (used / total) * 100,
            )
            : 0;
        return { used, total, percent };
    }

    usedSeats(): number {
        return this.#derived.usedSeats;
    }

    totalSeats(): number {
        return this.#entity.seats;
    }

    projectsLimit(): number {
        return this.#entity.projects_limit;
    }

    ideasLimit(): number {
        return this.#entity.ideas_limit;
    }

    nextBillingDate(): string {
        return formatCalendarDate(
            this.#entity.next_billing,
        );
    }
}

export async function getOrganizationSeats(
    ctx: RequestContext,
): Promise<MembershipEntity[]> {
    const organization = ctx.identity.organization
        ?? ctx.identity.organizations?.[0];
    if (organization === undefined) {
        return [];
    }
    return ctx.GET<MembershipEntity[]>(
        'organizations/' + organization
            + '/members/',
    );
}

// Derive seat usage from the memberships ledger.
// The read is org-fenced through the org-owned fence —
// so the count is the active org's slice.
async function deriveOrganizationFacts(
    ctx: RequestContext,
    seatsP?: Promise<readonly MembershipEntity[]>,
): Promise<OrganizationDerived> {
    const seats = seatsP !== undefined
        ? await seatsP
        : await getOrganizationSeats(ctx);
    const identities = new Set(
        seats.map(m => m.identity_id),
    );
    return {
        usedSeats: identities.size,
    };
}

export async function getOrganization(
    ctx: RequestContext,
    seatsP?: Promise<readonly MembershipEntity[]>,
): Promise<Organization> {
    const [entity, derived] = await Promise.all([
        getOrganizationEntity(ctx),
        deriveOrganizationFacts(ctx, seatsP),
    ]);
    return new Organization(entity, derived);
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
    const [projects, ideaRows, activePeopleCount] =
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
