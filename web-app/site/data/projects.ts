import { GET } from '../../../api/api';
import type {
  ProjectEntity, ProjectTeamEntity, MilestoneEntity, ProjectTaskEntity,
  DiscussionEntity, ProjectVersionEntity,
  IdeaEntity, ClarificationEntity, ConfidenceLevel, Id,
} from '../../../api/types';
import { User } from '../../../api/types';
import { buildUserMap, parseJson, getEdgeDataWithConfidence } from './helpers';

export interface Project {
  id: string;
  title: string;
  status: 'approved' | 'under_review' | 'sent_back';
  priorityScore: number;
  estimatedTime: number;
  actualTime: number;
  estimatedCost: number;
  actualCost: number;
  estimatedImpact: number;
  actualImpact: number;
  progress: number;
  priority: number;
}

export async function getProjects(prefetchedProjects?: ProjectEntity[]): Promise<Project[]> {
  const rows = prefetchedProjects ?? await GET('projects') as ProjectEntity[];
  return rows.map(row => ({
    id: row.id,
    title: row.title,
    status: row.status as Project['status'],
    priorityScore: row.priority_score,
    estimatedTime: row.estimated_time,
    actualTime: row.actual_time,
    estimatedCost: row.estimated_cost,
    actualCost: row.actual_cost,
    estimatedImpact: row.estimated_impact,
    actualImpact: row.actual_impact,
    progress: row.progress,
    priority: row.priority,
  }));
}

// ── Project Detail ──────────────────────────

export interface ProjectDetail {
  id: string;
  title: string;
  description: string;
  status: string;
  progress: number;
  startDate: string;
  targetEndDate: string;
  projectLead: string;
  metrics: {
    time: { baseline: number; current: number };
    cost: { baseline: number; current: number };
    impact: { baseline: number; current: number };
  };
  edge: {
    outcomes: { id: string; description: string; metrics: { id: string; name: string; target: string; unit: string; current: string }[] }[];
    impact: { shortTerm: string; midTerm: string; longTerm: string };
    confidence: ConfidenceLevel;
    owner: string;
  };
  team: { id: string; name: string; role: string }[];
  milestones: { id: string; title: string; status: string; date: string }[];
  versions: { id: string; version: string; date: string; changes: string; author: string }[];
  discussions: { id: string; author: string; date: string; message: string }[];
  tasks: { name: string; priority: string; description: string; skills: string[]; hours: number; assigned: string }[];
}

export async function getProjectById(projectId: string): Promise<ProjectDetail> {
  const [project, teamRows, milestoneRows, taskRows, discussionRows, versionRows, userMap] = await Promise.all([
    GET(`projects/${projectId}`) as Promise<ProjectEntity>,
    GET(`projects/${projectId}/team`) as Promise<ProjectTeamEntity[]>,
    GET(`projects/${projectId}/milestones`) as Promise<MilestoneEntity[]>,
    GET(`projects/${projectId}/tasks`) as Promise<ProjectTaskEntity[]>,
    GET(`projects/${projectId}/discussions`) as Promise<DiscussionEntity[]>,
    GET(`projects/${projectId}/versions`) as Promise<ProjectVersionEntity[]>,
    buildUserMap(),
  ]);

  const edgeData = await getEdgeDataWithConfidence(project.linked_idea_id || projectId, userMap);

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    progress: project.progress,
    startDate: project.start_date,
    targetEndDate: project.target_end_date,
    projectLead: userMap.get(project.lead_id)?.fullName() ?? '',
    metrics: {
      time: { baseline: project.estimated_time, current: project.actual_time },
      cost: { baseline: project.estimated_cost, current: project.actual_cost },
      impact: { baseline: project.estimated_impact, current: project.actual_impact },
    },
    edge: edgeData,
    team: teamRows.map(member => ({
      id: member.user_id,
      name: userMap.get(member.user_id)?.fullName() ?? '',
      role: member.role,
    })),
    milestones: milestoneRows.map(milestone => ({
      id: milestone.id, title: milestone.title, status: milestone.status, date: milestone.date,
    })),
    versions: versionRows.map(version => ({
      id: version.id, version: version.version, date: version.date, changes: version.changes,
      author: userMap.get(version.author_id)?.fullName() ?? '',
    })),
    discussions: discussionRows.map(discussion => ({
      id: discussion.id, date: discussion.date, message: discussion.message,
      author: userMap.get(discussion.author_id)?.fullName() ?? '',
    })),
    tasks: taskRows.map(task => ({
      name: task.name, priority: task.priority, description: task.description,
      skills: parseJson<string[]>(task.skills),
      hours: task.hours,
      assigned: userMap.get(task.assigned_to_id)?.fullName() ?? '',
    })),
  };
}

// ── Engineering Requirements ─────────────────

export interface Clarification {
  id: string;
  question: string;
  askedBy: string;
  askedAt: string;
  status: 'pending' | 'answered';
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
}

export interface EngineeringProject {
  id: string;
  title: string;
  description: string;
  businessContext: {
    problem: string;
    expectedOutcome: string;
    successMetrics: string[];
    constraints: string[];
  };
  team: { id: string; name: string; role: string; type: string }[];
  linkedIdea: { id: string; title: string; score: number };
  timeline: string;
  budget: string;
}

export async function getProjectForEngineering(projectId: string): Promise<EngineeringProject> {
  const [project, teamRows, userMap] = await Promise.all([
    GET(`projects/${projectId}`) as Promise<ProjectEntity>,
    GET(`projects/${projectId}/team`) as Promise<ProjectTeamEntity[]>,
    buildUserMap(),
  ]);

  const businessContext = parseJson<{ problem?: string; expectedOutcome?: string; successMetrics?: string[]; constraints?: string[] }>(project.business_context);
  const linkedIdea = project.linked_idea_id
    ? await GET(`ideas/${project.linked_idea_id}`) as IdeaEntity | null
    : null;

  return {
    id: project.id,
    title: project.title,
    description: project.description,
    businessContext: {
      problem: businessContext.problem || '',
      expectedOutcome: businessContext.expectedOutcome || '',
      successMetrics: businessContext.successMetrics || [],
      constraints: businessContext.constraints || [],
    },
    team: teamRows.map(member => ({
      id: member.user_id,
      name: userMap.get(member.user_id)?.fullName() ?? '',
      role: member.role,
      type: member.type,
    })),
    linkedIdea: linkedIdea
      ? { id: linkedIdea.id, title: linkedIdea.title, score: linkedIdea.score }
      : { id: '', title: '', score: 0 },
    timeline: project.timeline_label,
    budget: project.budget_label,
  };
}

export async function getClarificationsByProjectId(projectId: string): Promise<Clarification[]> {
  const [clarificationRows, userMap] = await Promise.all([
    GET(`projects/${projectId}/clarifications`) as Promise<ClarificationEntity[]>,
    buildUserMap(),
  ]);
  return clarificationRows.map(clarification => ({
    id: clarification.id,
    question: clarification.question,
    askedBy: userMap.get(clarification.asked_by_id)?.fullName() ?? '',
    askedAt: clarification.asked_at,
    status: clarification.status as Clarification['status'],
    ...(clarification.answer ? { answer: clarification.answer } : {}),
    ...(clarification.answered_by_id ? { answeredBy: userMap.get(clarification.answered_by_id)?.fullName() ?? '' } : {}),
    ...(clarification.answered_at ? { answeredAt: clarification.answered_at } : {}),
  }));
}
