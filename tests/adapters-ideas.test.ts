import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    MemoryDbAdapter,
} from '../api/db-memory.ts';
import {
    createRequestContext,
    type RequestContext,
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
    type IdeaState,
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

// Seeds an idea through the SAME document PUT the live route
// uses (postIdeaCreation), so a message pair exists at this
// idea's address — required for the flipped GET ideas / GET
// ideas/:id routes (Phase 2 Task 5) to derive it. The direct
// db.ideas.put + seedIdeaState idiom above stays for tests that
// read only the raw stores or drive an op directly.
async function seedIdea(
    ctx: RequestContext,
    id: string,
    title: string,
    state: IdeaState,
): Promise<void> {
    const { organization_id: _organizationId, ...entity } =
        buildIdea(id, title);
    await postIdeaCreation(ctx, id, entity, state);
}

// Seeds a submission through the live PUT
// ideas/:id/submissions/:sid route, so its message pair exists
// for the flipped GET ideas/:id/submissions (Phase 2 Task 5) to
// derive it. Takes an explicit memberId (unlike the
// putIdeaSubmission adapter, which always stamps the CURRENT
// actor) so a submission can be attributed to a co-member.
async function seedIdeaSubmission(
    ctx: RequestContext,
    submissionId: string,
    ideaId: string,
    memberId: string,
    at: string,
): Promise<void> {
    await ctx.PUT(
        'ideas/' + ideaId + '/submissions/' + submissionId,
        { idea_id: ideaId, member_id: memberId, at },
    );
}

test('getIdeas returns ideas with submitter', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await seedIdea(ctx, 'i1', 'First idea', 'active');
    await seedIdeaSubmission(
        ctx, 's1', 'i1', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
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
    await seedIdea(ctx, 'i1', 'Orphan', 'active');
    // No submission for i1
    await assert.rejects(
        () => getIdeas(ctx),
        /no submission/,
    );
});

test('getIdea finds submission for one idea', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await seedIdea(ctx, 'i1', 'A', 'active');
    await seedIdeaSubmission(
        ctx, 's1', 'i1', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
    const result = await getIdea(ctx, 'i1');
    assert.equal(result.idea.titleText(), 'A');
    assert.equal(
        result.submitterName, 'Alice Test',
    );
});

test('getIdea throws on missing submission', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await seedIdea(ctx, 'i1', 'A', 'active');
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
        state: 'active',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-i1',
    });
    const stored =
        await db.ideas.getById('i1');
    assert.equal(stored.title, 'Updated');
});

test('archived ideas are filtered from getIdeas', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, 'u1', 'Alice Test');
    await seedIdea(ctx, 'i1', 'Keep', 'active');
    await seedIdeaSubmission(
        ctx, 's1', 'i1', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
    await seedIdea(ctx, 'i2', 'Hide me', 'archived');
    await seedIdeaSubmission(
        ctx, 's2', 'i2', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
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
            ctx, before, 'approved',
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
    await seedIdea(ctx, 'i1', 'Keep', 'active');
    await seedIdeaSubmission(
        ctx, 's1', 'i1', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
    await seedIdea(ctx, 'i2', 'Delete me', 'active');
    await seedIdeaSubmission(
        ctx, 's2', 'i2', 'u1',
        '2026-04-01T00:00:00.000000Z',
    );
    // A transition to 'deleted' (ideas has no DELETE route) —
    // the flipped GET ideas derives visibility from the
    // lifecycle trio, not a raw db.ideas.delete row removal, so
    // the deletion must land as a document PUT like any other
    // transition (mirrors drift-ideas.test.ts's lifecycle case).
    await postIdeaStateChange(
        ctx, await db.ideas.getById('i2'), 'deleted',
    );
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
