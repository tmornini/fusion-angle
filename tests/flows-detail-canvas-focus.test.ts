// Same module-eval stubs as flows-detail-shortcuts,
// plus SVGElement: restoreCanvasFocus type-tests
// candidates with `instanceof SVGElement` before
// calling focus(). The fake class IS the stub, so its
// instances pass the check.
// @ts-expect-error — Node global stub
globalThis.localStorage = {
    getItem: () => null,
    setItem: () => {},
};
globalThis.window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: () => {},
} as unknown as Window & typeof globalThis;
// @ts-expect-error — Node global stub
globalThis.document = { addEventListener: () => {} };

class FakeSvgElement {
    readonly attrs: Record<string, string>;
    parentElement:
        | FakeSvgElement
        | FakeWrap
        | null = null;
    focusCalls: Array<{ preventScroll: boolean }> = [];
    // The browser fires focusin synchronously from
    // focus(); onFocus stands in for that listener.
    onFocus: (() => void) | null = null;

    constructor(attrs: Record<string, string>) {
        this.attrs = attrs;
    }

    getAttribute(name: string): string | null {
        const value = this.attrs[name];
        return value === undefined ? null : value;
    }

    focus(options: { preventScroll: boolean }): void {
        this.focusCalls.push(options);
        if (this.onFocus) this.onFocus();
    }
}

class FakeWrap {
    readonly attrs: Record<string, string> = {};
    nodes: FakeSvgElement[] = [];
    edges: FakeSvgElement[] = [];
    parentElement: null = null;

    getAttribute(name: string): string | null {
        const value = this.attrs[name];
        return value === undefined ? null : value;
    }

    setAttribute(name: string, value: string): void {
        this.attrs[name] = value;
    }

    removeAttribute(name: string): void {
        delete this.attrs[name];
    }

    contains(el: unknown): boolean {
        let current = el as {
            parentElement: unknown;
        } | null;
        while (current) {
            if (current === this) return true;
            current = current.parentElement as {
                parentElement: unknown;
            } | null;
        }
        return false;
    }

    querySelectorAll(
        selector: string,
    ): FakeSvgElement[] {
        return selector === '[data-node-id]'
            ? this.nodes
            : this.edges;
    }
}

// @ts-expect-error — Node global stub
globalThis.SVGElement = FakeSvgElement;

import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { canvasFocusOf, restoreCanvasFocus } =
    await import('../web-app/flows/detail.ts');
const {
    buildInteractionState,
    canvasFocusInputOf,
    withCanvasFocusRestore,
} = await import(
    '../web-app/app/flow-interactions.ts'
);
const { reduceFsm } = await import(
    '../web-app/app/flow-fsm-reduce.ts'
);

type FsmState = ReturnType<
    typeof buildInteractionState
>;

function asElement(value: unknown): Element {
    return value as Element;
}

function wrapWithNode(): {
    wrap: FakeWrap;
    g: FakeSvgElement;
    text: FakeSvgElement;
} {
    const wrap = new FakeWrap();
    const g = new FakeSvgElement({
        'data-node-id': 'n1',
    });
    g.parentElement = wrap;
    const text = new FakeSvgElement({});
    text.parentElement = g;
    wrap.nodes = [g];
    return { wrap, g, text };
}

test(
    'canvasFocusOf finds the node id from a <text>'
    + ' child inside the wrap',
    () => {
        const { wrap, text } = wrapWithNode();
        assert.deepEqual(
            canvasFocusOf(
                asElement(text), asElement(wrap),
            ),
            { kind: 'node', id: 'n1' },
        );
    },
);

test('canvasFocusOf finds an edge id', () => {
    const wrap = new FakeWrap();
    const g = new FakeSvgElement({
        'data-edge-id': 'e1',
    });
    g.parentElement = wrap;
    wrap.edges = [g];
    assert.deepEqual(
        canvasFocusOf(
            asElement(g), asElement(wrap),
        ),
        { kind: 'edge', id: 'e1' },
    );
});

test(
    'canvasFocusOf yields null for null, an outside'
    + ' element, and the wrap itself',
    () => {
        const { wrap } = wrapWithNode();
        assert.equal(
            canvasFocusOf(null, asElement(wrap)),
            null,
        );
        const outside = new FakeSvgElement({
            'data-node-id': 'n9',
        });
        assert.equal(
            canvasFocusOf(
                asElement(outside), asElement(wrap),
            ),
            null,
        );
        assert.equal(
            canvasFocusOf(
                asElement(wrap), asElement(wrap),
            ),
            null,
        );
    },
);

test(
    'restoreCanvasFocus focuses the matching id once'
    + ' with preventScroll',
    () => {
        const wrap = new FakeWrap();
        const other = new FakeSvgElement({
            'data-node-id': 'n0',
        });
        const target = new FakeSvgElement({
            'data-node-id': 'n1',
        });
        wrap.nodes = [other, target];
        restoreCanvasFocus(
            { kind: 'node', id: 'n1' },
            asElement(wrap),
        );
        assert.deepEqual(
            target.focusCalls,
            [{ preventScroll: true }],
        );
        assert.equal(other.focusCalls.length, 0);
    },
);

test(
    'restoreCanvasFocus is inert for a missing id and'
    + ' for null',
    () => {
        const wrap = new FakeWrap();
        const survivor = new FakeSvgElement({
            'data-node-id': 'n0',
        });
        wrap.nodes = [survivor];
        restoreCanvasFocus(
            { kind: 'node', id: 'gone' },
            asElement(wrap),
        );
        restoreCanvasFocus(null, asElement(wrap));
        assert.equal(survivor.focusCalls.length, 0);
    },
);

// The seam the reducer pins and the DOM helpers pin
// never meet in either: restore -> focusin -> reduce.
// A rebuilt canvas carries the pointer's selection on
// the EDGE, so the re-focused node reads back with no
// aria-current and the promotion would fire.
function wrapForRestore(): {
    wrap: FakeWrap;
    node: FakeSvgElement;
} {
    const wrap = new FakeWrap();
    const node = new FakeSvgElement({
        'data-node-id': 'n1',
    });
    node.parentElement = wrap;
    const edge = new FakeSvgElement({
        'data-edge-id': 'e1',
        'aria-current': 'true',
    });
    edge.parentElement = wrap;
    wrap.nodes = [node];
    wrap.edges = [edge];
    return { wrap, node };
}

function edgeSelectedState(): FsmState {
    return {
        ...buildInteractionState(800, 600),
        selection: {
            kind: 'edge' as const,
            edgeId: 'e1',
        },
    };
}

// What the focusin listener does with the event.
function focusinInto(
    state: FsmState,
    target: FakeSvgElement,
    wrap: FakeWrap,
): FsmState {
    const input = canvasFocusInputOf(
        asElement(target), asElement(wrap),
    );
    if (input === null) return state;
    return reduceFsm(state, input).state;
}

test(
    'a restore inside withCanvasFocusRestore leaves'
    + ' the pointer selection alone',
    () => {
        const { wrap, node } = wrapForRestore();
        let state = edgeSelectedState();
        node.onFocus = () => {
            state = focusinInto(state, node, wrap);
        };
        withCanvasFocusRestore(
            asElement(wrap),
            () => {
                restoreCanvasFocus(
                    { kind: 'node', id: 'n1' },
                    asElement(wrap),
                );
            },
        );
        assert.equal(node.focusCalls.length, 1);
        assert.deepEqual(state.selection, {
            kind: 'edge',
            edgeId: 'e1',
        });
    },
);

test(
    'a focusin outside a restore still promotes the'
    + ' focused node to the selection',
    () => {
        const { wrap, node } = wrapForRestore();
        let state = edgeSelectedState();
        node.onFocus = () => {
            state = focusinInto(state, node, wrap);
        };
        restoreCanvasFocus(
            { kind: 'node', id: 'n1' },
            asElement(wrap),
        );
        assert.deepEqual(state.selection, {
            kind: 'nodes',
            nodeIds: new Set(['n1']),
        });
    },
);

test(
    'withCanvasFocusRestore releases the mark when'
    + ' the restore throws',
    () => {
        const { wrap, node } = wrapForRestore();
        assert.throws(() => {
            withCanvasFocusRestore(
                asElement(wrap),
                () => {
                    throw new Error('restore failed');
                },
            );
        });
        assert.notEqual(
            canvasFocusInputOf(
                asElement(node), asElement(wrap),
            ),
            null,
        );
    },
);
