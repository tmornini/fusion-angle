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
    { table: 'requests', column: 'message_hash' },
    { table: 'responses', column: 'uri_id' },
    { table: 'requests', column: 'uri_prefix' },
    { table: 'responses', column: 'uri_prefix' },
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
