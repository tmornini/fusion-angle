import {
    GET, PUT,
} from '../../../api/api.ts';
import type {
    UserEntity,
} from '../../../api/types.ts';
import { User } from '../../../api/types.ts';
import { getUserMap } from './shared.ts';
import type { FetchContext } from './shared.ts';
import {
    createChannel,
    bridgeStorageToChannel,
} from '../channels.ts';
export {
    User,
    AVAILABILITY_HIGH,
    AVAILABILITY_LOW,
} from '../../../api/types.ts';

const userChangedChannel =
    createChannel<void>();
bridgeStorageToChannel(
    ['users'], userChangedChannel,
);

export function subscribeUserChanges(
    fn: () => void,
): () => void {
    return userChangedChannel.subscribe(fn);
}

export function notifyUserChange(): void {
    userChangedChannel.send();
}

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

export async function getUserRow(
    id: string,
): Promise<UserEntity> {
    return GET<UserEntity>(`users/${id}`);
}

export async function putUser(
    id: string,
    entity: Omit<UserEntity, 'id'>,
): Promise<void> {
    await PUT(`users/${id}`, entity);
    userChangedChannel.send();
}
