import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GaugePresenter } from
    '../web-app/app/presenters/gauge.ts';
import type {
    GaugeData,
    RatioGauge,
    BipolarGauge,
} from '../web-app/app/adapters/dashboard.ts';
import { FlowPresenter } from
    '../web-app/app/presenters/flow.ts';
import type { FlowSummary } from
    '../web-app/app/adapters/flows.ts';
import { WorkingStylesPresenter } from
    '../web-app/app/presenters/working-styles.ts';
import {
    buildFlowNameHeader,
    buildNodePanel,
    buildEdgePanel,
    buildToolbar,
} from
    '../web-app/app/presenters/flow-designer-view.ts';
import { toggleStatusFilter } from
    '../web-app/app/presenters/list-filter.ts';
import { orderedKeys } from
    '../web-app/app/presenters/ordered-keys.ts';
import {
    HumanMember, AIMember, nowUtc,
} from '../api/types.ts';
import type {
    GraphNode, GraphEdge,
} from '../api/types.ts';
import {
    makeHumanMember as buildHumanMember,
    makeAIMember as buildAIMember,
} from './member-fixtures.ts';
import {
    formatSigned,
} from '../web-app/app/scoring-format.ts';
import {
    DISPLAY_ABSENT,
} from '../web-app/app/format.ts';

// helpers

function makeArc(
    value: number,
    max: number,
    label: string,
    display: string,
) {
    return { value, max, label, display };
}

function makeGauge(
    over: { value: number; max: number },
    inner: { value: number; max: number },
): GaugeData {
    return {
        kind: 'ratio',
        title: 'Cost Baseline',
        icon: 'dollarSign',
        iconCssClass: 'text-primary',
        theme: 'blue',
        outer: makeArc(
            over.value, over.max, 'Baseline', '$10k',
        ),
        inner: makeArc(
            inner.value, inner.max, 'Actual', '$8k',
        ),
    } satisfies RatioGauge;
}

// Mirrors the production display rule
// (adapters/dashboard.ts impactDisplay): absent
// renders DISPLAY_ABSENT, present renders signed.
function impactDisplay(
    v: number | undefined,
): string {
    return v === undefined
        ? DISPLAY_ABSENT
        : formatSigned(v);
}

function makeBipolarGauge(
    outerValue: number | undefined,
    innerValue: number | undefined,
): GaugeData {
    return {
        kind: 'bipolar',
        title: 'Impact',
        icon: 'zap',
        iconCssClass: 'text-warning',
        theme: 'amber',
        outer: {
            value: outerValue,
            label: 'Baseline',
            display: impactDisplay(outerValue),
        },
        inner: {
            value: innerValue,
            label: 'Actual',
            display: impactDisplay(innerValue),
        },
    } satisfies BipolarGauge;
}

function makeFlowSummary(
    over: Partial<FlowSummary> = {},
): FlowSummary {
    return {
        id: 'aEsGMmBEFaVdWihhHXwCbw',
        name: 'Onboarding',
        nodeCount: 3,
        edgeCount: 2,
        ...over,
    };
}

function makeNode(
    over: Partial<GraphNode> = {},
): GraphNode {
    return {
        id: 'n-1',
        name: 'Review',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...over,
    };
}

function makeEdge(
    over: Partial<GraphEdge> = {},
): GraphEdge {
    return {
        id: 'e-1',
        name: 'Approve',
        fromNodeId: 'n-1',
        toNodeId: 'n-2',
        ...over,
    };
}

function makeHumanMember(
    id: string, first: string, last: string,
): HumanMember {
    return buildHumanMember(id, `${first} ${last}`);
}

function makeAIMember(id: string, name: string): AIMember {
    return buildAIMember(id, name);
}

function noUnknownMagic(s: string): void {
    assert.equal(
        /\bUnknown\b/.test(s), false,
        'output must not contain "Unknown"',
    );
}

// GaugePresenter

test(
    'GaugePresenter renders title, icon-box, and'
    + ' both legend labels',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 5, max: 10 },
                { value: 4, max: 10 },
            ),
        ).render().toString();
        assert.match(out, /Cost Baseline/);
        assert.match(out, /class="icon-box"/);
        assert.match(out, /Baseline/);
        assert.match(out, /Actual/);
        assert.match(out, /<svg/);
        noUnknownMagic(out);
    },
);

test(
    'GaugePresenter clamps over-100% value to a'
    + ' zero dash offset on both arcs',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 30, max: 10 },
                { value: 25, max: 10 },
            ),
        ).render().toString();
        // outerOff and innerOff both collapse to 0
        // when value >= max (full arc drawn).
        const zeros =
            out.match(/stroke-dashoffset="0"/g)
            ?? [];
        assert.equal(zeros.length, 2);
    },
);

test(
    'GaugePresenter with zero max draws no fill'
    + ' (dash offset equals the full arc length)',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 0, max: 0 },
                { value: 0, max: 0 },
            ),
        ).render().toString();
        // Empty means each fill arc's offset equals
        // its own dasharray (no visible fill) — the
        // contract, not the radius-derived number.
        const arcs = [...out.matchAll(
            /stroke-dasharray="([\d.]+)"/g,
        )].map((m) => Number(m[1]));
        const offs = [...out.matchAll(
            /stroke-dashoffset="([\d.]+)"/g,
        )].map((m) => Number(m[1]));
        assert.equal(arcs.length, 2);
        assert.equal(offs.length, 2);
        arcs.forEach((arc, i) => {
            assert.ok(
                Math.abs((offs[i] ?? NaN) - arc) < 0.01,
                'arc ' + i + ' is empty',
            );
        });
    },
);

test(
    'GaugePresenter colors the inner arc with the'
    + ' error token and adds the overrun class on'
    + ' heavy overrun',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 10, max: 10 },
                { value: 20, max: 10 },
            ),
        ).render().toString();
        assert.match(
            out,
            /stop-color="hsl\(var\(--error\)\)"/,
        );
        assert.match(
            out,
            /class="gauge-arc-inner overrun"/,
        );
        assert.match(out, /--flash-speed:/);
    },
);

test(
    'GaugePresenter derives a kebab-case id from'
    + ' the title for its gradient defs',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 1, max: 2 },
                { value: 1, max: 2 },
            ),
        ).render().toString();
        assert.match(out, /id="outer-cost-baseline"/);
        assert.match(out, /id="inner-cost-baseline"/);
    },
);

// GaugePresenter — bipolar variant

test(
    'GaugePresenter bipolar at zero renders no'
    + ' fill half-arc paths (track halves only)',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(0, 0),
        ).render().toString();
        // The half-arc fill paths start at top
        // dead center (M 90 20 outer, M 90 40
        // inner). At zero, neither half fills.
        assert.equal(
            /d="M 90 20 A 65 65/.test(out),
            false,
            'outer half-arc fill must be absent',
        );
        assert.equal(
            /d="M 90 40 A 45 45/.test(out),
            false,
            'inner half-arc fill must be absent',
        );
    },
);

test(
    'GaugePresenter bipolar at undefined renders'
    + ' no fill half-arc paths',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(undefined, undefined),
        ).render().toString();
        assert.equal(
            /d="M 90 20 A 65 65/.test(out),
            false,
        );
        assert.equal(
            /d="M 90 40 A 45 45/.test(out),
            false,
        );
    },
);

test(
    'GaugePresenter stop-opacity values are decimal',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 5, max: 10 },
                { value: 4, max: 10 },
            ),
        ).render().toString();
        const opacities = [
            ...out.matchAll(/stop-opacity="([^"]*)"/g),
        ].map(m => m[1]!);
        assert.ok(opacities.length >= 4);
        for (const value of opacities) {
            assert.match(
                value, /^\d+(\.\d+)?$/,
                'stop-opacity ' + value,
            );
        }
    },
);

test(
    'GaugePresenter bipolar at negative draws'
    + ' the LEFT half only',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(-50, -50),
        ).render().toString();
        // Outer left half = sweep 0 ending at
        // (25, 85). Inner left half = sweep 0
        // ending at (45, 85). Right halves
        // (sweep 1) must be absent.
        assert.match(
            out,
            /d="M 90 20 A 65 65 0 0 0 25 85"/,
        );
        assert.match(
            out,
            /d="M 90 40 A 45 45 0 0 0 45 85"/,
        );
        assert.equal(
            /d="M 90 20 A 65 65 0 0 1 155 85"/
                .test(out),
            false,
            'right half must NOT render',
        );
    },
);

test(
    'GaugePresenter bipolar at positive draws'
    + ' the RIGHT half only',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(50, 50),
        ).render().toString();
        assert.match(
            out,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assert.match(
            out,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
        assert.equal(
            /d="M 90 20 A 65 65 0 0 0 25 85"/
                .test(out),
            false,
            'left half must NOT render',
        );
    },
);

test(
    'GaugePresenter bipolar at -50 sets the'
    + ' dashoffset to half of the half-arc',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(-50, -50),
        ).render().toString();
        // At 50% magnitude each active half is
        // half-filled: offset is half its dasharray,
        // independent of the half-arc's radius.
        const arcs = [...out.matchAll(
            /stroke-dasharray="([\d.]+)"/g,
        )].map((m) => Number(m[1]));
        const offs = [...out.matchAll(
            /stroke-dashoffset="([\d.]+)"/g,
        )].map((m) => Number(m[1]));
        assert.equal(arcs.length, 2);
        assert.equal(offs.length, 2);
        arcs.forEach((arc, i) => {
            assert.ok(
                Math.abs((offs[i] ?? NaN) - arc / 2)
                    < 0.01,
                'half ' + i + ' is half-filled',
            );
        });
    },
);

test(
    'GaugePresenter bipolar at +-100 fills the'
    + ' active half completely (offset 0)',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(-100, 100),
        ).render().toString();
        // Outer LEFT half fills fully (offset 0)
        // and inner RIGHT half fills fully too.
        const zeros = out.match(
            /stroke-dashoffset="0"/g,
        ) ?? [];
        assert.equal(zeros.length, 2);
    },
);

test(
    'GaugePresenter bipolar declares the'
    + ' red-amber-green tri-gradient stops',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(-50, 50),
        ).render().toString();
        // Left half: amber center, error
        // extreme.
        assert.match(
            out,
            /stop-color="hsl\(var\(--warning\)\)"/,
        );
        assert.match(
            out,
            /stop-color="hsl\(var\(--error\)\)"/,
        );
        // Right half: amber center, success
        // extreme.
        assert.match(
            out,
            /stop-color="hsl\(var\(--success\)\)"/,
        );
    },
);

test(
    'GaugePresenter bipolar lets outer and inner'
    + ' show different signs independently',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(2, -21),
        ).render().toString();
        // Outer +2 → right half. Inner -21 →
        // left half.
        assert.match(
            out,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assert.match(
            out,
            /d="M 90 40 A 45 45 0 0 0 45 85"/,
        );
    },
);

// FlowPresenter

test(
    'FlowPresenter renders the flow name'
    + ' and a data-flow-card hook',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(), undefined,
        ).render().toString();
        assert.match(out, /Onboarding/);
        assert.match(out, /data-flow-card="aEsGMmBEFaVdWihhHXwCbw"/);
        noUnknownMagic(out);
    },
);

test(
    'FlowPresenter pluralizes states and'
    + ' transitions for counts other than one',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { nodeCount: 3, edgeCount: 2 },
            ),
            undefined,
        ).render().toString();
        assert.match(out, /3 states/);
        assert.match(out, /2 transitions/);
    },
);

test(
    'FlowPresenter uses singular labels when'
    + ' there is exactly one state and transition',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { nodeCount: 1, edgeCount: 1 },
            ),
            undefined,
        ).render().toString();
        assert.match(out, /1 state\b/);
        assert.match(out, /1 transition\b/);
        assert.equal(out.includes('states'), false);
        assert.equal(
            out.includes('transitions'), false,
        );
    },
);

test(
    'FlowPresenter shows a project badge only when'
    + ' a project name is supplied',
    () => {
        const withName = new FlowPresenter(
            makeFlowSummary(), 'Apollo',
        ).render().toString();
        assert.match(withName, /badge-outline/);
        assert.match(withName, /Apollo/);
        const without = new FlowPresenter(
            makeFlowSummary(), undefined,
        ).render().toString();
        assert.equal(
            /badge-outline/.test(without), false,
        );
    },
);

test(
    'FlowPresenter escapes a flow name that'
    + ' contains HTML metacharacters',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { name: '<b>x</b>' },
            ),
            undefined,
        ).render().toString();
        assert.match(out, /&lt;b&gt;x&lt;\/b&gt;/);
        assert.equal(/<b>x<\/b>/.test(out), false);
    },
);

// WorkingStylesPresenter

test(
    'WorkingStylesPresenter buildCard renders the'
    + ' Working Styles heading and a card wrapper',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 50 },
        ).buildCard().toString();
        assert.match(out, /Working Styles/);
        assert.match(out, /class="card/);
    },
);

test(
    'WorkingStylesPresenter renders friendly'
    + ' dimension labels in canonical order',
    () => {
        const out = new WorkingStylesPresenter({
            amiable: 10,
            driver: 40,
            expressive: 30,
            analytical: 20,
        }).buildRows().toString();
        for (
            const label of
            ['Mover', 'Shaker', 'Prover', 'Maker']
        ) {
            assert.ok(
                out.includes(label),
                `missing label ${label}`,
            );
        }
        assert.ok(
            out.indexOf('Mover')
            < out.indexOf('Shaker'),
        );
        assert.ok(
            out.indexOf('Shaker')
            < out.indexOf('Prover'),
        );
        assert.ok(
            out.indexOf('Prover')
            < out.indexOf('Maker'),
        );
    },
);

test(
    'WorkingStylesPresenter passes each percent'
    + ' through as a progress-fill CSS variable',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 73 },
        ).buildRows().toString();
        assert.match(out, /73%/);
        assert.match(out, /--progress-fill:73%/);
    },
);

test(
    'WorkingStylesPresenter constructor rejects an'
    + ' unknown dimension key',
    () => {
        assert.throws(
            () => new WorkingStylesPresenter(
                { bogus: 12 },
            ),
            /Unknown dimension key: bogus/,
        );
    },
);

test(
    'WorkingStylesPresenter renders only the'
    + ' dimensions that were provided',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 60 },
        ).buildRows().toString();
        assert.match(out, /Mover/);
        assert.equal(/Shaker/.test(out), false);
        assert.equal(/Prover/.test(out), false);
        assert.equal(/Maker/.test(out), false);
    },
);

// flow-designer-view builders

test(
    'buildFlowNameHeader shows a heading and edit'
    + ' button in read mode',
    () => {
        const out = buildFlowNameHeader(
            'My Flow', false,
        ).toString();
        assert.match(out, /My Flow/);
        assert.match(out, /id="flow-name-edit-btn"/);
        assert.equal(
            /id="flow-name-input"/.test(out), false,
        );
    },
);

test(
    'buildFlowNameHeader shows an input plus save'
    + ' and cancel buttons in edit mode',
    () => {
        const out = buildFlowNameHeader(
            'My Flow', true,
        ).toString();
        assert.match(out, /id="flow-name-input"/);
        assert.match(
            out, /id="flow-name-save-btn"/,
        );
        assert.match(
            out, /id="flow-name-cancel-btn"/,
        );
    },
);

test(
    'buildNodePanel renders the start node with'
    + ' its display label, not its stored name',
    () => {
        const out = buildNodePanel(
            makeNode({
                isCreate: true,
                name: 'Create',
            }),
            [], false,
            [], [], [],
        ).toString();
        assert.match(out, /Create/);
        assert.equal(/State Properties/.test(out),
            false);
        noUnknownMagic(out);
    },
);

test(
    'buildNodePanel renders the complete node as'
    + ' Archive',
    () => {
        const out = buildNodePanel(
            makeNode({
                isArchive: true,
                name: 'Archive',
            }),
            [], false,
            [], [], [],
        ).toString();
        assert.match(out, /Archive/);
    },
);

test(
    'buildNodePanel for a regular node lists the'
    + ' member checkboxes grouped Humans / AIs',
    () => {
        const humans = [
            makeHumanMember('hw_1', 'Ada', 'L'),
        ];
        const ais = [
            makeAIMember('ai_1', 'Sonnet'),
        ];
        const out = buildNodePanel(
            makeNode(), [], false,
            humans, ais, [],
        ).toString();
        assert.match(out, /State Properties/);
        assert.match(out, /id="prop-node-members"/);
        assert.match(out, /member-group-label[^>]*>HUMANS</);
        assert.match(out, /member-group-label[^>]*>AIs</);
        assert.match(out, /data-member-id="hw_1"/);
        assert.match(out, /data-ai-member-id="ai_1"/);
        assert.match(out, /Ada L/);
        assert.match(out, /Sonnet/);
    },
);

test(
    'buildNodePanel marks currently assigned'
    + ' member checkboxes as checked',
    () => {
        const humans = [
            makeHumanMember('hw_1', 'Ada', 'L'),
            makeHumanMember('hw_2', 'Bea', 'M'),
        ];
        const out = buildNodePanel(
            makeNode({ memberIds: ['hw_1'] }),
            [], false, humans, [], [],
        ).toString();
        assert.match(
            out,
            /data-member-id="hw_1"[^>]*checked/,
        );
        assert.doesNotMatch(
            out,
            /data-member-id="hw_2"[^>]*checked/,
        );
    },
);

test(
    'buildNodePanel disables inputs when the flow'
    + ' is locked',
    () => {
        const humans = [
            makeHumanMember('hw_1', 'Ada', 'L'),
        ];
        const out = buildNodePanel(
            makeNode(), [], true,
            humans, [], [],
        ).toString();
        assert.match(
            out, /id="prop-node-name"[^>]*disabled/,
        );
        assert.match(
            out,
            /data-member-id="hw_1"[^>]*disabled/,
        );
    },
);

test(
    'buildNodePanel renders outgoing transitions'
    + ' by name and falls back to None when empty',
    () => {
        const withEdges = buildNodePanel(
            makeNode(),
            [makeEdge({ name: 'Approve' })],
            false, [], [], [],
        ).toString();
        assert.match(withEdges, /Approve/);
        const none = buildNodePanel(
            makeNode(), [], false,
            [], [], [],
        ).toString();
        assert.match(none, /None/);
    },
);

test(
    'buildEdgePanel shows the transition name plus'
    + ' resolved From and To node names',
    () => {
        const out = buildEdgePanel(
            makeEdge({ name: 'Approve' }),
            makeNode({ id: 'n-1', name: 'Review' }),
            makeNode({ id: 'n-2', name: 'Done' }),
            false,
        ).toString();
        assert.match(out, /Transition Properties/);
        assert.match(out, /Approve/);
        assert.match(out, /Review/);
        assert.match(out, /Done/);
        noUnknownMagic(out);
    },
);

test(
    'buildEdgePanel disables its inputs when the'
    + ' flow is locked',
    () => {
        const out = buildEdgePanel(
            makeEdge(),
            makeNode({ id: 'n-1' }),
            makeNode({ id: 'n-2' }),
            true,
        ).toString();
        assert.match(
            out, /id="prop-edge-name"[^>]*disabled/,
        );
    },
);

test(
    'buildToolbar disables undo, redo, and delete'
    + ' buttons when their actions are unavailable',
    () => {
        const out = buildToolbar(
            false, false, false,
        ).toString();
        assert.match(
            out,
            /data-action="undo"[^>]*disabled/,
        );
        assert.match(
            out,
            /data-action="redo"[^>]*disabled/,
        );
        assert.match(
            out,
            /data-action="delete-selected"[^>]*disabled/,
        );
    },
);

test(
    'buildToolbar leaves undo, redo, and delete'
    + ' enabled when their actions are available',
    () => {
        const out = buildToolbar(
            true, true, true,
        ).toString();
        assert.equal(/disabled/.test(out), false);
        assert.match(
            out, /data-action="copy-mermaid"/,
        );
        assert.match(out, /data-action="export-zip"/);
    },
);

// list-filter: toggleStatusFilter

test(
    'toggleStatusFilter from all moves to filtered'
    + ' on the clicked status',
    () => {
        const next = toggleStatusFilter(
            { kind: 'all' as const }, 'active',
        );
        assert.deepEqual(
            next, { kind: 'filtered', status: 'active' },
        );
    },
);

test(
    'toggleStatusFilter clears back to all when'
    + ' the active status is clicked again',
    () => {
        const filtered = {
            kind: 'filtered' as const,
            status: 'active',
        };
        assert.deepEqual(
            toggleStatusFilter(filtered, 'active'),
            { kind: 'all' },
        );
    },
);

test(
    'toggleStatusFilter switches directly between'
    + ' two non-matching statuses',
    () => {
        const filtered = {
            kind: 'filtered' as const,
            status: 'active',
        };
        assert.deepEqual(
            toggleStatusFilter(filtered, 'archived'),
            { kind: 'filtered', status: 'archived' },
        );
    },
);

// ordered-keys: orderedKeys

test(
    'orderedKeys returns present keys in the'
    + ' supplied order',
    () => {
        const groups = { b: 1, a: 1, c: 1 };
        assert.deepEqual(
            orderedKeys(groups, ['a', 'b', 'c']),
            ['a', 'b', 'c'],
        );
    },
);

test(
    'orderedKeys skips ordered keys absent from'
    + ' the group object',
    () => {
        const groups = { a: 1, c: 1 };
        assert.deepEqual(
            orderedKeys(groups, ['a', 'b', 'c']),
            ['a', 'c'],
        );
    },
);

test(
    'orderedKeys appends keys not named in the'
    + ' order list after the ordered ones',
    () => {
        const groups = { z: 1, a: 1, m: 1 };
        assert.deepEqual(
            orderedKeys(groups, ['a']),
            ['a', 'z', 'm'],
        );
    },
);

test(
    'orderedKeys treats falsy group values as'
    + ' absent',
    () => {
        const groups = { a: 0, b: 1, c: undefined };
        assert.deepEqual(
            orderedKeys(
                groups as Record<string, unknown>,
                ['a', 'b', 'c'],
            ),
            ['b'],
        );
    },
);
