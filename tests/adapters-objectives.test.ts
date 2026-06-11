import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MemoryDbAdapter } from '../api/db-memory.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { DEV_TOKEN } from './token-fixtures.ts';
import {
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveRevisionsByObjective,
    getObjectiveArchivalEvents,
    getActiveObjectives,
    getCurrentObjectiveDefinitions,
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

test('getObjectives returns all', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.objectives.put('o1', objective(0));
    await db.objectives.put('o2', objective(1));
    const ctx = ctxFor(db);
    const rows = await getObjectives(ctx);
    assert.equal(rows.length, 2);
});

function revision(
    objectiveId: string,
    name: string,
    at: string,
) {
    return {
        objective_id: objectiveId,
        name,
        description: 'd:' + name,
        member_id: 'w1',
        at,
    };
}

test(
    'getObjectiveRevisionsByObjective groups one read',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectiveRevisions.put(
            'o1:t0',
            revision(
                'o1', 'A',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await db.objectiveRevisions.put(
            'o1:t1',
            revision(
                'o1', 'B',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await db.objectiveRevisions.put(
            'o2:t0',
            revision(
                'o2', 'C',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const grouped =
            await getObjectiveRevisionsByObjective(
                ctxFor(db),
            );
        assert.equal(grouped.size, 2);
        assert.equal(grouped.get('o1')!.length, 2);
        assert.equal(grouped.get('o2')!.length, 1);
    },
);

test(
    'getCurrentObjectiveDefinitions picks the latest'
    + ' revision per requested id',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.objectiveRevisions.put(
            'o1:t0',
            revision(
                'o1', 'Old',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        await db.objectiveRevisions.put(
            'o1:t1',
            revision(
                'o1', 'New',
                '2026-05-15T00:00:00.000000Z',
            ),
        );
        await db.objectiveRevisions.put(
            'o2:t0',
            revision(
                'o2', 'Other',
                '2026-05-14T00:00:00.000000Z',
            ),
        );
        const defs =
            await getCurrentObjectiveDefinitions(
                ctxFor(db), ['o1', 'o2'],
            );
        assert.equal(defs.get('o1')!.name, 'New');
        assert.equal(
            defs.get('o1')!.description, 'd:New',
        );
        assert.equal(defs.get('o2')!.name, 'Other');
    },
);

test(
    'getCurrentObjectiveDefinitions throws on an'
    + ' objective with no revisions',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await assert.rejects(
            getCurrentObjectiveDefinitions(
                ctxFor(db), ['ghost'],
            ),
            /no revisions for objective ghost/,
        );
    },
);

test('getArchivedObjectiveIds returns a Set', async () => {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    await db.objectives.put('o1', objective(0));
    await db.states.postEvent(
        'e1', 'o1', 'archived', 'system',
    );
    const ctx = ctxFor(db);
    const ids = await getArchivedObjectiveIds(ctx);
    assert.ok(ids.has('o1'));
    assert.equal(ids.size, 1);
});

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
