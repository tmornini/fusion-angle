import { assertEquals } from '@std/assert';
import { connectPostgres } from
    '../api/postgres-client.ts';
import {
    POSTGRES_FA_IMF_FIXDATE_FUNCTION,
    POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION,
    POSTGRES_FA_PAIR_ROOT_FUNCTION,
    POSTGRES_FA_REQUEST_ID_OF_FUNCTION,
} from '../api/schema-postgres.ts';
import {
    leafHashHex,
    pairRootHex,
    secretHashHex,
} from '../shared/pair-root.ts';

// Live pins for the ledger SQL functions. Skip when
// POSTGRES_URL is unset so ./test validate stays
// Postgres-free. One scratch schema; do not share it.
// The session zone is not UTC, so a function that
// follows TimeZone or DateStyle cannot match.

const POSTGRES_URL = Deno.env.get('POSTGRES_URL');
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NIL_UUID =
    '00000000-0000-0000-0000-000000000000';
const PAIR_ID =
    '00000000-0000-0000-0000-000000000001';
const OPERATION_ID =
    '00000000-0000-0000-0000-000000000002';
const RESPONSE_AT = '2026-09-23T00:00:00.000000Z';
const REQUEST_TEXT = 'req';
const RESPONSE_TEXT =
    'HTTP/1.1 201 \r\n'
    + 'content-length: 5\r\n'
    + 'date: Wed, 23 Sep 2026 00:00:00 GMT\r\n'
    + 'etag: "AAAAAAAAAAAAAAAAAAAAAA"\r\n'
    + '\r\n'
    + 'hello';
const WITH_REQUEST_ID =
    'HTTP/1.1 200 \r\n'
    + 'content-length: 0\r\n'
    + 'request-id: abc\r\n'
    + '\r\n';
const LEADING_REQUEST_ID =
    'request-id: abc\r\n'
    + '\r\n';
const BODY_REQUEST_ID =
    'HTTP/1.1 200 \r\n'
    + '\r\n'
    + 'request-id: abc';
const LOOKALIKE =
    'HTTP/1.1 200 \r\n'
    + 'x-request-id: abc\r\n'
    + '\r\n';
const NO_SEPARATOR =
    'HTTP/1.1 201 \r\n'
    + 'content-length: 5';

function schemaName(): string {
    const base = Deno.env.get('SCHEMA_NAME')
        ?? (
            'fusion_test_'
            + String(Date.now())
            + '_'
            + String(Deno.pid)
        );
    const name = base + '_ledger_store';
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
    parsed.searchParams.set(
        'TimeZone', 'Pacific/Honolulu',
    );
    parsed.searchParams.set('DateStyle', 'SQL, DMY');
    return parsed.href;
}

function hexOf(bytes: Uint8Array): string {
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

function only<T>(rows: readonly T[]): T {
    const row = rows[0];
    if (row === undefined || rows.length !== 1) {
        throw new Error('expected one row');
    }
    return row;
}

if (POSTGRES_URL === undefined || POSTGRES_URL === '') {
    Deno.test(
        'postgres ledger store skipped without'
            + ' POSTGRES_URL',
        { ignore: true }, // POSTGRES_URL is unset
        () => {},
    );
} else {
    const schema = schemaName();
    const sql = connectPostgres(
        urlWithSearchPath(POSTGRES_URL, schema),
    );
    let requestHash = '';
    let secretHash = '';
    let responseHash = '';
    let pairHash = '';
    let requestSaltHex = '';
    let responseSaltHex = '';

    Deno.test.beforeAll(async () => {
        await sql.unsafe(
            'CREATE SCHEMA ' + quoteIdent(schema),
        );
        await sql.unsafe(
            POSTGRES_FA_IMF_FIXDATE_FUNCTION,
        );
        await sql.unsafe(POSTGRES_FA_PAIR_ROOT_FUNCTION);
        await sql.unsafe(
            POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION,
        );
        await sql.unsafe(
            POSTGRES_FA_REQUEST_ID_OF_FUNCTION,
        );
        const placed = await sql.query<{ nsp: string }>`
            SELECT n.nspname AS nsp
            FROM pg_proc AS p
            JOIN pg_namespace AS n
                ON n.oid = p.pronamespace
            WHERE p.proname IN (
                'fa_imf_fixdate',
                'fa_pair_root',
                'fa_message_body_bytes',
                'fa_request_id_of'
            )
        `;
        if (placed.length !== 4) {
            throw new Error(
                'expected four ledger functions',
            );
        }
        for (const row of placed) {
            if (row.nsp !== schema) {
                throw new Error(
                    'function is outside the scratch'
                    + ' schema',
                );
            }
        }
        const request = new TextEncoder().encode(
            REQUEST_TEXT,
        );
        const response = new TextEncoder().encode(
            RESPONSE_TEXT,
        );
        const requestSalt = new Uint8Array(16)
            .fill(0x11);
        const responseSalt = new Uint8Array(16)
            .fill(0x22);
        const secret = new Uint8Array(0);
        requestSaltHex = hexOf(requestSalt);
        responseSaltHex = hexOf(responseSalt);
        requestHash = await leafHashHex(
            requestSalt, request,
        );
        secretHash = await secretHashHex(secret);
        responseHash = await leafHashHex(
            responseSalt, response,
        );
        pairHash = await pairRootHex({
            id: PAIR_ID,
            operationId: OPERATION_ID,
            path: '/migrations/',
            name: '0001-example',
            supersedes: NIL_UUID,
            requesterIdentityId: 'fa_owner',
            method: 'PUT',
            responseAt: RESPONSE_AT,
            requestHashHex: requestHash,
            secretHashHex: secretHash,
            responseHashHex: responseHash,
        });
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

    Deno.test(
        'fa_imf_fixdate is the 29-byte IMF date',
        async () => {
            const row = only(await sql.query<{
                fixdate: string;
                octets: number;
                zone: string;
                date_style: string;
            }>`
                SELECT fa_imf_fixdate(
                        '2026-09-23 00:00:00+00'
                        ::timestamptz
                    ) AS fixdate,
                    octet_length(fa_imf_fixdate(
                        '2026-09-23 00:00:00+00'
                        ::timestamptz
                    )) AS octets,
                    current_setting('TimeZone') AS zone,
                    current_setting('DateStyle')
                        AS date_style
            `);
            assertEquals(
                row.zone, 'Pacific/Honolulu',
            );
            assertEquals(row.date_style, 'SQL, DMY');
            assertEquals(
                row.fixdate,
                'Wed, 23 Sep 2026 00:00:00 GMT',
            );
            assertEquals(row.octets, 29);
        },
    );

    Deno.test(
        'fa_pair_root matches the typescript twin',
        async () => {
            const row = only(await sql.query<{
                request_hash: string;
                secret_hash: string;
                response_hash: string;
                pair_hash: string;
            }>`
                SELECT encode(sha256(
                        decode(${requestSaltHex}, 'hex')
                        || convert_to(
                            ${REQUEST_TEXT}, 'UTF8'
                        )
                    ), 'hex') AS request_hash,
                    encode(sha256(
                        ''::bytea
                    ), 'hex') AS secret_hash,
                    encode(sha256(
                        decode(
                            ${responseSaltHex}, 'hex'
                        )
                        || convert_to(
                            ${RESPONSE_TEXT}, 'UTF8'
                        )
                    ), 'hex') AS response_hash,
                    encode(fa_pair_root(
                        ${PAIR_ID}::uuid,
                        ${OPERATION_ID}::uuid,
                        ${'/migrations/'},
                        ${'0001-example'},
                        ${NIL_UUID}::uuid,
                        ${'fa_owner'},
                        ${'PUT'},
                        ${RESPONSE_AT}::timestamptz,
                        decode(${requestHash}, 'hex'),
                        decode(${secretHash}, 'hex'),
                        decode(${responseHash}, 'hex')
                    ), 'hex') AS pair_hash
            `);
            assertEquals(row.request_hash, requestHash);
            assertEquals(row.secret_hash, secretHash);
            assertEquals(
                row.response_hash, responseHash,
            );
            assertEquals(row.pair_hash, pairHash);
        },
    );

    Deno.test(
        'fa_request_id_of reads the header line',
        async () => {
            const row = only(await sql.query<{
                pinned: string | null;
                named: string | null;
                leading: string | null;
                empty: string | null;
                body_line: string | null;
                lookalike: string | null;
            }>`
                SELECT fa_request_id_of(convert_to(
                        ${RESPONSE_TEXT}, 'UTF8'
                    )) AS pinned,
                    fa_request_id_of(convert_to(
                        ${WITH_REQUEST_ID}, 'UTF8'
                    )) AS named,
                    fa_request_id_of(convert_to(
                        ${LEADING_REQUEST_ID}, 'UTF8'
                    )) AS leading,
                    fa_request_id_of(
                        ''::bytea
                    ) AS empty,
                    fa_request_id_of(convert_to(
                        ${BODY_REQUEST_ID}, 'UTF8'
                    )) AS body_line,
                    fa_request_id_of(convert_to(
                        ${LOOKALIKE}, 'UTF8'
                    )) AS lookalike
            `);
            assertEquals(row.pinned, null);
            assertEquals(row.named, 'abc');
            assertEquals(row.leading, 'abc');
            assertEquals(row.empty, null);
            assertEquals(row.body_line, null);
            assertEquals(row.lookalike, null);
        },
    );

    Deno.test(
        'fa_message_body_bytes splits on CRLF CRLF',
        async () => {
            const row = only(await sql.query<{
                body: string;
                octets: number;
                matches: boolean;
                bare_octets: number;
            }>`
                SELECT convert_from(body, 'UTF8') AS body,
                    octet_length(body) AS octets,
                    body = convert_to(
                        'hello', 'UTF8'
                    ) AS matches,
                    octet_length(fa_message_body_bytes(
                        convert_to(
                            ${NO_SEPARATOR}, 'UTF8'
                        )
                    )) AS bare_octets
                FROM (
                    SELECT fa_message_body_bytes(
                        convert_to(
                            ${RESPONSE_TEXT}, 'UTF8'
                        )
                    ) AS body
                ) AS extracted
            `);
            assertEquals(row.body, 'hello');
            assertEquals(row.octets, 5);
            assertEquals(row.matches, true);
            assertEquals(row.bare_octets, 0);
        },
    );
}
