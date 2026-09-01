// Operator wipe verb. A drop that does not seed,
// so genesis cannot ride the plane's removal.

import { POSTGRES_DROP_SCHEMA } from
    '../api/backend-postgres.ts';
import {
    connectPostgres,
    type SqlClient,
} from '../api/postgres-client.ts';
import {
    POOL_ACQUIRE_TIMEOUT_MS,
    STATEMENT_TIMEOUT_MS,
    requiredEnvBy,
    safeErrorMessage,
} from './postgres-gate.ts';

const enc = new TextEncoder();

const USAGE =
    'Usage: postgres-wipe [--print-start-command]\n';
const PRINT_START = '--print-start-command';
const WIPE_FAILED = 'wipe failed';

export async function wipePostgres(
    sql: SqlClient,
): Promise<void> {
    await sql.unsafe(POSTGRES_DROP_SCHEMA);
}

export function renderWipeStartCommand(): string {
    return './render-out/fusion-angle wipe';
}

export function wipeErrorMessage(
    error: unknown,
): string {
    return safeErrorMessage(
        error,
        new Set(),
        WIPE_FAILED,
    );
}

export async function wipeMain(
    args: readonly string[],
): Promise<number> {
    try {
        if (args.includes('--help')
            || args.includes('-h')) {
            Deno.stdout.writeSync(enc.encode(USAGE));
            return 0;
        }
        if (args.includes(PRINT_START)) {
            Deno.stdout.writeSync(enc.encode(
                renderWipeStartCommand(),
            ));
            return 0;
        }
        const postgresUrl = requiredEnvBy(
            'POSTGRES_URL',
            (name) => Deno.env.get(name),
        );
        const sql = connectPostgres(
            postgresUrl,
            {
                statementTimeoutMs: STATEMENT_TIMEOUT_MS,
                acquireTimeoutMs: POOL_ACQUIRE_TIMEOUT_MS,
            },
        );
        try {
            await wipePostgres(sql);
        } finally {
            await sql.end();
        }
        return 0;
    } catch (error: unknown) {
        Deno.stderr.writeSync(enc.encode(
            JSON.stringify({
                at: new Date().toISOString(),
                level: 'error',
                message: wipeErrorMessage(error),
            }) + '\n',
        ));
        return 1;
    }
}

if (import.meta.main) {
    Deno.exit(await wipeMain(Deno.args));
}
