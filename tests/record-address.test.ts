import { assertStrictEquals } from '@std/assert';
import { recordAddress } from
    '../web-app/app/record-address.ts';

const PAGE = 'https://example.test/records/index.html';

Deno.test('naming a record keeps the other parameters', () => {
    assertStrictEquals(
        recordAddress(PAGE + '?organization=o-1', 'r-1'),
        '/records/index.html?organization=o-1&id=r-1',
    );
});

Deno.test('naming another record drops the linked instance', () => {
    assertStrictEquals(
        recordAddress(PAGE + '?id=r-1&instance=i-1', 'r-2'),
        '/records/index.html?id=r-2',
    );
});
