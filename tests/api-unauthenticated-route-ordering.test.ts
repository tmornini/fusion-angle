import { assertStrictEquals } from '@std/assert';
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

Deno.test('no token + unknown path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/no-such-route-ever`),
    );
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'invalid_token');
});

Deno.test('no token + unknown nested path → 401', async () => {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const res = await handleRequest(
        db,
        new Request(`${BASE}/oRAKQvKtOmSHMZEjhEXaRw/x1`),
    );
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'invalid_token');
});

Deno.test('bearer + unknown path → 404', async () => {
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
    assertStrictEquals(res.status, 404);
});

Deno.test('no token + malformed identifier on a real'
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
    assertStrictEquals(res.status, 401);
    const body = await res.json() as { error: string };
    assertStrictEquals(body.error, 'invalid_token');
});

Deno.test('authenticated miss ladder: 404 then 400 then'
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
    assertStrictEquals(unknown.status, 404);

    const malformed = await handleRequest(
        db,
        new Request(
            `${BASE}/organizations/not-an-identifier/`
                + 'ideas/',
            auth,
        ),
    );
    assertStrictEquals(malformed.status, 400);
    const malformedBody = await malformed.json() as {
        error: string;
    };
    assertStrictEquals(
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
    assertStrictEquals(foreign.status, 403);
    const foreignBody = await foreign.json() as {
        error: string;
    };
    assertStrictEquals(
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
    assertStrictEquals(absent.status, 404);
});
