# Flows write-verb correction — `save` POST → `PUT`

*Idempotency (VII), Uniformity (III), Security (II); the Sins
of Foreign Tongues and Null. Commits carry no plan tag — plain
present-tense imperative subjects.*

This is the approved, self-contained design of record for
correcting the flow write seam. Re-derive every code anchor by
SYMBOL search at execution — line numbers drift, symbols do
not.

## Context

The flow write reaches the server as `POST /flows/:id/save`
(`api/routes.ts`, introduced by `fa81a986`). Two doctrines
break at once:

- **Idempotency (VII).** The handler is idempotent by
  construction — a `flow_versions` PUT by client-minted id, a
  `flows` PUT, and a `states` event appended under a
  client-minted `eventId` all replay identically. An
  idempotent overwrite is a **PUT**, not a POST. The route's
  own design names the idempotency while choosing the
  non-idempotent verb.
- **Foreign Tongues.** `save` is a UI/persistence verb
  colonizing the routing layer. The HTTP verb already says
  what `save` says; the path segment adds nothing.

A second, quieter fault sits beside it. `makeIdRoute<
FlowEntity>({ verbs: ['get','put'] })` auto-mints a **generic
`PUT /flows/:id`** that does a naive `db.flows.put` — no
version snapshot, no `'updated'` event, no transaction. No
client or test calls it (verified). It is a reachable,
member-permitted, unaudited write path into a core resource —
attack surface (Security II) handed out by a factory default.

And the save body carries the **Sin of Null**: `FlowSaveBody.
version: FlowVersionSnapshot | null`. A plain save ships
`version: null`.

## Approved design decisions

1. **`save` → `PUT /flows/:id`.** The idempotent flow
   overwrite moves onto the honest verb. The `/save` segment
   is retired. The generic `makeIdRoute` PUT is replaced by an
   explicit composite PUT handler at the same path (so there
   is exactly one `PUT /flows/:id`, and it is the real save).
   The underlying capability `db.flows.put` is untouched — only
   the dead *route* exposure goes; internal callers keep the
   store method.
2. **`undo` / `redo` stay `POST`.** They are multi-noun atomic
   *operations* over the version-history stack (flows +
   flow_versions + states in one tx), not resource overwrites.
   The Article blesses `post_operation` for multi-noun
   operations, and `/undo` / `/redo` name domain operations,
   not foreign tongues. Out of scope for this arc, untouched.
3. **Null-free body.** `FlowSaveBody` (`version: …|null`) is
   replaced by `FlowPutBody` whose history side-effect is a
   shape-literal discriminated union — absence modeled
   structurally, never as null. Illegal states (neither/both)
   become unrepresentable.
4. **Permission parity, no policy change.** `PUT /flows/:id`
   is already member-permitted via the `/flows` PUT entry in
   `MEMBER_VERBS` (segment-boundary match), exactly as
   `POST /flows/:id/save` was member-permitted via the
   `/flows` POST entry. The `/flows` POST entry stays — `undo`
   / `redo` still need it.
5. **Idempotency invariant preserved.** Client mints all ids
   and the `eventId`; the route writes the body verbatim and
   contributes only the token-verified author. Replay is a
   no-op. The change makes the *verb* match the guarantee the
   operation already kept.

## The route

Replace `makeIdRoute<FlowEntity>({ noun:'flows',
verbs:['get','put'] })` with an explicit
`route('flows/:id', { get, put })`:

- `get` — unchanged behavior (`db.flows.getById(param(p,0))`).
- `put` — the former `/save` composite, verbatim logic, one
  transaction over `['flows','flow_versions','states']`:
  - if `history.kind === 'snapshot'`: `flowVersions.put(
    version.id, version.version)` then `flowVersions.delete`
    over `version.trimIds`;
  - `flows.put(id, body.flow)`;
  - `states.postEvent(body.eventId, id, 'updated', actor)`.

Delete `route('flows/:id/save', …)`.

## The null-free body

Replaces `FlowSaveBody` / `validateFlowSaveBody` /
`FLOW_SAVE_KEYS`:

```ts
type FlowWriteHistory =
  | { readonly kind: 'none' }
  | { readonly kind: 'snapshot';
      readonly version: FlowVersionSnapshot };

interface FlowPutBody {
  readonly flow: Record<string, unknown>;
  readonly eventId: string;            // non-empty
  readonly history: FlowWriteHistory;
}
```

`validateFlowPutBody` reuses `validateFlowVersionSnapshot` for
the `snapshot` variant; rejects unknown `kind`, the legacy
`version` key, and any null. The `consume` variant is absent —
it belongs to `undo`, which stays a POST.

## Client (two call sites)

- `web-app/app/adapters/flow-mutations.ts` `putFlow` —
  `ctx.PUT('flows/'+id, { flow: buildFlowBody(save), eventId,
  history: { kind: 'none' } })`.
- `web-app/app/presenters/flow-designer.ts` `#persistFlow` —
  `ctx.PUT('flows/'+snap.flowId, { flow, eventId, history:
  versioned ? { kind:'snapshot', version } : { kind:'none' }
  })`.
- `buildFlowBody` is unchanged. The client function `putFlow`
  is already correctly named — it was the *route* that lied,
  not the adapter. No rename.

## Critical files (re-derive anchors by symbol)

- **Routes:** `api/routes.ts` — `makeIdRoute<FlowEntity>`
  (flows registration), `route('flows/:id/save')`,
  `route('flows/:id/undo')` / `redo` (untouched).
- **Validators:** `api/validators.ts` — `FlowSaveBody` /
  `validateFlowSaveBody` / `FLOW_SAVE_KEYS` (replace),
  `validateFlowVersionSnapshot` (reuse). `FlowUndoBody` /
  `FlowRedoBody` untouched.
- **Client:** `web-app/app/adapters/flow-mutations.ts`
  (`putFlow`, `buildFlowBody`); `web-app/app/presenters/
  flow-designer.ts` (`#persistFlow`).
- **Authz (no change, confirm parity):** `api/authorization.ts`
  `MEMBER_VERBS['/flows']`.
- **Tests:** `tests/adapters-flow-mutations.test.ts`,
  `tests/flow-operations.test.ts`, the api routing/permission
  tests, plus a new `validateFlowPutBody` test.

## Sequencing — tiny commits, `./validate` GREEN each

The route, body, and client flip together (a half-flip serves
a dead or broken endpoint), so the cutover is one commit; the
dead-code removal that it makes possible follows.

1. **Cutover:** add `validateFlowPutBody` + the explicit
   `route('flows/:id', { get, put })` composite (replacing the
   generic `makeIdRoute` PUT), delete `route('flows/:id/save')`,
   and flip both client call sites to `PUT`. Update the
   affected tests in the same commit (the seam moved).
2. **Cleanup:** delete the now-dead `FlowSaveBody` /
   `validateFlowSaveBody` / `FLOW_SAVE_KEYS`.

## Test strategy (Office of Verification — behavior, not sausage)

- **New (TDD):** `validateFlowPutBody` accepts `{kind:'none'}`
  and `{kind:'snapshot', version}`, and REJECTS a null/legacy
  `version` key and an unknown `kind`. A route-level test:
  `PUT /flows/:id` with a `snapshot` body writes the version +
  flow + `'updated'` event in one tx (and a plain `none` body
  writes flow + event only), idempotent on replay.
- **Update (seam moved):** `adapters-flow-mutations` (assert
  `PUT flows/:id` + the new body, not `POST …/save`); any
  routing/permission test naming `/save`.
- **Stay GREEN unchanged:** `flow-operations` undo/redo paths,
  `adapters-flow-versions`, the frozen-plane tests. Behavior is
  preserved; only the save verb/body moves.
- **Weakening boundary:** only assertions naming the `/save`
  POST or the `version: null` body shape may change — those
  covenants genuinely moved. Behavior assertions never weaken.

## Verification

- `./validate` GREEN after EVERY commit (tsc + `./test` +
  78-char lint + `generate-schema-svg --check`).
- Manual browser regression (`TMPDIR=/tmp/claude ./serve
  8080`): save a flow (plain), save with a version snapshot,
  reload (round-trip), then exercise undo and redo (unchanged
  POST operations must still work), as a member-role user
  (permission parity).

## Out of scope / non-goals

- `undo` / `redo` verbs (atomic operations, stay POST).
- The codebase-wide removal of factory-exposed unused
  endpoints — its own sibling arc, scoped from the recon. This
  arc removes only the flows-local dead generic PUT, in the
  blast radius of the cutover.
- F-131 (paused at Step 2; resumes after this arc on the
  corrected verb).
- Renaming the client `putFlow` adapter (already correct).
- Any change to `db.flows.put` or other internal capabilities
  (only network-route exposure changes).
