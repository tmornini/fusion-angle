import { assertStrictEquals } from '@std/assert';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { TABLE_NAMES } from '../api/db.ts';

Deno.test(
    'postSchemaCreation/hasSchema/deleteSchema'
    + ' lifecycle',
    async () => {
        const adapter = memoryDbAdapter();
        assertStrictEquals(
            await adapter.hasSchema(), false,
            'fresh storage has no schema',
        );
        await adapter.postSchemaCreation();
        assertStrictEquals(
            await adapter.hasSchema(), true,
            'postSchemaCreation makes hasSchema true',
        );
        await adapter.deleteSchema();
        assertStrictEquals(
            await adapter.hasSchema(), false,
            'deleteSchema returns to empty',
        );
    },
);

Deno.test(
    'postSchemaCreation is idempotent on re-run',
    async () => {
        const adapter = memoryDbAdapter();
        await adapter.postSchemaCreation();
        await adapter.messagePairs.put('u1', {
            uri_collection:
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
            uri_id: '42',
            requester_identity_id: 'XXZruirZyAOoRpNxaDnpSA',
            method: 'PUT',
            request_at:
                '2026-01-01T00:00:00.000000Z',
            request_hash: 'a'.repeat(64),
            request:
                'PUT /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42'
                + ' HTTP/1.1\r\n\r\n',
            response_at:
                '2026-01-01T00:00:00.000001Z',
            response:
                'HTTP/1.1 200 OK\r\n\r\n',
            operation_id: '0123456789ABCDEFGHIJKw',
        });
        await adapter.postSchemaCreation();
        const requests =
            await adapter.messagePairs.getAll();
        assertStrictEquals(
            requests.length, 1,
            'second postSchemaCreation preserves'
            + ' data',
        );
    },
);

Deno.test('DbAdapter has no snapshot dump or restore',
() => {
    const adapter = memoryDbAdapter();
    assertStrictEquals(
        'getSnapshot' in adapter, false,
    );
    assertStrictEquals(
        'putSnapshot' in adapter, false,
    );
});

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
    const name = base + '_lifecycle';
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
        'postgres column types skipped without'
        + ' POSTGRES_URL',
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
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTables(TABLE_NAMES);
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
        'message_pairs.id and message_pairs.operation_id are uuid',
        async () => {
            const rows = await sql.query<{
                column_name: string;
                data_type: string;
            }>`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'message_pairs'
                  AND column_name IN (
                      'id', 'operation_id',
                      'uri_id',
                      'requester_identity_id'
                  )
            `;
            const typeOf = new Map(
                rows.map((row) => [
                    row.column_name, row.data_type,
                ]),
            );
            assertStrictEquals(typeOf.get('id'), 'uuid');
            assertStrictEquals(
                typeOf.get('operation_id'), 'uuid',
            );
            assertStrictEquals(typeOf.get('uri_id'), 'text');
            assertStrictEquals(
                typeOf.get('requester_identity_id'),
                'text',
            );
        },
    );
}
