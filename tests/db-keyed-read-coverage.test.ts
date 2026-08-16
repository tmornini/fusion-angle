import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
    { table: 'requests', column: 'uri_collection' },
    { table: 'responses', column: 'uri_collection' },
];

test('no caller getAllWhere uri_id', async () => {
    assert.equal(
        KEYED_READS.some((r) => r.column === 'uri_id'),
        false,
    );
});

test('responses carry no unique follows index', () => {
    const cols = TABLE_INDEXES['responses'] ?? [];
    assert.equal(
        cols.some(
            (spec) =>
                typeof spec !== 'string'
                && spec.column === 'follows',
        ),
        false,
    );
});

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

function apiTypeScriptFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, {
        withFileTypes: true,
    })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...apiTypeScriptFiles(path));
            continue;
        }
        if (entry.name.endsWith('.ts')) {
            out.push(path);
        }
    }
    return out;
}

test('KEYED_READS lists every getAllWhere literal',
() => {
    const call = /getAllWhere\(\s*'([^']+)'/g;
    const found = new Set<string>();
    for (const file of apiTypeScriptFiles('api')) {
        const text = readFileSync(file, 'utf8')
            .replace(/^\s*\/\/.*$/gm, '');
        for (const match of text.matchAll(call)) {
            const column = match[1];
            if (column === undefined) continue;
            found.add(column);
        }
    }
    const listed = new Set(
        KEYED_READS.map((row) => row.column),
    );
    assert.deepEqual(
        [...found].sort(),
        [...listed].sort(),
    );
});
