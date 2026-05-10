import {
    EntityNotFound,
    MissingTableError,
    TABLE_NAMES,
} from './db.ts';
import type {
    DbAdapter,
    DeletedStore,
    EntityStore,
    SingletonStore,
} from './db.ts';
import type {
    Deleted,
    PersonEntity,
    IdeaEntity,
    ProjectEntity,
    ActivityEntity,
    FlowEntity,
    FlowVersionEntity,
    OrganizationEntity,
    IdeaSubmissionEntity,
    ActivityActorEntity,
    ProjectFlowEntity,
    RoleEntity,
    RoleMembershipEntity,
    CrewEntity,
    CrewRoleMembershipEntity,
    ModelEntity,
    RoleModelMembershipEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    WorkOrderTransitionEntity,
    WorkOrderClaimEntity,
    TransitionFieldValueEntity,
} from './types.ts';
import { nowUtc } from './types.ts';
import {
    withSimulatedLatency,
    DEFAULT_LATENCY_CONFIG,
} from './latency.ts';
import {
    asString,
    validatePersonEntity,
    validateIdeaEntity,
    validateProjectEntity,
    validateActivityEntity,
    validateFlowEntity,
    validateFlowVersionEntity,
    validateProjectFlowEntity,
    validateWorkOrderEntity,
    validateFlowWorkOrderEntity,
    validateWorkOrderTransitionEntity,
    validateTransitionFieldValueEntity,
    validateWorkOrderClaimEntity,
    validateOrganizationEntity,
    validateIdeaSubmissionEntity,
    validateActivityActorEntity,
    validateRoleEntity,
    validateRoleMembershipEntity,
    validateCrewEntity,
    validateCrewRoleMembershipEntity,
    validateModelEntity,
    validateRoleModelMembershipEntity,
} from './validators.ts';

const KEY_PREFIX = 'fusion-ai:';

// Map table name → entity validator.
// 'deleted' rows have shape {id, deleted_at}
// — both plain strings; validated inline.
function validateSnapshotRow(
    table: string,
    row: Record<string, unknown>,
    rowIndex: number,
): void {
    const label =
        'snapshot.' + table
        + '[' + rowIndex + ']';
    // Entity validators enforce an exact
    // body-key set (no `id`). Stored rows
    // carry `id` as their storage key — strip
    // it before passing to each validator.
    const { id: _id, ...body } = row;
    try {
        switch (table) {
            case 'people':
                validatePersonEntity(body);
                break;
            case 'ideas':
                validateIdeaEntity(body);
                break;
            case 'projects':
                validateProjectEntity(body);
                break;
            case 'activities':
                validateActivityEntity(body);
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
            case 'work_order_transitions':
                validateWorkOrderTransitionEntity(
                    body,
                );
                break;
            case 'transition_field_values':
                validateTransitionFieldValueEntity(
                    body,
                );
                break;
            case 'work_order_claims':
                validateWorkOrderClaimEntity(body);
                break;
            case 'organization':
                validateOrganizationEntity(body);
                break;
            case 'idea_submissions':
                validateIdeaSubmissionEntity(body);
                break;
            case 'activity_actors':
                validateActivityActorEntity(body);
                break;
            case 'roles':
                validateRoleEntity(body);
                break;
            case 'role_memberships':
                validateRoleMembershipEntity(body);
                break;
            case 'crews':
                validateCrewEntity(body);
                break;
            case 'crew_role_memberships':
                validateCrewRoleMembershipEntity(
                    body,
                );
                break;
            case 'models':
                validateModelEntity(body);
                break;
            case 'role_model_memberships':
                validateRoleModelMembershipEntity(
                    body,
                );
                break;
            case 'deleted':
                // Shape: {id, deleted_at}
                asString(row['id'], label + '.id');
                asString(
                    row['deleted_at'],
                    label + '.deleted_at',
                );
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

const COMPRESSED_TABLES: ReadonlySet<string> = new Set([
    'work_order_transitions',
    'flow_versions',
]);

const COMPRESSION_PREFIX = 'gz1:';

const SIMULATE_LATENCY_PARAM =
    'simulate-latency';

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

async function compressJson(
    json: string,
): Promise<string> {
    const stream = new Blob([json]).stream().pipeThrough(
        new CompressionStream('gzip'),
    );
    const buffer =
        await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return COMPRESSION_PREFIX + btoa(binary);
}

async function decompressJson(
    stored: string,
): Promise<string> {
    if (!stored.startsWith(COMPRESSION_PREFIX)) {
        return stored;
    }
    const b64 = stored.slice(COMPRESSION_PREFIX.length);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(
        new DecompressionStream('gzip'),
    );
    return new Response(stream).text();
}

async function readTable<T>(
    tableName: string,
): Promise<T[]> {
    const raw = localStorage.getItem(
        KEY_PREFIX + tableName,
    );
    if (raw === null) {
        throw new MissingTableError(tableName);
    }
    let json: string;
    if (COMPRESSED_TABLES.has(tableName)) {
        try {
            json = await decompressJson(raw);
        } catch (e) {
            throw new Error(
                'Decompressing table "'
                + tableName + '" failed: '
                + (e instanceof Error
                    ? e.message
                    : String(e)),
            );
        }
    } else {
        json = raw;
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch (e) {
        throw new Error(
            'Parsing table "'
            + tableName + '" failed: '
            + (e instanceof Error
                ? e.message
                : String(e)),
        );
    }
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
}

async function writeTable<T>(
    tableName: string,
    rows: T[],
): Promise<void> {
    const json = JSON.stringify(rows);
    const payload = COMPRESSED_TABLES.has(tableName)
        ? await compressJson(json)
        : json;
    try {
        localStorage.setItem(
            KEY_PREFIX + tableName,
            payload,
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

// Serializes async writes per store. Without this, two
// Promise.all'd puts both await readTable, both see the
// pre-write array, and both write back a 1-row result
// (last writer wins). The chain forces each write to
// observe the prior write's effect.
function createSerializer():
    <R>(fn: () => Promise<R>) => Promise<R> {
    let tail: Promise<unknown> = Promise.resolve();
    return function run<R>(
        fn: () => Promise<R>,
    ): Promise<R> {
        const next = tail.then(fn, fn);
        tail = next.then(
            () => undefined,
            () => undefined,
        );
        return next as Promise<R>;
    };
}

function createDeletedStore(): DeletedStore {
    const TABLE = 'deleted';
    const serialize = createSerializer();
    return {
        async isDeleted(
            id: string,
        ): Promise<boolean> {
            const rows = await readTable<Deleted>(
                TABLE,
            );
            return rows.some(r => r.id === id);
        },
        async record(id: string): Promise<void> {
            return serialize(async () => {
                const rows = await readTable<Deleted>(
                    TABLE,
                );
                if (
                    rows.some(r => r.id === id)
                ) return;
                const next: Deleted[] = [
                    ...rows,
                    {
                        id,
                        deleted_at: nowUtc(),
                    },
                ];
                await writeTable(TABLE, next);
            });
        },
        async allDeletedIds(
        ): Promise<Set<string>> {
            const rows = await readTable<Deleted>(
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
    const serialize = createSerializer();
    return {
        async getAll(): Promise<T[]> {
            const rows = await readTable<T>(tableName);
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
            const rows = await readTable<T>(tableName);
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
            return serialize(async () => {
                const rows = await readTable<T>(
                    tableName,
                );
                const index = rows.findIndex(
                    entity => entity.id === id,
                );
                const serialized = serializeRecord(
                    fields as Record<string, unknown>,
                    tableName,
                );
                const written = {
                    ...serialized,
                    id,
                } as T;
                const next = index >= 0
                    ? rows.with(index, written)
                    : [...rows, written];
                await writeTable(tableName, next);
                return written;
            });
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
    const serialize = createSerializer();
    return {
        async getAll(): Promise<T[]> {
            return await readTable<T>(tableName);
        },
        async getById(
            id: string,
        ): Promise<T> {
            const rows = await readTable<T>(tableName);
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
            return serialize(async () => {
                const rows = await readTable<T>(
                    tableName,
                );
                const index = rows.findIndex(
                    entity => entity.id === id,
                );
                const serialized = serializeRecord(
                    fields as Record<string, unknown>,
                    tableName,
                );
                const written = {
                    ...serialized,
                    id,
                } as T;
                const next = index >= 0
                    ? rows.with(index, written)
                    : [...rows, written];
                await writeTable(tableName, next);
                return written;
            });
        },
        async delete(id: string): Promise<void> {
            return serialize(async () => {
                const rows = await readTable<T>(
                    tableName,
                );
                const idx = rows.findIndex(
                    e => e.id === id,
                );
                if (idx >= 0) {
                    await writeTable(
                        tableName,
                        rows.toSpliced(idx, 1),
                    );
                }
            });
        },
    };
}

function createSingletonStore<
    T extends { id: string },
>(tableName: string): SingletonStore<T> {
    const serialize = createSerializer();
    return {
        async get(): Promise<T> {
            const rows = await readTable<T>(tableName);
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
            return serialize(async () => {
                const rows = await readTable<T>(
                    tableName,
                );
                const serialized = serializeRecord(
                    fields as Record<string, unknown>,
                    tableName,
                );
                const index = rows.findIndex(
                    entity => entity.id === '1',
                );
                const written = {
                    ...serialized,
                    id: '1',
                } as T;
                const next = index >= 0
                    ? rows.with(index, written)
                    : [...rows, written];
                await writeTable(tableName, next);
                return written;
            });
        },
    };
}

async function clearAllTables(): Promise<void> {
    for (const table of TABLE_NAMES) {
        localStorage.removeItem(
            KEY_PREFIX + table,
        );
    }
}

async function hasAnyTable(): Promise<boolean> {
    return TABLE_NAMES.some(
        table =>
            localStorage.getItem(
                KEY_PREFIX + table,
            ) !== null,
    );
}

async function seedEmptyTables(): Promise<void> {
    for (const table of TABLE_NAMES) {
        if (
            localStorage.getItem(
                KEY_PREFIX + table,
            ) === null
        ) {
            await writeTable(table, []);
        }
    }
}

async function serializeAllTables(
): Promise<string> {
    const snapshot: Record<
        string,
        unknown[]
    > = {};
    for (const table of TABLE_NAMES) {
        snapshot[table] = await readTable(
            table,
        );
    }
    return JSON.stringify(snapshot, null, 2);
}

// Parses + validates the snapshot JSON, returning
// per-table serialized payloads ready for storage.
// Throws with a precise message identifying which
// table or row failed validation. Pure (no I/O).
async function parseAndValidateSnapshot(
    json: string,
): Promise<Map<string, string>> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        throw new Error(
            'Invalid snapshot:'
            + ' not valid JSON.',
        );
    }
    if (
        typeof parsed !== 'object'
        || parsed === null
        || Array.isArray(parsed)
    ) {
        throw new Error(
            'Invalid snapshot: expected'
            + ' an object with table'
            + ' keys.',
        );
    }
    const record = parsed as Record<
        string, unknown
    >;
    const serialized = new Map<string, string>();
    for (const table of TABLE_NAMES) {
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
        const rowArr =
            Array.isArray(rows) ? rows : [];
        for (let i = 0; i < rowArr.length; i++) {
            const row = rowArr[i];
            if (
                typeof row !== 'object'
                || row === null
                || Array.isArray(row)
            ) {
                throw new Error(
                    'Invalid snapshot:'
                    + ' row '
                    + i
                    + ' in table "'
                    + table
                    + '" is not an'
                    + ' object.',
                );
            }
            const r = row as Record<
                string, unknown
            >;
            validateSnapshotRow(table, r, i);
        }
        serialized.set(
            table, JSON.stringify(rowArr),
        );
    }
    return serialized;
}

// Wipes existing tables, then writes serialized
// payloads. On mid-write failure (e.g. quota
// exceeded), wipes everything so the next
// bootstrap detects no schema and routes the
// user to re-import. Real atomicity arrives
// with Postgres.
async function applyValidatedSnapshot(
    serialized: Map<string, string>,
): Promise<void> {
    await clearAllTables();
    try {
        for (
            const [table, json] of serialized
        ) {
            const payload =
                COMPRESSED_TABLES.has(table)
                    ? await compressJson(json)
                    : json;
            localStorage.setItem(
                KEY_PREFIX + table, payload,
            );
        }
    } catch (err) {
        await clearAllTables();
        throw err;
    }
}

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

        deleteSchema: clearAllTables,
        hasSchema: hasAnyTable,
        createSchema: seedEmptyTables,
        exportSnapshot: serializeAllTables,

        async importSnapshot(
            json: string,
        ): Promise<void> {
            const serialized =
                await parseAndValidateSnapshot(
                    json,
                );
            await applyValidatedSnapshot(
                serialized,
            );
        },

        people:
            createEntityStore<PersonEntity>(
                'people',
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
        transitionFieldValues:
            createEntityStore<
                TransitionFieldValueEntity
            >(
                'transition_field_values',
                deletedStore,
            ),
        workOrderClaims:
            createEntityStore<
                WorkOrderClaimEntity
            >(
                'work_order_claims',
                deletedStore,
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
        roles:
            createEntityStore<
                RoleEntity
            >('roles', deletedStore),
        roleMemberships:
            createEntityStore<
                RoleMembershipEntity
            >(
                'role_memberships',
                deletedStore,
            ),
        crews:
            createEntityStore<
                CrewEntity
            >('crews', deletedStore),
        crewRoleMemberships:
            createEntityStore<
                CrewRoleMembershipEntity
            >(
                'crew_role_memberships',
                deletedStore,
            ),
        models:
            createEntityStore<
                ModelEntity
            >('models', deletedStore),
        roleModelMemberships:
            createEntityStore<
                RoleModelMembershipEntity
            >(
                'role_model_memberships',
                deletedStore,
            ),
        deleted: deletedStore,
    };

    return simulateLatencyRequested()
        ? withSimulatedLatency(
            adapter,
            DEFAULT_LATENCY_CONFIG,
        )
        : adapter;
}
