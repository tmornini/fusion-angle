import type {
    IdeaEntity,
    IdeaSubmissionEntity,
    ProjectEntity,
} from '../../../api/types.ts';
import {
    Idea, nowUtc,
    ideaIsVisible,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getPersonMap,
    personName,
    getCurrentPerson,
} from './people.ts';
import {
    notifyProjectChange,
} from './projects.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';

const ideaChanges =
    createSubscriptionChannel(
        ['ideas', 'idea-submissions'],
    );

export function subscribeIdeaChanges(
    fn: () => void,
): () => void {
    return ideaChanges.subscribe(fn);
}

export {
    Idea,
    type IdeaStatus,
    type IdeaEntity,
    isIdeaStatus,
    IDEA_STATUS_CONFIG,
} from '../../../api/types.ts';

export async function getIdeaRows(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    return ctx.GET<IdeaEntity[]>('ideas');
}

async function getVisibleIdeaRows(
    ctx: RequestContext,
): Promise<IdeaEntity[]> {
    const all = await getIdeaRows(ctx);
    return all.filter(ideaIsVisible);
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
        ideas, personMap, submissions,
    ] = await Promise.all([
        getVisibleIdeaRows(ctx),
        getPersonMap(ctx),
        getIdeaSubmissionRows(ctx),
    ]);
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return ideas.map(row => {
        const submission =
            submissionMap.get(row.id);
        if (!submission) {
            throw new Error(
                'Idea has no submission: '
                + row.id,
            );
        }
        return {
            idea: new Idea(row),
            entity: row,
            submitterName: personName(
                personMap,
                submission.person_id,
            ),
            submittedAt:
                submission.created_at,
        };
    });
}

export async function getIdea(
    ctx: RequestContext,
    ideaId: string,
): Promise<IdeaWithSubmitter> {
    const [
        row, submission, personMap,
    ] = await Promise.all([
        getIdeaRow(ctx, ideaId),
        getIdeaSubmissionRow(ctx, ideaId),
        getPersonMap(ctx),
    ]);
    return {
        idea: new Idea(row),
        entity: row,
        submitterName: personName(
            personMap, submission.person_id,
        ),
        submittedAt: submission.created_at,
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

export async function putIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
): Promise<void> {
    const person = await getCurrentPerson(ctx);
    await ctx.PUT(
        'idea-submissions/'
            + submissionId,
        {
            idea_id: ideaId,
            person_id: person.id,
            created_at: nowUtc(),
        },
    );
}

// Idempotent: retry recovers from partial failure.
// Inlined writes (rather than delegating to the
// putProject / putIdea helpers) so the project and
// idea writes commit together as one logical
// operation. The helpers stay — they have other
// callers whose writes are genuinely independent.
export async function postIdeaConversion(
    ctx: RequestContext,
    ideaId: string,
    projectId: string,
    project: Omit<ProjectEntity, 'id'>,
    promotedIdea: Omit<IdeaEntity, 'id'>,
): Promise<void> {
    type AnyBody = Record<string, unknown>;
    const projectBody =
        project as unknown as AnyBody;
    const ideaBody =
        promotedIdea as unknown as AnyBody;
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
        ],
    });
    notifyProjectChange();
    ideaChanges.notify();
}
