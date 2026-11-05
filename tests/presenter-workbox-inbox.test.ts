import {
    assertEquals,
    assertStringIncludes,
} from '@std/assert';
import {
    WorkboxInboxPresenter,
    type InboxFilter,
    type InboxItem,
} from
    '../web-app/app/presenters/workbox-inbox.ts';

function placed(
    overrides: Partial<Extract<
        InboxItem, { kind: 'placed' }
    >> = {},
): InboxItem {
    return {
        kind: 'placed',
        id: 'wo-1',
        displayId: 'WO-1',
        flowName: 'Onboarding',
        stateName: 'Review',
        transitionerName: 'Ada',
        claimedByName: 'Ada',
        lastTransitionedAt:
            '2026-04-01T12:00:00.000000Z',
        completed: false,
        position: 1,
        taskInstructions: '',
        ...overrides,
    };
}

const NO_FILTER: InboxFilter = { kind: 'none' };

function capture(
    items: readonly InboxItem[],
    kind: 'available' | 'claimed' | 'archivedByMe',
    filter: InboxFilter,
): string {
    let html = '';
    const container = {
        set innerHTML(value: string) {
            html = value;
        },
    };
    new WorkboxInboxPresenter(items, kind, filter)
        .renderList(
            container as unknown as HTMLElement,
        );
    return html;
}

Deno.test(
    'available empty copy is No work orders'
    + ' available to me',
    () => {
        const out = capture([], 'available', NO_FILTER);
        assertStringIncludes(
            out,
            'No work orders available to me',
        );
        assertEquals(
            out.includes('drag-handle'), false,
        );
    },
);

Deno.test(
    'claimed empty copy is No work orders'
    + ' claimed by me',
    () => {
        assertStringIncludes(
            capture([], 'claimed', NO_FILTER),
            'No work orders claimed by me',
        );
    },
);

Deno.test(
    'archived-by-me empty copy is No work orders'
    + ' archived by me',
    () => {
        assertStringIncludes(
            capture([], 'archivedByMe', NO_FILTER),
            'No work orders archived by me',
        );
    },
);

Deno.test(
    'a placed row has flow, id, state, time,'
    + ' and no grip or claimant',
    () => {
        const out = capture([placed()], 'available', NO_FILTER);
        assertStringIncludes(out, 'Onboarding');
        assertStringIncludes(out, '#WO-1');
        assertStringIncludes(out, 'Review');
        assertStringIncludes(
            out, 'data-work-order-card="wo-1"',
        );
        assertEquals(
            out.includes('drag-handle'), false,
        );
        assertEquals(
            out.includes('In progress'), false,
        );
        assertEquals(out.includes('from Ada'), false);
        assertEquals(
            out.includes('claimed by'), false,
        );
    },
);

Deno.test(
    'an unplaced row is State unknown without'
    + ' a grip or navigation',
    () => {
        const out = capture([{
            kind: 'unplaced',
            id: 'wo-u',
            displayId: 'unplaced-7',
            flowName: 'Test flow',
            transitionerName: 'Demo Test',
            claimedByName: null,
            lastTransitionedAt:
                '2026-04-01T12:00:00.000000Z',
            position: 2,
        }], 'available', NO_FILTER);
        assertStringIncludes(out, 'State unknown');
        assertStringIncludes(out, 'Test flow');
        assertStringIncludes(out, '#unplaced-7');
        assertEquals(
            out.includes('data-work-order-card'),
            false,
        );
        assertEquals(out.includes('href='), false);
        assertEquals(
            out.includes('drag-handle'), false,
        );
        assertEquals(
            out.includes('from Demo Test'), false,
        );
    },
);

Deno.test(
    'workbox index.html is two cards, pills on'
    + ' the right, no subtitle',
    async () => {
        const page = await Deno.readTextFile(
            new URL(
                '../web-app/workbox/index.html',
                import.meta.url,
            ),
        );
        assertStringIncludes(page, 'Workbox');
        assertStringIncludes(
            page,
            'Work Orders available to me',
        );
        assertStringIncludes(
            page,
            'Work Orders claimed by me',
        );
        assertStringIncludes(page, 'Active');
        assertStringIncludes(
            page, 'Archived by Me',
        );
        assertStringIncludes(
            page, 'id="available-list"',
        );
        assertStringIncludes(
            page, 'id="claimed-list"',
        );
        assertStringIncludes(
            page, 'data-inbox-pill="claimed"',
        );
        assertStringIncludes(
            page,
            'data-inbox-pill="archivedByMe"',
        );
        assertEquals(
            page.includes('Your work order inbox'),
            false,
        );
        assertEquals(
            page.includes('workbox-tabs'), false,
        );
        assertEquals(
            page.includes('tab-archive'), false,
        );
        assertEquals(
            page.includes('Archive</'), false,
        );
        assertEquals(
            page.includes('drag-handle'), false,
        );
    },
);

Deno.test(
    'a matched empty list names the search text',
    () => {
        const out = capture([], 'available', {
            kind: 'matched', text: 'zz',
        });
        assertStringIncludes(
            out, 'No work orders match “zz”',
        );
        assertEquals(
            out.includes('No work orders available'),
            false,
        );
    },
);

Deno.test(
    'a matched empty list escapes the search text',
    () => {
        const out = capture([], 'claimed', {
            kind: 'matched', text: '<b>zz</b>',
        });
        assertStringIncludes(out, '&lt;b&gt;zz');
        assertEquals(out.includes('<b>'), false);
    },
);

Deno.test(
    'the workbox search box sits between the title'
    + ' and the create button',
    async () => {
        const page = await Deno.readTextFile(
            new URL(
                '../web-app/workbox/index.html',
                import.meta.url,
            ),
        );
        const wrapper = page.indexOf(
            'class="search-wrapper search-wrapper-wide"',
        );
        const input = /<input[^>]*id="workbox-search"[^>]*>/
            .exec(page);
        assertEquals(input !== null, true);
        assertStringIncludes(
            input![0], 'aria-label="Search work orders"',
        );
        assertEquals(
            wrapper >= 0
                && wrapper < input!.index
                && !page.slice(wrapper, input!.index)
                    .includes('</div>'),
            true,
        );
        const at = (needle: string) => page.indexOf(needle);
        const title = at('class="page-title"');
        const search = at('id="workbox-search"');
        const create = at('id="create-work-order-btn"');
        assertEquals(
            title >= 0 && title < search && search < create,
            true,
        );
    },
);
