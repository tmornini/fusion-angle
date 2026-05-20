import type {
    OrganizationEntity,
} from '../../../api/types.ts';
import {
    formatDate,
} from '../format.ts';
import type { RequestContext } from './shared.ts';
import { getProjects } from './projects.ts';
import { getIdeas } from './ideas.ts';
import { getHumanWorkers } from './workers.ts';

export type {
    OrganizationEntity,
} from '../../../api/types.ts';

async function getOrganizationRow(
    ctx: RequestContext,
): Promise<OrganizationEntity> {
    return ctx.GET<OrganizationEntity>(
        'organization',
    );
}

export class Organization {
    readonly #entity: OrganizationEntity;

    constructor(entity: OrganizationEntity) {
        this.#entity = entity;
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

    planLabel(): string {
        return this.#entity.plan + ' Plan';
    }

    planStatusText(): string {
        return this.#entity.plan_status;
    }

    healthScorePercent(): number {
        return this.#entity.health_score;
    }

    healthStatusText(): string {
        return this.#entity.health_status;
    }

    seatsUsage(): {
        used: number;
        total: number;
        percent: number;
    } {
        const used = this.#entity.used_seats;
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
        return this.#entity.used_seats;
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
        return formatDate(
            this.#entity.next_billing,
        );
    }

    lastActivityText(): string {
        return this.#entity.last_activity;
    }
}

export async function getOrganization(
    ctx: RequestContext,
): Promise<Organization> {
    const entity =
        await getOrganizationRow(ctx);
    return new Organization(entity);
}

export interface OrganizationStats {
    projectsCurrent: number;
    ideasCurrent: number;
    activePeopleCount: number;
}

// Live counts computed from the source tables. The
// state-log filters in getProjects / getIdeas /
// getHumanWorkers already drop deleted rows; we
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
            getHumanWorkers(ctx),
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
    const current = await getOrganizationRow(ctx);
    const { id: _id, ...rest } = current;
    await ctx.PUT('organization', {
        ...rest,
        name: draft.name,
        domain: draft.domain,
    });
}
