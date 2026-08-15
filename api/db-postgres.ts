import { BackedDbAdapter } from './db-backed.ts';
import { PostgresBackend } from './backend-postgres.ts';
import { connectPostgres } from './postgres-client.ts';
import type { GuardedDbAdapter } from './db.ts';
import type { LatencySimulation } from './latency.ts';

// Construction preset over BackedDbAdapter. postgres.js
// stays inside postgres-client — this factory only
// hands a URL to the wrapper.
export function postgresDbAdapter(
    url: string,
): GuardedDbAdapter & LatencySimulation {
    return new BackedDbAdapter(
        new PostgresBackend(connectPostgres(url)),
        async () => {},
        async () => {},
        () => {},
    );
}

export type PostgresDbAdapter =
    ReturnType<typeof postgresDbAdapter>;
