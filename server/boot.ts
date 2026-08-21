// Fail-fast boot. Argv → env → pool → UTF8 →
// marker → listen. No DDL; seed with
// ./postgres-seed.
// One mint process: do not run two of these.
// Node-only; excluded from tsc (no @types/node).

import { resolve } from 'node:path';
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
    requiredEnv,
    assertUtf8,
    assertSchemaMarker,
    bootErrorMessage,
    type EnvBag,
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

export function readListenEnv(
    env: EnvBag = process.env,
): ListenEnv {
    const postgresUrl = requiredEnv(
        'POSTGRES_URL', env,
    );
    const jwtHmacSigningKey = requiredEnv(
        'JWT_HMAC_SIGNING_KEY', env,
    );
    const portRaw = requiredEnv(
        'HTTP_SERVER_PORT', env,
    );
    const port = Number(portRaw);
    if (!Number.isInteger(port)
        || port < 1
        || port > 65535) {
        throw new Error(
            'HTTP_SERVER_PORT must be an integer 1-65535',
        );
    }
    const hops = env['TRUSTED_PROXY_HOPS'];
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

function staticRootFromMeta(): string {
    return resolve(
        fileURLToPath(new URL('.', import.meta.url)),
    );
}

export interface RunningHttp {
    readonly port: number;
    close(): Promise<void>;
}

export async function boot(
    env: EnvBag = process.env,
    argv: readonly string[] = process.argv,
): Promise<RunningHttp> {
    if (argv.slice(2).length > 0) {
        throw new Error(NO_ARGUMENTS);
    }
    setPasswordHasher(scryptHash);
    setScryptDerive(scryptDerive);
    const listenEnv = readListenEnv(env);
    const sql = connectPostgres(listenEnv.postgresUrl, {
        statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        acquireTimeoutMs: POOL_ACQUIRE_TIMEOUT_MS,
    });
    await assertUtf8(sql);
    await assertSchemaMarker(sql);
    const adapter = new BackedDbAdapter(
        new PostgresBackend(sql),
        async () => {},
        async () => {},
        () => {},
    );
    const listener = await listenHttp({
        adapter,
        staticRoot: staticRootFromMeta(),
        port: listenEnv.port,
        trustedProxyHops: listenEnv.trustedProxyHops,
    });
    return {
        port: listener.port,
        close: async () => {
            await listener.close();
            await sql.end();
        },
    };
}

function isMainModule(): boolean {
    const invoked = process.argv[1];
    if (invoked === undefined) return false;
    return resolve(invoked)
        === fileURLToPath(import.meta.url);
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

if (isMainModule()) {
    boot().then((running) => {
        process.stdout.write(JSON.stringify({
            at: new Date().toISOString(),
            level: 'info',
            message: 'listening',
            port: running.port,
        }) + '\n');
        installSigterm(() => running.close());
    }).catch((error: unknown) => {
        process.stderr.write(JSON.stringify({
            at: new Date().toISOString(),
            level: 'error',
            message: bootErrorMessage(error),
        }) + '\n');
        process.exit(1);
    });
}
