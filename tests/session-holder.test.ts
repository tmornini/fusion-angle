import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSessionToken,
    setSessionToken,
    clearSessionToken,
    ensureSessionToken,
} from '../web-app/app/adapters/init.ts';
import {
    principalFromToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';

test('defaults to an anonymous-principal token', async () => {
    clearSessionToken();
    await ensureSessionToken();
    const p = principalFromToken(getSessionToken());
    assert.equal(p.id, ANONYMOUS_ID);
});

test('returns the established token once set', () => {
    setSessionToken('header.body.sig');
    assert.equal(getSessionToken(), 'header.body.sig');
    clearSessionToken();
});
