import {
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { fromFileUrl, relative } from '@std/path';

const BUILD_SCRIPT = Deno.readTextFileSync('build');
const BUILD_LIB_SCRIPT = Deno.readTextFileSync('build-lib');

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

Deno.test('build emits one ZIP from the server-core entry', () => {
    assertMatch(
        BUILD_SCRIPT,
        /fusion-angle-\$\{SHA\}\.zip/,
    );
    assertNotMatch(
        BUILD_SCRIPT,
        /fusion-ai-browser/,
    );
    assertNotMatch(
        BUILD_SCRIPT,
        /fusion-angle-browser/,
    );
    assertMatch(
        BUILD_LIB_SCRIPT,
        /web-app\/app\/server-core\.ts/,
    );
    assertNotMatch(
        BUILD_LIB_SCRIPT,
        /web-app\/app\/core\.ts/,
    );
});

Deno.test('client-graph pin matches mint and deleted names',
() => {
    const input = 'api/access-token.ts';
    const src = Deno.readTextFileSync(input);
    assertEquals(
        clientGraphHits(input, src),
        [
            'api/access-token.ts:api/access-token.ts',
            'api/access-token.ts:hmacSigningKeyMaterial',
            'api/access-token.ts:mintAccessToken',
        ],
    );
    assertEquals(
        clientGraphHits(
            'sample/path.ts',
            'SIGNING_KEY_MATERIAL',
        ),
        [
            'sample/path.ts:SIGNING_KEY_MATERIAL',
        ],
    );
});

Deno.test(
    'client graph omits token mint and signing key',
    () => {
        // No env override: Deno.Command already inherits
        // the full ambient environment when env is omitted,
        // same as Node's own spawnSync default.
        const info = new Deno.Command('deno', {
            args: [
                'info', '--frozen', '--json',
                'web-app/app/server-core.ts',
            ],
        }).outputSync();
        const decoder = new TextDecoder();
        assertStrictEquals(
            info.code, 0, decoder.decode(info.stderr),
        );
        const graph = JSON.parse(
            decoder.decode(info.stdout),
        ) as {
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
                Deno.cwd(),
                fromFileUrl(specifier),
            );
            hits.push(...clientGraphHits(
                path, Deno.readTextFileSync(path),
            ));
        }
        assertEquals(hits, []);
    },
);

Deno.test('build --no-zip help names crank', () => {
    assertMatch(
        BUILD_SCRIPT,
        /the fusion-angle executable — for \.\/crank/,
    );
    assertNotMatch(
        BUILD_SCRIPT,
        /for \.\/serve/,
    );
});
