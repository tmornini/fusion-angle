import {
    GET, PUT,
} from '../../../api/api.ts';
import type {
    UserEntity,
    OrganizationEntity,
    CompanyEntity,
    ActivityEntity,
    ActivityActorEntity,
} from '../../../api/types.ts';
import {
    User,
    jsonArrayField,
} from '../../../api/types.ts';

export type {
    OrganizationEntity,
} from '../../../api/types.ts';
export type { RecentActivityItem } from '../../../api/types.ts';
export const RECENT_ACTIVITY_COUNT = 3;

export async function getOrganizationRow(
): Promise<OrganizationEntity> {
    const entity = await GET<
        OrganizationEntity
    >('organization');
    if (!entity.plan)
        throw new Error(
            'Organization not configured',
        );
    return entity;
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

export async function getActivityRows(
): Promise<ActivityEntity[]> {
    return GET<ActivityEntity[]>(
        'activities',
    );
}

export async function getActivityActorRows(
): Promise<ActivityActorEntity[]> {
    return GET<ActivityActorEntity[]>(
        'activity-actors',
    );
}

export type {
    ActivityEntity,
    ActivityActorEntity,
} from '../../../api/types.ts';
