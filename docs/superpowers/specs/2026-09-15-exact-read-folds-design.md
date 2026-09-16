# Exact-read folds: retire `messagePairs.getAll()`

- Date: 2026-09-15
- Status: awaiting review, pre-plan
- Worktree: `.worktrees/2026-09-15-exact-read-folds`
- Base: master at `ab1f0cea`
- Ships: the six whole-ledger folds off `getAll()`, vocabulary
  for invitation terminals, the PII slot, and token `name = jti`;
  `getAll` / `selectAll` gone from the `api/` derive face
- Defers: `default-organization` singleton split; claim/release
  path vocabulary; an `attribute_id` head index
- Closes: TODO.md later-work bullet on the six whole-ledger
  folds; ARCHITECTURE.md's named SFV whole-plane exception
- Witness: a follow-up `./bin/measure` (not a gate)

## Problem

A 2026-09-15 local measure (`c50e849` vs `e6472ae`) raised every
page-load budget. Fetches were not the cause (sum of `fetch:*`
medians +27%, median phase −14%). `boot:auth-gate` was: mean
77 ms → 228 ms, +198%, tracking `readyMs` on authenticated
pages. Cookie session already refreshes on every full
navigation. Each refresh calls `readTokenChainFromLedger`
twice, and that calls `deriveIdentityTokens`, which is
`db.messagePairs.getAll()`.

The examination report named six such folds. This spec retires
them, auth first.

## Axiom

There are two ways to read and one way to write (path-and-name).

- A **collection** read is an exact match on `path`.
- A **document** read is an exact match on `path` and `name`.
- The **write** appends one pair to one document's history.

The public pathname after `/api` **is** `path + name`. No
shadow URI. `pathAndNameOf` splits the HTTP route; it does not
invent a second address.

A read that is neither collection nor document is a defect.

## Decisions

1. **All six folds, auth first.** One spec. `getAll` /
   `selectAll` retire when the last fold lands.
2. **Auth 1a now, jti-as-name later.** Refresh and rotation
   take the identity they already have (`claims.sub`, path
   `:id`). `deriveIdentityTokensFor` only. Cross-identity 403
   becomes unknown. Leftover `/identity-tokens/` dual-read
   stays until 1b.
3. **Delete `deriveWorkOrderLifecycle`.** Tests call
   `workOrderLifecycleStatesFor`. No product caller.
4. **Invitation terminal is a PUT of the invitation
   document.** Head carries `state`. Both invitation folds
   become collection + document reads.
5. **PII slot is `path = /identities/<id>/`, `name = pii`.**
   Same pathname as today's URL; honest split.
6. **Field values are instance values.** Attributes belong to
   the record type. Values live on the instance document.
   `deriveStateFieldValueReferrers` is deleted. RESTRICT's
   live-value leg is `deriveInstanceCollection` (heads).
7. **Auth 1b: `name = jti`.** Nested
   `identities/:id/tokens/:jti`. Leftover prefix retired.
   Cross-identity 403 is **not** restored: a nested URL cannot
   see another identity's collection without a second URI or
   N identity reads.
8. **Wipe and reseed.** No dual-read of old invitation op
   prefixes, old PII prefixes, or leftover token rows in
   production derives. This repo reaches a new shape by wipe.
9. **Measure is a witness.** Layer 1 is the gate.

## Out of scope

- `default-organization` (`/identities/:id/default-organization/`,
  `name = ''`). Already a targeted prefix read, not `getAll()`.
- Claim and release path vocabulary. Not `getAll()` sites.
- An `attribute_id` head index. Unneeded once SFV dies.
- An org-wide transition collection. Nobody lists every
  transition in an organization.
- A field-value document family named by work-order id.
  Values are not attributes of a work order.
- Changing HTTP routes except where `path + name` already is
  the route (PII split, invitation document PUT, token name).

## Sequence

One concern per commit, this order.

1. Auth 1a
2. Invitation terminal as document, then both invitation folds
3. PII slot, then `deriveIdentityPiiRows`
4. Delete `deriveStateFieldValueReferrers`
5. Delete `deriveWorkOrderLifecycle`
6. Auth 1b (`name = jti`, leftover gone)
7. Remove `getAll` / `selectAll` and the pin

## 1. Auth 1a

Refresh already verified the JWT. `claims.sub` is the
identity. Rotation and revocation routes already have
`identities/:id` on the path. Neither currently passes that
id into `readTokenChainFromLedger`, so the chain lookup still
calls `deriveIdentityTokenEventsForJti(db, jti)` with no
scope and then `deriveIdentityTokens()` — the `getAll()`.

**Change.** `identityId` is required on
`readTokenChainFromLedger`, `rotateRefreshJti`, and
`revokeTokenChain`.

| Caller | Identity |
|---|---|
| `grantRefresh` | `verified.claims.sub` |
| `tokenRevocationReason` | already passes `sub` |
| `POST identities/:id/tokens/:jti/rotation` | path `:id` |
| `POST identities/:id/tokens/:jti/revocation` | path `:id` |

One collection read per attempt: `deriveIdentityTokensFor(db,
identityId)` (nested `/identities/<id>/tokens/` plus leftover
`/identity-tokens/` filtered to that id). Fold in memory for
the presented jti, then for `chain_id`. The pre-tx / in-tx
double read stays; each side is that collection, not the
plane.

`deriveIdentityTokens` (the global fold) is deleted. Tests
that listed every token go through `deriveIdentityTokensFor`
or enumerate identities first.

**Unknown.** A jti not in this identity's collection is
unknown.

- Rotation of unknown → **409** (today's reuse-or-unknown).
- Revocation of unknown → **2xx no-op**, pair still appends.

A jti that exists on **another** identity used to 403. After
1a it is unknown. Same security: you cannot rotate or revoke
a chain you do not own. Worse status. Tests that assert that
403 change with it. 1b does not restore 403.

Leftover dual-read stays until 1b. It is
`getCollectionPairs('/identity-tokens/')`, not `getAll()`.

## 2. Invitation terminal as a document

Today the invitation **row** is already a document:
`path = /invitations/`, `name = <id>`. Grant writes that PUT
(body `organization_id`, `identity_id`, `at`) plus a POST
operation. Accept / decline / revoke write only a POST at
`/invitations/<id>/<op>/` with `name = ''`. State is "which
of those three collections has a pair." That is why
`invitationOpStates` `getAll()`s, and why
`invitationOpStateFor` does three collection reads.

**New shape.** The invitation document's head **is** the
state.

- Grant PUT body gains `state: 'pending'` (required, not a
  nullable column).
- Accept / decline / revoke still hit
  `POST invitations/:id/acceptance` (etc.). Each one also
  appends a **PUT of the same invitation document** with
  `state: 'accepted' | 'declined' | 'revoked'`. Full body:
  the three grant fields plus the new state. Terminal time is
  that PUT's stamp.
- Domain gate still requires pending before a terminal PUT.
- Side-channel POST pairs may still be stored as the
  operation (grant already stores POST + PUT). **Derivation
  does not read them.**

**Reads.**

- List (`deriveInvitations`): `getCollectionPairs('/invitations/')`,
  `deriveDocumentsAt`, `state` from the head.
  `invitationOpStates` is deleted.
- One invitation: one document read, head's `state`.
- Lifecycle (`deriveInvitationStates` /
  `invitationLifecycleStatesFor`): document history of that
  `(path, name)`. Pending from the grant PUT, terminal from
  the later PUT. Enumerate ids from the invitations
  collection; no `getAll()`.

Wire JSON for list/detail stays `{ id, organization_id,
identity_id, at, state }`. Tests that asserted op-prefix
pairs as the state oracle move to the document head. Seed
writes the document PUTs.

## 3. PII slot

Today PII is a singleton stuffed into a collection-shaped
path: `path = /identities/<id>/pii/`, `name = ''`.
`deriveIdentityPiiRows` regexes the whole ledger because
every identity mints a distinct prefix.

**Ledger.** `path = /identities/<id>/`, `name = pii`. Same
HTTP: `GET`/`PUT`/`DELETE identities/:id/pii`. The split
changes; the pathname does not.

`pathAndNameOf` still treats a literal last segment as
`name = ''`. Do not widen that rule (it would rename every
operation: `transition`, `rotation`, `acceptance`). The form
already overrides name via `createdEntityName` on collection
POST. PII is the same kind of override: that route writes
`name = pii`. One named exception at the form, not a new
splitter.

**Reads.**

- One identity (`deriveIdentityPii`):
  `getDocumentHistory('/identities/<id>/', 'pii')`. DELETE
  head still means erasure — 404, no row.
- All PII (`deriveIdentityPiiRows`, including grant's email
  lookup): identities collection lists ids, then one
  document read per id. O(identities), not O(ledger).

Seed writes the new `(path, name)`.

## 4. Delete `deriveStateFieldValueReferrers`

RESTRICT's rule is no **live** referrer. Attributes belong to
the record type. Values live on the instance document
(`/organizations/<org>/record-types/<typeId>/instances/<id>`,
body `{ values: [{ attribute_id, value }] }`). A
value-bearing work-order transition POSTs the transition then
PUTs a new instance revision. It does not store attributes
on the work order.

`deriveInstanceCollection` already reads that collection,
`deriveDocumentsAt` (heads; tombstones omitted), and is the
fourth RESTRICT leg. Scanning every instance **revision**
would make an attribute undeletable after first use — the
ledger does not forget.

`deriveStateFieldValueReferrers` and its `getAll()` are
deleted. `collectAttributeReferrers` drops the SFV pass.
ARCHITECTURE.md's named whole-plane exception is deleted.
History UI still folds `set`/`clear` from the transition
**request** (the HTTP audit). Tests that pinned the fold
against transition bags go or re-point at instance heads.

## 5. Delete `deriveWorkOrderLifecycle`

Removed. Tests call `workOrderLifecycleStatesFor(organization,
id)`. No product caller.

## 6. Auth 1b

**Leftover.** Nested documents only.
`deriveIdentityTokensFor` drops `/identity-tokens/`.
`authorizationCodeSpent` drops the leftover
`getDocumentHistory`.

**Name = jti.** Today `identities/:id/tokens/:tid` uses the
event id as `name`. After 1b, each **jti** is a document:
`name = <jti>`. History of that document is issued → rotated
→ revoked for **that** jti. A refresh chain is several jtis;
the chain is still the identity's tokens collection filtered
by `chain_id` (1a). `getDocumentHistory` of one jti is not
the chain.

`authorizationCodeSpent` stays keyed by `derivedId` (the
sha256 spend marker) as `name` in the same collection. That
is not a jti. Do not rename it.

API URI for token events still matches
(`identities/:id/tokens/:jti`).

**403 stays unknown.** `POST /identities/victim/tokens/<jti>/rotation`
can only see victim's collection. Restoring 403 would need a
second pathname or N identity collection reads. Neither is
in this spec.

## 7. Retire `getAll` / `selectAll`

After 1–6, `api/` has no `messagePairs.getAll()`. Drop that
method from the message-store face `api/` derives use. Drop
`selectAll` if it only served it. `store-history-entity.getAll`
stays (different store). A grep pin under `api/` (not
`tests/`) forbids `messagePairs.getAll(`. TODO.md's six-fold
bullet is done.

Tests that counted the whole plane switch to collection
reads. Layer 1 is the gate. A follow-up `./bin/measure` is
the witness that auth-gate no longer tracks the ledger.

## Error and wire

| Case | After |
|---|---|
| Rotation, jti not in this identity | 409 |
| Revocation, jti not in this identity | 2xx no-op |
| Cross-identity jti (was 403) | same as unknown |
| Invitation terminal on non-pending | existing domain 409 |
| PII DELETE head | 404, no row |
| Attribute delete, live instance value | 409 RESTRICT (instance heads) |

## Testing

- Cross-identity rotation/revocation: 403 → 409 / 2xx.
- Invitation state from the document head, not `/acceptance/`
  prefixes.
- PII from `path = /identities/<id>/`, `name = pii`.
- Token events `name = jti`; leftover `/identity-tokens/`
  absent after reseed.
- Lifecycle tests call `workOrderLifecycleStatesFor`.
- SFV tests die or assert instance heads via
  `deriveInstanceCollection`.
- Seed and fixtures write the new documents.
- Grep pin: no `messagePairs.getAll(` under `api/`.
