import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeState } from '../api/authorization-codes.ts';

const ev = (
    code: string, status: string,
    identity: string, client: string, at: string,
) => ({
    id: code + '@' + at, code, identity_id: identity,
    client_id: client, status, at,
});

const T1 = '2026-01-01T00:00:00.000000Z';
const T2 = '2026-02-01T00:00:00.000000Z';

test('codeState returns the latest status with the'
    + ' issuing identity and client', () => {
    const rows = [
        ev('abc', 'issued', 'u1', 'cli', T1),
        ev('abc', 'consumed', 'u1', 'cli', T2),
    ];
    assert.deepEqual(codeState(rows, 'abc'), {
        status: 'consumed', identityId: 'u1', clientId: 'cli',
    });
});

test('codeState is null for an unknown code', () => {
    const rows = [ev('abc', 'issued', 'u1', 'cli', T1)];
    assert.equal(codeState(rows, 'ghost'), null);
});

test('a same-instant consume beats an issue, either order',
() => {
    const issued = ev('abc', 'issued', 'u1', 'cli', T1);
    const consumed = ev('abc', 'consumed', 'u1', 'cli', T1);
    assert.equal(
        codeState([issued, consumed], 'abc')?.status,
        'consumed');
    assert.equal(
        codeState([consumed, issued], 'abc')?.status,
        'consumed');
});

test('identity and client come from the first event', () => {
    const rows = [
        ev('abc', 'issued', 'u1', 'cli', T1),
        // a later event naming a DIFFERENT (identity, client):
        // the reduce still reports the ISSUING pair.
        ev('abc', 'consumed', 'evil', 'other', T2),
    ];
    assert.deepEqual(codeState(rows, 'abc'), {
        status: 'consumed', identityId: 'u1', clientId: 'cli',
    });
});
