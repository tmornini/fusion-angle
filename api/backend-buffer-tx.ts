import {
    serializeRecord,
} from './storage-serialize.ts';
import {
    UniqueConstraintError,
    uniqueColumns,
    type Tx,
    type TxMode,
} from './db.ts';
import { BODY_INDEXED_PATH } from './schema-postgres.ts';
import { compareIdentifiers } from
    '../shared/identifier.ts';
import { Octets } from '../shared/http-message/octets.ts';
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

const JSON_CONTENT_TYPE =
    '\r\ncontent-type: application/json\r\n';

// A match is every contains field held as that string.
// No content-type, or a body that is not JSON, is no
// match. Only a SyntaxError is that miss: any other
// throw is a store bug and still surfaces. The header
// test is the index function's, including its case.
function bodyContains(
    row: { id: string },
    contains: Readonly<Record<string, string>>,
): boolean {
    const response = (
        row as Record<string, unknown>
    )['response'];
    if (typeof response !== 'string') {
        throw new Error('response is not a wire');
    }
    const splitAt = response.indexOf('\r\n\r\n');
    if (splitAt < 0) return false;
    const header = response.slice(0, splitAt);
    const wrapped = '\r\n' + header + '\r\n';
    if (!wrapped.includes(JSON_CONTENT_TYPE)) return false;
    const bytes = Octets.fromLatin1(
        response.slice(splitAt + 4),
    ).asBytes();
    const text = new TextDecoder('utf-8', { fatal: true })
        .decode(bytes);
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        if (error instanceof SyntaxError) return false;
        throw error;
    }
    if (
        parsed === null
        || typeof parsed !== 'object'
        || Array.isArray(parsed)
    ) {
        return false;
    }
    const record = parsed as Record<string, unknown>;
    for (const [key, value] of Object.entries(contains)) {
        if (record[key] !== value) return false;
    }
    return true;
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
        async getCollectionHeadPairsContaining<
            T extends { id: string },
        >(
            path: string,
            contains: Readonly<Record<string, string>>,
        ): Promise<T[]> {
            if (path !== BODY_INDEXED_PATH) {
                throw new Error('no body index at ' + path);
            }
            const names = new Set<string>();
            for (const row of buffer) {
                const rec = row as Record<string, unknown>;
                if (rec['path'] !== path) continue;
                if (!bodyContains(row, contains)) continue;
                names.add(String(rec['name']));
            }
            const documents = buffer.filter((row) => {
                const rec = row as Record<string, unknown>;
                return rec['path'] === path
                    && names.has(String(rec['name']))
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

