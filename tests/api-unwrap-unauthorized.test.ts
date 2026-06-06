import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { GET, UnauthorizedError } from '../api/api.ts';
import { devToken, expiredToken } from './token-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
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
test('a 403 through a verb is a plain Error, not Unauthorized',
async () => {
    const db = await freshDb();   // no role granted
    const tok = await devToken();
    await assert.rejects(
        () => GET(db, 'members', tok),
        (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.ok(!(err instanceof UnauthorizedError));
            assert.match((err as Error).message, /forbidden/);
            return true;
        });
});

// A 404 (unknown route, gated out before auth even runs)
// likewise stays a plain Error — only 401 is special-cased.
test('a 404 through a verb is a plain Error, not Unauthorized',
async () => {
    const db = await freshDb();
    const tok = await devToken();
    await assert.rejects(
        () => GET(db, 'no-such-resource', tok),
        (err: unknown) => {
            assert.ok(err instanceof Error);
            assert.ok(!(err instanceof UnauthorizedError));
            return true;
        });
});
