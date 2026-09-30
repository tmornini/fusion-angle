// Rehearse the mock-data seed on a scratch memory backend,
// record each statement's rows, then land the recordings by
// depth on Postgres in one transaction: the DDL, the root,
// the batches, and the marker. `fail` duplicates a row id in
// the last batch and reports whether the table survived.
// `full` pads the first batch to the row limit with copies
// of its rows under fresh ids and names.
import { BackedDbAdapter } from '../../../api/db-backed.ts';
import { MemoryStorageBackend } from
    '../../../api/backend-memory.ts';
import { postMockDataLoad } from '../../../api/mock-data.ts';
import { testHashPassword } from '../../../tests/mock-seed.ts';
import { connectPostgres } from '../../../api/postgres-client.ts';
import { POSTGRES_SCHEMA } from '../../../api/schema-postgres.ts';
import { statementText } from
    '../../../api/ledger-statement-sql.ts';
import { rootBind } from '../../../api/ledger-root.ts';
import { STATEMENT_TIMEOUT_MS } from
    '../../../server/postgres-gate.ts';
import {
    NIL_IDENTIFIER,
    generateIdentifier,
    identifierOfUuidText,
    uuidTextOfIdentifier,
} from '../../../shared/identifier.ts';
import type { StatementBind } from
    '../../../shared/ledger-statement.ts';

const url = Deno.env.get('FA_PROBE_POSTGRES_URL');
if (url === undefined) {
    throw new Error('FA_PROBE_POSTGRES_URL is required');
}
const fail = Deno.args[0] === 'fail';
const full = Deno.args[0] === 'full';
const MAX_PARAMETERS = 65535;
const LEADING_PARAMETERS = 1;
const PARAMETERS_PER_ROW = 14;
const ROWS_PER_STATEMENT = Math.floor(
    (MAX_PARAMETERS - LEADING_PARAMETERS) / 2 / PARAMETERS_PER_ROW);

type Recorded = { rows: StatementBind[]; supersedes: string[] };
const recorded: Recorded[] = [];
const backend = new MemoryStorageBackend();
const execute = backend.executeLedger.bind(backend);
backend.executeLedger = async (attempt, rows, now, tx) => {
    const answers = await execute(attempt, rows, now, tx);
    if (rows[0]?.path !== '/migrations/') {
        recorded.push({
            rows: [...rows],
            supersedes: answers.map((a) => a.supersedes),
        });
    }
    return answers;
};
const adapter = new BackedDbAdapter(
    backend, async () => {}, async () => {}, () => {});
const rehearsalStarted = performance.now();
await postMockDataLoad(adapter, { hashPassword: testHashPassword });
const rehearsalMs = performance.now() - rehearsalStarted;

const depthOfRow = new Map<string, number>();
const depthOf: number[] = recorded.map((statement) => {
    let depth = 1;
    for (const predecessor of statement.supersedes) {
        if (predecessor === NIL_IDENTIFIER) continue;
        depth = Math.max(depth, (depthOfRow.get(predecessor) ?? 0) + 1);
    }
    for (const row of statement.rows) depthOfRow.set(row.id, depth);
    return depth;
});
const batches: Recorded[] = [];
const maxDepth = Math.max(...depthOf);
for (let depth = 1; depth <= maxDepth; depth++) {
    let open: Recorded = { rows: [], supersedes: [] };
    recorded.forEach((statement, index) => {
        if (depthOf[index] !== depth) return;
        if (open.rows.length + statement.rows.length
            > ROWS_PER_STATEMENT) {
            batches.push(open);
            open = { rows: [], supersedes: [] };
        }
        open.rows.push(...statement.rows);
        open.supersedes.push(...statement.supersedes);
    });
    if (open.rows.length > 0) batches.push(open);
}
const root = rootBind(generateIdentifier());
batches[0]!.rows.unshift(root);
batches[0]!.supersedes.unshift(NIL_IDENTIFIER);
if (fail) {
    const last = batches[batches.length - 1]!;
    last.rows[0] = { ...last.rows[0]!, id: batches[0]!.rows[1]!.id };
}
if (full) {
    const first = batches[0]!;
    const sources = first.rows.slice(1);
    for (let i = 0; first.rows.length < ROWS_PER_STATEMENT; i++) {
        const source = sources[i % sources.length]!;
        const id = generateIdentifier();
        first.rows.push({ ...source, id, name: id });
        first.supersedes.push(NIL_IDENTIFIER);
    }
}

function parameters(rows: readonly StatementBind[]): unknown[] {
    const bound: unknown[] = ['composed'];
    for (const row of rows) {
        bound.push(
            uuidTextOfIdentifier(row.id),
            uuidTextOfIdentifier(row.operationId),
            row.path, row.name, row.requesterIdentityId, row.method,
            row.request, row.requestSalt, row.secret,
            row.responsePrefix, row.responseSuffix, row.responseSalt,
            row.ifMatch === null ? null : uuidTextOfIdentifier(row.ifMatch),
            row.notify,
        );
    }
    return bound;
}

const sql = connectPostgres(url, {
    statementTimeoutMs: STATEMENT_TIMEOUT_MS,
    acquireTimeoutMs: 5000,
});
await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
const statementMs: number[] = [];
let mismatches = 0;
let notLanded = 0;
let outcome = 'committed';
const transactionStarted = performance.now();
try {
    await sql.begin(async (tx) => {
        await tx.unsafe(POSTGRES_SCHEMA);
        for (const batch of batches) {
            const started = performance.now();
            const answers = await tx.unsafe<{
                outcome: string; supersedes: string;
            }>(statementText(batch.rows.length), parameters(batch.rows));
            statementMs.push(Math.round(performance.now() - started));
            answers.forEach((answer, index) => {
                if (answer.outcome !== 'land') notLanded += 1;
                if (identifierOfUuidText(answer.supersedes)
                    !== batch.supersedes[index]) {
                    mismatches += 1;
                }
            });
            if (notLanded > 0 || mismatches > 0) {
                throw new Error('landing differs from the rehearsal');
            }
        }
        await tx.unsafe(
            'INSERT INTO schema_marker ("only") VALUES (true)');
    });
} catch (error) {
    outcome = 'rolled back: ' + (error as Error).message;
}
const transactionMs = performance.now() - transactionStarted;
const left = await sql.unsafe<{ table_exists: boolean }>(
    "SELECT to_regclass('public.fa_message_pairs') IS NOT NULL"
    + ' AS table_exists');
const counted = left[0]?.table_exists === true
    ? await sql.unsafe<{ pairs: number }>(
        'SELECT count(*)::int AS pairs FROM fa_message_pairs')
    : [];
console.log(JSON.stringify({
    mode: fail ? 'fail' : full ? 'full' : 'commit',
    rehearsalMs: Math.round(rehearsalMs),
    recordedStatements: recorded.length,
    recordedRows: recorded.reduce((n, s) => n + s.rows.length, 0),
    maxDepth,
    rowsPerStatement: ROWS_PER_STATEMENT,
    batchRows: batches.map((b) => b.rows.length),
    statementMs,
    transactionMs: Math.round(transactionMs),
    outcome,
    notLanded,
    supersedesMismatches: mismatches,
    tableExistsAfter: left[0]?.table_exists,
    pairsAfter: counted[0]?.pairs,
}, null, 1));
await sql.end();
