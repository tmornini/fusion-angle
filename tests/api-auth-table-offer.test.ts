import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routes } from '../api/routes.ts';

function routeNamed(pattern: string) {
    return routes.find((row) =>
        row.segments.join('/') === pattern);
}

test('authentication/token offers POST', () => {
    const row = routeNamed('authentication/token');
    assert.ok(row);
    assert.equal(typeof row.post, 'function');
    assert.equal(row.get, undefined);
    assert.equal(row.put, undefined);
});

test('authentication/authorize offers POST',
() => {
    const row = routeNamed(
        'authentication/authorize',
    );
    assert.ok(row);
    assert.equal(typeof row.post, 'function');
});
