import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    EdgeEntity,
    EdgeIdeaEntity,
    EdgeOutcomeEntity,
    EdgeOutcomeEdgeEntity,
    EdgeMetricEntity,
    EdgeMetricOutcomeEntity,
    EdgeStatus,
    ConfidenceLevel,
    IdeaSubmissionEntity,
    EdgeOwnershipEntity,
} from '../../../api/types';
import { Idea, Edge } from '../../../api/types';
import type { EdgeData } from './helpers';
import {
    buildUserMap,
    userName,
} from './helpers';

export interface EdgeIdea {
    title: string;
    problem: string;
    solution: string;
    submittedBy: string;
    score: number;
}

export async function getIdeaForEdge(
    ideaId: string,
): Promise<EdgeIdea> {
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
        title: idea.title,
        problem: idea.problemStatement,
        solution: idea.proposedSolution,
        submittedBy: idea.submittedBy,
        score: idea.score,
    };
}

export interface EdgeListItem {
    id: string;
    ideaId: string;
    ideaTitle: string;
    status: EdgeStatus;
    outcomesCount: number;
    metricsCount: number;
    confidence: ConfidenceLevel;
    confidenceLabel: string;
    confidenceClassName: string;
    owner: string;
    updatedAt: string;
}

export async function getEdgeList(
): Promise<EdgeListItem[]> {
    const [
        edgeRows, ideaRows, userMap,
        allOutcomes, outcomeEdgeLinks,
        allMetrics, metricOutcomeLinks,
        ownerships, edgeIdeaLinks,
    ] = await Promise.all([
        GET<EdgeEntity[]>('edges'),
        GET<IdeaEntity[]>('ideas'),
        buildUserMap(),
        GET<EdgeOutcomeEntity[]>(
            'edge-outcomes',
        ),
        GET<EdgeOutcomeEdgeEntity[]>(
            'edge-outcome-edges',
        ),
        GET<EdgeMetricEntity[]>(
            'edge-metrics',
        ),
        GET<EdgeMetricOutcomeEntity[]>(
            'edge-metric-outcomes',
        ),
        GET<EdgeOwnershipEntity[]>(
            'edge-ownerships',
        ),
        GET<EdgeIdeaEntity[]>(
            'edge-ideas',
        ),
    ]);
    const ideaMap = new Map(
        ideaRows.map(
            idea => [idea.id, idea],
        ),
    );
    const ownerMap = new Map(
        ownerships.map(
            o => [o.edge_id, o.user_id],
        ),
    );
    const edgeIdeaMap = new Map(
        edgeIdeaLinks.map(
            l => [l.edge_id, l.idea_id],
        ),
    );

    const outcomeMap = new Map(
        allOutcomes.map(
            o => [o.id, o],
        ),
    );
    const outcomesByEdgeId = new Map<
        string,
        EdgeOutcomeEntity[]
    >();
    for (const link of outcomeEdgeLinks) {
        const outcome =
            outcomeMap.get(
                link.edge_outcome_id,
            );
        if (!outcome) continue;
        const list =
            outcomesByEdgeId.get(
                link.edge_id,
            );
        if (list) {
            list.push(outcome);
        } else {
            outcomesByEdgeId.set(
                link.edge_id,
                [outcome],
            );
        }
    }

    const metricIdsByOutcome = new Map<
        string,
        Set<string>
    >();
    for (
        const link of metricOutcomeLinks
    ) {
        const set =
            metricIdsByOutcome.get(
                link.outcome_id,
            );
        if (set) {
            set.add(link.edge_metric_id);
        } else {
            metricIdsByOutcome.set(
                link.outcome_id,
                new Set([
                    link.edge_metric_id,
                ]),
            );
        }
    }

    return edgeRows.map(entity => {
        const edge = new Edge(entity);
        const outcomes =
            outcomesByEdgeId.get(edge.id)
                || [];
        let metricsCount = 0;
        for (const outcome of outcomes) {
            const ids =
                metricIdsByOutcome.get(
                    outcome.id,
                );
            if (ids) {
                metricsCount += ids.size;
            }
        }

        const ideaId =
            edgeIdeaMap.get(edge.id)
                ?? '';
        const idea =
            ideaMap.get(ideaId);
        return {
            id: edge.id,
            ideaId,
            ideaTitle:
                idea?.title ?? '',
            status: edge.status,
            outcomesCount:
                outcomes.length,
            metricsCount,
            confidence: edge.confidence,
            confidenceLabel:
                edge.confidenceLabel(),
            confidenceClassName:
                edge
                    .confidenceClassName(),
            owner: userName(
                userMap,
                ownerMap.get(edge.id)
                    ?? '',
            ),
            updatedAt: edge.updatedAt,
        };
    });
}

export async function putEdgeData(
    ideaId: string,
    data: EdgeData,
): Promise<void> {
    const edge = await GET<EdgeEntity | null>(`ideas/${ideaId}/edge`);
    if (!edge) return;

    await PUT(`edges/${edge.id}`, {
        confidence: data.confidence,
        impact_short_term:
            data.impact.shortTerm,
        impact_mid_term:
            data.impact.midTerm,
        impact_long_term:
            data.impact.longTerm,
        status: 'complete' as const,
    });

    await Promise.all(
        data.outcomes.map(async outcome => {
            await PUT(
                `edges/${edge.id}`
                    + `/outcomes/${outcome.id}`,
                {
                    description:
                        outcome.description,
                },
            );
            await Promise.all(
                outcome.metrics.map(metric =>
                    PUT(
                        `edges/${edge.id}`
                        + `/outcomes/`
                        + `${outcome.id}`
                        + `/metrics/`
                        + `${metric.id}`,
                        {
                            name: metric.name,
                            target:
                                metric.target,
                            unit: metric.unit,
                            current:
                                metric.current,
                        },
                    ),
                ),
            );
        }),
    );
}
