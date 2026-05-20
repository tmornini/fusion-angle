import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import {
    getProjectRows,
    getProjects,
    getProjectRow,
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

function buildProject(
    id: string,
    title: string,
    overrides?: Partial<ProjectEntity>,
): Omit<ProjectEntity, 'id'> {
    const base: Omit<ProjectEntity, 'id'> = {
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
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

function setupDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

test(
    'getProjectRow round-trips all fields',
    async () => {
        const { db, ctx } = setupDb();
        await db.projects.put('p1', buildProject(
            'p1', 'Alpha', {
                progress: 73,
                estimated_cost: 99000,
            },
        ));
        const row = await getProjectRow(ctx, 'p1');
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
    'getProjectRow rejects for missing id',
    async () => {
        const { ctx } = setupDb();
        await assert.rejects(
            () => getProjectRow(ctx, 'nope'),
            /Not found/,
        );
    },
);

test(
    'getProjectRows returns persisted rows',
    async () => {
        const { db, ctx } = setupDb();
        await db.projects.put(
            'p1', buildProject('p1', 'Alpha'),
        );
        await db.projects.put(
            'p2', buildProject('p2', 'Beta'),
        );
        const rows = await getProjectRows(ctx);
        assert.equal(rows.length, 2);
        const titles = rows
            .map(r => r.title)
            .sort();
        assert.deepEqual(titles, ['Alpha', 'Beta']);
    },
);

test(
    'getProjectRows returns empty on empty db',
    async () => {
        const { ctx } = setupDb();
        const rows = await getProjectRows(ctx);
        assert.deepEqual(rows, []);
    },
);

test(
    'getProjects wraps rows in Project objects',
    async () => {
        const { db, ctx } = setupDb();
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
        const { db, ctx } = setupDb();
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
        const { db, ctx } = setupDb();
        await seedProject(db, 'keep', 'Keep');
        await seedProject(db, 'gone', 'Gone');
        await db.projects.delete('gone');
        const projects = await getProjects(ctx);
        assert.equal(projects.length, 1);
        assert.equal(
            projects[0]?.titleText(), 'Keep',
        );
        const rows = await getProjectRows(ctx);
        assert.equal(rows.length, 1);
    },
);

test('putProject persists a new project', async () => {
    const { db, ctx } = setupDb();
    await putProject(
        ctx, 'p1', buildProject('p1', 'Created'),
    );
    const stored = await db.projects.getById('p1');
    assert.equal(stored.title, 'Created');
});

test('putProject updates an existing project', async () => {
    const { db, ctx } = setupDb();
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
        const { db, ctx } = setupDb();
        await putProject(ctx, 'p1', buildProject(
            'p1', 'Persisted',
        ));
        const fresh = createRequestContext(db);
        const row = await getProjectRow(fresh, 'p1');
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
        const view = new ProjectView(project);
        assert.equal(view.idForLink(), 'p1');
        assert.equal(view.titleText(), 'Viewable');
        assert.equal(view.stateValue(), 'approved');
        assert.equal(view.stateLabel(), 'Approved');
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
            view.costCurrentK(),
            2000 / COST_DIVISOR,
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
        const view = new ProjectView(project);
        assert.equal(view.timeBaselineDays(), 10);
    },
);
