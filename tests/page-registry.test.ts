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

Deno.test('retired workbox-detail is a missing page', () => {
    assertStrictEquals(
        pageAuthMode('workbox-detail'), 'missing',
    );
});

Deno.test('dashboard is gated and landing is public',
() => {
    assertStrictEquals(pageAuthMode('dashboard'), 'gated');
    assertStrictEquals(pageAuthMode('landing'), 'public');
});

Deno.test(
    'PAGE_REGISTRY is 27 HTML page files including '
    + 'the api-documentation index',
    () => {
        const keys = Object.keys(PAGE_REGISTRY);
        assertStrictEquals(keys.length, 27);
        const files = new Set(
            Object.values(PAGE_REGISTRY).map(
                (e) =>
                    e.sourceDir + '/'
                    + e.sourceFile + '.html',
            ),
        );
        assertStrictEquals(files.size, 27);
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

const ORGANIZATION_SCOPED = [
    'billing', 'dashboard', 'flow-detail', 'flow-stats',
    'flows', 'idea-convert', 'idea-create', 'idea-detail',
    'ideas', 'identities', 'identity-detail',
    'member-detail', 'members', 'organization',
    'project-detail', 'projects', 'record-create',
    'records', 'workbox',
];

Deno.test('organization-scoped pages are the fenced ones',
() => {
    const scoped = Object.entries(PAGE_REGISTRY)
        .filter(([, e]) => e.organizationScoped)
        .map(([k]) => k)
        .sort();
    assertEquals(scoped, ORGANIZATION_SCOPED);
});

Deno.test('every organization-scoped page is gated', () => {
    for (const [key, entry] of Object.entries(PAGE_REGISTRY)) {
        if (entry.organizationScoped) {
            assertStrictEquals(pageAuthMode(key), 'gated', key);
        }
    }
});
