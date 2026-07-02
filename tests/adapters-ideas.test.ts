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
import { postMockDataLoad } from '../api/mock-data.ts';
import {
    getIdeas,
    getIdea,
    putIdea,
    postIdeaCreation,
    postIdeaStateChange,
    postIdeaConversion,
} from '../web-app/app/adapters/ideas.ts';
import {
    type IdeaEntity,
    type ProjectEntity,
    type ProjectObjectiveBaselineScoreEntity,
} from '../api/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';

function buildIdea(
    id: string, title: string,
): Omit<IdeaEntity, 'id'> {
    return {
        organization_id: '1',
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
    await db.states.postEvent(
        `st-${ideaId}`,
        ideaId,
        state,
        'system',
        '2026-01-01T00:00:00.000000Z',
    );
}

test('getIdeas returns ideas with submitter', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await db.ideas.put('i1', buildIdea(
        'i1', 'First idea',
    ));
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
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
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
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
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await db.ideas.put('i1', buildIdea(
        'i1', 'A',
    ));
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
    });
    const result = await getIdea(ctx, 'i1');
    assert.equal(result.idea.titleText(), 'A');
    assert.equal(
        result.submitterName, 'Alice Test',
    );
});

test('getIdea throws on missing submission', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
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
    const { db, ctx } = await adminContext();
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
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await db.ideas.put(
        'i1', buildIdea('i1', 'Keep'),
    );
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
    });
    await db.ideas.put(
        'i2', buildIdea('i2', 'Hide me'),
    );
    await seedIdeaState(db, 'i2', 'archived');
    await db.ideaSubmissions.put('s2', {
        idea_id: 'i2',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
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
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'current', 'Demo User',
        );

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
            await db.states.getAllFor('i1');
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
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'current', 'Demo User',
        );
        await db.ideas.put(
            'i1', buildIdea('i1', 'Original'),
        );
        await seedIdeaState(db, 'i1', 'in_review');
        const before =
            await db.ideas.getById('i1');

        await postIdeaStateChange(
            ctx, 'i1', 'approved',
        );

        const after =
            await db.ideas.getById('i1');
        assert.deepEqual(after, before);
        const events =
            await db.states.getAllFor('i1');
        assert.equal(events.length, 2);
        assert.equal(
            events.at(-1)?.state, 'approved',
        );
    },
);

test(
    'postIdeaConversion commits project, idea,'
    + ' two state events, and N baseline rows in'
    + ' one atomic batch',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'current', 'Demo User',
        );
        await db.ideas.put(
            'i1', buildIdea('i1', 'First'),
        );
        await seedIdeaState(db, 'i1', 'approved');

        const projectEntity:
            Omit<ProjectEntity, 'id'> = {
            organization_id: '1',
            title: 'P1',
            description: 'done when X',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
        };
        const promotedIdea =
            buildIdea('i1', 'First');

        await postIdeaConversion(
            ctx,
            'i1',
            'p1',
            projectEntity,
            'submitted',
            promotedIdea,
            [
                { objectiveId: 'obj-1', score: 50 },
                { objectiveId: 'obj-2', score: -25 },
            ],
            ['obj-1', 'obj-2'],
        );

        const project =
            await db.projects.getById('p1');
        assert.equal(project.title, 'P1');

        const ideaEvents =
            await db.states.getAllFor('i1');
        assert.equal(
            ideaEvents.at(-1)?.state, 'promoted',
        );

        const projectEvents =
            await db.states.getAllFor('p1');
        assert.equal(projectEvents.length, 1);
        assert.equal(
            projectEvents[0]?.state, 'submitted',
        );

        const mine =
            await ctx.GET<
                ProjectObjectiveBaselineScoreEntity[]
            >(
                'projects/p1/objective'
                + '-baseline-scores',
            );
        assert.equal(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [
                b.objective_id, b.score,
            ]),
        );
        assert.equal(byObj.get('obj-1'), 50);
        assert.equal(byObj.get('obj-2'), -25);
    },
);

test(
    'postIdeaConversion rejects a conversion'
    + ' missing a score for an active objective',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'current', 'Demo User',
        );
        await db.ideas.put(
            'i1', buildIdea('i1', 'First'),
        );
        await seedIdeaState(db, 'i1', 'approved');
        const projectEntity:
            Omit<ProjectEntity, 'id'> = {
            organization_id: '1',
            title: 'P1',
            description: 'done when X',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
        };
        await assert.rejects(
            () => postIdeaConversion(
                ctx,
                'i1',
                'p1',
                projectEntity,
                'submitted',
                buildIdea('i1', 'First'),
                [
                    { objectiveId: 'obj-1', score: 5 },
                ],
                ['obj-1', 'obj-2'],
            ),
            /every active objective/,
        );
    },
);

test('deleted ideas are filtered from getIdeas', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await db.ideas.put(
        'i1', buildIdea('i1', 'Keep'),
    );
    await seedIdeaState(db, 'i1', 'active');
    await db.ideaSubmissions.put('s1', {
        idea_id: 'i1',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
    });
    await db.ideas.put(
        'i2', buildIdea('i2', 'Delete me'),
    );
    await seedIdeaState(db, 'i2', 'active');
    await db.ideaSubmissions.put('s2', {
        idea_id: 'i2',
        member_id: 'u1',
        at: '2026-04-01T00:00:00.000000Z',
    });
    await db.ideas.delete('i2');
    const result = await getIdeas(ctx);
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(), 'Keep',
    );
});

// The Organization page calls getIdeas per org; a submitter
// outside the idea's org roster makes memberName throw and
// crashes the page. The seed must keep every submitter a
// co-member of their idea's org, in BOTH orgs.
test('getIdeas resolves every seeded submitter in'
    + ' both orgs', async () => {
    const db = new MemoryDbAdapter();
    await db.postSchemaCreation();
    await postMockDataLoad(db);
    for (const organization of ['1', '2']) {
        const ctx = createRequestContext(
            db, await organizationToken('current', organization));
        const ideas = await getIdeas(ctx);
        for (const i of ideas) {
            assert.ok(
                i.submitterName.length > 0,
                'empty submitter in org ' + organization);
        }
    }
});
