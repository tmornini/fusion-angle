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
import {
    createChannel,
} from '../channels';

export const ideaChanged =
    createChannel<void>();

export {
    Idea,
    type IdeaStatus,
    isIdeaStatus,
    IDEA_STATUS_CONFIG,
} from '../../../api/types';

export async function getIdeas(
): Promise<Idea[]> {
    const [
        ideas, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity[]>('ideas'),
        getUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submitterMap = new Map(
        submissions.map(
            s => [s.idea_id, s.user_id],
        ),
    );
    const submittedAtMap = new Map(
        submissions.map(
            s => [
                s.idea_id,
                s.created_at,
            ],
        ),
    );
    return ideas
        .filter(ideaIsVisible)
        .map(idea => new Idea(
            idea,
            userName(
                userMap,
                submitterMap.get(idea.id)!,
            ),
            submittedAtMap.get(idea.id)!,
        ));
}

export async function getIdeaDetail(
    ideaId: string,
): Promise<Idea> {
    const [
        idea, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        getUserMap(),
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

export async function getIdeaForConversion(
    ideaId: string,
): Promise<Idea> {
    const [
        entity, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        getUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submission = submissions.find(
        s => s.idea_id === ideaId,
    );
    return new Idea(
        entity,
        userName(
            userMap,
            submission!.user_id,
        ),
        submission!.created_at,
    );
}

export async function getIdea(
    id: string,
): Promise<IdeaEntity> {
    return GET<IdeaEntity>(`ideas/${id}`);
}

export async function putIdea(
    id: string,
    entity: Partial<IdeaEntity>,
): Promise<void> {
    await PUT(`ideas/${id}`, entity);
    ideaChanged.send();
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
