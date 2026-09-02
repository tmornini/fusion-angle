import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { deriveProjectStateHistory } from
    '../api/derive-projects.ts';

import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getProjectEntities,
    getProjects,
    getProjectEntity,
    postProjectStateChange,
    putProject,
    putProjectFields,
    putProjectPosition,
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
} from './member-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// PUT body entity fields only — seed/put supply the lifecycle
// trio (state/stateAt/stateEventId). GET ProjectEntity carries
// the stamped trio (Phase A); list/detail read it from the row.
function buildProject(
    _id: string,
    title: string,
    overrides?: Partial<
        Omit<
            ProjectEntity,
            | 'id'
            | 'state'
            | 'state_at'
            | 'state_event_id'
        >
    >,
): Omit<
    ProjectEntity,
    'id' | 'state' | 'state_at' | 'state_event_id'
> {
    return {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title,
        description: 'desc for ' + title,
        progress: 25,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 50000,
        actual_cost: 12000,
        position: 1,
        ...overrides,
    };
}

// Seeds a project through the SAME document PUT the live route
// uses (putProject), so a message pair exists at this project's
// address — required for the flipped GET projects / GET
// organizations/:id/projects/:id routes (Phase 3 Task 6) to derive it. A
// fixed
// historical stateAt (matching the old raw-postEvent idiom this
// replaces) rather than a real clock, mirroring
// tests/adapters-ideas.test.ts's seedIdea precedent.
async function seedProject(
    ctx: RequestContext,
    id: string,
    title: string,
    state: ProjectState = 'approved',
    overrides?: Partial<ProjectEntity>,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildProject(id, title, overrides);
    await putProject(ctx, id, {
        ...entity,
        state,
    });
}

Deno.test(
    'getProjectEntity round-trips all fields',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Alpha', undefined, {
                progress: 73,
                estimated_cost: 99000,
            },
        );
        const row = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(row.id, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(row.title, 'Alpha');
        assertStrictEquals(row.description, 'desc for Alpha');
        assertStrictEquals(row.progress, 73);
        assertStrictEquals(row.start_date, '2026-01-01');
        assertStrictEquals(
            row.target_end_date, '2026-12-31',
        );
        assertStrictEquals(row.estimated_cost, 99000);
        assertStrictEquals(row.actual_cost, 12000);
        assertStrictEquals(row.position, 1);
    },
);

Deno.test(
    'getProjectEntity rejects for missing id',
    async () => {
        const { ctx } = await adminContext();
        await assertRejects(
            () => getProjectEntity(ctx, generateIdentifier()),
            Error,
            'Not found',
        );
    },
);

Deno.test(
    'getProjectEntities returns persisted rows',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Alpha');
        await seedProject(ctx, 'prBESZPjJDiuXCeZLmbiVw', 'Beta');
        const rows = await getProjectEntities(ctx);
        assertStrictEquals(rows.length, 2);
        const titles = rows
            .map(r => r.title)
            .sort();
        assertEquals(titles, ['Alpha', 'Beta']);
    },
);

Deno.test(
    'getProjectEntities returns empty on empty db',
    async () => {
        const { ctx } = await adminContext();
        const rows = await getProjectEntities(ctx);
        assertEquals(rows, []);
    },
);

Deno.test(
    'getProjects wraps rows in Project objects',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Alpha');
        const projects = await getProjects(ctx);
        assertStrictEquals(projects.length, 1);
        assert(projects[0] instanceof Project);
        assertStrictEquals(
            projects[0]?.titleText(), 'Alpha',
        );
        assertStrictEquals(
            projects[0]?.stateValue(), 'approved',
        );
    },
);

Deno.test(
    'getProjects excludes deleted-state rows',
    async () => {
        const { ctx } = await adminContext();
        const keepId = generateIdentifier();
        const goneId = generateIdentifier();
        await seedProject(ctx, keepId, 'Keep');
        await seedProject(
            ctx, goneId, 'Gone', 'deleted',
        );
        const projects = await getProjects(ctx);
        assertStrictEquals(projects.length, 1);
        assertStrictEquals(
            projects[0]?.titleText(), 'Keep',
        );
    },
);

Deno.test(
    'getProjects excludes tombstoned rows',
    async () => {
        const { ctx } = await adminContext();
        const keepId = generateIdentifier();
        const goneId = generateIdentifier();
        await seedProject(ctx, keepId, 'Keep');
        await seedProject(ctx, goneId, 'Gone');
        // Tombstone lands as a state-'deleted' document PUT
        // (Phase Final Task 2: no projects row plane).
        const {
            id: _id, organization_id: _org, ...fields
        } = await getProjectEntity(ctx, goneId);
        await postProjectStateChange(
            ctx, goneId, fields, 'deleted',
        );
        const projects = await getProjects(ctx);
        assertStrictEquals(projects.length, 1);
        assertStrictEquals(
            projects[0]?.titleText(), 'Keep',
        );
        // Collection GET streams live PUT heads, including
        // a trio-deleted document. getProjects filters it.
        const rows = await getProjectEntities(ctx);
        assertStrictEquals(rows.length, 2);
    },
);

const TRIO = {
    state: 'approved' as ProjectState,
};

Deno.test('putProject persists a new project', async () => {
    const { ctx } = await adminContext();
    const { organization_id: _o, ...entity } =
        buildProject('pnXmXrxOWayANgDLdCjuBw', 'Created');
    await putProject(
        ctx, 'pnXmXrxOWayANgDLdCjuBw',
        { ...entity, ...TRIO },
    );
    const stored = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(stored.title, 'Created');
});

Deno.test('putProject updates an existing project', async () => {
    const { ctx } = await adminContext();
    await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Before');
    const { organization_id: _o, ...entity } =
        buildProject('pnXmXrxOWayANgDLdCjuBw', 'After', { progress: 100 });
    await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
        ...entity,
        ...TRIO,
    });
    const stored = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
    assertStrictEquals(stored.title, 'After');
    assertStrictEquals(stored.progress, 100);
});

Deno.test(
    'putProject changes are visible to a fresh ctx',
    async () => {
        const { db, ctx } = await adminContext();
        const { organization_id: _o, ...entity } =
            buildProject('pnXmXrxOWayANgDLdCjuBw', 'Persisted');
        await putProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
            ...entity,
            ...TRIO,
        });
        const fresh = createRequestContext(db, await organizationToken());
        const row = await getProjectEntity(fresh, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(row.title, 'Persisted');
    },
);

Deno.test(
    'putProjectFields merges the camel patch onto'
    + ' the stored row, keeping untouched columns',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Before', undefined, {
                position: 7,
                progress: 40,
            },
        );
        await putProjectFields(ctx, 'pnXmXrxOWayANgDLdCjuBw', {
            title: 'After',
            description: 'new desc',
            startDate: '2026-02-01',
            targetEndDate: '2026-11-30',
            estimatedCost: 75000,
        }, TRIO);
        const stored = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(stored.title, 'After');
        assertStrictEquals(
            stored.description, 'new desc',
        );
        assertStrictEquals(
            stored.start_date, '2026-02-01',
        );
        assertStrictEquals(
            stored.target_end_date, '2026-11-30',
        );
        assertStrictEquals(
            stored.estimated_cost, 75000,
        );
        assertStrictEquals(stored.position, 7);
        assertStrictEquals(stored.progress, 40);
    },
);

Deno.test(
    'putProjectPosition writes only the position',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Stay', undefined, {
                position: 1,
            },
        );
        await putProjectPosition(ctx, 'pnXmXrxOWayANgDLdCjuBw', 9.5, TRIO);
        const stored = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(stored.position, 9.5);
        assertStrictEquals(stored.title, 'Stay');
    },
);

Deno.test(
    'ProjectView exposes project display fields',
    () => {
        const project = new Project({
            ...buildProject('pnXmXrxOWayANgDLdCjuBw', 'Viewable', {
                start_date: '2026-01-01',
                target_end_date: '2026-12-31',
                estimated_cost: 4000,
                actual_cost: 2000,
            }),
            ...TRIO,
            id: 'pnXmXrxOWayANgDLdCjuBw',
        }, TRIO);
        const view = new ProjectView(project, [], [], []);
        assertStrictEquals(view.idForLink(), 'pnXmXrxOWayANgDLdCjuBw');
        assertStrictEquals(view.titleText(), 'Viewable');
        assertStrictEquals(view.stateValue(), 'approved');
        assertStrictEquals(
            view.startDateValue(), '2026-01-01',
        );
        assertStrictEquals(
            view.targetEndDateValue(), '2026-12-31',
        );
        assertStrictEquals(
            view.costBaselineK(),
            4000 / COST_DIVISOR,
        );
        assertStrictEquals(
            view.costActualK(),
            2000 / COST_DIVISOR,
        );
    },
);

Deno.test(
    'postProjectStateChange records a state event'
    + ' without changing non-lifecycle entity fields'
    + ' on GET',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Original', 'approved',
        );
        const before = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        const {
            id: _id,
            organization_id: _org,
            state: _priorState,
            ...fields
        } = before;
        void _priorState;

        await postProjectStateChange(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', fields, 'archived',
        );

        const after = await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw');
        // Entity content fields unchanged; GET trio advances
        // to the transition event (lifecycle-current stamp).
        assertStrictEquals(after.title, before.title);
        assertStrictEquals(after.position, before.position);
        assertStrictEquals(
            after.description, before.description,
        );
        assertStrictEquals(after.state, 'archived');
        const events = await deriveProjectStateHistory(db
            , 'AjdvjuECVZEgZoFajaIEkg', 'pnXmXrxOWayANgDLdCjuBw');
        // genesis + transition
        assertStrictEquals(events.length, 2);
        assertStrictEquals(
            events.at(-1)?.state, 'archived',
        );
    },
);

Deno.test(
    'ProjectView timeBaselineDays spans the dates',
    () => {
        const project = new Project({
            ...buildProject('pnXmXrxOWayANgDLdCjuBw', 'Spanned', {
                start_date: '2026-01-01',
                target_end_date: '2026-01-11',
            }),
            ...TRIO,
            id: 'pnXmXrxOWayANgDLdCjuBw',
        }, TRIO);
        const view = new ProjectView(project, [], [], []);
        assertStrictEquals(view.timeBaselineDays(), 10);
    },
);
