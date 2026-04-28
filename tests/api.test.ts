import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    initApi, resetApi, GET, PUT, DELETE,
} from '../api/api.ts';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';

function setup(): MemoryDbAdapter {
    const db = new MemoryDbAdapter();
    resetApi();
    initApi(db);
    return db;
}

test('GET on unknown route throws', async () => {
    setup();
    await assert.rejects(
        () => GET('nonexistent-table'),
        /Route not found|404|not found/i,
    );
});

test('GET ideas returns array', async () => {
    setup();
    const ideas =
        await GET<unknown[]>('ideas');
    assert.deepEqual(ideas, []);
});

test('GET ideas/:id throws on missing', async () => {
    setup();
    await assert.rejects(
        () => GET('ideas/missing-id'),
        /Not found|404/,
    );
});

test('PUT then GET round-trips an entity', async () => {
    setup();
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
    await PUT('ideas/i1', payload);
    const fetched =
        await GET<{ title: string }>(
            'ideas/i1',
        );
    assert.equal(fetched.title, 'Test');
});

test('DELETE marks entity tombstoned', async () => {
    const db = setup();
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
    await DELETE('ideas/i1');
    await assert.rejects(
        () => GET('ideas/i1'),
        /Not found|404/,
    );
});

test('GET ideas/ normalizes to collection', async () => {
    setup();
    const result =
        await GET<unknown[]>('ideas/');
    assert.deepEqual(result, []);
});

test('initApi twice throws', () => {
    setup();
    assert.throws(
        () => initApi(
            new MemoryDbAdapter(),
        ),
        /already called/,
    );
});
