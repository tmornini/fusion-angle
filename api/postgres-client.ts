// Thin postgres.js wrapper. Application code never imports
// postgres. begin is one transaction; advisory locks are
// pg_advisory_xact_lock inside it.

import postgres from 'postgres';
import { POOL_MAX } from './advisory-lock.ts';

export interface SqlClient {
    query<T>(
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
    ): Promise<T[]>;
    begin<T>(
        fn: (sql: SqlClient) => Promise<T>,
        options?: string,
    ): Promise<T>;
    unsafe<T>(query: string): Promise<T[]>;
    end(): Promise<void>;
}

type BeginFn = (
    fn: (tx: Tagged) => Promise<unknown>,
) => Promise<unknown>;

type Tagged = {
    (
        strings: TemplateStringsArray,
        ...values: readonly unknown[]
    ): Promise<unknown[]>;
    begin: BeginFn & (
        (
            options: string,
            fn: (tx: Tagged) => Promise<unknown>,
        ) => Promise<unknown>
    );
    savepoint?: BeginFn;
    unsafe: (query: string) => Promise<unknown[]>;
    end?: () => Promise<void>;
};

function wrap(sql: Tagged): SqlClient {
    return {
        query<T>(
            strings: TemplateStringsArray,
            ...values: readonly unknown[]
        ): Promise<T[]> {
            return sql(strings, ...values) as
                unknown as Promise<T[]>;
        },
        begin<T>(
            fn: (inner: SqlClient) => Promise<T>,
            options?: string,
        ): Promise<T> {
            const inner = (tx: Tagged): Promise<T> =>
                fn(wrap(tx));
            if (sql.savepoint !== undefined) {
                return sql.savepoint(inner) as Promise<T>;
            }
            if (options !== undefined) {
                return sql.begin(options, inner) as
                    Promise<T>;
            }
            return sql.begin(inner) as Promise<T>;
        },
        unsafe<T>(query: string): Promise<T[]> {
            return sql.unsafe(query) as
                unknown as Promise<T[]>;
        },
        end(): Promise<void> {
            return sql.end?.() ?? Promise.resolve();
        },
    };
}

export interface PostgresConnectOptions {
    readonly statementTimeoutMs?: number;
    readonly acquireTimeoutMs?: number;
}

export function connectPostgres(
    url: string,
    options?: PostgresConnectOptions,
): SqlClient {
    const acquireMs = options?.acquireTimeoutMs;
    const statementMs = options?.statementTimeoutMs;
    return wrap(postgres(url, {
        max: POOL_MAX,
        onnotice: () => {},
        ...(acquireMs !== undefined
            ? {
                connect_timeout: Math.max(
                    1,
                    Math.ceil(acquireMs / 1000),
                ),
            }
            : {}),
        ...(statementMs !== undefined
            ? {
                connection: {
                    statement_timeout: statementMs,
                },
            }
            : {}),
    }) as unknown as Tagged);
}
