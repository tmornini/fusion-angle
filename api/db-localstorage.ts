import type {
    DbAdapter,
    EntityStore,
    SingletonStore,
} from './db';
import type {
    UserEntity,
    IdeaEntity,
    IdeaScoreEntity,
    IdeaScoreIdeaEntity,
    ProjectEntity,
    TeamMembershipEntity,
    TeamMembershipProjectEntity,
    TeamMembershipUserEntity,
    MilestoneEntity,
    MilestoneProjectEntity,
    ProjectTaskEntity,
    ProjectTaskProjectEntity,
    DiscussionEntity,
    ProjectVersionEntity,
    ProjectVersionProjectEntity,
    EdgeEntity,
    EdgeOutcomeEntity,
    EdgeOutcomeEdgeEntity,
    EdgeMetricEntity,
    EdgeMetricOutcomeEntity,
    ActivityEntity,
    ClarificationEntity,
    ClarificationAnswerEntity,
    ClarificationAnswerClarificationEntity,
    CrunchColumnEntity,
    CrunchColumnAcronymEntity,
    CrunchColumnAcronymLinkEntity,
    FlowEntity,
    FlowStepEntity,
    CompanySettingsEntity,
    AccountEntity,
    IdeaSubmissionEntity,
    IdeaProjectLinkEntity,
    EdgeIdeaEntity,
    EdgeOwnershipEntity,
    TaskAssignmentEntity,
    DiscussionAuthorshipEntity,
    DiscussionProjectEntity,
    VersionAuthorshipEntity,
    ActivityActorEntity,
    ClarificationAskerEntity,
    ClarificationAnswererEntity,
    ClarificationProjectEntity,
    ProcessStepProcessEntity,
} from './types';
import { nowUtc } from './types';

const KEY_PREFIX = 'fusion-ai:';

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
        ): Promise<T | null> {
            const rows = readTable<T>(
                tableName, false,
            );
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
    'idea_scores',
    'idea_score_ideas',
    'projects',
    'team_memberships',
    'team_membership_projects',
    'team_membership_users',
    'milestones',
    'project_tasks',
    'discussions',
    'project_versions',
    'edges',
    'edge_outcomes',
    'edge_outcome_edges',
    'edge_metrics',
    'edge_metric_outcomes',
    'activities',
    'clarifications',
    'clarification_answers',
    'clarification_answer_clarifications',
    'crunch_columns',
    'crunch_column_acronyms',
    'crunch_column_acronym_links',
    'processes',
    'process_steps',
    'company_settings',
    'account',
    'idea_submissions',
    'idea_project_links',
    'edge_ideas',
    'edge_ownerships',
    'task_assignments',
    'discussion_authorships',
    'discussion_projects',
    'version_authorships',
    'activity_actors',
    'clarification_askers',
    'clarification_answerers',
    'clarification_projects',
    'project_task_projects',
    'process_step_processes',
    'milestone_projects',
    'project_version_projects',
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

        ideaScores:
            createEntityStore<
                IdeaScoreEntity
            >('idea_scores'),
        ideaScoreIdeas:
            createEntityStore<
                IdeaScoreIdeaEntity
            >('idea_score_ideas'),

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

        milestones:
            createEntityStore<MilestoneEntity>(
                'milestones',
            ),
        milestoneProjects:
            createEntityStore<
                MilestoneProjectEntity
            >('milestone_projects'),

        projectTasks:
            createEntityStore<
                ProjectTaskEntity
            >('project_tasks'),
        projectTaskProjects:
            createEntityStore<
                ProjectTaskProjectEntity
            >('project_task_projects'),

        discussions:
            createEntityStore<
                DiscussionEntity
            >('discussions'),
        discussionProjects:
            createEntityStore<
                DiscussionProjectEntity
            >('discussion_projects'),

        projectVersions:
            createEntityStore<
                ProjectVersionEntity
            >('project_versions'),
        projectVersionProjects:
            createEntityStore<
                ProjectVersionProjectEntity
            >('project_version_projects'),

        edges:
            createEntityStore<EdgeEntity>(
                'edges',
            ),
        edgeIdeas:
            createEntityStore<
                EdgeIdeaEntity
            >('edge_ideas'),

        edgeOutcomes:
            createEntityStore<
                EdgeOutcomeEntity
            >('edge_outcomes'),
        edgeOutcomeEdges:
            createEntityStore<
                EdgeOutcomeEdgeEntity
            >('edge_outcome_edges'),

        edgeMetrics:
            createEntityStore<EdgeMetricEntity>(
                'edge_metrics',
            ),
        edgeMetricOutcomes:
            createEntityStore<
                EdgeMetricOutcomeEntity
            >('edge_metric_outcomes'),
        activities:
            createEntityStore<ActivityEntity>(
                'activities',
            ),

        clarifications:
            createEntityStore<
                ClarificationEntity
            >('clarifications'),
        clarificationAnswers:
            createEntityStore<
                ClarificationAnswerEntity
            >('clarification_answers'),
        clarificationAnswerClarifications:
            createEntityStore<
                ClarificationAnswerClarificationEntity
            >(
                'clarification_answer'
                + '_clarifications',
            ),
        clarificationProjects:
            createEntityStore<
                ClarificationProjectEntity
            >('clarification_projects'),

        crunchColumns:
            createEntityStore<
                CrunchColumnEntity
            >('crunch_columns'),
        crunchColumnAcronyms:
            createEntityStore<
                CrunchColumnAcronymEntity
            >('crunch_column_acronyms'),
        crunchColumnAcronymLinks:
            createEntityStore<
                CrunchColumnAcronymLinkEntity
            >('crunch_column_acronym_links'),
        flows:
            createEntityStore<FlowEntity>(
                'processes',
            ),

        flowSteps:
            createEntityStore<FlowStepEntity>(
                'process_steps',
            ),
        processStepProcesses:
            createEntityStore<
                ProcessStepProcessEntity
            >('process_step_processes'),

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
        ideaProjectLinks:
            createEntityStore<
                IdeaProjectLinkEntity
            >('idea_project_links'),
        edgeOwnerships:
            createEntityStore<
                EdgeOwnershipEntity
            >('edge_ownerships'),
        taskAssignments:
            createEntityStore<
                TaskAssignmentEntity
            >('task_assignments'),
        discussionAuthorships:
            createEntityStore<
                DiscussionAuthorshipEntity
            >('discussion_authorships'),
        versionAuthorships:
            createEntityStore<
                VersionAuthorshipEntity
            >('version_authorships'),
        activityActors:
            createEntityStore<
                ActivityActorEntity
            >('activity_actors'),
        clarificationAskers:
            createEntityStore<
                ClarificationAskerEntity
            >('clarification_askers'),
        clarificationAnswerers:
            createEntityStore<
                ClarificationAnswererEntity
            >('clarification_answerers'),
    };

    return adapter;
}
