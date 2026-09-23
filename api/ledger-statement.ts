// Runs the one ledger statement. Postgres commits it
// unless the caller already holds a client. Memory
// classifies under the backend serializer.

import type { DbAdapter } from './db.ts';
import type {
    Attempt,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';

export const SUCCESSION_CONSTRAINT =
    'fa_message_pairs_succession';

export class SuccessionConflict extends Error {
    readonly constraint = SUCCESSION_CONSTRAINT;

    constructor() {
        super(SUCCESSION_CONSTRAINT);
        this.name = 'SuccessionConflict';
    }
}

export function mapStatementError(
    error: unknown,
): unknown {
    if (error instanceof SuccessionConflict) {
        return error;
    }
    if (error === null || typeof error !== 'object') {
        return error;
    }
    const rec = error as {
        code?: unknown,
        constraint?: unknown,
        constraint_name?: unknown,
    };
    if (rec.code !== '23505') return error;
    const constraint = typeof rec.constraint === 'string'
        ? rec.constraint
        : rec.constraint_name;
    if (constraint === SUCCESSION_CONSTRAINT) {
        return new SuccessionConflict();
    }
    return error;
}

export async function runLedgerStatement(
    adapter: DbAdapter,
    attempt: Attempt,
    rows: readonly StatementBind[],
    now?: string,
): Promise<StatementAnswer[]> {
    if (rows.length === 0) {
        throw new Error(
            'ledger statement requires a row',
        );
    }
    return adapter.executeLedger(attempt, rows, now);
}
