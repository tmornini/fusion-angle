import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getObjective,
    getObjectives,
    getDeprecatedObjectiveIds,
    getObjectiveRevisions,
    getActiveObjectives,
    getCurrentObjectiveDefinition,
    getObjectiveDefinitionAt,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveDeprecation,
    postObjectiveReactivation,
    postObjectiveReordering,
} from '../web-app/app/adapters/objectives.ts';

function ctxFor(db: MemoryDbAdapter) {
    return createRequestContext(db);
}

async function seedCurrentWorker(
    db: MemoryDbAdapter,
): Promise<void> {
    await db.workers.put('current', {
        first_name: 'Demo',
        last_name: 'User',
        email: 'demo@example.com',
        phone: '',
        title: 'Admin',
        strengths: '[]' as never,
        team_dimensions: '{}' as never,
        bio: '',
        department: 'Product',
    });
}

test('getObjective returns a single row', async () => {
    const db = new MemoryDbAdapter();
    await db.objectives.put('o1', { position: 0 });
    const ctx = ctxFor(db);
    const v = await getObjective(ctx, 'o1');
    assert.equal(v.id, 'o1');
    assert.equal(v.position, 0);
});

test('getObjectives returns all', async () => {
    const db = new MemoryDbAdapter();
    await db.objectives.put('o1', { position: 0 });
    await db.objectives.put('o2', { position: 1 });
    const ctx = ctxFor(db);
    const rows = await getObjectives(ctx);
    assert.equal(rows.length, 2);
});

test('getDeprecatedObjectiveIds returns a Set', async () => {
    const db = new MemoryDbAdapter();
    await db.states.record(
        'e1', 'o1', 'deprecated', 'system',
    );
    const ctx = ctxFor(db);
    const ids = await getDeprecatedObjectiveIds(ctx);
    assert.ok(ids.has('o1'));
    assert.equal(ids.size, 1);
});

test('getObjectiveRevisions returns all for an objective',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Revenue',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Revenue Growth',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o2:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o2',
                name: 'Cost',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const revs = await getObjectiveRevisions(ctx, 'o1');
        assert.equal(revs.length, 2);
        for (const r of revs) {
            assert.equal(r.objective_id, 'o1');
        }
    });

test('getActiveObjectives filters deprecated',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectives.put('o1', { position: 0 });
        await db.objectives.put('o2', { position: 1 });
        await db.states.record(
            'e1', 'o2', 'deprecated', 'system',
        );
        const ctx = ctxFor(db);
        const active = await getActiveObjectives(ctx);
        assert.equal(active.length, 1);
        assert.equal(active[0]!.id, 'o1');
    });

test('getCurrentObjectiveDefinition returns latest revision',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const def = await getCurrentObjectiveDefinition(
            ctx, 'o1',
        );
        assert.equal(def.name, 'New');
        assert.equal(def.description, 'd2');
    });

test('getObjectiveDefinitionAt returns historical name',
    async () => {
        const db = new MemoryDbAdapter();
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                revised_at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                revised_at: '2026-05-15T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const histDef = await getObjectiveDefinitionAt(
            ctx, 'o1', '2026-05-14T12:00:00.000Z',
        );
        assert.equal(histDef.name, 'Old');
    });

test('postObjectiveCreation writes objective + revision',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'Top line', 0,
        );
        const o = await db.objectives.getById('o1');
        assert.equal(o.id, 'o1');
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);
        assert.equal(revs[0]!.name, 'Revenue');
    });

test('postObjectiveRevision appends a revision row',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'd1', 0,
        );
        await postObjectiveRevision(
            ctx, 'o1', 'Revenue Growth', 'd2',
        );
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 2);
    });

test('postObjectiveDeprecation deprecates an objective',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Revenue', 'd', 0,
        );
        await postObjectiveDeprecation(ctx, 'o1');
        const ids = await getDeprecatedObjectiveIds(ctx);
        assert.equal(ids.size, 1);
        assert.ok(ids.has('o1'));
    });

test('postObjectiveReactivation returns objective to active list',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveDeprecation(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const active = await getActiveObjectives(ctx);
        assert.ok(
            active.some(o => o.id === 'o1'),
            'objective must return to active list',
        );
        const deprecated =
            await getDeprecatedObjectiveIds(ctx);
        assert.equal(deprecated.size, 0,
            'reactivation supersedes deprecation in '
            + 'latest-by-at query');
    });

test('reactivation does not emit a deleted state event',
    async () => {
        const db = new MemoryDbAdapter();
        await seedCurrentWorker(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveDeprecation(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const deleted = await db.states.deletedIds();
        assert.ok(!deleted.has('o1'),
            'reactivation must appear in the states'
            + ' log as active, never as deleted');
    });

test('postObjectiveReordering updates positions',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 0,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 2,
        );
        await postObjectiveReordering(
            ctx, ['o3', 'o1', 'o2'],
        );
        const all = await db.objectives.getAll();
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o3'), 0);
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o2'), 2);
    });
