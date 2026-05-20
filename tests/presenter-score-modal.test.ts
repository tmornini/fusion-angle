import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ScoreModalPresenter } from
    '../web-app/app/presenters/score-modal.ts';

const project = {
    id: 'p1', status: 'under-review' as const, title: 'Q1',
    description: 'd', progress: 0,
    start_date: '2026-05-14T00:00:00.000Z',
    target_end_date: '2026-05-14T00:00:00.000Z',
    estimated_cost: 0, actual_cost: 0,
    position: 0,
};

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
    ['o2', { name: 'Cost', description: 'd2' }],
]);

test('renders one slider per objective', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    const sliderCount = (
        html.match(/type="range"/g) || []
    ).length;
    assert.equal(sliderCount, 2);
});

test('slider pre-fills from latest baseline', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs,
        [{ id: 'b1', project_id: 'p1', objective_id: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes(
        'data-objective-id="o1"'
    ));
    assert.ok(html.includes('value="50"'));
});

test('unset slider gets Score required hint', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.toLowerCase()
        .includes('score required'));
});

test('slider range is [-100, +100] step 1', () => {
    const p = new ScoreModalPresenter(
        project, activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('min="-100"'));
    assert.ok(html.includes('max="100"'));
    assert.ok(html.includes('step="1"'));
});
