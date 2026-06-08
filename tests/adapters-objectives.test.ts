import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    getObjective,
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveRevisions,
    getObjectiveArchivalEvents,
    getActiveObjectives,
    getCurrentObjectiveDefinition,
    getObjectiveDefinitionAt,
    postObjectiveCreation,
    postObjectiveRevision,
    postObjectiveArchival,
    postObjectiveReactivation,
    putObjectivePosition,
} from '../web-app/app/adapters/objectives.ts';
import {
    computeNewPosition,
} from '../web-app/app/drag-reorder-positions.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

function ctxFor(db: MemoryDbAdapter) {
    return createRequestContext(db, DEV_TOKEN);
}

function objective(position: number) {
    return { organization_id: '1', position };
}

test('getObjective returns a single row', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.objectives.put('o1', objective(0));
    const ctx = ctxFor(db);
    const v = await getObjective(ctx, 'o1');
    assert.equal(v.id, 'o1');
    assert.equal(v.position, 0);
});

test('getObjectives returns all', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.objectives.put('o1', objective(0));
    await db.objectives.put('o2', objective(1));
    const ctx = ctxFor(db);
    const rows = await getObjectives(ctx);
    assert.equal(rows.length, 2);
});

test('getArchivedObjectiveIds returns a Set', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.objectives.put('o1', objective(0));
    await db.states.record(
        'e1', 'o1', 'archived', 'system',
    );
    const ctx = ctxFor(db);
    const ids = await getArchivedObjectiveIds(ctx);
    assert.ok(ids.has('o1'));
    assert.equal(ids.size, 1);
});

test('getArchivedObjectiveIds excludes an archived project',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectives.put('o1', objective(0));
        await db.states.record(
            'e-o1', 'o1', 'archived', 'system',
        );
        await db.states.record(
            'e-p1', 'proj-1', 'archived', 'system',
        );
        const ctx = ctxFor(db);
        const ids = await getArchivedObjectiveIds(ctx);
        assert.ok(ids.has('o1'));
        assert.ok(!ids.has('proj-1'));
        assert.equal(ids.size, 1);
    });

test('getObjectiveArchivalEvents surfaces the actor',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectives.put('o1', objective(0));
        await db.states.record(
            'e1', 'o1', 'archived', 'w-sarah',
        );
        const ctx = ctxFor(db);
        const events =
            await getObjectiveArchivalEvents(ctx);
        assert.equal(events.length, 1);
        assert.equal(events[0]!.memberId, 'w-sarah');
    });

test('getObjectiveRevisions returns all for an objective',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Income',
                description: 'd',
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1',
                name: 'Increase incomes',
                description: 'd2',
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o2:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o2',
                name: 'Expense',
                description: 'd',
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000Z',
            },
        );
        const ctx = ctxFor(db);
        const revs = await getObjectiveRevisions(ctx, 'o1');
        assert.equal(revs.length, 2);
        for (const r of revs) {
            assert.equal(r.objective_id, 'o1');
        }
    });

test('getActiveObjectives filters archived',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectives.put('o1', objective(0));
        await db.objectives.put('o2', objective(1));
        await db.states.record(
            'e1', 'o2', 'archived', 'system',
        );
        const ctx = ctxFor(db);
        const active = await getActiveObjectives(ctx);
        assert.equal(active.length, 1);
        assert.equal(active[0]!.id, 'o1');
    });

test('getCurrentObjectiveDefinition returns latest revision',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000Z',
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
        await seedAdminSchema(db);
        await db.objectiveRevisions.put(
            'o1:2026-05-14T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'Old',
                description: 'd1',
                member_id: 'w1',
                at: '2026-05-14T00:00:00.000Z',
            },
        );
        await db.objectiveRevisions.put(
            'o1:2026-05-15T00:00:00.000Z',
            {
                objective_id: 'o1', name: 'New',
                description: 'd2',
                member_id: 'w1',
                at: '2026-05-15T00:00:00.000Z',
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
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Income', 'Top line', 0,
        );
        const o = await db.objectives.getById('o1');
        assert.equal(o.id, 'o1');
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 1);
        assert.equal(revs[0]!.name, 'Income');
        assert.equal(revs[0]!.member_id, 'current');
    });

test('postObjectiveRevision appends a revision row',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Income', 'd1', 0,
        );
        await postObjectiveRevision(
            ctx, 'o1', 'Increase incomes', 'd2',
        );
        const revs = await db.objectiveRevisions.getAll();
        assert.equal(revs.length, 2);
        for (const r of revs) {
            assert.equal(r.member_id, 'current');
        }
    });

test('postObjectiveArchival archives an objective',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Income', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'o1');
        const ids = await getArchivedObjectiveIds(ctx);
        assert.equal(ids.size, 1);
        assert.ok(ids.has('o1'));
    });

test('postObjectiveReactivation returns objective to active list',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const active = await getActiveObjectives(ctx);
        assert.ok(
            active.some(o => o.id === 'o1'),
            'objective must return to active list',
        );
        const archived =
            await getArchivedObjectiveIds(ctx);
        assert.equal(archived.size, 0,
            'reactivation supersedes archival in '
            + 'latest-by-at query');
    });

test('reactivation does not emit a deleted state event',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'Rev', 'd', 0,
        );
        await postObjectiveArchival(ctx, 'o1');
        await postObjectiveReactivation(ctx, 'o1');
        const deleted = await db.states.deletedIds();
        assert.ok(!deleted.has('o1'),
            'reactivation must appear in the states'
            + ' log as active, never as deleted');
    });

test(
    'putObjectivePosition writes the fractional'
    + ' value without renumbering its peers',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 3,
        );

        await putObjectivePosition(ctx, 'o2', 0.5);

        const all = await db.objectives.getAll();
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o2'), 0.5);
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o3'), 3);
    },
);

test(
    'computeNewPosition + putObjectivePosition'
    + ' wedge an item into the middle without'
    + ' renumbering anyone',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 3,
        );

        const active = await getActiveObjectives(ctx);
        const others = active.filter(
            o => o.id !== 'o3',
        );
        const newPos = computeNewPosition(
            others.map(o => o.position),
            1,
        );
        await putObjectivePosition(
            ctx, 'o3', newPos,
        );

        const all = await db.objectives.getAll();
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o3'), 1.5);
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o2'), 2);
    },
);

test(
    'putObjectivePosition preserves adjacent'
    + ' fractional values across sequential'
    + ' reorders',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await seedCurrentMember(db);
        const ctx = ctxFor(db);
        await postObjectiveCreation(
            ctx, 'o1', 'A', 'd', 1,
        );
        await postObjectiveCreation(
            ctx, 'o2', 'B', 'd', 2,
        );
        await postObjectiveCreation(
            ctx, 'o3', 'C', 'd', 3,
        );

        await putObjectivePosition(ctx, 'o2', 1.5);
        await putObjectivePosition(ctx, 'o3', 1.25);

        const all = await db.objectives.getAll();
        const map = new Map(
            all.map(o => [o.id, o.position]),
        );
        assert.equal(map.get('o1'), 1);
        assert.equal(map.get('o3'), 1.25);
        assert.equal(map.get('o2'), 1.5);
    },
);
