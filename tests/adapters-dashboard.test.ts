import { test } from 'node:test';
import { strict as assert } from 'node:assert';

import { adminContext } from './context-fixtures.ts';
import type { RequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    getDashboardStats,
    getDashboardGauges,
} from '../web-app/app/adapters/dashboard.ts';
import { postIdeaCreation } from
    '../web-app/app/adapters/ideas.ts';
import {
    putProject,
    postProjectStateChange,
    getProjectEntity,
} from '../web-app/app/adapters/projects.ts';
import {
    postFlowCreation,
} from '../web-app/app/adapters/flow-mutations.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import {
    type IdeaEntity,
    type IdeaState,
    type ProjectEntity,
    type ProjectState,
    type FlowWithGraph,
    nowUtc,
} from '../api/types.ts';

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

// Seeds an idea through the SAME document PUT the live route
// uses (postIdeaCreation), so a message pair exists at this
// idea's address — required for the flipped GET ideas route
// (Phase 2 Task 5), which getDashboardStats reads, to derive it.
async function seedIdea(
    ctx: RequestContext,
    id: string,
    state: IdeaState,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildIdea(id);
    await postIdeaCreation(ctx, id, entity, state);
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

// Seeds a project through the SAME document PUT the live route
// uses (putProject), so a message pair exists at this project's
// address — required for the flipped GET projects route
// (Phase 3 Task 6), which getDashboardStats /
// getDashboardGauges read, to derive it.
async function seedProject(
    ctx: RequestContext,
    id: string,
    state: ProjectState,
    overrides?: Partial<ProjectEntity>,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildProject(id, overrides);
    await putProject(ctx, id, {
        ...entity,
        state,
    });
}

// Seeds a flow through the SAME document PUT the live route
// uses (postFlowCreation), so a message pair exists at this
// flow's address — required for the flipped GET flows route
// (Phase 4 Task 8), which getDashboardStats reads
// UNCONDITIONALLY, to derive it.
async function seedFlow(
    ctx: RequestContext,
    id: string,
): Promise<void> {
    await postFlowCreation(ctx, {
        flowId: id,
        linkId: id + '-link',
        projectId: 'p-' + id,
        name: 'Flow ' + id,
    });
}

// NAMED re-pin (Phase 4 Task 8): physical row removal has no
// ledger analogue — the flipped GET derives visibility from the
// lifecycle trio, not a raw db.flows.delete row removal — so the
// tombstone must land as a state-'deleted' document PUT like any
// other transition (mirrors postProjectStateChange's precedent
// above; the only wire-reachable flow tombstone, which Task 3
// created).
async function tombstoneFlow(
    ctx: RequestContext,
    id: string,
): Promise<void> {
    await seedFlow(ctx, id);
    const { body: current, etag } =
        await ctx.GETWithEtag<FlowWithGraph>(
            'organizations/1/flows/' + id,
        );
    await ctx.PUT(
        'organizations/1/flows/' + id,
        {
            name: current.name,
            is_locked: current.is_locked,
            is_auto_layout: current.is_auto_layout,
            is_auto_fit: current.is_auto_fit,
            lock_timeout: current.lock_timeout,
            state: 'deleted',
            state_at: nowUtc(),
            state_event_id: generateCryptoSafeBase62(),
            graph: current.graph,
            graphDelta: {
                nodes: [], edges: [], deletions: [],
                memberEvents: [], attributeEvents: [],
            },
            revivals: [],
        },
        etag === undefined
            ? undefined
            : [['if-match', '"' + etag + '"']],
    );
}

test(
    'getDashboardStats labels Ideas, Projects, Flows',
    async () => {
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
        await seedIdea(ctx, 'i1', 'active');
        await seedIdea(ctx, 'i2', 'in_review');
        await seedProject(ctx, 'p1', 'approved');
        await seedFlow(ctx, 'f1');
        await seedFlow(ctx, 'f2');
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
        const { ctx } = await adminContext();
        await seedIdea(ctx, 'i1', 'active');
        await seedIdea(ctx, 'i2', 'archived');
        await seedIdea(ctx, 'i3', 'deleted');
        const stats = await getDashboardStats(ctx);
        const ideas = stats
            .find(s => s.label === 'Ideas');
        assert.equal(ideas?.value, 1);
    },
);

test(
    'getDashboardStats excludes deleted projects',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(ctx, 'p1', 'approved');
        await seedProject(ctx, 'p2', 'deleted');
        const stats = await getDashboardStats(ctx);
        const projects = stats
            .find(s => s.label === 'Projects');
        assert.equal(projects?.value, 1);
    },
);

test(
    'getDashboardStats counts tombstoned out',
    async () => {
        const { db, ctx } = await adminContext();
        await seedProject(ctx, 'p1', 'approved');
        await seedProject(ctx, 'p2', 'approved');
        // NAMED re-pin (Phase 3 Task 6, Step 2b): physical row
        // removal has no ledger analogue — the flipped GET
        // derives visibility from the lifecycle trio, not a raw
        // db.projects.delete row removal — so the tombstone must
        // land as a state-'deleted' document PUT like any other
        // transition (mirrors drift-projects.test.ts's lifecycle
        // case).
        // Phase Final Task 2: projects row half stripped.
        const {
            id: _id, organization_id: _org, ...fields
        } = await getProjectEntity(ctx, 'p2');
        await postProjectStateChange(
            ctx, 'p2', fields, 'deleted',
        );
        // NAMED re-pin (Phase 4 Task 8): the flows half now
        // flips too — see tombstoneFlow's own comment above.
        await tombstoneFlow(ctx, 'f1');
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
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
        await seedProject(ctx, 'p1', 'approved', {
            estimated_cost: 1000,
            actual_cost: 400,
        });
        await seedProject(ctx, 'p2', 'approved', {
            estimated_cost: 2000,
            actual_cost: 600,
        });
        // Not approved: must be ignored.
        await seedProject(ctx, 'p3', 'submitted', {
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
        const { ctx } = await adminContext();
        await seedProject(ctx, 'p1', 'approved', {
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
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
        const gauges = await getDashboardGauges(ctx);
        const impact = gauges
            .find(g => g.title === 'Impact');
        assert.equal(impact?.kind, 'bipolar');
    },
);

test(
    'getDashboardGauges marks Time and Cost as ratio',
    async () => {
        const { ctx } = await adminContext();
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
        const { ctx } = await adminContext();
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
