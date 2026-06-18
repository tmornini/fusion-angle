# Caller owns event identity and time Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the API caller — never the stack — the sole
minter of every domain state event's `id` and `at`, carried in
the request body, so a replayed write is a byte-identical
no-op and no retry is absorbed inside the stack.

**Architecture:** `StateStore.postEvent` stops self-stamping
`nowUtc()`. Expand-contract: add a parallel
`postEventAt(id, entityId, state, memberId, at)`, migrate every
composite route + its body validator + its web-app client +
its tests one commit at a time, then delete the self-stamping
`postEvent`. The flows-PUT `try/catch` (commit `3cfacce4`) is
deleted — replay is idempotent at the ledger once `at` is
caller-minted. Work-orders `claim` and the four invitation
events move their server-minted event ids to the caller too.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. Tests:
`node --test --strip-types` with `MemoryDbAdapter` and a real
`RequestContext`.

## Global Constraints

- 78-character max line length; 4-space indent; no inline styles.
- snake_case in storage, camelCase in domain.
- HTTP-verb adapter naming; validators at the gate;
  `RequestContext` is the first argument of adapter methods.
- The event AUTHOR (`member_id`) stays server-derived from the
  verified token (`actor` / `ctx.principal.id`) — NEVER
  caller-supplied. Only `id` and `at` move to the caller.
- Each new `at` is validated at the body gate with
  `validateTimestampField(body, '<field>', '<Label>')`
  (RFC-3339 zulu, the 6-digit width `nowUtc` mints).
- Client adapters mint `at` with `nowUtc()` (imported from
  `../../../api/types.ts`) and event ids with
  `generateCryptoSafeBase62()`
  (`../../../api/crypto-safe-base62.ts`).
- `./validate` GREEN after EVERY commit (tsc + `./test` +
  78-char lint + `generate-schema-svg --check`). A RED aborts.
- Commit subjects: present-tense imperative, ~50 chars, NO plan
  tag, with trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Linear history (rebase/fast-forward, never merge); main
  checkout, NO worktrees. Build forward from `3cfacce4`; do NOT
  revert it.
- Re-derive EVERY anchor by SYMBOL search — line numbers drift.
- Sandbox: prefix `./serve` with `TMPDIR=/tmp/claude`;
  `./validate` runs as-is.

## File Structure

- `api/db.ts` — `StateStore` interface gains `postEventAt`
  (T1); loses `postEvent` (T13).
- `api/store-state.ts` — `StateStore` impl: add `postEventAt`
  (T1); delete `postEvent` + the `nowUtc` import (T13).
- `api/store-parent-scoped.ts` — `ParentScopedStateStore`
  delegates `postEventAt` (T1); drops `postEvent` (T13).
- `api/routes.ts` — every `view.states.postEvent` call switches
  to `postEventAt` with a body `at` (T2–T10).
- `api/invitations-domain.ts` — 4 events: caller event id + at
  (T11).
- `api/org-requests.ts` — the `identity_default_organizations`
  PUT: caller row id + at (T12).
- `api/validators.ts` — each event-bearing body validator gains
  an `at` (and the claim/invitation bodies gain event ids).
- `web-app/app/adapters/*` + `web-app/app/presenters/
  flow-designer.ts` — each event-bearing client body mints + sends
  the `at` (and, for claim/invitations, the id).
- `tests/*` — every `postEvent`/route test gains an `at`.

## Migration pattern (applies to T2–T12)

Each migration task is ONE commit shaped the same way:

1. **RED** — extend the surface's test(s): the client body /
   route body now carries the `at` (and any new id); assert
   the event lands with that exact `at`. Run, watch it fail.
2. **Validator** — add the `at` key to the body's KEYS array,
   validate it with `validateTimestampField`, return it on the
   body interface.
3. **Route / domain helper** — switch `postEvent(…)` →
   `postEventAt(…, b.<atField>)`.
4. **Client** — mint `at: nowUtc()` (and id where it was
   server-minted) and add it to the request body.
5. **GREEN** — run the surface tests, then `./validate`.
6. **Commit.**

`postEvent` (self-stamping) stays callable until T13, so every
intermediate commit type-checks and passes.

---

### Task 1: Add the parallel `postEventAt` store method

**Files:**
- Modify: `api/db.ts` (`StateStore` interface)
- Modify: `api/store-state.ts` (`StateStore` impl)
- Modify: `api/store-parent-scoped.ts` (`ParentScopedStateStore`)
- Test: `tests/store-state.test.ts`

**Interfaces:**
- Consumes: existing `StateStore.put`, `LedgerImmutabilityError`.
- Produces: `postEventAt(id: Id, entityId: Id, state: string,
  memberId: Id, at: string): Promise<void>` on every
  `StateStore` implementor — appends one event row with the
  caller-supplied `at`. Identical-payload replay is a no-op;
  same id with a different payload throws
  `LedgerImmutabilityError`. (T2–T12 consume this.)

- [ ] **Step 1: Write the failing store tests**

In `tests/store-state.test.ts`, mirror the existing
`postEvent` tests. Add (re-derive the file's db/harness symbol;
the existing tests call `db.states.postEvent('s1','e1','a','w1')`):

```ts
const AT1 = '2026-01-01T00:00:00.000000Z';
const AT2 = '2026-01-01T00:00:00.000001Z';

test('postEventAt stamps the caller-supplied at', async () => {
    const db = new MemoryDbAdapter();
    await db.states.postEventAt('s1', 'e1', 'active', 'w1', AT1);
    const row = await db.states.getById('s1');
    assert.equal(row.at, AT1);
});

test('postEventAt replays identically as a no-op', async () => {
    const db = new MemoryDbAdapter();
    await db.states.postEventAt('s1', 'e1', 'active', 'w1', AT1);
    await db.states.postEventAt('s1', 'e1', 'active', 'w1', AT1);
    const all = await db.states.getAllFor('e1');
    assert.equal(all.length, 1);
});

test('postEventAt rejects a conflicting at on one id', async () => {
    const db = new MemoryDbAdapter();
    await db.states.postEventAt('s1', 'e1', 'active', 'w1', AT1);
    await assert.rejects(
        () => db.states.postEventAt('s1', 'e1', 'active', 'w1', AT2),
        (e) => e instanceof LedgerImmutabilityError,
    );
});
```

Ensure `MemoryDbAdapter` and `LedgerImmutabilityError` are
imported in the test file (add `LedgerImmutabilityError` from
`'../api/db.ts'` if absent).

- [ ] **Step 2: Run the store tests to verify they fail**

Run: `node --test --strip-types tests/store-state.test.ts`
Expected: FAIL — `postEventAt` is not a function.

- [ ] **Step 3: Add `postEventAt` to the `StateStore` interface**

In `api/db.ts`, in `interface StateStore`, immediately after
the `postEvent(...)` declaration, add:

```ts
    postEventAt(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
        at: string,
    ): Promise<void>;
```

- [ ] **Step 4: Implement `postEventAt` in the store**

In `api/store-state.ts`, immediately after `postEvent`, add:

```ts
    async postEventAt(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
        at: string,
    ): Promise<void> {
        await this.put(id, {
            entity_id: entityId,
            state,
            member_id: memberId,
            at,
        });
    }
```

- [ ] **Step 5: Delegate `postEventAt` in the parent-scoped store**

In `api/store-parent-scoped.ts`, in `ParentScopedStateStore`,
immediately after the `postEvent` delegation, add:

```ts
    postEventAt(
        id: Id,
        entityId: Id,
        state: string,
        memberId: Id,
        at: string,
    ): Promise<void> {
        return this.#inner.postEventAt(
            id, entityId, state, memberId, at,
        );
    }
```

If a `grep -rn "implements StateStore" api/` finds any other
implementor, add the same delegation there.

- [ ] **Step 6: Run the store tests to verify they pass**

Run: `node --test --strip-types tests/store-state.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the gate**

Run: `./validate`
Expected: GREEN.

- [ ] **Step 8: Commit**

```bash
git add api/db.ts api/store-state.ts api/store-parent-scoped.ts \
  tests/store-state.test.ts
git commit -m "$(printf 'Add the caller-timed postEventAt store method\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Write flows through PUT with a caller-minted at

Reworks commit `3cfacce4`: add `at` to the flows-PUT body and
DELETE the `try/catch` (replay is now a real ledger no-op).

**Files:**
- Modify: `api/validators.ts` (`validateFlowPutBody`,
  `FlowPutBody`, `FLOW_PUT_KEYS`)
- Modify: `api/routes.ts` (`route('flows/:id')` PUT)
- Modify: `web-app/app/adapters/flow-mutations.ts` (`putFlow`)
- Modify: `web-app/app/presenters/flow-designer.ts`
  (`#persistFlow`)
- Test: `tests/validators.test.ts`,
  `tests/adapters-flow-mutations.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1), `validateTimestampField`.
- Produces: `FlowPutBody` gains `at: string`; `PUT flows/:id`
  reads `b.at`.

- [ ] **Step 1: Write the failing replay test**

In `tests/adapters-flow-mutations.test.ts`, update the
existing "replays idempotently" test so the body carries a
fixed `at` and assert a TRUE no-op (no `try/catch` involved):

```ts
test(
    'PUT flows/:id replays identically as one updated event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const body = {
            flow: buildFlowBody({
                name: 'Replayed', isLocked: false,
                isAutoLayout: false, isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [], edges: [],
            }),
            eventId: 'fixed-ev',
            at: '2026-01-01T00:00:00.000000Z',
            history: { kind: 'none' },
        };
        await ctx.PUT('flows/flow-1', body);
        await ctx.PUT('flows/flow-1', body);
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/flow-1/history',
        );
        assert.equal(events.length, 2);
    },
);
```

In `tests/validators.test.ts`, extend a `validateFlowPutBody`
case to require `at`:

```ts
test('validateFlowPutBody rejects a missing at', () => {
    assert.throws(
        () => validateFlowPutBody({
            flow: {}, eventId: 'ev1', history: { kind: 'none' },
        }),
        /at/,
    );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --strip-types
tests/adapters-flow-mutations.test.ts tests/validators.test.ts`
Expected: FAIL — `at` is an unexpected key (assertOnlyKeys),
then later a missing-`at` validation gap.

- [ ] **Step 3: Add `at` to the flows-PUT body validator**

In `api/validators.ts`, in `FLOW_PUT_KEYS` add `'at'`; on
`interface FlowPutBody` add `readonly at: string;`; in
`validateFlowPutBody`, after the `eventId` check, add:

```ts
    const at = validateTimestampField(
        body, 'at', 'FlowPutBody',
    );
```

and include `at` in the returned object.

- [ ] **Step 4: Thread `at` and delete the try/catch in the route**

In `api/routes.ts`, in `route('flows/:id')` PUT, replace the
`postEvent` + `try/catch` block with:

```ts
                    await view.states.postEventAt(
                        b.eventId, id, 'updated', actor, b.at,
                    );
```

Delete the surrounding `try { … } catch (e) { … }`. If
`LedgerImmutabilityError` is now unused in `routes.ts`, remove
its import.

- [ ] **Step 5: Mint `at` at the two flow client call sites**

In `web-app/app/adapters/flow-mutations.ts` `putFlow`, add
`at: nowUtc(),` to the PUT body (import `nowUtc` if absent). In
`web-app/app/presenters/flow-designer.ts` `#persistFlow`, add
`at: nowUtc(),` to the PUT body.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test --strip-types
tests/adapters-flow-mutations.test.ts tests/validators.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the gate**

Run: `./validate`
Expected: GREEN.

- [ ] **Step 8: Commit**

```bash
git add api/validators.ts api/routes.ts \
  web-app/app/adapters/flow-mutations.ts \
  web-app/app/presenters/flow-designer.ts \
  tests/validators.test.ts tests/adapters-flow-mutations.test.ts
git commit -m "$(printf 'Time the flows PUT event from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Time the flow undo/redo events from the caller

**Files:**
- Modify: `api/validators.ts` (`FlowUndoBody`, `FlowRedoBody`,
  their KEYS + validators)
- Modify: `api/routes.ts` (`route('flows/:id/undo')`,
  `route('flows/:id/redo')`)
- Modify: the web-app client that POSTs undo/redo (re-derive by
  symbol: search `flows/${…}/undo` and `/redo` under
  `web-app/app/`)
- Test: `tests/validators.test.ts`,
  `tests/adapters-flow-mutations.test.ts` (or the undo/redo
  test file — re-derive)

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: `FlowUndoBody`/`FlowRedoBody` gain `at: string`.

- [ ] **Step 1: Write the failing test**

In the undo/redo route test, send `at` in the body and assert
the `'updated'` event carries it:

```ts
test('undo posts the updated event at the caller time', async () => {
    const { ctx } = await setupMemDb();
    await createBaseFlow(ctx, 'flow-1');
    // … seed a version to consume …
    await ctx.POST('flows/flow-1/undo', {
        flow: buildFlowBody({ /* … */ }),
        eventId: 'undo-ev',
        at: '2026-01-02T00:00:00.000000Z',
        consumedVersionId: 'ver-1',
    });
    const events = await ctx.GET<StateEntity[]>(
        'entity-states/flow-1/history',
    );
    assert.equal(
        events.at(-1)!.at, '2026-01-02T00:00:00.000000Z',
    );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types <the undo/redo test file>`
Expected: FAIL — `at` is an unexpected key.

- [ ] **Step 3: Add `at` to both validators**

In `api/validators.ts`, add `'at'` to `FLOW_UNDO_KEYS` and
`FLOW_REDO_KEYS`; add `readonly at: string;` to `FlowUndoBody`
and `FlowRedoBody`; in each validator add
`const at = validateTimestampField(body, 'at', '<Label>');`
and return it.

- [ ] **Step 4: Thread `at` in both routes**

In `api/routes.ts`, in `route('flows/:id/undo')` and
`route('flows/:id/redo')`, change the `postEvent(b.eventId, id,
'updated', actor)` call to
`postEventAt(b.eventId, id, 'updated', actor, b.at)`.

- [ ] **Step 5: Mint `at` in the undo/redo client**

In the undo/redo client adapter(s), add `at: nowUtc(),` to each
POST body.

- [ ] **Step 6: Run the test, then the gate**

Run: `node --test --strip-types <the undo/redo test file>`
then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time flow undo and redo from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: Time the flow-create event from the caller

**Files:**
- Modify: `api/validators.ts` (the flows-create body validator
  that reads `initialStateEventId` — re-derive its symbol +
  KEYS)
- Modify: `api/routes.ts` (`route('flows')` POST)
- Modify: `web-app/app/adapters/flow-mutations.ts`
  (`postFlowCreation`)
- Modify: `web-app/app/adapters/flow-export.ts` (the import
  paths that build a flow-create body with `initialStateEventId`)
- Test: `tests/api-flows-create.test.ts`,
  `tests/adapters-*` for flows

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: the flows-create body gains `initialStateAt: string`.

- [ ] **Step 1: Write the failing test**

In `tests/api-flows-create.test.ts`, send `initialStateAt` and
assert the initial event carries it:

```ts
test('flow create stamps the caller initialStateAt', async () => {
    // POST /flows with { id, …, initialState,
    //   initialStateEventId, initialStateAt: AT }
    // then GET entity-states/<id>/history and assert .at === AT
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types tests/api-flows-create.test.ts`
Expected: FAIL — `initialStateAt` is an unexpected key.

- [ ] **Step 3: Add `initialStateAt` to the validator**

Add `'initialStateAt'` to the flows-create KEYS; add it to the
body interface; validate with
`validateTimestampField(body, 'initialStateAt', '<Label>')`.

- [ ] **Step 4: Thread `at` in the route**

In `route('flows')` POST, change `postEvent(b.initialStateEventId,
b.id, b.initialState, actor)` to
`postEventAt(b.initialStateEventId, b.id, b.initialState,
actor, b.initialStateAt)`.

- [ ] **Step 5: Mint `at` in the clients**

In `flow-mutations.ts` `postFlowCreation`, add
`initialStateAt: nowUtc(),` to the POST body. In
`flow-export.ts`, add `initialStateAt: nowUtc(),` everywhere it
builds a flow-create body.

- [ ] **Step 6: Run the test, then the gate**

Run: `node --test --strip-types tests/api-flows-create.test.ts`
then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the flow-create event from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 5: Time the idea create + conversion events

**Files:**
- Modify: `api/validators.ts` (`validateIdeaCreateBody` +
  `IDEA_CREATE_KEYS`; `validateIdeaConversionBody` +
  `IDEA_CONVERSION_KEYS`)
- Modify: `api/routes.ts` (`route('ideas')`,
  `route('ideas/:id/conversion')`)
- Modify: `web-app/app/adapters/ideas.ts` (`postIdeaCreation`,
  `postIdeaConversion`)
- Test: `tests/api-ideas-create.test.ts`,
  `tests/api-idea-conversion.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: `IdeaCreateBody` gains `initialStateAt`;
  `IdeaConversionBody` gains `ideaStateAt`, `projectStateAt`.

- [ ] **Step 1: Write the failing tests**

In `tests/api-ideas-create.test.ts` assert the create event
carries a caller `initialStateAt`; in
`tests/api-idea-conversion.test.ts` assert BOTH the idea
(`ideaStateAt`) and project (`projectStateAt`) events carry
their caller times.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --strip-types tests/api-ideas-create.test.ts
tests/api-idea-conversion.test.ts`
Expected: FAIL — unexpected keys.

- [ ] **Step 3: Add the `at` fields to both validators**

`validateIdeaCreateBody`: add `'initialStateAt'` to
`IDEA_CREATE_KEYS`, validate + return it.
`validateIdeaConversionBody`: add `'ideaStateAt'`,
`'projectStateAt'` to `IDEA_CONVERSION_KEYS`, validate + return
both.

- [ ] **Step 4: Thread `at` in both routes**

`route('ideas')`: `postEventAt(b.initialStateEventId, b.id,
b.initialState, actor, b.initialStateAt)`.
`route('ideas/:id/conversion')`: the idea event uses
`b.ideaStateAt`, the project event uses `b.projectStateAt`.

- [ ] **Step 5: Mint `at` in the client**

`postIdeaCreation`: add `initialStateAt: nowUtc(),`.
`postIdeaConversion`: reuse the existing `const at = nowUtc();`
(it already mints one) — pass it as both `ideaStateAt: at,` and
`projectStateAt: at,` IF the two events may share a moment;
otherwise mint two distinct `nowUtc()` values (the idea event
precedes the project event — mint idea first).

- [ ] **Step 6: Run the tests, then the gate**

Run: `node --test --strip-types tests/api-ideas-create.test.ts
tests/api-idea-conversion.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the idea create and conversion events\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 6: Time the record-create event from the caller

**Files:**
- Modify: `api/validators.ts` (`validateRecordWriteBody` create
  branch + `RECORD_WRITE_CREATE_KEYS`)
- Modify: `api/routes.ts` (the record-write helper —
  `postRecordWrite`, the `kind === 'create'` `postEvent`)
- Modify: `web-app/app/adapters/records.ts` (the `kind:'create'`
  body builder, ~line 234)
- Test: `tests/api-records-write.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: `RecordWriteCreateBody` gains `initialStateAt`.

- [ ] **Step 1: Write the failing test**

In `tests/api-records-write.test.ts`, send `initialStateAt` on
a create and assert the record's initial event carries it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types tests/api-records-write.test.ts`
Expected: FAIL — `initialStateAt` unexpected.

- [ ] **Step 3: Add `initialStateAt` to the create validator**

In `RECORD_WRITE_CREATE_KEYS`, add `'initialStateAt'`. In the
`kind === 'create'` branch of `validateRecordWriteBody`, add
`const initialStateAt = validateTimestampField(body,
'initialStateAt', 'RecordWriteCreateBody');` and include it in
the returned object; add `readonly initialStateAt: string;` to
the create body type.

- [ ] **Step 4: Thread `at` in the helper**

In the record-write helper, change `postEvent(body.
initialStateEventId, body.id, body.initialState, actor)` to
`postEventAt(body.initialStateEventId, body.id,
body.initialState, actor, body.initialStateAt)`.

- [ ] **Step 5: Mint `at` in the client**

In `web-app/app/adapters/records.ts`, in the `kind:'create'`
body, add `initialStateAt: nowUtc(),`.

- [ ] **Step 6: Run the test, then the gate**

Run: `node --test --strip-types tests/api-records-write.test.ts`
then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the record-create event from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 7: Time the member-create events from the caller

**Files:**
- Modify: `api/validators.ts` (`validateAIMemberCreateBody` +
  `AI_MEMBER_CREATE_KEYS`; `validateHumanMemberCreateBody` +
  `HUMAN_MEMBER_CREATE_KEYS`)
- Modify: `api/routes.ts` (`route('ai-members')`,
  `route('human-members')`)
- Modify: `web-app/app/adapters/ai-members.ts`
  (`postAIMemberCreation`),
  `web-app/app/adapters/members.ts` (`postHumanMemberCreation`)
- Test: `tests/api-ai-members.test.ts`,
  `tests/api-human-members.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: both member-create bodies gain `initialStateAt`.

- [ ] **Step 1: Write the failing tests**

In each test, send `initialStateAt` and assert the member's
initial event carries it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --strip-types tests/api-ai-members.test.ts
tests/api-human-members.test.ts`
Expected: FAIL — unexpected key.

- [ ] **Step 3: Add `initialStateAt` to both validators**

Add `'initialStateAt'` to `AI_MEMBER_CREATE_KEYS` and
`HUMAN_MEMBER_CREATE_KEYS`; validate + return on both bodies.

- [ ] **Step 4: Thread `at` in both routes**

Each: `postEventAt(b.initialStateEventId, b.id, b.initialState,
actor, b.initialStateAt)`.

- [ ] **Step 5: Mint `at` in both clients**

`postAIMemberCreation` and `postHumanMemberCreation`: add
`initialStateAt: nowUtc(),` (import `nowUtc`).

- [ ] **Step 6: Run the tests, then the gate**

Run: `node --test --strip-types tests/api-ai-members.test.ts
tests/api-human-members.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the member-create events from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 8: Time the work-order-create events from the caller

**Files:**
- Modify: `api/validators.ts` (`validateWorkOrderCreateBody` +
  `WORK_ORDER_CREATE_KEYS`)
- Modify: `api/routes.ts` (`route('work-orders')` POST loop)
- Modify: `web-app/app/adapters/work-orders-mutations.ts`
  (`postWorkOrderCreation`)
- Test: `tests/api-work-orders-create.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: the create body gains `stateEventAts: string[]`
  (length 3, parallel to `stateEventIds`).

- [ ] **Step 1: Write the failing test**

Send `stateEventAts: [AT0, AT1, AT2]` and assert each of the 3
work-order events carries its matching `at`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types
tests/api-work-orders-create.test.ts`
Expected: FAIL — `stateEventAts` unexpected.

- [ ] **Step 3: Add `stateEventAts` to the validator**

Add `'stateEventAts'` to `WORK_ORDER_CREATE_KEYS`. Validate it
as an array of exactly 3 timestamps (mirror the existing
`stateEventIds` array + length-3 checks, calling
`validateTimestampField` per element via a local index label,
e.g. `'WorkOrderCreateBody.stateEventAts[' + i + ']'`). Return
`stateEventAts: string[]` on the body.

- [ ] **Step 4: Thread `at` in the route loop**

In the create loop, change
`postEvent(b.stateEventIds[i]!, b.id, b.states[i]!, actor)` to
`postEventAt(b.stateEventIds[i]!, b.id, b.states[i]!, actor,
b.stateEventAts[i]!)`.

- [ ] **Step 5: Mint `at` in the client**

In `postWorkOrderCreation`, add
`stateEventAts: [nowUtc(), nowUtc(), nowUtc()],` to the POST
body (alongside `stateEventIds`). If `flow-export.ts` builds a
work-order-create body, add the same there.

- [ ] **Step 6: Run the test, then the gate**

Run: `node --test --strip-types
tests/api-work-orders-create.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the work-order-create events from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 9: Mint the work-order claim event ids + at on the caller

The claim route ignores its body and server-mints BOTH claim
event ids today. The caller now mints `claimed` AND the
speculative `claim_expired` (consumed only on a stale prior);
the `claim_expired` AUTHOR stays `prior.member_id`.

**Files:**
- Modify: `api/validators.ts` (NEW `validateWorkOrderClaimBody`
  + `WORK_ORDER_CLAIM_KEYS`)
- Modify: `api/routes.ts` (`route('work-orders/:id/claim')`)
- Modify: `web-app/app/adapters/work-orders-mutations.ts`
  (`postWorkOrderClaim`)
- Test: `tests/api-work-order-claim.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1), `validateTimestampField`.
- Produces: `WorkOrderClaimBody { claimEventId: string;
  claimAt: string; expireEventId: string; expireAt: string }`.

- [ ] **Step 1: Write the failing tests**

```ts
test('claim stamps the caller-minted claimed id + at', async () => {
    // POST work-orders/<id>/claim with
    //   { claimEventId, claimAt, expireEventId, expireAt }
    // assert the latest event id === claimEventId and
    //   .at === claimAt and .state === 'claimed'
});

test('claim over a stale prior consumes the expire pair', async () => {
    // seed a stale 'claimed', then claim again; assert a
    //   'claim_expired' event with id === expireEventId,
    //   at === expireAt, member_id === the prior claimant
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --strip-types
tests/api-work-order-claim.test.ts`
Expected: FAIL — the route ignores the body / no claim ids land.

- [ ] **Step 3: Add the claim body validator**

In `api/validators.ts` add:

```ts
const WORK_ORDER_CLAIM_KEYS: readonly string[] = [
    'claimEventId', 'claimAt', 'expireEventId', 'expireAt',
];

export interface WorkOrderClaimBody {
    readonly claimEventId: string;
    readonly claimAt: string;
    readonly expireEventId: string;
    readonly expireAt: string;
}

export function validateWorkOrderClaimBody(
    body: Record<string, unknown>,
): WorkOrderClaimBody {
    assertOnlyKeys(body, WORK_ORDER_CLAIM_KEYS,
        'WorkOrderClaimBody');
    const claimEventId = pickString(body, 'claimEventId');
    const expireEventId = pickString(body, 'expireEventId');
    if (claimEventId === '' || expireEventId === '') {
        throw new ValidationError(
            'WorkOrderClaimBody ids must be non-empty',
        );
    }
    const claimAt = validateTimestampField(
        body, 'claimAt', 'WorkOrderClaimBody');
    const expireAt = validateTimestampField(
        body, 'expireAt', 'WorkOrderClaimBody');
    return { claimEventId, claimAt, expireEventId, expireAt };
}
```

- [ ] **Step 4: Consume the body in the claim route**

In `route('work-orders/:id/claim')`, validate the body
(`const b = validateWorkOrderClaimBody(body);`) and switch both
events to `postEventAt`:

```ts
                    if (prior !== null
                        && prior.state === 'claimed') {
                        await view.states.postEventAt(
                            b.expireEventId, workOrderId,
                            'claim_expired', prior.member_id,
                            b.expireAt,
                        );
                    }
                    await view.states.postEventAt(
                        b.claimEventId, workOrderId,
                        'claimed', actor, b.claimAt,
                    );
```

(The `_body` parameter becomes `body`.)

- [ ] **Step 5: Mint ids + at in the client**

In `postWorkOrderClaim`, send:

```ts
    await ctx.POST(`work-orders/${workOrderId}/claim`, {
        claimEventId: generateCryptoSafeBase62(),
        claimAt: nowUtc(),
        expireEventId: generateCryptoSafeBase62(),
        expireAt: nowUtc(),
    });
```

(mint `claimAt` BEFORE `expireAt`? No — the expire precedes the
claim; mint `expireAt` first so it orders earlier, then
`claimAt`.)

- [ ] **Step 6: Run the tests, then the gate**

Run: `node --test --strip-types
tests/api-work-order-claim.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Mint work-order claim event ids on the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 10: Time the work-order transition events from the caller

**Files:**
- Modify: `api/validators.ts` (`validateWorkOrderTransitionBody`
  + its KEYS + the release sub-object keys)
- Modify: `api/routes.ts` (`route('work-orders/:id/transition')`)
- Modify: `web-app/app/adapters/work-orders-mutations.ts`
  (`postWorkOrderTransition`)
- Test: `tests/api-work-order-transition.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: the transition body gains `transitionAt`; its
  `release` object gains `at`.

- [ ] **Step 1: Write the failing test**

Send `transitionAt` (and, for the release case, `release.at`)
and assert each event carries its caller time.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types
tests/api-work-order-transition.test.ts`
Expected: FAIL — `transitionAt` unexpected.

- [ ] **Step 3: Add `at` to the validator**

Add `'transitionAt'` to the transition KEYS; validate +
return. In the release sub-object validation, add `'at'` to its
key set and validate it with `validateTimestampField`.

- [ ] **Step 4: Thread `at` in the route**

`postEventAt(b.transitionEventId, workOrderId, b.targetState,
actor, b.transitionAt)`; and for the optional release,
`postEventAt(b.release.id, workOrderId, b.release.state, actor,
b.release.at)`.

- [ ] **Step 5: Mint `at` in the client**

In `postWorkOrderTransition`, add `transitionAt: nowUtc(),` and,
in the release object, `at: nowUtc(),`.

- [ ] **Step 6: Run the test, then the gate**

Run: `node --test --strip-types
tests/api-work-order-transition.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Time the work-order transition events from the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 11: Mint the invitation event ids + at on the caller

`grantInvitation`, `acceptInvitation`, `declineInvitation`,
`revokeInvitation` each server-mint the state-event id and
self-stamp `at`. Move both to the caller. The invitation
entity id (`grant`) and the membership id (`accept`) are ALSO
caller-minted here (per the "caller mints all domain ids"
rule): the stack minting them means a retried grant/accept
writes a SECOND invitation/membership at a fresh id — a
duplicate entity no uniqueness check catches. Caller-minted
ids make the retry a same-row no-op. Author (`member_id`)
stays server-derived.

**Files:**
- Modify: `api/invitations-domain.ts` (the 4 domain functions)
- Modify: `api/validators.ts` (the invitation request body
  validators / facade — re-derive the symbols the
  `api.ts` invitations facade calls)
- Modify: `web-app/app/adapters/invitations.ts`
  (`postInvitationGrant`, `postInvitationAcceptance`,
  `postInvitationDecline`, `postInvitationRevocation`)
- Test: `tests/adapters-invitations.test.ts`,
  `tests/api-invitations-fence.test.ts`

**Interfaces:**
- Consumes: `postEventAt` (T1).
- Produces: grant body `{ email, invitationId, grantEventId,
  grantAt }`; accept body `{ membershipId, acceptEventId,
  acceptAt }`; decline body `{ declineEventId, declineAt }`;
  revoke body `{ revokeEventId, revokeAt }`.

- [ ] **Step 1: Write the failing tests**

In `tests/adapters-invitations.test.ts`, for each of grant /
accept / decline / revoke, send the caller ids + `at` and
assert: the lifecycle event carries the caller event id + `at`;
a replay of the SAME body is a no-op (one event); grant/accept
create the entity at the caller-minted entity id.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --strip-types
tests/adapters-invitations.test.ts`
Expected: FAIL — server still mints ids; bodies lack the fields.

- [ ] **Step 3: Add the caller ids + at to the validators**

For each invitation request body, add the matching keys
(`grantEventId`/`grantAt`, etc., plus `invitationId` on grant
and `membershipId` on accept) to its KEYS, validate the ids
non-empty and the `at` via `validateTimestampField`, return
them.

- [ ] **Step 4: Thread ids + at in the 4 domain functions**

In `api/invitations-domain.ts`, replace each
`generateCryptoSafeBase62()` event-id mint + `nowUtc()` stamp
with the caller-supplied values, and switch `postEvent(eventId,
invitationId, state, author)` to `postEventAt(eventId,
invitationId, state, author, at)`. Use the caller-supplied
`invitationId` (grant) and `membershipId` (accept) for the
entity writes.

- [ ] **Step 5: Mint ids + at in the client**

In `web-app/app/adapters/invitations.ts`, each function mints
its event id + `at` (and grant/accept the entity id) with
`generateCryptoSafeBase62()` / `nowUtc()` and sends them.

- [ ] **Step 6: Run the tests, then the gate**

Run: `node --test --strip-types
tests/adapters-invitations.test.ts
tests/api-invitations-fence.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(printf 'Mint invitation event ids on the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 12: Mint the default-org ledger row id + at on the caller

`identityDefaultOrgRequest` writes the
`identity_default_organizations` ledger via a direct `put` with
a server-minted row id + `nowUtc()`. Move both to the caller.
(This surface uses `put`, not `postEvent`.)

**Files:**
- Modify: `api/org-requests.ts` (`identityDefaultOrgRequest`
  PUT branch)
- Modify: `api/validators.ts`
  (`validateIdentityDefaultOrganizationEntity` /
  `IDENTITY_DEFAULT_ORG_BODY_KEYS`)
- Modify: `web-app/app/adapters/identity-default-org.ts`
  (`putIdentityDefaultOrg`)
- Test: `tests/api-identity-default-org.test.ts`,
  `tests/adapters-identity-default-org.test.ts`

**Interfaces:**
- Consumes: `validateTimestampField`.
- Produces: the body gains `eventId` (row id) + `at`.

- [ ] **Step 1: Write the failing test**

Send `{ eventId, organization_id, at }` and assert the persisted
`identity_default_organizations` row has `id === eventId` and
`at === <sent at>`; a replay with the same `eventId`+`at` is a
no-op.

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test --strip-types
tests/api-identity-default-org.test.ts`
Expected: FAIL — the route ignores `eventId`/`at` and mints them.

- [ ] **Step 3: Accept `eventId` + `at` from the body**

In `api/org-requests.ts` PUT branch, read `eventId` and `at`
from the parsed body (validate `eventId` non-empty and `at`
via `validateTimestampField`), and change the put to:

```ts
        await ctx.base.identityDefaultOrganizations.put(
            eventId, {
                identity_id: identityId,
                organization_id: org,
                at,
            });
```

Add `'eventId'` to `IDENTITY_DEFAULT_ORG_BODY_KEYS` if the body
flows through `validateIdentityDefaultOrganizationEntity`;
otherwise validate inline as above.

- [ ] **Step 4: Mint id + at in the client**

In `putIdentityDefaultOrg`, send
`{ eventId: generateCryptoSafeBase62(), organization_id: org,
at: nowUtc() }` (import both helpers).

- [ ] **Step 5: Run the test, then the gate**

Run: `node --test --strip-types
tests/api-identity-default-org.test.ts
tests/adapters-identity-default-org.test.ts` then `./validate`
Expected: PASS, then GREEN.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(printf 'Mint the default-org ledger row on the caller\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 13: Delete the self-stamping `postEvent`

After T2–T11 no route or domain helper calls `postEvent`.
Remove it so the stack can never self-stamp a state event again.

**Files:**
- Modify: `api/db.ts` (`StateStore` interface)
- Modify: `api/store-state.ts` (impl + `nowUtc` import)
- Modify: `api/store-parent-scoped.ts` (delegation)
- Test: every test that still calls `db.states.postEvent(...)`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — `postEvent` is gone; `postEventAt` is the
  sole event-append method.

- [ ] **Step 1: Confirm there is no production caller**

Run: `grep -rn "\.postEvent(" api/`
Expected: hits ONLY the interface/impl/delegation declarations.
If any route/helper still calls it, that surface's task is
incomplete — STOP and finish it first.

- [ ] **Step 2: Migrate the remaining TEST callers**

Run: `grep -rln "\.postEvent(" tests/` and, in each, change
`postEvent(id, entityId, state, member)` to
`postEventAt(id, entityId, state, member, <an at>)` — use a
fixed RFC-3339 zulu literal (e.g. `'2026-01-01T00:00:00.000000Z'`),
distinct per event where order matters. These are fixtures, not
behavior covenants — do not weaken any assertion.

- [ ] **Step 3: Delete `postEvent`**

Remove the `postEvent` declaration from `api/db.ts`, the method
from `api/store-state.ts` (and the now-unused `nowUtc` import),
and the delegation from `api/store-parent-scoped.ts` (and any
other `implements StateStore`).

- [ ] **Step 4: Run the gate**

Run: `./validate`
Expected: GREEN — tsc confirms nothing references `postEvent`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "$(printf 'Delete the self-stamping postEvent\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 14: Rename `postEventAt` to `postEvent` (pure rename)

`postEventAt` is now the only event-append method; restore the
intention-revealing name. PURE rename — no behavior change, no
content change in the same commit.

**Files:**
- Modify: `api/db.ts`, `api/store-state.ts`,
  `api/store-parent-scoped.ts`, `api/routes.ts`,
  `api/invitations-domain.ts`, all `tests/*` and any other
  caller.

**Interfaces:**
- Produces: `postEvent(id, entityId, state, memberId, at)` — the
  final, caller-timed signature.

- [ ] **Step 1: Rename every occurrence**

Run a project-wide rename of the symbol `postEventAt` →
`postEvent` across `api/` and `tests/` (re-derive the call set
with `grep -rn "postEventAt" api/ tests/`). Change nothing else.

- [ ] **Step 2: Run the gate**

Run: `./validate`
Expected: GREEN.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "$(printf 'Rename postEventAt to postEvent\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Manual browser regression (after Task 14)

Per the spec, drive `TMPDIR=/tmp/claude ./serve 8080` as a
member-role user and confirm via the UI:
- Save a flow (plain) → reload → graph round-trips; a normal
  repeat save does not 409.
- Save with a version snapshot → a new version appears.
- Undo and redo still work.
- Create a work order, claim it, let a claim expire and
  re-claim → the `claim_expired` + `claimed` events land,
  ordered.
- Convert an idea to a project → both lifecycle events land.
- Every state event reads back with the caller's `at`.

## Self-Review

**Spec coverage:**
- `postEvent` takes `at`; `nowUtc` leaves the stack — T1
  (`postEventAt`) + T13/T14 (contract + rename). ✓
- Minimal-additive carriage, full naming map — T2–T10
  (`at`/`initialStateAt`/`ideaStateAt`/`projectStateAt`/
  `stateEventAts`/`transitionAt`/`release.at`) +
  T9 (`claimEventId`/`claimAt`/`expireEventId`/`expireAt`). ✓
- Work-orders claim mints ids client-side, expire speculative,
  author stays `prior.member_id` — T9. ✓
- No in-stack retry: flows-PUT `try/catch` deleted — T2. ✓
- Validate `at` at the gate via `validateTimestampField` — every
  migration task. ✓
- Ordering preserved (distinct, increasing `at` per event;
  client `nowUtc()`) — T5/T8/T9 mint per event. ✓
- Exclusions (auth secrets, mock-data seed, request-id
  fallback) — no task touches them. ✓
- Expand-contract, no defaulted `at`, build forward from
  `3cfacce4` — T1 (parallel method) → T2–T12 → T13 → T14. ✓
- Invitations/org-requests caller-supplied — T11/T12. ✓

**Resolved (per directive — "caller mints all domain ids,
period"):** T11 caller-mints the invitation entity id (grant)
and membership id (accept) alongside the event ids; otherwise a
retried grant/accept writes a second, unintended entity at a
fresh id. The ONLY server-minted ids that remain are auth
secrets (`authentication.ts`) by OAuth design, and dev seeding
(`mock-data.ts`) — neither is a caller-driven domain write.
Verified: no other `api/` surface server-mints a domain id.

**Placeholder scan:** Code steps carry the actual new
lines/fields; surfaces whose exact current symbol drifts
(undo/redo client, flows-create validator name) are named by
re-derivable symbol with the precise delta, per the Global
Constraint to re-derive anchors — not "TBD". ✓

**Type consistency:** `postEventAt(id, entityId, state,
memberId, at)` is used identically in T2–T12; the `at` field
names match the spec map across validator, route, and client in
every task; `validateTimestampField(body, field, label)` is the
single `at` gate everywhere. ✓

---

## Follow-up considerations (out of arc scope)

Surfaced during the manual browser regression — NOT part of the
caller-owns-event-time arc; recorded here so they are not lost.

### Flow-designer toolbar accessibility — INVESTIGATED, benign

Observed then resolved during the regression. A first
accessibility-tree read of the designer returned `main` with NO
interactive descendants, while a direct DOM query found the
toolbar buttons present with `aria-label`s — which looked like a
screen-reader reachability gap.

Re-read AFTER the canvas finished mounting: the full toolbar
surfaces correctly in the accessibility tree — Back, Flow
statistics, the record combobox, the Locked / Auto Layout / Auto
Fit controls as `switch` roles, and Undo / Redo / Zoom in/out /
Copy Mermaid / Export ZIP / Delete as named `button`s. So the
initial absence was a RENDER-TIMING ARTIFACT (the read ran before
the async canvas/toolbar mounted), NOT a defect: roles and
accessible names are present and correct.

No code fix needed. Lower-priority due diligence, if ever wanted:
a real keyboard-Tab traversal + screen-reader pass over the
designer, since the Office of the Interface makes screen-reader
affordance a gate of entry — but the automated affordances
(roles + labels) are already in place.
