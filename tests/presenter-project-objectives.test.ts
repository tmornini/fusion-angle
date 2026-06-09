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

test('renders one row per active objective', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'under-review',
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes('Revenue'));
    assert.ok(html.includes('Cost'));
    assert.ok(html.includes('+50'));
});

test('shows "none yet" when no actuals',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'under-review',
    );
    const html = p.buildSection().toString();
    assert.ok(html.toLowerCase()
        .includes('none yet'));
});

test('shows latest actual with sign', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           projectId: 'p1', objectiveId: 'o1',
           score: -10,
           at: '2026-05-15T00:00:00.000Z' }],
        'approved',
    );
    const html = p.buildSection().toString();
    assert.ok(
        html.includes('−10')
        || html.includes('-10'),
    );
});

test(
    'baseline sliders enabled while under-review',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
        'under-review',
    );
    const html = p.buildSection().toString();
    assert.ok(
        !html.match(
            /class="baseline-slider"\s*disabled/,
        ),
        'baseline sliders should be enabled',
    );
});

test(
    'baseline slider hidden after approval',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'approved',
    );
    const html = p.buildSection().toString();
    assert.ok(
        !html.includes('baseline-slider'),
        'baseline slider hidden once approved',
    );
    assert.ok(
        html.includes('actual-slider'),
        'actual slider shown once approved',
    );
});

test(
    'actual slider hidden before approval',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'under-review',
    );
    const html = p.buildSection().toString();
    assert.ok(
        html.includes('baseline-slider'),
        'baseline slider shown pre-approval',
    );
    assert.ok(
        !html.includes('actual-slider'),
        'actual slider hidden pre-approval',
    );
});

test(
    'declined shows read-only Baseline slider only',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'declined',
    );
    const html = p.buildSection().toString();
    assert.ok(!html.includes('actual-slider'));
    assert.ok(
        html.match(
            /class="baseline-slider"[^>]*disabled/,
        ),
        'declined baseline is read-only',
    );
});

test(
    'archived shows read-only Baseline slider only',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           projectId: 'p1', objectiveId: 'o1',
           score: 30,
           at: '2026-05-15T00:00:00.000Z' }],
        'archived',
    );
    const html = p.buildSection().toString();
    assert.ok(!html.includes('actual-slider'));
    assert.ok(
        html.match(
            /class="baseline-slider"[^>]*disabled/,
        ),
        'archived baseline is read-only',
    );
});

test(
    'actual sliders enabled while approved'
    + ' for baseline-scored objectives',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [],
        'approved',
    );
    const html = p.buildSection().toString();
    const o1Row = html.match(
        /data-objective-id="o1"[\s\S]*?<\/li>/,
    );
    assert.ok(o1Row, 'o1 row should be present');
    const o2Row = html.match(
        /data-objective-id="o2"[\s\S]*?<\/li>/,
    );
    assert.ok(o2Row, 'o2 row should be present');
    assert.ok(
        !o1Row[0].match(
            /class="actual-slider"[^>]*disabled/,
        ),
        'o1 actual should be enabled (baselined)',
    );
    assert.ok(
        o2Row[0].match(
            /class="actual-slider"[^>]*disabled/,
        ),
        'o2 actual should be disabled (no baseline)',
    );
});

test('renders Save button when any slider is editable',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
        'under-review',
    );
    const html = p.buildSection().toString();
    assert.ok(html.includes(
        'data-action="save-objectives"',
    ));
});

test(
    'no Save button when project is archived',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'p1', objectiveId: 'o1',
           score: 50,
           at: '2026-05-14T00:00:00.000Z' }],
        [{ id: 'a1',
           projectId: 'p1', objectiveId: 'o1',
           score: 30,
           at: '2026-05-15T00:00:00.000Z' }],
        'archived',
    );
    const html = p.buildSection().toString();
    assert.ok(
        !html.includes(
            'data-action="save-objectives"',
        ),
        'no Save button on archived projects',
    );
});
