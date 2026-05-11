import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// url-params.ts -> location.ts reads window.location.search.
// Stub a minimal window so getUrlParam/getUrlParams work.
function setSearch(search: string): void {
    // @ts-expect-error - Node global stub
    globalThis.window = { location: { search } };
}
setSearch('');

const {
    getUrlParam,
    getUrlParams,
    buildQueryString,
} = await import(
    '../web-app/app/adapters/url-params.ts'
);

// --- buildQueryString (pure) ---

test('buildQueryString encodes a single param', () => {
    assert.equal(
        buildQueryString({ id: 'abc' }),
        'id=abc',
    );
});

test('buildQueryString joins multiple params', () => {
    assert.equal(
        buildQueryString({ a: '1', b: '2' }),
        'a=1&b=2',
    );
});

test('buildQueryString returns empty for no params', () => {
    assert.equal(buildQueryString({}), '');
});

test('buildQueryString percent-encodes values', () => {
    assert.equal(
        buildQueryString({ q: 'a b&c' }),
        'q=a+b%26c',
    );
});

// --- getUrlParam (reads stubbed window) ---

test('getUrlParam returns the named value', () => {
    setSearch('?id=42&tab=details');
    assert.equal(getUrlParam('id'), '42');
    assert.equal(getUrlParam('tab'), 'details');
});

test('getUrlParam returns null for absent param', () => {
    setSearch('?id=42');
    assert.equal(getUrlParam('missing'), null);
});

test('getUrlParam returns null for empty search', () => {
    setSearch('');
    assert.equal(getUrlParam('id'), null);
});

test('getUrlParam decodes percent-encoded values', () => {
    setSearch('?q=a%20b');
    assert.equal(getUrlParam('q'), 'a b');
});

// --- getUrlParams (reads stubbed window) ---

test('getUrlParams returns all params as a record', () => {
    setSearch('?id=42&tab=details');
    assert.deepEqual(getUrlParams(), {
        id: '42',
        tab: 'details',
    });
});

test('getUrlParams returns empty record for empty search', () => {
    setSearch('');
    assert.deepEqual(getUrlParams(), {});
});

test('getUrlParams last value wins on repeated key', () => {
    setSearch('?id=1&id=2');
    assert.deepEqual(getUrlParams(), { id: '2' });
});
