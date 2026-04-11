import { GET } from '../../../api/api';
import type {
    Id,
    UserEntity,
} from '../../../api/types';
import { User } from '../../../api/types';
export {
    jsonArrayField,
    jsonObjectField,
    nowUtc,
    SECONDS_PER_DAY,
    durationInDays,
    formatCompactCurrency,
} from '../../../api/types';
export async function getUserMap(): Promise<Map<Id, User>> {
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
): T {
    if (typeof value === 'string') {
        return JSON.parse(value) as T;
    }
    return value;
}
