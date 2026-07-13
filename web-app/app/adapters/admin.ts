import type {
    OrganizationEntity,
    MembershipEntity,
} from '../../../api/types.ts';
import {
    getOrganization as fetchOrganization,
    putOrganization,
} from './organizations.ts';
import { formatCalendarDate } from '../format.ts';
import {
    activeOrganization,
    type RequestContext,
} from './shared.ts';
import { getProjects } from './projects.ts';
import { getIdeas } from './ideas.ts';
import { getHumanMembers } from './members.ts';

export type {
    OrganizationEntity,
} from '../../../api/types.ts';

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

// Derive seat usage from the memberships ledger.
// The read is org-fenced through the org-owned fence —
// so the count is the active org's slice.
async function deriveOrganizationFacts(
    ctx: RequestContext,
): Promise<OrganizationDerived> {
    const memberships =
        await ctx.GET<MembershipEntity[]>('memberships');
    const identities = new Set(
        memberships.map(m => m.identity_id),
    );
    return {
        usedSeats: identities.size,
    };
}

export async function getOrganization(
    ctx: RequestContext,
): Promise<Organization> {
    const [entity, derived] = await Promise.all([
        getOrganizationEntity(ctx),
        deriveOrganizationFacts(ctx),
    ]);
    return new Organization(entity, derived);
}

export interface OrganizationStats {
    projectsCurrent: number;
    ideasCurrent: number;
    activePeopleCount: number;
}

// Live counts computed from the source tables. The
// state-log filters in getProjects / getIdeas /
// getHumanMembers already drop deleted rows; we
// further narrow projects to exclude 'declined',
// ideas to exclude 'archived', and people to keep
// only 'active'. The log is the truth — no stale
// denormalized counter sits between this reader
// and the entities it counts.
export async function getOrganizationStats(
    ctx: RequestContext,
): Promise<OrganizationStats> {
    const [projects, ideas, humans] =
        await Promise.all([
            getProjects(ctx),
            getIdeas(ctx),
            getHumanMembers(ctx),
        ]);
    const projectsCurrent = projects.filter(
        p => p.stateValue() !== 'declined',
    ).length;
    const ideasCurrent = ideas.length;
    const activePeopleCount = humans.filter(
        h => h.stateValue() === 'active',
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
