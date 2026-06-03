import { TABLE_NAMES } from './db.ts';
import type {
    DbAdapter,
    SingletonStore as ISingletonStore,
    EntityStore as IEntityStore,
    StateStore as IStateStore,
} from './db.ts';
import type {
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
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
    RecordEntity,
    RecordAttributeEntity,
    FlowRecordEntity,
    Objective,
    ObjectiveRevision,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from './types.ts';
import { MemoryStorageBackend }
    from './backend-memory.ts';
import {
    parseAndValidateSnapshot,
} from './snapshot-validator.ts';
import { EntityStore } from './store-entity.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { SingletonStore } from './store-singleton.ts';
import { StateStore } from './store-state.ts';
import {
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateMemberEntity,
    validateHumanMemberEntity,
    validateAIMemberEntity,
    validateIdentityEntity,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
    validateIdeaSubmissionEntity,
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
} from './validators.ts';

export class MemoryDbAdapter implements DbAdapter {
    readonly #backend: MemoryStorageBackend;

    readonly members: IEntityStore<MemberEntity>;
    readonly humanMembers:
        IEntityStore<HumanMemberEntity>;
    readonly aiMembers: IEntityStore<AIMemberEntity>;
    readonly identities:
        IEntityStore<IdentityEntity>;
    readonly identityPii:
        IEntityStore<IdentityPiiEntity>;
    readonly identityCredentials:
        IEntityStore<IdentityCredentialEntity>;
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
    readonly records:
        IEntityStore<RecordEntity>;
    readonly recordAttributes:
        IEntityStore<RecordAttributeEntity>;
    readonly flowRecords:
        IEntityStore<FlowRecordEntity>;
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

        this.members =
            new EntityStore(
                'members', backend, stateStore,
                validateMemberEntity,
            );
        this.humanMembers =
            new EntityStore(
                'human_members', backend, stateStore,
                validateHumanMemberEntity,
            );
        this.aiMembers =
            new EntityStore(
                'ai_members', backend, stateStore,
                validateAIMemberEntity,
            );
        this.identities =
            new EntityStore(
                'identities', backend, stateStore,
                validateIdentityEntity,
            );
        this.identityPii =
            new EntityStore(
                'identity_pii', backend, stateStore,
                validateIdentityPiiEntity,
            );
        this.identityCredentials =
            new HistoryEntityStore(
                'identity_credentials', backend,
                validateIdentityCredentialEntity,
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
        this.records =
            new EntityStore(
                'records', backend, stateStore,
                validateRecordEntity,
            );
        this.recordAttributes =
            new EntityStore(
                'record_attributes',
                backend, stateStore,
                validateRecordAttributeEntity,
            );
        this.flowRecords =
            new EntityStore(
                'flow_records',
                backend, stateStore,
                validateFlowRecordEntity,
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
    async simulateLatency(): Promise<void> {}

    async hasSchema(): Promise<boolean> {
        return (await this.#backend.list()).length > 0;
    }

    async createSchema(): Promise<void> {
        const existing = new Set(
            await this.#backend.list(),
        );
        for (const table of TABLE_NAMES) {
            if (!existing.has(table)) {
                await this.#backend.write(table, []);
            }
        }
    }

    async deleteSchema(): Promise<void> {
        await this.#backend.clearAll();
    }

    async exportSnapshot(): Promise<string> {
        const obj: Record<string, unknown[]> = {};
        for (const table of TABLE_NAMES) {
            obj[table] = await this.#backend.read(table);
        }
        return JSON.stringify(obj, null, 2);
    }

    async importSnapshot(json: string): Promise<void> {
        const validated =
            parseAndValidateSnapshot(json);
        await this.#backend.clearAll();
        try {
            for (const [table, rows] of validated) {
                await this.#backend.write(table, rows);
            }
        } catch (err) {
            await this.#backend.clearAll();
            throw err;
        }
    }
}
