import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizationStats,
} from '../web-app/app/adapters/admin.ts';
import { putIdea } from '../web-app/app/adapters/ideas.ts';
import { putProject } from '../web-app/app/adapters/projects.ts';
import {
    type ProjectEntity, type IdeaEntity,
    type IdeaState,
    type ProjectState,
} from '../api/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

function buildProject(
    id: string,
): Omit<ProjectEntity, 'id' | 'state'> {
    return {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'P-' + id,
        description: 'desc',
        progress: 25,
        start_date: '2026-01-01',
        target_end_date: '2026-12-31',
        estimated_cost: 1000,
        actual_cost: 100,
        position: 1,
    };
}

function buildIdea(
    id: string,
): Omit<IdeaEntity, 'id' | 'state'> {
    return {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'I-' + id,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

// Seeds a project through the SAME document PUT the live route
// uses (putProject), so a message pair exists at this project's
// address — required for the flipped GET projects route
// (Phase 3 Task 6), which getProjects (getOrganizationStats'
// project count) reads, to derive it. A fixed historical
// stateAt (matching the old seedProject idiom this replaces)
// mirrors seedIdea below.
async function seedProject(
    ctx: RequestContext,
    id: string, state: ProjectState,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildProject(id);
    await putProject(ctx, id, {
        ...entity,
        state,
    });
}

// Seeds an idea through the SAME document PUT the live route
// uses (putIdea) and its submission through the live
// submissions PUT, so both message pairs exist — required for
// the flipped GET ideas / GET organizations/:id/ideas/:id/submissions routes
// (Phase 2 Task 5), which getIdeas (getOrganizationStats' idea
// count) reads, to derive them. A fixed historical stateAt
// (matching the old seedIdeaState idiom this replaces) rather
// than postIdeaCreation's nowUtc(): the 'reflects latest state
// event' test posts a LATER raw transition at a fixed 2026-01-02
// instant, which a real-clock genesis timestamp would outrank.
async function seedIdea(
    ctx: RequestContext,
    id: string, state: IdeaState,
    submitter: string,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildIdea(id);
    await putIdea(ctx, id, {
        ...entity,
        state,
    });
    await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + id
        + '/submissions/' + generateIdentifier(), {
        idea_id: id,
        member_id: submitter,
        at: '2026-04-01T00:00:00.000000Z',
    });
}

async function seedMember(
    db: MemoryDbAdapter,
    id: string,
): Promise<void> {
    await seedHumanMember(
        db, id, 'Member ' + id,
    );
}

test(
    'getOrganizationStats counts projects that'
    + ' are not deleted or declined',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(ctx, generateIdentifier(), 'submitted');
        await seedProject(
            ctx, generateIdentifier(), 'under_review',
        );
        await seedProject(ctx, generateIdentifier(), 'approved');
        await seedProject(ctx, generateIdentifier(), 'archived');
        await seedProject(ctx, generateIdentifier(), 'declined');
        await seedProject(ctx, generateIdentifier(), 'deleted');
        const stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 4);
    },
);

test(
    'getOrganizationStats counts ideas that are'
    + ' not archived or deleted',
    async () => {
        const { db, ctx } = await adminContext();
        const submitter = generateIdentifier();
        await seedMember(db, submitter);
        await seedIdea(
            ctx, generateIdentifier(), 'active', submitter,
        );
        await seedIdea(
            ctx, generateIdentifier(), 'in_review', submitter,
        );
        await seedIdea(
            ctx, generateIdentifier(), 'approved', submitter,
        );
        await seedIdea(
            ctx, generateIdentifier(), 'promoted', submitter,
        );
        await seedIdea(
            ctx, generateIdentifier(), 'archived', submitter,
        );
        await seedIdea(
            ctx, generateIdentifier(), 'deleted', submitter,
        );
        const stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.ideasCurrent, 4);
    },
);

test(
    'getOrganizationStats counts only active'
    + ' human members',
    async () => {
        const { db, ctx } = await adminContext();
        await seedMember(db, generateIdentifier());
        await seedMember(db, generateIdentifier());
        await seedMember(db, generateIdentifier());
        await seedMember(db, generateIdentifier());
        const stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.activePeopleCount, 5);
    },
);

test(
    'getOrganizationStats reflects latest state'
    + ' event when entities transition',
    async () => {
        const { db, ctx } = await adminContext();
        const submitter = generateIdentifier();
        const projectId = generateIdentifier();
        const ideaId = generateIdentifier();
        await seedMember(db, submitter);
        await seedProject(ctx, projectId, 'approved');
        await seedIdea(
            ctx, ideaId, 'active', submitter,
        );
        let stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 1);
        assert.equal(stats.ideasCurrent, 1);
        assert.equal(stats.activePeopleCount, 2);

        // Transitions through later document-trio PUTs
        // (latest by 'at' wins) — the states/:id address is
        // retired; project/idea/member lifecycle rides each
        // family's own document address.
        const { organization_id: _projectOrganizationId, ...pFields } =
            buildProject(projectId);
        await putProject(ctx, projectId, {
            ...pFields,
            state: 'declined',
        });
        const { organization_id: _ideaOrganizationId, ...iFields } =
            buildIdea(ideaId);
        await putIdea(ctx, ideaId, {
            ...iFields,
            state: 'archived',
        });
        stats = await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 0);
        assert.equal(stats.ideasCurrent, 0);
        assert.equal(stats.activePeopleCount, 2);
    },
);

test(
    'getOrganization derives seat usage from the'
    + ' memberships ledger',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        // The flipped GET organizations/:id (Phase 12 Task 5)
        // derives from the ledger, so the row needs a message
        // pair — a raw db.organizations.put would be invisible.
        await ctx.PUT('organizations/AjdvjuECVZEgZoFajaIEkg'
            , organizationRow('Acme'));
        const { seedSeat } = await import(
            './root-admin-fixture.ts'
        );
        await seedSeat(
            db, 'AjdvjuECVZEgZoFajaIEkg',
            generateIdentifier(), 'member',
        );
        const organization = await getOrganization(ctx);
        assert.equal(organization.usedSeats(), 2);
    },
);
