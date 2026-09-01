// Operator seed. One mode flag. Writes DDL,
// seeds an empty database, prints credentials
// once on stdout. Node-only.

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
    assertNoLegacyMessageTables,
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
    'Usage: postgres-seed --bootstrap|--mock-data\n';

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

export async function seedMain(
    args: readonly string[],
): Promise<number> {
    try {
        const parsed = parseSeedArgv(args);
        if (parsed.kind === 'help') {
            process.stdout.write(USAGE);
            return 0;
        }
        if (parsed.kind === 'error') {
            process.stderr.write(
                parsed.message + '\n' + USAGE,
            );
            return 1;
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
            await assertNoLegacyMessageTables(sql);
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
        return 0;
    } catch (error: unknown) {
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
        return 1;
    }
}
