import type {
    IdeaEntity,
    IdeaSubmissionEntity,
    ProjectEntity,
} from '../../../api/types.ts';
import {
    Idea, nowUtc,
    ideaIsVisible,
} from '../../../api/types.ts';
import {
    getPersonMap,
    personName,
} from './shared.ts';
import type { FetchContext } from './shared.ts';
import { putProject } from './projects.ts';
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

async function getIdeaRows(
    ctx: FetchContext,
): Promise<IdeaEntity[]> {
    const all = await ctx.getIdeaRows();
    return all.filter(ideaIsVisible);
}

export async function getIdeaRow(
    ctx: FetchContext,
    id: string,
): Promise<IdeaEntity> {
    return ctx.GET<IdeaEntity>(
        `ideas/${id}`,
    );
}

async function getIdeaSubmissionRows(
    ctx: FetchContext,
): Promise<IdeaSubmissionEntity[]> {
    return ctx.GET<
        IdeaSubmissionEntity[]
    >('idea-submissions');
}

async function getIdeaSubmissionRow(
    ctx: FetchContext,
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
    ctx: FetchContext,
): Promise<IdeaWithSubmitter[]> {
    const [
        ideas, personMap, submissions,
    ] = await Promise.all([
        getIdeaRows(ctx),
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
    ctx: FetchContext,
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
    ctx: FetchContext,
    id: string,
    entity: Omit<IdeaEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`ideas/${id}`, entity);
    ideaChanges.notify();
}

export async function putIdeaSubmission(
    ctx: FetchContext,
    submissionId: string,
    ideaId: string,
): Promise<void> {
    const person = await ctx.getCurrentPerson();
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
export async function postIdeaConversion(
    ctx: FetchContext,
    ideaId: string,
    projectId: string,
    project: Omit<ProjectEntity, 'id'>,
    promotedIdea: Omit<IdeaEntity, 'id'>,
): Promise<void> {
    await putProject(ctx, projectId, project);
    await putIdea(ctx, ideaId, promotedIdea);
}
