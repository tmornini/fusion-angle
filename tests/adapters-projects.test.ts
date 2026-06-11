import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getProjectEntities,
    getProjects,
    getProjectEntity,
    postProjectStateChange,
    putProject,
    ProjectView,
} from '../web-app/app/adapters/projects.ts';
import {
    Project,
    COST_DIVISOR,
} from '../api/types.ts';
import type {
    ProjectEntity,
    ProjectState,
} from '../api/types.ts';
import {
    seedCurrentMember,
    seedHumanMember,
} from './member-fixtures.ts';

function buildProject(
    id: string,
    title: string,
    overrides?: Partial<ProjectEntity>,
): Omit<ProjectEntity, 'id'> {
    const base: Omit<ProjectEntity, 'id'> = {
        organization_id: '1',
        title,
        description: 'desc for ' + title,
        progress: 25,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 50000,
        actual_cost: 12000,
        position: 1,
    };
    const { id: _drop, ...rest } = {
        ...base, ...overrides, id,
    } as ProjectEntity;
    return rest;
}

async function seedProject(
    db: MemoryDbAdapter,
    id: string,
    title: string,
    state: ProjectState = 'approved',
    overrides?: Partial<ProjectEntity>,
): Promise<void> {
    await db.projects.put(
        id, buildProject(id, title, overrides),
    );
    await db.states.postEvent(
        `st-${id}`, id, state, 'system',
    );
}

test(
    'getProjectEntity round-trips all fields',
    async () => {
        const { db, ctx } = await adminContext();
        await db.projects.put('p1', buildProject(
            'p1', 'Alpha', {
                progress: 73,
                estimated_cost: 99000,
            },
        ));
        const row = await getProjectEntity(ctx, 'p1');
        assert.equal(row.id, 'p1');
        assert.equal(row.title, 'Alpha');
        assert.equal(row.description, 'desc for Alpha');
        assert.equal(row.progress, 73);
        assert.equal(row.start_date, '2026-01-01');
        assert.equal(
            row.target_end_date, '2026-12-31',
        );
        assert.equal(row.estimated_cost, 99000);
        assert.equal(row.actual_cost, 12000);
        assert.equal(row.position, 1);
    },
);

test(
    'getProjectEntity rejects for missing id',
    async () => {
        const { ctx } = await adminContext();
        await assert.rejects(
            () => getProjectEntity(ctx, 'nope'),
            /Not found/,
        );
    },
);

test(
    'getProjectEntities returns persisted rows',
    async () => {
        const { db, ctx } = await adminContext();
        await db.projects.put(
            'p1', buildProject('p1', 'Alpha'),
        );
        await db.projects.put(
            'p2', buildProject('p2', 'Beta'),
        );
        const rows = await getProjectEntities(ctx);
        assert.equal(rows.length, 2);
        const titles = rows
            .map(r => r.title)
            .sort();
        assert.deepEqual(titles, ['Alpha', 'Beta']);
    },
);

test(
    'getProjectEntities returns empty on empty db',
    async () => {
        const { ctx } = await adminContext();
        const rows = await getProjectEntities(ctx);
        assert.deepEqual(rows, []);
    },
);

test(
    'getProjects wraps rows in Project objects',
    async () => {
        const { db, ctx } = await adminContext();
        await seedProject(db, 'p1', 'Alpha');
        const projects = await getProjects(ctx);
        assert.equal(projects.length, 1);
        assert.ok(projects[0] instanceof Project);
        assert.equal(
            projects[0]?.titleText(), 'Alpha',
        );
        assert.equal(
            projects[0]?.stateValue(), 'approved',
        );
    },
);

test(
    'getProjects excludes deleted-state rows',
    async () => {
        const { db, ctx } = await adminContext();
        await seedProject(db, 'keep', 'Keep');
        await seedProject(
            db, 'gone', 'Gone', 'deleted',
        );
        const projects = await getProjects(ctx);
        assert.equal(projects.length, 1);
        assert.equal(
            projects[0]?.titleText(), 'Keep',
        );
    },
);

test(
    'getProjects excludes tombstoned rows',
    async () => {
        const { db, ctx } = await adminContext();
        await seedProject(db, 'keep', 'Keep');
        await seedProject(db, 'gone', 'Gone');
        await db.projects.delete('gone');
        const projects = await getProjects(ctx);
        assert.equal(projects.length, 1);
        assert.equal(
            projects[0]?.titleText(), 'Keep',
        );
        const rows = await getProjectEntities(ctx);
        assert.equal(rows.length, 1);
    },
);

test('putProject persists a new project', async () => {
    const { db, ctx } = await adminContext();
    await putProject(
        ctx, 'p1', buildProject('p1', 'Created'),
    );
    const stored = await db.projects.getById('p1');
    assert.equal(stored.title, 'Created');
});

test('putProject updates an existing project', async () => {
    const { db, ctx } = await adminContext();
    await db.projects.put(
        'p1', buildProject('p1', 'Before'),
    );
    await putProject(ctx, 'p1', buildProject(
        'p1', 'After', {
            progress: 100,
        },
    ));
    const stored = await db.projects.getById('p1');
    assert.equal(stored.title, 'After');
    assert.equal(stored.progress, 100);
});

test(
    'putProject changes are visible to a fresh ctx',
    async () => {
        const { db, ctx } = await adminContext();
        await putProject(ctx, 'p1', buildProject(
            'p1', 'Persisted',
        ));
        const fresh = createRequestContext(db, await devToken());
        const row = await getProjectEntity(fresh, 'p1');
        assert.equal(row.title, 'Persisted');
    },
);

test(
    'ProjectView exposes project display fields',
    () => {
        const project = new Project({
            ...buildProject('p1', 'Viewable', {
                start_date: '2026-01-01',
                target_end_date: '2026-12-31',
                estimated_cost: 4000,
                actual_cost: 2000,
            }),
            id: 'p1',
        }, 'approved');
        const view = new ProjectView(project, [], [], []);
        assert.equal(view.idForLink(), 'p1');
        assert.equal(view.titleText(), 'Viewable');
        assert.equal(view.stateValue(), 'approved');
        assert.equal(
            view.startDateValue(), '2026-01-01',
        );
        assert.equal(
            view.targetEndDateValue(), '2026-12-31',
        );
        assert.equal(
            view.costBaselineK(),
            4000 / COST_DIVISOR,
        );
        assert.equal(
            view.costActualK(),
            2000 / COST_DIVISOR,
        );
    },
);

test(
    'postProjectStateChange records a state event'
    + ' without touching the project row',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        await seedProject(
            db, 'p1', 'Original', 'approved',
        );
        const before =
            await db.projects.getById('p1');

        await postProjectStateChange(
            ctx, 'p1', 'archived',
        );

        const after =
            await db.projects.getById('p1');
        assert.deepEqual(after, before);
        const events = await db.states.getAllFor('p1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'archived',
        );
    },
);

test(
    'ProjectView timeBaselineDays spans the dates',
    () => {
        const project = new Project({
            ...buildProject('p1', 'Spanned', {
                start_date: '2026-01-01',
                target_end_date: '2026-01-11',
            }),
            id: 'p1',
        }, 'approved');
        const view = new ProjectView(project, [], [], []);
        assert.equal(view.timeBaselineDays(), 10);
    },
);
