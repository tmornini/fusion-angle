import { GET } from '../../../api/api.ts';
import type {
    Id,
    UserEntity,
    CompanyEntity,
} from '../../../api/types.ts';
import { User } from '../../../api/types.ts';

export interface AuthContext {
    user: User;
    company: string;
}

export async function getCurrentUser(
): Promise<AuthContext> {
    const [row, company] =
        await Promise.all([
            GET<UserEntity>('current-user'),
            GET<CompanyEntity>('company'),
        ]);
    return {
        user: new User(row),
        company: company.name,
    };
}

async function fetchUserMap(
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

export interface FetchContext {
    getUserMap(): Promise<Map<Id, User>>;
}

export function createFetchContext(
): FetchContext {
    let userMapPromise:
        Promise<Map<Id, User>> | null = null;
    return {
        getUserMap() {
            if (userMapPromise === null) {
                userMapPromise = fetchUserMap();
            }
            return userMapPromise;
        },
    };
}

export async function getUserMap(
    ctx?: FetchContext,
): Promise<Map<Id, User>> {
    if (ctx) return ctx.getUserMap();
    return fetchUserMap();
}

export function userName(
    userMap: Map<Id, User>,
    userId: Id,
): string {
    const user = userMap.get(userId);
    if (!user) {
        throw new Error(
            'userName: unknown user '
                + userId,
        );
    }
    return user.fullName();
}
