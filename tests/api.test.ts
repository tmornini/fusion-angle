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

test('GET on unknown route throws', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await assert.rejects(
        () => GET(db, 'nonexistent-table'),
        /Route not found|404|not found/i,
    );
});

test('GET ideas returns array', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const ideas =
        await GET<unknown[]>(db, 'ideas');
    assert.deepEqual(ideas, []);
});

test('GET ideas/:id throws on missing', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await assert.rejects(
        () => GET(db, 'ideas/missing-id'),
        /Not found|404/,
    );
});

test('PUT then GET round-trips an entity', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const payload = {
        id: 'i1',
        title: 'Test',
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
    await PUT(db, 'ideas/i1', payload);
    const fetched =
        await GET<{ title: string }>(
            db, 'ideas/i1',
        );
    assert.equal(fetched.title, 'Test');
});

test('GET ideas/ normalizes to collection', async () => {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    const result =
        await GET<unknown[]>(db, 'ideas/');
    assert.deepEqual(result, []);
});

test(
    'GET members returns the persisted humans',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedHumanMember(db, 'hw_1', 'Sarah Chen');
        const members =
            await GET<unknown[]>(db, 'members');
        assert.equal(members.length, 1);
    },
);

test(
    'GET ai-members returns persisted AIs',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await seedAIMember(db, 'ai_1', 'Opus');
        const ais =
            await GET<unknown[]>(db, 'ai-members');
        assert.equal(ais.length, 1);
    },
);

test(
    'PUT ai-members/:id validates body',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await assert.rejects(
            () => PUT(db, 'ai-members/ai_1', {
                rogue_field: 'extra',
            }),
            /unexpected key|missing/,
        );
    },
);

test(
    'POST snapshots/mock-data populates the'
    + ' tables',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await POST(
            db, 'snapshots/mock-data', {},
        );
        const members =
            await GET<unknown[]>(db, 'members');
        assert.ok(members.length > 0);
    },
);

test(
    'POST on a route with no post handler is'
    + ' 405 Method Not Allowed',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await assert.rejects(
            () => POST(db, 'ideas', {}),
            /not allowed/i,
        );
    },
);

test(
    'POST on an unknown route is 404',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await assert.rejects(
            () => POST(
                db, 'no-such-resource', {},
            ),
            /not found|404/i,
        );
    },
);

test(
    'a path with the wrong number of segments'
    + ' matches no route and is 404',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        await assert.rejects(
            () => GET(db, 'members/w-1/extra'),
            /not found|404/i,
        );
    },
);

test(
    'PUT with a malformed JSON body is 400 Bad'
    + ' Request, not 500',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
        const response = await handleRequest(
            db,
            new Request(
                'http://localhost/ideas/i1',
                {
                    method: 'PUT',
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
        assert.match(error, /PUT/);
    },
);

test(
    'POST with a malformed JSON body is 400 Bad'
    + ' Request, not 500',
    async () => {
        const db = new MemoryDbAdapter();
        await db.createSchema();
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
