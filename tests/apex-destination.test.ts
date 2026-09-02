import { assertStrictEquals } from '@std/assert';
import {
    APEX_SIGNED_IN,
    APEX_SIGNED_OUT,
    resolveApexLocation,
    probeRefreshSession,
} from '../web-app/app/apex-destination.ts';
import { deleteRefreshChannel } from
    '../web-app/app/adapters/session-refresh-mutex.ts';

const originalFetch = globalThis.fetch;

// The single-flight mutex opens ONE refresh channel per
// process, lazily, and a test process has no unload to
// reclaim it. Release after each test, so the handle never
// outlives the test that opened it; the next probe reopens
// it.
Deno.test.afterEach(() => {
    globalThis.fetch = originalFetch;
    deleteRefreshChannel();
});

Deno.test('a live session hops to dashboard', async () => {
    assertStrictEquals(
        await resolveApexLocation(async () => true),
        APEX_SIGNED_IN,
    );
    assertStrictEquals(
        APEX_SIGNED_IN,
        'dashboard/index.html',
    );
});

Deno.test('a dead session hops to landing', async () => {
    assertStrictEquals(
        await resolveApexLocation(async () => false),
        APEX_SIGNED_OUT,
    );
    assertStrictEquals(
        APEX_SIGNED_OUT,
        'landing/index.html',
    );
});

Deno.test('a probe fault hops to landing', async () => {
    assertStrictEquals(
        await resolveApexLocation(async () => {
            throw new Error('network');
        }),
        APEX_SIGNED_OUT,
    );
});

Deno.test('probeRefreshSession posts a cookie refresh grant',
async () => {
    let posts = 0;
    globalThis.fetch = async (input, init) => {
        posts += 1;
        assertStrictEquals(
            String(input),
            '/api/authentication/token',
        );
        assertStrictEquals(init?.method, 'POST');
        assertStrictEquals(init?.credentials, 'same-origin');
        const body = JSON.parse(String(init?.body)) as {
            grant_type?: unknown;
        };
        assertStrictEquals(body.grant_type, 'refresh');
        return new Response(
            JSON.stringify({ access_token: 'fresh-access' }),
            { status: 200 },
        );
    };
    assertStrictEquals(await probeRefreshSession(), true);
    assertStrictEquals(posts, 1);
});

Deno.test('probeRefreshSession treats 401 as unsigned',
async () => {
    globalThis.fetch = async () => new Response(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 401 },
    );
    assertStrictEquals(await probeRefreshSession(), false);
});

Deno.test('ok without access_token is unsigned', async () => {
    globalThis.fetch = async () => new Response(
        JSON.stringify({ token_type: 'Bearer' }),
        { status: 200 },
    );
    assertStrictEquals(await probeRefreshSession(), false);
});

Deno.test('concurrent probes share one refresh POST',
async () => {
    let posts = 0;
    globalThis.fetch = async () => {
        posts += 1;
        return new Response(
            JSON.stringify({ access_token: 'fresh-access' }),
            { status: 200 },
        );
    };
    const [a, b] = await Promise.all([
        probeRefreshSession(),
        probeRefreshSession(),
    ]);
    assertStrictEquals(a, true);
    assertStrictEquals(b, true);
    assertStrictEquals(posts, 1);
});
