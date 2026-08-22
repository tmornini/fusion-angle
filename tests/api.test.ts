import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, POST,
    RequestError,
    handleRequest,
} from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    seedHumanMember,
    seedAIMember,
} from './member-fixtures.ts';
import {
    DEV_TOKEN, organizationToken,
} from './token-fixtures.ts';
import { captureConsole } from './console-capture.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

test('GET on unknown route throws', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'nonexistent-table', DEV_TOKEN),
        /Route not found|404|not found/i,
    );
});

test('GET ideas returns array', async () => {
    const db = await freshDb();
    const ideas =
        await GET<unknown[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + '', DEV_TOKEN);
    assert.deepEqual(ideas, []);
});

test('GET organizations/:id/ideas/:id throws on missing', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db
            , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + generateIdentifier()
            , DEV_TOKEN),
        /Not found|404/,
    );
});

test('PUT then GET round-trips an entity', async () => {
    const db = await freshDb();
    const payload = {
        id: 'fndCYAsXazdzMUlEGMNIZw',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'Test',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state: 'active',
    };
    await PUT(db
        , 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
        + 'fndCYAsXazdzMUlEGMNIZw', payload, DEV_TOKEN);
    const fetched =
        await GET<{ title: string }>(
            db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                + 'fndCYAsXazdzMUlEGMNIZw', DEV_TOKEN,
        );
    assert.equal(fetched.title, 'Test');
});

// Unknown-route write is a router 404 and writes nothing.
// Document-plane idempotency/collision is pinned by family
// tests; this pin is the generic writes-nothing force.
test(
    'PUT on an unknown route is a router 404',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => PUT(db, 'oRAKQvKtOmSHMZEjhEXaRw/x1', {
                entity_id: 'YiJPbufDpkyrZcZCYbUJpg',
                state: 'active',
                at: '2026-01-01T00:00:00.000000Z',
            }, DEV_TOKEN),
            (err: unknown) =>
                err instanceof RequestError
                && err.status === 404,
        );
    },
);

test('GET organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
    + ' normalizes to collection', async () => {
    const db = await freshDb();
    const result =
        await GET<unknown[]>(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
            + '', DEV_TOKEN);
    assert.deepEqual(result, []);
});

test(
    'GET seats returns the persisted humans',
    async () => {
        const db = await freshDb();
        const humanId = generateIdentifier();
        await seedHumanMember(db, humanId, 'Sarah Chen');
        const members =
            await GET<{ id: string }[]>(
                db, 'organizations/AjdvjuECVZEgZoFajaIEkg/members/',
                await organizationToken());
        assert.ok(
            members.some(row => row.id === humanId),
        );
    },
);

test(
    'GET ai-agents returns persisted agents',
    async () => {
        const db = await freshDb();
        await seedAIMember(
            db, generateIdentifier(), 'Opus',
        );
        const ais =
            await GET<unknown[]>(
                db, 'ai-agents/', DEV_TOKEN);
        assert.equal(ais.length, 1);
    },
);

test(
    'PUT ai-agents/:id validates body',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => PUT(db, 'ai-agents/'
                + generateIdentifier(), {
                rogue_field: 'extra',
            }, DEV_TOKEN),
            /unexpected key|missing/,
        );
    },
);

test(
    'POST on a route with no post handler is'
    + ' 405 Method Not Allowed',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => POST(db, 'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                , {}, DEV_TOKEN),
            /not allowed/i,
        );
    },
);

test(
    'POST on an unknown route is 404',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => POST(
                db, 'no-such-resource', {}, DEV_TOKEN,
            ),
            /not found|404/i,
        );
    },
);

test(
    'a path with the wrong number of segments'
    + ' matches no route and is 404',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => GET(
                db,
                'members/' + generateIdentifier()
                    + '/extra',
                DEV_TOKEN,
            ),
            /not found|404/i,
        );
    },
);

test(
    'PUT with a malformed JSON body is 400 Bad'
    + ' Request, not 500',
    async () => {
        const db = await freshDb();
        const response = await handleRequest(
            db,
            new Request(
                'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/'
                    + 'fndCYAsXazdzMUlEGMNIZw',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type':
                            'application/json',
                        'Authorization':
                            'Bearer ' + DEV_TOKEN,
                        'operation-id':
                            TEST_OPERATION_ID,
                    },
                    body: '{not valid json',
                },
            ),
        );
        assert.equal(response.status, 400);
        const { error } =
            (await response.json()) as {
                error: string;
            };
        assert.match(error, /Invalid JSON body/);
        assert.match(error, /PUT/);
    },
);

test(
    'POST with a malformed JSON body is 400 Bad'
    + ' Request, not 500',
    async () => {
        const db = await freshDb();
        const response = await handleRequest(
            db,
            new Request(
                'http://localhost/identities/',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
                        'Authorization':
                            'Bearer ' + DEV_TOKEN,
                        'Operation-ID':
                            TEST_OPERATION_ID,
                    },
                    body: '{not valid json',
                },
            ),
        );
        assert.equal(response.status, 400);
        const { error } =
            (await response.json()) as {
                error: string;
            };
        assert.match(error, /Invalid JSON body/);
        assert.match(error, /POST/);
    },
);

test(
    'the 500 fallback body never carries fault detail',
    async () => {
        const db = await freshDb();
        // GET ideas is flipped (Phase 2 Task 5): it derives from
        // the message ledger, never db.ideas, so the fault must
        // be forced from the store the derivation actually reads.
        // Task 8 (Phase 11): the fence's own
        // default-organization fallback
        // ALSO derives from db.pairs now
        // (identityDefaultOrganization / deriveDefaultOrganization)
        // — so the fault is targeted at the ideas prefix alone,
        // letting the fence's own read through to the real
        // implementation unaffected.
        const original = db.pairs.getAllWhere.bind(db.pairs);
        (db.pairs as unknown as {
            getAllWhere: (
                column: string, key: string,
            ) => ReturnType<typeof original>;
        }).getAllWhere = async (column, key) => {
            if (key === '/organizations/AjdvjuECVZEgZoFajaIEkg/ideas/') {
                throw new Error('secret fault detail');
            }
            return original(column, key);
        };
        const { result: response, calls } =
            await captureConsole(
                'error',
                () => handleRequest(
                    db,
                    new Request('http://localhost/organizations/'
                        + 'AjdvjuECVZEgZoFajaIEkg/ideas/', {
                        headers: {
                            'Authorization':
                                'Bearer ' + DEV_TOKEN,
                        },
                    }),
                ),
            );
        assert.equal(response.status, 500);
        const { error } =
            (await response.json()) as {
                error: string;
            };
        assert.equal(error, 'internal error');
        assert.ok(
            calls.some(args =>
                args.includes('request failed')),
            'the domain-boundary catch must keep'
            + ' console evidence',
        );
    },
);

test(
    'PUT with valid-JSON non-object bodies is 400'
    + ' Bad Request, not 500',
    async () => {
        const db = await freshDb();
        for (const raw of [
            'null', '42', '"text"', '[1,2,3]',
        ]) {
            const response = await handleRequest(
                db,
                new Request(
                    'http://localhost/organizations/AjdvjuECVZEgZoFajaIEkg/'
                        + 'ideas/fndCYAsXazdzMUlEGMNIZw',
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type':
                                'application/json',
                            'Authorization':
                                'Bearer ' + DEV_TOKEN,
                            'operation-id':
                                TEST_OPERATION_ID,
                        },
                        body: raw,
                    },
                ),
            );
            assert.equal(
                response.status, 400,
                'body ' + raw,
            );
            const { error } =
                (await response.json()) as {
                    error: string;
                };
            assert.match(
                error, /Invalid JSON body/,
            );
        }
    },
);
