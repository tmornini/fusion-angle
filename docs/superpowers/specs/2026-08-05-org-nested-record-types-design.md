# Org-Nested Record Types & Instances — Design (v2)

Date: 2026-08-05
Status: approved successor to
[2026-08-02-org-nested-record-types-design.md](2026-08-02-org-nested-record-types-design.md)
(brainstorm 2026-08-02; strengthening review 2026-08-05
against the codebase, user gates passed; the original is
preserved unaltered by request).

## Context

Today's `Record` is a **schema** (data shape bound to
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

This revision was verified line-by-line against the
codebase. Where the 2026-08-02 text assumed mechanisms
that do not exist (a schema-level required flag,
server-side value validation, RESTRICT on record delete,
a one-transaction merge), this document names the work
as net-new or redesigns it onto the platform's actual
machinery. Guarantees decided on 2026-08-02 are
preserved throughout; mechanisms are corrected.

## User decisions

Decided 2026-08-02:

1. **Instance = first-class document**, not a projection
   of transition field values.
2. **Instances are source of truth** for values; phase 2
   moves WO transitions to `instance_id` + asserted
   `record_type_id`.
3. **One design, two implementation phases** (types +
   instances; then WO rewrite).
4. **PATCH** with atomic GET→merge→PUT-pair semantics;
   **If-Match / ETag** required. (Mechanism refined by
   decision 15 — the lost-update guarantee is
   unchanged.)
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

Decided 2026-08-05 (strengthening review):

14. **No schema-level required flag — anywhere.**
    Required-ness lives only on exit-node / transition
    validation (the existing node-level `isRequired`),
    because fields legitimately become optional at
    points in an instance's post-create lifecycle.
    Instance create enforces no required attributes.
15. **Concurrency mechanism substitution, guarantee
    preserved.** Decision 4's "one datastore
    transaction" letter is impossible on this platform
    (pair crypto is pre-transaction by the auto-commit
    discipline). The PATCH pipeline is: pre-tx head
    read → If-Match check → merge → form pair with
    `follows` = head response id → one transaction
    appends. The UNIQUE `responses.follows` index is
    the serializable backstop (a lost race raises
    `UniqueConstraintError` → 412). No lost update;
    stale → 412; client retries — exactly as decided.
16. **Schema read tier: member.** GET on record-types
    and attributes is member-tier; PUT / DELETE / POST
    are admin-only. (Resolves the 2026-08-02 internal
    contradiction between the verbs tables and Goal 2's
    "admin-only schema mutation".)
17. **Instance history ships in phase 1** as a
    value-revision chain (shape in § Instance history).
18. **Legacy prefixes are rejected at the snapshot
    gates** (anchored predicates; see § Migration)
    rather than silently orphaned.

## Goals

1. Ship org-nested **record-types**, **attributes**, and
   **instances** with one identity on wire and storage.
2. Admin-only schema mutation; member schema reads;
   member instance I/O with attribute ACL projection
   and write gates.
3. Safe partial update under concurrent writers (ETag).
4. Document house style: org-owned resources nested-
   primary; records subtree first.
5. Specify phase-2 WO coupling without requiring it in
   the first implementation wave.

## Non-goals

- Migrating ideas/projects/flows nested wire in the same
  wave (doctrine only).
- Unifying flows to If-Match in this wave.
- Fine-grained custom roles product UI. NOTE: the ACL
  arrays STORE free role strings, but the token gate's
  alphabet is closed today (`admin` | `member`;
  `projectClaimRolesForOrganization` hard-drops any
  other base). Widening is a named future change across
  three sites: `MembershipType`, `MEMBERSHIP_TYPES`,
  and the projection allowlist.
- Real-time ACL without mint/refresh latency.
- Multi-type instances on one work order.
- Root storage for tenant documents.
- A schema-level required flag (decision 14 — required
  is transition validation, never data-at-rest).
- Renaming the `flows/:id/records` join family (see
  § Migration — accepted vocabulary debt).
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

Stored-body rectification: after the re-home, parent
identity lives in the ADDRESS only. Attribute bodies
DROP `record_id` (the type id rides the uri prefix);
instance bodies carry values only (type and org parse
from the address). Wire entities may still echo
address-derived ids per the house successBody pattern.
No body/address duplication.

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
- "In a node" means **current** placement only. History
  is append-only multi-visit; uniqueness does not apply
  to historical visits.
- One WO binds one record-type only. NOTE: this is
  convention, not an enforced invariant — the seed
  already binds one record to two flows via the
  `flows/:id/records` join family. Phase 2 names the
  enforcement point or accepts the convention (see
  § Work-order coupling).
- Required-ness is a PROCESS property (decision 14): an
  exit node may require a value to leave that node;
  the instance at rest never does.

## URI tree (wire = storage)

```text
/organizations/:organization-id/
  record-types/
    :record-type-id
      attributes/
        :attribute-id
      instances/
        :instance-id
          history
```

### Identity rules

- Pair `uri_prefix` / document address matches this path.
- Path `:organization-id` must match the fenced org
  (never authorize from path alone). Mechanism: nested
  in-table routes fence from the VERIFIED token claim
  via `fenceRequest`; a path/claim mismatch is **403**.
  There is NO auto-exchange — this diverges from
  today's facade, which re-mints against the path org.
  A nonexistent path org is also 403 (no route-topology
  oracle), matching today's probed facade posture.
- Nested routes match in the route table **before** any
  blind `/organizations/:org/...` facade rewrite.
  Implementation note: today the facade branch fires at
  `api/api.ts:275` BEFORE `matchRoute` at `:306`; the
  inversion must preserve facade behavior for every
  other org-nested family (regression surface:
  `tests/api-facade-*.test.ts`).
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

API-TREE.md carries the "derived view over org-nested
canonical storage" dual-wire phrasing on exactly two
families (records, work-orders) — retire the records
line as this family goes nested-primary. Update the
records subtree to record-types / attributes /
instances.

## Verbs and authorization

Schema surfaces: member READ, admin MUTATION
(decision 16). Instances: member-tier at the path gate,
then per-attribute ACL. Today's flat wire grants
members schema MUTATION (`api/authorization.ts:114-115`)
— this design tightens mutation to admins. Retire
member write on flat `/records` and `/record-attributes`
when those routes retire.

### Record types

| Method | Path | Tier | Notes |
| --- | --- | --- | --- |
| GET | `.../record-types` | member | Collection |
| GET | `.../record-types/:id` | member | No attribute embed |
| PUT | `.../record-types/:id` | admin | Create or replace head |
| POST | `.../record-types` | admin | Composed op (below) |
| DELETE | `.../record-types/:id` | admin | Tombstone; RESTRICT (below) |
| GET | `.../record-types/:id/history` | member | Lifecycle trio history |

Type GET does not embed attributes — clients fetch the
nested collection (today's two-GET adapter pattern).
The history row is definite (micro-default 3).

**Composed op (retained, renamed).** Today's
`POST /records` write op is create-AND-edit (`kind`
discriminated; edit carries `removedAttributeIds` with
an in-transaction RESTRICT; `api/routes.ts:1000-1069`),
bundling the operation pair + document pair + N
attribute pairs in one transaction. Both UI modes
depend on that atomicity. It survives as
`POST .../record-types`, admin-gated. Its edit-mode
removal RESTRICT and the individual attribute DELETE
row share one predicate — one voice.

**Type DELETE RESTRICT is net-new** (today
`DELETE records/:id` is a bare tombstone with no
referrer check). Predicate: any live (non-tombstoned)
instance under the type, OR any live `flows/:id/records`
join naming the type. 409 names the blockers, matching
the attribute-referrer convention.

### Attributes

| Method | Path | Tier | Notes |
| --- | --- | --- | --- |
| GET | `.../attributes`, `.../attributes/:id` | member | Incl. ACL arrays |
| PUT | `.../attributes/:id` | admin | Body includes ACL fields |
| DELETE | `.../attributes/:id` | admin | RESTRICT (predicate below) |

Members reading attribute documents see the org's ACL
topology (`read_roles` / `write_roles` unfiltered).
Accepted and stated: members must learn their own ACL
to render forms; hiding the arrays would require a
second projection mechanism for no security gain
against co-members of the same org.

**Attribute DELETE RESTRICT** extends today's three
referrer legs (work-order frozen `flow_graph` bindings,
live flow-graph bindings, state field values —
`api/record-attribute-refs.ts`) with a fourth net-new
leg: any live instance head carrying a value for the
attribute. Remedy: clear the values first.

### Instances

| Method | Path | Tier | Notes |
| --- | --- | --- | --- |
| GET | `.../instances` | member | List; read-ACL projection; id-lex ASC |
| GET | `.../instances/:id` | member | Project by read ACL; return **ETag** |
| PUT | `.../instances/:id` | member | **Create (genesis)** — phase 1 |
| PATCH | `.../instances/:id` | member | **If-Match required** |
| DELETE | `.../instances/:id` | member | Tombstone; unconditional |
| GET | `.../instances/:id/history` | member | Value-revision chain |

DELETE gains the placement RESTRICT in phase 2
(micro-default 2); the history shape is § Instance
history (decision 17).

Instance DELETE and empty genesis (`set: []`) pass only
the path-tier member gate: a member holding zero
attribute write roles may still create an empty
instance or tombstone one. Accepted and stated for
phase 1 — attribute ACL governs VALUES, not instance
existence (parity with today's member DELETE tier);
phase 2's placement RESTRICT narrows deletion.

Instances carry NO lifecycle alphabet (no trio). Their
existence story is head-or-tombstone; their change
story is the value-revision history.

## Attribute ACL

Each attribute document:

```text
read_roles:  string[]
write_roles: string[]
```

- Defaults on attribute CREATE: both
  `["member", "admin"]`, from one named constant
  (`DEFAULT_ATTRIBUTE_ACL_ROLES`). Stamped INTO the
  stored body at create when the keys are omitted —
  storage always carries both arrays explicitly; no
  read-time fallback ever fills them in.
- On REPLACE (a PUT over an existing head) both keys
  are REQUIRED in the body (400 if absent) — no silent
  drift back to defaults.
- `[]` is a legal value and means admins only.
- Role strings are shape-validated free strings
  (non-empty). Unknown names are permitted as
  forward-compatible data, and match nothing until the
  closed token alphabet widens (see Non-goals).
- `write_roles` without `read_roles` is LEGAL
  (submit-only fields) — coherent because write
  responses echo the request delta, never the merged
  head (see § Write-success bodies).
- Evaluation: any intersection of the token's projected
  org roles with the list. Principal resolution uses
  the token only — the platform's NAMED COVENANT
  applies: de-membership / demotion / revocation bite
  at next mint/refresh/exchange or access TTL (≤ 15
  min), not the very next request.
- **Admin bypass:** a caller whose projected roles for
  the FENCED org include `admin` may read and write
  every attribute even when not listed. Members are
  list-true only. Never keyed to any global notion of
  admin.
- GET instance: include only values the caller may read.
- PUT/PATCH: every presented `attribute_id` — in `set`
  AND `clear` — must be write-permitted; otherwise
  **403** for the whole request (no partial apply).
- ACL list edits on attributes take effect on the next
  type/attribute read (policy data). Role grants on the
  principal take effect at next mint/refresh.

This is the codebase's FIRST field-level × role-aware
projection mechanism (today's projections are
role-blind, and its role checks are request-level) —
budget implementation effort accordingly.

## Instance bodies and concurrency

### Stored shape

The stored head body is the FULL materialized value
set: `{ "values": [ { "attribute_id", "value" } ] }`.
The wire PATCH is a delta; storage is complete state; a
GET is one head read. A cleared attribute is an ABSENT
element — never null, never a sentinel.

Values are strings, validated at the gate against the
attribute's `attribute_type`
(text / number / select / radio / date / checkbox) and
its `constraints`. **This validation is net-new server
work**: today the server accepts any string for any
attribute (`api/validators.ts:1884-1886`) and all
type/constraint enforcement is client-only
(`web-app/app/record-constraints.ts`). Where the
validation engine lives (shared with the client or
ported) is an implementation-plan decision.

### Create — PUT genesis (phase 1)

```http
PUT .../instances/{instance-id}
{ "set": [ { "attribute_id": "...", "value": "..." } ] }
```

- Client-minted id; organization and type from URI.
- The type must exist under the fenced org, else 404.
- No preconditions: an If-Match header on PUT is
  **400** (one dialect per verb); there is no
  If-None-Match (the 409 below already gives create-only
  semantics).
- `set` is required; `[]` is legal (no required
  attributes exist — decision 14).
- A `clear` key in a PUT body is **400**.
- Write ACL on every attribute in `set`.
- If ANY prior head exists at that address — including
  a tombstone — **409**. The address is spent; recovery
  is a fresh client-minted id. Create never overwrites
  and never revives.
- The existence check rides INSIDE the append
  transaction (read-check-write; precedents: work-order
  claim `api/routes.ts:2058-2117`, invitation accept
  `api/invitations-domain.ts:770-792`). Genesis pairs
  carry no `follows`, so the UNIQUE-index backstop
  cannot catch a create race — the in-tx check closes
  it.
- Success: **200** (house style — 201 has zero call
  sites platform-wide) + `ETag` header.

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
| `clear` of an already-absent value | Success no-op (convergent retry) |
| Duplicate attribute_id within `set` | **400** |
| Same attribute_id in `set` and `clear` | **400** |
| Missing If-Match | **428 Precondition Required** |
| Stale If-Match | **412 Precondition Failed** |
| Missing or tombstoned instance | **404** (PATCH never creates or revives) |
| Unknown attribute_id | **400** |
| Not writable | **403** all-or-nothing |
| Constraint / type fail | **400** (house error shape) |
| Empty `set` and `clear` | **400** |
| Required-ness | Not a PATCH concern (decision 14) |

**Lost update:** 412 only. The **client** re-GETs (new
ETag and body), reconciles, and retries. The server does
not auto-retry or merge concurrent patches.

**Pipeline (decision 15 — guarantee preserved,
mechanism platform-true):** pre-tx: read head → resolve
type + attributes → 404/428/412 outcomes → validate
body shape → authorize keys → validate values → merge →
form the pair with `follows` = head response id (all
crypto pre-tx per the auto-commit discipline). Then ONE
transaction appends the pair. If a concurrent writer
superseded the head between read and append, the UNIQUE
`responses.follows` index raises
`UniqueConstraintError`, mapped to **412** — the same
serializable backstop the locked class already gives
flows. The pair plane remains append-only.

Attribute ACL and schema are read pre-tx: a concurrent
admin ACL edit may race a PATCH by one request — this
is policy-data latency, consistent with the token-role
covenant, and accepted.

**Outcome table** (the instances analogue of the locked
class's four-outcome table):

| Case | Result |
| --- | --- |
| Head absent or tombstoned | **404** |
| Head present + If-Match absent | **428** |
| If-Match present + ≠ head response id | **412** |
| If-Match = head response id | Proceed; `follows` set |

428 is a NET-NEW status constant (`api/http-errors.ts`
has none today).

### Replay posture

Honoring Idempotency (Commandment VII) in writing:

- A byte-identical resend replays the stored response
  before any concurrency table runs (the platform's
  idempotency fast path) — a true idempotent retry.
  If-Match joins `HOISTED_HEADER_NAMES` so the echo is
  hash-covered; two PATCHes differing only in If-Match
  are DIFFERENT messages.
- Decision 11 split, named: byte-identical PUT resend →
  replayed stored 200 (nothing overwritten);
  NON-identical PUT against an existing head → 409.
- Non-identical PATCH retry with a stale If-Match →
  412; with the fresh If-Match → applies.
- DELETE replay → 204 (tombstone-wins; last writer is
  by design).

### Write-success bodies

PUT and PATCH 200 bodies echo the REQUEST-derived
delta — the validated `set` (and `clear`) as applied,
plus address-derived ids per the house successBody
pattern — and carry the new `ETag` header. They NEVER
echo the merged head. Rationale (Security): stored
write responses are replayable fixed bytes; echoing the
head would either leak write-only-not-read values or
freeze one caller's read projection into the replay.
GET is the only projection surface.

### GET projection

Return only read-permitted attributes. Sparse PATCH is
required for correctness with filtered GET: a full
replace would drop or demand fields the client never
saw.

- A caller who may read ZERO attributes still receives
  200 with an empty `values` array (instance existence
  is member-visible; the list would reveal it anyway).
  List rows likewise.
- Collection order: id-lexicographic ascending (the
  house `byIdAscending` convention). No pagination —
  platform-wide posture.
- ETag/ACL interplay, accepted: changes to attributes
  the caller cannot read still move the head ETag; a
  writer may 412 on a delta it cannot see. Re-GET +
  retry converges.

### Instance history (decision 17)

`GET .../instances/:id/history` — NOT a tenth clone of
the nine lifecycle-trio registrations. It is a
VALUE-REVISION chain:

- Wire (at, id) DESC, index 0 = current.
- Each entry: `{ at, etag, values }` — the revision's
  response identity and its full materialized value
  set, projected by the caller's CURRENT read ACL
  (never ACL-as-of-then).
- Foreign 403 / absent 404 per the house ownership
  fence. Own-org empty is impossible post-create
  (genesis is a revision).
- Doc ripple: the "nine history GET registrations"
  absolutes become "nine lifecycle + one value-history"
  (API-TREE.md:63, SCHEMA.md, CLAUDE.md).

### ETag definition

ETag is the head pair's **response identity** — strong,
double-quoted on the wire, echoed on instance GET, PUT,
and PATCH responses. If-Match parses exactly ONE strong
validator; lists and `*` are **400**.

NAME THE COLLISION: the stored `responses.etag` column
(`api/message-form.ts:101-108`) is a sha256 of the BODY
— content-addressing, storage-only, and UNRELATED to
this wire ETag. Implementers must not conflate them.
Pin the exact byte source in implementation tests.

Because the value is the response id, the eventual
flows unification (decision 13) is a header-dialect
rename, not a value migration. Flows keep
**If-Response-ID** until that post-ship unification.

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
    exists under that type; type matches the flow's
    bound type)
- Live values read from the **instance head**.
- Write-time UNIQUE current placement
  `(work_order_id, instance_id)` with a single current
  `node_id`.
- Inline field_value bags shrink or retire as live
  source of truth. **Default:** keep optional value
  **snapshots on transition** for audit; live GET uses
  the instance.
- Transition validation is where required-ness lives
  (decision 14): exit-node checks validate node-level
  `isRequired` against the INSTANCE's current values,
  server-side.
- OPEN QUESTIONS to settle at phase-2 design (named
  here so they are not discovered mid-build):
  - Do transition-driven value writes pass the same
    attribute write ACL and If-Match dialect as direct
    instance PATCH, or are they exempt as
    process-mediated writes? Decide then; default
    expectation is the SAME gate — one covenant.
  - "One record-type per WO" enforcement point (the
    join family permits N today) — enforce at bind
    time or accept convention.
- Update adapters, transition UI, and RESTRICT paths.

## HTTP status covenant (instances)

| Outcome | Status |
| --- | --- |
| Unauthenticated | 401 |
| Wrong org / no membership / nonexistent path org | 403 |
| Admin-only surface as member | 403 |
| Attribute write denied | 403 |
| Missing type or instance (or tombstoned) | 404 |
| Create id already exists (incl. tombstone) | 409 |
| Validation / unknown attribute | 400 |
| Missing If-Match on PATCH | 428 |
| Stale If-Match (incl. lost race at append) | 412 |
| Success: GET / PUT / PATCH | 200 |
| Success: DELETE | 204 (no body) |
| Known verb, no handler on route | 405 |

**Precedence ladder** (evaluation order is part of the
covenant; tests pin it):

1. 401 authentication
2. 403 org fence (path/claim mismatch; no membership)
3. 403 route policy (admin surfaces; verb tier)
4. 404 type existence under the fenced org
5. 404 instance existence (PATCH/DELETE/GET detail;
   tombstone = absent)
6. 428 missing If-Match (PATCH)
7. 412 stale If-Match
8. 400 body shape (parse, unknown keys, duplicates,
   set/clear overlap, empty)
9. 400 unknown attribute_id (schema truth is
   member-readable; no leak)
10. 403 attribute write ACL
11. 400 value type / constraint violations
12. 409 create-exists / RESTRICT (checked inside the
    append transaction, hence last)

Error bodies use the house shape —
`{ "error": "<string>" }` — with structured MESSAGE
strings per the assertOnlyKeys conventions. No
structured-violation body exists platform-wide; this
family does not introduce one.

Divergence, named (Uniformity): the locked class
answers "head exists, echo absent" with 412; instance
CREATE answers "head exists" with 409 (decision 11 —
create-only is a different question than
update-without-echo). Both dialects fold into the
post-ship unification review (decision 13).

Foreign vs absent follows the existing ownership-fence
honest-status covenant.

## Migration

1. Rename storage prefixes:
   `/organizations/{org}/records/` →
   `/organizations/{org}/record-types/`.
   Mechanics: the seed writes NO prefix literals —
   `canonicalUriPrefix` + the family registry drive
   every address, so the registry rename propagates.
   The absolute pair counts (1494 / bootstrap 12) are
   UNCHANGED by a pure rename (invocation count is
   identical), but every renamed pair's `message_hash`
   shifts (the stored request embeds the pathname) —
   hash-pinned assertions move.
2. Re-home attribute pairs under the type prefix
   (`.../record-types/{tid}/attributes/`; parent type
   id from today's `record_id`, which then DROPS from
   the stored body — address-only parentage). Pair
   ADDRESSES change; counts do not.
3. Retire flat `/records` and `/record-attributes`
   (optional short alias window). Any alias window is a
   WIRE-ONLY rewrite storing canonical NEW addresses —
   its own output must pass the snapshot gate below.
4. **Legacy-data posture (decision 18):** a prefix
   rename on the exact-key `uri_prefix` index with an
   unversioned IndexedDB open silently orphans old
   rows, and neither snapshot validator inspects
   `uri_prefix` VALUES — a legacy snapshot would import
   clean and its records vanish from view. Therefore:
   add a retired-prefix VALUE scan to
   `parseAndValidateSnapshot` (server, the universal
   gate) and `scanForRetiredKeys` (client fast-fail).
   The predicates are ANCHORED to the family position —
   `^/organizations/[^/]+/records/` and
   `^/organizations/[^/]+/record-attributes/` — never
   substring matches, because the live
   `flows/:id/records` join family legitimately stores
   `/organizations/{org}/flows/{fid}/records/` pairs.
   Rejection is an honest 400 naming the retired
   prefix; wipe-reseed is the documented recovery.
   (Accepting silent orphaning was considered and
   rejected: validate at the gates.)
5. `flows/:id/records` (route, `flow_records` naming,
   policy row, derive module) does NOT rename in this
   wave (decision 9: flow binding unchanged). "records"
   there now reads as record-TYPE — accepted vocabulary
   debt, pointed at a future rectification wave.
6. Known literal/enumeration sites the rename sweeps:
   `ORGANIZATION_NESTED_ENTITY_FAMILIES` + the
   one-level address regex (`api/derive-states.ts:80-89`
   — see Implementation notes for the deep-prefix
   posture), `WRITE_AUTHORIZERS`
   (`api/write-authorizer.ts:39-44`),
   `PAIR_WIRED_ROUTE_PATTERNS` and
   `DOCUMENT_CLASS_ROUTE_PATTERNS`
   (`api/message-pair.ts:591-594`, `:682-685`),
   `WRITE_RESPONSE_SPECS` entries
   (`api/routes.ts:2741`, `:2749`, `:2759-2760`), test
   prefix literals (`tests/mock-data-pairs.test.ts:441,
   459, 496`, `tests/message-pair.test.ts:65`,
   `tests/api-organization-isolation.test.ts:370`), and
   the four absolute-count doc sites
   (`tests/mock-data-pairs.test.ts:132, 1054`,
   `API-TREE.md:72`, `SCHEMA.md:107`).
7. Update mock seed, drift tests, adapters, and
   `web-app/records/*` (types as admin schema UI;
   instances UI scoped in the plan). Every records
   adapter speaks the flat wire today — nested-primary
   touches every call site, not a base-URL constant.
8. Phase 1 may seed **zero** instances; seed types from
   existing Customer Profile / Project Brief records.

## Implementation notes

Named here so effort is budgeted where the platform
must grow; details belong to the implementation plan.

- **PATCH is a verb-alphabet widening, not a route
  addition.** PATCH appears nowhere in the codebase.
  Sites that assume the four-verb alphabet: the route
  table's handler slots + `handleRequest`'s verb
  switch; `ROUTE_POLICY` (no PATCH rows — today PATCH
  is 403-by-policy for everyone, probed); `isWrite`;
  body parsing (PUT|POST only); **`writeAuthorizerFor`
  (PUT|DELETE only — an unwidened gate would let a
  foreign-id PATCH bypass the ownership fence:
  security-critical)**; `HOISTED_HEADER_NAMES`
  (If-Match must join If-Response-ID there); the client
  adapter facade (no `ctx.PATCH`); facade body
  forwarding (PUT|POST only — moot once nested-primary,
  named for any alias window); and the per-family
  verb-gap 405 pins (the new family needs its own).
- **Concurrency gating generalizes.** Today the locked
  gate fires only on exact two-segment `family/:id`
  patterns and the registry keys concurrency off the
  FIRST path segment — record-types and instances share
  that segment, and sub-addressed instances can never
  match the existing gate. The registry/gate move to
  pattern-keyed concurrency, and create-only PUT is a
  THIRD posture beside `simple` and `locked` (the
  registry enum widens).
- **Nested write addressing.** `canonicalUriPrefix`
  currently passes nested paths through only because
  `organizations` is registered un-nested (correct by
  coincidence); and `createdEntityUriId` resolves a
  create-body id only when the route pattern equals the
  family name — the composed nested POST must join that
  set explicitly or the op/document pair addressing
  silently changes. Family derivation moves from
  first-segment to route-pattern.
- **Deep-prefix ownership.** The one-level
  `ORGANIZATION_NESTED_FAMILY_ADDRESS_PATTERN` cannot
  match re-homed attributes or instances, so
  `resolveGlobalOwner` cannot resolve them. Deep
  sub-families are EXEMPT from the global-owner probe:
  the nested path org-fence plus parent-existence 404s
  (type must exist under the fenced org) subsume the
  ownership check. Any flat alias window keeps the
  existing authorizer for its flat addresses.
- **Net-new inventory** (reads as parity in the 2026-08-02
  text; is not): server-side value validation; type
  DELETE RESTRICT; the 428 constant; the first
  field-level × role-aware projection; the snapshot
  retired-prefix gates.

## Documentation and tests

| Artifact | Change |
| --- | --- |
| API-TREE.md | Nested tree; dual-wire retired; 9+1 histories; absolutes |
| API.md | Catalog; PATCH; outcome/replay tables; ETag; ACL; phases |
| ARCHITECTURE.md | Nested-primary, dispatch inversion, adapters, tenancy |
| SCHEMA.md | New no-table-family subsection; prefixes; counts |
| SCHEMA.svg | If type shapes change (`./validate` gate) |
| CLAUDE.md | History-registration count; records-family language |
| TEST-PLAN.md | Browser cases as needed |

Automated tests (beyond the migrated existing suites):
precedence ladder; in-tx create race (409); ETag
byte-source pin; If-Match hoist + byte-identical replay;
admin bypass; `[]` ACL; write-without-read attribute;
zero-readable projection (200 empty); clear-of-absent
no-op; duplicate / set∩clear 400; tombstone-PATCH 404;
create-at-tombstone 409; instance history projection +
DESC; legacy-snapshot reject (anchored predicate —
fresh snapshot with flow-record joins must PASS);
verb-gap 405 pins for the new family; facade dispatch
inversion regression (other families unchanged).

## Implementation phases

| Phase | Deliverable |
| --- | --- |
| **1a** | Dispatch inversion + rename + tier/snapshot gates + docs |
| **1b** | Attributes under types + ACL + rectified bodies |
| **1c** | Instances CRUD + history + If-Match machinery + tests |
| **1d** | Client adapters + minimal UI; seed types |
| **2** | WO coupling; placement UNIQUE; transition validation; SoT path |

## Micro-defaults (approved)

1. ETag = head pair response identity (strong; the
   stored `responses.etag` body-hash column is
   unrelated).
2. Instance DELETE supported with RESTRICT when WO
   placements exist (phase 2); phase 1 ships DELETE
   without placements. Unconditional (no If-Match);
   tombstone-wins.
3. Type lifecycle trio (parity with today's record
   states: active / archived / deleted) retained;
   the history route is definite, not conditional.
4. Phase-2 transition snapshots: yes for audit.

## Out of scope

- Same-wave nested migration of ideas/projects/flows.
- Same-wave If-Match migration for flows.
- Custom roles admin UI (and the token-alphabet
  widening it requires).
- Real-time ACL without token refresh.
- Multi-type-per-WO.
- Root-addressed tenant documents.
- Schema-level required flags (decision 14).
- `flows/:id/records` rename (accepted debt).

## Post-ship reminder

When phase 1 (and ideally phase 2) of this work is
complete, **remind the author** to schedule optimistic-
locking unification: migrate flows (and any other
If-Response-ID surfaces) to **If-Match / ETag** so the
platform has one concurrency dialect — and fold the
create-409 vs locked-412 "exists" divergence into the
same review.

## PR plan (sketch)

Detailed task breakdown belongs in the implementation
plan after this spec is accepted. High-level stack:

1. Spec + API-TREE/API.md doctrine notes (docs-only).
2. Nested route dispatch inversion + record-types
   family rename + snapshot retired-prefix gates.
3. Attributes under types + ACL + body rectification.
4. Instances + PATCH/ETag machinery + history + tests.
5. Adapters/UI/seed.
6. Phase 2 WO coupling (separate PR stack).

## References

- [2026-08-02-org-nested-record-types-design.md](2026-08-02-org-nested-record-types-design.md)
  — the superseded original (preserved unaltered)
- [API-TREE.md](../../../API-TREE.md) — target URI tree
- [API.md](../../../API.md) — route catalog, pair plane,
  locked-class four-outcome table (§5.4)
- [ARCHITECTURE.md](../../../ARCHITECTURE.md) — tenancy,
  facade, adapters
- [SCHEMA.md](../../../SCHEMA.md) — message plane
- Church of Code — Reliability, Security, Uniformity,
  Idempotency, validate at gates
