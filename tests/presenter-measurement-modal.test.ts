import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MeasurementModalPresenter } from
    '../web-app/app/presenters/measurement-modal.ts';

const project = {
    id: 'p1', title: 'Q1',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_cost: 0, actual_cost: 0,
    position: 0,
};

const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
]);

test('renders one slider per baseline-scored objective',
    () => {
        const p = new MeasurementModalPresenter(
            project, 'approved', defs,
            [{ id: 'b1',
               project_id: 'p1', objective_id: 'o1',
               score: 50,
               at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        const html = p.buildBody().toString();
        const n = (html.match(/type="range"/g) || []).length;
        assert.equal(n, 1);
    });

test('pre-fills with latest actual when present', () => {
    const p = new MeasurementModalPresenter(
        project, 'approved', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           project_id: 'p1', objective_id: 'o1',
           score: 35,
           at: '2026-05-15T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="35"'));
});

test('pre-fills with baseline when no actuals yet', () => {
    const p = new MeasurementModalPresenter(
        project, 'approved', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="50"'));
});

test('caption shows baseline reference', () => {
    const p = new MeasurementModalPresenter(
        project, 'approved', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('Baseline'));
});

test('measurement-allowed state renders Save button', () => {
    const p = new MeasurementModalPresenter(
        project, 'approved', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('save-measurement'));
    assert.ok(html.includes('Save measurement'));
});

test('non-measurement state hides Save button', () => {
    const p = new MeasurementModalPresenter(
        project, 'under-review', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(!html.includes('save-measurement'));
    assert.ok(html.includes('Close'));
});

test('non-measurement state renders explanatory banner',
    () => {
        const p = new MeasurementModalPresenter(
            project, 'completed', defs,
            [{ id: 'b1',
               project_id: 'p1', objective_id: 'o1',
               score: 50,
               at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        const html = p.buildBody().toString();
        const flat =
            html.toLowerCase().replace(/\s+/g, ' ');
        assert.ok(html.includes('empty-banner'));
        assert.ok(flat.includes(
            'logging measurements is only available',
        ));
        assert.ok(html.includes('Completed'));
    });

test('non-measurement state disables every slider', () => {
    const p = new MeasurementModalPresenter(
        project, 'submitted', defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    const ranges =
        (html.match(/type="range"/g) || []).length;
    const inputsDisabled = (
        html.match(/<input[^>]*\bdisabled\b/g) || []
    ).length;
    assert.equal(ranges, 1);
    assert.equal(inputsDisabled, ranges);
});
