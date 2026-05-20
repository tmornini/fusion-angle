import { TABLE_NAMES } from './db.ts';
import type {
    DbAdapter,
    SingletonStore as ISingletonStore,
    EntityStore as IEntityStore,
    StateStore as IStateStore,
} from './db.ts';
import type {
    HumanWorkerEntity,
    AIWorkerEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    Objective,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from './types.ts';
import { MemoryStorageBackend }
    from './backend-memory.ts';
import { EntityStore } from './store-entity.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { SingletonStore } from './store-singleton.ts';
import { StateStore } from './store-state.ts';

export class MemoryDbAdapter implements DbAdapter {
    readonly #backend: MemoryStorageBackend;

    readonly workers: IEntityStore<HumanWorkerEntity>;
    readonly aiWorkers: IEntityStore<AIWorkerEntity>;
    readonly ideas: IEntityStore<IdeaEntity>;
    readonly projects: IEntityStore<ProjectEntity>;
    readonly flows: IEntityStore<FlowEntity>;
    readonly flowVersions:
        IEntityStore<FlowVersionEntity>;
    readonly projectFlows:
        IEntityStore<ProjectFlowEntity>;
    readonly workOrders: IEntityStore<WorkOrderEntity>;
    readonly flowWorkOrders:
        IEntityStore<FlowWorkOrderEntity>;
    readonly stateFieldValues:
        IEntityStore<StateFieldValueEntity>;
    readonly organization:
        ISingletonStore<OrganizationEntity>;
    readonly ideaSubmissions:
        IEntityStore<IdeaSubmissionEntity>;
    readonly objectives: IEntityStore<Objective>;
    readonly objectiveRevisions:
        IEntityStore<ObjectiveRevision>;
    readonly projectObjectiveBaselineScores:
        IEntityStore<ProjectObjectiveBaselineScore>;
    readonly projectObjectiveActualScores:
        IEntityStore<ProjectObjectiveActualScore>;
    readonly states: IStateStore;

    constructor() {
        this.#backend = new MemoryStorageBackend();
        const backend = this.#backend;
        const stateStore = new StateStore(
            backend, 'states',
        );
        this.states = stateStore;
        this.organization =
            new SingletonStore<OrganizationEntity>(
                'organization', backend,
            );

        this.workers =
            new EntityStore(
                'workers', backend, stateStore,
            );
        this.aiWorkers =
            new EntityStore(
                'ai_workers', backend, stateStore,
            );
        this.ideas =
            new EntityStore(
                'ideas', backend, stateStore,
            );
        this.projects =
            new EntityStore(
                'projects', backend, stateStore,
            );
        this.flows =
            new EntityStore(
                'flows', backend, stateStore,
            );
        this.flowVersions =
            new HistoryEntityStore(
                'flow_versions', backend,
            );
        this.projectFlows =
            new EntityStore(
                'project_flows', backend, stateStore,
            );
        this.workOrders =
            new EntityStore(
                'work_orders', backend, stateStore,
            );
        this.flowWorkOrders =
            new EntityStore(
                'flow_work_orders',
                backend, stateStore,
            );
        this.stateFieldValues =
            new EntityStore(
                'state_field_values',
                backend, stateStore,
            );
        this.ideaSubmissions =
            new EntityStore(
                'idea_submissions',
                backend, stateStore,
            );
        this.objectives =
            new EntityStore(
                'objectives', backend, stateStore,
            );
        this.objectiveRevisions =
            new HistoryEntityStore(
                'objective_revisions', backend,
            );
        this.projectObjectiveBaselineScores =
            new HistoryEntityStore(
                'project_objective_baseline_scores',
                backend,
            );
        this.projectObjectiveActualScores =
            new HistoryEntityStore(
                'project_objective_actual_scores',
                backend,
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
