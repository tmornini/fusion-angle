# ETag is the message-pair id

## Problem

The API mints two identities for one document state and
shows a third to record-instance callers.

1. **Instances advertise a per-caller ETag.** Detail,
   list rows, history entries, and PATCH responses hash
   the caller's *projected* body (`advertisedInstanceEtag`,
   `api/derive-record-instances.ts:77-88`; attached at
   `api/api.ts:1627-1648`, `api/routes.ts:5386-5400`,
   `:5441-5460`). Two roles, two tags, one state. A
   detail response cannot even link to its own
   `/versions/:version`, because the path token is the
   stored hash, not the projected one.
2. **Two names for one thing.** The column is `version`
   (`api/schema-postgres.ts:28-30`), the entity field is
   `responseEtag` (`api/message-pair.ts:65`), the wire
   header is `ETag`. Instance history entries carry both
   `etag` and `version`; the generic leaf is
   `versions/:etag` (`api/document-family.ts:598`) while
   the instance leaf is `:version`
   (`api/family-registry.ts:145`).
3. **The stored token is a content hash — an oracle.**
   `version = sha256(response body ‖ If-Match)`
   (`api/message-pair.ts:244-249`,
   `api/message-form.ts:136-150`); genesis has no
   If-Match. A member reading a history entry's
   `version` can hash candidate bodies. Measured: with an
   admin-only attribute whose value space was three
   candidates, a member recovered the hidden value from
   `version₀`. Any content-derived token handed to a
   restricted role is this oracle.
4. **The hash chain re-remembers ledger facts.** Per-row
   integrity already lives in `request_hash` (the replay
   key); lineage already lives in
   `latchedHeadMessagePairId` (the R9 latch). The chain
   adds N-rows-per-token ambiguity (`lookupStoredRevision`:
   "N → latest", `api/document-family.ts:397-409`).
5. **Preconditions compare one identity and latch
   another.** The gate compares If-Match against a hash,
   then re-checks the head *pair id* in the transaction
   (`api/routes.ts:3861-3870`). Every PATCH translates
   between them.

## Goals

- One state, one ETag, for every caller — the same token
  in the `ETag` header, the `etag` field of list rows and
  history entries, and the `/versions/:etag` path.
- Nothing on the wire is derived from content. The oracle
  closes by construction, not by a key.
- Precondition and in-transaction latch compare one value.
- Delete the projected-ETag machinery and the hash chain.
- Every existing status ladder,
  `Authorization-Limited-Attributes`, replay, and
  same-body-PUT behavior is unchanged.

## Non-goals

- Which routes advertise an ETag. Record-type PUT and
  detail advertise none today (composed-op family outside
  the document-PUT rule); that stays as it is.
- Conditional GET / 304. None exists; none is added.
- The same-body PUT rule. It compares octets
  (`api/api.ts:1349`), never the tag.
- The attribute ACL projection. `eed0e26a` stands.
- A migration script. Schema evolution is wipe + reseed
  (see Design 4).
- `request_hash`, `Response-ID`, `Operation-ID`.

## Design

### 1. The token

Every message pair already has a unique, random identity:
its `id` (16 random bytes, `shared/identifier.ts:6`). That
is the ETag.

- `ETag` and `If-Match` carry a quoted message-pair
  identifier. `parseIfMatch` (`api/message-pair.ts:446-459`)
  accepts `"<identifier>"` via `isIdentifier` and drops
  `HEX64`; `HEX64` remains for `request_hash`.
  `strongEtagOf` is unchanged.
- The `/versions/:etag` path token is a pair id. The
  identifier route gate
  (`tests/api-identifier-route-gate.test.ts`) no longer
  needs an exemption for the token segment.
- Every `/versions/` index row that carried `version`
  (`api/derive-documents.ts:164,210,230,249`,
  `api/types.ts:412-414`) carries `etag` instead, holding
  the pair id. Instance history entries drop `version`;
  their `etag` is the revision pair id.
- `INSTANCE_VERSION_PATTERN` renames `:version` to `:etag`
  (`api/family-registry.ts:145`), matching the generic
  leaf.
- Consequence to document: a plain document PUT's `ETag`
  equals its `Response-ID`. Document-class GET detail
  already sends `Response-ID: <head pair id>` beside the
  hash ETag (`api/api.ts:1562-1578`); after this change
  the two headers carry the same value. Both stay — one
  names the exchange, one is the validator. Instance
  reads never emitted `Response-ID` and still do not.

RFC 7232 asks that a strong validator change whenever the
representation changes. A fresh pair per write satisfies
that. It does not require identical bytes to share a tag.

### 2. Gate and preconditions

- `livePutVersion` (`api/api.ts:260-276`) becomes the head
  pair id alone; `advertised` is `livePut.messagePairId`
  and `echoMatchesHead` compares the parsed If-Match to
  it (`:887-897`).
- `matchedEtag` deletes everywhere: the form input
  (`api/message-pair.ts:114`), the hash call (`:246-248`),
  `formDocumentMessagePairFor` (`api/routes.ts:3450`,
  `:3519-3520`) and its callers (`:1596`, `:2370`,
  `:3854`), and the gate (`api/api.ts:990`).
  `latchedHeadMessagePairId` stays and now carries the
  exact If-Match token, so the R9 re-check compares the
  same value the gate compared.
- Write responses attach the pair id: document PUT
  (`api/api.ts:1411`, `:1471`, `:1725`; replay `:1062`),
  `attachStored` / `responseFromStored`
  (`api/message-pair.ts:588-602`). Instance PATCH attaches
  the *revision* pair id via `revisionMessagePairIdForPatch`
  (`api/api.ts:346-364`) on both the live path
  (`:1785-1812`) and replay (`:1020-1060`);
  `advertisedForRevisionMessagePair` reduces to that
  lookup.
- 412 / 428 bodies (`preconditionDocument`,
  `api/api.ts:328-343`; PATCH precondition `:1236-1252`)
  carry the head pair id.
- Document GET detail (`api/api.ts:1562-1578`) attaches
  `headMessagePairId`. The generic `/versions/:etag`
  branch (`:1581-1595`) keeps "ETag is the path token".
  The `INSTANCE_VERSION_PATTERN` special case
  (`:1597-1625`) deletes — the generic branch covers it.

### 3. Instances

- Detail `ETag`, list-row `etag`, history `etag[0]`: all
  `head.messagePairId`, which `deriveInstanceHead` and
  `deriveInstanceCollection` already return. The list
  route's per-row `instanceParentEtag` read and sha256
  (`api/routes.ts:5389-5397`) delete; a list GET does no
  extra I/O per row.
- History (`api/routes.ts:5418-5460`): `etag:
  rev.messagePairId`; no parent read, no hash, no
  `version` field.
- Leaf (`:5463-5495`): `lookupStoredRevision` by pair id
  (Design 4), then the existing projection.
- Preconditions: instance PATCH (`:3786-3810`) and the
  work-order transition (`:2290-2320`) compare
  `ifMatchTarget !== head.messagePairId` → 412. No
  projection is needed to compare.
- `instanceAdvertised` (`api/api.ts:280-315`) returns
  `{ etag: head.messagePairId, limited }`;
  `projectionOmitsStored` and
  `Authorization-Limited-Attributes` are unchanged.
- Deletes: `advertisedInstanceEtag`, `instanceParentEtag`,
  `InstanceRevision.version`, the `documentVersion` and
  `jsonBodyOctets` imports in
  `api/derive-record-instances.ts`.

### 4. Storage and the message store

- `lookupStoredRevision(db, prefix, id, etag)`
  (`api/document-family.ts:399-409`) reads
  `messagePairsAt(db, prefix, id)` — the prefix-indexed
  read every derive uses — and returns the pair whose
  `id === etag`, else undefined. A foreign or absent pair
  id is simply not in the collection, so the caller's
  existing `missedReadError` ladder answers. No by-id
  read, no thrown `EntityNotFoundError`, and the tenancy
  fence holds by construction.
- Delete the version seam: `getByVersion`
  (`api/message-store.ts:47,93`), `getAllAtVersion`
  (`api/db.ts:101`, `api/store-history-entity.ts:66-76`),
  `getAddressVersion` (`api/db.ts:166`,
  `api/backend-postgres.ts:193-203`,
  `api/backend-buffer-tx.ts:122-140`),
  `selectAddressVersion` (`api/backend-postgres.ts:477-491`).
- Delete the hash: `documentVersion`
  (`api/message-form.ts:136-150`),
  `MessagePairEntity.responseEtag`
  (`api/message-pair.ts:65`, `:260`), the `version` write
  in `writeMessagePairRows` (`:717`), the
  `MessagePairEntity.version` validator branch
  (`api/validators.ts:2393-2398`), the row read and
  insert / upsert columns (`api/backend-postgres.ts:544`,
  `:554-573`), `DocumentMessagePair.version`
  (`api/derive-documents.ts:62,98`).
- DDL: drop the `version` column, its CHECK
  `message_pairs_version_chk`, and the
  `message_pairs_version` index
  (`api/schema-postgres.ts:28-30,64-65`). Regenerate
  `SCHEMA.svg`. DELETE pairs need no substitute — a DELETE
  response is 204 without an ETag, as now.
- **Schema evolution** (the Unwritten Scroll, named).
  Existing databases carry a NOT NULL `version`. The
  operator step is `./postgres-wipe` then
  `./postgres-seed` for compose and for render. No
  migration script ships. This is the one operational
  cost of the change.

### 5. Errors

Shapes are unchanged: malformed If-Match (not a quoted
identifier) → 400; live head without a pin → 428;
mismatch → 412; absent or foreign leaf → the
`missedReadError` ladder. One class of defect — drift
between the hash the gate compared and the id the
transaction latched — ceases to exist.

### 6. Docs and client

- `API.md:60-64` (wire headers; If-Match validator format)
  and `:99` (locked PUT If-Match) describe a quoted
  message-pair identifier.
- `SCHEMA.md:32-34` item 4 becomes: the pair id is the
  ETag; integrity is `request_hash`; lineage is the
  latched head. No chain.
- `web-app/app/adapters/record-instances.ts:41` drops the
  optional `version` wire field. Nothing else in the
  client parses a tag (zero hex pins).
- TEST-PLAN.md speaks of "the instance etag"
  semantically and needs no change.

## Testing

Covenants first, each watched red before the change:

- Detail `ETag`, list-row `etag`, history `etag[0]`, and
  the PATCH response `ETag` are identical for a member
  and an admin, and equal the head pair id.
- If-Match with that shared token succeeds for both
  roles; a stale token → 412; live head with no pin →
  428.
- `/versions/:etag` resolves a revision by pair id for
  both roles and 404s a pair id from another
  organization's collection.
- After A → B → A on a document family, the three
  history entries carry three distinct tags.
- A plain document PUT's `ETag` equals its `Response-ID`;
  a document GET detail's `ETag` equals its `Response-ID`.
- `Authorization-Limited-Attributes` appears exactly where
  it does today.

Then adapt what the token change touches: eight files pin
`HEX64` (`tests/api-instances-read.test.ts`,
`api-instances-patch`, `api-instances-precedence`,
`api-record-document`, `message-store`, `document-family`,
`derive-documents`, `api-write-status`); the hash
arithmetic tests in `tests/if-match-primitives.test.ts`
and `tests/message-form.test.ts` are **deleted** — the
revival covenant was wrong, not weakened. The plan
enumerates the rest by grep (`HEX64`, `documentVersion`,
`getByVersion`, `responseEtag`, `matchedEtag`,
`\.version\b`; 35 test files mention the word).
`./validate` gates every commit; `./test-postgres` must
also pass for the DDL change.

## Sequencing

Each commit builds, passes `./validate`, and carries one
concern:

1. This spec.
2. The gate and message pair: ETag is the pair id for
   document families; `parseIfMatch` accepts identifiers;
   `matchedEtag` deletes. (The `version` column is still
   written until 5.)
3. Instances: ETag is the head / revision pair id; the
   projected-ETag machinery deletes; `:version` → `:etag`;
   history drops `version`.
4. Versions index rows: `version` → `etag`; the client
   wire type drops `version`.
5. Storage: the version seam, the hash, the column, the
   index, and the validator branch delete;
   `lookupStoredRevision` reads by pair id within the
   address; `SCHEMA.svg` regenerates.
6. Docs: `API.md`, `SCHEMA.md`.
7. Operator: wipe and reseed compose and render.

## Evidence

- Oracle: scratch test, admin-only text attribute,
  candidates `pending|approved|rejected`; the member's
  hash of the sorted `{values}` body matched `version₀`.
- Gate reads If-Match only for locked writes
  (`api/api.ts:887-889`); simple families never
  precondition, locked families and instance PATCH always
  chain — so A → B → A already yields a distinct third
  tag wherever a precondition exists.
- Record-type PUT: four PUTs (A, B, A, A), four
  `Response-ID`s, all 201, no `ETag` on write or detail.
- `documentVersion` production callers: one
  (`api/message-pair.ts:246`) plus the instance projection
  code this design deletes. No chain verifier exists.
- Web-app hex pins: 0. Test files pinning `HEX64`: 8.
