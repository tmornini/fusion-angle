import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MeasurementModalPresenter } from
    '../web-app/app/presenters/measurement-modal.ts';

const project = {
    id: 'p1', status: 'approved' as const, title: 'Q1',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_duration: 0, actual_duration: 0,
    estimated_cost: 0, actual_cost: 0,
    position: 0, business_context: '{}',
    timeline_label: 'q1',
};

const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
]);

test('renders one slider per baseline-scored objective',
    () => {
        const p = new MeasurementModalPresenter(
            project, defs,
            [{ id: 'b1',
               project_id: 'p1', objective_id: 'o1',
               score: 50,
               scored_at: '2026-05-14T00:00:00.000Z' }],
            [],
        );
        const html = p.buildBody().toString();
        const n = (html.match(/type="range"/g) || []).length;
        assert.equal(n, 1);
    });

test('pre-fills with latest actual when present', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           project_id: 'p1', objective_id: 'o1',
           score: 35,
           scored_at: '2026-05-15T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="35"'));
});

test('pre-fills with baseline when no actuals yet', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('value="50"'));
});

test('caption shows baseline reference', () => {
    const p = new MeasurementModalPresenter(
        project, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('Baseline'));
});
