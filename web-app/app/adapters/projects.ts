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
import type { RequestContext } from './shared.ts';
import {
    getPersonMap,
    personName,
} from './people.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const projectChanges =
    createSubscriptionChannel(['projects']);

export function subscribeProjectChanges(
    fn: () => void,
): () => void {
    return projectChanges.subscribe(fn);
}

export function notifyProjectChange(): void {
    projectChanges.notify();
}

export {
    Project,
    type ProjectStatus,
    type ProjectEntity,
    isProjectStatus,
    PROJECT_STATUS_CONFIG,
    COST_DIVISOR,
} from '../../../api/types.ts';

export async function getProjectRows(
    ctx: RequestContext,
): Promise<ProjectEntity[]> {
    return ctx.GET<ProjectEntity[]>('projects');
}

export async function getProjects(
    ctx: RequestContext,
): Promise<Project[]> {
    const rows = await getProjectRows(ctx);
    return rows
        .filter(projectIsNotDeleted)
        .map(row => new Project(row));
}

export class ProjectView {
    readonly #project: Project;

    constructor(project: Project) {
        this.#project = project;
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

export async function getProjectRow(
    ctx: RequestContext,
    id: string,
): Promise<ProjectEntity> {
    return ctx.GET<ProjectEntity>(
        `projects/${id}`,
    );
}

export async function putProject(
    ctx: RequestContext,
    id: string,
    entity: Omit<ProjectEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`projects/${id}`, entity);
    projectChanges.notify();
}

