import {
    assertNotStrictEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { handleRequest, UnauthorizedError } from '../api/api.ts';
import { inPageContext, GET } from './in-page-facade.ts';
import {
    postSessionRefresh,
} from '../client/session-refresh.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import {
    seedAuthorizationCodeMessagePair,
} from './authorization-code-fixtures.ts';
import {
    framedRequest,
    presentedFields,
    refreshTokenFromSetCookie,
} from './http-fixtures.ts';
import { basicAuthorization } from
    '../api/authentication.ts';
import { operationIdHeader } from './operation-id-header.ts';

const BASE = 'http://localhost';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Drive the real authorization_code grant to mint a genuine
// token chain — there is no shortcut fixture for refresh tokens.
async function issuePair(db: MemoryDbAdapter): Promise<{
    access_token: string; refresh_token: string;
}> {
    await seedAuthorizationCodeMessagePair(
        db, 'the-code', 'XXZruirZyAOoRpNxaDnpSA', 'web',
    );
    const res = await handleRequest(db, framedRequest(
        `${BASE}/authentication/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                authorization: basicAuthorization(
                    'the-code', '',
                ),
            },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: 'web',
            }),
        }));
    const body = await presentedFields(res) as {
        access_token: string;
    };
    return {
        access_token: body.access_token,
        refresh_token: refreshTokenFromSetCookie(res),
    };
}

Deno.test('a live refresh token rotates to a usable pair',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = inPageContext(db, await devToken());
    const creds =
        await postSessionRefresh(ctx, pair.refresh_token);
    assertNotStrictEquals(creds.refreshToken, pair.refresh_token);
    assertStrictEquals((await GET(
        db, 'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/ideas/',
        creds.accessToken, operationIdHeader(),
    )).query('status').toNumber(), 204);
});

Deno.test('a garbage refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const ctx = inPageContext(db, await devToken());
    await assertRejects(
        () => postSessionRefresh(ctx, 'not.a.jwt'),
        UnauthorizedError);
});

Deno.test('a reused refresh token throws UnauthorizedError',
async () => {
    const db = await freshDb();
    const pair = await issuePair(db);
    const ctx = inPageContext(db, await devToken());
    await postSessionRefresh(ctx, pair.refresh_token);
    // the rotated-away token is now poison — reuse → 401
    await assertRejects(
        () => postSessionRefresh(ctx, pair.refresh_token),
        UnauthorizedError);
});
