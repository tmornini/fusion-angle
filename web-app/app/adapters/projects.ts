import { GET, PUT } from '../../../api/api';
import type {
    ProjectEntity,
    MilestoneEntity,
    ProjectTaskEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    IdeaEntity,
    ClarificationEntity,
    ProjectStatus,
    TaskPriority,
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
    COST_DIVISOR,
} from '../../../api/types';
import {
    buildUserMap,
    userName,
    parseJson,
    getEdgeDataWithConfidence,
    type EdgeData,
    type Metric,
} from './helpers';

export {
    Project,
    type ProjectStatus,
} from '../../../api/types';
export type { EdgeData, Metric };

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

export interface DetailTeamMember {
    readonly id: string;
    readonly name: string;
    readonly role: string;
}

export interface DetailMilestone {
    readonly id: string;
    readonly title: string;
    readonly status: string;
    readonly date: string;
}

export interface DetailVersion {
    readonly id: string;
    readonly version: string;
    readonly date: string;
    readonly changes: string;
    readonly author: string;
}

export interface DetailDiscussion {
    readonly id: string;
    readonly author: string;
    readonly date: string;
    readonly message: string;
}

export interface DetailTask {
    readonly name: string;
    readonly priority: TaskPriority;
    readonly description: string;
    readonly skills: readonly string[];
    readonly duration: number;
    readonly assigned: string;
}

export class ProjectView {
    private readonly project: Project;
    readonly projectLead: string;
    readonly edge: EdgeData | null;
    readonly team:
        readonly DetailTeamMember[];
    readonly milestones:
        readonly DetailMilestone[];
    readonly versions:
        readonly DetailVersion[];
    readonly discussions:
        readonly DetailDiscussion[];
    readonly tasks:
        readonly DetailTask[];

    constructor(
        project: Project,
        projectLead: string,
        edge: EdgeData | null,
        team: readonly DetailTeamMember[],
        milestones:
            readonly DetailMilestone[],
        versions:
            readonly DetailVersion[],
        discussions:
            readonly DetailDiscussion[],
        tasks: readonly DetailTask[],
    ) {
        this.project = project;
        this.projectLead = projectLead;
        this.edge = edge;
        this.team = team;
        this.milestones = milestones;
        this.versions = versions;
        this.discussions = discussions;
        this.tasks = tasks;
    }

    get id(): string {
        return this.project.id;
    }

    get title(): string {
        return this.project.title;
    }

    get description(): string {
        return this.project.description;
    }

    get status(): ProjectStatus {
        return this.project.status;
    }

    get progress(): number {
        return this.project.progress;
    }

    get startDate(): string {
        return this.project.startDate;
    }

    get targetEndDate(): string {
        return this.project.targetEndDate;
    }

    statusLabel(): string {
        return this.project.statusLabel();
    }

    statusClassName(): string {
        return this.project
            .statusClassName();
    }

    timeBaselineDays(): number {
        return this.project
            .estimatedDurationDays();
    }

    timeCurrentDays(): number {
        return this.project
            .actualDurationDays();
    }

    costBaselineK(): number {
        return this.project.estimatedCost
            / COST_DIVISOR;
    }

    costCurrentK(): number {
        return this.project.actualCost
            / COST_DIVISOR;
    }

    impactBaseline(): number {
        return this.project
            .estimatedImpact;
    }

    impactCurrent(): number {
        return this.project.actualImpact;
    }

    assignedTaskCount(): number {
        return this.tasks.filter(
            t => t.assigned,
        ).length;
    }

    unassignedTaskCount(): number {
        return this.tasks.filter(
            t => !t.assigned,
        ).length;
    }
}

export async function getProjectById(
    projectId: string,
): Promise<ProjectView> {
    const [
        entity, teamRows, milestoneRows,
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

    const project = new Project(entity);
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

    return new ProjectView(
        project,
        userName(
            userMap, leadRow?.user_id,
        ),
        edgeData,
        teamRows.map(member => ({
            id: member.user_id,
            name: userName(
                userMap,
                member.user_id,
            ),
            role: member.role,
        })),
        milestoneRows.map(m => ({
            id: m.id,
            title: m.title,
            status: m.status,
            date: m.date,
        })),
        versionRows.map(v => ({
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
        taskRows.map(task => ({
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
    );
}

export class Clarification {
    readonly id: string;
    private readonly question: string;
    private readonly askedBy: string;
    private readonly askedAt: string;
    readonly status:
        'pending' | 'answered';
    private readonly answer:
        string | undefined;
    private readonly answeredBy:
        string | undefined;
    private readonly answeredAt:
        string | undefined;

    constructor(data: {
        id: string;
        question: string;
        askedBy: string;
        askedAt: string;
        status: 'pending' | 'answered';
        answer?: string;
        answeredBy?: string;
        answeredAt?: string;
    }) {
        this.id = data.id;
        this.question = data.question;
        this.askedBy = data.askedBy;
        this.askedAt = data.askedAt;
        this.status = data.status;
        this.answer = data.answer;
        this.answeredBy = data.answeredBy;
        this.answeredAt = data.answeredAt;
    }

    questionText(): string {
        return this.question;
    }

    askerName(): string {
        return this.askedBy;
    }

    askedAtDate(): string {
        return this.askedAt;
    }

    hasAnswer(): boolean {
        return this.answer !== undefined;
    }

    answerText(): string {
        return this.answer!;
    }

    answeredByName(): string {
        return this.answeredBy!;
    }

    answeredAtDate(): string {
        return this.answeredAt!;
    }
}

export interface EngTeamMember {
    readonly id: string;
    readonly name: string;
    readonly role: string;
    readonly type: string;
}

export interface LinkedIdea {
    readonly id: string;
    readonly title: string;
}

interface BusinessContext {
    readonly problem: string;
    readonly expectedOutcome: string;
    readonly successMetrics:
        readonly string[];
    readonly constraints:
        readonly string[];
}

export class EngineeringView {
    private readonly project: Project;
    private readonly context:
        BusinessContext;
    private readonly team:
        readonly EngTeamMember[];
    private readonly idea:
        LinkedIdea | null;

    constructor(
        project: Project,
        context: BusinessContext,
        team: readonly EngTeamMember[],
        linkedIdea: LinkedIdea | null,
    ) {
        this.project = project;
        this.context = context;
        this.team = team;
        this.idea = linkedIdea;
    }

    get id(): string {
        return this.project.id;
    }

    get title(): string {
        return this.project.title;
    }

    get description(): string {
        return this.project.description;
    }

    timeline(): string {
        return this.project
            .timelineLabel;
    }

    budget(): string {
        return this.project.budgetLabel;
    }

    problemStatement(): string {
        return this.context.problem;
    }

    expectedOutcome(): string {
        return this.context
            .expectedOutcome;
    }

    successMetrics(): readonly string[] {
        return this.context
            .successMetrics;
    }

    constraints(): readonly string[] {
        return this.context.constraints;
    }

    teamMembers():
        readonly EngTeamMember[] {
        return this.team;
    }

    hasLinkedIdea(): boolean {
        return this.idea !== null;
    }

    linkedIdeaHref(): string {
        return '../idea-convert/'
            + 'index.html'
            + '?ideaId='
            + this.idea!.id;
    }

    linkedIdeaTitle(): string {
        return this.idea!.title;
    }
}

export async function
getProjectForEngineering(
    projectId: string,
): Promise<EngineeringView> {
    const [
        entity, teamRows, userMap,
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

    const project = new Project(entity);
    const context = parseJson<{
        problem: string;
        expectedOutcome: string;
        successMetrics: string[];
        constraints: string[];
    }>(entity.business_context, {
        problem: '',
        expectedOutcome: '',
        successMetrics: [],
        constraints: [],
    });

    const link = ideaProjectLinks.find(
        l => l.project_id === projectId,
    );
    const ideaEntity = link
        ? await GET<IdeaEntity | null>(
            `ideas/${link.idea_id}`,
        )
        : null;

    return new EngineeringView(
        project,
        context,
        teamRows.map(member => ({
            id: member.user_id,
            name: userName(
                userMap,
                member.user_id,
            ),
            role: member.role,
            type: member.type,
        })),
        ideaEntity
            ? {
                id: ideaEntity.id,
                title: ideaEntity.title,
            }
            : null,
    );
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
        return new Clarification({
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
        });
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
