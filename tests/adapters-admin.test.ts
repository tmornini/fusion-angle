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
    type MemberState,
} from '../api/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';
import {
    postMembershipDocumentOp,
    WRITE_RESPONSE_SPECS,
} from '../api/routes.ts';
import { formWritePair } from '../api/message-pair.ts';
import { nowUtc, SYSTEM_MEMBER_ID } from '../api/types.ts';
import { TEST_OPERATION_ID } from './http-fixtures.ts';

function buildProject(
    id: string,
): Omit<ProjectEntity, 'id'> {
    return {
        organization_id: '1',
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
): Omit<IdeaEntity, 'id'> {
    return {
        organization_id: '1',
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
    await ctx.PUT('organizations/1/ideas/' + id + '/submissions/sub-' + id, {
        idea_id: id,
        member_id: submitter,
        at: '2026-04-01T00:00:00.000000Z',
    });
}

async function seedMember(
    db: MemoryDbAdapter,
    id: string, state: MemberState,
): Promise<void> {
    await seedHumanMember(
        db, id, 'Member ' + id, state,
    );
}

// Re-pointed onto the message pair postMembershipDocumentOp
// appends (finding 18's fixture budget): getOrganization's
// deriveOrganizationFacts reads ctx.GET('memberships'), which
// is now ledger-derived, so a raw row here would never surface
// in the usedSeats() count this file's seat-usage test exercises.
async function seedMembership(
    db: MemoryDbAdapter,
    id: string, identityId: string, at: string,
): Promise<void> {
    const body = {
        organization_id: '1',
        identity_id: identityId,
        type: identityId === 'current' ? 'admin' : 'member',
        at,
    };
    await seedSeat(
        db,
        String(body['organization_id'] ?? body.organization_id),
        String(body['identity_id'] ?? body.identity_id),
        (body['type'] ?? body.type) as 'admin' | 'member',
        String(body['at'] ?? body.at),
    );

}

test(
    'getOrganizationStats counts projects that'
    + ' are not deleted or declined',
    async () => {
        const { ctx } = await adminContext();
        await seedProject(ctx, 'p1', 'submitted');
        await seedProject(
            ctx, 'p2', 'under_review',
        );
        await seedProject(ctx, 'p3', 'approved');
        await seedProject(ctx, 'p4', 'archived');
        await seedProject(ctx, 'p5', 'declined');
        await seedProject(ctx, 'p6', 'deleted');
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
        await seedMember(db, 'u1', 'active');
        await seedIdea(
            ctx, 'i1', 'active', 'u1',
        );
        await seedIdea(
            ctx, 'i2', 'in_review', 'u1',
        );
        await seedIdea(ctx, 'i3', 'approved', 'u1');
        await seedIdea(ctx, 'i4', 'promoted', 'u1');
        await seedIdea(ctx, 'i5', 'archived', 'u1');
        await seedIdea(ctx, 'i6', 'deleted', 'u1');
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
        await seedMember(db, 'u1', 'active');
        await seedMember(db, 'u2', 'active');
        await seedMember(db, 'u3', 'pending');
        await seedMember(db, 'u4', 'archived');
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
        await seedMember(db, 'u1', 'active');
        await seedProject(ctx, 'p1', 'approved');
        await seedIdea(
            ctx, 'i1', 'active', 'u1',
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
            buildProject('p1');
        await putProject(ctx, 'p1', {
            ...pFields,
            state: 'declined',
        });
        const { organization_id: _ideaOrganizationId, ...iFields } =
            buildIdea('i1');
        await putIdea(ctx, 'i1', {
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
        await ctx.PUT('organizations/1', organizationRow('Acme'));
        const { seedSeat } = await import(
            './root-admin-fixture.ts'
        );
        await seedSeat(db, '1', 'other', 'member');
        const organization = await getOrganization(ctx);
        assert.equal(organization.usedSeats(), 2);
    },
);
