import { assertEquals, assertStrictEquals } from '@std/assert';

// url-params.ts -> location.ts reads window.location.search.
// Stub a minimal window so getUrlParam/getUrlParams work.
function setSearch(search: string): void {
    // @ts-expect-error — Node global stub
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

Deno.test('buildQueryString encodes a single param', () => {
    assertStrictEquals(
        buildQueryString({ id: 'abc' }),
        'id=abc',
    );
});

Deno.test('buildQueryString joins multiple params', () => {
    assertStrictEquals(
        buildQueryString({ a: '1'
            , b: '2' }),
        'a=1&b=2',
    );
});

Deno.test('buildQueryString returns empty for no params', () => {
    assertStrictEquals(buildQueryString({}), '');
});

Deno.test('buildQueryString percent-encodes values', () => {
    assertStrictEquals(
        buildQueryString({ q: 'a b&c' }),
        'q=a+b%26c',
    );
});

// --- getUrlParam (reads stubbed window) ---

Deno.test('getUrlParam returns the named value', () => {
    setSearch('?id=42&tab=details');
    assertStrictEquals(getUrlParam('id'), '42');
    assertStrictEquals(getUrlParam('tab'), 'details');
});

Deno.test('getUrlParam returns null for absent param', () => {
    setSearch('?id=42');
    assertStrictEquals(getUrlParam('missing'), null);
});

Deno.test('getUrlParam returns null for empty search', () => {
    setSearch('');
    assertStrictEquals(getUrlParam('id'), null);
});

Deno.test('getUrlParam decodes percent-encoded values', () => {
    setSearch('?q=a%20b');
    assertStrictEquals(getUrlParam('q'), 'a b');
});

// --- getUrlParams (reads stubbed window) ---

Deno.test('getUrlParams returns all params as a record', () => {
    setSearch('?id=42&tab=details');
    assertEquals(getUrlParams(), {
        id: '42',
        tab: 'details',
    });
});

Deno.test('getUrlParams returns empty record for empty search', () => {
    setSearch('');
    assertEquals(getUrlParams(), {});
});

Deno.test('getUrlParams last value wins on repeated key', () => {
    setSearch('?id=1&id=2');
    assertEquals(getUrlParams(), { id: '2' });
});
