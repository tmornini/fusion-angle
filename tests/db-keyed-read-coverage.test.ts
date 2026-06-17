import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_INDEXES } from '../api/db.ts';

// Every call-site keyed read in the codebase: a place that reads
// a table by a column via the `getAllWhere(column, key)` store
// method (which lowers to `Tx.getWhere`). On the IndexedDB backend
// this becomes `store(table).index(column).getAll(...)`, so the
// column MUST carry a secondary index in TABLE_INDEXES — else the
// read throws NotFoundError at runtime. The memory and
// localStorage backends cannot surface this fault: their getWhere
// is getAll+filter and needs no index, so the native index path
// is exercised only in the browser. This static guard closes that
// blind spot at ./validate time.
//
// When you add a `getAllWhere('column', ...)` call site, add its
// { table, column } below. This manifest is the contract:
// TABLE_INDEXES must cover every entry.
const KEYED_READS: ReadonlyArray<{
    table: string;
    column: string;
}> = [
    { table: 'states', column: 'entity_id' },
    { table: 'memberships', column: 'identity_id' },
    {
        table: 'identity_default_organizations',
        column: 'identity_id',
    },
    { table: 'identity_token_revocations', column: 'identity_id' },
    { table: 'identity_credentials', column: 'identity_id' },
    { table: 'role_grants', column: 'identity_id' },
    { table: 'identity_tokens', column: 'jti' },
    { table: 'identity_tokens', column: 'chain_id' },
    { table: 'identity_pii', column: 'email' },
    { table: 'authorization_codes', column: 'code' },
    { table: 'state_field_values', column: 'attribute_id' },
    { table: 'state_field_values', column: 'state_event_id' },
    { table: 'idea_submissions', column: 'idea_id' },
    { table: 'flow_versions', column: 'flow_id' },
    { table: 'project_flows', column: 'project_id' },
    { table: 'flow_work_orders', column: 'flow_id' },
    { table: 'flow_records', column: 'flow_id' },
    { table: 'objective_revisions', column: 'objective_id' },
    {
        table: 'project_objective_baseline_scores',
        column: 'project_id',
    },
    {
        table: 'project_objective_actual_scores',
        column: 'project_id',
    },
];

test('every keyed read has a matching secondary index', () => {
    for (const { table, column } of KEYED_READS) {
        const cols = TABLE_INDEXES[table] ?? [];
        assert.ok(
            cols.includes(column),
            `${table} is read by ${column} via getWhere, but `
            + 'TABLE_INDEXES has no such index '
            + `(present: ${cols.join(', ') || 'none'}). The `
            + 'IndexedDB read throws NotFoundError at runtime.',
        );
    }
});
