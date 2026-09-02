import { assertMatch, assertStrictEquals } from '@std/assert';
import { fromFileUrl } from '@std/path';

const src = Deno.readTextFileSync(
    fromFileUrl(
        new URL(
            '../web-app/app/root-redirect.ts',
            import.meta.url,
        ),
    ),
);

Deno.test('apex hops via the destination helper', () => {
    assertMatch(src, /resolveApexLocation/);
    assertMatch(src, /probeRefreshSession/);
    assertStrictEquals(
        src.includes('auth/index.html'),
        false,
    );
    assertStrictEquals(
        src.includes('snapshots/index.html'),
        false,
    );
    assertStrictEquals(
        src.includes('getSchemaPresent'),
        false,
    );
});
