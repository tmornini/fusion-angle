import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { TABLE_NAMES } from '../api/db.ts';
import { MemoryDbAdapter } from '../api/db-memory.ts';

test('TABLE_NAMES includes the five new tables', () => {
    const expected = [
        'objectives',
        'objective_revisions',
        'deprecated_objectives',
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

test('MemoryDbAdapter exposes the five new EntityStores',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectives.put('o1', { position: 0 });
        const all = await db.objectives.getAll();
        assert.equal(all.length, 1);
        assert.equal(all[0]!.id, 'o1');

        await db.objectiveRevisions.put('o1:t1', {
            objective_id: 'o1',
            name: 'Revenue',
            description: 'd',
            revised_at: '2026-05-14T00:00:00.000Z',
        });
        const revs =
            await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);

        await db.deprecatedObjectives.put('o1', {
            objective_id: 'o1',
            deprecated_at: '2026-05-14T00:00:00.000Z',
        });
        const deps =
            await db.deprecatedObjectives.getAll();
        assert.equal(deps.length, 1);

        await db.projectObjectiveBaselineScores.put(
            'p1:o1:t1', {
                project_id: 'p1',
                objective_id: 'o1',
                score: 42,
                scored_at: '2026-05-14T00:00:00.000Z',
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
                scored_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ac = await
            db.projectObjectiveActualScores.getAll();
        assert.equal(ac.length, 1);
    });
