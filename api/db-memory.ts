import { TABLE_NAMES } from './db.ts';
import type {
    DbAdapter,
    DeletedStore as IDeletedStore,
    SingletonStore as ISingletonStore,
    EntityStore as IEntityStore,
} from './db.ts';
import type {
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
import { MemoryStorageBackend }
    from './backend-memory.ts';
import { EntityStore } from './store-entity.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { SingletonStore } from './store-singleton.ts';
import { DeletedStore } from './store-deleted.ts';

export class MemoryDbAdapter implements DbAdapter {
    readonly #backend: MemoryStorageBackend;

    readonly workers: IEntityStore<HumanWorkerEntity>;
    readonly aiWorkers: IEntityStore<AIWorkerEntity>;
    readonly ideas: IEntityStore<IdeaEntity>;
    readonly projects: IEntityStore<ProjectEntity>;
    readonly activities: IEntityStore<ActivityEntity>;
    readonly flows: IEntityStore<FlowEntity>;
    readonly flowVersions:
        IEntityStore<FlowVersionEntity>;
    readonly projectFlows:
        IEntityStore<ProjectFlowEntity>;
    readonly workOrders: IEntityStore<WorkOrderEntity>;
    readonly flowWorkOrders:
        IEntityStore<FlowWorkOrderEntity>;
    readonly workOrderTransitions:
        IEntityStore<WorkOrderTransitionEntity>;
    readonly transitionFieldValues:
        IEntityStore<TransitionFieldValueEntity>;
    readonly workOrderClaims:
        IEntityStore<WorkOrderClaimEntity>;
    readonly organization:
        ISingletonStore<OrganizationEntity>;
    readonly ideaSubmissions:
        IEntityStore<IdeaSubmissionEntity>;
    readonly activityActors:
        IEntityStore<ActivityActorEntity>;
    readonly objectives: IEntityStore<Objective>;
    readonly objectiveRevisions:
        IEntityStore<ObjectiveRevision>;
    readonly deprecatedObjectives:
        IEntityStore<DeprecatedObjective>;
    readonly projectObjectiveBaselineScores:
        IEntityStore<ProjectObjectiveBaselineScore>;
    readonly projectObjectiveActualScores:
        IEntityStore<ProjectObjectiveActualScore>;
    readonly deleted: IDeletedStore;

    constructor() {
        this.#backend = new MemoryStorageBackend();
        const b = this.#backend;
        const ds = new DeletedStore(b);
        this.deleted = ds;
        this.organization =
            new SingletonStore<OrganizationEntity>(
                'organization', b,
            );

        this.workers =
            new EntityStore('workers', b, ds);
        this.aiWorkers =
            new EntityStore('ai_workers', b, ds);
        this.ideas =
            new EntityStore('ideas', b, ds);
        this.projects =
            new EntityStore('projects', b, ds);
        this.activities =
            new EntityStore('activities', b, ds);
        this.flows =
            new EntityStore('flows', b, ds);
        this.flowVersions =
            new HistoryEntityStore(
                'flow_versions', b,
            );
        this.projectFlows =
            new EntityStore('project_flows', b, ds);
        this.workOrders =
            new EntityStore('work_orders', b, ds);
        this.flowWorkOrders =
            new EntityStore(
                'flow_work_orders', b, ds,
            );
        this.workOrderTransitions =
            new EntityStore(
                'work_order_transitions', b, ds,
            );
        this.transitionFieldValues =
            new EntityStore(
                'transition_field_values', b, ds,
            );
        this.workOrderClaims =
            new EntityStore(
                'work_order_claims', b, ds,
            );
        this.ideaSubmissions =
            new EntityStore(
                'idea_submissions', b, ds,
            );
        this.activityActors =
            new EntityStore(
                'activity_actors', b, ds,
            );
        this.objectives =
            new EntityStore('objectives', b, ds);
        this.objectiveRevisions =
            new HistoryEntityStore(
                'objective_revisions', b,
            );
        this.deprecatedObjectives =
            new HistoryEntityStore(
                'deprecated_objectives', b,
            );
        this.projectObjectiveBaselineScores =
            new HistoryEntityStore(
                'project_objective_baseline_scores',
                b,
            );
        this.projectObjectiveActualScores =
            new HistoryEntityStore(
                'project_objective_actual_scores',
                b,
            );
    }

    async initialize(): Promise<void> {}
    async close(): Promise<void> {}
    async flush(): Promise<void> {}

    async hasSchema(): Promise<boolean> {
        return true;
    }

    async createSchema(): Promise<void> {
    }

    async deleteSchema(): Promise<void> {
        await this.#backend.clearAll();
    }

    async exportSnapshot(): Promise<string> {
        const obj: Record<string, unknown[]> = {};
        for (const table of TABLE_NAMES) {
            obj[table] = await this.#backend.read(table);
        }
        return JSON.stringify(obj);
    }

    async importSnapshot(json: string): Promise<void> {
        const obj = JSON.parse(json) as
            Record<string, { id: string }[]>;
        await this.#backend.clearAll();
        for (const table of TABLE_NAMES) {
            const rows = obj[table];
            if (rows) {
                await this.#backend.write(table, rows);
            }
        }
    }
}
