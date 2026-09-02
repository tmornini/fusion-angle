import { assertEquals, assertStrictEquals } from '@std/assert';
import { STATUS_DOCUMENTS } from
    '../api/http-status-documents.ts';

Deno.test('401 is the one invalid_token shape', () => {
    const row = STATUS_DOCUMENTS.find((d) => d.code === 401);
    assertEquals(row?.body, { error: 'invalid_token' });
});

Deno.test('codes are unique and sorted', () => {
    const codes = STATUS_DOCUMENTS.map((d) => d.code);
    assertEquals(codes, [...codes].sort((a, b) => a - b));
    assertStrictEquals(new Set(codes).size, codes.length);
});
