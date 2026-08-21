// Shared Postgres entry gates. boot.ts and
// postgres-seed.ts import this and never
// import each other.

import { isUndefinedTable } from
    '../api/errors-postgres.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';

export const STATEMENT_TIMEOUT_MS = 30_000;
export const POOL_ACQUIRE_TIMEOUT_MS = 5_000;
export const UTF8_REQUIRED =
    'Postgres server_encoding must be UTF8';
export const MISSING_MARKER =
    'schema_marker absent; seed with ./postgres-seed';
export const NO_ARGUMENTS =
    'server.mjs takes no arguments; seed with '
    + './postgres-seed';

export type EnvBag = Record<string, string | undefined>;

export function requiredEnv(
    name: string,
    env: EnvBag = process.env,
): string {
    const value = env[name];
    if (value === undefined || value === '') {
        throw new Error('missing required env ' + name);
    }
    return value;
}

export async function assertUtf8(
    sql: SqlClient,
): Promise<void> {
    const rows = await sql.query<{
        server_encoding: string;
    }>`
        SHOW server_encoding
    `;
    if (rows[0]?.server_encoding !== 'UTF8') {
        throw new Error(UTF8_REQUIRED);
    }
}

// Marker row, or 42P01 (undefined table) as absent.
// No row and no successful seed: do not listen.
export async function hasSchemaMarker(
    sql: SqlClient,
): Promise<boolean> {
    try {
        const rows = await sql.query<{ only: boolean }>`
            SELECT "only" FROM schema_marker
            WHERE "only"
            LIMIT 1
        `;
        return rows.length > 0;
    } catch (error) {
        if (isUndefinedTable(error)) {
            return false;
        }
        throw error;
    }
}

export async function assertSchemaMarker(
    sql: SqlClient,
): Promise<void> {
    if (!(await hasSchemaMarker(sql))) {
        throw new Error(MISSING_MARKER);
    }
}

const SAFE_BOOT_MESSAGES: ReadonlySet<string> = new Set([
    UTF8_REQUIRED,
    MISSING_MARKER,
    NO_ARGUMENTS,
]);

export function safeErrorMessage(
    error: unknown,
    allowlist: ReadonlySet<string>,
    fallback: string,
): string {
    if (!(error instanceof Error)) return fallback;
    if (allowlist.has(error.message)) {
        return error.message;
    }
    if (error.message.startsWith(
        'missing required env ',
    )) {
        return error.message;
    }
    if (error.message.startsWith(
        'HTTP_SERVER_PORT ',
    )) {
        return error.message;
    }
    return fallback;
}

export function bootErrorMessage(
    error: unknown,
): string {
    return safeErrorMessage(
        error,
        SAFE_BOOT_MESSAGES,
        'boot failed',
    );
}
