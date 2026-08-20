import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    readdirSync,
    readFileSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';

const SKIP_DIRS = new Set([
    'node_modules',
    '.git',
]);

const ROOT_FILES = [
    'README.md',
    'CLAUDE.md',
    'TEST-PLAN.md',
    'ARCHITECTURE.md',
    'DESIGN-SYSTEM.md',
    'SCHEMA.md',
    'API.md',
    'AUDIT.md',
    'build',
    'serve',
    'validate',
    'test',
    'measure',
    'package-lock.json',
    'wipe-postgres',
    'generate-schema-svg',
    'generate-api-documentation',
] as const;

const TREES = [
    'api',
    'web-app',
    'tests',
    'shared',
    'server',
] as const;

function walk(dir: string, out: string[]): void {
    for (const name of readdirSync(dir)) {
        if (SKIP_DIRS.has(name)) {
            continue;
        }
        const path = join(dir, name);
        const st = statSync(path);
        if (st.isDirectory()) {
            walk(path, out);
        } else {
            out.push(path);
        }
    }
}

function hitsIn(path: string): string[] {
    // Pin files name the old strings as the
    // forbidden covenant. They are not live
    // product identifiers.
    if (path.includes('tests/fusion-angle-')) {
        return [];
    }
    const buf = readFileSync(path);
    if (buf.includes(0)) {
        return [];
    }
    const src = buf.toString('utf8').replaceAll(
        'fusion-ai-browser',
        '',
    );
    const hits: string[] = [];
    if (src.includes('Fusion AI')) {
        hits.push(path + ': Fusion AI');
    }
    if (src.includes('fusion-ai')) {
        hits.push(path + ': fusion-ai');
    }
    return hits;
}

test('no live Fusion AI or fusion-ai remains',
() => {
    const files = [...ROOT_FILES];
    for (const tree of TREES) {
        walk(tree, files);
    }
    const hits = files.flatMap(hitsIn);
    assert.deepEqual(hits, []);
});
