import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DashboardObjectiveAggregatesPresenter } from
    '../web-app/app/presenters/dashboard-objective-aggregates.ts';
import type { TrendPoint } from
    '../web-app/app/adapters/project-scoring.ts';
import type { ObjectiveEntity } from '../api/types.ts';

const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';

const activeObjs: ObjectiveEntity[] = [
    { id: 'ohqxgUBEaFQwYbXsonRPmg', organization_id: ORGANIZATION_ID,
      position: 0, state: 'active' },
    { id: 'o2', organization_id: ORGANIZATION_ID,
      position: 1, state: 'active' },
];
const defs = new Map([
    ['ohqxgUBEaFQwYbXsonRPmg', { name: 'Increase incomes'
        , description: 'd1' }],
    ['o2', { name: 'Lower expenses', description: 'd2' }],
]);
const aggregates = [
    { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
      baselineMean: 32, latestActualMean: 25,
      projectsBaselineScored: 12,
      projectsActualScored: 8 },
    { objectiveId: 'o2',
      baselineMean: undefined,
      latestActualMean: undefined,
      projectsBaselineScored: 0,
      projectsActualScored: 0 },
];
const trendlines = new Map<string, TrendPoint[]>([
    ['ohqxgUBEaFQwYbXsonRPmg', [
        { at: '2026-05-01T00:00:00.000000Z', value: 20 },
        { at: '2026-05-10T00:00:00.000000Z', value: 40 },
        { at: '2026-05-20T00:00:00.000000Z', value: 25 },
    ]],
    ['o2', []],
]);

test('renders one row per active objective', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert.ok(html.includes('Increase incomes'));
    assert.ok(html.includes('Lower expenses'));
});

test('card chassis matches Time/Cost/Impact pattern', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert.ok(
        html.includes('card gauge-card'),
        'card chassis classes must be present',
    );
    assert.ok(
        html.includes('objective-aggregates-card'),
        'section-scope class must be present',
    );
    assert.ok(
        html.includes('icon-box'),
        'icon-box header must be present',
    );
});

test('heading reads "Objectives"', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert.match(
        html,
        /<h3[^>]*>\s*Objectives\s*<\/h3>/,
        'heading must read "Objectives"',
    );
});

test('zero-contributor row renders dimmed', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert.ok(
        html.includes('data-empty="true"'),
        'empty row carries data-empty="true"',
    );
});

test('row renders the small bipolar gauge SVG', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
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
        activeObjs, defs, aggregates, trendlines,
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
        // ohqxgUBEaFQwYbXsonRPmg has baseline=+32 (right half on outer)
        // and actual=+25 (right half on inner). The
        // half-arc fill paths starting at M 90 20
        // (outer) and M 90 40 (inner) must appear.
        const p =
            new DashboardObjectiveAggregatesPresenter(
                activeObjs, defs, aggregates, trendlines,
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
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o2RowStart =
        html.indexOf('data-objective-id="o2"');
    const o2Slice = html.slice(o2RowStart);
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

test('row renders colored segments and dots', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o1RowStart =
        html.indexOf('data-objective-id="ohqxgUBEaFQwYbXsonRPmg"');
    const o1Slice = html.slice(o1RowStart);
    const o1Row = o1Slice.slice(
        0, o1Slice.indexOf('</li>'),
    );
    assert.ok(
        o1Row.includes('class="score-row-sparkline"'),
        'sparkline cell class must be present',
    );
    assert.ok(
        o1Row.includes('class="sparkline-seg"'),
        'per-segment lines must be present',
    );
    assert.ok(
        o1Row.includes('data-direction="up"'),
        '20 -> 40 segment reads up',
    );
    assert.ok(
        o1Row.includes('data-direction="down"'),
        '40 -> 25 segment reads down',
    );
    const dots = o1Row.match(/class="spark-dot"/g);
    assert.equal(
        dots?.length, 3, 'one dot per trend point',
    );
});

test('points carry dated, signed-change tooltips', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o1RowStart =
        html.indexOf('data-objective-id="ohqxgUBEaFQwYbXsonRPmg"');
    const o1Slice = html.slice(o1RowStart);
    const o1Row = o1Slice.slice(
        0, o1Slice.indexOf('</li>'),
    );
    assert.ok(
        o1Row.includes('Baseline · 20'),
        'baseline tip shows its label and value',
    );
    assert.ok(
        o1Row.includes('May 1, 2026'),
        'baseline tip shows its last-edited date',
    );
    assert.match(
        o1Row,
        /data-tone="success"[^>]*>\s*\+20/,
        'rise tooltip is green and signed +20',
    );
    assert.match(
        o1Row,
        /data-tone="error"[^>]*>\s*−15/,
        'drop tooltip is red and signed −15',
    );
});

test('empty trendline renders only the axis line', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o2RowStart =
        html.indexOf('data-objective-id="o2"');
    const o2Slice = html.slice(o2RowStart);
    const o2Row = o2Slice.slice(
        0, o2Slice.indexOf('</li>'),
    );
    assert.ok(
        o2Row.includes('class="sparkline-axis"'),
        'sparkline axis must always be present',
    );
    assert.equal(
        o2Row.includes('class="sparkline-seg"'),
        false,
        'no segments for empty trendline',
    );
    assert.equal(
        o2Row.includes('class="spark-dot"'),
        false,
        'no dots for empty trendline',
    );
});

test('origin line sits at the baseline value', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o1RowStart =
        html.indexOf('data-objective-id="ohqxgUBEaFQwYbXsonRPmg"');
    const o1Slice = html.slice(o1RowStart);
    const o1Row = o1Slice.slice(
        0, o1Slice.indexOf('</li>'),
    );
    // ohqxgUBEaFQwYbXsonRPmg trend [20, 40, 25]: min 20 == baseline, so the
    // axis sits at the bottom edge (SPARK_HEIGHT -
    // SPARK_PAD = 26), not the geometric mid (15).
    assert.match(
        o1Row,
        /class="sparkline-axis"[^>]*y1="26"/,
        'grey axis tracks the baseline, not the mid',
    );
});

test('baseline dot is grey; dots match their segment',
    () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    const o1RowStart =
        html.indexOf('data-objective-id="ohqxgUBEaFQwYbXsonRPmg"');
    const o1Slice = html.slice(o1RowStart);
    const o1Row = o1Slice.slice(
        0, o1Slice.indexOf('</li>'),
    );
    const dots = o1Row.match(
        /<span class="spark-dot"[^>]*>/g,
    ) ?? [];
    assert.equal(dots.length, 3, 'one dot per point');
    assert.ok(
        !dots[0]!.includes('data-direction'),
        'baseline dot omits direction (grey default)',
    );
    assert.ok(
        dots[1]!.includes('data-direction="up"'),
        '20 -> 40 dot matches the up segment',
    );
    assert.ok(
        dots[2]!.includes('data-direction="down"'),
        '40 -> 25 dot matches the down segment',
    );
});
