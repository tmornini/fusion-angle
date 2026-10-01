import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    type RequestContext,
} from '../client/request-context.ts';
import {
    inPageContext,
    recordedContext,
} from './in-page-facade.ts';
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
} from '../client/ideas.ts';
import { getProjectEntity } from
    '../client/projects.ts';
import {
    type IdeaEntity,
    type IdeaState,
    type ProjectEntity,
    type ProjectObjectiveBaselineScoreEntity,
} from '../shared/types.ts';
import {
    seedHumanMember,
} from './member-fixtures.ts';
import { seededMockDb } from './mock-seed.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import { deleteHumanMemberSeat } from
    '../client/members.ts';
import { FORMER_MEMBER_NAME } from '../shared/types.ts';
import { STARK_ORGANIZATION } from
    '../api/mock-data/seed-constants.ts';
import { RequestError } from '../shared/http-errors.ts';

function buildIdea(
    _id: string, title: string,
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
// idea's document — required for the flipped GET ideas / GET
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

Deno.test('getIdeas as member lists a co-member idea',
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
    const memberCtx = inPageContext(
        db, await organizationToken(aliceId),
    );
    const result = await getIdeas(memberCtx);
    const hit = result.find(
        row => row.idea.titleText() === 'Member list',
    );
    assert(hit);
});

Deno.test('getIdeas returns ideas with submitter', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'First idea', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    const result = await getIdeas(ctx);
    assertStrictEquals(result.length, 1);
    assertStrictEquals(
        result[0]?.idea.titleText(),
        'First idea',
    );
    assertStrictEquals(
        result[0]?.submitterName,
        'Alice Test',
    );
    assertStrictEquals(
        result[0]?.idea.stateValue(),
        'active',
    );
});

Deno.test('getIdeas throws when idea has no submission', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, generateIdentifier(), 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Orphan', 'active');
    // No submission for fndCYAsXazdzMUlEGMNIZw
    await assertRejects(
        () => getIdeas(ctx),
        Error,
        'no submission',
    );
});

Deno.test('getIdea finds submission for one idea', async () => {
    const { db, ctx } = await adminContext();
    const aliceId = generateIdentifier();
    await seedHumanMember(db, aliceId, 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'A', 'active');
    await seedIdeaSubmission(
        ctx, 'syWUUcdBSbBgMwBiCrgbDw', 'fndCYAsXazdzMUlEGMNIZw', aliceId,
        '2026-04-01T00:00:00.000000Z',
    );
    const result = await getIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw');
    assertStrictEquals(result.idea.titleText(), 'A');
    assertStrictEquals(
        result.submitterName, 'Alice Test',
    );
});

Deno.test('getIdea throws on missing submission', async () => {
    const { db, ctx } = await adminContext();
    await seedHumanMember(db, generateIdentifier(), 'Alice Test');
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'A', 'active');
    await assertRejects(
        () => getIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw'),
        Error,
        'submission not found',
    );
    // getIdea fans three reads out through Promise.all; the
    // submission's rejection settles the caller while the
    // other two are still in flight. Yield a macrotask turn
    // so those ops complete in the test that started them.
    await new Promise(resolve => setTimeout(resolve, 0));
});

Deno.test('putIdea persists changes', async () => {
    const { ctx } = await adminContext();
    await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Original', 'active');
    const before = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
    const {
        id: _id,
        organization_id: _organizationId,
        ...fields
    } = before.body().toValue();
    await putIdea(ctx, before, {
        ...fields,
        title: 'Updated',
        state: 'active',
    });
    const stored = (await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw'))
        .body().toValue();
    assertStrictEquals(stored.title, 'Updated');
});

const LATCHED = 'fndCYAsXazdzMUlEGMNIZw';

Deno.test('a save latches the held idea and answers the'
    + ' new head', async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await seedIdea(ctx, LATCHED, 'Original', 'active');
    const held = await getIdeaEntity(ctx, LATCHED);
    const { id: _id, organization_id: _o, ...fields } =
        held.body().toValue();
    sent.length = 0;
    const saved = await putIdea(
        ctx, held, { ...fields, title: 'Once' },
    );
    assertEquals(
        sent.map((r) => [r.method, r.ifMatch]),
        [['PUT', held.query('header.etag').toText()]],
    );
    const again = await putIdea(
        ctx, saved, { ...fields, title: 'Twice' },
    );
    assertStrictEquals(again.body().toValue().title, 'Twice');
    await assertRejects(
        () => putIdea(ctx, held, { ...fields, title: 'Stale' }),
        RequestError,
        'If-Match does not match',
    );
});

Deno.test('a transition latches the held idea', async () => {
    const { db } = await adminContext();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await seedIdea(ctx, LATCHED, 'Moving', 'active');
    const held = await getIdeaEntity(ctx, LATCHED);
    sent.length = 0;
    await postIdeaStateChange(ctx, held, 'in_review');
    assertEquals(
        sent.map((r) => r.ifMatch),
        [held.query('header.etag').toText()],
    );
});

Deno.test('archived ideas are filtered from getIdeas', async () => {
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
    assertStrictEquals(result.length, 1);
    assertStrictEquals(
        result[0]?.idea.titleText(), 'Keep',
    );
});

Deno.test(
    'postIdeaCreation persists via GET with the'
    + ' initial state',
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

        const row = (await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw'))
            .body().toValue();
        assertStrictEquals(row.title, 'Fresh');
        assertStrictEquals(row.state, 'active');
    },
);

Deno.test(
    'postIdeaStateChange changes state without'
    + ' changing entity fields on GET',
    async () => {
        const { db, ctx } = await adminContext();
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );
        await seedIdea(ctx, 'fndCYAsXazdzMUlEGMNIZw', 'Original'
            , 'in_review');
        const held = await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw');
        const before = held.body().toValue();

        await postIdeaStateChange(
            ctx, held, 'approved',
        );

        const after = (await getIdeaEntity(ctx, 'fndCYAsXazdzMUlEGMNIZw'))
            .body().toValue();
        // Entity content fields unchanged; GET reflects the
        // transition.
        assertStrictEquals(after.title, before.title);
        assertStrictEquals(after.position, before.position);
        assertStrictEquals(
            after.problem_statement,
            before.problem_statement,
        );
        assertStrictEquals(after.state, 'approved');
    },
);

Deno.test(
    'postIdeaConversion commits project, idea,'
    + ' and N baseline rows in one atomic batch',
    async () => {
        const { db } = await adminContext();
        const { ctx, sent } = recordedContext(
            db, await organizationToken(),
        );
        await seedHumanMember(
            db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo User',
        );
        const ideaId = 'fndCYAsXazdzMUlEGMNIZw';
        await seedIdea(ctx, ideaId, 'First', 'approved');
        const held = await getIdeaEntity(ctx, ideaId);
        sent.length = 0;
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
            state: 'submitted',
        };
        const { organization_id: _o, ...promotedIdea } =
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'First');

        await postIdeaConversion(
            ctx,
            held,
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
        assertEquals(
            sent.filter((r) => r.method === 'GET'
                && r.path.endsWith('/ideas/' + ideaId)),
            [],
        );
        assertStrictEquals(
            sent.find((r) => r.method === 'POST')!.ifMatch,
            held.query('header.etag').toText(),
        );

        // Phase Final Task 2: projects row half stripped —
        // read via GET /organizations/:id/projects/:id.
        const project = (await ctx.GET<{ title: string }>(
            'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                + 'pnXmXrxOWayANgDLdCjuBw',
        )).body().toValue();
        assertStrictEquals(project.title, 'P1');

        const idea = (await getIdeaEntity(
            ctx, 'fndCYAsXazdzMUlEGMNIZw',
        )).body().toValue();
        assertStrictEquals(idea.state, 'promoted');

        const promotedProject = await getProjectEntity(
            ctx, 'pnXmXrxOWayANgDLdCjuBw',
        );
        assertStrictEquals(promotedProject.state, 'submitted');

        const mine =
            (await ctx.GETCollection<
                ProjectObjectiveBaselineScoreEntity
            >(
                'organizations/AjdvjuECVZEgZoFajaIEkg/projects/'
                    + 'pnXmXrxOWayANgDLdCjuBw/objective'
                + '-baseline-scores/',
            )).map((part) => part.body().toValue());
        assertStrictEquals(mine.length, 2);
        const byObj = new Map(
            mine.map(b => [
                b.objective_id, b.score,
            ]),
        );
        assertStrictEquals(byObj.get(obj1), 50);
        assertStrictEquals(byObj.get(obj2), -25);
    },
);

Deno.test(
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
            state: 'submitted',
        };
        const { organization_id: _o, ...promotedIdea } =
            buildIdea('fndCYAsXazdzMUlEGMNIZw', 'First');
        const obj1 = generateIdentifier();
        const obj2 = generateIdentifier();
        const held = await getIdeaEntity(
            ctx, 'fndCYAsXazdzMUlEGMNIZw',
        );
        await assertRejects(
            () => postIdeaConversion(
                ctx,
                held,
                'pnXmXrxOWayANgDLdCjuBw',
                projectEntity,
                'submitted',
                promotedIdea,
                [
                    { objectiveId: obj1, score: 5 },
                ],
                [obj1, obj2],
            ),
            Error,
            'every active objective',
        );
    },
);

Deno.test('deleted ideas are filtered from getIdeas', async () => {
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
    // state rides the document body; a head whose state is
    // `deleted` is a tombstone, so the deletion must land as
    // a document PUT like any other transition.
    await postIdeaStateChange(
        ctx, await getIdeaEntity(ctx, 'fxysGbBPBsnCwJNJsyZnkA'), 'deleted',
    );
    const result = await getIdeas(ctx);
    assertStrictEquals(result.length, 1);
    assertStrictEquals(
        result[0]?.idea.titleText(), 'Keep',
    );
});

// The Organization page calls getIdeas per org; a submitter
// outside the idea's org roster makes memberName throw and
// crashes the page. The seed must keep every submitter a
// co-member of their idea's org, in BOTH orgs.
Deno.test('getIdeas resolves every seeded submitter in'
    + ' both orgs', async () => {
    const db = await seededMockDb();
    for (const organization of ['AjdvjuECVZEgZoFajaIEkg'
        , 'BBjWJsjYIDkTRKIIPrzWRw']) {
        const ctx = inPageContext(
            db, await organizationToken('XXZruirZyAOoRpNxaDnpSA'
                , organization));
        const ideas = await getIdeas(ctx);
        for (const i of ideas) {
            assert(
                i.submitterName.length > 0,
                'empty submitter in org ' + organization);
        }
    }
});

Deno.test('getIdeas lists an idea whose submitter left (D1)',
async () => {
    const { db, ctx } = await adminContext();
    const leaverId = generateIdentifier();
    const ideaId = generateIdentifier();
    await seedHumanMember(db, leaverId, 'Lisa Leaver');
    await seedIdea(ctx, ideaId, 'Left behind', 'active');
    await seedIdeaSubmission(
        ctx, generateIdentifier(), ideaId, leaverId,
        '2026-04-01T00:00:00.000000Z',
    );
    await deleteHumanMemberSeat(ctx, leaverId);
    const rows = await getIdeas(ctx);
    assertStrictEquals(rows.length, 1);
    assertStrictEquals(rows[0]!.idea.idForLink(), ideaId);
    assertStrictEquals(
        rows[0]!.submitterName, FORMER_MEMBER_NAME,
    );
});

// The walk's own shape (B28, then D1): the seed's Lisa Wang
// (RPzLGrWcstxLaHoBcViPLQ) submits two of Stark's six
// visible ideas. Removing her seat leaves the list whole.
Deno.test(
    'getIdeas survives B28 removing a seeded submitter (D1)',
    async () => {
        const db = await seededMockDb();
        const ctx = inPageContext(
            db,
            await organizationToken(
                'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION,
            ),
        );
        await deleteHumanMemberSeat(
            ctx, 'RPzLGrWcstxLaHoBcViPLQ',
        );
        const rows = await getIdeas(ctx);
        assertStrictEquals(rows.length, 6);
        assertStrictEquals(
            rows.filter(
                r => r.submitterName === FORMER_MEMBER_NAME,
            ).length,
            2,
        );
    },
);
