import { GET, PUT } from '../../../api/api';
import type {
    ProjectEntity,
    MilestoneEntity,
    ProjectTaskEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    IdeaEntity,
    ClarificationEntity,
    ConfidenceLevel,
    ProjectStatus,
    IdeaProjectLinkEntity,
    TaskAssignmentEntity,
    DiscussionAuthorshipEntity,
    VersionAuthorshipEntity,
    ClarificationAskerEntity,
    ClarificationAnswererEntity,
    ClarificationAnswerEntity,
    ClarificationAnswerClarificationEntity,
} from '../../../api/types';
import {
    Project,
    projectIsNotDeleted,
    durationInDays,
    nowUtc,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    parseJson,
    getEdgeDataWithConfidence,
    type Metric,
} from './helpers';

export { Project } from '../../../api/types';

interface TeamMemberRow {
    id: string;
    user_id: string;
    role: string;
    type: string;
}

function isTeamLead(
    m: { role: string },
): boolean {
    return m.role === 'lead';
}

export async function getProjects(
): Promise<Project[]> {
    const rows =
        await GET<ProjectEntity[]>(
            'projects',
        );
    return rows
        .filter(projectIsNotDeleted)
        .map(row => new Project(row));
}

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
    } | null;
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
        taskRows, discussionRows,
        versionRows, userMap,
        ideaProjectLinks,
        taskAssignments,
        discussionAuthors,
        versionAuthors,
    ] = await Promise.all([
        GET<ProjectEntity>(
            `projects/${projectId}`,
        ),
        GET<TeamMemberRow[]>(
            `projects/${projectId}/team`,
        ),
        GET<MilestoneEntity[]>(
            `projects/${projectId}`
                + `/milestones`,
        ),
        GET<ProjectTaskEntity[]>(
            `projects/${projectId}/tasks`,
        ),
        GET<DiscussionEntity[]>(
            `projects/${projectId}`
                + `/discussions`,
        ),
        GET<ProjectVersionEntity[]>(
            `projects/${projectId}`
                + `/versions`,
        ),
        buildUserMap(),
        GET<IdeaProjectLinkEntity[]>(
            'idea-project-links',
        ),
        GET<TaskAssignmentEntity[]>(
            'task-assignments',
        ),
        GET<DiscussionAuthorshipEntity[]>(
            'discussion-authorships',
        ),
        GET<VersionAuthorshipEntity[]>(
            'version-authorships',
        ),
    ]);

    const leadRow = teamRows.find(
        isTeamLead,
    );
    const link = ideaProjectLinks.find(
        l => l.project_id === projectId,
    );
    const taskAssignmentMap = new Map(
        taskAssignments.map(
            a => [a.task_id, a.user_id],
        ),
    );
    const discussionAuthorMap = new Map(
        discussionAuthors.map(
            a => [
                a.discussion_id,
                a.user_id,
            ],
        ),
    );
    const versionAuthorMap = new Map(
        versionAuthors.map(
            a => [
                a.version_id,
                a.user_id,
            ],
        ),
    );

    const edgeData =
        await getEdgeDataWithConfidence(
            link?.idea_id || projectId,
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
            leadRow?.user_id,
        ),
        metrics: {
            time: {
                baseline: durationInDays(
                    project
                        .estimated_duration,
                ),
                current: durationInDays(
                    project
                        .actual_duration,
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
                    project
                        .estimated_impact,
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
        milestones:
            milestoneRows.map(m => ({
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
                versionAuthorMap.get(
                    v.id,
                )!,
            ),
        })),
        discussions:
            discussionRows.map(d => ({
                id: d.id,
                date: d.date,
                message: d.message,
                author: userName(
                    userMap,
                    discussionAuthorMap.get(
                        d.id,
                    )!,
                ),
            })),
        tasks: taskRows.map(task => ({
            name: task.name,
            priority: task.priority,
            description:
                task.description,
            skills: parseJson<string[]>(
                task.skills,
                [],
            ),
            duration: durationInDays(
                task.duration,
            ),
            assigned: userName(
                userMap,
                taskAssignmentMap.get(
                    task.id,
                ),
            ),
        })),
    };
}

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
    } | null;
    timeline: string;
    budget: string;
}

export async function
getProjectForEngineering(
    projectId: string,
): Promise<EngineeringProject> {
    const [
        project, teamRows, userMap,
        ideaProjectLinks,
    ] = await Promise.all([
        GET<ProjectEntity>(
            `projects/${projectId}`,
        ),
        GET<TeamMemberRow[]>(
            `projects/${projectId}/team`,
        ),
        buildUserMap(),
        GET<IdeaProjectLinkEntity[]>(
            'idea-project-links',
        ),
    ]);

    const businessContext = parseJson<{
        problem?: string;
        expectedOutcome?: string;
        successMetrics?: string[];
        constraints?: string[];
    }>(project.business_context, {});

    const link = ideaProjectLinks.find(
        l => l.project_id === projectId,
    );
    const linkedIdea = link
        ? await GET<IdeaEntity | null>(
            `ideas/${link.idea_id}`,
        )
        : null;

    return {
        id: project.id,
        title: project.title,
        description:
            project.description,
        businessContext: {
            problem:
                businessContext.problem
                    ?? '',
            expectedOutcome:
                businessContext
                    .expectedOutcome
                    ?? '',
            successMetrics:
                businessContext
                    .successMetrics
                    ?? [],
            constraints:
                businessContext
                    .constraints ?? [],
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
            : null,
        timeline:
            project.timeline_label,
        budget: project.budget_label,
    };
}

export async function
getClarificationsByProjectId(
    projectId: string,
): Promise<Clarification[]> {
    const [
        clarificationRows, userMap,
        askers, answerers,
        answers, answerLinks,
    ] = await Promise.all([
        GET<ClarificationEntity[]>(
            `projects/${projectId}`
                + `/clarifications`,
        ),
        buildUserMap(),
        GET<ClarificationAskerEntity[]>(
            'clarification-askers',
        ),
        GET<ClarificationAnswererEntity[]>(
            'clarification-answerers',
        ),
        GET<ClarificationAnswerEntity[]>(
            'clarification-answers',
        ),
        GET<
            ClarificationAnswerClarificationEntity[]
        >(
            'clarification-answer'
            + '-clarifications',
        ),
    ]);
    const askerMap = new Map(
        askers.map(
            a => [
                a.clarification_id,
                a.user_id,
            ],
        ),
    );
    const answererMap = new Map(
        answerers.map(
            a => [
                a.clarification_id,
                a.user_id,
            ],
        ),
    );
    const answerMap = new Map(
        answers.map(
            a => [a.id, a.answer],
        ),
    );
    const answerLinkMap = new Map(
        answerLinks.map(
            l => [
                l.clarification_id,
                l,
            ],
        ),
    );
    return clarificationRows.map(c => {
        const answererId =
            answererMap.get(c.id);
        const answerLink =
            answerLinkMap.get(c.id);
        const answerText = answerLink
            ? answerMap.get(
                answerLink
                    .clarification_answer_id,
            )
            : undefined;
        return {
            id: c.id,
            question: c.question,
            askedBy: userName(
                userMap,
                askerMap.get(c.id),
            ),
            askedAt: c.asked_at,
            status: c.status,
            ...(answerText
                ? { answer: answerText }
                : {}),
            ...(answererId
                ? {
                    answeredBy: userName(
                        userMap,
                        answererId,
                    ),
                }
                : {}),
            ...(answerLink
                ? {
                    answeredAt:
                        answerLink.created_at,
                }
                : {}),
        };
    });
}

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

export async function
putProjectTeamMember(
    projectId: string,
    userId: string,
    role: string,
    type: string,
): Promise<void> {
    await PUT(
        `projects/${projectId}`
            + `/team/${userId}`,
        { role, type },
    );
}

export async function
putIdeaProjectLink(
    ideaId: string,
    projectId: string,
): Promise<void> {
    await PUT(
        `idea-project-links/`
            + crypto.randomUUID(),
        {
            idea_id: ideaId,
            project_id: projectId,
            created_at: nowUtc(),
        },
    );
}
