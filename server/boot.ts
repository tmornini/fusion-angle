// Fail-fast boot. Argv → env → pool → UTF8 →
// marker → listen. No DDL; seed with
// ./postgres-seed.
// One mint process: do not run two of these.

import { fileURLToPath } from 'node:url';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { listenHttp } from './http-server.ts';
import {
    STATEMENT_TIMEOUT_MS,
    POOL_ACQUIRE_TIMEOUT_MS,
    NO_ARGUMENTS,
    requiredEnvBy,
    assertUtf8,
    assertNoLegacyMessageTables,
    assertSchemaMarker,
} from './postgres-gate.ts';
import {
    setPasswordHasher,
    setScryptDerive,
} from '../shared/password-hash.ts';
import {
    scryptHash,
    scryptDerive,
} from './scrypt-hash.ts';

export {
    STATEMENT_TIMEOUT_MS,
    POOL_ACQUIRE_TIMEOUT_MS,
    UTF8_REQUIRED,
    MISSING_MARKER,
    NO_ARGUMENTS,
    requiredEnv,
    assertUtf8,
    hasSchemaMarker,
    assertSchemaMarker,
    bootErrorMessage,
    type EnvBag,
} from './postgres-gate.ts';

export interface ListenEnv {
    readonly postgresUrl: string;
    readonly jwtHmacSigningKey: string;
    readonly port: number;
    readonly trustedProxyHops: string | undefined;
}

export type EnvReader =
    (name: string) => string | undefined;

export function readListenEnv(
    read: EnvReader,
): ListenEnv {
    const postgresUrl = requiredEnvBy('POSTGRES_URL', read);
    const jwtHmacSigningKey = requiredEnvBy(
        'JWT_HMAC_SIGNING_KEY', read,
    );
    const portRaw = requiredEnvBy('HTTP_SERVER_PORT', read);
    const port = Number(portRaw);
    if (!Number.isInteger(port)
        || port < 1
        || port > 65535) {
        throw new Error(
            'HTTP_SERVER_PORT must be an integer 1-65535',
        );
    }
    const hops = read('TRUSTED_PROXY_HOPS');
    return {
        postgresUrl,
        jwtHmacSigningKey,
        port,
        trustedProxyHops:
            hops !== undefined && hops !== ''
                ? hops
                : undefined,
    };
}

export interface RunningHttp {
    readonly port: number;
    close(): Promise<void>;
}

export async function boot(
    read: EnvReader,
    argv: readonly string[],
    staticRoot: string,
): Promise<RunningHttp> {
    if (argv.length > 0) {
        throw new Error(NO_ARGUMENTS);
    }
    setPasswordHasher(scryptHash);
    setScryptDerive(scryptDerive);
    const listenEnv = readListenEnv(read);
    const sql = connectPostgres(listenEnv.postgresUrl, {
        statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        acquireTimeoutMs: POOL_ACQUIRE_TIMEOUT_MS,
    });
    await assertUtf8(sql);
    await assertNoLegacyMessageTables(sql);
    await assertSchemaMarker(sql);
    const adapter = new BackedDbAdapter(
        new PostgresBackend(sql),
        async () => {},
        async () => {},
        () => {},
    );
    const listener = await listenHttp({
        adapter,
        staticRoot,
        port: listenEnv.port,
        ...(listenEnv.trustedProxyHops !== undefined
            ? {
                trustedProxyHops:
                    listenEnv.trustedProxyHops,
            }
            : {}),
    });
    return {
        port: listener.port,
        close: async () => {
            await listener.close();
            await sql.end();
        },
    };
}

function installSigterm(
    close: () => Promise<void>,
): void {
    process.once('SIGTERM', () => {
        void close().then(
            () => process.exit(0),
            () => process.exit(1),
        );
    });
}

export async function main(
    siteRoot: URL,
    args: readonly string[],
): Promise<void> {
    const running = await boot(
        (name) => process.env[name],
        args,
        fileURLToPath(siteRoot),
    );
    process.stdout.write(JSON.stringify({
        at: new Date().toISOString(),
        level: 'info',
        message: 'listening',
        port: running.port,
    }) + '\n');
    installSigterm(() => running.close());
    // Returning would Deno.exit the compiled binary.
    await new Promise<never>(() => {});
}
