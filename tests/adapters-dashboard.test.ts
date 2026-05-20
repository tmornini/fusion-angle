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
    getDashboardStats,
    getDashboardGauges,
} from '../web-app/app/adapters/dashboard.ts';
import type {
    IdeaEntity,
    ProjectEntity,
    ProjectState,
    FlowEntity,
    JsonObjectField,
} from '../api/types.ts';

function setupDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

function buildIdea(
    id: string,
): Omit<IdeaEntity, 'id'> {
    return {
        title: 'Idea ' + id,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

async function seedIdea(
    db: MemoryDbAdapter,
    id: string,
    state: string,
): Promise<void> {
    await db.ideas.put(id, buildIdea(id));
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

function buildProject(
    id: string,
    overrides?: Partial<ProjectEntity>,
): Omit<ProjectEntity, 'id'> {
    const base: Omit<ProjectEntity, 'id'> = {
        title: 'Project ' + id,
        description: 'd',
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-01-11',
        estimated_cost: 1000,
        actual_cost: 500,
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
    state: ProjectState,
    overrides?: Partial<ProjectEntity>,
): Promise<void> {
    await db.projects.put(
        id, buildProject(id, overrides),
    );
    await db.states.record(
        `st-${id}`, id, state, 'system',
    );
}

const EMPTY_GRAPH =
    '{"nodes":[],"edges":[]}' as JsonObjectField;

function buildFlow(
    id: string,
): Omit<FlowEntity, 'id'> {
    return {
        name: 'Flow ' + id,
        description: '',
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: 28800,
        graph: EMPTY_GRAPH,
    };
}

test(
    'getDashboardStats labels Ideas, Projects, Flows',
    async () => {
        const { ctx } = setupDb();
        const stats = await getDashboardStats(ctx);
        assert.deepEqual(
            stats.map(s => s.label),
            ['Ideas', 'Projects', 'Flows'],
        );
    },
);

test(
    'getDashboardStats is all zeros on empty db',
    async () => {
        const { ctx } = setupDb();
        const stats = await getDashboardStats(ctx);
        assert.deepEqual(
            stats.map(s => s.value),
            [0, 0, 0],
        );
    },
);

test(
    'getDashboardStats counts seeded entities',
    async () => {
        const { db, ctx } = setupDb();
        await seedIdea(db, 'i1', 'active:ready');
        await seedIdea(db, 'i2', 'in-review');
        await seedProject(db, 'p1', 'approved');
        await db.flows.put('f1', buildFlow('f1'));
        await db.flows.put('f2', buildFlow('f2'));
        const stats = await getDashboardStats(ctx);
        assert.deepEqual(
            stats.map(s => s.value),
            [2, 1, 2],
        );
    },
);

test(
    'getDashboardStats excludes archived ideas',
    async () => {
        const { db, ctx } = setupDb();
        await seedIdea(db, 'i1', 'active:ready');
        await seedIdea(db, 'i2', 'archived');
        await seedIdea(db, 'i3', 'deleted');
        const stats = await getDashboardStats(ctx);
        const ideas = stats
            .find(s => s.label === 'Ideas');
        assert.equal(ideas?.value, 1);
    },
);

test(
    'getDashboardStats excludes deleted projects',
    async () => {
        const { db, ctx } = setupDb();
        await seedProject(db, 'p1', 'approved');
        await seedProject(db, 'p2', 'deleted');
        const stats = await getDashboardStats(ctx);
        const projects = stats
            .find(s => s.label === 'Projects');
        assert.equal(projects?.value, 1);
    },
);

test(
    'getDashboardStats counts tombstoned out',
    async () => {
        const { db, ctx } = setupDb();
        await seedProject(db, 'p1', 'approved');
        await seedProject(db, 'p2', 'approved');
        await db.projects.delete('p2');
        await db.flows.put('f1', buildFlow('f1'));
        await db.flows.delete('f1');
        const stats = await getDashboardStats(ctx);
        const projects = stats
            .find(s => s.label === 'Projects');
        const flows = stats
            .find(s => s.label === 'Flows');
        assert.equal(projects?.value, 1);
        assert.equal(flows?.value, 0);
    },
);

test(
    'getDashboardGauges returns Time and Cost',
    async () => {
        const { ctx } = setupDb();
        const gauges = await getDashboardGauges(ctx);
        assert.deepEqual(
            gauges.map(g => g.title),
            ['Time', 'Cost'],
        );
        assert.deepEqual(
            gauges.map(g => g.icon),
            ['clock', 'dollarSign'],
        );
    },
);

test(
    'getDashboardGauges is zeroed on empty db',
    async () => {
        const { ctx } = setupDb();
        const gauges = await getDashboardGauges(ctx);
        const cost = gauges
            .find(g => g.title === 'Cost');
        assert.equal(cost?.outer.value, 0);
        assert.equal(cost?.inner.value, 0);
    },
);

test(
    'getDashboardGauges sums approved projects only',
    async () => {
        const { db, ctx } = setupDb();
        await seedProject(db, 'p1', 'approved', {
            estimated_cost: 1000,
            actual_cost: 400,
        });
        await seedProject(db, 'p2', 'approved', {
            estimated_cost: 2000,
            actual_cost: 600,
        });
        // Not approved: must be ignored.
        await seedProject(db, 'p3', 'submitted', {
            estimated_cost: 9000,
            actual_cost: 9000,
        });
        const gauges = await getDashboardGauges(ctx);
        const cost = gauges
            .find(g => g.title === 'Cost');
        assert.equal(cost?.outer.value, 3000);
        assert.equal(cost?.inner.value, 1000);
    },
);


test(
    'getDashboardGauges Time sums the 10-day span',
    async () => {
        const { db, ctx } = setupDb();
        await seedProject(db, 'p1', 'approved', {
            start_date: '2026-01-01',
            target_end_date: '2026-01-11',
        });
        const gauges = await getDashboardGauges(ctx);
        const time = gauges
            .find(g => g.title === 'Time');
        assert.equal(time?.outer.value, 10);
        assert.equal(time?.outer.display, '10d');
    },
);

test('getDashboardGauges returns exactly two gauges',
    async () => {
        const db = new MemoryDbAdapter();
        const ctx = createRequestContext(db);
        const gauges = await getDashboardGauges(ctx);
        assert.equal(gauges.length, 2);
        const titles = gauges.map(
            g => g.title.toLowerCase(),
        );
        assert.ok(titles.some(t => t.includes('time')));
        assert.ok(titles.some(t => t.includes('cost')));
        assert.ok(
            !titles.some(t => t.includes('impact')),
            'old impact gauge still present',
        );
    });
