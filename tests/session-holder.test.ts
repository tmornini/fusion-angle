import { assertStrictEquals } from '@std/assert';
import './hmac-test-key.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { postSessionSeed } from './client-init.ts';
import { putClient } from '../web-app/app/client.ts';
import { inPageClient } from './in-page-facade.ts';
import {
    principalFromToken,
    ANONYMOUS_ID,
} from '../api/access-token.ts';
import {
    devToken,
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';

// postSessionSeed seeds the app's one client.
const client = inPageClient(memoryDbAdapter());
putClient(client);

Deno.test('defaults to an anonymous-principal token', async () => {
    client.deleteSessionToken();
    await postSessionSeed();
    const p = principalFromToken(client.getSessionToken());
    assertStrictEquals(p.id, ANONYMOUS_ID);
});

Deno.test('returns the established token once set', () => {
    client.putSessionToken('header.body.sig');
    assertStrictEquals(client.getSessionToken(), 'header.body.sig');
    client.deleteSessionToken();
});

Deno.test('the anonymous seed is not org-scoped', async () => {
    client.deleteSessionToken();
    await postSessionSeed();
    assertStrictEquals(client.sessionIsOrganizationScoped(), false);
    client.deleteSessionToken();
});

Deno.test('a flat token (no org claim) is not org-scoped', async () => {
    client.putSessionToken(await devToken());
    assertStrictEquals(client.sessionIsOrganizationScoped(), false);
    client.deleteSessionToken();
});

Deno.test('an org-exchanged token is org-scoped', async () => {
    client.putSessionToken(await organizationToken());
    assertStrictEquals(client.sessionIsOrganizationScoped(), true);
    client.deleteSessionToken();
});

Deno.test('a token with reachable orgs has one', async () => {
    client.putSessionToken(await reachableToken());
    assertStrictEquals(client.sessionHasReachableOrganization(), true);
    client.deleteSessionToken();
});

Deno.test('a flat token (no orgs claim) has none', async () => {
    // devToken always carries organizations; empty orgs is
    // the no-reachability shape (reachableToken([],)).
    client.putSessionToken(
        await reachableToken('XXZruirZyAOoRpNxaDnpSA', []),
    );
    assertStrictEquals(client.sessionHasReachableOrganization(), false);
    client.deleteSessionToken();
});

Deno.test('an empty reachable set has none', async () => {
    client.putSessionToken(
        await reachableToken('XXZruirZyAOoRpNxaDnpSA', []),
    );
    assertStrictEquals(client.sessionHasReachableOrganization(), false);
    client.deleteSessionToken();
});

Deno.test('unseeded session predicates are false', () => {
    client.deleteSessionToken();
    assertStrictEquals(client.sessionIsOrganizationScoped(), false);
    assertStrictEquals(client.sessionHasReachableOrganization(), false);
});
