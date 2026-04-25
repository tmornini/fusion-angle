import { GET, PUT } from '../../../api/api';
import type {
    ProjectEntity,
    ProjectStatus,
} from '../../../api/types';
import {
    Project,
    projectIsNotDeleted,
    msSinceUtc,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../../../api/types';
import {
    getUserMap,
    userName,
} from './shared';
import {
    createChannel,
} from '../channels';

export const projectChanged =
    createChannel<void>();

export {
    Project,
    type ProjectStatus,
    type ProjectEntity,
    isProjectStatus,
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
} from '../../../api/types';

interface TeamMemberRow {
    id: string;
    user_id: string;
    role: string;
    type: string;
}

function isTeamLead(
    m: { role: string },
): boolean {
    return m.role === 'lead';
}

export async function getProjects(
): Promise<Project[]> {
    const rows =
        await GET<ProjectEntity[]>(
            'projects',
        );
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

export async function getProject(
    projectId: string,
): Promise<ProjectView> {
    const [
        entity, teamRows, userMap,
    ] = await Promise.all([
        GET<ProjectEntity>(
            `projects/${projectId}`,
        ),
        GET<TeamMemberRow[]>(
            `projects/${projectId}/team`,
        ),
        getUserMap(),
    ]);

    const project = new Project(entity);
    const leadRow = teamRows.find(
        isTeamLead,
    );

    return new ProjectView(
        project,
        userName(
            userMap, leadRow?.user_id,
        ),
        teamRows.map(member => ({
            id: member.user_id,
            name: userName(
                userMap,
                member.user_id,
            ),
            role: member.role,
        })),
    );
}

export async function getProjectEntity(
    id: string,
): Promise<ProjectEntity> {
    return GET<ProjectEntity>(
        `projects/${id}`,
    );
}

export async function putProject(
    id: string,
    entity: Omit<ProjectEntity, 'id'>,
): Promise<void> {
    await PUT(`projects/${id}`, entity);
    projectChanged.send();
}

export interface TeamMemberAssignment {
    projectId: string;
    userId: string;
    role: string;
    type: string;
}

export async function
putProjectTeamMember(
    ctx: TeamMemberAssignment,
): Promise<void> {
    await PUT(
        `projects/${ctx.projectId}`
            + `/team/${ctx.userId}`,
        {
            role: ctx.role,
            type: ctx.type,
        },
    );
}
