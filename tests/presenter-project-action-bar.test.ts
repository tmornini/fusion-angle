import { assert, assertStrictEquals } from '@std/assert';
import { ProjectActionBarPresenter } from
    '../web-app/app/presenters/project-action-bar.ts';

const PROJECT_ID = 'pnXmXrxOWayANgDLdCjuBw';

Deno.test('under_review with no scores: Approve disabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under_review',
            {
                ready: false,
                problems: [
                    { kind: 'baseline_unscored',
                      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' },
                ],
            },
            { ready: true, problems: [] },
            new Map(),
        );
        const html = p.buildReviewActions().toString();
        assert(
            html.includes(
                'data-action="approve" disabled',
            ),
        );
    });

Deno.test('under_review with full scoring: Approve enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under_review',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
            new Map(),
        );
        const html = p.buildReviewActions().toString();
        const approveDisabled = html.includes(
            'data-action="approve" disabled',
        );
        assertStrictEquals(approveDisabled, false);
    });

Deno.test('approved project: Archive shown',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            {
                ready: false,
                problems: [
                    { kind: 'actual_unscored',
                      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' },
                ],
            },
            new Map(),
        );
        const html =
            p.buildLifecycleActions().toString();
        assert(html.includes(
            'data-action="archive"',
        ));
    });

Deno.test('approved with full actuals: Archive enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
            new Map(),
        );
        const html =
            p.buildLifecycleActions().toString();
        const archiveDisabled = html.includes(
            'data-action="archive" disabled',
        );
        assertStrictEquals(archiveDisabled, false);
    });

Deno.test('submitted project: Score button hidden, other review'
+ ' actions shown', () => {
    const p = new ProjectActionBarPresenter(
        PROJECT_ID, 'submitted',
        { ready: true, problems: [] },
        { ready: true, problems: [] },
        new Map(),
    );
    const html = p.buildReviewActions().toString();
    assertStrictEquals(
        html.includes('data-action="score"'),
        false,
        'Score button must NOT render on submitted',
    );
    assert(
        html.includes('data-action="approve"'),
        'Approve button must render on submitted',
    );
    assert(
        html.includes('data-action="decline"'),
        'Decline button must render on submitted',
    );
    assert(
        html.includes('data-action="send-back"'),
        'Send-back button must render on submitted',
    );
});

Deno.test('sent_back project: Score button hidden, other review'
+ ' actions shown', () => {
    const p = new ProjectActionBarPresenter(
        PROJECT_ID, 'sent_back',
        { ready: true, problems: [] },
        { ready: true, problems: [] },
        new Map(),
    );
    const html = p.buildReviewActions().toString();
    assertStrictEquals(
        html.includes('data-action="score"'),
        false,
        'Score button must NOT render on sent_back',
    );
    assert(
        html.includes('data-action="approve"'),
        'Approve button must render on sent_back',
    );
});

Deno.test('Approve tooltip enumerates unscored objective names',
    () => {
        const names = new Map([
            ['ohqxgUBEaFQwYbXsonRPmg', 'Increase incomes'],
            ['o2', 'Raise customer NPS'],
        ]);
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under_review',
            {
                ready: false,
                problems: [
                    { kind: 'baseline_unscored',
                      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' },
                    { kind: 'baseline_unscored',
                      objectiveId: 'o2' },
                ],
            },
            { ready: true, problems: [] },
            names,
        );
        const html = p.buildReviewActions().toString();
        assert(
            html.includes(
                'title="Set a baseline score before '
                + 'approving: Increase incomes, '
                + 'Raise customer NPS"',
            ),
            'Approve tooltip should enumerate'
            + ' unscored objective names',
        );
    });

Deno.test('Archive tooltip enumerates objectives lacking actuals',
    () => {
        const names = new Map([
            ['ohqxgUBEaFQwYbXsonRPmg', 'Improve employee morale'],
        ]);
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            {
                ready: false,
                problems: [
                    { kind: 'actual_unscored',
                      objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' },
                ],
            },
            names,
        );
        const html =
            p.buildLifecycleActions().toString();
        assert(
            html.includes(
                'title="Add an actual measurement '
                + 'before archiving: '
                + 'Improve employee morale"',
            ),
            'Archive tooltip should enumerate'
            + ' objectives lacking actuals',
        );
        assertStrictEquals(
            html.includes('action-bar-caption'),
            false,
            'reason lives in the tooltip, not a caption',
        );
    });

Deno.test('review actions empty on approved (lifecycle in header)',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
            new Map(),
        );
        const html = p.buildReviewActions().toString();
        assertStrictEquals(html.trim(), '');
    });

Deno.test('lifecycle actions empty on under_review',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under_review',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
            new Map(),
        );
        const html =
            p.buildLifecycleActions().toString();
        assertStrictEquals(html.trim(), '');
    });
