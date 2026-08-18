import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes, route } from '../api/routes.ts';
import { offeredVerbs, uriOf } from
    '../api/route-surface.ts';

function routeNamed(pattern: string) {
    return routes.find((row) =>
        row.segments.join('/') === pattern);
}

test('identities collection offers GET and POST',
() => {
    const row = routeNamed('identities/');
    assert.ok(row);
    const verbs = offeredVerbs(row);
    assert.ok(verbs.includes('get'));
    assert.ok(verbs.includes('post'));
});

test('empty handlers offer nothing', () => {
    assert.deepEqual(
        offeredVerbs(route('identities/', {})),
        [],
    );
});

test('a fake sixth function key throws', () => {
    const row = {
        ...route('identities/', {}),
        head: async () => ({}),
    };
    assert.throws(
        () => offeredVerbs(row),
        /sixth verb without a sixth column: head/,
    );
});

test('uriOf keeps the collection slash', () => {
    assert.equal(
        uriOf(route('identities/', {
            get: async () => ({}),
        })),
        '/identities/',
    );
});

test('uriOf names an item with its param', () => {
    assert.equal(
        uriOf(route('identities/:id', {
            get: async () => ({}),
        })),
        '/identities/:id',
    );
});
