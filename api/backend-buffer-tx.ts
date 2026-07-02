import {
    serializeRecord,
} from './storage-serialize.ts';
import {
    UniqueConstraintError,
    uniqueColumns,
    type Tx,
    type TxMode,
} from './db.ts';

// Builds a row-granular Tx handle over a pre-loaded buffer
// of the touched tables. The buffer IS the unit of
// atomicity: every op mutates only the buffer, so a backend
// commits by flushing the dirty set and rolls back by
// discarding it. Backend-agnostic by construction — the two
// simulated backends (memory, localStorage) differ only in
// how they fill the buffer (preload) and drain it (flush),
// never in how the buffer is read or written here. The
// NOT-NULL gate runs at `put` time, so a bad row throws
// inside `fn` and the whole transaction rolls back.
//
// Reads hand out shallow copies (rows are flat), matching
// IndexedDB's structured-clone-per-read value semantics —
// a caller mutating a fetched row can never reach the
// buffer or the committed store.
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
            return scoped(table)
                .filter(row => (
                    row as Record<string, unknown>
                )[column] === key)
                .map(row => ({ ...row })) as T[];
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
