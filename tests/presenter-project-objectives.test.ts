import { assert } from '@std/assert';
import { ProjectObjectivesPresenter } from
    '../web-app/app/presenters/project-objectives.ts';

const activeObjs = [
    {
        id: 'ohqxgUBEaFQwYbXsonRPmg',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position: 0,
        state: 'active',
    },
    {
        id: 'o2',
        organization_id: 'AjdvjuECVZEgZoFajaIEkg',
        position: 1,
        state: 'active',
    },
];
const defs = new Map([
    ['ohqxgUBEaFQwYbXsonRPmg', { name: 'Revenue', description: 'd1' }],
    ['o2', { name: 'Cost', description: 'd2' }],
]);

Deno.test('renders one row per active objective', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'under_review',
    );
    const html = p.buildSection().toString();
    assert(html.includes('Revenue'));
    assert(html.includes('Cost'));
    assert(html.includes('+50'));
});

Deno.test('shows "none yet" when no actuals',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'under_review',
    );
    const html = p.buildSection().toString();
    assert(html.toLowerCase()
        .includes('none yet'));
});

Deno.test('shows latest actual with sign', () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [{ id: 'UQTJZvCoKlFjEoDlDUwekw',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: -10,
           at: '2026-05-15T00:00:00.000000Z' }],
        'approved',
    );
    const html = p.buildSection().toString();
    assert(
        html.includes('−10')
        || html.includes('-10'),
    );
});

Deno.test(
    'baseline sliders enabled while under_review',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
        'under_review',
    );
    const html = p.buildSection().toString();
    assert(
        !html.match(
            /class="baseline-slider"\s*disabled/,
        ),
        'baseline sliders should be enabled',
    );
});

Deno.test(
    'baseline slider hidden after approval',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'approved',
    );
    const html = p.buildSection().toString();
    assert(
        !html.includes('baseline-slider'),
        'baseline slider hidden once approved',
    );
    assert(
        html.includes('actual-slider'),
        'actual slider shown once approved',
    );
});

Deno.test(
    'actual slider hidden before approval',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'under_review',
    );
    const html = p.buildSection().toString();
    assert(
        html.includes('baseline-slider'),
        'baseline slider shown pre-approval',
    );
    assert(
        !html.includes('actual-slider'),
        'actual slider hidden pre-approval',
    );
});

Deno.test(
    'declined shows read-only Baseline slider only',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'declined',
    );
    const html = p.buildSection().toString();
    assert(!html.includes('actual-slider'));
    assert(
        html.match(
            /class="baseline-slider"[^>]*disabled/,
        ),
        'declined baseline is read-only',
    );
});

Deno.test(
    'archived shows read-only Baseline slider only',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [{ id: 'UQTJZvCoKlFjEoDlDUwekw',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 30,
           at: '2026-05-15T00:00:00.000000Z' }],
        'archived',
    );
    const html = p.buildSection().toString();
    assert(!html.includes('actual-slider'));
    assert(
        html.match(
            /class="baseline-slider"[^>]*disabled/,
        ),
        'archived baseline is read-only',
    );
});

Deno.test(
    'actual sliders enabled while approved'
    + ' for baseline-scored objectives',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [],
        'approved',
    );
    const html = p.buildSection().toString();
    const o1Row = html.match(
        /data-objective-id="ohqxgUBEaFQwYbXsonRPmg"[\s\S]*?<\/li>/,
    );
    assert(o1Row, 'ohqxgUBEaFQwYbXsonRPmg row should be present');
    const o2Row = html.match(
        /data-objective-id="o2"[\s\S]*?<\/li>/,
    );
    assert(o2Row, 'o2 row should be present');
    assert(
        !o1Row[0].match(
            /class="actual-slider"[^>]*disabled/,
        ),
        'ohqxgUBEaFQwYbXsonRPmg actual should be enabled (baselined)',
    );
    assert(
        o2Row[0].match(
            /class="actual-slider"[^>]*disabled/,
        ),
        'o2 actual should be disabled (no baseline)',
    );
});

Deno.test('renders Save button when any slider is editable',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs, [], [],
        'under_review',
    );
    const html = p.buildSection().toString();
    assert(html.includes(
        'data-action="save-objectives"',
    ));
});

Deno.test(
    'no Save button when project is archived',
    () => {
    const p = new ProjectObjectivesPresenter(
        activeObjs, defs,
        [{ id: 'b1',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 50,
           at: '2026-05-14T00:00:00.000000Z' }],
        [{ id: 'UQTJZvCoKlFjEoDlDUwekw',
           projectId: 'pnXmXrxOWayANgDLdCjuBw'
               , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
           memberId: 'xdaJyuuPyHfffCGLhqDrOQ',
           score: 30,
           at: '2026-05-15T00:00:00.000000Z' }],
        'archived',
    );
    const html = p.buildSection().toString();
    assert(
        !html.includes(
            'data-action="save-objectives"',
        ),
        'no Save button on archived projects',
    );
});
