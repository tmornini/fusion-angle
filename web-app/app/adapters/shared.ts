import { GET } from '../../../api/api';
import type {
    Id,
    UserEntity,
    CompanySettingsEntity,
} from '../../../api/types';
import { User } from '../../../api/types';

export interface AuthContext {
    user: User;
    company: string;
}

export async function getCurrentUser(
): Promise<AuthContext> {
    const [row, settings] =
        await Promise.all([
            GET<UserEntity>('current-user'),
            GET<CompanySettingsEntity>(
                'company-settings',
            ),
        ]);
    return {
        user: new User(row),
        company: settings.name,
    };
}

export async function getUserMap(
): Promise<Map<Id, User>> {
    const users =
        await GET<UserEntity[]>('users');
    return new Map(
        users.map(
            entity => [
                entity.id,
                new User(entity),
            ],
        ),
    );
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
