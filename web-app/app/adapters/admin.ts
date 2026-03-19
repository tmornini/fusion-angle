import { GET } from '../../../api/api';
import type {
    UserEntity,
    AccountEntity,
    CompanySettingsEntity,
    ActivityEntity,
} from '../../../api/types';
import {
    toBool,
    Activity,
} from '../../../api/types';
import { buildUserMap, userName } from './helpers';

const RECENT_ACTIVITY_COUNT = 3;

// ── Account ────────────────────

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
        projects: {
            current: number;
            limit: number;
        };
        ideas: {
            current: number;
            limit: number;
        };
        storage: {
            current: number;
            limit: number;
        };
        aiCredits: {
            current: number;
            limit: number;
        };
    };
    health: {
        score: number;
        status: string;
        lastActivity: string;
        activeUsers: number;
    };
    recentActivity: {
        type: string;
        description: string;
        time: string;
    }[];
}

export async function getAccount(
): Promise<Account> {
    const [
        account,
        settings,
        activities,
        userMap,
    ] = await Promise.all([
        GET<AccountEntity>('account'),
        GET<CompanySettingsEntity>(
            'company-settings',
        ),
        GET<ActivityEntity[]>('activities'),
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
            projects: {
                current:
                    account.projects_current,
                limit:
                    account.projects_limit,
            },
            ideas: {
                current:
                    account.ideas_current,
                limit:
                    account.ideas_limit,
            },
            storage: {
                current:
                    account.storage_current,
                limit:
                    account.storage_limit,
            },
            aiCredits: {
                current:
                    account
                        .ai_credits_current,
                limit:
                    account.ai_credits_limit,
            },
        },
        health: {
            score: account.health_score,
            status: account.health_status,
            lastActivity:
                account.last_activity,
            activeUsers:
                account.active_users,
        },
        recentActivity: activities
            .slice(0, RECENT_ACTIVITY_COUNT)
            .map(a => {
                const actor = userName(
                    userMap,
                    a.actor_id,
                );
                const activity =
                    new Activity(a, actor);
                return {
                    type: activity.type,
                    description:
                        `${activity.actor}`
                        + ` ${activity.action}`
                        + ` ${activity.target}`,
                    time: activity.timestamp,
                };
            }),
    };
}

// ── Profile ────────────────────

export interface Profile {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    department: string;
    bio: string;
}

export const allStrengths = [
    'Strategic Planning',
    'Data Analysis',
    'Stakeholder Management',
    'Agile Methods',
    'Team Leadership',
    'Risk Management',
    'Budget Planning',
    'Technical Writing',
    'User Research',
    'Prototyping',
];

export async function getProfile(
): Promise<Profile> {
    const user =
        await GET<UserEntity | null>(
            'current-user',
        );
    if (!user)
        throw new Error(
            'No current user found'
            + ' — cannot load profile',
        );
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

// ── Company Settings ─────────────────

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

export async function getCompanySettings(
): Promise<CompanySettings> {
    const row =
        await GET<CompanySettingsEntity>(
            'company-settings',
        );
    return {
        name: row.name,
        domain: row.domain,
        industry: row.industry,
        size: row.size,
        timezone: row.timezone,
        language: row.language,
        isSsoEnforced:
            toBool(row.is_sso_enforced),
        isTwoFactorEnabled:
            toBool(
                row.is_two_factor_enabled,
            ),
        isIpWhitelistEnabled:
            toBool(
                row.is_ip_whitelist_enabled,
            ),
        dataRetention: row.data_retention,
    };
}

// ── Activity Feed ──────────────────

export { Activity } from '../../../api/types';

export async function getActivityFeed(
): Promise<Activity[]> {
    const [activities, userMap] =
        await Promise.all([
            GET<ActivityEntity[]>(
                'activities',
            ),
            buildUserMap(),
        ]);
    return activities.map(a =>
        new Activity(
            a,
            userName(userMap, a.actor_id),
        ),
    );
}
