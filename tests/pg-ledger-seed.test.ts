import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { hasSchemaMarker } from '../server/boot.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { rootBind } from '../api/ledger-root.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

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
}
