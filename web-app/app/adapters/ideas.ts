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
    buildUserMap,
    userName,
} from './helpers';

export { Idea } from '../../../api/types';

export async function getIdeas(
): Promise<Idea[]> {
    const [
        ideas, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity[]>('ideas'),
        buildUserMap(),
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
        buildUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submission = submissions.find(
        s => s.idea_id === ideaId,
    );
    if (!idea || !submission) {
        throw new Error('Idea not found');
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

export interface ConversionData {
    idea: Idea;
    estimatedDuration: string;
    estimatedCost: string;
}

export async function getIdeaForConversion(
    ideaId: string,
): Promise<ConversionData> {
    const [
        entity, userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        buildUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
    ]);
    const submission = submissions.find(
        s => s.idea_id === ideaId,
    );
    return {
        idea: new Idea(
            entity,
            userName(
                userMap,
                submission!.user_id,
            ),
            submission!.created_at,
        ),
        estimatedDuration: '',
        estimatedCost: '',
    };
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
}

export async function putIdeaSubmission(
    ideaId: string,
    userId: string,
): Promise<void> {
    await PUT(
        `idea-submissions/`
            + crypto.randomUUID(),
        {
            idea_id: ideaId,
            user_id: userId,
            created_at: nowUtc(),
        },
    );
}
