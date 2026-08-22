import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TABLE_INDEXES } from '../api/db.ts';

// Every call-site keyed read in the codebase: a place that
// reads a table by a column via the `getAllWhere(column,
// key)` store method (which lowers to `Tx.getWhere`).
// Every `getAllWhere` literal names a column `getWhere`
// accepts on both backends. This static guard closes
// that contract at ./validate time.
//
// When you add a `getAllWhere('column', ...)` call site, add its
// { table, column } below. This manifest is the contract:
// TABLE_INDEXES must cover every entry.
const KEYED_READS: ReadonlyArray<{
    table: string;
    column: string;
}> = [
    { table: 'message_pairs', column: 'request_hash' },
    { table: 'message_pairs', column: 'uri_collection' },
];

test('no caller getAllWhere uri_id', async () => {
    assert.equal(
        KEYED_READS.some((r) => r.column === 'uri_id'),
        false,
    );
});

test('message_pairs carry no unique follows index', () => {
    const cols = TABLE_INDEXES['message_pairs'] ?? [];
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
            + 'getWhere rejects an undeclared column on '
            + 'both backends.',
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
