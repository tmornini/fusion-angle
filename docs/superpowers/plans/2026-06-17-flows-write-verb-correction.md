# Flows write-verb correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the idempotent flow write from
`POST /flows/:id/save` onto `PUT /flows/:id` with a null-free
body, retiring the foreign-tongue `/save` segment and the dead
generic `makeIdRoute` PUT.

**Architecture:** Replace the `makeIdRoute<FlowEntity>` GET/PUT
registration with an explicit `route('flows/:id', { get, put })`
whose PUT runs the former save composite (optional version
snapshot + flow PUT + `'updated'` event, one transaction). The
body's history side-effect is a shape-literal union (`none` |
`snapshot`) — no null. `undo`/`redo` stay POST, untouched. The
client adapters flip from `ctx.POST(.../save)` to
`ctx.PUT('flows/'+id)`.

**Tech Stack:** Vanilla TypeScript (ES2024, strict,
`noUncheckedIndexedAccess`), zero runtime deps. Tests:
`node --test --strip-types` with `MemoryDbAdapter` and a real
`RequestContext` over `handleRequest`.

## Global Constraints

- 78-character max line length; 4-space indent; no inline styles.
- snake_case in storage, camelCase in domain.
- HTTP-verb adapter naming; validators at the gate;
  `RequestContext` is the first argument of adapter methods.
- `./validate` GREEN after EVERY commit (tsc + `./test` +
  78-char lint + `generate-schema-svg --check`). A RED aborts.
- Commit subjects: present-tense imperative, ~50 chars, NO plan
  tag, with trailer
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Linear history (rebase/fast-forward, never merge); main
  checkout, NO worktrees.
- Sandbox: prefix `./serve` with `TMPDIR=/tmp/claude`;
  `./validate` runs as-is.

## File Structure

- `api/validators.ts` — add `FlowWriteHistory`, `FlowPutBody`,
  `validateFlowPutBody` (Task 1); delete `FlowSaveBody`,
  `validateFlowSaveBody`, `FLOW_SAVE_KEYS` (Task 2).
- `api/routes.ts` — replace the `makeIdRoute<FlowEntity>`
  registration with an explicit `route('flows/:id',{get,put})`;
  delete `route('flows/:id/save')`; swap the validators import
  (Task 1).
- `web-app/app/adapters/flow-mutations.ts` — `putFlow` flips to
  `ctx.PUT` with the `history:{kind:'none'}` body (Task 1).
- `web-app/app/presenters/flow-designer.ts` — `#persistFlow`
  flips to `ctx.PUT` with `history` (`snapshot`|`none`) (Task 1).
- `tests/validators.test.ts` — `validateFlowPutBody` unit tests
  (Task 1).
- `tests/adapters-flow-mutations.test.ts` — snapshot + replay
  route tests (Task 1).

---

### Task 1: Cutover — write flows through `PUT /flows/:id`

The route, the new body validator, and the two client call
sites flip together (a half-flip serves a dead or broken
endpoint), so they land in ONE commit, guarded by the existing
verb-agnostic behavior tests plus new validator/route tests.

**Files:**
- Modify: `api/validators.ts` (after `validateFlowVersionSnapshot`)
- Modify: `api/routes.ts` (the `flows` GET/PUT registration; the
  `flows/:id/save` route; the validators import)
- Modify: `web-app/app/adapters/flow-mutations.ts` (`putFlow`)
- Modify: `web-app/app/presenters/flow-designer.ts` (`#persistFlow`)
- Test: `tests/validators.test.ts`,
  `tests/adapters-flow-mutations.test.ts`

**Interfaces:**
- Consumes: `validateFlowVersionSnapshot` (existing, private in
  `validators.ts`), `asObject`, `pickString`, `assertOnlyKeys`,
  `asString`, `ValidationError` (existing); `param`, `route`,
  `db.transaction` (existing in `routes.ts`).
- Produces:
  - `validateFlowPutBody(body: Record<string,unknown>):
    FlowPutBody`
  - `interface FlowPutBody { flow: Record<string,unknown>;
    eventId: string; history: FlowWriteHistory }`
  - `type FlowWriteHistory = { kind:'none' } |
    { kind:'snapshot'; version: FlowVersionSnapshot }`
  - Route `PUT flows/:id` (composite, member-permitted via the
    existing `/flows` PUT policy entry).

- [ ] **Step 1: Write the failing validator tests**

In `tests/validators.test.ts`, add `validateFlowPutBody` to the
import block from `../api/validators.ts`, then append:

```ts
// --- FlowPutBody ---

const validVersionSnapshot = {
    id: 'ver-1',
    version: {
        flow_id: 'flow-1',
        name: 'snapshot',
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        graph: JSON.stringify({ nodes: [], edges: [] }),
        at: '2026-01-01T00:00:00.000Z',
    },
    trimIds: [],
};

test('validateFlowPutBody accepts a plain (none) write', () => {
    const result = validateFlowPutBody({
        flow: { name: 'F' },
        eventId: 'ev1',
        history: { kind: 'none' },
    });
    assert.equal(result.history.kind, 'none');
    assert.equal(result.eventId, 'ev1');
});

test('validateFlowPutBody accepts a snapshot write', () => {
    const result = validateFlowPutBody({
        flow: { name: 'F' },
        eventId: 'ev1',
        history: {
            kind: 'snapshot',
            version: validVersionSnapshot,
        },
    });
    assert.equal(result.history.kind, 'snapshot');
    if (result.history.kind === 'snapshot') {
        assert.equal(result.history.version.id, 'ver-1');
    }
});

test('validateFlowPutBody rejects the legacy version key', () => {
    assert.throws(
        () => validateFlowPutBody({
            flow: {}, eventId: 'ev1', version: null,
        }),
        /FlowPutBody/,
    );
});

test('validateFlowPutBody rejects an unknown history kind', () => {
    assert.throws(
        () => validateFlowPutBody({
            flow: {}, eventId: 'ev1',
            history: { kind: 'consume', versionId: 'v1' },
        }),
        /history\.kind/,
    );
});

test('validateFlowPutBody rejects an empty eventId', () => {
    assert.throws(
        () => validateFlowPutBody({
            flow: {}, eventId: '', history: { kind: 'none' },
        }),
        /eventId/,
    );
});
```

- [ ] **Step 2: Run the validator tests to verify they fail**

Run: `node --test --strip-types tests/validators.test.ts`
Expected: FAIL — `validateFlowPutBody` is not exported
(import error / not a function).

- [ ] **Step 3: Implement `validateFlowPutBody`**

In `api/validators.ts`, immediately after
`validateFlowVersionSnapshot` (it ends with its `return { id,
version, trimIds };` block), add:

```ts
export type FlowWriteHistory =
    | { readonly kind: 'none' }
    | {
        readonly kind: 'snapshot';
        readonly version: FlowVersionSnapshot;
    };

export interface FlowPutBody {
    readonly flow: Record<string, unknown>;
    readonly eventId: string;
    readonly history: FlowWriteHistory;
}

const FLOW_PUT_KEYS: readonly string[] = [
    'flow', 'eventId', 'history',
];

function validateFlowWriteHistory(
    value: unknown,
    label: string,
): FlowWriteHistory {
    const obj = asObject(value, label);
    const kind = asString(obj['kind'], label + '.kind');
    if (kind === 'none') {
        assertOnlyKeys(obj, ['kind'], label);
        return { kind: 'none' };
    }
    if (kind === 'snapshot') {
        assertOnlyKeys(obj, ['kind', 'version'], label);
        return {
            kind: 'snapshot',
            version: validateFlowVersionSnapshot(
                obj['version'], label + '.version',
            ),
        };
    }
    throw new ValidationError(
        "expected history.kind 'none' or 'snapshot' for "
        + label + '.kind, got ' + kind,
    );
}

// The HTTP-body gate for PUT /flows/:id: the flow row, the
// 'updated' state event, and an OPTIONAL version snapshot
// (put + trims) — written atomically. The history side-effect
// is a shape-literal union, never a nullable field, so the
// neither/both illegal states are unrepresentable. The flow
// fields are NOT fully validated here — the org-scoped flows
// store stamps organization_id from the verified token and
// re-validates through validateFlowEntity, so the body OMITS
// it. The state is fixed to 'updated' server-side and authored
// by the verified caller (actor), never the body.
export function validateFlowPutBody(
    body: Record<string, unknown>,
): FlowPutBody {
    assertOnlyKeys(body, FLOW_PUT_KEYS, 'FlowPutBody');
    const flow = asObject(body['flow'], 'FlowPutBody.flow');
    const eventId = pickString(body, 'eventId');
    if (eventId === '') {
        throw new ValidationError(
            'FlowPutBody.eventId must be non-empty',
        );
    }
    const history = validateFlowWriteHistory(
        body['history'], 'FlowPutBody.history',
    );
    return { flow, eventId, history };
}
```

- [ ] **Step 4: Run the validator tests to verify they pass**

Run: `node --test --strip-types tests/validators.test.ts`
Expected: PASS (all five new cases plus the existing file).

- [ ] **Step 5: Write the failing route tests**

In `tests/adapters-flow-mutations.test.ts`, append two tests
that drive the new route directly via `ctx.PUT` (the harness
`setupMemDb`, `createBaseFlow`, `buildFlowBody` import, and
types are already present — add `buildFlowBody` to the existing
`flow-mutations.ts` import):

```ts
test(
    'PUT flows/:id with a snapshot writes version + flow + event',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        await ctx.PUT('flows/flow-1', {
            flow: buildFlowBody({
                name: 'Snapped',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [],
                edges: [],
            }),
            eventId: 'put-ev-1',
            history: {
                kind: 'snapshot',
                version: {
                    id: 'ver-1',
                    version: {
                        flow_id: 'flow-1',
                        name: 'snap',
                        is_locked: false,
                        is_auto_layout: false,
                        is_auto_fit: false,
                        lock_timeout: DEFAULT_LOCK_TIMEOUT,
                        graph: JSON.stringify({
                            nodes: [], edges: [],
                        }),
                        at: '2026-01-01T00:00:00.000Z',
                    },
                    trimIds: [],
                },
            },
        });
        const versions = await ctx.GET<unknown[]>(
            'flows/flow-1/versions',
        );
        assert.equal(versions.length, 1);
        const flow = await ctx.GET<FlowEntity>('flows/flow-1');
        assert.equal(flow.name, 'Snapped');
        const events = await ctx.GET<StateEntity[]>(
            'entity-states/flow-1/history',
        );
        assert.deepEqual(
            events.map(e => e.state), ['active', 'updated'],
        );
    },
);

test(
    'PUT flows/:id replays idempotently (one updated event)',
    async () => {
        const { ctx } = await setupMemDb();
        await createBaseFlow(ctx, 'flow-1');
        const body = {
            flow: buildFlowBody({
                name: 'Replayed',
                isLocked: false,
                isAutoLayout: false,
                isAutoFit: false,
                lockTimeout: DEFAULT_LOCK_TIMEOUT,
                nodes: [],
                edges: [],
            }),
            eventId: 'fixed-ev',
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

Add `buildFlowBody` to the import from
`'../web-app/app/adapters/flow-mutations.ts'`:

```ts
import {
    postFlowCreation,
    putFlow,
    buildFlowBody,
} from
'../web-app/app/adapters/flow-mutations.ts';
```

- [ ] **Step 6: Run the route tests to verify they fail**

Run: `node --test --strip-types
tests/adapters-flow-mutations.test.ts`
Expected: FAIL — `ctx.PUT('flows/flow-1', …)` currently hits the
generic `makeIdRoute` PUT, which validates the body as a
`FlowEntity` and rejects `{flow,eventId,history}` (ValidationError
on unexpected keys); no version row or `'updated'` event is
written.

- [ ] **Step 7: Implement the composite route and delete `/save`**

In `api/routes.ts`, replace the flows registration

```ts
    makeIdRoute<FlowEntity>({
        noun: 'flows',
        store: db => db.flows,
        verbs: ['get', 'put'],
    }),
```

with:

```ts
    route('flows/:id', {
        get: (db, p) => db.flows.getById(param(p, 0)),
        put: (db, p, body, actor) => {
            const id = param(p, 0);
            const b = validateFlowPutBody(body);
            return db.transaction(
                ['flows', 'flow_versions', 'states'],
                async (view) => {
                    if (b.history.kind === 'snapshot') {
                        const snap = b.history.version;
                        await view.flowVersions.put(
                            snap.id,
                            snap.version as unknown as
                                Omit<FlowVersionEntity, 'id'>,
                        );
                        for (const t of snap.trimIds) {
                            await view.flowVersions.delete(t);
                        }
                    }
                    await view.flows.put(
                        id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.eventId, id, 'updated', actor,
                    );
                },
            );
        },
    }),
```

Then DELETE the entire `route('flows/:id/save', { post: … })`
block. In the validators import at the top of `routes.ts`,
replace `validateFlowSaveBody` with `validateFlowPutBody`
(leave `FlowVersionEntity` / `FlowEntity` imports as-is).

- [ ] **Step 8: Flip the two client call sites to PUT**

In `web-app/app/adapters/flow-mutations.ts`, replace the body of
`putFlow` so it issues a PUT with the null-free `none` history.
Update the function's doc comment to name the verb:

```ts
// Save a flow with NO version snapshot: the flow row PUT plus
// its 'updated' state event, written atomically through
// PUT /flows/:id (the put + the event in one re-entrant
// transaction). The author is stamped server-side from the
// token; the client mints the event id.
export async function putFlow(
    ctx: RequestContext,
    id: string,
    save: FlowSaveShape,
): Promise<void> {
    await ctx.PUT(`flows/${id}`, {
        flow: buildFlowBody(save),
        eventId: generateCryptoSafeBase62(),
        history: { kind: 'none' },
    });
    flowChanges.notify();
}
```

In `web-app/app/presenters/flow-designer.ts`, replace
`#persistFlow`:

```ts
    async #persistFlow(
        ctx: RequestContext,
        versioned: boolean,
        snap: FlowSnapshot,
    ): Promise<void> {
        const history = versioned
            ? {
                kind: 'snapshot' as const,
                version: await buildFlowVersionSnapshot(
                    ctx,
                    generateCryptoSafeBase62(),
                    snap.flowId,
                ),
            }
            : { kind: 'none' as const };
        await ctx.PUT(`flows/${snap.flowId}`, {
            flow: buildFlowBody(this.#buildSaveShape(snap)),
            eventId: generateCryptoSafeBase62(),
            history,
        });
        notifyFlowChange();
    }
```

- [ ] **Step 9: Run the full suite to verify GREEN**

Run: `node --test --strip-types
tests/adapters-flow-mutations.test.ts
tests/validators.test.ts tests/flow-operations.test.ts`
Expected: PASS — the new snapshot/replay tests pass, and the
existing verb-agnostic `putFlow` behavior tests
(`emits an updated state event`, `persists every FlowSaveShape
field`, `replaces graph fully`, `last-write-wins`) still pass
because they assert outcomes, not the HTTP verb.

- [ ] **Step 10: Run the full gate**

Run: `./validate`
Expected: GREEN (tsc + `./test` + 78-char lint + schema check).
If tsc flags an unused `validateFlowSaveBody` import in
`routes.ts`, confirm Step 7 replaced it with
`validateFlowPutBody`.

- [ ] **Step 11: Commit**

```bash
git add api/validators.ts api/routes.ts \
  web-app/app/adapters/flow-mutations.ts \
  web-app/app/presenters/flow-designer.ts \
  tests/validators.test.ts \
  tests/adapters-flow-mutations.test.ts
git commit -m "$(printf 'Write flows through PUT /flows/:id\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Cleanup — delete the dead save-body validator

After Task 1, `FlowSaveBody` / `validateFlowSaveBody` /
`FLOW_SAVE_KEYS` have no caller (the `/save` route is gone). They
are dead exports.

**Files:**
- Modify: `api/validators.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing — pure deletion of dead code.

- [ ] **Step 1: Confirm there is no remaining caller**

Run: `grep -rn "validateFlowSaveBody\|FlowSaveBody\|FLOW_SAVE_KEYS"
api/ web-app/ tests/`
Expected: hits ONLY inside `api/validators.ts` (the definitions
themselves). If any other file references them, stop — Task 1 is
incomplete.

- [ ] **Step 2: Delete the dead declarations**

In `api/validators.ts`, delete the three contiguous
declarations: `interface FlowSaveBody`, the `FLOW_SAVE_KEYS`
const, and `function validateFlowSaveBody` (the block spanning
`export interface FlowSaveBody { … }` through the end of
`validateFlowSaveBody`'s `return { version, flow, eventId };`).
Leave `FlowUndoBody`, `FlowRedoBody`, and
`validateFlowVersionSnapshot` intact — `undo`/`redo` still use
them.

- [ ] **Step 3: Run the gate**

Run: `./validate`
Expected: GREEN. tsc confirms nothing referenced the deleted
symbols.

- [ ] **Step 4: Commit**

```bash
git add api/validators.ts
git commit -m "$(printf 'Delete the dead flow save-body validator\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Manual browser regression (after Task 2)

Per the spec, drive `TMPDIR=/tmp/claude ./serve 8080` as a
member-role user and confirm, via the flow designer:
- Save a flow (plain) → reload → graph round-trips.
- Save with a version snapshot → a new version appears.
- Undo and Redo (unchanged POST operations) still work.
- An old-snapshot import is unaffected (out of scope here).

## Self-Review

**Spec coverage:**
- `save → PUT /flows/:id` — Task 1, Steps 7-8. ✓
- Dead generic `makeIdRoute` PUT removed — Task 1, Step 7
  (replaced by the explicit route). ✓
- Null-free `FlowPutBody` union — Task 1, Steps 1-3. ✓
- `undo`/`redo` untouched — not referenced by any task. ✓
- Permission parity (no policy change) — relies on the existing
  `/flows` PUT entry; no `authorization.ts` edit in any task. ✓
- Idempotency preserved — Task 1, Step 5 replay test. ✓
- `db.flows.put` capability preserved — the composite PUT calls
  `view.flows.put`; no store change. ✓
- Dead-code cleanup — Task 2. ✓

**Placeholder scan:** No TBD/TODO; every code step shows
complete code; commands carry expected output. ✓

**Type consistency:** `validateFlowPutBody` /`FlowPutBody`
/`FlowWriteHistory` names match across validator, route, and the
`{kind:'none'}` / `{kind:'snapshot',version}` shapes used in the
client. `snap.version` is the `FlowVersionSnapshot.version`
(`Record<string,unknown>`), cast to `Omit<FlowVersionEntity,
'id'>` for the store put — same cast the old `/save` handler
used. ✓
