import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { devToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import {
    getDashboardStats,
    getDashboardGauges,
} from '../web-app/app/adapters/dashboard.ts';
import {
    type IdeaEntity,
    type ProjectEntity,
    type ProjectState,
    type FlowEntity,
    type JsonObjectField,
} from '../api/types.ts';

async function setupDb(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
}> {
    const db = new MemoryDbAdapter();
    await seedAdminSchema(db);
    const ctx = createRequestContext(db, await devToken());
    return { db, ctx };
}

function buildIdea(
    id: string,
): Omit<IdeaEntity, 'id'> {
    return {
        organization_id: '1',
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
        organization_id: '1',
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
        organization_id: '1',
        name: 'Flow ' + id,
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
        const { ctx } = await setupDb();
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
        const { ctx } = await setupDb();
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
        const { db, ctx } = await setupDb();
        await seedIdea(db, 'i1', 'active');
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
        const { db, ctx } = await setupDb();
        await seedIdea(db, 'i1', 'active');
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
        const { db, ctx } = await setupDb();
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
        const { db, ctx } = await setupDb();
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
    'getDashboardGauges returns Time, Cost, Impact',
    async () => {
        const { ctx } = await setupDb();
        const gauges = await getDashboardGauges(ctx);
        assert.deepEqual(
            gauges.map(g => g.title),
            ['Time', 'Cost', 'Impact'],
        );
        assert.deepEqual(
            gauges.map(g => g.icon),
            ['clock', 'dollarSign', 'zap'],
        );
    },
);

test(
    'getDashboardGauges is zeroed on empty db',
    async () => {
        const { ctx } = await setupDb();
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
        const { db, ctx } = await setupDb();
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
        const { db, ctx } = await setupDb();
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

test(
    'getDashboardGauges returns the three sibling gauges',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(db, await devToken());
        const gauges = await getDashboardGauges(ctx);
        assert.equal(gauges.length, 3);
        const titles = gauges.map(
            g => g.title.toLowerCase(),
        );
        assert.ok(titles.some(t => t.includes('time')));
        assert.ok(titles.some(t => t.includes('cost')));
        assert.ok(
            titles.some(t => t.includes('impact')),
            'impact gauge missing from grid',
        );
    });

test(
    'getDashboardGauges marks Impact as bipolar',
    async () => {
        const { ctx } = await setupDb();
        const gauges = await getDashboardGauges(ctx);
        const impact = gauges
            .find(g => g.title === 'Impact');
        assert.equal(impact?.kind, 'bipolar');
    },
);

test(
    'getDashboardGauges marks Time and Cost as ratio',
    async () => {
        const { ctx } = await setupDb();
        const gauges = await getDashboardGauges(ctx);
        const time = gauges
            .find(g => g.title === 'Time');
        const cost = gauges
            .find(g => g.title === 'Cost');
        assert.equal(time?.kind, 'ratio');
        assert.equal(cost?.kind, 'ratio');
    },
);

test(
    'getDashboardGauges Impact passes'
    + ' undefined means without clamping to zero',
    async () => {
        const { ctx } = await setupDb();
        const gauges = await getDashboardGauges(ctx);
        const impact = gauges
            .find(g => g.title === 'Impact');
        // Empty db => baselineMean and actualMean
        // both undefined. The bipolar Impact gauge
        // must NOT clamp them to 0 (the previous
        // ratio behavior was Math.max(0, v ?? 0)).
        assert.equal(impact?.kind, 'bipolar');
        if (impact?.kind !== 'bipolar') return;
        assert.equal(impact.outer.value, undefined);
        assert.equal(impact.inner.value, undefined);
    },
);
