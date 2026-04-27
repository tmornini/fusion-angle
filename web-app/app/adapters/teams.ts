import {
    GET, PUT,
} from '../../../api/api';
import type {
    UserEntity,
} from '../../../api/types';
import { User } from '../../../api/types';
import { getUserMap } from './shared';
import type { FetchContext } from './shared';
export {
    User,
    AVAILABILITY_HIGH,
    AVAILABILITY_LOW,
} from '../../../api/types';

const TOP_MEMBERS_COUNT = 6;

export async function getTeamMembers(
    ctx?: FetchContext,
): Promise<User[]> {
    const userMap = await getUserMap(ctx);
    return Array.from(userMap.values())
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
    ctx?: FetchContext,
): Promise<User[]> {
    const userMap = await getUserMap(ctx);
    return Array.from(userMap.values());
}

export async function getUserEntity(
    id: string,
): Promise<UserEntity> {
    return GET<UserEntity>(`users/${id}`);
}

export async function putUser(
    id: string,
    entity: Omit<UserEntity, 'id'>,
): Promise<void> {
    await PUT(`users/${id}`, entity);
}
