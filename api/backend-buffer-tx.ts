import {
    serializeRecord,
} from './storage-serialize.ts';
import {
    UniqueConstraintError,
    assertGetWhereColumn,
    uniqueColumns,
    type Tx,
    type TxMode,
} from './db.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';

// Builds a row-granular Tx handle over a pre-loaded buffer
// of the touched tables. The buffer IS the unit of
// atomicity: every op mutates only the buffer, so a backend
// commits by flushing the dirty set and rolls back by
// discarding it. The memory backend fills and drains this
// buffer; Postgres does not use it. The
// NOT-NULL gate runs at `put` time, so a bad row throws
// inside `fn` and the whole transaction rolls back.
//
// Reads hand out copies, never the buffered or committed
// row objects — the seam's value semantics: Postgres
// materializes a fresh row per read, and the test backend
// must not be weaker. A caller mutating a fetched row can
// never rewrite committed state.
export function bufferTx(
    buffer: Map<string, { id: string }[]>,
    mode: TxMode,
    dirty: Set<string>,
): Tx {
    const scoped = (table: string): { id: string }[] => {
        const rows = buffer.get(table);
        if (rows === undefined) {
            throw new Error(
                `Table "${table}" is not in the`
                + ' transaction scope.',
            );
        }
        return rows;
    };
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
            const row = scoped(table).find(
                r => r.id === id,
            );
            return row === undefined
                ? null
                : { ...row } as T;
        },
        async getAll<T extends { id: string }>(
            table: string,
        ): Promise<T[]> {
            return scoped(table).map(
                row => ({ ...row }),
            ) as T[];
        },
        async getWhere<T extends { id: string }>(
            table: string,
            column: string,
            key: string,
        ): Promise<T[]> {
            assertGetWhereColumn(table, column);
            return scoped(table)
                .filter(row => (
                    row as Record<string, unknown>
                )[column] === key)
                .map(row => ({ ...row })) as T[];
        },
        async getAddress<T extends { id: string }>(
            table: string,
            collection: string,
            uriId: string,
        ): Promise<T[]> {
            return scoped(table)
                .filter((row) => {
                    const rec = row as
                        Record<string, unknown>;
                    return rec['uri_collection']
                        === collection
                        && rec['uri_id'] === uriId;
                })
                .sort((left, right) => {
                    const l = left as
                        Record<string, unknown>;
                    const r = right as
                        Record<string, unknown>;
                    const atL = String(
                        l['response_at'] ?? '',
                    );
                    const atR = String(
                        r['response_at'] ?? '',
                    );
                    if (atL < atR) return -1;
                    if (atL > atR) return 1;
                    if (left.id < right.id) return -1;
                    if (left.id > right.id) return 1;
                    return 0;
                })
                .map((row) => ({ ...row })) as T[];
        },
        async getAddressVersion<T extends { id: string }>(
            table: string,
            collection: string,
            uriId: string,
            version: string,
        ): Promise<T[]> {
            return scoped(table)
                .filter((row) => {
                    const rec = row as
                        Record<string, unknown>;
                    return rec['uri_collection']
                        === collection
                        && rec['uri_id'] === uriId
                        && rec['version'] === version;
                })
                .sort((left, right) => {
                    const l = left as
                        Record<string, unknown>;
                    const r = right as
                        Record<string, unknown>;
                    const atL = String(
                        l['response_at'] ?? '',
                    );
                    const atR = String(
                        r['response_at'] ?? '',
                    );
                    if (atL < atR) return -1;
                    if (atL > atR) return 1;
                    if (left.id < right.id) return -1;
                    if (left.id > right.id) return 1;
                    return 0;
                })
                .map((row) => ({ ...row })) as T[];
        },
        async getWhereBody<T extends { id: string }>(
            table: string,
            collection: string,
            containment: Record<string, unknown>,
        ): Promise<T[]> {
            return scoped(table)
                .filter((row) => {
                    const rec = row as
                        Record<string, unknown>;
                    if (
                        rec['uri_collection']
                        !== collection
                    ) {
                        return false;
                    }
                    const message = rec['response'];
                    if (typeof message !== 'string') {
                        return false;
                    }
                    const body = jsonBodyOf(message);
                    if (body === undefined) {
                        return false;
                    }
                    return containsFact(
                        body, containment,
                    );
                })
                .sort((left, right) => {
                    const l = left as
                        Record<string, unknown>;
                    const r = right as
                        Record<string, unknown>;
                    const atL = String(
                        l['response_at'] ?? '',
                    );
                    const atR = String(
                        r['response_at'] ?? '',
                    );
                    if (atL < atR) return -1;
                    if (atL > atR) return 1;
                    if (left.id < right.id) return -1;
                    if (left.id > right.id) return 1;
                    return 0;
                })
                .map((row) => ({ ...row })) as T[];
        },
        async put<T extends { id: string }>(
            table: string,
            row: T,
        ): Promise<void> {
            assertWritable();
            const rows = scoped(table);
            // Scan BEFORE serializeRecord/splice: absence
            // is unindexed, so a row lacking the column
            // never collides (genesis rows coexist).
            for (const column of uniqueColumns(table)) {
                const value = (
                    row as Record<string, unknown>
                )[column];
                if (value === undefined) continue;
                const collision = rows.find(
                    (existing) =>
                        existing.id !== row.id
                        && (
                            existing as Record<
                                string, unknown
                            >
                        )[column] === value,
                );
                if (collision !== undefined) {
                    throw new UniqueConstraintError(
                        table, column,
                    );
                }
            }
            const written = {
                ...serializeRecord(
                    row as Record<string, unknown>,
                    table,
                ),
                id: row.id,
            } as { id: string };
            const idx = rows.findIndex(
                r => r.id === row.id,
            );
            if (idx >= 0) {
                rows[idx] = written;
            } else {
                rows.push(written);
            }
            dirty.add(table);
        },
        async delete(
            table: string,
            id: string,
        ): Promise<void> {
            assertWritable();
            const rows = scoped(table);
            const idx = rows.findIndex(r => r.id === id);
            if (idx >= 0) {
                rows.splice(idx, 1);
                dirty.add(table);
            }
        },
        async clear(table: string): Promise<void> {
            assertWritable();
            scoped(table);
            buffer.set(table, []);
            dirty.add(table);
        },
    };
}

function jsonBodyOf(message: string): unknown | undefined {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    if (!body.exists()) return undefined;
    return JSON.parse(body.toText());
}

function containsFact(
    body: unknown,
    containment: Record<string, unknown>,
): boolean {
    if (body === null || typeof body !== 'object') {
        return false;
    }
    const record = body as Record<string, unknown>;
    for (const [key, value] of Object.entries(containment)) {
        if (
            JSON.stringify(record[key])
            !== JSON.stringify(value)
        ) {
            return false;
        }
    }
    return true;
}
