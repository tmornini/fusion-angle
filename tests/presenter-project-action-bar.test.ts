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
        const html = p.buildBar().toString();
        assert.ok(html.includes('data-action="score"'));
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
        const html = p.buildBar().toString();
        const approveDisabled = html.includes(
            'data-action="approve" disabled',
        );
        assert.equal(approveDisabled, false);
    });

test('approved project: Log measurement + Complete shown',
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
        const html = p.buildBar().toString();
        assert.ok(html.includes(
            'data-action="log-measurement"',
        ));
        assert.ok(html.includes(
            'data-action="complete"',
        ));
    });

test('approved with full actuals: Complete enabled',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'approved',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
        const completeDisabled = html.includes(
            'data-action="complete" disabled',
        );
        assert.equal(completeDisabled, false);
    });

test('submitted project: Score button hidden, other review actions shown',
    () => {
        const p = new ProjectActionBarPresenter(
            PROJECT_ID, 'submitted',
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
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
        const html = p.buildBar().toString();
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
        const html = p.buildBar().toString();
        assert.ok(
            html.includes(
                'title="Increase incomes, '
                + 'Raise customer NPS unscored"',
            ),
            'Approve tooltip should enumerate'
            + ' unscored objective names',
        );
    });

test('Complete tooltip enumerates objectives lacking actuals',
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
        const html = p.buildBar().toString();
        assert.ok(
            html.includes(
                'title="Improve employee morale'
                + ' lack actual measurements"',
            ),
            'Complete tooltip should enumerate'
            + ' objectives lacking actuals',
        );
    });
