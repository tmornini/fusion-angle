import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_SCRIPT = readFileSync('build', 'utf8');
const BUILD_LIB_SCRIPT = readFileSync('build-lib', 'utf8');

// Deleted names no longer appear in live source. Hunt
// the live mint symbols too, or a server-core import of
// access-token would pass this pin.
const FORBIDDEN_INPUTS = [
    'api/access-token.ts',
] as const;
const FORBIDDEN_SOURCES = [
    'SIGNING_KEY_MATERIAL',
    'fekPpDYfJoFZmvUBauTxHA',
    'hmacSigningKeyMaterial',
    'mintAccessToken',
] as const;

function clientGraphHits(
    input: string,
    src: string,
): string[] {
    const hits: string[] = [];
    for (const fragment of FORBIDDEN_INPUTS) {
        if (input.includes(fragment)) {
            hits.push(input + ':' + fragment);
        }
    }
    for (const fragment of FORBIDDEN_SOURCES) {
        if (src.includes(fragment)) {
            hits.push(input + ':' + fragment);
        }
    }
    return hits;
}

test('build emits one ZIP from the server-core entry', () => {
    assert.match(
        BUILD_SCRIPT,
        /fusion-angle-\$\{SHA\}\.zip/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /fusion-ai-browser/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /fusion-angle-browser/,
    );
    assert.match(
        BUILD_LIB_SCRIPT,
        /web-app\/app\/server-core\.ts/,
    );
    assert.doesNotMatch(
        BUILD_LIB_SCRIPT,
        /web-app\/app\/core\.ts/,
    );
});

test('client-graph pin matches mint and deleted names',
() => {
    const input = 'api/access-token.ts';
    const src = readFileSync(input, 'utf8');
    assert.deepEqual(
        clientGraphHits(input, src),
        [
            'api/access-token.ts:api/access-token.ts',
            'api/access-token.ts:hmacSigningKeyMaterial',
            'api/access-token.ts:mintAccessToken',
        ],
    );
    assert.deepEqual(
        clientGraphHits(
            'sample/path.ts',
            'SIGNING_KEY_MATERIAL',
        ),
        [
            'sample/path.ts:SIGNING_KEY_MATERIAL',
        ],
    );
});

test(
    'client graph omits token mint and signing key',
    () => {
        const info = spawnSync('deno', [
            'info', '--frozen', '--json',
            'web-app/app/server-core.ts',
        ], {
            encoding: 'utf8',
            env: process.env,
        });
        assert.equal(info.status, 0, info.stderr);
        const graph = JSON.parse(info.stdout) as {
            roots: string[];
            modules: {
                specifier: string;
                dependencies?: {
                    code?: { specifier: string };
                }[];
            }[];
        };
        const bySpecifier = new Map(
            graph.modules.map((m) => [m.specifier, m]),
        );
        const seen = new Set<string>();
        const queue = [...graph.roots];
        while (queue.length > 0) {
            const at = queue.pop()!;
            if (seen.has(at)) continue;
            seen.add(at);
            const mod = bySpecifier.get(at);
            if (mod === undefined) continue;
            for (const dep of mod.dependencies ?? []) {
                if (dep.code === undefined) continue;
                queue.push(dep.code.specifier);
            }
        }
        const hits: string[] = [];
        for (const specifier of seen) {
            if (!specifier.startsWith('file://')) continue;
            const path = relative(
                process.cwd(),
                fileURLToPath(specifier),
            );
            hits.push(...clientGraphHits(
                path, readFileSync(path, 'utf8'),
            ));
        }
        assert.deepEqual(hits, []);
    },
);

test('build --no-zip help names crank', () => {
    assert.match(
        BUILD_SCRIPT,
        /the fusion-angle executable — for \.\/crank/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /for \.\/serve/,
    );
});
