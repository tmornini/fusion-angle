import { BackedDbAdapter } from './db-backed.ts';
import { PostgresBackend } from './backend-postgres.ts';
import { connectPostgres } from './postgres-client.ts';

// Construction preset over BackedDbAdapter. postgres.js
// stays inside postgres-client — this factory only
// hands a URL to the wrapper.
//
// The return type is the class, not
// `GuardedDbAdapter & LatencySimulation`: the class
// declares `messagePairs` concrete, so a test holding one
// keeps `getAll()` as its whole-plane oracle. Every face
// the product passes around still hides it.
export function postgresDbAdapter(
    url: string,
): BackedDbAdapter {
    return new BackedDbAdapter(
        new PostgresBackend(connectPostgres(url)),
        async () => {},
        async () => {},
        () => {},
    );
}

export type PostgresDbAdapter =
    ReturnType<typeof postgresDbAdapter>;
