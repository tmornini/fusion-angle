import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
    APEX_SIGNED_IN,
    APEX_SIGNED_OUT,
    resolveApexLocation,
    probeRefreshSession,
} from '../web-app/app/apex-destination.ts';

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
});

test('a live session hops to dashboard', async () => {
    assert.equal(
        await resolveApexLocation(async () => true),
        APEX_SIGNED_IN,
    );
    assert.equal(
        APEX_SIGNED_IN,
        'dashboard/index.html',
    );
});

test('a dead session hops to landing', async () => {
    assert.equal(
        await resolveApexLocation(async () => false),
        APEX_SIGNED_OUT,
    );
    assert.equal(
        APEX_SIGNED_OUT,
        'landing/index.html',
    );
});

test('a probe fault hops to landing', async () => {
    assert.equal(
        await resolveApexLocation(async () => {
            throw new Error('network');
        }),
        APEX_SIGNED_OUT,
    );
});

test('probeRefreshSession posts a cookie refresh grant',
async () => {
    let posts = 0;
    globalThis.fetch = async (input, init) => {
        posts += 1;
        assert.equal(
            String(input),
            '/api/authentication/token',
        );
        assert.equal(init?.method, 'POST');
        assert.equal(init?.credentials, 'same-origin');
        const body = JSON.parse(String(init?.body)) as {
            grant_type?: unknown;
        };
        assert.equal(body.grant_type, 'refresh');
        return new Response(
            JSON.stringify({ access_token: 'fresh-access' }),
            { status: 200 },
        );
    };
    assert.equal(await probeRefreshSession(), true);
    assert.equal(posts, 1);
});

test('probeRefreshSession treats 401 as unsigned',
async () => {
    globalThis.fetch = async () => new Response(
        JSON.stringify({ error: 'invalid_grant' }),
        { status: 401 },
    );
    assert.equal(await probeRefreshSession(), false);
});

test('ok without access_token is unsigned', async () => {
    globalThis.fetch = async () => new Response(
        JSON.stringify({ token_type: 'Bearer' }),
        { status: 200 },
    );
    assert.equal(await probeRefreshSession(), false);
});

test('concurrent probes share one refresh POST',
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
    assert.equal(a, true);
    assert.equal(b, true);
    assert.equal(posts, 1);
});
