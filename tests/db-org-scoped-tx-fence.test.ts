import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { orgScopedAdapter } from '../api/db-org-scoped.ts';

function ideaBody(org: string, title: string) {
    return {
        organization_id: org, title,
        position: 0, problem_statement: '',
        target_users: '', proposed_solution: '',
        expected_outcome: '', success_metrics: '',
    };
}

async function seeded() {
    const db = new MemoryDbAdapter();
    await db.createSchema();
    await db.ideas.put('a1', ideaBody('A', 'mine'));
    await db.ideas.put('b1', ideaBody('B', 'theirs'));
    return db;
}

test(
    'an org-scoped tx commits a write stamped to the org',
    async () => {
        const db = await seeded();
        const scoped = orgScopedAdapter(db, 'A');
        await scoped.transaction(
            ['ideas', 'states'],
            (view) => view.ideas.put(
                'a2', ideaBody('B', 'forged'),
            ),
        );
        const row = await db.ideas.getById('a2');
        assert.equal(row.organization_id, 'A');
    },
);

test(
    'an org-scoped tx rolls back on throw',
    async () => {
        const db = await seeded();
        const scoped = orgScopedAdapter(db, 'A');
        await assert.rejects(
            () => scoped.transaction(
                ['ideas', 'states'],
                async (view) => {
                    await view.ideas.put(
                        'a2', ideaBody('A', 'new'),
                    );
                    throw new Error('boom');
                },
            ),
            /boom/,
        );
        await assert.rejects(() => db.ideas.getById('a2'));
    },
);

test(
    'the write fence rides inside the tx, 404ing a '
    + 'foreign id',
    async () => {
        const db = await seeded();
        const scoped = orgScopedAdapter(db, 'A');
        // b1 belongs to org B; the in-tx #assertWritable
        // read must 404 it, aborting the write.
        await assert.rejects(
            () => scoped.transaction(
                ['ideas', 'states'],
                (view) => view.ideas.put(
                    'b1', ideaBody('A', 'steal'),
                ),
            ),
        );
        const row = await db.ideas.getById('b1');
        assert.equal(row.organization_id, 'B');
    },
);
