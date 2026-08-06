# Org-Nested Record Types & Instances — Design

Date: 2026-08-02
Status: approved (brainstorm 2026-08-02; user gates
passed)

## Context

Today’s `Record` is a **schema** (data shape bound to
flows), not a data row. `RecordAttribute` documents
define fields. Actual values live only on work-order
transition `field_values`. Pair storage is already
org-nested via `canonicalUriPrefix`; the public wire is
often flat with an optional facade rewrite.

Product needs (canonical example: **rental property**):

- Org-owned master data for a typed entity.
- Many concurrent processes (lifecycle WO + inspection /
  repair / maintenance WOs) sharing one instance.
- Admin-defined schema with attribute-level read/write
  ACL from token roles.
- Partial updates under optimistic concurrency.

This design rectifies names, deepens the API tree, and
introduces first-class instances. One design document;
two implementation phases (types+instances first; work-
order SoT coupling second).

## User decisions

1. **Instance = first-class document**, not a projection
   of transition field values.
2. **Instances are source of truth** for values; phase 2
   moves WO transitions to `instance_id` + asserted
   `record_type_id`.
3. **One design, two implementation phases** (types +
   instances; then WO rewrite).
4. **PATCH** with atomic GET→merge→PUT-pair under one
   datastore transaction; **If-Match / ETag** required.
5. **Attribute ACL** on type attributes; roles from
   **token only** (no principal DS hop); accept mint
   latency for role change.
6. **Nested storage = nested wire** (API-TREE under
   `/organizations/:id/` is bedrock truth). Rejected:
   root storage + org-only wire.
7. **Shared multi-WO instances** (not WO-private bags).
   Org owns the instance. 0..N work orders may bind it.
8. **Current placement:** at most one node per WO;
   write-time UNIQUE spirit on `(work_order_id,
   instance_id)`. History may visit many nodes.
9. **One record-type per WO** (flow binding unchanged).
10. **PATCH body:** domain `{ set, clear }`; omit =
    unchanged; write ACL on every key or 403
    all-or-nothing.
11. **Create = PUT genesis in phase 1** (not deferred).
    PATCH never creates (404 if missing). 412 →
    **client** re-GET + retry.
12. **ACL defaults:** `read_roles` and `write_roles`
    both `["member","admin"]` on attribute create;
    **admin bypass** read+write.
13. **Optimistic locking unification** after this ships:
    migrate flows from If-Response-ID to If-Match/ETag.
    Author to be reminded at completion.

## Goals

1. Ship org-nested **record-types**, **attributes**, and
   **instances** with one identity on wire and storage.
2. Admin-only schema mutation; member instance I/O with
   attribute ACL projection and write gates.
3. Safe partial update under concurrent writers (ETag).
4. Document house style: org-owned resources nested-
   primary; records subtree first.
5. Specify phase-2 WO coupling without requiring it in
   the first implementation wave.

## Non-goals

- Migrating ideas/projects/flows nested wire in the same
  wave (doctrine only).
- Unifying flows to If-Match in this wave.
- Fine-grained custom roles product UI (ACL arrays are
  ready for future role names on the token).
- Real-time ACL without mint/refresh latency.
- Multi-type instances on one work order.
- Root storage for tenant documents.
- Full instance UI product beyond adapters + minimal
  surface needed to exercise the API (scope UI
  deliberately in the implementation plan).

## Vocabulary

| Old | New | Meaning |
| --- | --- | --- |
| Record / records | RecordType / record-types | Schema |
| RecordAttribute | attribute under type | Field + ACL |
| *(none)* | RecordInstance / instances | Data row |
| RecordId (on type) | RecordTypeId | Type id |
| *(new)* | InstanceId | Instance id |

Route params: `:organization-id`, `:record-type-id`,
`:attribute-id`, `:instance-id`. Never overload a single
`record-id` for both type and instance.

## Product model

**Rental property** instance of a record-type:

- Organization owns the property (master data).
- Lifecycle work order: prepare → market → select
  tenant → sign → lease end → restart (loop).
- Side-flow work orders: inspections, repairs,
  maintenance — may run at many lifecycle points,
  asynchronously to each other and to the lifecycle WO.
- Same instance binds all of those WOs (0..N).
- Within one WO, the instance occupies **at most one
  current node**. Enforcement: write-time gate
  (relational UNIQUE spirit on `(work_order_id,
  instance_id)` for current placement). Optional graph
  invariant is belt only.
- “In a node” means **current** placement only. History
  is append-only multi-visit; uniqueness does not apply
  to historical visits.
- One WO binds one record-type only.

## URI tree (wire = storage)

```text
/organizations/:organization-id/
  record-types/
    :record-type-id
      attributes/
        :attribute-id
      instances/
        :instance-id
```

### Identity rules

- Pair `uri_prefix` / document address matches this path.
- Path `:organization-id` must match the fenced token
  org claim (never authorize from path alone).
- Nested routes match in the route table **before** any
  blind `/organizations/:org/...` facade rewrite.
- No permanent facade as the story for this family.
- Site-wide analytics: platform-tier global scan/index
  over the message plane (tables are already global; org
  lives in the uri_prefix string). Do not move tenant
  documents to root addresses for aggregation.

### House style

Org-owned families migrate to nested-primary wire over
time. This design implements the records deep tree
first. Global plane stays off the org path (identities,
authentication, snapshots, invitations side channel,
identity token surfaces).

API-TREE.md top-level “derived view over org-nested
canonical storage” lines are dual-wire debt; retire as
families go nested-primary. Update the records subtree
to record-types / attributes / instances.

## Verbs and authorization

### Record types — organization admins only

| Method | Path | Notes |
| --- | --- | --- |
| GET | `.../record-types` | Collection |
| GET | `.../record-types/:id` | |
| PUT | `.../record-types/:id` | Create or replace head |
| DELETE | `.../record-types/:id` | Tombstone; RESTRICT if instances/refs |
| GET | `.../record-types/:id/history` | If trio lifecycle retained |

### Attributes — organization admins only

| Method | Path | Notes |
| --- | --- | --- |
| GET | `.../attributes`, `.../attributes/:id` | |
| PUT | `.../attributes/:id` | Body includes ACL fields |
| DELETE | `.../attributes/:id` | RESTRICT if values/refs |

Type create may compose attribute document pairs in one
transaction (precedent: today’s record write op that
bundles document + attribute pairs).

### Instances — member path + attribute ACL

| Method | Path | Notes |
| --- | --- | --- |
| GET | `.../instances` | List; project values by read ACL |
| GET | `.../instances/:id` | Project by read ACL; return **ETag** |
| PUT | `.../instances/:id` | **Create (genesis)** — phase 1 |
| PATCH | `.../instances/:id` | Partial update; **If-Match required** |
| DELETE | `.../instances/:id` | Tombstone; RESTRICT when placements exist |

Path policy: schema surfaces admin-only; instances
member-tier at the path gate, then per-attribute ACL.
Retire member write on flat `/records` and
`/record-attributes` when those routes retire.

## Attribute ACL

Each attribute document:

```text
read_roles:  string[]
write_roles: string[]
```

- Defaults on attribute create: both
  `["member", "admin"]`.
- Evaluation: any intersection of the token’s projected
  org roles with the list. Principal resolution uses
  the token only (existing mint/refresh/exchange
  latency covenant for role change).
- **Admin bypass:** an admin may read and write every
  attribute even when not listed. Members are list-true
  only.
- GET instance: include only values the caller may read.
- PUT/PATCH value keys: every presented attribute_id
  must be write-permitted; otherwise **403** for the
  whole request (no partial apply).
- ACL list edits on attributes take effect on the next
  type/attribute read (policy data). Role grants on the
  principal take effect at next mint/refresh.

## Instance bodies and concurrency

### Create — PUT genesis (phase 1)

```http
PUT .../instances/{instance-id}
{ "set": [ { "attribute_id": "...", "value": "..." } ] }
```

- Client-minted id; organization and type from URI.
- No If-Match (no prior head). Optional later:
  `If-None-Match: *` for strict create-only.
- Write ACL on every attribute in `set`.
- Required attributes enforced at create (schema flags).
- If a head already exists at that URI: **409**. Create
  does not overwrite; clients use PATCH to update.

### Update — PATCH

```http
PATCH .../instances/{instance-id}
If-Match: "<etag>"
{
  "set":   [ { "attribute_id": "...", "value": "..." } ],
  "clear": [ "attribute_id" ]
}
```

| Rule | Behavior |
| --- | --- |
| Attribute omitted | Unchanged |
| `set` | Overwrite value |
| `clear` | Value absent |
| Missing If-Match | **428 Precondition Required** |
| Stale If-Match | **412 Precondition Failed** |
| Missing instance | **404** (PATCH never creates) |
| Unknown attribute_id | **400** |
| Not writable | **403** all-or-nothing |
| Constraint / type fail | **400** structured violations |
| Empty `set` and `clear` | **400** |
| Required attributes | Not re-enforced on every PATCH; process gates later |

**Lost update:** 412 only. The **client** re-GETs (new
ETag and body), reconciles, and retries. The server does
not auto-retry or merge concurrent patches.

**Server transaction (one datastore tx):** load head +
type + attributes → authorize keys → validate → merge →
append document pair → emit new ETag. This is GET-merge-
PUT composition under the hood. The pair plane remains
append-only (Supersedes / locked follows as chosen for
the family).

### GET projection

Return only read-permitted attributes. Sparse PATCH is
required for correctness with filtered GET: a full
replace would drop or demand fields the client never
saw.

### ETag definition

**Default:** ETag is the head pair’s response identity
(aligns with eventual unification with today’s
If-Response-ID value). Pin the exact byte source in
implementation tests.

Flows keep **If-Response-ID** until a post-ship
unification migrates them to If-Match/ETag.

## Work-order coupling

### Phase 1 — types and instances

- Nested record-types, attributes, instances live.
- WO transition `field_values` **unchanged**
  (acknowledged dual-model window).
- Placement UNIQUE ships with phase 2 (when binds
  exist), unless an earlier bind UI requires it.

### Phase 2 — instance as process SoT

- Transition and/or work-order document carries:
  - `instance_id`
  - `record_type_id` (**asserted-and-checked**: instance
    exists under that type; type matches the flow’s
    bound type)
- Live values read from the **instance head**.
- Write-time UNIQUE current placement
  `(work_order_id, instance_id)` with a single current
  `node_id`.
- Inline field_value bags shrink or retire as live
  source of truth. **Default:** keep optional value
  **snapshots on transition** for audit; live GET uses
  the instance.
- Update adapters, transition UI, and RESTRICT paths.

## HTTP status covenant (instances)

| Outcome | Status |
| --- | --- |
| Unauthenticated | 401 |
| Wrong org / no membership | 403 |
| Admin-only surface as member | 403 |
| Attribute write denied | 403 |
| Missing type or instance | 404 |
| Create id already exists | 409 |
| Validation / unknown attribute | 400 |
| Missing If-Match on PATCH | 428 |
| Stale If-Match | 412 |

Foreign vs absent follows the existing ownership-fence
honest-status covenant.

## Migration

1. Rename storage prefixes:
   `/organizations/{org}/records/` →
   `/organizations/{org}/record-types/`.
2. Re-home attribute pairs under the type prefix
   (parent type id from today’s `record_id`).
3. Retire flat `/records` and `/record-attributes`
   (optional short alias window).
4. Update mock seed, absolute pair counts, drift tests,
   adapters, and `web-app/records/*` (types as admin
   schema UI; instances UI scoped in the plan).
5. Phase 1 may seed **zero** instances; seed types from
   existing Customer Profile / Project Brief records.

## Documentation and tests

| Artifact | Change |
| --- | --- |
| API-TREE.md | Nested record-types tree; house-style note |
| API.md | Catalog, PATCH composition, ETag, ACL, phases |
| ARCHITECTURE.md | Nested-primary, adapters, tenancy |
| SCHEMA.md | Entity shapes, uri_prefix examples |
| SCHEMA.svg | If type shapes change (`./validate` gate) |
| Automated tests | ACL, 412/428, validation, org fence, PUT create, PATCH set/clear |
| TEST-PLAN.md | Browser cases as needed |

## Implementation phases

| Phase | Deliverable |
| --- | --- |
| **1a** | Nested dispatch + record-types rename + admin gate + tree docs |
| **1b** | Attributes nested under types + ACL fields + defaults |
| **1c** | Instances PUT/GET/PATCH + ETag + validation + tests |
| **1d** | Client adapters + minimal UI; seed types |
| **2** | WO `instance_id` + `record_type_id`; placement UNIQUE; field_values SoT retirement path |

## Micro-defaults (approved)

1. ETag = head pair response identity.
2. Instance DELETE supported with RESTRICT when WO
   placements exist (phase 2); phase 1 may ship DELETE
   without placements yet.
3. Type lifecycle trio (parity with today’s record
   states) retained.
4. Phase-2 transition snapshots: yes for audit.

## Out of scope

- Same-wave nested migration of ideas/projects/flows.
- Same-wave If-Match migration for flows.
- Custom roles admin UI.
- Real-time ACL without token refresh.
- Multi-type-per-WO.
- Root-addressed tenant documents.

## Post-ship reminder

When phase 1 (and ideally phase 2) of this work is
complete, **remind the author** to schedule optimistic-
locking unification: migrate flows (and any other
If-Response-ID surfaces) to **If-Match / ETag** so the
platform has one concurrency dialect.

## PR plan (sketch)

Detailed task breakdown belongs in the implementation
plan after this spec is accepted. High-level stack:

1. Spec + API-TREE/API.md doctrine notes (docs-only).
2. Nested route dispatch + record-types family rename.
3. Attributes under types + ACL.
4. Instances + PATCH/ETag + tests.
5. Adapters/UI/seed.
6. Phase 2 WO coupling (separate PR stack).

## References

- [API-TREE.md](../../../API-TREE.md) — target URI tree
- [API.md](../../../API.md) — route catalog, pair plane
- [ARCHITECTURE.md](../../../ARCHITECTURE.md) — tenancy,
  facade, adapters
- [SCHEMA.md](../../../SCHEMA.md) — message plane
- Church of Code — Reliability, Security, Uniformity,
  Idempotency, validate at gates
