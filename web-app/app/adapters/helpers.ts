import { GET } from '../../../api/api';
import type {
    Id,
    ConfidenceLevel,
    EdgeStatus,
    EdgeIdeaEntity,
} from '../../../api/types';
import type {
    UserEntity,
    EdgeEntity,
    EdgeOutcomeEntity,
    EdgeMetricEntity,
    EdgeMetricOutcomeEntity,
    EdgeOwnershipEntity,
} from '../../../api/types';
import { User } from '../../../api/types';
import { log } from '../logger';

export async function buildUserMap(): Promise<Map<Id, User>> {
    const users = await GET<UserEntity[]>('users');
    return new Map(users.map(entity => [entity.id, new User(entity)]));
}

export function userName(
    userMap: Map<Id, User>,
    userId: string | undefined,
): string {
    if (!userId) return '';
    return userMap.get(userId)?.fullName()
        ?? '';
}

export function computeEdgeStatus(
    ideaId: string,
    edgeIdeas: EdgeIdeaEntity[],
    edges: EdgeEntity[],
): EdgeStatus {
    const link = edgeIdeas.find(
        ei => ei.idea_id === ideaId,
    );
    if (!link) return 'missing';
    const edge = edges.find(
        e => e.id === link.edge_id,
    );
    if (!edge) return 'missing';
    return edge.status;
}

export function parseJson<T>(value: string | T, fallback: T): T {
    if (typeof value === 'string') {
        try { return JSON.parse(value) as T; }
        catch {
            log.warn(
                `Failed to parse JSON value:`
                + ` ${value.slice(0, 100)}`,
                'parseJson',
            );
            return fallback;
        }
    }
    return value;
}

export interface Metric {
    id: string;
    name: string;
    target: string;
    unit: string;
    current: string;
}

export interface EdgeData {
    outcomes: { id: string; description: string; metrics: Metric[] }[];
    impact: { shortTerm: string; midTerm: string; longTerm: string };
    confidence: ConfidenceLevel;
    owner: string;
}

export async function getEdgeDataByIdeaId(
    ideaId: string,
): Promise<EdgeData | null> {
    const edge = await GET<EdgeEntity | null>(
        `ideas/${ideaId}/edge`,
    );
    if (!edge) return null;

    const [
        outcomes, allMetrics,
        metricOutcomeLinks,
        userMap, ownerships,
    ] = await Promise.all([
        GET<EdgeOutcomeEntity[]>(
            `edges/${edge.id}/outcomes`,
        ),
        GET<EdgeMetricEntity[]>(
            'edge-metrics',
        ),
        GET<EdgeMetricOutcomeEntity[]>(
            'edge-metric-outcomes',
        ),
        buildUserMap(),
        GET<EdgeOwnershipEntity[]>(
            'edge-ownerships',
        ),
    ]);

    const metricMap = new Map(
        allMetrics.map(
            m => [m.id, m],
        ),
    );
    const metricsByOutcomeId = new Map<
        string,
        EdgeMetricEntity[]
    >();
    for (
        const link of metricOutcomeLinks
    ) {
        const metric = metricMap.get(
            link.edge_metric_id,
        );
        if (!metric) continue;
        const list =
            metricsByOutcomeId.get(
                link.outcome_id,
            );
        if (list) {
            list.push(metric);
        } else {
            metricsByOutcomeId.set(
                link.outcome_id,
                [metric],
            );
        }
    }

    const ownership = ownerships.find(
        o => o.edge_id === edge.id,
    );

    return {
        outcomes: outcomes.map(outcome => ({
            id: outcome.id,
            description:
                outcome.description,
            metrics: (
                metricsByOutcomeId.get(
                    outcome.id,
                ) || []
            ).map(metric => ({
                id: metric.id,
                name: metric.name,
                target: metric.target,
                unit: metric.unit,
                current: metric.current,
            })),
        })),
        impact: {
            shortTerm:
                edge.impact_short_term,
            midTerm:
                edge.impact_mid_term,
            longTerm:
                edge.impact_long_term,
        },
        confidence: edge.confidence,
        owner: userName(
            userMap,
            ownership?.user_id,
        ),
    };
}

export async function getEdgeDataWithConfidence(
    ideaId: string,
): Promise<EdgeData | null> {
    return getEdgeDataByIdeaId(ideaId);
}
