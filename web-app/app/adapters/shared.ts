import { GET } from '../../../api/api.ts';
import type {
    Id,
    UserEntity,
    CompanyEntity,
} from '../../../api/types.ts';
import { User } from '../../../api/types.ts';

export type { Id } from '../../../api/types.ts';
export { User } from '../../../api/types.ts';

export async function getCurrentUserRow(
): Promise<UserEntity> {
    return GET<UserEntity>('current-user');
}

export async function getCompanyRow(
): Promise<CompanyEntity> {
    return GET<CompanyEntity>('company');
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
    // Eager fetch + frozen reference:
    // the promise is created exactly
    // once at context construction and
    // captured as a const. No mutable
    // state. Callers that need the user
    // map await the same promise; those
    // that don't simply discard the
    // unawaited promise (handled by V8's
    // unhandled-rejection tracker, but
    // safe because fetchUserMap throws
    // only on bugs).
    const userMapPromise = fetchUserMap();
    return {
        getUserMap: () => userMapPromise,
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
