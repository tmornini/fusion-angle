import { GET } from '../../../api/api';
import type { Id, ConfidenceLevel } from '../../../api/types';
import type { UserEntity, EdgeEntity, EdgeOutcomeEntity, EdgeMetricEntity } from '../../../api/types';
import { User } from '../../../api/types';

export function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

export async function buildUserMap(): Promise<Map<Id, User>> {
  const users = await GET('users') as UserEntity[];
  return new Map(users.map(entity => [entity.id, new User(entity)]));
}

export function parseJson<T>(value: string | T): T {
  if (typeof value === 'string') {
    try { return JSON.parse(value) as T; }
    catch { return value as unknown as T; }
  }
  return value;
}

// ── Shared Edge Data Fetching ───────────────

export interface EdgeData {
  outcomes: { id: string; description: string; metrics: { id: string; name: string; target: string; unit: string; current: string }[] }[];
  impact: { shortTerm: string; midTerm: string; longTerm: string };
  confidence: ConfidenceLevel | '';
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

  const metricsByOutcomeId = groupBy(allMetrics, metric => metric.outcome_id);

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
    confidence: edge.confidence || '',
    owner: userMap.get(edge.owner_id)?.fullName() ?? '',
  };
}

// ── Edge Data with Confidence ───────────────

export function createDefaultEdgeData(): EdgeData & { confidence: ConfidenceLevel } {
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
  if (!edgeData) return createDefaultEdgeData();
  return {
    ...edgeData,
    confidence: (edgeData.confidence || 'medium') as ConfidenceLevel,
  };
}
