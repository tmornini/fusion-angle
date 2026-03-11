import { GET } from '../../../api/api';
import type { Id, ConfidenceLevel } from '../../../api/types';
import type { UserEntity, EdgeEntity, EdgeOutcomeEntity, EdgeMetricEntity } from '../../../api/types';
import { User } from '../../../api/types';
import { log } from '../logger';

export async function buildUserMap(): Promise<Map<Id, User>> {
  const users = await GET('users') as UserEntity[];
  return new Map(users.map(entity => [entity.id, new User(entity)]));
}

export function userName(userMap: Map<Id, User>, userId: string): string {
  return userMap.get(userId)?.fullName() ?? 'Unknown';
}

export function parseJson<T>(value: string | T, fallback: T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; }
    catch { log.warn(`Failed to parse JSON value: ${value.slice(0, 100)}`, 'parseJson'); return fallback; }
  }
  return value;
}

// ── Shared Types ────────────────────────────

export interface Metric {
  id: string;
  name: string;
  target: string;
  unit: string;
  current: string;
}

// ── Shared Edge Data Fetching ───────────────

export interface EdgeData {
  outcomes: { id: string; description: string; metrics: Metric[] }[];
  impact: { shortTerm: string; midTerm: string; longTerm: string };
  confidence: ConfidenceLevel | null;
  owner: string;
}

export async function getEdgeDataByIdeaId(ideaId: string, cachedUserMap?: Map<Id, User>): Promise<EdgeData | null> {
  const edge = await GET(`ideas/${ideaId}/edge`) as EdgeEntity | null;
  if (!edge) return null;

  const [outcomes, allMetrics, userMap] = await Promise.all([
    GET(`edges/${edge.id}/outcomes`) as Promise<EdgeOutcomeEntity[]>,
    GET('edge-metrics') as Promise<EdgeMetricEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);

  const metricsByOutcomeId = Map.groupBy(allMetrics, metric => metric.outcome_id);

  return {
    outcomes: outcomes.map(outcome => ({
      id: outcome.id,
      description: outcome.description,
      metrics: (metricsByOutcomeId.get(outcome.id) || [])
        .map(metric => ({ id: metric.id, name: metric.name, target: metric.target, unit: metric.unit, current: metric.current })),
    })),
    impact: {
      shortTerm: edge.impact_short_term,
      midTerm: edge.impact_mid_term,
      longTerm: edge.impact_long_term,
    },
    confidence: edge.confidence ?? null,
    owner: userName(userMap, edge.owner_id),
  };
}

// ── Edge Data with Confidence ───────────────

export function buildDefaultEdgeData(): EdgeData & { confidence: ConfidenceLevel } {
  return {
    outcomes: [],
    impact: { shortTerm: '', midTerm: '', longTerm: '' },
    confidence: 'medium',
    owner: '',
  };
}

export async function getEdgeDataWithConfidence(
  ideaId: string,
  cachedUserMap?: Map<Id, User>,
): Promise<EdgeData & { confidence: ConfidenceLevel }> {
  const edgeData = await getEdgeDataByIdeaId(ideaId, cachedUserMap);
  if (!edgeData) return buildDefaultEdgeData();
  return {
    ...edgeData,
    confidence: edgeData.confidence ?? 'medium',
  };
}
