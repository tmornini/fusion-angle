import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    getSessionToken,
    putSessionToken,
    deleteSessionToken,
    postSessionSeed,
    sessionIsOrganizationScoped,
    sessionHasReachableOrganization,
} from '../web-app/app/adapters/init.ts';
import {
    principalFromToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import {
    devToken,
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';

test('defaults to an anonymous-principal token', async () => {
    deleteSessionToken();
    await postSessionSeed();
    const p = principalFromToken(getSessionToken());
    assert.equal(p.id, ANONYMOUS_ID);
});

test('returns the established token once set', () => {
    putSessionToken('header.body.sig');
    assert.equal(getSessionToken(), 'header.body.sig');
    deleteSessionToken();
});

test('the anonymous seed is not org-scoped', async () => {
    deleteSessionToken();
    await postSessionSeed();
    assert.equal(sessionIsOrganizationScoped(), false);
    deleteSessionToken();
});

test('a flat token (no org claim) is not org-scoped', async () => {
    putSessionToken(await devToken());
    assert.equal(sessionIsOrganizationScoped(), false);
    deleteSessionToken();
});

test('an org-exchanged token is org-scoped', async () => {
    putSessionToken(await organizationToken());
    assert.equal(sessionIsOrganizationScoped(), true);
    deleteSessionToken();
});

test('a token with reachable orgs has one', async () => {
    putSessionToken(await reachableToken());
    assert.equal(sessionHasReachableOrganization(), true);
    deleteSessionToken();
});

test('a flat token (no orgs claim) has none', async () => {
    // devToken always carries organizations; empty orgs is
    // the no-reachability shape (reachableToken([],)).
    putSessionToken(await reachableToken('current', []));
    assert.equal(sessionHasReachableOrganization(), false);
    deleteSessionToken();
});

test('an empty reachable set has none', async () => {
    putSessionToken(await reachableToken('current', []));
    assert.equal(sessionHasReachableOrganization(), false);
    deleteSessionToken();
});

test('unseeded session predicates are false', () => {
    deleteSessionToken();
    assert.equal(sessionIsOrganizationScoped(), false);
    assert.equal(sessionHasReachableOrganization(), false);
});
