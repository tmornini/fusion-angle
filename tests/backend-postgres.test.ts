import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
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
    beginOptions: string | undefined;
} {
    const calls: QueryCall[] = [];
    const state = {
        rows: [] as Record<string, unknown>[],
        failWith: undefined as unknown,
        sql: undefined as unknown as SqlClient,
        calls,
        beginOptions: undefined as string | undefined,
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
        begin: async (fn, options) => {
            state.beginOptions = options;
            return fn(sql);
        },
        end: async () => {},
    };
    state.sql = sql;
    return state;
}

const REQUEST_ROW = {
    id: 'aaaaaaaaaaaaaaaaaaaaaa',
    uri_collection: '/ideas/',
    uri_id: '42',
    at: '2026-01-01T00:00:00.000000Z',
    requester_identity_id: 'bbbbbbbbbbbbbbbbbbbbbb',
    message_hash: 'a'.repeat(64),
    message: 'PUT /ideas/42 HTTP/1.1\r\n\r\n'
        + String.fromCharCode(0x80, 0x9c, 0xe9),
    method: 'PUT',
    operation_id: 'cccccccccccccccccccccc',
};

test('ensureTables runs compile-time SCHEMA', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.ensureTables(['requests']);
    assert.equal(fake.calls.length, 1);
    assert.equal(fake.calls[0]!.text, POSTGRES_SCHEMA);
});

test('schema declares collection indexes', () => {
    assert.match(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS requests_collection/,
    );
    assert.match(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS responses_collection/,
    );
    assert.match(
        POSTGRES_SCHEMA,
        /ON requests \(uri_collection, at, id\)/,
    );
    assert.match(
        POSTGRES_SCHEMA,
        /ON responses \(uri_collection, at, id\)/,
    );
});

test('deleteSchema drops tables, function, marker',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.deleteSchema();
    const text = fake.calls[0]!.text;
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
            ['requests'],
            'readonly',
            (tx) => tx.getWhere(
                'requests', 'uri_id', '42',
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
        ['requests'],
        'readonly',
        (tx) => tx.getWhere(
            'requests', 'uri_collection', '/ideas/',
        ),
    );
    const text = fake.calls[0]!.text;
    assert.match(text, /WHERE uri_collection = \$1/);
    assert.match(text, /ORDER BY at, id/);
});

test('getAddress uses collection and id, ordered',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.getAddress(
        'requests', '/ideas/', '42',
    );
    const text = fake.calls[0]!.text;
    assert.match(text, /WHERE uri_collection = \$1/);
    assert.match(text, /AND uri_id = \$2/);
    assert.match(text, /ORDER BY at, id/);
    assert.deepEqual(
        fake.calls[0]!.values,
        ['/ideas/', '42'],
    );
});

test('getAddressVersion uses the triple predicate',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction(
        ['responses'],
        'readonly',
        (tx) => tx.getAddressVersion(
            'responses', '/ideas/', '42', 'ab',
        ),
    );
    const text = fake.calls[0]!.text;
    assert.match(text, /FROM responses/);
    assert.match(text, /uri_collection = \$1/);
    assert.match(text, /uri_id = \$2/);
    assert.match(text, /version = \$3/);
    assert.match(text, /ORDER BY at, id/);
    assert.deepEqual(
        fake.calls[0]!.values,
        ['/ideas/', '42', 'ab'],
    );
});

test('getWhere throws for version', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await assert.rejects(
        () => backend.transaction(
            ['responses'],
            'readonly',
            (tx) => tx.getWhere(
                'responses', 'version', 'ab',
            ),
        ),
        (error: unknown) =>
            error instanceof Error
            && error.message
                === 'getWhere does not accept version',
    );
});

test('schema drops unused operation indexes', () => {
    assert.match(
        POSTGRES_SCHEMA,
        /DROP INDEX IF EXISTS requests_operation/,
    );
    assert.match(
        POSTGRES_SCHEMA,
        /DROP INDEX IF EXISTS responses_operation/,
    );
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
            ['requests'],
            'readonly',
            (tx) => tx.getWhere(
                'requests',
                'operation_id',
                'cccccccccccccccccccccc',
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
        ['responses'],
        'readonly',
        (tx) => tx.getWhereBody(
            'responses',
            '/authentication/authorize/',
            { code: 'abc' },
        ),
    );
    const text = fake.calls[0]!.text;
    assert.match(text, /FROM responses/);
    assert.match(text, /uri_collection = \$1/);
    assert.match(
        text, /message_body\(message\) @> \$2/,
    );
    assert.match(text, /ORDER BY at, id/);
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
        ['requests'],
        'readwrite',
        (tx) => tx.put('requests', REQUEST_ROW),
    );
    const values = fake.calls[0]!.values;
    const bytes = values.find(
        (value) => value instanceof Uint8Array,
    );
    assert.ok(bytes instanceof Uint8Array);
    assert.deepEqual(
        bytes,
        Octets.fromLatin1(REQUEST_ROW.message).asBytes(),
    );
});

test('get reads BYTEA via latin1, not TextDecoder',
async () => {
    const fake = fakeClient();
    const wire = REQUEST_ROW.message;
    const bytes = Octets.fromLatin1(wire).asBytes();
    fake.rows = [{
        ...REQUEST_ROW,
        message: Buffer.from(bytes),
    }];
    const backend = new PostgresBackend(fake.sql);
    const row = await backend.transaction(
        ['requests'],
        'readonly',
        (tx) => tx.get<typeof REQUEST_ROW>(
            'requests', REQUEST_ROW.id,
        ),
    );
    assert.equal(row?.message, wire);
    assert.notEqual(
        row?.message,
        new TextDecoder('latin1').decode(bytes),
    );
});

test('exportSnapshot uses REPEATABLE READ', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.exportSnapshot();
    assert.equal(
        fake.beginOptions,
        'ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );
});

test('importSnapshot locks, writes, stamps, notifies',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    const tables = new Map<string, { id: string }[]>([
        ['requests', [REQUEST_ROW]],
        ['responses', []],
    ]);
    await backend.importSnapshot(tables);
    const texts = fake.calls.map((call) => call.text);
    assert.match(
        texts[0] ?? '',
        /pg_advisory_xact_lock\(/,
    );
    assert.ok(
        texts.some((text) =>
            /DELETE FROM requests/.test(text),
        ),
    );
    assert.ok(
        texts.some((text) =>
            /INSERT INTO schema_marker/.test(text),
        ),
    );
    assert.match(
        texts[texts.length - 1] ?? '',
        /pg_notify\(/,
    );
    assert.ok(
        texts.some((text) =>
            text.includes('fusion_events')
            || fake.calls.some((call) =>
                call.values.includes('fusion_events'),
            ),
        ),
    );
});

test('transaction maps deadlock to loud 500',
async () => {
    const fake = fakeClient();
    fake.failWith = { code: '40P01' };
    const backend = new PostgresBackend(fake.sql);
    await assert.rejects(
        () => backend.transaction(
            ['requests'],
            'readonly',
            (tx) => tx.getAll('requests'),
        ),
        (error: unknown) =>
            error instanceof ApiError
            && error.status === HTTP_INTERNAL_ERROR
            && error.message === 'deadlock',
    );
});
