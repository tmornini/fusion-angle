import {
    assertEquals,
    assertStringIncludes,
} from '@std/assert';
import {
    WorkboxInboxPresenter,
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

function capture(
    items: readonly InboxItem[],
    kind: 'available' | 'claimed' | 'archivedByMe'
        = 'available',
): string {
    let html = '';
    const container = {
        set innerHTML(value: string) {
            html = value;
        },
    };
    new WorkboxInboxPresenter(items, kind)
        .renderList(
            container as unknown as HTMLElement,
        );
    return html;
}

Deno.test(
    'available empty copy is No work orders'
    + ' available to me',
    () => {
        const out = capture([], 'available');
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
            capture([], 'claimed'),
            'No work orders claimed by me',
        );
    },
);

Deno.test(
    'archived-by-me empty copy is No work orders'
    + ' archived by me',
    () => {
        assertStringIncludes(
            capture([], 'archivedByMe'),
            'No work orders archived by me',
        );
    },
);

Deno.test(
    'a placed row has flow, id, state, time,'
    + ' and no grip or claimant',
    () => {
        const out = capture([placed()]);
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
        }]);
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
