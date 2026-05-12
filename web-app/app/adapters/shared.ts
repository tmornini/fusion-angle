import type { DbAdapter } from '../../../api/db.ts';
import {
    GET as httpGet,
    PUT as httpPut,
    DELETE as httpDelete,
    POST as httpPost,
} from '../../../api/api.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';
import { getDbAdapter } from './init.ts';
import type { Channel } from '../channels.ts';

// A unit of write work executed by ctx.commit().
// `put` upserts a row by full state; `delete` removes
// a row by its resource path. Sequenced in order; on
// failure, commit() throws CommitError(failedAt,
// applied, cause) so the caller can name the failed
// op and reconcile. No rollback (real atomicity
// arrives with Postgres). notifyChannels fire only
// after all ops succeed — single batched event per
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

export class CommitError extends Error {
    readonly failedAt: number;
    readonly applied: readonly WriteOp[];
    readonly cause: Error;
    constructor(
        failedAt: number,
        applied: readonly WriteOp[],
        cause: Error,
    ) {
        super(
            'commit failed at op['
            + failedAt + ']: '
            + cause.message,
        );
        this.name = 'CommitError';
        this.failedAt = failedAt;
        this.applied = applied;
        this.cause = cause;
    }
}

export interface RequestContext {
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
    commit(tx: Transaction): Promise<void>;
}

export function createRequestContext(
    adapter: DbAdapter = getDbAdapter(),
): RequestContext {
    const ctx: RequestContext = {
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
        commit: async (
            tx: Transaction,
        ): Promise<void> => {
            const applied: WriteOp[] = [];
            for (
                const [i, op] of tx.ops.entries()
            ) {
                try {
                    if (op.method === 'put') {
                        await ctx.PUT(
                            op.resource,
                            op.body,
                        );
                    } else {
                        await ctx.DELETE(
                            op.resource,
                        );
                    }
                } catch (e) {
                    throw new CommitError(
                        i,
                        applied,
                        e as Error,
                    );
                }
                applied.push(op);
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

