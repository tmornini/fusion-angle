import { GET } from '../../../api/api';
import type { IdeaEntity, IdeaScoreEntity, IdeaStatus, EdgeStatus, ConfidenceLevel } from '../../../api/types';
import { buildUserMap, parseJson, getEdgeDataWithConfidence } from './helpers';

export interface Idea {
  id: string;
  title: string;
  score: number;
  estimatedImpact: number;
  estimatedTime: number;
  estimatedCost: number;
  priority: number;
  status: IdeaStatus;
  submittedBy: string;
  edgeStatus: 'incomplete' | EdgeStatus;
}

export async function getIdeas(prefetchedIdeas?: IdeaEntity[]): Promise<Idea[]> {
  const [ideas, userMap] = await Promise.all([
    prefetchedIdeas ? Promise.resolve(prefetchedIdeas) : GET('ideas') as Promise<IdeaEntity[]>,
    buildUserMap(),
  ]);
  return ideas
    .map(idea => ({
      id: idea.id,
      title: idea.title,
      score: idea.score,
      estimatedImpact: idea.estimated_impact,
      estimatedTime: idea.estimated_time,
      estimatedCost: idea.estimated_cost,
      priority: idea.priority,
      status: idea.status,
      submittedBy: userMap.get(idea.submitted_by_id)?.fullName() ?? 'Unknown',
      edgeStatus: idea.edge_status as Idea['edgeStatus'],
    }));
}

// ── Idea Review Queue ───────────────────────

export interface ReviewIdea {
  id: string;
  title: string;
  submittedBy: string;
  priority: ConfidenceLevel;
  readiness: 'ready' | 'needs-info' | 'incomplete';
  edgeStatus: EdgeStatus;
  score: number;
  impact: string;
  effort: string;
  waitingDays: number;
  category: string;
}

export async function getReviewQueue(): Promise<ReviewIdea[]> {
  const [ideas, userMap] = await Promise.all([
    GET('ideas') as Promise<IdeaEntity[]>,
    buildUserMap(),
  ]);

  return ideas
    .filter(idea => idea.readiness !== '')
    .map(idea => {
      let priority: ReviewIdea['priority'] = 'low';
      if (idea.score >= 80) priority = 'high';
      else if (idea.score >= 60) priority = 'medium';

      return {
        id: idea.id,
        title: idea.title,
        submittedBy: userMap.get(idea.submitted_by_id)?.fullName() ?? 'Unknown',
        priority,
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
  estimatedTime: string;
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
    estimatedTime: scoreRow?.estimated_time || '',
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
  priority: string;
  score: number;
  category: string;
  impact: { level: string; description: string };
  effort: { level: string; timeEstimate: string; teamSize: string };
  cost: { estimate: string; breakdown: string };
  risks: { title: string; severity: 'high' | 'medium' | 'low'; mitigation: string }[];
  assumptions: string[];
  alignments: string[];
}

export interface ApprovalEdge {
  outcomes: { id: string; description: string; metrics: { id: string; name: string; target: string; unit: string }[] }[];
  impact: { shortTerm: string; midTerm: string; longTerm: string };
  confidence: ConfidenceLevel;
  owner: string;
}

export async function getIdeaForApproval(ideaId: string): Promise<ApprovalIdea> {
  const [idea, userMap] = await Promise.all([
    GET(`ideas/${ideaId}`) as Promise<IdeaEntity>,
    buildUserMap(),
  ]);

  return {
    id: idea.id,
    title: idea.title,
    description: idea.description || '',
    submittedBy: userMap.get(idea.submitted_by_id)?.fullName() ?? 'Unknown',
    submittedAt: idea.submitted_at || '',
    priority: idea.score >= 80 ? 'high' : idea.score >= 60 ? 'medium' : 'low',
    score: idea.score,
    category: idea.category || '',
    impact: {
      level: idea.impact_label || '',
      description: idea.description || '',
    },
    effort: {
      level: idea.effort_label || '',
      timeEstimate: idea.effort_time_estimate || '',
      teamSize: idea.effort_team_size || '',
    },
    cost: {
      estimate: idea.cost_estimate || '',
      breakdown: idea.cost_breakdown || '',
    },
    risks: parseJson<ApprovalIdea['risks']>(idea.risks),
    assumptions: parseJson<string[]>(idea.assumptions),
    alignments: parseJson<string[]>(idea.alignments),
  };
}

export async function getEdgeForApproval(ideaId: string): Promise<ApprovalEdge> {
  return getEdgeDataWithConfidence(ideaId);
}
