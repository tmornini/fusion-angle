import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mintAccessToken,
    verifyAccessToken,
    principalFromToken,
    latestRevocationAt,
    revokedBeforeSeconds,
    ANONYMOUS_PRINCIPAL,
} from '../api/access-token.ts';
import { base64UrlEncode } from '../api/base64url.ts';

async function token(over: Partial<{
    sub: string; iat: number; ttlSeconds: number;
}> = {}): Promise<string> {
    return mintAccessToken({
        sub: over.sub ?? 'current',
        roles: [],
        name: 'Demo',
        iat: over.iat ?? 1_700_000_000,
        ttlSeconds: over.ttlSeconds ?? 10_000_000_000,
        jti: 'jti-test',
    });
}

test('verifies a well-formed unexpired token', async () => {
    const r = await verifyAccessToken(
        await token(), 1_700_000_100);
    assert.equal(r.valid, true);
    assert.equal(r.valid && r.claims.sub, 'current');
});

test('rejects an expired token', async () => {
    const t = await token({ iat: 1_600_000_000, ttlSeconds: 1 });
    const r = await verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a not-yet-valid token', async () => {
    const t = await token({ iat: 4_000_000_000 });
    const r = await verifyAccessToken(t, 1_700_000_000);
    assert.equal(r.valid, false);
});

test('rejects a malformed token', async () => {
    assert.equal(
        (await verifyAccessToken('a.b', 1_700_000_000)).valid,
        false);
});

test('rejects a tampered signature', async () => {
    const t = await token();
    const bad = t.slice(0, t.lastIndexOf('.') + 1) + 'XXXX';
    assert.equal(
        (await verifyAccessToken(bad, 1_700_000_100)).valid,
        false);
});

test('rejects a tampered body — the real MAC binds it',
async () => {
    const t = await token();
    const [head, , sig] = t.split('.');
    // Re-encode escalated claims but reuse the original
    // signature: a real HMAC over the original body no longer
    // matches the forged body, so verification fails on the
    // signature (a placeholder ignoring the body would pass).
    const forgedBody = base64UrlEncode(JSON.stringify({
        sub: 'attacker', roles: ['admin'], name: 'X',
        aud: 'fusion-ai-web', iat: 1_700_000_000,
        nbf: 1_700_000_000, exp: 9_999_999_999, jti: 'x',
    }));
    const forged = head + '.' + forgedBody + '.' + sig;
    const r = await verifyAccessToken(forged, 1_700_000_100);
    assert.equal(r.valid, false);
    assert.equal(!r.valid && r.reason, 'bad signature');
});

test('rejects a token minted for a different audience', async () => {
    const header = base64UrlEncode(JSON.stringify(
        { alg: 'HS256', typ: 'JWT', kid: 'dev-co-located' }));
    const claims = base64UrlEncode(JSON.stringify({
        sub: 'current', roles: [], name: 'Demo',
        aud: 'evil-site', iat: 1_700_000_000,
        nbf: 1_700_000_000, exp: 9_999_999_999,
        jti: 'x',
    }));
    const sig = base64UrlEncode('dev-co-located');
    const token = header + '.' + claims + '.' + sig;
    assert.equal(
        (await verifyAccessToken(token, 1_700_000_100)).valid,
        false);
});

test('principalFromToken reads sub/roles/name', async () => {
    const p = principalFromToken(await token());
    assert.equal(p.id, 'current');
    assert.deepEqual(p.roles, []);
});

test('exposes a named anonymous principal', () => {
    assert.equal(ANONYMOUS_PRINCIPAL.id, 'anonymous');
});

test('latestRevocationAt returns the most recent stamp', () => {
    const rows = [
        { identity_id: 'a', at: '2021-01-01T00:00:00.000Z' },
        { identity_id: 'a', at: '2023-06-01T00:00:00.000Z' },
        { identity_id: 'a', at: '2022-01-01T00:00:00.000Z' },
    ];
    assert.equal(
        latestRevocationAt(rows, 'a'),
        '2023-06-01T00:00:00.000Z',
    );
});

test('latestRevocationAt isolates identities; null when none', () => {
    const rows = [
        { identity_id: 'a', at: '2023-06-01T00:00:00.000Z' },
    ];
    assert.equal(latestRevocationAt(rows, 'b'), null);
});

test('revokedBeforeSeconds converts the latest stamp', () => {
    const rows = [
        { identity_id: 'a', at: '2021-01-01T00:00:00.000Z' },
        { identity_id: 'a', at: '2023-06-01T00:00:00.000Z' },
    ];
    assert.equal(
        revokedBeforeSeconds(rows, 'a'),
        Math.floor(
            Date.parse('2023-06-01T00:00:00.000Z') / 1000),
    );
});
