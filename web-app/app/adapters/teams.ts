import {
    GET, PUT,
} from '../../../api/api';
import type {
    UserEntity,
} from '../../../api/types';
import { User } from '../../../api/types';
export { User } from '../../../api/types';

const TOP_MEMBERS_COUNT = 6;

export async function getTeamMembers(
): Promise<User[]> {
    const rows =
        await GET<UserEntity[]>('users');
    return rows
        .map(entity => new User(entity))
        .filter(user =>
            user.hasDepartment()
            && user.hasPerformanceScore(),
        )
        .slice(0, TOP_MEMBERS_COUNT);
}

export type UserRole =
    | 'admin'
    | 'manager'
    | 'member'
    | 'viewer';

export type UserAccountStatus =
    | 'active'
    | 'pending'
    | 'deactivated';

export async function getManagedUsers(
): Promise<User[]> {
    const rows =
        await GET<UserEntity[]>('users');
    return rows
        .map(entity => new User(entity));
}

export async function putUser(
    id: string,
    entity: Partial<UserEntity>,
): Promise<void> {
    await PUT(`users/${id}`, entity);
}
