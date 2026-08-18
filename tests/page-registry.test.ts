import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_REGISTRY } from
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
