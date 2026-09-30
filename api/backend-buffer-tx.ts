import {
    serializeRecord,
} from './storage-serialize.ts';
import {
    UniqueConstraintError,
    uniqueColumns,
    type Tx,
    type TxMode,
} from './db.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';

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

const PUT_METHOD = 'PUT';
const DELETE_METHOD = 'DELETE';

function isDocumentMethod(method: unknown): boolean {
    return method === PUT_METHOD || method === DELETE_METHOD;
}

// The (at, id) key latestByKey reduces over, beside the row
// it came from. response_at is NOT NULL past the seam.
function keyedByResponseAt(row: { id: string }): {
    readonly at: string;
    readonly id: string;
    readonly row: Record<string, unknown> & { id: string };
} {
    const rec = row as Record<string, unknown> & { id: string };
    return { at: String(rec['response_at']), id: row.id, row: rec };
}

// The latest PUT or DELETE among `rows` by (response_at, id).
function headOf(
    rows: readonly { id: string }[],
): (Record<string, unknown> & { id: string }) | null {
    const head = latestByKey(
        rows.map(keyedByResponseAt), () => 'head',
    ).get('head');
    return head === undefined ? null : head.row;
}

function documentRows(
    buffer: readonly { id: string }[],
    path: string,
    name: string,
): { id: string }[] {
    return buffer.filter((row) => {
        const rec = row as Record<string, unknown>;
        return rec['path'] === path
            && rec['name'] === name
            && isDocumentMethod(rec['method']);
    });
}

// Builds a row-granular Tx handle over a pre-loaded copy
// of the table. The buffer IS the unit of atomicity: every
// op mutates only the buffer, so a backend commits by
// adopting it and rolls back by discarding it. The memory
// backend fills and drains this buffer; Postgres does not
// use it. The NOT-NULL gate runs at `append` time, so a
// bad row throws inside `fn` and the whole transaction
// rolls back. An existing id is left as it is and reported
// `false` — the buffer is append-only like the table.
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
        async getHead(
            path: string,
            name: string,
        ): Promise<{
            readonly id: string;
            readonly method: string;
        } | null> {
            const head = headOf(documentRows(buffer, path, name));
            return head === null
                ? null
                : { id: head.id, method: String(head['method']) };
        },
        async getHeadPair<T extends { id: string }>(
            path: string,
            name: string,
        ): Promise<T | null> {
            const head = headOf(documentRows(buffer, path, name));
            return head === null ? null : { ...head } as T;
        },
        async getCollectionHeadPairs<
            T extends { id: string },
        >(path: string): Promise<T[]> {
            const documents = buffer.filter((row) => {
                const rec = row as Record<string, unknown>;
                return rec['path'] === path
                    && isDocumentMethod(rec['method']);
            });
            const heads = latestByKey(
                documents.map(keyedByResponseAt),
                (keyed) => String(keyed.row['name']),
            );
            const live: { id: string }[] = [];
            for (const head of heads.values()) {
                if (head.row['method'] === PUT_METHOD) {
                    live.push(head.row);
                }
            }
            return live
                .sort(byResponseAtThenId)
                .map((row) => ({ ...row })) as T[];
        },
        async append<T extends { id: string }>(
            row: T,
        ): Promise<boolean> {
            assertWritable();
            if (buffer.some((existing) => existing.id === row.id)) {
                return false;
            }
            // Scan BEFORE serializeRecord/splice: absence
            // is unindexed, so a row lacking the column
            // never collides (genesis rows coexist).
            for (
                const column of uniqueColumns(
                    'fa_message_pairs',
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
                        'fa_message_pairs', column,
                    );
                }
            }
            const written = {
                ...serializeRecord(
                    row as Record<string, unknown>,
                    'fa_message_pairs',
                ),
                id: row.id,
            } as { id: string };
            buffer.push(written);
            return true;
        },
        ledgerBuffer(): { id: string }[] {
            return buffer;
        },
    };
}

