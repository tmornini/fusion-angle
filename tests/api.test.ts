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

test(
    'GET roles returns the persisted roles',
    async () => {
        const db = new MemoryDbAdapter();
        await db.roles.put('r-eng', {
            name: 'Engineering',
            description: '',
            created_at: '2026-01-01T00:00:00Z',
        });
        const roles =
            await GET<unknown[]>(db, 'roles');
        assert.equal(roles.length, 1);
    },
);

test(
    'PUT roles/:id validates body',
    async () => {
        const db = new MemoryDbAdapter();
        await assert.rejects(
            () => PUT(db, 'roles/r-1', {
                rogue_field: 'extra',
            }),
            /unexpected key|missing/,
        );
    },
);

test(
    'DELETE roles/:id tombstones the role',
    async () => {
        const db = new MemoryDbAdapter();
        await db.roles.put('r-eng', {
            name: 'Engineering',
            description: '',
            created_at: '2026-01-01T00:00:00Z',
        });
        await DELETE(db, 'roles/r-eng');
        await assert.rejects(
            () => GET(db, 'roles/r-eng'),
            /Not found|404/,
        );
    },
);

test(
    'PUT role-memberships/:id validates body',
    async () => {
        const db = new MemoryDbAdapter();
        await assert.rejects(
            () => PUT(
                db, 'role-memberships/m-1', {
                    role_id: 'r-1',
                },
            ),
            /missing/,
        );
    },
);

test(
    'PUT then DELETE role-memberships/:id'
    + ' removes the row',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(
            db, 'role-memberships/m-1', {
                id: 'm-1',
                role_id: 'r-1',
                person_id: 'p-1',
                created_at:
                    '2026-01-01T00:00:00Z',
            },
        );
        const before =
            await GET<unknown[]>(
                db, 'role-memberships',
            );
        assert.equal(before.length, 1);
        await DELETE(
            db, 'role-memberships/m-1',
        );
        const after =
            await GET<unknown[]>(
                db, 'role-memberships',
            );
        assert.equal(after.length, 0);
    },
);

test(
    'GET models returns persisted models',
    async () => {
        const db = new MemoryDbAdapter();
        await db.models.put('m-1', {
            name: 'Opus',
            provider: 'Anthropic',
            description: '',
            created_at: '2026-01-01T00:00:00Z',
        });
        const models =
            await GET<unknown[]>(db, 'models');
        assert.equal(models.length, 1);
    },
);

test(
    'PUT models/:id validates body',
    async () => {
        const db = new MemoryDbAdapter();
        await assert.rejects(
            () => PUT(db, 'models/m-1', {
                rogue_field: 'extra',
            }),
            /unexpected key|missing/,
        );
    },
);

test(
    'PUT then DELETE role-model-memberships/:id'
    + ' removes the row',
    async () => {
        const db = new MemoryDbAdapter();
        await PUT(
            db,
            'role-model-memberships/m-1', {
                id: 'm-1',
                role_id: 'r-1',
                model_id: 'mod-1',
                created_at:
                    '2026-01-01T00:00:00Z',
            },
        );
        const before =
            await GET<unknown[]>(
                db, 'role-model-memberships',
            );
        assert.equal(before.length, 1);
        await DELETE(
            db, 'role-model-memberships/m-1',
        );
        const after =
            await GET<unknown[]>(
                db, 'role-model-memberships',
            );
        assert.equal(after.length, 0);
    },
);
