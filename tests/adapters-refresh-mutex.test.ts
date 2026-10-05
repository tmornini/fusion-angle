import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    createHttpFacade,
} from '../client/http-facade.ts';
import { createAppClient } from '../web-app/app/client.ts';
import { UnauthorizedError } from
    '../shared/http-errors.ts';
import {
    expiredToken,
    organizationToken,
    reachableToken,
    claimToken,
} from './token-fixtures.ts';
import { principalFromToken } from
    '../shared/access-token-decode.ts';
import {
    resolveBootOrganizationBranch,
} from '../client/credential-resolution.ts';

// The tab's one client: each test's transport binds it, as
// the client binds its own.
const client = createAppClient(
    createHttpFacade(
        'http://example.test',
        (input, init) => globalThis.fetch(input, init),
    ),
);

// The single-flight mutex opens one refresh channel per
// client, lazily, but its fixed name still reaches every
// test file's worker in the process, and a test process
// has no unload to reclaim it. Release after each test, so
// the handle never outlives the test that opened it; the
// next refresh reopens it.
Deno.test.afterEach(() => {
    client.setCookieSession(false);
    client.deleteRefreshChannel();
});

async function withMockFetch(
    handler: typeof fetch,
    run: () => Promise<void>,
): Promise<void> {
    const original = globalThis.fetch;
    globalThis.fetch = handler;
    try {
        await run();
    } finally {
        globalThis.fetch = original;
    }
}

Deno.test('two concurrent 401s cause one refresh POST',
async () => {
    client.setCookieSession(true);
    client.putSessionToken('dead-access');
    let refreshPosts = 0;
    let nextAccess = 0;
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            refreshPosts += 1;
            nextAccess += 1;
            return new Response(
                JSON.stringify({
                    token_type: 'Bearer',
                    expires_in: 900,
                }),
                {
                    status: 200,
                    headers: {
                        'authentication-info':
                            'access_token="fresh-'
                            + nextAccess + '"',
                    },
                },
            );
        }
        const token = new Headers(init?.headers)
            .get('Authorization');
        if (token === 'Bearer dead-access') {
            return Response.json(
                { error: 'invalid_token' },
                { status: 401 },
            );
        }
        if (url.endsWith('/ideas/')) {
            return new Response(null, { status: 204 });
        }
        return Response.json([]);
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
            (input, init) => globalThis.fetch(input, init),
        )({ ...client, navigateToAuth: () => {} });
        const [a, b] = await Promise.all([
            facade.GET('members', 'dead-access'),
            facade.GETCollection(
                'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/',
                'dead-access',
            ),
        ]);
        assert(Array.isArray(a.body().toValue()));
        assertEquals(b, []);
    });
    assertStrictEquals(refreshPosts, 1);
});

Deno.test('cookie-session recover after a failed facade refresh'
+ ' does not POST again',
async () => {
    globalThis.document = {
        documentElement: {
            getAttribute: () => 'dashboard',
        },
    } as unknown as Document;
    // @ts-expect-error — Node stub for navigateTo
    globalThis.window = { location: { href: '', search: '' } };
    client.setCookieSession(true);
    const deadAccess = await expiredToken();
    client.putSessionToken(deadAccess);
    let refreshPosts = 0;
    await withMockFetch(async (input) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            refreshPosts += 1;
            return Response.json(
                { error: 'invalid_grant' },
                { status: 401 },
            );
        }
        return Response.json(
            { error: 'invalid_token' },
            { status: 401 },
        );
    }, async () => {
        const ctx = client.recoveringRequestContext(
            deadAccess);
        await assertRejects(
            () => ctx.GET('members'),
            UnauthorizedError,
        );
    });
    assertStrictEquals(refreshPosts, 1);
});

Deno.test('idle tab ignores a peer refresh broadcast',
async () => {
    let posts = 0;
    await client.runSingleFlightRefresh(async () => {
        posts += 1;
        return 'first';
    });
    const peer = new BroadcastChannel('fusion-angle:refresh');
    // Opened after the client's refresh bus, and a bus
    // delivers to its listeners in the order they opened:
    // once this one hears the broadcast, the client's has.
    const witness = new BroadcastChannel('fusion-angle:refresh');
    const heard = new Promise<void>((resolve) => {
        witness.onmessage = () => resolve();
    });
    peer.postMessage({ accessToken: null });
    await heard;
    witness.close();
    peer.close();
    const result = await client.runSingleFlightRefresh(async () => {
        posts += 1;
        return 'second';
    });
    assertStrictEquals(posts, 2);
    assertStrictEquals(result, 'second');
});

Deno.test('cookie refresh re-scopes the session to the'
+ ' dead token org',
async () => {
    client.setCookieSession(true);
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const scoped = await organizationToken();
    const flat = await reachableToken();
    const rescoped = await claimToken({
        organization: org,
        organizations: [org],
        roles: ['admin:' + org],
        jti: 'rescoped-after-refresh',
    });
    client.putSessionToken(scoped);
    const grants: string[] = [];
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            const body = JSON.parse(
                String(init?.body),
            ) as { grant_type?: string };
            grants.push(body.grant_type ?? '');
            if (body.grant_type === 'refresh') {
                return new Response(
                    JSON.stringify({
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="'
                                + flat + '"',
                        },
                    },
                );
            }
            if (body.grant_type
                === 'token-exchange') {
                const asked = (
                    body as {
                        organization?: string;
                    }
                ).organization;
                assertStrictEquals(asked, org);
                const bearer = new Headers(init?.headers)
                    .get('Authorization');
                assertStrictEquals(
                    bearer, 'Bearer ' + flat,
                );
                return new Response(
                    JSON.stringify({
                        token_type: 'Bearer',
                        expires_in: 900,
                    }),
                    {
                        status: 200,
                        headers: {
                            'authentication-info':
                                'access_token="'
                                + rescoped + '"',
                        },
                    },
                );
            }
            return new Response(
                JSON.stringify({
                    error: 'unsupported_grant',
                }),
                { status: 400 },
            );
        }
        const token = new Headers(init?.headers)
            .get('Authorization');
        if (token === 'Bearer ' + scoped) {
            return new Response(
                JSON.stringify({
                    error: 'invalid_token',
                }),
                { status: 401 },
            );
        }
        if (token === 'Bearer ' + flat
            || token === 'Bearer ' + rescoped) {
            return Response.json([]);
        }
        return Response.json(
            { error: 'invalid_token' },
            { status: 401 },
        );
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
            (input, init) => globalThis.fetch(input, init),
        )({ ...client, navigateToAuth: () => {} });
        const rows = await facade.GET(
            'organizations/' + org + '/flows/x',
            scoped,
        );
        assert(Array.isArray(rows.body().toValue()));
    });
    assertEquals(
        grants, ['refresh', 'token-exchange'],
    );
    assertStrictEquals(
        client.sessionIsOrganizationScoped(), true,
    );
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization,
        org,
    );
});

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';

function scopedTo(organization: string): Promise<string> {
    return claimToken({
        organization,
        organizations: [STARK, WAYNE],
        roles: ['admin:' + STARK, 'admin:' + WAYNE],
        jti: 'scoped-' + organization,
    });
}

Deno.test('a boot refresh asked for Stark keeps Stark when'
    + ' a Wayne tab broadcasts', async () => {
    const starkTab = createAppClient(createHttpFacade(
        'http://example.test',
        (input, init) => globalThis.fetch(input, init),
    ));
    const wayneToken = await scopedTo(WAYNE);
    const starkToken = await scopedTo(STARK);
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    let locked = (): void => {};
    const inside = new Promise<void>((resolve) => {
        locked = resolve;
    });
    // The Wayne tab: holds the refresh lock across its
    // refresh, then broadcasts its Wayne-scoped token.
    const wayneHold = navigator.locks.request(
        'fusion-refresh', async () => {
            locked();
            await held;
        },
    );
    await inside;
    const starkFlight = starkTab.runSingleFlightRefresh(
        () => Promise.resolve(starkToken),
    );
    const wayneBus = new BroadcastChannel(
        'fusion-angle:refresh',
    );
    const witness = new BroadcastChannel(
        'fusion-angle:refresh',
    );
    const heard = new Promise<void>((resolve) => {
        witness.onmessage = () => resolve();
    });
    try {
        wayneBus.postMessage({ accessToken: wayneToken });
        await heard;
        release();
        await wayneHold;
        const access = await starkFlight;
        if (access === null) throw new Error('no access');
        const principal = principalFromToken(access);
        assertEquals(
            resolveBootOrganizationBranch(
                principal.organization,
                principal.organizations,
                STARK,
            ),
            { kind: 'exchange', id: STARK },
        );
    } finally {
        witness.close();
        wayneBus.close();
        starkTab.deleteRefreshChannel();
    }
});

// Hold the refresh lock as a Wayne tab would, start a
// Stark page's GET on a dead Stark token, let its 401
// queue behind the lock, then broadcast the Wayne token.
async function recoverBehindWayne(
    exchanged: string | null,
): Promise<{
    grants: string[];
    asked: (string | undefined)[];
    retriedWith: string[];
}> {
    client.setCookieSession(true);
    const dead = await scopedTo(STARK);
    const wayne = await scopedTo(WAYNE);
    const grants: string[] = [];
    const asked: (string | undefined)[] = [];
    const retriedWith: string[] = [];
    let sent401 = (): void => {};
    const refused = new Promise<void>((resolve) => {
        sent401 = resolve;
    });
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    let locked = (): void => {};
    const inside = new Promise<void>((resolve) => {
        locked = resolve;
    });
    const wayneHold = navigator.locks.request(
        'fusion-refresh', async () => {
            locked();
            await held;
        },
    );
    await inside;
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            const body = JSON.parse(String(init?.body)) as {
                grant_type?: string;
                organization?: string;
            };
            grants.push(body.grant_type ?? '');
            asked.push(body.organization);
            if (exchanged === null) {
                return Response.json(
                    { error: 'forbidden' }, { status: 403 },
                );
            }
            return new Response(
                JSON.stringify({
                    token_type: 'Bearer', expires_in: 900,
                }),
                {
                    status: 200,
                    headers: {
                        'authentication-info':
                            'access_token="' + exchanged + '"',
                    },
                },
            );
        }
        const bearer = new Headers(init?.headers)
            .get('Authorization');
        if (bearer === 'Bearer ' + dead) {
            sent401();
            return Response.json(
                { error: 'invalid_token' }, { status: 401 },
            );
        }
        retriedWith.push(bearer ?? '');
        return Response.json([]);
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
            (input, init) => globalThis.fetch(input, init),
        )({ ...client, navigateToAuth: () => {} });
        const pending = facade.GET(
            'organizations/' + STARK + '/records/', dead,
        ).catch((err: unknown) => err);
        await refused;
        // One macrotask: the 401's microtasks reach the
        // single flight, which now waits on the lock.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bus = new BroadcastChannel('fusion-angle:refresh');
        const witness = new BroadcastChannel(
            'fusion-angle:refresh',
        );
        const heard = new Promise<void>((resolve) => {
            witness.onmessage = () => resolve();
        });
        try {
            bus.postMessage({ accessToken: wayne });
            await heard;
        } finally {
            witness.close();
            bus.close();
        }
        release();
        await wayneHold;
        await pending;
    });
    return { grants, asked, retriedWith };
}

Deno.test('a 401 recovery that adopts a Wayne peer token'
    + ' exchanges it back to Stark', async () => {
    const rescoped = await claimToken({
        organization: STARK,
        organizations: [STARK, WAYNE],
        roles: ['admin:' + STARK, 'admin:' + WAYNE],
        jti: 'rescoped-stark',
    });
    const seen = await recoverBehindWayne(rescoped);
    assertEquals(seen.grants, ['token-exchange']);
    assertEquals(seen.asked, [STARK]);
    assertEquals(seen.retriedWith, ['Bearer ' + rescoped]);
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization,
        STARK,
    );
});

Deno.test('a 401 recovery never installs a Wayne peer'
    + ' token it cannot exchange back', async () => {
    const seen = await recoverBehindWayne(null);
    assertEquals(seen.grants, ['token-exchange']);
    assertEquals(seen.retriedWith, []);
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization === WAYNE,
        false,
    );
});
