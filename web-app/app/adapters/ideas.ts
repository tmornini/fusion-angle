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
} from '../../../api/crypto-safe-base62.ts';
import {
    postStateEvent,
    getIdeaState,
    getIdeaStates,
} from './state-events.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const ideaChanges =
    createSubscriptionChannel(
        ['ideas', 'idea_submissions', 'states'],
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

export async function getIdeas(
    ctx: RequestContext,
): Promise<IdeaWithSubmitter[]> {
    const rows = await getIdeaEntities(ctx);
    const [
        memberMap, submissions, stateMap,
    ] = await Promise.all([
        getMemberMap(ctx),
        getIdeaSubmissionEntities(
            ctx, rows.map(r => r.id),
        ),
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
        row, submission, memberMap, state,
    ] = await Promise.all([
        getIdeaEntity(ctx, ideaId),
        getIdeaSubmissionEntity(ctx, ideaId),
        getMemberMap(ctx),
        getIdeaState(ctx, ideaId),
    ]);
    return {
        idea: new Idea(row, state),
        entity: row,
        submitterName: memberName(
            memberMap, submission.member_id,
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

// Idea creation: row + initial state event, written
// atomically by the named POST /ideas endpoint. Use only at
// the create call site; transitions of an existing idea go
// through postIdeaStateChange. putIdea remains for entity
// edits (title, position) that do not change state. The
// idea body OMITS organization_id — the org fence stamps it
// from the verified token before the store validates.
export async function postIdeaCreation(
    ctx: RequestContext,
    id: string,
    entity: Omit<IdeaEntity, 'id' | 'organization_id'>,
    initialState: IdeaState,
): Promise<void> {
    await ctx.POST('ideas', {
        id,
        idea: entity,
        initialState,
        initialStateEventId: generateCryptoSafeBase62(),
    });
    ideaChanges.notify();
}

export async function postIdeaStateChange(
    ctx: RequestContext,
    id: string,
    state: IdeaState,
): Promise<void> {
    await postStateEvent(ctx, id, state);
    ideaChanges.notify();
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
    project: Omit<ProjectEntity, 'id' | 'organization_id'>,
    projectState: ProjectState,
    promotedIdea: Omit<IdeaEntity, 'id' | 'organization_id'>,
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
    const at = nowUtc();
    const member = await getCurrentHumanMember(ctx);
    await ctx.POST(`ideas/${ideaId}/conversion`, {
        projectId,
        project: project as unknown as AnyBody,
        idea: promotedIdea as unknown as AnyBody,
        ideaStateEventId: generateCryptoSafeBase62(),
        ideaState: 'promoted',
        projectStateEventId: generateCryptoSafeBase62(),
        projectState,
        baselines: baselines.map(b => ({
            id: generateCryptoSafeBase62(),
            fields: {
                project_id: projectId,
                objective_id: b.objectiveId,
                score: b.score,
                member_id: member.id,
                at,
            },
        })),
    });
    notifyProjectChange();
    notifyProjectScoreChange();
    ideaChanges.notify();
}
