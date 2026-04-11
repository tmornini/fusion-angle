import { GET, PUT } from '../../../api/api';
import type {
    ProjectEntity,
    ProjectStatus,
} from '../../../api/types';
import {
    Project,
    projectIsNotDeleted,
    COST_DIVISOR,
    SECONDS_PER_DAY,
} from '../../../api/types';
import {
    getUserMap,
    userName,
} from './helpers';

export {
    Project,
    type ProjectStatus,
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
    private readonly project: Project;
    readonly projectLead: string;
    readonly team:
        readonly DetailTeamMember[];

    constructor(
        project: Project,
        projectLead: string,
        team:
            readonly DetailTeamMember[],
    ) {
        this.project = project;
        this.projectLead = projectLead;
        this.team = team;
    }

    get id(): string {
        return this.project.id;
    }

    get title(): string {
        return this.project.title;
    }

    get description(): string {
        return this.project.description;
    }

    get status(): ProjectStatus {
        return this.project.status;
    }

    get progress(): number {
        return this.project
            .timelineProgress();
    }

    get startDate(): string {
        return this.project.startDate;
    }

    get targetEndDate(): string {
        return this.project.targetEndDate;
    }

    statusLabel(): string {
        return this.project.statusLabel();
    }

    statusClassName(): string {
        return this.project
            .statusClassName();
    }

    timeBaselineDays(): number {
        const start = new Date(
            this.project.startDate,
        ).getTime();
        const end = new Date(
            this.project.targetEndDate,
        ).getTime();
        if (isNaN(start) || isNaN(end))
            return 0;
        return Math.max(0, Math.ceil(
            (end - start)
            / (SECONDS_PER_DAY * 1000),
        ));
    }

    timeCurrentDays(): number {
        const start = new Date(
            this.project.startDate,
        ).getTime();
        if (isNaN(start)) return 0;
        return Math.max(0, Math.floor(
            (Date.now() - start)
            / (SECONDS_PER_DAY * 1000),
        ));
    }

    costBaselineK(): number {
        return this.project.estimatedCost
            / COST_DIVISOR;
    }

    costCurrentK(): number {
        return this.project.actualCost
            / COST_DIVISOR;
    }

    impactBaseline(): number {
        return this.project
            .estimatedImpact;
    }

    impactCurrent(): number {
        return this.project.actualImpact;
    }
}

export async function getProjectById(
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

export async function putProject(
    id: string,
    entity: Partial<ProjectEntity>,
): Promise<void> {
    await PUT(`projects/${id}`, entity);
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
