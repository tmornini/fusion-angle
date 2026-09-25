import type {
    MembershipEntity,
    OrganizationEntity,
} from '../../shared/types.ts';
import { formatCalendarDate } from './format.ts';
import type { RequestContext } from '../../client/shared.ts';
import {
    getOrganizationEntity,
    getOrganizationSeats,
    type GeneralInfoDraft,
} from '../../client/admin.ts';

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
