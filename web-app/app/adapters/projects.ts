import type {
    ProjectEntity,
    ProjectState,
    Objective,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    Project,
    projectStateIsNotDeleted,
    msSinceUtc,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    buildStateEventOp,
    getProjectState,
    getProjectStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    latestPerPair,
    weightedMeanByPosition,
} from '../scoring-format.ts';
import type {
    ObjectiveScore,
} from './project-scoring.ts';

const projectChanges =
    createSubscriptionChannel(
        ['projects', 'states'],
    );

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
    type ProjectState,
    type ProjectEntity,
    isProjectState,
    PROJECT_STATE_CONFIG,
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
    const [rows, stateMap] = await Promise.all([
        getProjectRows(ctx),
        getProjectStates(ctx),
    ]);
    return rows
        .filter(row => {
            const s = stateMap.get(row.id);
            if (s === undefined) {
                throw new Error(
                    'Project has no state event: '
                    + row.id,
                );
            }
            return projectStateIsNotDeleted(s);
        })
        .map(row => new Project(
            row, stateMap.get(row.id)!,
        ));
}

export async function getProject(
    ctx: RequestContext,
    id: string,
): Promise<Project> {
    const [row, state] = await Promise.all([
        getProjectRow(ctx, id),
        getProjectState(ctx, id),
    ]);
    return new Project(row, state);
}

export class ProjectView {
    readonly #project: Project;
    readonly #impactBaselineMean: number | null;
    readonly #impactActualMean: number | null;

    constructor(
        project: Project,
        objectives: readonly Objective[],
        baselineScores: readonly ObjectiveScore[],
        actualScores: readonly ObjectiveScore[],
    ) {
        this.#project = project;
        const posByObj =
            new Map<ObjectiveId, number>(
                objectives.map(
                    o => [o.id, o.position],
                ),
            );
        const latestB = latestPerPair(baselineScores);
        this.#impactBaselineMean =
            weightedMeanByPosition(latestB, posByObj);
        const baselinedIds = new Set(
            latestB.map(b => b.objectiveId),
        );
        const latestA = latestPerPair(actualScores);
        const actualedIds = new Set(
            latestA.map(a => a.objectiveId),
        );
        const fullyActualScored =
            latestB.length > 0
            && Array.from(baselinedIds).every(
                id => actualedIds.has(id),
            );
        this.#impactActualMean = fullyActualScored
            ? weightedMeanByPosition(
                latestA.filter(
                    a => baselinedIds.has(
                        a.objectiveId,
                    ),
                ),
                posByObj,
            )
            : null;
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

    stateValue(): ProjectState {
        return this.#project
            .stateValue();
    }

    isApproved(): boolean {
        return this.#project
            .isApproved();
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

    stateLabel(): string {
        return this.#project
            .stateLabel();
    }

    stateClassName(): string {
        return this.#project
            .stateClassName();
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

    timeActualDays(): number {
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

    costActualK(): number {
        return this.#project
            .actualCostAmount()
            / COST_DIVISOR;
    }

    impactBaselineMean(): number | null {
        return this.#impactBaselineMean;
    }

    impactActualMean(): number | null {
        return this.#impactActualMean;
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
    entity: Omit<ProjectEntity, 'id' | 'organization_id'>,
): Promise<void> {
    await ctx.PUT(`projects/${id}`, entity);
    projectChanges.notify();
}

// State transition for an existing project: one
// state event, nothing else. Per the doctrine
// "every state is an event; the latest event is the
// truth", lifecycle stage is the log, not a column
// on the row. Pair with putProject in sequence
// when a caller needs both an entity edit and a
// transition (e.g., the project edit form).
export async function postProjectStateChange(
    ctx: RequestContext,
    id: string,
    state: ProjectState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx, id, state,
            ),
        ],
    });
    projectChanges.notify();
}

