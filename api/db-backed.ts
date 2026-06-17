import {
    TABLE_NAMES,
    backendRunner,
    ambientRunner,
} from './db.ts';
import type {
    GuardedDbAdapter,
    GuardedDbStores,
    GuardedEntityStore,
    StorageBackend,
    StateStore as IStateStore,
    Tx,
    TxRunner,
} from './db.ts';
import type {
    MemberEntity,
    HumanMemberEntity,
    AIMemberEntity,
    IdentityEntity,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdentityDefaultOrganizationEntity,
    RoleGrantEntity,
    IdentityTokenEntity,
    ClientEntity,
    IdentityProviderEntity,
    AuthorizationCodeEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
    FlowVersionEntity,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
    OrganizationEntity,
    MembershipEntity,
    InvitationEntity,
    IdeaSubmissionEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateFieldValueEntity,
    RecordEntity,
    RecordAttributeEntity,
    FlowRecordEntity,
    Objective,
    ObjectiveRevisionEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from './types.ts';
import type { LatencySimulation } from './latency.ts';
import { EntityStore } from './store-entity.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { StateStore } from './store-state.ts';
import {
    parseAndValidateSnapshot,
} from './snapshot-validator.ts';
import {
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateMemberEntity,
    validateHumanMemberEntity,
    validateAIMemberEntity,
    validateIdentityEntity,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateIdentityTokenRevocationEntity,
    validateIdentityDefaultOrganizationEntity,
    validateRoleGrantEntity,
    validateIdentityTokenEntity,
    validateClientEntity,
    validateIdentityProviderEntity,
    validateAuthorizationCodeEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateFlowNodeEntity,
    validateFlowEdgeEntity,
    validateFlowNodeMemberEntity,
    validateFlowNodeAttributeEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateStateFieldValueEntity,
    validateStateEntity,
    validateRecordEntity,
    validateRecordAttributeEntity,
    validateFlowRecordEntity,
    validateIdeaSubmissionEntity,
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateOrganizationEntity,
    validateMembershipEntity,
    validateInvitationEntity,
} from './validators.ts';

// One adapter over any StorageBackend. The 36-store wiring,
// the transaction view, and the tx-based snapshot ops live
// here once (Commandment IX — the third backend, IndexedDB,
// triggers the abstraction). The per-tier variation rides in
// the constructor: the backend itself, a latency shim, and
// an open hook the async tiers (IndexedDB) use to connect
// before any store op. Schema lifecycle delegates to the
// backend, which signals "schema exists" its own way.
export class BackedDbAdapter
    implements GuardedDbAdapter, LatencySimulation
{
    readonly #backend: StorageBackend;
    readonly #latency: () => Promise<void>;
    readonly #open: () => Promise<void>;

    readonly members!: GuardedEntityStore<MemberEntity>;
    readonly humanMembers!:
        GuardedEntityStore<HumanMemberEntity>;
    readonly aiMembers!: GuardedEntityStore<AIMemberEntity>;
    readonly identities!:
        GuardedEntityStore<IdentityEntity>;
    readonly identityPii!:
        GuardedEntityStore<IdentityPiiEntity>;
    readonly identityCredentials!:
        GuardedEntityStore<IdentityCredentialEntity>;
    readonly identityTokenRevocations!:
        GuardedEntityStore<IdentityTokenRevocationEntity>;
    readonly identityDefaultOrganizations!:
        GuardedEntityStore<IdentityDefaultOrganizationEntity>;
    readonly roleGrants!: GuardedEntityStore<RoleGrantEntity>;
    readonly identityTokens!:
        GuardedEntityStore<IdentityTokenEntity>;
    readonly clients!: GuardedEntityStore<ClientEntity>;
    readonly identityProviders!:
        GuardedEntityStore<IdentityProviderEntity>;
    readonly authorizationCodes!:
        GuardedEntityStore<AuthorizationCodeEntity>;
    readonly ideas!: GuardedEntityStore<IdeaEntity>;
    readonly projects!: GuardedEntityStore<ProjectEntity>;
    readonly flows!: GuardedEntityStore<FlowEntity>;
    readonly flowVersions!:
        GuardedEntityStore<FlowVersionEntity>;
    readonly flowNodes!: GuardedEntityStore<FlowNodeEntity>;
    readonly flowEdges!: GuardedEntityStore<FlowEdgeEntity>;
    readonly flowNodeMembers!:
        GuardedEntityStore<FlowNodeMemberEntity>;
    readonly flowNodeAttributes!:
        GuardedEntityStore<FlowNodeAttributeEntity>;
    readonly projectFlows!:
        GuardedEntityStore<ProjectFlowEntity>;
    readonly workOrders!: GuardedEntityStore<WorkOrderEntity>;
    readonly flowWorkOrders!:
        GuardedEntityStore<FlowWorkOrderEntity>;
    readonly stateFieldValues!:
        GuardedEntityStore<StateFieldValueEntity>;
    readonly records!:
        GuardedEntityStore<RecordEntity>;
    readonly recordAttributes!:
        GuardedEntityStore<RecordAttributeEntity>;
    readonly flowRecords!:
        GuardedEntityStore<FlowRecordEntity>;
    readonly organizations!:
        GuardedEntityStore<OrganizationEntity>;
    readonly memberships!:
        GuardedEntityStore<MembershipEntity>;
    readonly invitations!:
        GuardedEntityStore<InvitationEntity>;
    readonly ideaSubmissions!:
        GuardedEntityStore<IdeaSubmissionEntity>;
    readonly objectives!: GuardedEntityStore<Objective>;
    readonly objectiveRevisions!:
        GuardedEntityStore<ObjectiveRevisionEntity>;
    readonly projectObjectiveBaselineScores!:
        GuardedEntityStore<ProjectObjectiveBaselineScore>;
    readonly projectObjectiveActualScores!:
        GuardedEntityStore<ProjectObjectiveActualScore>;
    readonly states!: IStateStore;

    constructor(
        backend: StorageBackend,
        latency: () => Promise<void>,
        open: () => Promise<void>,
    ) {
        this.#backend = backend;
        this.#latency = latency;
        this.#open = open;
        Object.assign(
            this,
            this.#buildStores(backendRunner(backend)),
        );
    }

    async initialize(): Promise<void> {
        await this.#open();
    }

    simulateLatency(): Promise<void> {
        return this.#latency();
    }

    hasSchema(): Promise<boolean> {
        return this.#backend.hasSchema();
    }

    postSchemaCreation(): Promise<void> {
        return this.#backend.postSchemaCreation();
    }

    ensureTables(
        tables: readonly string[],
    ): Promise<void> {
        return this.#backend.ensureTables(tables);
    }

    deleteSchema(): Promise<void> {
        return this.#backend.deleteSchema();
    }

    async getSnapshot(): Promise<string> {
        const obj = await this.#backend.transaction(
            TABLE_NAMES, 'readonly',
            async (tx) => {
                const out: Record<string, unknown[]> = {};
                for (const table of TABLE_NAMES) {
                    out[table] = await tx.getAll(table);
                }
                return out;
            },
        );
        return JSON.stringify(obj, null, 2);
    }

    async putSnapshot(json: string): Promise<void> {
        // Validators run at the gate, before any storage
        // touch — a bad snapshot throws here, leaving prior
        // data intact. The clear+put then runs in one
        // transaction; a logic error discards the buffer
        // (rollback). On IndexedDB the whole flush is a
        // genuine atomic commit; localStorage's multi-key
        // flush is not OS-atomic on a mid-write quota error.
        const validated = parseAndValidateSnapshot(json);
        await this.#backend.ensureTables(TABLE_NAMES);
        await this.#backend.transaction(
            TABLE_NAMES, 'readwrite',
            async (tx) => {
                for (const [table, rows] of validated) {
                    await tx.clear(table);
                    for (const row of rows) {
                        await tx.put(table, row);
                    }
                }
            },
        );
        // Imported data IS a schema: stamp the marker after
        // the commit so hasSchema() answers true after a
        // restore onto a fresh origin. A failed import never
        // stamps.
        await this.#backend.postSchemaCreation();
    }

    async transaction<R>(
        tables: readonly string[],
        fn: (view: GuardedDbAdapter) => Promise<R>,
    ): Promise<R> {
        return this.#backend.transaction(
            tables, 'readwrite',
            (tx) => fn(this.#viewForTx(tx, tables)),
        );
    }

    // An adapter whose 36 stores are bound to the open tx
    // (ambientRunner joins it), so every op runs in one
    // transaction. Lifecycle methods delegate to the parent;
    // a nested transaction RE-ENTERS this same tx — it runs
    // `fn` against this view after asserting the nested tables
    // are a subset of the outer declared set, so a composing
    // POST opens one tx and calls the same single-noun store
    // ops the per-noun routes use, all committing together.
    #viewForTx(
        tx: Tx,
        declaredTables: readonly string[],
    ): GuardedDbAdapter {
        const view: GuardedDbAdapter = {
            ...this.#buildStores(ambientRunner(tx)),
            initialize: () => this.initialize(),
            deleteSchema: () => this.deleteSchema(),
            hasSchema: () => this.hasSchema(),
            postSchemaCreation: () => this.postSchemaCreation(),
            ensureTables: (tables) =>
                this.ensureTables(tables),
            getSnapshot: () => this.getSnapshot(),
            putSnapshot: (json) =>
                this.putSnapshot(json),
            transaction: (tables, fn) => {
                this.#assertSubset(tables, declaredTables);
                return fn(view);
            },
        };
        return view;
    }

    // The nested-tx guard. IndexedDB locks object stores at
    // tx-open, so a nested op touching a table the outer did
    // not declare fails there; the simulated tiers would let
    // it slip (they buffer any table lazily). This asserts
    // the subset on every tier — a clear error naming the
    // table, raised before any row op.
    #assertSubset(
        nestedTables: readonly string[],
        declaredTables: readonly string[],
    ): void {
        for (const table of nestedTables) {
            if (!declaredTables.includes(table)) {
                throw new Error(
                    `Nested transaction table '${table}'`
                    + ' is not in the outer declared set'
                    + ` [${declaredTables.join(', ')}].`,
                );
            }
        }
    }

    // The 36-store wiring lives here once. The constructor
    // binds it to the backend; the transaction view rebinds
    // the same wiring to an open tx via ambientRunner.
    #buildStores(run: TxRunner): GuardedDbStores {
        const stateStore = new StateStore(
            run, 'states', validateStateEntity);
        return {
            states: stateStore,
            organizations: new EntityStore(
                'organizations', run, stateStore,
                validateOrganizationEntity,
            ),
            memberships: new EntityStore(
                'memberships', run, stateStore,
                validateMembershipEntity,
            ),
            invitations: new EntityStore(
                'invitations', run, stateStore,
                validateInvitationEntity,
            ),
            members: new EntityStore(
                'members', run, stateStore,
                validateMemberEntity,
            ),
            humanMembers: new EntityStore(
                'human_members', run, stateStore,
                validateHumanMemberEntity,
            ),
            aiMembers: new EntityStore(
                'ai_members', run, stateStore,
                validateAIMemberEntity,
            ),
            identities: new EntityStore(
                'identities', run, stateStore,
                validateIdentityEntity,
            ),
            identityPii: new EntityStore(
                'identity_pii', run, stateStore,
                validateIdentityPiiEntity,
            ),
            identityCredentials: new HistoryEntityStore(
                'identity_credentials', run,
                validateIdentityCredentialEntity,
            ),
            identityTokenRevocations: new HistoryEntityStore(
                'identity_token_revocations', run,
                validateIdentityTokenRevocationEntity,
            ),
            identityDefaultOrganizations: new HistoryEntityStore(
                'identity_default_organizations', run,
                validateIdentityDefaultOrganizationEntity,
            ),
            roleGrants: new HistoryEntityStore(
                'role_grants', run,
                validateRoleGrantEntity,
            ),
            identityTokens: new HistoryEntityStore(
                'identity_tokens', run,
                validateIdentityTokenEntity,
            ),
            clients: new EntityStore(
                'clients', run, stateStore,
                validateClientEntity,
            ),
            identityProviders: new HistoryEntityStore(
                'identity_providers', run,
                validateIdentityProviderEntity,
            ),
            authorizationCodes: new HistoryEntityStore(
                'authorization_codes', run,
                validateAuthorizationCodeEntity,
            ),
            ideas: new EntityStore(
                'ideas', run, stateStore,
                validateIdeaEntity,
            ),
            projects: new EntityStore(
                'projects', run, stateStore,
                validateProjectEntity,
            ),
            flows: new EntityStore(
                'flows', run, stateStore,
                validateFlowEntity,
            ),
            flowVersions: new HistoryEntityStore(
                'flow_versions', run,
                validateFlowVersionEntity,
            ),
            flowNodes: new EntityStore(
                'flow_nodes', run, stateStore,
                validateFlowNodeEntity,
            ),
            flowEdges: new EntityStore(
                'flow_edges', run, stateStore,
                validateFlowEdgeEntity,
            ),
            flowNodeMembers: new HistoryEntityStore(
                'flow_node_members', run,
                validateFlowNodeMemberEntity,
            ),
            flowNodeAttributes: new HistoryEntityStore(
                'flow_node_attributes', run,
                validateFlowNodeAttributeEntity,
            ),
            projectFlows: new EntityStore(
                'project_flows', run, stateStore,
                validateProjectFlowEntity,
            ),
            workOrders: new EntityStore(
                'work_orders', run, stateStore,
                validateWorkOrderEntity,
            ),
            flowWorkOrders: new EntityStore(
                'flow_work_orders', run, stateStore,
                validateFlowWorkOrderEntity,
            ),
            stateFieldValues: new EntityStore(
                'state_field_values', run, stateStore,
                validateStateFieldValueEntity,
            ),
            records: new EntityStore(
                'records', run, stateStore,
                validateRecordEntity,
            ),
            recordAttributes: new EntityStore(
                'record_attributes', run, stateStore,
                validateRecordAttributeEntity,
            ),
            flowRecords: new EntityStore(
                'flow_records', run, stateStore,
                validateFlowRecordEntity,
            ),
            ideaSubmissions: new EntityStore(
                'idea_submissions', run, stateStore,
                validateIdeaSubmissionEntity,
            ),
            objectives: new EntityStore(
                'objectives', run, stateStore,
                validateObjectiveEntity,
            ),
            objectiveRevisions: new HistoryEntityStore(
                'objective_revisions', run,
                validateObjectiveRevisionEntity,
            ),
            projectObjectiveBaselineScores:
                new HistoryEntityStore(
                    'project_objective_baseline_scores',
                    run,
                    validateBaselineScoreEntity,
                ),
            projectObjectiveActualScores:
                new HistoryEntityStore(
                    'project_objective_actual_scores',
                    run,
                    validateActualScoreEntity,
                ),
        };
    }
}
