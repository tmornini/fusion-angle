import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_REGISTRY, pageAuthMode } from
    '../web-app/app/page-registry.ts';

test('PageEntry has no requiresSchema flag',
() => {
    for (const entry of Object.values(
        PAGE_REGISTRY,
    )) {
        assert.equal(
            'requiresSchema' in entry, false,
        );
    }
});

test('PAGE_REGISTRY has no snapshots page',
() => {
    assert.equal(
        'snapshots' in PAGE_REGISTRY, false,
    );
});

test('public pages are auth-exempt only', () => {
    const publicPages = Object.entries(
        PAGE_REGISTRY,
    ).filter(([, e]) => e.requiresAuth === false)
        .map(([k]) => k)
        .sort();
    assert.deepEqual(publicPages, [
        'api-documentation',
        'auth',
        'design-system',
        'landing',
        'not-found',
    ].sort());
});

test('sidebar has no Snapshots item', () => {
    const titles = Object.values(PAGE_REGISTRY)
        .filter((e) => e.inSidebarNav)
        .map((e) => e.title);
    assert.equal(
        titles.includes('Snapshots'), false,
    );
});

test('retired snapshots is a missing page', () => {
    assert.equal(
        pageAuthMode('snapshots'), 'missing',
    );
});

test('dashboard is gated and landing is public',
() => {
    assert.equal(pageAuthMode('dashboard'), 'gated');
    assert.equal(pageAuthMode('landing'), 'public');
});

test(
    'PAGE_REGISTRY is 29 HTML page files including '
    + 'the api-documentation index',
    () => {
        const keys = Object.keys(PAGE_REGISTRY);
        assert.equal(keys.length, 29);
        const files = new Set(
            Object.values(PAGE_REGISTRY).map(
                (e) =>
                    e.sourceDir + '/'
                    + e.sourceFile + '.html',
            ),
        );
        assert.equal(files.size, 29);
        assert.equal(
            files.has('api-documentation/index.html'),
            true,
        );
        assert.equal(
            files.has('index.html'),
            false,
        );
    },
);
