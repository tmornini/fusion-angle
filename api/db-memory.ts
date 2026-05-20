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
        const b = this.#backend;
        const ss = new StateStore(b, 'states');
        this.states = ss;
        this.organization =
            new SingletonStore<OrganizationEntity>(
                'organization', b,
            );

        this.workers =
            new EntityStore('workers', b, ss);
        this.aiWorkers =
            new EntityStore('ai_workers', b, ss);
        this.ideas =
            new EntityStore('ideas', b, ss);
        this.projects =
            new EntityStore('projects', b, ss);
        this.flows =
            new EntityStore('flows', b, ss);
        this.flowVersions =
            new HistoryEntityStore(
                'flow_versions', b,
            );
        this.projectFlows =
            new EntityStore('project_flows', b, ss);
        this.workOrders =
            new EntityStore('work_orders', b, ss);
        this.flowWorkOrders =
            new EntityStore(
                'flow_work_orders', b, ss,
            );
        this.stateFieldValues =
            new EntityStore(
                'state_field_values', b, ss,
            );
        this.ideaSubmissions =
            new EntityStore(
                'idea_submissions', b, ss,
            );
        this.objectives =
            new EntityStore('objectives', b, ss);
        this.objectiveRevisions =
            new HistoryEntityStore(
                'objective_revisions', b,
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
