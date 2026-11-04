// SELECT 1 on one pooled connection. The
// transaction is read only, so the probe cannot
// write, and it stores no message pair. Its
// statement_timeout is this budget, not the pool's
// 30s. A failure is the component down. The error
// stays here: the request log already records the
// status, and a probe must not echo a server message.

import type { SqlClient } from
    '../api/postgres-client.ts';

export const POSTGRES_PROBE_TIMEOUT_MS = 1_000;

export async function probePostgres(
    sql: SqlClient,
): Promise<boolean> {
    try {
        const rows = await sql.begin(async (tx) => {
            await tx.unsafe(
                'SELECT set_config($1, $2, true)',
                [
                    'statement_timeout',
                    String(POSTGRES_PROBE_TIMEOUT_MS),
                ],
            );
            return await tx.unsafe('SELECT 1 AS up');
        }, 'read only');
        return rows.length === 1;
    } catch {
        return false;
    }
}
