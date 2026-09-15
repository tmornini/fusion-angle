import {
    MissingTableError,
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import { bufferTx } from './backend-buffer-tx.ts';
import { createSerializer } from './store-serializer.ts';

export class MemoryStorageBackend
    implements StorageBackend
{
    #rows: { id: string }[] | undefined;
    // Orders whole transactions within this backend
    // instance — global ordering, stronger than the
    // per-store mutex it replaces (A2). Cross-process
    // ordering is Postgres's (advisory locks); this
    // serializer orders one memory instance.
    readonly #serialize:
        <R>(fn: () => Promise<R>) => Promise<R>;

    constructor() {
        this.#rows = undefined;
        this.#serialize = createSerializer();
    }

    // Simulated transaction: copy the table, serve every
    // row op from the copy, adopt the copy when `fn`
    // resolves. A throw skips the adoption, so the live
    // rows are byte-identical — rollback is "don't adopt",
    // never "undo".
    async transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return this.#serialize(async () => {
            if (this.#rows === undefined) {
                throw new MissingTableError('message_pairs');
            }
            const buffer = [...this.#rows];
            const result = await fn(bufferTx(buffer, mode));
            this.#rows = buffer;
            return result;
        });
    }

    async ensureTable(): Promise<void> {
        if (this.#rows === undefined) {
            this.#rows = [];
        }
    }

    async hasSchema(): Promise<boolean> {
        return this.#rows !== undefined;
    }

    async postSchemaCreation(): Promise<void> {
        await this.ensureTable();
    }

    async deleteSchema(): Promise<void> {
        this.#rows = undefined;
    }
}
