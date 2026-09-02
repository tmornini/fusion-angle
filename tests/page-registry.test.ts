import { assertEquals, assertStrictEquals } from '@std/assert';
import { PAGE_REGISTRY, pageAuthMode } from
    '../web-app/app/page-registry.ts';

Deno.test('PageEntry has no requiresSchema flag',
() => {
    for (const entry of Object.values(
        PAGE_REGISTRY,
    )) {
        assertStrictEquals(
            'requiresSchema' in entry, false,
        );
    }
});

Deno.test('PAGE_REGISTRY has no snapshots page',
() => {
    assertStrictEquals(
        'snapshots' in PAGE_REGISTRY, false,
    );
});

Deno.test('public pages are auth-exempt only', () => {
    const publicPages = Object.entries(
        PAGE_REGISTRY,
    ).filter(([, e]) => e.requiresAuth === false)
        .map(([k]) => k)
        .sort();
    assertEquals(publicPages, [
        'api-documentation',
        'auth',
        'design-system',
        'landing',
        'not-found',
    ].sort());
});

Deno.test('sidebar has no Snapshots item', () => {
    const titles = Object.values(PAGE_REGISTRY)
        .filter((e) => e.inSidebarNav)
        .map((e) => e.title);
    assertStrictEquals(
        titles.includes('Snapshots'), false,
    );
});

Deno.test('retired snapshots is a missing page', () => {
    assertStrictEquals(
        pageAuthMode('snapshots'), 'missing',
    );
});

Deno.test('dashboard is gated and landing is public',
() => {
    assertStrictEquals(pageAuthMode('dashboard'), 'gated');
    assertStrictEquals(pageAuthMode('landing'), 'public');
});

Deno.test(
    'PAGE_REGISTRY is 29 HTML page files including '
    + 'the api-documentation index',
    () => {
        const keys = Object.keys(PAGE_REGISTRY);
        assertStrictEquals(keys.length, 29);
        const files = new Set(
            Object.values(PAGE_REGISTRY).map(
                (e) =>
                    e.sourceDir + '/'
                    + e.sourceFile + '.html',
            ),
        );
        assertStrictEquals(files.size, 29);
        assertStrictEquals(
            files.has('api-documentation/index.html'),
            true,
        );
        assertStrictEquals(
            files.has('index.html'),
            false,
        );
    },
);
