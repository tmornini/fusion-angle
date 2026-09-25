import {
    assert,
    assertEquals,
    assertRejects,
} from '@std/assert';
import postgres from 'postgres';
import { FUSION_EVENTS_CHANNEL } from
    '../api/advisory-lock.ts';
import { BackedDbAdapter } from '../api/db-backed.ts';
import { DATE_PLACEHOLDER } from '../api/ledger-root.ts';
import { statementText } from
    '../api/ledger-statement-sql.ts';
import { runLedgerStatement } from
    '../api/ledger-statement.ts';
import { PostgresBackend } from
    '../api/backend-postgres.ts';
import { connectPostgres } from
    '../api/postgres-client.ts';
import {
    POSTGRES_FA_IMF_FIXDATE_FUNCTION,
    POSTGRES_FA_MESSAGE_BODY_BYTES_FUNCTION,
    POSTGRES_FA_PAIR_ROOT_FUNCTION,
    POSTGRES_FA_REQUEST_ID_OF_FUNCTION,
} from '../api/schema-postgres.ts';
import {
    NIL_IDENTIFIER,
    generateIdentifier,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import type { StatementBind } from
    '../shared/ledger-statement.ts';
import {
    leafHashHex,
    microsOf,
    pairRootHex,
    secretHashHex,
    stampOfMicros,
} from '../shared/pair-root.ts';

// Live pins for the ledger functions and the table.
// Skip when POSTGRES_URL is unset so ./test validate
// stays Postgres-free. One scratch schema; do not
// share it. The session zone is not UTC, so a
// function that follows TimeZone or DateStyle
// cannot match.

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

function bytesFromHex(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = Number.parseInt(
            hex.slice(i * 2, i * 2 + 2), 16,
        );
    }
    return out;
}

function faultOf(error: unknown): {
    code: string,
    constraint: string,
} {
    if (error === null || typeof error !== 'object') {
        throw new Error('expected a postgres fault');
    }
    const rec = error as {
        code?: unknown,
        constraint?: unknown,
        constraint_name?: unknown,
    };
    const code = rec.code;
    const named = typeof rec.constraint === 'string'
        ? rec.constraint
        : rec.constraint_name;
    if (
        typeof code !== 'string'
        || typeof named !== 'string'
    ) {
        throw error;
    }
    return { code, constraint: named };
}

function splitResponse(body: string): {
    prefix: Uint8Array,
    suffix: Uint8Array,
} {
    const wire = 'HTTP/1.1 201 \r\n'
        + 'content-length: ' + String(body.length)
        + '\r\n'
        + 'date: ' + DATE_PLACEHOLDER + '\r\n'
        + '\r\n'
        + body;
    const mark = '\r\ndate: ';
    const valueAt = wire.indexOf(mark) + mark.length;
    const bytes = new TextEncoder().encode(wire);
    const width = DATE_PLACEHOLDER.length;
    return {
        prefix: bytes.slice(0, valueAt),
        suffix: bytes.slice(valueAt + width),
    };
}

function bindOf(fields: {
    id: string,
    operationId: string,
    path: string,
    name: string,
    method: string,
    body: string,
    notify: string,
}): StatementBind {
    const split = splitResponse(fields.body);
    const salt = new Uint8Array(16);
    return {
        id: fields.id,
        operationId: fields.operationId,
        path: fields.path,
        name: fields.name,
        requesterIdentityId: 'fa_owner',
        method: fields.method,
        request: new Uint8Array(0),
        requestSalt: salt,
        secret: new Uint8Array(0),
        responsePrefix: split.prefix,
        responseSuffix: split.suffix,
        responseSalt: salt.slice(),
        ifMatch: null,
        notify: fields.notify,
    };
}

function parametersOf(
    attempt: string,
    row: StatementBind,
): unknown[] {
    return [
        attempt,
        uuidTextOfIdentifier(row.id),
        uuidTextOfIdentifier(row.operationId),
        row.path,
        row.name,
        row.requesterIdentityId,
        row.method,
        row.request,
        row.requestSalt,
        row.secret,
        row.responsePrefix,
        row.responseSuffix,
        row.responseSalt,
        row.ifMatch === null
            ? null
            : uuidTextOfIdentifier(row.ifMatch),
        row.notify,
    ];
}

const LAND_WAIT_MS = 900;
const MATCH_WAIT_MS = 400;

function listenFor(url: string): {
    opened: () => Promise<void>,
    expect: (
        token: string,
        ms: number,
    ) => Promise<string | null>,
    pendingCount: (token: string) => number,
    close: () => Promise<void>,
} {
    const pending: string[] = [];
    const waiters: Array<(payload: string) => void> = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sql = postgres(url, {
        max: 1,
        onnotice: () => {},
    });
    let unlisten: (() => Promise<void>) | undefined;
    const ready = sql.listen(
        FUSION_EVENTS_CHANNEL,
        (payload) => {
            let taken = false;
            for (const waiter of [...waiters]) {
                const before = waiters.length;
                waiter(payload);
                if (waiters.length !== before) {
                    taken = true;
                    break;
                }
            }
            if (!taken) pending.push(payload);
        },
    ).then((subscription) => {
        unlisten = () => subscription.unlisten();
    });
    return {
        opened: () => ready.then(() => undefined),
        pendingCount: (token) => pending.filter(
            (payload) => payload === token,
        ).length,
        expect: (token, ms) => {
            const at = pending.indexOf(token);
            if (at >= 0) {
                pending.splice(at, 1);
                return Promise.resolve(token);
            }
            return new Promise((resolve) => {
                const timer = setTimeout(() => {
                    drop();
                    resolve(null);
                }, ms);
                timers.push(timer);
                const waiter = (payload: string) => {
                    if (payload !== token) return;
                    clearTimeout(timer);
                    drop();
                    resolve(token);
                };
                function drop(): void {
                    const index = waiters.indexOf(waiter);
                    if (index >= 0) {
                        waiters.splice(index, 1);
                    }
                }
                waiters.push(waiter);
            });
        },
        close: async () => {
            for (const timer of timers) {
                clearTimeout(timer);
            }
            try {
                await ready;
                if (unlisten !== undefined) {
                    await unlisten();
                }
            } finally {
                await sql.end();
            }
        },
    };
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
    const backend = new PostgresBackend(sql);
    const adapter = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );
    const landToken = schema + '-land';
    const matchToken = schema + '-match';
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
        await backend.ensureTable();
        const placed = await sql.query<{ nsp: string }>`
            SELECT n.nspname AS nsp
            FROM pg_proc AS p
            JOIN pg_namespace AS n
                ON n.oid = p.pronamespace
            WHERE n.nspname = ${schema}
              AND p.proname IN (
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

    function executeRaw(
        attempt: string,
        row: StatementBind,
    ): Promise<{ outcome: string }[]> {
        return sql.unsafe(
            statementText(1),
            parametersOf(attempt, row),
        );
    }

    type CheckRow = {
        path: string,
        name: string,
        method: string,
        requestSalt: Uint8Array,
        requestHash: Uint8Array,
        secretHash: Uint8Array,
        responseSalt: Uint8Array,
        responseHash: Uint8Array,
        pairHash: Uint8Array,
    };

    function validCheckRow(name: string): CheckRow {
        const salt = new Uint8Array(16);
        const hash = new Uint8Array(32);
        return {
            path: '/checks/',
            name,
            method: 'PUT',
            requestSalt: salt,
            requestHash: hash,
            secretHash: hash.slice(),
            responseSalt: salt.slice(),
            responseHash: hash.slice(),
            pairHash: hash.slice(),
        };
    }

    function insertCheckRow(row: CheckRow): Promise<unknown> {
        return sql.query`
            INSERT INTO fa_message_pairs (
                id, operation_id, path, name, supersedes,
                requester_identity_id, method, response_at,
                request, request_salt, request_hash,
                secret, secret_hash,
                response, response_salt, response_hash,
                pair_hash
            ) VALUES (
                gen_random_uuid(),
                ${OPERATION_ID}::uuid,
                ${row.path},
                ${row.name},
                ${NIL_UUID}::uuid,
                ${'fa_owner'},
                ${row.method},
                clock_timestamp(),
                ${new Uint8Array(0)},
                ${row.requestSalt},
                ${row.requestHash},
                ${new Uint8Array(0)},
                ${row.secretHash},
                ${new Uint8Array(0)},
                ${row.responseSalt},
                ${row.responseHash},
                ${row.pairHash}
            )
        `;
    }

    async function assertCheck(
        constraint: string,
        row: CheckRow,
    ): Promise<void> {
        const error = await assertRejects(
            () => insertCheckRow(row),
        );
        assertEquals(
            [
                faultOf(error).code,
                faultOf(error).constraint,
            ],
            ['23514', constraint],
        );
    }

    Deno.test(
        'the root occupies the nil slot and matches'
            + ' the twin',
        async () => {
            const row = only(await sql.query<{
                id: string;
                operation_id: string;
                path: string;
                name: string;
                supersedes: string;
                requester_identity_id: string;
                method: string;
                stamp: string;
                request_octets: number;
                secret_octets: number;
                request_salt: string;
                response_salt: string;
                request_hash: string;
                secret_hash: string;
                response_hash: string;
                pair_hash: string;
                response_hex: string;
                request_id: string | null;
            }>`
                SELECT id::text AS id,
                    operation_id::text AS operation_id,
                    path,
                    name,
                    supersedes::text AS supersedes,
                    requester_identity_id,
                    method,
                    to_char(
                        response_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                    ) AS stamp,
                    octet_length(request) AS request_octets,
                    octet_length(secret) AS secret_octets,
                    encode(request_salt, 'hex')
                        AS request_salt,
                    encode(response_salt, 'hex')
                        AS response_salt,
                    encode(request_hash, 'hex')
                        AS request_hash,
                    encode(secret_hash, 'hex')
                        AS secret_hash,
                    encode(response_hash, 'hex')
                        AS response_hash,
                    encode(pair_hash, 'hex') AS pair_hash,
                    encode(response, 'hex') AS response_hex,
                    fa_request_id_of(response) AS request_id
                FROM fa_message_pairs
                WHERE id = ${NIL_UUID}::uuid
            `);
            const salt = new Uint8Array(16);
            const empty = new Uint8Array(0);
            const requestDigest = await leafHashHex(
                salt, empty,
            );
            const secretDigest = await secretHashHex(
                empty,
            );
            const responseDigest = await leafHashHex(
                salt, bytesFromHex(row.response_hex),
            );
            const pairDigest = await pairRootHex({
                id: row.id,
                operationId: row.operation_id,
                path: row.path,
                name: row.name,
                supersedes: row.supersedes,
                requesterIdentityId:
                    row.requester_identity_id,
                method: row.method,
                responseAt: row.stamp,
                requestHashHex: requestDigest,
                secretHashHex: secretDigest,
                responseHashHex: responseDigest,
            });
            assertEquals(row.id, NIL_UUID);
            assertEquals(row.path, '/migrations/');
            assertEquals(row.name, '0000-root');
            assertEquals(row.supersedes, NIL_UUID);
            assertEquals(row.method, 'PUT');
            assertEquals(
                row.requester_identity_id, 'fa_owner',
            );
            assertEquals(row.request_octets, 0);
            assertEquals(row.secret_octets, 0);
            assertEquals(
                row.request_salt, '00'.repeat(16),
            );
            assertEquals(
                row.response_salt, '00'.repeat(16),
            );
            assertEquals(row.request_id, null);
            assertEquals(row.request_hash, requestDigest);
            assertEquals(row.secret_hash, secretDigest);
            assertEquals(
                row.response_hash, responseDigest,
            );
            assertEquals(row.pair_hash, pairDigest);
        },
    );

    Deno.test(
        'fa_message_pairs_request_salt_chk rejects'
            + ' a short salt',
        async () => {
            const row = validCheckRow('request-salt');
            row.requestSalt = new Uint8Array(15);
            await assertCheck(
                'fa_message_pairs_request_salt_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_response_salt_chk rejects'
            + ' a short salt',
        async () => {
            const row = validCheckRow('response-salt');
            row.responseSalt = new Uint8Array(15);
            await assertCheck(
                'fa_message_pairs_response_salt_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_request_hash_chk rejects'
            + ' a short digest',
        async () => {
            const row = validCheckRow('request-hash');
            row.requestHash = new Uint8Array(31);
            await assertCheck(
                'fa_message_pairs_request_hash_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_secret_hash_chk rejects'
            + ' a short digest',
        async () => {
            const row = validCheckRow('secret-hash');
            row.secretHash = new Uint8Array(31);
            await assertCheck(
                'fa_message_pairs_secret_hash_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_response_hash_chk rejects'
            + ' a short digest',
        async () => {
            const row = validCheckRow('response-hash');
            row.responseHash = new Uint8Array(31);
            await assertCheck(
                'fa_message_pairs_response_hash_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_pair_hash_chk rejects'
            + ' a short digest',
        async () => {
            const row = validCheckRow('pair-hash');
            row.pairHash = new Uint8Array(31);
            await assertCheck(
                'fa_message_pairs_pair_hash_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_method_chk rejects'
            + ' a lowercase method',
        async () => {
            const row = validCheckRow('method');
            row.method = 'put';
            await assertCheck(
                'fa_message_pairs_method_chk',
                row,
            );
        },
    );

    Deno.test(
        'fa_message_pairs_path_chk rejects'
            + ' a path that is not slash-bounded',
        async () => {
            const row = validCheckRow('path');
            row.path = '/checks';
            await assertCheck(
                'fa_message_pairs_path_chk',
                row,
            );
        },
    );

    Deno.test(
        'a second put or delete at the root slot is'
            + ' 23505 and a post inserts',
        async () => {
            // The root already holds (path, name, nil).
            // A blind PUT or DELETE supersedes that
            // head, so it asks for the same slot.
            // POST is outside the index.
            const putError = await assertRejects(() =>
                executeRaw('blind', bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/migrations/',
                    name: '0000-root',
                    method: 'PUT',
                    body: 'again',
                    notify: schema + '-put',
                })),
            );
            assertEquals(
                [
                    faultOf(putError).code,
                    faultOf(putError).constraint,
                ],
                ['23505', 'fa_message_pairs_succession'],
            );
            const deleteError = await assertRejects(
                () => executeRaw('blind', bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/migrations/',
                    name: '0000-root',
                    method: 'DELETE',
                    body: 'gone',
                    notify: schema + '-delete',
                })),
            );
            assertEquals(
                [
                    faultOf(deleteError).code,
                    faultOf(deleteError).constraint,
                ],
                ['23505', 'fa_message_pairs_succession'],
            );
            const posted = only(await executeRaw(
                'blind',
                bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/migrations/',
                    name: '0000-root',
                    method: 'POST',
                    body: 'post',
                    notify: schema + '-post',
                }),
            ));
            assertEquals(posted.outcome, 'land');
            const count = only(await sql.query<{
                n: number;
            }>`
                SELECT count(*)::int AS n
                FROM fa_message_pairs
                WHERE path = '/migrations/'
                  AND name = '0000-root'
                  AND supersedes = ${NIL_UUID}::uuid
                  AND method = 'POST'
            `);
            assertEquals(count.n, 1);
        },
    );

    Deno.test(
        'a successor stamp is the predecessor plus'
            + ' one microsecond',
        async () => {
            const headId = generateIdentifier();
            await runLedgerStatement(adapter, 'blind', [
                bindOf({
                    id: headId,
                    operationId: generateIdentifier(),
                    path: '/pins/',
                    name: 'stamp',
                    method: 'PUT',
                    body: 'old',
                    notify: schema + '-stamp-head',
                }),
            ]);
            const moved = only(await sql.query<{
                stamp: string;
            }>`
                UPDATE fa_message_pairs
                SET response_at = clock_timestamp()
                    + interval '1 minute'
                WHERE id = ${uuidTextOfIdentifier(
                    headId,
                )}::uuid
                RETURNING to_char(
                    response_at AT TIME ZONE 'UTC',
                    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                ) AS stamp
            `);
            const answer = only(
                await runLedgerStatement(
                    adapter, 'blind', [
                        bindOf({
                            id: generateIdentifier(),
                            operationId: generateIdentifier(),
                            path: '/pins/',
                            name: 'stamp',
                            method: 'PUT',
                            body: 'new',
                            notify: schema + '-stamp-next',
                        }),
                    ],
                ),
            );
            assertEquals(answer.outcome, 'land');
            assertEquals(
                answer.stamp,
                stampOfMicros(microsOf(moved.stamp) + 1n),
            );
        },
    );

    Deno.test(
        'a nil latch lands, then is stale over its head',
        async () => {
            const name = 'nil-' + generateIdentifier();
            const born = only(await runLedgerStatement(
                adapter, 'in-order', [{
                    ...bindOf({
                        id: generateIdentifier(),
                        operationId: generateIdentifier(),
                        path: '/pins/',
                        name,
                        method: 'PUT',
                        body: 'born',
                        notify: schema + '-nil-born',
                    }),
                    ifMatch: NIL_IDENTIFIER,
                }],
            ));
            assertEquals(
                [born.outcome, born.rawOutcome,
                    born.supersedes],
                ['land', 'land', NIL_IDENTIFIER],
            );
            const again = only(await runLedgerStatement(
                adapter, 'in-order', [{
                    ...bindOf({
                        id: generateIdentifier(),
                        operationId: generateIdentifier(),
                        path: '/pins/',
                        name,
                        method: 'PUT',
                        body: 'born',
                        notify: schema + '-nil-again',
                    }),
                    ifMatch: NIL_IDENTIFIER,
                }],
            ));
            assertEquals(
                [again.outcome, again.rawOutcome],
                ['stale', 'stale'],
            );
        },
    );

    Deno.test(
        'a nil latch over a tombstone lands at 201',
        async () => {
            const name = 'tomb-' + generateIdentifier();
            await runLedgerStatement(adapter, 'blind', [
                bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/pins/',
                    name,
                    method: 'PUT',
                    body: 'live',
                    notify: schema + '-tomb-live',
                }),
            ]);
            const gone = only(await runLedgerStatement(
                adapter, 'blind', [bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/pins/',
                    name,
                    method: 'DELETE',
                    body: '',
                    notify: schema + '-tomb-gone',
                })],
            ));
            const reborn = only(await runLedgerStatement(
                adapter, 'in-order', [{
                    ...bindOf({
                        id: generateIdentifier(),
                        operationId: generateIdentifier(),
                        path: '/pins/',
                        name,
                        method: 'PUT',
                        body: 'reborn',
                        notify: schema + '-tomb-reborn',
                    }),
                    ifMatch: NIL_IDENTIFIER,
                }],
            ));
            assertEquals(reborn.outcome, 'land');
            assertEquals(reborn.supersedes, gone.id);
            assertEquals(
                new TextDecoder().decode(
                    reborn.response.subarray(0, 13),
                ),
                'HTTP/1.1 201 ',
            );
        },
    );

    Deno.test(
        'the sql twin reports each row its own outcome',
        async () => {
            const name = 'raw-' + generateIdentifier();
            await runLedgerStatement(adapter, 'blind', [
                bindOf({
                    id: generateIdentifier(),
                    operationId: generateIdentifier(),
                    path: '/pins/',
                    name,
                    method: 'PUT',
                    body: 'head',
                    notify: schema + '-raw-head',
                }),
            ]);
            const operationId = generateIdentifier();
            const rows = await runLedgerStatement(
                adapter, 'composed', [
                    {
                        ...bindOf({
                            id: generateIdentifier(),
                            operationId,
                            path: '/pins/',
                            name,
                            method: 'PUT',
                            body: 'x',
                            notify: schema + '-raw-x',
                        }),
                        ifMatch: generateIdentifier(),
                    },
                    bindOf({
                        id: generateIdentifier(),
                        operationId,
                        path: '/pins/',
                        name: name + '-other',
                        method: 'PUT',
                        body: 'y',
                        notify: schema + '-raw-y',
                    }),
                ],
            );
            assertEquals(
                rows.map((row) => row.outcome),
                ['stale', 'stale'],
            );
            assertEquals(
                rows.map((row) => row.rawOutcome),
                ['stale', 'land'],
            );
        },
    );

    Deno.test(
        'a land notifies once and a match is silent',
        async () => {
            const ear = listenFor(POSTGRES_URL);
            try {
                await ear.opened();
                const heard = ear.expect(
                    landToken, LAND_WAIT_MS,
                );
                const landed = only(
                    await runLedgerStatement(
                        adapter, 'blind', [
                            bindOf({
                                id: generateIdentifier(),
                                operationId:
                                    generateIdentifier(),
                                path: '/pins/',
                                name: 'bell',
                                method: 'PUT',
                                body: 'hello',
                                notify: landToken,
                            }),
                        ],
                    ),
                );
                assertEquals(landed.outcome, 'land');
                assertEquals(await heard, landToken);
                assertEquals(
                    ear.pendingCount(landToken), 0,
                );
                const quiet = ear.expect(
                    matchToken, MATCH_WAIT_MS,
                );
                const matched = only(
                    await runLedgerStatement(
                        adapter, 'blind', [
                            bindOf({
                                id: generateIdentifier(),
                                operationId:
                                    generateIdentifier(),
                                path: '/pins/',
                                name: 'bell',
                                method: 'PUT',
                                body: 'hello',
                                notify: matchToken,
                            }),
                        ],
                    ),
                );
                assertEquals(matched.outcome, 'matched');
                assertEquals(matched.inserted, false);
                assertEquals(await quiet, null);
                assertEquals(
                    ear.pendingCount(landToken), 0,
                );
            } finally {
                await ear.close();
            }
        },
    );

    Deno.test(
        'the head read is an index scan on'
            + ' fa_message_pairs_document',
        async () => {
            await sql.query`
                INSERT INTO fa_message_pairs (
                    id, operation_id, path, name,
                    supersedes,
                    requester_identity_id, method,
                    response_at,
                    request, request_salt, request_hash,
                    secret, secret_hash,
                    response, response_salt,
                    response_hash, pair_hash
                )
                SELECT
                    gen_random_uuid(),
                    ${OPERATION_ID}::uuid,
                    '/explain-fill/',
                    gs::text,
                    ${NIL_UUID}::uuid,
                    'fa_owner',
                    'PUT',
                    clock_timestamp(),
                    ''::bytea,
                    decode(repeat('00', 16), 'hex'),
                    decode(repeat('00', 32), 'hex'),
                    ''::bytea,
                    decode(repeat('00', 32), 'hex'),
                    ''::bytea,
                    decode(repeat('00', 16), 'hex'),
                    decode(repeat('00', 32), 'hex'),
                    decode(repeat('00', 32), 'hex')
                FROM generate_series(1, 2000) AS gs
            `;
            await sql.query`ANALYZE fa_message_pairs`;
            const plans = await sql.query<
                Record<string, unknown>
            >`
                EXPLAIN
                SELECT id, response_at, response
                FROM fa_message_pairs
                WHERE path = ${'/migrations/'}
                  AND name = ${'0000-root'}
                  AND method IN ('PUT', 'DELETE')
                ORDER BY response_at DESC, id DESC
                LIMIT 1
            `;
            const text = plans.map((plan) => {
                const line = plan['QUERY PLAN'];
                return typeof line === 'string'
                    ? line
                    : '';
            }).join('\n');
            assert(
                text.includes('fa_message_pairs_document'),
                'expected fa_message_pairs_document in\n'
                    + text,
            );
            assert(
                text.includes('Index Scan'),
                'expected an index scan in\n' + text,
            );
        },
    );
}
