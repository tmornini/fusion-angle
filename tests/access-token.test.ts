import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mintAccessToken,
    verifyAccessToken,
    principalFromToken,
    ANONYMOUS_PRINCIPAL,
} from '../api/access-token.ts';

function token(over: Partial<{
    sub: string; iat: number; ttlSeconds: number;
}> = {}): string {
    return mintAccessToken({
        sub: over.sub ?? 'current',
        roles: [],
        name: 'Demo',
        iat: over.iat ?? 1_700_000_000,
        ttlSeconds: over.ttlSeconds ?? 10_000_000_000,
        jti: 'jti-test',
    });
}

test('verifies a well-formed unexpired token', () => {
    const r = verifyAccessToken(token(), 1_700_000_100);
    assert.equal(r.valid, true);
    assert.equal(r.valid && r.claims.sub, 'current');
});

test('rejects an expired token', () => {
    const t = token({ iat: 1_600_000_000, ttlSeconds: 1 });
    const r = verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a not-yet-valid token', () => {
    const t = token({ iat: 4_000_000_000 });
    const r = verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a malformed token', () => {
    assert.equal(
        verifyAccessToken('a.b', 1_700_000_000).valid, false);
});

test('rejects a tampered signature', () => {
    const t = token();
    const bad = t.slice(0, t.lastIndexOf('.') + 1) + 'XXXX';
    assert.equal(
        verifyAccessToken(bad, 1_700_000_100).valid, false);
});

test('principalFromToken reads sub/roles/name', () => {
    const p = principalFromToken(token());
    assert.equal(p.id, 'current');
    assert.deepEqual(p.roles, []);
});

test('exposes a named anonymous principal', () => {
    assert.equal(ANONYMOUS_PRINCIPAL.id, 'anonymous');
});
