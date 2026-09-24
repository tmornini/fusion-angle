import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { hasSchemaMarker } from '../server/boot.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import {
    depthsOf,
    postSeedLanding,
} from '../api/ledger-seed.ts';
import { rootBind } from '../api/ledger-root.ts';
import {
    rehearseBootstrap,
    rehearseMockData,
} from '../api/mock-data.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import {
    isDatabaseEmpty,
    SEED_NONEMPTY,
    seedPostgres,
} from '../server/seed.ts';
import {
    generateIdentifier,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import {
    leafHashHex,
    pairRootHex,
    secretHashHex,
} from '../shared/pair-root.ts';
import { testHashPassword } from './mock-seed.ts';

// Live pins for the seed beneath the adapter. Skip when
// POSTGRES_URL is unset so ./test validate stays
// Postgres-free. One scratch schema, emptied before each
// test; do not share it.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function schemaName(): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + '_ledger_seed';
    if (!IDENT.test(name)) {
        throw new Error('invalid SCHEMA_NAME');
    }
    return name;
}

function quoteIdent(name: string): string {
    return '"' + name + '"';
}

function urlWithSearchPath(
    url: string,
    schema: string,
): string {
    const parsed = new URL(url);
    parsed.searchParams.set('search_path', schema);
    return parsed.href;
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'live ledger seed skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);

    Deno.test.beforeAll(async () => {
        // A pooled connection starts a max_lifetime timer
        // when its socket connects, and the ops sanitizer
        // blames whichever test first opens it. This timer
        // must predate test one (see pg-races.test.ts).
        await sql.query`SELECT 1`;
    });

    async function emptySchema(): Promise<void> {
        await sql.unsafe(
            'DROP SCHEMA IF EXISTS ' + quoteIdent(schema)
                + ' CASCADE',
        );
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
    }

    async function tablesPresent(): Promise<{
        pairs: boolean;
        marker: boolean;
    }> {
        const rows = await sql.query<{
            pairs: boolean;
            marker: boolean;
        }>`
            SELECT
                to_regclass('fa_message_pairs') IS NOT NULL
                    AS pairs,
                to_regclass('schema_marker') IS NOT NULL
                    AS marker
        `;
        const row = rows[0];
        if (row === undefined) {
            throw new Error('the table check returned no row');
        }
        return { pairs: row.pairs, marker: row.marker };
    }

    Deno.test.afterAll(async () => {
        try {
            await sql.unsafe(
                'DROP SCHEMA IF EXISTS '
                + quoteIdent(schema)
                + ' CASCADE',
            );
        } finally {
            await sql.end();
        }
    });

    Deno.test(
        'a seed transaction that throws leaves neither'
            + ' table',
        async () => {
            await emptySchema();
            await assertRejects(
                () => backend.seedTransaction(async (tx) => {
                    await backend.executeLedger(
                        'composed',
                        [rootBind(generateIdentifier())],
                        undefined,
                        tx,
                    );
                    throw new Error('stop the seed');
                }),
                Error,
                'stop the seed',
            );
            assertEquals(
                await tablesPresent(),
                { pairs: false, marker: false },
            );
        },
    );

    Deno.test(
        'a seed transaction commits schema, rows, marker',
        async () => {
            await emptySchema();
            await backend.seedTransaction(
                (tx) => backend.executeLedger(
                    'composed',
                    [rootBind(generateIdentifier())],
                    undefined,
                    tx,
                ),
            );
            assertEquals(
                await tablesPresent(),
                { pairs: true, marker: true },
            );
            assertStrictEquals(
                await hasSchemaMarker(sql), true,
            );
        },
    );

    const adapter = new BackedDbAdapter(
        backend, async () => {}, async () => {}, () => {},
    );
    const quiet = {
        hashPassword: testHashPassword,
        write: () => {},
    };

    Deno.test(
        'a landing whose last batch fails leaves neither'
            + ' table',
        async () => {
            await emptySchema();
            const seed = await rehearseMockData({
                hashPassword: testHashPassword,
            });
            const statements = seed.rehearsal.statements;
            // The deepest statement lands in the last
            // batch. Rehearsal order ends with the
            // credentials, which land in the first.
            const depths = depthsOf(statements);
            const deepest = depths.lastIndexOf(
                Math.max(...depths),
            );
            const duplicate = statements[0]!.rows[0]!.id;
            const broken = statements.map(
                (statement, index) => index !== deepest
                    ? statement
                    : {
                        rows: [
                            {
                                ...statement.rows[0]!,
                                id: duplicate,
                            },
                            ...statement.rows.slice(1),
                        ],
                        supersedes: statement.supersedes,
                    },
            );
            await assertRejects(() => postSeedLanding(backend, {
                seedRunId: seed.rehearsal.seedRunId,
                statements: broken,
            }));
            assertEquals(
                await tablesPresent(),
                { pairs: false, marker: false },
            );
            assertStrictEquals(await isDatabaseEmpty(sql), true);
        },
    );

    Deno.test(
        'a landed seed has its root and its marker',
        async () => {
            await emptySchema();
            const seed = await rehearseMockData({
                hashPassword: testHashPassword,
            });
            await postSeedLanding(backend, seed.rehearsal);
            assertStrictEquals(
                await hasSchemaMarker(sql), true,
            );
            const roots = await sql.query<{
                operation_id: string;
            }>`
                SELECT operation_id::text AS operation_id
                FROM fa_message_pairs
                WHERE path = '/migrations/'
                  AND name = '0000-root'
            `;
            assertEquals(
                roots.map((row) => row.operation_id),
                [uuidTextOfIdentifier(seed.rehearsal.seedRunId)],
            );
        },
    );

    Deno.test(
        'the verb refuses an existing table, creating'
            + ' nothing',
        async () => {
            await emptySchema();
            await sql.unsafe(
                'CREATE TABLE fa_message_pairs (id integer)',
            );
            let wrote = false;
            const error = await assertRejects(
                () => seedPostgres(sql, adapter, 'bootstrap', {
                    hashPassword: testHashPassword,
                    write: () => {
                        wrote = true;
                    },
                }),
            ) as Error;
            assertStrictEquals(error.message, SEED_NONEMPTY);
            assertStrictEquals(wrote, false);
            assertEquals(
                await tablesPresent(),
                { pairs: true, marker: false },
            );
        },
    );

    Deno.test(
        'a landed seed row\'s digests match the twin',
        async () => {
            await emptySchema();
            await seedPostgres(sql, adapter, 'bootstrap', quiet);
            const rows = await sql.query<{
                id: string;
                operation_id: string;
                path: string;
                name: string;
                supersedes: string;
                requester_identity_id: string;
                method: string;
                stamp: string;
                request: Uint8Array;
                request_salt: Uint8Array;
                secret: Uint8Array;
                response: Uint8Array;
                response_salt: Uint8Array;
                request_hash: string;
                secret_hash: string;
                response_hash: string;
                pair_hash: string;
                request_id: string | null;
            }>`
                SELECT id::text AS id,
                    operation_id::text AS operation_id,
                    path, name,
                    supersedes::text AS supersedes,
                    requester_identity_id, method,
                    to_char(
                        response_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                    ) AS stamp,
                    request, request_salt, secret,
                    response, response_salt,
                    encode(request_hash, 'hex')
                        AS request_hash,
                    encode(secret_hash, 'hex')
                        AS secret_hash,
                    encode(response_hash, 'hex')
                        AS response_hash,
                    encode(pair_hash, 'hex') AS pair_hash,
                    fa_request_id_of(response) AS request_id
                FROM fa_message_pairs
                WHERE path = '/identities/'
                  AND name = 'XXZruirZyAOoRpNxaDnpSA'
            `;
            assertStrictEquals(rows.length, 1);
            const row = rows[0]!;
            const requestDigest = await leafHashHex(
                row.request_salt, row.request,
            );
            const secretDigest = await secretHashHex(
                row.secret,
            );
            const responseDigest = await leafHashHex(
                row.response_salt, row.response,
            );
            assertStrictEquals(row.request_id, null);
            assertStrictEquals(row.secret.byteLength, 0);
            assertStrictEquals(row.request_hash, requestDigest);
            assertStrictEquals(row.secret_hash, secretDigest);
            assertStrictEquals(
                row.response_hash, responseDigest,
            );
            assertStrictEquals(
                row.pair_hash,
                await pairRootHex({
                    id: row.id,
                    operationId: row.operation_id,
                    path: row.path,
                    name: row.name,
                    supersedes: row.supersedes,
                    requesterIdentityId:
                        row.requester_identity_id,
                    method: row.method,
                    responseAt: row.stamp,
                    requestHashHex: requestDigest,
                    secretHashHex: secretDigest,
                    responseHashHex: responseDigest,
                }),
            );
        },
    );

    Deno.test(
        'two seeds at once on one database: one lands',
        async () => {
            await emptySchema();
            const second = connectPostgres(
                urlWithSearchPath(POSTGRES_URL, schema),
            );
            try {
                const [a, b] = await Promise.all([
                    rehearseBootstrap({
                        hashPassword: testHashPassword,
                    }),
                    rehearseBootstrap({
                        hashPassword: testHashPassword,
                    }),
                ]);
                const settled = await Promise.allSettled([
                    postSeedLanding(backend, a.rehearsal),
                    postSeedLanding(
                        new PostgresBackend(second),
                        b.rehearsal,
                    ),
                ]);
                assertStrictEquals(
                    settled.filter(
                        (s) => s.status === 'fulfilled',
                    ).length,
                    1,
                );
                const roots = await sql.query<{ n: number }>`
                    SELECT count(*)::int AS n
                    FROM fa_message_pairs
                    WHERE path = '/migrations/'
                `;
                assertStrictEquals(roots[0]?.n, 1);
            } finally {
                await second.end();
            }
        },
    );

    Deno.test(
        'a lone schema_marker fails the seed, creating'
            + ' nothing',
        async () => {
            await emptySchema();
            await sql.unsafe(
                'CREATE TABLE schema_marker ('
                + ' "only" boolean PRIMARY KEY'
                + ' CHECK ("only"));'
                + ' INSERT INTO schema_marker VALUES (true);',
            );
            let wrote = false;
            await assertRejects(
                () => seedPostgres(sql, adapter, 'bootstrap', {
                    hashPassword: testHashPassword,
                    write: () => {
                        wrote = true;
                    },
                }),
            );
            assertStrictEquals(wrote, false);
            assertEquals(
                await tablesPresent(),
                { pairs: false, marker: true },
            );
        },
    );
}
