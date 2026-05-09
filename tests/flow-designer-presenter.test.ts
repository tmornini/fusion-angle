import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    FlowDesignerPresenter,
    buildInitialFlowSnapshot,
} from
    '../web-app/app/presenters/flow-designer.ts';
import {
    buildFlowHistorySnapshot,
} from '../web-app/app/flow-history.ts';
import type {
    InteractionState,
} from '../web-app/app/flow-interactions.ts';

const emptyGraph = {
    id: 'flow-1',
    name: 'Test Flow',
    description: '',
    isLocked: false,
    isAutoLayout: false,
    isAutoFit: false,
    lockTimeout: 0,
    createdAt: '2026-05-01T00:00:00.000Z',
    nodes: [],
    edges: [],
};

function buildPresenter(): FlowDesignerPresenter {
    const snap = buildInitialFlowSnapshot(
        emptyGraph, 800, 600, new Map(),
    );
    return new FlowDesignerPresenter(
        snap, 800, 600,
        buildFlowHistorySnapshot(false),
    );
}

test(
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
        assert.equal(next.interaction, state);
        assert.equal(
            next.interaction.selection.kind,
            'nodes',
        );
        if (
            next.interaction.selection.kind
                === 'nodes'
        ) {
            assert.ok(
                next.interaction.selection
                    .nodeIds.has('n1'),
            );
        }
        assert.equal(
            next.interaction.zoom, 1.5,
        );
    },
);

test(
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
        assert.equal(next.flowId, original.flowId);
        assert.equal(
            next.flowName, original.flowName,
        );
        assert.equal(
            next.isPanelOpen, original.isPanelOpen,
        );
        assert.equal(next.nodes, original.nodes);
        assert.equal(next.edges, original.edges);
    },
);

const node = (
    id: string, x = 0, y = 0,
) => ({
    id,
    name: id.toUpperCase(),
    description: '',
    positionX: x,
    positionY: y,
    isStart: false,
    isComplete: false,
    crew: { kind: 'unassigned' as const },
    fields: [],
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
        graph, 1200, 800, new Map(),
    );
    return new FlowDesignerPresenter(
        snap, 1200, 800,
        buildFlowHistorySnapshot(false),
    );
}

test(
    'withFitReconciled when isAutoFit is false'
    + ' returns snapshot with viewBox unchanged',
    () => {
        const presenter =
            buildPresenterWithNodes(false);
        const before =
            presenter.snapshot()
                .interaction.viewBox;
        const beforeX = before.x;
        const beforeY = before.y;
        const beforeW = before.w;
        const beforeH = before.h;
        const next =
            presenter.withFitReconciled();
        assert.equal(
            next.interaction.viewBox.x, beforeX,
        );
        assert.equal(
            next.interaction.viewBox.y, beforeY,
        );
        assert.equal(
            next.interaction.viewBox.w, beforeW,
        );
        assert.equal(
            next.interaction.viewBox.h, beforeH,
        );
    },
);

test(
    'withFitReconciled when isAutoFit is true'
    + ' updates viewBox to fit content',
    () => {
        const presenter =
            buildPresenterWithNodes(true);
        const before =
            presenter.snapshot()
                .interaction.viewBox;
        const beforeX = before.x;
        const beforeW = before.w;
        const next =
            presenter.withFitReconciled();
        const after =
            next.interaction.viewBox;
        const xChanged =
            Math.abs(after.x - beforeX) > 0.001;
        const wChanged =
            Math.abs(after.w - beforeW) > 0.001;
        assert.ok(
            xChanged || wChanged,
            'viewBox should change when'
            + ' isAutoFit is true and nodes'
            + ' exist',
        );
    },
);

test(
    'withFitReconciled does NOT re-run auto'
    + '-layout when isAutoLayout is true and'
    + ' isAutoFit is false (Bug 2 contract)',
    () => {
        const graph = {
            ...emptyGraph,
            isAutoLayout: true,
            isAutoFit: false,
            nodes: [
                node('n1', -250, -50),
                node('n2', 250, 50),
            ],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 1200, 800, new Map(),
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, 1200, 800,
                buildFlowHistorySnapshot(false),
            );
        const before = presenter.snapshot().nodes;
        const beforeN1 = before.find(
            n => n.id === 'n1',
        )!;
        const beforeN2 = before.find(
            n => n.id === 'n2',
        )!;
        const next =
            presenter.withFitReconciled();
        const afterN1 = next.nodes.find(
            n => n.id === 'n1',
        )!;
        const afterN2 = next.nodes.find(
            n => n.id === 'n2',
        )!;
        assert.equal(
            afterN1.positionX,
            beforeN1.positionX,
        );
        assert.equal(
            afterN1.positionY,
            beforeN1.positionY,
        );
        assert.equal(
            afterN2.positionX,
            beforeN2.positionX,
        );
        assert.equal(
            afterN2.positionY,
            beforeN2.positionY,
        );
    },
);

test(
    'withFitReconciled re-fits viewBox but does'
    + ' NOT move nodes when isAutoLayout and'
    + ' isAutoFit are both true',
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
            graph, 1200, 800, new Map(),
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
        const next =
            presenter.withFitReconciled();
        const afterN1 = next.nodes.find(
            n => n.id === 'n1',
        )!;
        const afterN2 = next.nodes.find(
            n => n.id === 'n2',
        )!;
        assert.equal(
            afterN1.positionX, beforeN1.positionX,
        );
        assert.equal(
            afterN1.positionY, beforeN1.positionY,
        );
        assert.equal(
            afterN2.positionX, beforeN2.positionX,
        );
        assert.equal(
            afterN2.positionY, beforeN2.positionY,
        );
        const after = next.interaction.viewBox;
        const xChanged =
            Math.abs(after.x - beforeVb.x) > 0.001;
        const wChanged =
            Math.abs(after.w - beforeVb.w) > 0.001;
        assert.ok(
            xChanged || wChanged,
            'viewBox should change (auto-fit ran)',
        );
    },
);

// Successful-mutation coverage of withNodeAssignment
// lives in flow-designer-actions.test.ts as a
// direct applyUpdateNode test. The presenter
// wrapping triggers #saveFlow which calls
// createRequestContext() with the default
// LocalStorage adapter — not available under
// node:test. Same reason no other withNode*
// mutation test exists in this file.
//
// Locked-state coverage of withNodeAssignment is
// manual (TEST-PLAN F51). The presenter's
// #guardLocked() invokes showToast(), which
// depends on document — no DOM under
// node:test.

test(
    'withNodeAssignment is a no-op when no node'
    + ' is selected',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('n1', 0, 0)],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, new Map(),
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        const next = presenter.withNodeAssignment({
            kind: 'model', modelId: 'm-1',
        });
        const n = next.nodes.find(
            x => x.id === 'n1',
        )!;
        assert.equal(
            n.crew.kind, 'unassigned',
        );
    },
);

test(
    'withNodeAssignment is a no-op for a crew'
    + ' variant when no node is selected',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('n1', 0, 0)],
        };
        const snap = buildInitialFlowSnapshot(
            graph, 800, 600, new Map(),
        );
        const presenter =
            new FlowDesignerPresenter(
                snap, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        const next = presenter.withNodeAssignment({
            kind: 'crew', crewId: 'c-1',
        });
        const n = next.nodes.find(
            x => x.id === 'n1',
        )!;
        assert.equal(
            n.crew.kind, 'unassigned',
        );
    },
);

// tryShowFieldEditor coverage. The method's
// only DOM contact is querySelector on the
// container and an HTML write on the slot —
// no showToast, no fetch — so a stub container
// suffices. The "+ Add Field" button click in
// detail.ts hands the CURRENT
// pageState.presenter() to this method; the
// method's job is to write the form into the
// slot or report 'locked'. These tests pin
// that contract.

interface StubSlot {
    captured: string;
    writes: number;
}

function makeStubSlot(): StubSlot {
    const state: StubSlot = {
        captured: '', writes: 0,
    };
    Object.defineProperty(
        state, 'innerHTML', {
            set(v: string): void {
                state.captured = v;
                state.writes++;
            },
            get(): string {
                return state.captured;
            },
        },
    );
    return state;
}

function makeStubContainer(
    slot: StubSlot,
): HTMLElement {
    return {
        querySelector: (sel: string) =>
            sel === '#field-editor-slot'
                ? slot
                : null,
    } as unknown as HTMLElement;
}

function buildPresenterWithSelection(
    nodeId: string,
    isLocked: boolean,
): FlowDesignerPresenter {
    const graph = {
        ...emptyGraph,
        isLocked,
        nodes: [node(nodeId, 0, 0)],
    };
    const initial = buildInitialFlowSnapshot(
        graph, 800, 600, new Map(),
    );
    const seed = new FlowDesignerPresenter(
        initial, 800, 600,
        buildFlowHistorySnapshot(false),
    );
    const selectedSnap =
        seed.withInteractionState({
            ...initial.interaction,
            selection: {
                kind: 'nodes',
                nodeIds: new Set([nodeId]),
            },
        });
    return new FlowDesignerPresenter(
        selectedSnap, 800, 600,
        buildFlowHistorySnapshot(false),
    );
}

test(
    'tryShowFieldEditor returns "opened" and'
    + ' writes the form into the slot when a'
    + ' node is selected and the flow is not'
    + ' locked',
    () => {
        const presenter =
            buildPresenterWithSelection(
                'n1', false,
            );
        const slot = makeStubSlot();
        const container = makeStubContainer(slot);
        const result = presenter
            .tryShowFieldEditor(container);
        assert.equal(result, 'opened');
        assert.equal(slot.writes, 1);
        assert.match(
            slot.captured,
            /flow-field-editor/,
        );
        assert.match(
            slot.captured,
            /id="new-field-name"/,
        );
        assert.match(
            slot.captured,
            /data-action="save-field"/,
        );
    },
);

test(
    'tryShowFieldEditor returns "locked" and'
    + ' does not write to the slot when the'
    + ' flow is locked',
    () => {
        const presenter =
            buildPresenterWithSelection(
                'n1', true,
            );
        const slot = makeStubSlot();
        const container = makeStubContainer(slot);
        const result = presenter
            .tryShowFieldEditor(container);
        assert.equal(result, 'locked');
        assert.equal(slot.writes, 0);
        assert.equal(slot.captured, '');
    },
);

// Regression for the captured-presenter bug
// (detail.ts:1006). The "+ Add Field" click
// handler used to pass a presenter captured at
// init time — when no node was selected — so
// the resulting tryShowFieldEditor call saw a
// no-selection state and silently bailed.
// After the fix, the handler reads
// pageState.presenter() lazily, so it sees the
// selection that exists at click time. This
// test pins the contract the bug violated: a
// presenter built from a snapshot with
// selection reports a non-null selectedNodeId,
// AND the original presenter remains
// unchanged — immutability is what the
// captured-reference pattern weaponized into
// staleness.
test(
    'a presenter built from withInteractionState'
    + ' reports the selected node, and the'
    + ' source presenter remains unchanged',
    () => {
        const graph = {
            ...emptyGraph,
            nodes: [node('n1', 0, 0)],
        };
        const initial = buildInitialFlowSnapshot(
            graph, 800, 600, new Map(),
        );
        const initialPresenter =
            new FlowDesignerPresenter(
                initial, 800, 600,
                buildFlowHistorySnapshot(false),
            );
        assert.equal(
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
        assert.equal(
            selectedPresenter.selectedNodeId(),
            'n1',
        );
        assert.equal(
            initialPresenter.selectedNodeId(),
            null,
        );
    },
);
