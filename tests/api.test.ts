import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, DELETE, POST,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';

test('GET on unknown route throws', async () => {
    const db = new MemoryDbAdapter();
    await assert.rejects(
        () => GET(db, 'nonexistent-table'),
        /Route not found|404|not found/i,
    );
});

test('GET ideas returns array', async () => {
    const db = new MemoryDbAdapter();
    const ideas =
        await GET<unknown[]>(db, 'ideas');
    assert.deepEqual(ideas, []);
});

test('GET ideas/:id throws on missing', async () => {
    const db = new MemoryDbAdapter();
    await assert.rejects(
        () => GET(db, 'ideas/missing-id'),
        /Not found|404/,
    );
});

test('PUT then GET round-trips an entity', async () => {
    const db = new MemoryDbAdapter();
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

test('DELETE marks entity tombstoned', async () => {
    const db = new MemoryDbAdapter();
    await db.ideas.put('i1', {
        title: 'Test', position: 1,
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
    });
    await DELETE(db, 'ideas/i1');
    await assert.rejects(
        () => GET(db, 'ideas/i1'),
        /Not found|404/,
    );
});

test('GET ideas/ normalizes to collection', async () => {
    const db = new MemoryDbAdapter();
    const result =
        await GET<unknown[]>(db, 'ideas/');
    assert.deepEqual(result, []);
});

test(
    'GET workers returns the persisted humans',
    async () => {
        const db = new MemoryDbAdapter();
        await db.workers.put('hw_1', {
            first_name: 'Sarah',
            last_name: 'Chen',
            email: 'sarah@example.com',
            phone: '',
            title: 'Engineer',
            department: 'Eng',
            strengths: '[]' as never,
            team_dimensions: '{}' as never,
            bio: '',
        });
        const workers =
            await GET<unknown[]>(db, 'workers');
        assert.equal(workers.length, 1);
    },
);

test(
    'GET ai-workers returns persisted AIs',
    async () => {
        const db = new MemoryDbAdapter();
        await db.aiWorkers.put('ai_1', {
            name: 'Opus',
            provider: 'Anthropic',
            description: '',
            auth_token: 'sk-real-token',
        });
        const ais =
            await GET<unknown[]>(db, 'ai-workers');
        assert.equal(ais.length, 1);
    },
);

test(
    'PUT ai-workers/:id validates body',
    async () => {
        const db = new MemoryDbAdapter();
        await assert.rejects(
            () => PUT(db, 'ai-workers/ai_1', {
                rogue_field: 'extra',
            }),
            /unexpected key|missing/,
        );
    },
);

test(
    'DELETE ai-workers/:id splices the row',
    async () => {
        const db = new MemoryDbAdapter();
        await db.aiWorkers.put('ai_1', {
            name: 'Opus',
            provider: 'Anthropic',
            description: '',
            auth_token: 'sk-real-token',
        });
        await DELETE(db, 'ai-workers/ai_1');
        await assert.rejects(
            () => GET(db, 'ai-workers/ai_1'),
            /Not found|404/,
        );
    },
);

test(
    'POST snapshots/mock-data populates the'
    + ' tables',
    async () => {
        const db = new MemoryDbAdapter();
        await POST(
            db, 'snapshots/mock-data', {},
        );
        const workers =
            await GET<unknown[]>(db, 'workers');
        assert.ok(workers.length > 0);
    },
);

test(
    'POST on a route with no post handler is'
    + ' 405 Method Not Allowed',
    async () => {
        const db = new MemoryDbAdapter();
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
        await assert.rejects(
            () => GET(db, 'workers/w-1/extra'),
            /not found|404/i,
        );
    },
);
