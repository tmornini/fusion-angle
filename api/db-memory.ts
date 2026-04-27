import {
    EntityNotFound,
    MissingTableError,
} from './db.ts';
import type {
    DbAdapter,
    DeletedStore,
    EntityStore,
    SingletonStore,
} from './db.ts';
import type {
    Deleted,
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
} from './types.ts';
import { nowUtc, type Id } from './types.ts';

class MemEntityStore<T extends { id: string }>
    implements EntityStore<T>
{
    readonly #table: string;
    readonly #data: Map<string, T>;
    readonly #deleted: MemDeletedStore;

    constructor(
        table: string,
        data: Map<string, T>,
        deleted: MemDeletedStore,
    ) {
        this.#table = table;
        this.#data = data;
        this.#deleted = deleted;
    }

    async getAll(): Promise<T[]> {
        const all = [...this.#data.values()];
        const deletedIds =
            await this.#deleted.allDeletedIds();
        return all.filter(
            r => !deletedIds.has(r.id),
        );
    }

    async getById(id: string): Promise<T> {
        const row = this.#data.get(id);
        const deletedIds =
            await this.#deleted.allDeletedIds();
        if (!row || deletedIds.has(id)) {
            throw new EntityNotFound(
                this.#table, id,
            );
        }
        return row;
    }

    async put(
        id: string,
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        const next = {
            ...fields, id,
        } as unknown as T;
        this.#data.set(id, next);
        return next;
    }

    async delete(id: string): Promise<void> {
        await this.#deleted.record(id);
    }
}

class MemSingletonStore<
    T extends { id: string },
> implements SingletonStore<T>
{
    readonly #table: string;
    readonly #data: Map<string, T>;

    constructor(
        table: string,
        data: Map<string, T>,
    ) {
        this.#table = table;
        this.#data = data;
    }

    async get(): Promise<T> {
        const all = [...this.#data.values()];
        if (all.length === 0) {
            throw new EntityNotFound(
                this.#table, '<singleton>',
            );
        }
        return all[0]!;
    }

    async put(
        fields: Omit<T, 'id'>,
    ): Promise<T> {
        const existing =
            [...this.#data.values()][0];
        const id = existing?.id ?? 'singleton';
        const next = {
            ...fields, id,
        } as unknown as T;
        this.#data.clear();
        this.#data.set(id, next);
        return next;
    }
}

class MemDeletedStore implements DeletedStore {
    readonly #data: Map<string, Deleted>;

    constructor(data: Map<string, Deleted>) {
        this.#data = data;
    }

    async isDeleted(id: Id): Promise<boolean> {
        return this.#data.has(id);
    }

    async record(id: Id): Promise<void> {
        this.#data.set(id, {
            id, deleted_at: nowUtc(),
        });
    }

    async allDeletedIds(): Promise<Set<Id>> {
        return new Set(this.#data.keys());
    }
}

interface Tables {
    users: Map<string, UserEntity>;
    ideas: Map<string, IdeaEntity>;
    projects: Map<string, ProjectEntity>;
    teams: Map<string, TeamEntity>;
    teamProjects: Map<
        string, TeamProjectEntity
    >;
    teamUsers: Map<string, TeamUserEntity>;
    activities: Map<string, ActivityEntity>;
    flows: Map<string, FlowEntity>;
    flowVersions: Map<
        string, FlowVersionEntity
    >;
    company: Map<string, CompanyEntity>;
    organization: Map<
        string, OrganizationEntity
    >;
    ideaSubmissions: Map<
        string, IdeaSubmissionEntity
    >;
    activityActors: Map<
        string, ActivityActorEntity
    >;
    projectFlows: Map<
        string, ProjectFlowEntity
    >;
    workOrders: Map<string, WorkOrderEntity>;
    flowWorkOrders: Map<
        string, FlowWorkOrderEntity
    >;
    workOrderTransitions: Map<
        string, WorkOrderTransitionEntity
    >;
    workOrderClaims: Map<
        string, WorkOrderClaimEntity
    >;
    deleted: Map<string, Deleted>;
}

export class MemoryDbAdapter
    implements DbAdapter
{
    #tables: Tables | null = null;
    readonly #deletedStore: MemDeletedStore;
    readonly users:
        EntityStore<UserEntity>;
    readonly ideas:
        EntityStore<IdeaEntity>;
    readonly projects:
        EntityStore<ProjectEntity>;
    readonly teams:
        EntityStore<TeamEntity>;
    readonly teamProjects:
        EntityStore<TeamProjectEntity>;
    readonly teamUsers:
        EntityStore<TeamUserEntity>;
    readonly activities:
        EntityStore<ActivityEntity>;
    readonly flows:
        EntityStore<FlowEntity>;
    readonly flowVersions:
        EntityStore<FlowVersionEntity>;
    readonly projectFlows:
        EntityStore<ProjectFlowEntity>;
    readonly workOrders:
        EntityStore<WorkOrderEntity>;
    readonly flowWorkOrders:
        EntityStore<FlowWorkOrderEntity>;
    readonly workOrderTransitions:
        EntityStore<
            WorkOrderTransitionEntity
        >;
    readonly workOrderClaims:
        EntityStore<WorkOrderClaimEntity>;
    readonly company:
        SingletonStore<CompanyEntity>;
    readonly organization:
        SingletonStore<OrganizationEntity>;
    readonly ideaSubmissions:
        EntityStore<IdeaSubmissionEntity>;
    readonly activityActors:
        EntityStore<ActivityActorEntity>;
    readonly deleted: DeletedStore;

    constructor() {
        this.#tables = buildTables();
        this.#deletedStore =
            new MemDeletedStore(
                this.#tables.deleted,
            );
        this.deleted = this.#deletedStore;
        const t = this.#tables;
        const ds = this.#deletedStore;
        this.users =
            new MemEntityStore(
                'users', t.users, ds,
            );
        this.ideas =
            new MemEntityStore(
                'ideas', t.ideas, ds,
            );
        this.projects =
            new MemEntityStore(
                'projects', t.projects, ds,
            );
        this.teams =
            new MemEntityStore(
                'teams', t.teams, ds,
            );
        this.teamProjects =
            new MemEntityStore(
                'team_projects',
                t.teamProjects, ds,
            );
        this.teamUsers =
            new MemEntityStore(
                'team_users',
                t.teamUsers, ds,
            );
        this.activities =
            new MemEntityStore(
                'activities',
                t.activities, ds,
            );
        this.flows =
            new MemEntityStore(
                'flows', t.flows, ds,
            );
        this.flowVersions =
            new MemEntityStore(
                'flow_versions',
                t.flowVersions, ds,
            );
        this.projectFlows =
            new MemEntityStore(
                'project_flows',
                t.projectFlows, ds,
            );
        this.workOrders =
            new MemEntityStore(
                'work_orders',
                t.workOrders, ds,
            );
        this.flowWorkOrders =
            new MemEntityStore(
                'flow_work_orders',
                t.flowWorkOrders, ds,
            );
        this.workOrderTransitions =
            new MemEntityStore(
                'work_order_transitions',
                t.workOrderTransitions, ds,
            );
        this.workOrderClaims =
            new MemEntityStore(
                'work_order_claims',
                t.workOrderClaims, ds,
            );
        this.company =
            new MemSingletonStore(
                'company', t.company,
            );
        this.organization =
            new MemSingletonStore(
                'organization',
                t.organization,
            );
        this.ideaSubmissions =
            new MemEntityStore(
                'idea_submissions',
                t.ideaSubmissions, ds,
            );
        this.activityActors =
            new MemEntityStore(
                'activity_actors',
                t.activityActors, ds,
            );
    }

    async initialize(): Promise<void> {}
    async close(): Promise<void> {}
    async flush(): Promise<void> {}

    async hasSchema(): Promise<boolean> {
        return this.#tables !== null;
    }

    async createSchema(): Promise<void> {
        if (this.#tables === null) {
            this.#tables = buildTables();
        }
    }

    async deleteSchema(): Promise<void> {
        if (this.#tables) {
            for (
                const m
                    of Object.values(
                        this.#tables,
                    )
            ) {
                m.clear();
            }
        }
    }

    async exportSnapshot(
    ): Promise<string> {
        if (!this.#tables) return '{}';
        const obj: Record<string, unknown> = {};
        for (
            const [name, m]
                of Object.entries(this.#tables)
        ) {
            obj[name] = [...m.values()];
        }
        return JSON.stringify(obj);
    }

    async importSnapshot(
        json: string,
    ): Promise<void> {
        const obj = JSON.parse(json) as
            Record<string, { id: string }[]>;
        if (!this.#tables) {
            this.#tables = buildTables();
        }
        for (
            const [name, rows]
                of Object.entries(obj)
        ) {
            const tablesUnknown =
                this.#tables as unknown;
            const tablesAsMap =
                tablesUnknown as Record<
                    string,
                    Map<string, { id: string }>
                >;
            const m = tablesAsMap[name];
            if (!m) continue;
            m.clear();
            for (const row of rows) {
                m.set(row.id, row);
            }
        }
    }
}

function buildTables(): Tables {
    return {
        users: new Map(),
        ideas: new Map(),
        projects: new Map(),
        teams: new Map(),
        teamProjects: new Map(),
        teamUsers: new Map(),
        activities: new Map(),
        flows: new Map(),
        flowVersions: new Map(),
        company: new Map(),
        organization: new Map(),
        ideaSubmissions: new Map(),
        activityActors: new Map(),
        projectFlows: new Map(),
        workOrders: new Map(),
        flowWorkOrders: new Map(),
        workOrderTransitions: new Map(),
        workOrderClaims: new Map(),
        deleted: new Map(),
    };
}
