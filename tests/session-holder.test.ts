import { assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
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

Deno.test('defaults to an anonymous-principal token', async () => {
    deleteSessionToken();
    await postSessionSeed();
    const p = principalFromToken(getSessionToken());
    assertStrictEquals(p.id, ANONYMOUS_ID);
});

Deno.test('returns the established token once set', () => {
    putSessionToken('header.body.sig');
    assertStrictEquals(getSessionToken(), 'header.body.sig');
    deleteSessionToken();
});

Deno.test('the anonymous seed is not org-scoped', async () => {
    deleteSessionToken();
    await postSessionSeed();
    assertStrictEquals(sessionIsOrganizationScoped(), false);
    deleteSessionToken();
});

Deno.test('a flat token (no org claim) is not org-scoped', async () => {
    putSessionToken(await devToken());
    assertStrictEquals(sessionIsOrganizationScoped(), false);
    deleteSessionToken();
});

Deno.test('an org-exchanged token is org-scoped', async () => {
    putSessionToken(await organizationToken());
    assertStrictEquals(sessionIsOrganizationScoped(), true);
    deleteSessionToken();
});

Deno.test('a token with reachable orgs has one', async () => {
    putSessionToken(await reachableToken());
    assertStrictEquals(sessionHasReachableOrganization(), true);
    deleteSessionToken();
});

Deno.test('a flat token (no orgs claim) has none', async () => {
    // devToken always carries organizations; empty orgs is
    // the no-reachability shape (reachableToken([],)).
    putSessionToken(await reachableToken('XXZruirZyAOoRpNxaDnpSA', []));
    assertStrictEquals(sessionHasReachableOrganization(), false);
    deleteSessionToken();
});

Deno.test('an empty reachable set has none', async () => {
    putSessionToken(await reachableToken('XXZruirZyAOoRpNxaDnpSA', []));
    assertStrictEquals(sessionHasReachableOrganization(), false);
    deleteSessionToken();
});

Deno.test('unseeded session predicates are false', () => {
    deleteSessionToken();
    assertStrictEquals(sessionIsOrganizationScoped(), false);
    assertStrictEquals(sessionHasReachableOrganization(), false);
});
