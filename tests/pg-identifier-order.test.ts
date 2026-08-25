import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import { TABLE_NAMES, type DbAdapter } from
    '../api/db.ts';
import {
    compareIdentifiers,
    encodeIdentifier,
} from '../shared/identifier.ts';

// Live pin: uuid ORDER BY matches compareIdentifiers,
// not ASCII. Skip when POSTGRES_URL is unset so
// ./validate stays Postgres-free.

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
    const name = base + '_id_order';
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

function identifierForPrefix(ch: string): string {
    const bytes = new Uint8Array(16);
    const digit: Record<string, number> = {
        A: 0, a: 26, 0: 52, '-': 62, _: 63,
    };
    bytes[0] = digit[ch]! << 2;
    return encodeIdentifier(bytes);
}

async function putPair(
    adapter: DbAdapter,
    id: string,
): Promise<void> {
    await adapter.messagePairs.put(id, {
        uri_collection:
            '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/',
        uri_id: '42',
        requester_identity_id:
            'XXZruirZyAOoRpNxaDnpSA',
        method: 'PUT',
        request_at:
            '2026-01-01T00:00:00.000000Z',
        request_hash: 'a'.repeat(64),
        request:
            'PUT /organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/42'
            + ' HTTP/1.1\r\n\r\n',
        response_at:
            '2026-01-01T00:00:00.000000Z',
        response: 'HTTP/1.1 200 OK\r\n\r\n',
        operation_id: '0123456789ABCDEFGHIJKw',
    });
}

async function idsAtAddress(
    adapter: DbAdapter,
): Promise<string[]> {
    const rows = await adapter.messagePairs.getAllAtAddress(
        '/organizations/AjdvjuECVZEgZoFajaIEkg/'
            + 'ideas/',
        '42',
    );
    return rows.map((row) => row.id);
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    test(
        'postgres identifier order skipped without'
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
        'uuid ORDER BY matches compareIdentifiers',
        async () => {
            const prefixes = ['-', '0', 'A', '_', 'a'];
            const ids = prefixes.map(
                identifierForPrefix,
            );
            for (let i = 0; i < ids.length; i++) {
                assert.equal(
                    ids[i]![0], prefixes[i],
                );
            }
            const asciiOrder = [...ids];
            const identifierOrder = [...ids].sort(
                compareIdentifiers,
            );
            assert.notDeepEqual(
                identifierOrder, asciiOrder,
            );
            assert.deepEqual(
                identifierOrder.map((id) => id[0]),
                ['A', 'a', '0', '-', '_'],
            );

            const postgres = new BackedDbAdapter(
                backend,
                async () => {},
                async () => {},
                () => {},
            );
            const memory = memoryDbAdapter();
            await memory.postSchemaCreation();
            for (const id of ids) {
                await putPair(postgres, id);
                await putPair(memory, id);
            }
            const pgIds = await idsAtAddress(
                postgres,
            );
            const memIds = await idsAtAddress(
                memory,
            );
            assert.deepEqual(pgIds, identifierOrder);
            assert.deepEqual(memIds, identifierOrder);
        },
    );
}
