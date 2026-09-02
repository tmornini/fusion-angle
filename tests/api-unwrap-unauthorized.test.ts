import {
    assertInstanceOf,
    assertMatch,
    assertNotInstanceOf,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    GET, UnauthorizedError, RequestError,
} from '../api/api.ts';
import { devToken, expiredToken } from './token-fixtures.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// A 401 from the Bearer gate surfaces as the typed
// UnauthorizedError — the one signal runtime recovery keys on
// to decide "refresh, do not bounce." It is ALSO an Error, so
// catch sites that match `instanceof Error` are unaffected.
Deno.test('a 401 through a verb is an UnauthorizedError', async () => {
    const db = await freshDb();
    const tok = await expiredToken();
    const err = await assertRejects(
        () => GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', tok),
    ) as UnauthorizedError;
    assertInstanceOf(err, UnauthorizedError);
    assertInstanceOf(err, Error);
    assertMatch(err.reason, /invalid_token/);
});

// A 403 is authorization, not authentication: a live token
// with no role. It must NOT be UnauthorizedError, or runtime
// recovery would loop refreshing a token that is already fine.
// It IS a RequestError carrying status 403 — and still an Error,
// so `instanceof Error` catch sites are unaffected.
Deno.test('a 403 through a verb is a RequestError carrying status 403',
async () => {
    const db = await freshDb();   // no role granted
    const tok = await devToken();
    const err = await assertRejects(
        () => GET(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/', tok),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertInstanceOf(err, Error);
    assertNotInstanceOf(err, UnauthorizedError);
    assertStrictEquals(err.status, 403);
    assertMatch(err.message, /forbidden/);
});

// A 404 likewise carries its status, so the web layer can branch
// on it (a clean "not found" message) instead of string-matching
// server prose. Only 401 is special-cased into UnauthorizedError.
Deno.test('a 404 through a verb is a RequestError carrying status 404',
async () => {
    const db = await freshDb();
    const tok = await devToken();
    const err = await assertRejects(
        () => GET(db, 'no-such-resource', tok),
    ) as RequestError;
    assertInstanceOf(err, RequestError);
    assertInstanceOf(err, Error);
    assertNotInstanceOf(err, UnauthorizedError);
    assertStrictEquals(err.status, 404);
});
