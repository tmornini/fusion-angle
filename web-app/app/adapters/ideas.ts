import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    IdeaScoreEntity,
    IdeaSubmissionEntity,
    EdgeIdeaEntity,
    EdgeEntity,
} from '../../../api/types';
import {
    Idea, nowUtc,
    ideaIsNotDeleted,
    ideaIsInReview,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    computeEdgeStatus,
    getEdgeDataWithConfidence,
    type EdgeData,
} from './helpers';

export { Idea } from '../../../api/types';

export async function getIdeas(
): Promise<Idea[]> {
    const [
        ideas, userMap, submissions,
        edgeIdeas, edges,
    ] = await Promise.all([
        GET<IdeaEntity[]>('ideas'),
        buildUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
        GET<EdgeIdeaEntity[]>(
            'edge-ideas',
        ),
        GET<EdgeEntity[]>('edges'),
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
        .filter(ideaIsNotDeleted)
        .map(idea => new Idea(
            idea,
            userName(
                userMap,
                submitterMap.get(idea.id)!,
            ),
            computeEdgeStatus(
                idea.id,
                edgeIdeas,
                edges,
            ),
            submittedAtMap.get(idea.id)!,
        ));
}

export async function getIdeaDetail(
    ideaId: string,
): Promise<Idea> {
    const [
        idea, userMap, submissions,
        edgeIdeas, edges,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        buildUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
        GET<EdgeIdeaEntity[]>(
            'edge-ideas',
        ),
        GET<EdgeEntity[]>('edges'),
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
        computeEdgeStatus(
            ideaId,
            edgeIdeas,
            edges,
        ),
        submission.created_at,
    );
}

export async function getReviewQueue(
): Promise<Idea[]> {
    const [
        ideas, userMap, submissions,
        edgeIdeas, edges,
    ] = await Promise.all([
        GET<IdeaEntity[]>('ideas'),
        buildUserMap(),
        GET<IdeaSubmissionEntity[]>(
            'idea-submissions',
        ),
        GET<EdgeIdeaEntity[]>(
            'edge-ideas',
        ),
        GET<EdgeEntity[]>('edges'),
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
        .filter(ideaIsInReview)
        .map(idea => new Idea(
            idea,
            userName(
                userMap,
                submitterMap.get(idea.id)!,
            ),
            computeEdgeStatus(
                idea.id,
                edgeIdeas,
                edges,
            ),
            submittedAtMap.get(idea.id)!,
        ));
}

export interface ConversionData {
    idea: Idea;
    estimatedDuration: string | null;
    estimatedCost: string | null;
}

export async function getIdeaForConversion(
    ideaId: string,
): Promise<ConversionData> {
    const [
        entity, scoreRow,
        userMap, submissions,
    ] = await Promise.all([
        GET<IdeaEntity>(
            `ideas/${ideaId}`,
        ),
        GET<IdeaScoreEntity | null>(
            `ideas/${ideaId}/score`,
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
            'missing',
            submission!.created_at,
        ),
        estimatedDuration:
            scoreRow?.estimated_duration
                ?? null,
        estimatedCost:
            scoreRow?.estimated_cost
                ?? null,
    };
}

export async function getIdeaForApproval(
    ideaId: string,
): Promise<Idea> {
    const [entity, userMap, submissions] =
        await Promise.all([
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
    return new Idea(
        entity,
        userName(
            userMap,
            submission!.user_id,
        ),
        'missing',
        submission!.created_at,
    );
}

export async function getEdgeForApproval(
    ideaId: string,
): Promise<EdgeData | null> {
    return getEdgeDataWithConfidence(ideaId);
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
