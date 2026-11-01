import {
    assert,
    assertEquals,
    assertMatch,
    assertStrictEquals,
    assertStringIncludes,
} from '@std/assert';
import {
    NO_PILL,
    buildWorkboxPills,
    pillFlowNamesOf,
    pressedAmong,
    workboxPillsOf,
    type PressedPill,
} from '../web-app/app/presenters/workbox-pills.ts';
import type {
    InboxItem,
    InboxLists,
} from '../web-app/app/presenters/workbox-inbox.ts';

function item(id: string, flowName: string): InboxItem {
    return {
        kind: 'placed',
        id,
        flowName,
        stateName: 'Review',
        lastTransitionedAt: '2026-04-01T12:00:00.000000Z',
        completed: false,
        taskInstructions: '',
    };
}

// Onboarding: two claimed by me of five; Billing: none of
// one; one work order archived by me, in a flow neither
// inbox list holds.
const LISTS: InboxLists = {
    claimed: [
        item('c-1', 'Onboarding'),
        item('c-2', 'Onboarding'),
    ],
    available: [
        item('a-1', 'Onboarding'),
        item('a-2', 'Billing'),
        item('a-3', 'Onboarding'),
        item('a-4', 'Onboarding'),
    ],
    archivedByMe: [item('r-1', 'Archived Only')],
};

function pillsHtml(pressed: PressedPill): string {
    return buildWorkboxPills(
        workboxPillsOf(pillFlowNamesOf(LISTS), LISTS),
        pressed,
    ).toString();
}

// Each pill button's opening tag, in document order.
function pillTags(out: string): string[] {
    return [...out.matchAll(/<button[^>]*>/g)].map(
        (match) => match[0],
    );
}

Deno.test(
    'the pills run Claimed by Me, Archived by Me, a'
    + ' divider, then flows by name',
    () => {
        assertEquals(
            pillFlowNamesOf(LISTS),
            ['Billing', 'Onboarding'],
        );
        const out = pillsHtml(NO_PILL);
        const at = (needle: string) => out.indexOf(needle);
        assert(at('Claimed by Me') >= 0);
        assert(at('Claimed by Me') < at('Archived by Me'));
        assert(
            at('Archived by Me') < at('header-stat-divider'),
        );
        assert(
            at('header-stat-divider')
                < at('data-flow-name="Billing"'),
        );
        assert(
            at('data-flow-name="Billing"')
                < at('data-flow-name="Onboarding"'),
        );
        assertStrictEquals(pillTags(out).length, 4);
        assertMatch(
            out,
            new RegExp(
                '<span\\s+class="header-stat-divider"'
                + '\\s+aria-hidden="true"></span>',
            ),
        );
    },
);

Deno.test('a flow pill counts claimed of total', () => {
    const pills = workboxPillsOf(
        pillFlowNamesOf(LISTS), LISTS,
    );
    assertEquals(pills.flows, [
        { flowName: 'Billing', claimed: 0, total: 1 },
        { flowName: 'Onboarding', claimed: 2, total: 5 },
    ]);
    const out = pillsHtml(NO_PILL);
    assertStringIncludes(
        out, '<span class="workbox-pill-count">2/5</span>',
    );
    assertStringIncludes(
        out, '<span class="workbox-pill-count">0/1</span>',
    );
});

Deno.test('the by-me pills count their lists', () => {
    const pills = workboxPillsOf([], LISTS);
    assertStrictEquals(pills.claimed, 2);
    assertStrictEquals(pills.archivedByMe, 1);
    const out = pillsHtml(NO_PILL);
    assertStringIncludes(
        out,
        'Claimed by Me <span class="workbox-pill-count">2'
        + '</span>',
    );
    assertStringIncludes(
        out,
        'Archived by Me <span class="workbox-pill-count">1'
        + '</span>',
    );
});

Deno.test(
    'a search\'s answer counts while the full read\'s'
    + ' flows keep their pills',
    () => {
        const answer: InboxLists = {
            claimed: [item('c-1', 'Onboarding')],
            available: [],
            archivedByMe: [],
        };
        const pills = workboxPillsOf(
            pillFlowNamesOf(LISTS), answer,
        );
        assertEquals(pills.flows, [
            { flowName: 'Billing', claimed: 0, total: 0 },
            { flowName: 'Onboarding', claimed: 1, total: 1 },
        ]);
        assertStrictEquals(pills.claimed, 1);
        assertStrictEquals(pills.archivedByMe, 0);
    },
);

Deno.test(
    'each pill\'s name says what its numbers mean',
    () => {
        const out = pillsHtml(NO_PILL);
        assertStringIncludes(
            out, 'aria-label="2 work orders claimed by me"',
        );
        assertStringIncludes(
            out, 'aria-label="1 work order archived by me"',
        );
        assertStringIncludes(
            out, 'aria-label="Onboarding: 2 claimed by me of 5"',
        );
        assertStringIncludes(
            out, 'aria-label="Billing: 0 claimed by me of 1"',
        );
    },
);

Deno.test('with no pill pressed none is dimmed', () => {
    for (const tag of pillTags(pillsHtml(NO_PILL))) {
        assertStringIncludes(tag, 'aria-pressed="false"');
        assertStringIncludes(tag, 'data-dimmed="false"');
        assertStringIncludes(tag, 'badge-secondary');
    }
});

Deno.test('a pressed pill is primary and dims the rest', () => {
    const tags = pillTags(pillsHtml({
        kind: 'flow', flowName: 'Onboarding',
    }));
    const on = tags.filter(
        (tag) => tag.includes('aria-pressed="true"'),
    );
    assertStrictEquals(on.length, 1);
    assertStringIncludes(on[0]!, 'data-flow-name="Onboarding"');
    assertStringIncludes(on[0]!, 'badge-primary');
    assertStringIncludes(on[0]!, 'data-dimmed="false"');
    for (const tag of tags.filter((tag) => tag !== on[0])) {
        assertStringIncludes(tag, 'aria-pressed="false"');
        assertStringIncludes(tag, 'data-dimmed="true"');
        assertStringIncludes(tag, 'badge-secondary');
    }
});

Deno.test('pressing Claimed by Me presses only it', () => {
    const on = pillTags(pillsHtml({ kind: 'claimed' })).filter(
        (tag) => tag.includes('aria-pressed="true"'),
    );
    assertStrictEquals(on.length, 1);
    assertStringIncludes(on[0]!, 'data-workbox-pill="claimed"');
});

Deno.test(
    'a pressed flow pill whose flow is gone is un-pressed',
    () => {
        assertEquals(
            pressedAmong(
                { kind: 'flow', flowName: 'Gone' }, ['Billing'],
            ),
            NO_PILL,
        );
        assertEquals(
            pressedAmong(
                { kind: 'flow', flowName: 'Billing' },
                ['Billing'],
            ),
            { kind: 'flow', flowName: 'Billing' },
        );
        assertEquals(
            pressedAmong({ kind: 'claimed' }, []),
            { kind: 'claimed' },
        );
    },
);

Deno.test('a flow name is escaped', () => {
    const lists: InboxLists = {
        claimed: [],
        available: [item('a-1', '<b>R&D</b>')],
        archivedByMe: [],
    };
    const out = buildWorkboxPills(
        workboxPillsOf(pillFlowNamesOf(lists), lists),
        NO_PILL,
    ).toString();
    assertStringIncludes(
        out, 'data-flow-name="&lt;b&gt;R&amp;D&lt;/b&gt;"',
    );
    assert(!out.includes('<b>'));
});
