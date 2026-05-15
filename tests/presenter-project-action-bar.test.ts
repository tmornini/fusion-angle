import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectActionBarPresenter } from
    '../web-app/app/presenters/project-action-bar.ts';

const baseProject = {
    id: 'p1', status: 'under-review' as const, title: 't',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: '{}',
    timeline_label: 'q1',
};

test('under-review with no scores: Approve disabled',
    () => {
        const p = new ProjectActionBarPresenter(
            baseProject,
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
            baseProject,
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
            { ...baseProject, status: 'approved' },
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
            { ...baseProject, status: 'approved' },
            { ready: true, problems: [] },
            { ready: true, problems: [] },
        );
        const html = p.buildBar().toString();
        const completeDisabled = html.includes(
            'data-action="complete" disabled',
        );
        assert.equal(completeDisabled, false);
    });
