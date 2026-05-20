import { TABLE_NAMES } from './db.ts';
import type { DbAdapter } from './db.ts';
import { LocalStorageBackend } from
    './backend-localstorage.ts';
import { EntityStore } from './store-entity.ts';
import { HistoryEntityStore }
    from './store-history-entity.ts';
import { SingletonStore } from './store-singleton.ts';
import { StateStore } from './store-state.ts';
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
import {
    withSimulatedLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';
import {
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
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateStateEntity,
} from './validators.ts';

const SIMULATE_LATENCY_PARAM = 'simulate-latency';

function simulateLatencyRequested(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }
    const params = new URLSearchParams(
        window.location.search,
    );
    return params.get(SIMULATE_LATENCY_PARAM)
        === 'on';
}

// Map table name → entity validator. Stored rows
// carry `id` as their storage key — strip it before
// passing to each validator, which enforces an exact
// body-key set.
function validateSnapshotRow(
    table: string,
    row: Record<string, unknown>,
    rowIndex: number,
): void {
    const label =
        'snapshot.' + table
        + '[' + rowIndex + ']';
    const { id: _id, ...body } = row;
    try {
        switch (table) {
            case 'workers':
                validateHumanWorkerEntity(body);
                break;
            case 'ai_workers':
                validateAIWorkerEntity(body);
                break;
            case 'ideas':
                validateIdeaEntity(body);
                break;
            case 'projects':
                validateProjectEntity(body);
                break;
            case 'flows':
                validateFlowEntity(body);
                break;
            case 'flow_versions':
                validateFlowVersionEntity(body);
                break;
            case 'project_flows':
                validateProjectFlowEntity(body);
                break;
            case 'work_orders':
                validateWorkOrderEntity(body);
                break;
            case 'flow_work_orders':
                validateFlowWorkOrderEntity(body);
                break;
            case 'state_field_values':
                validateStateFieldValueEntity(
                    body,
                );
                break;
            case 'organization':
                validateOrganizationEntity(body);
                break;
            case 'idea_submissions':
                validateIdeaSubmissionEntity(body);
                break;
            case 'states':
                validateStateEntity(body);
                break;
        }
    } catch (err) {
        const msg =
            err instanceof Error
                ? err.message
                : String(err);
        throw new Error(
            'Invalid snapshot row in '
            + label + ': ' + msg,
        );
    }
}

// Parses + validates the snapshot JSON, returning
// per-table parsed rows. Throws with a precise
// message identifying which table or row failed.
function parseAndValidateSnapshot(
    json: string,
): Map<string, { id: string }[]> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error(
            'Invalid snapshot: not valid JSON.',
        );
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        throw new Error(
            'Invalid snapshot: expected an object'
            + ' with table keys.',
        );
    }
    const record = parsed as Record<string, unknown>;
    const result = new Map<string, { id: string }[]>();
    for (const table of TABLE_NAMES) {
        const rows = record[table];
        if (
            rows !== undefined
            && !Array.isArray(rows)
        ) {
            throw new Error(
                'Invalid snapshot: table "'
                + table + '" is not an array.',
            );
        }
        const rowArr =
            Array.isArray(rows) ? rows : [];
        const parsedRows: { id: string }[] = [];
        for (let i = 0; i < rowArr.length; i++) {
            const row = rowArr[i];
            if (
                typeof row !== 'object'
                || row === null
                || Array.isArray(row)
            ) {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table + '" is not an object.',
                );
            }
            const r = row as Record<string, unknown>;
            validateSnapshotRow(table, r, i);
            if (typeof r['id'] !== 'string') {
                throw new Error(
                    'Invalid snapshot: row '
                    + i + ' in table "'
                    + table
                    + '" missing string id.',
                );
            }
            parsedRows.push(r as { id: string });
        }
        result.set(table, parsedRows);
    }
    return result;
}

export async function createLocalStorageAdapter(
): Promise<DbAdapter> {
    const backend = new LocalStorageBackend();
    const stateStore = new StateStore(backend, 'states');

    const adapter: DbAdapter = {
        async initialize(): Promise<void> {},
        async close(): Promise<void> {},
        async flush(): Promise<void> {},

        async deleteSchema(): Promise<void> {
            await backend.clearAll();
        },

        async hasSchema(): Promise<boolean> {
            return (await backend.list()).length > 0;
        },

        async createSchema(): Promise<void> {
            const existing = new Set(
                await backend.list(),
            );
            for (const table of TABLE_NAMES) {
                if (!existing.has(table)) {
                    await backend.write(table, []);
                }
            }
        },

        async exportSnapshot(): Promise<string> {
            const obj: Record<string, unknown[]> = {};
            for (const table of TABLE_NAMES) {
                obj[table] = await backend.read(table);
            }
            return JSON.stringify(obj, null, 2);
        },

        async importSnapshot(
            json: string,
        ): Promise<void> {
            const validated =
                parseAndValidateSnapshot(json);
            await backend.clearAll();
            try {
                for (const [
                    table, rows,
                ] of validated) {
                    await backend.write(table, rows);
                }
            } catch (err) {
                await backend.clearAll();
                throw err;
            }
        },

        workers: new EntityStore<HumanWorkerEntity>(
            'workers', backend, stateStore,
        ),
        aiWorkers: new EntityStore<AIWorkerEntity>(
            'ai_workers', backend, stateStore,
        ),
        ideas: new EntityStore<IdeaEntity>(
            'ideas', backend, stateStore,
        ),
        projects: new EntityStore<ProjectEntity>(
            'projects', backend, stateStore,
        ),
        flows: new EntityStore<FlowEntity>(
            'flows', backend, stateStore,
        ),
        flowVersions:
            new HistoryEntityStore<FlowVersionEntity>(
                'flow_versions', backend,
            ),
        projectFlows:
            new EntityStore<ProjectFlowEntity>(
                'project_flows', backend, stateStore,
            ),
        workOrders: new EntityStore<WorkOrderEntity>(
            'work_orders', backend, stateStore,
        ),
        flowWorkOrders:
            new EntityStore<FlowWorkOrderEntity>(
                'flow_work_orders',
                backend, stateStore,
            ),
        stateFieldValues:
            new EntityStore<StateFieldValueEntity>(
                'state_field_values',
                backend, stateStore,
            ),
        organization:
            new SingletonStore<OrganizationEntity>(
                'organization', backend,
            ),
        ideaSubmissions:
            new EntityStore<IdeaSubmissionEntity>(
                'idea_submissions',
                backend, stateStore,
            ),
        objectives: new EntityStore<Objective>(
            'objectives', backend, stateStore,
        ),
        objectiveRevisions:
            new HistoryEntityStore<ObjectiveRevision>(
                'objective_revisions', backend,
            ),
        projectObjectiveBaselineScores:
            new HistoryEntityStore<
                ProjectObjectiveBaselineScore
            >(
                'project_objective_baseline_scores',
                backend,
            ),
        projectObjectiveActualScores:
            new HistoryEntityStore<
                ProjectObjectiveActualScore
            >(
                'project_objective_actual_scores',
                backend,
            ),
        states: stateStore,
    };

    return simulateLatencyRequested()
        ? withSimulatedLatency(
            adapter,
            DEFAULT_LATENCY_CONFIG,
        )
        : adapter;
}
