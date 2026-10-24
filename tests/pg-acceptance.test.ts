import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { POOL_MAX } from '../api/advisory-lock.ts';
import { defineStoreAcceptance } from
    './store-acceptance.ts';
import {
    quoteIdent,
    schemaName,
    urlWithSearchPath,
} from './pg-schema.ts';

// Live Postgres runner for defineStoreAcceptance.
// ./validate stays Postgres-free: skip when POSTGRES_URL
// is unset. One schema per file; open() wipes + ensures
// tables before seedAdminSchema. Do not share schemas
// across files.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres acceptance skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName('_acceptance');
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        // Open the pool to its full width here: a
        // pooled connection starts a max_lifetime
        // timer when its socket connects, and the ops
        // sanitizer blames whichever test first widens
        // the pool. Every timer must predate test one
        // (see pg-races.test.ts).
        await Promise.all(Array.from(
            { length: POOL_MAX },
            () => sql.query`SELECT 1`,
        ));
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

    defineStoreAcceptance('postgres', async () => {
        // Fresh tables each case: drop and recreate this
        // file's private schema. backend.deleteSchema()
        // resets the public schema, not this one.
        await sql.unsafe(
            'DROP SCHEMA ' + quoteIdent(schema) + ' CASCADE',
        );
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTable();
        return new BackedDbAdapter(
            backend,
            async () => {},
            async () => {},
            () => {},
        );
    });
}
