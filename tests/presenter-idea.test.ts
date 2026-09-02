import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
} from '@std/assert';
import {
    Idea,
    type IdeaEntity,
    type IdeaState,
    type IdeaStateDetail,
    type ObjectiveEntity,
} from '../api/types.ts';
import {
    DISPLAY_ABSENT,
} from '../web-app/app/format.ts';
import type {
    IdeaWithSubmitter,
} from '../web-app/app/adapters/index.ts';
import {
    IdeaPresenter,
    IdeaEditPresenter,
    ideaDraftFromIdea,
    ideaPatchFromDraft,
    buildInitialIdeaListState,
    applyIdeaListUpdate,
    applyIdeaFilterToggle,
    IdeaListPresenter,
} from '../web-app/app/presenters/idea.ts';
import {
    IdeaCreatePresenter,
    EMPTY_IDEA_CREATE_DRAFT,
    ideaCreateDraftIsComplete,
} from '../web-app/app/presenters/idea-create.ts';
import {
    IdeaConversionPresenter,
    buildInitialConversionDraft,
    conversionRequiredCount,
    conversionCompletedCount,
    conversionIsReady,
    conversionFieldIsReady,
} from '../web-app/app/presenters/idea-conversion.ts';

// None of idea.ts, idea-create.ts, or idea-conversion.ts
// reads localStorage (checked against the full product
// tree). window/document are stubbed because
// IdeaListPresenter renders through setHtml onto a real
// element; the presenters otherwise are pure: their
// render() / build* methods return SafeHtml and never
// touch the DOM. renderShell/renderUpdate on IdeaPresenter
// and IdeaEditPresenter walk a real DOM tree (via
// $required slot lookups), so those flows stay in the
// manual browser plan; here we pin the pure
// SafeHtml-returning surface plus the pure list-state
// functions. IdeaListPresenter renders through setHtml
// (assigns the markup string onto the element), so a
// minimal stub element with a settable markup property is
// enough for it.

interface StubEl {
    captured: string;
    writes: number;
}

function makeStubEl(): StubEl {
    const state: StubEl = {
        captured: '', writes: 0,
    };
    Object.defineProperty(state, 'innerHTML', {
        set(value: string): void {
            state.captured = value;
            state.writes++;
        },
        get(): string {
            return state.captured;
        },
    });
    return state;
}

const g = globalThis as Record<string, unknown>;
g['window'] = {
    matchMedia: () => ({
        matches: false,
        addEventListener: () => {},
        removeEventListener: () => {},
    }),
    addEventListener: () => {},
};
g['document'] = {
    addEventListener: () => {},
};

type IdeaDraftFields = ReturnType<
    typeof ideaDraftFromIdea
>;
type IdeaCreateDraft = typeof EMPTY_IDEA_CREATE_DRAFT;
type ConversionDraft = ReturnType<
    typeof buildInitialConversionDraft
>;

function makeIdeaEntity(
    overrides: Partial<IdeaEntity> = {},
): IdeaEntity {
    return {
        id: 'gVvtDIaqhnkXZQcxZeSuiw',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        title: 'Self-serve onboarding',
        position: 3,
        problem_statement:
            'New users churn before activation',
        target_users: 'Trial signups',
        proposed_solution:
            'Guided checklist with milestones',
        expected_outcome:
            'Higher 7-day activation rate',
        success_metrics:
            '20% lift in activation',
        state: 'active',
        ...overrides,
    };
}

function makeStateDetail(
    state: IdeaState = 'active',
): IdeaStateDetail {
    return {
        state,
    };
}

function makeIdea(
    overrides: Partial<IdeaEntity> = {},
    state: IdeaState = 'active',
): Idea {
    return new Idea(
        makeIdeaEntity(overrides), makeStateDetail(state),
    );
}

function makeWithSubmitter(
    overrides: Partial<IdeaEntity> = {},
    submitterName = 'Ada Lovelace',
    submittedAt = '2026-01-15T10:00:00.000000Z',
    state: IdeaState = 'active',
): IdeaWithSubmitter {
    const entity = makeIdeaEntity(overrides);
    return {
        idea: new Idea(entity, makeStateDetail(state)),
        entity,
        submitterName,
        submittedAt,
    };
}

function makeObjective(
    id: string,
    position: number,
): ObjectiveEntity {
    return {
        id,
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position,
        state: 'active',
    };
}

const FILLED_DRAFT: IdeaDraftFields = {
    title: 'Edited title',
    problemStatement: 'Edited problem',
    targetUsers: 'Edited users',
    proposedSolution: 'Edited solution',
    expectedOutcome: 'Edited outcome',
    successMetrics: 'Edited metrics',
};

// ideaDraftFromIdea / ideaPatchFromDraft

Deno.test(
    'ideaDraftFromIdea copies every editable field'
    + ' from the entity',
    () => {
        const idea = makeIdea();
        const draft = ideaDraftFromIdea(idea);
        assertStrictEquals(
            draft.title, 'Self-serve onboarding',
        );
        assertStrictEquals(
            draft.problemStatement,
            'New users churn before activation',
        );
        assertStrictEquals(
            draft.targetUsers, 'Trial signups',
        );
        assertStrictEquals(
            draft.proposedSolution,
            'Guided checklist with milestones',
        );
        assertStrictEquals(
            draft.expectedOutcome,
            'Higher 7-day activation rate',
        );
        assertStrictEquals(
            draft.successMetrics,
            '20% lift in activation',
        );
    },
);

Deno.test(
    'ideaPatchFromDraft maps camelCase draft to'
    + ' snake_case entity columns',
    () => {
        const patch = ideaPatchFromDraft(
            FILLED_DRAFT,
        );
        assertStrictEquals(patch.title, 'Edited title');
        assertStrictEquals(
            patch.problem_statement,
            'Edited problem',
        );
        assertStrictEquals(
            patch.target_users, 'Edited users',
        );
        assertStrictEquals(
            patch.proposed_solution,
            'Edited solution',
        );
        assertStrictEquals(
            patch.expected_outcome,
            'Edited outcome',
        );
        assertStrictEquals(
            patch.success_metrics,
            'Edited metrics',
        );
    },
);

Deno.test(
    'ideaPatchFromDraft then ideaDraftFromIdea'
    + ' round-trips through a new Idea',
    () => {
        const base = makeIdeaEntity();
        const patch = ideaPatchFromDraft(
            FILLED_DRAFT,
        );
        const roundTripped = new Idea(
            { ...base, ...patch },
            makeStateDetail(),
        );
        assertEquals(
            ideaDraftFromIdea(roundTripped),
            FILLED_DRAFT,
        );
    },
);

// IdeaPresenter: pure getters + SafeHtml

Deno.test(
    'IdeaPresenter.buildCard renders the title,'
    + ' state badge, and card data attributes',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea(), 'Ada Lovelace',
            '2026-01-15T10:00:00.000000Z',
        );
        const out = presenter
            .buildCard(true).toString();
        assertMatch(out, /Self-serve onboarding/);
        assertMatch(out, /badge badge-success/);
        assertMatch(out, /Active/);
        assert(!out.includes('Incomplete'));
        assertMatch(
            out, /data-idea-card="gVvtDIaqhnkXZQcxZeSuiw"/,
        );
        assertMatch(out, /data-position="3"/);
        assert(!out.includes('undefined'));
    },
);

Deno.test(
    'IdeaPresenter.buildCard shows the grip handle'
    + ' only when showGrip is true',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea(), 'X', 'y',
        );
        const withGrip = presenter
            .buildCard(true).toString();
        const withoutGrip = presenter
            .buildCard(false)
            .toString();
        assertMatch(withGrip, /drag-handle/);
        assert(!withoutGrip.includes(
            'drag-handle',
        ));
    },
);

Deno.test(
    'IdeaPresenter.buildCard exposes a Convert'
    + ' affordance only for approved ideas',
    () => {
        const approved = new IdeaPresenter(
            makeIdea({}, 'approved'),
            'X', 'y',
        );
        const active = new IdeaPresenter(
            makeIdea({}, 'active'), 'X', 'y',
        );
        assertMatch(
            approved.buildCard(false)
                .toString(),
            /data-idea-convert="gVvtDIaqhnkXZQcxZeSuiw"/,
        );
        assert(
            !active.buildCard(false)
                .toString()
                .includes('data-idea-convert'),
        );
    },
);

Deno.test(
    'IdeaPresenter.buildStateBadge marks the'
    + ' badge dimmed when isActive is false',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea({}, 'in_review'),
            'X', 'y',
        );
        const dimmed = presenter
            .buildStateBadge(false).toString();
        const lit = presenter
            .buildStateBadge(true).toString();
        const neutral = presenter
            .buildStateBadge(null).toString();
        assertMatch(
            dimmed, /data-dimmed="true"/,
        );
        assertMatch(lit, /data-dimmed="false"/);
        assertMatch(
            neutral, /data-dimmed="false"/,
        );
        assertMatch(
            dimmed, /data-state="in_review"/,
        );
        assertMatch(dimmed, /In Review/);
    },
);

Deno.test(
    'IdeaPresenter state predicates reflect the'
    + ' wrapped idea state',
    () => {
        const review = new IdeaPresenter(
            makeIdea({}, 'in_review'),
            'X', 'y',
        );
        assertStrictEquals(review.isReviewable(), true);
        assertStrictEquals(review.isConvertible(), false);
        assertStrictEquals(review.canSubmit(), false);
        assertStrictEquals(
            review.stateGroup(), 'in_review',
        );
        assertStrictEquals(
            review.matchesState('in_review'), true,
        );
        assertStrictEquals(
            review.matchesState('active'), false,
        );

        const active = new IdeaPresenter(
            makeIdea(
                { position: 9 }, 'active',
            ),
            'X', 'y',
        );
        assertStrictEquals(active.canSubmit(), true);
        assertStrictEquals(active.isReviewable(), false);
        assertStrictEquals(active.positionSortKey(), 9);
        assertStrictEquals(active.idForLink(), 'gVvtDIaqhnkXZQcxZeSuiw');
    },
);

Deno.test(
    'Idea.readinessValue is ready when all four'
    + ' required fields are non-empty',
    () => {
        const ready = makeIdea();
        assertStrictEquals(ready.readinessValue(), 'ready');
        assertStrictEquals(ready.isReady(), true);
    },
);

Deno.test(
    'Idea.readinessValue is incomplete when any'
    + ' required field is empty',
    () => {
        const requiredFields: Array<
            Partial<IdeaEntity>
        > = [
            { title: '' },
            { problem_statement: '' },
            { proposed_solution: '' },
            { expected_outcome: '' },
        ];
        for (const empty of requiredFields) {
            const idea = makeIdea(empty);
            assertStrictEquals(
                idea.readinessValue(), 'incomplete',
                JSON.stringify(empty),
            );
            assertStrictEquals(idea.isReady(), false);
        }
    },
);

Deno.test(
    'Idea.readinessValue stays ready when only'
    + ' optional fields are empty',
    () => {
        const idea = makeIdea({
            target_users: '',
            success_metrics: '',
        });
        assertStrictEquals(idea.readinessValue(), 'ready');
    },
);

Deno.test(
    'Idea.canBeSubmittedForReview gates on both'
    + ' lifecycle and readiness',
    () => {
        const matrix: Array<{
            state: IdeaState;
            ready: boolean;
            expected: boolean;
        }> = [
            { state: 'active', ready: true,
                expected: true },
            { state: 'active', ready: false,
                expected: false },
            { state: 'sent_back', ready: true,
                expected: true },
            { state: 'sent_back', ready: false,
                expected: false },
            { state: 'in_review', ready: true,
                expected: false },
            { state: 'approved', ready: true,
                expected: false },
            { state: 'promoted', ready: true,
                expected: false },
            { state: 'archived', ready: true,
                expected: false },
            { state: 'deleted', ready: true,
                expected: false },
        ];
        for (const row of matrix) {
            const overrides = row.ready
                ? {}
                : { expected_outcome: '' };
            const idea = makeIdea(overrides, row.state);
            assertStrictEquals(
                idea.canBeSubmittedForReview(),
                row.expected,
                `${row.state}, ready=${row.ready}`,
            );
        }
    },
);

Deno.test(
    'IdeaPresenter.buildCard renders the Incomplete'
    + ' pill only for active ideas missing a'
    + ' required field',
    () => {
        const incomplete = new IdeaPresenter(
            makeIdea({ expected_outcome: '' }, 'active'),
            'X', 'y',
        );
        const ready = new IdeaPresenter(
            makeIdea({}, 'active'), 'X', 'y',
        );
        const review = new IdeaPresenter(
            makeIdea(
                { expected_outcome: '' }, 'in_review',
            ),
            'X', 'y',
        );
        const incOut = incomplete
            .buildCard(false).toString();
        const readyOut = ready
            .buildCard(false).toString();
        const reviewOut = review
            .buildCard(false).toString();
        assertMatch(incOut, /Incomplete/);
        assert(!readyOut.includes('Incomplete'));
        assert(!reviewOut.includes('Incomplete'));
    },
);

Deno.test(
    'IdeaPresenter carries submitter name and'
    + ' submitted timestamp verbatim',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea(), 'Grace Hopper',
            '2026-02-02T08:30:00.000000Z',
        );
        assertStrictEquals(
            presenter.submitterName(),
            'Grace Hopper',
        );
        assertStrictEquals(
            presenter.submittedAt(),
            '2026-02-02T08:30:00.000000Z',
        );
    },
);

// IdeaEditPresenter

Deno.test(
    'IdeaEditPresenter exposes its draft and the'
    + ' linked idea id',
    () => {
        const presenter = new IdeaEditPresenter(
            makeIdea(), FILLED_DRAFT,
            'Ada', '2026-01-15T10:00:00.000000Z',
        );
        assertStrictEquals(presenter.idForLink(), 'gVvtDIaqhnkXZQcxZeSuiw');
        assertEquals(
            presenter.draft(), FILLED_DRAFT,
        );
    },
);

// list state functions

Deno.test(
    'buildInitialIdeaListState starts with the all'
    + ' filter and the supplied ideas',
    () => {
        const ideas = [makeWithSubmitter()];
        const state = buildInitialIdeaListState(
            ideas,
        );
        assertStrictEquals(state.filter.kind, 'all');
        assertStrictEquals(state.ideas, ideas);
    },
);

Deno.test(
    'applyIdeaListUpdate swaps ideas but keeps the'
    + ' active filter',
    () => {
        const initial = applyIdeaFilterToggle(
            buildInitialIdeaListState([]),
            'approved',
        );
        const nextIdeas = [makeWithSubmitter()];
        const updated = applyIdeaListUpdate(
            initial, nextIdeas,
        );
        assertStrictEquals(updated.ideas, nextIdeas);
        assertEquals(
            updated.filter,
            { kind: 'filtered', status: 'approved' },
        );
    },
);

Deno.test(
    'applyIdeaFilterToggle sets, replaces, and'
    + ' clears the status filter',
    () => {
        const base = buildInitialIdeaListState([]);
        const on = applyIdeaFilterToggle(
            base, 'in_review',
        );
        assertEquals(
            on.filter,
            { kind: 'filtered', status: 'in_review' },
        );
        const switched = applyIdeaFilterToggle(
            on, 'approved',
        );
        assertEquals(
            switched.filter,
            { kind: 'filtered', status: 'approved' },
        );
        const off = applyIdeaFilterToggle(
            switched, 'approved',
        );
        assertEquals(off.filter, { kind: 'all' });
    },
);

// IdeaListPresenter

Deno.test(
    'IdeaListPresenter.activeFilter reports the'
    + ' filtered status or null',
    () => {
        const all = new IdeaListPresenter(
            buildInitialIdeaListState([]),
        );
        assertStrictEquals(all.activeFilter(), null);
        const filtered = new IdeaListPresenter(
            applyIdeaFilterToggle(
                buildInitialIdeaListState([]),
                'sent_back',
            ),
        );
        assertStrictEquals(
            filtered.activeFilter(), 'sent_back',
        );
    },
);

Deno.test(
    'IdeaListPresenter.renderList renders one card'
    + ' per idea in position order with a grip in'
    + ' the all view',
    () => {
        const ideas = [
            makeWithSubmitter({
                id: 'i-b', title: 'Beta idea',
                position: 5,
            }),
            makeWithSubmitter({
                id: 'i-a', title: 'Alpha idea',
                position: 1,
            }),
        ];
        const presenter = new IdeaListPresenter(
            buildInitialIdeaListState(ideas),
        );
        const slot = makeStubEl();
        presenter.renderList(
            slot as unknown as HTMLElement,
        );
        assertStrictEquals(slot.writes, 1);
        const out = slot.captured;
        assertMatch(out, /drag-handle/);
        assert(
            out.indexOf('Alpha idea')
            < out.indexOf('Beta idea'),
        );
        assertMatch(out, /data-idea-card="i-a"/);
        assertMatch(out, /data-idea-card="i-b"/);
    },
);

Deno.test(
    'IdeaListPresenter.renderList in a filtered'
    + ' view keeps only matching ideas and omits'
    + ' the grip',
    () => {
        const ideas = [
            makeWithSubmitter(
                {
                    id: 'i-rev', title: 'Review me',
                    position: 2,
                },
                'Ada', '2026-01-15T10:00:00Z',
                'in_review',
            ),
            makeWithSubmitter(
                {
                    id: 'i-act', title: 'Active one',
                    position: 1,
                },
                'Ada', '2026-01-15T10:00:00Z',
                'active',
            ),
        ];
        const presenter = new IdeaListPresenter(
            applyIdeaFilterToggle(
                buildInitialIdeaListState(ideas),
                'in_review',
            ),
        );
        const slot = makeStubEl();
        presenter.renderList(
            slot as unknown as HTMLElement,
        );
        const out = slot.captured;
        assertMatch(out, /Review me/);
        assert(!out.includes('Active one'));
        assert(!out.includes('drag-handle'));
    },
);

Deno.test(
    'IdeaListPresenter.renderBadges renders one'
    + ' badge per present state',
    () => {
        const ideas = [
            makeWithSubmitter(
                { id: 'fndCYAsXazdzMUlEGMNIZw' },
                'Ada', '2026-01-15T10:00:00Z',
                'active',
            ),
            makeWithSubmitter(
                { id: 'fxysGbBPBsnCwJNJsyZnkA' },
                'Ada', '2026-01-15T10:00:00Z',
                'active',
            ),
            makeWithSubmitter(
                { id: 'gBbNAWlPwMfXZvevoUPhFQ' },
                'Ada', '2026-01-15T10:00:00Z',
                'in_review',
            ),
        ];
        const presenter = new IdeaListPresenter(
            buildInitialIdeaListState(ideas),
        );
        const slot = makeStubEl();
        presenter.renderBadges(
            slot as unknown as HTMLElement,
        );
        const badges = slot.captured.match(
            /data-state="/g,
        ) ?? [];
        assertStrictEquals(badges.length, 2);
        assertMatch(
            slot.captured,
            /data-state="active"/,
        );
        assertMatch(
            slot.captured,
            /data-state="in_review"/,
        );
    },
);

Deno.test(
    'IdeaListPresenter.renderBadges omits promoted'
    + ' and archived even when those ideas exist',
    () => {
        const ideas = [
            makeWithSubmitter(
                { id: 'fndCYAsXazdzMUlEGMNIZw' },
                'Ada', '2026-01-15T10:00:00Z',
                'in_review',
            ),
            makeWithSubmitter(
                { id: 'fxysGbBPBsnCwJNJsyZnkA' },
                'Ada', '2026-01-15T10:00:00Z',
                'approved',
            ),
            makeWithSubmitter(
                { id: 'gBbNAWlPwMfXZvevoUPhFQ' },
                'Ada', '2026-01-15T10:00:00Z',
                'promoted',
            ),
            makeWithSubmitter(
                { id: 'hCcOBXmQxNgYawfwpVQiGR' },
                'Ada', '2026-01-15T10:00:00Z',
                'archived',
            ),
        ];
        const presenter = new IdeaListPresenter(
            buildInitialIdeaListState(ideas),
        );
        const slot = makeStubEl();
        presenter.renderBadges(
            slot as unknown as HTMLElement,
        );
        assertMatch(
            slot.captured,
            /data-state="in_review"/,
        );
        assertMatch(
            slot.captured,
            /data-state="approved"/,
        );
        assert(
            !slot.captured.includes(
                'data-state="promoted"',
            ),
        );
        assert(
            !slot.captured.includes(
                'data-state="archived"',
            ),
        );
    },
);

// IdeaCreatePresenter

Deno.test(
    'ideaCreateDraftIsComplete requires title,'
    + ' problem, solution, and outcome',
    () => {
        assertStrictEquals(
            ideaCreateDraftIsComplete(
                EMPTY_IDEA_CREATE_DRAFT,
            ),
            false,
        );
        const partial: IdeaCreateDraft = {
            ...EMPTY_IDEA_CREATE_DRAFT,
            title: 'T',
            problemStatement: 'P',
            proposedSolution: 'S',
        };
        assertStrictEquals(
            ideaCreateDraftIsComplete(partial),
            false,
        );
        const complete: IdeaCreateDraft = {
            ...partial, expectedOutcome: 'O',
        };
        assertStrictEquals(
            ideaCreateDraftIsComplete(complete),
            true,
        );
    },
);

Deno.test(
    'IdeaCreatePresenter.render keeps submit'
    + ' clickable while the draft is empty',
    () => {
        const out = new IdeaCreatePresenter(
            EMPTY_IDEA_CREATE_DRAFT,
        ).render().toString();
        assertMatch(out, /New Idea/);
        assertMatch(out, /Describe Your Idea/);
        assertMatch(out, /Submit Idea/);
        assert(
            !out.includes('disabled'),
            'the gate must speak, not mute:'
            + ' an incomplete submit surfaces a'
            + ' toast at the click handler',
        );
        assert(!out.includes('undefined'));
    },
);

Deno.test(
    'IdeaCreatePresenter.render enables submit and'
    + ' echoes draft values into the form fields',
    () => {
        const draft: IdeaCreateDraft = {
            title: 'Smarter alerts',
            problemStatement: 'Too much noise',
            targetUsers: 'On-call engineers',
            proposedSolution: 'Group by root cause',
            expectedOutcome: 'Fewer pages',
            successMetrics: '30% fewer alerts',
        };
        const out = new IdeaCreatePresenter(draft)
            .render().toString();
        assert(!out.includes('disabled'));
        assertMatch(out, /value="Smarter alerts"/);
        assertMatch(out, /Too much noise/);
        assertMatch(out, /On-call engineers/);
        assertMatch(out, /Group by root cause/);
        assertMatch(out, /Fewer pages/);
        assertMatch(out, /30% fewer alerts/);
    },
);

Deno.test(
    'IdeaCreatePresenter.render escapes draft'
    + ' values so markup cannot be injected',
    () => {
        const draft: IdeaCreateDraft = {
            ...EMPTY_IDEA_CREATE_DRAFT,
            title: '<img src=x onerror=alert(1)>',
        };
        const out = new IdeaCreatePresenter(draft)
            .render().toString();
        assert(
            !out.includes('<img src=x'),
        );
        assertMatch(out, /&lt;img src=x/);
    },
);

// IdeaConversionPresenter + helpers

Deno.test(
    'buildInitialConversionDraft seeds the'
    + ' project name from the idea title and'
    + ' leaves the rest blank',
    () => {
        const draft = buildInitialConversionDraft(
            makeIdea({ title: 'Edge caching' }),
        );
        assertStrictEquals(
            draft.fields['project-name'],
            'Edge caching',
        );
        assertStrictEquals(
            draft.fields['time-days'], '',
        );
        assertStrictEquals(draft.fields['cost'], '');
        assertStrictEquals(
            draft.fields['success-criteria'], '',
        );
        assertStrictEquals(draft.baselines.size, 0);
    },
);

Deno.test(
    'conversion progress counts every required'
    + ' field including success-criteria',
    () => {
        assertStrictEquals(conversionRequiredCount(0), 4);
        const draft = buildInitialConversionDraft(
            makeIdea(),
        );
        // project-name is pre-filled from the title.
        assertStrictEquals(
            conversionCompletedCount(draft), 1,
        );
        assertStrictEquals(
            conversionIsReady(draft, []), false,
        );
        assertStrictEquals(
            conversionFieldIsReady(
                draft, 'project-name',
            ),
            true,
        );
        assertStrictEquals(
            conversionFieldIsReady(
                draft, 'cost',
            ),
            false,
        );
        draft.fields['success-criteria']
            = 'done when X';
        assertStrictEquals(
            conversionCompletedCount(draft), 2,
        );
    },
);

Deno.test(
    'conversionIsReady becomes true once every'
    + ' required field is set',
    () => {
        const draft: ConversionDraft = {
            fields: {
                'project-name': 'P',
                'time-days': '90',
                'cost': '50000',
                'success-criteria': 'done when X',
            },
            baselines: new Map(),
        };
        assertStrictEquals(
            conversionIsReady(draft, []), true,
        );
        assertStrictEquals(
            conversionCompletedCount(draft), 4,
        );
    },
);

Deno.test(
    'IdeaConversionPresenter.render shows the idea'
    + ' summary and a disabled Create button until'
    + ' required fields are complete',
    () => {
        const idea = makeIdea({
            title: 'Edge caching',
            problem_statement: 'Slow far from origin',
            target_users: 'Global users',
        });
        const draft = buildInitialConversionDraft(
            idea,
        );
        const out = new IdeaConversionPresenter(
            idea, draft, [], new Map(),
        ).render().toString();
        assertMatch(out, /Convert to Project/);
        assertMatch(out, /Edge caching/);
        assertMatch(out, /Slow far from origin/);
        assertMatch(out, /Global users/);
        assertMatch(out, /1\/4 required fields/);
        assertMatch(out, /Complete Required Fields/);
        assertMatch(out, /data-ready="false"/);
        assertMatch(out, /disabled/);
        assertMatch(
            out, /id="check-project-name"/,
        );
        assert(!out.includes('undefined'));
    },
);

Deno.test(
    'IdeaConversionPresenter.render enables the'
    + ' Create button and marks ready when all'
    + ' required fields are present',
    () => {
        const idea = makeIdea();
        const draft: ConversionDraft = {
            fields: {
                'project-name': 'New project',
                'time-days': '90',
                'cost': '50000',
                'success-criteria': 'done when X',
            },
            baselines: new Map(),
        };
        const out = new IdeaConversionPresenter(
            idea, draft, [], new Map(),
        ).render().toString();
        assertMatch(out, /4\/4 required fields/);
        assertMatch(out, /Ready to Create Project/);
        assertMatch(out, /data-ready="true"/);
        assert(!out.includes('disabled'));
        assertMatch(out, /value="New project"/);
        assertMatch(out, /value="50000"/);
    },
);

Deno.test(
    'IdeaConversionPresenter.render renders'
    + ' DISPLAY_ABSENT for blank idea fields and'
    + ' never the word Unknown',
    () => {
        const idea = makeIdea({
            problem_statement: '',
            target_users: '',
            proposed_solution: '',
            expected_outcome: '',
            success_metrics: '',
        });
        const out = new IdeaConversionPresenter(
            idea,
            buildInitialConversionDraft(idea),
            [],
            new Map(),
        ).render().toString();
        assert(out.includes(DISPLAY_ABSENT));
        assert(!out.includes('Unknown'));
    },
);

Deno.test(
    'IdeaConversionPresenter.render escapes the'
    + ' idea title in the summary',
    () => {
        const idea = makeIdea({
            title: '<b>boom</b>',
        });
        const out = new IdeaConversionPresenter(
            idea,
            buildInitialConversionDraft(idea),
            [],
            new Map(),
        ).render().toString();
        assert(!out.includes('<b>boom</b>'));
        assertMatch(out, /&lt;b&gt;boom/);
    },
);

// IdeaConversionPresenter Scores box

Deno.test(
    'conversionRequiredCount adds active'
    + ' objectives to the static field count',
    () => {
        assertStrictEquals(conversionRequiredCount(0), 4);
        assertStrictEquals(conversionRequiredCount(2), 6);
        assertStrictEquals(conversionRequiredCount(5), 9);
    },
);

Deno.test(
    'conversionIsReady requires a baseline for'
    + ' every active objective',
    () => {
        const draft: ConversionDraft = {
            fields: {
                'project-name': 'P',
                'time-days': '90',
                'cost': '50000',
                'success-criteria': 'done',
            },
            baselines: new Map(),
        };
        const objectives = [
            makeObjective('obj-1', 0),
        ];
        assertStrictEquals(
            conversionIsReady(draft, objectives),
            false,
        );
        const ready: ConversionDraft = {
            fields: draft.fields,
            baselines: new Map([['obj-1', 30]]),
        };
        assertStrictEquals(
            conversionIsReady(ready, objectives),
            true,
        );
    },
);

Deno.test(
    'IdeaConversionPresenter renders the Scores'
    + ' empty banner when no active objectives',
    () => {
        const idea = makeIdea();
        const draft = buildInitialConversionDraft(
            idea,
        );
        const out = new IdeaConversionPresenter(
            idea, draft, [], new Map(),
        ).render().toString();
        assertMatch(
            out, /No active objectives yet/,
        );
        assertMatch(
            out,
            /id="convert-open-organization"/,
        );
        assert(
            !out.includes('baseline-slider'),
        );
        assertMatch(
            out, /1\/4 required fields/,
        );
    },
);

Deno.test(
    'IdeaConversionPresenter renders one'
    + ' baseline row per active objective',
    () => {
        const idea = makeIdea();
        const draft = buildInitialConversionDraft(
            idea,
        );
        const objectives = [
            makeObjective('obj-1', 0),
            makeObjective('obj-2', 1),
        ];
        const defs = new Map([
            ['obj-1', {
                name: 'Revenue',
                description: 'd1',
            }],
            ['obj-2', {
                name: 'Quality',
                description: 'd2',
            }],
        ]);
        const out = new IdeaConversionPresenter(
            idea, draft, objectives, defs,
        ).render().toString();
        assertMatch(out, /Revenue/);
        assertMatch(out, /Quality/);
        assertMatch(
            out,
            /data-objective-id="obj-1"/,
        );
        assertMatch(
            out,
            /data-objective-id="obj-2"/,
        );
        assertMatch(
            out, /class="baseline-slider"/,
        );
        assertMatch(
            out,
            /id="check-baseline-obj-1"/,
        );
        assertMatch(
            out, /1\/6 required fields/,
        );
    },
);

Deno.test(
    'IdeaConversionPresenter enables Create'
    + ' once every field and baseline is set',
    () => {
        const idea = makeIdea();
        const objectives = [
            makeObjective('obj-1', 0),
            makeObjective('obj-2', 1),
        ];
        const defs = new Map([
            ['obj-1', {
                name: 'Revenue',
                description: 'd1',
            }],
            ['obj-2', {
                name: 'Quality',
                description: 'd2',
            }],
        ]);
        const draft: ConversionDraft = {
            fields: {
                'project-name': 'P',
                'time-days': '90',
                'cost': '50000',
                'success-criteria': 'done',
            },
            baselines: new Map([
                ['obj-1', 50],
                ['obj-2', -25],
            ]),
        };
        const out = new IdeaConversionPresenter(
            idea, draft, objectives, defs,
        ).render().toString();
        assertMatch(
            out, /6\/6 required fields/,
        );
        assertMatch(
            out, /Ready to Create Project/,
        );
        assertMatch(out, /data-ready="true"/);
    },
);
