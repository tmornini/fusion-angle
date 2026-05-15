import type {
    ProjectEntity,
    ProjectStatus,
    Objective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
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

    isBaselineScored(
        activeObjectives: Objective[],
        baselineScores: ProjectObjectiveBaselineScore[],
    ): boolean {
        const scored =
            this.#objectiveIdSet(baselineScores);
        return activeObjectives.every(
            o => scored.has(o.id),
        );
    }

    isActualScored(
        baselineScores: ProjectObjectiveBaselineScore[],
        actualScores: ProjectObjectiveActualScore[],
    ): boolean {
        const baselined =
            this.#objectiveIdSet(baselineScores);
        const actualed =
            this.#objectiveIdSet(actualScores);
        for (const id of baselined) {
            if (!actualed.has(id)) return false;
        }
        return true;
    }

    baselineTotal(
        baselineScores: ProjectObjectiveBaselineScore[],
    ): number {
        const latest =
            this.#latestPerObjective(baselineScores);
        if (latest.length === 0) {
            throw new Error(
                'project '
                + this.#project.idForLink()
                + ' has no baseline scores',
            );
        }
        const sum = latest.reduce(
            (acc, r) => acc + r.score, 0,
        );
        return Math.round(sum / latest.length);
    }

    actualTotal(
        baselineScores: ProjectObjectiveBaselineScore[],
        actualScores: ProjectObjectiveActualScore[],
    ): number {
        if (
            !this.isActualScored(
                baselineScores, actualScores,
            )
        ) {
            throw new Error(
                'project '
                + this.#project.idForLink()
                + ' not fully actual-scored',
            );
        }
        const baselined =
            this.#latestPerObjective(baselineScores);
        const actualMap = new Map(
            this.#latestPerObjective(actualScores)
                .map(r => [r.objective_id, r.score]),
        );
        const xs = baselined
            .map(b => actualMap.get(b.objective_id))
            .filter(
                (x): x is number =>
                    typeof x === 'number',
            );
        const sum = xs.reduce((a, b) => a + b, 0);
        return Math.round(sum / xs.length);
    }

    #latestPerObjective<T extends {
        objective_id: string;
        scored_at: string;
    }>(rows: T[]): T[] {
        const map = new Map<string, T>();
        for (const r of rows) {
            const prev = map.get(r.objective_id);
            if (
                !prev
                || r.scored_at > prev.scored_at
            ) {
                map.set(r.objective_id, r);
            }
        }
        return Array.from(map.values());
    }

    #objectiveIdSet<T extends {
        objective_id: string;
        scored_at: string;
    }>(rows: T[]): Set<string> {
        return new Set(
            this.#latestPerObjective(rows).map(
                r => r.objective_id,
            ),
        );
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

