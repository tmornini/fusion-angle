import { test } from 'node:test';
import { strict as assert } from 'node:assert';
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

test(
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
        assert.equal(emptied, 1);
        assert.equal(dataCalls, 0);
        assert.ok(
            el.innerHTML.includes(
                'No Widgets Yet',
            ),
        );
    },
);

test(
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
        assert.equal(emptied, 0);
        assert.deepEqual(received, [1]);
    },
);

test(
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
        assert.equal(emptied, 0);
        assert.equal(dataCalls, 0);
        assert.ok(
            el.innerHTML.includes('Try Again'),
        );
    },
);
