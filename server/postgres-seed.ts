// Operator seed. One mode flag. Writes DDL,
// seeds an empty database, prints credentials
// once on stdout. Node-only.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { TABLE_NAMES } from '../api/db.ts';
import {
    connectPostgres,
    type SqlClient,
} from '../api/postgres-client.ts';
import {
    POOL_ACQUIRE_TIMEOUT_MS,
    STATEMENT_TIMEOUT_MS,
    assertUtf8,
    requiredEnv,
} from './postgres-gate.ts';
import {
    parseSeedArgv,
    seedErrorMessage,
    seedPostgres,
    serialPasswordHasher,
} from './seed.ts';
import {
    setPasswordHasher,
    setScryptDerive,
} from '../shared/password-hash.ts';
import {
    scryptHash,
    scryptDerive,
} from './scrypt-hash.ts';

const USAGE =
    'Usage: postgres-seed --bootstrap|'
    + '--mock-data|--test-plan-slices\n';

function isMainModule(): boolean {
    const invoked = process.argv[1];
    if (invoked === undefined) return false;
    return resolve(invoked)
        === fileURLToPath(import.meta.url);
}

function faultCode(
    error: unknown,
): string | undefined {
    if (error === null
        || typeof error !== 'object') {
        return undefined;
    }
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
}

async function run(
    argv: readonly string[],
): Promise<void> {
    const parsed = parseSeedArgv(argv.slice(2));
    if (parsed.kind === 'help') {
        process.stdout.write(USAGE);
        return;
    }
    if (parsed.kind === 'error') {
        process.stderr.write(
            parsed.message + '\n' + USAGE,
        );
        process.exitCode = 1;
        return;
    }
    setPasswordHasher(scryptHash);
    setScryptDerive(scryptDerive);
    const postgresUrl = requiredEnv('POSTGRES_URL');
    const sql: SqlClient = connectPostgres(
        postgresUrl,
        {
            statementTimeoutMs: STATEMENT_TIMEOUT_MS,
            acquireTimeoutMs: POOL_ACQUIRE_TIMEOUT_MS,
        },
    );
    try {
        await assertUtf8(sql);
        const adapter = new BackedDbAdapter(
            new PostgresBackend(sql),
            async () => {},
            async () => {},
            () => {},
        );
        await adapter.ensureTables(TABLE_NAMES);
        await seedPostgres(
            sql, adapter, parsed.mode, {
                hashPassword: serialPasswordHasher(),
                write: (chunk) => {
                    process.stdout.write(chunk);
                },
            },
        );
        process.stderr.write(JSON.stringify({
            at: new Date().toISOString(),
            level: 'info',
            message: 'seeded',
            mode: parsed.mode,
        }) + '\n');
    } finally {
        await sql.end();
    }
}

if (isMainModule()) {
    run(process.argv).catch((error: unknown) => {
        const message = seedErrorMessage(error);
        const rec: {
            at: string;
            level: string;
            message: string;
            code?: string;
        } = {
            at: new Date().toISOString(),
            level: 'error',
            message,
        };
        const code = faultCode(error);
        if (message === 'seed failed'
            && code !== undefined) {
            rec.code = code;
        }
        process.stderr.write(
            JSON.stringify(rec) + '\n',
        );
        process.exit(1);
    });
}
