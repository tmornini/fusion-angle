import {
    assert,
    assertMatch,
    assertNotMatch,
} from '@std/assert';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import type { Tx } from '../api/db.ts';
import { serializeWire } from
    '../shared/http-message/wire-codec.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { decodeIdentifier } from
    '../shared/identifier.ts';

// Live EXPLAIN pins for schema indexes. ./validate stays
// Postgres-free: skip when POSTGRES_URL is unset. Private
// schema per file; do not share schemas across files.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const IDEA_COLLECTION = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FILLER_COLLECTION = '/filler/';
const AUTH_COLLECTION = '/authentication/authorize/';
const VERSION_COLLECTION = '/versioned/';
const IDEA_N = 1;
const AUTH_N = 9;
const AUTH_OTHER_START = 10;
const AUTH_OTHER_COUNT = 199;
const VERSION_NAME = 'AjdvjuECVZEgZoFajaIEkg';
const VERSION_N = 500;
const VERSION_EXTRA_START = 501;
const VERSION_EXTRA_COUNT = 80;
const FILLER_START = 1000;
const FILLER_COUNT = 2000;
const REQUESTER = 'WOTMsfERBVJEuTRTgrQptQ';
const OPERATION = 'WvNiHVgksjrlfhPfdgfcyQ';
const AUTH_CONTAINMENT = { code: 'abc' };

function schemaName(): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + '_explain';
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

function id22(n: number): string {
    return n.toString(10).padStart(21, 'a') + 'A';
}

function uuidTextOfIdentifier(id: string): string {
    const bytes = decodeIdentifier(id);
    let hex = '';
    for (const b of bytes) {
        hex += b.toString(16).padStart(2, '0');
    }
    return (
        hex.slice(0, 8) + '-'
        + hex.slice(8, 12) + '-'
        + hex.slice(12, 16) + '-'
        + hex.slice(16, 20) + '-'
        + hex.slice(20)
    );
}

function hex64(n: number): string {
    return n.toString(16).padStart(64, '0');
}

function atStamp(n: number): string {
    return '2026-01-01T00:00:00.'
        + n.toString(10).padStart(6, '0')
        + 'Z';
}

function putWire(path: string, pad: string): string {
    if (pad.length === 0) {
        return 'PUT ' + path + ' HTTP/1.1\r\n\r\n';
    }
    return 'PUT ' + path + ' HTTP/1.1 ' + pad;
}

function jsonWire(body: unknown): string {
    const json = JSON.stringify(body);
    return serializeWire({
        startLine: {
            kind: 'response',
            version: 'HTTP/1.1',
            status: 200,
            reason: 'OK',
        },
        fields: [
            {
                name: 'content-type',
                value: 'application/json',
            },
        ],
        body: Octets.fromLatin1(json),
        trailer: undefined,
    });
}

async function appendRow(
    tx: Tx,
    n: number,
    collection: string,
    name: string,
    message: string,
    method: string,
): Promise<void> {
    const id = id22(n);
    const at = atStamp(n);
    await tx.append({
        id,
        path: collection,
        name: name,
        requester_identity_id: REQUESTER,
        method,
        request_at: at,
        request_hash: hex64(n),
        request: message,
        response_at: at,
        response: message,
        operation_id: OPERATION,
    });
}

async function putAuthorize(
    tx: Tx,
    n: number,
    code: string,
): Promise<void> {
    const id = id22(n);
    const at = atStamp(n);
    await tx.append({
        id,
        path: AUTH_COLLECTION,
        name: '',
        requester_identity_id: REQUESTER,
        method: 'GET',
        request_at: at,
        request_hash: hex64(n),
        request:
            'GET /authentication/authorize/'
            + ' HTTP/1.1\r\n\r\n',
        response_at: at,
        response: jsonWire({ code }),
        operation_id: OPERATION,
    });
}

async function seedRows(
    backend: PostgresBackend,
): Promise<void> {
    await backend.transaction('readwrite',
        async (tx) => {
            await putAuthorize(
                tx,
                AUTH_N,
                AUTH_CONTAINMENT.code,
            );
            for (let i = 0; i < AUTH_OTHER_COUNT; i++) {
                const n = AUTH_OTHER_START + i;
                await putAuthorize(tx, n, 'c' + String(n));
            }
            for (let n = 1; n <= 4; n++) {
                await appendRow(
                    tx,
                    n,
                    IDEA_COLLECTION,
                    String(n),
                    putWire(
                        IDEA_COLLECTION + String(n),
                        '',
                    ),
                    'PUT',
                );
            }
            // Fat document (81 pairs at one name):
            // document ORDER BY prefers
            // message_pairs_document.
            // Keep /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/ small for the
            // collection pin.
            await appendRow(
                tx,
                VERSION_N,
                VERSION_COLLECTION,
                VERSION_NAME,
                putWire(
                    VERSION_COLLECTION + VERSION_NAME,
                    '',
                ),
                'PUT',
            );
            for (let i = 0; i < VERSION_EXTRA_COUNT; i++) {
                const n = VERSION_EXTRA_START + i;
                await appendRow(
                    tx,
                    n,
                    VERSION_COLLECTION,
                    VERSION_NAME,
                    putWire(
                        VERSION_COLLECTION + VERSION_NAME,
                        '',
                    ),
                    'PUT',
                );
            }
            for (let i = 0; i < FILLER_COUNT; i++) {
                const n = FILLER_START + i;
                await appendRow(
                    tx,
                    n,
                    FILLER_COLLECTION,
                    String(n),
                    putWire('', ''),
                    'PUT',
                );
            }
        },
    );
}

function explainText(
    plans: ReadonlyArray<Record<string, unknown>>,
): string {
    return plans.map((row) => {
        const plan = row['QUERY PLAN'];
        if (typeof plan === 'string') {
            return plan;
        }
        return Object.values(row).map(String).join(' ');
    }).join('\n');
}

function assertIndexPlan(
    text: string,
    indexes: readonly string[],
): void {
    for (const name of indexes) {
        assert(
            text.includes(name),
            'expected ' + name + ' in\n' + text,
        );
    }
    assertNotMatch(text, /Seq Scan/);
}

// Every line after `node`'s own is its subtree: EXPLAIN
// text indents children beneath their parent.
function assertNoSortBeneath(
    text: string,
    node: string,
): void {
    const lines = text.split('\n');
    const at = lines.findIndex((line) => line.includes(node));
    assert(at >= 0, 'expected ' + node + ' in\n' + text);
    for (const line of lines.slice(at + 1)) {
        assertNotMatch(
            line, /Sort/, 'Sort beneath ' + node
            + ' in\n' + text,
        );
    }
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres explain skipped without POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    const backend = new PostgresBackend(sql);
    const ideaId = id22(IDEA_N);
    const ideaHash = hex64(IDEA_N);

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTable();
        await seedRows(backend);
        await sql.query`ANALYZE message_pairs`;
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

    Deno.test('pk uses message_pairs_pkey', async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE id = ${uuidTextOfIdentifier(ideaId)}
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_pkey'],
        );
    });

    Deno.test('small collection uses collection index',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE path = ${IDEA_COLLECTION}
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_collection'],
        );
    });

    Deno.test('request_hash uses message_pairs_replay', async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE request_hash = ${ideaHash}
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_replay'],
        );
    });

    Deno.test('document read uses the document index',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE path = ${VERSION_COLLECTION}
              AND name = ${VERSION_NAME}
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_document'],
        );
    });

    Deno.test('body containment uses message_pairs_body',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE path = ${AUTH_COLLECTION}
              AND message_body(response) @>
                  ${AUTH_CONTAINMENT}::jsonb
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_body'],
        );
    });

    Deno.test('getHead uses the document index and pkey',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT id, method
            FROM message_pairs
            WHERE path = ${VERSION_COLLECTION}
              AND name = ${VERSION_NAME}
              AND method IN ('PUT', 'DELETE')
            ORDER BY response_at DESC, id DESC
            LIMIT 1
        `;
        const text = explainText(plans);
        assertNotMatch(text, /requests_pkey/);
        assertNotMatch(text, /Join/);
        assertIndexPlan(text, ['message_pairs_document']);
        assertMatch(text, /Limit/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNotMatch(text, /Sort/);
    });

    Deno.test('collection head pairs come off the document'
    + ' index backward under Unique', async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM (
                SELECT DISTINCT ON (name) *
                FROM message_pairs
                WHERE path = ${IDEA_COLLECTION}
                  AND method IN ('PUT', 'DELETE')
                ORDER BY name DESC, response_at DESC, id DESC
            ) heads
            WHERE method = 'PUT'
            ORDER BY response_at, id
        `;
        const text = explainText(plans);
        assertMatch(text, /Unique/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNoSortBeneath(text, 'Unique');
        assertNotMatch(text, /Seq Scan/);
    });

    Deno.test('head pair is one backward walk under a Limit',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE path = ${VERSION_COLLECTION}
              AND name = ${VERSION_NAME}
              AND method IN ('PUT', 'DELETE')
            ORDER BY response_at DESC, id DESC
            LIMIT 1
        `;
        const text = explainText(plans);
        assertMatch(text, /Limit/);
        assertMatch(
            text,
            /Index Scan Backward using message_pairs_document/,
        );
        assertNotMatch(text, /Sort/);
    });

    Deno.test(
        'the whole ledger is the one seq scan, sorted',
        async () => {
            const plans = await sql.query<
                Record<string, unknown>
            >`
                EXPLAIN
                SELECT * FROM message_pairs
                ORDER BY response_at, id
            `;
            const text = explainText(plans);
            assertMatch(text, /Sort/);
            assertMatch(text, /Seq Scan on message_pairs/);
        },
    );

    Deno.test(
        'the head lock rows the primary key',
        async () => {
            const plans = await sql.query<
                Record<string, unknown>
            >`
                EXPLAIN
                SELECT id FROM message_pairs
                WHERE id = ${uuidTextOfIdentifier(ideaId)}
                FOR UPDATE
            `;
            const text = explainText(plans);
            assertMatch(text, /LockRows/);
            assertIndexPlan(text, ['message_pairs_pkey']);
        },
    );
}
