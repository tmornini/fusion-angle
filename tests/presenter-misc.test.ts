import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { GaugePresenter } from
    '../web-app/app/presenters/gauge.ts';
import type { GaugeData } from
    '../web-app/app/adapters/dashboard.ts';
import { FlowPresenter } from
    '../web-app/app/presenters/flow.ts';
import type { FlowSummary } from
    '../web-app/app/adapters/flows.ts';
import { WorkingStylesPresenter } from
    '../web-app/app/presenters/working-styles.ts';
import {
    buildFieldRow,
    buildFieldEditor,
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
    HumanWorker, AIWorker, nowUtc,
    jsonArrayField, jsonObjectField,
} from '../api/types.ts';
import type {
    GraphField, GraphNode, GraphEdge,
} from '../api/types.ts';

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
    isOverrunning: boolean,
): GaugeData {
    return {
        title: 'Cost Baseline',
        icon: 'dollarSign',
        iconCssClass: 'text-primary',
        theme: 'blue',
        outer: makeArc(
            over.value, over.max, 'Baseline', '$10k',
        ),
        inner: makeArc(
            inner.value, inner.max, 'Current', '$8k',
        ),
        isOverrunning,
    };
}

function makeFlowSummary(
    over: Partial<FlowSummary> = {},
): FlowSummary {
    return {
        id: 'flow-1',
        name: 'Onboarding',
        description: 'Bring new hires up to speed',
        nodeCount: 3,
        edgeCount: 2,
        ...over,
    };
}

function makeField(
    over: Partial<GraphField> = {},
): GraphField {
    return {
        id: 'f-1',
        name: 'Title',
        fieldType: 'text',
        sortOrder: 0,
        isRequired: false,
        options: [],
        ...over,
    };
}

function makeNode(
    over: Partial<GraphNode> = {},
): GraphNode {
    return {
        id: 'n-1',
        name: 'Review',
        description: 'Manager review step',
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        workerIds: [],
        fields: [],
        ...over,
    };
}

function makeEdge(
    over: Partial<GraphEdge> = {},
): GraphEdge {
    return {
        id: 'e-1',
        name: 'Approve',
        description: 'On approval',
        fromNodeId: 'n-1',
        toNodeId: 'n-2',
        ...over,
    };
}

function makeHumanWorker(
    id: string, first: string, last: string,
): HumanWorker {
    return new HumanWorker({
        id,
        first_name: first,
        last_name: last,
        email: `${first}@example.com`.toLowerCase(),
        title: 'Engineer',
        department: 'Eng',
        strengths: jsonArrayField([]),
        team_dimensions: jsonObjectField({}),
        phone: '',
        bio: '',
    }, 'active');
}

function makeAIWorker(id: string, name: string): AIWorker {
    return new AIWorker({
        id, name, provider: 'anthropic',
        description: '',
        auth_token: 'sk-test-XXXX',
        created_at: nowUtc(),
    }, 'active');
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
                false,
            ),
        ).render().toString();
        assert.match(out, /Cost Baseline/);
        assert.match(out, /class="icon-box"/);
        assert.match(out, /Baseline/);
        assert.match(out, /Current/);
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
                false,
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
                false,
            ),
        ).render().toString();
        // outerArc = PI*65, innerArc = PI*45;
        // offset == arc length means "empty".
        assert.match(
            out,
            /stroke-dashoffset="204\.20/,
        );
        assert.match(
            out,
            /stroke-dashoffset="141\.37/,
        );
    },
);

test(
    'GaugePresenter colors the inner arc red and'
    + ' adds the overrun class on heavy overrun',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 10, max: 10 },
                { value: 20, max: 10 },
                true,
            ),
        ).render().toString();
        assert.match(out, /stop-color="red"/);
        assert.match(
            out,
            /class="gauge-arc-inner overrun"/,
        );
        assert.match(out, /--flash-speed:/);
    },
);

test(
    'GaugePresenter does not flag overrun when'
    + ' isOverrunning is false even past max',
    () => {
        const out = new GaugePresenter(
            makeGauge(
                { value: 10, max: 10 },
                { value: 20, max: 10 },
                false,
            ),
        ).render().toString();
        assert.equal(
            /stop-color="red"/.test(out), false,
        );
        assert.equal(/overrun/.test(out), false);
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
                false,
            ),
        ).render().toString();
        assert.match(out, /id="outer-cost-baseline"/);
        assert.match(out, /id="inner-cost-baseline"/);
    },
);

// FlowPresenter

test(
    'FlowPresenter renders the flow name,'
    + ' description, and a data-flow-card hook',
    () => {
        const out = new FlowPresenter(
            makeFlowSummary(), undefined,
        ).render().toString();
        assert.match(out, /Onboarding/);
        assert.match(
            out, /Bring new hires up to speed/,
        );
        assert.match(out, /data-flow-card="flow-1"/);
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
        assert.equal(/states/.test(out), false);
        assert.equal(
            /transitions/.test(out), false,
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
    'buildFieldRow marks required fields with an'
    + ' asterisk and omits it otherwise',
    () => {
        const required = buildFieldRow(
            makeField({ isRequired: true }),
        ).toString();
        assert.match(
            required, /flow-required-mark/,
        );
        const optional = buildFieldRow(
            makeField({ isRequired: false }),
        ).toString();
        assert.equal(
            /flow-required-mark/.test(optional),
            false,
        );
    },
);

test(
    'buildFieldRow shows the field type badge,'
    + ' name, and a delete-field hook',
    () => {
        const out = buildFieldRow(
            makeField({
                name: 'Budget',
                fieldType: 'currency',
            }),
        ).toString();
        assert.match(out, /badge-outline/);
        assert.match(out, /currency/);
        assert.match(out, /Budget/);
        assert.match(
            out, /data-action="delete-field"/,
        );
        assert.match(out, /data-field-id="f-1"/);
    },
);

test(
    'buildFieldEditor returns empty markup when'
    + ' no node id is given',
    () => {
        assert.equal(
            buildFieldEditor(null).toString(), '',
        );
        const out =
            buildFieldEditor('n-9').toString();
        assert.match(out, /flow-field-editor/);
        assert.match(out, /id="new-field-name"/);
        assert.match(out, /data-action="save-field"/);
        assert.match(out, /data-node-id="n-9"/);
    },
);

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
            [], [],
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
            [], [],
        ).toString();
        assert.match(out, /Archive/);
    },
);

test(
    'buildNodePanel for a regular node lists the'
    + ' worker checkboxes grouped Humans / AIs',
    () => {
        const humans = [
            makeHumanWorker('hw_1', 'Ada', 'L'),
        ];
        const ais = [
            makeAIWorker('ai_1', 'Sonnet'),
        ];
        const out = buildNodePanel(
            makeNode(), [], false,
            humans, ais,
        ).toString();
        assert.match(out, /State Properties/);
        assert.match(out, /id="prop-node-workers"/);
        assert.match(out, /worker-group-label[^>]*>HUMANS</);
        assert.match(out, /worker-group-label[^>]*>AIs</);
        assert.match(out, /data-worker-id="hw_1"/);
        assert.match(out, /data-worker-id="ai_1"/);
        assert.match(out, /Ada L/);
        assert.match(out, /Sonnet/);
    },
);

test(
    'buildNodePanel marks currently assigned'
    + ' worker checkboxes as checked',
    () => {
        const humans = [
            makeHumanWorker('hw_1', 'Ada', 'L'),
            makeHumanWorker('hw_2', 'Bea', 'M'),
        ];
        const out = buildNodePanel(
            makeNode({ workerIds: ['hw_1'] }),
            [], false, humans, [],
        ).toString();
        assert.match(
            out,
            /data-worker-id="hw_1"[^>]*checked/,
        );
        assert.doesNotMatch(
            out,
            /data-worker-id="hw_2"[^>]*checked/,
        );
    },
);

test(
    'buildNodePanel disables inputs when the flow'
    + ' is locked',
    () => {
        const humans = [
            makeHumanWorker('hw_1', 'Ada', 'L'),
        ];
        const out = buildNodePanel(
            makeNode(), [], true,
            humans, [],
        ).toString();
        assert.match(
            out, /id="prop-node-name"[^>]*disabled/,
        );
        assert.match(
            out,
            /data-worker-id="hw_1"[^>]*disabled/,
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
            false, [], [],
        ).toString();
        assert.match(withEdges, /Approve/);
        const none = buildNodePanel(
            makeNode(), [], false,
            [], [],
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
