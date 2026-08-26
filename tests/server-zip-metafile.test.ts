import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as esbuild from 'esbuild';

const BUILD_SCRIPT = readFileSync('build', 'utf8');

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
        /fusion-angle-server-\$\{SHA\}\.zip/,
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
        BUILD_SCRIPT,
        /web-app\/app\/server-core\.ts/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
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
    async () => {
        const result = await esbuild.build({
            entryPoints: [
                'web-app/app/server-core.ts',
            ],
            bundle: true,
            write: false,
            metafile: true,
            format: 'iife',
            target: 'es2024',
            absWorkingDir: process.cwd(),
        });
        const meta = result.metafile;
        assert.ok(meta !== undefined);
        const hits: string[] = [];
        for (const input of Object.keys(meta.inputs)) {
            const path = input.includes('?')
                ? input.slice(0, input.indexOf('?'))
                : input;
            const src = readFileSync(path, 'utf8');
            hits.push(...clientGraphHits(input, src));
        }
        assert.deepEqual(hits, []);
    },
);

test('build --no-zip help names crank', () => {
    assert.match(
        BUILD_SCRIPT,
        /server-core \+ server\.mjs — for \.\/crank/,
    );
    assert.doesNotMatch(
        BUILD_SCRIPT,
        /for \.\/serve/,
    );
});
