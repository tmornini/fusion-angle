# 4 Oct walk remedies — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax.
> Ride this branch's worktree (AGENTS.md § Worktrees).

**Goal:** Correct the walk of `2acbc87a`'s three FAILs,
unblock its four BLOCKED cases, and moor its six DRIFT
cases, so the next Layer 3 walk scores all thirteen.

**Architecture:** Three product defects, each landed
only behind a test watched red: F30 (boot recentres
stored positions), R2 (a refresh adopts a peer tab's
token scoped to the peer's organization — at boot and
mid-page), and F13 (the camera slides a node out from
under a double-click). Everything else is TEST-PLAN.md
text: drive recipes that a hidden, CDP-driven tab can
execute (AA32, C6, I22), a driver artifact named
(K30/K3), and six cases rewritten to what the product
does (AT2, F37a, WB18, WB22, R22, SV3).

**Tech Stack:** Deno 2.9.6, TypeScript strict,
`Deno.test` + `@std/assert`, Chrome CDP through
`tests/browser/fixtures.ts` under `./test browser`.

**Spec:** the walk record (verbatim in the appendix;
the source file `/tmp/fusion-angle-walk-2acbc87a.txt`
is ephemeral) and the three stubs below.

**Worktree:** `.worktrees/test-plan-walk-2026-10-04` on
branch `test-plan-walk-2026-10-04`, base `3528f9b5`
(the walked `2acbc87a` plus the stub commit). The
branch sits on `membership-and-versions`, 573 commits
past master; it lands after that branch does.

**Stubs (frozen, never edited):**
`docs/superpowers/test-plan-mitigations/2026-10-04-f30.md`,
`…/2026-10-04-k30.md`, `…/2026-10-04-r2.md`. Product
commits cite the red tests by name, never the stubs.
K30's stub closes without a product commit: its root
is the walk's own K3 typing (Task 7).

---

## Global Constraints

- Work only in the worktree above. Never commit on
  master. Never `-D`. Never force-push.
- One concern per commit. Subject ≈50 chars,
  present-tense imperative, no body. Trailer, exactly:

```
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01EVtEd6XHNPttf7ehY43fYh
```

- A product change lands ONLY behind a test watched
  red at Layer 1 (`./test validate`) or Layer 2
  (`./test browser`), and only in the commit that turns
  it green. Every commit is green at Layer 1.
- A red test that does not go red as predicted is a
  STOP: report the actual output; do not adjust the
  test until it fails.
- Markdown-only commits skip `./test validate`.
- Under the Claude Code sandbox, before any `deno`,
  `./test`, or `./bin/*`:
  `export DENO_DIR="$TMPDIR/deno-dir"`.
- Voice: 78-char max in `.ts`/`.html`/`.css` under
  `api/ client/ web-app/ tests/ shared/ server/`;
  4-space indent; no inline styles; no `org`
  camelCase abbreviation in identifiers — write
  `organization`.
- Patterns: `RequestContext` first argument to client
  verbs; snake_case wire, camelCase domain; HTTP-verb
  names (`getNoun`/`putNoun`/`postNounOperation`);
  validators at the gate, trust inside;
  `noUncheckedIndexedAccess`.
- Commandments in play: Reliability (stored positions
  and tenancy hold), Security (a tab never acts in an
  organization it did not choose), Immutability (boot
  paints what was stored), Logic (the stale branch
  order in `resolveBootOrganizationBranch`), Clarity
  (case text says what the product does).
- Abominations to refuse: Test Weakening (one pin
  changes expectation — Task 4 — because it pins the
  defect; its other assertions stay), Internal Defense
  (no `try/catch` around the exchange), Default Values
  (no `?? refreshed` fallback onto a foreign-tenant
  token), Unbidden Helper Code (no Layer 2 tests for
  AA32, C6, or I22 — their recipes are enough to
  score), Cleverness (no timers to dodge the
  double-click window).
- Layer 1, one file:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --allow-run=deno,./bin/serve,./deploy,sh,./test,./bin/postgres-wipe,./bin/postgres-seed,./bin/measure \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --preload ./tests/worker-name-prefix.ts \
    --filter 'SUBSTRING' tests/FILE.test.ts
```

- Layer 1, the gate: `./test validate`. Baseline on
  `2acbc87a` (the walk's AT2): 4125 passed, 0 failed,
  11 ignored; timezone pass 8 passed.
- Layer 2: `./test browser` — every
  `tests/browser/*.test.ts`, serially; needs Chrome
  (`CHROME` or `CHROME_DEBUG_URL`). No single-file
  form.

## Review Focus

- A fresh flow saved with Auto Layout off (default
  positions (−300, 0) and (300, 200)) reopens exactly
  where it was saved — Task 2's test covers the
  laid-out case; the same deletion covers this one.
- A single-tab session with a reachable stored
  organization still boots scoped to it, and a stored
  organization the token cannot reach still walks —
  Task 4 re-pins both in
  `tests/boot-organization-gate.test.ts`.
- A mid-page 401 whose adopted peer token cannot be
  exchanged back (membership gone) surfaces the 401 to
  the page's error state instead of installing the
  foreign token — Task 5's second test.
- Keyboard selection (Tab ring, Enter) with the panel
  open still centres the newly focused node — Task 8
  leaves that path alone; `canvas-keyboard.test.ts`
  stays green.
- A single click on a second node with the panel open
  retargets the panel without moving the camera —
  Task 8's test asserts the node did not move between
  its two presses.

---

## File structure

| File | Role |
|---|---|
| `web-app/app/presenters/flow-designer.ts` | drop `migrateToCenter` and `#computeMigrateToCenter` |
| `web-app/flows/detail.ts` | boot call site; F13 centring moves to the open-panel edge |
| `client/credential-resolution.ts` | reachable stored choice wins the boot branch |
| `client/http-facade.ts` | exchange an adopted peer token back to the dead token's organization |
| `tests/flow-designer-open.test.ts` | F30 red test; drop the `true` argument |
| `tests/flow-undo-cursor.test.ts` | drop `livePresenter`'s migrate parameter |
| `tests/flow-designer-presenter.test.ts` | trim the migrate comment |
| `tests/adapters-refresh-mutex.test.ts` | R2 boot and mid-page red tests |
| `tests/boot-organization-gate.test.ts` | re-pin the scoped branch |
| `tests/browser/canvas-pan.test.ts` | F13 red test |
| `TEST-PLAN.md` | F30, R2, K3, K30, F13, AA32, C6, I22, F37a, WB18, WB22, R22, SV3, AT2, driving notes |

## Dependency graph

| Task | Depends on | Layer | Chrome | Kind |
|---|---|---|---|---|
| T1 commit plan | — | — | no | doc |
| T2 F30 fix | T1 | 1 | no | red → green, product |
| T3 F30 text | T2 | doc | no | doc |
| T4 R2 boot fix | T1 | 1 | no | red → green, product |
| T5 R2 mid-page fix | T4 | 1 | no | red → green, product |
| T6 R2 text | T5 | doc | no | doc |
| T7 K3/K30 text | T1 | doc | no | doc |
| T8 F13 fix | T1 | 2 | yes | red → green, product |
| T9 unblock text | T8 | doc | no | doc |
| T10 moor text | T1 | doc | no | doc |
| T11 gates + AT2 | all | 1+2 | yes | doc |

One worker per worktree: run tasks in order.

---

### Task 1: Commit this plan

**Files:**
- Create: `docs/superpowers/plans/test-plan-walk-2026-10-04.md`

- [ ] **Step 1: Commit**

```bash
git add docs/superpowers/plans/test-plan-walk-2026-10-04.md
git commit -m "Plan the 4 Oct walk remedies"
```

---

### Task 2: F30 — boot paints stored positions

**Root cause.** Boot builds the one per-load presenter
with `migrateToCenter = true`
(`web-app/flows/detail.ts:1730-1736`). The constructor
(`web-app/app/presenters/flow-designer.ts:208-220`)
runs `#computeMigrateToCenter` (`:402-427`), which
subtracts the mean of the nodes' top-left corners from
every node. Layout centres node *centres* on the
origin, then stores top-left corners, so the mean is
never zero and every boot shifts every node by one
vector. With Auto Layout on, layout re-runs and hides
it; off, the shift is painted and the next edit saves
it. The walk's Draft moved by exactly that one vector
(−6, +234.22). The constructor comment's premise —
"auto-layout's own output is already centered" — is
false.

**Files:**
- Modify: `tests/flow-designer-open.test.ts` (import
  line 1; append a test; drop `true,` at ~line 197)
- Modify: `web-app/app/presenters/flow-designer.ts`
  (`:186-220` comment and constructor; `:402-427`)
- Modify: `web-app/flows/detail.ts` (`:1726-1736`)
- Modify: `tests/flow-undo-cursor.test.ts` (`:877-911`)
- Modify: `tests/flow-designer-presenter.test.ts`
  (`:446-464` comment)

**Interfaces:**
- Produces: `new FlowDesignerPresenter(snap, canvasW,
  canvasH, history)` — four parameters; the fifth is
  gone.

- [ ] **Step 1: Write the failing test**

In `tests/flow-designer-open.test.ts`, change line 1 to:

```ts
import {
    assertEquals, assertNotStrictEquals, assertStrictEquals,
} from '@std/assert';
```

Extend the presenter import to
`FlowDesignerPresenter, buildInitialFlowSnapshot,
type FlowSnapshot`. Every other name below
(`freshDb`, `createFlow`, `NULL_STORAGE`, `CANVAS_W`,
`CANVAS_H`, `inPageContext`, `inPageClient`,
`putClient`, `getClient`, `DEV_TOKEN`, `putFlow`,
`enqueueFlowSave`, `getRenderableFlowGraph`,
`buildStartAndCompleteNodes`, `getFlowVersions`,
`buildFlowHistorySnapshot`, `withLocalStorageAsync`,
`DEFAULT_LOCK_TIMEOUT`, `generateIdentifier`) is
already in the file. Append:

```ts
// onFlowLoaded's boot, minus the DOM: read the renderable
// graph, build the one per-load presenter, size its canvas,
// and reconcile its layout — the snapshot boot paints.
async function bootDesigner(
    ctx: ReturnType<typeof inPageContext>,
    flowId: string,
): Promise<FlowSnapshot> {
    const graph = await getRenderableFlowGraph(ctx, flowId);
    const presenter = new FlowDesignerPresenter(
        buildInitialFlowSnapshot(
            graph, CANVAS_W, CANVAS_H, [], [], [],
        ),
        CANVAS_W, CANVAS_H,
        buildFlowHistorySnapshot(
            (await getFlowVersions(ctx, flowId)).length > 1,
        ),
        true,
    );
    presenter.withCanvasSize(CANVAS_W, CANVAS_H);
    return presenter.withLayoutReconciled();
}

Deno.test(
    'with Auto Layout off, boot paints the positions'
    + ' the designer left (F30)',
    () => withLocalStorageAsync(NULL_STORAGE, async () => {
        const db = await freshDb();
        putClient(inPageClient(db));
        getClient().putSessionToken(DEV_TOKEN);
        const flowId = generateIdentifier();
        await createFlow(db, DEV_TOKEN, flowId);
        const ctx = inPageContext(db, DEV_TOKEN);
        const { start, complete } =
            buildStartAndCompleteNodes();
        const panel = {
            ...start,
            id: generateIdentifier(),
            name: 'Panel B',
            isCreate: false,
        };
        await putFlow(ctx, flowId, {
            name: 'Layout Test',
            isLocked: false,
            isAutoLayout: true,
            isAutoFit: false,
            lockTimeout: DEFAULT_LOCK_TIMEOUT,
            nodes: [start, panel, complete],
            edges: [
                {
                    id: generateIdentifier(), name: '',
                    fromNodeId: start.id,
                    toNodeId: panel.id,
                },
                {
                    id: generateIdentifier(), name: 'Done',
                    fromNodeId: panel.id,
                    toNodeId: complete.id,
                },
            ],
        });
        const history = buildFlowHistorySnapshot(true);
        const off = new FlowDesignerPresenter(
            await bootDesigner(ctx, flowId),
            CANVAS_W, CANVAS_H, history,
        ).withAutoLayoutToggled();
        const left = new FlowDesignerPresenter(
            off, CANVAS_W, CANVAS_H, history,
        ).withNodeNamed(panel.id, 'Panel B F30');
        await enqueueFlowSave(flowId, async () => undefined);
        const back = await bootDesigner(ctx, flowId);
        assertStrictEquals(back.isAutoLayout, false);
        assertEquals(
            back.nodes.map(n => [
                n.name, n.positionX, n.positionY,
            ]),
            left.nodes.map(n => [
                n.name, n.positionX, n.positionY,
            ]),
        );
    }),
);
```

- [ ] **Step 2: Watch it fail**

Run the one-file command with
`--filter 'boot paints the positions'
tests/flow-designer-open.test.ts`.
Expected: FAIL, `Values are not equal`, every node off
by one shared vector — investigation saw Archive
[220, 0] vs [140, −32], Panel B F30 [0, 0] vs
[−80, −32], Create [−220, 0] vs [−300, −32].

- [ ] **Step 3: Delete the boot-time recentre**

In `web-app/app/presenters/flow-designer.ts`, delete the
"Fix wave (Phase 14 Task 8 …)" comment block above the
constructor (`:186-207`) and make the constructor:

```ts
    constructor(
        snap: FlowSnapshot,
        canvasW: number,
        canvasH: number,
        history: FlowHistorySnapshot,
    ) {
        this.#canvasW = canvasW;
        this.#canvasH = canvasH;
        this.#history = history;
        this.#snapshot = snap;
    }
```

Delete `#computeMigrateToCenter` (`:402-427`) whole.

In `web-app/flows/detail.ts`, delete the
`// migrateToCenter=true ONLY here …` comment
(`:1726-1729`) and the `true,` argument (`:1735`).

- [ ] **Step 4: Drop the argument everywhere else**

- `tests/flow-designer-open.test.ts`: the `true,` in
  'opening a flow does not append pairs' (~line 197),
  and the `true,` in the new `bootDesigner`.
- `tests/flow-undo-cursor.test.ts`: remove
  `livePresenter`'s `migrateToCenter = false` parameter
  (`:878`) and its pass-through (`:893`); call it as
  `livePresenter()` at `:910`.
- `tests/flow-designer-presenter.test.ts`: trim the
  comment at `:446-464` to drop the sentences about
  the five-argument `migrateToCenter=true` form; the
  test and its assertions stay.

Then `grep -rn migrateToCenter web-app tests client`
prints nothing.

- [ ] **Step 5: Watch it pass, then the gate**

Run the Step 2 command: PASS. Then `./test validate`:
exits 0, passed count 4126.

- [ ] **Step 6: Commit**

```bash
git add web-app/app/presenters/flow-designer.ts \
    web-app/flows/detail.ts tests/flow-designer-open.test.ts \
    tests/flow-undo-cursor.test.ts \
    tests/flow-designer-presenter.test.ts
git commit -m "Paint stored flow positions on boot"
```

---

### Task 3: F30 — name the pin

**Files:**
- Modify: `TEST-PLAN.md` F30 (`:3144-3167`)

- [ ] **Step 1: Add the pin** after the
  `getFlowGraph lays out …` pin's closing `this case
  must not read as a fail);` line, before
  `exploratory —`:

```
       tests/flow-designer-open.test.ts 'with Auto
       Layout off, boot paints the positions the
       designer left (F30)' (decides a boot with Auto
       Layout off paints exactly the positions the
       toggle and rename PUTs stored — no recentre);
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Pin F30 on the boot-positions test"
```

---

### Task 4: R2 — boot keeps the stored organization

**Root cause.** Every full-page boot refreshes under
the `fusion-refresh` lock. While waiting, the mutex
adopts any token a peer tab broadcasts on
`fusion-angle:refresh` (`client/session-refresh-mutex.ts:45-59`,
`:97-103`), whatever its organization. Boot then
calls `resolveBootOrganizationBranch`
(`client/credential-resolution.ts:77-99`), which
returns `scoped` on the *token's* organization before
it looks at the stored choice, and `app-boot.ts:117-121`
writes that organization to the shared
`fusion-angle:active-organization-id`. In the walk,
Create Record rang `fusion-angle:data`; a same-jar tab
scoped to Wayne refreshed and broadcast; the detail
page adopted the Wayne token, booted under Wayne, and
the switcher flipped. The record id is the record-type
id on the wire, so its attribute GET under Wayne 404s
— a consequence, not a second bug. The walk did not
record which organization K29's second tab held; the
mechanism is reproduced at Layer 1 below.

The tab's own refresh always asks for the stored
choice, so token ≠ reachable stored choice happens
only through adoption. A reachable stored choice wins;
it can only name an organization in the token's
verified `organizations` claim, and the server's
exchange re-checks membership.

**Files:**
- Modify: `tests/adapters-refresh-mutex.test.ts`
- Modify: `tests/boot-organization-gate.test.ts:37-41`
- Modify: `client/credential-resolution.ts:77-99`

**Interfaces:**
- Produces: `resolveBootOrganizationBranch(token,
  tokens, persisted)` — `exchange` to `persisted`
  when reachable and different from the token's;
  `scoped` when equal, or when nothing is stored and
  the token's organization is reachable; else `walk`.
- Produces (test file constants, Task 5 reuses):
  `STARK`, `WAYNE`, `scopedTo(organization)`.

- [ ] **Step 1: Write the failing test**

In `tests/adapters-refresh-mutex.test.ts` add the
import:

```ts
import {
    resolveBootOrganizationBranch,
} from '../client/credential-resolution.ts';
```

(`createHttpFacade`, `createAppClient`, `claimToken`,
`principalFromToken`, `assertEquals` are already
imported.) Append:

```ts
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';

function scopedTo(organization: string): Promise<string> {
    return claimToken({
        organization,
        organizations: [STARK, WAYNE],
        roles: ['admin:' + STARK, 'admin:' + WAYNE],
        jti: 'scoped-' + organization,
    });
}

Deno.test('a boot refresh asked for Stark keeps Stark when'
    + ' a Wayne tab broadcasts', async () => {
    const starkTab = createAppClient(createHttpFacade(
        'http://example.test',
        (input, init) => globalThis.fetch(input, init),
    ));
    const wayneToken = await scopedTo(WAYNE);
    const starkToken = await scopedTo(STARK);
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    let locked = (): void => {};
    const inside = new Promise<void>((resolve) => {
        locked = resolve;
    });
    // The Wayne tab: holds the refresh lock across its
    // refresh, then broadcasts its Wayne-scoped token.
    const wayneHold = navigator.locks.request(
        'fusion-refresh', async () => {
            locked();
            await held;
        },
    );
    await inside;
    const starkFlight = starkTab.runSingleFlightRefresh(
        () => Promise.resolve(starkToken),
    );
    const wayneBus = new BroadcastChannel(
        'fusion-angle:refresh',
    );
    const witness = new BroadcastChannel(
        'fusion-angle:refresh',
    );
    const heard = new Promise<void>((resolve) => {
        witness.onmessage = () => resolve();
    });
    try {
        wayneBus.postMessage({ accessToken: wayneToken });
        await heard;
        release();
        await wayneHold;
        const access = await starkFlight;
        if (access === null) throw new Error('no access');
        const principal = principalFromToken(access);
        assertEquals(
            resolveBootOrganizationBranch(
                principal.organization,
                principal.organizations,
                STARK,
            ),
            { kind: 'exchange', id: STARK },
        );
    } finally {
        witness.close();
        wayneBus.close();
        starkTab.deleteRefreshChannel();
    }
});
```

- [ ] **Step 2: Watch it fail**

Filter `'keeps Stark when'`. Expected: FAIL, actual
`{ kind: "scoped", id: "BBjWJsjYIDkTRKIIPrzWRw" }`.

- [ ] **Step 3: Reorder the branch**

Replace `resolveBootOrganizationBranch` in
`client/credential-resolution.ts`:

```ts
// The tab's own refresh asks for the stored choice, so a
// token scoped elsewhere arrived from a peer tab's
// broadcast. A reachable stored choice wins; the token's
// own organization stands only when nothing reachable is
// stored.
export function resolveBootOrganizationBranch(
    tokenOrganization: string | undefined,
    tokenOrganizations: readonly string[] | undefined,
    persisted: string | null,
): BootOrganizationBranch {
    const reachable = tokenOrganizations ?? [];
    if (persisted !== null && reachable.includes(persisted)) {
        return persisted === tokenOrganization
            ? { kind: 'scoped', id: persisted }
            : { kind: 'exchange', id: persisted };
    }
    if (
        tokenOrganization !== undefined
        && reachable.includes(tokenOrganization)
    ) {
        return { kind: 'scoped', id: tokenOrganization };
    }
    return { kind: 'walk' };
}
```

`app-boot.ts` needs no change: its `exchange` branch
(`:123-133`) exchanges, then stores the choice.

- [ ] **Step 4: Re-pin the scoped branch**

`tests/boot-organization-gate.test.ts:37-41` asserts
`('a', ['a','b'], 'b')` → `scoped a` — the defect
itself. Rename that test to
`'a reachable token organization is scoped when it is'
+ ' the stored choice or none is stored'` and replace
its first assertion with these two (the other two
assertions in that test stay):

```ts
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], 'a',
            ),
            { kind: 'scoped', id: 'a' },
        );
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], null,
            ),
            { kind: 'scoped', id: 'a' },
        );
```

and add after that test:

```ts
Deno.test(
    'a reachable stored choice exchanges a token scoped'
        + ' elsewhere',
    () => {
        assertEquals(
            resolveBootOrganizationBranch(
                'a', ['a', 'b'], 'b',
            ),
            { kind: 'exchange', id: 'b' },
        );
    },
);
```

Every other assertion in the file keeps its expected
value under the new order; run the file to confirm.

- [ ] **Step 5: Watch it pass, then the gate**

Both files PASS; `./test validate` exits 0.

- [ ] **Step 6: Commit**

```bash
git add client/credential-resolution.ts \
    tests/adapters-refresh-mutex.test.ts \
    tests/boot-organization-gate.test.ts
git commit -m "Boot to the stored organization over a peer's"
```

---

### Task 5: R2 — a mid-page 401 keeps its organization

**Root cause.** Same adoption, other caller:
`client/http-facade.ts:304-311` installs whatever the
single flight returns and retries. An adopted Wayne
token retries a Stark path (server 403), then later
requests build Wayne paths — two tenants in one tab.

**Files:**
- Modify: `tests/adapters-refresh-mutex.test.ts`
- Modify: `client/http-facade.ts` (`exchangeOnce`,
  ~`:278-315`)

**Interfaces:**
- Consumes: `STARK`, `WAYNE`, `scopedTo` (Task 4);
  `withMockFetch`, `client` (file-local).
- Produces: none exported.

- [ ] **Step 1: Write the two failing tests**

Append to `tests/adapters-refresh-mutex.test.ts`:

```ts
// Hold the refresh lock as a Wayne tab would, start a
// Stark page's GET on a dead Stark token, let its 401
// queue behind the lock, then broadcast the Wayne token.
async function recoverBehindWayne(
    exchanged: string | null,
): Promise<{
    grants: string[];
    asked: (string | undefined)[];
    retriedWith: string[];
}> {
    client.setCookieSession(true);
    const dead = await scopedTo(STARK);
    const wayne = await scopedTo(WAYNE);
    const grants: string[] = [];
    const asked: (string | undefined)[] = [];
    const retriedWith: string[] = [];
    let sent401 = (): void => {};
    const refused = new Promise<void>((resolve) => {
        sent401 = resolve;
    });
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    let locked = (): void => {};
    const inside = new Promise<void>((resolve) => {
        locked = resolve;
    });
    const wayneHold = navigator.locks.request(
        'fusion-refresh', async () => {
            locked();
            await held;
        },
    );
    await inside;
    await withMockFetch(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/authentication/token')) {
            const body = JSON.parse(String(init?.body)) as {
                grant_type?: string;
                organization?: string;
            };
            grants.push(body.grant_type ?? '');
            asked.push(body.organization);
            if (exchanged === null) {
                return Response.json(
                    { error: 'forbidden' }, { status: 403 },
                );
            }
            return new Response(
                JSON.stringify({
                    token_type: 'Bearer', expires_in: 900,
                }),
                {
                    status: 200,
                    headers: {
                        'authentication-info':
                            'access_token="' + exchanged + '"',
                    },
                },
            );
        }
        const bearer = new Headers(init?.headers)
            .get('Authorization');
        if (bearer === 'Bearer ' + dead) {
            sent401();
            return Response.json(
                { error: 'invalid_token' }, { status: 401 },
            );
        }
        retriedWith.push(bearer ?? '');
        return Response.json([]);
    }, async () => {
        const facade = createHttpFacade(
            'http://example.test',
            (input, init) => globalThis.fetch(input, init),
        )({ ...client, navigateToAuth: () => {} });
        const pending = facade.GET(
            'organizations/' + STARK + '/records/', dead,
        ).catch((err: unknown) => err);
        await refused;
        // One macrotask: the 401's microtasks reach the
        // single flight, which now waits on the lock.
        await new Promise((resolve) => setTimeout(resolve, 0));
        const bus = new BroadcastChannel('fusion-angle:refresh');
        const witness = new BroadcastChannel(
            'fusion-angle:refresh',
        );
        const heard = new Promise<void>((resolve) => {
            witness.onmessage = () => resolve();
        });
        try {
            bus.postMessage({ accessToken: wayne });
            await heard;
        } finally {
            witness.close();
            bus.close();
        }
        release();
        await wayneHold;
        await pending;
    });
    return { grants, asked, retriedWith };
}

Deno.test('a 401 recovery that adopts a Wayne peer token'
    + ' exchanges it back to Stark', async () => {
    const rescoped = await claimToken({
        organization: STARK,
        organizations: [STARK, WAYNE],
        roles: ['admin:' + STARK, 'admin:' + WAYNE],
        jti: 'rescoped-stark',
    });
    const seen = await recoverBehindWayne(rescoped);
    assertEquals(seen.grants, ['token-exchange']);
    assertEquals(seen.asked, [STARK]);
    assertEquals(seen.retriedWith, ['Bearer ' + rescoped]);
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization,
        STARK,
    );
});

Deno.test('a 401 recovery never installs a Wayne peer'
    + ' token it cannot exchange back', async () => {
    const seen = await recoverBehindWayne(null);
    assertEquals(seen.grants, ['token-exchange']);
    assertEquals(seen.retriedWith, []);
    assertStrictEquals(
        principalFromToken(client.getSessionToken())
            .organization === WAYNE,
        false,
    );
});
```

- [ ] **Step 2: Watch both fail**

Filter `'401 recovery'`. Expected: FAIL in both —
`grants` is `[]` (no exchange) and `retriedWith` is
`['Bearer <wayne>']`. If either passes, STOP.

- [ ] **Step 3: Exchange the adopted token back**

In `client/http-facade.ts`, inside the factory beside
`refreshAndScope`, add:

```ts
        // The single flight may hand back a peer tab's
        // token, scoped to the peer's organization.
        // Exchange it back to the organization the dead
        // token named; a flat token is refreshAndScope's
        // own answer and stands.
        async function scopedLike(
            access: string,
            deadToken: string,
            operationId: string | undefined,
        ): Promise<string | null> {
            const wanted = organizationToRestore(deadToken);
            const held =
                principalFromToken(access).organization;
            if (
                wanted === undefined
                || held === undefined
                || held === wanted
            ) {
                return access;
            }
            return await postOrganizationExchange(
                access, wanted, operationId,
            );
        }
```

and in `exchangeOnce` replace the block from
`const access = await client.runSingleFlightRefresh(`
through `client.putSessionToken(access);` with:

```ts
            const refreshed =
                await client.runSingleFlightRefresh(
                    () => refreshAndScope(token, operationId),
                );
            if (refreshed === null) {
                client.navigateToAuth();
                return first;
            }
            const access = await scopedLike(
                refreshed, token, operationId,
            );
            if (access === null) {
                return first;
            }
            client.putSessionToken(access);
```

A refused exchange answers the page with the original
401: `loadInto` shows Try Again, and the retry
refreshes on its own (no peer) to Stark.

- [ ] **Step 4: Watch them pass, then the gate**

Filter `'401 recovery'`: PASS; the whole file PASS
(the re-scope test's grants stay
`['refresh', 'token-exchange']`). `./test validate`
exits 0.

- [ ] **Step 5: Commit**

```bash
git add client/http-facade.ts \
    tests/adapters-refresh-mutex.test.ts
git commit -m "Re-scope a peer token adopted on a 401"
```

---

### Task 6: R2 — name the pins

**Files:**
- Modify: `TEST-PLAN.md` R2 (`:6831-6841`)

- [ ] **Step 1: Replace R2's Pin line** with:

```
  Pin: tests/adapters-records.test.ts 'postRecordChange
       create writes the row and the initial state
       event'; tests/adapters-refresh-mutex.test.ts 'a
       boot refresh asked for Stark keeps Stark when a
       Wayne tab broadcasts' (decides the detail page
       boots in the organization the create wrote
       under, even when a same-jar tab in another
       organization refreshes during the navigation);
       tests/adapters-refresh-mutex.test.ts 'a 401
       recovery that adopts a Wayne peer token
       exchanges it back to Stark'; exploratory — the
       create page's fields, the live navigation, and
       the new card's position at the bottom of the
       list
```

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Pin R2 on the peer-token tests"
```

---

### Task 7: K3/K30 — name the driver artifact

**Finding.** No product defect. The revision row is a
plain `<td>${e.name}</td>`
(`web-app/app/presenters/project-score-history.ts`
`#row`, `'revision'`), printing the name each revision
saved. The edit box opens filled with the current name
(`web-app/organization/index.ts:279-295`) and Save
PUTs the box verbatim (`:452-469`,
`client/objectives.ts:296-317`). Typing "Cut costs"
into the pre-filled box without selecting it produces
both walk strings exactly: one Backspace then type →
`"Lower expense" + "Cut costs"`; on the next edit, a
caret after "L" and two typings →
`"L" + "Cut costs" + "Cut costs" + "ower expenseCut costs"`.
A third, clean "Cut costs" save is why K3 scored PASS
and K30's Oct 4 actual reads "Cut costs". A
memory-backed round trip (create "Lower expenses",
revise "Cut costs", present) rows
`['Lower expenses', 'Cut costs']`. The walk database
still holds the smashed rows: re-seed before K30/K7
re-run.

**Files:**
- Modify: `TEST-PLAN.md` K3 (`:6337-6345`), K30
  (`:6785-6807`)

- [ ] **Step 1: Replace K3** with:

```
- [ ] **K3** Click `Edit` on "Lower expenses"; confirm
  modal opens pre-filled. Select the whole name
  (`Input.dispatchKeyEvent` `keyDown` `a` with
  modifiers 4 and `commands: ["selectAll"]`, or a
  triple-click in the field), type
  "Cut costs", and click Save once. PASS if the list
  re-renders with exactly "Cut costs". Every Save
  writes a revision row K30 shows verbatim: a smashed
  or repeated name is a driver artifact — note it,
  re-seed, and re-drive K3 before K30/K7. K30 and K7
  later confirm this rename resolves temporally.
  Pin: exploratory — the live modal, pre-fill, and
       re-render; `postObjectiveRevision` in
       client/objectives.ts (the write this Save
       triggers) carries no test today
```

- [ ] **Step 2: Extend K30.** Add a PASS bullet after
  "Baseline revisions appear as their own event rows
  (not collapsed)":

```
  - Each "Objective revised" row reads exactly a name
    K3 saved ("Cut costs"); a smashed name there is
    K3's typing, stored verbatim — re-seed and
    re-drive K3, not FAIL
```

and add before its `exploratory —` pin:

```
       tests/presenter-project-score-history.test.ts
       'revision event row shows the new objective
       name' (decides a revision row prints the name
       that revision saved, verbatim);
```

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Name K3's typing as K30's smashed names"
```

---

### Task 8: F13 — a double-click on a second node

**Root cause.** With the panel open, the first
pointerdown on another node changes the selection,
and the interaction callback
(`web-app/flows/detail.ts:1042-1081`) immediately
commits `withSelectionCentered()`, panning the camera
(`flow-designer.ts:772-778`). The node slides away
before the second press, which lands on empty canvas
and closes the panel (`open-panel false`). A person
double-clicking one spot meets the same thing as the
walk's driver did. The pressed node is under the
pointer, so it is already in view; it needs centring
only after the double-click opens the panel on it.

**Files:**
- Modify: `tests/browser/canvas-pan.test.ts`
- Modify: `web-app/flows/detail.ts` (`:1060-1089`)

- [ ] **Step 1: Write the failing Layer 2 test**

Append to `tests/browser/canvas-pan.test.ts` (every
name used is already imported or file-local there:
`withAdminPage`, `stays`, `openFlow`, `doubleClick`,
`nodeIdNamed`, `nodeSelector`, `ONBOARDING`,
`AUTO_FIT`, `STAY_MS`, `assertStrictEquals`):

```ts
Deno.test(
    'a double-click on a second node keeps the open'
    + ' panel on it (F13)',
    async () => {
        await withAdminPage(
            browser.get(),
            async (page, origin) => {
                await openFlow(page, origin, ONBOARDING);
                await page.click(AUTO_FIT);
                const review = await nodeIdNamed(
                    page, 'Review',
                );
                const capture = await nodeIdNamed(
                    page, 'Data Capture',
                );
                await doubleClick(
                    page, nodeSelector(review) + ' > rect',
                );
                await page.waitFor('#prop-node-name');
                const body =
                    nodeSelector(capture) + ' > rect';
                const at = await page.center(body);
                await page.press(at);
                await page.release(at);
                // The first press retargets the panel and
                // must not slide the node from under the
                // second.
                const still = await page.center(body);
                assertStrictEquals(still.x, at.x);
                assertStrictEquals(still.y, at.y);
                await page.press(at);
                await page.release(at);
                await page.until(
                    `document.querySelector(`
                    + `'#prop-node-name')?.value`
                    + ` === 'Data Capture'`,
                    'panel on Data Capture',
                );
                await stays(
                    page,
                    `document.querySelector(`
                    + `'.flow-props-panel') !== null`,
                    STAY_MS,
                );
            },
        );
    },
);
```

- [ ] **Step 2: Watch it fail**

`./test browser`. Expected: this test FAILS at the
`still.x` assertion (the camera re-centred on the
first press). If it fails elsewhere or passes, STOP
and report.

- [ ] **Step 3: Centre on the double-click, not the
  press**

In `web-app/flows/detail.ts`'s interaction callback,
replace the `if (prevSelected !== nowSelected …)`
block with:

```ts
            // A press selects the node under the pointer,
            // already in view; centring now would slide it
            // from under a double-click's second press.
            const isPressSelection =
                next.lastClick.kind === 'clicked'
                && next.lastClick.id === nowSelected;
            if (
                prevSelected !== nowSelected
                && nowSelected !== null
                && isPanelOpen
                && !isPressSelection
            ) {
                commit(
                    pageState.presenter()
                        .withSelectionCentered(),
                );
            }
```

and make the open-panel callback:

```ts
        (open) => {
            panelStateRef.open = open;
            const wasOpen = pageState.presenter()
                .snapshot().isPanelOpen;
            commit(
                pageState.presenter()
                    .withPanelOpen(open),
            );
            // Retargeting an open panel is no open
            // transition, so nothing has panned the new
            // node into view yet.
            if (open && wasOpen) {
                commit(
                    pageState.presenter()
                        .withSelectionCentered(),
                );
            }
            reconcileFitFromDom();
        },
```

If the test still fails at `still.x`, the first press
itself emits `open-panel true`: log the FSM actions
for the two presses (`flow-fsm-reduce.ts`
`onNodePointerDown`), report, and STOP — do not add a
timer.

- [ ] **Step 4: Watch it pass, then both gates**

`./test validate` exits 0; `./test browser` exits 0,
including every `canvas-keyboard` and `canvas-pan`
test.

- [ ] **Step 5: Commit**

```bash
git add web-app/flows/detail.ts \
    tests/browser/canvas-pan.test.ts
git commit -m "Centre a retargeted node after the double-click"
```

---

### Task 9: Unblock AA32, C6, F13, I22

Each case gets a recipe a hidden, CDP-driven tab can
execute. One commit per case.

**Files:**
- Modify: `TEST-PLAN.md` driving notes (`:191-192`,
  `:229-233`), AA32 (`:1178-1211`), C6 (`:1707-1709`),
  F13 (`:2766-2783`), I22 (`:6176-6182`)

- [ ] **Step 1: AA32.** The walk's press missed the
  port: it is a 5-unit circle on the widest gap of the
  node's perimeter, not the right-middle
  (`flow-graph.ts:220-270`); a miss starts a body-drag
  or marquee — neither edge nor node, exactly the walk.
  Replace the case body (keep its Pin line, adding no
  pin) with:

```
- [ ] **AA32** Hold Shift and drag from "Review"'s port
  onto "Data Capture". Aim by selector: the press
  point is the center of
  `.flow-node[aria-label="Review"] [data-connect-port]`'s
  `getBoundingClientRect()`, and
  `document.elementFromPoint` there must resolve
  `.closest('[data-connect-port]')`; the drop point is
  the center of
  `.flow-node[aria-label="Data Capture"] > rect`.
  Confirm `document.visibilityState === 'visible'`
  (the preview paints under `requestAnimationFrame`).
  Drive: `Input.dispatchKeyEvent` `rawKeyDown` Shift
  (code `ShiftLeft`, vk 16, modifiers 8);
  `mousePressed` at the press point (modifiers 8);
  eight `mouseMoved` steps to the drop point
  (`buttons` 1, modifiers 8). PASS: before release,
  `.flow-connect-preview path` carries
  `stroke-dasharray` — the dashed-orange curved bezier
  — because a forward path "Data Capture" → "Review"
  already exists and the release would close a loop.
  `mouseReleased` (modifiers 8), then `keyUp` Shift.
  PASS: `.flow-edge` count +1, `.flow-node` count
  unchanged. Rename the edge "needs revision". Repeat
  onto `.flow-node[aria-label="Archive"] > rect`.
  PASS: the preview path has no `stroke-dasharray`
  (solid blue, no return path); release adds one
  edge and no node. Rename it "approve". A pre-press
  `elementFromPoint` miss is re-aimed, not scored. If
  Shift is not observed on release (a node is added
  instead), record BLOCKED naming that.
```

Replace the Shift-drag driving note (`:229-233`):

```
- Shift-drag (AA32/F19/F23): press on the port
  circle's own rect (`[data-connect-port]`), never an
  eyeballed node edge; verify with `elementFromPoint`
  first. A miss is a body-drag or marquee, not Shift.
  If Shift is not delivered on pointer-up the FSM
  emits add-node; record BLOCKED naming that. Layer 1
  and Layer 2 pins decide add-edge. F23's mid-gesture
  Shift is the same compositor limit.
```

Commit: `git commit -m "Aim AA32's Shift-drag at the port"`

- [ ] **Step 2: C6.** The window is the scroller
  (`.main-content` has no overflow, `layout.css:152-158`;
  `#desktop-sidebar` is `position: fixed`,
  `:10-23`); CDP wheel and key input stall on an
  uncomposited tab. Replace C6 with:

```
- [ ] **C6** Scroll the dashboard at 1280×800. PASS:
  sidebar stays fixed, main content scrolls under it.
  The window is the scroller. CDP wheel and key
  scrolls stall on a tab that is not composited, so
  drive with `Runtime.evaluate`: record
  `#main-content`'s `getBoundingClientRect().top`,
  then `window.scrollTo(0, 400)`. PASS:
  `window.scrollY` is 400; `#desktop-sidebar`'s rect
  `top` is still 0; `#main-content`'s rect `top`
  dropped by exactly 400. Restore with
  `window.scrollTo(0, 0)`.
  Pin: exploratory — the sidebar's fixed position
       while the main content scrolls
```

Commit: `git commit -m "Drive C6's scroll by script"`

- [ ] **Step 3: F13.** After Task 8, a fixed-point
  double-click works. Replace the case's first three
  lines and add the Layer 2 pin:

```
- [ ] **F13** While the panel is open, double-click a
  *different* node (F11's drive), aiming at the
  center of `.flow-node[aria-label="<name>"] > rect`
  (the 160×64 body, not the label `text` or the `g`,
  whose box includes the port). PASS: panel content
  retargets to the new node and the canvas re-centres
  on it after the second press, not the first.
```

and add before its `exploratory —` pin:

```
       tests/browser/canvas-pan.test.ts 'a
       double-click on a second node keeps the open
       panel on it (F13)' (decides the first press
       does not move the node and the panel lands on
       it);
```

Commit: `git commit -m "Aim F13 at the node body"`

- [ ] **Step 4: I22.** `loadInto`
  (`web-app/app/loading-states.ts:211-271`) renders
  Try Again on any rejection; a 500 and a network
  failure take the same catch; a 401 drives refresh
  instead. Replace I22 with:

```
- [ ] **I22** Force a `loadInto()` fault on `ideas/`.
  Before navigating, `Fetch.enable` with one pattern,
  `*://localhost:*/api/organizations/*/ideas/` (the
  collection GET `getIdeas` makes inside `loadInto`).
  Never `/api/authentication/*`, and never a 401:
  that drives refresh, not the error state. Answer
  every `Fetch.requestPaused` with
  `Fetch.fulfillRequest`: `responseCode` 500, header
  `content-type: application/json`, `body`
  `eyJlcnJvciI6IndhbGstZm9yY2VkIGZhdWx0In0=` (base64
  of `{"error":"walk-forced fault"}`). PASS:
  `#ideas-list` shows "Something went wrong", the
  text "walk-forced fault", and a focused
  `[data-retry-btn]` "Try Again". Then `Fetch.disable`
  and click Try Again. PASS: a second GET of
  `…/ideas/` answers 200 and `[data-idea-card]` cards
  replace the error state.
  Pin: tests/loading-states.test.ts 'a rejecting
       fetch renders the error state and calls
       neither hook' (a rejected fetch renders a
       "Try Again" control and calls neither
       `onEmpty` nor `onData`); exploratory — the
       live forced fault and the retry re-fetch
```

Commit: `git commit -m "Force I22's fault with Fetch"`

---

### Task 10: Moor F37a, WB18, WB22, R22, SV3

One commit per case. Every test name below exists on
`3528f9b5`.

**Files:**
- Modify: `TEST-PLAN.md` (`:128-129`, `:237`, F37a
  `:3296-3311`, WB18 `:4591-4613`, WB22 `:4647-4658`,
  R22 `:7146-7155`, SV3 `:7223-7237`)

- [ ] **Step 1: F37a.** One jar cannot reach the 412:
  `putFlow` rings `fusion-angle:data`
  (`client/flow-mutations.ts:597-599`) and tab B
  re-GETs and latches the new head within one GET
  (`web-app/flows/detail.ts:1814-1919`).
  BroadcastChannel does not cross cookie jars, so a
  second jar keeps the stale head. Replace F37a with:

```
- [ ] **F37a** Open the flow in tab A. Mint a second
  cookie jar (`Target.createBrowserContext`, as SV6),
  sign in there as the same member, and open the same
  flow as tab B. In tab A, rename a node and let the
  `PUT …/flows/:id` land (`SAVE_DELAY_MS` = 800 ms).
  Tab B still shows the pre-edit name —
  BroadcastChannel does not cross cookie jars. In tab
  B, click Undo. PASS: tab B's network log shows
  `POST …/flows/:id/undo` 412, a `GET …/flows/:id`,
  then the undo POST 200; tab B repaints with tab A's
  rename reverted (one step back from the new head);
  no error toast, stuck spinner, console error, or
  "Something went wrong". Two tabs of one jar cannot
  show the 412: `fusion-angle:data` repaints tab B and
  latches the new head within one GET of tab A's save.
  Pin: tests/flow-undo-cursor.test.ts 'undo cursor: a
       412 on attempt 1 is absorbed — attempt 2
       succeeds with no client-side baseline refetch'
       (decides the client absorbs the 412 and the
       second attempt lands);
       tests/flow-undo-cursor.test.ts 'a stale undo
       tag is 412 from the statement' (decides the
       stale latch refuses and stores nothing);
       exploratory — the second jar's live staleness
       and the absence of any user-visible error
```

In the explorer prompt (`:128-129`), make the second
identity list `(SV6, SV7, SV10)` read
`(SV6, SV7, SV10) or a second jar of one identity
(F37a)`. In the F37b driving note (`:237`), change
"after F37a opens a second tab (born hidden)" to
"after F37a opens its second jar (born hidden)". The
extra sign-in counts against the 5-per-60 s auth
throttle; F37a's is its only one.

Commit: `git commit -m "Drive F37a's stale undo from a second jar"`

- [ ] **Step 2: WB18.** One jar is one member: the
  holder re-entering its own claim sends no claim PUT
  (`web-app/workbox/detail.ts:583-599`); the 409 is
  another member's (`api/work-order-version.ts:189-190`).
  The cited contention pin was renamed. Replace WB18
  with:

```
- [ ] **WB18** Open the workbox Active tab in two tabs
  of the same jar, on one unclaimed work order. In
  tab 1, click its row to claim it. PASS: tab 1's
  `PUT work-orders/:id/claim` answers 200; tab 2's
  inbox repaints the row as "In progress — {member}"
  without a reload (`fusion-angle:data`); tab 2's row
  click opens the editable action screen with no
  second claim PUT — a holder re-entering its own
  claim does not claim again. `GET
  work-orders/:id/history` (DESC; claim rows carry
  `field_values: []`) shows exactly one `'claimed'`
  event, none overwritten in place. One jar is one
  member; the 409 is another member's live claim.
  Pin: tests/presenter-workbox-detail.test.ts 'an
       active claim by the current member is reported
       as claimed with byCurrentMember' (decides the
       state the screen skips the claim on);
       tests/api-work-order-claim.test.ts 'a live
       claim by another member is a 409';
       tests/api-work-order-claim.test.ts 'two-actor
       contention: the second claim on a stale tag is
       412 and exactly one claimed event lands';
       exploratory — tab 2's live repaint and the
       absent second PUT
```

Commit: `git commit -m "Moor WB18 to the holder's re-entry"`

- [ ] **Step 3: WB22.** Replace WB22 with:

```
- [ ] **WB22** Inspect
  `web-app/app/presenters/workbox-inbox.ts`. PASS:
  `buildInboxItems` takes five parameters —
  `(workOrders, transitionsByWo, activeClaimsByWo,
  memberMap, mode)` — and no scope parameter. Its
  exports are `InboxItem`, `InboxMode`,
  `ActiveClaim`, `WorkboxInboxPresenter`, and
  `buildInboxItems`; none filters by user — the
  workbox shows all work orders to all users by
  construction.
  Pin: tests/workbox-inbox.test.ts calls
       `buildInboxItems` with exactly these five
       arguments, so AT1's `deno check` rejects any
       further required parameter; exploratory — the
       absence of a scope parameter is read from the
       source, since no `Deno.test` assertion inspects
       a signature
```

Commit: `git commit -m "Moor WB22 to the inbox signature"`

- [ ] **Step 4: R22.** No merge was ever specified:
  "merged" in the plan text meant the server's
  `set`/`clear` merge onto the latched head
  (ARCHITECTURE.md:293-298); a stale tag never rebases
  (`tests/api-instances-patch.test.ts` 'R9 …'). The
  412 path re-GETs and asks the user to re-apply
  (`web-app/records/detail.ts:620-667`). Replace R22
  with:

```
- [ ] **R22** Save a new instance, then open it in two
  tabs and edit it in both: change one field in the
  first tab and save, then change a different field
  in the second and save. PASS: the first save
  answers 200 and the list shows its edit over the
  stored values; the second tab, still in edit (the
  cross-tab bell reloads only a reading page), saves
  to 412, stays in edit, and refreshes every field to
  the stored values with the "This instance changed
  underneath you — values refreshed; re-apply your
  edit" notice and a warning toast. The second tab's
  edit is not merged in: the form sends every
  writable value, and a stale tag never rebases onto
  a newer head.
  Pin: tests/api-instances-patch.test.ts 'two
       writers, same If-Match → first 200, second
       412'; tests/api-instances-patch.test.ts 'R9:
       stale formed pair after head advance → 412 (no
       silent rebase onto newer head)';
       tests/api-instances-patch.test.ts 'PATCH stale
       If-Match → 412; re-GET + retry → 200';
       tests/presenter-record-instances.test.ts 'edit
       form surfaces 412 conflict notice';
       exploratory — the two live tabs, the re-GET
       repaint, and the toast
```

Commit: `git commit -m "Moor R22 to refuse-and-refresh"`

- [ ] **Step 5: SV3.** `publicTokenBody` is
  `{ token_type, expires_in }`
  (`api/authentication.ts:320-332`); the access token
  rides `authentication-info` (`:334-353`). Replace
  SV3's PASS sentence "the sign-in token response JSON
  has `access_token` and no `refresh_token`" with:

```
  the sign-in `POST /api/authentication/token`
  response JSON is `{ token_type: "Bearer",
  expires_in }` only — no `access_token`, no
  `refresh_token` — and the access token rides the
  `Authentication-Info` response header as
  `access_token="…"`.
```

and its Pin line with:

```
  Pin: tests/api-authentication-token.test.ts 'token
       JSON has no refresh_token; Set-Cookie is
       HttpOnly' (decides neither token is in the
       JSON, `access_token="` rides
       `authentication-info`, and the cookie's
       HttpOnly, Path, and SameSite); exploratory —
       the `Secure` attribute over plain `http://`,
       the DevTools `localStorage` inspection, and the
       body's exact two keys
```

Commit: `git commit -m "Moor SV3 to the Authentication-Info token"`

---

### Task 11: Gates and AT2

**Files:**
- Modify: `TEST-PLAN.md:459` (AT2)

- [ ] **Step 1: Layer 2 gate**

`./test validate browser`. Expected: exits 0. Record
the main suite's `ok | N passed | 0 failed | 11
ignored` and the timezone pass's line. N is 4125 plus
the tests Tasks 2, 4, and 5 added (1 + 2 + 2 = 4130)
unless a gate says otherwise — use the printed number.

- [ ] **Step 2: Moor AT2.** In `TEST-PLAN.md:459`
  replace `on 4 Oct \`./test\` printed \`ok | 4124
  passed | 0 failed | 11 ignored\`` with the date and
  line Step 1 printed. Nothing else on that line
  changes.

- [ ] **Step 3: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Record AT2's count after the walk remedies"
```

- [ ] **Step 4: Hand back.** Report the branch tip and
  both gate lines. Landing waits on
  `membership-and-versions` (AGENTS.md § Worktrees:
  rebase, `--ff-only`). The next Layer 3 walk re-seeds
  (`./deploy --local 8080 --postgres mock-data`) and
  re-drives all thirteen cases.

---

## Appendix — the walk's scored lines (2acbc87a)

```
AA32 BLOCKED — one Shift-drag from the Review port onto Data Capture (Shift keydown, mouse modifiers 8, release with modifiers 8) added neither an edge nor a New State node; no dashed-orange preview
C6 BLOCKED — sidebar is position:fixed (top 0, height 801) and the document is 1766px, but mouseWheel and mouseMoved CDP calls timed out under the display shield (visibilityState hidden) and PageDown/Space/ArrowDown left scrollY at 0, so independent content scroll was not observed
F13 BLOCKED — two pointerdowns aimed at Draft (reported center 672,527; click 672,523) missed the 18px-tall node and hit empty canvas, which closed the panel (no #prop-node-name) instead of retargeting; not retried
F30 FAIL — Auto Layout was turned off and its PUT landed before the rename; Panel B became Panel B F30 at 772ms and the flow PUT landed; after flows/index.html and back the switch was still off, the name, 18 nodes, 25 edges, and 0-attribute labels persisted, but every transform changed (Draft translate(-958.5, -747) came back translate(-964.5, -512.78))
F37a DRIFT — tab B had already repainted Sub F37a before Undo (same-origin refresh, not the pre-edit head); Undo then restored QR F37b with no toast, spinner, console exception, or Something went wrong
WB18 DRIFT — same-jar tabs: tab 1 claim of #go9CcHPa PUT 200; tab 2 already showed In progress — Tony Stark and its row click opened an editable Negotiation screen (won, revise terms, Release) with no second claim; history has exactly one claimed event w6fDFOoHMaX9AuCl6N5vIg and no in-place overwrite. The 409 pin is another member; this holder reopen is not a read-only rejection
WB22 DRIFT — buildInboxItems takes five parameters and no scope (workOrders, transitionsByWo, activeClaimsByWo, memberMap, mode); exports are InboxItem, InboxMode, ActiveClaim, WorkboxInboxPresenter, and buildInboxItems, nothing per-user. The plan names the middle two transitions and claims
I22 BLOCKED — no loadInto fault with a Try Again button occurred on the pages driven this pass, and the case says the explorer cannot force that fault live
K30 FAIL — history is chronological and score rows split correctly (Aug 26 baseline Lower expenses −65; Oct 4 actual Cut costs +11) with baselines on their own rows, but two Objective revised rows show smashed names Lower expenseCut costs and LCut costsCut costsower expenseCut costs instead of the name at that moment; no Something went wrong
R2 FAIL — Create Record on records/create.html (Name and Description, not a dialog) navigated to records/detail.html?id=zJ-7wSE-8W7q9K0Z_WTUVQ but that page showed Something went wrong: Not found record_types/zJ-7wSE-8W7q9K0Z_WTUVQ attributes under Wayne org BBjWJsjYIDkTRKIIPrzWRw, and the switcher flipped to Wayne Enterprises G40; back on Stark the card Walk R2 Record is last, under Customer Profile
R22 DRIFT — saved new instance qyDwSeVxdZC02R-rhRf7Ng (WalkR22Name / WalkR22Desc); tab A save of name WalkR22Fresh returned 200 and the list showed WalkR22Fresh plus WalkR22Desc; tab B save of description WalkR22Other returned 412, stayed in edit, and refreshed both fields to WalkR22Fresh / WalkR22Desc with the underneath-you notice; no merge of WalkR22Other and no Something went wrong
SV3 DRIFT — refresh_token cookie is HttpOnly, Path=/api/authentication, SameSite=Strict, Secure true on http://localhost; localStorage keys are fusion-angle:sidebar-collapsed, fusion-angle:theme, and fusion-angle:active-organization-id (no fusion-angle:authorization, no refresh_token); token JSON is token_type Bearer plus expires_in only, with access_token on Authentication-Info and no refresh_token in the JSON — the document says the JSON has access_token
AT2 DRIFT — main suite 4125 passed against the plan's 4124
```
