import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { devToken } from './token-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const BASE = 'http://localhost';

// 401-first covenant: an unauthenticated request to ANY non-
// bearer-exempt path — including unknown and retired paths —
// returns 401, never a route-topology 404.

test('no token + unknown path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-route-ever`),
    );
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('no token + unknown nested path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/oRAKQvKtOmSHMZEjhEXaRw/x1`),
    );
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('bearer + unknown path → 404', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await devToken();
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-door`, {
            headers: {
                Authorization: 'Bearer ' + token,
            },
        }),
    );
    assert.equal(res.status, 404);
});

test('no token + malformed identifier on a real'
+ ' route → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(
            `${BASE}/organizations/not-an-identifier/`
                + 'ideas/',
        ),
    );
    assert.equal(res.status, 401);
    const body = await res.json() as { error: string };
    assert.equal(body.error, 'invalid_token');
});

test('authenticated miss ladder: 404 then 400 then'
+ ' 403 then 404', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const token = await devToken();
    const org = 'AjdvjuECVZEgZoFajaIEkg';
    const auth = {
        headers: {
            Authorization: 'Bearer ' + token,
        },
    };

    const unknown = await handleRequest(
        db,
        new Request(`${BASE}/no-such-door`, auth),
    );
    assert.equal(unknown.status, 404);

    const malformed = await handleRequest(
        db,
        new Request(
            `${BASE}/organizations/not-an-identifier/`
                + 'ideas/',
            auth,
        ),
    );
    assert.equal(malformed.status, 400);
    const malformedBody = await malformed.json() as {
        error: string;
    };
    assert.equal(
        malformedBody.error,
        'id must be a 22-character identifier',
    );

    const foreign = await handleRequest(
        db,
        new Request(
            `${BASE}/organizations/`
                + generateIdentifier()
                + '/ideas/',
            auth,
        ),
    );
    assert.equal(foreign.status, 403);
    const foreignBody = await foreign.json() as {
        error: string;
    };
    assert.equal(
        foreignBody.error,
        'forbidden: path organization does not'
            + ' match the token organization',
    );

    const absent = await handleRequest(
        db,
        new Request(
            `${BASE}/organizations/` + org
                + '/ideas/' + generateIdentifier(),
            auth,
        ),
    );
    assert.equal(absent.status, 404);
});
