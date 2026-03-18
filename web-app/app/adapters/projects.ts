import { GET, PUT } from '../../../api/api';
import type {
  ProjectEntity, ProjectTeamEntity, MilestoneEntity, ProjectTaskEntity,
  DiscussionEntity, ProjectVersionEntity,
  IdeaEntity, ClarificationEntity, ConfidenceLevel, ProjectStatus, Id,
} from '../../../api/types';
import { User } from '../../../api/types';
import { durationInDays } from '../format';
import { buildUserMap, userName, parseJson, getEdgeDataWithConfidence, type Metric } from './helpers';

export interface Project {
  id: string;
  title: string;
  status: ProjectStatus;
  priorityScore: number;
  estimatedDuration: number;
  actualDuration: number;
  estimatedCost: number;
  actualCost: number;
  estimatedImpact: number;
  actualImpact: number;
  progress: number;
  priority: number;
}

export async function getProjects(prefetchedProjects?: ProjectEntity[]): Promise<Project[]> {
  const rows = prefetchedProjects ?? await GET('projects') as ProjectEntity[];
  return rows
    .filter(row => row.status !== 'deleted')
    .map(row => ({
    id: row.id,
    title: row.title,
    status: row.status,
    priorityScore: row.priority_score,
    estimatedDuration: durationInDays(row.estimated_duration),
    actualDuration: durationInDays(row.actual_duration),
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
    outcomes: { id: string; description: string; metrics: Metric[] }[];
    impact: { shortTerm: string; midTerm: string; longTerm: string };
    confidence: ConfidenceLevel;
    owner: string;
  };
  team: { id: string; name: string; role: string }[];
  milestones: { id: string; title: string; status: string; date: string }[];
  versions: { id: string; version: string; date: string; changes: string; author: string }[];
  discussions: { id: string; author: string; date: string; message: string }[];
  tasks: { name: string; priority: string; description: string; skills: string[]; duration: number; assigned: string }[];
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
    projectLead: userName(userMap, project.lead_id),
    metrics: {
      time: { baseline: durationInDays(project.estimated_duration), current: durationInDays(project.actual_duration) },
      cost: { baseline: project.estimated_cost, current: project.actual_cost },
      impact: { baseline: project.estimated_impact, current: project.actual_impact },
    },
    edge: edgeData,
    team: teamRows.map(member => ({
      id: member.user_id,
      name: userName(userMap, member.user_id),
      role: member.role,
    })),
    milestones: milestoneRows.map(milestone => ({
      id: milestone.id, title: milestone.title, status: milestone.status, date: milestone.date,
    })),
    versions: versionRows.map(version => ({
      id: version.id, version: version.version, date: version.date, changes: version.changes,
      author: userName(userMap, version.author_id),
    })),
    discussions: discussionRows.map(discussion => ({
      id: discussion.id, date: discussion.date, message: discussion.message,
      author: userName(userMap, discussion.author_id),
    })),
    tasks: taskRows.map(task => ({
      name: task.name, priority: task.priority, description: task.description,
      skills: parseJson<string[]>(task.skills, []),
      duration: durationInDays(task.duration),
      assigned: userName(userMap, task.assigned_to_id),
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

export async function getProjectForEngineering(projectId: string, cachedUserMap?: Map<Id, User>): Promise<EngineeringProject> {
  const [project, teamRows, userMap] = await Promise.all([
    GET(`projects/${projectId}`) as Promise<ProjectEntity>,
    GET(`projects/${projectId}/team`) as Promise<ProjectTeamEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);

  const businessContext = parseJson<{ problem?: string; expectedOutcome?: string; successMetrics?: string[]; constraints?: string[] }>(project.business_context, {});
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
      name: userName(userMap, member.user_id),
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

export async function getClarificationsByProjectId(projectId: string, cachedUserMap?: Map<Id, User>): Promise<Clarification[]> {
  const [clarificationRows, userMap] = await Promise.all([
    GET(`projects/${projectId}/clarifications`) as Promise<ClarificationEntity[]>,
    cachedUserMap ? Promise.resolve(cachedUserMap) : buildUserMap(),
  ]);
  return clarificationRows.map(clarification => ({
    id: clarification.id,
    question: clarification.question,
    askedBy: userName(userMap, clarification.asked_by_id),
    askedAt: clarification.asked_at,
    status: clarification.status as Clarification['status'],
    ...(clarification.answer ? { answer: clarification.answer } : {}),
    ...(clarification.answered_by_id ? { answeredBy: userName(userMap, clarification.answered_by_id) } : {}),
    ...(clarification.answered_at ? { answeredAt: clarification.answered_at } : {}),
  }));
}

// ── Write Operations ───────────────────────

export async function putProject(id: string, entity: Partial<ProjectEntity>): Promise<void> {
  await PUT(`projects/${id}`, entity as Record<string, unknown>);
}

export async function putMilestone(projectId: string, milestoneId: string, entity: Partial<MilestoneEntity>): Promise<void> {
  await PUT(`projects/${projectId}/milestones/${milestoneId}`, entity as Record<string, unknown>);
}
