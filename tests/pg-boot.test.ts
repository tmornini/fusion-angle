import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    applyDdl,
    assertSchemaMarker,
    assertUtf8,
    bootErrorMessage,
    hasSchemaMarker,
    MISSING_MARKER,
    readListenEnv,
    UTF8_REQUIRED,
} from '../server/boot.ts';
import {
    SEED_EXCLUSIVE_FLAGS,
    SEED_NONEMPTY,
} from '../server/seed.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
import { POSTGRES_SCHEMA } from
    '../api/schema-postgres.ts';

// Unit pins stay Postgres-free. Live SHOW runs only
// when POSTGRES_URL is set (./test-postgres).

const POSTGRES_URL = process.env['POSTGRES_URL'];

function fakeClient(
    rows: Record<string, unknown>[],
): {
    readonly sql: SqlClient;
    readonly texts: string[];
} {
    const texts: string[] = [];
    const sql: SqlClient = {
        query: <T>(
            strings: TemplateStringsArray,
            ..._values: unknown[]
        ) => {
            texts.push(strings.join(''));
            return Promise.resolve(rows as T[]);
        },
        begin: async (fn) => fn(sql),
        unsafe: async <T>(query: string) => {
            texts.push(query);
            return [] as T[];
        },
        end: async () => {},
    };
    return { sql, texts };
}

test('assertUtf8 accepts UTF8', async () => {
    const fake = fakeClient([
        { server_encoding: 'UTF8' },
    ]);
    await assertUtf8(fake.sql);
    assert.match(
        fake.texts[0] ?? '',
        /SHOW server_encoding/,
    );
});

test('assertUtf8 rejects SQL_ASCII', async () => {
    const fake = fakeClient([
        { server_encoding: 'SQL_ASCII' },
    ]);
    await assert.rejects(
        () => assertUtf8(fake.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === UTF8_REQUIRED,
    );
});

test('assertUtf8 rejects a missing encoding row',
async () => {
    const fake = fakeClient([]);
    await assert.rejects(
        () => assertUtf8(fake.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === UTF8_REQUIRED,
    );
});

test('hasSchemaMarker is the marker row, not tables',
async () => {
    const empty = fakeClient([]);
    assert.equal(await hasSchemaMarker(empty.sql), false);
    const marked = fakeClient([{ only: true }]);
    assert.equal(
        await hasSchemaMarker(marked.sql),
        true,
    );
    assert.match(
        marked.texts[0] ?? '',
        /FROM schema_marker/,
    );
});

test('readListenEnv requires the three secrets', () => {
    assert.throws(
        () => readListenEnv({
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: '8080',
        }),
        /missing required env POSTGRES_URL/,
    );
    assert.throws(
        () => readListenEnv({
            POSTGRES_URL: 'postgres://x',
            HTTP_SERVER_PORT: '8080',
        }),
        /missing required env JWT_HMAC_SIGNING_KEY/,
    );
    assert.throws(
        () => readListenEnv({
            POSTGRES_URL: 'postgres://x',
            JWT_HMAC_SIGNING_KEY: 'k',
        }),
        /missing required env HTTP_SERVER_PORT/,
    );
    assert.throws(
        () => readListenEnv({
            POSTGRES_URL: 'postgres://x',
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: 'nope',
        }),
        /HTTP_SERVER_PORT must be an integer/,
    );
    const env = readListenEnv({
        POSTGRES_URL: 'postgres://x',
        JWT_HMAC_SIGNING_KEY: 'k',
        HTTP_SERVER_PORT: '8080',
        TRUSTED_PROXY_HOPS: '10.0.0.1',
    });
    assert.equal(env.port, 8080);
    assert.equal(env.trustedProxyHops, '10.0.0.1');
});

test('applyDdl runs the compile-time schema',
async () => {
    const fake = fakeClient([]);
    await applyDdl(fake.sql);
    assert.equal(fake.texts[0], POSTGRES_SCHEMA);
});

test('assertSchemaMarker refuses an empty marker',
async () => {
    const empty = fakeClient([]);
    await assert.rejects(
        () => assertSchemaMarker(empty.sql),
        (error: unknown) =>
            error instanceof Error
            && error.message === MISSING_MARKER,
    );
    const marked = fakeClient([{ only: true }]);
    await assertSchemaMarker(marked.sql);
});

test('bootErrorMessage never echoes a URL', () => {
    assert.equal(
        bootErrorMessage(new Error(
            'connect postgres://user:pw@h/db',
        )),
        'boot failed',
    );
    assert.equal(
        bootErrorMessage(new Error(MISSING_MARKER)),
        MISSING_MARKER,
    );
    assert.equal(
        bootErrorMessage(new Error(SEED_NONEMPTY)),
        SEED_NONEMPTY,
    );
    assert.equal(
        bootErrorMessage(
            new Error(SEED_EXCLUSIVE_FLAGS),
        ),
        SEED_EXCLUSIVE_FLAGS,
    );
});

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    test(
        'live SHOW skipped without POSTGRES_URL',
        { skip: 'POSTGRES_URL is unset' },
        () => {},
    );
} else {
    test('live SHOW server_encoding is UTF8',
    async () => {
        const sql = connectPostgres(POSTGRES_URL);
        try {
            await assertUtf8(sql);
        } finally {
            await sql.end();
        }
    });
}
