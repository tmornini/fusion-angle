import type { DbAdapter } from '../../../api/db.ts';
import {
    GET as httpGet,
    PUT as httpPut,
    DELETE as httpDelete,
    POST as httpPost,
} from '../../../api/api.ts';
import type {
    Id,
    UserEntity,
    CompanyEntity,
    IdeaEntity,
    ProjectEntity,
    FlowEntity,
} from '../../../api/types.ts';
import { User } from '../../../api/types.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import { getDbAdapter } from './init.ts';
import type { Channel } from '../channels.ts';

export type { Id } from '../../../api/types.ts';
export { User } from '../../../api/types.ts';

export async function getCurrentUserRow(
    ctx?: FetchContext,
): Promise<UserEntity> {
    if (ctx) return ctx.getCurrentUser();
    return httpGet<UserEntity>(
        getDbAdapter(), 'current-user',
    );
}

export async function getCompanyRow(
    ctx?: FetchContext,
): Promise<CompanyEntity> {
    if (ctx) return ctx.GET<CompanyEntity>(
        'company',
    );
    return httpGet<CompanyEntity>(
        getDbAdapter(), 'company',
    );
}

// A unit of write work executed by ctx.commit().
// `put` upserts a row by full state; `delete` removes
// a row by its resource path. Sequenced in order;
// best-effort, no rollback (real atomicity arrives
// with Postgres). notifyChannels fire once after the
// last op succeeds — single batched event per
// channel per logical operation.
export type WriteOp =
    | {
        method: 'put';
        resource: string;
        body: Record<string, unknown>;
    }
    | {
        method: 'delete';
        resource: string;
    };

export interface Transaction {
    readonly ops: readonly WriteOp[];
    readonly notifyChannels?: readonly Channel<void>[];
}

export interface FetchContext {
    readonly requestId: string;
    GET<T>(resource: string): Promise<T>;
    PUT<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    DELETE(resource: string): Promise<void>;
    POST<T>(
        resource: string,
        body: Record<string, unknown>,
    ): Promise<T>;
    getUserMap(): Promise<Map<Id, User>>;
    getCurrentUser(): Promise<UserEntity>;
    getIdeaRows(): Promise<IdeaEntity[]>;
    getProjectRows(
    ): Promise<ProjectEntity[]>;
    getFlowRows(): Promise<FlowEntity[]>;
    commit(tx: Transaction): Promise<void>;
}

export function createFetchContext(
    adapter: DbAdapter = getDbAdapter(),
): FetchContext {
    // Per-request memoization: each table is
    // fetched at most once per ctx. The promise
    // is captured the first time the getter is
    // called.
    let userMapPromise:
        Promise<Map<Id, User>> | null = null;
    let currentUserPromise:
        Promise<UserEntity> | null = null;
    let ideaRowsPromise:
        Promise<IdeaEntity[]> | null = null;
    let projectRowsPromise:
        Promise<ProjectEntity[]> | null = null;
    let flowRowsPromise:
        Promise<FlowEntity[]> | null = null;
    const ctx: FetchContext = {
        requestId: generateCryptoSafeBase62(),
        GET: <T>(resource: string) =>
            httpGet<T>(adapter, resource),
        PUT: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => httpPut<T>(adapter, resource, body),
        DELETE: (resource: string) =>
            httpDelete(adapter, resource),
        POST: <T>(
            resource: string,
            body: Record<string, unknown>,
        ) => httpPost<T>(adapter, resource, body),
        getUserMap: () => {
            if (!userMapPromise) {
                userMapPromise = (async () => {
                    const users =
                        await ctx.GET<
                            UserEntity[]
                        >('users');
                    return new Map(
                        users.map(
                            entity => [
                                entity.id,
                                new User(entity),
                            ],
                        ),
                    );
                })();
            }
            return userMapPromise;
        },
        getCurrentUser: () => {
            if (!currentUserPromise) {
                currentUserPromise =
                    ctx.GET<UserEntity>(
                        'current-user',
                    );
            }
            return currentUserPromise;
        },
        getIdeaRows: () => {
            if (!ideaRowsPromise) {
                ideaRowsPromise =
                    ctx.GET<IdeaEntity[]>(
                        'ideas',
                    );
            }
            return ideaRowsPromise;
        },
        getProjectRows: () => {
            if (!projectRowsPromise) {
                projectRowsPromise =
                    ctx.GET<ProjectEntity[]>(
                        'projects',
                    );
            }
            return projectRowsPromise;
        },
        getFlowRows: () => {
            if (!flowRowsPromise) {
                flowRowsPromise =
                    ctx.GET<FlowEntity[]>(
                        'flows',
                    );
            }
            return flowRowsPromise;
        },
        commit: async (
            tx: Transaction,
        ): Promise<void> => {
            for (const op of tx.ops) {
                if (op.method === 'put') {
                    await ctx.PUT(
                        op.resource,
                        op.body,
                    );
                } else {
                    await ctx.DELETE(op.resource);
                }
            }
            if (tx.notifyChannels) {
                for (
                    const ch of tx.notifyChannels
                ) {
                    ch.send();
                }
            }
        },
    };
    return ctx;
}

export async function getUserMap(
    ctx?: FetchContext,
): Promise<Map<Id, User>> {
    if (ctx) return ctx.getUserMap();
    return createFetchContext().getUserMap();
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
