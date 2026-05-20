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
    getOrganizationStats,
} from '../web-app/app/adapters/admin.ts';
import type {
    ProjectEntity, IdeaEntity,
    HumanWorkerEntity,
    JsonArrayField, JsonObjectField,
} from '../api/types.ts';

function setupDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

function buildProject(
    id: string,
): Omit<ProjectEntity, 'id'> {
    return {
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
        title: 'I-' + id,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

function buildWorker(
    id: string,
): Omit<HumanWorkerEntity, 'id'> {
    return {
        first_name: 'F-' + id,
        last_name: 'L',
        email: id + '@x.test',
        title: 'product_manager',
        department: 'Product',
        strengths: '[]' as JsonArrayField,
        team_dimensions:
            '{}' as JsonObjectField,
        phone: '',
        bio: '',
    };
}

async function seedProject(
    db: MemoryDbAdapter,
    id: string, state: string,
): Promise<void> {
    await db.projects.put(id, buildProject(id));
    await db.states.record(
        'sp-' + id, id, state, 'system',
    );
}

async function seedIdea(
    db: MemoryDbAdapter,
    id: string, state: string,
    submitter: string,
): Promise<void> {
    await db.ideas.put(id, buildIdea(id));
    await db.states.record(
        'si-' + id, id, state, 'system',
    );
    await db.ideaSubmissions.put('sub-' + id, {
        idea_id: id,
        worker_id: submitter,
        at: '2026-04-01T00:00:00Z',
    });
}

async function seedWorker(
    db: MemoryDbAdapter,
    id: string, state: string,
): Promise<void> {
    await db.workers.put(id, buildWorker(id));
    await db.states.record(
        'sw-' + id, id, state, 'system',
    );
}

test(
    'getOrganizationStats counts projects that'
    + ' are not deleted or declined',
    async () => {
        const { db, ctx } = setupDb();
        await seedProject(db, 'p1', 'submitted');
        await seedProject(
            db, 'p2', 'under-review',
        );
        await seedProject(db, 'p3', 'approved');
        await seedProject(db, 'p4', 'completed');
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
        const { db, ctx } = setupDb();
        await seedWorker(db, 'u1', 'active');
        await seedIdea(
            db, 'i1', 'active:ready', 'u1',
        );
        await seedIdea(
            db, 'i2', 'in-review', 'u1',
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
    + ' human workers',
    async () => {
        const { db, ctx } = setupDb();
        await seedWorker(db, 'u1', 'active');
        await seedWorker(db, 'u2', 'active');
        await seedWorker(db, 'u3', 'pending');
        await seedWorker(db, 'u4', 'archived');
        const stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.activePeopleCount, 2);
    },
);

test(
    'getOrganizationStats reflects latest state'
    + ' event when entities transition',
    async () => {
        const { db, ctx } = setupDb();
        await seedWorker(db, 'u1', 'active');
        await seedProject(db, 'p1', 'approved');
        await seedIdea(
            db, 'i1', 'active:ready', 'u1',
        );
        let stats =
            await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 1);
        assert.equal(stats.ideasCurrent, 1);
        assert.equal(stats.activePeopleCount, 1);

        // Transitions through later state events
        // (latest by 'at' wins).
        await db.states.record(
            'sp1-next', 'p1', 'declined',
            'system',
        );
        await db.states.record(
            'si1-next', 'i1', 'archived',
            'system',
        );
        await db.states.record(
            'sw1-next', 'u1', 'archived',
            'system',
        );
        stats = await getOrganizationStats(ctx);
        assert.equal(stats.projectsCurrent, 0);
        assert.equal(stats.ideasCurrent, 0);
        assert.equal(stats.activePeopleCount, 0);
    },
);
