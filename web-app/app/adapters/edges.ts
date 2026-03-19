import { GET, PUT } from '../../../api/api';
import type {
    IdeaEntity,
    EdgeEntity,
    EdgeOutcomeEntity,
    EdgeMetricEntity,
    EdgeStatus,
    ConfidenceLevel,
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
  const [entity, userMap] =
    await Promise.all([
      GET<IdeaEntity>(`ideas/${ideaId}`),
      buildUserMap(),
    ]);
  const idea = new Idea(
    entity,
    userName(
      userMap,
      entity.submitted_by_id,
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

// ── Edge List ───────────────────

export interface EdgeListItem {
  id: string;
  ideaId: string;
  ideaTitle: string;
  status: EdgeStatus;
  outcomesCount: number;
  metricsCount: number;
  confidence: ConfidenceLevel;
  owner: string;
  updatedAt: string;
}

export async function getEdgeList(
): Promise<EdgeListItem[]> {
  const [
    edgeRows, ideaRows, userMap,
    allOutcomes, allMetrics,
  ] = await Promise.all([
    GET<EdgeEntity[]>('edges'),
    GET<IdeaEntity[]>('ideas'),
    buildUserMap(),
    GET<EdgeOutcomeEntity[]>(
      'edge-outcomes',
    ),
    GET<EdgeMetricEntity[]>(
      'edge-metrics',
    ),
  ]);
  const ideaMap = new Map(
    ideaRows.map(
      idea => [idea.id, idea],
    ),
  );

  const outcomesByEdgeId = Map.groupBy(
    allOutcomes,
    outcome => outcome.edge_id,
  );

  return edgeRows.map(entity => {
    const edge = new Edge(entity);
    const outcomes =
      outcomesByEdgeId.get(edge.id)
        || [];
    const outcomeIds = new Set(
      outcomes.map(
        outcome => outcome.id,
      ),
    );
    const metricsCount = allMetrics
      .filter(
        m => outcomeIds.has(m.outcome_id),
      )
      .length;

    const idea =
      ideaMap.get(edge.ideaId);
    return {
      id: edge.id,
      ideaId: edge.ideaId,
      ideaTitle: idea?.title ?? '',
      status: edge.status,
      outcomesCount: outcomes.length,
      metricsCount,
      confidence: edge.confidence,
      owner: userName(
        userMap,
        edge.ownerId,
      ),
      updatedAt: edge.updatedAt,
    };
  });
}

// ── Write Operations ─────────────────

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

  for (const outcome of data.outcomes) {
    await PUT(
      `edges/${edge.id}`
        + `/outcomes/${outcome.id}`,
      {
        description: outcome.description,
        edge_id: edge.id,
      },
    );
    for (
      const metric of outcome.metrics
    ) {
      const metricUrl =
        `edges/${edge.id}`
        + `/outcomes/${outcome.id}`
        + `/metrics/${metric.id}`;
      await PUT(metricUrl, {
        name: metric.name,
        target: metric.target,
        unit: metric.unit,
        current: metric.current,
        outcome_id: outcome.id,
      });
    }
  }
}
