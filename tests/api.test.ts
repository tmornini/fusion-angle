import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, POST,
    handleRequest,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    seedHumanMember,
    seedAIMember,
} from './member-fixtures.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    seedAdminSchema,
} from './test-fixtures.ts';

async function freshDb() {
    const db = new MemoryDbAdapter();
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
        await GET<unknown[]>(db, 'ideas', DEV_TOKEN);
    assert.deepEqual(ideas, []);
});

test('GET ideas/:id throws on missing', async () => {
    const db = await freshDb();
    await assert.rejects(
        () => GET(db, 'ideas/missing-id', DEV_TOKEN),
        /Not found|404/,
    );
});

test('PUT then GET round-trips an entity', async () => {
    const db = await freshDb();
    const payload = {
        id: 'i1',
        organization_id: '1',
        title: 'Test',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
    await PUT(db, 'ideas/i1', payload, DEV_TOKEN);
    const fetched =
        await GET<{ title: string }>(
            db, 'ideas/i1', DEV_TOKEN,
        );
    assert.equal(fetched.title, 'Test');
});

test('GET ideas/ normalizes to collection', async () => {
    const db = await freshDb();
    const result =
        await GET<unknown[]>(db, 'ideas/', DEV_TOKEN);
    assert.deepEqual(result, []);
});

test(
    'GET members returns the persisted humans',
    async () => {
        const db = await freshDb();
        await seedHumanMember(db, 'hw_1', 'Sarah Chen');
        const members =
            await GET<unknown[]>(db, 'members', DEV_TOKEN);
        assert.equal(members.length, 1);
    },
);

test(
    'GET ai-members returns persisted AIs',
    async () => {
        const db = await freshDb();
        await seedAIMember(db, 'ai_1', 'Opus');
        const ais =
            await GET<unknown[]>(
                db, 'ai-members', DEV_TOKEN);
        assert.equal(ais.length, 1);
    },
);

test(
    'PUT ai-members/:id validates body',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => PUT(db, 'ai-members/ai_1', {
                rogue_field: 'extra',
            }, DEV_TOKEN),
            /unexpected key|missing/,
        );
    },
);

test(
    'POST snapshots/mock-data populates the'
    + ' tables',
    async () => {
        const db = await freshDb();
        await POST(
            db, 'snapshots/mock-data', {}, DEV_TOKEN,
        );
        const members =
            await GET<unknown[]>(db, 'members', DEV_TOKEN);
        assert.ok(members.length > 0);
    },
);

test(
    'POST on a route with no post handler is'
    + ' 405 Method Not Allowed',
    async () => {
        const db = await freshDb();
        await assert.rejects(
            () => POST(db, 'ideas', {}, DEV_TOKEN),
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
            () => GET(db, 'members/w-1/extra', DEV_TOKEN),
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
                'http://localhost/ideas/i1',
                {
                    method: 'PUT',
                    headers: {
                        'Content-Type':
                            'application/json',
                        'Authorization':
                            'Bearer ' + DEV_TOKEN,
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
                'http://localhost/snapshots/'
                + 'mock-data',
                {
                    method: 'POST',
                    headers: {
                        'Content-Type':
                            'application/json',
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
