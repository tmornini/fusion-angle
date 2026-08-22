import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    verifyClientAssertion,
} from '../api/client-assertion.ts';
import type {
    ClientRegistrationEntity,
} from '../api/types.ts';
import {
    makeAssertionSigner,
} from './client-assertion-fixtures.ts';

const NOW = 1_700_000_000;
const CLIENT_ID = 'uYaHKbNeVUcsFjuooOjMew';
const AUDIENCE = 'fusion-angle';

function clientWith(
    jwks: string,
): ClientRegistrationEntity {
    return {
        id: CLIENT_ID,
        grant_types: 'client_credentials',
        redirect_uris: '',
        jwks,
        aud: AUDIENCE,
        status: 'active',
    };
}

function freshClaims(): Record<string, unknown> {
    return {
        iss: CLIENT_ID,
        sub: CLIENT_ID,
        aud: AUDIENCE,
        exp: NOW + 300,
        iat: NOW,
        jti: 'assert-1',
    };
}

for (const alg of ['RS256', 'ES256'] as const) {
    test(`a ${alg}-signed assertion verifies`, async () => {
        const signer = await makeAssertionSigner(alg);
        const assertion = await signer.sign(freshClaims());
        const verdict = await verifyClientAssertion(
            assertion, clientWith(signer.jwks), NOW,
        );
        assert.deepEqual(verdict, {
            valid: true, jti: 'assert-1', exp: NOW + 300,
        });
    });

    test(`a ${alg} signature from an unregistered key`
        + ' is refused', async () => {
        const signer = await makeAssertionSigner(alg);
        const impostor = await makeAssertionSigner(alg);
        const assertion =
            await impostor.sign(freshClaims());
        const verdict = await verifyClientAssertion(
            assertion, clientWith(signer.jwks), NOW,
        );
        assert.equal(verdict.valid, false);
    });
}

test('a tampered payload fails verification', async () => {
    const signer = await makeAssertionSigner('RS256');
    const assertion = await signer.sign(freshClaims());
    const [h, , s] = assertion.split('.');
    const forged = await signer.sign({
        ...freshClaims(), jti: 'assert-2',
    });
    const [, forgedPayload] = forged.split('.');
    const spliced = h + '.' + forgedPayload + '.' + s;
    const verdict = await verifyClientAssertion(
        spliced, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
});

test('symmetric and none algorithms are refused',
async () => {
    const signer = await makeAssertionSigner('RS256');
    const client = clientWith(signer.jwks);
    for (const alg of ['HS256', 'none']) {
        const assertion = await signer.sign(
            freshClaims(), { alg },
        );
        const verdict = await verifyClientAssertion(
            assertion, client, NOW,
        );
        assert.equal(verdict.valid, false, alg);
        assert.match(
            (verdict as { reason: string }).reason,
            /unsupported assertion alg/);
    }
});

test('an expired assertion is refused', async () => {
    const signer = await makeAssertionSigner('RS256');
    const assertion = await signer.sign({
        ...freshClaims(), exp: NOW - 1,
    });
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
    assert.match(
        (verdict as { reason: string }).reason,
        /expired/);
});

test('a missing exp is refused', async () => {
    const signer = await makeAssertionSigner('RS256');
    const { exp: _exp, ...rest } = freshClaims();
    const assertion = await signer.sign(rest);
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
});

test('a missing jti is refused', async () => {
    const signer = await makeAssertionSigner('RS256');
    const { jti: _jti, ...rest } = freshClaims();
    const assertion = await signer.sign(rest);
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
});

test('a malformed jti is refused', async () => {
    const signer = await makeAssertionSigner('RS256');
    const assertion = await signer.sign({
        ...freshClaims(), jti: 'bad jti!',
    });
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
});

test('a future nbf is refused', async () => {
    const signer = await makeAssertionSigner('RS256');
    const assertion = await signer.sign({
        ...freshClaims(), nbf: NOW + 60,
    });
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
});

test('iss, sub, and aud must match the client',
async () => {
    const signer = await makeAssertionSigner('RS256');
    const client = clientWith(signer.jwks);
    for (const wrong of [
        { iss: 'uTGrEpVpODbNhDhDVdWeqQ' },
        { sub: 'uTGrEpVpODbNhDhDVdWeqQ' },
        { aud: 'another-origin' },
    ]) {
        const assertion = await signer.sign({
            ...freshClaims(), ...wrong,
        });
        const verdict = await verifyClientAssertion(
            assertion, client, NOW,
        );
        assert.equal(
            verdict.valid, false,
            JSON.stringify(wrong));
    }
});

test('a kid header selects its registered key',
async () => {
    const signer =
        await makeAssertionSigner('RS256', 'key-1');
    const assertion = await signer.sign(freshClaims());
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.deepEqual(verdict, {
        valid: true, jti: 'assert-1', exp: NOW + 300,
    });
});

test('an unknown kid matches no registered key',
async () => {
    const signer =
        await makeAssertionSigner('RS256', 'key-1');
    const assertion = await signer.sign(
        freshClaims(), { kid: 'key-9' },
    );
    const verdict = await verifyClientAssertion(
        assertion, clientWith(signer.jwks), NOW,
    );
    assert.equal(verdict.valid, false);
    assert.match(
        (verdict as { reason: string }).reason,
        /no registered key/);
});

test('an empty or malformed JWKS verifies nothing',
async () => {
    const signer = await makeAssertionSigner('RS256');
    const assertion = await signer.sign(freshClaims());
    for (const jwks of ['{"keys":[]}', 'not json', '{}']) {
        const verdict = await verifyClientAssertion(
            assertion, clientWith(jwks), NOW,
        );
        assert.equal(verdict.valid, false, jwks);
    }
});

test('structural garbage is refused, not thrown',
async () => {
    const signer = await makeAssertionSigner('RS256');
    const client = clientWith(signer.jwks);
    for (const garbage of [
        'not-a-jwt',
        'a.b',
        'a.b.c.d',
        '!!!.???.###',
        'a.b.c',
    ]) {
        const verdict = await verifyClientAssertion(
            garbage, client, NOW,
        );
        assert.equal(verdict.valid, false, garbage);
    }
});
