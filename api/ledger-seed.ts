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
