import { GET } from '../../../api/api';
import type {
    Id,
    ConfidenceLevel,
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

export function userName(userMap: Map<Id, User>, userId: string): string {
    return userMap.get(userId)?.fullName() ?? 'Unknown';
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

// ── Status Predicates ────────────

export function isNotDeleted(
    entity: { status: string },
): boolean {
    return entity.status !== 'deleted';
}

export function isInReview(
    entity: { status: string },
): boolean {
    return entity.status === 'in-review';
}

// ── Shared Types ──────────────────

export interface Metric {
    id: string;
    name: string;
    target: string;
    unit: string;
    current: string;
}

// ── Shared Edge Data Fetching ────────────

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
            ownership?.user_id ?? '',
        ),
    };
}

// ── Edge Data with Confidence ────────────

export function buildDefaultEdgeData(
): EdgeData {
    return {
        outcomes: [],
        impact: { shortTerm: '', midTerm: '', longTerm: '' },
        confidence: 'medium',
        owner: '',
    };
}

export async function getEdgeDataWithConfidence(
    ideaId: string,
): Promise<EdgeData> {
    const edgeData =
        await getEdgeDataByIdeaId(ideaId);
    if (!edgeData) return buildDefaultEdgeData();
    return edgeData;
}
