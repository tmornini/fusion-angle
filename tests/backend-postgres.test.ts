import {
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertNotMatch,
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
// Kept deliberately (measured, not assumed): npm:postgres
// hands latin1OfBytea (api/backend-postgres.ts) a real
// Buffer, whose own toString(encoding) is what the fast
// path there checks for. A plain Uint8Array's inherited
// toString ignores its argument, so swapping this for
// `new Uint8Array(bytes)` would silently move this test
// onto the fallback branch (Octets.fromBytes(...)
// .toLatin1()) and stop covering the Buffer path — the
// one the real driver actually returns.
import { Buffer } from 'node:buffer';
import {
    POSTGRES_DROP_SCHEMA,
    PostgresBackend,
} from '../api/backend-postgres.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { POSTGRES_SCHEMA } from
    '../api/schema-postgres.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import {
    ApiError,
    HTTP_INTERNAL_ERROR,
} from '../api/http-errors.ts';

type QueryCall = {
    readonly text: string;
    readonly values: readonly unknown[];
};

function taggedText(
    strings: TemplateStringsArray,
    values: readonly unknown[],
): string {
    let text = strings[0] ?? '';
    for (let i = 0; i < values.length; i++) {
        text += '$' + String(i + 1)
            + (strings[i + 1] ?? '');
    }
    return text;
}

function fakeClient(): {
    readonly sql: SqlClient;
    readonly calls: QueryCall[];
    rows: Record<string, unknown>[];
    failWith: unknown;
} {
    const calls: QueryCall[] = [];
    const state = {
        rows: [] as Record<string, unknown>[],
        failWith: undefined as unknown,
        sql: undefined as unknown as SqlClient,
        calls,
    };
    const run = (
        strings: TemplateStringsArray,
        values: readonly unknown[],
    ): Promise<Record<string, unknown>[]> => {
        if (state.failWith !== undefined) {
            return Promise.reject(state.failWith);
        }
        calls.push({
            text: taggedText(strings, values),
            values,
        });
        return Promise.resolve(state.rows);
    };
    const sql: SqlClient = {
        query: <T>(
            strings: TemplateStringsArray,
            ...values: unknown[]
        ) => run(strings, values) as Promise<T[]>,
        unsafe: async <T>(query: string) => {
            if (state.failWith !== undefined) {
                throw state.failWith;
            }
            calls.push({ text: query, values: [] });
            return [] as T[];
        },
        begin: async (fn) => {
            return fn(sql);
        },
        end: async () => {},
    };
    state.sql = sql;
    return state;
}

const MESSAGE_PAIR_ROW = {
    id: 'UuPWIGbUyaAgmEgGDRfnvA',
    uri_collection: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
    uri_id: '42',
    requester_identity_id: 'WOTMsfERBVJEuTRTgrQptQ',
    method: 'PUT',
    request_at: '2026-01-01T00:00:00.000000Z',
    request_hash: 'a'.repeat(64),
    request: 'PUT /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42 HTTP/'
        + '1.1\r\n\r\n'
        + String.fromCharCode(0x80, 0x9c, 0xe9),
    response_at: '2026-01-01T00:00:00.000001Z',
    response: 'HTTP/1.1 200 OK\r\n\r\n'
        + String.fromCharCode(0x80, 0x9c, 0xe9),
    operation_id: 'WvNiHVgksjrlfhPfdgfcyQ',
};

Deno.test('ensureTables runs compile-time SCHEMA', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.ensureTables(['message_pairs']);
    assertStrictEquals(fake.calls.length, 1);
    assertStrictEquals(fake.calls[0]!.text, POSTGRES_SCHEMA);
});

Deno.test('schema declares collection indexes', () => {
    assertMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS message_pairs_collection/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /ON message_pairs \(uri_collection, response_at, id\)/,
    );
});

Deno.test('deleteSchema drops tables, function, marker',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.deleteSchema();
    const text = fake.calls[0]!.text;
    assertMatch(
        text, /DROP TABLE IF EXISTS message_pairs/,
    );
    assertMatch(text, /DROP TABLE IF EXISTS pairs/);
    assertMatch(text, /DROP TABLE IF EXISTS responses/);
    assertMatch(text, /DROP TABLE IF EXISTS requests/);
    assertMatch(
        text, /DROP TABLE IF EXISTS schema_marker/,
    );
    assertMatch(
        text,
        /DROP FUNCTION IF EXISTS message_body\(bytea\)/,
    );
});

Deno.test('POSTGRES_DROP_SCHEMA drops message_pairs first',
() => {
    assertStrictEquals(
        POSTGRES_DROP_SCHEMA,
        'DROP TABLE IF EXISTS message_pairs;\n'
        + 'DROP TABLE IF EXISTS pairs;\n'
        + 'DROP TABLE IF EXISTS responses;\n'
        + 'DROP TABLE IF EXISTS requests;\n'
        + 'DROP TABLE IF EXISTS schema_marker;\n'
        + 'DROP FUNCTION IF EXISTS message_body(bytea);',
    );
});

Deno.test('hasSchema is the marker row, not table existence',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    fake.rows = [];
    assertStrictEquals(await backend.hasSchema(), false);
    fake.rows = [{ only: true }];
    assertStrictEquals(await backend.hasSchema(), true);
    assertMatch(
        fake.calls[0]!.text,
        /FROM schema_marker/,
    );
});

Deno.test('getWhere throws for uri_id', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    const err = await assertRejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs', 'uri_id', '42',
            ),
        ),
    ) as Error;
    assertInstanceOf(err, Error);
    assertStrictEquals(
        err.message, 'getWhere does not accept uri_id',
    );
    assertStrictEquals(fake.calls.length, 0);
});

Deno.test('getWhere supports indexed single columns',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        ['message_pairs'],
        'readonly',
        (tx) => tx.getWhere(
            'message_pairs', 'uri_collection'
                , '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        ),
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /WHERE uri_collection = \$1/);
    assertMatch(text, /ORDER BY response_at, id/);
});

Deno.test('getAddress uses collection and id, ordered',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.getAddress(
        'message_pairs',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        '42',
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /WHERE uri_collection = \$1/);
    assertMatch(text, /AND uri_id = \$2/);
    assertMatch(text, /ORDER BY response_at, id/);
    assertEquals(
        fake.calls[0]!.values,
        ['/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42'],
    );
});

Deno.test('schema has no operation indexes', () => {
    assertNotMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX.*operation/,
    );
});

Deno.test('getWhere throws for operation_id', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    const err = await assertRejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs',
                'operation_id',
                'WvNiHVgksjrlfhPfdgfcyQ',
            ),
        ),
    ) as Error;
    assertInstanceOf(err, Error);
    assertStrictEquals(
        err.message, 'getWhere does not accept operation_id',
    );
});

Deno.test('getWhereBody uses message_body containment',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        ['message_pairs'],
        'readonly',
        (tx) => tx.getWhereBody(
            'message_pairs',
            '/authentication/authorize/',
            { code: 'abc' },
        ),
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /FROM message_pairs/);
    assertMatch(text, /uri_collection = \$1/);
    assertMatch(
        text, /message_body\(response\) @>/,
    );
    assertMatch(text, /ORDER BY response_at, id/);
    assertEquals(
        fake.calls[0]!.values[0],
        '/authentication/authorize/',
    );
    assertEquals(
        fake.calls[0]!.values[1],
        { code: 'abc' },
    );
});

Deno.test('put writes BYTEA via Octets.fromLatin1',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        ['message_pairs'],
        'readwrite',
        (tx) => tx.put('message_pairs', MESSAGE_PAIR_ROW),
    );
    const values = fake.calls[0]!.values;
    const bytes = values.filter(
        (value) => value instanceof Uint8Array,
    );
    assertStrictEquals(bytes.length, 2);
    assertEquals(
        bytes[0],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.request).asBytes(),
    );
    assertEquals(
        bytes[1],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.response).asBytes(),
    );
});

Deno.test('get reads BYTEA via latin1, not TextDecoder',
async () => {
    const fake = fakeClient();
    const wire = MESSAGE_PAIR_ROW.request;
    const bytes = Octets.fromLatin1(wire).asBytes();
    fake.rows = [{
        ...MESSAGE_PAIR_ROW,
        request: Buffer.from(bytes),
        response: Buffer.from(bytes),
    }];
    const backend = new PostgresBackend(fake.sql);
    const row = await backend.transaction(
        ['message_pairs'],
        'readonly',
        (tx) => tx.get<typeof MESSAGE_PAIR_ROW>(
            'message_pairs', MESSAGE_PAIR_ROW.id,
        ),
    );
    assertStrictEquals(row?.request, wire);
    assertNotStrictEquals(
        row?.request,
        new TextDecoder('latin1').decode(bytes),
    );
});

Deno.test('transaction maps deadlock to loud 500',
async () => {
    const fake = fakeClient();
    fake.failWith = { code: '40P01' };
    const backend = new PostgresBackend(fake.sql);
    const err = await assertRejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getAll('message_pairs'),
        ),
    ) as ApiError;
    assertInstanceOf(err, ApiError);
    assertStrictEquals(err.status, HTTP_INTERNAL_ERROR);
    assertStrictEquals(err.message, 'deadlock');
});

Deno.test('POSTGRES_SCHEMA has no CREATE VIEW', () => {
    assertNotMatch(
        POSTGRES_SCHEMA,
        /CREATE\s+VIEW/i,
    );
});
