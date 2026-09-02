import {
    assertEquals,
    assertInstanceOf,
    assertMatch,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    boot,
    readListenEnv,
} from '../server/boot.ts';
import {
    assertNoLegacyMessageTables,
    assertSchemaMarker,
    assertUtf8,
    bootErrorMessage,
    hasSchemaMarker,
    LEGACY_MESSAGE_TABLES,
    MISSING_MARKER,
    NO_ARGUMENTS,
    UTF8_REQUIRED,
} from '../server/postgres-gate.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import type { SqlClient } from
    '../api/postgres-client.ts';
// Unit pins stay Postgres-free. Live SHOW runs only
// when POSTGRES_URL is set (./test-postgres).

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');

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

Deno.test('assertUtf8 accepts UTF8', async () => {
    const fake = fakeClient([
        { server_encoding: 'UTF8' },
    ]);
    await assertUtf8(fake.sql);
    assertMatch(
        fake.texts[0] ?? '',
        /SHOW server_encoding/,
    );
});

Deno.test('assertUtf8 rejects SQL_ASCII', async () => {
    const fake = fakeClient([
        { server_encoding: 'SQL_ASCII' },
    ]);
    const error = await assertRejects(
        () => assertUtf8(fake.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, UTF8_REQUIRED);
});

Deno.test('assertUtf8 rejects a missing encoding row',
async () => {
    const fake = fakeClient([]);
    const error = await assertRejects(
        () => assertUtf8(fake.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, UTF8_REQUIRED);
});

Deno.test('hasSchemaMarker is the marker row, not tables',
async () => {
    const empty = fakeClient([]);
    assertStrictEquals(await hasSchemaMarker(empty.sql), false);
    const marked = fakeClient([{ only: true }]);
    assertStrictEquals(
        await hasSchemaMarker(marked.sql),
        true,
    );
    assertMatch(
        marked.texts[0] ?? '',
        /FROM schema_marker/,
    );
});

Deno.test('readListenEnv requires the three secrets', () => {
    assertThrows(
        () => readListenEnv((name) => ({
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: '8080',
        }[name])),
        Error, 'missing required env POSTGRES_URL',
    );
    assertThrows(
        () => readListenEnv((name) => ({
            POSTGRES_URL: 'postgres://x',
            HTTP_SERVER_PORT: '8080',
        }[name])),
        Error, 'missing required env JWT_HMAC_SIGNING_KEY',
    );
    assertThrows(
        () => readListenEnv((name) => ({
            POSTGRES_URL: 'postgres://x',
            JWT_HMAC_SIGNING_KEY: 'k',
        }[name])),
        Error, 'missing required env HTTP_SERVER_PORT',
    );
    assertThrows(
        () => readListenEnv((name) => ({
            POSTGRES_URL: 'postgres://x',
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: 'nope',
        }[name])),
        Error, 'HTTP_SERVER_PORT must be an integer',
    );
    const env = readListenEnv((name) => ({
        POSTGRES_URL: 'postgres://x',
        JWT_HMAC_SIGNING_KEY: 'k',
        HTTP_SERVER_PORT: '8080',
        TRUSTED_PROXY_HOPS: '10.0.0.1',
    }[name]));
    assertStrictEquals(env.port, 8080);
    assertStrictEquals(env.trustedProxyHops, '10.0.0.1');
});

Deno.test('readListenEnv reads by name, never the bag', () => {
    const seen: string[] = [];
    const read = (name: string): string | undefined => {
        seen.push(name);
        return {
            POSTGRES_URL: 'postgres://u@h/d',
            JWT_HMAC_SIGNING_KEY: 'k',
            HTTP_SERVER_PORT: '8080',
        }[name];
    };
    const env = readListenEnv(read);
    assertStrictEquals(env.port, 8080);
    assertStrictEquals(env.trustedProxyHops, undefined);
    assertEquals(seen.sort(), [
        'HTTP_SERVER_PORT',
        'JWT_HMAC_SIGNING_KEY',
        'POSTGRES_URL',
        'TRUSTED_PROXY_HOPS',
    ]);
});

Deno.test('hasSchemaMarker treats 42P01 as absent',
async () => {
    const err = Object.assign(
        new Error('undefined_table'),
        { code: '42P01' },
    );
    const sql: SqlClient = {
        query: () => Promise.reject(err),
        begin: async (fn) => fn(sql),
        unsafe: async () => [],
        end: async () => {},
    };
    assertStrictEquals(await hasSchemaMarker(sql), false);
});

Deno.test('assertSchemaMarker refuses an empty marker',
async () => {
    const empty = fakeClient([]);
    const error = await assertRejects(
        () => assertSchemaMarker(empty.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, MISSING_MARKER);
    const marked = fakeClient([{ only: true }]);
    await assertSchemaMarker(marked.sql);
});

Deno.test('assertSchemaMarker re-voices absence',
async () => {
    const empty = fakeClient([]);
    const error = await assertRejects(
        () => assertSchemaMarker(empty.sql),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, MISSING_MARKER);
    assertStrictEquals(
        MISSING_MARKER,
        'schema_marker absent; seed with ./postgres-seed',
    );
});

Deno.test('bootErrorMessage never echoes a URL', () => {
    assertStrictEquals(
        bootErrorMessage(new Error(
            'connect postgres://user:pw@h/db',
        )),
        'boot failed',
    );
    assertStrictEquals(
        bootErrorMessage(new Error(MISSING_MARKER)),
        MISSING_MARKER,
    );
    assertStrictEquals(
        bootErrorMessage(
            new Error(LEGACY_MESSAGE_TABLES),
        ),
        LEGACY_MESSAGE_TABLES,
    );
});

Deno.test('boot refuses legacy message tables',
async () => {
    const present = fakeClient([
        { rel: 'requests' },
    ]);
    const error = await assertRejects(
        () => assertNoLegacyMessageTables(
            present.sql,
        ),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, LEGACY_MESSAGE_TABLES);
    const absent = fakeClient([
        { rel: null },
        { rel: null },
    ]);
    await assertNoLegacyMessageTables(
        absent.sql,
    );
});

Deno.test('boot refuses leftover pairs table',
async () => {
    const present = fakeClient([
        { rel: 'pairs' },
    ]);
    const error = await assertRejects(
        () => assertNoLegacyMessageTables(
            present.sql,
        ),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, LEGACY_MESSAGE_TABLES);
});

Deno.test('boot refuses argv before connecting', async () => {
    const error = await assertRejects(
        () => boot(
            (name) => ({
                POSTGRES_URL: 'postgres://user:pw@h/db',
                JWT_HMAC_SIGNING_KEY: 'k',
                HTTP_SERVER_PORT: '8080',
            }[name]),
            ['--seed-mock-data'],
            '/unused',
        ),
    ) as Error;
    assertInstanceOf(error, Error);
    assertStrictEquals(error.message, NO_ARGUMENTS);
    assertStrictEquals(
        bootErrorMessage(new Error(NO_ARGUMENTS)),
        NO_ARGUMENTS,
    );
});

Deno.test('bootErrorMessage maps seed leftovers to boot failed',
() => {
    assertStrictEquals(
        bootErrorMessage(new Error(
            'database is not empty; refuse to seed',
        )),
        'boot failed',
    );
});

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'live SHOW skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    Deno.test('live SHOW server_encoding is UTF8',
    async () => {
        const sql = connectPostgres(POSTGRES_URL);
        try {
            await assertUtf8(sql);
        } finally {
            await sql.end();
        }
    });
}
