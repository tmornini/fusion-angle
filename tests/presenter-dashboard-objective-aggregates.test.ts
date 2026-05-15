import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DashboardObjectiveAggregatesPresenter } from
    '../web-app/app/presenters/dashboard-objective-aggregates.ts';

const activeObjs = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const defs = new Map([
    ['o1', { name: 'Revenue Growth', description: 'd1' }],
    ['o2', { name: 'Cost Reduction', description: 'd2' }],
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
    assert.ok(html.includes('Revenue Growth'));
    assert.ok(html.includes('Cost Reduction'));
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
