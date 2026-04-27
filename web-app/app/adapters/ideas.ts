import { GET, PUT } from '../../../api/api.ts';
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
    getUserMap,
    userName,
} from './shared.ts';
import type { FetchContext } from './shared.ts';
import {
    putProject,
    putProjectTeamMember,
} from './projects.ts';
import {
    createChannel,
} from '../channels.ts';

const ideaChangedChannel =
    createChannel<void>();

export function subscribeToIdeaChanges(
    fn: () => void,
): () => void {
    return ideaChangedChannel.subscribe(fn);
}

export {
    Idea,
    type IdeaStatus,
    type IdeaEntity,
    isIdeaStatus,
    IDEA_STATUS_CONFIG,
} from '../../../api/types.ts';

export async function getIdeaRows(
): Promise<IdeaEntity[]> {
    const all =
        await GET<IdeaEntity[]>('ideas');
    return all.filter(ideaIsVisible);
}

export async function getIdeaRow(
    id: string,
): Promise<IdeaEntity> {
    return GET<IdeaEntity>(`ideas/${id}`);
}

export async function getIdeaSubmissionRows(
): Promise<IdeaSubmissionEntity[]> {
    return GET<
        IdeaSubmissionEntity[]
    >('idea-submissions');
}

export async function getIdeaSubmissionRow(
    ideaId: string,
): Promise<IdeaSubmissionEntity> {
    const all = await getIdeaSubmissionRows();
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
    readonly submitterName: string;
    readonly submittedAt: string;
}

export async function getIdeas(
    ctx?: FetchContext,
): Promise<IdeaWithSubmitter[]> {
    const [
        ideas, userMap, submissions,
    ] = await Promise.all([
        getIdeaRows(),
        getUserMap(ctx),
        getIdeaSubmissionRows(),
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
            submitterName: userName(
                userMap,
                submission.user_id,
            ),
            submittedAt:
                submission.created_at,
        };
    });
}

export async function getIdea(
    ideaId: string,
    ctx?: FetchContext,
): Promise<IdeaWithSubmitter> {
    const [
        row, submission, userMap,
    ] = await Promise.all([
        getIdeaRow(ideaId),
        getIdeaSubmissionRow(ideaId),
        getUserMap(ctx),
    ]);
    return {
        idea: new Idea(row),
        submitterName: userName(
            userMap, submission.user_id,
        ),
        submittedAt: submission.created_at,
    };
}

export async function putIdea(
    id: string,
    entity: Omit<IdeaEntity, 'id'>,
): Promise<void> {
    await PUT(`ideas/${id}`, entity);
    ideaChangedChannel.send();
}

export async function putIdeaSubmission(
    submissionId: string,
    ideaId: string,
    userId: string,
): Promise<void> {
    await PUT(
        'idea-submissions/'
            + submissionId,
        {
            idea_id: ideaId,
            user_id: userId,
            created_at: nowUtc(),
        },
    );
}

// Idempotent: retry recovers from partial failure.
export async function postIdeaConversion(
    ideaId: string,
    projectId: string,
    project: Omit<ProjectEntity, 'id'>,
    leadUserId: string,
): Promise<void> {
    await putProject(projectId, project);
    await putProjectTeamMember({
        projectId,
        userId: leadUserId,
        role: 'lead',
        type: 'internal',
    });
    const existing = await getIdeaRow(ideaId);
    await putIdea(ideaId, {
        ...existing,
        status: 'promoted',
    });
}
