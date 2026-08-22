// Fourth StorageBackend. postgres.js stays behind
// postgres-client. Write lock order is dedup, address,
// then FOR UPDATE. Notify is in-transaction.

import {
    assertGetWhereColumn,
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
    'DROP TABLE IF EXISTS pairs;\n'
    + 'DROP TABLE IF EXISTS responses;\n'
    + 'DROP TABLE IF EXISTS requests;\n'
    + 'DROP TABLE IF EXISTS schema_marker;\n'
    + 'DROP FUNCTION IF EXISTS message_body(bytea);';

export interface PostgresTx extends Tx {
    getAddress<T extends { id: string }>(
        table: string,
        collection: string,
        uriId: string,
    ): Promise<T[]>;
    lock(label: string): Promise<void>;
    lockShared(label: string): Promise<void>;
    lockHead(id: string): Promise<void>;
    latestPutDelete(
        collection: string,
        uriId: string,
    ): Promise<{
        readonly id: string;
        readonly method: string;
    } | null>;
    notify(event: NotificationEvent): Promise<void>;
    stampSchemaMarker(): Promise<void>;
}

export class PostgresBackend implements StorageBackend {
    readonly #sql: SqlClient;

    constructor(sql: SqlClient) {
        this.#sql = sql;
    }

    async transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        for (const table of tables) {
            assertMessageTable(table);
        }
        try {
            return await this.#sql.begin(
                (sql) => fn(postgresTx(sql, mode)),
            );
        } catch (error) {
            throw mapPostgresError(error);
        }
    }

    async ensureTables(
        _tables: readonly string[],
    ): Promise<void> {
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

    async getAddress<T extends { id: string }>(
        table: string,
        collection: string,
        uriId: string,
    ): Promise<T[]> {
        return this.transaction(
            [table],
            'readonly',
            (tx) => (tx as PostgresTx).getAddress<T>(
                table, collection, uriId,
            ),
        );
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
        async get<T extends { id: string }>(
            table: string,
            id: string,
        ): Promise<T | null> {
            const name = assertMessageTable(table);
            const rows = await selectById(sql, name, id);
            const row = rows[0];
            return row === undefined
                ? null
                : entityOf<T>(row);
        },
        async getAll<T extends { id: string }>(
            table: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectAll(sql, name);
            return rows.map((row) => entityOf<T>(row));
        },
        async getWhere<T extends { id: string }>(
            table: string,
            column: string,
            key: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            assertIndexedColumn(name, column);
            const rows = await selectWhere(
                sql, name, column, key,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getAddress<T extends { id: string }>(
            table: string,
            collection: string,
            uriId: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectAddress(
                sql, name, collection, uriId,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getAddressVersion<T extends { id: string }>(
            table: string,
            collection: string,
            uriId: string,
            version: string,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectAddressVersion(
                sql, name, collection, uriId, version,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async getWhereBody<T extends { id: string }>(
            table: string,
            collection: string,
            containment: Record<string, unknown>,
        ): Promise<T[]> {
            const name = assertMessageTable(table);
            const rows = await selectWhereBody(
                sql, name, collection, containment,
            );
            return rows.map((row) => entityOf<T>(row));
        },
        async put<T extends { id: string }>(
            table: string,
            row: T,
        ): Promise<void> {
            assertWritable();
            const name = assertMessageTable(table);
            const written = serializeRecord(
                row as Record<string, unknown>,
                name,
            );
            await upsertRow(sql, name, written);
        },
        async delete(
            table: string,
            id: string,
        ): Promise<void> {
            assertWritable();
            const name = assertMessageTable(table);
            await deleteById(sql, name, id);
        },
        async clear(table: string): Promise<void> {
            assertWritable();
            const name = assertMessageTable(table);
            await deleteAll(sql, name);
        },
        async lock(label: string): Promise<void> {
            await advisoryLock(sql, label, false);
        },
        async lockShared(label: string): Promise<void> {
            await advisoryLock(sql, label, true);
        },
        async lockHead(id: string): Promise<void> {
            await sql.query`
                SELECT id FROM pairs
                WHERE id = ${uuidTextOfIdentifier(id)}
                FOR UPDATE
            `;
        },
        async latestPutDelete(
            collection: string,
            uriId: string,
        ): Promise<{
            readonly id: string;
            readonly method: string;
        } | null> {
            const rows = await sql.query<{
                id: string;
                method: string;
            }>`
                SELECT id, method
                FROM pairs
                WHERE uri_collection = ${collection}
                  AND uri_id = ${uriId}
                  AND method IN ('PUT', 'DELETE')
                ORDER BY response_at DESC, id DESC
                LIMIT 1
            `;
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
        async stampSchemaMarker(): Promise<void> {
            await sql.query`
                INSERT INTO schema_marker ("only")
                VALUES (true)
                ON CONFLICT DO NOTHING
            `;
        },
    };
}

async function advisoryLock(
    sql: SqlClient,
    label: string,
    shared: boolean,
): Promise<void> {
    const key = Number(await advisoryKey(label));
    if (shared) {
        await sql.query`
            SELECT pg_advisory_xact_lock_shared(${key})
        `;
        return;
    }
    await sql.query`
        SELECT pg_advisory_xact_lock(${key})
    `;
}

function assertMessageTable(
    table: string,
): 'pairs' {
    if (table === 'pairs') {
        return table;
    }
    throw new Error('unknown table: ' + table);
}

function assertIndexedColumn(
    table: 'pairs',
    column: string,
): void {
    assertGetWhereColumn(table, column);
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

async function selectById(
    sql: SqlClient,
    _table: 'pairs',
    id: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM pairs
        WHERE id = ${uuidTextOfIdentifier(id)}
    `;
}

async function selectAll(
    sql: SqlClient,
    _table: 'pairs',
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM pairs
        ORDER BY response_at, id
    `;
}

async function selectWhere(
    sql: SqlClient,
    _table: 'pairs',
    column: string,
    key: string,
): Promise<Record<string, unknown>[]> {
    if (column === 'uri_collection') {
        return sql.query`
            SELECT * FROM pairs
            WHERE uri_collection = ${key}
            ORDER BY response_at, id
        `;
    }
    if (column === 'request_hash') {
        return sql.query`
            SELECT * FROM pairs
            WHERE request_hash = ${key}
            ORDER BY response_at, id
        `;
    }
    throw new Error(
        'getWhere does not accept ' + column,
    );
}

async function selectAddress(
    sql: SqlClient,
    _table: 'pairs',
    collection: string,
    uriId: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM pairs
        WHERE uri_collection = ${collection}
          AND uri_id = ${uriId}
        ORDER BY response_at, id
    `;
}

async function selectAddressVersion(
    sql: SqlClient,
    _table: 'pairs',
    collection: string,
    uriId: string,
    version: string,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM pairs
        WHERE uri_collection = ${collection}
          AND uri_id = ${uriId}
          AND version = ${version}
        ORDER BY response_at, id
    `;
}

async function selectWhereBody(
    sql: SqlClient,
    _table: 'pairs',
    collection: string,
    containment: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
    return sql.query`
        SELECT * FROM pairs
        WHERE uri_collection = ${collection}
          AND message_body(response) @>
              ${containment}::jsonb
        ORDER BY response_at, id
    `;
}

async function deleteById(
    sql: SqlClient,
    _table: 'pairs',
    id: string,
): Promise<void> {
    await sql.query`
        DELETE FROM pairs
        WHERE id = ${uuidTextOfIdentifier(id)}
    `;
}

async function deleteAll(
    sql: SqlClient,
    _table: 'pairs',
): Promise<void> {
    await sql.query`DELETE FROM pairs`;
}

async function upsertRow(
    sql: SqlClient,
    _table: 'pairs',
    row: Record<string, unknown>,
): Promise<void> {
    const id = uuidTextOfIdentifier(
        textField(row, 'id'),
    );
    const collection = textField(row, 'uri_collection');
    const uriId = textField(row, 'uri_id');
    const requester = textField(
        row, 'requester_identity_id',
    );
    const method = textField(row, 'method');
    const requestAt = textField(row, 'request_at');
    const requestHash = textField(row, 'request_hash');
    const request = byteaOfWire(row.request);
    const responseAt = textField(row, 'response_at');
    const version = textField(row, 'version');
    const response = byteaOfWire(row.response);
    const operationId = uuidTextOfIdentifier(
        textField(row, 'operation_id'),
    );
    await sql.query`
        INSERT INTO pairs (
            id, uri_collection, uri_id,
            requester_identity_id, method,
            request_at, request_hash, request,
            response_at, version, response,
            operation_id
        ) VALUES (
            ${id}, ${collection}, ${uriId},
            ${requester}, ${method},
            ${requestAt}, ${requestHash}, ${request},
            ${responseAt}, ${version}, ${response},
            ${operationId}
        )
        ON CONFLICT (id) DO UPDATE SET
            uri_collection = EXCLUDED.uri_collection,
            uri_id = EXCLUDED.uri_id,
            requester_identity_id =
                EXCLUDED.requester_identity_id,
            method = EXCLUDED.method,
            request_at = EXCLUDED.request_at,
            request_hash = EXCLUDED.request_hash,
            request = EXCLUDED.request,
            response_at = EXCLUDED.response_at,
            version = EXCLUDED.version,
            response = EXCLUDED.response,
            operation_id = EXCLUDED.operation_id
    `;
}
