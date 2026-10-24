import { assert, assertEquals } from '@std/assert';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { BODY_INDEXED_PATH } from
    '../api/schema-postgres.ts';
import { ledgerFields } from './ledger-row.ts';
import {
    quoteIdent,
    schemaName,
    urlWithSearchPath,
} from './pg-schema.ts';

// Live pin: a standalone store read issues one SELECT
// with no BEGIN. Skip when POSTGRES_URL is unset so
// ./validate stays Postgres-free. Private schema per
// file; do not share schemas across files.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres standalone read skipped without'
            + ' POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName('_standalone_read');
    const queries: string[] = [];
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
        {
            debug: (_connection, query) => {
                queries.push(query);
            },
        },
    );
    const backend = new PostgresBackend(sql);

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTable();
        await backend.transaction(
            'readwrite',
            async (tx) => {
                const id = 'aaaaaaaaaaaaaaaaaaaaaA';
                await tx.append({
                    id,
                    ...await ledgerFields({
                        id,
                        path: '/x/',
                        name: 'n',
                        requester_identity_id:
                            'WOTMsfERBVJEuTRTgrQptQ',
                        method: 'PUT',
                        response_at:
                            '2026-01-01T00:00:00.000000Z',
                        request:
                            'PUT /x/n HTTP/1.1\r\n\r\n',
                        response:
                            'HTTP/1.1 200 OK\r\n\r\n',
                        operation_id:
                            'WvNiHVgksjrlfhPfdgfcyQ',
                        supersedes: id,
                    }),
                });
            },
        );
    });

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
        'standalone read must not BEGIN',
        async () => {
            queries.length = 0;
            const adapter = new BackedDbAdapter(
                backend, async () => {}, async () => {},
                () => {},
            );
            await adapter.messagePairs.getCollectionPairs(
                '/x/',
            );
            assert(
                !queries.some(
                    q => /^\s*BEGIN\b/i.test(q),
                ),
                'standalone read must not BEGIN',
            );
            assert(
                queries.some(
                    q => /message_pairs/i.test(q),
                ),
                'standalone read must SELECT',
            );
        },
    );

    // One statement is one snapshot: a batch that looped
    // its single reads would answer the same rows here.
    Deno.test(
        'a head batch reads in one statement',
        async () => {
            queries.length = 0;
            const answers = await backend.read(
                (tx) => tx.getCollectionHeadPairsBatch([
                    { path: '/x/' },
                    { path: '/y/' },
                    {
                        path: BODY_INDEXED_PATH,
                        contains: { k: 'v' },
                    },
                ]),
            );
            assertEquals(
                answers.map((answer) => answer.length),
                [1, 0, 0],
            );
            assertEquals(queries.length, 1);
        },
    );
}
