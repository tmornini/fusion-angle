import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSessionToken,
    setSessionToken,
    clearSessionToken,
    ensureSessionToken,
    sessionIsOrgScoped,
    sessionHasReachableOrg,
} from '../web-app/app/adapters/init.ts';
import {
    principalFromToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import {
    devToken,
    orgToken,
    reachableToken,
} from './token-fixtures.ts';

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

test('the anonymous seed is not org-scoped', async () => {
    clearSessionToken();
    await ensureSessionToken();
    assert.equal(sessionIsOrgScoped(), false);
    clearSessionToken();
});

test('a flat token (no org claim) is not org-scoped', async () => {
    setSessionToken(await devToken());
    assert.equal(sessionIsOrgScoped(), false);
    clearSessionToken();
});

test('an org-exchanged token is org-scoped', async () => {
    setSessionToken(await orgToken());
    assert.equal(sessionIsOrgScoped(), true);
    clearSessionToken();
});

test('a token with reachable orgs has one', async () => {
    setSessionToken(await reachableToken());
    assert.equal(sessionHasReachableOrg(), true);
    clearSessionToken();
});

test('a flat token (no orgs claim) has none', async () => {
    setSessionToken(await devToken());
    assert.equal(sessionHasReachableOrg(), false);
    clearSessionToken();
});

test('an empty reachable set has none', async () => {
    setSessionToken(await reachableToken('current', []));
    assert.equal(sessionHasReachableOrg(), false);
    clearSessionToken();
});
