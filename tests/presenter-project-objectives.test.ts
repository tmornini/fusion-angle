import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ProjectObjectivesPresenter } from
    '../web-app/app/presenters/project-objectives.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue', description: 'd1' }],
    ['o2', { name: 'Cost', description: 'd2' }],
]);

test('renders one row per baseline-scored objective', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes('Revenue'));
    assert.ok(html.includes('+50'));
});

test('shows "no measurements yet" when no actuals', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.toLowerCase()
        .includes('no measurements yet'));
});

test('shows latest actual with sign', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           project_id: 'p1', objective_id: 'o1',
           score: -10,
           scored_at: '2026-05-15T00:00:00.000Z' }],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes('−10') || html.includes('-10'));
});

test('renders View history button', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           project_id: 'p1', objective_id: 'o1',
           score: 50,
           scored_at: '2026-05-14T00:00:00.000Z' }],
        [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes(
        'data-action="view-history"',
    ));
});

test('empty section when no baselines scored', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
    );
    const html = p.buildSection().toString();
    assert.ok(html.toLowerCase()
        .includes('not yet scored'));
});
