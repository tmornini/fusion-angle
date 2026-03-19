import { GET, PUT } from '../../../api/api';
import type {
    ProjectEntity,
    ProjectTeamEntity,
    MilestoneEntity,
    ProjectTaskEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    IdeaEntity,
    ClarificationEntity,
    ConfidenceLevel,
    ProjectStatus,
} from '../../../api/types';
import {
    Project,
    durationInDays,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    parseJson,
    isNotDeleted,
    getEdgeDataWithConfidence,
    type Metric,
} from './helpers';

export { Project } from '../../../api/types';

export async function getProjects(
): Promise<Project[]> {
    const rows =
        await GET<ProjectEntity[]>(
            'projects',
        );
    return rows
        .filter(isNotDeleted)
        .map(row => new Project(row));
}

// ── Project Detail ─────────────────

export interface ProjectDetail {
    id: string;
    title: string;
    description: string;
    status: ProjectStatus;
    progress: number;
    startDate: string;
    targetEndDate: string;
    projectLead: string;
    metrics: {
        time: {
            baseline: number;
            current: number;
        };
        cost: {
            baseline: number;
            current: number;
        };
        impact: {
            baseline: number;
            current: number;
        };
    };
    edge: {
        outcomes: {
            id: string;
            description: string;
            metrics: Metric[];
        }[];
        impact: {
            shortTerm: string;
            midTerm: string;
            longTerm: string;
        };
        confidence: ConfidenceLevel;
        owner: string;
    };
    team: {
        id: string;
        name: string;
        role: string;
    }[];
    milestones: {
        id: string;
        title: string;
        status: string;
        date: string;
    }[];
    versions: {
        id: string;
        version: string;
        date: string;
        changes: string;
        author: string;
    }[];
    discussions: {
        id: string;
        author: string;
        date: string;
        message: string;
    }[];
    tasks: {
        name: string;
        priority: string;
        description: string;
        skills: string[];
        duration: number;
        assigned: string;
    }[];
}

export async function getProjectById(
    projectId: string,
): Promise<ProjectDetail> {
    const [
        project, teamRows, milestoneRows,
        taskRows, discussionRows, versionRows,
        userMap,
    ] = await Promise.all([
        GET<ProjectEntity>(
            `projects/${projectId}`,
        ),
        GET<ProjectTeamEntity[]>(
            `projects/${projectId}/team`,
        ),
        GET<MilestoneEntity[]>(
            `projects/${projectId}/milestones`,
        ),
        GET<ProjectTaskEntity[]>(
            `projects/${projectId}/tasks`,
        ),
        GET<DiscussionEntity[]>(
            `projects/${projectId}/discussions`,
        ),
        GET<ProjectVersionEntity[]>(
            `projects/${projectId}/versions`,
        ),
        buildUserMap(),
    ]);

    const edgeData =
        await getEdgeDataWithConfidence(
            project.linked_idea_id
                || projectId,
        );

    return {
        id: project.id,
        title: project.title,
        description: project.description,
        status: project.status,
        progress: project.progress,
        startDate: project.start_date,
        targetEndDate:
            project.target_end_date,
        projectLead: userName(
            userMap,
            project.lead_id,
        ),
        metrics: {
            time: {
                baseline: durationInDays(
                    project.estimated_duration,
                ),
                current: durationInDays(
                    project.actual_duration,
                ),
            },
            cost: {
                baseline:
                    project.estimated_cost,
                current:
                    project.actual_cost,
            },
            impact: {
                baseline:
                    project.estimated_impact,
                current:
                    project.actual_impact,
            },
        },
        edge: edgeData,
        team: teamRows.map(member => ({
            id: member.user_id,
            name: userName(
                userMap,
                member.user_id,
            ),
            role: member.role,
        })),
        milestones: milestoneRows.map(m => ({
            id: m.id,
            title: m.title,
            status: m.status,
            date: m.date,
        })),
        versions: versionRows.map(v => ({
            id: v.id,
            version: v.version,
            date: v.date,
            changes: v.changes,
            author: userName(
                userMap,
                v.author_id,
            ),
        })),
        discussions: discussionRows.map(d => ({
            id: d.id,
            date: d.date,
            message: d.message,
            author: userName(
                userMap,
                d.author_id,
            ),
        })),
        tasks: taskRows.map(task => ({
            name: task.name,
            priority: task.priority,
            description: task.description,
            skills: parseJson<string[]>(
                task.skills,
                [],
            ),
            duration: durationInDays(
                task.duration,
            ),
            assigned: userName(
                userMap,
                task.assigned_to_id,
            ),
        })),
    };
}

// ── Engineering Requirements ──────────────

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
    team: {
        id: string;
        name: string;
        role: string;
        type: string;
    }[];
    linkedIdea: {
        id: string;
        title: string;
        score: number;
    };
    timeline: string;
    budget: string;
}

export async function getProjectForEngineering(
    projectId: string,
): Promise<EngineeringProject> {
    const [project, teamRows, userMap] =
        await Promise.all([
            GET<ProjectEntity>(
                `projects/${projectId}`,
            ),
            GET<ProjectTeamEntity[]>(
                `projects/${projectId}/team`,
            ),
            buildUserMap(),
        ]);

    const businessContext = parseJson<{
        problem?: string;
        expectedOutcome?: string;
        successMetrics?: string[];
        constraints?: string[];
    }>(project.business_context, {});

    const linkedIdea =
        project.linked_idea_id
            ? await GET<IdeaEntity | null>(
                `ideas/`
                    + project.linked_idea_id,
            )
            : null;

    return {
        id: project.id,
        title: project.title,
        description: project.description,
        businessContext: {
            problem:
                businessContext.problem || '',
            expectedOutcome:
                businessContext
                    .expectedOutcome || '',
            successMetrics:
                businessContext
                    .successMetrics || [],
            constraints:
                businessContext
                    .constraints || [],
        },
        team: teamRows.map(member => ({
            id: member.user_id,
            name: userName(
                userMap,
                member.user_id,
            ),
            role: member.role,
            type: member.type,
        })),
        linkedIdea: linkedIdea
            ? {
                id: linkedIdea.id,
                title: linkedIdea.title,
                score: linkedIdea.score,
            }
            : { id: '', title: '', score: 0 },
        timeline: project.timeline_label,
        budget: project.budget_label,
    };
}

export async function
getClarificationsByProjectId(
    projectId: string,
): Promise<Clarification[]> {
    const [clarificationRows, userMap] =
        await Promise.all([
            GET<ClarificationEntity[]>(
                `projects/${projectId}`
                    + `/clarifications`,
            ),
            buildUserMap(),
        ]);
    return clarificationRows.map(c => ({
        id: c.id,
        question: c.question,
        askedBy: userName(
            userMap,
            c.asked_by_id,
        ),
        askedAt: c.asked_at,
        status: c.status,
        ...(c.answer
            ? { answer: c.answer }
            : {}),
        ...(c.answered_by_id
            ? {
                answeredBy: userName(
                    userMap,
                    c.answered_by_id,
                ),
            }
            : {}),
        ...(c.answered_at
            ? { answeredAt: c.answered_at }
            : {}),
    }));
}

// ── Write Operations ─────────────────

export async function putProject(
    id: string,
    entity: Partial<ProjectEntity>,
): Promise<void> {
    await PUT(`projects/${id}`, entity);
}

export async function putMilestone(
    projectId: string,
    milestoneId: string,
    entity: Partial<MilestoneEntity>,
): Promise<void> {
    await PUT(
        `projects/${projectId}`
            + `/milestones/${milestoneId}`,
        entity,
    );
}
