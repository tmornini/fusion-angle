import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    IdeaScoreEntity,
    ConfidenceLevel,
    IdeaSubmissionEntity,
} from '../../../api/types';
import {
    Idea, nowUtc,
    ideaIsNotDeleted,
    ideaIsInReview,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    parseJson,
    getEdgeDataWithConfidence,
    type Metric,
} from './helpers';

export { Idea } from '../../../api/types';

export async function getIdeas(
): Promise<Idea[]> {
    const [ideas, userMap, submissions] =
        await Promise.all([
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
    return ideas
        .filter(ideaIsNotDeleted)
        .map(idea => new Idea(
            idea,
            userName(
                userMap,
                submitterMap.get(idea.id)
                    ?? '',
            ),
        ));
}

// ── Idea Detail ──────────────────

export async function getIdeaDetail(
    ideaId: string,
): Promise<Idea> {
    const [idea, userMap, submissions] =
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
        idea,
        userName(
            userMap,
            submission?.user_id ?? '',
        ),
    );
}

// ── Idea Review Queue ────────────────

export async function getReviewQueue(
): Promise<Idea[]> {
    const [ideas, userMap, submissions] =
        await Promise.all([
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

    return ideas
        .filter(ideaIsInReview)
        .map(idea => new Idea(
            idea,
            userName(
                userMap,
                submitterMap.get(idea.id)
                    ?? '',
            ),
        ));
}

// ── Idea Convert ──────────────────

export interface ConversionIdea {
    id: string;
    title: string;
    problemStatement: string;
    proposedSolution: string;
    expectedOutcome: string;
    score: number;
    estimatedDuration: string;
    estimatedCost: string;
}

export async function getIdeaForConversion(
    ideaId: string,
): Promise<ConversionIdea> {
    const [entity, scoreRow] =
        await Promise.all([
            GET<IdeaEntity>(
                `ideas/${ideaId}`,
            ),
            GET<IdeaScoreEntity | null>(
                `ideas/${ideaId}/score`,
            ),
        ]);
    const idea = new Idea(entity);
    return {
        id: idea.id,
        title: idea.title,
        problemStatement:
            idea.problemStatement,
        proposedSolution:
            idea.proposedSolution,
        expectedOutcome:
            idea.expectedOutcome,
        score: idea.resolvedScore(
            scoreRow?.overall,
        ),
        estimatedDuration:
            scoreRow?.estimated_duration
                ?? '',
        estimatedCost:
            scoreRow?.estimated_cost ?? '',
    };
}

// ── Approval Detail ─────────────────

export interface ApprovalIdea {
    id: string;
    title: string;
    description: string;
    submittedBy: string;
    submittedAt: string;
    priority: string;
    score: number;
    category: string;
    impact: {
        level: string;
        description: string;
    };
    effort: {
        level: string;
        durationEstimate: string;
        teamSize: string;
    };
    cost: {
        estimate: string;
        breakdown: string;
    };
    risks: {
        title: string;
        severity: 'high' | 'medium' | 'low';
        mitigation: string;
    }[];
    assumptions: string[];
    alignments: string[];
}

export interface ApprovalEdge {
    outcomes: {
        id: string;
        description: string;
        metrics: Omit<Metric, 'current'>[];
    }[];
    impact: {
        shortTerm: string;
        midTerm: string;
        longTerm: string;
    };
    confidence: ConfidenceLevel;
    owner: string;
}

export async function getIdeaForApproval(
    ideaId: string,
): Promise<ApprovalIdea> {
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
    const idea = new Idea(
        entity,
        userName(
            userMap,
            submission?.user_id ?? '',
        ),
    );

    return {
        id: idea.id,
        title: idea.title,
        description: idea.description,
        submittedBy: idea.submittedBy,
        submittedAt: idea.submittedAt,
        priority: idea.priorityLevel(),
        score: idea.score,
        category: idea.category,
        impact: {
            level: idea.impactLabel,
            description: idea.description,
        },
        effort: {
            level: idea.effortLabel,
            durationEstimate:
                idea.effortDurationEstimate,
            teamSize: idea.effortTeamSize,
        },
        cost: {
            estimate: idea.costEstimate,
            breakdown: idea.costBreakdown,
        },
        risks: parseJson<
            ApprovalIdea['risks']
        >(idea.risks, []),
        assumptions: parseJson<string[]>(
            idea.assumptions,
            [],
        ),
        alignments: parseJson<string[]>(
            idea.alignments,
            [],
        ),
    };
}

export async function getEdgeForApproval(
    ideaId: string,
): Promise<ApprovalEdge> {
    return getEdgeDataWithConfidence(ideaId);
}

// ── Write Operations ─────────────────

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
