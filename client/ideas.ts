import type {
    IdeaEntity,
    IdeaState,
    IdeaSubmissionEntity,
    ObjectiveId,
    ProjectEntity,
    ProjectState,
} from '../shared/types.ts';
import {
    Idea, nowUtc,
    ideaIsVisible,
    assertIdeaState,
} from '../shared/types.ts';
import type { RequestContext } from './request-context.ts';
import {
    organizationCollection,
    organizationItem,
} from './request-context.ts';
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
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';

const ideaChanges =
    createSubscriptionChannel();

export function subscribeIdeaChanges(
    fn: () => void,
): () => void {
    return ideaChanges.subscribe(fn);
}

export async function getIdeaEntities(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    return ctx.GET<IdeaEntity[]>(
        organizationCollection(ctx, 'ideas'),
    );
}

export async function getIdeaEntity(
    ctx: RequestContext,
    id: string,
): Promise<IdeaEntity> {
    return ctx.GET<IdeaEntity>(
        organizationItem(ctx, 'ideas', id),
    );
}

// The submissions for ONE idea — the server filters the nested
// collection to the parent idea, so no client filter is needed.
async function getIdeaSubmissionsForIdea(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaSubmissionEntity[]> {
    return ctx.GET<IdeaSubmissionEntity[]>(
        organizationItem(ctx, 'ideas', ideaId)
            + '/submissions/',
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

export interface IdeaWithSubmitter {
    readonly idea: Idea;
    readonly entity: IdeaEntity;
    readonly submitterName: string;
    readonly submittedAt: string;
}

// Domain state rides the IdeaEntity GET row; narrow it once,
// at the wire.
function ideaStateOf(row: IdeaEntity): IdeaState {
    return assertIdeaState(row.state, 'idea ' + row.id);
}

export async function getIdeas(
    ctx: RequestContext,
): Promise<IdeaWithSubmitter[]> {
    // Wave 1: idea rows + member map (independent).
    // Wave 2: submissions need the idea ids.
    const [rows, memberMap] = await Promise.all([
        getIdeaEntities(ctx),
        getMemberMap(ctx),
    ]);
    const submissions = await getIdeaSubmissionEntities(
        ctx, rows.map(r => r.id),
    );
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return rows
        .filter(row => ideaIsVisible(
            ideaStateOf(row),
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
                    ideaStateOf(row),
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
            row, ideaStateOf(row),
        ),
        entity: row,
        submitterName: memberName(
            memberMap, submission.member_id,
        ),
        submittedAt: submission.at,
    };
}

// The wire document PUT /ideas/:id now takes today's entity
// fields plus state, camelCase on this side of the adapter
// seam. organization_id is EXCLUDED too — the client never
// supplies it (the org fence stamps it downstream);
// postIdeaCreation's fresh entity naturally lacks it, while an
// edit/transition's entity (spread from an existing read,
// below) may still carry it at runtime as a harmless extra the
// validator tolerates but ignores. A state-UNCHANGED save
// (title/position/etc. edited, state echoed back unchanged)
// converges to a no-op event write at the op; a genuine
// transition (postIdeaStateChange below) sends a new state.
// Genesis (postIdeaCreation below) is just the head-absent
// case of this SAME PUT — one shape serves create, edit, and
// transition.
export type IdeaDocumentFields =
    Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
    >;

export async function putIdea(
    ctx: RequestContext,
    id: string,
    document: IdeaDocumentFields,
): Promise<void> {
    const { state, ...entity } = document;
    await ctx.PUT(organizationItem(ctx, 'ideas', id), {
        ...entity,
        state,
    });
    ideaChanges.notify();
}

// Idea creation: genesis is head-presence-defined — the FIRST
// document version at this document IS the birth, so create
// folds into the SAME PUT ideas/:id that putIdea already
// drives for edits and transitions. The id and state are
// minted ONCE here, before the single ctx.PUT hop (via
// putIdea) — a retry resends the identical bytes, hitting the
// op's idempotency fold. Use only at the create call site;
// transitions of an existing idea go through
// postIdeaStateChange; putIdea remains for entity edits
// (title, position) that do not change state.
export async function postIdeaCreation(
    ctx: RequestContext,
    id: string,
    entity: Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
        | 'state'
    >,
    initialState: IdeaState,
): Promise<void> {
    await putIdea(ctx, id, {
        ...entity,
        state: initialState,
    });
}

// A transition: composes the document PUT with a FRESH state
// (mint-once-reuse — a retry of the SAME transition resends
// this same pinned pair, converging at the op) over the
// idea's CURRENT entity fields — hop count 1 → 1 (one
// ctx.PUT, via putIdea). Strip the GET-stamped state so the
// new state is the only lifecycle value in the PUT body.
export async function postIdeaStateChange(
    ctx: RequestContext,
    idea: IdeaEntity,
    state: IdeaState,
): Promise<void> {
    const {
        id,
        state: _priorState,
        ...entity
    } = idea;
    void _priorState;
    await putIdea(ctx, id, {
        ...entity,
        state,
    });
}

export async function putIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
): Promise<void> {
    const member = await getCurrentHumanMember(ctx);
    await ctx.PUT(
        organizationItem(ctx, 'ideas', ideaId)
            + '/submissions/' + submissionId,
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
    >,
    projectState: ProjectState,
    promotedIdea: Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
        | 'state'
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
    await ctx.POST(
        organizationItem(ctx, 'ideas', ideaId)
            + '/conversion',
        {
        projectId,
        project: project as unknown as AnyBody,
        idea: promotedIdea as unknown as AnyBody,
        ideaStateEventId: generateIdentifier(),
        ideaState: 'promoted',
        ideaStateAt,
        projectStateEventId: generateIdentifier(),
        projectState,
        projectStateAt,
        baselines: baselines.map(b => ({
            id: generateIdentifier(),
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
