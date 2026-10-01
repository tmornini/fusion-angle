import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    type RequestContext,
    organizationItem,
} from '../client/request-context.ts';
import { RequestError } from '../shared/http-errors.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
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
} from '../client/projects.ts';
import { ProjectView } from '../web-app/app/project-view.ts';
import {
    Project,
    COST_DIVISOR,
} from '../shared/types.ts';
import type {
    ProjectEntity,
    ProjectState,
} from '../shared/types.ts';
import {
    seedCurrentMember,
} from './member-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { responseMessage } from './fixtures/response-message.ts';

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
// uses (an unlatched PUT of a fresh id: putProject latches the
// head it replaces), so a message pair exists at this project's
// document — required for the flipped GET projects / GET
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
    await ctx.PUT(organizationItem(ctx, 'projects', id), {
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
        const row = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
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
            .map(r => r.body().toValue().title)
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
        await postProjectStateChange(
            ctx, await getProjectEntity(ctx, goneId), 'deleted',
        );
        const projects = await getProjects(ctx);
        assertStrictEquals(projects.length, 1);
        assertStrictEquals(
            projects[0]?.titleText(), 'Keep',
        );
        // The collection serves no part for a state-deleted
        // head (spec §5), so the rows are the projects.
        const rows = await getProjectEntities(ctx);
        assertStrictEquals(rows.length, 1);
    },
);

const STATE: ProjectState = 'approved';

Deno.test('a PUT of a fresh id persists a new project', async () => {
    const { ctx } = await adminContext();
    const { organization_id: _o, ...entity } =
        buildProject('pnXmXrxOWayANgDLdCjuBw', 'Created');
    await ctx.PUT(
        organizationItem(ctx, 'projects', 'pnXmXrxOWayANgDLdCjuBw'),
        { ...entity, state: STATE },
    );
    const stored = (await getProjectEntity(
        ctx, 'pnXmXrxOWayANgDLdCjuBw',
    )).body().toValue();
    assertStrictEquals(stored.title, 'Created');
});

Deno.test('putProject updates an existing project', async () => {
    const { ctx } = await adminContext();
    await seedProject(ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Before');
    const { organization_id: _o, ...entity } =
        buildProject('pnXmXrxOWayANgDLdCjuBw', 'After', { progress: 100 });
    await putProject(
        ctx, await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
        { ...entity, state: STATE },
    );
    const stored = (await getProjectEntity(
        ctx, 'pnXmXrxOWayANgDLdCjuBw',
    )).body().toValue();
    assertStrictEquals(stored.title, 'After');
    assertStrictEquals(stored.progress, 100);
});

Deno.test(
    'a project PUT is visible to a fresh ctx',
    async () => {
        const { db, ctx } = await adminContext();
        const { organization_id: _o, ...entity } =
            buildProject('pnXmXrxOWayANgDLdCjuBw', 'Persisted');
        await ctx.PUT(
            organizationItem(ctx, 'projects', 'pnXmXrxOWayANgDLdCjuBw'),
            { ...entity, state: STATE },
        );
        const fresh = inPageContext(db, await organizationToken());
        const row = (await getProjectEntity(
            fresh, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
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
        await putProjectFields(
            ctx, await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
            {
                title: 'After',
                description: 'new desc',
                startDate: '2026-02-01',
                targetEndDate: '2026-11-30',
                estimatedCost: 75000,
            },
        );
        const stored = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
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
        await putProjectPosition(
            ctx, await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
            9.5,
        );
        const stored = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
        assertStrictEquals(stored.position, 9.5);
        assertStrictEquals(stored.title, 'Stay');
    },
);

Deno.test(
    'putProjectPosition keeps the head state',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Stay', 'archived',
        );
        await putProjectPosition(
            ctx, await getProjectEntity(ctx, 'pnXmXrxOWayANgDLdCjuBw'),
            9.5,
        );
        const stored = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
        assertStrictEquals(stored.state, 'archived');
        assertStrictEquals(stored.position, 9.5);
    },
);

Deno.test(
    'a stale position PUT surfaces 412',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Stay', undefined, {
                position: 1,
            },
        );
        const held = (await getProjects(ctx)).find(
            (p) => p.idForLink() === 'pnXmXrxOWayANgDLdCjuBw',
        )!.message;
        // Another write moves the head after the list read
        // and before the reorder.
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Moved',
        );
        const error = await assertRejects(
            () => putProjectPosition(ctx, held, 9.5),
            RequestError,
        );
        assertStrictEquals(error.status, 412);
        const stored = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
        assertStrictEquals(stored.title, 'Moved');
        assertStrictEquals(stored.position, 1);
    },
);

Deno.test('a field save then a state change both land',
async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    const id = generateIdentifier();
    await seedProject(ctx, id, 'Latched', 'submitted');
    const held = await getProjectEntity(ctx, id);
    const body = held.body().toValue();
    sent.length = 0;
    const saved = await putProjectFields(ctx, held, {
        title: 'Renamed',
        description: body.description,
        startDate: body.start_date,
        targetEndDate: body.target_end_date,
        estimatedCost: body.estimated_cost,
    });
    const moved = await postProjectStateChange(
        ctx, saved, 'under_review',
    );
    assertEquals(sent.map((r) => r.method), ['PUT', 'PUT']);
    assertEquals(sent.map((r) => r.ifMatch), [
        held.query('header.etag').toText(),
        saved.query('header.etag').toText(),
    ]);
    assertStrictEquals(moved.body().toValue().title, 'Renamed');
});

Deno.test(
    'ProjectView exposes project display fields',
    () => {
        const project = new Project(responseMessage({
            ...buildProject('pnXmXrxOWayANgDLdCjuBw', 'Viewable', {
                start_date: '2026-01-01',
                target_end_date: '2026-12-31',
                estimated_cost: 4000,
                actual_cost: 2000,
            }),
            state: STATE,
            id: 'pnXmXrxOWayANgDLdCjuBw',
        }), STATE);
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
    'postProjectStateChange changes state without'
    + ' changing entity fields on GET',
    async () => {
        const { db, ctx } = await adminContext();
        await seedCurrentMember(db);
        await seedProject(
            ctx, 'pnXmXrxOWayANgDLdCjuBw', 'Original', 'approved',
        );
        const held = await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        const before = held.body().toValue();

        await postProjectStateChange(ctx, held, 'archived');

        const after = (await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
        // Entity content fields unchanged; GET reflects the
        // transition.
        assertStrictEquals(after.title, before.title);
        assertStrictEquals(after.position, before.position);
        assertStrictEquals(
            after.description, before.description,
        );
        assertStrictEquals(after.state, 'archived');
    },
);

Deno.test(
    'ProjectView timeBaselineDays spans the dates',
    () => {
        const project = new Project(responseMessage({
            ...buildProject('pnXmXrxOWayANgDLdCjuBw', 'Spanned', {
                start_date: '2026-01-01',
                target_end_date: '2026-01-11',
            }),
            state: STATE,
            id: 'pnXmXrxOWayANgDLdCjuBw',
        }), STATE);
        const view = new ProjectView(project, [], [], []);
        assertStrictEquals(view.timeBaselineDays(), 10);
    },
);
