import { assert, assertStrictEquals } from '@std/assert';
import {
    extractErrorMessage as apiExtract,
} from '../shared/error-helpers.ts';
import {
    extractErrorMessage as webExtract,
    isAbortFault,
    shouldSurfaceFault,
    reportFault,
    initErrorSurfacing,
} from '../web-app/app/error-helpers.ts';
import type { RequestContext } from
    '../web-app/app/adapters/shared.ts';
import { captureConsole } from
    './fixtures/console-capture.ts';

const layers = [
    ['api', apiExtract] as const,
    ['web-app', webExtract] as const,
];

for (const [layer, extract] of layers) {
    Deno.test(layer + ' extractErrorMessage uses an Error message',
        () => {
            assertStrictEquals(extract(new Error('boom')), 'boom');
        });

    Deno.test(layer + ' extractErrorMessage stringifies a non-Error',
        () => {
            assertStrictEquals(extract('plain'), 'plain');
            assertStrictEquals(extract(42), '42');
        });

    Deno.test(layer + ' extractErrorMessage prefers a fallback for'
        + ' a non-Error', () => {
            assertStrictEquals(extract('x', 'Import failed'),
                'Import failed');
            assertStrictEquals(extract(new Error('boom'), 'fb'),
                'boom');
        });
}

Deno.test('isAbortFault is true for AbortError', () => {
    assertStrictEquals(
        isAbortFault(
            new DOMException(
                'The operation was aborted.',
                'AbortError',
            ),
        ),
        true,
    );
});

Deno.test(
    'isAbortFault is true for an Error named AbortError',
    () => {
        const err = new Error('The user aborted a request');
        err.name = 'AbortError';
        assertStrictEquals(isAbortFault(err), true);
    },
);

Deno.test(
    'isAbortFault is false for Failed to fetch',
    () => {
        assertStrictEquals(
            isAbortFault(new TypeError('Failed to fetch')),
            false,
        );
    },
);

Deno.test(
    'shouldSurfaceFault hides abort and unload faults',
    () => {
        const abort = new DOMException(
            'The operation was aborted.',
            'AbortError',
        );
        const fetchErr = new TypeError('Failed to fetch');
        const boom = new Error('boom');
        assertStrictEquals(
            shouldSurfaceFault(abort, false), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(fetchErr, true), false,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, false), true,
        );
        assertStrictEquals(
            shouldSurfaceFault(boom, true), false,
        );
    },
);

type WindowListener = (event: Event) => void;

function installFaultDom(): {
    messages: string[];
    dispatch: (type: string) => void;
    restore: () => void;
} {
    const messages: string[] = [];
    const g = globalThis as Record<string, unknown>;
    const previousTimeout = g.setTimeout;
    const previousDocument = g.document;
    const previousWindow = g.window;
    g.setTimeout = () => 0;
    const listeners = new Map<string, WindowListener[]>();
    g.window = {
        addEventListener(
            type: string,
            fn: WindowListener,
        ): void {
            const list = listeners.get(type) ?? [];
            list.push(fn);
            listeners.set(type, list);
        },
        dispatchEvent(event: Event): boolean {
            for (const fn of listeners.get(event.type)
                ?? []) {
                fn(event);
            }
            return true;
        },
    };
    function el(tag: string): Record<string, unknown> {
        const node: Record<string, unknown> = {
            tagName: tag.toUpperCase(),
            className: '',
            id: '',
            children: [] as unknown[],
            lastElementChild: null,
            style: {},
            textContent: '',
            classList: { add: () => {} },
            setAttribute: () => {},
            addEventListener: () => {},
            querySelector: () => null,
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
                node.lastElementChild = child;
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
                return child;
            },
        },
    };
    return {
        messages,
        dispatch: (type: string) => {
            const win = g.window as {
                dispatchEvent: (e: Event) => boolean;
            };
            win.dispatchEvent(new Event(type));
        },
        restore: () => {
            g.setTimeout = previousTimeout;
            g.document = previousDocument;
            g.window = previousWindow;
        },
    };
}

const faultCtx = {
    operationId: 'rid',
} as unknown as RequestContext;

Deno.test(
    'reportFault toasts Failed to fetch while live',
    async () => {
        const { messages, restore } = installFaultDom();
        try {
            initErrorSurfacing();
            await captureConsole('error', () => {
                reportFault(
                    faultCtx,
                    'Work order detail refresh failed',
                    new TypeError('Failed to fetch'),
                );
            });
            assert(
                messages.some((t) => t.includes(
                    'Work order detail refresh failed',
                )),
            );
        } finally {
            restore();
        }
    },
);

Deno.test(
    'reportFault skips Failed to fetch after pagehide',
    () => {
        const { messages, dispatch, restore } =
            installFaultDom();
        try {
            initErrorSurfacing();
            dispatch('pagehide');
            reportFault(
                faultCtx,
                'Work order detail refresh failed',
                new TypeError('Failed to fetch'),
            );
            assertStrictEquals(messages.length, 0);
        } finally {
            dispatch('pageshow');
            restore();
        }
    },
);
