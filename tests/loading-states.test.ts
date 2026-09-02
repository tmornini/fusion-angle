import { assert, assertEquals, assertStrictEquals } from '@std/assert';
import { loadInto } from
    '../web-app/app/loading-states.ts';
import { html } from '../web-app/app/safe-html.ts';

// A structural stand-in for the container element:
// loadInto touches only innerHTML (via setHtml), id
// (measure names), and querySelector (error-path
// retry lookup).
function makeStubEl(): {
    innerHTML: string;
    id: string;
    querySelector: () => null;
} {
    return {
        innerHTML: '',
        id: 'stub-list',
        querySelector: () => null,
    };
}

Deno.test(
    'an empty fetch renders the empty state and'
    + ' calls onEmpty, never onData',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let dataCalls = 0;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.resolve([]),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: () => { dataCalls += 1; },
        });
        assertStrictEquals(emptied, 1);
        assertStrictEquals(dataCalls, 0);
        assert(
            el.innerHTML.includes(
                'No Widgets Yet',
            ),
        );
    },
);

Deno.test(
    'a non-empty fetch calls onData, never'
    + ' onEmpty',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let received: number[] | null = null;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.resolve([1]),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: (data) => {
                received = data;
            },
        });
        assertStrictEquals(emptied, 0);
        assertEquals(received, [1]);
    },
);

Deno.test(
    'a rejecting fetch renders the error state'
    + ' and calls neither hook',
    async () => {
        const el = makeStubEl();
        let emptied = 0;
        let dataCalls = 0;
        await loadInto({
            container:
                el as unknown as HTMLElement,
            skeleton: html`skeleton`,
            fetch: () => Promise.reject(
                new Error('boom'),
            ),
            emptyState: {
                icon: html``,
                title: 'No Widgets Yet',
                description: 'none',
                onEmpty: () => { emptied += 1; },
            },
            onData: () => { dataCalls += 1; },
        });
        assertStrictEquals(emptied, 0);
        assertStrictEquals(dataCalls, 0);
        assert(
            el.innerHTML.includes('Try Again'),
        );
    },
);
