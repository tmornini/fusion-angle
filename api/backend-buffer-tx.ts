import {
    serializeRecord,
} from './storage-serialize.ts';
import {
    UniqueConstraintError,
    uniqueColumns,
    type Tx,
    type TxMode,
} from './db.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseWire } from
    '../shared/http-message/wire-codec.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';

function compareResponseAtThenId(
    left: { id: string },
    right: { id: string },
    atL: string,
    atR: string,
): number {
    if (atL < atR) return -1;
    if (atL > atR) return 1;
    return compareIdentifiers(left.id, right.id);
}

function byResponseAtThenId(
    left: { id: string },
    right: { id: string },
): number {
    const l = left as Record<string, unknown>;
    const r = right as Record<string, unknown>;
    return compareResponseAtThenId(
        left, right,
        String(l['response_at'] ?? ''),
        String(r['response_at'] ?? ''),
    );
}

// Builds a row-granular Tx handle over a pre-loaded copy
// of the table. The buffer IS the unit of atomicity: every
// op mutates only the buffer, so a backend commits by
// adopting it and rolls back by discarding it. The memory
// backend fills and drains this buffer; Postgres does not
// use it. The NOT-NULL gate runs at `append` time, so a
// bad row throws inside `fn` and the whole transaction
// rolls back.
//
// Reads hand out copies, never the buffered or committed
// row objects — the seam's value semantics: Postgres
// materializes a fresh row per read, and the test backend
// must not be weaker. A caller mutating a fetched row can
// never rewrite committed state.
export function bufferTx(
    buffer: { id: string }[],
    mode: TxMode,
): Tx {
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
            const row = buffer.find(
                r => r.id === id,
            );
            return row === undefined
                ? null
                : { ...row } as T;
        },
        async getAll<T extends { id: string }>(): Promise<T[]> {
            return buffer.map(
                row => ({ ...row }),
            ) as T[];
        },
        async getCollectionPairs<T extends { id: string }>(
            path: string,
        ): Promise<T[]> {
            return buffer
                .filter(row => (
                    row as Record<string, unknown>
                )['path'] === path)
                .sort(byResponseAtThenId)
                .map(row => ({ ...row })) as T[];
        },
        async getPairsByRequestHash<T extends { id: string }>(
            hash: string,
        ): Promise<T[]> {
            return buffer
                .filter(row => (
                    row as Record<string, unknown>
                )['request_hash'] === hash)
                .sort(byResponseAtThenId)
                .map(row => ({ ...row })) as T[];
        },
        async getDocumentHistory<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T[]> {
            return buffer
                .filter((row) => {
                    const rec = row as
                        Record<string, unknown>;
                    return rec['path']
                        === path
                        && rec['name'] === name;
                })
                .sort(byResponseAtThenId)
                .map((row) => ({ ...row })) as T[];
        },
        async getWhereBody<T extends { id: string }>(
            path: string,
            containment: Record<string, unknown>,
        ): Promise<T[]> {
            return buffer
                .filter((row) => {
                    const rec = row as
                        Record<string, unknown>;
                    if (
                        rec['path']
                        !== path
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
                .sort(byResponseAtThenId)
                .map((row) => ({ ...row })) as T[];
        },
        async append<T extends { id: string }>(
            row: T,
        ): Promise<void> {
            assertWritable();
            // Scan BEFORE serializeRecord/splice: absence
            // is unindexed, so a row lacking the column
            // never collides (genesis rows coexist).
            for (
                const column of uniqueColumns(
                    'message_pairs',
                )
            ) {
                const value = (
                    row as Record<string, unknown>
                )[column];
                if (value === undefined) continue;
                const collision = buffer.find(
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
                        'message_pairs', column,
                    );
                }
            }
            const written = {
                ...serializeRecord(
                    row as Record<string, unknown>,
                    'message_pairs',
                ),
                id: row.id,
            } as { id: string };
            const idx = buffer.findIndex(
                r => r.id === row.id,
            );
            if (idx >= 0) {
                buffer[idx] = written;
            } else {
                buffer.push(written);
            }
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
