import { assert, assertMatch, assertStrictEquals } from '@std/assert';
import { DashboardObjectiveAggregatesPresenter } from
    '../web-app/app/presenters/dashboard-objective-aggregates.ts';
import { buildSparkline } from
    '../web-app/app/presenters/sparkline.ts';
import type { TrendPoint } from '../web-app/app/scoring-aggregate.ts';
import type { ObjectiveEntity } from '../shared/types.ts';
import { responseMessage } from './fixtures/response-message.ts';

const ORGANIZATION_ID = 'AjdvjuECVZEgZoFajaIEkg';

const activeObjs = [
    { id: 'ohqxgUBEaFQwYbXsonRPmg', organization_id: ORGANIZATION_ID,
      position: 0, state: 'active' },
    { id: 'o2', organization_id: ORGANIZATION_ID,
      position: 1, state: 'active' },
].map((o) => responseMessage<ObjectiveEntity>(o));
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

Deno.test('renders one row per active objective', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert(html.includes('Increase incomes'));
    assert(html.includes('Lower expenses'));
});

Deno.test(
    'an aggregate name uses the shared row link',
    () => {
        const p =
            new DashboardObjectiveAggregatesPresenter(
                activeObjs, defs, aggregates, trendlines,
            );
        const html = p.buildCard().toString();
        const start = html.indexOf(
            'data-objective-id="ohqxgUBEaFQwYbXsonRPmg"',
        );
        const row = html.slice(start).slice(
            0, html.slice(start).indexOf('</li>'),
        );
        assertMatch(
            row,
            /class="score-row-link"[^>]*>\s*Increase incomes/,
        );
        assertStrictEquals(
            /<a\b/.test(row),
            false,
            'the drill name is not a navigation anchor',
        );
    },
);

Deno.test('card chassis matches Time/Cost/Impact pattern', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert(
        html.includes('card gauge-card'),
        'card chassis classes must be present',
    );
    assert(
        html.includes('objective-aggregates-card'),
        'section-scope class must be present',
    );
    assert(
        html.includes('icon-box'),
        'icon-box header must be present',
    );
});

Deno.test('heading reads "Objectives"', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assertMatch(
        html,
        /<h3[^>]*>\s*Objectives\s*<\/h3>/,
        'heading must read "Objectives"',
    );
});

Deno.test('zero-contributor row renders dimmed', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert(
        html.includes('data-empty="true"'),
        'empty row carries data-empty="true"',
    );
});

Deno.test('row renders the small bipolar gauge SVG', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assert(
        html.includes('data-size="small"'),
        'small bipolar gauge must be present',
    );
    assert(
        html.includes('viewBox="0 0 180 95"'),
        'gauge SVG viewBox must be present',
    );
});

Deno.test('row no longer uses the .bipolar-bar span', () => {
    const p = new DashboardObjectiveAggregatesPresenter(
        activeObjs, defs, aggregates, trendlines,
    );
    const html = p.buildCard().toString();
    assertStrictEquals(
        html.includes('class="bipolar-bar"'),
        false,
        '.bipolar-bar span replaced by gauge',
    );
});

Deno.test(
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
        assertMatch(
            html,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
            'outer right-half fill expected for +32',
        );
        assertMatch(
            html,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
            'inner right-half fill expected for +25',
        );
    },
);

Deno.test('row gauge omits fills for undefined means', () => {
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
    assertStrictEquals(
        /d="M 90 20/.test(o2Row),
        false,
        'undefined baseline must not draw a fill',
    );
    assertStrictEquals(
        /d="M 90 40/.test(o2Row),
        false,
        'undefined actual must not draw a fill',
    );
});

Deno.test('row renders colored segments and dots', () => {
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
    assert(
        o1Row.includes('class="score-row-sparkline"'),
        'sparkline cell class must be present',
    );
    assert(
        o1Row.includes('class="sparkline-seg"'),
        'per-segment lines must be present',
    );
    assert(
        o1Row.includes('data-direction="up"'),
        '20 -> 40 segment reads up',
    );
    assert(
        o1Row.includes('data-direction="down"'),
        '40 -> 25 segment reads down',
    );
    const dots = o1Row.match(/class="spark-dot"/g);
    assertStrictEquals(
        dots?.length, 3, 'one dot per trend point',
    );
});

Deno.test('points carry dated, signed-change tooltips', () => {
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
    assert(
        o1Row.includes('Baseline · 20'),
        'baseline tip shows its label and value',
    );
    assert(
        o1Row.includes('May 1, 2026'),
        'baseline tip shows its last-edited date',
    );
    assertMatch(
        o1Row,
        /data-tone="success"[^>]*>\s*40 \/ \+20/,
        'rise tooltip is the value over its change',
    );
    assertMatch(
        o1Row,
        /data-tone="error"[^>]*>\s*25 \/ −15/,
        'drop tooltip is the value over its change',
    );
    assert(
        o1Row.includes(
            'aria-label="May 10, 2026, 40 / +20"',
        ),
        'rise dot names the value over its change',
    );
    assert(
        o1Row.includes(
            'aria-label="May 20, 2026, 25 / −15"',
        ),
        'drop dot names the value over its change',
    );
});

Deno.test('empty trendline renders only the axis line', () => {
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
    assert(
        o2Row.includes('class="sparkline-axis"'),
        'sparkline axis must always be present',
    );
    assertStrictEquals(
        o2Row.includes('class="sparkline-seg"'),
        false,
        'no segments for empty trendline',
    );
    assertStrictEquals(
        o2Row.includes('class="spark-dot"'),
        false,
        'no dots for empty trendline',
    );
});

Deno.test('origin line sits at the baseline value', () => {
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
    // Trend [20, 40, 25]: min 20 is the baseline, so
    // the axis sits on the bottom pad of the tall
    // plot (96 - 4), not the geometric mid (48).
    assertMatch(
        o1Row,
        /class="sparkline-axis"[^>]*y1="92"/,
        'grey axis tracks the baseline, not the mid',
    );
    assert(
        o1Row.includes('viewBox="0 0 100 96"'),
        'the plot is the tall y scale',
    );
    // 40 is the max (pad 4); 20 is the min (92).
    // 4/96 and 92/96, as the dot's --y percent.
    assert(
        o1Row.includes('--y:4.17%'),
        'the high point sits on the top pad',
    );
    assert(
        o1Row.includes('--y:95.83%'),
        'the low point sits on the bottom pad',
    );
});

Deno.test('sparkline track matches the tall plot', () => {
    const src = Deno.readTextFileSync(
        'web-app/app/styles/components-metrics.css',
    );
    assert(
        src.includes(
            '.sparkline-wrap {\n'
            + '    position: relative;\n'
            + '    width: 100%;\n'
            + '    height: 96px;\n'
            + '}',
        ),
        'the track height is the plot height',
    );
});

Deno.test('baseline dot is grey; dots match their segment',
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
    assertStrictEquals(dots.length, 3, 'one dot per point');
    assert(
        !dots[0]!.includes('data-direction'),
        'baseline dot omits direction (grey default)',
    );
    assert(
        dots[1]!.includes('data-direction="up"'),
        '20 -> 40 dot matches the up segment',
    );
    assert(
        dots[2]!.includes('data-direction="down"'),
        '40 -> 25 dot matches the down segment',
    );
});

Deno.test(
    'buildSparkline paints the aggregate series',
    () => {
        const empty = buildSparkline([]).toString();
        assert(
            empty.includes('class="sparkline-axis"'),
        );
        assertStrictEquals(
            empty.includes('class="sparkline-seg"'),
            false,
        );
        assertStrictEquals(
            empty.includes('class="spark-dot"'),
            false,
        );
        const html = buildSparkline([
            {
                at: '2026-05-01T00:00:00.000000Z',
                value: 20,
            },
            {
                at: '2026-05-10T00:00:00.000000Z',
                value: 40,
            },
            {
                at: '2026-05-20T00:00:00.000000Z',
                value: 25,
            },
        ]).toString();
        assert(html.includes('viewBox="0 0 100 96"'));
        assert(html.includes('data-direction="up"'));
        assert(html.includes('data-direction="down"'));
        assert(html.includes('class="sparkline-seg"'));
        assert(html.includes('class="spark-dot"'));
        assert(
            html.includes('Baseline · 20'),
        );
    },
);

Deno.test(
    'the aggregate card uses the shared painter',
    () => {
        const src = Deno.readTextFileSync(
            'web-app/app/presenters/'
            + 'dashboard-objective-aggregates.ts',
        );
        assert(src.includes(
            "from './sparkline.ts'",
        ));
        assertStrictEquals(
            src.includes('function directionForDelta'),
            false,
        );
        assertStrictEquals(
            src.includes('#sparkline'),
            false,
        );
    },
);
