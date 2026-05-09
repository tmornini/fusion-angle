import type {
    OrganizationEntity,
} from '../../../api/types.ts';
import {
    formatDate,
} from '../format.ts';
import type { RequestContext } from './shared.ts';

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

    projectsCurrent(): number {
        return this.#entity.projects_current;
    }

    projectsLimit(): number {
        return this.#entity.projects_limit;
    }

    ideasCurrent(): number {
        return this.#entity.ideas_current;
    }

    ideasLimit(): number {
        return this.#entity.ideas_limit;
    }

    storageCurrent(): number {
        return this.#entity.storage_current;
    }

    storageLimit(): number {
        return this.#entity.storage_limit;
    }

    aiCreditsCurrent(): number {
        return (
            this.#entity.ai_credits_current
        );
    }

    aiCreditsLimit(): number {
        return this.#entity.ai_credits_limit;
    }

    nextBillingDate(): string {
        return formatDate(
            this.#entity.next_billing,
        );
    }

    lastActivityText(): string {
        return this.#entity.last_activity;
    }

    activePeopleCount(): number {
        return this.#entity.active_people;
    }
}

export async function getOrganization(
    ctx: RequestContext,
): Promise<Organization> {
    const entity =
        await getOrganizationRow(ctx);
    return new Organization(entity);
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

export type {
    ActivityEntity,
    ActivityActorEntity,
} from '../../../api/types.ts';
