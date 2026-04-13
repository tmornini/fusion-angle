import type {
    UserEntity,
    IdeaEntity,
    ProjectEntity,
    TeamMembershipEntity,
    TeamMembershipProjectEntity,
    TeamMembershipUserEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    CompanySettingsEntity,
    AccountEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
} from './types';

export class EntityNotFound {
    readonly message: string;
    constructor(
        readonly table: string,
        readonly id: string,
    ) {
        this.message =
            `Not found: ${table}/${id}`;
    }
}

export interface EntityStore<T> {
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T>;
    put(
        id: string,
        fields: Partial<T>,
    ): Promise<T>;
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
    exportSnapshot():
        Promise<string>;
    importSnapshot(
        json: string,
    ): Promise<void>;

    users:
        EntityStore<UserEntity>;
    ideas:
        EntityStore<IdeaEntity>;
    projects:
        EntityStore<ProjectEntity>;
    teamMemberships:
        EntityStore<
            TeamMembershipEntity
        >;
    teamMembershipProjects:
        EntityStore<
            TeamMembershipProjectEntity
        >;
    teamMembershipUsers:
        EntityStore<
            TeamMembershipUserEntity
        >;
    activities:
        EntityStore<ActivityEntity>;
    flows:
        EntityStore<FlowEntity>;
    flowVersions:
        EntityStore<FlowVersionEntity>;
    projectFlows:
        EntityStore<
            ProjectFlowEntity
        >;
    workOrders:
        EntityStore<
            WorkOrderEntity
        >;
    flowWorkOrders:
        EntityStore<
            FlowWorkOrderEntity
        >;
    workOrderTransitions:
        EntityStore<
            WorkOrderTransitionEntity
        >;
    workOrderClaims:
        EntityStore<
            WorkOrderClaimEntity
        >;
    companySettings:
        SingletonStore<
            CompanySettingsEntity
        >;
    account:
        SingletonStore<AccountEntity>;
    ideaSubmissions:
        EntityStore<
            IdeaSubmissionEntity
        >;
    activityActors:
        EntityStore<
            ActivityActorEntity
        >;
}
