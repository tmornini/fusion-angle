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
    IdeaStatus,
    ProjectEntity,
    ProjectStatus,
    FlowEntity,
    JsonArrayField,
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
    status: IdeaStatus,
): Omit<IdeaEntity, 'id'> {
    return {
        title: 'Idea ' + id,
        position: 1,
        status,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        readiness: 'ready',
        risks: '[]' as JsonArrayField,
        assumptions: '[]' as JsonArrayField,
        alignments: '[]' as JsonArrayField,
    };
}

function buildProject(
    id: string,
    status: ProjectStatus,
    overrides?: Partial<ProjectEntity>,
): Omit<ProjectEntity, 'id'> {
    const base: Omit<ProjectEntity, 'id'> = {
        title: 'Project ' + id,
        description: 'd',
        status,
        progress: 0,
        start_date: '2026-01-01',
        target_end_date: '2026-01-11',
        estimated_duration: 0,
        actual_duration: 0,
        estimated_cost: 1000,
        actual_cost: 500,
        position: 1,
        business_context: '{}' as JsonObjectField,
        timeline_label: '',
    };
    const { id: _drop, ...rest } = {
        ...base, ...overrides, id,
    } as ProjectEntity;
    return rest;
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
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
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
        await db.ideas.put('i1', buildIdea(
            'i1', 'active',
        ));
        await db.ideas.put('i2', buildIdea(
            'i2', 'in-review',
        ));
        await db.projects.put('p1', buildProject(
            'p1', 'approved',
        ));
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
        await db.ideas.put('i1', buildIdea(
            'i1', 'active',
        ));
        await db.ideas.put('i2', buildIdea(
            'i2', 'archived',
        ));
        await db.ideas.put('i3', buildIdea(
            'i3', 'deleted',
        ));
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
        await db.projects.put('p1', buildProject(
            'p1', 'approved',
        ));
        await db.projects.put('p2', buildProject(
            'p2', 'deleted',
        ));
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
        await db.projects.put('p1', buildProject(
            'p1', 'approved',
        ));
        await db.projects.put('p2', buildProject(
            'p2', 'approved',
        ));
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
        await db.projects.put('p1', buildProject(
            'p1', 'approved', {
                estimated_cost: 1000,
                actual_cost: 400,
            },
        ));
        await db.projects.put('p2', buildProject(
            'p2', 'approved', {
                estimated_cost: 2000,
                actual_cost: 600,
            },
        ));
        // Not approved: must be ignored.
        await db.projects.put('p3', buildProject(
            'p3', 'submitted', {
                estimated_cost: 9000,
                actual_cost: 9000,
            },
        ));
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
        await db.projects.put('p1', buildProject(
            'p1', 'approved', {
                start_date: '2026-01-01',
                target_end_date: '2026-01-11',
            },
        ));
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
