import { assertEquals, assertThrows } from '@std/assert';
import {
    validateIdentityTokenEntity,
} from '../api/validators.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const goodRow = {
    jti: generateIdentifier(),
    identity_id: 'XXZruirZyAOoRpNxaDnpSA',
    action: 'issued',
    chain_id: generateIdentifier(),
    at: '2026-06-03T00:00:00.000000Z',
};

Deno.test('validates an issued token event', () => {
    assertEquals(
        validateIdentityTokenEntity(goodRow), goodRow);
});

Deno.test('rejects the retired parent_jti key', () => {
    assertThrows(() =>
        validateIdentityTokenEntity({
            ...goodRow, parent_jti: generateIdentifier(),
        }));
});

Deno.test('rejects an unknown action', () => {
    assertThrows(() =>
        validateIdentityTokenEntity({
            ...goodRow, action: 'minted',
        }));
});

Deno.test('rejects an extra key', () => {
    assertThrows(() =>
        validateIdentityTokenEntity({
            ...goodRow, extra: 1,
        }));
});

Deno.test('rejects an unparseable timestamp', () => {
    assertThrows(() =>
        validateIdentityTokenEntity({
            ...goodRow, at: 'not-a-date',
        }));
});
