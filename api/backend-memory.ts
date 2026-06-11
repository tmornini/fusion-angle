import {
    MissingTableError,
    TABLE_NAMES,
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import { bufferTx } from './backend-buffer-tx.ts';
import { createSerializer } from './store-serializer.ts';

export class MemoryStorageBackend
    implements StorageBackend
{
    readonly #tables:
        Map<string, { id: string }[]>;
    // Orders whole transactions within this backend
    // instance — global ordering, stronger than the
    // per-store mutex it replaces (A2). Cross-tab ordering
    // is out of reach until the IndexedDB tier (Phase B).
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor() {
        this.#tables = new Map();
        this.#serialize = createSerializer();
    }

    // Simulated transaction: buffer the declared tables,
    // serve every row op from the buffer, flush the dirty
    // tables only when `fn` resolves. A throw skips the
    // flush, so the live store is byte-identical — rollback
    // is "don't flush", never "undo".
    async transaction<R>(
        tables: readonly string[],
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return this.#serialize(async () => {
            const buffer =
                new Map<string, { id: string }[]>();
            for (const table of tables) {
                const rows = this.#tables.get(table);
                if (rows === undefined) {
                    throw new MissingTableError(table);
                }
                buffer.set(table, [...rows]);
            }
            const dirty = new Set<string>();
            const tx = bufferTx(buffer, mode, dirty);
            const result = await fn(tx);
            for (const table of dirty) {
                this.#tables.set(
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
            if (!this.#tables.has(table)) {
                this.#tables.set(table, []);
            }
        }
    }

    async hasSchema(): Promise<boolean> {
        return this.#tables.size > 0;
    }

    async postSchemaCreation(): Promise<void> {
        await this.ensureTables(TABLE_NAMES);
    }

    async deleteSchema(): Promise<void> {
        this.#tables.clear();
    }
}
