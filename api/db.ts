import type {
    UserEntity,
    IdeaEntity,
    IdeaScoreEntity,
    IdeaScoreIdeaEntity,
    ProjectEntity,
    TeamMembershipEntity,
    TeamMembershipProjectEntity,
    TeamMembershipUserEntity,
    MilestoneEntity,
    MilestoneProjectEntity,
    ProjectTaskEntity,
    ProjectTaskProjectEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    ProjectVersionProjectEntity,
    EdgeEntity,
    EdgeOutcomeEntity,
    EdgeOutcomeEdgeEntity,
    EdgeMetricEntity,
    EdgeMetricOutcomeEntity,
    ActivityEntity,
    ClarificationEntity,
    ClarificationAnswerEntity,
    ClarificationAnswerClarificationEntity,
    CrunchColumnEntity,
    CrunchColumnAcronymEntity,
    CrunchColumnAcronymLinkEntity,
    FlowEntity,
    FlowStepEntity,
    CompanySettingsEntity,
    AccountEntity,
    IdeaSubmissionEntity,
    IdeaProjectLinkEntity,
    EdgeIdeaEntity,
    EdgeOwnershipEntity,
    TaskAssignmentEntity,
    DiscussionAuthorshipEntity,
    DiscussionProjectEntity,
    VersionAuthorshipEntity,
    ActivityActorEntity,
    ClarificationAskerEntity,
    ClarificationAnswererEntity,
    ClarificationProjectEntity,
    ProcessStepProcessEntity,
} from './types';

export interface EntityStore<T> {
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T | null>;
    put(id: string, fields: Partial<T>): Promise<T>;
    delete(id: string): Promise<void>;
}

export interface SingletonStore<T> {
    get(): Promise<T>;
    put(fields: Partial<T>): Promise<T>;
}

export interface DbAdapter {
    initialize(): Promise<void>;
    close(): Promise<void>;
    flush(): Promise<void>;
    deleteSchema(): Promise<void>;
    hasSchema(): Promise<boolean>;
    createSchema(): Promise<void>;
    exportSnapshot(): Promise<string>;
    importSnapshot(json: string): Promise<void>;

    users: EntityStore<UserEntity>;
    ideas: EntityStore<IdeaEntity>;
    ideaScores:
        EntityStore<IdeaScoreEntity>;
    ideaScoreIdeas:
        EntityStore<IdeaScoreIdeaEntity>;
    projects: EntityStore<ProjectEntity>;
    teamMemberships:
        EntityStore<TeamMembershipEntity>;
    teamMembershipProjects:
        EntityStore<
            TeamMembershipProjectEntity
        >;
    teamMembershipUsers:
        EntityStore<
            TeamMembershipUserEntity
        >;
    milestones:
        EntityStore<MilestoneEntity>;
    milestoneProjects:
        EntityStore<MilestoneProjectEntity>;
    projectTasks:
        EntityStore<ProjectTaskEntity>;
    projectTaskProjects:
        EntityStore<
            ProjectTaskProjectEntity
        >;
    discussions:
        EntityStore<DiscussionEntity>;
    discussionProjects:
        EntityStore<
            DiscussionProjectEntity
        >;
    projectVersions:
        EntityStore<ProjectVersionEntity>;
    projectVersionProjects:
        EntityStore<
            ProjectVersionProjectEntity
        >;
    edges: EntityStore<EdgeEntity>;
    edgeIdeas:
        EntityStore<EdgeIdeaEntity>;
    edgeOutcomes:
        EntityStore<EdgeOutcomeEntity>;
    edgeOutcomeEdges:
        EntityStore<
            EdgeOutcomeEdgeEntity
        >;
    edgeMetrics:
        EntityStore<EdgeMetricEntity>;
    edgeMetricOutcomes:
        EntityStore<
            EdgeMetricOutcomeEntity
        >;
    activities: EntityStore<ActivityEntity>;
    clarifications: EntityStore<ClarificationEntity>;
    clarificationAnswers: EntityStore<ClarificationAnswerEntity>;
    clarificationAnswerClarifications:
        EntityStore<
            ClarificationAnswerClarificationEntity
        >;
    clarificationProjects: EntityStore<ClarificationProjectEntity>;
    crunchColumns: EntityStore<CrunchColumnEntity>;
    crunchColumnAcronyms:
        EntityStore<CrunchColumnAcronymEntity>;
    crunchColumnAcronymLinks:
        EntityStore<
            CrunchColumnAcronymLinkEntity
        >;
    flows: EntityStore<FlowEntity>;
    flowSteps: EntityStore<FlowStepEntity>;
    processStepProcesses: EntityStore<ProcessStepProcessEntity>;
    companySettings: SingletonStore<CompanySettingsEntity>;
    account: SingletonStore<AccountEntity>;
    ideaSubmissions: EntityStore<IdeaSubmissionEntity>;
    ideaProjectLinks: EntityStore<IdeaProjectLinkEntity>;
    edgeOwnerships: EntityStore<EdgeOwnershipEntity>;
    taskAssignments: EntityStore<TaskAssignmentEntity>;
    discussionAuthorships: EntityStore<DiscussionAuthorshipEntity>;
    versionAuthorships: EntityStore<VersionAuthorshipEntity>;
    activityActors: EntityStore<ActivityActorEntity>;
    clarificationAskers: EntityStore<ClarificationAskerEntity>;
    clarificationAnswerers: EntityStore<ClarificationAnswererEntity>;
}
