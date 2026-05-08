import type {
    Id,
    PersonEntity,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    RoleEntity,
    RoleMembershipEntity,
    CrewEntity,
    CrewRoleMembershipEntity,
    ModelEntity,
    RoleModelMembershipEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    TransitionFieldValueEntity,
} from './types.ts';

export class EntityNotFound {
    readonly message: string;
    readonly table: string;
    readonly id: string;
    constructor(
        table: string,
        id: string,
    ) {
        this.table = table;
        this.id = id;
        this.message =
            `Not found: ${table}/${id}`;
    }
}

export class MissingTableError extends Error {
    readonly table: string;
    constructor(table: string) {
        super(
            `Schema is missing table "${table}".`
            + ' Recreate the schema from snapshots.',
        );
        this.table = table;
        this.name = 'MissingTableError';
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

    people:
        EntityStore<PersonEntity>;
    ideas:
        EntityStore<IdeaEntity>;
    projects:
        EntityStore<ProjectEntity>;
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
    transitionFieldValues:
        EntityStore<
            TransitionFieldValueEntity
        >;
    workOrderClaims:
        EntityStore<
            WorkOrderClaimEntity
        >;
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
    roles:
        EntityStore<RoleEntity>;
    roleMemberships:
        EntityStore<
            RoleMembershipEntity
        >;
    crews:
        EntityStore<CrewEntity>;
    crewRoleMemberships:
        EntityStore<
            CrewRoleMembershipEntity
        >;
    models:
        EntityStore<ModelEntity>;
    roleModelMemberships:
        EntityStore<
            RoleModelMembershipEntity
        >;
    deleted: DeletedStore;
}

export const TABLE_NAMES = [
    'people',
    'ideas',
    'projects',
    'activities',
    'flows',
    'flow_versions',
    'project_flows',
    'work_orders',
    'flow_work_orders',
    'work_order_transitions',
    'transition_field_values',
    'work_order_claims',
    'organization',
    'idea_submissions',
    'activity_actors',
    'roles',
    'role_memberships',
    'crews',
    'crew_role_memberships',
    'models',
    'role_model_memberships',
    'deleted',
];
