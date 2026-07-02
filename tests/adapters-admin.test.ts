import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getOrganization,
    getOrganizationStats,
} from '../web-app/app/adapters/admin.ts';
import {
    type ProjectEntity, type IdeaEntity,
    type MemberState,
} from '../api/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import {
    seedAdminSchema,
    organizationRow,
} from './test-fixtures.ts';

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

async function seedProject(
    db: MemoryDbAdapter,
    id: string, state: string,
): Promise<void> {
    await db.projects.put(id, buildProject(id));
    await db.states.postEvent(
        'sp-' + id, id, state, 'system',
        '2026-01-01T00:00:00.000000Z',
    );
}

async function seedIdea(
    db: MemoryDbAdapter,
    id: string, state: string,
    submitter: string,
): Promise<void> {
    await db.ideas.put(id, buildIdea(id));
    await db.states.postEvent(
        'si-' + id, id, state, 'system',
        '2026-01-01T00:00:00.000000Z',
    );
    await db.ideaSubmissions.put('sub-' + id, {
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

test(
    'getOrganizationStats counts projects that'
    + ' are not deleted or declined',
    async () => {
        const { db, ctx } = await adminContext();
        await seedProject(db, 'p1', 'submitted');
        await seedProject(
            db, 'p2', 'under_review',
        );
        await seedProject(db, 'p3', 'approved');
        await seedProject(db, 'p4', 'archived');
        await seedProject(db, 'p5', 'declined');
        await seedProject(db, 'p6', 'deleted');
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
            db, 'i1', 'active', 'u1',
        );
        await seedIdea(
            db, 'i2', 'in_review', 'u1',
        );
        await seedIdea(db, 'i3', 'approved', 'u1');
        await seedIdea(db, 'i4', 'promoted', 'u1');
        await seedIdea(db, 'i5', 'archived', 'u1');
        await seedIdea(db, 'i6', 'deleted', 'u1');
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
        assert.equal(stats.activePeopleCount, 2);
    },
);

test(
    'getOrganizationStats reflects latest state'
    + ' event when entities transition',
    async () => {
        const { db, ctx } = await adminContext();
        await seedMember(db, 'u1', 'active');
        await seedProject(db, 'p1', 'approved');
        await seedIdea(
            db, 'i1', 'active', 'u1',
        );
        let stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 1);
        assert.equal(stats.ideasCurrent, 1);
        assert.equal(stats.activePeopleCount, 1);

        // Transitions through later state events
        // (latest by 'at' wins).
        await db.states.postEvent(
            'sp1-next', 'p1', 'declined',
            'system',
            '2026-01-02T00:00:00.000000Z',
        );
        await db.states.postEvent(
            'si1-next', 'i1', 'archived',
            'system',
            '2026-01-02T00:00:01.000000Z',
        );
        await db.states.postEvent(
            'sw1-next', 'u1', 'archived',
            'system',
            '2026-01-02T00:00:02.000000Z',
        );
        stats = await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 0);
        assert.equal(stats.ideasCurrent, 0);
        assert.equal(stats.activePeopleCount, 0);
    },
);

test(
    'getOrganization derives seat usage from the'
    + ' memberships ledger',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.organizations.put('1', organizationRow('Acme'));
        // two rows for one identity + one other:
        // DISTINCT identities = 2, not 3
        await db.memberships.put('m1', {
            organization_id: '1',
            identity_id: 'current',
            at: '2026-01-01T00:00:00.000000Z',
        });
        await db.memberships.put('m2', {
            organization_id: '1',
            identity_id: 'current',
            at: '2026-02-01T00:00:00.000000Z',
        });
        await db.memberships.put('m3', {
            organization_id: '1',
            identity_id: 'other',
            at: '2026-03-01T00:00:00.000000Z',
        });
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const organization = await getOrganization(ctx);
        assert.equal(organization.usedSeats(), 2);
    },
);

test(
    'getOrganization renders absent activity as a'
    + ' dash, never a fabricated instant',
    async () => {
        const db = new MemoryDbAdapter();
        await seedAdminSchema(db);
        await db.organizations.put('1', organizationRow('Acme'));
        await db.memberships.put('m1', {
            organization_id: '1',
            identity_id: 'current',
            at: '2026-01-01T00:00:00.000000Z',
        });
        const ctx = createRequestContext(
            db, await organizationToken(),
        );
        const before = await getOrganization(ctx);
        assert.equal(before.lastActivityText(), '—');

        await db.states.postEvent(
            'ev1', 'p1', 'approved', 'current',
            '2026-01-01T00:00:00.000000Z',
        );
        const after = await getOrganization(ctx);
        assert.notEqual(after.lastActivityText(), '—');
        assert.match(
            after.lastActivityText(), /\d{4}/,
        );
    },
);
