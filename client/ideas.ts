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
    documentFieldsOf,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
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

export function getIdeaEntities(
    ctx: RequestContext,
): Promise<HttpMessage<IdeaEntity>[]> {
    return ctx.GETCollection<IdeaEntity>(
        organizationCollection(ctx, 'ideas'),
    );
}

export function getIdeaEntity(
    ctx: RequestContext,
    id: string,
): Promise<HttpMessage<IdeaEntity>> {
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
    return (await ctx.GETCollection<IdeaSubmissionEntity>(
        organizationItem(ctx, 'ideas', ideaId)
            + '/submissions/',
    )).map((m) => m.body().toValue());
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
    readonly submitterName: string;
    readonly submittedAt: string;
}

// Domain state rides the IdeaEntity GET row; narrow it once,
// at the wire.
function ideaStateOf(row: IdeaEntity): IdeaState {
    return assertIdeaState(row.state, 'idea ' + row.id);
}

export function ideaOf(message: HttpMessage<IdeaEntity>): Idea {
    return new Idea(
        message, ideaStateOf(message.body().toValue()),
    );
}

export async function getIdeas(
    ctx: RequestContext,
): Promise<IdeaWithSubmitter[]> {
    // Wave 1: idea rows + member map (independent).
    // Wave 2: submissions need the idea ids.
    const [messages, memberMap] = await Promise.all([
        getIdeaEntities(ctx),
        getMemberMap(ctx),
    ]);
    const ideas = messages.map(ideaOf);
    const submissions = await getIdeaSubmissionEntities(
        ctx, ideas.map(idea => idea.idForLink()),
    );
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return ideas
        .filter(idea => ideaIsVisible(idea.stateValue()))
        .map(idea => {
            const submission =
                submissionMap.get(idea.idForLink());
            if (!submission) {
                throw new Error(
                    'Idea has no submission: '
                    + idea.idForLink(),
                );
            }
            return {
                idea,
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
        message, submission, memberMap,
    ] = await Promise.all([
        getIdeaEntity(ctx, ideaId),
        getIdeaSubmissionEntity(ctx, ideaId),
        getMemberMap(ctx),
    ]);
    return {
        idea: ideaOf(message),
        submitterName: memberName(
            memberMap, submission.member_id,
        ),
        submittedAt: submission.at,
    };
}

// The wire document PUT /ideas/:id takes today's entity
// fields plus state, snake_case as the wire carries them.
// organization_id is EXCLUDED too — the client never
// supplies it (the organization fence stamps it downstream):
// postIdeaCreation's fresh entity lacks it by type, and an
// edit/transition builds its body with documentFieldsOf,
// which strips the held read's id and organization_id. A
// state-UNCHANGED save (title/position/etc. edited, state
// echoed back unchanged) converges to a no-op event write at
// the op; a genuine transition (postIdeaStateChange below)
// sends a new state. Genesis (postIdeaCreation below) is just
// the head-absent case of this SAME PUT — one shape serves
// create, edit, and transition.
export type IdeaDocumentFields =
    Omit<
        IdeaEntity,
        | 'id'
        | 'organization_id'
    >;

// A save from the held idea names the head it replaces, so
// a write over a newer head is refused rather than lost.
export async function putIdea(
    ctx: RequestContext,
    held: HttpMessage<IdeaEntity>,
    document: IdeaDocumentFields,
): Promise<HttpMessage<IdeaEntity>> {
    const saved = await ctx.PUT<IdeaEntity>(
        organizationItem(ctx, 'ideas', held.body().toValue().id),
        document,
        [held],
    );
    ideaChanges.notify();
    return saved;
}

// Idea creation: genesis is head-presence-defined — the FIRST
// document version at this document IS the birth, so create
// is the SAME PUT ideas/:id that putIdea drives for edits and
// transitions, with no head to latch: the id is fresh. The id
// and state are minted ONCE here, before the single ctx.PUT
// hop — a retry resends the identical bytes, which the
// statement matches against the head and stores nothing.
// Use only at the create call site;
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
): Promise<HttpMessage<IdeaEntity>> {
    const created = await ctx.PUT<IdeaEntity>(
        organizationItem(ctx, 'ideas', id),
        { ...entity, state: initialState },
    );
    ideaChanges.notify();
    return created;
}

// A transition: composes the document PUT with a FRESH state
// (mint-once-reuse — a retry of the SAME transition resends
// this same pinned pair, converging at the op) over the
// held idea's entity fields — hop count 1 → 1 (one ctx.PUT,
// via putIdea, latched on the held idea). The new state
// replaces the held one, so it is the only lifecycle value in
// the PUT body.
export function postIdeaStateChange(
    ctx: RequestContext,
    held: HttpMessage<IdeaEntity>,
    state: IdeaState,
): Promise<HttpMessage<IdeaEntity>> {
    return putIdea(ctx, held, { ...documentFieldsOf(held), state });
}

export async function putIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
): Promise<HttpMessage<IdeaSubmissionEntity>> {
    const member = await getCurrentHumanMember(ctx);
    return ctx.PUT<IdeaSubmissionEntity>(
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
// /ideas/:id/conversion into ONE statement. A
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
    held: HttpMessage<IdeaEntity>,
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
    // The conversion is an operation on the held idea: it
    // names the head the page holds, so a 412 surfaces as
    // RequestError.
    await ctx.POST(
        organizationItem(ctx, 'ideas', held.body().toValue().id)
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
    }, [held]);
    notifyProjectChange();
    notifyProjectScoreChange();
    ideaChanges.notify();
}
