import {
    GET, PUT,
} from '../../../api/api';
import type {
    UserEntity,
    OrganizationEntity,
    CompanyEntity,
    ActivityEntity,
    ActivityActorEntity,
} from '../../../api/types';
import {
    Activity,
    Organization,
    User,
    jsonArrayField,
} from '../../../api/types';
export type { Organization };
import {
    getUserMap,
    userName,
} from './shared';

const RECENT_ACTIVITY_COUNT = 3;

export async function getOrganization(
): Promise<Organization> {
    const [
        entity, company,
        activities, userMap,
        activityActors,
    ] = await Promise.all([
        GET<OrganizationEntity>('organization'),
        GET<CompanyEntity>('company'),
        GET<ActivityEntity[]>(
            'activities',
        ),
        getUserMap(),
        GET<ActivityActorEntity[]>(
            'activity-actors',
        ),
    ]);

    if (!entity.plan)
        throw new Error(
            'Organization not configured',
        );

    const actorMap = new Map(
        activityActors.map(
            a => [
                a.activity_id,
                a.user_id,
            ],
        ),
    );

    const recent = activities
        .slice(0, RECENT_ACTIVITY_COUNT)
        .map(a => {
            const actor = userName(
                userMap,
                actorMap.get(a.id)!,
            );
            const activity =
                new Activity(a, actor);
            return {
                type: activity.typeValue(),
                description:
                    activity
                    .formattedDescription(),
                time: activity
                    .timestampValue(),
            };
        });

    return new Organization(
        entity,
        company.name,
        recent,
    );
}

export interface Profile {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    department: string;
    bio: string;
    strengths: string[];
    teamDimensions: Record<string, number>;
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
        await GET<UserEntity>(
            'current-user',
        );
    const userObj = new User(user);
    return {
        firstName: user.first_name,
        lastName: user.last_name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        department: user.department,
        bio: user.bio,
        strengths:
            userObj.parsedStrengths(),
        teamDimensions:
            userObj.parsedTeamDimensions(),
    };
}

export async function putProfile(
    profile: Profile,
): Promise<void> {
    const current =
        await GET<UserEntity>('current-user');
    const updated:
        Omit<UserEntity, 'id'> = {
            ...current,
            first_name: profile.firstName,
            last_name: profile.lastName,
            email: profile.email,
            phone: profile.phone,
            role: profile.role,
            department: profile.department,
            bio: profile.bio,
            strengths: jsonArrayField(
                profile.strengths,
            ),
        };
    await PUT('users/current', updated);
}

export interface Company {
    name: string;
    domain: string;
}

export async function getCompany(
): Promise<Company> {
    const row =
        await GET<CompanyEntity>('company');
    return {
        name: row.name,
        domain: row.domain,
    };
}

export async function putCompany(
    company: Company,
): Promise<void> {
    await PUT('company', { ...company });
}

export { Activity } from '../../../api/types';

export async function getActivityFeed(
): Promise<Activity[]> {
    const [
        activities, userMap,
        activityActors,
    ] = await Promise.all([
        GET<ActivityEntity[]>(
            'activities',
        ),
        getUserMap(),
        GET<ActivityActorEntity[]>(
            'activity-actors',
        ),
    ]);
    const actorMap = new Map(
        activityActors.map(
            a => [
                a.activity_id,
                a.user_id,
            ],
        ),
    );
    return activities.map(a =>
        new Activity(
            a,
            userName(
                userMap,
                actorMap.get(a.id)!,
            ),
        ),
    );
}
