// ============================================
// FUSION AI — localStorage Database Implementation
// Pure localStorage with JSON serialization.
// Works on file:/// and http(s):// protocols.
// ============================================

import type { DbAdapter, EntityStore, SingletonStore } from './db';
import type {
  UserEntity, IdeaEntity, IdeaScoreEntity, ProjectEntity, ProjectTeamEntity,
  MilestoneEntity, ProjectTaskEntity, DiscussionEntity, ProjectVersionEntity,
  EdgeEntity, EdgeOutcomeEntity, EdgeMetricEntity, ActivityEntity, NotificationEntity,
  ClarificationEntity, CrunchColumnEntity, ProcessEntity, ProcessStepEntity,
  CompanySettingsEntity, NotificationCategoryEntity, NotificationPreferenceEntity,
  AccountEntity,
} from './types';

const KEY_PREFIX = 'fusion-ai:';

// ── Helpers ────────────────────────────────

function readTable<T>(tableName: string, includeDeleted = false): T[] {
  const raw = localStorage.getItem(KEY_PREFIX + tableName);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      console.warn(`fusion-ai: table "${tableName}" is not an array, resetting.`);
      return [];
    }
    if (!includeDeleted) {
      return parsed.filter((row: Record<string, unknown>) => !row.deleted_at) as T[];
    }
    return parsed as T[];
  } catch {
    console.warn(`fusion-ai: table "${tableName}" has corrupt JSON, resetting.`);
    return [];
  }
}

function writeTable<T>(tableName: string, rows: T[]): void {
  localStorage.setItem(KEY_PREFIX + tableName, JSON.stringify(rows));
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

function serializeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = serializeValue(value);
  }
  return result;
}

// ── Generic store factories ──────────────

function createEntityStore<T extends { id: string }>(tableName: string): EntityStore<T> {
  return {
    async getAll(): Promise<T[]> {
      return readTable<T>(tableName);
    },
    async getById(id: string): Promise<T | null> {
      const rows = readTable<T>(tableName);
      return rows.find(entity => entity.id === id) ?? null;
    },
    async put(id: string, fields: Record<string, unknown>): Promise<T> {
      const rows = readTable<T>(tableName);
      const index = rows.findIndex(entity => entity.id === id);
      const serialized = serializeRecord(fields);

      if (index >= 0) {
        rows[index] = { ...rows[index]!, ...serialized, id } as T;
      } else {
        rows.push({ id, ...serialized } as T);
      }

      writeTable(tableName, rows);
      return rows[index >= 0 ? index : rows.length - 1]!;
    },
    async delete(id: string): Promise<void> {
      const rows = readTable<T>(tableName, true);
      const entity = rows.find(e => e.id === id);
      if (entity) {
        (entity as Record<string, unknown>).deleted_at = new Date().toISOString();
        writeTable(tableName, rows);
      }
    },
  };
}

function createSingletonStore<T extends { id: string }>(tableName: string): SingletonStore<T> {
  return {
    async get(): Promise<T> {
      const rows = readTable<T>(tableName);
      const row = rows.find(entity => entity.id === '1');
      if (row) return row;
      const defaultEntity = { id: '1' } as T;
      writeTable(tableName, [defaultEntity]);
      return defaultEntity;
    },
    async put(fields: Record<string, unknown>): Promise<T> {
      const rows = readTable<T>(tableName);
      const serialized = serializeRecord(fields);
      const index = rows.findIndex(entity => entity.id === '1');

      if (index >= 0) {
        rows[index] = { ...rows[index]!, ...serialized, id: '1' } as T;
      } else {
        rows.push({ id: '1', ...serialized } as T);
      }

      writeTable(tableName, rows);
      return rows[index >= 0 ? index : rows.length - 1]!;
    },
  };
}

// ── Table list for bulk operations ─────────

const TABLE_NAMES = [
  'users', 'ideas', 'idea_scores', 'projects', 'project_team',
  'milestones', 'project_tasks', 'discussions', 'project_versions',
  'edges', 'edge_outcomes', 'edge_metrics', 'activities', 'notifications',
  'clarifications', 'crunch_columns', 'processes', 'process_steps',
  'company_settings', 'notification_categories', 'notification_preferences',
  'account',
];

// ── Adapter factory ──────────────────────

export async function createLocalStorageAdapter(): Promise<DbAdapter> {
  // Migrate account_config → account (one-time rename)
  const oldAccountKey = KEY_PREFIX + 'account_config';
  const newAccountKey = KEY_PREFIX + 'account';
  if (localStorage.getItem(oldAccountKey) !== null && localStorage.getItem(newAccountKey) === null) {
    localStorage.setItem(newAccountKey, localStorage.getItem(oldAccountKey)!);
    localStorage.removeItem(oldAccountKey);
  }

  // Migrate notification_prefs → notification_preferences (one-time rename)
  const oldPrefsKey = KEY_PREFIX + 'notification_prefs';
  const newPrefsKey = KEY_PREFIX + 'notification_preferences';
  if (localStorage.getItem(oldPrefsKey) !== null && localStorage.getItem(newPrefsKey) === null) {
    localStorage.setItem(newPrefsKey, localStorage.getItem(oldPrefsKey)!);
    localStorage.removeItem(oldPrefsKey);
  }

  const edgeStore = createEntityStore<EdgeEntity>('edges');
  const milestoneStore = createEntityStore<MilestoneEntity>('milestones');
  const projectTaskStore = createEntityStore<ProjectTaskEntity>('project_tasks');
  const discussionStore = createEntityStore<DiscussionEntity>('discussions');
  const projectVersionStore = createEntityStore<ProjectVersionEntity>('project_versions');
  const edgeOutcomeStore = createEntityStore<EdgeOutcomeEntity>('edge_outcomes');
  const clarificationStore = createEntityStore<ClarificationEntity>('clarifications');
  const processStepStore = createEntityStore<ProcessStepEntity>('process_steps');

  const adapter: DbAdapter = {
    async initialize(): Promise<void> {
      // No schema needed — tables auto-create on first write
    },

    async close(): Promise<void> {
      // No cleanup needed — writes are immediate
    },

    async flush(): Promise<void> {
      // No-op — writes are immediate
    },

    async wipeAllData(): Promise<void> {
      for (const table of TABLE_NAMES) {
        localStorage.removeItem(KEY_PREFIX + table);
      }
    },

    async hasSchema(): Promise<boolean> {
      return TABLE_NAMES.some(table => localStorage.getItem(KEY_PREFIX + table) !== null);
    },

    async createSchema(): Promise<void> {
      for (const table of TABLE_NAMES) {
        if (localStorage.getItem(KEY_PREFIX + table) === null) {
          writeTable(table, []);
        }
      }
    },

    async exportSnapshot(): Promise<string> {
      const snapshot: Record<string, unknown[]> = {};
      for (const table of TABLE_NAMES) {
        snapshot[table] = readTable(table, true);
      }
      return JSON.stringify(snapshot, null, 2);
    },

    async importSnapshot(json: string): Promise<void> {
      let snapshot: unknown;
      try {
        snapshot = JSON.parse(json);
      } catch {
        throw new Error('Invalid snapshot: not valid JSON.');
      }
      if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
        throw new Error('Invalid snapshot: expected an object with table keys.');
      }
      const record = snapshot as Record<string, unknown>;
      for (const table of TABLE_NAMES) {
        const rows = record[table];
        if (rows !== undefined && !Array.isArray(rows)) {
          throw new Error(`Invalid snapshot: table "${table}" is not an array.`);
        }
      }
      for (const table of TABLE_NAMES) {
        localStorage.removeItem(KEY_PREFIX + table);
      }
      for (const table of TABLE_NAMES) {
        const rows = record[table];
        writeTable(table, Array.isArray(rows) ? rows : []);
      }
    },

    users: createEntityStore<UserEntity>('users'),
    ideas: createEntityStore<IdeaEntity>('ideas'),

    ideaScores: {
      async getByIdeaId(ideaId: string): Promise<IdeaScoreEntity | null> {
        const rows = readTable<IdeaScoreEntity>('idea_scores');
        return rows.find(entity => entity.idea_id === ideaId) ?? null;
      },
      async put(ideaId: string, fields: Record<string, unknown>): Promise<IdeaScoreEntity> {
        const rows = readTable<IdeaScoreEntity>('idea_scores');
        const serialized = serializeRecord(fields);
        const index = rows.findIndex(entity => entity.idea_id === ideaId);
        const id = index >= 0 ? rows[index]!.id : (fields.id as string ?? `score-${ideaId}`);

        if (index >= 0) {
          rows[index] = { ...rows[index]!, ...serialized, id, idea_id: ideaId } as IdeaScoreEntity;
        } else {
          rows.push({ id, ...serialized, idea_id: ideaId } as IdeaScoreEntity);
        }

        writeTable('idea_scores', rows);
        return rows[index >= 0 ? index : rows.length - 1]!;
      },
    },

    projects: createEntityStore<ProjectEntity>('projects'),

    projectTeam: {
      async getByProjectId(projectId: string): Promise<ProjectTeamEntity[]> {
        return readTable<ProjectTeamEntity>('project_team').filter(entity => entity.project_id === projectId);
      },
      async put(projectId: string, userId: string, fields: Record<string, unknown>): Promise<ProjectTeamEntity> {
        const rows = readTable<ProjectTeamEntity>('project_team');
        const serialized = serializeRecord(fields);
        const index = rows.findIndex(entity => entity.project_id === projectId && entity.user_id === userId);
        const id = index >= 0 ? rows[index]!.id : (fields.id as string ?? `pt-${projectId}-${userId}`);

        if (index >= 0) {
          rows[index] = { ...rows[index]!, ...serialized, id, project_id: projectId, user_id: userId } as ProjectTeamEntity;
        } else {
          rows.push({ id, ...serialized, project_id: projectId, user_id: userId } as ProjectTeamEntity);
        }

        writeTable('project_team', rows);
        return rows[index >= 0 ? index : rows.length - 1]!;
      },
    },

    milestones: Object.assign(milestoneStore, {
      async getByProjectId(projectId: string): Promise<MilestoneEntity[]> {
        return readTable<MilestoneEntity>('milestones')
          .filter(entity => entity.project_id === projectId)
          .sort((a, b) => a.sort_order - b.sort_order);
      },
    }),

    projectTasks: Object.assign(projectTaskStore, {
      async getByProjectId(projectId: string): Promise<ProjectTaskEntity[]> {
        return readTable<ProjectTaskEntity>('project_tasks').filter(entity => entity.project_id === projectId);
      },
    }),

    discussions: Object.assign(discussionStore, {
      async getByProjectId(projectId: string): Promise<DiscussionEntity[]> {
        return readTable<DiscussionEntity>('discussions')
          .filter(entity => entity.project_id === projectId)
          .sort((a, b) => b.date.localeCompare(a.date));
      },
    }),

    projectVersions: Object.assign(projectVersionStore, {
      async getByProjectId(projectId: string): Promise<ProjectVersionEntity[]> {
        return readTable<ProjectVersionEntity>('project_versions')
          .filter(entity => entity.project_id === projectId)
          .sort((a, b) => b.date.localeCompare(a.date));
      },
    }),

    edges: Object.assign(edgeStore, {
      async getByIdeaId(ideaId: string): Promise<EdgeEntity | null> {
        return readTable<EdgeEntity>('edges').find(entity => entity.idea_id === ideaId) ?? null;
      },
    }),

    edgeOutcomes: Object.assign(edgeOutcomeStore, {
      async getByEdgeId(edgeId: string): Promise<EdgeOutcomeEntity[]> {
        return readTable<EdgeOutcomeEntity>('edge_outcomes').filter(entity => entity.edge_id === edgeId);
      },
    }),

    edgeMetrics: createEntityStore<EdgeMetricEntity>('edge_metrics'),
    activities: createEntityStore<ActivityEntity>('activities'),
    notifications: createEntityStore<NotificationEntity>('notifications'),

    clarifications: Object.assign(clarificationStore, {
      async getByProjectId(projectId: string): Promise<ClarificationEntity[]> {
        return readTable<ClarificationEntity>('clarifications').filter(entity => entity.project_id === projectId);
      },
    }),

    crunchColumns: createEntityStore<CrunchColumnEntity>('crunch_columns'),
    processes: createEntityStore<ProcessEntity>('processes'),

    processSteps: Object.assign(processStepStore, {
      async getByProcessId(processId: string): Promise<ProcessStepEntity[]> {
        return readTable<ProcessStepEntity>('process_steps')
          .filter(entity => entity.process_id === processId)
          .sort((a, b) => a.sort_order - b.sort_order);
      },
    }),

    companySettings: createSingletonStore<CompanySettingsEntity>('company_settings'),
    notificationCategories: createEntityStore<NotificationCategoryEntity>('notification_categories'),

    notificationPreferences: Object.assign(
      createEntityStore<NotificationPreferenceEntity>('notification_preferences'),
      {
        async getByCategoryId(categoryId: string): Promise<NotificationPreferenceEntity[]> {
          return readTable<NotificationPreferenceEntity>('notification_preferences')
            .filter(entity => entity.category_id === categoryId);
        },
      },
    ),

    account: createSingletonStore<AccountEntity>('account'),
  };

  return adapter;
}
