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
    getIdeas,
    getIdea,
    putIdea,
    postIdeaCreation,
    postIdeaStateChange,
} from '../web-app/app/adapters/ideas.ts';
import type {
    IdeaEntity,
} from '../api/types.ts';

function buildPerson(id: string, name: string) {
    return {
        id,
        first_name: name,
        last_name: 'Test',
        email: `${name}@example.com`
            .toLowerCase(),
        phone: '',
        title: 'product_manager' as const,
        strengths: '[]' as const,
        team_dimensions: '{}' as const,
        bio: '',
        department: 'Product',
    };
}

function buildIdea(
    id: string, title: string,
): Omit<IdeaEntity, 'id'> {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
    };
}

async function seedIdeaState(
    db: MemoryDbAdapter,
    ideaId: string,
    state: string,
): Promise<void> {
    await db.states.record(
        `st-${ideaId}`,
        ideaId,
        state,
        'system',
    );
}

async function seedWorkerState(
    db: MemoryDbAdapter,
    workerId: string,
): Promise<void> {
    await db.states.record(
        `stw-${workerId}`,
        workerId,
        'active',
        'system',
    );
}

function setupDb(): {
    db: MemoryDbAdapter;
    ctx: RequestContext;
} {
    const db = new MemoryDbAdapter();
    const ctx = createRequestContext(db);
    return { db, ctx };
}

test('getIdeas returns ideas with submitter', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put('i1', buildIdea(
        'i1', 'First idea',
    ));
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    const result = await getIdeas(ctx);
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(),
        'First idea',
    );
    assert.equal(
        result[0]?.submitterName,
        'Alice Test',
    );
    assert.equal(
        result[0]?.idea.stateValue(),
        'active',
    );
});

test('getIdeas throws when idea has no submission', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put('i1', buildIdea(
        'i1', 'Orphan',
    ));
    await seedIdeaState(db, 'i1', 'active');
    // No submission for i1
    await assert.rejects(
        () => getIdeas(ctx),
        /no submission/,
    );
});

test('getIdea finds submission for one idea', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put('i1', buildIdea(
        'i1', 'A',
    ));
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    const result = await getIdea(ctx, 'i1');
    assert.equal(result.idea.titleText(), 'A');
    assert.equal(
        result.submitterName, 'Alice Test',
    );
});

test('getIdea throws on missing submission', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put(
        'i1', buildIdea('i1', 'A'),
    );
    await seedIdeaState(db, 'i1', 'active');
    await assert.rejects(
        () => getIdea(ctx, 'i1'),
        /submission not found/,
    );
});

test('putIdea persists changes', async () => {
    const { db, ctx } = setupDb();
    await db.ideas.put(
        'i1', buildIdea('i1', 'Original'),
    );
    await putIdea(ctx, 'i1', {
        ...buildIdea('i1', 'Updated'),
    });
    const stored =
        await db.ideas.getById('i1');
    assert.equal(stored.title, 'Updated');
});

test('archived ideas are filtered from getIdeas', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put(
        'i1', buildIdea('i1', 'Keep'),
    );
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    await db.ideas.put(
        'i2', buildIdea('i2', 'Hide me'),
    );
    await seedIdeaState(db, 'i2', 'archived');
    await db.ideaSubmissions.put('s2', {
        idea_id: 'i2',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    const result = await getIdeas(ctx);
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(), 'Keep',
    );
});

test(
    'postIdeaCreation persists the row and'
    + ' records the initial state event',
    async () => {
        const { db, ctx } = setupDb();
        await db.workers.put(
            'current',
            buildPerson('current', 'Demo'),
        );
        await seedWorkerState(db, 'current');

        await postIdeaCreation(
            ctx,
            'i1',
            buildIdea('i1', 'Fresh'),
            'active',
        );

        const row =
            await db.ideas.getById('i1');
        assert.equal(row.title, 'Fresh');
        const events =
            await db.states.allFor('i1');
        assert.equal(events.length, 1);
        assert.equal(
            events[0]?.state,
            'active',
        );
    },
);

test(
    'postIdeaStateChange records a state event'
    + ' without touching the idea row',
    async () => {
        const { db, ctx } = setupDb();
        await db.workers.put(
            'current',
            buildPerson('current', 'Demo'),
        );
        await seedWorkerState(db, 'current');
        await db.ideas.put(
            'i1', buildIdea('i1', 'Original'),
        );
        await seedIdeaState(db, 'i1', 'in-review');
        const before =
            await db.ideas.getById('i1');

        await postIdeaStateChange(
            ctx, 'i1', 'approved',
        );

        const after =
            await db.ideas.getById('i1');
        assert.deepEqual(after, before);
        const events =
            await db.states.allFor('i1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'approved',
        );
    },
);

test('deleted ideas are filtered from getIdeas', async () => {
    const { db, ctx } = setupDb();
    await db.workers.put(
        'u1', buildPerson('u1', 'Alice'),
    );
    await seedWorkerState(db, 'u1');
    await db.ideas.put(
        'i1', buildIdea('i1', 'Keep'),
    );
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    await db.ideas.put(
        'i2', buildIdea('i2', 'Delete me'),
    );
    await seedIdeaState(db, 'i2', 'active');
    await db.ideaSubmissions.put('s2', {
        idea_id: 'i2',
        worker_id: 'u1',
        at: '2026-04-01T00:00:00Z',
    });
    await db.ideas.delete('i2');
    const result = await getIdeas(ctx);
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(), 'Keep',
    );
});
