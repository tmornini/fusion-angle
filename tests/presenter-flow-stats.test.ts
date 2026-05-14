import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatsGraphSvg }
    from '../web-app/app/flow-stats-graph.ts';
import type {
    FlowStatsModel, NodeStat,
} from '../web-app/app/flow-stats-aggregate.ts';
import { FlowStatsPresenter }
    from '../web-app/app/presenters/flow-stats.ts';

function model(): FlowStatsModel {
    const node =
        (over: Partial<NodeStat> & { id: string }): NodeStat => ({
            id: over.id, displayName: over.id.toUpperCase(),
            isCreate: false, isArchive: false,
            positionX: 0, positionY: 0,
            outgoingEdgeIds: [], heatPct: 0, heatT: 0,
            avgSeconds: null, medianSeconds: null, p90Seconds: null,
            visitsInWindow: 0, distinctWorkOrders: 0,
            currentlyHere: 0, throughputPerWeek: 0, revisitRatePct: 0,
            clanSize: 0, activeProducerCount: 0, topProducer: null,
            assignmentLabel: 'Unassigned',
            workerHazard: null, branchSplit: [],
            ...over,
        });
    return {
        nodes: [
            node({ id:'c', displayName:'Create',  isCreate:true,
                   positionX:0,   positionY:0 }),
            node({ id:'a', displayName:'A',
                   positionX:200, positionY:0,
                   heatT:0.32, heatPct:32,
                   avgSeconds: 510,
                   outgoingEdgeIds: ['e2'],
                   workerHazard: 'danger' }),
            node({ id:'z', displayName:'Archive', isArchive:true,
                   positionX:400, positionY:0 }),
        ],
        edges: [
            { id:'e1', name:'', description:'',
              fromNodeId:'c', toNodeId:'a' },
            { id:'e2', name:'', description:'',
              fromNodeId:'a', toNodeId:'z' },
        ],
        pathEntries: [],
        completedWorkOrderCount: 0,
        incompleteWorkOrderCount: 0,
        windowDays: 90,
        droppedNodeIds: new Set(),
        pathsWithDroppedStepsCount: 0,
    };
}

const VB = { x: 0, y: 0, w: 600, h: 200 };

// The flat SVG string makes a naive /data-node-id="x"[\s\S]*?…/
// leak into the *next* node's markup; slice out just this node's
// group (from its id attr to the next node-id attr) before asserting.
function nodeGroup(svg: string, id: string): string {
    const at = svg.indexOf(`data-node-id="${id}"`);
    assert.ok(at >= 0, `node ${id} not found`);
    const rest = svg.slice(at);
    const next = rest.indexOf('data-node-id=', 1);
    return next === -1 ? rest : rest.slice(0, next);
}

test('emits an svg with role=img and no editor affordances', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html, /<svg[^>]*role="img"/);
    assert.doesNotMatch(html, /role="button"/);
    assert.doesNotMatch(html, /\btabindex\b/);
    assert.doesNotMatch(html, /\bdata-connect-port\b/);
    assert.doesNotMatch(html, /\baria-current\b/);
    assert.doesNotMatch(html, /<animate\b/);
});

test('each node carries style="--heat-t:..." and no data-heat', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html,
        /data-node-id="a"[^>]*style="[^"]*--heat-t:\s*0\.32[^"]*"/);
    assert.match(html,
        /data-node-id="c"[^>]*data-special="start"/);
    assert.match(html,
        /data-node-id="z"[^>]*data-special="archive"/);
    assert.doesNotMatch(html, /\bdata-heat\b/);
});

test('regular nodes show avg-sojourn face; special nodes show —',
    () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html, />8\.5m</);
    assert.match(html,
        /data-node-id="c"[\s\S]*?flow-stats-node-face[^>]*>—</);
});

test('danger hazard glyph appears when workerHazard is danger',
    () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(nodeGroup(html, 'a'),
        /class="flow-stats-node-danger"/);
    assert.doesNotMatch(nodeGroup(html, 'c'),
        /flow-stats-node-warning|flow-stats-node-danger/);
});

test('warning hazard glyph appears when workerHazard is warning',
    () => {
    const m = model();
    const warned: FlowStatsModel = {
        ...m,
        nodes: m.nodes.map(n =>
            n.id === 'a'
                ? { ...n, workerHazard: 'warning' }
                : n,
        ),
    };
    const html = buildStatsGraphSvg(warned, VB, null).toString();
    assert.match(nodeGroup(html, 'a'),
        /class="flow-stats-node-warning"/);
});

test('edges carry data-edge-id and no interactive attributes', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.match(html, /<g[^>]*data-edge-id="e1"/);
    assert.match(html, /<g[^>]*data-edge-id="e2"/);
});

test('highlight set marks on-path and dims off-path nodes/edges',
    () => {
    const highlight = {
        nodeIds: new Set(['c', 'a']),
        edgeIds: new Set(['e1']),
    };
    const html =
        buildStatsGraphSvg(model(), VB, highlight).toString();
    assert.match(html, /data-node-id="c"[^>]*data-on-path="true"/);
    assert.match(html, /data-node-id="a"[^>]*data-on-path="true"/);
    assert.match(html, /data-node-id="z"[^>]*data-dim="true"/);
    assert.match(html, /data-edge-id="e1"[^>]*data-on-path="true"/);
    assert.match(html, /data-edge-id="e2"[^>]*data-dim="true"/);
});

test('no highlight ⇒ no data-dim or data-on-path anywhere', () => {
    const html = buildStatsGraphSvg(model(), VB, null).toString();
    assert.doesNotMatch(html, /data-dim="true"/);
    assert.doesNotMatch(html, /data-on-path="true"/);
});

test('a back-edge gets data-cycle; forward edges do not', () => {
    const m = model();
    const cyclic: FlowStatsModel = {
        ...m,
        edges: [
            ...m.edges,
            { id: 'e3', name: '', description: '',
              fromNodeId: 'z', toNodeId: 'a' },
        ],
    };
    const html =
        buildStatsGraphSvg(cyclic, VB, null).toString();
    assert.match(html,
        /data-edge-id="e3"[^>]*data-cycle="true"/);
    assert.doesNotMatch(html,
        /data-edge-id="e1"[^>]*data-cycle="true"/);
    assert.doesNotMatch(html,
        /data-edge-id="e2"[^>]*data-cycle="true"/);
});

// ---- FlowStatsPresenter tests ----

function modelWithPaths(): FlowStatsModel {
    return {
        ...model(),
        completedWorkOrderCount: 12,
        incompleteWorkOrderCount: 3,
        pathEntries: [
            {
                kind: 'path',
                path: {
                    nodeIds: ['c', 'a', 'z'],
                    edgeIds: ['e1', 'e2'],
                    workOrderCount: 9,
                    sharePct: 75,
                },
            },
            {
                kind: 'path',
                path: {
                    nodeIds: ['c', 'a'],
                    edgeIds: ['e1'],
                    workOrderCount: 2,
                    sharePct: 17,
                },
            },
            {
                kind: 'rest',
                count: 1,
                combinedSharePct: 8,
            },
        ],
    };
}

test('buildShell contains required structural elements', () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildShell().toString();
    assert.match(s, /id="flow-stats-back"/);
    assert.match(s,
        /class="flow-stats-canvas-host"/);
    assert.match(s,
        /id="flow-stats-card"[^>]*class="[^"]*hidden/);
    assert.match(s, /Trailing 90 days/);
    // no dropped nodes in this fixture
    assert.doesNotMatch(s,
        /omitted from this view/i);
});

test('buildShell includes footnote when droppedNodeIds non-empty',
    () => {
    const m: FlowStatsModel = {
        ...modelWithPaths(),
        droppedNodeIds: new Set(['x']),
        pathsWithDroppedStepsCount: 2,
    };
    const p = new FlowStatsPresenter(
        m, { x: 0, y: 0, w: 600, h: 200 },
    );
    assert.match(
        p.buildShell().toString(),
        /omitted from this view/i,
    );
});

test('buildStepperBar idx 0: path label, 75%, prev disabled',
    () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildStepperBar(
        { selectedPathIndex: 0 },
    ).toString();
    assert.match(s, /Path\s+1\s+of\s+3/);
    assert.match(s,
        /75%\s+of\s+12\s+work\s+orders/);
    assert.match(s,
        /data-stepper="prev"[^>]*disabled/);
    // next must NOT be disabled at idx 0
    assert.doesNotMatch(s,
        /data-stepper="next"[^>]*disabled/);
    // in-flight count appended
    assert.match(s, /3\s+in\s+flight/);
});

test('buildStepperBar idx 1: prev not disabled', () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildStepperBar(
        { selectedPathIndex: 1 },
    ).toString();
    assert.doesNotMatch(s,
        /data-stepper="prev"[^>]*disabled/);
});

test('buildStepperBar idx 2: rest entry, next disabled', () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildStepperBar(
        { selectedPathIndex: 2 },
    ).toString();
    assert.match(s, /\+\s*1\s+rarer paths/);
    assert.match(s, /8%/);
    assert.match(s,
        /data-stepper="next"[^>]*disabled/);
});

test('buildStepperBar names the control with an eyebrow',
    () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildStepperBar(
        { selectedPathIndex: 0 },
    ).toString();
    assert.match(s, /flow-stats-stepper-eyebrow/);
    assert.match(s, /Most-traveled paths/);
});

test('buildLegend: structure, end labels, no linear-gradient',
    () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = p.buildLegend().toString();
    assert.match(s, /class="flow-stats-legend"/);
    assert.match(s, />\s*0%\s*</);
    assert.match(s, />\s*100%\s*</);
    assert.doesNotMatch(s,
        /linear-gradient\(/i);
});

// ---- buildCard / renderCard tests ----

function nodeStat(
    over: Partial<NodeStat> & { id: string },
): NodeStat {
    return {
        id: over.id,
        displayName:
            over.displayName ?? over.id.toUpperCase(),
        isCreate: over.isCreate ?? false,
        isArchive: over.isArchive ?? false,
        positionX: over.positionX ?? 0,
        positionY: over.positionY ?? 0,
        outgoingEdgeIds:
            over.outgoingEdgeIds ?? [],
        heatPct: over.heatPct ?? 0,
        heatT: over.heatT ?? 0,
        avgSeconds: over.avgSeconds ?? null,
        medianSeconds: over.medianSeconds ?? null,
        p90Seconds: over.p90Seconds ?? null,
        visitsInWindow: over.visitsInWindow ?? 0,
        distinctWorkOrders:
            over.distinctWorkOrders ?? 0,
        currentlyHere: over.currentlyHere ?? 0,
        throughputPerWeek:
            over.throughputPerWeek ?? 0,
        revisitRatePct: over.revisitRatePct ?? 0,
        clanSize: over.clanSize ?? 0,
        activeProducerCount:
            over.activeProducerCount ?? 0,
        topProducer: over.topProducer ?? null,
        assignmentLabel:
            over.assignmentLabel ?? 'Unassigned',
        workerHazard: over.workerHazard ?? null,
        branchSplit: over.branchSplit ?? [],
    };
}

test('rich card renders all stat blocks for a regular node',
    () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = nodeStat({
        id: 'a', displayName: 'Review',
        heatPct: 58, heatT: 0.58,
        avgSeconds: 414720,
        medianSeconds: 259200,
        p90Seconds: 777600,
        visitsInWindow: 138,
        distinctWorkOrders: 124,
        currentlyHere: 12,
        throughputPerWeek: 11,
        revisitRatePct: 18,
        clanSize: 5,
        activeProducerCount: 3,
        topProducer: {
            name: 'Lee', vsClanAvgPct: 140,
            sharePct: 31, inCurrentClan: true,
        },
        assignmentLabel: 'Sarah Chen, Mike OBrien',
        branchSplit: [
            {
                edgeId: 'e3', label: 'approve',
                toNodeId: 'z', pct: 81,
            },
            {
                edgeId: 'e4', label: 'revise',
                toNodeId: 'a', pct: 19,
            },
        ],
    });
    const html = p.buildCard(s).toString();
    assert.match(html, />\s*58%\s*</);
    assert.match(html, /4\.8d/);
    assert.match(html, /3d/);
    // 777600s = 1.3 weeks (formatMinAscending
    // prefers weeks over days above 7d)
    assert.match(html, /1\.3w/);
    assert.match(html, />\s*138\s*</);
    assert.match(html, />\s*124\s*</);
    assert.match(html, />\s*12\s*</);
    assert.match(html, />\s*~11\/wk\s*</);
    assert.match(html, />\s*18%\s*</);
    assert.match(html, />\s*5\s*</);
    assert.match(html, />\s*3\s*</);
    assert.match(html, /Lee/);
    assert.match(html, /140%/);
    assert.match(html, /31%/);
    assert.doesNotMatch(html, /not in current clan/);
    assert.match(html, /Sarah Chen, Mike OBrien/);
    assert.match(html, /approve\s+81%/);
    assert.match(html, /revise\s+19%/);
});

test('top producer not in clan is flagged', () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = nodeStat({
        id: 'a',
        topProducer: {
            name: 'Zed', vsClanAvgPct: 400,
            sharePct: 100, inCurrentClan: false,
        },
    });
    const html = p.buildCard(s).toString();
    assert.match(html, /Zed/);
    assert.match(html, /not in current clan/);
});

test('special-node card is lean (no clan/producer/branch)',
    () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const s = nodeStat({
        id: 'c', isCreate: true,
        displayName: 'Create',
    });
    const html = p.buildCard(s).toString();
    assert.doesNotMatch(html, /Top producer/);
    assert.doesNotMatch(html, /Clan size/);
    // null durations render as em-dash
    assert.match(html, /—/);
});

test('renderCard hides the slot when nodeId is null', () => {
    const p = new FlowStatsPresenter(
        modelWithPaths(),
        { x: 0, y: 0, w: 600, h: 200 },
    );
    const classes = new Set<string>();
    const cardEl = {
        classList: classes,
    } as unknown as HTMLElement;
    const container = {
        querySelector: (sel: string) =>
            sel === '#flow-stats-card'
                ? cardEl : null,
    } as unknown as HTMLElement;
    p.renderCard(container, null);
    assert.ok(classes.has('hidden'));
});
