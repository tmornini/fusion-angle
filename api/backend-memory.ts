import {
    MissingTableError,
    type StorageBackend,
    type Tx,
    type TxMode,
} from './db.ts';
import { bufferTx } from './backend-buffer-tx.ts';
import { createSerializer } from './store-serializer.ts';
import { mintRootBind } from './ledger-root.ts';
import { SuccessionConflict }
    from './ledger-statement.ts';
import {
    classifyStatement,
} from '../shared/ledger-statement.ts';
import type {
    Attempt,
    Head,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';
import { compareIdentifiers }
    from '../shared/identifier.ts';
import { stampOfMicros } from '../shared/pair-root.ts';
import { Octets } from
    '../shared/http-message/octets.ts';

const TABLE = 'fa_message_pairs';
const PKEY = 'fa_message_pairs_pkey';

export class MemoryStorageBackend
    implements StorageBackend
{
    #rows: { id: string }[] | undefined;
    #refusals = 0;
    #executions = 0;
    // Date.now is a millisecond. Two statements in
    // that millisecond must not share a stamp: a
    // claim reads the document head strictly before
    // its own stamp.
    #lastMicros = 0n;
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

    // The next `count` statement executions throw
    // before the succession set is consulted.
    refuseNextSuccessions(count: number): void {
        this.#refusals = count;
    }

    statementExecutions(): number {
        return this.#executions;
    }

    #clock(now: string | undefined): string {
        if (now !== undefined) return now;
        const observed = BigInt(Date.now()) * 1000n;
        const next = observed > this.#lastMicros
            ? observed
            : this.#lastMicros + 1n;
        this.#lastMicros = next;
        return stampOfMicros(next);
    }

    // Simulated transaction: copy the table, serve every
    // row op from the copy, adopt the copy when `fn`
    // resolves. A throw skips the adoption, so the live
    // rows are byte-identical — rollback is "don't adopt",
    // never "undo".
    async read<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        if (this.#rows === undefined) {
            throw new MissingTableError(TABLE);
        }
        const live = this.#rows;
        return fn(bufferTx(live, 'readonly'));
    }

    async transaction<R>(
        mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return this.#serialize(async () => {
            if (this.#rows === undefined) {
                throw new MissingTableError(TABLE);
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
        if (hasRoot(this.#rows)) return;
        await this.executeLedger(
            'genesis',
            [mintRootBind()],
            undefined,
            undefined,
        );
    }

    async executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now: string | undefined,
        tx: Tx | undefined,
    ): Promise<StatementAnswer[]> {
        const open = tx?.ledgerBuffer?.();
        if (open !== undefined) {
            return this.#apply(open, attempt, rows, now);
        }
        return this.#serialize(async () => {
            if (this.#rows === undefined) {
                throw new MissingTableError(TABLE);
            }
            const copy = [...this.#rows];
            const result = await this.#apply(
                copy, attempt, rows, now,
            );
            this.#rows = copy;
            return result;
        });
    }

    async #apply(
        buffer: { id: string }[],
        attempt: Attempt,
        rows: readonly StatementBind[],
        now: string | undefined,
    ): Promise<StatementAnswer[]> {
        this.#executions += 1;
        if (this.#refusals > 0) {
            this.#refusals -= 1;
            throw new SuccessionConflict();
        }
        const clock = this.#clock(now);
        const classified = await classifyStatement(
            attempt,
            rows,
            headsOf(buffer),
            clock,
        );
        const answers: StatementAnswer[] = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const item = classified[i]!;
            answers.push({
                id: row.id,
                path: row.path,
                name: row.name,
                method: row.method,
                outcome: item.outcome,
                stamp: item.stamp,
                response: item.response,
                headId: item.headId,
                headResponse: item.headResponse,
                inserted: item.inserted,
                supersedes: item.supersedes,
                requestHashHex: item.requestHashHex,
                secretHashHex: item.secretHashHex,
                responseHashHex: item.responseHashHex,
                pairHashHex: item.pairHashHex,
            });
        }
        if (!answers.every((row) => row.inserted)) {
            return answers;
        }
        for (const row of rows) {
            if (buffer.some((existing) => existing.id === row.id)) {
                const error = new Error(
                    'duplicate primary key',
                ) as Error & {
                    code: string,
                    constraint: string,
                };
                error.code = '23505';
                error.constraint = PKEY;
                throw error;
            }
        }
        const claimed = successionKeys(buffer);
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const item = classified[i]!;
            if (!documentMethod(row.method)) continue;
            const key = successionKey(
                row.path, row.name, item.supersedes,
            );
            if (claimed.has(key)) {
                throw new SuccessionConflict();
            }
            claimed.add(key);
        }
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i]!;
            const item = classified[i]!;
            buffer.push(entityOf(row, item));
        }
        return answers;
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

function hasRoot(rows: readonly { id: string }[]): boolean {
    return rows.some((row) => {
        const rec = row as Record<string, unknown>;
        return rec['path'] === '/migrations/'
            && rec['name'] === '0000-root';
    });
}

function documentMethod(method: string): boolean {
    return method === 'PUT' || method === 'DELETE';
}

function successionKey(
    path: string,
    name: string,
    supersedes: string,
): string {
    return path + '\u0000' + name + '\u0000' + supersedes;
}

function successionKeys(
    rows: readonly { id: string }[],
): Set<string> {
    const keys = new Set<string>();
    for (const row of rows) {
        const rec = row as Record<string, unknown>;
        const method = rec['method'];
        if (typeof method !== 'string') continue;
        if (!documentMethod(method)) continue;
        const path = rec['path'];
        const name = rec['name'];
        const supersedes = rec['supersedes'];
        if (
            typeof path !== 'string'
            || typeof name !== 'string'
            || typeof supersedes !== 'string'
        ) {
            continue;
        }
        keys.add(successionKey(path, name, supersedes));
    }
    return keys;
}

function laterHead(
    left: Record<string, unknown>,
    right: Record<string, unknown>,
): boolean {
    const atL = String(left['response_at'] ?? '');
    const atR = String(right['response_at'] ?? '');
    if (atL !== atR) return atL > atR;
    return compareIdentifiers(
        String(left['id'] ?? ''),
        String(right['id'] ?? ''),
    ) > 0;
}

function headsOf(
    rows: readonly { id: string }[],
): Head[] {
    const best = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
        const rec = row as Record<string, unknown>;
        const method = rec['method'];
        if (
            typeof method !== 'string'
            || !documentMethod(method)
        ) {
            continue;
        }
        const path = rec['path'];
        const name = rec['name'];
        if (typeof path !== 'string' || typeof name !== 'string') {
            continue;
        }
        const key = path + '\u0000' + name;
        const prev = best.get(key);
        if (prev === undefined || laterHead(rec, prev)) {
            best.set(key, rec);
        }
    }
    const heads: Head[] = [];
    for (const rec of best.values()) {
        const response = rec['response'];
        heads.push({
            path: String(rec['path']),
            name: String(rec['name']),
            id: String(rec['id']),
            responseAt: String(rec['response_at']),
            response: typeof response === 'string'
                ? Octets.fromLatin1(response).asBytes()
                : new Uint8Array(0),
        });
    }
    return heads;
}

function latin1(bytes: Uint8Array): string {
    return Octets.fromBytes(bytes).toLatin1();
}

function hexOf(bytes: Uint8Array): string {
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return hex;
}

function entityOf(
    row: StatementBind,
    item: {
        supersedes: string,
        stamp: string,
        response: Uint8Array,
        requestHashHex: string,
        secretHashHex: string,
        responseHashHex: string,
        pairHashHex: string,
    },
): { id: string } {
    const entity = {
        id: row.id,
        operation_id: row.operationId,
        path: row.path,
        name: row.name,
        supersedes: item.supersedes,
        requester_identity_id: row.requesterIdentityId,
        method: row.method,
        response_at: item.stamp,
        request: latin1(row.request),
        request_salt: hexOf(row.requestSalt),
        request_hash: item.requestHashHex,
        secret: latin1(row.secret),
        secret_hash: item.secretHashHex,
        response: latin1(item.response),
        response_salt: hexOf(row.responseSalt),
        response_hash: item.responseHashHex,
        pair_hash: item.pairHashHex,
    };
    return entity as { id: string };
}
