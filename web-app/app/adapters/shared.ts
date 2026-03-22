import { GET } from '../../../api/api';
import type {
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
