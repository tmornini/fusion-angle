import type {
    DbAdapter,
    EntityStore,
    SingletonStore,
} from './db';
import type {
    UserEntity,
    IdeaEntity,
    IdeaScoreEntity,
    ProjectEntity,
    ProjectTeamEntity,
    MilestoneEntity,
    ProjectTaskEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    EdgeEntity,
    EdgeOutcomeEntity,
    EdgeMetricEntity,
    ActivityEntity,
    ClarificationEntity,
    CrunchColumnEntity,
    FlowEntity,
    FlowStepEntity,
    CompanySettingsEntity,
    AccountEntity,
} from './types';
import { nowUtc } from './types';

const KEY_PREFIX = 'fusion-ai:';

function readTable<T>(
    tableName: string,
    includeDeleted = false,
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
        if (!includeDeleted) {
            return parsed.filter(
                (row: Record<string, unknown>) =>
                    !row.deleted_at,
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

function serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'boolean') {
        return value ? 1 : 0;
    }
    return value;
}

function serializeRecord<T>(
    record: Partial<T>,
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
        result[key] =
            serializeValue(value);
    }
    return result;
}

function generateCompositeId(
    prefix: string,
    ...parts: string[]
): string {
    return `${prefix}-${parts.join('-')}`;
}

function migrateRenamedFields(
    tableName: string,
    renames: {
        from: string;
        to: string;
        transform?: (v: unknown) => unknown;
    }[],
): void {
    const key = KEY_PREFIX + tableName;
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    try {
        const rows = JSON.parse(raw);
        if (!Array.isArray(rows)) return;
        const needsMigration = rows.some(
            (r: Record<string, unknown>) =>
                renames.some(re => re.from in r),
        );
        if (!needsMigration) return;
        for (const row of rows) {
            for (const { from, to, transform }
                of renames) {
                if (from in row) {
                    row[to] = transform
                        ? transform(row[from])
                        : row[from];
                    delete row[from];
                }
            }
        }
        localStorage.setItem(
            key,
            JSON.stringify(rows),
        );
    } catch {
        /* corrupt JSON — readTable will
           throw when the page loads */
    }
}

function createEntityStore<
    T extends { id: string },
>(tableName: string): EntityStore<T> {
    return {
        async getAll(): Promise<T[]> {
            return readTable<T>(tableName);
        },
        async getById(
            id: string,
        ): Promise<T | null> {
            const rows = readTable<T>(tableName);
            return (
                rows.find(
                    entity => entity.id === id,
                ) ?? null
            );
        },
        async put(
            id: string,
            fields: Partial<T>,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const index = rows.findIndex(
                entity => entity.id === id,
            );
            const serialized =
                serializeRecord(fields);

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
            const rows = readTable<T>(tableName);
            const row = rows.find(
                entity => entity.id === '1',
            );
            if (row) return row;
            const defaultEntity = {
                id: '1',
            } as T;
            writeTable(tableName, [defaultEntity]);
            return defaultEntity;
        },
        async put(
            fields: Partial<T>,
        ): Promise<T> {
            const rows = readTable<T>(tableName);
            const serialized =
                serializeRecord(fields);
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
    'idea_scores',
    'projects',
    'project_team',
    'milestones',
    'project_tasks',
    'discussions',
    'project_versions',
    'edges',
    'edge_outcomes',
    'edge_metrics',
    'activities',
    'clarifications',
    'crunch_columns',
    'processes',
    'process_steps',
    'company_settings',
    'account',
];

export async function createLocalStorageAdapter(
): Promise<DbAdapter> {
    // Migrate account_config → account
    const oldAccountKey =
        KEY_PREFIX + 'account_config';
    const newAccountKey =
        KEY_PREFIX + 'account';
    if (
        localStorage.getItem(oldAccountKey)
            !== null
        && localStorage.getItem(newAccountKey)
            === null
    ) {
        localStorage.setItem(
            newAccountKey,
            localStorage.getItem(oldAccountKey)!,
        );
        localStorage.removeItem(oldAccountKey);
    }

    migrateRenamedFields('ideas', [
        {
            from: 'estimated_time',
            to: 'estimated_duration',
            transform: v => (v as number) * 3600,
        },
        {
            from: 'effort_time_estimate',
            to: 'effort_duration_estimate',
        },
    ]);
    migrateRenamedFields('idea_scores', [
        {
            from: 'estimated_time',
            to: 'estimated_duration',
        },
    ]);

    const edgeStore =
        createEntityStore<EdgeEntity>('edges');
    const milestoneStore =
        createEntityStore<MilestoneEntity>(
            'milestones',
        );
    const projectTaskStore =
        createEntityStore<ProjectTaskEntity>(
            'project_tasks',
        );
    const discussionStore =
        createEntityStore<DiscussionEntity>(
            'discussions',
        );
    const projectVersionStore =
        createEntityStore<ProjectVersionEntity>(
            'project_versions',
        );
    const edgeOutcomeStore =
        createEntityStore<EdgeOutcomeEntity>(
            'edge_outcomes',
        );
    const clarificationStore =
        createEntityStore<ClarificationEntity>(
            'clarifications',
        );
    const flowStepStore =
        createEntityStore<FlowStepEntity>(
            'process_steps',
        );

    const adapter: DbAdapter = {
        async initialize(): Promise<void> {
            // No schema needed — tables
            // auto-create on first write
        },

        async close(): Promise<void> {
            // No cleanup needed — writes
            // are immediate
        },

        async flush(): Promise<void> {
            // No-op — writes are immediate
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
            // Pre-serialize all table data
            // before any destructive operation
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

            // Now perform the swap — all
            // serialization is done, so
            // failures here are minimized
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

        ideaScores: {
            async getByIdeaId(
                ideaId: string,
            ): Promise<IdeaScoreEntity | null> {
                const rows =
                    readTable<IdeaScoreEntity>(
                        'idea_scores',
                    );
                return (
                    rows.find(
                        entity =>
                            entity.idea_id
                            === ideaId,
                    ) ?? null
                );
            },
            async put(
                ideaId: string,
                fields: Partial<
                    IdeaScoreEntity
                >,
            ): Promise<IdeaScoreEntity> {
                const rows =
                    readTable<IdeaScoreEntity>(
                        'idea_scores',
                    );
                const serialized =
                    serializeRecord(fields);
                const index = rows.findIndex(
                    entity =>
                        entity.idea_id
                        === ideaId,
                );
                const fid =
                    fields.id as string;
                const existing =
                    rows[index];
                const id =
                    existing
                        ? existing.id
                        : (fid
                            ?? generateCompositeId(
                                'score',
                                ideaId,
                            ));

                if (index >= 0) {
                    rows[index] = {
                        ...rows[index]!,
                        ...serialized,
                        id,
                        idea_id: ideaId,
                    } as IdeaScoreEntity;
                } else {
                    rows.push({
                        id,
                        ...serialized,
                        idea_id: ideaId,
                    } as IdeaScoreEntity);
                }

                writeTable(
                    'idea_scores',
                    rows,
                );
                const pos = index >= 0
                    ? index
                    : rows.length - 1;
                const written = rows[pos];
                if (!written) {
                    throw new Error(
                        'Internal error: entity'
                        + ' not found after'
                        + ' write',
                    );
                }
                return written;
            },
        },

        projects:
            createEntityStore<ProjectEntity>(
                'projects',
            ),

        projectTeam: {
            async getByProjectId(
                projectId: string,
            ): Promise<ProjectTeamEntity[]> {
                return readTable<
                    ProjectTeamEntity
                >('project_team').filter(
                    entity =>
                        entity.project_id
                        === projectId,
                );
            },
            async put(
                projectId: string,
                userId: string,
                fields: Partial<
                    ProjectTeamEntity
                >,
            ): Promise<ProjectTeamEntity> {
                const rows =
                    readTable<
                        ProjectTeamEntity
                    >('project_team');
                const serialized =
                    serializeRecord(fields);
                const index = rows.findIndex(
                    entity =>
                        entity.project_id
                            === projectId
                        && entity.user_id
                            === userId,
                );
                const fid =
                    fields.id as string;
                const existing =
                    rows[index];
                const id =
                    existing
                        ? existing.id
                        : (fid
                            ?? generateCompositeId(
                                'pt',
                                projectId,
                                userId,
                            ));

                if (index >= 0) {
                    rows[index] = {
                        ...rows[index]!,
                        ...serialized,
                        id,
                        project_id: projectId,
                        user_id: userId,
                    } as ProjectTeamEntity;
                } else {
                    rows.push({
                        id,
                        ...serialized,
                        project_id: projectId,
                        user_id: userId,
                    } as ProjectTeamEntity);
                }

                writeTable(
                    'project_team',
                    rows,
                );
                const pos = index >= 0
                    ? index
                    : rows.length - 1;
                const written = rows[pos];
                if (!written) {
                    throw new Error(
                        'Internal error: entity'
                        + ' not found after'
                        + ' write',
                    );
                }
                return written;
            },
        },

        milestones: Object.assign(
            milestoneStore,
            {
                async getByProjectId(
                    projectId: string,
                ): Promise<MilestoneEntity[]> {
                    return readTable<
                        MilestoneEntity
                    >('milestones')
                        .filter(
                            entity =>
                                entity
                                    .project_id
                                === projectId,
                        )
                        .sort(
                            (a, b) =>
                                a.sort_order
                                - b.sort_order,
                        );
                },
            },
        ),

        projectTasks: Object.assign(
            projectTaskStore,
            {
                async getByProjectId(
                    projectId: string,
                ): Promise<
                    ProjectTaskEntity[]
                > {
                    return readTable<
                        ProjectTaskEntity
                    >('project_tasks').filter(
                        entity =>
                            entity.project_id
                            === projectId,
                    );
                },
            },
        ),

        discussions: Object.assign(
            discussionStore,
            {
                async getByProjectId(
                    projectId: string,
                ): Promise<
                    DiscussionEntity[]
                > {
                    return readTable<
                        DiscussionEntity
                    >('discussions')
                        .filter(
                            entity =>
                                entity
                                    .project_id
                                === projectId,
                        )
                        .sort((a, b) =>
                            b.date.localeCompare(
                                a.date,
                            ),
                        );
                },
            },
        ),

        projectVersions: Object.assign(
            projectVersionStore,
            {
                async getByProjectId(
                    projectId: string,
                ): Promise<
                    ProjectVersionEntity[]
                > {
                    return readTable<
                        ProjectVersionEntity
                    >('project_versions')
                        .filter(
                            entity =>
                                entity
                                    .project_id
                                === projectId,
                        )
                        .sort((a, b) =>
                            b.date.localeCompare(
                                a.date,
                            ),
                        );
                },
            },
        ),

        edges: Object.assign(edgeStore, {
            async getByIdeaId(
                ideaId: string,
            ): Promise<EdgeEntity | null> {
                return (
                    readTable<EdgeEntity>(
                        'edges',
                    ).find(
                        entity =>
                            entity.idea_id
                            === ideaId,
                    ) ?? null
                );
            },
        }),

        edgeOutcomes: Object.assign(
            edgeOutcomeStore,
            {
                async getByEdgeId(
                    edgeId: string,
                ): Promise<
                    EdgeOutcomeEntity[]
                > {
                    return readTable<
                        EdgeOutcomeEntity
                    >('edge_outcomes').filter(
                        entity =>
                            entity.edge_id
                            === edgeId,
                    );
                },
            },
        ),

        edgeMetrics:
            createEntityStore<EdgeMetricEntity>(
                'edge_metrics',
            ),
        activities:
            createEntityStore<ActivityEntity>(
                'activities',
            ),

        clarifications: Object.assign(
            clarificationStore,
            {
                async getByProjectId(
                    projectId: string,
                ): Promise<
                    ClarificationEntity[]
                > {
                    return readTable<
                        ClarificationEntity
                    >(
                        'clarifications',
                    ).filter(
                        entity =>
                            entity.project_id
                            === projectId,
                    );
                },
            },
        ),

        crunchColumns:
            createEntityStore<
                CrunchColumnEntity
            >('crunch_columns'),
        flows:
            createEntityStore<FlowEntity>(
                'processes',
            ),

        flowSteps: Object.assign(
            flowStepStore,
            {
                async getByFlowId(
                    processId: string,
                ): Promise<FlowStepEntity[]> {
                    return readTable<
                        FlowStepEntity
                    >('process_steps')
                        .filter(
                            entity =>
                                entity
                                    .process_id
                                === processId,
                        )
                        .sort(
                            (a, b) =>
                                a.sort_order
                                - b.sort_order,
                        );
                },
            },
        ),

        companySettings:
            createSingletonStore<
                CompanySettingsEntity
            >('company_settings'),

        account:
            createSingletonStore<AccountEntity>(
                'account',
            ),
    };

    return adapter;
}
