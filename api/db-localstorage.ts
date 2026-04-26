import {
    EntityNotFound,
} from './db';
import type {
    DbAdapter,
    DeletedStore,
    EntityStore,
    SingletonStore,
} from './db';
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
} from './types';
import { nowUtc } from './types';
import {
    withSimulatedLatency,
} from './latency';

const KEY_PREFIX = 'fusion-ai:';

function isRowShaped(
    row: unknown,
): row is { id: string } {
    return typeof row === 'object'
        && row !== null
        && 'id' in row
        && typeof (
            row as { id: unknown }
        ).id === 'string';
}

function readTable<T>(
    tableName: string,
): T[] {
    const raw = localStorage.getItem(
        KEY_PREFIX + tableName,
    );
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            throw new Error(
                'Table "' + tableName
                + '" is not an array.'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        if (!parsed.every(isRowShaped)) {
            throw new Error(
                'Table "' + tableName
                + '" has malformed row(s).'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        return parsed as T[];
    } catch (e) {
        if (e instanceof Error) {
            throw new Error(
                'Reading table "'
                + tableName
                + '" failed: '
                + e.message,
            );
        }
        throw new Error(
            'Table "' + tableName
            + '" has corrupt JSON.'
            + ' Clear data or import'
            + ' a valid snapshot.',
        );
    }
}

function writeTable<T>(
    tableName: string,
    rows: T[],
): void {
    try {
        localStorage.setItem(
            KEY_PREFIX + tableName,
            JSON.stringify(rows),
        );
    } catch (e) {
        if (
            e instanceof DOMException
            && e.name === 'QuotaExceededError'
        ) {
            throw new Error(
                'Storage quota exceeded writing "'
                + tableName
                + '". Clear old data or export'
                + ' a snapshot first.',
            );
        }
        throw e;
    }
}

function serializeValue(
    value: unknown,
    key: string,
    tableName: string,
): unknown {
    if (value === null || value === undefined) {
        throw new Error(
            `NOT NULL violation: "${key}"`
            + ` in "${tableName}" is`
            + ` ${String(value)}.`,
        );
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    return value;
}

function serializeRecord(
    record: Record<string, unknown>,
    tableName: string,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (
        const [key, value]
        of Object.entries(record)
    ) {
        result[key] = serializeValue(
            value, key, tableName,
        );
    }
    return result;
}

function generateCompositeId(
    prefix: string,
    ...parts: string[]
): string {
    return `${prefix}-${parts.join('-')}`;
}

function createDeletedStore(): DeletedStore {
    const TABLE = 'deleted';
    return {
        async isDeleted(
            id: string,
        ): Promise<boolean> {
            const rows = readTable<Deleted>(
                TABLE,
            );
            return rows.some(r => r.id === id);
        },
        async record(id: string): Promise<void> {
            const rows = readTable<Deleted>(
                TABLE,
            );
            if (
                rows.some(r => r.id === id)
            ) return;
            rows.push({
                id,
                deleted_at: nowUtc(),
            });
            writeTable(TABLE, rows);
        },
        async allDeletedIds(
        ): Promise<Set<string>> {
            const rows = readTable<Deleted>(
                TABLE,
            );
            return new Set(
                rows.map(r => r.id),
            );
        },
    };
}

function createEntityStore<
    T extends { id: string },
>(
    tableName: string,
    deletedStore: DeletedStore,
): EntityStore<T> {
    return {
        async getAll(): Promise<T[]> {
            const rows = readTable<T>(tableName);
            const deletedIds =
                await deletedStore.allDeletedIds();
            return rows.filter(
                row => !deletedIds.has(row.id),
            );
        },
        async getById(
            id: string,
        ): Promise<T> {
            if (
                await deletedStore.isDeleted(id)
            ) {
                throw new EntityNotFound(
                    tableName, id,
                );
            }
            const rows = readTable<T>(tableName);
            const row = rows.find(
                entity => entity.id === id,
            );
            if (!row) {
                throw new EntityNotFound(
                    tableName, id,
                );
            }
            return row;
        },
        async put(
            id: string,
            fields: Omit<T, 'id'>,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const index = rows.findIndex(
                entity => entity.id === id,
            );
            const serialized = serializeRecord(
                fields as Record<string, unknown>,
                tableName,
            );

            if (index >= 0) {
                rows[index] = {
                    ...serialized,
                    id,
                } as T;
            } else {
                rows.push({
                    ...serialized,
                    id,
                } as T);
            }

            writeTable(tableName, rows);
            const pos = index >= 0
                ? index
                : rows.length - 1;
            const written = rows[pos];
            if (!written) {
                throw new Error(
                    'Internal error: entity'
                    + ' not found after write',
                );
            }
            return written;
        },
        async delete(id: string): Promise<void> {
            await deletedStore.record(id);
        },
    };
}

// History tables hold immutable point-in-time facts.
// Their only valid removal is eviction (for cap
// enforcement) — true hard delete, no tombstone.
function createHistoryEntityStore<
    T extends { id: string },
>(tableName: string): EntityStore<T> {
    return {
        async getAll(): Promise<T[]> {
            return readTable<T>(tableName);
        },
        async getById(
            id: string,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const row = rows.find(
                entity => entity.id === id,
            );
            if (!row) {
                throw new EntityNotFound(
                    tableName, id,
                );
            }
            return row;
        },
        async put(
            id: string,
            fields: Omit<T, 'id'>,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const index = rows.findIndex(
                entity => entity.id === id,
            );
            const serialized = serializeRecord(
                fields as Record<string, unknown>,
                tableName,
            );

            if (index >= 0) {
                rows[index] = {
                    ...serialized,
                    id,
                } as T;
            } else {
                rows.push({
                    ...serialized,
                    id,
                } as T);
            }

            writeTable(tableName, rows);
            const pos = index >= 0
                ? index
                : rows.length - 1;
            const written = rows[pos];
            if (!written) {
                throw new Error(
                    'Internal error: entity'
                    + ' not found after write',
                );
            }
            return written;
        },
        async delete(id: string): Promise<void> {
            const rows = readTable<T>(tableName);
            const idx = rows.findIndex(
                e => e.id === id,
            );
            if (idx >= 0) {
                rows.splice(idx, 1);
                writeTable(tableName, rows);
            }
        },
    };
}

function createSingletonStore<
    T extends { id: string },
>(tableName: string): SingletonStore<T> {
    return {
        async get(): Promise<T> {
            const rows = readTable<T>(tableName);
            const row = rows.find(
                entity => entity.id === '1',
            );
            if (row) return row;
            throw new Error(
                'Singleton "' + tableName
                + '" not found. Load data'
                + ' via snapshots.',
            );
        },
        async put(
            fields: Omit<T, 'id'>,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const serialized = serializeRecord(
                fields as Record<string, unknown>,
                tableName,
            );
            const index = rows.findIndex(
                entity => entity.id === '1',
            );

            if (index >= 0) {
                rows[index] = {
                    ...serialized,
                    id: '1',
                } as T;
            } else {
                rows.push({
                    ...serialized,
                    id: '1',
                } as T);
            }

            writeTable(tableName, rows);
            const pos = index >= 0
                ? index
                : rows.length - 1;
            const written = rows[pos];
            if (!written) {
                throw new Error(
                    'Internal error: entity'
                    + ' not found after write',
                );
            }
            return written;
        },
    };
}

export const TABLE_NAMES = [
    'users',
    'ideas',
    'projects',
    'teams',
    'team_projects',
    'team_users',
    'activities',
    'flows',
    'flow_versions',
    'project_flows',
    'work_orders',
    'flow_work_orders',
    'work_order_transitions',
    'work_order_claims',
    'company',
    'organization',
    'idea_submissions',
    'activity_actors',
    'deleted',
];


export async function createLocalStorageAdapter(
): Promise<DbAdapter> {
    const deletedStore = createDeletedStore();

    const adapter: DbAdapter = {
        async initialize(): Promise<void> {
        },

        async close(): Promise<void> {
        },

        async flush(): Promise<void> {
        },

        async deleteSchema(): Promise<void> {
            for (const table of TABLE_NAMES) {
                localStorage.removeItem(
                    KEY_PREFIX + table,
                );
            }
        },

        async hasSchema(): Promise<boolean> {
            return TABLE_NAMES.some(
                table =>
                    localStorage.getItem(
                        KEY_PREFIX + table,
                    ) !== null,
            );
        },

        async createSchema(): Promise<void> {
            for (const table of TABLE_NAMES) {
                if (
                    localStorage.getItem(
                        KEY_PREFIX + table,
                    ) === null
                ) {
                    writeTable(table, []);
                }
            }
        },

        async exportSnapshot(
        ): Promise<string> {
            const snapshot: Record<
                string,
                unknown[]
            > = {};
            for (
                const table of TABLE_NAMES
            ) {
                snapshot[table] = readTable(
                    table,
                );
            }
            return JSON.stringify(
                snapshot,
                null,
                2,
            );
        },

        async importSnapshot(
            json: string,
        ): Promise<void> {
            let snapshot: unknown;
            try {
                snapshot = JSON.parse(json);
            } catch {
                throw new Error(
                    'Invalid snapshot:'
                    + ' not valid JSON.',
                );
            }
            if (
                typeof snapshot !== 'object'
                || snapshot === null
                || Array.isArray(snapshot)
            ) {
                throw new Error(
                    'Invalid snapshot: expected'
                    + ' an object with table'
                    + ' keys.',
                );
            }
            const record = snapshot as Record<
                string,
                unknown
            >;
            const serialized = new Map<
                string,
                string
            >();
            for (
                const table of TABLE_NAMES
            ) {
                const rows = record[table];
                if (
                    rows !== undefined
                    && !Array.isArray(rows)
                ) {
                    throw new Error(
                        'Invalid snapshot:'
                        + ' table "'
                        + table
                        + '" is not an array.',
                    );
                }
                serialized.set(
                    table,
                    JSON.stringify(
                        Array.isArray(rows)
                            ? rows
                            : [],
                    ),
                );
            }

            for (
                const table of TABLE_NAMES
            ) {
                localStorage.removeItem(
                    KEY_PREFIX + table,
                );
            }
            for (
                const [table, json]
                    of serialized
            ) {
                localStorage.setItem(
                    KEY_PREFIX + table,
                    json,
                );
            }
        },

        users:
            createEntityStore<UserEntity>(
                'users',
                deletedStore,
            ),
        ideas:
            createEntityStore<IdeaEntity>(
                'ideas',
                deletedStore,
            ),

        projects:
            createEntityStore<ProjectEntity>(
                'projects',
                deletedStore,
            ),

        teams:
            createEntityStore<
                TeamEntity
            >('teams', deletedStore),
        teamProjects:
            createEntityStore<
                TeamProjectEntity
            >('team_projects', deletedStore),
        teamUsers:
            createEntityStore<
                TeamUserEntity
            >('team_users', deletedStore),

        activities:
            createEntityStore<ActivityEntity>(
                'activities',
                deletedStore,
            ),

        flows:
            createEntityStore<
                FlowEntity
            >('flows', deletedStore),
        flowVersions:
            createHistoryEntityStore<
                FlowVersionEntity
            >('flow_versions'),
        projectFlows:
            createEntityStore<
                ProjectFlowEntity
            >('project_flows', deletedStore),
        workOrders:
            createEntityStore<
                WorkOrderEntity
            >('work_orders', deletedStore),
        flowWorkOrders:
            createEntityStore<
                FlowWorkOrderEntity
            >('flow_work_orders', deletedStore),
        workOrderTransitions:
            createEntityStore<
                WorkOrderTransitionEntity
            >(
                'work_order_transitions',
                deletedStore,
            ),
        workOrderClaims:
            createEntityStore<
                WorkOrderClaimEntity
            >(
                'work_order_claims',
                deletedStore,
            ),

        company:
            createSingletonStore<CompanyEntity>(
                'company',
            ),

        organization:
            createSingletonStore<OrganizationEntity>(
                'organization',
            ),

        ideaSubmissions:
            createEntityStore<
                IdeaSubmissionEntity
            >('idea_submissions', deletedStore),
        activityActors:
            createEntityStore<
                ActivityActorEntity
            >('activity_actors', deletedStore),
        deleted: deletedStore,
    };

    return withSimulatedLatency(adapter);
}
