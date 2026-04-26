import type {
    Id,
    UserEntity,
    IdeaEntity,
    ProjectEntity,
    TeamEntity,
    TeamProjectEntity,
    TeamUserEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    CompanyEntity,
    OrganizationEntity,
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

export interface EntityStore<
    T extends { id: string },
> {
    getAll(): Promise<T[]>;
    getById(id: string): Promise<T>;
    put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T>;
    delete(id: string): Promise<void>;
}

export interface SingletonStore<
    T extends { id: string },
> {
    get(): Promise<T>;
    put(fields: Omit<T, 'id'>): Promise<T>;
}

export interface DeletedStore {
    isDeleted(id: Id): Promise<boolean>;
    record(id: Id): Promise<void>;
    allDeletedIds(): Promise<Set<Id>>;
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
    teams:
        EntityStore<
            TeamEntity
        >;
    teamProjects:
        EntityStore<
            TeamProjectEntity
        >;
    teamUsers:
        EntityStore<
            TeamUserEntity
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
    company:
        SingletonStore<CompanyEntity>;
    organization:
        SingletonStore<OrganizationEntity>;
    ideaSubmissions:
        EntityStore<
            IdeaSubmissionEntity
        >;
    activityActors:
        EntityStore<
            ActivityActorEntity
        >;
    deleted: DeletedStore;
}
