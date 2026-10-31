# Workbox Claim-Drag Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Turn `workbox/index.html` into a personal two-card
inbox where dragging a row claims or releases it, and opening
a row inspects without claiming.

**Architecture:** `buildInboxItems` takes the current member
id and returns three lists. `WorkboxInboxPresenter` paints
one list. `classifyInboxDrop` and `transferInboxDrop` in
`workbox-inbox-drag.ts` own the five drop cases and the
claim/release/position verbs. The page owns two cards, the
right-card pills, hash `#archived`, optimistic paint, and
toasts. The action screen stops claiming on load and drops
bind and release chrome.

**Tech Stack:** Deno, TypeScript, `@std/assert`, `./test`
and `./test validate`. No pytest, node, or npm.

---

## Worktree

Implement on branch `ui-refinement` in
`/Users/tmornini/code/fusion-angle/.worktrees/ui-refinement`.
Do not create a worktree. Do not merge, rebase, or touch
master. Every commit below stays on `ui-refinement`.

Run every command from that directory. `./test` runs the
whole memory suite. It takes no file filter. `./test
validate` is `deno check`, that suite, the 78-character
lint, the schema check, and the API-docs check. A green
commit step is `./test validate` exiting 0.

Later execution uses superpowers:subagent-driven-development
on this same worktree: one committing implementer per task,
serial commits, spec review then code-quality review. The
controller writes no product code. Subagents start with
`Go to Medium Church!`, inherit no isolation, never create
worktrees, and never run `./deploy`, `./bin/build`,
`./bin/measure`, seed, or wipe.

## File map

- `web-app/app/presenters/workbox-inbox.ts` —
  `InboxListKind`, `InboxLists`, `buildInboxItems`,
  presenter (one list, no grip, empty copy).
- `web-app/app/presenters/index.ts` — export the new types;
  drop `InboxMode`.
- `web-app/app/workbox-inbox-drag.ts` — `classifyInboxDrop`,
  `inboxListKindFromHash`, `transferInboxDrop`,
  `initInboxDrag`.
- `web-app/app/drag-reorder-positions.ts` — unchanged;
  coordinator calls `dropIndex` and `computeNewPosition`.
- `web-app/app/drag-reorder.ts` — leave in place for other
  callers. Do not teach it claim verbs.
- `web-app/app/workbox-inbox-rows.ts` — still reads heads
  into `workOrders` and `activeClaimsByWo`.
- `web-app/workbox/index.html` — two cards, pills, no
  subtitle, no page tabs.
- `web-app/workbox/index.ts` — member id, two lists, pills,
  hash, drag coordinator, toasts.
- `web-app/workbox/detail.ts` — no `putWorkOrderClaim` on
  load; no bind picker; no release button wiring.
- `web-app/app/presenters/workbox-detail.ts` — no bind
  button/dialog, no `#unclaim-btn`, no bind-prompt copy;
  unclaimed fields and transitions `disabled`.
- `web-app/app/styles/pages-workbox.css` — inbox drop
  indicator and dragging classes; drop bind-dialog
  rules.
- `ARCHITECTURE.md` — workbox visibility paragraph.
- `TEST-PLAN.md` — WB1–WB3, WB10a–WB13a, WB14–WB15,
  WB18, WB20–WB23.
- `tests/workbox-inbox.test.ts` — splitter and sort.
- `tests/presenter-workbox-inbox.test.ts` — cards, pills,
  headlines, empty copy, no grip, no subtitle.
- `tests/workbox-inbox-drag.test.ts` — five drop cases,
  hash, transfer helper.
- `tests/presenter-workbox-detail.test.ts` — action-screen
  chrome.
- `tests/browser/workbox-transition.test.ts` — no bind, no
  `#unclaim-btn`; two-card chrome.

## Spec notes

- POST work-orders still writes the three birth events,
  including `claimed`. Files do not list `api/` or
  `client/work-orders-mutations.ts`. Non-goals include
  changing claim HTTP. After Create, the operator already
  holds that birth claim, so the action screen is the
  claimed-by-me view. Opening never claims. The unclaimed
  action-screen chrome is for heads with no live claim by
  this member.
- Claimed-by-me fields enable even when unbound. Bind is
  gone and bind-at-creation is later work. Unclaimed and
  lapsed fields stay `disabled` and still show values.
- Live reorder toast is `Failed to save order`. The spec's
  `Couldn't save the new order` is not in the tree. Use
  `Failed to save order` for failed release, position, 412,
  and network. 409 uses `Someone else holds that work
  order`.
- Right-card switcher is DESIGN-SYSTEM.md's segmented
  control (`btn btn-secondary btn-sm`, `aria-pressed`,
  `role="group"`). Spec "pills" is the pair Active |
  Archived by Me.
- Hash `#archived` selects Archived by Me. Any other hash,
  including `#active` and empty, selects Active.
- `grant` is a verb. Prose names a person "organization
  admin" or "operator".

---

### Task 1: Split inbox lists

**Files:**
- Modify: `tests/workbox-inbox.test.ts`
- Modify: `web-app/app/presenters/workbox-inbox.ts`
- Modify: `web-app/app/presenters/index.ts`
- Modify: `web-app/workbox/index.ts`
- Test: `tests/workbox-inbox.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace `tests/workbox-inbox.test.ts`. Keep the fixture
block (`buildNode` through `setupOneWorkOrder`) unchanged
except the `buildInboxItems` import. Change the import to:

```ts
import {
    buildInboxItems,
    WorkboxInboxPresenter,
    type InboxLists,
} from
    '../web-app/app/presenters/workbox-inbox.ts';
```

Add this helper after `setupOneWorkOrder`:

```ts
const DEMO = 'XXZruirZyAOoRpNxaDnpSA';

function listsOf(
    workOrders: readonly WorkOrder[],
    claims: ReadonlyMap<string, { memberId: string; at: string }>,
    memberId: string,
): InboxLists {
    return buildInboxItems(
        workOrders, claims, memberId,
    );
}

function ids(
    items: readonly { id: string }[],
): string[] {
    return items.map(i => i.id);
}
```

Add `WorkOrder` to the import from `../client/index.ts`
(alongside `getWorkOrders`, `putWorkOrderPosition`).

Replace every test after `// -- Tests` with:

```ts
Deno.test(
    'buildInboxItems returns three empty lists'
    + ' when there are no work orders',
    () => {
        const lists = buildInboxItems(
            [], new Map(), DEMO,
        );
        assertEquals(lists.available, []);
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test(
    'an unclaimed active work order is available',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const {
            workOrders, memberMap,
        } = await tables();
        const lists = listsOf(
            workOrders, new Map(), DEMO,
        );
        assertStrictEquals(
            lists.available.length, 1,
        );
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
        const item = lists.available[0]!;
        assert(item.kind === 'placed');
        assertStrictEquals(
            item.flowName, 'Test flow',
        );
        assertStrictEquals(
            item.stateName, 'Doing work',
        );
        assertStrictEquals(item.completed, false);
        assertNotStrictEquals(item.displayId, '');
        assertStrictEquals(
            typeof item.lastTransitionedAt,
            'string',
        );
        assertEquals(memberMap.size > 0, true);
    },
);

Deno.test(
    'this member\'s live claim is claimed',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        assertStrictEquals(
            t.activeClaimsByWo.size, 1,
        );
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), [woId]);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'another member\'s live claim is omitted',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const otherId = generateIdentifier();
        await seedHumanMember(
            db, otherId, 'Other Member',
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const other = inPageContext(
            db, await organizationToken(otherId),
        );
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(other, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'this member\'s archive transition is'
    + ' archived-by-me',
    async () => {
        const { ctx, woId, tables } =
            await setupOneWorkOrder();
        const read = await ctx.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId,
        );
        await ctx.POST(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId
            + '/transition', {
                transitionEventId: 'extra',
                targetState: N_FINISH,
                release: null,
                transitionAt:
                    '2030-01-01T00:00:00.000000Z',
            },
            [read],
        );
        const t = await tables();
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), [woId]);
        assert(lists.archivedByMe[0]!.kind === 'placed');
        assertStrictEquals(
            lists.archivedByMe[0]!.completed, true,
        );
    },
);

Deno.test(
    'another member\'s archive is omitted',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const otherId = generateIdentifier();
        await seedHumanMember(
            db, otherId, 'Other Member',
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const other = inPageContext(
            db, await organizationToken(otherId),
        );
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(other, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const read = await other.GET(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId,
        );
        await other.POST(
            'organizations/AjdvjuECVZEgZoFajaIEkg'
            + '/work-orders/' + woId
            + '/transition', {
                transitionEventId: 'extra',
                targetState: N_FINISH,
                release: null,
                transitionAt:
                    '2030-01-01T00:00:00.000000Z',
            },
            [read],
        );
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.available), []);
        assertEquals(ids(lists.claimed), []);
        assertEquals(ids(lists.archivedByMe), []);
    },
);

Deno.test(
    'an unplaced unclaimed head is available',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const placed = t.workOrders.find(
            w => w.id === woId,
        )!;
        const unplaced = {
            ...placed,
            id: generateIdentifier(),
            displayId: 'unplaced-7',
            nodeId: generateIdentifier(),
            position: placed.position + 1,
            claim: { state: 'unclaimed' as const },
        };
        const lists = listsOf(
            [placed, unplaced],
            new Map(),
            DEMO,
        );
        assertEquals(
            lists.available.map(i => [i.id, i.kind]),
            [
                [placed.id, 'placed'],
                [unplaced.id, 'unplaced'],
            ],
        );
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test(
    'available sorts by transition.at ascending',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const first = generateIdentifier();
        const second = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: first,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: second,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assertEquals(ids(lists.available), [
            first, second,
        ]);
    },
);

Deno.test(
    'claimed sorts by position',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        for (let i = 0; i < 3; i++) {
            await createWorkOrderFromFlow(ctx, {
                workOrderId: generateIdentifier(),
                flowLinkId: generateIdentifier(),
                flowId: 'ZOousbbnzpqlxJExVAruYQ',
            });
        }
        const created = await getWorkOrders(ctx);
        const explicit = [7.5, 2.5, 5];
        for (let i = 0; i < created.length; i++) {
            await putWorkOrderPosition(
                ctx, created[i]!, explicit[i]!,
            );
        }
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(
            lists.claimed.map(i => i.position),
            [2.5, 5, 7.5],
        );
    },
);

Deno.test(
    'archived-by-me sorts by transition.at'
    + ' descending',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const older = generateIdentifier();
        const newer = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: older,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: newer,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        async function finish(
            id: string, at: string,
        ): Promise<void> {
            const read = await ctx.GET(
                'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/work-orders/' + id,
            );
            await ctx.POST(
                'organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/work-orders/' + id
                + '/transition', {
                    transitionEventId: generateIdentifier(),
                    targetState: N_FINISH,
                    release: null,
                    transitionAt: at,
                },
                [read],
            );
        }
        await finish(
            older, '2030-01-01T00:00:00.000000Z',
        );
        await finish(
            newer, '2031-01-01T00:00:00.000000Z',
        );
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(ids(lists.archivedByMe), [
            newer, older,
        ]);
    },
);

Deno.test(
    'buildInboxItems carries the current'
    + " node's task instructions",
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(db, 'ZOousbbnzpqlxJExVAruYQ', {
            nodes: [
                buildNode(N_START, 'Start', {
                    isCreate: true,
                }),
                buildNode(N_MIDDLE, 'Doing work', {
                    memberIds: [DEMO],
                    taskInstructions:
                        '# Verify totals',
                }),
                buildNode(N_FINISH, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    'YiJPbufDpkyrZcZCYbUJpg',
                    N_START, N_MIDDLE,
                ),
                buildEdge(E2, N_MIDDLE, N_FINISH),
            ],
        });
        await createWorkOrderFromFlow(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assert(lists.available[0]!.kind === 'placed');
        assertStrictEquals(
            lists.available[0]!.taskInstructions,
            '# Verify totals',
        );
    },
);

Deno.test(
    'buildInboxItems leaves taskInstructions'
    + ' empty when the node has none',
    async () => {
        const { tables } =
            await setupOneWorkOrder();
        const t = await tables();
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assert(lists.available[0]!.kind === 'placed');
        assertStrictEquals(
            lists.available[0]!.taskInstructions, '',
        );
    },
);

Deno.test(
    'buildInboxItems keeps deriving after an'
    + ' edge delete and undo restore the graph',
    async () => {
        const { ctx, tables } =
            await setupOneWorkOrder();
        const graph = buildLinearGraph();
        await putFlow(
            ctx, 'ZOousbbnzpqlxJExVAruYQ',
            {
                name: 'Test flow',
                isLocked: false,
                isAutoLayout: true,
                isAutoFit: true,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: graph.nodes,
                edges: graph.edges.filter(
                    e => e.id !== E2,
                ),
            },
        );
        const undoHead = await ctx.GET<unknown>(
            organizationItem(
                ctx, 'flows',
                'ZOousbbnzpqlxJExVAruYQ',
            ),
        );
        await ctx.POST(
            organizationItem(
                ctx, 'flows',
                'ZOousbbnzpqlxJExVAruYQ',
            ) + '/undo',
            {
                eventId: generateIdentifier(),
                at: nowUtc(),
            },
            [undoHead],
        );
        await createWorkOrderFromFlow(ctx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await tables();
        assertStrictEquals(t.workOrders.length, 2);
        const lists = listsOf(
            t.workOrders, new Map(), DEMO,
        );
        assertStrictEquals(
            lists.available.length, 2,
        );
    },
);

Deno.test(
    'a former member\'s live claim is omitted'
    + ' and derivation does not throw (WB3)',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const leaverId = generateIdentifier();
        await seedHumanMember(
            db, leaverId, 'Lisa Leaver',
        );
        const flowId = generateIdentifier();
        await seedFlow(db, flowId, {
            nodes: [
                buildNode(N_START, 'Start', {
                    isCreate: true,
                }),
                buildNode(N_MIDDLE, 'Doing work', {
                    memberIds: [leaverId],
                }),
                buildNode(N_FINISH, 'Done', {
                    isArchive: true,
                }),
            ],
            edges: [
                buildEdge(
                    generateIdentifier(),
                    N_START, N_MIDDLE,
                ),
                buildEdge(E2, N_MIDDLE, N_FINISH),
            ],
        });
        const leaverCtx = inPageContext(
            db, await organizationToken(leaverId),
        );
        await createWorkOrderFromFlow(leaverCtx, {
            workOrderId: generateIdentifier(),
            flowLinkId: generateIdentifier(),
            flowId,
        });
        const admin = inPageContext(
            db, await organizationToken(),
        );
        const leaver = await getHumanMember(
            admin, leaverId,
        );
        assert(leaver !== null);
        await postMembershipRemoval(admin, leaver);
        const t = await collectTables(db);
        const lists = listsOf(
            t.workOrders,
            t.activeClaimsByWo,
            DEMO,
        );
        assertEquals(lists.available, []);
        assertEquals(lists.claimed, []);
        assertEquals(lists.archivedByMe, []);
    },
);

Deno.test('the inbox reads heads only', async () => {
    const { db } = await setupOneWorkOrder();
    const { ctx, sent } = recordedContext(
        db, await organizationToken(),
    );
    await getInboxRows(ctx);
    assertEquals(
        sent.filter((request) =>
            /\/work-orders\/[^/]+\//.test(request.path)),
        [],
    );
});

Deno.test(
    'an inbox item names the head\'s node and'
    + ' last transition time',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const wo = t.workOrders.find(
            w => w.id === woId,
        )!;
        const lists = listsOf(
            [wo], t.activeClaimsByWo, DEMO,
        );
        const item = lists.claimed[0]!;
        const node = wo.flowGraph.nodes.find(
            n => n.id === wo.nodeId,
        )!;
        assert(item.kind === 'placed');
        assertStrictEquals(item.stateName, node.name);
        assertStrictEquals(
            item.lastTransitionedAt, wo.transition.at,
        );
    },
);

Deno.test(
    'a lapsed claim is available, not claimed',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        await seedHumanMember(db, DEMO, 'Demo Test');
        const ctx = inPageContext(
            db, await organizationToken(),
        );
        await seedFlow(
            db, 'ZOousbbnzpqlxJExVAruYQ',
            buildLinearGraph(),
        );
        const graph = buildLinearGraph();
        await putFlow(ctx, 'ZOousbbnzpqlxJExVAruYQ', {
            name: 'Test flow',
            isLocked: false,
            isAutoLayout: true,
            isAutoFit: true,
            lockTimeout: 0,
            nodes: graph.nodes,
            edges: graph.edges,
        });
        const woId = generateIdentifier();
        await createWorkOrderFromFlow(ctx, {
            workOrderId: woId,
            flowLinkId: generateIdentifier(),
            flowId: 'ZOousbbnzpqlxJExVAruYQ',
        });
        const t = await getInboxRows(ctx);
        const wo = t.workOrders.find(
            w => w.id === woId,
        )!;
        assertStrictEquals(wo.claim.state, 'claimed');
        assertEquals(
            t.activeClaimsByWo.has(woId), false,
        );
        const lists = listsOf(
            [wo], t.activeClaimsByWo, DEMO,
        );
        assertEquals(ids(lists.available), [woId]);
        assertEquals(ids(lists.claimed), []);
    },
);

Deno.test(
    'an unplaced head renders as a degraded row'
    + ' and the inbox still renders',
    async () => {
        const { tables, woId } =
            await setupOneWorkOrder();
        const t = await tables();
        const placed = t.workOrders.find(
            w => w.id === woId,
        )!;
        const unplaced = {
            ...placed,
            id: generateIdentifier(),
            displayId: 'unplaced-7',
            nodeId: generateIdentifier(),
            position: placed.position + 1,
            claim: { state: 'unclaimed' as const },
        };
        const lists = listsOf(
            [placed, unplaced],
            new Map(),
            DEMO,
        );
        const items = [
            ...lists.available,
            ...lists.claimed,
        ];
        let captured = '';
        const container = {
            set innerHTML(value: string) {
                captured = value;
            },
        };
        new WorkboxInboxPresenter(items, true)
            .renderList(
                container as unknown as HTMLElement,
            );
        const [, firstRow, secondRow] =
            captured.split('class="card p-4');
        assert(firstRow !== undefined);
        assert(secondRow !== undefined);
        const placedRow = firstRow.includes(
            'data-work-order-card="' + placed.id + '"',
        ) ? firstRow : secondRow;
        const unplacedRow = placedRow === firstRow
            ? secondRow : firstRow;
        for (const present of [
            'data-work-order-card="' + placed.id + '"',
            'href=', 'drag-handle', 'cursor-pointer',
            'Doing work',
        ]) {
            assertStringIncludes(placedRow, present);
        }
        for (const present of [
            'class="badge badge-warning"',
            'State unknown', 'Test flow',
            '#unplaced-7',
        ]) {
            assertStringIncludes(unplacedRow, present);
        }
        for (const absent of [
            'data-work-order-card', 'href=',
            'drag-handle', 'cursor-pointer',
        ]) {
            assertEquals(
                unplacedRow.includes(absent),
                false, absent,
            );
        }
    },
);
```

Keep `FORMER_MEMBER_NAME` imported only if a remaining
test uses it; this rewrite does not. Drop that import.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says `buildInboxItems` does
not provide the three-list return (or still requires
`mode`).

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/presenters/workbox-inbox.ts`:

1. Keep `InboxItem`, `ActiveClaim`, and the presenter as
   they are.
2. Replace `InboxMode` usage inside `buildInboxItems` only.
   Leave `export type InboxMode = 'active' | 'archived'`
   for Task 5.
3. Add:

```ts
export type InboxListKind =
    | 'available'
    | 'claimed'
    | 'archivedByMe';

export interface InboxLists {
    available: InboxItem[];
    claimed: InboxItem[];
    archivedByMe: InboxItem[];
}
```

4. Replace `itemMatchesMode` and `buildInboxItems` with:

```ts
function archiveNode(
    wo: WorkOrder,
): boolean {
    const node = wo.flowGraph.nodes.find(
        n => n.id === wo.nodeId,
    );
    return node?.isArchive === true;
}

function toItem(wo: WorkOrder): InboxItem {
    const fg = wo.flowGraph;
    const curNode = fg.nodes.find(
        n => n.id === wo.nodeId,
    );
    const row = {
        id: wo.id,
        displayId: wo.displayId,
        flowName: fg.name,
        transitionerName: null as string | null,
        claimedByName: null as string | null,
        lastTransitionedAt: wo.transition.at,
        position: wo.position,
    };
    return curNode
        ? {
            kind: 'placed',
            ...row,
            stateName: curNode.name,
            completed: curNode.isArchive,
            taskInstructions:
                curNode.taskInstructions,
        }
        : { kind: 'unplaced', ...row };
}

function byAtAsc(
    a: InboxItem, b: InboxItem,
): number {
    return (a.lastTransitionedAt ?? '')
        .localeCompare(
            b.lastTransitionedAt ?? '',
        );
}

function byAtDesc(
    a: InboxItem, b: InboxItem,
): number {
    return byAtAsc(b, a);
}

function byPosition(
    a: InboxItem, b: InboxItem,
): number {
    return a.position - b.position;
}

export function buildInboxItems(
    workOrders: readonly WorkOrder[],
    activeClaimsByWo:
        ReadonlyMap<Id, ActiveClaim>,
    currentMemberId: Id,
): InboxLists {
    const available: InboxItem[] = [];
    const claimed: InboxItem[] = [];
    const archivedByMe: InboxItem[] = [];
    for (const wo of workOrders) {
        if (archiveNode(wo)) {
            if (
                wo.transition.memberId
                    === currentMemberId
            ) {
                archivedByMe.push(toItem(wo));
            }
            continue;
        }
        const live = activeClaimsByWo.get(wo.id);
        if (live) {
            if (live.memberId === currentMemberId) {
                claimed.push(toItem(wo));
            }
            continue;
        }
        available.push(toItem(wo));
    }
    return {
        available: available.toSorted(byAtAsc),
        claimed: claimed.toSorted(byPosition),
        archivedByMe: archivedByMe.toSorted(byAtDesc),
    };
}
```

Drop the unused `memberName` import if nothing else in
this file calls it (the presenter still does not).
`transitionerName` / `claimedByName` stay on the item
type and render as today until Task 2.

In `web-app/app/presenters/index.ts`, add
`type InboxListKind` and `type InboxLists` to the
workbox-inbox export. Keep `InboxMode` until Task 5.

In `web-app/workbox/index.ts`, import
`getCurrentHumanMember` from `../../client/index.ts`.
Store the member id and change `buildItems`:

```ts
let currentMemberId: string | null = null;

function buildItems(
    rows: InboxRows,
    mode: InboxMode,
): InboxItem[] {
    const lists = buildInboxItems(
        rows.workOrders,
        rows.activeClaimsByWo,
        currentMemberId ?? '',
    );
    if (mode === 'archived') {
        return lists.archivedByMe;
    }
    return [...lists.available, ...lists.claimed];
}
```

In `init`, before `fetchInboxRows`:

```ts
    currentMemberId =
        (await getCurrentHumanMember(ctx)).id;
```

`getCurrentHumanMember` is `ctx.identity.id`. RequestContext
is its first argument.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/workbox-inbox.test.ts \
    web-app/app/presenters/workbox-inbox.ts \
    web-app/app/presenters/index.ts \
    web-app/workbox/index.ts
git commit -m "$(cat <<'EOF'
Split the workbox inbox into three lists

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 2: Inbox row chrome

**Files:**
- Create: `tests/presenter-workbox-inbox.test.ts`
- Modify: `web-app/app/presenters/workbox-inbox.ts`
- Modify: `tests/workbox-inbox.test.ts`
- Modify: `web-app/workbox/index.ts`
- Test: `tests/presenter-workbox-inbox.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/presenter-workbox-inbox.test.ts`:

```ts
import {
    assert,
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
```

In `tests/workbox-inbox.test.ts`, change the last test's
presenter call to `new WorkboxInboxPresenter(items,
'available')` and drop the `drag-handle` and `from Demo
Test` assertions (those pins move here). Keep the
unplaced `data-work-order-card` / `href=` absences.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says
`WorkboxInboxPresenter` still takes `showGrip: boolean`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/presenters/workbox-inbox.ts`:

Drop `iconGripVertical` from the icons import.

```ts
const EMPTY_COPY: Record<InboxListKind, string> = {
    available: 'No work orders available to me',
    claimed: 'No work orders claimed by me',
    archivedByMe: 'No work orders archived by me',
};

export class WorkboxInboxPresenter {
    readonly #items: readonly InboxItem[];
    readonly #kind: InboxListKind;

    constructor(
        items: readonly InboxItem[],
        kind: InboxListKind,
    ) {
        this.#items = items;
        this.#kind = kind;
    }

    renderList(
        container: HTMLElement,
    ): void {
        if (this.#items.length === 0) {
            setHtml(container, html`<p
                class="text-muted"
            >${EMPTY_COPY[this.#kind]}</p>`);
            return;
        }
        setHtml(container, html`${
            this.#items.map(
                i => this.#buildRow(i),
            )
        }`);
    }
```

In `#buildRow`, delete the `claimedBadge` block and the
`grip` block. Delete the `<span>from ${from}</span>` on
placed and unplaced rows. Keep flow name, display id,
state (or State unknown), and relative time.

In `web-app/workbox/index.ts`, every
`new WorkboxInboxPresenter(items, true)` or
`new WorkboxInboxPresenter(items, false)` becomes
`new WorkboxInboxPresenter(items, mode === 'archived'
? 'archivedByMe' : 'available')` until Task 5 paints
two lists. Drop `emptyState` from `loadInto` calls in
the same edit if the empty array would skip `onData`;
without `emptyState`, `onData` runs and the presenter
paints the copy. Remove `emptyStateFor` and its icon
imports if nothing else uses them.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/presenter-workbox-inbox.test.ts \
    tests/workbox-inbox.test.ts \
    web-app/app/presenters/workbox-inbox.ts \
    web-app/workbox/index.ts
git commit -m "$(cat <<'EOF'
Drop inbox grip and claimant chrome

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 3: Drop classifier and hash

**Files:**
- Create: `tests/workbox-inbox-drag.test.ts`
- Create: `web-app/app/workbox-inbox-drag.ts`
- Test: `tests/workbox-inbox-drag.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/workbox-inbox-drag.test.ts`:

```ts
import { assertStrictEquals } from '@std/assert';
import {
    classifyInboxDrop,
    inboxListKindFromHash,
} from '../web-app/app/workbox-inbox-drag.ts';

Deno.test(
    'available onto claimed-by-me Active is claim',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed', 'claimed',
            ),
            'claim',
        );
    },
);

Deno.test(
    'claimed-by-me onto available is release',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available', 'claimed',
            ),
            'release',
        );
    },
);

Deno.test(
    'claimed-by-me onto claimed-by-me is reorder',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'claimed', 'claimed',
            ),
            'reorder',
        );
    },
);

Deno.test(
    'available onto available is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop onto Archived by Me is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed',
                'archivedByMe',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'any drop while Archived by Me is selected'
    + ' is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'claimed', 'available',
                'archivedByMe',
            ),
            'none',
        );
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'claimed',
                'archivedByMe',
            ),
            'none',
        );
    },
);

Deno.test(
    'a drop outside both cards is none',
    () => {
        assertStrictEquals(
            classifyInboxDrop(
                'available', 'outside', 'claimed',
            ),
            'none',
        );
    },
);

Deno.test(
    '#archived selects archived-by-me',
    () => {
        assertStrictEquals(
            inboxListKindFromHash('#archived'),
            'archivedByMe',
        );
    },
);

Deno.test(
    'empty and #active select claimed-by-me Active',
    () => {
        assertStrictEquals(
            inboxListKindFromHash(''),
            'claimed',
        );
        assertStrictEquals(
            inboxListKindFromHash('#active'),
            'claimed',
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says
`workbox-inbox-drag.ts` is missing.

- [ ] **Step 3: Write the minimal implementation**

Create `web-app/app/workbox-inbox-drag.ts`:

```ts
import type { InboxListKind } from
    './presenters/workbox-inbox.ts';

export type InboxDropDestination =
    | InboxListKind
    | 'outside';

export type InboxDropAction =
    | 'claim'
    | 'release'
    | 'reorder'
    | 'none';

export function inboxListKindFromHash(
    hash: string,
): 'claimed' | 'archivedByMe' {
    return hash === '#archived'
        ? 'archivedByMe'
        : 'claimed';
}

export function classifyInboxDrop(
    source: InboxListKind,
    destination: InboxDropDestination,
    rightListKind: 'claimed' | 'archivedByMe',
): InboxDropAction {
    if (rightListKind === 'archivedByMe') {
        return 'none';
    }
    if (
        destination === 'outside'
        || destination === 'archivedByMe'
        || source === 'archivedByMe'
    ) {
        return 'none';
    }
    if (
        source === 'available'
        && destination === 'claimed'
    ) {
        return 'claim';
    }
    if (
        source === 'claimed'
        && destination === 'available'
    ) {
        return 'release';
    }
    if (
        source === 'claimed'
        && destination === 'claimed'
    ) {
        return 'reorder';
    }
    return 'none';
}
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/workbox-inbox-drag.test.ts \
    web-app/app/workbox-inbox-drag.ts
git commit -m "$(cat <<'EOF'
Classify workbox inbox drops

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 4: Transfer helper

**Files:**
- Modify: `tests/workbox-inbox-drag.test.ts`
- Modify: `web-app/app/workbox-inbox-drag.ts`
- Test: `tests/workbox-inbox-drag.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/workbox-inbox-drag.test.ts`. Add the
imports and the same `setupOneWorkOrder` style already
used in `tests/workbox-inbox.test.ts` (copy
`buildNode` / `buildEdge` / `buildLinearGraph` /
`seedFlow` / `setupOneWorkOrder` into this file; do
not import them from the other test). Then:

```ts
import {
    assert,
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import {
    classifyInboxDrop,
    inboxListKindFromHash,
    transferInboxDrop,
} from '../web-app/app/workbox-inbox-drag.ts';
import {
    memoryDbAdapter,
} from '../api/db-memory.ts';
import { inPageContext } from './in-page-facade.ts';
import { organizationToken } from './token-fixtures.ts';
import {
    createWorkOrderFromFlow,
} from
    '../web-app/app/work-order-creation.ts';
import {
    postFlowCreation,
    putFlow,
} from '../client/flow-mutations.ts';
import {
    deleteWorkOrderClaim,
    getWorkOrders,
    isClaimedAndUnlapsed,
} from '../client/index.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../shared/types.ts';
import { seedHumanMember } from './member-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
```

Duplicate `buildNode`, `buildEdge`, `buildLinearGraph`,
`seedFlow`, and `setupOneWorkOrder` from
`tests/workbox-inbox.test.ts` into this file.

```ts
Deno.test(
    'transfer claim then positions among claimed'
    + ' rows',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await deleteWorkOrderClaim(
            ctx, held,
        );
        const moved = await transferInboxDrop(
            ctx, released, {
                kind: 'claim',
                position: 3,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(
            moved.claim.memberId,
            'XXZruirZyAOoRpNxaDnpSA',
        );
        assertStrictEquals(moved.position, 3);
    },
);

Deno.test(
    'transfer release clears this member\'s'
    + ' live claim',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const released = await transferInboxDrop(
            ctx, held, { kind: 'release' },
        );
        assertEquals(
            isClaimedAndUnlapsed(released.claim),
            false,
        );
    },
);

Deno.test(
    'transfer reorder writes position only',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const moved = await transferInboxDrop(
            ctx, held, {
                kind: 'reorder',
                position: 9,
            },
        );
        assert(isClaimedAndUnlapsed(moved.claim));
        assertStrictEquals(moved.position, 9);
    },
);

Deno.test(
    'transfer none returns the held work order',
    async () => {
        const { ctx, woId } =
            await setupOneWorkOrder();
        const held = (await getWorkOrders(ctx))
            .find(w => w.id === woId)!;
        const out = await transferInboxDrop(
            ctx, held, { kind: 'none' },
        );
        assertStrictEquals(out, held);
    },
);
```

Do not import `putWorkOrderPosition` in this file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says `transferInboxDrop`
is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `web-app/app/workbox-inbox-drag.ts`:

```ts
import {
    deleteWorkOrderClaim,
    putWorkOrderClaim,
    putWorkOrderPosition,
    type RequestContext,
    type WorkOrder,
} from '../../client/index.ts';

export type InboxTransfer =
    | { kind: 'claim'; position: number }
    | { kind: 'release' }
    | { kind: 'reorder'; position: number }
    | { kind: 'none' };

export async function transferInboxDrop(
    ctx: RequestContext,
    held: WorkOrder,
    drop: InboxTransfer,
): Promise<WorkOrder> {
    if (drop.kind === 'none') {
        return held;
    }
    if (drop.kind === 'release') {
        return await deleteWorkOrderClaim(
            ctx, held,
        );
    }
    if (drop.kind === 'reorder') {
        return await putWorkOrderPosition(
            ctx, held, drop.position,
        );
    }
    const claimed = await putWorkOrderClaim(
        ctx, held,
    );
    return await putWorkOrderPosition(
        ctx, claimed, drop.position,
    );
}
```

RequestContext is the first argument of every client
verb.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/workbox-inbox-drag.test.ts \
    web-app/app/workbox-inbox-drag.ts
git commit -m "$(cat <<'EOF'
Transfer inbox drops through claim verbs

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 5: Two-card page chrome

**Files:**
- Modify: `web-app/workbox/index.html`
- Modify: `web-app/workbox/index.ts`
- Modify: `web-app/app/presenters/index.ts`
- Modify: `web-app/app/presenters/workbox-inbox.ts`
- Modify: `tests/presenter-workbox-inbox.test.ts`
- Test: `tests/presenter-workbox-inbox.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/presenter-workbox-inbox.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says `index.html` still
has `Your work order inbox` / `workbox-tabs`.

- [ ] **Step 3: Write the minimal implementation**

Replace `web-app/workbox/index.html` with:

```html
<div class="workspace">
    <div class="page-header">
        <div>
            <h1 class="page-title">
                Workbox
            </h1>
        </div>
        <div
            class="flex flex-wrap
                items-center gap-3"
        >
            <div class="dropdown">
                <button
                    class="btn btn-primary gap-2"
                    id="create-work-order-btn"
                >
                    <span
                        id="create-work-order-btn-icon"
                    ></span>
                    <span
                        class="hidden-mobile"
                    >Create Work Order</span><span
                        class="visible-mobile"
                    >Create</span>
                </button>
                <div
                    class="dropdown-content
                        hidden"
                    id="create-work-order-dropdown"
                    data-align="end"
                >
                </div>
            </div>
        </div>
    </div>

    <div
        id="workbox-inbox"
        class="grid grid-cols-1
            md:grid-cols-2 gap-6"
    >
        <div class="card p-4">
            <h2
                class="text-lg font-semibold
                    mb-4"
            >
                Work Orders available to me
            </h2>
            <div
                id="available-list"
                class="flex flex-col gap-3"
                data-inbox-list="available"
            >
            </div>
        </div>
        <div class="card p-4">
            <div
                class="flex items-center
                    justify-between gap-3
                    mb-4"
            >
                <h2
                    class="text-lg
                        font-semibold"
                >
                    Work Orders claimed by me
                </h2>
                <div
                    class="flex items-center
                        gap-2"
                    role="group"
                    aria-label="Claimed or archived by me"
                >
                    <button
                        type="button"
                        class="btn btn-secondary
                            btn-sm"
                        data-inbox-pill="claimed"
                        aria-pressed="true"
                    >Active</button>
                    <button
                        type="button"
                        class="btn btn-secondary
                            btn-sm"
                        data-inbox-pill="archivedByMe"
                        aria-pressed="false"
                    >Archived by Me</button>
                </div>
            </div>
            <div
                id="claimed-list"
                class="flex flex-col gap-3"
                data-inbox-list="claimed"
            >
            </div>
        </div>
    </div>
</div>
```

Replace the top of `web-app/workbox/index.ts` through
`onRowClick`. Keep `createWorkOrderForFlow`,
`initCreateDropdown`, `buildNotReadyRow`, and
`onDropdownClick` as they are after Task 1.

```ts
import {
    $, $$, populateIcons, getRequiredAttribute,
} from '../app/dom.ts';
import {
    html, setHtml,
} from '../app/safe-html.ts';
import { log } from '../app/logger.ts';
import { createPageAbort } from
    '../app/page-lifecycle.ts';
import { showToast } from '../app/toast.ts';
import {
    buildSkeleton,
    loadInto,
} from '../app/loading-states.ts';
import {
    ICON_SIZE,
    iconPlus,
    iconNoEntry,
} from '../app/icons.ts';
import { navigateTo } from '../app/navigation.ts';
import { initDropdown } from '../app/dropdown.ts';
import {
    getFlowsForCreation,
    type NotReadyFlowEntry,
} from '../app/flow-publish.ts';
import {
    getCurrentHumanMember,
    subscribeWorkOrderChanges,
    type RequestContext,
} from '../../client/index.ts';
import { sessionContext } from '../app/client.ts';
import { generateIdentifier } from
    '../../shared/identifier.ts';
import {
    createWorkOrderFromFlow,
} from '../app/work-order-creation.ts';
import {
    getInboxRows,
    type InboxRows,
} from '../app/workbox-inbox-rows.ts';
import {
    WorkboxInboxPresenter,
    buildInboxItems,
    type InboxItem,
    type InboxListKind,
} from '../app/presenters/index.ts';
import {
    inboxListKindFromHash,
} from '../app/workbox-inbox-drag.ts';

const { signal } = createPageAbort();

let inboxRows: InboxRows | null = null;
let currentMemberId: string | null = null;
let rightListKind: 'claimed' | 'archivedByMe' =
    'claimed';

export async function init(
    _params?: Record<string, string>,
): Promise<void> {
    rightListKind = inboxListKindFromHash(
        location.hash,
    );
    pressInboxPills();
    bindInboxPills();

    const availableEl =
        $('#available-list', document);
    const claimedEl =
        $('#claimed-list', document);
    if (!availableEl || !claimedEl) return;

    const ctx = sessionContext();
    currentMemberId =
        (await getCurrentHumanMember(ctx)).id;
    const rowsPromise = fetchInboxRows(ctx);
    await Promise.all([
        renderAvailable(availableEl, ctx, rowsPromise),
        renderRightList(claimedEl, ctx, rowsPromise),
        initCreateDropdown(ctx),
    ]);

    subscribeWorkOrderChanges(() => {
        const shared = fetchInboxRows(ctx);
        void renderAvailable(
            availableEl, ctx, shared,
        );
        void renderRightList(
            claimedEl, ctx, shared,
        );
    });
}

function pressInboxPills(): void {
    for (const pill of $$(
        '[data-inbox-pill]', document,
    )) {
        const kind = pill.getAttribute(
            'data-inbox-pill',
        );
        pill.setAttribute(
            'aria-pressed',
            kind === rightListKind
                ? 'true' : 'false',
        );
    }
}

function bindInboxPills(): void {
    for (const pill of $$(
        '[data-inbox-pill]', document,
    )) {
        pill.addEventListener('click', () => {
            const kind = pill.getAttribute(
                'data-inbox-pill',
            );
            if (
                kind !== 'claimed'
                && kind !== 'archivedByMe'
            ) return;
            rightListKind = kind;
            location.hash = kind === 'archivedByMe'
                ? '#archived'
                : '#active';
            pressInboxPills();
            const claimedEl =
                $('#claimed-list', document);
            const ctx = sessionContext();
            if (!claimedEl) return;
            void renderRightList(claimedEl, ctx);
        }, { signal });
    }
}

async function fetchInboxRows(
    ctx: RequestContext,
): Promise<InboxRows> {
    inboxRows = await getInboxRows(ctx);
    return inboxRows;
}

function listsFrom(
    rows: InboxRows,
) {
    return buildInboxItems(
        rows.workOrders,
        rows.activeClaimsByWo,
        currentMemberId ?? '',
    );
}

async function renderAvailable(
    listEl: HTMLElement,
    ctx: RequestContext,
    rowsPromise?: Promise<InboxRows>,
): Promise<void> {
    const rows = await (
        rowsPromise ?? fetchInboxRows(ctx)
    );
    await paintList(
        listEl,
        listsFrom(rows).available,
        'available',
    );
}

async function renderRightList(
    listEl: HTMLElement,
    ctx: RequestContext,
    rowsPromise?: Promise<InboxRows>,
): Promise<void> {
    const rows = await (
        rowsPromise ?? fetchInboxRows(ctx)
    );
    const lists = listsFrom(rows);
    const kind: InboxListKind =
        rightListKind === 'archivedByMe'
            ? 'archivedByMe'
            : 'claimed';
    listEl.setAttribute('data-inbox-list', kind);
    await paintList(
        listEl,
        kind === 'archivedByMe'
            ? lists.archivedByMe
            : lists.claimed,
        kind,
    );
}

async function paintList(
    listEl: HTMLElement,
    items: InboxItem[],
    kind: InboxListKind,
): Promise<void> {
    await loadInto({
        container: listEl,
        skeleton: buildSkeleton('card-list', 4),
        fetch: async () => items,
        retry: init,
        onData: painted => {
            new WorkboxInboxPresenter(
                painted, kind,
            ).renderList(listEl);
            bindRowNavigation(listEl);
        },
    });
}

function bindRowNavigation(
    container: HTMLElement,
): void {
    if (container.dataset.navBound === 'true') {
        return;
    }
    container.dataset.navBound = 'true';
    container.addEventListener(
        'click', e => onRowClick(e),
        { signal },
    );
}

function onRowClick(e: MouseEvent): void {
    if (!(e.target instanceof Element)) return;
    if (e.target.closest('a[href]')) return;
    const card = e.target.closest<HTMLElement>(
        '[data-work-order-card]',
    );
    if (!card) return;
    const id = getRequiredAttribute(
        card, 'data-work-order-card',
    );
    navigateTo('workbox-detail', { id });
}
```

In `web-app/app/presenters/workbox-inbox.ts`, delete
`export type InboxMode = 'active' | 'archived'`.

In `web-app/app/presenters/index.ts`:

```ts
export {
    WorkboxInboxPresenter,
    buildInboxItems,
    type InboxListKind,
    type InboxLists,
    type InboxItem,
} from './workbox-inbox.ts';
```

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/workbox/index.html \
    web-app/workbox/index.ts \
    web-app/app/presenters/workbox-inbox.ts \
    web-app/app/presenters/index.ts \
    tests/presenter-workbox-inbox.test.ts
git commit -m "$(cat <<'EOF'
Paint the two-card workbox inbox

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 6: Pointer coordinator

**Files:**
- Modify: `web-app/app/workbox-inbox-drag.ts`
- Modify: `web-app/workbox/index.ts`
- Modify: `web-app/app/styles/pages-workbox.css`
- Test: `tests/workbox-inbox-drag.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/workbox-inbox-drag.test.ts`:

```ts
Deno.test(
    'initInboxDrag is exported',
    async () => {
        const mod = await import(
            '../web-app/app/workbox-inbox-drag.ts'
        );
        assertEquals(
            typeof mod.initInboxDrag, 'function',
        );
    },
);
```

The page wiring has no Deno DOM for pointer capture.
Pin the coordinator's contract in this test and
implement `initInboxDrag` next to it. A completed drag
must suppress the following click; a click without a
drag must not.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report says `initInboxDrag` is
undefined.

- [ ] **Step 3: Write the minimal implementation**

Add these imports at the top of
`web-app/app/workbox-inbox-drag.ts`:

```ts
import { $$, createElement } from './dom.ts';
import {
    computeNewPosition,
    dropIndex as computeDropIndex,
    followTranslateY,
} from './drag-reorder-positions.ts';
```

Append:

```ts
type CardRect = {
    readonly top: number;
    readonly height: number;
};

type DragState =
    | { kind: 'idle' }
    | {
        kind: 'active';
        id: string;
        source: InboxListKind;
        indicator: HTMLElement | null;
        idx: number | null;
        rects: readonly CardRect[] | null;
        startClientY: number;
        card: HTMLElement;
    };

function readListKind(
    el: Element,
): InboxListKind | null {
    const list = el.closest('[data-inbox-list]');
    const kind = list?.getAttribute(
        'data-inbox-list',
    );
    if (
        kind === 'available'
        || kind === 'claimed'
        || kind === 'archivedByMe'
    ) {
        return kind;
    }
    return null;
}

export function initInboxDrag(
    root: HTMLElement,
    options: {
        cardSelector: string;
        idAttribute: string;
        rightListKind: () =>
            'claimed' | 'archivedByMe';
        onDrop: (
            id: string,
            transfer: InboxTransfer,
        ) => void;
    },
): void {
    let drag: DragState = { kind: 'idle' };
    let suppressClick = false;

    root.addEventListener(
        'click',
        (e) => {
            if (!suppressClick) return;
            suppressClick = false;
            e.preventDefault();
            e.stopImmediatePropagation();
        },
        { capture: true },
    );

    function claimedList(): HTMLElement | null {
        return root.querySelector('#claimed-list');
    }

    function claimedCards(): HTMLElement[] {
        const list = claimedList();
        if (!list) return [];
        return $$(options.cardSelector, list);
    }

    function listKindAt(
        y: number,
    ): InboxDropDestination {
        const lists = $$('[data-inbox-list]', root);
        for (const list of lists) {
            const r = list.getBoundingClientRect();
            if (y >= r.top && y <= r.bottom) {
                return readListKind(list)
                    ?? 'outside';
            }
        }
        return 'outside';
    }

    function buildIndicator(): HTMLElement {
        const el = createElement('div');
        el.className = 'inbox-drop-indicator';
        return el;
    }

    function clearIndicator(): void {
        if (drag.kind !== 'active') return;
        drag.indicator?.remove();
        drag = {
            ...drag,
            indicator: null,
            idx: null,
        };
    }

    function positionsOf(
        items: readonly HTMLElement[],
    ): number[] {
        return items.map(c => {
            const raw = c.getAttribute(
                'data-position',
            );
            if (raw === null) {
                throw new Error(
                    'inbox-drag: card missing'
                    + ' data-position',
                );
            }
            return parseFloat(raw);
        });
    }

    function dropSlot(
        y: number,
        lastIdx: number | null,
    ): number {
        let rects: readonly CardRect[];
        if (
            drag.kind === 'active'
            && drag.rects !== null
        ) {
            rects = drag.rects;
        } else {
            rects = claimedCards().map((c) => {
                const r =
                    c.getBoundingClientRect();
                return {
                    top: r.top,
                    height: r.height,
                };
            });
            if (drag.kind === 'active') {
                drag = { ...drag, rects };
            }
        }
        return computeDropIndex(y, lastIdx, rects);
    }

    function transferOf(
        source: InboxListKind,
        dest: InboxDropDestination,
        y: number,
        idx: number | null,
    ): InboxTransfer {
        const action = classifyInboxDrop(
            source, dest, options.rightListKind(),
        );
        if (action === 'release') {
            return { kind: 'release' };
        }
        if (action === 'none') {
            return { kind: 'none' };
        }
        const slot = idx ?? dropSlot(y, null);
        const position = computeNewPosition(
            positionsOf(claimedCards()),
            slot,
        );
        if (action === 'claim') {
            return { kind: 'claim', position };
        }
        return { kind: 'reorder', position };
    }

    root.addEventListener('pointerdown', (e) => {
        suppressClick = false;
        if (e.button !== 0) return;
        const card = (e.target as Element)
            .closest<HTMLElement>(
                options.cardSelector,
            );
        if (!card || !root.contains(card)) return;
        const source = readListKind(card);
        if (source === null) return;
        const id = card.getAttribute(
            options.idAttribute,
        );
        if (id === null) {
            throw new Error(
                'inbox-drag: card missing '
                + options.idAttribute,
            );
        }
        e.preventDefault();
        card.setPointerCapture(e.pointerId);
        drag = {
            kind: 'active',
            id,
            source,
            indicator: null,
            idx: null,
            rects: null,
            startClientY: e.clientY,
            card,
        };
        card.classList.add('inbox-dragging');
    });

    root.addEventListener('pointermove', (e) => {
        if (drag.kind !== 'active') return;
        drag.card.style.transform =
            followTranslateY(
                drag.startClientY, e.clientY,
            );
        const dest = listKindAt(e.clientY);
        if (
            dest !== 'claimed'
            && dest !== 'archivedByMe'
        ) {
            clearIndicator();
            return;
        }
        const newIdx = dropSlot(e.clientY, drag.idx);
        if (newIdx === drag.idx && drag.indicator) {
            return;
        }
        drag.indicator?.remove();
        const ind = buildIndicator();
        const items = claimedCards();
        const list = claimedList();
        if (!list) return;
        if (newIdx < items.length) {
            list.insertBefore(ind, items[newIdx]!);
        } else {
            list.appendChild(ind);
        }
        drag = {
            ...drag,
            indicator: ind,
            idx: newIdx,
        };
    });

    root.addEventListener('pointerup', (e) => {
        if (drag.kind !== 'active') return;
        suppressClick = true;
        const { id, source, card, idx } = drag;
        const dest = listKindAt(e.clientY);
        const transfer = transferOf(
            source, dest, e.clientY, idx,
        );
        clearIndicator();
        card.style.transform = '';
        card.classList.remove('inbox-dragging');
        drag = { kind: 'idle' };
        options.onDrop(id, transfer);
    });

    root.addEventListener('pointercancel', () => {
        if (drag.kind !== 'active') return;
        const card = drag.card;
        clearIndicator();
        card.style.transform = '';
        card.classList.remove('inbox-dragging');
        drag = { kind: 'idle' };
    });
}
```

Append to `web-app/app/styles/pages-workbox.css`:

```css
.inbox-drop-indicator {
    height: 3px;
    margin: 2px 0;
    pointer-events: none;
    border-radius: 2px;
    background: hsl(var(--primary));
}

.inbox-dragging {
    opacity: 0.4;
}
```

`card.style.transform` is the live `translateY` from
`followTranslateY`. It is the same dynamic transform
`drag-reorder.ts` writes. The indicator and opacity use
classes.

In `web-app/workbox/index.ts`, add
`let dragBound = false;` next to `rightListKind`.

Add imports:

```ts
import {
    inboxListKindFromHash,
    initInboxDrag,
    transferInboxDrop,
    type InboxTransfer,
} from '../app/workbox-inbox-drag.ts';
import {
    RequestError,
    HTTP_CONFLICT,
} from '../../shared/http-errors.ts';
import type { WorkOrder } from
    '../../client/index.ts';
```

At the end of `init`, after the first paint:

```ts
    const root = $('#workbox-inbox', document);
    if (root && !dragBound) {
        dragBound = true;
        initInboxDrag(root, {
            cardSelector:
                '[data-work-order-card]',
            idAttribute: 'data-work-order-card',
            rightListKind: () => rightListKind,
            onDrop: (id, transfer) => {
                void onInboxDrop(id, transfer, ctx);
            },
        });
    }
```

Add:

```ts
function cardById(id: string): HTMLElement | null {
    return document.querySelector(
        '[data-work-order-card="' + id + '"]',
    );
}

async function onInboxDrop(
    id: string,
    transfer: InboxTransfer,
    ctx: RequestContext,
): Promise<void> {
    if (!inboxRows || transfer.kind === 'none') {
        return;
    }
    const held = inboxRows.workOrders.find(
        wo => wo.id === id,
    );
    if (!held) return;
    const card = cardById(id);
    const availableEl =
        $('#available-list', document);
    const claimedEl =
        $('#claimed-list', document);
    if (card && transfer.kind === 'claim' && claimedEl) {
        claimedEl.appendChild(card);
    }
    if (
        card && transfer.kind === 'release'
        && availableEl
    ) {
        availableEl.appendChild(card);
    }
    try {
        const moved = await transferInboxDrop(
            ctx, held, transfer,
        );
        inboxRows = {
            ...inboxRows,
            workOrders: inboxRows.workOrders.map(
                wo => wo.id === id ? moved : wo,
            ),
        };
    } catch (err) {
        log.error(
            'inbox drop failed', 'workbox', err,
        );
        if (
            err instanceof RequestError
            && err.status === HTTP_CONFLICT
        ) {
            showToast(
                'Someone else holds that'
                + ' work order',
                'error',
            );
        } else {
            showToast(
                'Failed to save order',
                'error',
            );
        }
    }
    if (availableEl) {
        await renderAvailable(availableEl, ctx);
    }
    if (claimedEl) {
        await renderRightList(claimedEl, ctx);
    }
}
```

Do not call `initDragReorder` on this page. `WorkOrder`
may already be imported; keep a single import.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    web-app/app/workbox-inbox-drag.ts \
    web-app/workbox/index.ts \
    web-app/app/styles/pages-workbox.css \
    tests/workbox-inbox-drag.test.ts
git commit -m "$(cat <<'EOF'
Drag workbox rows to claim and release

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 7: Action-screen presenter chrome

**Files:**
- Modify: `tests/presenter-workbox-detail.test.ts`
- Modify: `web-app/app/presenters/workbox-detail.ts`
- Test: `tests/presenter-workbox-detail.test.ts`

- [ ] **Step 1: Write the failing tests**

Change these existing tests:

1. `'buildAttributeInputHtml force-disables with
   bind prompt title when unbound'` →

```ts
Deno.test(
    'buildAttributeInputHtml force-disables'
    + ' without bind-prompt copy',
    () => {
        const ref = makeAttributeRef();
        const attribute = makeAttribute();
        const out = buildAttributeInputHtml(
            ref, attribute, 'kept', true,
        ).toString();
        assertMatch(out, /disabled/);
        assertMatch(out, /value="kept"/);
        assert(
            !out.includes('Bind an instance'),
        );
    },
);
```

2. `'buildPage unbound disables fields, shows bind
   prompt and picker button'` → claimed-by-me
   unbound enables fields, no bind chrome:

```ts
Deno.test(
    'buildPage claimed-by-me enables fields'
    + ' and omits bind chrome',
    () => {
        const attr = makeAttribute({
            id: 'UQBiHFcwJeCDSnmkPBoYRA',
            name: 'Notes',
            attributeType: 'text',
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1',
                    name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attributeId:
                                'UQBiHFcwJeCDSnmkPBoYRA',
                        }),
                    ],
                }),
            ],
        });
        const presenter = makePresenter({
            graph,
            attributes: [attr],
            instanceValues: new Map([
                ['UQBiHFcwJeCDSnmkPBoYRA', 'from-head'],
            ]),
            binding: null,
            activeClaim: {
                memberId: 'pjQzgITAPDQVyvCVpzpIfQ',
                at: '2026-04-01T12:00:00.000000Z',
            },
            currentMemberId:
                'pjQzgITAPDQVyvCVpzpIfQ',
        });
        const out = presenter.buildPage()
            .toString();
        assert(
            !out.includes('data-dialog-open="bind-instance"'),
        );
        assert(
            !out.includes('id="bind-instance-dialog"'),
        );
        assert(!out.includes('Bind instance'));
        assert(!out.includes('unclaim-btn'));
        assert(!out.includes('Release Work Order'));
        assert(
            !out.includes('Bind an instance before'),
        );
        assertMatch(out, /value="from-head"/);
        const notes = out.match(
            /id="wo-attr-UQBiHFcwJeCDSnmkPBoYRA"[\s\S]*?>/,
        );
        assert(notes);
        assertEquals(
            notes[0]!.includes('disabled'), false,
        );
    },
);
```

3. `'buildPage renders one transition button per
   outgoing edge and a release button when the work
   order is not complete'` — drop the
   `unclaim-btn` / `Release Work Order` assertions.
   Default `makePresenter` has `activeClaim: null`,
   so this becomes the unclaimed view: transitions
   present and `disabled`.

```ts
Deno.test(
    'buildPage unclaimed shows disabled fields'
    + ' with values and disabled transitions',
    () => {
        const attr = makeAttribute({
            id: 'UQBiHFcwJeCDSnmkPBoYRA',
            name: 'Notes',
        });
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1',
                    name: 'Triage',
                    attributes: [
                        makeAttributeRef({
                            attributeId:
                                'UQBiHFcwJeCDSnmkPBoYRA',
                        }),
                    ],
                }),
                makeNode({
                    id: 'n-2', name: 'Approved',
                }),
            ],
            edges: [
                makeEdge({
                    id: 'e-ok', name: 'Approve',
                    fromNodeId: 'n-1',
                    toNodeId: 'n-2',
                }),
            ],
        });
        const presenter = makePresenter({
            graph,
            attributes: [attr],
            instanceValues: new Map([
                ['UQBiHFcwJeCDSnmkPBoYRA', 'kept'],
            ]),
            binding: {
                instanceId: 'inst-1',
                recordTypeId: 'sjWcXwYGlgxxJOHxzMoUow',
            },
            activeClaim: null,
        });
        const out = presenter.buildPage()
            .toString();
        assertMatch(out, /value="kept"/);
        assertMatch(out, /disabled/);
        assertMatch(out, /data-edge-id="e-ok"/);
        assertMatch(
            out,
            /data-edge-id="e-ok"[^>]*disabled/,
        );
        assert(!out.includes('unclaim-btn'));
        assert(!out.includes('Bind instance'));
    },
);
```

4. `'buildPage on a complete work order hides the
   attributes card, transition buttons, and release
   button'` — keep hide-fields / hide-transitions;
   keep `!out.includes('unclaim-btn')`.

Add:

```ts
Deno.test(
    'buildPage claimed-by-me enables'
    + ' transitions',
    () => {
        const graph = makeFlowGraph({
            nodes: [
                makeNode({
                    id: 'n-1', name: 'Triage',
                }),
                makeNode({
                    id: 'n-2', name: 'Approved',
                }),
            ],
            edges: [
                makeEdge({
                    id: 'e-ok', name: 'Approve',
                    fromNodeId: 'n-1',
                    toNodeId: 'n-2',
                }),
            ],
        });
        const presenter = makePresenter({
            graph,
            activeClaim: {
                memberId: 'pjQzgITAPDQVyvCVpzpIfQ',
                at: '2026-04-01T12:00:00.000000Z',
            },
        });
        const out = presenter.buildPage()
            .toString();
        const btn = out.match(
            /data-edge-id="e-ok"[^>]*>/,
        );
        assert(btn);
        assertEquals(
            btn[0]!.includes('disabled'), false,
        );
        assert(!out.includes('unclaim-btn'));
    },
);
```

A bound badge for a bound instance stays. Unbound
badge copy (`data-binding="unbound"`) goes — it tells
the user to bind.

Update `'buildPage pre-fills inputs from instance
values and shows a bound badge'` to pass
`activeClaim` for the current member so fields stay
enabled.

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. The report still finds
`unclaim-btn` / `Bind instance` / bind-prompt title.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/app/presenters/workbox-detail.ts`:

- Delete `UNBOUND_FIELD_TITLE`. `titleAttr` in
  `buildAttributeInputHtml` is `html`` when
  `forceDisabled` (no bind prompt).
- Delete `#bindButton`, `#bindDialog`, `#pickerRow`.
- `#bindingBadge`: if `this.#binding === null`
  return `html``; else keep the bound Instance badge.
- Delete `unclaimBtn` from `buildPage`.
- Delete `this.#bindButton()` and
  `this.#bindDialog()` from `buildPage`.
- Add:

```ts
    #claimedByMe(): boolean {
        return this.#claim.state === 'claimed'
            && this.#claim.byCurrentMember;
    }
```

- `#buildAttributeRow`: `forceDisabled =
  !this.#claimedByMe()` (readonly refs still disable
  through `buildAttributeInputHtml`).
- `#buildTransitionButtons`: add `disabled` on each
  button when `!this.#claimedByMe()`.

Leave `pickerItems` on the constructor so callers
compile; stop rendering them.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/presenter-workbox-detail.test.ts \
    web-app/app/presenters/workbox-detail.ts
git commit -m "$(cat <<'EOF'
Drop action-screen bind and release chrome

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 8: No claim-on-open

**Files:**
- Modify: `tests/presenter-workbox-detail.test.ts`
- Modify: `web-app/workbox/detail.ts`
- Modify: `web-app/app/styles/pages-workbox.css`
- Test: `tests/presenter-workbox-detail.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/presenter-workbox-detail.test.ts`:

```ts
Deno.test(
    'detail.ts does not call putWorkOrderClaim',
    async () => {
        const src = await Deno.readTextFile(
            new URL(
                '../web-app/workbox/detail.ts',
                import.meta.url,
            ),
        );
        assertEquals(
            src.includes('putWorkOrderClaim'),
            false,
        );
        assertEquals(
            src.includes('unclaim-btn'),
            false,
        );
        assertEquals(
            src.includes('putWorkOrderBinding'),
            false,
        );
        assertEquals(
            src.includes('initBindPicker'),
            false,
        );
        assertEquals(
            src.includes('initUnclaimButton'),
            false,
        );
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `./test`

Expected: exit 1. `detail.ts` still contains
`putWorkOrderClaim`.

- [ ] **Step 3: Write the minimal implementation**

In `web-app/workbox/detail.ts`:

- Remove `putWorkOrderClaim`, `putWorkOrderBinding`,
  `deleteWorkOrderClaim` from the client import.
- `fetch` in `init` is one `loadPresenter` call. Delete
  the `claimStatus` / `putWorkOrderClaim` /
  reload-presenter block.
- Delete `initUnclaimButton`,
  `deleteWorkOrderClaimAtHead`, `initBindPicker`.
- `renderDetail` keeps `initTransitionButtons` for
  non-archive. Drop the two deleted inits.
- Unbound wave-2 in `loadPresenter`: do not
  `getRecordInstances` for a picker. Pass
  `pickerItems: []`. Bound path still GETs the
  instance head for values.
- Drop `heldRecordTypeId` if it only served the
  picker.
- Drop `handleDialogClick` / `closeDialog` imports
  if unused.
- Keep `getCurrentHumanMember` and `claimStatus`
  construction: the presenter still needs
  `byCurrentMember`.

In `web-app/app/styles/pages-workbox.css`, delete
`.bind-instance-list`, `.bind-instance-pick`,
`.bind-instance-summary`, `.bind-instance-field`.

- [ ] **Step 4: Run the tests and make sure they pass**

Run: `./test validate`

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add \
    tests/presenter-workbox-detail.test.ts \
    web-app/workbox/detail.ts \
    web-app/app/styles/pages-workbox.css
git commit -m "$(cat <<'EOF'
Stop claiming a work order on open

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 9: Architecture paragraph

**Files:**
- Modify: `ARCHITECTURE.md`

- [ ] **Step 1: Rewrite the paragraph**

Replace the three-line workbox visibility block under
`## Work orders` (the paragraph that currently says
the workbox shows every active and archived work
order) with:

```
The workbox inbox is personal. `buildInboxItems` in
`presenters/workbox-inbox.ts` takes the current
member id and splits heads into available-to-me,
claimed-by-me, and archived-by-me. Another member's
live claim is omitted. Another member's archive is
omitted. Item 11's processes rewrite keeps
all-see-all as the default; item 11a is the
assigned pool (current node `memberIds`).
```

Wrap at 78 characters. Do not edit `## Tenancy`.

- [ ] **Step 2: Confirm the wording**

Read the paragraph. It names the inbox as personal
and keeps 11 / 11a.

- [ ] **Step 3: Commit**

Docs only. Still run `./test validate` so the commit
is green on this branch.

Run: `./test validate`

Expected: exit 0.

```bash
git add ARCHITECTURE.md
git commit -m "$(cat <<'EOF'
Describe the workbox as a personal inbox

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 10: TEST-PLAN chrome

**Files:**
- Modify: `TEST-PLAN.md`

- [ ] **Step 1: Rewrite the named cases**

In `TEST-PLAN.md`, replace the Workbox Inbox (`workbox/`)
cases WB1–WB3 with:

```
- [ ] **WB1** Navigate to `workbox/`. PASS: page shows
  "Workbox" title, no subtitle, two cards "Work Orders
  available to me" and "Work Orders claimed by me",
  pills Active | Archived by Me on the right card, and
  a "Create Work Order" button (plus icon + label;
  mobile short label "Create"). The user-facing word is
  the past participle Archived, never Archive.
  Pin: tests/presenter-workbox-inbox.test.ts 'workbox
       index.html is two cards, pills on the right, no
       subtitle'
- [ ] **WB2** With no work orders available to the
  current member, the left card shows "No work orders
  available to me". The right card Active pill shows
  "No work orders claimed by me".
  Pin: tests/presenter-workbox-inbox.test.ts 'available
       empty copy is No work orders available to me';
       tests/presenter-workbox-inbox.test.ts 'claimed
       empty copy is No work orders claimed by me'
- [ ] **WB3** Click Archived by Me. PASS: the right card
  lists this member's archived-by-me rows, most recently
  archived first. The left card does not change.
  Pin: tests/workbox-inbox.test.ts 'this member's
       archive transition is archived-by-me';
       tests/presenter-workbox-inbox.test.ts
       'archived-by-me empty copy is No work orders
       archived by me'
```

Replace WB10a and WB10b with:

```
- [ ] **WB10a — No bind chrome.** Open a work order on a
  flow that has a record-type join. PASS: there is no
  "Bind instance" button, no bind-instance dialog, and
  no bind-prompt title. A bound instance may still show
  an Instance badge that identifies the record.
  Pin: tests/presenter-workbox-detail.test.ts
       'buildPage claimed-by-me enables fields and omits
       bind chrome'
- [ ] **WB10b — Unclaimed fields disabled with values.**
  Open an unclaimed (or lapsed) work order that has
  instance values. PASS: attribute inputs are disabled
  and still show those values; transition buttons are
  shown and disabled. To work it, return to Workbox and
  drag onto claimed-by-me.
  Pin: tests/presenter-workbox-detail.test.ts
       'buildPage unclaimed shows disabled fields with
       values and disabled transitions'
```

Replace WB11's first paragraph and its browser pin so
bind is gone:

```
- [ ] **WB11** On a claimed-by-me action screen, fill
  Company Name and Contact Email, click `submit` →
  Review. PASS: transition POSTs
  `work-orders/:id/transition` (200), work order moves
  to the next state, browser navigates back to the
  inbox. The work order appears in claimed-by-me
  Active.
  Pin: tests/browser/workbox-transition.test.ts
       'fill and submit navigates to the inbox (WB11)'
```

Keep WB16's API pins. Drop "across WB11's bind".

Replace WB12, WB13, WB13a with:

```
- [ ] **WB12** Click a work order row. PASS: the browser
  navigates to the action screen and does not PUT
  `work-orders/:id/claim`.
  Pin: tests/presenter-workbox-detail.test.ts
       'detail.ts does not call putWorkOrderClaim'
- [ ] **WB13** Drag a claimed-by-me Active row onto
  available-to-me. PASS: DELETE `work-orders/:id/claim`
  (200) and the row reappears in available-to-me.
  Pin: tests/workbox-inbox-drag.test.ts 'transfer
       release clears this member's live claim';
       tests/workbox-inbox-drag.test.ts 'claimed-by-me
       onto available is release'
- [ ] **WB13a — Claim → release → reclaim.** Drag an
  available row onto claimed-by-me Active (claim then
  position). Drag it back onto available (release).
  Drag it onto claimed-by-me again (reclaim). PASS:
  the message plane carries `claimed` →
  `claim_released` → `claimed`. On a seeded work
  order, its first claim records `claim_expired` for
  its creator's lapsed birth claim, then `claimed`.
  Pin: tests/workbox-inbox-drag.test.ts 'transfer claim
       then positions among claimed rows';
       tests/api-work-order-claim.test.ts 'a released
       claim allows a fresh claim';
       tests/mock-data-pairs.test.ts 'claiming a seeded
       work order expires its birth claim'
```

WB14: "Archive tab" → "Archived by Me". Pin stays
`tests/workbox-inbox.test.ts` `'this member's archive
transition is archived-by-me'`.

WB15: "Archive tab" → "Archived by Me". Pin stays the
complete-work-order presenter test.

WB18: replace "click the row to claim it" with drag
onto claimed-by-me. Opening inspects. Sarah's drag is
409 `work order is already claimed`. Keep the API 409
pins.

Replace the **Workbox — All-See-All Visibility**
heading and WB20–WB23 with:

```
### Workbox — Personal inbox

The inbox is personal. Available-to-me is the org pool
(every unclaimed or released active work order, any
node). Assigned-pool (current node `memberIds`) is
TODO.md item 11a. Item 11's processes rewrite keeps
all-see-all as the default.

- [ ] **WB20** As the demo user, navigate to `workbox/`.
  PASS: the left card lists available-to-me (unclaimed
  or released, not `isArchive`, any node). The right
  card Active lists this member's live claims. Another
  member's live claim is omitted. Rows do not name a
  claimant.
  Pin: tests/workbox-inbox.test.ts 'an unclaimed active
       work order is available';
       tests/workbox-inbox.test.ts 'this member's live
       claim is claimed';
       tests/workbox-inbox.test.ts 'another member's
       live claim is omitted'
- [ ] **WB21** Click Archived by Me. PASS: only work
  this member last transitioned onto an `isArchive`
  node is listed. Another member's archive is omitted.
  Pin: tests/workbox-inbox.test.ts 'this member's
       archive transition is archived-by-me';
       tests/workbox-inbox.test.ts 'another member's
       archive is omitted'
- [ ] **WB22** Inspect
  `web-app/app/presenters/workbox-inbox.ts`. PASS:
  `buildInboxItems` takes three parameters —
  `(workOrders, activeClaimsByWo, currentMemberId)` —
  and returns `{ available, claimed, archivedByMe }`.
  Its exports include `InboxItem`, `InboxListKind`,
  `InboxLists`, `ActiveClaim`,
  `WorkboxInboxPresenter`, and `buildInboxItems`. There
  is no `InboxMode`.
  Pin: tests/workbox-inbox.test.ts calls
       `buildInboxItems` with exactly these three
       arguments, so AT1's `deno check` rejects any
       further required parameter
- [ ] **WB23** Open the holder's action screen in two
  tabs of one cookie jar. PASS: the second tab shows
  the holder's editable screen and appends no claim.
  Release is an inbox drag, not `#unclaim-btn`.
  Pin: tests/presenter-workbox-detail.test.ts
       'detail.ts does not call putWorkOrderClaim';
       tests/workbox-inbox-drag.test.ts 'transfer
       release clears this member's live claim';
       tests/api-work-order-release.test.ts 'a release
       with no live claim answers the head'
```

- [ ] **Step 2: Confirm every named case**

Skim WB1–WB3, WB10a–WB13a, WB14–WB15, WB18,
WB20–WB23. Each names a Task 1–8 or Task 11 pin.

- [ ] **Step 3: Commit**

Run: `./test validate`

Expected: exit 0.

```bash
git add TEST-PLAN.md
git commit -m "$(cat <<'EOF'
Rewrite workbox TEST-PLAN for claim-drag

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

### Task 11: Browser chrome

**Files:**
- Modify: `tests/browser/workbox-transition.test.ts`
- Test: `tests/browser/workbox-transition.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the bind helper usage and the WB23
`#unclaim-btn` test.

Keep `createOnboardingWorkOrder`. Delete
`bindFirstInstance`.

```ts
Deno.test(
    'workbox inbox shows two cards and pills',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await page.navigate(
                    registryUrl(
                        origin.baseUrl, 'workbox',
                    ),
                );
                await page.ready('workbox');
                assert(
                    await page.until<boolean>(
                        `document.body.innerText`
                        + `.includes(`
                        + `'Work Orders available`
                        + ` to me')`
                        + ` && document.body`
                        + `.innerText.includes(`
                        + `'Work Orders claimed`
                        + ` by me')`,
                        'two card headlines',
                    ),
                );
                assert(
                    await page.until<boolean>(
                        `document.querySelector(`
                        + `'[data-inbox-pill=`
                        + `"claimed"]')`
                        + `?.getAttribute(`
                        + `'aria-pressed')`
                        + ` === 'true'`,
                        'Active pill pressed',
                    ),
                );
                const sub = await page.evaluate<
                    string
                >(
                    `document.querySelector(`
                    + `'.page-header p')`
                    + `?.textContent ?? ''`,
                );
                assertStrictEquals(sub, '');
                const bind = await page.evaluate<
                    boolean
                >(
                    `document.getElementById(`
                    + `'workbox-tabs') === null`,
                );
                assert(bind);
            },
        );
    },
);

Deno.test(
    'fill and submit navigates to the inbox'
    + ' (WB11)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                await fillRequired(page);
                await page.click(
                    `[data-edge-id="${SUBMIT_EDGE_ID}"]`,
                );
                await page.until(
                    `location.pathname.endsWith(`
                    + `'/workbox/index.html')`,
                    'inbox',
                );
                await page.ready('workbox');
                assert(
                    await page.until<boolean>(
                        `[...document.querySelectorAll(`
                        + `'.toast')].some(t =>`
                        + ` t.textContent.includes(`
                        + `'Transition complete'))`,
                        'Transition complete toast',
                    ),
                );
            },
        );
    },
);

Deno.test(
    'the action screen has no bind or release'
    + ' chrome',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await createOnboardingWorkOrder(
                    page, origin.baseUrl,
                );
                const bind = await page.evaluate<
                    boolean
                >(
                    `document.querySelector(`
                    + `'[data-dialog-open=`
                    + `"bind-instance"]')`
                    + ` === null`
                    + ` && document.getElementById(`
                    + `'unclaim-btn') === null`,
                );
                assert(bind);
            },
        );
    },
);
```

Delete `'a second tab releases after the first
released (WB23)'`.

Import `assertStrictEquals` from `@std/assert`.

Create still birth-claims, so `fillRequired`'s wait
for `disabled === false` holds on the claimed-by-me
unbound screen after Task 7.

Do not add a Layer 2 drag pin in this task. The
harness can `page.drag`, but claim-drag needs an
unclaimed row in available-to-me; birth claim puts
a fresh create on claimed-by-me. Verbs stay under
Layer 1 (`transferInboxDrop`). An operator walk can
drag a seeded available row.

- [ ] **Step 2: Run the memory suite**

Implementers do not run `./test browser`. Green gate
is Layer 1.

Run: `./test validate`

Expected: exit 0. `deno check` covers
`tests/browser/workbox-transition.test.ts`.

- [ ] **Step 3: Commit**

```bash
git add tests/browser/workbox-transition.test.ts
git commit -m "$(cat <<'EOF'
Follow workbox chrome in the browser tests

Co-Authored-By: Grok 4.7 <noreply@xAI>
EOF
)"
```

---

## Spec coverage

- Headlines, two cards, no subtitle, Create in the
  header: Task 5, Task 11.
- Pills Active | Archived by Me on the right card;
  left card unchanged; hash `#archived`: Task 3,
  Task 5.
- Available = org pool, unclaimed/released/lapsed,
  not `isArchive`; unplaced unclaimed → available:
  Task 1.
- Claimed = this member's live claim, not archive:
  Task 1.
- Archived by Me = this member last transitioned
  onto `isArchive`, newest first: Task 1.
- Someone else's live claim omitted; someone else's
  archive omitted: Task 1.
- Available sort `transition.at` ascending; claimed
  `position`; one work order in at most one list:
  Task 1.
- No Claim/Release buttons; drag only: Task 6,
  Task 7.
- Bind gone from the action screen: Task 7, Task 8.
- Opening never claims: Task 8.
- Create still navigates to the action screen: Task
  5 keeps that path. Birth claim stays (Spec notes).
- Five drop cases, archived-pill freeze, outside
  drop: Task 3.
- Claim then `putWorkOrderPosition`; release;
  reorder among this member's claimed rows: Task 4.
- Optimistic paint, 409 / 412 / network toasts:
  Task 6.
- Row chrome: flow, id, state, relative time; no
  grip; empty copy: Task 2.
- Unclaimed fields disabled with values;
  unclaimed transitions disabled; claimed-by-me
  enabled; archived read-only: Task 7.
- ARCHITECTURE personal inbox + 11 / 11a: Task 9.
- TEST-PLAN WB1–WB3, WB10a–WB13a, WB14–WB15, WB18,
  WB20–WB23: Task 10.
- Layer 2 chrome, no bind, no `#unclaim-btn`:
  Task 11.
- Non-goals: no assigned-pool, no bind-at-create,
  no third column, no sort toggle, no new claim
  API, no keyboard claim path.

## Placeholder scan

No step defers work or says "similar to Task N".
`InboxListKind`, `InboxLists`, `classifyInboxDrop`,
`inboxListKindFromHash`, `InboxTransfer`,
`transferInboxDrop`, and `initInboxDrag` are defined
in Tasks 1, 3, 4, and 6 before later tasks use them.

## Type consistency

`buildInboxItems(workOrders, activeClaimsByWo,
currentMemberId): InboxLists`.
`WorkboxInboxPresenter(items, kind: InboxListKind)`.
`classifyInboxDrop(source, destination, rightListKind)`.
`inboxListKindFromHash(hash): 'claimed' | 'archivedByMe'`.
`transferInboxDrop(ctx, held, drop: InboxTransfer)`.
`initInboxDrag(root, { cardSelector, idAttribute,
rightListKind, onDrop })`. Task 5 and Task 6 use
those names.
