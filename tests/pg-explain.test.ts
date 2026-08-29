import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { connectPostgres } from
    '../api/postgres-client.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { TABLE_NAMES, type Tx } from '../api/db.ts';
import { serializeWire } from
    '../shared/http-message/wire-codec.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { decodeIdentifier } from
    '../shared/identifier.ts';

// Live EXPLAIN pins for schema indexes. ./validate stays
// Postgres-free: skip when POSTGRES_URL is unset. Private
// schema per file; do not share schemas across files.

const POSTGRES_URL = process.env['POSTGRES_URL'];
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

const IDEA_COLLECTION = '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/';
const FILLER_COLLECTION = '/filler/';
const AUTH_COLLECTION = '/authentication/authorize/';
const VERSION_COLLECTION = '/versioned/';
const IDEA_N = 1;
const AUTH_N = 9;
const AUTH_OTHER_START = 10;
const AUTH_OTHER_COUNT = 199;
const VERSION_URI_ID = 'AjdvjuECVZEgZoFajaIEkg';
const VERSION_N = 500;
const VERSION_EXTRA_START = 501;
const VERSION_EXTRA_COUNT = 80;
const FILLER_START = 1000;
const FILLER_COUNT = 2000;
const REQUESTER = 'WOTMsfERBVJEuTRTgrQptQ';
const OPERATION = 'WvNiHVgksjrlfhPfdgfcyQ';
const AUTH_CONTAINMENT = { code: 'abc' };

function schemaName(): string {
    const base = process.env['SCHEMA_NAME']
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(process.pid)
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

async function putMessagePair(
    tx: Tx,
    n: number,
    collection: string,
    uriId: string,
    message: string,
    method: string,
): Promise<void> {
    const id = id22(n);
    const at = atStamp(n);
    await tx.put('message_pairs', {
        id,
        uri_collection: collection,
        uri_id: uriId,
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
    await tx.put('message_pairs', {
        id,
        uri_collection: AUTH_COLLECTION,
        uri_id: '',
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
    await backend.transaction(
        TABLE_NAMES,
        'readwrite',
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
                await putMessagePair(
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
            // Fat address (81 pairs at one uri_id):
            // address ORDER BY prefers message_pairs_address.
            // Keep /organizations/AjdvjuECVZEgZoFajaIEkg/ideas/ small for the
            // collection pin.
            await putMessagePair(
                tx,
                VERSION_N,
                VERSION_COLLECTION,
                VERSION_URI_ID,
                putWire(
                    VERSION_COLLECTION + VERSION_URI_ID,
                    '',
                ),
                'PUT',
            );
            for (let i = 0; i < VERSION_EXTRA_COUNT; i++) {
                const n = VERSION_EXTRA_START + i;
                await putMessagePair(
                    tx,
                    n,
                    VERSION_COLLECTION,
                    VERSION_URI_ID,
                    putWire(
                        VERSION_COLLECTION + VERSION_URI_ID,
                        '',
                    ),
                    'PUT',
                );
            }
            for (let i = 0; i < FILLER_COUNT; i++) {
                const n = FILLER_START + i;
                await putMessagePair(
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
        assert.ok(
            text.includes(name),
            'expected ' + name + ' in\n' + text,
        );
    }
    assert.doesNotMatch(text, /Seq Scan/);
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    test(
        'postgres explain skipped without POSTGRES_URL',
        { skip: 'POSTGRES_URL is unset' },
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

    before(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await backend.ensureTables(TABLE_NAMES);
        await seedRows(backend);
        await sql.query`ANALYZE message_pairs`;
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

    test('pk uses message_pairs_pkey', async () => {
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

    test('small collection uses collection index',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE uri_collection = ${IDEA_COLLECTION}
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_collection'],
        );
    });

    test('request_hash uses message_pairs_replay', async () => {
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

    test('address uses address index', async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE uri_collection = ${VERSION_COLLECTION}
              AND uri_id = ${VERSION_URI_ID}
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_address'],
        );
    });

    test('body containment uses message_pairs_body',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT * FROM message_pairs
            WHERE uri_collection = ${AUTH_COLLECTION}
              AND message_body(response) @>
                  ${AUTH_CONTAINMENT}::jsonb
            ORDER BY response_at, id
        `;
        assertIndexPlan(
            explainText(plans),
            ['message_pairs_body'],
        );
    });

    test('latestPutDelete uses address and pkey',
    async () => {
        const plans = await sql.query<
            Record<string, unknown>
        >`
            EXPLAIN
            SELECT id, method
            FROM message_pairs
            WHERE uri_collection = ${VERSION_COLLECTION}
              AND uri_id = ${VERSION_URI_ID}
              AND method IN ('PUT', 'DELETE')
            ORDER BY response_at DESC, id DESC
            LIMIT 1
        `;
        const text = explainText(plans);
        assert.doesNotMatch(text, /requests_pkey/);
        assert.doesNotMatch(text, /Join/);
        assertIndexPlan(text, ['message_pairs_address']);
    });
}
