import { GET } from '../../../api/api';
import type { IdeaEntity, EdgeEntity, EdgeOutcomeEntity, EdgeMetricEntity, EdgeStatus, ConfidenceLevel, Id } from '../../../api/types';
import { User } from '../../../api/types';
import { buildUserMap, userName } from './helpers';

export interface EdgeIdea {
  title: string;
  problem: string;
  solution: string;
  submittedBy: string;
  score: number;
}

export async function getIdeaForEdge(ideaId: string, cachedUserMap?: Map<Id, User>): Promise<EdgeIdea> {
  const [idea, userMap] = await Promise.all([
    GET(`ideas/${ideaId}`) as Promise<IdeaEntity>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);
  return {
    title: idea.title,
    problem: idea.problem_statement || '',
    solution: idea.proposed_solution || '',
    submittedBy: userName(userMap, idea.submitted_by_id),
    score: idea.score,
  };
}

// ── Edge List ───────────────────────────────

export interface EdgeListItem {
  id: string;
  ideaId: string;
  ideaTitle: string;
  status: EdgeStatus;
  outcomesCount: number;
  metricsCount: number;
  confidence: ConfidenceLevel | null;
  owner: string;
  updatedAt: string;
}

export async function getEdgeList(cachedUserMap?: Map<Id, User>): Promise<EdgeListItem[]> {
  const [edgeRows, ideaRows, userMap, allOutcomes, allMetrics] = await Promise.all([
    GET('edges') as Promise<EdgeEntity[]>,
    GET('ideas') as Promise<IdeaEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
    GET('edge-outcomes') as Promise<EdgeOutcomeEntity[]>,
    GET('edge-metrics') as Promise<EdgeMetricEntity[]>,
  ]);
  const ideaMap = new Map(ideaRows.map(idea => [idea.id, idea]));

  const outcomesByEdgeId = Map.groupBy(allOutcomes, outcome => outcome.edge_id);

  return edgeRows.map(edge => {
    const outcomes = outcomesByEdgeId.get(edge.id) || [];
    const outcomeIds = new Set(outcomes.map(outcome => outcome.id));
    const metricsCount = allMetrics.filter(metric => outcomeIds.has(metric.outcome_id)).length;

    const idea = ideaMap.get(edge.idea_id);
    return {
      id: edge.id,
      ideaId: edge.idea_id,
      ideaTitle: idea?.title || '',
      status: edge.status || 'missing',
      outcomesCount: outcomes.length,
      metricsCount,
      confidence: edge.confidence || null,
      owner: userName(userMap, edge.owner_id),
      updatedAt: edge.updated_at,
    };
  });
}
