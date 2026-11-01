import { assertEquals, assertStrictEquals } from '@std/assert';
import {
    nextWorkOrder,
    stepIsMine,
} from '../web-app/app/workbox-next.ts';
import {
    inboxSectionsOf,
    type InboxItem,
    type InboxLists,
    type InboxSection,
} from '../web-app/app/presenters/workbox-inbox.ts';
import { NO_PILL } from
    '../web-app/app/presenters/workbox-pills.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    type GraphNode,
    type WorkOrderFlowGraph,
} from '../shared/types.ts';

const ME = 'XXZruirZyAOoRpNxaDnpSA';
const OTHER = 'MQFcPtrZPIGjMCRAXtZUnA';

function node(
    id: string,
    overrides: Partial<GraphNode>,
): GraphNode {
    return {
        id,
        name: id,
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

const GRAPH: WorkOrderFlowGraph = {
    name: 'Onboarding',
    lockTimeout: DEFAULT_LOCK_TIMEOUT,
    nodes: [
        node('mine', { memberIds: [OTHER, ME] }),
        node('theirs', { memberIds: [OTHER] }),
        node('done', { isArchive: true, memberIds: [ME] }),
    ],
    edges: [],
};

function at(nodeId: string) {
    return { flowGraph: GRAPH, nodeId };
}

function placed(id: string, flowName: string): InboxItem {
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

function unplaced(id: string): InboxItem {
    return {
        kind: 'unplaced',
        id,
        flowName: 'Onboarding',
        lastTransitionedAt: '2026-04-01T12:00:00.000000Z',
    };
}

function drawn(
    claimed: InboxItem[],
    available: InboxItem[],
): InboxSection[] {
    return [
        { kind: 'claimed', items: claimed },
        { kind: 'available', items: available },
    ];
}

const LISTS: InboxLists = {
    claimed: [
        placed('c-1', 'Billing'),
        placed('c-2', 'Onboarding'),
    ],
    available: [
        placed('a-1', 'Billing'),
        placed('a-2', 'Onboarding'),
    ],
    archivedByMe: [placed('r-1', 'Onboarding')],
};

Deno.test('a step whose roster lists me is mine', () => {
    assertStrictEquals(stepIsMine(at('mine'), ME), true);
});

Deno.test('a step whose roster leaves me out is not mine', () => {
    assertStrictEquals(stepIsMine(at('theirs'), ME), false);
});

Deno.test('an archive node is never mine', () => {
    assertStrictEquals(stepIsMine(at('done'), ME), false);
});

Deno.test('a node the graph no longer holds is not mine', () => {
    assertStrictEquals(stepIsMine(at('gone'), ME), false);
});

Deno.test('the topmost claimed row opens next', () => {
    assertEquals(
        nextWorkOrder(inboxSectionsOf(LISTS, NO_PILL), 'sent'),
        { kind: 'open', id: 'c-1' },
    );
});

Deno.test(
    'with no claimed row the topmost available opens',
    () => {
        assertEquals(
            nextWorkOrder(
                drawn([], [placed('a-1', 'Billing')]), 'sent',
            ),
            { kind: 'open', id: 'a-1' },
        );
    },
);

Deno.test('the work order sent on never opens', () => {
    assertEquals(
        nextWorkOrder(
            drawn(
                [placed('sent', 'Billing')],
                [placed('a-1', 'Billing')],
            ),
            'sent',
        ),
        { kind: 'open', id: 'a-1' },
    );
    assertEquals(
        nextWorkOrder(drawn([], [placed('sent', 'Billing')]), 'sent'),
        { kind: 'close' },
    );
});

Deno.test('a row that cannot be opened is passed over', () => {
    assertEquals(
        nextWorkOrder(
            drawn([unplaced('u-1'), placed('c-2', 'Billing')], []),
            'sent',
        ),
        { kind: 'open', id: 'c-2' },
    );
});

Deno.test('with no row to open the box closes', () => {
    assertEquals(
        nextWorkOrder(drawn([], []), 'sent'),
        { kind: 'close' },
    );
});

Deno.test('under a flow pill its flow\'s first row opens', () => {
    assertEquals(
        nextWorkOrder(
            inboxSectionsOf(LISTS, {
                kind: 'flow', flowName: 'Onboarding',
            }),
            'sent',
        ),
        { kind: 'open', id: 'c-2' },
    );
});

Deno.test(
    'under Claimed by Me there is no available row to fall'
    + ' back to',
    () => {
        const lists: InboxLists = {
            claimed: [],
            available: [placed('a-1', 'Billing')],
            archivedByMe: [],
        };
        assertEquals(
            nextWorkOrder(
                inboxSectionsOf(lists, { kind: 'claimed' }),
                'sent',
            ),
            { kind: 'close' },
        );
    },
);

Deno.test(
    'under Archived by Me neither list is drawn, so the box'
    + ' closes',
    () => {
        assertEquals(
            nextWorkOrder(
                inboxSectionsOf(LISTS, { kind: 'archivedByMe' }),
                'sent',
            ),
            { kind: 'close' },
        );
    },
);
