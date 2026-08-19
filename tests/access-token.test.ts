import './hmac-test-key.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
    verifyAccessToken,
    latestRevocationAt,
    revokedThroughSeconds,
} from '../api/access-token.ts';
import {
    principalFromToken,
    principalFromClaims,
    decodeAccessToken,
} from '../shared/access-token-decode.ts';
import { base64UrlEncode } from '../shared/base64url.ts';

async function token(over: Partial<{
    sub: string; iat: number; ttlSeconds: number;
    organization: string; organizations: readonly string[];
}> = {}): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: over.sub ?? 'current',
        roles: [],
        name: 'Demo',
        iat: over.iat ?? 1_700_000_000,
        ttlSeconds: over.ttlSeconds ?? 10_000_000_000,
        jti: 'jti-test',
        ...(over.organization ? { organization: over.organization } : {}),
        ...(over.organizations ? { organizations: over.organizations } : {}),
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

test('decodeAccessToken does not verify the signature',
async () => {
    const t = await token();
    const cut = t.lastIndexOf('.') + 1;
    const unsigned = t.slice(0, cut) + 'XXXX';
    const claims = decodeAccessToken(unsigned);
    assert.equal(claims.sub, 'current');
    const r = await verifyAccessToken(
        unsigned, 1_700_000_100);
    assert.equal(r.valid, false);
    assert.equal(!r.valid && r.reason, 'bad signature');
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
        aud: 'fusion-angle', iat: 1_700_000_000,
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

test('a real-signed token for a foreign audience is rejected'
    + ' at the audience gate', async () => {
    const t = await mintAccessToken({
        sub: 'current', roles: [], name: 'Demo',
        iat: 1_700_000_000, ttlSeconds: 10_000_000_000,
        jti: 'jti-test', aud: 'evil-site',
    });
    const r = await verifyAccessToken(t, 1_700_000_100);
    assert.equal(r.valid, false);
    assert.equal(!r.valid && r.reason, 'wrong audience');
});

test('principalFromToken reads sub/roles/name', async () => {
    const p = principalFromToken(await token());
    assert.equal(p.id, 'current');
    assert.deepEqual(p.roles, []);
});

test('mints and verifies an org-scoped token', async () => {
    const r = await verifyAccessToken(
        await token({ organization: '7' }), 1_700_000_100);
    assert.equal(r.valid, true);
    assert.equal(r.valid && r.claims.organization, '7');
});

test('a flat token carries no org claim', async () => {
    const r = await verifyAccessToken(
        await token(), 1_700_000_100);
    assert.equal(r.valid && r.claims.organization, undefined);
});

test('principalFromToken reads the org claim', async () => {
    const p = principalFromToken(await token({ organization: '7' }));
    assert.equal(p.organization, '7');
});

test('principalFromToken leaves org undefined when absent',
async () => {
    const p = principalFromToken(await token());
    assert.equal(p.organization, undefined);
});

test('decodeAccessToken rejects a non-string org claim', () => {
    const body = base64UrlEncode(JSON.stringify({
        sub: 'current', roles: [], name: 'Demo',
        aud: 'fusion-angle', organization: 7, iat: 1_700_000_000,
        nbf: 1_700_000_000, exp: 9_999_999_999, jti: 'x',
    }));
    assert.throws(
        () => decodeAccessToken('h.' + body + '.s'),
        /bad claim shape/,
    );
});

test('mints and verifies an orgs-list token', async () => {
    const r = await verifyAccessToken(
        await token({ organizations: ['1', '7'] }), 1_700_000_100);
    assert.equal(r.valid, true);
    assert.deepEqual(r.valid && r.claims.organizations, ['1', '7']);
});

test('principalFromToken reads the orgs list', async () => {
    const p = principalFromToken(
        await token({ organizations: ['1', '7'] }));
    assert.deepEqual(p.organizations, ['1', '7']);
});

test('a flat token carries no orgs list', async () => {
    const p = principalFromToken(await token());
    assert.equal(p.organizations, undefined);
});

test('principalFromClaims matches principalFromToken on the'
    + ' same token', async () => {
    const variants = [
        await token(),
        await token({ organization: '7' }),
        await token({ organizations: ['1', '7'] }),
        await token({ organization: '7', organizations: ['1', '7'] }),
    ];
    for (const t of variants) {
        const r = await verifyAccessToken(t, 1_700_000_100);
        assert.equal(r.valid, true);
        assert.deepEqual(
            r.valid && principalFromClaims(r.claims),
            principalFromToken(t),
        );
    }
});

test('decodeAccessToken rejects a non-array orgs claim',
() => {
    const body = base64UrlEncode(JSON.stringify({
        sub: 'current', roles: [], name: 'Demo',
        aud: 'fusion-angle', organizations: 'nope',
        iat: 1_700_000_000, nbf: 1_700_000_000,
        exp: 9_999_999_999, jti: 'x',
    }));
    assert.throws(
        () => decodeAccessToken('h.' + body + '.s'),
        /bad claim shape/,
    );
});

test('decodeAccessToken rejects non-string orgs elements',
() => {
    const body = base64UrlEncode(JSON.stringify({
        sub: 'current', roles: [], name: 'Demo',
        aud: 'fusion-angle', organizations: ['1', 7],
        iat: 1_700_000_000, nbf: 1_700_000_000,
        exp: 9_999_999_999, jti: 'x',
    }));
    assert.throws(
        () => decodeAccessToken('h.' + body + '.s'),
        /bad claim shape/,
    );
});

test('decodeAccessToken rejects non-string roles elements',
() => {
    const body = base64UrlEncode(JSON.stringify({
        sub: 'current', roles: ['admin', 7], name: 'Demo',
        aud: 'fusion-angle', iat: 1_700_000_000,
        nbf: 1_700_000_000, exp: 9_999_999_999, jti: 'x',
    }));
    assert.throws(
        () => decodeAccessToken('h.' + body + '.s'),
        /bad claim shape/,
    );
});

test('latestRevocationAt returns the most recent stamp', () => {
    const rows = [
        { identity_id: 'a', at: '2021-01-01T00:00:00.000000Z' },
        { identity_id: 'a', at: '2023-06-01T00:00:00.000000Z' },
        { identity_id: 'a', at: '2022-01-01T00:00:00.000000Z' },
    ];
    assert.equal(
        latestRevocationAt(rows, 'a'),
        '2023-06-01T00:00:00.000000Z',
    );
});

test('latestRevocationAt isolates identities; null when none', () => {
    const rows = [
        { identity_id: 'a', at: '2023-06-01T00:00:00.000000Z' },
    ];
    assert.equal(latestRevocationAt(rows, 'b'), null);
});

test('revokedThroughSeconds converts the latest stamp', () => {
    const rows = [
        { identity_id: 'a', at: '2021-01-01T00:00:00.000000Z' },
        { identity_id: 'a', at: '2023-06-01T00:00:00.000000Z' },
    ];
    assert.equal(
        revokedThroughSeconds(rows, 'a'),
        Math.floor(
            Date.parse('2023-06-01T00:00:00.000000Z') / 1000),
    );
});
