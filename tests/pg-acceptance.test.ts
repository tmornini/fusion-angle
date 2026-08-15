import { after, before, test } from 'node:test';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { TABLE_NAMES } from '../api/db.ts';
import { defineStoreAcceptance } from
    './store-acceptance.ts';

// Live Postgres runner for defineStoreAcceptance.
// ./validate stays Postgres-free: skip when POSTGRES_URL
// is unset. One schema per file; open() wipes + ensures
// tables before seedAdminSchema. Do not share schemas
// across files.

const POSTGRES_URL = process.env['POSTGRES_URL'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function schemaName(): string {
    const base = process.env['SCHEMA_NAME']
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(process.pid)
        );
    const name = base + '_acceptance';
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
    test(
        'postgres acceptance skipped without POSTGRES_URL',
        { skip: 'POSTGRES_URL is unset' },
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);

    before(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
    });

    after(async () => {
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
        // Fresh tables each case. hasSchema after
        // deleteSchema throws (loud miss) — do not probe.
        await backend.deleteSchema();
        await backend.ensureTables(TABLE_NAMES);
        return new BackedDbAdapter(
            backend,
            async () => {},
            async () => {},
            () => {},
        );
    });
}
