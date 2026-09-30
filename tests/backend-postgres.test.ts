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
import { uuidTextOfIdentifier } from
    '../shared/identifier.ts';
import { ledgerFields } from './ledger-row.ts';
import {
    ApiError,
    HTTP_INTERNAL_ERROR,
} from '../shared/http-errors.ts';

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
            if (query.startsWith('WITH input')) {
                return [{
                    id: '00000000-0000-0000-0000-'
                        + '000000000000',
                    path: '/migrations/',
                    name: '0000-root',
                    method: 'PUT',
                    outcome: 'land',
                    raw_outcome: 'land',
                    stamp: '2026-01-01T00:00:00.000000Z',
                    response: new Uint8Array(),
                    head_id: null,
                    head_response: null,
                    head_method: null,
                    supersedes: '00000000-0000-0000-0000-'
                        + '000000000000',
                    request_hash: '00'.repeat(32),
                    request_secrets_hash: '00'.repeat(32),
                    response_hash: '00'.repeat(32),
                    response_secrets_hash: '00'.repeat(32),
                    pair_hash: '00'.repeat(32),
                }] as T[];
            }
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

const MESSAGE_PAIR_ID = 'UuPWIGbUyaAgmEgGDRfnvA';
const MESSAGE_PAIR_REQUEST =
    'PUT /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/42'
    + ' HTTP/1.1\r\n\r\n'
    + String.fromCharCode(0x80, 0x9c, 0xe9);
const MESSAGE_PAIR_RESPONSE = 'HTTP/1.1 200 OK\r\n\r\n'
    + String.fromCharCode(0x80, 0x9c, 0xe9);
const MESSAGE_PAIR_ROW = {
    id: MESSAGE_PAIR_ID,
    ...await ledgerFields({
        id: MESSAGE_PAIR_ID,
        path: '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        name: '42',
        requester_identity_id: 'WOTMsfERBVJEuTRTgrQptQ',
        method: 'PUT',
        response_at: '2026-01-01T00:00:00.000001Z',
        request: MESSAGE_PAIR_REQUEST,
        response: MESSAGE_PAIR_RESPONSE,
        operation_id: 'WvNiHVgksjrlfhPfdgfcyQ',
    }),
};

Deno.test('ensureTable runs compile-time SCHEMA', async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.ensureTable();
    assertStrictEquals(fake.calls.length, 3);
    assertStrictEquals(fake.calls[0]!.text, POSTGRES_SCHEMA);
    assertMatch(fake.calls[1]!.text, /0000-root/);
    assertMatch(
        fake.calls[2]!.text,
        /INSERT INTO fa_message_pairs/,
    );
    fake.rows = [{ id: MESSAGE_PAIR_ID }];
    await backend.ensureTable();
    assertStrictEquals(fake.calls.length, 5);
    assertMatch(fake.calls[4]!.text, /0000-root/);
});

Deno.test('schema declares collection indexes', () => {
    assertMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS fa_message_pairs_collection/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /ON fa_message_pairs \(path, response_at, id\)/,
    );
});

Deno.test('the columns are path and name; the document index'
+ ' names them', () => {
    assertMatch(
        POSTGRES_SCHEMA,
        /\n    path text COLLATE "C" NOT NULL\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /\n    name text COLLATE "C" NOT NULL,\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX IF NOT EXISTS fa_message_pairs_document\n/,
    );
    assertMatch(
        POSTGRES_SCHEMA,
        /ON fa_message_pairs \(path, name, response_at, id\)/,
    );
    assertNotMatch(
        POSTGRES_SCHEMA,
        /uri_collection|uri_id|message_pairs_address/,
    );
});

Deno.test('POSTGRES_DROP_SCHEMA drops schema public',
() => {
    assertStrictEquals(
        POSTGRES_DROP_SCHEMA,
        'DROP SCHEMA public CASCADE;\n'
        + 'CREATE SCHEMA public;\n'
        + 'GRANT ALL ON SCHEMA public TO CURRENT_USER;\n'
        + 'GRANT ALL ON SCHEMA public TO public;',
    );
});

Deno.test('deleteSchema unsafes POSTGRES_DROP_SCHEMA',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.deleteSchema();
    assertStrictEquals(
        fake.calls[0]!.text,
        POSTGRES_DROP_SCHEMA,
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

Deno.test('getCollectionPairs selects by path, ordered',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction('readonly',
        (tx) => tx.getCollectionPairs(
            '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
        ),
    );
    const text = fake.calls[0]!.text;
    assertMatch(text, /WHERE path = \$1/);
    assertMatch(
        text,
        /ORDER BY fa_message_pairs\.response_at, fa_message_pairs\.id/,
    );
});

Deno.test(
    'getDocumentHistory selects by path and name, ordered',
    async () => {
        const fake = fakeClient();
        const backend = new PostgresBackend(fake.sql);
        await backend.transaction('readonly',
            (tx) => tx.getDocumentHistory(
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
                '42',
            ),
        );
        const text = fake.calls[0]!.text;
        assertMatch(text, /WHERE path = \$1/);
        assertMatch(text, /AND name = \$2/);
        assertMatch(text, new RegExp(
            'ORDER BY fa_message_pairs\\.response_at, '
            + 'fa_message_pairs\\.id',
        ));
        assertEquals(
            fake.calls[0]!.values,
            [
                '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
                '42',
            ],
        );
    },
);

Deno.test('schema has no operation indexes', () => {
    assertNotMatch(
        POSTGRES_SCHEMA,
        /CREATE INDEX.*operation/,
    );
});

Deno.test('put writes BYTEA via Octets.fromLatin1',
async () => {
    const fake = fakeClient();
    const backend = new PostgresBackend(fake.sql);
    await backend.transaction('readwrite',
        (tx) => tx.append(MESSAGE_PAIR_ROW),
    );
    const values = fake.calls[0]!.values;
    const bytes = values.filter(
        (value) => value instanceof Uint8Array,
    );
    assertStrictEquals(bytes.length, 11);
    assertEquals(
        bytes[0],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.request).asBytes(),
    );
    assertEquals(
        bytes[5],
        Octets.fromLatin1(MESSAGE_PAIR_ROW.response).asBytes(),
    );
});

Deno.test('get reads BYTEA via latin1, not TextDecoder',
async () => {
    const fake = fakeClient();
    const wire = MESSAGE_PAIR_ROW.request;
    const bytes = Octets.fromLatin1(wire).asBytes();
    fake.rows = [{
        id: uuidTextOfIdentifier(MESSAGE_PAIR_ROW.id),
        operation_id: uuidTextOfIdentifier(
            MESSAGE_PAIR_ROW.operation_id,
        ),
        supersedes: uuidTextOfIdentifier(
            MESSAGE_PAIR_ROW.supersedes,
        ),
        path: MESSAGE_PAIR_ROW.path,
        name: MESSAGE_PAIR_ROW.name,
        requester_identity_id:
            MESSAGE_PAIR_ROW.requester_identity_id,
        method: MESSAGE_PAIR_ROW.method,
        response_at: MESSAGE_PAIR_ROW.response_at,
        request: Buffer.from(bytes),
        request_salt: Buffer.alloc(16),
        request_hash: Buffer.alloc(32),
        request_secrets: Buffer.alloc(0),
        request_secrets_hash: Buffer.alloc(32),
        response: Buffer.from(bytes),
        response_salt: Buffer.alloc(16),
        response_hash: Buffer.alloc(32),
        response_secrets: Buffer.alloc(0),
        response_secrets_hash: Buffer.alloc(32),
        pair_hash: Buffer.alloc(32),
    }];
    const backend = new PostgresBackend(fake.sql);
    const row = await backend.transaction(
        'readonly',
        (tx) => tx.getById<typeof MESSAGE_PAIR_ROW>(
            MESSAGE_PAIR_ROW.id,
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
        () => backend.transaction('readonly',
            (tx) => tx.getAll(),
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

const ZULU_RESPONSE_AT = new RegExp(
    'to_char\\(response_at AT TIME ZONE \'UTC\','
    + '\\s*\'YYYY-MM-DD"T"HH24:MI:SS\\.US"Z"\'\\)'
    + '\\s*AS response_at',
);

Deno.test(
    'every pair read formats response_at as zulu text',
    async () => {
        const fake = fakeClient();
        const backend = new PostgresBackend(fake.sql);
        const path = MESSAGE_PAIR_ROW.path;
        await backend.transaction('readonly', async (tx) => {
            await tx.getById(MESSAGE_PAIR_ROW.id);
            await tx.getAll();
            await tx.getCollectionPairs(path);
            await tx.getDocumentHistory(
                path, MESSAGE_PAIR_ROW.name,
            );
            await tx.getHeadPair(path, MESSAGE_PAIR_ROW.name);
            await tx.getCollectionHeadPairs(path);
        });
        assertStrictEquals(fake.calls.length, 6);
        for (const call of fake.calls) {
            assertMatch(call.text, ZULU_RESPONSE_AT);
        }
    },
);

Deno.test(
    'the collection head read walks names, not versions',
    async () => {
        const fake = fakeClient();
        const backend = new PostgresBackend(fake.sql);
        await backend.transaction('readonly', async (tx) => {
            await tx.getCollectionHeadPairs(
                MESSAGE_PAIR_ROW.path,
            );
        });
        assertMatch(fake.calls[0]!.text, /WITH RECURSIVE/);
        assertNotMatch(fake.calls[0]!.text, /DISTINCT ON/);
    },
);

Deno.test(
    'append casts the response stamp to timestamptz',
    async () => {
        const fake = fakeClient();
        const backend = new PostgresBackend(fake.sql);
        await backend.transaction(
            'readwrite',
            (tx) => tx.append(MESSAGE_PAIR_ROW),
        );
        const text = fake.calls[0]!.text;
        // ::text::timestamptz, not a bare ::timestamptz:
        // measured against real Postgres, npm:postgres
        // truncates a bound ${x}::timestamptz parameter to
        // millisecond precision; the ::text hop keeps the
        // driver from touching it (see insertPair).
        assertMatch(text, /\$8::text::timestamptz/);
    },
);
