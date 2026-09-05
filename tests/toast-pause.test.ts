import { assertStrictEquals } from '@std/assert';
import { FakeTime } from '@std/testing/time';
import { showToast } from '../web-app/app/toast.ts';

// A DOM stub that records listeners and classes per
// element. FakeTime owns setTimeout, clearTimeout, and
// Date.now; nothing here stubs a timer.
type Listener = () => void;

interface ElementStub {
    className: string;
    id: string;
    textContent: string;
    children: ElementStub[];
    lastElementChild: ElementStub | null;
    classes: Set<string>;
    listeners: Map<string, Listener[]>;
    classList: { add: (c: string) => void };
    setAttribute: () => void;
    addEventListener: (type: string, fn: Listener) => void;
    prepend: (child: ElementStub) => void;
    appendChild: (child: ElementStub) => void;
    remove: () => void;
}

function element(): ElementStub {
    const node: ElementStub = {
        className: '',
        id: '',
        textContent: '',
        children: [],
        lastElementChild: null,
        classes: new Set<string>(),
        listeners: new Map<string, Listener[]>(),
        classList: {
            add: (c: string) => { node.classes.add(c); },
        },
        setAttribute: () => {},
        addEventListener: (type, fn) => {
            const fns = node.listeners.get(type);
            if (fns === undefined) {
                node.listeners.set(type, [fn]);
                return;
            }
            fns.push(fn);
        },
        prepend: (child) => {
            node.children.unshift(child);
            node.lastElementChild =
                node.children[node.children.length - 1]
                ?? null;
        },
        appendChild: (child) => {
            node.children.push(child);
            node.lastElementChild = child;
        },
        remove: () => {},
    };
    return node;
}

function fire(node: ElementStub, type: string): void {
    const fns = node.listeners.get(type);
    if (fns === undefined) {
        throw new Error('no listener for ' + type);
    }
    for (const fn of fns) fn();
}

function installDom(): {
    toast: () => ElementStub;
    pendingClears: () => number;
    uninstall: () => void;
} {
    const g = globalThis as Record<string, unknown>;
    const previousDocument = g['document'];
    const previousSession = g['sessionStorage'];
    const created: ElementStub[] = [];
    let pendingClears = 0;
    g['document'] = {
        getElementById: () => null,
        createElement: () => {
            const node = element();
            created.push(node);
            return node;
        },
        body: element(),
    };
    g['sessionStorage'] = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => { pendingClears += 1; },
    };
    return {
        toast: () => {
            const node = created.find(
                n => n.className.startsWith('toast '),
            );
            if (node === undefined) {
                throw new Error('no toast painted');
            }
            return node;
        },
        pendingClears: () => pendingClears,
        uninstall: () => {
            g['document'] = previousDocument;
            g['sessionStorage'] = previousSession;
        },
    };
}

function closing(node: ElementStub): boolean {
    return node.classes.has('toast--closing');
}

Deno.test(
    'a toast pauses its auto-dismiss under the pointer and'
    + ' resumes with the remainder on leave',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            time.tick(4000);
            fire(toast, 'mouseenter');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'mouseleave');
            time.tick(1999);
            assertStrictEquals(closing(toast), false);
            time.tick(1);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);

Deno.test(
    'a toast pauses under focus and resumes on focusout',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            fire(toast, 'focusin');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'focusout');
            time.tick(6000);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);

Deno.test(
    'a toast stays paused while either pointer or focus'
    + ' remains',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            fire(toast, 'mouseenter');
            fire(toast, 'focusin');
            fire(toast, 'mouseleave');
            time.tick(6000);
            assertStrictEquals(closing(toast), false);
            fire(toast, 'focusout');
            time.tick(6000);
            assertStrictEquals(closing(toast), true);
        } finally {
            dom.uninstall();
        }
    },
);

Deno.test(
    'a paused toast does not re-arm auto-dismiss after'
    + ' the close button is clicked',
    () => {
        using time = new FakeTime();
        const dom = installDom();
        try {
            showToast('Saved', 'success');
            const toast = dom.toast();
            fire(toast, 'mouseenter');
            const closeBtn = toast.lastElementChild;
            if (closeBtn === null) {
                throw new Error('no close button');
            }
            fire(closeBtn, 'click');
            assertStrictEquals(closing(toast), true);
            assertStrictEquals(dom.pendingClears(), 1);
            fire(toast, 'mouseleave');
            time.tick(6000);
            assertStrictEquals(closing(toast), true);
            assertStrictEquals(dom.pendingClears(), 1);
        } finally {
            dom.uninstall();
        }
    },
);
