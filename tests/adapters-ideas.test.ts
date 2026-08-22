import { test } from 'node:test';
import { deriveIdeaStateHistory } from
    '../api/derive-ideas.ts';
import { deriveProjectStateHistory } from
    '../api/derive-projects.ts';
import { strict as assert } from 'node:assert';
import {
    createRequestContext,
    type RequestContext,
} from '../web-app/app/adapters/shared.ts';
import { organizationToken } from './token-fixtures.ts';
import { adminContext } from './context-fixtures.ts';
import {
    getIdeas,
    getIdea,
    getIdeaEntity,
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
import { seededMockDb } from './mock-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

// PUT/create body: no lifecycle trio — postIdeaCreation mints
// state/stateAt/stateEventId. GET IdeaEntity carries the
// stamped trio (Phase A); list/detail read it from the row.
function buildIdea(
    id: string, title: string,
): Omit<
    IdeaEntity,
    'id' | 'state' | 'state_at' | 'state_event_id'
> {
    return {
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title,
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
// idea's address — required for the flipped GET ideas / GET
// organizations/:id/ideas/:id routes (Phase 2 Task 5) to derive it. Phase
// Final
// Task 2 stripped the ideas row half: every test that needs a
// readable idea must go through this path (or putIdea), never
// a raw db.ideas.put.
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
// organizations/:id/ideas/:id/submissions/:sid route, so its message pair
// exists
// for the flipped GET organizations/:id/ideas/:id/submissions (Phase 2 Task
// 5) to
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
        'organizations/AjdvjuECVZEgZoFajaIEkg/ideas/' + ideaId
            + '/submissions/' + submissionId,
        { idea_id: ideaId, member_id: memberId, at },
    );
}

test('getIdeas as member lists a co-member idea',
async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    const ideaId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, ideaId, 'Member list',
        'active');
    await seedIdeaSubmission(
        ctx, generateIdentifier(), ideaId, aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    const memberCtx = createRequestContext(
        db, await organizationToken(aliceId),
    );
    const result = await getIdeas(memberCtx);
    const hit = result.find(
        row => row.idea.titleText() === 'Member list',
    );
    assert.ok(hit);
});

test('getIdeas returns ideas with submitter', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'First idea', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
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
    await seedHumanMember(db, generateIdentifier(), 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Orphan', 'active');
    // No submission for fndCYAsXazdzMUlEGMNIZw
    await assert.rejects(
        () => getIdeas(ctx),
        /no submission/,
    );
});

test('getIdea finds submission for one idea', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'A', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    const result = await getIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw');
    assert.equal(result.idea.titleText(), 'A');
    assert.equal(
        result.submitterName, 'Alice Test',
    );
});

test('getIdea throws on missing submission', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, generateIdentifier(), 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'A', 'active');
    await assert.rejects(
        () => getIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw'),
        /submission not found/,
    );
});

test('putIdea persists changes', async () => {
    const { ctx } = await adminContext();
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Original', 'active');
    const before = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
    const {
        id: _id,
        organization_id: _organizationId,
        ...fields
    } = before;
    await putIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', {
        ...fields,
        title: 'Updated',
        state: 'active',
    });
    const stored = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
    assert.equal(stored.title, 'Updated');
});

test('archived ideas are filtered from getIdeas', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Keep', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    await seedIdea(ctx, 'fxysGbBPBsnCwJNJsyZnkA', 'Hide me', 'archived');
    await seedIdeaSubmission(
        ctx, generateIdentifier(), 'fxysGbBPBsnCwJNJsyZnkA', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    const result = await getIdeas(ctx);
    assert.equal(result.length, 1);
    assert.equal(
        result[0]?.idea.titleText(), 'Keep',
    );
});

test(
    'postIdeaCreation persists via GET and'
    + ' records the initial state event',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );

        const { organization_id: _o, ...entity } =
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'Fresh');
        await postIdeaCreation(
            ctx,
            'fndCYAsXazdzMUlEGMNIZw',
            entity,
            'active',
        );

        const row = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
        assert.equal(row.title, 'Fresh');
        const events =
            await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
                , 'fndCYAsXazdzMUlEGMNIZw');
        assert.equal(events.length, 1);
        assert.equal(
            events[0]?.state,
            'active',
        );
    },
);

test(
    'postIdeaStateChange records a state event'
    + ' without changing non-lifecycle entity fields'
    + ' on GET',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );
        await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Original'
            , 'in_review');
        const before = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');

        await postIdeaStateChange(
            ctx, before, 'approved',
        );

        const after = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
        // Entity content fields unchanged; GET trio advances
        // to the transition event (lifecycle-current stamp).
        assert.equal(after.title, before.title);
        assert.equal(after.position, before.position);
        assert.equal(
            after.problem_statement,
            before.problem_statement,
        );
        assert.equal(after.state, 'approved');
        const events =
            await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
                , 'fndCYAsXazdzMUlEGMNIZw');
        // genesis + transition
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
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );
        await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'First', 'approved');
        const obj1 = generateIdentifier();
        const obj2 = generateIdentifier();

        const projectEntity:
            Omit<ProjectEntity, 'id'> = {
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            title: 'P1',
            description: 'done when X',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
        };
        const { organization_id: _o, ...promotedIdea } =
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'First');

        await postIdeaConversion(
            ctx,
            'fndCYAsXazdzMUlEGMNIZw',
            'pnXmXrxOWayANgDLdCjuBw',
            projectEntity,
            'submitted',
            promotedIdea,
            [
                { objectiveId: obj1, score: 50 },
                { objectiveId: obj2, score: -25 },
            ],
            [obj1, obj2],
        );

        // Phase Final Task 2: projects row half stripped —
        // read via GET /organizations/:id/projects/:id.
        const project = await ctx.GET<{ title: string }>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw',
        );
        assert.equal(project.title, 'P1');

        const ideaEvents =
            await deriveIdeaStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
                , 'fndCYAsXazdzMUlEGMNIZw');
        assert.equal(
            ideaEvents.at(-1)?.state, 'promoted',
        );

        const projectEvents =
            await deriveProjectStateHistory(db, 'AjdvjuECVZEgZoFajaIEkg'
                , 'pnXmXrxOWayANgDLdCjuBw');
        assert.equal(projectEvents.length, 1);
        assert.equal(
            projectEvents[0]?.state, 'submitted',
        );

        const mine =
            await ctx.GET<
                ProjectObjectiveBaselineScoreEntity[]
            >(
                'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + 'pnXmXrxOWayANgDLdCjuBw/objective'
                + '-baseline-scores/',
            );
        assert.equal(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [
                b.objective_id, b.score,
            ]),
        );
        assert.equal(byObj.get(obj1), 50);
        assert.equal(byObj.get(obj2), -25);
    },
);

test(
    'postIdeaConversion rejects a conversion'
    + ' missing a score for an active objective',
    async () => {
        const { ctx } = await adminContext();
        await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'First', 'approved');
        const projectEntity:
            Omit<ProjectEntity, 'id'> = {
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            title: 'P1',
            description: 'done when X',
            progress: 0,
            start_date: '2026-04-01',
            target_end_date: '2026-07-01',
            estimated_cost: 100,
            actual_cost: 0,
            position: 1,
        };
        const { organization_id: _o, ...promotedIdea } =
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'First');
        const obj1 = generateIdentifier();
        const obj2 = generateIdentifier();
        await assert.rejects(
            () => postIdeaConversion(
                ctx,
                'fndCYAsXazdzMUlEGMNIZw',
                'pnXmXrxOWayANgDLdCjuBw',
                projectEntity,
                'submitted',
                promotedIdea,
                [
                    { objectiveId: obj1, score: 5 },
                ],
                [obj1, obj2],
            ),
            /every active objective/,
        );
    },
);

test('deleted ideas are filtered from getIdeas', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Keep', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    await seedIdea(ctx, 'fxysGbBPBsnCwJNJsyZnkA', 'Delete me', 'active');
    await seedIdeaSubmission(
        ctx, generateIdentifier(), 'fxysGbBPBsnCwJNJsyZnkA', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    // A transition to 'deleted' (ideas has no DELETE route) —
    // the flipped GET ideas derives visibility from the
    // lifecycle trio, so the deletion must land as a document
    // PUT like any other transition.
    await postIdeaStateChange(
        ctx, await getIdeaEntity(ctx, 'fxysGbBPBsnCwJNJsyZnkA'), 'deleted',
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
    const db = await seededMockDb();
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        const ctx = createRequestContext(
            db, await organizationToken('XXZruirZyAOoRpNxaDnpSA'
                , organization));
        const ideas = await getIdeas(ctx);
        for (const i of ideas) {
            assert.ok(
                i.submitterName.length > 0,
                'empty submitter in org ' + organization);
        }
    }
});
