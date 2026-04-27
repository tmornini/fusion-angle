import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    IdeaSubmissionEntity,
} from '../../../api/types';
import {
    Idea, nowUtc,
    ideaIsVisible,
} from '../../../api/types';
import {
    getUserMap,
    userName,
} from './shared';
import type { FetchContext } from './shared';
import {
    createChannel,
} from '../channels';

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
} from '../../../api/types';

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

export async function getIdeaEntity(
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
