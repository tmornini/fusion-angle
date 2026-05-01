import type {
    UserEntity,
} from '../../../api/types.ts';
import { User } from '../../../api/types.ts';
import { getUserMap } from './shared.ts';
import type { FetchContext } from './shared.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
export {
    User,
    AVAILABILITY_HIGH,
    AVAILABILITY_LOW,
} from '../../../api/types.ts';
export type { UserEntity } from '../../../api/types.ts';

const userChanges =
    createSubscriptionChannel(['users']);

export function subscribeUserChanges(
    fn: () => void,
): () => void {
    return userChanges.subscribe(fn);
}

export function notifyUserChange(): void {
    userChanges.notify();
}

const TOP_MEMBERS_COUNT = 6;

export async function getTeamMembers(
    ctx: FetchContext,
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
    ctx: FetchContext,
): Promise<User[]> {
    const userMap = await getUserMap(ctx);
    return Array.from(userMap.values());
}

export async function getUserRow(
    ctx: FetchContext,
    id: string,
): Promise<UserEntity> {
    return ctx.GET<UserEntity>(
        `users/${id}`,
    );
}

export async function putUser(
    ctx: FetchContext,
    id: string,
    entity: Omit<UserEntity, 'id'>,
): Promise<void> {
    await ctx.PUT(`users/${id}`, entity);
    userChanges.notify();
}
