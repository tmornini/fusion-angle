import type {
    ProjectEntity,
    ProjectStatus,
} from '../../../api/types.ts';
import {
    Project,
    projectIsNotDeleted,
    msSinceUtc,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../../../api/types.ts';
import {
    getUserMap,
    userName,
} from './shared.ts';
import type { FetchContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const projectChanges =
    createSubscriptionChannel(
        ['projects', 'project-team-members'],
    );

export function subscribeProjectChanges(
    fn: () => void,
): () => void {
    return projectChanges.subscribe(fn);
}

export {
    Project,
    type ProjectStatus,
    type ProjectEntity,
    isProjectStatus,
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
} from '../../../api/types.ts';

export interface TeamMemberEntity {
    id: string;
    user_id: string;
    role: string;
    type: string;
}

export function isTeamLead(
    m: { role: string },
): boolean {
    return m.role === 'lead';
}

export async function getProjects(
    ctx: FetchContext,
): Promise<Project[]> {
    const rows = await ctx.getProjectRows();
    return rows
        .filter(projectIsNotDeleted)
        .map(row => new Project(row));
}

export interface DetailTeamMember {
    readonly id: string;
    readonly name: string;
    readonly role: string;
}

export class ProjectView {
    readonly #project: Project;
    readonly #projectLead: string;
    readonly #team:
        readonly DetailTeamMember[];

    constructor(
        project: Project,
        projectLead: string,
        team:
            readonly DetailTeamMember[],
    ) {
        this.#project = project;
        this.#projectLead = projectLead;
        this.#team = team;
    }

    idForLink(): string {
        return this.#project.idForLink();
    }

    titleText(): string {
        return this.#project.titleText();
    }

    descriptionText(): string {
        return this.#project
            .descriptionText();
    }

    statusValue(): ProjectStatus {
        return this.#project
            .statusValue();
    }

    progressPercent(): number {
        return this.#project
            .timelineProgress();
    }

    startDateValue(): string {
        return this.#project
            .startDateValue();
    }

    targetEndDateValue(): string {
        return this.#project
            .targetEndDateValue();
    }

    projectLeadName(): string {
        return this.#projectLead;
    }

    teamMembers():
        readonly DetailTeamMember[] {
        return this.#team;
    }

    statusLabel(): string {
        return this.#project
            .statusLabel();
    }

    statusClassName(): string {
        return this.#project
            .statusClassName();
    }

    timeBaselineDays(): number {
        const start = new Date(
            this.#project
                .startDateValue(),
        ).getTime();
        const end = new Date(
            this.#project
                .targetEndDateValue(),
        ).getTime();
        if (isNaN(start) || isNaN(end))
            return 0;
        return Math.max(0, Math.ceil(
            (end - start)
            / (MS_PER_DAY),
        ));
    }

    timeCurrentDays(): number {
        const elapsed = msSinceUtc(
            this.#project
                .startDateValue(),
        );
        if (isNaN(elapsed)) return 0;
        return Math.max(0, Math.floor(
            elapsed / MS_PER_DAY,
        ));
    }

    costBaselineK(): number {
        return this.#project
            .estimatedCostAmount()
            / COST_DIVISOR;
    }

    costCurrentK(): number {
        return this.#project
            .actualCostAmount()
            / COST_DIVISOR;
    }

    impactBaseline(): number {
        return this.#project
            .estimatedImpactScore();
    }

    impactCurrent(): number {
        return this.#project
            .actualImpactScore();
    }
}

export async function getProjectTeamRows(
    ctx: FetchContext,
    projectId: string,
): Promise<TeamMemberEntity[]> {
    return ctx.GET<TeamMemberEntity[]>(
        `projects/${projectId}/team`,
    );
}

export async function getProjectRow(
    ctx: FetchContext,
    id: string,
): Promise<ProjectEntity> {
    return ctx.GET<ProjectEntity>(
        `projects/${id}`,
    );
}

export async function putProject(
    ctx: FetchContext,
    id: string,
    entity: Omit<ProjectEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`projects/${id}`, entity);
    projectChanges.notify();
}

export interface TeamMemberAssignment {
    projectId: string;
    userId: string;
    role: string;
    type: string;
}

export async function
putProjectTeamMember(
    ctx: FetchContext,
    assignment: TeamMemberAssignment,
): Promise<void> {
    await ctx.PUT(
        `projects/${assignment.projectId}`
            + `/team/${assignment.userId}`,
        {
            role: assignment.role,
            type: assignment.type,
        },
    );
}
