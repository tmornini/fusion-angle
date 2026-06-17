# Caller owns event identity and time

*Idempotency (VII), Uniformity (III), Immutability (VI),
Security (II); the Articles "we validate at every edge" and
"the caller mints identity." The foul odor: the stack minting
what the caller owns — a hidden Default Value — and a retry
absorbed Down In The Stack. Commits carry no plan tag — plain
present-tense imperative subjects.*

This is the approved, self-contained design of record for
making the API caller — never the stack — the sole minter of
domain event identity (`id`) and time (`at`). Re-derive every
code anchor by SYMBOL search at execution — line numbers
drift, symbols do not.

## Context

Every domain lifecycle event in the system (ideas, members,
flows, work orders, invitations, org requests) is appended to
the `states` ledger through one method, `StateStore.postEvent`
(`api/store-state.ts`). That method self-stamps the event's
timestamp:

```ts
async postEvent(id, entityId, state, memberId) {
    await this.put(id, {
        entity_id: entityId, state,
        member_id: memberId,
        at: nowUtc(),          // ← the stack mints the time
    });
}
```

The ledger's `put` is idempotent by id: an identical re-put is
the retry no-op; a DIFFERENT payload on an existing id throws
`LedgerImmutabilityError` (mapped to HTTP 409 at
`api/api.ts`). But `sameEvent` compares `at`, and `nowUtc()`
is a fresh monotonic mint on every call — so a replay of the
same logical event carries a NEW `at`, looks like a different
payload, and 409s. The operation can never be a clean replay,
because the value that identifies the event in time is minted
fresh inside the stack instead of being fixed once by the
caller.

A retry pushed an inconsistency into the open: the flows-PUT
cutover (commit `3cfacce4`) wrapped `postEvent` in a
`try/catch` that absorbs `LedgerImmutabilityError` to fake a
replay no-op — a retry handled Down In The Stack, and one that
also swallows a genuine id collision.

The correct exemplar already ships. The single-event path
`PUT /states/:id` (`web-app/app/adapters/state-events.ts`
`postStateEvent`) has the client mint BOTH the event id and
`at: nowUtc()` and send them in the body; the server stamps
only the author. That path is already a clean replay. The
COMPOSITE routes — which append an event alongside other rows
in one transaction, and therefore call `postEvent` — are the
half-done remainder: 13 of 15 already carry a client-minted
event `id`, but every one of them lets the stack stamp `at`.

## Principle

The caller mints EVERY domain id — entity AND event — and the
event time. Period. When the stack mints the id, every retry
mints a FRESH one and writes a SECOND, unintended entity — a
duplicate entity with a distinct (non-duplicate) id, which no
uniqueness check catches. Only a caller-minted id makes the
retry hit the same row: a byte-identical no-op, no second
entity. The stack mints neither id nor time and retries
nothing — all the caller's concern. The server contributes only the AUTHOR
(`member_id`), derived from the verified token; authorship is
correctly server-owned and is NOT caller-minted (a client must
not forge it — Security II).

Most domain entities (flows, ideas, members, work orders,
records, baselines, field-values, version snapshots) already
client-mint their ids. The stack's remaining domain-id mints —
the invitation id, the membership id, the four invitation event
ids, the two work-order claim event ids, and the default-org
ledger row id — all move to the caller in this arc. The single
exception is auth secrets (below).

This arc completes the convention `postStateEvent` already
follows: the caller mints `id` + `at` per event; `postEvent`
accepts `at`; the composite routes thread a body-supplied
`at`.

## Approved design decisions

1. **`postEvent` accepts `at`.** Its signature becomes
   `postEvent(id, entityId, state, memberId, at)`; it stops
   calling `nowUtc()`. The `nowUtc` import leaves
   `api/store-state.ts`. The `StateStore` interface
   (`api/db.ts`) and the parent-scoped delegation
   (`api/store-parent-scoped.ts`) carry the same new
   parameter.
2. **Minimal-additive body carriage.** Each event's `at`
   sits beside its existing client-minted id field; no body
   is restructured (the rejected alternative collapsed
   id/state/at into event objects — a larger, riskier diff
   that also fights the routes whose `state` is server-fixed).
   The naming map:

   | existing id field      | new `at` field   |
   | ---------------------- | ---------------- |
   | `eventId`              | `at`             |
   | `initialStateEventId`  | `initialStateAt` |
   | `ideaStateEventId`     | `ideaStateAt`    |
   | `projectStateEventId`  | `projectStateAt` |
   | `stateEventIds: Id[]`  | `stateEventAts`  |
   | `transitionEventId`    | `transitionAt`   |
   | `release.{id}`         | `release.{at}`   |

3. **Work-orders claim mints its ids client-side.** The two
   claim events (`claim_expired`, `claimed`) are the only
   call sites that still server-mint ids
   (`generateCryptoSafeBase62()`). The claim body gains
   `claimEventId` + `claimAt` and `expireEventId` +
   `expireAt`. The caller sends the expire pair
   SPECULATIVELY; the route consumes it only when it detects
   a stale prior claim. The expiry event's AUTHOR stays
   server-derived (`prior.member_id`) — the caller mints the
   event's identity and time, never another member's
   authorship.
4. **No retry in the stack.** The flows-PUT `try/catch` is
   deleted. With caller-minted `at`, a genuine replay is
   byte-identical (`sameEvent` true) and the id-keyed `put`
   is a true no-op — no catch, no fabrication. A real
   collision (same id, different fact) still throws
   `LedgerImmutabilityError` → 409, uniform with every other
   route at `api/api.ts`. Retries belong to the caller.
5. **Validate `at` at the gate.** Each body validator that
   gains an `at` validates it as a non-empty RFC-3339 zulu
   timestamp at the 6-digit microsecond width `nowUtc`
   produces — reusing the existing zulu-timestamp validator
   that `validateStateEntity` already applies. The store's
   `put` re-validates the full row at the storage edge; the
   body gate and the storage edge both hold the line.
6. **Ordering invariant preserved.** Total order in the
   ledger IS `at` (the latest-wins reduction starts at the
   mint). The client mints each event's `at` via the same
   monotonic `nowUtc()`, strictly increasing per event within
   the request — exactly as `postStateEvent` and the
   client-side entity-row stamps already do. Multi-event
   requests (work-order create's three events,
   claim_expired-before-claimed) carry distinct, ordered `at`
   values, so latest-wins stays deterministic across the
   IndexedDB, localStorage, and memory backends.

## The store change

```ts
async postEvent(
    id: Id,
    entityId: Id,
    state: string,
    memberId: Id,
    at: string,            // caller-minted, RFC-3339 zulu
): Promise<void> {
    await this.put(id, {
        entity_id: entityId,
        state,
        member_id: memberId,
        at,                // was nowUtc()
    });
}
```

`put`, `sameEvent`, and the `LedgerImmutabilityError`
contract are unchanged — only the source of `at` moves from
the stack to the parameter.

## Scope inventory

Re-derive each anchor by symbol; the line numbers below are
orientation only.

| Surface (route / helper)              | `at`  | `id`        | retry |
| ------------------------------------- | ----- | ----------- | ----- |
| member create routes (`initialState…`)| add   | client ✓    | —     |
| `ideas` create / `ideas/:id/conversion`| add  | client ✓    | —     |
| `flows` create                        | add   | client ✓    | —     |
| `flows/:id` PUT (`3cfacce4`)          | add   | client ✓    | DEL   |
| `flows/:id/undo`, `flows/:id/redo`    | add   | client ✓    | —     |
| `work-orders` create (`stateEventIds`)| add[] | client ✓    | —     |
| `work-orders/:id/transition`          | add   | client ✓    | —     |
| `work-orders/:id/claim` (×2 events)   | add   | → client    | —     |
| `invitations` (4 events + 2 entities) | add   | → client    | —     |
| `org-requests.ts` (×1 ledger row)     | add   | → client    | —     |

"client ✓" = the event id is already caller-minted today;
only `at` is added. "→ client" = the id moves from
server-mint to caller-mint in this arc. Each row's body
validator and its web-app client adapter change in lockstep
with its route.

The invitations row's "2 entities" are the invitation id
(`grant`) and the membership id (`accept`): the stack mints
them today, so a retried grant/accept writes a SECOND
invitation/membership at a fresh id. They move to the caller
alongside the four invitation event ids — without that, the
arc's idempotency promise does not hold for invitations.

## Exclusions (the stack keeps minting)

The "caller mints all ids" rule governs DOMAIN ids. Its one
principled exception is auth, by OAuth design:

- **`api/authentication.ts`** — `jti`, `chain_id`,
  refresh-chain ids, auth codes, and token-ledger `at` stay
  server-minted. The authorization server mints the token id
  and the authorization code; a client choosing its own is a
  Security II breach (token fixation / revocation bypass), not
  a domain retry concern. These are secrets, not domain ids.
- **`api/mock-data.ts`** — seeding is not a request path; its
  ids and timestamps stay locally minted.
- **`api/request-context.ts`** — the request-id is taken from
  the caller's header when present and only FALLS BACK to a
  mint; that already honors caller-supplied identity, and it
  is an observability trace, not a persisted domain event.

## Critical files (re-derive anchors by symbol)

- **Store:** `api/store-state.ts` (`postEvent`, the `nowUtc`
  import), `api/db.ts` (`StateStore.postEvent` signature),
  `api/store-parent-scoped.ts` (`postEvent` delegation).
- **Routes:** `api/routes.ts` — every `view.states.postEvent`
  call site (member creates, `ideas`, `ideas/:id/conversion`,
  `flows` create, `flows/:id` PUT + `undo` + `redo`,
  `work-orders` create + `claim` + `transition`).
- **Domain helpers:** `api/invitations-domain.ts`,
  `api/org-requests.ts` — server-minted event id + `at`.
- **Validators:** `api/validators.ts` — each body validator
  that gains an `at` (and the claim body that gains
  `claimEventId`/`claimAt`/`expireEventId`/`expireAt`); the
  existing zulu-timestamp validator reused for each `at`.
- **Clients:** `web-app/app/adapters/*` — every adapter that
  builds an event-bearing body mints `at` (most already mint
  the entity-row `at` via `nowUtc()` — thread the same value)
  and, for claim/invitations/org-requests, the event id.
- **Untouched exemplar:** `web-app/app/adapters/state-events.ts`
  `postStateEvent` and `PUT /states/:id` — already correct;
  the model the rest is harmonized to.

## Sequencing — expand-contract, tiny commits, green each

The signature change cannot land big-bang: adding a required
`at` to `postEvent` would force ~60 call sites in one
un-bisectable commit. Use expand-contract so each commit is
ONE reviewable concern and master stays green:

1. **Expand** — introduce the caller-`at` write path without
   breaking existing callers, and WITHOUT a transient
   nullable/default `at` (an optional parameter with a
   `nowUtc()` fallback would plant a Default-Value sin on
   master). The migration uses a distinct entry, not a
   defaulted parameter.
2. **Migrate** — convert one surface per commit: the route
   (or domain helper), its body validator, its web-app client
   adapter, and its tests, together. The flows-PUT rework
   (add `at`, delete the `try/catch`) is one such commit;
   commit `3cfacce4` is NOT reverted — the arc builds
   forward.
3. **Contract** — once every caller is migrated, remove the
   self-stamping path so `postEvent` no longer references
   `nowUtc`. A pure rename, if any, lands as its own commit
   (never rename-and-change together).

`./validate` GREEN after EVERY commit (tsc + `./test` +
78-char lint + `generate-schema-svg --check`). The plan
enumerates the exact commit order and the per-surface anchors.

## Test strategy (Office of Verification — behavior)

- **Stay GREEN unchanged:** the "conflicting payload"
  covenants (a reused event id with a DIFFERENT state still
  409s) — they assert the collision, not the timestamp, so
  they survive the change. Author/authorization fences are
  untouched.
- **Update (the seam moved):** every `postEvent` test call
  gains an `at`; every event-bearing client body and its
  fixtures gain the `at` (and claim/invitations/org-requests
  the event id). Only assertions naming the server-stamped
  `at` or the server-minted claim ids may change — those
  covenants genuinely moved; behavior assertions never
  weaken.
- **New (TDD):** a true-replay test — the same composite
  request replayed with the identical id + `at` is a no-op
  (no second event, NO 409) — proving the harmonized
  idempotency the `try/catch` used to fake. A claim test with
  and without a stale prior, asserting the caller-minted
  `claimEventId`/`expireEventId` land (and the expire pair is
  consumed only when a stale prior exists). Tests drive
  routes through a real `RequestContext` over
  `MemoryDbAdapter` and assert OUTCOMES, never the verb or the
  stamp source.

## Verification

- `./validate` GREEN after every commit.
- Manual browser regression (`TMPDIR=/tmp/claude ./serve
  8080`) as a member-role user: create and transition a work
  order (claim it, let a claim expire and re-claim), save a
  flow (plain and with a snapshot), reload (round-trip), undo
  and redo — every state event still lands, ordered, with no
  409 on a normal repeat action.

## Out of scope / non-goals

- **Dropping the materialized `claim_expired` event.** It is
  arguably derivable (the active-claim reader already treats a
  stale `claimed` as expired), but that is a
  Derive-From-Ledger concern, not the id/at smell, and it
  changes audit history — its own arc if pursued.
- **Restructuring event-bearing bodies into event objects.**
  The rejected Approach 2; a separate refactor if ever wanted.
- **The Postgres server tier.** When it lands, the server may
  assign authoritative order; this arc fixes the demo tier's
  caller-minted model and does not pre-build for that.
- **Auth/security minting and mock-data seeding** — excluded
  above, by design.
