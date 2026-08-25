import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('ensureTables runs compile-time SCHEMA', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.ensureTables(['message_pairs']);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]!.text, POSTGRES_SCHEMA);
});

test('schema declares collection indexes', () => {
    assert.match(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS message_pairs_collection/,
    );
    assert.match(
        POSTGRES_SCHEMA,
        /ON message_pairs \(uri_collection, response_at, id\)/,
    );
});

test('deleteSchema drops tables, function, marker',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.deleteSchema();
    const text = fake.calls[0]!.text;
    assert.match(
        text, /DROP TABLE IF EXISTS message_pairs/,
    );
    assert.match(text, /DROP TABLE IF EXISTS pairs/);
    assert.match(text, /DROP TABLE IF EXISTS responses/);
    assert.match(text, /DROP TABLE IF EXISTS requests/);
    assert.match(
        text, /DROP TABLE IF EXISTS schema_marker/,
    );
    assert.match(
        text,
        /DROP FUNCTION IF EXISTS message_body\(bytea\)/,
    );
});

test('POSTGRES_DROP_SCHEMA drops message_pairs first',
() => {
    assert.equal(
        POSTGRES_DROP_SCHEMA,
        'DROP TABLE IF EXISTS message_pairs;\n'
        + 'DROP TABLE IF EXISTS pairs;\n'
        + 'DROP TABLE IF EXISTS responses;\n'
        + 'DROP TABLE IF EXISTS requests;\n'
        + 'DROP TABLE IF EXISTS schema_marker;\n'
        + 'DROP FUNCTION IF EXISTS message_body(bytea);',
    );
});

test('hasSchema is the marker row, not table existence',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    fake.rows = [];
    assert.equal(await backend.hasSchema(), false);
    fake.rows = [{ only: true }];
    assert.equal(await backend.hasSchema(), true);
    assert.match(
        fake.calls[0]!.text,
        /FROM schema_marker/,
    );
});

test('getWhere throws for uri_id', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await assert.rejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs', 'uri_id', '42',
            ),
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message
                === 'getWhere does not accept uri_id',
    );
    assert.equal(fake.calls.length, 0);
});

test('getWhere supports indexed single columns',
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
    assert.match(text, /WHERE uri_collection = \$1/);
    assert.match(text, /ORDER BY response_at, id/);
});

test('getAddress uses collection and id, ordered',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.getAddress(
        'message_pairs',
        '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        '42',
    );
    const text = fake.calls[0]!.text;
    assert.match(text, /WHERE uri_collection = \$1/);
    assert.match(text, /AND uri_id = \$2/);
    assert.match(text, /ORDER BY response_at, id/);
    assert.deepEqual(
        fake.calls[0]!.values,
        ['/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/', '42'],
    );
});

test('schema has no operation indexes', () => {
    assert.doesNotMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX.*operation/,
    );
});

test('getWhere throws for operation_id', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await assert.rejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getWhere(
                'message_pairs',
                'operation_id',
                'WvNiHVgksjrlfhPfdgfcyQ',
            ),
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message
                === 'getWhere does not accept'
                + ' operation_id',
    );
});

test('getWhereBody uses message_body containment',
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
    assert.match(text, /FROM message_pairs/);
    assert.match(text, /uri_collection = \$1/);
    assert.match(
        text, /message_body\(response\) @>/,
    );
    assert.match(text, /ORDER BY response_at, id/);
    assert.deepEqual(
        fake.calls[0]!.values[0],
        '/authentication/authorize/',
    );
    assert.deepEqual(
        fake.calls[0]!.values[1],
        { code: 'abc' },
    );
});

test('put writes BYTEA via Octets.fromLatin1',
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
    assert.equal(bytes.length, 2);
    assert.deepEqual(
        bytes[0],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.request).asBytes(),
    );
    assert.deepEqual(
        bytes[1],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.response).asBytes(),
    );
});

test('get reads BYTEA via latin1, not TextDecoder',
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
    assert.equal(row?.request, wire);
    assert.notEqual(
        row?.request,
        new TextDecoder('latin1').decode(bytes),
    );
});

test('transaction maps deadlock to loud 500',
async () => {
    const fake = fakeClient();
    fake.failWith = { code: '40P01' };
    const backend = new PostgresBackend(fake.sql);
    await assert.rejects(
        () => backend.transaction(
            ['message_pairs'],
            'readonly',
            (tx) => tx.getAll('message_pairs'),
        ),
        (error: unknown) =>
            error instanceof ApiError
            && error.status === HTTP_INTERNAL_ERROR
            && error.message === 'deadlock',
    );
});

test('POSTGRES_SCHEMA has no CREATE VIEW', () => {
    assert.doesNotMatch(
        POSTGRES_SCHEMA,
        /CREATE\s+VIEW/i,
    );
});
