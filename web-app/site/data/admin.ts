import { GET } from '../../../api/api';
import type {
  UserEntity, AccountEntity, CompanySettingsEntity, ActivityEntity,
  NotificationCategoryEntity, NotificationPreferenceEntity,
} from '../../../api/types';
import { toBool } from '../../../api/types';
import { buildUserMap, groupBy } from './helpers';

// ── Account ─────────────────────────────────

export interface Account {
  company: {
    name: string;
    plan: string;
    planStatus: string;
    nextBilling: string;
    seats: number;
    usedSeats: number;
  };
  usage: {
    projects: { current: number; limit: number };
    ideas: { current: number; limit: number };
    storage: { current: number; limit: number };
    aiCredits: { current: number; limit: number };
  };
  health: { score: number; status: string; lastActivity: string; activeUsers: number };
  recentActivity: { type: string; description: string; time: string }[];
}

export async function getAccount(): Promise<Account> {
  const [account, settings, activities, userMap] = await Promise.all([
    GET('account') as Promise<AccountEntity>,
    GET('company-settings') as Promise<CompanySettingsEntity>,
    GET('activities') as Promise<ActivityEntity[]>,
    buildUserMap(),
  ]);

  return {
    company: {
      name: settings.name,
      plan: account.plan,
      planStatus: account.plan_status,
      nextBilling: account.next_billing,
      seats: account.seats,
      usedSeats: account.used_seats,
    },
    usage: {
      projects: { current: account.projects_current, limit: account.projects_limit },
      ideas: { current: account.ideas_current, limit: account.ideas_limit },
      storage: { current: account.storage_current, limit: account.storage_limit },
      aiCredits: { current: account.ai_credits_current, limit: account.ai_credits_limit },
    },
    health: { score: account.health_score, status: account.health_status, lastActivity: account.last_activity, activeUsers: account.active_users },
    recentActivity: activities.slice(0, 3).map(activity => ({
      type: activity.type,
      description: `${userMap.get(activity.actor_id)?.fullName() ?? 'Unknown'} ${activity.action} ${activity.target}`,
      time: activity.timestamp,
    })),
  };
}

// ── Profile ─────────────────────────────────

export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  bio: string;
}

export const allStrengths = ['Strategic Planning', 'Data Analysis', 'Stakeholder Management', 'Agile Methods', 'Team Leadership', 'Risk Management', 'Budget Planning', 'Technical Writing', 'User Research', 'Prototyping'];

export async function getProfile(): Promise<Profile> {
  const user = await GET('current-user') as UserEntity | null;
  if (!user) return { firstName: 'Alex', lastName: 'Thompson', email: 'alex.thompson@company.com', phone: '+1 (555) 123-4567', role: 'Product Manager', department: 'Product', bio: 'Passionate about building products that solve real problems.' };
  return {
    firstName: user.first_name,
    lastName: user.last_name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    department: user.department,
    bio: user.bio,
  };
}

// ── Company Settings ────────────────────────

export interface CompanySettings {
  name: string;
  domain: string;
  industry: string;
  size: string;
  timezone: string;
  language: string;
  isSsoEnforced: boolean;
  isTwoFactorEnabled: boolean;
  isIpWhitelistEnabled: boolean;
  dataRetention: string;
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const row = await GET('company-settings') as CompanySettingsEntity;
  return {
    name: row.name,
    domain: row.domain,
    industry: row.industry,
    size: row.size,
    timezone: row.timezone,
    language: row.language,
    isSsoEnforced: toBool(row.is_sso_enforced),
    isTwoFactorEnabled: toBool(row.is_two_factor_enabled),
    isIpWhitelistEnabled: toBool(row.is_ip_whitelist_enabled),
    dataRetention: row.data_retention,
  };
}

// ── Activity Feed ───────────────────────────

export interface Activity {
  id: string;
  type: string;
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  score?: number;
  status?: string;
  comment?: string;
}

export async function getActivityFeed(): Promise<Activity[]> {
  const [activities, userMap] = await Promise.all([
    GET('activities') as Promise<ActivityEntity[]>,
    buildUserMap(),
  ]);
  return activities.map(activity => ({
    id: activity.id,
    type: activity.type,
    actor: userMap.get(activity.actor_id)?.fullName() ?? 'Unknown',
    action: activity.action,
    target: activity.target,
    timestamp: activity.timestamp,
    ...(activity.score != null ? { score: activity.score } : {}),
    ...(activity.status != null ? { status: activity.status } : {}),
    ...(activity.comment != null ? { comment: activity.comment } : {}),
  }));
}

// ── Notification Settings ───────────────────

export interface NotificationPreference {
  id: string;
  label: string;
  description: string;
  isEmailEnabled: boolean;
  isPushEnabled: boolean;
}

export interface NotificationCategory {
  id: string;
  label: string;
  icon: string;
  preferences: NotificationPreference[];
}

export async function getNotificationCategories(): Promise<NotificationCategory[]> {
  const [categories, preferences] = await Promise.all([
    GET('notification-categories') as Promise<NotificationCategoryEntity[]>,
    GET('notification-preferences') as Promise<NotificationPreferenceEntity[]>,
  ]);

  const preferencesByCategoryId = groupBy(preferences, preference => preference.category_id);

  return categories.map(category => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
    preferences: (preferencesByCategoryId.get(category.id) || []).map(preference => ({
      id: preference.id,
      label: preference.label,
      description: preference.description,
      isEmailEnabled: toBool(preference.is_email_enabled),
      isPushEnabled: toBool(preference.is_push_enabled),
    })),
  }));
}
