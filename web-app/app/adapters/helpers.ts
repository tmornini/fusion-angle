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
    MS_PER_DAY,
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
    const user = userMap.get(userId);
    if (!user) {
        throw new Error(
            'userName: unknown user '
                + userId,
        );
    }
    return user.fullName();
}
