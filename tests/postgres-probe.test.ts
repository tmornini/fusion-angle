import { assertEquals, assertStrictEquals } from
    '@std/assert';
import type { SqlClient } from
    '../api/postgres-client.ts';
import {
    POSTGRES_PROBE_TIMEOUT_MS,
    probePostgres,
} from '../server/postgres-probe.ts';

function recordingClient(
    select: () => Promise<unknown[]>,
): {
    readonly sql: SqlClient;
    readonly queries: string[];
    readonly parameters: unknown[][];
    readonly beginOptions: Array<string | undefined>;
} {
    const queries: string[] = [];
    const parameters: unknown[][] = [];
    const beginOptions: Array<string | undefined> = [];
    const sql: SqlClient = {
        query: () => Promise.resolve([]),
        begin: (fn, options) => {
            beginOptions.push(options);
            return fn(sql);
        },
        unsafe: async <T>(
            query: string,
            values?: readonly unknown[],
        ) => {
            queries.push(query);
            parameters.push([...(values ?? [])]);
            if (query === 'SELECT 1 AS up') {
                return await select() as T[];
            }
            return [] as T[];
        },
        end: () => Promise.resolve(),
    };
    return { sql, queries, parameters, beginOptions };
}

Deno.test('probePostgres is a read-only SELECT 1',
async () => {
    const fake = recordingClient(
        () => Promise.resolve([{ up: 1 }]),
    );
    assertStrictEquals(
        await probePostgres(fake.sql), true,
    );
    assertEquals(fake.beginOptions, ['read only']);
    assertEquals(fake.queries, [
        'SELECT set_config($1, $2, true)',
        'SELECT 1 AS up',
    ]);
    assertEquals(fake.parameters[0], [
        'statement_timeout',
        String(POSTGRES_PROBE_TIMEOUT_MS),
    ]);
});

Deno.test('probePostgres is down when SELECT 1 is empty',
async () => {
    const fake = recordingClient(
        () => Promise.resolve([]),
    );
    assertStrictEquals(
        await probePostgres(fake.sql), false,
    );
});

Deno.test('probePostgres is down when the query throws',
async () => {
    const fake = recordingClient(
        () => Promise.reject(new Error('timeout')),
    );
    assertStrictEquals(
        await probePostgres(fake.sql), false,
    );
});
