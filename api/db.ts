// ============================================
// FUSION AI — Database Abstraction Interface
// ============================================

import type {
  UserEntity, IdeaEntity, IdeaScoreEntity, ProjectEntity, ProjectTeamEntity,
  MilestoneEntity, ProjectTaskEntity, DiscussionEntity, ProjectVersionEntity,
  EdgeEntity, EdgeOutcomeEntity, EdgeMetricEntity, ActivityEntity, NotificationEntity,
  ClarificationEntity, CrunchColumnEntity, ProcessEntity, ProcessStepEntity,
  CompanySettingsEntity, NotificationCategoryEntity, NotificationPreferenceEntity,
  AccountEntity,
} from './types';

export interface EntityStore<T> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  put(id: string, fields: Record<string, unknown>): Promise<T>;
  delete(id: string): Promise<void>;
}

export interface SingletonStore<T> {
  get(): Promise<T>;
  put(fields: Record<string, unknown>): Promise<T>;
}

export interface DbAdapter {
  initialize(): Promise<void>;
  close(): Promise<void>;
  flush(): Promise<void>;
  wipeAllData(): Promise<void>;
  hasSchema(): Promise<boolean>;
  createSchema(): Promise<void>;
  exportSnapshot(): Promise<string>;
  importSnapshot(json: string): Promise<void>;

  users: EntityStore<UserEntity>;
  ideas: EntityStore<IdeaEntity>;
  ideaScores: {
    getByIdeaId(ideaId: string): Promise<IdeaScoreEntity | null>;
    put(ideaId: string, fields: Record<string, unknown>): Promise<IdeaScoreEntity>;
  };
  projects: EntityStore<ProjectEntity>;
  projectTeam: {
    getByProjectId(projectId: string): Promise<ProjectTeamEntity[]>;
    put(projectId: string, userId: string, fields: Record<string, unknown>): Promise<ProjectTeamEntity>;
  };
  milestones: EntityStore<MilestoneEntity> & {
    getByProjectId(projectId: string): Promise<MilestoneEntity[]>;
  };
  projectTasks: EntityStore<ProjectTaskEntity> & {
    getByProjectId(projectId: string): Promise<ProjectTaskEntity[]>;
  };
  discussions: EntityStore<DiscussionEntity> & {
    getByProjectId(projectId: string): Promise<DiscussionEntity[]>;
  };
  projectVersions: EntityStore<ProjectVersionEntity> & {
    getByProjectId(projectId: string): Promise<ProjectVersionEntity[]>;
  };
  edges: EntityStore<EdgeEntity> & {
    getByIdeaId(ideaId: string): Promise<EdgeEntity | null>;
  };
  edgeOutcomes: EntityStore<EdgeOutcomeEntity> & {
    getByEdgeId(edgeId: string): Promise<EdgeOutcomeEntity[]>;
  };
  edgeMetrics: EntityStore<EdgeMetricEntity>;
  activities: EntityStore<ActivityEntity>;
  notifications: EntityStore<NotificationEntity>;
  clarifications: EntityStore<ClarificationEntity> & {
    getByProjectId(projectId: string): Promise<ClarificationEntity[]>;
  };
  crunchColumns: EntityStore<CrunchColumnEntity>;
  processes: EntityStore<ProcessEntity>;
  processSteps: EntityStore<ProcessStepEntity> & {
    getByProcessId(processId: string): Promise<ProcessStepEntity[]>;
  };
  companySettings: SingletonStore<CompanySettingsEntity>;
  notificationCategories: EntityStore<NotificationCategoryEntity>;
  notificationPreferences: EntityStore<NotificationPreferenceEntity> & {
    getByCategoryId(categoryId: string): Promise<NotificationPreferenceEntity[]>;
  };
  account: SingletonStore<AccountEntity>;
}
