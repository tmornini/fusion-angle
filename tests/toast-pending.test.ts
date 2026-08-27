import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    STORAGE_KEY_PENDING_TOAST,
} from '../web-app/app/storage-keys.ts';
import {
    showToast,
    replayPendingToast,
} from '../web-app/app/toast.ts';

type Store = {
    getItem: (k: string) => string | null;
    setItem: (k: string, v: string) => void;
    removeItem: (k: string) => void;
};

function installDom(): {
    store: Map<string, string>;
    messages: string[];
} {
    const store = new Map<string, string>();
    const messages: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const session: Store = {
        getItem: (k) => store.get(k) ?? null,
        setItem: (k, v) => { store.set(k, v); },
        removeItem: (k) => { store.delete(k); },
    };
    g.sessionStorage = session;
    const bodyChildren: unknown[] = [];
    function el(tag: string): Record<string, unknown> {
        const node: Record<string, unknown> = {
            tagName: tag.toUpperCase(),
            className: '',
            children: [] as unknown[],
            lastElementChild: null,
            style: {},
            textContent: '',
            classList: { add: () => {} },
            setAttribute: () => {},
            addEventListener: () => {},
            prepend(child: unknown) {
                (node.children as unknown[]).unshift(
                    child,
                );
            },
            appendChild(child: unknown) {
                (node.children as unknown[]).push(child);
                const c = child as {
                    className?: string;
                    textContent?: string;
                };
                if (
                    c.className === 'toast-message'
                    && typeof c.textContent === 'string'
                ) {
                    messages.push(c.textContent);
                }
                return child;
            },
            remove() {},
        };
        return node;
    }
    let container: Record<string, unknown> | null = null;
    g.document = {
        getElementById: (id: string) =>
            id === 'toast-container' ? container : null,
        createElement: (tag: string) => el(tag),
        body: {
            appendChild(child: Record<string, unknown>) {
                container = child;
                bodyChildren.push(child);
                return child;
            },
        },
    };
    return { store, messages };
}

test(
    'showToast writes a pending session payload',
    () => {
        const g =
            globalThis as Record<string, unknown>;
        const previousTimeout = g.setTimeout;
        g.setTimeout = () => 0;
        const { store } = installDom();
        try {
            showToast('Submitted for review', 'success');
            const raw = store.get(
                STORAGE_KEY_PENDING_TOAST,
            );
            assert.ok(raw);
            const parsed = JSON.parse(raw!) as {
                message: string;
                variant: string;
                at: string;
            };
            assert.equal(
                parsed.message,
                'Submitted for review',
            );
            assert.equal(parsed.variant, 'success');
            assert.match(
                parsed.at,
                /^\d{4}-\d{2}-\d{2}T.*Z$/,
            );
        } finally {
            g.setTimeout = previousTimeout;
            delete g.sessionStorage;
            delete g.document;
        }
    },
);

test(
    'replayPendingToast restores the toast once',
    () => {
        const g =
            globalThis as Record<string, unknown>;
        const previousTimeout = g.setTimeout;
        g.setTimeout = () => 0;
        const { store, messages } = installDom();
        try {
            store.set(
                STORAGE_KEY_PENDING_TOAST,
                JSON.stringify({
                    message: 'Idea approved successfully',
                    variant: 'success',
                    at: '2026-08-27T00:00:00.000000Z',
                }),
            );
            replayPendingToast();
            assert.equal(
                store.has(STORAGE_KEY_PENDING_TOAST),
                false,
            );
            assert.ok(
                messages.includes(
                    'Idea approved successfully',
                ),
            );
            const again = messages.length;
            replayPendingToast();
            assert.equal(messages.length, again);
        } finally {
            g.setTimeout = previousTimeout;
            delete g.sessionStorage;
            delete g.document;
        }
    },
);
