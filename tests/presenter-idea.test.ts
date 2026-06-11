import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    Idea,
    type IdeaEntity,
    type IdeaState,
} from '../api/types.ts';
import {
    DISPLAY_ABSENT,
} from '../web-app/app/format.ts';
import type {
    IdeaWithSubmitter,
} from '../web-app/app/adapters/index.ts';

// The idea read/conversion presenters import from
// ../core.ts, whose module init does
// document.addEventListener and reads theme/sidebar
// from localStorage via state.ts. ESM hoists static
// imports above any top-level assignment, so the
// browser globals are stubbed here and the presenter
// modules are pulled in with a dynamic import that
// runs after the stubs land. The presenters
// themselves are pure: their render() / build*
// methods return SafeHtml and never touch the DOM.
// renderShell/renderUpdate on IdeaPresenter and
// IdeaEditPresenter walk a real DOM tree (via
// $required slot lookups), so those flows stay in
// the manual browser plan; here we pin the pure
// SafeHtml-returning surface plus the pure
// list-state functions. IdeaListPresenter renders
// through setHtml (assigns the markup string onto
// the element), so a minimal stub element with a
// settable markup property is enough for it.

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
g['localStorage'] = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
};
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

const ideaMod = await import(
    '../web-app/app/presenters/idea.ts'
);
const createMod = await import(
    '../web-app/app/presenters/idea-create.ts'
);
const conversionMod = await import(
    '../web-app/app/presenters/idea-conversion.ts'
);

const {
    IdeaPresenter,
    IdeaEditPresenter,
    ideaDraftFromIdea,
    ideaPatchFromDraft,
    buildInitialIdeaListState,
    applyIdeaListUpdate,
    applyIdeaFilterToggle,
    IdeaListPresenter,
} = ideaMod;
type IdeaDraftFields = ReturnType<
    typeof ideaDraftFromIdea
>;
const {
    IdeaCreatePresenter,
    EMPTY_IDEA_CREATE_DRAFT,
    ideaCreateDraftIsComplete,
} = createMod;
type IdeaCreateDraft = typeof EMPTY_IDEA_CREATE_DRAFT;
const {
    IdeaConversionPresenter,
    buildInitialConversionDraft,
    conversionRequiredCount,
    conversionCompletedCount,
    conversionIsReady,
    conversionFieldIsReady,
} = conversionMod;
type ConversionDraft = ReturnType<
    typeof buildInitialConversionDraft
>;

function makeIdeaEntity(
    overrides: Partial<IdeaEntity> = {},
): IdeaEntity {
    return {
        id: 'idea-1',
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
        ...overrides,
    };
}

function makeIdea(
    overrides: Partial<IdeaEntity> = {},
    state: IdeaState = 'active',
): Idea {
    return new Idea(
        makeIdeaEntity(overrides), state,
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
        idea: new Idea(entity, state),
        entity,
        submitterName,
        submittedAt,
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

test(
    'ideaDraftFromIdea copies every editable field'
    + ' from the entity',
    () => {
        const idea = makeIdea();
        const draft = ideaDraftFromIdea(idea);
        assert.equal(
            draft.title, 'Self-serve onboarding',
        );
        assert.equal(
            draft.problemStatement,
            'New users churn before activation',
        );
        assert.equal(
            draft.targetUsers, 'Trial signups',
        );
        assert.equal(
            draft.proposedSolution,
            'Guided checklist with milestones',
        );
        assert.equal(
            draft.expectedOutcome,
            'Higher 7-day activation rate',
        );
        assert.equal(
            draft.successMetrics,
            '20% lift in activation',
        );
    },
);

test(
    'ideaPatchFromDraft maps camelCase draft to'
    + ' snake_case entity columns',
    () => {
        const patch = ideaPatchFromDraft(
            FILLED_DRAFT,
        );
        assert.equal(patch.title, 'Edited title');
        assert.equal(
            patch.problem_statement,
            'Edited problem',
        );
        assert.equal(
            patch.target_users, 'Edited users',
        );
        assert.equal(
            patch.proposed_solution,
            'Edited solution',
        );
        assert.equal(
            patch.expected_outcome,
            'Edited outcome',
        );
        assert.equal(
            patch.success_metrics,
            'Edited metrics',
        );
    },
);

test(
    'ideaPatchFromDraft then ideaDraftFromIdea'
    + ' round-trips through a new Idea',
    () => {
        const base = makeIdeaEntity();
        const patch = ideaPatchFromDraft(
            FILLED_DRAFT,
        );
        const roundTripped = new Idea(
            { ...base, ...patch },
            'active',
        );
        assert.deepEqual(
            ideaDraftFromIdea(roundTripped),
            FILLED_DRAFT,
        );
    },
);

// IdeaPresenter: pure getters + SafeHtml

test(
    'IdeaPresenter.buildCard renders the title,'
    + ' state badge, and card data attributes',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea(), 'Ada Lovelace',
            '2026-01-15T10:00:00.000000Z',
        );
        const out = presenter
            .buildCard(true).toString();
        assert.match(out, /Self-serve onboarding/);
        assert.match(out, /badge badge-success/);
        assert.match(out, /Active/);
        assert.ok(!out.includes('Incomplete'));
        assert.match(
            out, /data-idea-card="idea-1"/,
        );
        assert.match(out, /data-position="3"/);
        assert.ok(!out.includes('undefined'));
    },
);

test(
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
        assert.match(withGrip, /drag-handle/);
        assert.ok(!withoutGrip.includes(
            'drag-handle',
        ));
    },
);

test(
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
        assert.match(
            approved.buildCard(false)
                .toString(),
            /data-idea-convert="idea-1"/,
        );
        assert.ok(
            !active.buildCard(false)
                .toString()
                .includes('data-idea-convert'),
        );
    },
);

test(
    'IdeaPresenter.buildStateBadge marks the'
    + ' badge dimmed when isActive is false',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea({}, 'in-review'),
            'X', 'y',
        );
        const dimmed = presenter
            .buildStateBadge(false).toString();
        const lit = presenter
            .buildStateBadge(true).toString();
        const neutral = presenter
            .buildStateBadge(null).toString();
        assert.match(
            dimmed, /data-dimmed="true"/,
        );
        assert.match(lit, /data-dimmed="false"/);
        assert.match(
            neutral, /data-dimmed="false"/,
        );
        assert.match(
            dimmed, /data-state="in-review"/,
        );
        assert.match(dimmed, /In Review/);
    },
);

test(
    'IdeaPresenter state predicates reflect the'
    + ' wrapped idea state',
    () => {
        const review = new IdeaPresenter(
            makeIdea({}, 'in-review'),
            'X', 'y',
        );
        assert.equal(review.isReviewable(), true);
        assert.equal(review.isConvertible(), false);
        assert.equal(review.canSubmit(), false);
        assert.equal(
            review.stateGroup(), 'in-review',
        );
        assert.equal(
            review.matchesState('in-review'), true,
        );
        assert.equal(
            review.matchesState('active'), false,
        );

        const active = new IdeaPresenter(
            makeIdea(
                { position: 9 }, 'active',
            ),
            'X', 'y',
        );
        assert.equal(active.canSubmit(), true);
        assert.equal(active.isReviewable(), false);
        assert.equal(active.positionSortKey(), 9);
        assert.equal(active.idForLink(), 'idea-1');
    },
);

test(
    'Idea.readinessValue is ready when all four'
    + ' required fields are non-empty',
    () => {
        const ready = makeIdea();
        assert.equal(ready.readinessValue(), 'ready');
        assert.equal(ready.isReady(), true);
    },
);

test(
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
            assert.equal(
                idea.readinessValue(), 'incomplete',
                JSON.stringify(empty),
            );
            assert.equal(idea.isReady(), false);
        }
    },
);

test(
    'Idea.readinessValue stays ready when only'
    + ' optional fields are empty',
    () => {
        const idea = makeIdea({
            target_users: '',
            success_metrics: '',
        });
        assert.equal(idea.readinessValue(), 'ready');
    },
);

test(
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
            { state: 'sent-back', ready: true,
                expected: true },
            { state: 'sent-back', ready: false,
                expected: false },
            { state: 'in-review', ready: true,
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
            assert.equal(
                idea.canBeSubmittedForReview(),
                row.expected,
                `${row.state}, ready=${row.ready}`,
            );
        }
    },
);

test(
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
                { expected_outcome: '' }, 'in-review',
            ),
            'X', 'y',
        );
        const incOut = incomplete
            .buildCard(false).toString();
        const readyOut = ready
            .buildCard(false).toString();
        const reviewOut = review
            .buildCard(false).toString();
        assert.match(incOut, /Incomplete/);
        assert.ok(!readyOut.includes('Incomplete'));
        assert.ok(!reviewOut.includes('Incomplete'));
    },
);

test(
    'IdeaPresenter carries submitter name and'
    + ' submitted timestamp verbatim',
    () => {
        const presenter = new IdeaPresenter(
            makeIdea(), 'Grace Hopper',
            '2026-02-02T08:30:00.000000Z',
        );
        assert.equal(
            presenter.submitterName(),
            'Grace Hopper',
        );
        assert.equal(
            presenter.submittedAt(),
            '2026-02-02T08:30:00.000000Z',
        );
    },
);

// IdeaEditPresenter

test(
    'IdeaEditPresenter exposes its draft and the'
    + ' linked idea id',
    () => {
        const presenter = new IdeaEditPresenter(
            makeIdea(), FILLED_DRAFT,
            'Ada', '2026-01-15T10:00:00.000000Z',
        );
        assert.equal(presenter.idForLink(), 'idea-1');
        assert.deepEqual(
            presenter.draft(), FILLED_DRAFT,
        );
    },
);

// list state functions

test(
    'buildInitialIdeaListState starts with the all'
    + ' filter and the supplied ideas',
    () => {
        const ideas = [makeWithSubmitter()];
        const state = buildInitialIdeaListState(
            ideas,
        );
        assert.equal(state.filter.kind, 'all');
        assert.equal(state.ideas, ideas);
    },
);

test(
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
        assert.equal(updated.ideas, nextIdeas);
        assert.deepEqual(
            updated.filter,
            { kind: 'filtered', status: 'approved' },
        );
    },
);

test(
    'applyIdeaFilterToggle sets, replaces, and'
    + ' clears the status filter',
    () => {
        const base = buildInitialIdeaListState([]);
        const on = applyIdeaFilterToggle(
            base, 'in-review',
        );
        assert.deepEqual(
            on.filter,
            { kind: 'filtered', status: 'in-review' },
        );
        const switched = applyIdeaFilterToggle(
            on, 'approved',
        );
        assert.deepEqual(
            switched.filter,
            { kind: 'filtered', status: 'approved' },
        );
        const off = applyIdeaFilterToggle(
            switched, 'approved',
        );
        assert.deepEqual(off.filter, { kind: 'all' });
    },
);

// IdeaListPresenter

test(
    'IdeaListPresenter.activeFilter reports the'
    + ' filtered status or null',
    () => {
        const all = new IdeaListPresenter(
            buildInitialIdeaListState([]),
        );
        assert.equal(all.activeFilter(), null);
        const filtered = new IdeaListPresenter(
            applyIdeaFilterToggle(
                buildInitialIdeaListState([]),
                'sent-back',
            ),
        );
        assert.equal(
            filtered.activeFilter(), 'sent-back',
        );
    },
);

test(
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
        assert.equal(slot.writes, 1);
        const out = slot.captured;
        assert.match(out, /drag-handle/);
        assert.ok(
            out.indexOf('Alpha idea')
            < out.indexOf('Beta idea'),
        );
        assert.match(out, /data-idea-card="i-a"/);
        assert.match(out, /data-idea-card="i-b"/);
    },
);

test(
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
                'in-review',
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
                'in-review',
            ),
        );
        const slot = makeStubEl();
        presenter.renderList(
            slot as unknown as HTMLElement,
        );
        const out = slot.captured;
        assert.match(out, /Review me/);
        assert.ok(!out.includes('Active one'));
        assert.ok(!out.includes('drag-handle'));
    },
);

test(
    'IdeaListPresenter.renderBadges renders one'
    + ' badge per present state',
    () => {
        const ideas = [
            makeWithSubmitter(
                { id: 'i1' },
                'Ada', '2026-01-15T10:00:00Z',
                'active',
            ),
            makeWithSubmitter(
                { id: 'i2' },
                'Ada', '2026-01-15T10:00:00Z',
                'active',
            ),
            makeWithSubmitter(
                { id: 'i3' },
                'Ada', '2026-01-15T10:00:00Z',
                'in-review',
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
        assert.equal(badges.length, 2);
        assert.match(
            slot.captured,
            /data-state="active"/,
        );
        assert.match(
            slot.captured,
            /data-state="in-review"/,
        );
    },
);

// IdeaCreatePresenter

test(
    'ideaCreateDraftIsComplete requires title,'
    + ' problem, solution, and outcome',
    () => {
        assert.equal(
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
        assert.equal(
            ideaCreateDraftIsComplete(partial),
            false,
        );
        const complete: IdeaCreateDraft = {
            ...partial, expectedOutcome: 'O',
        };
        assert.equal(
            ideaCreateDraftIsComplete(complete),
            true,
        );
    },
);

test(
    'IdeaCreatePresenter.render disables the'
    + ' submit button while the draft is empty',
    () => {
        const out = new IdeaCreatePresenter(
            EMPTY_IDEA_CREATE_DRAFT,
        ).render().toString();
        assert.match(out, /New Idea/);
        assert.match(out, /Describe Your Idea/);
        assert.match(out, /Submit Idea/);
        assert.match(out, /disabled/);
        assert.ok(!out.includes('undefined'));
    },
);

test(
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
        assert.ok(!out.includes('disabled'));
        assert.match(out, /value="Smarter alerts"/);
        assert.match(out, /Too much noise/);
        assert.match(out, /On-call engineers/);
        assert.match(out, /Group by root cause/);
        assert.match(out, /Fewer pages/);
        assert.match(out, /30% fewer alerts/);
    },
);

test(
    'IdeaCreatePresenter.render escapes draft'
    + ' values so markup cannot be injected',
    () => {
        const draft: IdeaCreateDraft = {
            ...EMPTY_IDEA_CREATE_DRAFT,
            title: '<img src=x onerror=alert(1)>',
        };
        const out = new IdeaCreatePresenter(draft)
            .render().toString();
        assert.ok(
            !out.includes('<img src=x'),
        );
        assert.match(out, /&lt;img src=x/);
    },
);

// IdeaConversionPresenter + helpers

test(
    'buildInitialConversionDraft seeds the'
    + ' project name from the idea title and'
    + ' leaves the rest blank',
    () => {
        const draft = buildInitialConversionDraft(
            makeIdea({ title: 'Edge caching' }),
        );
        assert.equal(
            draft.fields['project-name'],
            'Edge caching',
        );
        assert.equal(
            draft.fields['time-days'], '',
        );
        assert.equal(draft.fields['cost'], '');
        assert.equal(
            draft.fields['success-criteria'], '',
        );
        assert.equal(draft.baselines.size, 0);
    },
);

test(
    'conversion progress counts every required'
    + ' field including success-criteria',
    () => {
        assert.equal(conversionRequiredCount(0), 4);
        const draft = buildInitialConversionDraft(
            makeIdea(),
        );
        // project-name is pre-filled from the title.
        assert.equal(
            conversionCompletedCount(draft), 1,
        );
        assert.equal(
            conversionIsReady(draft, []), false,
        );
        assert.equal(
            conversionFieldIsReady(
                draft, 'project-name',
            ),
            true,
        );
        assert.equal(
            conversionFieldIsReady(
                draft, 'cost',
            ),
            false,
        );
        draft.fields['success-criteria']
            = 'done when X';
        assert.equal(
            conversionCompletedCount(draft), 2,
        );
    },
);

test(
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
        assert.equal(
            conversionIsReady(draft, []), true,
        );
        assert.equal(
            conversionCompletedCount(draft), 4,
        );
    },
);

test(
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
        assert.match(out, /Convert to Project/);
        assert.match(out, /Edge caching/);
        assert.match(out, /Slow far from origin/);
        assert.match(out, /Global users/);
        assert.match(out, /1\/4 required fields/);
        assert.match(out, /Complete Required Fields/);
        assert.match(out, /data-ready="false"/);
        assert.match(out, /disabled/);
        assert.match(
            out, /id="check-project-name"/,
        );
        assert.ok(!out.includes('undefined'));
    },
);

test(
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
        assert.match(out, /4\/4 required fields/);
        assert.match(out, /Ready to Create Project/);
        assert.match(out, /data-ready="true"/);
        assert.ok(!out.includes('disabled'));
        assert.match(out, /value="New project"/);
        assert.match(out, /value="50000"/);
    },
);

test(
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
        assert.ok(out.includes(DISPLAY_ABSENT));
        assert.ok(!out.includes('Unknown'));
    },
);

test(
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
        assert.ok(!out.includes('<b>boom</b>'));
        assert.match(out, /&lt;b&gt;boom/);
    },
);

// IdeaConversionPresenter Scores box

test(
    'conversionRequiredCount adds active'
    + ' objectives to the static field count',
    () => {
        assert.equal(conversionRequiredCount(0), 4);
        assert.equal(conversionRequiredCount(2), 6);
        assert.equal(conversionRequiredCount(5), 9);
    },
);

test(
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
            { id: 'obj-1', position: 0 },
        ];
        assert.equal(
            conversionIsReady(draft, objectives),
            false,
        );
        const ready: ConversionDraft = {
            fields: draft.fields,
            baselines: new Map([['obj-1', 30]]),
        };
        assert.equal(
            conversionIsReady(ready, objectives),
            true,
        );
    },
);

test(
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
        assert.match(
            out, /No active objectives yet/,
        );
        assert.match(
            out,
            /id="convert-open-organization"/,
        );
        assert.ok(
            !out.includes('baseline-slider'),
        );
        assert.match(
            out, /1\/4 required fields/,
        );
    },
);

test(
    'IdeaConversionPresenter renders one'
    + ' baseline row per active objective',
    () => {
        const idea = makeIdea();
        const draft = buildInitialConversionDraft(
            idea,
        );
        const objectives = [
            { id: 'obj-1', position: 0 },
            { id: 'obj-2', position: 1 },
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
        assert.match(out, /Revenue/);
        assert.match(out, /Quality/);
        assert.match(
            out,
            /data-objective-id="obj-1"/,
        );
        assert.match(
            out,
            /data-objective-id="obj-2"/,
        );
        assert.match(
            out, /class="baseline-slider"/,
        );
        assert.match(
            out,
            /id="check-baseline-obj-1"/,
        );
        assert.match(
            out, /1\/6 required fields/,
        );
    },
);

test(
    'IdeaConversionPresenter enables Create'
    + ' once every field and baseline is set',
    () => {
        const idea = makeIdea();
        const objectives = [
            { id: 'obj-1', position: 0 },
            { id: 'obj-2', position: 1 },
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
        assert.match(
            out, /6\/6 required fields/,
        );
        assert.match(
            out, /Ready to Create Project/,
        );
        assert.match(out, /data-ready="true"/);
    },
);
