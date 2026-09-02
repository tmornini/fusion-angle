import { assertStrictEquals } from '@std/assert';
import {
    makeFieldKeyValidator,
} from '../web-app/app/field-key-validator.ts';

Deno.test('makeFieldKeyValidator accepts a known field key', () => {
    const isKey = makeFieldKeyValidator(
        new Set(['name', 'email']));
    assertStrictEquals(isKey('name'), true);
    assertStrictEquals(isKey('email'), true);
});

Deno.test('makeFieldKeyValidator rejects unknown keys and null',
    () => {
        const isKey = makeFieldKeyValidator(new Set(['name']));
        assertStrictEquals(isKey('phone'), false);
        assertStrictEquals(isKey(null), false);
    });
