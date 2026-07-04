import type {
    ProjectEntity,
    ProjectState,
    ProjectStateDetail,
    ObjectiveEntity,
    ObjectiveId,
} from '../../../api/types.ts';
import {
    Project,
    projectStateIsNotDeleted,
    msSinceUtc,
    nowUtc,
    COST_DIVISOR,
    MS_PER_DAY,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getProjectStateDetail,
    getProjectStateDetails,
} from './state-events.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
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
    createSubscriptionChannel();

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
    type ProjectStateDetail,
    isProjectState,
    COST_DIVISOR,
} from '../../../api/types.ts';

export async function getProjectEntities(
    ctx: RequestContext,
): Promise<ProjectEntity[]> {
    return ctx.GET<ProjectEntity[]>('projects');
}

export async function getProjects(
    ctx: RequestContext,
): Promise<Project[]> {
    const [rows, detailMap] = await Promise.all([
        getProjectEntities(ctx),
        getProjectStateDetails(ctx),
    ]);
    return rows
        .filter(row => {
            const detail = detailMap.get(row.id);
            if (detail === undefined) {
                throw new Error(
                    'Project has no state event: '
                    + row.id,
                );
            }
            return projectStateIsNotDeleted(detail.state);
        })
        .map(row => new Project(
            row, detailMap.get(row.id)!,
        ));
}

export async function getProject(
    ctx: RequestContext,
    id: string,
): Promise<Project> {
    const [row, detail] = await Promise.all([
        getProjectEntity(ctx, id),
        getProjectStateDetail(ctx, id),
    ]);
    return new Project(row, detail);
}

export class ProjectView {
    readonly #project: Project;
    readonly #impactBaselineMean: number | null;
    readonly #impactActualMean: number | null;

    constructor(
        project: Project,
        objectives: readonly ObjectiveEntity[],
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

    // Trio echo only — see the DATA-CORRUPTION TRAP note on
    // Project's other view accessors below (progressPercent,
    // costActualK): those are display-transformed and MUST
    // NOT feed a wire body. state/stateAt/stateEventId carry
    // no such transform, so passing them through is safe.
    stateAtValue(): string {
        return this.#project
            .stateAtValue();
    }

    stateEventIdValue(): string {
        return this.#project
            .stateEventIdValue();
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

export async function getProjectEntity(
    ctx: RequestContext,
    id: string,
): Promise<ProjectEntity> {
    return ctx.GET<ProjectEntity>(
        `projects/${id}`,
    );
}

// The wire document PUT /projects/:id now takes (Decision 7):
// today's entity fields plus the lifecycle trio, camelCase on
// this side of the adapter seam — the IdeaDocumentFields
// precedent (adapters/ideas.ts). organization_id is EXCLUDED
// too — the client never supplies it (the org fence stamps it
// downstream).
export type ProjectDocumentFields =
    Omit<ProjectEntity, 'id' | 'organization_id'> & {
        readonly state: ProjectState;
        readonly stateAt: string;
        readonly stateEventId: string;
    };

export async function putProject(
    ctx: RequestContext,
    id: string,
    document: ProjectDocumentFields,
): Promise<void> {
    const {
        state, stateAt, stateEventId, ...entity
    } = document;
    await ctx.PUT(`projects/${id}`, {
        ...entity,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    });
    projectChanges.notify();
}

// The current row's writable fields, read fresh so the
// domain ops below can overwrite whole-row without the
// caller ever holding the wire shape.
async function projectRowFields(
    ctx: RequestContext,
    id: string,
): Promise<Omit<ProjectEntity, 'id' | 'organization_id'>> {
    const {
        id: _id,
        organization_id: _org,
        ...fields
    } = await getProjectEntity(ctx, id);
    return fields;
}

// The camelCase patch for a project's editable fields.
// The adapter is the divorce point: pages and presenters
// speak this shape; the wire merge below speaks storage.
export interface ProjectFieldsPatch {
    title: string;
    description: string;
    startDate: string;
    targetEndDate: string;
    estimatedCost: number;
}

export async function putProjectFields(
    ctx: RequestContext,
    id: string,
    patch: ProjectFieldsPatch,
    detail: ProjectStateDetail,
): Promise<void> {
    const fields = await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        title: patch.title,
        description: patch.description,
        start_date: patch.startDate,
        target_end_date: patch.targetEndDate,
        estimated_cost: patch.estimatedCost,
        state: detail.state,
        stateAt: detail.stateAt,
        stateEventId: detail.stateEventId,
    });
}

export async function putProjectPosition(
    ctx: RequestContext,
    id: string,
    position: number,
    detail: ProjectStateDetail,
): Promise<void> {
    const fields = await projectRowFields(ctx, id);
    await putProject(ctx, id, {
        ...fields,
        position,
        state: detail.state,
        stateAt: detail.stateAt,
        stateEventId: detail.stateEventId,
    });
}

// State transition for an existing project (Decision 7):
// mints a fresh trio and fires ONE document PUT via putProject
// — hop count 1 → 1 (today it is one PUT states/:id). Callers
// supply the eight fields they already hold FROM RAW SOURCES
// ONLY — never from ProjectView's display-transformed
// accessors (see the DATA-CORRUPTION TRAP note on ProjectView).
export async function postProjectStateChange(
    ctx: RequestContext,
    id: string,
    fields: Omit<ProjectEntity, 'id' | 'organization_id'>,
    state: ProjectState,
): Promise<void> {
    await putProject(ctx, id, {
        ...fields,
        state,
        stateAt: nowUtc(),
        stateEventId: generateCryptoSafeBase62(),
    });
}
