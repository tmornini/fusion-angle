import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

test('TABLE_NAMES includes the objective tables', () => {
    const expected = [
        'objectives',
        'objective_revisions',
        'project_objective_baseline_scores',
        'project_objective_actual_scores',
    ];
    for (const name of expected) {
        assert.ok(
            TABLE_NAMES.includes(name),
            `TABLE_NAMES missing ${name}`,
        );
    }
});

test('MemoryDbAdapter exposes objective stores',
    async () => {
        const db = new MemoryDbAdapter();
        await db.postSchemaCreation();
        await db.objectives.put('o1', {
            organization_id: '1', position: 0,
        });
        const all = await db.objectives.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'o1');

        await db.objectiveRevisions.put('o1:t1', {
            objective_id: 'o1',
            name: 'Revenue',
            description: 'd',
            member_id: 'w1',
            at: '2026-05-14T00:00:00.000000Z',
        });
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);

        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1', {
                project_id: 'p1',
                objective_id: 'o1',
                score: 42,
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000000Z',
            },
        );
        const bs = await
            db.projectObjectiveBaselineScores.getAll();
        assert.equal(bs.length, 1);

        await db.projectObjectiveActualScores.put(
            'p1:o1:t2', {
                project_id: 'p1',
                objective_id: 'o1',
                score: -10,
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000000Z',
            },
        );
        const ac = await
            db.projectObjectiveActualScores.getAll();
        assert.equal(ac.length, 1);
    });

test('TABLE_NAMES includes the message tables', () => {
    assert.ok(TABLE_NAMES.includes('requests'));
    assert.ok(TABLE_NAMES.includes('responses'));
});

test('MemoryDbAdapter exposes message stores', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await db.requests.put('pair-1', {
        uri_prefix: '/organizations/1/ideas/',
        uri_id: '42',
        at: '2026-01-01T00:00:00.000000Z',
        requester_identity_id: 'current',
        message_hash: 'a'.repeat(64),
        message: '{"kind":"request"}',
    });
    const rows = await db.requests.getAll();
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 'pair-1');
});
