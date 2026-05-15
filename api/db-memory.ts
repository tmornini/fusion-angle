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
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    TransitionFieldValueEntity,
    WorkOrderClaimEntity,
    Objective,
    ObjectiveRevision,
    DeprecatedObjective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
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
    workers: Map<string, HumanWorkerEntity>;
    aiWorkers: Map<string, AIWorkerEntity>;
    ideas: Map<string, IdeaEntity>;
    projects: Map<string, ProjectEntity>;
    activities: Map<string, ActivityEntity>;
    flows: Map<string, FlowEntity>;
    flowVersions: Map<
        string, FlowVersionEntity
    >;
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
    transitionFieldValues: Map<
        string, TransitionFieldValueEntity
    >;
    workOrderClaims: Map<
        string, WorkOrderClaimEntity
    >;
    objectives: Map<string, Objective>;
    objectiveRevisions: Map<
        string, ObjectiveRevision
    >;
    deprecatedObjectives: Map<
        string, DeprecatedObjective
    >;
    projectObjectiveBaselineScores: Map<
        string, ProjectObjectiveBaselineScore
    >;
    projectObjectiveActualScores: Map<
        string, ProjectObjectiveActualScore
    >;
    deleted: Map<string, Deleted>;
}

export class MemoryDbAdapter
    implements DbAdapter
{
    #tables: Tables | null = null;
    readonly #deletedStore: MemDeletedStore;
    readonly workers:
        EntityStore<HumanWorkerEntity>;
    readonly aiWorkers:
        EntityStore<AIWorkerEntity>;
    readonly ideas:
        EntityStore<IdeaEntity>;
    readonly projects:
        EntityStore<ProjectEntity>;
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
    readonly transitionFieldValues:
        EntityStore<
            TransitionFieldValueEntity
        >;
    readonly workOrderClaims:
        EntityStore<WorkOrderClaimEntity>;
    readonly organization:
        SingletonStore<OrganizationEntity>;
    readonly ideaSubmissions:
        EntityStore<IdeaSubmissionEntity>;
    readonly activityActors:
        EntityStore<ActivityActorEntity>;
    readonly objectives:
        EntityStore<Objective>;
    readonly objectiveRevisions:
        EntityStore<ObjectiveRevision>;
    readonly deprecatedObjectives:
        EntityStore<DeprecatedObjective>;
    readonly projectObjectiveBaselineScores:
        EntityStore<
            ProjectObjectiveBaselineScore
        >;
    readonly projectObjectiveActualScores:
        EntityStore<
            ProjectObjectiveActualScore
        >;
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
        this.workers =
            new MemEntityStore(
                'workers', t.workers, ds,
            );
        this.aiWorkers =
            new MemEntityStore(
                'ai_workers', t.aiWorkers, ds,
            );
        this.ideas =
            new MemEntityStore(
                'ideas', t.ideas, ds,
            );
        this.projects =
            new MemEntityStore(
                'projects', t.projects, ds,
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
        this.transitionFieldValues =
            new MemEntityStore(
                'transition_field_values',
                t.transitionFieldValues, ds,
            );
        this.workOrderClaims =
            new MemEntityStore(
                'work_order_claims',
                t.workOrderClaims, ds,
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
        this.objectives =
            new MemEntityStore(
                'objectives',
                t.objectives, ds,
            );
        this.objectiveRevisions =
            new MemEntityStore(
                'objective_revisions',
                t.objectiveRevisions, ds,
            );
        this.deprecatedObjectives =
            new MemEntityStore(
                'deprecated_objectives',
                t.deprecatedObjectives, ds,
            );
        this.projectObjectiveBaselineScores =
            new MemEntityStore(
                'project_objective_baseline_scores',
                t.projectObjectiveBaselineScores,
                ds,
            );
        this.projectObjectiveActualScores =
            new MemEntityStore(
                'project_objective_actual_scores',
                t.projectObjectiveActualScores,
                ds,
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
        workers: new Map(),
        aiWorkers: new Map(),
        ideas: new Map(),
        projects: new Map(),
        activities: new Map(),
        flows: new Map(),
        flowVersions: new Map(),
        organization: new Map(),
        ideaSubmissions: new Map(),
        activityActors: new Map(),
        projectFlows: new Map(),
        workOrders: new Map(),
        flowWorkOrders: new Map(),
        workOrderTransitions: new Map(),
        transitionFieldValues: new Map(),
        workOrderClaims: new Map(),
        objectives: new Map(),
        objectiveRevisions: new Map(),
        deprecatedObjectives: new Map(),
        projectObjectiveBaselineScores: new Map(),
        projectObjectiveActualScores: new Map(),
        deleted: new Map(),
    };
}
