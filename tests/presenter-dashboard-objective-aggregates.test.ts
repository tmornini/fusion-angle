import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DashboardObjectiveAggregatesPresenter } from
    '../web-app/app/presenters/dashboard-objective-aggregates.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Increase incomes', description: 'd1' }],
    ['o2', { name: 'Lower expenses', description: 'd2' }],
]);
const aggregates = [
    { objectiveId: 'o1',
      baselineMean: 32, latestActualMean: 25,
      projectsBaselineScored: 12,
      projectsActualScored: 8 },
    { objectiveId: 'o2',
      baselineMean: undefined,
      latestActualMean: undefined,
      projectsBaselineScored: 0,
      projectsActualScored: 0 },
];

test('renders one row per active objective', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('Increase incomes'));
    assert.ok(html.includes('Lower expenses'));
});

test('row with contributors shows means and counts',
    () => {
        const p =
            new DashboardObjectiveAggregatesPresenter(
                activeObjs, defs, aggregates,
            );
        const html = p.buildCard().toString();
        assert.ok(html.includes('+32'));
        assert.ok(html.includes('+25'));
        assert.ok(html.includes('12 projects'));
    });

test('zero-contributor row renders dimmed', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('0 projects'));
    assert.ok(html.includes('data-empty="true"'));
});

test('row renders the small bipolar gauge SVG', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.ok(
        html.includes('data-size="small"'),
        'small bipolar gauge must be present',
    );
    assert.ok(
        html.includes('viewBox="0 0 180 95"'),
        'gauge SVG viewBox must be present',
    );
});

test('row no longer uses the .bipolar-bar span', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    assert.equal(
        html.includes('class="bipolar-bar"'),
        false,
        '.bipolar-bar span replaced by gauge',
    );
});

test(
    'row gauge reflects the aggregate baseline and'
    + ' actual signs',
    () => {
        // o1 has baseline=+32 (right half on outer)
        // and actual=+25 (right half on inner). The
        // half-arc fill paths starting at M 90 20
        // (outer) and M 90 40 (inner) must appear.
        const p =
            new DashboardObjectiveAggregatesPresenter(
                activeObjs, defs, aggregates,
            );
        const html = p.buildCard().toString();
        assert.match(
            html,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
            'outer right-half fill expected for +32',
        );
        assert.match(
            html,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
            'inner right-half fill expected for +25',
        );
    },
);

test('row gauge omits fills for undefined means', () => {
    // o2 has baselineMean=undefined and
    // latestActualMean=undefined.
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates,
    );
    const html = p.buildCard().toString();
    // Find the second row (objective-o2) and ensure
    // no half-arc fill paths are within it. The
    // tracks (full semicircle) are still present.
    const o2RowStart =
        html.indexOf('data-objective-id="o2"');
    const o2Slice = html.slice(o2RowStart);
    // First </li> ends the o2 row.
    const o2RowEnd = o2Slice.indexOf('</li>');
    const o2Row = o2Slice.slice(0, o2RowEnd);
    assert.equal(
        /d="M 90 20/.test(o2Row),
        false,
        'undefined baseline must not draw a fill',
    );
    assert.equal(
        /d="M 90 40/.test(o2Row),
        false,
        'undefined actual must not draw a fill',
    );
});
