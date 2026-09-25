// Fourth StorageBackend. postgres.js stays behind
// postgres-client. A statement inside an open client
// runs in a savepoint so a succession 23505 does not
// abort the caller. Notify stays on the write client.

import {
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import type { SqlClient } from './postgres-client.ts';
import { POSTGRES_SCHEMA } from './schema-postgres.ts';
import { serializeRecord } from './storage-serialize.ts';
import { mapPostgresError } from './errors-postgres.ts';
import { Octets } from '../shared/http-message/octets.ts';
import type { NotificationEvent } from
    '../shared/notifications.ts';
import {
    FUSION_EVENTS_CHANNEL,
    notifyPayload,
} from './advisory-lock.ts';
import {
    identifierOfUuidText,
    uuidTextOfIdentifier,
} from '../shared/identifier.ts';
import type {
    Attempt,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';
import { mintRootBind } from './ledger-root.ts';
import { statementText } from
    './ledger-statement-sql.ts';
import {
    mapStatementError,
} from './ledger-statement.ts';

export const POSTGRES_DROP_SCHEMA =
    'DROP SCHEMA public CASCADE;\n'
    + 'CREATE SCHEMA public;\n'
    + 'GRANT ALL ON SCHEMA public TO CURRENT_USER;\n'
    + 'GRANT ALL ON SCHEMA public TO public;';

export interface PostgresTx extends Tx {
    getDocumentHistory<T extends { id: string }>(
        path: string,
        name: string,
    ): Promise<T[]>;
    getHead(path: string, name: string): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify(event: NotificationEvent): Promise<void>;
}

export class PostgresBackend implements StorageBackend {
    readonly #sql: SqlClient;

    constructor(sql: SqlClient) {
        this.#sql = sql;
    }

    async read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        try {
            return await fn(
                postgresTx(this.#sql, 'readonly', false),
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        try {
            return await this.#sql.begin(
                (sql) => fn(
                    postgresTx(sql, mode, true),
                ),
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async seedTransaction<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        try {
            return await this.#sql.begin(async (sql) => {
                await sql.unsafe(POSTGRES_SCHEMA);
                const result = await fn(
                    postgresTx(sql, 'readwrite', true),
                );
                await sql.query`
                    INSERT INTO schema_marker ("only")
                    VALUES (true)
                `;
                return result;
            });
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async ensureTable(): Promise<void> {
        try {
            await this.#sql.unsafe(POSTGRES_SCHEMA);
            const root = await this.#sql.query<{
                id: string;
            }>`
                SELECT id FROM fa_message_pairs
                WHERE path = '/migrations/'
                  AND name = '0000-root'
                LIMIT 1
            `;
            if (root.length > 0) return;
            await this.executeLedger(
                'genesis',
                [mintRootBind()],
                undefined,
                undefined,
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        _now: string | undefined,
        tx: Tx | undefined,
    ): Promise<StatementAnswer[]> {
        const sql = tx === undefined
            ? this.#sql
            : clientOf(tx);
        try {
            // A 23505 aborts the surrounding transaction,
            // and postgres.js rethrows that error after
            // the caller catches it. A savepoint keeps
            // the refusal on the statement.
            if (tx === undefined) {
                return await queryStatement(
                    sql, attempt, rows,
                );
            }
            return await sql.begin((sp) =>
                queryStatement(sp, attempt, rows),
            );
        } catch (error) {
            throw mapStatementError(error);
        }
    }

    async hasSchema(): Promise<boolean> {
        try {
            const rows = await this.#sql.query<{
                only: boolean;
            }>`
                SELECT "only" FROM schema_marker
                WHERE "only"
                LIMIT 1
            `;
            return rows.length > 0;
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async postSchemaCreation(): Promise<void> {
        try {
            await this.#sql.query`
                INSERT INTO schema_marker ("only")
                VALUES (true)
                ON CONFLICT DO NOTHING
            `;
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async deleteSchema(): Promise<void> {
        try {
            await this.#sql.unsafe(POSTGRES_DROP_SCHEMA);
        } catch (error) {
            throw mapPostgresError(error);
        }
    }
}

// Notify needs an open write client. Standalone read
// passes false; transaction() passes true.
const clients = new WeakMap<Tx, SqlClient>();

function clientOf(tx: Tx): SqlClient {
    const sql = clients.get(tx);
    if (sql === undefined) {
        throw new Error('ledger client missing');
    }
    return sql;
}

function postgresTx(
    sql: SqlClient,
    mode: TxMode,
    coordination: boolean,
): Tx {
    const assertWritable = (): void => {
        if (mode === 'readonly') {
            throw new Error(
                'Cannot write in a readonly transaction.',
            );
        }
    };
    const tx: Tx = {
        async getById<T extends { id: string }>(
            id: string,
        ): Promise<T | null> {
            const rows = await selectPairById(sql, id);
            const row = rows[0];
            return row === undefined
                ? null
                : entityOf<T>(row);
        },
        async getAll<T extends { id: string }>(): Promise<T[]> {
            const rows = await selectAll(sql);
            return rows.map((row) => entityOf<T>(row));
        },
        async getCollectionPairs<T extends { id: string }>(
            path: string,
        ): Promise<T[]> {
            const rows = await selectCollectionPairs(
                sql, path,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getDocumentHistory<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T[]> {
            const rows = await selectDocumentHistory(
                sql, path, name,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getHeadPair<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T | null> {
            const rows = await selectHeadPair(sql, path, name);
            const row = rows[0];
            return row === undefined
                ? null
                : entityOf<T>(row);
        },
        async getCollectionHeadPairs<
            T extends { id: string },
        >(path: string): Promise<T[]> {
            const rows = await selectCollectionHeadPairs(
                sql, path,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async append<T extends { id: string }>(
            row: T,
        ): Promise<boolean> {
            assertWritable();
            const written = serializeRecord(
                row as Record<string, unknown>,
                'fa_message_pairs',
            );
            return insertPair(sql, written);
        },
        ...(coordination
            ? {
                async notify(
                    event: NotificationEvent,
                ): Promise<void> {
                    const payload = notifyPayload(event);
                    await sql.query`
                        SELECT pg_notify(
                            ${FUSION_EVENTS_CHANNEL},
                            ${payload}
                        )
                    `;
                },
            }
            : {}),
        async getHead(
            path: string,
            name: string,
        ): Promise<{
            readonly id: string;
            readonly method: string;
        } | null> {
            const rows = await selectHead(sql, path, name);
            const row = rows[0];
            if (row === undefined) {
                return null;
            }
            return {
                id: identifierOfUuidText(row.id),
                method: row.method,
            };
        },
    };
    clients.set(tx, sql);
    return tx;
}

function entityOf<T extends { id: string }>(
    row: Record<string, unknown>,
): T {
    return {
        ...row,
        id: identifierOfUuidText(String(row.id)),
        operation_id: identifierOfUuidText(
            String(row.operation_id),
        ),
        supersedes: identifierOfUuidText(
            String(row.supersedes),
        ),
        request: latin1OfBytea(row.request),
        request_salt: hexOfBytea(row.request_salt),
        request_hash: hexOfBytea(row.request_hash),
        secret: latin1OfBytea(row.secret),
        secret_hash: hexOfBytea(row.secret_hash),
        response: latin1OfBytea(row.response),
        response_salt: hexOfBytea(row.response_salt),
        response_hash: hexOfBytea(row.response_hash),
        pair_hash: hexOfBytea(row.pair_hash),
    } as unknown as T;
}

// Node Buffer.toString('latin1') — never TextDecoder.
function latin1OfBytea(value: unknown): string {
    const asBuffer = value as {
        toString?: (encoding: string) => string;
    };
    if (
        value instanceof Uint8Array
        && typeof asBuffer.toString === 'function'
        && asBuffer.toString
            !== Uint8Array.prototype.toString
    ) {
        return asBuffer.toString('latin1');
    }
    if (value instanceof Uint8Array) {
        return Octets.fromBytes(value).toLatin1();
    }
    throw new Error('message is not BYTEA');
}

function byteaOfWire(message: unknown): Uint8Array {
    if (typeof message !== 'string') {
        throw new Error(
            'message must be a Latin-1 wire',
        );
    }
    return Octets.fromLatin1(message).asBytes();
}

function bytesOfBytea(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value;
    throw new Error('message is not BYTEA');
}

function hexOfBytea(value: unknown): string {
    let hex = '';
    for (const byte of bytesOfBytea(value)) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

function byteaOfHex(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Number.parseInt(
            hex.slice(i * 2, i * 2 + 2), 16,
        );
    }
    return bytes;
}

function textField(
    row: Record<string, unknown>,
    name: string,
): string {
    const value = row[name];
    if (typeof value !== 'string') {
        throw new Error(
            `NOT NULL violation: "${name}" is`
            + ` ${String(value)}.`,
        );
    }
    return value;
}

// Every pair read names its columns so the two stamps come
// back as the six-digit zulu text the gate minted: the
// columns are timestamptz, the seam speaks RFC-3339. The
// list is written per statement — the SqlClient seam carries
// no fragments — and ORDER BY qualifies the native column,
// because a bare name binds to the alias.

async function selectPairById(
    sql: SqlClient,
    id: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM fa_message_pairs
        WHERE id = ${uuidTextOfIdentifier(id)}
    `;
}

async function selectAll(
    sql: SqlClient,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM fa_message_pairs
        ORDER BY fa_message_pairs.response_at, fa_message_pairs.id
    `;
}

async function selectCollectionPairs(
    sql: SqlClient,
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM fa_message_pairs
        WHERE path = ${path}
        ORDER BY fa_message_pairs.response_at, fa_message_pairs.id
    `;
}

async function selectDocumentHistory(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM fa_message_pairs
        WHERE path = ${path}
          AND name = ${name}
        ORDER BY fa_message_pairs.response_at, fa_message_pairs.id
    `;
}

async function selectHead(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<{ id: string; method: string }[]> {
    return sql.query<{ id: string; method: string }>`
        SELECT id, method
        FROM fa_message_pairs
        WHERE path = ${path}
          AND name = ${name}
          AND method IN ('PUT', 'DELETE')
        ORDER BY response_at DESC, id DESC
        LIMIT 1
    `;
}

// One backward walk of the document index under a Limit.
async function selectHeadPair(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM fa_message_pairs
        WHERE path = ${path}
          AND name = ${name}
          AND method IN ('PUT', 'DELETE')
        ORDER BY fa_message_pairs.response_at DESC,
            fa_message_pairs.id DESC
        LIMIT 1
    `;
}

// DISTINCT ON takes the first row per name straight off
// the document index read backward; the outer sort orders
// the heads, a small set. The inner query keeps its native
// columns (no aliases); the outer list formats the stamps.
async function selectCollectionHeadPairs(
    sql: SqlClient,
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT id, operation_id, path, name, supersedes,
            requester_identity_id, method,
            to_char(response_at AT TIME ZONE 'UTC',
                'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
                AS response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        FROM (
            SELECT DISTINCT ON (name) *
            FROM fa_message_pairs
            WHERE path = ${path}
              AND method IN ('PUT', 'DELETE')
            ORDER BY name DESC, response_at DESC, id DESC
        ) heads
        WHERE method = 'PUT'
        ORDER BY heads.response_at, heads.id
    `;
}

async function insertPair(
    sql: SqlClient,
    row: Record<string, unknown>,
): Promise<boolean> {
    const id = uuidTextOfIdentifier(
        textField(row, 'id'),
    );
    const path = textField(row, 'path');
    const name = textField(row, 'name');
    const requester = textField(
        row, 'requester_identity_id',
    );
    const method = textField(row, 'method');
    const supersedes = uuidTextOfIdentifier(
        textField(row, 'supersedes'),
    );
    const request = byteaOfWire(row.request);
    const requestSalt = byteaOfHex(
        textField(row, 'request_salt'),
    );
    const requestHash = byteaOfHex(
        textField(row, 'request_hash'),
    );
    const secret = byteaOfWire(row.secret);
    const secretHash = byteaOfHex(
        textField(row, 'secret_hash'),
    );
    const responseAt = textField(row, 'response_at');
    const response = byteaOfWire(row.response);
    const responseSalt = byteaOfHex(
        textField(row, 'response_salt'),
    );
    const responseHash = byteaOfHex(
        textField(row, 'response_hash'),
    );
    const pairHash = byteaOfHex(
        textField(row, 'pair_hash'),
    );
    const operationId = uuidTextOfIdentifier(
        textField(row, 'operation_id'),
    );
    // ::text before ::timestamptz, measured: npm:postgres
    // infers a bound parameter's wire type from the cast (or
    // the destination column) and round-trips a bare
    // ${x}::timestamptz through its own encoder, which drops
    // sub-millisecond digits. Landing the parameter as text
    // first keeps the driver out of the way; Postgres itself
    // then parses the full six-digit microsecond text at
    // full resolution, server-side.
    const inserted = await sql.query<{ id: string }>`
        INSERT INTO fa_message_pairs (
            id, operation_id, path, name, supersedes,
            requester_identity_id, method, response_at,
            request, request_salt, request_hash,
            secret, secret_hash,
            response, response_salt, response_hash,
            pair_hash
        ) VALUES (
            ${id}, ${operationId}, ${path}, ${name},
            ${supersedes},
            ${requester}, ${method},
            ${responseAt}::text::timestamptz,
            ${request}, ${requestSalt}, ${requestHash},
            ${secret}, ${secretHash},
            ${response}, ${responseSalt}, ${responseHash},
            ${pairHash}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
    `;
    return inserted.length === 1;
}

type StatementResult = {
    id: string,
    path: string,
    name: string,
    method: string,
    outcome: string,
    stamp: string,
    response: unknown,
    head_id: string | null,
    head_response: unknown,
    supersedes: string,
    request_hash: string,
    secret_hash: string,
    response_hash: string,
    pair_hash: string,
};

async function queryStatement(
    sql: SqlClient,
    attempt: Attempt,
    rows: readonly StatementBind[],
): Promise<StatementAnswer[]> {
    const parameters: unknown[] = [attempt];
    for (const row of rows) {
        parameters.push(
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
        );
    }
    let result: StatementResult[];
    try {
        result = await sql.unsafe<StatementResult>(
            statementText(rows.length),
            parameters,
        );
    } catch (error) {
        throw mapStatementError(error);
    }
    if (result.length !== rows.length) {
        throw new Error(
            'ledger statement returned '
            + String(result.length) + ' rows',
        );
    }
    return result.map((row, index) => {
        const source = rows[index]!;
        const outcome = row.outcome;
        if (
            outcome !== 'land'
            && outcome !== 'matched'
            && outcome !== 'stale'
        ) {
            throw new Error(
                'ledger statement outcome ' + outcome,
            );
        }
        const inserted = outcome === 'land';
        return {
            id: source.id,
            path: row.path,
            name: row.name,
            method: row.method,
            outcome,
            stamp: row.stamp,
            response: bytesOfBytea(row.response),
            headId: row.head_id === null
                ? null
                : identifierOfUuidText(row.head_id),
            headResponse: row.head_response === null
                ? null
                : bytesOfBytea(row.head_response),
            inserted,
            supersedes: identifierOfUuidText(
                row.supersedes,
            ),
            requestHashHex: row.request_hash,
            secretHashHex: row.secret_hash,
            responseHashHex: row.response_hash,
            pairHashHex: row.pair_hash,
        };
    });
}
