import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { TABLE_NAMES } from '../api/db.ts';

test(
    'postSchemaCreation/hasSchema/deleteSchema'
    + ' lifecycle',
    async () => {
        const adapter = memoryDbAdapter();
        assert.equal(
            await adapter.hasSchema(), false,
            'fresh storage has no schema',
        );
        await adapter.postSchemaCreation();
        assert.equal(
            await adapter.hasSchema(), true,
            'postSchemaCreation makes hasSchema true',
        );
        await adapter.deleteSchema();
        assert.equal(
            await adapter.hasSchema(), false,
            'deleteSchema returns to empty',
        );
    },
);

test(
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
        assert.equal(
            requests.length, 1,
            'second postSchemaCreation preserves'
            + ' data',
        );
    },
);

test('DbAdapter has no snapshot dump or restore',
() => {
    const adapter = memoryDbAdapter();
    assert.equal(
        'getSnapshot' in adapter, false,
    );
    assert.equal(
        'putSnapshot' in adapter, false,
    );
});

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
    test(
        'postgres column types skipped without'
        + ' POSTGRES_URL',
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
        await backend.ensureTables(TABLE_NAMES);
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

    test(
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
            assert.equal(typeOf.get('id'), 'uuid');
            assert.equal(
                typeOf.get('operation_id'), 'uuid',
            );
            assert.equal(typeOf.get('uri_id'), 'text');
            assert.equal(
                typeOf.get('requester_identity_id'),
                'text',
            );
        },
    );
}
