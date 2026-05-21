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
import {
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateHumanWorkerEntity,
    validateAIWorkerEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateIdeaSubmissionEntity,
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from './validators.ts';

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
                validateHumanWorkerEntity,
            );
        this.aiWorkers =
            new EntityStore(
                'ai_workers', backend, stateStore,
                validateAIWorkerEntity,
            );
        this.ideas =
            new EntityStore(
                'ideas', backend, stateStore,
                validateIdeaEntity,
            );
        this.projects =
            new EntityStore(
                'projects', backend, stateStore,
                validateProjectEntity,
            );
        this.flows =
            new EntityStore(
                'flows', backend, stateStore,
                validateFlowEntity,
            );
        this.flowVersions =
            new HistoryEntityStore(
                'flow_versions', backend,
                validateFlowVersionEntity,
            );
        this.projectFlows =
            new EntityStore(
                'project_flows', backend, stateStore,
                validateProjectFlowEntity,
            );
        this.workOrders =
            new EntityStore(
                'work_orders', backend, stateStore,
                validateWorkOrderEntity,
            );
        this.flowWorkOrders =
            new EntityStore(
                'flow_work_orders',
                backend, stateStore,
                validateFlowWorkOrderEntity,
            );
        this.stateFieldValues =
            new EntityStore(
                'state_field_values',
                backend, stateStore,
                validateStateFieldValueEntity,
            );
        this.ideaSubmissions =
            new EntityStore(
                'idea_submissions',
                backend, stateStore,
                validateIdeaSubmissionEntity,
            );
        this.objectives =
            new EntityStore(
                'objectives', backend, stateStore,
                validateObjectiveEntity,
            );
        this.objectiveRevisions =
            new HistoryEntityStore(
                'objective_revisions', backend,
                validateObjectiveRevisionEntity,
            );
        this.projectObjectiveBaselineScores =
            new HistoryEntityStore(
                'project_objective_baseline_scores',
                backend,
                validateBaselineScoreEntity,
            );
        this.projectObjectiveActualScores =
            new HistoryEntityStore(
                'project_objective_actual_scores',
                backend,
                validateActualScoreEntity,
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
