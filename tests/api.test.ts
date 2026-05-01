import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    GET, PUT, DELETE,
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
        status: 'active',
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        readiness: 'ready',
        risks: '[]',
        assumptions: '[]',
        alignments: '[]',
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
        status: 'submitted',
        problem_statement: '',
        target_users: '',
        proposed_solution: '',
        expected_outcome: '',
        success_metrics: '',
        readiness: 'developing',
        risks: '[]', assumptions: '[]',
        alignments: '[]',
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
