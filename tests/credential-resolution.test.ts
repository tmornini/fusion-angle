import { assertEquals } from '@std/assert';
import './hmac-test-key.ts';
import {
    resolveCredentialDecision,
} from '../web-app/app/credential-resolution.ts';
import {
    mintAccessToken,
    TOKEN_AUDIENCE,
} from '../api/access-token.ts';

// Mint a token whose exp is exactly `exp` (seconds). Only the
// exp claim matters to the resolver, which is decode-only.
async function tokenWithExp(exp: number): Promise<string> {
    return mintAccessToken({
        aud: TOKEN_AUDIENCE,
        sub: 'XXZruirZyAOoRpNxaDnpSA', roles: [], name: 'Demo',
        iat: exp - 1000, ttlSeconds: 1000, jti: 'j' + exp,
    });
}

const ACCESS = 10_000;
const REFRESH = 20_000;

async function pair() {
    return {
        accessToken: await tokenWithExp(ACCESS),
        refreshToken: await tokenWithExp(REFRESH),
    };
}

Deno.test('no credentials resolves to login', () => {
    assertEquals(
        resolveCredentialDecision(null, 5_000),
        { kind: 'login' });
});

Deno.test('a live access token resolves to install', async () => {
    const creds = await pair();
    assertEquals(
        resolveCredentialDecision(creds, ACCESS - 1),
        { kind: 'install', accessToken: creds.accessToken });
});

Deno.test('a dead access but live refresh resolves to refresh',
async () => {
    const creds = await pair();
    assertEquals(
        resolveCredentialDecision(creds, ACCESS + 1),
        { kind: 'refresh', refreshToken: creds.refreshToken });
});

Deno.test('both tokens dead resolves to login', async () => {
    const creds = await pair();
    assertEquals(
        resolveCredentialDecision(creds, REFRESH + 1),
        { kind: 'login' });
});

Deno.test('now === access exp counts the access dead (refresh)',
async () => {
    const creds = await pair();
    // at exactly the access exp the token is dead (now >= exp),
    // refresh still live → refresh, never install.
    assertEquals(
        resolveCredentialDecision(creds, ACCESS),
        { kind: 'refresh', refreshToken: creds.refreshToken });
});

Deno.test('now === refresh exp counts the refresh dead (login)',
async () => {
    const creds = await pair();
    // access already dead; now exactly at refresh exp → both
    // dead → login.
    assertEquals(
        resolveCredentialDecision(creds, REFRESH),
        { kind: 'login' });
});
