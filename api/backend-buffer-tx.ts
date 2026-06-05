import {
    serializeRecord,
} from './storage-serialize.ts';
import type { Tx, TxMode } from './db.ts';

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
            return (row ?? null) as T | null;
        },
        async getAll<T extends { id: string }>(
            table: string,
        ): Promise<T[]> {
            return [...scoped(table)] as T[];
        },
        async put<T extends { id: string }>(
            table: string,
            row: T,
        ): Promise<void> {
            assertWritable();
            const rows = scoped(table);
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
