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
import { withoutCrossTabRefresh } from
    './fixtures/cross-tab-refresh.ts';
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

Deno.test('two clients hold two sessions', () =>
    withoutCrossTabRefresh(async () => {
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
    }));

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
    () => withoutCrossTabRefresh(async () => {
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
        const client = createAppClient(createHttpFacade(
            '',
            (input, init) => globalThis.fetch(input, init),
        ));
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
    }),
);

Deno.test(
    'the cookie refresh and the exchange ride the transport',
    () => withoutCrossTabRefresh(async () => {
        const flat = await reachableToken(
            'XXZruirZyAOoRpNxaDnpSA',
            ['AjdvjuECVZEgZoFajaIEkg'],
        );
        const scoped = await organizationToken();
        const dead = await organizationToken();
        const seen: {
            method: string;
            url: string;
            headers: Headers;
            receiver: unknown;
        }[] = [];
        function scripted(
            this: unknown,
            input: RequestInfo | URL,
            init?: RequestInit,
        ): Promise<Response> {
            seen.push({
                method: init?.method ?? 'GET',
                url: String(input),
                headers: new Headers(init?.headers),
                receiver: this,
            });
            const body = String(init?.body ?? '');
            if (seen.length === 1) {
                return Promise.resolve(new Response(
                    JSON.stringify({ error: 'expired' }),
                    { status: 401 },
                ));
            }
            if (body.includes('"refresh"')) {
                return Promise.resolve(new Response('', {
                    headers: {
                        'authentication-info':
                            'access_token="' + flat + '"',
                    },
                }));
            }
            if (body.includes('"token-exchange"')) {
                return Promise.resolve(new Response('', {
                    headers: {
                        'authentication-info':
                            'access_token="' + scoped + '"',
                    },
                }));
            }
            return Promise.resolve(new Response('[]'));
        }
        const client = createAppClient(
            createHttpFacade('https://origin.test', scripted),
        );
        try {
            await client.requestContext(dead)
                .GET('organizations/');
        } finally {
            client.deleteRefreshChannel();
        }
        assertEquals(
            seen.map((s) => [s.method, s.url]),
            [
                ['GET', 'https://origin.test/api/organizations/'],
                ['POST', 'https://origin.test/api/authentication/token'],
                ['POST', 'https://origin.test/api/authentication/token'],
                ['GET', 'https://origin.test/api/organizations/'],
            ],
        );
        const [, refresh, exchange] = seen;
        assertStrictEquals(
            refresh!.headers.get('content-type'),
            'application/json',
        );
        assert(refresh!.headers.get('operation-id') !== null);
        assertStrictEquals(
            refresh!.headers.get('authorization'), null,
        );
        assertStrictEquals(
            exchange!.headers.get('authorization'),
            'Bearer ' + flat,
        );
        assertStrictEquals(
            exchange!.headers.get('operation-id'),
            refresh!.headers.get('operation-id'),
        );
        assertStrictEquals(client.getSessionToken(), scoped);
        for (const s of seen) {
            assertStrictEquals(s.receiver, undefined);
        }
    }),
);

Deno.test('a failed cookie refresh calls the injected navigation',
() => withoutCrossTabRefresh(async () => {
    const calls: string[] = [];
    const client = createClient({
        facade: createHttpFacade('', (_input, init) =>
            Promise.resolve(
                String(init?.body ?? '').includes('"refresh"')
                    ? new Response('', { status: 401 })
                    : new Response(
                        JSON.stringify({ error: 'expired' }),
                        { status: 401 },
                    ),
            )),
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
    const ctx = client.requestContext(
        await reachableToken('XXZruirZyAOoRpNxaDnpSA', []),
    );
    try {
        await assertRejects(
            () => ctx.GET('organizations/'),
            UnauthorizedError,
        );
    } finally {
        client.deleteRefreshChannel();
    }
    assertEquals(calls, ['navigateToAuth']);
}));

Deno.test('a cookie refresh on one client leaves another',
() => withoutCrossTabRefresh(async () => {
    const other = inPageClient(memoryDbAdapter());
    const kept = await reachableToken(generateIdentifier(), []);
    other.putSessionToken(kept);
    const fresh = await reachableToken(generateIdentifier(), []);
    let calls = 0;
    const client = createAppClient(createHttpFacade(
        '',
        (_input, init) => {
            calls += 1;
            if (calls === 1) {
                return Promise.resolve(new Response(
                    JSON.stringify({ error: 'expired' }),
                    { status: 401 },
                ));
            }
            if (String(init?.body ?? '').includes('"refresh"')) {
                return Promise.resolve(new Response('', {
                    headers: {
                        'authentication-info':
                            'access_token="' + fresh + '"',
                    },
                }));
            }
            return Promise.resolve(new Response('[]'));
        },
    ));
    try {
        await client.requestContext(
            await reachableToken('XXZruirZyAOoRpNxaDnpSA', []),
        ).GET('organizations/');
    } finally {
        client.deleteRefreshChannel();
    }
    assertStrictEquals(client.getSessionToken(), fresh);
    assertStrictEquals(other.getSessionToken(), kept);
}));
