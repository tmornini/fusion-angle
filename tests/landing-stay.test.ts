import { assertMatch, assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

const src = Deno.readTextFileSync(
    fromFileUrl(
        new URL(
            '../web-app/landing/index.ts',
            import.meta.url,
        ),
    ),
);

Deno.test('landing does not shove to dashboard', () => {
    assertStrictEquals(
        src.includes('AUTO_REDIRECT_MS'),
        false,
    );
    assertStrictEquals(
        src.includes('dashboard/index.html'),
        false,
    );
    assertMatch(src, /auth\/index\.html/);
});
