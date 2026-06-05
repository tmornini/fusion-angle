import {
    MissingTableError,
    TABLE_NAMES,
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import {
    isRowShaped,
} from './storage-serialize.ts';
import { bufferTx } from './backend-buffer-tx.ts';
import { createSerializer } from './store-serializer.ts';

const KEY_PREFIX = 'fusion-ai:';

const COMPRESSED_TABLES: ReadonlySet<string> = new Set([
    'states',
    'flow_versions',
]);

const COMPRESSION_PREFIX = 'gz1:';

async function compressJson(
    json: string,
): Promise<string> {
    const stream = new Blob([json]).stream().pipeThrough(
        new CompressionStream('gzip'),
    );
    const buffer =
        await new Response(stream).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }
    return COMPRESSION_PREFIX + btoa(binary);
}

async function decompressJson(
    stored: string,
): Promise<string> {
    if (!stored.startsWith(COMPRESSION_PREFIX)) {
        return stored;
    }
    const b64 = stored.slice(COMPRESSION_PREFIX.length);
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    const stream = new Blob([bytes]).stream().pipeThrough(
        new DecompressionStream('gzip'),
    );
    return new Response(stream).text();
}

export class LocalStorageBackend
    implements StorageBackend
{
    // Orders whole transactions within this backend
    // instance — global ordering, stronger than the
    // per-store mutex it replaces (A3). Cross-tab ordering
    // is out of reach until the IndexedDB tier (Phase B):
    // two tabs hold separate heaps, so this orders only the
    // writes originating in this one.
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor() {
        this.#serialize = createSerializer();
    }

    // Simulated transaction: preload the declared tables
    // (decompress + parse), serve every row op from the
    // buffer, re-encode and flush the dirty tables only
    // when `fn` resolves. A throw skips the flush, so the
    // multi-key write is all-or-nothing within this tab.
    // The flush itself is still not OS-atomic across keys —
    // no platform primitive exists here, which is exactly
    // why Phase B moves to IndexedDB.
    async transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return this.#serialize(async () => {
            const buffer =
                new Map<string, { id: string }[]>();
            for (const table of tables) {
                buffer.set(table, await this.#load(table));
            }
            const dirty = new Set<string>();
            const tx = bufferTx(buffer, mode, dirty);
            const result = await fn(tx);
            for (const table of dirty) {
                await this.#store(
                    table, buffer.get(table)!,
                );
            }
            return result;
        });
    }

    async ensureTables(
        tables: readonly string[],
    ): Promise<void> {
        for (const table of tables) {
            if (
                localStorage.getItem(
                    KEY_PREFIX + table,
                ) === null
            ) {
                localStorage.setItem(
                    KEY_PREFIX + table, '[]',
                );
            }
        }
    }

    // Preload one table into a transaction buffer: read the
    // key, decompress a gz1 payload if present, parse, and
    // reject a malformed table loudly. A never-created table
    // throws MissingTableError so the caller routes the user
    // to re-import a snapshot.
    async #load(
        table: string,
    ): Promise<{ id: string }[]> {
        const raw = localStorage.getItem(
            KEY_PREFIX + table,
        );
        if (raw === null) {
            throw new MissingTableError(table);
        }
        let json: string;
        try {
            json = await decompressJson(raw);
        } catch (e) {
            throw new Error(
                'Decompressing table "'
                + table + '" failed: '
                + (e instanceof Error
                    ? e.message
                    : String(e)),
            );
        }
        let parsed: unknown;
        try {
            parsed = JSON.parse(json);
        } catch (e) {
            throw new Error(
                'Parsing table "'
                + table + '" failed: '
                + (e instanceof Error
                    ? e.message
                    : String(e)),
            );
        }
        if (!Array.isArray(parsed)) {
            throw new Error(
                'Table "' + table
                + '" is not an array.'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        if (!parsed.every(isRowShaped)) {
            throw new Error(
                'Table "' + table
                + '" has malformed row(s).'
                + ' Clear data or import'
                + ' a valid snapshot.',
            );
        }
        return parsed as { id: string }[];
    }

    // Flush one table from a transaction buffer: re-gzip the
    // compressed tables, then setItem. Rows arrive already
    // serialized (the buffer ran the NOT-NULL gate at put
    // time), so this only encodes and stores.
    async #store(
        table: string,
        rows: { id: string }[],
    ): Promise<void> {
        const json = JSON.stringify(rows);
        const payload = COMPRESSED_TABLES.has(table)
            ? await compressJson(json)
            : json;
        try {
            localStorage.setItem(
                KEY_PREFIX + table,
                payload,
            );
        } catch (e) {
            if (
                e instanceof DOMException
                && e.name === 'QuotaExceededError'
            ) {
                throw new Error(
                    'Storage quota exceeded'
                    + ' writing "'
                    + table
                    + '". Clear old data or'
                    + ' export a snapshot first.',
                );
            }
            throw e;
        }
    }

    async hasSchema(): Promise<boolean> {
        return TABLE_NAMES.some(
            t => localStorage.getItem(
                KEY_PREFIX + t,
            ) !== null,
        );
    }

    async createSchema(): Promise<void> {
        await this.ensureTables(TABLE_NAMES);
    }

    async deleteSchema(): Promise<void> {
        for (const table of TABLE_NAMES) {
            localStorage.removeItem(
                KEY_PREFIX + table,
            );
        }
    }
}
