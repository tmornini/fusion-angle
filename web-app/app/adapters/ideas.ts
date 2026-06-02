import type {
    IdeaEntity,
    IdeaState,
    IdeaSubmissionEntity,
    ObjectiveId,
    ProjectEntity,
    ProjectState,
} from '../../../api/types.ts';
import {
    Idea, nowUtc,
    ideaIsVisible,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getCurrentHumanWorker,
} from './workers.ts';
import {
    getWorkerMap,
    workerName,
} from './workers-union.ts';
import {
    notifyProjectChange,
} from './projects.ts';
import {
    notifyProjectScoreChange,
} from './project-scoring.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import {
    buildStateEventOp,
    getIdeaState,
    getIdeaStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const ideaChanges =
    createSubscriptionChannel(
        ['ideas', 'idea-submissions', 'states'],
    );

export function subscribeIdeaChanges(
    fn: () => void,
): () => void {
    return ideaChanges.subscribe(fn);
}

export {
    Idea,
    type IdeaState,
    type IdeaEntity,
    type IdeaReadiness,
    isIdeaState,
    IDEA_STATES,
    IDEA_STATE_CONFIG,
    IDEA_READINESS,
    IDEA_READINESS_CONFIG,
} from '../../../api/types.ts';

export async function getIdeaRows(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    return ctx.GET<IdeaEntity[]>('ideas');
}

export async function getIdeaRow(
    ctx: RequestContext,
    id: string,
): Promise<IdeaEntity> {
    return ctx.GET<IdeaEntity>(
        `ideas/${id}`,
    );
}

async function getIdeaSubmissionRows(
    ctx: RequestContext,
): Promise<IdeaSubmissionEntity[]> {
    return ctx.GET<
        IdeaSubmissionEntity[]
    >('idea-submissions');
}

async function getIdeaSubmissionRow(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaSubmissionEntity> {
    const all = await getIdeaSubmissionRows(ctx);
    const found = all.find(
        s => s.idea_id === ideaId,
    );
    if (!found) {
        throw new Error(
            'Idea submission not found'
                + ' for idea ' + ideaId,
        );
    }
    return found;
}

export type {
    IdeaSubmissionEntity,
} from '../../../api/types.ts';

export interface IdeaWithSubmitter {
    readonly idea: Idea;
    readonly entity: IdeaEntity;
    readonly submitterName: string;
    readonly submittedAt: string;
}

export async function getIdeas(
    ctx: RequestContext,
): Promise<IdeaWithSubmitter[]> {
    const [
        rows, workerMap, submissions, stateMap,
    ] = await Promise.all([
        getIdeaRows(ctx),
        getWorkerMap(ctx),
        getIdeaSubmissionRows(ctx),
        getIdeaStates(ctx),
    ]);
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return rows
        .filter(row => {
            const s = stateMap.get(row.id);
            if (s === undefined) {
                throw new Error(
                    'Idea has no state event: '
                    + row.id,
                );
            }
            return ideaIsVisible(s);
        })
        .map(row => {
            const submission =
                submissionMap.get(row.id);
            if (!submission) {
                throw new Error(
                    'Idea has no submission: '
                    + row.id,
                );
            }
            const state = stateMap.get(row.id)!;
            return {
                idea: new Idea(row, state),
                entity: row,
                submitterName: workerName(
                    workerMap,
                    submission.worker_id,
                ),
                submittedAt:
                    submission.at,
            };
        });
}

export async function getIdea(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaWithSubmitter> {
    const [
        row, submission, workerMap, state,
    ] = await Promise.all([
        getIdeaRow(ctx, ideaId),
        getIdeaSubmissionRow(ctx, ideaId),
        getWorkerMap(ctx),
        getIdeaState(ctx, ideaId),
    ]);
    return {
        idea: new Idea(row, state),
        entity: row,
        submitterName: workerName(
            workerMap, submission.worker_id,
        ),
        submittedAt: submission.at,
    };
}

export async function putIdea(
    ctx: RequestContext,
    id: string,
    entity: Omit<IdeaEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`ideas/${id}`, entity);
    ideaChanges.notify();
}

// Idea creation: row + initial state event in one
// ctx.commit batch. Use only at the create call site;
// transitions of an existing idea go through
// postIdeaStateChange. putIdea remains for entity
// edits (title, position) that do not change state.
export async function postIdeaCreation(
    ctx: RequestContext,
    id: string,
    entity: Omit<IdeaEntity, 'id'>,
    initialState: IdeaState,
): Promise<void> {
    const ideaBody =
        entity as unknown as Record<string, unknown>;
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource: `ideas/${id}`,
                body: ideaBody,
            },
            await buildStateEventOp(
                ctx, id, initialState,
            ),
        ],
    });
    ideaChanges.notify();
}

export async function postIdeaStateChange(
    ctx: RequestContext,
    id: string,
    state: IdeaState,
): Promise<void> {
    await ctx.commit({
        ops: [
            await buildStateEventOp(
                ctx, id, state,
            ),
        ],
    });
    ideaChanges.notify();
}

export async function putIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
): Promise<void> {
    const worker = await getCurrentHumanWorker(ctx);
    await ctx.PUT(
        'idea-submissions/'
            + submissionId,
        {
            idea_id: ideaId,
            worker_id: worker.id,
            at: nowUtc(),
        },
    );
}

function assertConversionFullyScored(
    activeObjectiveIds: readonly ObjectiveId[],
    scoredObjectiveIds: readonly ObjectiveId[],
): void {
    const scored = new Set(scoredObjectiveIds);
    const missing = activeObjectiveIds.filter(
        id => !scored.has(id),
    );
    if (missing.length > 0) {
        throw new Error(
            'idea conversion requires a baseline'
            + ' score for every active objective;'
            + ' ' + missing.length + ' missing',
        );
    }
}

// Idempotent: retry recovers from partial failure.
// Inlined writes (rather than delegating to the
// putProject / putIdea helpers) so the project, idea,
// state events, and per-objective baseline scores
// commit together as one logical operation. Two
// state events land in the same batch: the idea
// moves to 'promoted' and the new project enters at
// its initial state — both atomic with the row
// updates. The N baseline-score rows commit in the
// same batch so a new project never exists without
// its initial baselines (and vice versa). The
// helpers stay — they have other callers whose
// writes are genuinely independent.
export async function postIdeaConversion(
    ctx: RequestContext,
    ideaId: string,
    projectId: string,
    project: Omit<ProjectEntity, 'id'>,
    projectState: ProjectState,
    promotedIdea: Omit<IdeaEntity, 'id'>,
    baselines: readonly {
        objectiveId: ObjectiveId;
        score: number;
    }[],
    activeObjectiveIds: readonly ObjectiveId[],
): Promise<void> {
    assertConversionFullyScored(
        activeObjectiveIds,
        baselines.map(b => b.objectiveId),
    );
    type AnyBody = Record<string, unknown>;
    const projectBody =
        project as unknown as AnyBody;
    const ideaBody =
        promotedIdea as unknown as AnyBody;
    const at = nowUtc();
    const worker = await getCurrentHumanWorker(ctx);
    await ctx.commit({
        ops: [
            {
                method: 'put',
                resource:
                    `projects/${projectId}`,
                body: projectBody,
            },
            {
                method: 'put',
                resource: `ideas/${ideaId}`,
                body: ideaBody,
            },
            await buildStateEventOp(
                ctx, ideaId, 'promoted',
            ),
            await buildStateEventOp(
                ctx, projectId, projectState,
            ),
            ...baselines.map(b => ({
                method: 'put' as const,
                resource:
                    'project-objective'
                    + '-baseline-scores/'
                    + generateCryptoSafeBase62(),
                body: {
                    project_id: projectId,
                    objective_id: b.objectiveId,
                    score: b.score,
                    worker_id: worker.id,
                    at,
                },
            })),
        ],
    });
    notifyProjectChange();
    notifyProjectScoreChange();
    ideaChanges.notify();
}
