import {
    assert,
    assertEquals,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert';
import {
    classifyInboxDrop,
    inboxDragMoved,
    inboxListKindAtPoint,
    inboxListKindFromHash,
    inboxPointerMoved,
    inboxShowsDropIndicator,
    initInboxDrag,
    paintInboxDrop,
    transferInboxDrop,
    type InboxTransfer,
} from '../web-app/app/workbox-inbox-drag.ts';
import {
    dropIndex,
} from '../web-app/app/drag-reorder-positions.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    createWorkOrderFromFlow,
} from
    '../web-app/app/work-order-creation.ts';
import {
    postFlowCreation,
    putFlow,
} from '../client/flow-mutations.ts';
import {
    deleteWorkOrderClaim,
    getWorkOrders,
    isClaimedAndUnlapsed,
    type RequestContext,
} from '../client/index.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    type GraphEdge,
    type GraphNode,
    type StoredGraph,
} from '../shared/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const N_START = generateIdentifier();
const N_MIDDLE = generateIdentifier();
const N_FINISH = generateIdentifier();
const E2 = generateIdentifier();

function buildNode(
    id: string,
    name: string,
    overrides?: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name,
        positionX: 0,
        positionY: 0,
        isCreate: false,
        isArchive: false,
        memberIds: [],
        attributes: [],
        taskInstructions: '',
        ...overrides,
    };
}

function buildEdge(
    id: string,
    fromNodeId: string,
    toNodeId: string,
): GraphEdge {
    return {
        id,
        name: '',
        fromNodeId,
        toNodeId,
    };
}

function buildLinearGraph(): StoredGraph {
    // n-middle carries one member so the flow
    // passes the publish gate (zero-member nodes
    // would mark the flow Not Ready).
    return {
        nodes: [
            buildNode(N_START, 'Start', {
                isCreate: true,
            }),
            buildNode(N_MIDDLE, 'Doing work', {
                memberIds: ['XXZruirZyAOoRpNxaDnpSA'],
            }),
            buildNode(N_FINISH, 'Done', {
                isArchive: true,
            }),
        ],
        edges: [
            buildEdge(
                'YiJPbufDpkyrZcZCYbUJpg',
                N_START,
                N_MIDDLE,
            ),
            buildEdge(E2, N_MIDDLE, N_FINISH),
        ],
    };
}

// Seed a flow through the SAME gate-driven
// create/document-PUT idiom the live route uses
// (postFlowCreation + putFlow), so a message pair
// exists at this flow's document.
async function seedFlow(
    db: MemoryDbAdapter,
    flowId: string,
    graph: StoredGraph,
): Promise<void> {
    const ctx = inPageContext(
        db, await organizationToken(),
    );
    await postFlowCreation(ctx, {
        flowId,
        linkId: generateIdentifier(),
        projectId: generateIdentifier(),
        name: 'Test flow',
    });
    await putFlow(ctx, flowId, {
        name: 'Test flow',
        isLocked: false,
        isAutoLayout: true,
        isAutoFit: true,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph.nodes,
        edges: graph.edges,
    });
}

async function setupOneWorkOrder(): Promise<{
    db: MemoryDbAdapter;
    ctx: RequestContext;
    woId: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    await seedHumanMember(
        db, 'XXZruirZyAOoRpNxaDnpSA', 'Demo Test',
    );
    const ctx = inPageContext(
        db, await organizationToken(),
    );
    await seedFlow(
        db, 'ZOousbbnzpqlxJExVAruYQ',
        buildLinearGraph(),
    );
    const woId = generateIdentifier();
    await createWorkOrderFromFlow(ctx, {
        workOrderId: woId,
        flowLinkId: generateIdentifier(),
        flowId: 'ZOousbbnzpqlxJExVAruYQ',
    });
    return { db, ctx, woId };
}

Deno.test(
    'available onto claimed-by-me Active is claim',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed', 'claimed',
            ),
            'claim',
        );
    },
);

Deno.test(
    'claimed-by-me onto available is release',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available', 'claimed',
            ),
            'release',
        );
    },
);

Deno.test(
    'claimed-by-me onto claimed-by-me is reorder',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'claimed', 'claimed',
            ),
            'reorder',
        );
    },
);

Deno.test(
    'available onto available is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop onto Archived by Me is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop while Archived by Me is selected'
    + ' is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'a drop outside both cards is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'outside', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    '#archived selects archived-by-me',
    () => {
        assertStrictEquals(
            inboxListKindFromHash('#archived'),
            'archivedByMe',
        );
    },
);

Deno.test(
    'empty and #active select claimed-by-me Active',
    () => {
        assertStrictEquals(
            inboxListKindFromHash(''),
            'claimed',
        );
        assertStrictEquals(
            inboxListKindFromHash('#active'),
            'claimed',
        );
    },
);

Deno.test(
    'transfer claim then positions among claimed'
    + ' rows',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await deleteWorkOrderClaim(
            ctx, held,
        );
        const moved = await transferInboxDrop(
            ctx, released, {
                kind: 'claim',
                position: 3,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(
            moved.claim.memberId,
            'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(moved.position, 3);
    },
);

Deno.test(
    'transfer release clears this member\'s'
    + ' live claim',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await transferInboxDrop(
            ctx, held, { kind: 'release' },
        );
        assertEquals(
            isClaimedAndUnlapsed(released.claim),
            false,
        );
    },
);

Deno.test(
    'transfer reorder writes position only',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const moved = await transferInboxDrop(
            ctx, held, {
                kind: 'reorder',
                position: 9,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(moved.position, 9);
    },
);

Deno.test(
    'transfer none returns the held work order',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const out = await transferInboxDrop(
            ctx, held, { kind: 'none' },
        );
        assertStrictEquals(out, held);
    },
);

Deno.test(
    'initInboxDrag is exported',
    async () => {
        const mod = await import(
            '../web-app/app/workbox-inbox-drag.ts'
        );
        assertEquals(
            typeof mod.initInboxDrag, 'function',
        );
    },
);

Deno.test(
    'inbox pointer at rest has not moved',
    () => {
        assertEquals(
            inboxPointerMoved(10, 20, 10, 20),
            false,
        );
    },
);

Deno.test(
    'inbox pointer 3px away has not moved',
    () => {
        assertEquals(
            inboxPointerMoved(0, 0, 3, 0),
            false,
        );
        assertEquals(
            inboxPointerMoved(0, 0, 0, 3),
            false,
        );
    },
);

Deno.test(
    'inbox pointer 4px away has moved',
    () => {
        assertEquals(
            inboxPointerMoved(0, 0, 4, 0),
            true,
        );
        assertEquals(
            inboxPointerMoved(0, 0, 0, 4),
            true,
        );
    },
);

Deno.test(
    'inbox pointer moved is horizontal-only',
    () => {
        assertEquals(
            inboxPointerMoved(8, 12, 12, 12),
            true,
        );
    },
);

Deno.test(
    'inbox pointer moved is vertical-only',
    () => {
        assertEquals(
            inboxPointerMoved(8, 12, 8, 16),
            true,
        );
    },
);

Deno.test(
    'inbox drag below threshold has not moved',
    () => {
        assertEquals(
            inboxDragMoved(false, 0, 0, 3, 0),
            false,
        );
    },
);

Deno.test(
    'inbox drag at threshold has moved',
    () => {
        assertEquals(
            inboxDragMoved(false, 0, 0, 4, 0),
            true,
        );
    },
);

Deno.test(
    'inbox drag stays moved after return',
    () => {
        assertEquals(
            inboxDragMoved(true, 0, 0, 1, 0),
            true,
        );
    },
);

const SIDE_BY_SIDE = [
    {
        kind: 'available' as const,
        left: 0,
        right: 100,
        top: 0,
        bottom: 200,
    },
    {
        kind: 'claimed' as const,
        left: 100,
        right: 200,
        top: 0,
        bottom: 200,
    },
];

Deno.test(
    'a point in the right card is claimed',
    () => {
        assertStrictEquals(
            inboxListKindAtPoint(
                150, 100, SIDE_BY_SIDE,
            ),
            'claimed',
        );
    },
);

Deno.test(
    'a point in the left card is available',
    () => {
        assertStrictEquals(
            inboxListKindAtPoint(
                50, 100, SIDE_BY_SIDE,
            ),
            'available',
        );
    },
);

Deno.test(
    'a point below both cards is outside',
    () => {
        assertStrictEquals(
            inboxListKindAtPoint(
                50, 250, SIDE_BY_SIDE,
            ),
            'outside',
        );
        assertStrictEquals(
            inboxListKindAtPoint(
                150, 250, SIDE_BY_SIDE,
            ),
            'outside',
        );
    },
);

Deno.test(
    'drop indicator shows on Active claimed only',
    () => {
        assertEquals(
            inboxShowsDropIndicator('claimed'),
            true,
        );
        assertEquals(
            inboxShowsDropIndicator(
                'archivedByMe',
            ),
            false,
        );
        assertEquals(
            inboxShowsDropIndicator('available'),
            false,
        );
        assertEquals(
            inboxShowsDropIndicator('outside'),
            false,
        );
    },
);

type FakeBox = {
    top: number;
    height: number;
    left: number;
    right: number;
};

type FakePointer = {
    readonly type: string;
    readonly target: FakeEl;
    readonly button: number;
    readonly pointerId: number;
    readonly clientX: number;
    readonly clientY: number;
    preventDefault(): void;
    stopImmediatePropagation(): void;
};

type FakeEl = {
    tagName: string;
    id: string;
    parent: FakeEl | null;
    children: FakeEl[];
    attrs: Record<string, string>;
    classes: Set<string>;
    style: { transform: string };
    innerHTML: string;
    box: FakeBox;
    className: string;
    classList: {
        add(name: string): void;
        remove(name: string): void;
        contains(name: string): boolean;
        toggle(
            name: string,
            force?: boolean,
        ): boolean;
    };
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    closest(selector: string): FakeEl | null;
    contains(node: FakeEl): boolean;
    querySelector(selector: string): FakeEl | null;
    querySelectorAll(selector: string): FakeEl[];
    getBoundingClientRect(): FakeBox & {
        bottom: number;
    };
    addEventListener(
        type: string,
        fn: (e: FakePointer) => void,
    ): void;
    dispatchEvent(e: FakePointer): boolean;
    insertBefore(node: FakeEl, ref: FakeEl): void;
    appendChild(node: FakeEl): FakeEl;
    remove(): void;
    setPointerCapture(_id: number): void;
};

function translateYPx(transform: string): number {
    const m = /translateY\((-?\d+(?:\.\d+)?)px\)/
        .exec(transform);
    return m ? Number(m[1]) : 0;
}

function matchesSel(
    node: FakeEl,
    selector: string,
): boolean {
    if (selector.startsWith('#')) {
        return node.id === selector.slice(1);
    }
    if (selector.startsWith('.')) {
        return node.classes.has(selector.slice(1));
    }
    const eq = /^\[([^=\]]+)="([^"]*)"\]$/.exec(
        selector,
    );
    if (eq) {
        return node.attrs[eq[1]!] === eq[2];
    }
    const attr = /^\[([^=\]]+)\]$/.exec(selector);
    if (attr) {
        return Object.hasOwn(node.attrs, attr[1]!);
    }
    return node.tagName === selector.toUpperCase();
}

function detach(node: FakeEl): void {
    if (!node.parent) return;
    const sibs = node.parent.children;
    const i = sibs.indexOf(node);
    if (i >= 0) sibs.splice(i, 1);
    node.parent = null;
}

function fakeEl(
    tag: string,
    box: FakeBox = {
        top: 0, height: 0, left: 0, right: 0,
    },
): FakeEl {
    const classes = new Set<string>();
    const listeners = new Map<
        string,
        Array<(e: FakePointer) => void>
    >();
    const node: FakeEl = {
        tagName: tag.toUpperCase(),
        id: '',
        parent: null,
        children: [],
        attrs: {},
        classes,
        style: { transform: '' },
        innerHTML: '',
        box,
        get className() {
            return [...classes].join(' ');
        },
        set className(value: string) {
            classes.clear();
            for (const c of value.split(/\s+/)) {
                if (c) classes.add(c);
            }
        },
        classList: {
            add(name) { classes.add(name); },
            remove(name) { classes.delete(name); },
            contains(name) {
                return classes.has(name);
            },
            toggle(name, force) {
                if (force === true) {
                    classes.add(name);
                    return true;
                }
                if (force === false) {
                    classes.delete(name);
                    return false;
                }
                if (classes.has(name)) {
                    classes.delete(name);
                    return false;
                }
                classes.add(name);
                return true;
            },
        },
        getAttribute(name) {
            if (name === 'id' && node.id) {
                return node.id;
            }
            return node.attrs[name] ?? null;
        },
        setAttribute(name, value) {
            node.attrs[name] = value;
            if (name === 'id') node.id = value;
        },
        closest(selector) {
            let cur: FakeEl | null = node;
            while (cur) {
                if (matchesSel(cur, selector)) {
                    return cur;
                }
                cur = cur.parent;
            }
            return null;
        },
        contains(other) {
            let cur: FakeEl | null = other;
            while (cur) {
                if (cur === node) return true;
                cur = cur.parent;
            }
            return false;
        },
        querySelector(selector) {
            for (const child of node.children) {
                if (matchesSel(child, selector)) {
                    return child;
                }
                const nested = child.querySelector(
                    selector,
                );
                if (nested) return nested;
            }
            return null;
        },
        querySelectorAll(selector) {
            const out: FakeEl[] = [];
            for (const child of node.children) {
                if (matchesSel(child, selector)) {
                    out.push(child);
                }
                out.push(
                    ...child.querySelectorAll(
                        selector,
                    ),
                );
            }
            return out;
        },
        getBoundingClientRect() {
            const dy = translateYPx(
                node.style.transform,
            );
            return {
                top: node.box.top + dy,
                height: node.box.height,
                left: node.box.left,
                right: node.box.right,
                bottom: node.box.top
                    + dy
                    + node.box.height,
            };
        },
        addEventListener(type, fn) {
            const fns = listeners.get(type);
            if (fns === undefined) {
                listeners.set(type, [fn]);
                return;
            }
            fns.push(fn);
        },
        dispatchEvent(e) {
            const fns = listeners.get(e.type);
            if (fns === undefined) return true;
            for (const fn of fns) fn(e);
            return true;
        },
        insertBefore(child, ref) {
            detach(child);
            const i = node.children.indexOf(ref);
            if (i < 0) {
                node.children.push(child);
            } else {
                node.children.splice(i, 0, child);
            }
            child.parent = node;
        },
        appendChild(child) {
            detach(child);
            node.children.push(child);
            child.parent = node;
            return child;
        },
        remove() { detach(node); },
        setPointerCapture() {},
    };
    return node;
}

function attach(parent: FakeEl, child: FakeEl): void {
    parent.appendChild(child);
}

function firePointer(
    root: FakeEl,
    type: string,
    target: FakeEl,
    x: number,
    y: number,
): void {
    root.dispatchEvent({
        type,
        target,
        button: 0,
        pointerId: 1,
        clientX: x,
        clientY: y,
        preventDefault() {},
        stopImmediatePropagation() {},
    });
}

Deno.test(
    'claimed-to-claimed drop uses untranslated'
    + ' card rects',
    () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const previous = g.document;
        g.document = {
            createElement: (tag: string) =>
                fakeEl(tag),
        };
        try {
            const root = fakeEl('div');
            const available = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            available.id = 'available-list';
            available.setAttribute(
                'data-inbox-list', 'available',
            );
            const claimed = fakeEl('div', {
                top: 0,
                height: 400,
                left: 100,
                right: 200,
            });
            claimed.id = 'claimed-list';
            claimed.setAttribute(
                'data-inbox-list', 'claimed',
            );
            const bases = [0, 100, 200];
            const cards = bases.map((top, i) => {
                const card = fakeEl('div', {
                    top,
                    height: 100,
                    left: 100,
                    right: 200,
                });
                card.setAttribute(
                    'data-work-order-card',
                    'wo-' + (i + 1),
                );
                card.setAttribute(
                    'data-position',
                    String(i + 1),
                );
                attach(claimed, card);
                return card;
            });
            attach(root, available);
            attach(root, claimed);
            initInboxDrag(
                root as unknown as HTMLElement,
                {
                    cardSelector:
                        '[data-work-order-card]',
                    idAttribute:
                        'data-work-order-card',
                    rightListKind: () => 'claimed',
                    onDrop() {},
                },
            );
            const first = cards[0]!;
            firePointer(
                root, 'pointerdown', first, 150, 10,
            );
            firePointer(
                root, 'pointermove', first, 150, 120,
            );
            const rects = bases.map((top) => ({
                top, height: 100,
            }));
            const expected = dropIndex(
                120, null, rects,
            );
            const indicatorAt = claimed.children
                .findIndex((c) =>
                    c.classes.has(
                        'inbox-drop-indicator',
                    ),
                );
            assertStrictEquals(
                indicatorAt, expected,
            );
        } finally {
            if (previous === undefined) {
                delete g.document;
            } else {
                g.document = previous;
            }
        }
    },
);

Deno.test(
    'a drag over available does not slide'
    + ' between its rows',
    () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const previous = g.document;
        g.document = {
            createElement: (tag: string) =>
                fakeEl(tag),
        };
        try {
            const root = fakeEl('div');
            const available = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            available.id = 'available-list';
            available.setAttribute(
                'data-inbox-list', 'available',
            );
            const claimed = fakeEl('div', {
                top: 0,
                height: 400,
                left: 100,
                right: 200,
            });
            claimed.id = 'claimed-list';
            claimed.setAttribute(
                'data-inbox-list', 'claimed',
            );
            const first = fakeEl('div', {
                top: 0,
                height: 100,
                left: 0,
                right: 100,
            });
            first.setAttribute(
                'data-work-order-card', 'wo-1',
            );
            first.setAttribute(
                'data-position', '1',
            );
            const second = fakeEl('div', {
                top: 100,
                height: 100,
                left: 0,
                right: 100,
            });
            second.setAttribute(
                'data-work-order-card', 'wo-2',
            );
            second.setAttribute(
                'data-position', '2',
            );
            attach(available, first);
            attach(available, second);
            attach(root, available);
            attach(root, claimed);
            initInboxDrag(
                root as unknown as HTMLElement,
                {
                    cardSelector:
                        '[data-work-order-card]',
                    idAttribute:
                        'data-work-order-card',
                    rightListKind: () => 'claimed',
                    onDrop() {},
                },
            );
            firePointer(
                root, 'pointerdown', first, 50, 10,
            );
            firePointer(
                root, 'pointermove', first, 50, 150,
            );
            assertStrictEquals(
                first.style.transform, '',
            );
            assert(
                !available.children.some((c) =>
                    c.classes.has(
                        'inbox-drop-indicator',
                    ),
                ),
            );
        } finally {
            if (previous === undefined) {
                delete g.document;
            } else {
                g.document = previous;
            }
        }
    },
);

Deno.test(
    'an available drag toward claimed follows'
    + ' the pointer',
    () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const previous = g.document;
        g.document = {
            createElement: (tag: string) =>
                fakeEl(tag),
        };
        try {
            const root = fakeEl('div');
            const availableCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            availableCol.className = 'card';
            const available = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            available.id = 'available-list';
            available.setAttribute(
                'data-inbox-list', 'available',
            );
            const claimedCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 100,
                right: 200,
            });
            claimedCol.className = 'card';
            const claimed = fakeEl('div', {
                top: 0,
                height: 24,
                left: 100,
                right: 200,
            });
            claimed.id = 'claimed-list';
            claimed.setAttribute(
                'data-inbox-list', 'claimed',
            );
            const wo = fakeEl('div', {
                top: 0,
                height: 80,
                left: 0,
                right: 100,
            });
            wo.setAttribute(
                'data-work-order-card', 'wo-1',
            );
            wo.setAttribute('data-position', '1');
            attach(available, wo);
            attach(availableCol, available);
            attach(claimedCol, claimed);
            attach(root, availableCol);
            attach(root, claimedCol);
            initInboxDrag(
                root as unknown as HTMLElement,
                {
                    cardSelector:
                        '[data-work-order-card]',
                    idAttribute:
                        'data-work-order-card',
                    rightListKind: () => 'claimed',
                    onDrop() {},
                },
            );
            firePointer(
                root, 'pointerdown', wo, 50, 10,
            );
            firePointer(
                root, 'pointermove', wo, 150, 200,
            );
            assertStrictEquals(
                wo.style.transform,
                'translate(100px, 190px)',
            );
        } finally {
            if (previous === undefined) {
                delete g.document;
            } else {
                g.document = previous;
            }
        }
    },
);

Deno.test(
    'a claimed drag toward available follows'
    + ' the pointer and marks the landing',
    () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const previous = g.document;
        g.document = {
            createElement: (tag: string) =>
                fakeEl(tag),
        };
        try {
            const root = fakeEl('div');
            const availableCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            availableCol.className = 'card';
            const available = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            available.id = 'available-list';
            available.setAttribute(
                'data-inbox-list', 'available',
            );
            const claimedCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 100,
                right: 200,
            });
            claimedCol.className = 'card';
            const claimed = fakeEl('div', {
                top: 0,
                height: 24,
                left: 100,
                right: 200,
            });
            claimed.id = 'claimed-list';
            claimed.setAttribute(
                'data-inbox-list', 'claimed',
            );
            const wo = fakeEl('div', {
                top: 0,
                height: 80,
                left: 100,
                right: 200,
            });
            wo.setAttribute(
                'data-work-order-card', 'wo-1',
            );
            wo.setAttribute('data-position', '1');
            attach(claimed, wo);
            attach(availableCol, available);
            attach(claimedCol, claimed);
            attach(root, availableCol);
            attach(root, claimedCol);
            initInboxDrag(
                root as unknown as HTMLElement,
                {
                    cardSelector:
                        '[data-work-order-card]',
                    idAttribute:
                        'data-work-order-card',
                    rightListKind: () => 'claimed',
                    onDrop() {},
                },
            );
            firePointer(
                root, 'pointerdown', wo, 150, 10,
            );
            firePointer(
                root, 'pointermove', wo, 50, 200,
            );
            assertStrictEquals(
                wo.style.transform,
                'translate(-100px, 190px)',
            );
            assert(
                availableCol.classes.has(
                    'inbox-drop-target',
                ),
            );
            assert(
                !claimedCol.classes.has(
                    'inbox-drop-target',
                ),
            );
        } finally {
            if (previous === undefined) {
                delete g.document;
            } else {
                g.document = previous;
            }
        }
    },
);

Deno.test(
    'a drop on the empty claimed card body'
    + ' claims',
    () => {
        const g = globalThis as Record<
            string, unknown
        >;
        const previous = g.document;
        g.document = {
            createElement: (tag: string) =>
                fakeEl(tag),
        };
        try {
            const root = fakeEl('div');
            const availableCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            availableCol.className = 'card';
            const available = fakeEl('div', {
                top: 0,
                height: 400,
                left: 0,
                right: 100,
            });
            available.id = 'available-list';
            available.setAttribute(
                'data-inbox-list', 'available',
            );
            const claimedCol = fakeEl('div', {
                top: 0,
                height: 400,
                left: 100,
                right: 200,
            });
            claimedCol.className = 'card';
            const claimed = fakeEl('div', {
                top: 0,
                height: 24,
                left: 100,
                right: 200,
            });
            claimed.id = 'claimed-list';
            claimed.setAttribute(
                'data-inbox-list', 'claimed',
            );
            const wo = fakeEl('div', {
                top: 0,
                height: 80,
                left: 0,
                right: 100,
            });
            wo.setAttribute(
                'data-work-order-card', 'wo-1',
            );
            wo.setAttribute('data-position', '1');
            attach(available, wo);
            attach(availableCol, available);
            attach(claimedCol, claimed);
            attach(root, availableCol);
            attach(root, claimedCol);
            const dropped: {
                transfer: InboxTransfer | null;
            } = { transfer: null };
            initInboxDrag(
                root as unknown as HTMLElement,
                {
                    cardSelector:
                        '[data-work-order-card]',
                    idAttribute:
                        'data-work-order-card',
                    rightListKind: () => 'claimed',
                    onDrop(_id, transfer) {
                        dropped.transfer = transfer;
                    },
                },
            );
            firePointer(
                root, 'pointerdown', wo, 50, 10,
            );
            firePointer(
                root, 'pointermove', wo, 150, 200,
            );
            firePointer(
                root, 'pointerup', wo, 150, 200,
            );
            assertStrictEquals(
                dropped.transfer?.kind, 'claim',
            );
        } finally {
            if (previous === undefined) {
                delete g.document;
            } else {
                g.document = previous;
            }
        }
    },
);

function asEl(node: FakeEl): HTMLElement {
    return node as unknown as HTMLElement;
}

function makeCard(
    id: string,
    position: number,
): FakeEl {
    const card = fakeEl('div');
    card.setAttribute('data-work-order-card', id);
    card.setAttribute(
        'data-position', String(position),
    );
    return card;
}

function emptyCopyP(): FakeEl {
    const p = fakeEl('p');
    p.className = 'text-muted';
    return p;
}

function cardIds(list: FakeEl): string[] {
    return list.querySelectorAll(
        '[data-work-order-card]',
    ).map(
        (c) => c.getAttribute(
            'data-work-order-card',
        ) ?? '',
    );
}

Deno.test(
    'reorder paint inserts the card by position',
    () => {
        const available = fakeEl('div');
        const claimed = fakeEl('div');
        const a = makeCard('wo-a', 1);
        const b = makeCard('wo-b', 2);
        const c = makeCard('wo-c', 3);
        attach(claimed, a);
        attach(claimed, b);
        attach(claimed, c);
        paintInboxDrop(
            asEl(a),
            { kind: 'reorder', position: 2.5 },
            {
                available: asEl(available),
                claimed: asEl(claimed),
            },
        );
        assertEquals(
            cardIds(claimed),
            ['wo-b', 'wo-a', 'wo-c'],
        );
    },
);

Deno.test(
    'claim paint strips dest empty copy and'
    + ' fills an empty source',
    () => {
        const available = fakeEl('div');
        const claimed = fakeEl('div');
        const card = makeCard('wo-1', 1);
        attach(available, card);
        attach(claimed, emptyCopyP());
        paintInboxDrop(
            asEl(card),
            { kind: 'claim', position: 1 },
            {
                available: asEl(available),
                claimed: asEl(claimed),
            },
        );
        assertEquals(cardIds(claimed), ['wo-1']);
        assertEquals(
            claimed.children.some(
                (ch) => ch.tagName === 'P',
            ),
            false,
        );
        assertEquals(
            available.querySelector(
                '[data-work-order-card]',
            ),
            null,
        );
        assertStringIncludes(
            available.innerHTML,
            'No work orders available to me',
        );
    },
);

Deno.test(
    'release paint strips dest empty copy and'
    + ' fills an empty source',
    () => {
        const available = fakeEl('div');
        const claimed = fakeEl('div');
        const card = makeCard('wo-1', 1);
        attach(claimed, card);
        attach(available, emptyCopyP());
        paintInboxDrop(
            asEl(card),
            { kind: 'release' },
            {
                available: asEl(available),
                claimed: asEl(claimed),
            },
        );
        assertEquals(
            cardIds(available), ['wo-1'],
        );
        assertEquals(
            available.children.some(
                (ch) => ch.tagName === 'P',
            ),
            false,
        );
        assertEquals(
            claimed.querySelector(
                '[data-work-order-card]',
            ),
            null,
        );
        assertStringIncludes(
            claimed.innerHTML,
            'No work orders claimed by me',
        );
    },
);
