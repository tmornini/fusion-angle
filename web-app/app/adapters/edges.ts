import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    EdgeEntity,
    EdgeIdeaEntity,
    EdgeOutcomeEntity,
    EdgeOutcomeEdgeEntity,
    EdgeMetricEntity,
    EdgeMetricOutcomeEntity,
    IdeaSubmissionEntity,
    EdgeOwnershipEntity,
} from '../../../api/types';
import { Idea, EdgeListEntry } from '../../../api/types';
import type { EdgeData } from './helpers';
import {
    buildUserMap,
    userName,
} from './helpers';

export async function getIdeaForEdge(
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

export async function getEdgeList(
): Promise<EdgeListEntry[]> {
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
        const outcomes =
            outcomesByEdgeId.get(
                entity.id,
            );
        let metricsCount = 0;
        if (outcomes) for (
            const outcome of outcomes
        ) {
            const ids =
                metricIdsByOutcome.get(
                    outcome.id,
                );
            if (ids) {
                metricsCount += ids.size;
            }
        }

        const ideaId =
            edgeIdeaMap.get(entity.id)!;
        const idea =
            ideaMap.get(ideaId);
        return new EdgeListEntry(
            entity,
            ideaId,
            idea!.title,
            outcomes ? outcomes.length : 0,
            metricsCount,
            userName(
                userMap,
                ownerMap.get(entity.id),
            ),
        );
    });
}

export async function putEdge(
    ideaId: string,
    fields: Partial<EdgeEntity>,
): Promise<EdgeEntity> {
    return PUT<EdgeEntity>(
        `ideas/${ideaId}/edge`,
        fields,
    );
}

export async function putEdgeOutcome(
    edgeId: string,
    outcomeId: string,
    fields: { description: string },
): Promise<void> {
    await PUT(
        `edges/${edgeId}`
            + `/outcomes/${outcomeId}`,
        fields,
    );
}

export async function putEdgeMetric(
    edgeId: string,
    outcomeId: string,
    metricId: string,
    fields: {
        name: string;
        target: string;
        unit: string;
        current: string;
    },
): Promise<void> {
    await PUT(
        `edges/${edgeId}`
            + `/outcomes/${outcomeId}`
            + `/metrics/${metricId}`,
        fields,
    );
}
