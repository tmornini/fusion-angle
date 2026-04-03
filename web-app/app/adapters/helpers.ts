import { GET } from '../../../api/api';
import type {
    Id,
    UserEntity,
} from '../../../api/types';
import { User } from '../../../api/types';
import { log } from '../logger';

export async function buildUserMap(): Promise<Map<Id, User>> {
    const users = await GET<UserEntity[]>('users');
    return new Map(users.map(entity => [entity.id, new User(entity)]));
}

export function userName(
    userMap: Map<Id, User>,
    userId: string | undefined,
): string {
    if (!userId) return '';
    return userMap.get(userId)?.fullName()
        ?? '';
}

export function parseJson<T>(
    value: string | T,
    recoveryShape: T,
): T {
    if (typeof value === 'string') {
        try {
            return JSON.parse(value) as T;
        } catch {
            log.warn(
                'Failed to parse JSON'
                + ' value: '
                + value.slice(0, 100),
                'parseJson',
            );
            return recoveryShape;
        }
    }
    return value;
}
