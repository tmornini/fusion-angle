import {
    assert,
    assertEquals,
    assertNotStrictEquals,
    assertStrictEquals,
} from '@std/assert';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
    buildFlowSaveShape,
} from
    '../web-app/app/presenters/flow-designer.ts';
import { makeAIMember } from './member-fixtures.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import type {
    InteractionState,
} from '../web-app/app/flow-interactions.ts';

const emptyGraph = {
    id: 'aEsGMmBEFaVdWihhHXwCbw',
    name: 'Test Flow',
    isLocked: false,
    isAutoLayout: false,
    isAutoFit: false,
    lockTimeout: 0,
    hasUndoHistory: false,
    nodes: [],
    edges: [],
};

function buildPresenter(): FlowDesignerPresenter {
    const snap = buildInitialFlowSnapshot(
        emptyGraph, 800, 600, [], [], [],
    );
    return new FlowDesignerPresenter(
        snap, 800, 600,
        buildFlowHistorySnapshot(false),
    );
}

Deno.test(
    'withInteractionState returns snapshot with'
    + ' the given interaction state',
    () => {
        const presenter = buildPresenter();
        const state: InteractionState = {
            selection: {
                kind: 'nodes',
                nodeIds: new Set(['n1']),
            },
            lastClick: {
                kind: 'clicked',
                id: 'n1',
                time: 1000,
            },
            drag: { kind: 'idle' },
            connect: { kind: 'idle' },
            pan: { kind: 'idle' },
            marquee: { kind: 'idle' },
            viewBox: {
                x: -400, y: -300, w: 800, h: 600,
            },
            zoom: 1.5,
            isPanMode: false,
        };
        const next = presenter
            .withInteractionState(state);
        assertStrictEquals(next.interaction, state);
        assertStrictEquals(
            next.interaction.selection.kind,
            'nodes',
        );
        if (
            next.interaction.selection.kind
                === 'nodes'
        ) {
            assert(
                next.interaction.selection
                    .nodeIds.has('n1'),
            );
        }
        assertStrictEquals(
            next.interaction.zoom, 1.5,
        );
    },
);

Deno.test(
    'withInteractionState preserves all other'
    + ' snapshot fields',
    () => {
        const presenter = buildPresenter();
        const original = presenter.snapshot();
        const state: InteractionState = {
            selection: { kind: 'none' },
            lastClick: { kind: 'none' },
            drag: { kind: 'idle' },
            connect: { kind: 'idle' },
            pan: { kind: 'idle' },
            marquee: { kind: 'idle' },
            viewBox: {
                x: 0, y: 0, w: 100, h: 100,
            },
            zoom: 2.0,
            isPanMode: true,
        };
        const next = presenter
            .withInteractionState(state);
        assertStrictEquals(next.flowId, original.flowId);
        assertStrictEquals(
            next.flowName, original.flowName,
        );
        assertStrictEquals(
            next.isPanelOpen, original.isPanelOpen,
        );
        assertStrictEquals(next.nodes, original.nodes);
        assertStrictEquals(next.edges, original.edges);
    },
);

const node = (
    id: string, x = 0, y = 0,
) => ({
    id,
    name: id.toUpperCase(),
    positionX: x,
    positionY: y,
    isCreate: false,
    isArchive: false,
    memberIds: [] as string[],
    attributes: [],
    taskInstructions: '',
});

function buildPresenterWithNodes(
    isAutoFit: boolean,
): FlowDesignerPresenter {
    const graph = {
        ...emptyGraph,
        isAutoFit,
        nodes: [
            node('n1', -100, -100),
            node('n2', 100, 100),
        ],
    };
    const snap = buildInitialFlowSnapshot(
        graph, 1200, 800, [], [], [],
    );
    return new FlowDesignerPresenter(
        snap, 1200, 800,
        buildFlowHistorySnapshot(false),
    );
}

Deno.test(
    'buildGestureContext carries the committed'
    + ' interaction (the FSM reduces from it)',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const zoomed = presenter.withZoomedIn();
        assertNotStrictEquals(
            zoomed.interaction.zoom,
            presenter.snapshot().interaction.zoom,
        );
        const next = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        );
        assertStrictEquals(
            next.buildGestureContext().interaction,
            zoomed.interaction,
        );
    },
);

Deno.test(
    'withZoomedIn steps +0.1 scaling the viewBox about'
    + ' its center; withZoomedOut reverses it',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const before =
            presenter.snapshot().interaction;
        const cx = before.viewBox.x
            + before.viewBox.w / 2;
        const cy = before.viewBox.y
            + before.viewBox.h / 2;
        const zoomed = presenter.withZoomedIn();
        const vb = zoomed.interaction.viewBox;
        const ratio =
            before.zoom / zoomed.interaction.zoom;
        assert(
            Math.abs(zoomed.interaction.zoom - 1.1)
                < 1e-9,
        );
        assert(
            Math.abs(vb.w - before.viewBox.w * ratio)
                < 1e-9,
        );
        assert(
            Math.abs(vb.h - before.viewBox.h * ratio)
                < 1e-9,
        );
        assert(
            Math.abs(vb.x + vb.w / 2 - cx) < 1e-9,
        );
        assert(
            Math.abs(vb.y + vb.h / 2 - cy) < 1e-9,
        );
        const back = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        ).withZoomedOut();
        assert(
            Math.abs(back.interaction.zoom - 1.0)
                < 1e-9,
        );
        assert(
            Math.abs(
                back.interaction.viewBox.w
                    - before.viewBox.w,
            ) < 1e-9,
        );
    },
);

Deno.test(
    'withFitToBox updates the viewBox to frame'
    + ' the given content box',
    () => {
        const presenter =
            buildPresenterWithNodes(true);
        const before =
            presenter.snapshot()
                .interaction.viewBox;
        const beforeX = before.x;
        const beforeW = before.w;
        const next = presenter.withFitToBox({
            minX: -500, minY: -400,
            maxX: 500, maxY: 400,
        });
        const after = next.interaction.viewBox;
        const xChanged =
            Math.abs(after.x - beforeX) > 0.001;
        const wChanged =
            Math.abs(after.w - beforeW) > 0.001;
        assert(
            xChanged || wChanged,
            'viewBox should change to frame the'
            + ' given box',
        );
    },
);

Deno.test(
    'withFitToBox frames a box that extends far'
    + ' below the nodes (edge/waypoint geometry)',
    () => {
        const presenter =
            buildPresenterWithNodes(true);
        const box = {
            minX: -100, minY: -100,
            maxX: 100, maxY: 1000,
        };
        const next = presenter.withFitToBox(box);
        const vb = next.interaction.viewBox;
        assert(
            vb.y + vb.h >= box.maxY - 0.001,
            'viewBox bottom covers the low dip',
        );
        assert(
            vb.y <= box.minY + 0.001,
            'viewBox top covers the box top',
        );
    },
);

Deno.test(
    'withFitToBox re-fits the viewBox but does'
    + ' NOT move nodes (viewport op contract)',
    () => {
        const graph = {
            ...emptyGraph,
            isAutoLayout: true,
            isAutoFit: true,
            nodes: [
                node('n1', -250, -50),
                node('n2', 250, 50),
            ],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 1200, 800, [], [], [],
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, 1200, 800,
                buildFlowHistorySnapshot(false),
            );
        const before = presenter.snapshot();
        const beforeN1 = before.nodes.find(
            n => n.id === 'n1',
        )!;
        const beforeN2 = before.nodes.find(
            n => n.id === 'n2',
        )!;
        const beforeVb = before.interaction.viewBox;
        const next = presenter.withFitToBox({
            minX: -300, minY: -100,
            maxX: 300, maxY: 100,
        });
        const afterN1 = next.nodes.find(
            n => n.id === 'n1',
        )!;
        const afterN2 = next.nodes.find(
            n => n.id === 'n2',
        )!;
        assertStrictEquals(
            afterN1.positionX, beforeN1.positionX,
        );
        assertStrictEquals(
            afterN1.positionY, beforeN1.positionY,
        );
        assertStrictEquals(
            afterN2.positionX, beforeN2.positionX,
        );
        assertStrictEquals(
            afterN2.positionY, beforeN2.positionY,
        );
        const after = next.interaction.viewBox;
        const xChanged =
            Math.abs(after.x - beforeVb.x) > 0.001;
        const wChanged =
            Math.abs(after.w - beforeVb.w) > 0.001;
        assert(
            xChanged || wChanged,
            'viewBox should change (fit ran)',
        );
    },
);

// Successful-mutation coverage of withNodeMemberIds
// lives in flow-designer-actions.test.ts as a
// direct applyUpdateNode test. Presenter wrapping
// that queues a save is pinned in
// tests/flow-designer-open.test.ts:
// putClientFacade(wrapInPageAdapter(db)) plus
// putSessionToken(DEV_TOKEN) makes
// sessionContext() live under Deno.test. Same
// reason no other withNode* mutation test exists
// in this file.
//
// Locked-state coverage of withNodeMemberIds is
// manual (TEST-PLAN F51). The presenter's
// #guardLocked() invokes showToast(), which
// depends on document — no DOM under
// Deno.test.

Deno.test(
    'withNodeMemberIds is a no-op when no node'
    + ' is selected',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('n1', 0, 0)],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        const next = presenter.withNodeMemberIds(
            ['hw_1'],
        );
        const n = next.nodes.find(
            x => x.id === 'n1',
        )!;
        assertEquals(n.memberIds, []);
    },
);

// A presenter built from withInteractionState
// must report the selected node, and the
// source presenter must remain unchanged.
// Immutability is what the captured-reference
// pattern weaponized into staleness in the
// original "+ Add Field" bug.
Deno.test(
    'a presenter built from withInteractionState'
    + ' reports the selected node, and the'
    + ' source presenter remains unchanged',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('n1', 0, 0)],
        };
        const initial = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const initialPresenter =
            new FlowDesignerPresenter(
                initial, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        assertStrictEquals(
            initialPresenter.selectedNodeId(),
            null,
        );
        const selectedSnap =
            initialPresenter.withInteractionState({
                ...initial.interaction,
                selection: {
                    kind: 'nodes',
                    nodeIds: new Set(['n1']),
                },
            });
        const selectedPresenter =
            new FlowDesignerPresenter(
                selectedSnap, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        assertStrictEquals(
            selectedPresenter.selectedNodeId(),
            'n1',
        );
        assertStrictEquals(
            initialPresenter.selectedNodeId(),
            null,
        );
    },
);

// Fix wave 2 (Task 11 browser regression, round 2): pins the
// mechanism narrated in flow-designer.ts's constructor
// comment. commit() (detail.ts) — including undo/redo's own
// commit(op.freshSnap) — builds a presenter via the plain
// 4-arg constructor on EVERY render. Before this fix, the
// constructor ALWAYS ran the legacy migrate-to-center check
// and silently queued a save whenever the snapshot's node
// centroid drifted off origin — corrupting undo-as-replay's
// document-pair history on every such render, not just page
// load. putClientFacade(wrapInPageAdapter(db)) plus
// putSessionToken(DEV_TOKEN) makes sessionContext()
// live; tests/flow-designer-open.test.ts is the seam
// that reaches #queueSave. This file still asserts
// the STRUCTURAL guarantee that
// implies no save was queued: an off-center snapshot survives
// the plain constructor byte-for-byte. Only the 5-arg,
// migrateToCenter=true form (onFlowLoaded's own one call
// site) may recenter.
Deno.test(
    'the plain (commit()-style) constructor leaves an'
    + ' off-center snapshot untouched — no silent'
    + ' migrate-to-center save on every re-render',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [
                node('n1', 500, 500),
                node('n2', 500, 500),
            ],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const n1 = presenter.snapshot().nodes
            .find(n => n.id === 'n1')!;
        assertStrictEquals(n1.positionX, 500);
        assertStrictEquals(n1.positionY, 500);
    },
);

Deno.test(
    'buildFlowSaveShape keeps stored agentIds'
    + ' and person memberIds',
    () => {
        const humanId = 'hw_1';
        const agentId = 'ai_1';
        const graph = {
            ...emptyGraph,
            nodes: [{
                ...node('n1'),
                memberIds: [humanId],
                agentIds: [agentId],
            }],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [],
            [makeAIMember(agentId, 'Claude')],
            [],
        );
        const saved = buildFlowSaveShape(snap)
            .nodes[0]!;
        assertEquals(
            saved.memberIds, [humanId],
        );
        assertEquals(
            saved.agentIds, [agentId],
        );
    },
);

Deno.test(
    'buildFlowSaveShape lifts leftover mixed'
    + ' agent ids out of memberIds',
    () => {
        const humanId = 'hw_1';
        const agentId = 'ai_1';
        const graph = {
            ...emptyGraph,
            nodes: [{
                ...node('n1'),
                memberIds: [humanId, agentId],
                agentIds: [],
            }],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [],
            [makeAIMember(agentId, 'Claude')],
            [],
        );
        const saved = buildFlowSaveShape(snap)
            .nodes[0]!;
        assertEquals(
            saved.memberIds, [humanId],
        );
        assertEquals(
            saved.agentIds, [agentId],
        );
    },
);

Deno.test(
    'withCanvasSize keeps a non-auto-fit presenter\'s'
    + ' zoom — a resize never re-fits the camera',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const zoomed = presenter.withZoomedIn();
        const next = new FlowDesignerPresenter(
            zoomed, 1200, 800,
            buildFlowHistorySnapshot(false),
        );
        const resized = next.withCanvasSize(1000, 700);
        assert(
            Math.abs(resized.interaction.zoom - 1.1)
                < 1e-9,
            'zoom survives the resize',
        );
        assert(
            Math.abs(
                resized.interaction.viewBox.w
                    - 1000 / 1.1,
            ) < 1e-9,
            'viewBox rescales about the center',
        );
    },
);

Deno.test(
    'withNodeNamed(id, name) renames that node even'
    + ' when the selection has moved to another',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a'), node('b')],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const selectedB = {
            ...snap,
            interaction: {
                ...snap.interaction,
                selection: {
                    kind: 'nodes' as const,
                    nodeIds: new Set(['b']),
                },
            },
        };
        const presenter = new FlowDesignerPresenter(
            selectedB, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withNodeNamed('a', 'typed');
        assertStrictEquals(
            next.nodes.find(n => n.id === 'a')!.name,
            'typed',
        );
        assertStrictEquals(
            next.nodes.find(n => n.id === 'b')!.name,
            'B',
        );
    },
);

Deno.test(
    'withNodeNamed(id, name) applies with no selection'
    + ' at all — the flush is bound to its target',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a')],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withNodeNamed('a', 'typed');
        assertStrictEquals(
            next.nodes.find(n => n.id === 'a')!.name,
            'typed',
        );
    },
);

Deno.test(
    'withEdgeNamed(id, name) applies with no selection',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('a'), node('b')],
            edges: [{
                id: 'e1',
                name: 'go',
                fromNodeId: 'a',
                toNodeId: 'b',
            }],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, [], [], [],
        );
        const presenter = new FlowDesignerPresenter(
            snap, 800, 600,
            buildFlowHistorySnapshot(false),
        );
        const next = presenter
            .withEdgeNamed('e1', 'renamed');
        assertStrictEquals(
            next.edges.find(e => e.id === 'e1')!.name,
            'renamed',
        );
    },
);
