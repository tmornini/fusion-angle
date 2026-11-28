import {
    assert,
    assertEquals,
    assertMatch,
    assertStringIncludes,
} from '@std/assert';
import {
    buildInboxLists,
    inboxSectionsOf,
    waitLevelOf,
    type InboxFilter,
    type InboxItem,
    type InboxListKind,
    type InboxLists,
} from
    '../web-app/app/presenters/workbox-inbox.ts';
import {
    NO_PILL,
    type PressedPill,
} from '../web-app/app/presenters/workbox-pills.ts';
import { buildPageUrl } from '../web-app/app/navigation.ts';
import { escapeForHtml } from '../web-app/app/safe-html.ts';

function placed(
    overrides: Partial<Extract<
        InboxItem, { kind: 'placed' }
    >> = {},
): InboxItem {
    return {
        kind: 'placed',
        id: 'wo-1',
        flowName: 'Onboarding',
        stateName: 'Review',
        transitionerName: 'Ada',
        claimedByName: 'Ada',
        lastTransitionedAt:
            '2026-04-01T12:00:00.000000Z',
        completed: false,
        taskInstructions: '',
        ...overrides,
    };
}

const NO_FILTER: InboxFilter = { kind: 'none' };

// One headed list, as the left box draws it with no pill
// pressed.
function capture(
    items: readonly InboxItem[],
    kind: InboxListKind,
    filter: InboxFilter,
): string {
    return buildInboxLists(
        [{ kind, items }], filter, NO_PILL,
    ).toString();
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
        assertMatch(
            out,
            /Work order <code class="displayed-id">wo-1<\/code>/,
        );
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
            flowName: 'Test flow',
            transitionerName: 'Demo Test',
            claimedByName: null,
            lastTransitionedAt:
                '2026-04-01T12:00:00.000000Z',
        }], 'available', NO_FILTER);
        assertStringIncludes(out, 'State unknown');
        assertStringIncludes(out, 'Test flow');
        assertMatch(
            out,
            /Work order <code class="displayed-id">wo-u<\/code>/,
        );
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
    'workbox index.html holds the pills, the lists, and'
    + ' the box, no subtitle',
    async () => {
        const page = await Deno.readTextFile(
            new URL(
                '../web-app/workbox/index.html',
                import.meta.url,
            ),
        );
        assertStringIncludes(page, 'Workbox');
        const pills = /<div\s+id="workbox-pills"[^>]*>/
            .exec(page);
        assertEquals(pills !== null, true);
        assertStringIncludes(pills![0], 'role="group"');
        assertStringIncludes(
            pills![0], 'aria-label="Filter work orders"',
        );
        const box = /<section\s+id="work-order-box"[^>]*>/
            .exec(page);
        assertEquals(box !== null, true);
        assertStringIncludes(box![0], 'aria-label="Work order"');
        const at = (needle: string) => page.indexOf(needle);
        assertEquals(
            at('id="workbox-pills"') >= 0
                && at('id="workbox-pills"')
                    < at('id="work-order-lists"')
                && at('id="work-order-lists"')
                    < at('id="work-order-box"'),
            true,
        );
        for (const retired of [
            'data-inbox-pill', 'Active</',
            'Your work order inbox', 'workbox-tabs',
            'tab-archive', 'Archive</', 'drag-handle',
        ]) {
            assertEquals(page.includes(retired), false, retired);
        }
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

const LISTS: InboxLists = {
    claimed: [
        placed({ id: 'c-1', flowName: 'Onboarding' }),
        placed({ id: 'c-2', flowName: 'Billing' }),
    ],
    available: [
        placed({ id: 'a-1', flowName: 'Billing' }),
        placed({ id: 'a-2', flowName: 'Onboarding' }),
    ],
    archivedByMe: [placed({ id: 'r-1', completed: true })],
};

const NO_LISTS: InboxLists = {
    claimed: [],
    available: [],
    archivedByMe: [],
};

// Each section as `kind:id,id`, in drawing order.
function sectionsDrawn(pressed: PressedPill): string[] {
    return inboxSectionsOf(LISTS, pressed).map(
        (section) => section.kind + ':'
            + section.items.map((i) => i.id).join(','),
    );
}

function listsHtml(
    lists: InboxLists,
    filter: InboxFilter,
    pressed: PressedPill,
): string {
    return buildInboxLists(
        inboxSectionsOf(lists, pressed), filter, pressed,
    ).toString();
}

Deno.test(
    'with no pill pressed claimed draws above available',
    () => {
        assertEquals(sectionsDrawn(NO_PILL), [
            'claimed:c-1,c-2', 'available:a-1,a-2',
        ]);
        const out = listsHtml(LISTS, NO_FILTER, NO_PILL);
        const claimed = out.indexOf('Work Orders claimed by me');
        const available = out.indexOf(
            'Work Orders available to me',
        );
        assert(claimed >= 0 && claimed < available);
        assert(
            out.indexOf('id="claimed-list"')
                < out.indexOf('id="available-list"'),
        );
    },
);

Deno.test('Claimed by Me draws only the claimed list', () => {
    assertEquals(
        sectionsDrawn({ kind: 'claimed' }),
        ['claimed:c-1,c-2'],
    );
});

Deno.test(
    'Archived by Me draws one list in place of the two',
    () => {
        assertEquals(
            sectionsDrawn({ kind: 'archivedByMe' }),
            ['archivedByMe:r-1'],
        );
        const out = listsHtml(
            LISTS, NO_FILTER, { kind: 'archivedByMe' },
        );
        assertStringIncludes(out, 'Work Orders archived by me');
        assertStringIncludes(out, 'id="archived-list"');
        assertEquals(
            out.includes('Work Orders available to me'), false,
        );
        assertEquals(
            out.includes('Work Orders claimed by me'), false,
        );
    },
);

Deno.test('a heading counts the rows it draws', () => {
    const out = listsHtml({
        claimed: [],
        available: [
            placed({ id: 'a-1' }), placed({ id: 'a-2' }),
        ],
        archivedByMe: [],
    }, NO_FILTER, NO_PILL);
    assertMatch(
        out, /Work Orders claimed by me <span[^>]*>0</,
    );
    assertMatch(
        out, /Work Orders available to me <span[^>]*>2</,
    );
});

Deno.test('a flow pill narrows both lists to its flow', () => {
    assertEquals(
        sectionsDrawn({ kind: 'flow', flowName: 'Billing' }),
        ['claimed:c-2', 'available:a-1'],
    );
});

Deno.test('each list keeps its heading when empty', () => {
    const out = listsHtml(NO_LISTS, NO_FILTER, NO_PILL);
    assertStringIncludes(out, 'Work Orders claimed by me');
    assertStringIncludes(out, 'No work orders claimed by me');
    assertStringIncludes(out, 'Work Orders available to me');
    assertStringIncludes(out, 'No work orders available to me');
});

Deno.test(
    'an empty list under a flow pill names the flow',
    () => {
        const pressed: PressedPill = {
            kind: 'flow', flowName: 'Billing',
        };
        const lists: InboxLists = {
            claimed: [],
            available: [placed({ flowName: 'Billing' })],
            archivedByMe: [],
        };
        const out = listsHtml(lists, NO_FILTER, pressed);
        assertStringIncludes(
            out, 'No work orders claimed by me in Billing',
        );
        assertEquals(
            out.includes('No work orders available to me'),
            false,
        );
    },
);

Deno.test(
    'a search\'s empty line wins over the flow',
    () => {
        const pressed: PressedPill = {
            kind: 'flow', flowName: 'Billing',
        };
        const out = listsHtml(
            NO_LISTS, { kind: 'matched', text: 'zz' }, pressed,
        );
        assertStringIncludes(out, 'No work orders match “zz”');
        assertEquals(out.includes(' in Billing'), false);
    },
);

Deno.test('a row\'s title links to the workbox with its id', () => {
    const out = buildInboxLists(
        [{ kind: 'available', items: [placed()] }],
        NO_FILTER,
        NO_PILL,
    ).toString();
    assertStringIncludes(
        out,
        'href="' + escapeForHtml(
            buildPageUrl('workbox', { id: 'wo-1' }),
        ) + '"',
    );
    assertEquals(out.includes('detail.html'), false);
});

Deno.test('a row carries no position', () => {
    assertEquals(
        capture([placed()], 'available', NO_FILTER)
            .includes('data-position'),
        false,
    );
});

const NOW_MS = Date.parse('2026-05-01T12:00:00.000000Z');

function daysBefore(days: number): string {
    return new Date(NOW_MS - days * 86_400_000).toISOString();
}

Deno.test('a row waits from 14 days and is late from 30',
() => {
    assertEquals(
        [0, 13, 14, 29, 30, 90].map(
            (days) => waitLevelOf(daysBefore(days), NOW_MS),
        ),
        ['none', 'none', 'soon', 'soon', 'late', 'late'],
    );
    assertEquals(waitLevelOf(null, NOW_MS), 'none');
});

Deno.test('a stalled open row is marked and a completed one'
+ ' is not', () => {
    const old = '2026-01-01T00:00:00.000000Z';
    const open = capture(
        [placed({ lastTransitionedAt: old })],
        'available', NO_FILTER,
    );
    assertStringIncludes(open, 'data-wait="late"');
    const done = capture(
        [placed({
            lastTransitionedAt: old, completed: true,
        })],
        'archivedByMe', NO_FILTER,
    );
    assertStringIncludes(done, 'data-wait="none"');
});

function daysAgo(days: number): string {
    return new Date(Date.now() - days * 86_400_000)
        .toISOString();
}

function waitingLists(): InboxLists {
    return {
        claimed: [placed({
            id: 'c-1', lastTransitionedAt: daysAgo(40),
        })],
        available: [
            placed({ id: 'a-40', lastTransitionedAt: daysAgo(40) }),
            placed({ id: 'a-20', lastTransitionedAt: daysAgo(20) }),
            placed({ id: 'a-2', lastTransitionedAt: daysAgo(2) }),
        ],
        archivedByMe: [],
    };
}

// The legend keys and rows in the order they are drawn.
function drawn(out: string): string[] {
    return [...out.matchAll(
        /data-legend="(\w+)"|data-work-order-card="([\w-]+)"/g,
    )].map(([, key, id]) => key ?? id!);
}

Deno.test('one legend above the lists explains the row'
+ ' tints', () => {
    const out = listsHtml(waitingLists(), NO_FILTER, NO_PILL);
    assertEquals(drawn(out), [
        'late', 'soon', 'c-1', 'a-40', 'a-20', 'a-2',
    ]);
    assertStringIncludes(out, 'Waiting 30+ days');
    assertStringIncludes(out, 'Waiting 14–29 days');
    assertEquals(out.includes('Needs you'), false);
});

Deno.test('the legend stays when no row is waiting', () => {
    const lists = waitingLists();
    const out = listsHtml(
        { ...lists, claimed: [], available: [lists.available[2]!] },
        NO_FILTER, NO_PILL,
    );
    assertEquals(drawn(out), ['late', 'soon', 'a-2']);
});

Deno.test('a search keeps its order under the legend', () => {
    const out = listsHtml(
        waitingLists(),
        { kind: 'matched', text: 'zz' }, NO_PILL,
    );
    assertEquals(drawn(out), [
        'late', 'soon', 'c-1', 'a-40', 'a-20', 'a-2',
    ]);
});

