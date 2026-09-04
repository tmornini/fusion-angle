import { assertEquals } from '@std/assert';
import { join } from '@std/path';

const SKIP_DIRS = new Set([
    '.git',
]);

const ROOT_FILES = [
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'TEST-PLAN.md',
    'ARCHITECTURE.md',
    'DESIGN-SYSTEM.md',
    'SCHEMA.md',
    'API.md',
    'AUDIT.md',
    'bin/build',
    'bin/serve',
    'test',
    'deploy',
    'bin/measure',
    'deno.json',
    'bin/postgres-wipe',
    'bin/postgres-lib',
    'bin/postgres-seed',
    'Dockerfile',
    'compose.yaml',
    '.dockerignore',
    'bin/generate-schema-svg',
    'bin/generate-api-documentation',
] as const;

const TREES = [
    'api',
    'web-app',
    'tests',
    'shared',
    'server',
] as const;

function walk(dir: string, out: string[]): void {
    for (const entry of Deno.readDirSync(dir)) {
        if (SKIP_DIRS.has(entry.name)) {
            continue;
        }
        const path = join(dir, entry.name);
        if (entry.isDirectory) {
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
    // Raw bytes first: a binary file (a null byte) is
    // never decoded as text, matching Node's Buffer
    // sniff this replaced. TextDecoder, never
    // Uint8Array.prototype.toString — the latter
    // ignores its argument and stringifies as numbers.
    const buf = Deno.readFileSync(path);
    if (buf.includes(0)) {
        return [];
    }
    const src = new TextDecoder().decode(buf).replaceAll(
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

Deno.test('no live Fusion AI or fusion-ai remains',
() => {
    const files = [...ROOT_FILES];
    for (const tree of TREES) {
        walk(tree, files);
    }
    const hits = files.flatMap(hitsIn);
    assertEquals(hits, []);
});
