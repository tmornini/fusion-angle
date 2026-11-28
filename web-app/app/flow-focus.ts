// Step focus: while a state is hovered, keyboard-focused or
// the one state selected, the designer fades every state
// and transition that does not touch it, so a busy flow
// reads one state's ins and outs at a glance. The sets are
// pure; applying them only toggles classes, so the canvas
// markup and its rebuilds stay as they are.
import type { Selection } from './flow-interactions.ts';

interface FocusEdge {
    readonly id: string;
    readonly fromNodeId: string;
    readonly toNodeId: string;
}

// What stays lit: the state itself, every transition into
// or out of it, and the states at their other ends.
export interface StepFocus {
    readonly nodeIds: ReadonlySet<string>;
    readonly edgeIds: ReadonlySet<string>;
}

export function stepFocusOf(
    edges: readonly FocusEdge[],
    nodeId: string,
): StepFocus {
    const nodeIds = new Set([nodeId]);
    const edgeIds = new Set<string>();
    for (const edge of edges) {
        if (
            edge.fromNodeId !== nodeId
            && edge.toNodeId !== nodeId
        ) continue;
        edgeIds.add(edge.id);
        nodeIds.add(edge.fromNodeId);
        nodeIds.add(edge.toNodeId);
    }
    return { nodeIds, edgeIds };
}

// The state that holds focus: the one under the pointer,
// else the one with keyboard focus, else the only selected
// state. A multi-state or edge selection focuses nothing.
export function focusedStepOf(
    hovered: string | null,
    keyboard: string | null,
    selection: Selection,
): string | null {
    if (hovered !== null) return hovered;
    if (keyboard !== null) return keyboard;
    if (
        selection.kind === 'nodes'
        && selection.nodeIds.size === 1
    ) {
        return [...selection.nodeIds][0] ?? null;
    }
    return null;
}

// Mark the drawn canvas: `flow-focusing` on the svg while a
// state holds focus, `flow-lit` on what stays bright.
export function applyStepFocus(
    svg: Element,
    focus: StepFocus | null,
): void {
    svg.classList.toggle('flow-focusing', focus !== null);
    for (const el of svg.querySelectorAll('[data-node-id]')) {
        const id = el.getAttribute('data-node-id') ?? '';
        el.classList.toggle(
            'flow-lit', focus?.nodeIds.has(id) ?? false,
        );
    }
    for (const el of svg.querySelectorAll('[data-edge-id]')) {
        const id = el.getAttribute('data-edge-id') ?? '';
        el.classList.toggle(
            'flow-lit', focus?.edgeIds.has(id) ?? false,
        );
    }
}
