import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import {
    GET, UnauthorizedError, RequestError,
} from '../api/api.ts';
import { devToken, expiredToken } from './token-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    return db;
}

// A 401 from the Bearer gate surfaces as the typed
// UnauthorizedError — the one signal runtime recovery keys on
// to decide "refresh, do not bounce." It is ALSO an Error, so
// catch sites that match `instanceof Error` are unaffected.
test('a 401 through a verb is an UnauthorizedError', async () => {
    const db = await freshDb();
    const tok = await expiredToken();
    await assert.rejects(
        () => GET(db, 'members', tok),
        (err: unknown) => {
            assert.ok(err instanceof UnauthorizedError);
            assert.ok(err instanceof Error);
            assert.match(
                (err as UnauthorizedError).reason, /expired/);
            return true;
        });
});

// A 403 is authorization, not authentication: a live token
// with no role. It must NOT be UnauthorizedError, or runtime
// recovery would loop refreshing a token that is already fine.
// It IS a RequestError carrying status 403 — and still an Error,
// so `instanceof Error` catch sites are unaffected.
test('a 403 through a verb is a RequestError carrying status 403',
async () => {
    const db = await freshDb();   // no role granted
    const tok = await devToken();
    await assert.rejects(
        () => GET(db, 'members', tok),
        (err: unknown) => {
            assert.ok(err instanceof RequestError);
            assert.ok(err instanceof Error);
            assert.ok(!(err instanceof UnauthorizedError));
            assert.equal((err as RequestError).status, 403);
            assert.match((err as Error).message, /forbidden/);
            return true;
        });
});

// A 404 likewise carries its status, so the web layer can branch
// on it (a clean "not found" message) instead of string-matching
// server prose. Only 401 is special-cased into UnauthorizedError.
test('a 404 through a verb is a RequestError carrying status 404',
async () => {
    const db = await freshDb();
    const tok = await devToken();
    await assert.rejects(
        () => GET(db, 'no-such-resource', tok),
        (err: unknown) => {
            assert.ok(err instanceof RequestError);
            assert.ok(err instanceof Error);
            assert.ok(!(err instanceof UnauthorizedError));
            assert.equal((err as RequestError).status, 404);
            return true;
        });
});
