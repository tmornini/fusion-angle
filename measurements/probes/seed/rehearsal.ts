// The rehearsal transaction spec's figures, medians in ms.
// `replayMs` re-executes the rehearsal's recorded
// statements through a fresh rehearsal, one executeLedger
// each: a depth's statements at once, the depths in order.
// `rehearsalMs` is rehearseMockData alone, and
// `memorySeedMs` is postMockDataLoad on a fresh memory
// adapter, both with the test hasher. With
// FA_PROBE_POSTGRES_URL set, `postgresSeedMs` is
// postMockDataLoad on a Postgres adapter, the public schema
// dropped and re-created before each run. The probe calls
// no API the spec adds, so it runs at the base and the head
// alike.
import { memoryDbAdapter } from '../../../api/db-memory.ts';
import { MemoryStorageBackend } from
    '../../../api/backend-memory.ts';
import { BackedDbAdapter } from '../../../api/db-backed.ts';
import { PostgresBackend } from
    '../../../api/backend-postgres.ts';
import { connectPostgres } from
    '../../../api/postgres-client.ts';
import {
    depthsOf,
    rehearse,
} from '../../../api/ledger-seed.ts';
import {
    postMockDataLoad,
    rehearseMockData,
} from '../../../api/mock-data.ts';
import { STATEMENT_TIMEOUT_MS } from
    '../../../server/postgres-gate.ts';
import { testHashPassword } from
    '../../../tests/mock-seed.ts';

const RUNS = 7;
const POSTGRES_RUNS = 3;
const ACQUIRE_TIMEOUT_MS = 5000;
const options = { hashPassword: testHashPassword };

async function timedMs(
    run: () => Promise<unknown>,
): Promise<number> {
    const started = performance.now();
    await run();
    return performance.now() - started;
}

async function medianMs(
    runs: number,
    measure: () => Promise<number>,
): Promise<number> {
    const times: number[] = [];
    for (let run = 0; run < runs; run++) {
        times.push(await measure());
    }
    times.sort((a, b) => a - b);
    return Math.round(times[Math.floor(runs / 2)]!);
}

const { rehearsal } = await rehearseMockData(options);
const statements = rehearsal.statements;
const depths = depthsOf(statements);
const deepest = Math.max(...depths);

function replay(): Promise<unknown> {
    return rehearse(new MemoryStorageBackend(), async (db) => {
        for (let depth = 1; depth <= deepest; depth++) {
            await Promise.all(statements
                .filter((_, index) => depths[index] === depth)
                .map((statement) => db.executeLedger(
                    'composed', statement.rows,
                )));
        }
    });
}

const figures: Record<string, number> = {
    statements: statements.length,
    deepest,
    replayMs: await medianMs(RUNS, () => timedMs(replay)),
    rehearsalMs: await medianMs(RUNS, () =>
        timedMs(() => rehearseMockData(options))),
    memorySeedMs: await medianMs(RUNS, () =>
        timedMs(() => postMockDataLoad(
            memoryDbAdapter(), options,
        ))),
};

const url = Deno.env.get('FA_PROBE_POSTGRES_URL');
if (url !== undefined) {
    const sql = connectPostgres(url, {
        statementTimeoutMs: STATEMENT_TIMEOUT_MS,
        acquireTimeoutMs: ACQUIRE_TIMEOUT_MS,
    });
    const adapter = new BackedDbAdapter(
        new PostgresBackend(sql),
        async () => {},
        async () => {},
        () => {},
    );
    try {
        figures['postgresSeedMs'] = await medianMs(
            POSTGRES_RUNS,
            async () => {
                await sql.unsafe(
                    'DROP SCHEMA public CASCADE;'
                        + ' CREATE SCHEMA public;',
                );
                return timedMs(
                    () => postMockDataLoad(adapter, options),
                );
            },
        );
    } finally {
        await sql.end();
    }
}

console.log(JSON.stringify(figures, null, 1));
