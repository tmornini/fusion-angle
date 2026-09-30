// The seed beneath the adapter: rehearse the live ops on
// scratch memory, plan the recorded rows by depth, and
// land them in one transaction.

import {
    LEADING_PARAMETERS,
    PARAMETERS_PER_ROW,
} from './ledger-statement-sql.ts';
import type { StatementBind } from
    '../shared/ledger-statement.ts';
import { NIL_IDENTIFIER } from '../shared/identifier.ts';
import { Octets } from '../shared/http-message/octets.ts';
import type {
    StorageBackend,
    Tx,
    TxMode,
} from './db.ts';
import { BackedDbAdapter } from './db-backed.ts';
import { SuccessionConflict } from './ledger-statement.ts';
import type {
    Attempt,
    StatementAnswer,
} from '../shared/ledger-statement.ts';
import { rootBind } from './ledger-root.ts';

// The bind limit Postgres allows one statement.
export const POSTGRES_BIND_LIMIT = 65535;

// Half the binds the attempt class leaves, so the seed
// can grow (Decision 1). The ceiling is refused.
export const SEED_ROWS_PER_STATEMENT = Math.floor(
    (POSTGRES_BIND_LIMIT - LEADING_PARAMETERS)
        / 2 / PARAMETERS_PER_ROW,
);

// What one live request wrote: its rows as the handler
// bound them, and each row's predecessor from the answer.
export interface RehearsedStatement {
    readonly rows: readonly StatementBind[];
    readonly supersedes: readonly string[];
}

// One more than the deepest statement whose rows these
// rows supersede. The nil uuid is depth 0, so a chain's
// k-th version lands at depth k.
export function depthsOf(
    statements: readonly RehearsedStatement[],
): number[] {
    const depthOfRow = new Map<string, number>();
    return statements.map((statement) => {
        let depth = 1;
        for (const predecessor of statement.supersedes) {
            if (predecessor === NIL_IDENTIFIER) continue;
            const before = depthOfRow.get(predecessor);
            if (before === undefined) {
                throw new Error(
                    'seed row supersedes a row no earlier'
                        + ' statement wrote',
                );
            }
            depth = Math.max(depth, before + 1);
        }
        for (const row of statement.rows) {
            depthOfRow.set(row.id, depth);
        }
        return depth;
    });
}

// Depth 1, then depth 2, and so on. Within a depth,
// statements keep rehearsal order and pack whole. A
// statement is what one live request wrote; a creating
// POST supersedes the root only because its sibling
// genesis lands beside it, so a statement never splits.
export function packSeedBatches(
    statements: readonly RehearsedStatement[],
    depths: readonly number[],
    rowLimit: number,
): RehearsedStatement[] {
    const batches: RehearsedStatement[] = [];
    const deepest = Math.max(0, ...depths);
    for (let depth = 1; depth <= deepest; depth++) {
        let rows: StatementBind[] = [];
        let supersedes: string[] = [];
        statements.forEach((statement, index) => {
            if (depths[index] !== depth) return;
            if (statement.rows.length > rowLimit) {
                throw new Error(
                    'seed statement exceeds the batch'
                        + ' row limit',
                );
            }
            if (rows.length + statement.rows.length
                > rowLimit) {
                batches.push({ rows, supersedes });
                rows = [];
                supersedes = [];
            }
            rows.push(...statement.rows);
            supersedes.push(...statement.supersedes);
        });
        if (rows.length > 0) {
            batches.push({ rows, supersedes });
        }
    }
    return batches;
}

const REQUEST_ID_LINE = '\r\nrequest-id: ';
const LINE_END = '\r\n';
const HEAD_END = '\r\n\r\n';

// A seed row stores no request-id line (Decision 3). The
// former writes the line after the date, so it sits in
// the suffix, before the blank line.
export function withoutRequestIdLine(
    bind: StatementBind,
): StatementBind {
    const suffix = Octets.fromBytes(
        bind.responseSuffix,
    ).toLatin1();
    const headEnd = suffix.indexOf(HEAD_END);
    const at = suffix.indexOf(REQUEST_ID_LINE);
    if (headEnd < 0 || at < 0 || at > headEnd) {
        throw new Error(
            'seed row carries no request-id line',
        );
    }
    const end = suffix.indexOf(
        LINE_END, at + LINE_END.length,
    );
    return {
        ...bind,
        responseSuffix: Octets.fromLatin1(
            suffix.slice(0, at) + suffix.slice(end),
        ).asBytes(),
    };
}

// Records what the seed's live ops write. The run holds
// one transaction open on the scratch, which nothing else
// uses: the ops' own transactions and reads re-enter it,
// and a bare statement applies on it, so the statements
// overlap as a transaction's do. It keeps openClient's
// verdict beneath the adapter: a matched, stale, or
// refused row fails the seed. A conflict must not reach
// runWrite, which would retry and answer refused. A wave's
// statements finish in any order, so each takes its place
// when called, and they are returned in call order.
export class RehearsalBackend implements StorageBackend {
    readonly #scratch: StorageBackend;
    readonly #recorded = new Map<number, RehearsedStatement>();
    #calls = 0;
    #open: Tx | undefined;

    constructor(scratch: StorageBackend) {
        this.#scratch = scratch;
        this.#open = undefined;
    }

    statements(): readonly RehearsedStatement[] {
        return [...this.#recorded]
            .sort(([a], [b]) => a - b)
            .map(([, statement]) => statement);
    }

    // Hold `tx`, the scratch's one open transaction, for
    // `run`. Cleared in finally, so no handle outlives it.
    async runOn(
        tx: Tx,
        run: () => Promise<void>,
    ): Promise<void> {
        this.#open = tx;
        try {
            await run();
        } finally {
            this.#open = undefined;
        }
    }

    // The ops' reads and transactions re-enter the open
    // handle, as a nested readTransaction re-enters the
    // open client. A readonly request joins the readwrite
    // handle: the live path enforces the mode, and the
    // rehearsal does not.
    async read<R>(fn: (tx: Tx) => Promise<R>): Promise<R> {
        return fn(this.#handle());
    }

    async transaction<R>(
        _mode: TxMode,
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        return fn(this.#handle());
    }

    async seedTransaction<R>(
        fn: (tx: Tx) => Promise<R>,
    ): Promise<R> {
        this.#refuseWhileOpen('seedTransaction');
        return this.#scratch.seedTransaction(fn);
    }

    async ensureTable(): Promise<void> {
        this.#refuseWhileOpen('ensureTable');
        return this.#scratch.ensureTable();
    }

    // An op inside its own transaction passes the handle
    // it re-entered; a bare statement takes the open one.
    async executeLedger(
        attempt: Attempt,
        rows: readonly StatementBind[],
        now: string | undefined,
        tx: Tx | undefined,
    ): Promise<StatementAnswer[]> {
        const position = this.#calls++;
        const handle = tx === undefined ? this.#handle() : tx;
        let answers: StatementAnswer[];
        try {
            answers = await this.#scratch.executeLedger(
                attempt, rows, now, handle,
            );
        } catch (error) {
            if (error instanceof SuccessionConflict) {
                throw new Error(
                    'seed statement returned refused',
                );
            }
            throw error;
        }
        for (const answer of answers) {
            if (answer.outcome !== 'land') {
                throw new Error(
                    'seed statement returned '
                        + answer.outcome,
                );
            }
        }
        this.#recorded.set(position, {
            rows: [...rows],
            supersedes: answers.map(
                (answer) => answer.supersedes,
            ),
        });
        return answers;
    }

    hasSchema(): Promise<boolean> {
        return this.#scratch.hasSchema();
    }

    async postSchemaCreation(): Promise<void> {
        this.#refuseWhileOpen('postSchemaCreation');
        return this.#scratch.postSchemaCreation();
    }

    deleteSchema(): Promise<void> {
        return this.#scratch.deleteSchema();
    }

    // Each of the three takes the scratch's serializer,
    // which the open run holds until it ends: a crash in
    // place of a hang.
    #refuseWhileOpen(method: string): void {
        if (this.#open !== undefined) {
            throw new Error(
                method + ' called during the open seed'
                    + ' rehearsal',
            );
        }
    }

    // Nothing reaches the scratch's rows outside a run.
    #handle(): Tx {
        if (this.#open === undefined) {
            throw new Error('seed rehearsal is not open');
        }
        return this.#open;
    }
}

// Run the seed's live ops in one transaction on a scratch
// backend and return every statement they executed, in
// the order they were called. The scratch root is the
// scratch's own statement, not the seed's, and lands
// before the transaction copies the table.
export async function rehearse(
    scratch: StorageBackend,
    run: (db: BackedDbAdapter) => Promise<void>,
): Promise<readonly RehearsedStatement[]> {
    const backend = new RehearsalBackend(scratch);
    const db = new BackedDbAdapter(
        backend,
        async () => {},
        async () => {},
        () => {},
    );
    await db.ensureTable();
    await scratch.transaction(
        'readwrite',
        (tx) => backend.runOn(tx, () => run(db)),
    );
    return backend.statements();
}

// A rehearsed seed: the run's id, for the root, and every
// statement the live ops executed.
export interface SeedRehearsal {
    readonly seedRunId: string;
    readonly statements: readonly RehearsedStatement[];
}

// One transaction beneath the adapter: the schema, the
// root and every batch by depth, then the marker. Every
// row must land on its rehearsed predecessor, or nothing
// exists afterwards, not even the table.
export async function postSeedLanding(
    backend: StorageBackend,
    rehearsal: SeedRehearsal,
): Promise<void> {
    const statements: RehearsedStatement[] = [
        {
            rows: [rootBind(rehearsal.seedRunId)],
            supersedes: [NIL_IDENTIFIER],
        },
        ...rehearsal.statements.map((statement) => ({
            rows: statement.rows.map(withoutRequestIdLine),
            supersedes: statement.supersedes,
        })),
    ];
    const batches = packSeedBatches(
        statements,
        depthsOf(statements),
        SEED_ROWS_PER_STATEMENT,
    );
    await backend.seedTransaction(async (tx) => {
        for (const batch of batches) {
            assertLanded(
                await backend.executeLedger(
                    'composed', batch.rows, undefined, tx,
                ),
                batch.supersedes,
            );
        }
    });
}

function assertLanded(
    answers: readonly StatementAnswer[],
    supersedes: readonly string[],
): void {
    answers.forEach((answer, index) => {
        if (answer.outcome !== 'land') {
            throw new Error(
                'seed statement returned ' + answer.outcome,
            );
        }
        if (answer.supersedes !== supersedes[index]) {
            throw new Error(
                'seed row landed on another predecessor',
            );
        }
    });
}
