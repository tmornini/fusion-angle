import {
    EntityNotFound,
} from './db';
import type {
    DbAdapter,
    EntityStore,
    SingletonStore,
} from './db';
import type {
    UserEntity,
    IdeaEntity,
    ProjectEntity,
    TeamMembershipEntity,
    TeamMembershipProjectEntity,
    TeamMembershipUserEntity,
    ActivityEntity,
    FlowEntity,
    CompanySettingsEntity,
    AccountEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
} from './types';
import { nowUtc } from './types';

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
    includeDeleted: boolean,
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
        if (!includeDeleted) {
            return parsed.filter(
                (row: Record<
                    string, unknown
                >) => !row.deleted_at,
            ) as T[];
        }
        return parsed as T[];
    } catch (e) {
        if (e instanceof Error) throw e;
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

function serializeRecord<T>(
    record: Partial<T>,
    tableName: string,
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (
        const [key, value]
        of Object.entries(
            record as Record<
                string,
                unknown
            >,
        )
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

function createEntityStore<
    T extends { id: string },
>(tableName: string): EntityStore<T> {
    return {
        async getAll(): Promise<T[]> {
            return readTable<T>(tableName, false);
        },
        async getById(
            id: string,
        ): Promise<T> {
            const rows = readTable<T>(
                tableName, false,
            );
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
            fields: Partial<T>,
        ): Promise<T> {
            const rows = readTable<T>(
                tableName, false,
            );
            const index = rows.findIndex(
                entity => entity.id === id,
            );
            const serialized = serializeRecord(
                fields, tableName,
            );

            if (index >= 0) {
                rows[index] = {
                    ...rows[index]!,
                    ...serialized,
                    id,
                } as T;
            } else {
                rows.push({
                    id,
                    ...serialized,
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
            const rows = readTable<T>(
                tableName,
                true,
            );
            const idx = rows.findIndex(
                e => e.id === id,
            );
            if (idx >= 0) {
                rows[idx] = {
                    ...rows[idx]!,
                    deleted_at: nowUtc(),
                } as T;
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
            const rows = readTable<T>(
                tableName, false,
            );
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
            fields: Partial<T>,
        ): Promise<T> {
            const rows = readTable<T>(
                tableName, false,
            );
            const serialized = serializeRecord(
                fields, tableName,
            );
            const index = rows.findIndex(
                entity => entity.id === '1',
            );

            if (index >= 0) {
                rows[index] = {
                    ...rows[index]!,
                    ...serialized,
                    id: '1',
                } as T;
            } else {
                rows.push({
                    id: '1',
                    ...serialized,
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
    'team_memberships',
    'team_membership_projects',
    'team_membership_users',
    'activities',
    'flows',
    'project_flows',
    'work_orders',
    'flow_work_orders',
    'work_order_transitions',
    'work_order_claims',
    'company_settings',
    'account',
    'idea_submissions',
    'activity_actors',
];


export async function createLocalStorageAdapter(
): Promise<DbAdapter> {
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
                    true,
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
            ),
        ideas:
            createEntityStore<IdeaEntity>(
                'ideas',
            ),

        projects:
            createEntityStore<ProjectEntity>(
                'projects',
            ),

        teamMemberships:
            createEntityStore<
                TeamMembershipEntity
            >('team_memberships'),
        teamMembershipProjects:
            createEntityStore<
                TeamMembershipProjectEntity
            >('team_membership_projects'),
        teamMembershipUsers:
            createEntityStore<
                TeamMembershipUserEntity
            >('team_membership_users'),

        activities:
            createEntityStore<ActivityEntity>(
                'activities',
            ),

        flows:
            createEntityStore<
                FlowEntity
            >('flows'),
        projectFlows:
            createEntityStore<
                ProjectFlowEntity
            >('project_flows'),
        workOrders:
            createEntityStore<
                WorkOrderEntity
            >('work_orders'),
        flowWorkOrders:
            createEntityStore<
                FlowWorkOrderEntity
            >('flow_work_orders'),
        workOrderTransitions:
            createEntityStore<
                WorkOrderTransitionEntity
            >('work_order_transitions'),
        workOrderClaims:
            createEntityStore<
                WorkOrderClaimEntity
            >('work_order_claims'),

        companySettings:
            createSingletonStore<
                CompanySettingsEntity
            >('company_settings'),

        account:
            createSingletonStore<AccountEntity>(
                'account',
            ),

        ideaSubmissions:
            createEntityStore<
                IdeaSubmissionEntity
            >('idea_submissions'),
        activityActors:
            createEntityStore<
                ActivityActorEntity
            >('activity_actors'),
    };

    return adapter;
}
