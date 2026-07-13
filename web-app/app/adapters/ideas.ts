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
    assertIdeaState,
} from '../../../api/types.ts';
import type { IdeaStateDetail } from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getCurrentHumanMember,
} from './members.ts';
import {
    getMemberMap,
    memberName,
} from './members-union.ts';
import {
    notifyProjectChange,
} from './projects.ts';
import {
    notifyProjectScoreChange,
} from './project-scoring.ts';
import {
    generateCryptoSafeBase62,
} from '../../../shared/crypto-safe-base62.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const ideaChanges =
    createSubscriptionChannel();

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
    IDEA_READINESS,
} from '../../../api/types.ts';

export async function getIdeaEntities(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    return ctx.GET<IdeaEntity[]>('ideas');
}

export async function getIdeaEntity(
    ctx: RequestContext,
    id: string,
): Promise<IdeaEntity> {
    return ctx.GET<IdeaEntity>(
        `ideas/${id}`,
    );
}

// The submissions for ONE idea — the server filters the nested
// collection to the parent idea, so no client filter is needed.
async function getIdeaSubmissionsForIdea(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaSubmissionEntity[]> {
    return ctx.GET<IdeaSubmissionEntity[]>(
        'ideas/' + ideaId + '/submissions',
    );
}

// The submissions across EVERY supplied idea — reassembled from
// the nested per-idea collections, fetched in parallel and
// concatenated. The idea ids come from the org-scoped ideas
// list the caller already holds.
async function getIdeaSubmissionEntities(
    ctx: RequestContext,
    ideaIds: readonly string[],
): Promise<IdeaSubmissionEntity[]> {
    const perIdea = await Promise.all(
        ideaIds.map(id => getIdeaSubmissionsForIdea(ctx, id)),
    );
    return perIdea.flat();
}

async function getIdeaSubmissionEntity(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaSubmissionEntity> {
    const [found] =
        await getIdeaSubmissionsForIdea(ctx, ideaId);
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

// Lifecycle-current trio is stamped on the IdeaEntity GET
// row (Phase A). Map snake_case wire → IdeaStateDetail;
// no second hop to a lifecycle log or history alias.
function ideaStateDetailFromRow(
    row: IdeaEntity,
): IdeaStateDetail {
    return {
        state: assertIdeaState(
            row.state, 'idea ' + row.id,
        ),
        stateAt: row.state_at,
        stateEventId: row.state_event_id,
    };
}

export async function getIdeas(
    ctx: RequestContext,
): Promise<IdeaWithSubmitter[]> {
    const rows = await getIdeaEntities(ctx);
    const [
        memberMap, submissions,
    ] = await Promise.all([
        getMemberMap(ctx),
        getIdeaSubmissionEntities(
            ctx, rows.map(r => r.id),
        ),
    ]);
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return rows
        .filter(row => ideaIsVisible(
            ideaStateDetailFromRow(row).state,
        ))
        .map(row => {
            const submission =
                submissionMap.get(row.id);
            if (!submission) {
                throw new Error(
                    'Idea has no submission: '
                    + row.id,
                );
            }
            return {
                idea: new Idea(
                    row,
                    ideaStateDetailFromRow(row),
                ),
                entity: row,
                submitterName: memberName(
                    memberMap,
                    submission.member_id,
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
        row, submission, memberMap,
    ] = await Promise.all([
        getIdeaEntity(ctx, ideaId),
        getIdeaSubmissionEntity(ctx, ideaId),
        getMemberMap(ctx),
    ]);
    return {
        idea: new Idea(
            row, ideaStateDetailFromRow(row),
        ),
        entity: row,
        submitterName: memberName(
            memberMap, submission.member_id,
        ),
        submittedAt: submission.at,
    };
}

// The wire document PUT /ideas/:id now takes (Decision 7):
// today's entity fields plus the lifecycle trio, camelCase on
// this side of the adapter seam. organization_id is EXCLUDED
// too — the client never supplies it (the org fence stamps it
// downstream); postIdeaCreation's fresh entity naturally lacks
// it, while an edit/transition's entity (spread from an
// existing read, below) may still carry it at runtime as a
// harmless extra the validator tolerates but ignores. A
// state-UNCHANGED save (title/position/etc. edited, trio echoed
// back unchanged) converges to a no-op event write at the op; a
// genuine transition (postIdeaStateChange below) mints a fresh
// trio. Genesis (postIdeaCreation below) is just the
// head-absent case of this SAME PUT (Decision 7) — one shape
// serves create, edit, and transition. GET IdeaEntity also
// carries snake_case lifecycle stamp fields — omit them here
// so the PUT body is not double-keyed (snake + camel).
export type IdeaDocumentFields =
    Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    > & {
        readonly state: IdeaState;
        readonly stateAt: string;
        readonly stateEventId: string;
    };

export async function putIdea(
    ctx: RequestContext,
    id: string,
    document: IdeaDocumentFields,
): Promise<void> {
    const {
        state, stateAt, stateEventId, ...entity
    } = document;
    await ctx.PUT(`ideas/${id}`, {
        ...entity,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
    });
    ideaChanges.notify();
}

// Idea creation (Decision 7, Phase 2 Task 3, R1): genesis is
// head-presence-defined — the FIRST document version at this
// address IS the birth, so create folds into the SAME PUT
// ideas/:id that putIdea already drives for edits and
// transitions. The id and the trio (state, stateAt,
// stateEventId) are minted ONCE here, before the single
// ctx.PUT hop (via putIdea) — a retry resends the identical
// bytes, hitting the op's idempotency fold. Use only at the
// create call site; transitions of an existing idea go through
// postIdeaStateChange; putIdea remains for entity edits (title,
// position) that do not change state.
export async function postIdeaCreation(
    ctx: RequestContext,
    id: string,
    entity: Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
    initialState: IdeaState,
): Promise<void> {
    await putIdea(ctx, id, {
        ...entity,
        state: initialState,
        stateAt: nowUtc(),
        stateEventId: generateCryptoSafeBase62(),
    });
}

// A transition: composes the document PUT with a FRESH trio
// (mint-once-reuse — a retry of the SAME transition resends
// this same pinned pair, converging at the op) over the
// idea's CURRENT entity fields — hop count 1 → 1 (one
// ctx.PUT, via putIdea). Strip GET-stamped snake_case trio
// so putIdea's camelCase mint is the only lifecycle payload.
export async function postIdeaStateChange(
    ctx: RequestContext,
    idea: IdeaEntity,
    state: IdeaState,
): Promise<void> {
    const {
        id,
        state: _priorState,
        state_at: _priorAt,
        state_event_id: _priorEventId,
        ...entity
    } = idea;
    void _priorState;
    void _priorAt;
    void _priorEventId;
    await putIdea(ctx, id, {
        ...entity,
        state,
        stateAt: nowUtc(),
        stateEventId: generateCryptoSafeBase62(),
    });
}

export async function putIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
): Promise<void> {
    const member = await getCurrentHumanMember(ctx);
    await ctx.PUT(
        'ideas/' + ideaId + '/submissions/'
            + submissionId,
        {
            idea_id: ideaId,
            member_id: member.id,
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

// Idea conversion (idea→project promotion): the LONE
// cross-aggregate write, composed by the named POST
// /ideas/:id/conversion into ONE re-entrant transaction. A
// new project row, the promoted idea row, two state events
// (the idea moves to 'promoted', the new project enters at
// its initial state), and the N per-objective baseline
// scores all commit together — a new project never exists
// without its initial baselines, nor an idea promoted
// without its project. The web-app derives the bodies and
// mints every id (project, the two events, each baseline);
// authorship of both events is stamped server-side from the
// verified token. The project body OMITS organization_id —
// the org fence stamps it before the store re-validates.
export async function postIdeaConversion(
    ctx: RequestContext,
    ideaId: string,
    projectId: string,
    project: Omit<
        ProjectEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
    projectState: ProjectState,
    promotedIdea: Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
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
    // Mint idea at FIRST so it is strictly less than project at
    // (nowUtc is monotonic — the second call is always greater).
    // The ledger's latest-wins total order requires distinct values.
    const ideaStateAt = nowUtc();
    const projectStateAt = nowUtc();
    const member = await getCurrentHumanMember(ctx);
    await ctx.POST(`ideas/${ideaId}/conversion`, {
        projectId,
        project: project as unknown as AnyBody,
        idea: promotedIdea as unknown as AnyBody,
        ideaStateEventId: generateCryptoSafeBase62(),
        ideaState: 'promoted',
        ideaStateAt,
        projectStateEventId: generateCryptoSafeBase62(),
        projectState,
        projectStateAt,
        baselines: baselines.map(b => ({
            id: generateCryptoSafeBase62(),
            fields: {
                project_id: projectId,
                objective_id: b.objectiveId,
                score: b.score,
                member_id: member.id,
                at: ideaStateAt,
            },
        })),
    });
    notifyProjectChange();
    notifyProjectScoreChange();
    ideaChanges.notify();
}
