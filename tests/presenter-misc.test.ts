import {
    assert,
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
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
    bindableRecords,
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
    HumanMember, AIMember,
} from '../api/types.ts';
import type {
    GraphNode, GraphEdge, RecordEntity,
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
    assertStrictEquals(
        /\bUnknown\b/.test(s), false,
        'output must not contain "Unknown"',
    );
}

// GaugePresenter

Deno.test(
    'GaugePresenter renders title, icon-box, and'
    + ' both legend labels',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 5, max: 10 },
                { value: 4, max: 10 },
            ),
        ).render().toString();
        assertMatch(out, /Cost Baseline/);
        assertMatch(out, /class="icon-box"/);
        assertMatch(out, /Baseline/);
        assertMatch(out, /Actual/);
        assertMatch(out, /<svg/);
        noUnknownMagic(out);
    },
);

Deno.test(
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
        assertStrictEquals(zeros.length, 2);
    },
);

Deno.test(
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
        assertStrictEquals(arcs.length, 2);
        assertStrictEquals(offs.length, 2);
        arcs.forEach((arc, i) => {
            assert(
                Math.abs((offs[i] ?? NaN) - arc) < 0.01,
                'arc ' + i + ' is empty',
            );
        });
    },
);

Deno.test(
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
        assertMatch(
            out,
            /stop-color="hsl\(var\(--error\)\)"/,
        );
        assertMatch(
            out,
            /class="gauge-arc-inner overrun"/,
        );
        assertMatch(out, /--flash-speed:/);
    },
);

Deno.test(
    'GaugePresenter derives a kebab-case id from'
    + ' the title for its gradient defs',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 1, max: 2 },
                { value: 1, max: 2 },
            ),
        ).render().toString();
        assertMatch(out, /id="outer-cost-baseline"/);
        assertMatch(out, /id="inner-cost-baseline"/);
    },
);

// GaugePresenter — bipolar variant

Deno.test(
    'GaugePresenter bipolar at zero renders no'
    + ' fill half-arc paths (track halves only)',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(0, 0),
        ).render().toString();
        // The half-arc fill paths start at top
        // dead center (M 90 20 outer, M 90 40
        // inner). At zero, neither half fills.
        assertStrictEquals(
            /d="M 90 20 A 65 65/.test(out),
            false,
            'outer half-arc fill must be absent',
        );
        assertStrictEquals(
            /d="M 90 40 A 45 45/.test(out),
            false,
            'inner half-arc fill must be absent',
        );
    },
);

Deno.test(
    'GaugePresenter bipolar at undefined renders'
    + ' no fill half-arc paths',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(undefined, undefined),
        ).render().toString();
        assertStrictEquals(
            /d="M 90 20 A 65 65/.test(out),
            false,
        );
        assertStrictEquals(
            /d="M 90 40 A 45 45/.test(out),
            false,
        );
    },
);

Deno.test(
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
        assert(opacities.length >= 4);
        for (const value of opacities) {
            assertMatch(
                value, /^\d+(\.\d+)?$/,
                'stop-opacity ' + value,
            );
        }
    },
);

Deno.test(
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
        assertMatch(
            out,
            /d="M 90 20 A 65 65 0 0 0 25 85"/,
        );
        assertMatch(
            out,
            /d="M 90 40 A 45 45 0 0 0 45 85"/,
        );
        assertStrictEquals(
            /d="M 90 20 A 65 65 0 0 1 155 85"/
                .test(out),
            false,
            'right half must NOT render',
        );
    },
);

Deno.test(
    'GaugePresenter bipolar at positive draws'
    + ' the RIGHT half only',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(50, 50),
        ).render().toString();
        assertMatch(
            out,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assertMatch(
            out,
            /d="M 90 40 A 45 45 0 0 1 135 85"/,
        );
        assertStrictEquals(
            /d="M 90 20 A 65 65 0 0 0 25 85"/
                .test(out),
            false,
            'left half must NOT render',
        );
    },
);

Deno.test(
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
        assertStrictEquals(arcs.length, 2);
        assertStrictEquals(offs.length, 2);
        arcs.forEach((arc, i) => {
            assert(
                Math.abs((offs[i] ?? NaN) - arc / 2)
                    < 0.01,
                'half ' + i + ' is half-filled',
            );
        });
    },
);

Deno.test(
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
        assertStrictEquals(zeros.length, 2);
    },
);

Deno.test(
    'GaugePresenter bipolar declares the'
    + ' red-amber-green tri-gradient stops',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(-50, 50),
        ).render().toString();
        // Left half: amber center, error
        // extreme.
        assertMatch(
            out,
            /stop-color="hsl\(var\(--warning\)\)"/,
        );
        assertMatch(
            out,
            /stop-color="hsl\(var\(--error\)\)"/,
        );
        // Right half: amber center, success
        // extreme.
        assertMatch(
            out,
            /stop-color="hsl\(var\(--success\)\)"/,
        );
    },
);

Deno.test(
    'GaugePresenter bipolar lets outer and inner'
    + ' show different signs independently',
    () => {
        const out = new GaugePresenter(
            makeBipolarGauge(2, -21),
        ).render().toString();
        // Outer +2 → right half. Inner -21 →
        // left half.
        assertMatch(
            out,
            /d="M 90 20 A 65 65 0 0 1 155 85"/,
        );
        assertMatch(
            out,
            /d="M 90 40 A 45 45 0 0 0 45 85"/,
        );
    },
);

// FlowPresenter

Deno.test(
    'FlowPresenter renders the flow name'
    + ' and a data-flow-card hook',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(), undefined,
        ).render().toString();
        assertMatch(out, /Onboarding/);
        assertMatch(out, /data-flow-card="aEsGMmBEFaVdWihhHXwCbw"/);
        noUnknownMagic(out);
    },
);

Deno.test(
    'FlowPresenter pluralizes states and'
    + ' transitions for counts other than one',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { nodeCount: 3, edgeCount: 2 },
            ),
            undefined,
        ).render().toString();
        assertMatch(out, /3 states/);
        assertMatch(out, /2 transitions/);
    },
);

Deno.test(
    'FlowPresenter uses singular labels when'
    + ' there is exactly one state and transition',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { nodeCount: 1, edgeCount: 1 },
            ),
            undefined,
        ).render().toString();
        assertMatch(out, /1 state\b/);
        assertMatch(out, /1 transition\b/);
        assertStrictEquals(out.includes('states'), false);
        assertStrictEquals(
            out.includes('transitions'), false,
        );
    },
);

Deno.test(
    'FlowPresenter shows a project badge only when'
    + ' a project name is supplied',
    () => {
        const withName = new FlowPresenter(
            makeFlowSummary(), 'Apollo',
        ).render().toString();
        assertMatch(withName, /badge-outline/);
        assertMatch(withName, /Apollo/);
        const without = new FlowPresenter(
            makeFlowSummary(), undefined,
        ).render().toString();
        assertStrictEquals(
            /badge-outline/.test(without), false,
        );
    },
);

Deno.test(
    'FlowPresenter escapes a flow name that'
    + ' contains HTML metacharacters',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(
                { name: '<b>x</b>' },
            ),
            undefined,
        ).render().toString();
        assertMatch(out, /&lt;b&gt;x&lt;\/b&gt;/);
        assertStrictEquals(/<b>x<\/b>/.test(out), false);
    },
);

// WorkingStylesPresenter

Deno.test(
    'WorkingStylesPresenter buildCard renders the'
    + ' Working Styles heading and a card wrapper',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 50 },
        ).buildCard().toString();
        assertMatch(out, /Working Styles/);
        assertMatch(out, /class="card/);
    },
);

Deno.test(
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
            assert(
                out.includes(label),
                `missing label ${label}`,
            );
        }
        assert(
            out.indexOf('Mover')
            < out.indexOf('Shaker'),
        );
        assert(
            out.indexOf('Shaker')
            < out.indexOf('Prover'),
        );
        assert(
            out.indexOf('Prover')
            < out.indexOf('Maker'),
        );
    },
);

Deno.test(
    'WorkingStylesPresenter passes each percent'
    + ' through as a progress-fill CSS variable',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 73 },
        ).buildRows().toString();
        assertMatch(out, /73%/);
        assertMatch(out, /--progress-fill:73%/);
    },
);

Deno.test(
    'WorkingStylesPresenter constructor rejects an'
    + ' unknown dimension key',
    () => {
        assertThrows(
            () => new WorkingStylesPresenter(
                { bogus: 12 },
            ),
            Error,
            'Unknown dimension key: bogus',
        );
    },
);

Deno.test(
    'WorkingStylesPresenter renders only the'
    + ' dimensions that were provided',
    () => {
        const out = new WorkingStylesPresenter(
            { driver: 60 },
        ).buildRows().toString();
        assertMatch(out, /Mover/);
        assertStrictEquals(/Shaker/.test(out), false);
        assertStrictEquals(/Prover/.test(out), false);
        assertStrictEquals(/Maker/.test(out), false);
    },
);

// flow-designer-view builders

Deno.test(
    'buildFlowNameHeader shows a heading and edit'
    + ' button in read mode',
    () => {
        const out = buildFlowNameHeader(
            'My Flow', false,
        ).toString();
        assertMatch(out, /My Flow/);
        assertMatch(out, /id="flow-name-edit-btn"/);
        assertStrictEquals(
            /id="flow-name-input"/.test(out), false,
        );
    },
);

Deno.test(
    'buildFlowNameHeader shows an input plus save'
    + ' and cancel buttons in edit mode',
    () => {
        const out = buildFlowNameHeader(
            'My Flow', true,
        ).toString();
        assertMatch(out, /id="flow-name-input"/);
        assertMatch(
            out, /id="flow-name-save-btn"/,
        );
        assertMatch(
            out, /id="flow-name-cancel-btn"/,
        );
    },
);

Deno.test(
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
        assertMatch(out, /Create/);
        assertStrictEquals(/State Properties/.test(out),
            false);
        noUnknownMagic(out);
    },
);

Deno.test(
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
        assertMatch(out, /Archive/);
    },
);

Deno.test(
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
        assertMatch(out, /State Properties/);
        assertMatch(out, /id="prop-node-members"/);
        assertMatch(out, /member-group-label[^>]*>HUMANS</);
        assertMatch(out, /member-group-label[^>]*>AIs</);
        assertMatch(out, /data-member-id="hw_1"/);
        assertMatch(out, /data-ai-member-id="ai_1"/);
        assertMatch(out, /Ada L/);
        assertMatch(out, /Sonnet/);
    },
);

Deno.test(
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
        assertMatch(
            out,
            /data-member-id="hw_1"[^>]*checked/,
        );
        assertNotMatch(
            out,
            /data-member-id="hw_2"[^>]*checked/,
        );
    },
);

Deno.test(
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
        assertMatch(
            out, /id="prop-node-name"[^>]*disabled/,
        );
        assertMatch(
            out,
            /data-member-id="hw_1"[^>]*disabled/,
        );
    },
);

Deno.test(
    'buildNodePanel renders outgoing transitions'
    + ' by name and falls back to None when empty',
    () => {
        const withEdges = buildNodePanel(
            makeNode(),
            [makeEdge({ name: 'Approve' })],
            false, [], [], [],
        ).toString();
        assertMatch(withEdges, /Approve/);
        const none = buildNodePanel(
            makeNode(), [], false,
            [], [], [],
        ).toString();
        assertMatch(none, /None/);
    },
);

Deno.test(
    'buildEdgePanel shows the transition name plus'
    + ' resolved From and To node names',
    () => {
        const out = buildEdgePanel(
            makeEdge({ name: 'Approve' }),
            makeNode({ id: 'n-1', name: 'Review' }),
            makeNode({ id: 'n-2', name: 'Done' }),
            false,
        ).toString();
        assertMatch(out, /Transition Properties/);
        assertMatch(out, /Approve/);
        assertMatch(out, /Review/);
        assertMatch(out, /Done/);
        noUnknownMagic(out);
    },
);

Deno.test(
    'buildEdgePanel disables its inputs when the'
    + ' flow is locked',
    () => {
        const out = buildEdgePanel(
            makeEdge(),
            makeNode({ id: 'n-1' }),
            makeNode({ id: 'n-2' }),
            true,
        ).toString();
        assertMatch(
            out, /id="prop-edge-name"[^>]*disabled/,
        );
    },
);

Deno.test(
    'buildToolbar disables undo, redo, and delete'
    + ' buttons when their actions are unavailable',
    () => {
        const out = buildToolbar(
            false, false, false,
        ).toString();
        assertMatch(
            out,
            /data-action="undo"[^>]*disabled/,
        );
        assertMatch(
            out,
            /data-action="redo"[^>]*disabled/,
        );
        assertMatch(
            out,
            /data-action="delete-selected"[^>]*disabled/,
        );
    },
);

Deno.test(
    'buildToolbar leaves undo, redo, and delete'
    + ' enabled when their actions are available',
    () => {
        const out = buildToolbar(
            true, true, true,
        ).toString();
        assertStrictEquals(/disabled/.test(out), false);
        assertMatch(
            out, /data-action="copy-mermaid"/,
        );
        assertMatch(out, /data-action="export-zip"/);
    },
);

// list-filter: toggleStatusFilter

Deno.test(
    'toggleStatusFilter from all moves to filtered'
    + ' on the clicked status',
    () => {
        const next = toggleStatusFilter(
            { kind: 'all' as const }, 'active',
        );
        assertEquals(
            next, { kind: 'filtered', status: 'active' },
        );
    },
);

Deno.test(
    'toggleStatusFilter clears back to all when'
    + ' the active status is clicked again',
    () => {
        const filtered = {
            kind: 'filtered' as const,
            status: 'active',
        };
        assertEquals(
            toggleStatusFilter(filtered, 'active'),
            { kind: 'all' },
        );
    },
);

Deno.test(
    'toggleStatusFilter switches directly between'
    + ' two non-matching statuses',
    () => {
        const filtered = {
            kind: 'filtered' as const,
            status: 'active',
        };
        assertEquals(
            toggleStatusFilter(filtered, 'archived'),
            { kind: 'filtered', status: 'archived' },
        );
    },
);

// ordered-keys: orderedKeys

Deno.test(
    'orderedKeys returns present keys in the'
    + ' supplied order',
    () => {
        const groups = { b: 1, a: 1, c: 1 };
        assertEquals(
            orderedKeys(groups, ['a', 'b', 'c']),
            ['a', 'b', 'c'],
        );
    },
);

Deno.test(
    'orderedKeys skips ordered keys absent from'
    + ' the group object',
    () => {
        const groups = { a: 1, c: 1 };
        assertEquals(
            orderedKeys(groups, ['a', 'b', 'c']),
            ['a', 'c'],
        );
    },
);

Deno.test(
    'orderedKeys appends keys not named in the'
    + ' order list after the ordered ones',
    () => {
        const groups = { z: 1, a: 1, m: 1 };
        assertEquals(
            orderedKeys(groups, ['a']),
            ['a', 'z', 'm'],
        );
    },
);

Deno.test(
    'orderedKeys treats falsy group values as'
    + ' absent',
    () => {
        const groups = { a: 0, b: 1, c: undefined };
        assertEquals(
            orderedKeys(
                groups as Record<string, unknown>,
                ['a', 'b', 'c'],
            ),
            ['b'],
        );
    },
);

Deno.test(
    'bindableRecords drops archived records but keeps'
    + ' the one currently bound',
    () => {
        const record = (
            id: string, state: string,
        ): RecordEntity => ({
            id,
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            name: 'Record ' + id,
            description: '',
            position: 0,
            state,
        });
        const active = record(
            'rbfHGatkwQzGZJVXKJEeyw', 'active',
        );
        const archived = record(
            'dCnpryxCNwuTnCrBBDIMOw', 'archived',
        );
        const boundArchived = record(
            'aEsGMmBEFaVdWihhHXwCbw', 'archived',
        );
        assertEquals(
            bindableRecords(
                [active, archived, boundArchived],
                boundArchived.id,
            ).map(r => r.id),
            [active.id, boundArchived.id],
        );
        assertEquals(
            bindableRecords([active, archived], null)
                .map(r => r.id),
            [active.id],
        );
    },
);
