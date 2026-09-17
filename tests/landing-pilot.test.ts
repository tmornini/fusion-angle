import { assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

function readAdjacent(rel: string): string {
    return Deno.readTextFileSync(
        fromFileUrl(new URL(rel, import.meta.url)),
    );
}

const haystack = [
    readAdjacent('../web-app/landing/index.ts'),
    readAdjacent('../web-app/landing/index.html'),
    readAdjacent(
        '../web-app/app/components-layout.html',
    ),
    readAdjacent('../web-app/auth/index.html'),
].join('\n');

const RETIRED_CLAIMS = [
    'Start Free Trial',
    'Watch Demo',
    'Trusted by',
    'TechCorp',
    'SOC 2',
    'HIPAA',
    'thousands of teams',
    'Human-Intelligence',
] as const;

Deno.test('no invented claim survives the landing',
() => {
    for (const claim of RETIRED_CLAIMS) {
        assertStrictEquals(
            haystack.includes(claim),
            false,
            claim + ' still appears',
        );
    }
});
