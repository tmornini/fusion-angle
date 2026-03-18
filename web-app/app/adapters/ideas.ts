import { GET, PUT } from '../../../api/api';
import type { IdeaEntity, IdeaScoreEntity, IdeaStatus, EdgeStatus, ConfidenceLevel, PriorityLevel, Id } from '../../../api/types';
import { User, computePriority } from '../../../api/types';
import { buildUserMap, userName, parseJson, getEdgeDataWithConfidence, type Metric } from './helpers';
import { durationInDays } from '../format';

export interface Idea {
  id: string;
  title: string;
  score: number;
  estimatedImpact: number;
  estimatedDuration: number;
  estimatedCost: number;
  priority: number;
  status: IdeaStatus;
  submittedBy: string;
  edgeStatus: 'incomplete' | EdgeStatus;
}

export async function getIdeas(prefetchedIdeas?: IdeaEntity[], cachedUserMap?: Map<Id, User>): Promise<Idea[]> {
  const [ideas, userMap] = await Promise.all([
    prefetchedIdeas ? Promise.resolve(prefetchedIdeas) : GET('ideas') as Promise<IdeaEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);
  return ideas
    .filter(idea => idea.status !== 'deleted')
    .map(idea => ({
      id: idea.id,
      title: idea.title,
      score: idea.score,
      estimatedImpact: idea.estimated_impact,
      estimatedDuration: durationInDays(idea.estimated_duration),
      estimatedCost: idea.estimated_cost,
      priority: idea.priority,
      status: idea.status,
      submittedBy: userName(userMap, idea.submitted_by_id),
      edgeStatus: idea.edge_status as Idea['edgeStatus'],
    }));
}

// ── Idea Review Queue ───────────────────────

export interface ReviewIdea {
  id: string;
  title: string;
  submittedBy: string;
  priority: PriorityLevel;
  readiness: 'ready' | 'needs-info' | 'incomplete';
  edgeStatus: EdgeStatus;
  score: number;
  impact: string;
  effort: string;
  waitingDays: number;
  category: string;
}

export async function getReviewQueue(cachedUserMap?: Map<Id, User>): Promise<ReviewIdea[]> {
  const [ideas, userMap] = await Promise.all([
    GET('ideas') as Promise<IdeaEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);

  return ideas
    .filter(idea => idea.status === 'in-review')
    .map(idea => {
      return {
        id: idea.id,
        title: idea.title,
        submittedBy: userName(userMap, idea.submitted_by_id),
        priority: computePriority(idea.score),
        readiness: (idea.readiness || 'incomplete') as ReviewIdea['readiness'],
        edgeStatus: (idea.edge_status || 'missing') as ReviewIdea['edgeStatus'],
        score: idea.score,
        impact: idea.impact_label,
        effort: idea.effort_label,
        waitingDays: idea.waiting_days,
        category: idea.category,
      };
    });
}

// ── Idea Convert ────────────────────────────

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

export async function getIdeaForConversion(ideaId: string): Promise<ConversionIdea> {
  const [idea, scoreRow] = await Promise.all([
    GET(`ideas/${ideaId}`) as Promise<IdeaEntity>,
    GET(`ideas/${ideaId}/score`) as Promise<IdeaScoreEntity | null>,
  ]);
  return {
    id: idea.id,
    title: idea.title,
    problemStatement: idea.problem_statement || '',
    proposedSolution: idea.proposed_solution || '',
    expectedOutcome: idea.expected_outcome || '',
    score: scoreRow?.overall || idea.score,
    estimatedDuration: scoreRow?.estimated_duration || '',
    estimatedCost: scoreRow?.estimated_cost || '',
  };
}

// ── Approval Detail ─────────────────────────

export interface ApprovalIdea {
  id: string;
  title: string;
  description: string;
  submittedBy: string;
  submittedAt: string;
  priority: PriorityLevel;
  score: number;
  category: string;
  impact: { level: string; description: string };
  effort: { level: string; durationEstimate: string; teamSize: string };
  cost: { estimate: string; breakdown: string };
  risks: { title: string; severity: 'high' | 'medium' | 'low'; mitigation: string }[];
  assumptions: string[];
  alignments: string[];
}

export interface ApprovalEdge {
  outcomes: { id: string; description: string; metrics: Omit<Metric, 'current'>[] }[];
  impact: { shortTerm: string; midTerm: string; longTerm: string };
  confidence: ConfidenceLevel;
  owner: string;
}

export async function getIdeaForApproval(ideaId: string, cachedUserMap?: Map<Id, User>): Promise<ApprovalIdea> {
  const [idea, userMap] = await Promise.all([
    GET(`ideas/${ideaId}`) as Promise<IdeaEntity>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);

  return {
    id: idea.id,
    title: idea.title,
    description: idea.description || '',
    submittedBy: userName(userMap, idea.submitted_by_id),
    submittedAt: idea.submitted_at || '',
    priority: computePriority(idea.score),
    score: idea.score,
    category: idea.category || '',
    impact: {
      level: idea.impact_label || '',
      description: idea.description || '',
    },
    effort: {
      level: idea.effort_label || '',
      durationEstimate: idea.effort_duration_estimate || '',
      teamSize: idea.effort_team_size || '',
    },
    cost: {
      estimate: idea.cost_estimate || '',
      breakdown: idea.cost_breakdown || '',
    },
    risks: parseJson<ApprovalIdea['risks']>(idea.risks, []),
    assumptions: parseJson<string[]>(idea.assumptions, []),
    alignments: parseJson<string[]>(idea.alignments, []),
  };
}

export async function getEdgeForApproval(ideaId: string, cachedUserMap?: Map<Id, User>): Promise<ApprovalEdge> {
  return getEdgeDataWithConfidence(ideaId, cachedUserMap);
}

// ── Write Operations ───────────────────────

export async function getIdea(id: string): Promise<IdeaEntity> {
  return GET(`ideas/${id}`) as Promise<IdeaEntity>;
}

export async function putIdea(id: string, entity: Partial<IdeaEntity>): Promise<void> {
  await PUT(`ideas/${id}`, entity as Record<string, unknown>);
}
