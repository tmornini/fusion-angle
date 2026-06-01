import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectActionBarPresenter } from
    '../web-app/app/presenters/project-action-bar.ts';

const PROJECT_ID = 'p1';

test('under-review with no scores: Approve disabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under-review',
            {
                ready: false,
                problems: [
                    { kind: 'baseline_unscored',
                      objectiveId: 'o1' },
                ],
            },
            { ready: true, problems: [] },
        );
        const html = p.buildReviewActions().toString();
        assert.ok(
            html.includes(
                'data-action="approve" disabled',
            ),
        );
    });

test('under-review with full scoring: Approve enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under-review',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildReviewActions().toString();
        const approveDisabled = html.includes(
            'data-action="approve" disabled',
        );
        assert.equal(approveDisabled, false);
    });

test('approved project: Archive shown',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            {
                ready: false,
                problems: [
                    { kind: 'actual_unscored',
                      objectiveId: 'o1' },
                ],
            },
        );
        const html =
            p.buildLifecycleActions().toString();
        assert.ok(html.includes(
            'data-action="archive"',
        ));
    });

test('approved with full actuals: Archive enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html =
            p.buildLifecycleActions().toString();
        const archiveDisabled = html.includes(
            'data-action="archive" disabled',
        );
        assert.equal(archiveDisabled, false);
    });

test('submitted project: Score button hidden, other review actions shown',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'submitted',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildReviewActions().toString();
        assert.equal(
            html.includes('data-action="score"'),
            false,
            'Score button must NOT render on submitted',
        );
        assert.ok(
            html.includes('data-action="approve"'),
            'Approve button must render on submitted',
        );
        assert.ok(
            html.includes('data-action="decline"'),
            'Decline button must render on submitted',
        );
        assert.ok(
            html.includes('data-action="send-back"'),
            'Send-back button must render on submitted',
        );
    });

test('sent-back project: Score button hidden, other review actions shown',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'sent-back',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildReviewActions().toString();
        assert.equal(
            html.includes('data-action="score"'),
            false,
            'Score button must NOT render on sent-back',
        );
        assert.ok(
            html.includes('data-action="approve"'),
            'Approve button must render on sent-back',
        );
    });

test('Approve tooltip enumerates unscored objective names',
    () => {
        const names = new Map([
            ['o1', 'Increase incomes'],
            ['o2', 'Raise customer NPS'],
        ]);
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under-review',
            {
                ready: false,
                problems: [
                    { kind: 'baseline_unscored',
                      objectiveId: 'o1' },
                    { kind: 'baseline_unscored',
                      objectiveId: 'o2' },
                ],
            },
            { ready: true, problems: [] },
            names,
        );
        const html = p.buildReviewActions().toString();
        assert.ok(
            html.includes(
                'title="Set a baseline score before '
                + 'approving: Increase incomes, '
                + 'Raise customer NPS"',
            ),
            'Approve tooltip should enumerate'
            + ' unscored objective names',
        );
    });

test('Archive tooltip enumerates objectives lacking actuals',
    () => {
        const names = new Map([
            ['o1', 'Improve employee morale'],
        ]);
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            {
                ready: false,
                problems: [
                    { kind: 'actual_unscored',
                      objectiveId: 'o1' },
                ],
            },
            names,
        );
        const html =
            p.buildLifecycleActions().toString();
        assert.ok(
            html.includes(
                'title="Add an actual measurement '
                + 'before archiving: '
                + 'Improve employee morale"',
            ),
            'Archive tooltip should enumerate'
            + ' objectives lacking actuals',
        );
        assert.equal(
            html.includes('action-bar-caption'),
            false,
            'reason lives in the tooltip, not a caption',
        );
    });

test('review actions empty on approved (lifecycle in header)',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildReviewActions().toString();
        assert.equal(html.trim(), '');
    });

test('lifecycle actions empty on under-review',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'under-review',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html =
            p.buildLifecycleActions().toString();
        assert.equal(html.trim(), '');
    });
