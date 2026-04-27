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

export async function getIdeas(
    ctx?: FetchContext,
): Promise<Idea[]> {
    const [
        ideas, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity[]>('ideas'),
        getUserMap(ctx),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submissionMap = new Map(
        submissions.map(s => [s.idea_id, s]),
    );
    return ideas
        .filter(ideaIsVisible)
        .map(idea => {
            const submission =
                submissionMap.get(idea.id);
            if (!submission) {
                throw new Error(
                    'Idea has no submission: '
                    + idea.id,
                );
            }
            return new Idea(
                idea,
                userName(
                    userMap,
                    submission.user_id,
                ),
                submission.created_at,
            );
        });
}

export async function getIdea(
    ideaId: string,
    ctx?: FetchContext,
): Promise<Idea> {
    const [
        idea, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        getUserMap(ctx),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submission = submissions.find(
        s => s.idea_id === ideaId,
    );
    if (!submission) {
        throw new Error(
            'Idea submission not found'
                + ' for idea ' + ideaId,
        );
    }
    return new Idea(
        idea,
        userName(
            userMap,
            submission.user_id,
        ),
        submission.created_at,
    );
}

export async function getIdeaRow(
    id: string,
): Promise<IdeaEntity> {
    return GET<IdeaEntity>(`ideas/${id}`);
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
