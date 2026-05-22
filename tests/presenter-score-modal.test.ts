import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ScoreModalPresenter } from
    '../web-app/app/presenters/score-modal.ts';

const project = {
    id: 'p1', title: 'Q1',
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
        project, 'under-review', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    const sliderCount = (
        html.match(/type="range"/g) || []
    ).length;
    assert.equal(sliderCount, 2);
});

test('slider pre-fills from latest baseline', () => {
    const p = new ScoreModalPresenter(
        project, 'under-review', activeObjs, defs,
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
        project, 'under-review', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.toLowerCase()
        .includes('score required'));
});

test('slider range is [-100, +100] step 1', () => {
    const p = new ScoreModalPresenter(
        project, 'under-review', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('min="-100"'));
    assert.ok(html.includes('max="100"'));
    assert.ok(html.includes('step="1"'));
});

test('scorable state renders Save baselines button', () => {
    const p = new ScoreModalPresenter(
        project, 'under-review', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(html.includes('save-baselines'));
    assert.ok(html.includes('Save baselines'));
});

test('non-scorable state hides Save button', () => {
    const p = new ScoreModalPresenter(
        project, 'approved', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    assert.ok(!html.includes('save-baselines'));
    assert.ok(html.includes('Close'));
});

test('non-scorable state renders explanatory banner', () => {
    const p = new ScoreModalPresenter(
        project, 'approved', activeObjs, defs, [],
    );
    const html = p.buildBody().toString();
    const flat = html.toLowerCase().replace(/\s+/g, ' ');
    assert.ok(html.includes('empty-banner'));
    assert.ok(flat.includes(
        'baseline scoring is only available',
    ));
    assert.ok(html.includes('Approved'));
});

test('non-scorable state disables every slider', () => {
    const p = new ScoreModalPresenter(
        project, 'submitted', activeObjs, defs,
        [{ id: 'b1', project_id: 'p1',
           objective_id: 'o1', score: 25,
           at: '2026-05-14T00:00:00.000Z' }],
    );
    const html = p.buildBody().toString();
    const ranges =
        (html.match(/type="range"/g) || []).length;
    const inputsDisabled = (
        html.match(/<input[^>]*\bdisabled\b/g) || []
    ).length;
    assert.equal(ranges, 2);
    assert.equal(inputsDisabled, ranges);
});
