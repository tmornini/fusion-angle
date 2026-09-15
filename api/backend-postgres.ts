// Fourth StorageBackend. postgres.js stays behind
// postgres-client. Write lock order is request, document,
// then FOR UPDATE. Notify is in-transaction.

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
    './notifications.ts';
import {
    FUSION_EVENTS_CHANNEL,
    advisoryKey,
    notifyPayload,
} from './advisory-lock.ts';
import {
    decodeIdentifier,
    encodeIdentifier,
} from '../shared/identifier.ts';

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
    lockRequest(hash: string): Promise<void>;
    lockDocument(path: string, name: string): Promise<void>;
    lockHead(id: string): Promise<void>;
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

    async transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        try {
            return await this.#sql.begin(
                (sql) => fn(postgresTx(sql, mode)),
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async ensureTable(): Promise<void> {
        try {
            await this.#sql.unsafe(POSTGRES_SCHEMA);
        } catch (error) {
            throw mapPostgresError(error);
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

function postgresTx(
    sql: SqlClient,
    mode: TxMode,
): PostgresTx {
    const assertWritable = (): void => {
        if (mode === 'readonly') {
            throw new Error(
                'Cannot write in a readonly transaction.',
            );
        }
    };
    return {
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
        async getPairsByRequestHash<T extends { id: string }>(
            hash: string,
        ): Promise<T[]> {
            const rows = await selectPairsByRequestHash(
                sql, hash,
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
        async getWhereBody<T extends { id: string }>(
            path: string,
            containment: Record<string, unknown>,
        ): Promise<T[]> {
            const rows = await selectWhereBody(
                sql, path, containment,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async append<T extends { id: string }>(
            row: T,
        ): Promise<void> {
            assertWritable();
            const written = serializeRecord(
                row as Record<string, unknown>,
                'message_pairs',
            );
            await upsertRow(sql, written);
        },
        async lockRequest(hash: string): Promise<void> {
            await advisoryLock(sql, 'fusion.dedup.' + hash);
        },
        async lockDocument(
            path: string,
            name: string,
        ): Promise<void> {
            await advisoryLock(
                sql, 'fusion.document.' + path + name,
            );
        },
        async lockHead(id: string): Promise<void> {
            await sql.query`
                SELECT id FROM message_pairs
                WHERE id = ${uuidTextOfIdentifier(id)}
                FOR UPDATE
            `;
        },
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
    };
}

async function advisoryLock(
    sql: SqlClient,
    label: string,
): Promise<void> {
    const key = Number(await advisoryKey(label));
    await sql.query`
        SELECT pg_advisory_xact_lock(${key})
    `;
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

function identifierOfUuidText(uuid: string): string {
    const hex = uuid.replaceAll('-', '');
    const bytes = new Uint8Array(16);
    for (let i = 0; i < 16; i++) {
        bytes[i] = Number.parseInt(
            hex.slice(i * 2, i * 2 + 2), 16);
    }
    return encodeIdentifier(bytes);
}

function entityOf<T extends { id: string }>(
    row: Record<string, unknown>,
): T {
    return {
        ...row,
        id: identifierOfUuidText(row.id as string),
        operation_id: identifierOfUuidText(
            row.operation_id as string,
        ),
        request: latin1OfBytea(row.request),
        response: latin1OfBytea(row.response),
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

async function selectPairById(
    sql: SqlClient,
    id: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE id = ${uuidTextOfIdentifier(id)}
    `;
}

async function selectAll(
    sql: SqlClient,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        ORDER BY response_at, id
    `;
}

async function selectCollectionPairs(
    sql: SqlClient,
    path: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE path = ${path}
        ORDER BY response_at, id
    `;
}

async function selectPairsByRequestHash(
    sql: SqlClient,
    hash: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE request_hash = ${hash}
        ORDER BY response_at, id
    `;
}

async function selectDocumentHistory(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE path = ${path}
          AND name = ${name}
        ORDER BY response_at, id
    `;
}

async function selectHead(
    sql: SqlClient,
    path: string,
    name: string,
): Promise<{ id: string; method: string }[]> {
    return sql.query<{ id: string; method: string }>`
        SELECT id, method
        FROM message_pairs
        WHERE path = ${path}
          AND name = ${name}
          AND method IN ('PUT', 'DELETE')
        ORDER BY response_at DESC, id DESC
        LIMIT 1
    `;
}

async function selectWhereBody(
    sql: SqlClient,
    path: string,
    containment: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM message_pairs
        WHERE path = ${path}
          AND message_body(response) @>
              ${containment}::jsonb
        ORDER BY response_at, id
    `;
}

async function upsertRow(
    sql: SqlClient,
    row: Record<string, unknown>,
): Promise<void> {
    const id = uuidTextOfIdentifier(
        textField(row, 'id'),
    );
    const collection = textField(row, 'path');
    const name = textField(row, 'name');
    const requester = textField(
        row, 'requester_identity_id',
    );
    const method = textField(row, 'method');
    const requestAt = textField(row, 'request_at');
    const requestHash = textField(row, 'request_hash');
    const request = byteaOfWire(row.request);
    const responseAt = textField(row, 'response_at');
    const response = byteaOfWire(row.response);
    const operationId = uuidTextOfIdentifier(
        textField(row, 'operation_id'),
    );
    await sql.query`
        INSERT INTO message_pairs (
            id, path, name,
            requester_identity_id, method,
            request_at, request_hash, request,
            response_at, response,
            operation_id
        ) VALUES (
            ${id}, ${collection}, ${name},
            ${requester}, ${method},
            ${requestAt}, ${requestHash}, ${request},
            ${responseAt}, ${response},
            ${operationId}
        )
        ON CONFLICT (id) DO UPDATE SET
            path = EXCLUDED.path,
            name = EXCLUDED.name,
            requester_identity_id =
                EXCLUDED.requester_identity_id,
            method = EXCLUDED.method,
            request_at = EXCLUDED.request_at,
            request_hash = EXCLUDED.request_hash,
            request = EXCLUDED.request,
            response_at = EXCLUDED.response_at,
            response = EXCLUDED.response,
            operation_id = EXCLUDED.operation_id
    `;
}
