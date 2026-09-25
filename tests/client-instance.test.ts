import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { UnauthorizedError } from '../shared/http-errors.ts';
import { generateIdentifier } from '../shared/identifier.ts';
import {
    createClient,
    type ClientDeps,
} from '../client/create-client.ts';
import { createHttpFacade } from '../client/http-facade.ts';
import { getOrganizations } from '../client/organizations.ts';
import {
    createAppClient,
    getClient,
} from '../web-app/app/client.ts';
import {
    getDbAdapter,
    initAdapter,
} from './client-init.ts';
import {
    inPageClient,
    wrapInPageAdapter,
} from './in-page-facade.ts';
import { withLocalStorageAsync } from
    './fixtures/local-storage.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    expiredToken,
    organizationToken,
    reachableToken,
} from './token-fixtures.ts';

const quiet = {
    log: { warn: () => {} },
    recordRequest: () => {},
};

Deno.test('two clients hold two sessions', async () => {
    const ada = 'XXZruirZyAOoRpNxaDnpSA';
    const bea = generateIdentifier();
    const a = inPageClient(memoryDbAdapter());
    const b = inPageClient(memoryDbAdapter());
    a.putSessionToken(await reachableToken(ada, []));
    b.putSessionToken(await reachableToken(bea, []));
    assertStrictEquals(a.sessionContext().identity.id, ada);
    assertStrictEquals(b.sessionContext().identity.id, bea);
    a.deleteSessionToken();
    assertStrictEquals(a.sessionTokenIsSeeded(), false);
    assertStrictEquals(b.sessionTokenIsSeeded(), true);
    let release: (token: string) => void = () => {};
    const pending = a.runSingleFlightRefresh(
        () => new Promise((resolve) => {
            release = resolve;
        }),
    );
    let ranB = false;
    const pendingB = b.runSingleFlightRefresh(async () => {
        ranB = true;
        return 'b-access';
    });
    release('a-access');
    await pendingB;
    assertStrictEquals(ranB, true);
    assertStrictEquals(await pending, 'a-access');
    a.deleteRefreshChannel();
    b.deleteRefreshChannel();
});

Deno.test('a failed recovery calls the injected navigation',
async () => {
    const calls: string[] = [];
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const client = createClient({
        facade: wrapInPageAdapter(db),
        navigation: {
            redirectToLogin: () => {
                calls.push('redirectToLogin');
            },
            navigateToAuth: () => {
                calls.push('navigateToAuth');
            },
        },
        ...quiet,
    });
    const ctx = client.recoveringRequestContext(
        await expiredToken(),
    );
    await withLocalStorageAsync({
        getItem: () => null,
        removeItem: () => {},
    }, async () => {
        await assertRejects(
            () => ctx.GET('organizations/'),
            UnauthorizedError,
        );
    });
    assertEquals(calls, ['redirectToLogin']);
});

Deno.test('a client is never built without navigation', () => {
    assertThrows(
        () => createClient({
            facade: wrapInPageAdapter(memoryDbAdapter()),
            ...quiet,
        } as unknown as ClientDeps),
        Error,
        'a client needs its navigation',
    );
});

Deno.test('the test root builds a working client', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await initAdapter(() => db);
    assertStrictEquals(getDbAdapter(), db);
    getClient().putSessionToken(await organizationToken());
    const organizations = await getOrganizations(
        getClient().sessionContext(),
    );
    assert(organizations.length > 0);
});

Deno.test('sign-out then sign-in reads the new identity',
async () => {
    const client = inPageClient(memoryDbAdapter());
    client.putSessionToken(
        await reachableToken('XXZruirZyAOoRpNxaDnpSA', []),
    );
    client.deleteSessionToken();
    const next = generateIdentifier();
    client.putSessionToken(await reachableToken(next, []));
    assertStrictEquals(
        client.sessionContext().identity.id, next,
    );
});

Deno.test(
    'the transport and the context share one refresh flight',
    async () => {
        const original = globalThis.fetch;
        const fresh = await reachableToken(
            generateIdentifier(), [],
        );
        let releaseRefresh: (response: Response) => void =
            () => {};
        let refreshAsked: () => void = () => {};
        const asked = new Promise<void>((resolve) => {
            refreshAsked = resolve;
        });
        let calls = 0;
        globalThis.fetch = (input) => {
            calls += 1;
            if (calls === 1) {
                return Promise.resolve(new Response(
                    JSON.stringify({ error: 'expired' }),
                    { status: 401 },
                ));
            }
            if (String(input).endsWith('authentication/token')) {
                refreshAsked();
                return new Promise((resolve) => {
                    releaseRefresh = resolve;
                });
            }
            return Promise.resolve(new Response('[]'));
        };
        const client = createAppClient(createHttpFacade(''));
        client.setCookieSession(true);
        const flat = await reachableToken(
            'XXZruirZyAOoRpNxaDnpSA', [],
        );
        client.putSessionToken(flat);
        try {
            const read = client.requestContext(flat)
                .GET('organizations/');
            await asked;
            let ranOwn = false;
            const joined = client.runSingleFlightRefresh(
                async () => {
                    ranOwn = true;
                    return 'own';
                },
            );
            releaseRefresh(new Response('', {
                status: 200,
                headers: {
                    'authentication-info':
                        'access_token="' + fresh + '"',
                },
            }));
            assertStrictEquals(await joined, fresh);
            assertEquals(await read, []);
            assertStrictEquals(ranOwn, false);
            assertStrictEquals(client.getSessionToken(), fresh);
        } finally {
            globalThis.fetch = original;
            client.deleteRefreshChannel();
        }
    },
);
