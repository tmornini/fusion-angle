# Org-Nested Record Types & Instances —
Implementation Plan (fable-5-synthesis)

> **For agentic workers:** REQUIRED SUB-SKILL:
> superpowers:subagent-driven-development. This plan EXECUTES via
> subagent-driven development — a fresh implementer subagent per
> task, a task review after each, one final whole-branch review.
> The § Execution protocol section below is binding; do not fall
> back to inline execution. Steps use checkbox (`- [ ]`) syntax
> for tracking.
>
> Per CLAUDE.md, every dispatched subagent prompt MUST begin with
> `Go to Medium Church!` and push down the voice rules (78-char
> lines, 4-space indent, house adapter/validator/commit patterns).
> Mandated commit trailer:
> `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
> plus the session's Claude-Session line when present.

**Spec:**
`docs/superpowers/specs/2026-08-05-org-nested-record-types-design.md`
(approved v2). This plan implements phases 1a–1d. Phase 2
(work-order coupling) is a separate future PR stack.

**Goal:** Ship org-nested `record-types`, `attributes`, and
first-class `instances` with one identity on wire and storage,
admin-only schema mutation, member instance I/O under
attribute-level ACL, and safe partial update via PATCH +
If-Match/ETag.

**Architecture:** New in-table routes under
`/organizations/:organization-id/record-types/...` dispatched
BEFORE the facade rewrite; the existing flat `records` /
`record-attributes` wire survives as a short alias window that
stores canonical NEW addresses, then retires. Instances are a
pair-plane document family with **full-state revisions**: the
wire PATCH is a delta (operation-plane, method PATCH, ignored
by document derive); each write ALSO appends a server-formed
revision pair (method PUT, body `{values: <merged full
state>}`, `follows` = verified head). GET is one head read —
storage is complete state (spec Stored-shape letter). PATCH is
a net-new verb; its concurrency dialect (If-Match / ETag =
head document-pair response id) is verb-keyed platform-wide;
instance PUT is a pattern-keyed `create-only` third posture.

**Tech Stack:** Vanilla TypeScript ES2024, zero runtime deps,
IndexedDB message plane (`requests`/`responses`), `node:test`
via `./test`, `./validate` as the gate.

**Plan agent:** fable-5-synthesis — fable-5 skeleton, seven-
plus repairs (R1–R10), nine grok grafts (G1–G9), governed by
the user's full-document storage directive.

**Lineage parents:**
- `docs/superpowers/plans/`
  `2026-08-05-org-nested-record-types-fable-5-synthesis.md`
  (skeleton)
- `docs/superpowers/plans/2026-08-05-org-nested-record-types-grok-4.5.md`
  (grafts G1–G9)

**Sibling note:** `…-grok-4.5-synthesis.md` exists; it kept the
revision-fold storage shape. This plan **overrides** that fold
with full-state revisions per the user's directive. It is NOT
an input to this synthesis.

---

## Parentage & adjudications

### Verdict table (substance)

- **Migration** — grok: hard cut, half-broken middle; fable:
  alias window, green commits → **fable alias**, deleted at
  T23.
- **Instance storage** — grok: unspecified (froze at genesis);
  fable: fold wire deltas at read → **full-state revisions**
  (user directive; restores spec letter).
- **Roles → handlers** — grok: absent; fable: trailing-arity
  widen → **fable**.
- **Value engine home** — grok: `shared/` (chasm law risk);
  fable: move into `api/` → **fable**.
- **Placeholder discipline** — grok: menus / comment tests;
  fable: executable steps → **fable**.
- **Task grain / SDD** — grok: mega-tasks; fable: 24 tasks +
  ledger → **fable**.
- **Structural extras** — grok: matrix, risks, Task 0, …;
  fable: missing → **grok grafts G1–G9**.

### Storage adjudication (governing decision)

**No reason better than storage efficiency exists for diffs.
Full-document revisions win — and they restore the spec's own
letter.** Spec Stored-shape: "storage is complete state; a GET
is one head read." Fable-5 Reconciliation 1 (fold-the-chain)
contradicted it. Every argument for the fold — wire-hash
replay, delta-only success bodies, UNIQUE `responses.follows`
backstop — is preserved by storing the wire message pair
verbatim ALONGSIDE a full-state revision pair; the delta is
never lost (the wire pair IS the delta). Full-state
additionally: kills the fold module and the
`derive-documents.ts` method-filter widening; localizes
corruption to one revision (Reliability); makes GET one head
read; and repairs a resurrect hole both parents share.

#### Mechanism (scout-verified)

- **PATCH appends TWO pairs in one tx** — the wire PATCH pair
  (verbatim `{set, clear}`, replay identity, If-Match hoisted)
  plus a server-formed revision pair (method PUT, body
  `{values: <merged full state>}`, `follows` = the
  If-Match-verified head pair id, response
  `{status: 200, body: {}}`). Precedent:
  `formDocumentPairFor` (`api/routes.ts:3055`) is exactly how
  composed ops form server-side document pairs today;
  `appendMessagePair` mints response `at` monotonically so
  append order controls the head.
- **Genesis stays ONE pair**: the wire PUT `{set}` pair IS
  revision 0. One total normalizer
  `revisionValuesOf(body) = body.values ?? body.set` at the
  derive seam — no second dialect leaks elsewhere.
- **PATCH wire pairs are operation-plane**: method PATCH is
  outside `DOCUMENT_METHODS` (PUT|DELETE), so document
  derivation ignores them BY DESIGN (same posture as POST op
  pairs; rationale at `api/derive-documents.ts:26-36`).
  **`derive-documents.ts` is NOT modified.**
- **Head/list/history** ride existing machinery: head =
  `documentHeadPairId` (`api/document-family.ts:272`); history
  = document-pair chain DESC, every entry
  `{at, etag, values}` with FULL state; tombstone = DELETE
  head.
- **ETag = head document pair's response identity** (spec
  literal). Replayed PATCH responses recover their original
  ETag with one indexed read:
  `responses.getAllWhere('follows', <parsed If-Match>)` —
  UNIQUE, total, no new columns.
- **Ghost-replay closed by construction**: server-formed
  pairs hash with `headerFields: []`; every wire message
  hashes WITH its hoisted Authorization header — no crafted
  wire body can collide with a synthetic pair's hash.
- **In-tx verify for all three write verbs** (R9): inside the
  append tx, re-read the address head; PUT: any prior
  response → 409; PATCH: head ≠ If-Match target → 412;
  DELETE: R4's tombstone-wins probe. Closes the
  DELETE-interleave resurrect hole (UNIQUE follows cannot
  catch a tombstone, which carries no `follows`) — latent in
  BOTH parents' fold designs. The UNIQUE index remains the
  serializable backstop (decision 15's letter).

### Repairs (R1–R10)

- **R1 (T1):** Probe uses mutable `routes` + push/splice per
  `tests/document-family.test.ts:245-286`; `route()` cited;
  drop the "if ROUTES is not exported" hedge.
- **R2 (T16–T19):** Every instance miss → `missedReadError`
  (foreign 403 / absent-or-tombstoned 404).
- **R3 (T10/T21):** `GETWithEtag` / `PUTWithEtag` /
  `PATCHWithEtag` siblings of `GETWithResponseId`; adapters
  return fresh etag; T22 create-then-edit consumes it. Verbs
  DELEGATE through shared await sites so the
  `simulateLatency` literal-count pin stays **4**.
- **R4 (T18):** DELETE appends tombstone for live AND
  already-tombstoned (tombstone-wins, ledger-complete);
  absent → `missedReadError`.
- **R5 (T14–T19):** Full-state revision storage (replaces
  fold). T14 thin derive (`revisionValuesOf`,
  `mergeInstanceValues`, head/list/revisions); no fold; no
  `derive-documents` widen; T17 forms revision via
  `formDocumentPairFor` with EXPLICIT `follows`.
- **R6 (T2/T15):** Policy: raw pathname, `:param`
  one-segment wildcards, post-inversion reachability
  (`api/request-auth.ts:148-156`,
  `api/authorization.ts:61-80`).
- **R7 (T12):** Move commit's only layer offense is the
  `RecordAttribute` type import; commit 2 restates as
  `AttributeSchemaRow`.
- **R8 (T15–T17):** ETag attach on replays — genesis from
  stored pair id; PATCH via `follows` lookup; pin "replay
  carries ORIGINAL etag even after later revisions".
- **R9 (T15/T17/T18):** In-tx verify for all three verbs +
  resurrect-hole test (tombstone interleaved between gate
  read and tx → never a revived head).
- **R10 (T15):** Instance pattern joins
  `PAIR_WIRED_ROUTE_PATTERNS` only — NOT
  `DOCUMENT_CLASS_ROUTE_PATTERNS` (lock-head read for
  supersedes/locked-echo is replaced by the bespoke
  instance gate).

### Grafts from grok-4.5 (G1–G9)

- **G1:** Task 0 — commit the plan document itself.
- **G2:** Spec-coverage matrix (spec section → task).
- **G3:** Risks table.
- **G4:** "Do not touch (this wave)" list.
- **G5:** Commandments/abominations lens tables in the
  covenant.
- **G6:** Numbered 7-item Phase-2 sketch.
- **G7:** Final-verification grep for leftover flat client
  paths.
- **G8:** Trailer
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  plus the Claude-Session line.
- **G9:** `''` in `set` → 400 (adjudication against silent
  coercion).

### Scout-verified facts (stand on these)

1. **Policy matching**: `isPermitted` on RAW pathname
   (`api/request-auth.ts:148-156`);
   `matchesOnSegmentBoundary` (`api/authorization.ts:61-80`)
   treats `:x` as one-segment wildcards. Post-inversion,
   nested pathnames reach the matcher.
2. **Deep ownership**: `missedReadError`
   (`api/derive-states.ts:418-432`) → `resolveGlobalOwner`
   parses org from `uri_prefix` with UNANCHORED
   `/^\/organizations\/([^/]+)\//` — depth-agnostic.
3. **`documentHeadPairId`** exists
   (`api/document-family.ts:272-283`). Full-state design
   needs NO `DOCUMENT_METHODS` widening — revision pairs are
   method PUT.
4. **`canonicalUriPrefix`** + `createdEntityUriId` alias plan
   holds; `HOISTED_HEADER_NAMES` participates in
   `message_hash`.
5. **Client facade**: verb fns return body only; sole header-
   out precedent is `GETWithResponseId`
   (`api/api.ts:1203-1217`); `getResponse` is the ONE GET
   await site so the latency pin stays 4
   (`api/api.ts:1160-1164`).
6. **`DOCUMENT_METHODS` = PUT|DELETE**
   (`api/derive-documents.ts:37-38`) — PATCH stays out by
   design under full-state.
7. **Probe seam**: `export const routes: Route[]`
   (`api/routes.ts:3111`); `route()` at `:794-807`;
   push/splice at `tests/document-family.test.ts:245-286`.
8. **`record-constraints.ts`**: type-only imports; move is
   feasible; `RecordAttribute` restated as
   `AttributeSchemaRow` in commit 2.
9. **`formDocumentPairFor`**: supports `chain: 'follows'` +
   explicit `follows` id (`api/routes.ts:3020-3035`) — the
   race-safe path for revision pairs (never re-read head
   after body is computed).

---

## Global Constraints

Copied from the spec / repo covenants — every task inherits these:

- Wire = storage: pair `uri_prefix` matches the nested path.
- Route params: `:organization-id`, `:record-type-id`,
  `:attribute-id`, `:instance-id` — never a shared `record-id`.
- Schema surfaces: member GET, admin PUT/DELETE/POST
  (decision 16). Instances: member tier at the path gate, then
  per-attribute ACL.
- No schema-level required flag anywhere (decision 14).
- ACL defaults on attribute create: `read_roles` and
  `write_roles` both `["member", "admin"]` from ONE named
  constant `DEFAULT_ATTRIBUTE_ACL_ROLES`; stamped into the
  stored body; `[]` legal (admins only); on REPLACE both keys
  REQUIRED (400 if absent). Admin bypass on read+write for the
  FENCED org only.
- ETag = head pair RESPONSE IDENTITY, strong, double-quoted on
  the wire. The stored `responses.etag` column (body sha256) is
  UNRELATED — pin the byte source in tests.
- PATCH: If-Match required (missing → 428, stale → 412,
  lost race at append → 412 via the UNIQUE `responses.follows`
  backstop). PATCH never creates or revives (404).
- PUT genesis: create-only; ANY prior head incl. tombstone →
  409; If-Match on PUT → 400; `clear` in a PUT body → 400;
  `set` required, `[]` legal. In-tx existence check.
- Statuses: success GET/PUT/PATCH 200 (201 has zero call sites
  platform-wide), DELETE 204, and the 12-step precedence ladder
  in the spec's HTTP status covenant — tests pin the order.
- Error bodies: house `{ "error": "<string>" }` only.
- Collections: id-lexicographic ascending, no pagination.
- Absolute pair counts UNCHANGED: 1494 seed / 12 bootstrap.
- Legacy prefixes rejected at BOTH snapshot gates with ANCHORED
  predicates `^/organizations/[^/]+/records/` and
  `^/organizations/[^/]+/record-attributes/` (the live
  `flows/:id/records` join family must keep passing).
- `flows/:id/records` does NOT rename (decision 9); flows keep
  If-Response-ID (decision 13 is post-ship).
- Repo voice: 78-char max lines, 4-space indent, snake_case
  storage / camelCase domain, validators at the gate,
  `hsl(var(--token))` CSS, one concern per ~50-char
  present-tense-imperative commit, never move+change in one
  commit, rebase never merge, commit before build.
- Commit trailer (G8):
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  plus the session Claude-Session line when present.
- Timestamps RFC-3339 zulu via `nowUtc()`.
- Instance storage: full-state revision pairs (R5); wire
  PATCH is operation-plane; GET is one head read.
- `''` in any `set` value → 400 (G9); absence is clear /
  omission only — never a sentinel empty string.

## Execution protocol — subagent-driven development (REQUIRED)

This plan executes via superpowers:subagent-driven-development: a
fresh implementer subagent per task, a task review (spec
compliance + code quality) after each, scoped fix rounds with a
five-round breaker, and one final whole-branch review. The
skill's templates (implementer-prompt, task-reviewer-prompt,
re-review-prompt, code-reviewer) govern every dispatch; this
section binds the repo-specific deltas and the model map. The
controller never implements or fixes code itself — it dispatches,
reviews reports, adjudicates, and keeps the ledger.

### Repo deltas (override the skill's defaults where they clash)

- **No worktrees — CLAUDE.md law.** Work in the main checkout on
  a feature branch (suggested: `record-types-nested`), finished
  by rebase + fast-forward onto master — linear history, never
  merge. The skill's git-ignored plan workspace
  (`.superpowers/sdd/<plan-basename>/` via
  `scripts/sdd-workspace`) is scratch bookkeeping, not a
  worktree — it is allowed and required.
- **Proselytize every dispatch.** EVERY subagent prompt —
  implementer, task reviewer, re-reviewer, final reviewer —
  begins with the literal phrase `Go to Medium Church!`, then
  pushes down: the voice rules (78-char lines, 4-space indent,
  no inline styles, ~50-char present-tense-imperative commits
  with the repo's Co-Authored-By trailer), the commandments the
  task touches, the abominations it risks (each task brief
  implies them — name them in the dispatch), and the codebase
  patterns to match (RequestContext-first adapters, SafeHtml
  presenters, snake_case storage / camelCase domain, HTTP-verb
  adapter naming, validators at the gate, no untyped `any`).
- **`./validate` is the commit gate.** Implementers run it
  before every commit and paste its tail into the report file.
  A failing validate is never committed; a task report claiming
  DONE without validate evidence is treated as NEEDS_CONTEXT.
- **Commit choreography is part of the spec.** One concern per
  commit; never move/rename and change content together. Tasks 4
  and 12 mandate explicit two-commit (move, then change)
  sequences — the reviewer checks the commit list against the
  brief, not just the diff.
- **Strict order, no parallelism.** Tasks run 1 → 24; each
  consumes interfaces the previous produced. Never dispatch two
  implementers concurrently.

### Ledger

Resolve the workspace with the skill's `scripts/sdd-workspace`
against this plan file; keep `progress.md` there with first line:

```text
# SDD ledger — plan: docs/superpowers/plans/
2026-08-05-org-nested-record-types-fable-5-synthesis.md
```

(one line in the actual file — wrapped here for width). Append
`Task <N>: complete (commits <base7>..<head7>, review clean)`,
fix-round, deferred-minor, parked, and BLOCKED lines exactly as
the skill prescribes. On resume after compaction: trust the
ledger and `git log` over memory; tasks with a complete line are
DONE — never re-dispatch them.

### Model map (specify a model explicitly on every dispatch)

Tiers: cheap = Haiku-class; standard = Sonnet-class; capable =
the strongest model available to the session (Opus-class or
above). Turn count beats token price — the floor for
prose-driven work is standard.

| Tasks | Implementer tier | Why |
| --- | --- | --- |
| 5, 6, 11, 18, 19 | cheap | near-complete code in the brief; 1–2 files |
| 1–3, 7, 9, 12–14, 16, 20–22, 24 | standard | multi-file |
| 4, 8, 10, 15, 17, 23 | capable | cutovers; concurrency |

Reviewers: standard by default; capable for the Task 4, 8, 10,
15, 17, 23 diffs (rename/re-home sweeps, the PATCH alphabet, the
If-Match ladder, the retirement). Scoped re-reviews of small fix
diffs: cheap-to-standard. Fix rounds 4–5: a fresh implementer at
least one tier above the one that got stuck. Final whole-branch
review: the most capable model available.

### The task loop (condensed — the skill text is operative)

1. **Dispatch.** Record BASE (`git rev-parse HEAD`). Extract the
   brief with `scripts/task-brief PLAN_FILE N`. The implementer
   dispatch contains: the Medium Church line + push-downs; one
   line on where the task sits in this plan; the brief path
   ("read this first — it is your requirements, exact values
   verbatim"); interfaces/decisions from earlier tasks the brief
   cannot know (pattern constants, module exports — the plan's
   Interfaces blocks are the source); the report-file path
   (`task-N-report.md` beside the brief). Never paste prior-task
   history; never make a subagent read this whole plan.
2. **Report.** DONE → review. DONE_WITH_CONCERNS → read concerns
   first; correctness/scope concerns are addressed before
   review. NEEDS_CONTEXT → supply and re-dispatch.
   BLOCKED → diagnose (context / model / task size / plan
   defect); a plan defect escalates to the human partner.
3. **Task review.** `scripts/review-package PLAN_FILE BASE HEAD`
   → dispatch the task reviewer with the brief, the report, the
   package path, and this plan's Global Constraints block copied
   verbatim as its attention lens. Both verdicts required (spec
   compliance AND task quality). "Cannot verify from diff" items
   are the controller's to resolve — a confirmed gap enters the
   fix loop.
4. **Fix loop.** Spec ❌ / Critical / Important findings loop:
   rounds 1–3 resume the same implementer with findings
   verbatim; rounds 4–5 dispatch fresh, one tier up, pointed at
   the report file. Every round ends with a scoped re-review of
   the fix diff (`review-package` over FIX_BASE..HEAD). Minor
   findings go to the ledger as deferred, never into the loop.
   A finding that collides with this plan's text goes to the
   human partner — the plan does not self-overrule. Breaker at
   round 5: adjudicate every open finding — park with a written
   ruling, or STOP and report BLOCKED if it is load-bearing
   (a later task builds on it).
5. **Complete.** Ledger line, todo complete, next task. Never
   advance past open unparked Critical/Important findings.


### Commandments this plan especially honors (G5)

- **I Reliability** — `./validate` every commit; honest
  status ladder; full-state localizes corruption.
- **II Security** — path never authorizes alone; ACL
  all-or-nothing 403; no head echo on write success.
- **III Uniformity** — nested wire = storage; house
  `{ error }`; one ETag dialect for instances.
- **IV Logic** — precedence ladder is ordered truth, not
  coincidence.
- **V Clarity** — name PUT genesis vs PATCH; never collapse
  into "create/update" mush.
- **VI Immutability** — append-only pairs; tombstone is
  absence, not a soft flag.
- **VII Idempotency** — byte-identical replay; DELETE
  tombstone-wins 204; PUT create-only 409.
- **VIII Simplicity** — no flat alias permanence; no fold
  module; no schema-level required.
- **IX Generality** — wait for three nested families before
  abstracting a factory.
- **X Atomicity** — two-pair PATCH tx; UNIQUE follows
  backstop; in-tx verify (R9).
- **XI–XII Efficiency / Performance** — measure later; no
  premature cache of instance heads.

### Abominations this plan refuses (G5)

- **CRUD** as vocabulary (speak HTTP)
- Premature "nested family factory" before three green families
- Shared mutable instance bags; global ACL state
- Null / sentinel values in instance storage (absent element only)
- Default ACL filled at **read** time (stamp at write)
- Internal defense re-checking validated ACL downstream
- Swallowed failures / greedy catch around multi-ops
- Test weakening when renames break pins
- Foreign path org authorizing without token fence
- Conflating `responses.etag` body-hash with wire ETag
- Fold-at-read storage when the user directed full-state
- Silent `''` → absent coercion (G9)
- Unbidden helpers / speculative utilities

### Final review and finish

After Task 24: `scripts/review-package PLAN_FILE MERGE_BASE HEAD`
(MERGE_BASE = `git merge-base master HEAD`), dispatch the final
whole-branch reviewer (most capable model,
requesting-code-review's code-reviewer template), pointed at the
ledger's deferred-minor and parked lines for merge triage. If it
returns findings: ONE fix dispatch with the complete list, one
scoped re-review, adjudicate residuals — no second fix wave.
When clean: delete this plan's workspace, then use
superpowers:finishing-a-development-branch (rebase +
fast-forward onto master; every landed commit builds, functions,
and passes `./validate`). Then say the Task 24 post-ship
reminder OUT LOUD in the completion report.

## Design reconciliations (locked here, cite this section)

These are the implementation-plan decisions the spec delegated,
resolved against scouted code and the user's storage directive:

1. **Full-state revisions, not fold-the-chain (R5).** The
   spec requires (a) byte-identical resend replays via the
   wire hash with If-Match hoisted, (b) write responses NEVER
   echo the merged head, (c) `follows` as the 412 backstop,
   (d) "storage is complete state; a GET is one head read."
   Shape: wire PUT `{set}` is revision 0 (one pair); wire
   PATCH `{set, clear}` is an operation-plane pair (method
   PATCH, ignored by `DOCUMENT_METHODS`); a server-formed
   revision pair (method PUT, body
   `{values: <merged full state>}`, explicit `follows` =
   verified head, response `{status: 200, body: {}}`) is
   appended in the SAME tx. History entries carry full
   state. Cleared attributes are ABSENT elements. The fold
   module and any `derive-documents.ts` filter widening are
   **gone**.
2. **Value-validation engine location: `api/`.** Move
   `web-app/app/record-constraints.ts` → `api/record-constraints.ts`
   (zero runtime imports, already Node-clean; its type imports
   come from `api/types.ts`, so `shared/` placement would force
   relocating `AttributeType`/`Constraint` out of the schema of
   record). `web-app` importing `api/` is the allowed direction
   (adapters already do). Server type/constraint checks are
   net-new and live beside it.
3. **Rename mechanism: wire→storage alias in
   `canonicalUriPrefix`.** Seed, flat handlers, and the gate all
   derive addresses through `canonicalUriPrefix` /
   `createdEntityUriId` / the family registry — a single alias
   `records → record-types` re-points every reader and writer
   at once. The alias is the spec's "wire-only rewrite storing
   canonical NEW addresses" and is DELETED at flat retirement.
4. **Concurrency keying.** `ConcurrencyClass` widens with
   `'create-only'`; the instance detail pattern is keyed in a
   new pattern-keyed set (`CREATE_ONLY_PUT_ROUTE_PATTERNS`).
   The If-Match dialect rides the VERB: any pair-wired PATCH
   gets the 404/428/412/follows ladder — one covenant, no
   per-pattern PATCH registry.
5. **Roles reach handlers by arity widening.** `GetHandler`
   gains a 5th `roles` param; `PutHandler`/`DeleteHandler`
   gain trailing `organization, roles`; the new `PatchHandler`
   has them from birth. TS accepts shorter-arity assignments,
   so ZERO existing handlers change.
6. **Ownership fencing for nested writes.** `record-types/:id`
   keeps a `WRITE_AUTHORIZERS` entry (foreign type id must 403,
   never genesis in the caller's namespace). Attributes and
   instances (deep sub-families) are EXEMPT per the spec: the
   path-org fence + parent-existence 404 subsume the probe. The
   flat alias window keeps the existing flat authorizers.
7. **Snapshot gate error class.** `parseAndValidateSnapshot`
   throws bare `Error` today, which surfaces as HTTP 500. The
   new retired-prefix leg throws `ValidationError` so the wire
   answer is the spec's honest 400.
8. **Error-vocabulary tables.** Nested surfaces speak
   `record_types` / `record_attributes` / `record_instances`
   in 403/404 bodies. The flat window keeps today's `records`
   voice until it retires (two surfaces, two voices, one
   commit-stack apart — named and accepted).
9. **Value TYPE conformance (net-new, beside constraints; G9):**
   `text` any non-empty string; `number` → `Number(value)` finite;
   `date` → `/^\d{4}-\d{2}-\d{2}$/` (ISO date, lexicographic
   compare matches the range comparators); `select`/`radio` →
   value ∈ `options`; `checkbox` → `'true' | 'false'`.
   Values are non-empty strings; absence is expressed by
   `clear`/omission, never `''` (empty string in `set` → 400).
10. **Honest miss voice (R2).** Every instance miss surface —
    GET detail, GET history, PATCH gate head-miss, DELETE
    absent — answers through `missedReadError` (foreign 403 /
    absent-or-tombstoned 404). No bare-404 arms.
11. **Client ETag plumbing (R3).** Facade verbs that must
    surface ETag return `{body, etag}` via
    `GETWithEtag` / `PUTWithEtag` / `PATCHWithEtag` siblings
    of `GETWithResponseId`. They DELEGATE through the shared
    await sites so the `simulateLatency` literal-count pin
    stays 4. Write adapters return the fresh etag; UI
    create-then-edit consumes it.
12. **In-tx verify (R9).** All three instance write verbs
    re-check address head inside the append transaction.
    Closes the DELETE-interleave resurrect hole UNIQUE
    follows cannot catch.

## File map (create / modify hotspots)

Create:
- `api/derive-record-types.ts` (rename of `api/derive-records.ts`)
- `api/derive-record-instances.ts` — full-state head/list/revisions + merge
  (R5)
- `api/attribute-acl.ts` — read/write evaluation + projection
- `api/record-constraints.ts` (moved from `web-app/app/`)
- `api/record-type-refs.ts` — type DELETE RESTRICT predicate
- `web-app/app/adapters/record-instances.ts`
- `tests/api-record-types-*.test.ts`, `tests/api-instances-*.test.ts`
  (+ suites named per task)

Modify (load-bearing):
- `api/api.ts` — dispatch inversion; org-match fence; PATCH
  switch arm; create-only + If-Match gate arms; ETag attach
  (incl. replay paths R8); client `PATCH` + `*WithEtag` (R3)
- `api/routes.ts` — `Route.patch`, handler types, nested route
  registrations, `WRITE_RESPONSE_SPECS`; revision pair via
  `formDocumentPairFor` (R5)
- `api/family-registry.ts` — rename, alias map, pattern
  constants, `'create-only'`
- `api/message-pair.ts` — alias in `canonicalUriPrefix` /
  `createdEntityUriId`; instance pattern on
  `PAIR_WIRED_ROUTE_PATTERNS` only (R10); `HOISTED_HEADER_NAMES`
- `api/authorization.ts` — nested member rows; root PATCH row
- `api/write-authorizer.ts` — PATCH method; nested type entry
- `api/http-errors.ts` — `HTTP_PRECONDITION_REQUIRED = 428`
- `api/validators.ts` — attribute ACL keys; nested attribute
  body; instance bodies
- `api/snapshot-validator.ts` + `web-app/app/adapters/snapshots.ts`
  — retired-prefix legs
- `api/mock-data/seed-message-pairs.ts` — attribute re-home
  invocations
- `web-app/app/adapters/{records,record-attributes,record-transitions}.ts`
  + `shared.ts` (`ctx.PATCH` / `*WithEtag`) + call sites in
  `web-app/records/*`, `web-app/flows/detail.ts`,
  `web-app/workbox/detail.ts`
- Docs: `API.md`, `API-TREE.md`, `ARCHITECTURE.md`, `SCHEMA.md`,
  `CLAUDE.md`, `TEST-PLAN.md`

**Do not modify (this wave):** `api/derive-documents.ts`
(`DOCUMENT_METHODS` stays PUT|DELETE — R5).

### Do not touch (this wave) (G4)

- `flows/:id/records` route, policy, derive module names
  (decision 9)
- Flow designer If-Response-ID dialect (decision 13 is
  post-ship only)
- Ideas / projects / work-orders nested wire migration
- Custom roles / token alphabet widening
- Phase 2 work-order SoT coupling
- Full product instance UI beyond Task 22's minimal surface

---

### Task 0: Commit this plan (G1)

**Files:**
- Create:
  `docs/superpowers/plans/`
  `2026-08-05-org-nested-record-types-fable-5-synthesis.md`

- [ ] **Step 1: Commit ONLY this plan file** (parents, the
      grok synthesis, and the modified spec stay the user's
      uncommitted work — do not stage them):

```bash
git add docs/superpowers/plans/\
  2026-08-05-org-nested-record-types-fable-5-synthesis.md
git commit -m "$(cat <<'EOF'
Add synthesized org-nested record-types plan

Co-Authored-By: Claude Fable 5 \
  <noreply@anthropic.com>
EOF
)"
```

---

### Task 1: Invert dispatch — in-table routes before the facade

The facade branch (`api/api.ts:275-278`) currently swallows every
`/organizations/:org/...` path (length ≥ 3) before `matchRoute`
(`:306`). Nested in-table routes must win when a pattern exists;
everything else must keep facade behavior byte-identically.

**Files:**
- Modify: `api/api.ts:271-309`
- Test: `tests/api-dispatch-inversion.test.ts` (create)

**Interfaces:**
- Consumes: `matchRoute(routeTable, pathSegments)`
  (`api/routes.ts:5144`), `facadeRequest` (`api/api.ts:128`).
- Produces: dispatch order — in-table match first; facade only
  when `match === null`. Later tasks register real nested
  routes against this order.

- [ ] **Step 1: Write the failing test**

Use the synthetic-registration idiom from
`tests/document-family.test.ts:245-286` (push a probe into
the live mutable `routes` export, splice it out in `finally`).
The helper is `route()` at `api/routes.ts:794-807`. The
export is `export const routes: Route[]`
(`api/routes.ts:3111`) — **lowercase `routes`**, not
`ROUTES` (R1).

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { handleRequest } from '../api/api.ts';
import { routes, route } from '../api/routes.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

const BASE = 'http://localhost';

function req(
    method: string, path: string, token?: string,
): Request {
    return new Request(`${BASE}${path}`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...(token !== undefined
                ? { 'Authorization': 'Bearer ' + token }
                : {}),
        },
    });
}

test('an in-table organizations route wins over the facade',
    async () => {
        const probe = route(
            'organizations/:organization-id/dispatch-probe',
            { get: async () => ({ probed: true }) },
        );
        routes.push(probe);
        try {
            const db = memoryDbAdapter();
            await seedAdminSchema(db);
            const token = await organizationToken();
            const res = await handleRequest(db, req(
                'GET', '/organizations/1/dispatch-probe',
                token,
            ));
            assert.equal(res.status, 200);
            assert.deepEqual(
                await res.json(), { probed: true },
            );
        } finally {
            const i = routes.indexOf(probe);
            if (i >= 0) routes.splice(i, 1);
        }
    });

test('unmatched organizations paths still take the facade',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const res = await handleRequest(db, req(
            'GET', '/organizations/1/ideas', token,
        ));
        assert.equal(res.status, 200);
    });

test('unauthenticated in-table nested path answers the '
    + 'gate 401, not the facade 401', async () => {
    const probe = route(
        'organizations/:organization-id/dispatch-probe',
        { get: async () => ({ probed: true }) },
    );
    routes.push(probe);
    try {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const res = await handleRequest(db, req(
            'GET', '/organizations/1/dispatch-probe',
        ));
        assert.equal(res.status, 401);
        const body = await res.json();
        assert.match(body.error, /missing bearer token/);
    } finally {
        const i = routes.indexOf(probe);
        if (i >= 0) routes.splice(i, 1);
    }
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `TZ=UTC node --test --strip-types \
tests/api-dispatch-inversion.test.ts`
Expected: probe test FAILS (facade exchanges against org `1`
then re-enters on flat `/dispatch-probe`, which 404s).

- [ ] **Step 3: Implement the inversion**

In `handleRequest`, hoist the `matchRoute` call above the facade
branch and gate the facade on a null match:

```ts
const match = matchRoute(routeTable, pathSegments);

if (
    match === null
    && pathSegments[0] === 'organizations'
    && pathSegments.length >= 3
) {
    return facadeRequest(ctx, request, pathSegments);
}
```

Delete the later duplicate `matchRoute` call at `api/api.ts:306`
(keep the surrounding `matchedRoutePattern` derivation). The
side channels between the old positions
(`identities/:id/default-org`, `/invitations`, bare
`GET /organizations`) must stay ABOVE the facade branch exactly
as they are today — only the facade test moves down.

- [ ] **Step 4: Run the new suite, the facade suites, and the
      isolation suite**

Run: `TZ=UTC node --test --strip-types \
tests/api-dispatch-inversion.test.ts \
tests/api-facade-records-write.test.ts \
tests/api-facade-write-preconditions.test.ts \
tests/api-organization-isolation.test.ts \
tests/api-unauthenticated-route-ordering.test.ts`
Expected: PASS — facade behavior for every existing family is
byte-identical (no in-table `organizations/...` patterns exist
yet outside the synthetic probe).

- [ ] **Step 5: `./validate`, then commit**

```bash
git add api/api.ts api/routes.ts \
    tests/api-dispatch-inversion.test.ts
git commit -m "Dispatch in-table routes before the facade"
```

---

### Task 2: record-types nested READ surface

Member-tier GETs: collection, detail, lifecycle history — plus
the org-match fence arm every nested route shares.

**Files:**
- Create: `api/derive-record-types.ts` — NOTE: created fresh
  here; Task 4 separately renames `api/derive-records.ts` and
  folds it in (never move+change in one commit).
- Modify: `api/api.ts` (org-match arm), `api/routes.ts`
  (registrations), `api/authorization.ts` (member row),
  `api/family-registry.ts` (pattern constants)
- Test: `tests/api-record-types-read.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 3, 7, 14–19):

```ts
// api/family-registry.ts
export const RECORD_TYPES_COLLECTION_PATTERN =
    'organizations/:organization-id/record-types';
export const RECORD_TYPE_DETAIL_PATTERN =
    RECORD_TYPES_COLLECTION_PATTERN + '/:record-type-id';
export const RECORD_TYPE_HISTORY_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/history';

// api/derive-record-types.ts
export function recordTypesUriPrefix(
    organization: Id,
): string; // '/organizations/' + organization
           //     + '/record-types/'
export function deriveRecordTypeEntity(
    db: DbAdapter, organization: Id, id: Id,
): Promise<RecordTypeWireRow>;   // trio embedded
export function deriveRecordTypeCollection(
    db: DbAdapter, organization: Id,
): Promise<RecordTypeWireRow[]>; // id-lex ASC
export function deriveRecordTypeStateHistory(
    db: DbAdapter, organization: Id, id: Id,
): Promise<StateEntity[]>;       // ASC; handler reverses
export function requireRecordTypeExists(
    db: DbAdapter, organization: Id, id: Id,
): Promise<void>;                // absent → 404
                                 // ('record_types')
```

- Produces (gate): the org-match fence — after `fenceRequest`
  succeeds and BEFORE `authorizeRequest`, for any matched route
  whose pattern starts `organizations/:organization-id`:

```ts
if (
    match !== null
    && match.route.segments[0] === 'organizations'
    && matchedRoutePattern !== 'organizations/:id'
    && params[0] !== fenced.ctx.organization
) {
    return Response.json(
        {
            error: 'forbidden: path organization does '
                + 'not match the token organization',
        },
        { status: HTTP_FORBIDDEN },
    );
}
```

A nonexistent path org takes the same arm (mismatch), so no
route-topology oracle. There is NO auto-exchange.

- [ ] **Step 1: Write the failing tests**

`tests/api-record-types-read.test.ts` — seed types via the
below-gate pair idiom (`formWritePair` +
`postRecordDocumentOp`-equivalent at the NESTED address; copy
the `seedMembershipPair` shape from
`tests/api-history-ownership-fence.test.ts:43-75`, substituting
`routePattern: RECORD_TYPE_DETAIL_PATTERN`, path
`/organizations/1/record-types/rt-1`, and a trio document body
`{name, description, position, state, state_at,
state_event_id}`). Cases:

```text
GET  .../record-types            → 200 [] on empty org
GET  .../record-types            → 200 rows id-lex ASC,
                                   trio embedded, member token
GET  .../record-types/:id        → 200, no attribute embed
GET  .../record-types/:id        → 404 absent
                                   ('record_types/rt-x')
GET  .../record-types/:id/history→ 200 DESC, index 0 current
GET  path org ≠ token org        → 403 (member of A probing
                                   /organizations/B/...)
GET  nonexistent path org        → 403 (same arm, same body)
GET  member token                → 200 (member READ tier)
```

- [ ] **Step 2: Run to verify failure**

Run: `TZ=UTC node --test --strip-types \
tests/api-record-types-read.test.ts`
Expected: FAIL — 404s from unmatched routes.

- [ ] **Step 3: Implement**

`api/derive-record-types.ts`: build on the pair-plane
primitives exactly as `api/derive-records.ts` and
`api/document-family.ts:206-245` do today — `Promise.all` of
`requests`/`responses` `getAllWhere('uri_prefix', prefix)`,
`deriveDocumentsAt` for heads, `documentPairsAt` +
`documentLifecycleEvents` + `stateHistoryFrom` for the trio;
absent/deleted → `missedReadError(db, id, organization,
'record_types')`. Wire row:

```ts
{
    id, organization_id,
    name, description, position,
    state, state_at, state_event_id,
}
```

Register the three routes in `api/routes.ts` (inline handlers
calling the derive fns; history handler mirrors
`documentStateHistoryHandler` semantics with the nested derive:
empty → `missedReadError`, else `.toReversed()`).

`api/authorization.ts` `MEMBER_VERBS` gains:

```ts
'/organizations/:id/record-types': ['GET'],
```

**Policy mechanism is definitive (R6):** `isPermitted` runs on
the RAW pathname (`api/request-auth.ts:148-156`);
`matchesOnSegmentBoundary` (`api/authorization.ts:61-80`)
treats `:id` (and every `:param`) as a one-segment wildcard.
Post-inversion, nested pathnames reach the matcher — this
one MEMBER_VERBS row covers the whole subtree's GETs
(detail, history, later attributes/instances reads). Mutation
stays admin via the root `'/'` rows (house style: admin-only =
absence from `MEMBER_VERBS`). No options, no hedges.

Add the org-match arm in `api/api.ts` per the Interfaces block.

- [ ] **Step 4: Run tests**

Run: `TZ=UTC node --test --strip-types \
tests/api-record-types-read.test.ts`
Expected: PASS.

- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add nested record-types read surface"
```

(Two commits if you prefer: fence arm first, reads second.)

---

### Task 3: record-types nested WRITE surface

Admin PUT (trio document, simple class), admin DELETE with the
NET-NEW type RESTRICT, pair wiring, verb-gap pins. The composed
POST arrives in Task 9 (it must write re-homed attribute pairs).

**Files:**
- Create: `api/record-type-refs.ts`
- Modify: `api/routes.ts`, `api/message-pair.ts`
  (`PAIR_WIRED_ROUTE_PATTERNS`, `DOCUMENT_CLASS_ROUTE_PATTERNS`
  gain `RECORD_TYPE_DETAIL_PATTERN`), `api/write-authorizer.ts`,
  `api/routes.ts` `WRITE_RESPONSE_SPECS`
- Test: `tests/api-record-types-write.test.ts`,
  `tests/api-record-types-verb-gaps.test.ts`

**Interfaces:**
- Consumes: Task 2 patterns + derives.
- Produces:

```ts
// api/record-type-refs.ts
export interface RecordTypeReferrers {
    readonly instanceIds: readonly string[];
    readonly flowIds: readonly string[];
}
export function collectRecordTypeReferrers(
    view: DbAdapter, organization: string,
    recordTypeId: string,
): Promise<RecordTypeReferrers>;
export function hasTypeReferrers(
    refs: RecordTypeReferrers,
): boolean;
export function describeTypeReferrers(
    recordTypeId: string, refs: RecordTypeReferrers,
): string;
// 'record type <id> is referenced by N instance(s);
//  flow(s) f1, f2' — parts joined '; ', matching
// describeReferrers voice (record-attribute-refs.ts:211-232)
```

- [ ] **Step 1: Write the failing tests**

`api-record-types-write.test.ts`:

```text
PUT  .../record-types/:id admin           → 200, body echoes
     {id, organization_id, name, description, position} +
     validated via the trio document validator; GET sees it
PUT  member token                         → 403
PUT  foreign type id under own org path   → 403 (authorizer;
     body 'forbidden: record_types/<id> belongs to a
     different organization')
DELETE unreferenced type, admin           → 204; detail 404;
     omitted from collection
DELETE member                             → 403
DELETE type with a live flow join         → 409, body names
     'flow(s) <flowId>' (seed a flows/:id/records join first)
DELETE replay (byte-identical)            → 204
PUT over an existing head with NO precondition header
     → 200 supersedes (simple class — the spec's
     "no If-Match required on types" pin; last-writer-wins
     is accepted for admin-only mutation volume)
```

`api-record-types-verb-gaps.test.ts` (admin token; mirror
`tests/api-records-verb-gaps.test.ts` phrasing):

```text
PUT    .../record-types        → 405   (collection)
DELETE .../record-types        → 405
POST   .../record-types/:id    → 405
PUT    .../record-types/:id/history  → 405
POST   .../record-types/:id/history  → 405
DELETE .../record-types/:id/history  → 405
```

- [ ] **Step 2: Run to verify failure** (both files)

- [ ] **Step 3: Implement**

- PUT handler: reuse `validateRecordDocumentBody` (same trio
  body — `name`, `description`, `position`, `state`,
  `state_at`, `state_event_id`), then the family document-op
  posture of `postRecordDocumentOp` (form nothing itself — the
  gate formed the pair; append inside one tx). Simple class:
  gate already stamps `supersedes` for non-locked PUTs.
- DELETE handler (inline, mirroring `records/:id` DELETE at
  `api/routes.ts:4587-4596`, plus RESTRICT):

```ts
delete: async (db, params, _actor, pair) => {
    const organization = requireOrganization(
        param(params, 0),
    );
    const id = param(params, 1);
    await db.transaction(
        ['requests', 'responses'],
        async (view) => {
            const refs =
                await collectRecordTypeReferrers(
                    view, organization, id,
                );
            if (hasTypeReferrers(refs)) {
                throw new ApiError(
                    describeTypeReferrers(id, refs),
                    HTTP_CONFLICT,
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
},
```

  CAUTION (auto-commit discipline): `collectRecordTypeReferrers`
  awaits only row ops on `view` — implement it with
  `getAllWhere` reads exactly as `collectAttributeReferrers`
  does inside the same-shaped tx today.
- `collectRecordTypeReferrers` legs: (a) live instances —
  derive heads at
  `/organizations/<org>/record-types/<id>/instances/` (empty
  until Task 15; the predicate is real from birth); (b) live
  `flows/:id/records` joins naming the type — enumerate flow
  ids from the org's flows prefix, then per-flow
  `deriveFlowRecords`-equivalent reads filtered on
  `record_id === recordTypeId`.
- `WRITE_AUTHORIZERS` gains
  `RECORD_TYPE_DETAIL_PATTERN → { table: 'record_types',
  idParamIndex: 1 }`.
- `WRITE_RESPONSE_SPECS[RECORD_TYPE_DETAIL_PATTERN]`: put-only
  per-verb entry echoing the house document spec shape (id from
  `param(params, 1)`, `organization_id` from `param(params, 0)`,
  entity from the validated body, trio discarded).
- Add `RECORD_TYPE_DETAIL_PATTERN` to
  `PAIR_WIRED_ROUTE_PATTERNS` and
  `DOCUMENT_CLASS_ROUTE_PATTERNS` (both lists, together —
  message-pair.ts keeps them side by side).

- [ ] **Step 4: Run tests** (both files) — PASS.

- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add nested record-types write surface"
```

---

### Task 4: Rename storage — records → record-types

One mechanism: the wire→storage alias + registry rename. Every
flat surface and the seed flip addresses at once; counts stay
1494/12; prefix-pinned tests move.

**Files:**
- Modify: `api/family-registry.ts`, `api/message-pair.ts`
  (`canonicalUriPrefix`, `createdEntityUriId`), `api/routes.ts`
  (`RECORDS_WIRING.family`), `api/derive-states.ts`
  (`ORGANIZATION_NESTED_ENTITY_FAMILIES`)
- Rename (separate commit, no content change):
  `api/derive-records.ts` → `api/derive-record-types.ts` — fold
  its exports (`deriveRecordStateHistory`, `recordsUriPrefix`)
  into Task 2's module; re-point importers
  (`api/routes.ts`, `tests/drift-states.test.ts:36`).
- Tests to update (exact sites from the scout sweep):
  `tests/mock-data-pairs.test.ts:441, 459, 494-497`
  (prefix literals → `/organizations/1/record-types/`),
  `tests/message-pair.test.ts:63-66`,
  `tests/api-organization-isolation.test.ts:368-378`,
  `tests/family-registry.test.ts:47-68` (registration object:
  `family: 'record-types'`),
  `tests/drift-records.test.ts`, `tests/drift-states.test.ts`,
  `tests/api-entity-history-routes.test.ts` (flat history route
  bodies unchanged — verify, don't edit blindly).

**Interfaces:**
- Produces (consumed by Task 8, deleted in Task 23):

```ts
// api/family-registry.ts
const WIRE_FAMILY_STORAGE_ALIASES:
    Readonly<Record<string, string>> = {
    'records': 'record-types',
};
export function wireFamilyStorageName(
    family: string,
): string {
    return WIRE_FAMILY_STORAGE_ALIASES[family] ?? family;
}
```

- [ ] **Step 1: Pure-rename commit**

```bash
git mv api/derive-records.ts api/derive-record-types.ts
# re-point the two importers, change nothing else
git commit -m "Rename derive-records to derive-record-types"
```

(If Task 2 already created `api/derive-record-types.ts`, do the
inverse: merge the old module's two exports into it in this
commit and delete `derive-records.ts` — content-only, no other
edits.)

- [ ] **Step 2: Write the failing pin**

Add to `tests/mock-data-pairs.test.ts` (temporarily alongside
the old literals): the seeded Customer Profile document pair's
`uri_prefix` equals `'/organizations/1/record-types/'`. Run the
file; it FAILS (still `/records/`).

- [ ] **Step 3: Implement the alias + rename**

`api/family-registry.ts`: registration key `'records'` →
`'record-types'` (same `organizationNested: true`,
`concurrency: 'simple'`, `createBodyIdField: 'id'`). Add the
alias map + `wireFamilyStorageName` above.

`api/message-pair.ts` — `canonicalUriPrefix` rewrites the flat
first segment to its storage name:

```ts
export function canonicalUriPrefix(
    organization: Id | undefined,
    flatPrefix: string,
): string {
    const first = flatPrefix.split('/')[1] ?? '';
    const canonical = wireFamilyStorageName(first);
    const rewritten = canonical === first
        ? flatPrefix
        : '/' + canonical
            + flatPrefix.slice(first.length + 1);
    const registered = familyRegistration(canonical);
    const nested = registered !== undefined
        ? registered.organizationNested
        : ORGANIZATION_NESTED_FIRST_SEGMENTS
            .has(canonical);
    if (organization !== undefined && nested) {
        return '/organizations/' + organization
            + rewritten;
    }
    return rewritten;
}
```

`createdEntityUriId`: resolve the registration through the
alias too:

```ts
const registered = familyRegistration(
    wireFamilyStorageName(routePattern),
);
```

`api/routes.ts`: `RECORDS_WIRING.family` → `'record-types'`
(keep `notFoundTable: 'records'` — the flat window keeps its
voice; reconciliation 8). `api/derive-states.ts:79-83`:
`'records'` → `'record-types'` in
`ORGANIZATION_NESTED_ENTITY_FAMILIES`.

- [ ] **Step 4: Sweep the pinned tests**

Update the literal sites listed under Files. Absolute counts
(1494 / 12) are asserted UNCHANGED — if they move, stop: the
rename leaked an invocation.

- [ ] **Step 5: Run the whole suite**

Run: `./test`
Expected: PASS, including `tests/drift-records.test.ts` parity
(flat wire GETs now derive from record-types addresses through
the renamed wiring) and Task 2/3's nested tests now reading the
SEEDED types (nested reads and flat reads see one storage).

This commit IS the spec's migration step 8: the seeded
Customer Profile and Project Brief records become the seeded
record-types — no new seed entries, and ZERO instances are
seeded anywhere in phase 1.

- [ ] **Step 6: `./validate`, then commit**

```bash
git commit -m "Store records family at record-types addresses"
```

---

### Task 5: Snapshot retired-prefix gate — records

**Files:**
- Modify: `api/snapshot-validator.ts`,
  `web-app/app/adapters/snapshots.ts`
- Test: `tests/snapshot-retired-prefixes.test.ts` (create);
  extend `tests/snapshot-mock-data-round-trip.test.ts` run

**Interfaces:**
- Produces (Task 8 adds the second predicate):

```ts
// api/snapshot-validator.ts
const RETIRED_URI_PREFIX_PATTERNS:
    readonly RegExp[] = [
    /^\/organizations\/[^/]+\/records\//,
];
```

- [ ] **Step 1: Failing tests**

```text
parseAndValidateSnapshot: a snapshot whose requests row has
  uri_prefix '/organizations/1/records/'      → throws
  ValidationError naming the retired prefix
same for a responses row                       → throws
a row with '/organizations/1/flows/f1/records/'→ ACCEPTED
  (anchored predicate; the live join family)
current mock seed export round-trips           → ACCEPTED
wire: PUT snapshots/import with a legacy row   → 400 (house
  body), not 500
client: putSnapshot with a legacy row → SnapshotIncompatibleError
  listing 'requests[].uri_prefix=/organizations/…/records/'
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

Server — in `parseAndValidateSnapshot`'s per-row loop, after
`validateSnapshotRow`:

```ts
const prefix = r['uri_prefix'];
if (typeof prefix === 'string') {
    for (const p of RETIRED_URI_PREFIX_PATTERNS) {
        if (p.test(prefix)) {
            throw new ValidationError(
                'Invalid snapshot: row ' + i
                    + ' in table "' + table
                    + '" carries retired uri_prefix '
                    + prefix
                    + '. Re-snapshot from current '
                    + 'state.',
            );
        }
    }
}
```

(`ValidationError` maps to 400 at `api/api.ts:1085-1092` —
reconciliation 7.)

Client — fourth leg in `scanForRetiredKeys`: scan
`requests`/`responses` arrays' `uri_prefix` values against the
same anchored patterns (duplicate the two regexes locally with a
comment naming the server list as the gate of record — the
client scan is a pre-flight convenience, per the module's own
header). Export `scanForRetiredKeys` for the test, matching how
the existing snapshot suites exercise it.

- [ ] **Step 4: Run tests + round-trip suite** — PASS.

- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Reject retired records prefixes at snapshot gates"
```

---

### Task 6: Attribute ACL fields + defaults validator

**Files:**
- Modify: `api/validators.ts`, `api/types.ts`
- Test: `tests/validators-attribute-acl.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 7, 8, 9, 13):

```ts
// api/types.ts
export const DEFAULT_ATTRIBUTE_ACL_ROLES =
    ['member', 'admin'] as const;

// api/validators.ts
export const NESTED_ATTRIBUTE_DOCUMENT_BODY_KEYS = [
    'name', 'attribute_type', 'sort_order',
    'options', 'constraints',
    'read_roles', 'write_roles',
] as const;      // NOTE: no record_id — address parentage
export function validateAttributeDocumentCreate(
    body: Record<string, unknown>,
): AttributeDocument;   // ACL keys optional → stamped
                        // from DEFAULT_ATTRIBUTE_ACL_ROLES
export function validateAttributeDocumentReplace(
    body: Record<string, unknown>,
): AttributeDocument;   // ACL keys REQUIRED → 400 if absent
```

Role arrays: `asArray` of non-empty strings (free strings,
forward-compatible; unknown names match nothing until the token
alphabet widens). `[]` legal. Error voice matches
`assertOnlyKeys` (`'missing required key "read_roles" for
AttributeDocumentBody'`).

- [ ] **Step 1: Failing tests**

```text
create: omits both ACL keys → returned entity carries both
    arrays === DEFAULT_ATTRIBUTE_ACL_ROLES values
create: read_roles: []       → accepted, []
create: read_roles: ['']     → 400 non-empty-string message
create: write_roles without read_roles → accepted (submit-only)
create: unknown key 'record_id' → 400 'unexpected key
    "record_id" for AttributeDocumentBody'
replace: missing write_roles → 400 'missing required key …'
replace: both present        → accepted verbatim
select with zero options     → 400 (existing rule holds)
constraint applicability     → 400 (existing rule holds)
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** (both validators share one core;
      the mode differs only in ACL-key requiredness/stamping)
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add attribute ACL fields with stamped defaults"
```

---

### Task 7: Nested attributes surface

Member GETs (ACL arrays visible), admin PUT (create/replace
modes), admin DELETE with the four-leg RESTRICT.

**Files:**
- Modify: `api/routes.ts`, `api/record-attribute-refs.ts`,
  `api/message-pair.ts` (pattern sets), `api/family-registry.ts`
  (pattern constants below)
- Test: `tests/api-nested-attributes.test.ts`,
  extend `tests/api-record-types-verb-gaps.test.ts`

**Interfaces:**

```ts
// api/family-registry.ts
export const ATTRIBUTES_COLLECTION_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/attributes';
export const ATTRIBUTE_DETAIL_PATTERN =
    ATTRIBUTES_COLLECTION_PATTERN + '/:attribute-id';

// api/record-attribute-refs.ts — widened
export interface AttributeReferrers {
    readonly valueCount: number;
    readonly flowIds: readonly string[];
    readonly workOrderIds: readonly string[];
    readonly instanceIds: readonly string[];  // NET-NEW leg
}
// describeReferrers order: values; flows; work orders;
// instance(s) — appended last, same '; ' join
```

Wire attribute row:
`{id, organization_id, record_type_id, name, attribute_type,
sort_order, options, constraints, read_roles, write_roles}` —
`organization_id`/`record_type_id` are address-derived echoes.

- [ ] **Step 1: Failing tests**

```text
GET  .../attributes           → 200 [] under a live type;
                                404 under an absent type
                                ('record_types/…' — parent
                                probe, deriveFlowRecord
                                posture)
PUT  .../attributes/:aid admin, no ACL keys → 200; GET shows
     stamped default arrays  (CREATE mode — no prior head)
PUT  same address again without ACL keys    → 400 (REPLACE
     mode requires both)
PUT  same address with both ACL keys, no precondition header
     → 200 (simple class — attributes never join the
     If-Match dialect)
PUT  member                   → 403
GET  member                   → 200 including read_roles /
                                write_roles verbatim
DELETE unreferenced           → 204
DELETE with live flow-graph binding → 409 (existing leg still
     fires through the nested route)
POST .../attributes           → 405 (no create verb — parity
     with the flat family; composed op + PUT are the creators)
PATCH .../attributes/:aid     → 405 later (Task 10 adds the
     pin once PATCH exists)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

- Routes: GET collection (derive heads at
  `/organizations/<o>/record-types/<t>/attributes/`, id-lex),
  GET detail, PUT (`validateAttributeDocumentCreate` when no
  head at the address, `...Replace` when a head exists —
  resolve pre-tx via `deriveDocumentsAt`), DELETE (RESTRICT via
  `deleteRecordAttributeSafe`, whose predicate gains the
  fourth leg).
- Fourth leg in `collectAttributeReferrers`: derive the parent
  type's live instance heads at the sibling
  `.../record-types/<t>/instances/` prefix and collect ids
  whose head values contain the attribute id. Until Task 14
  lands, read each live head pair and take
  `revisionValuesOf(body)` (or an inline twin of that one
  normalizer — `body.values ?? body.set`). Do **not** fold a
  PATCH delta chain. Task 14 extracts
  `deriveInstanceCollection` / head values and RE-POINTS this
  leg (the better way replaces every similar site; the inline
  twin dies there — R5).
  Remedy string unchanged: clear the values first.
  NOTE: `collectAttributeReferrers` gains the parent type id
  parameter for the nested call path; the flat window call
  sites pass the body `record_id`.
- Parent-existence: every attribute route resolves
  `requireRecordTypeExists` first (404 before deeper work —
  ladder step 4).
- Pattern sets: `ATTRIBUTE_DETAIL_PATTERN` joins
  `PAIR_WIRED_ROUTE_PATTERNS` + `DOCUMENT_CLASS_ROUTE_PATTERNS`.
- `WRITE_RESPONSE_SPECS[ATTRIBUTE_DETAIL_PATTERN]`: put-only
  entry echoing `{id: param(params, 2), organization_id:
  param(params, 0), record_type_id: param(params, 1),
  ...entity}`.
- No `WRITE_AUTHORIZERS` entry (deep sub-family — exempt,
  reconciliation 6).

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add nested attributes surface under types"
```

---

### Task 8: Attribute re-home cutover

Seed attribute pairs move under their type prefix; stored bodies
drop `record_id`; the flat window re-points; the second snapshot
predicate lands.

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts:1789-1795`
  (attribute invocation entries), `api/routes.ts` (flat
  record-attributes handlers + composed-op attribute pair
  formation at `:4491-4562`), `api/record-attribute-refs.ts`
  call sites, `api/snapshot-validator.ts` +
  `web-app/app/adapters/snapshots.ts` (second predicate)
- Tests to update: `tests/mock-data-pairs.test.ts:494-507`
  (prefix → `/organizations/1/record-types/
  rec01CustProfRec0rdAB1/attributes/`; body-key pin loses
  `record_id`, gains `read_roles`/`write_roles` — sorted:
  `attribute_type, constraints, name, options, read_roles,
  sort_order, write_roles`), `tests/message-pair.test.ts:63-66`,
  `tests/drift-records.test.ts` (attribute parity via nested
  derives), `tests/drift-state-field-values.test.ts:70-73`,
  `tests/drift-phase15-cores-parity.test.ts:1006-1007`,
  `tests/api-record-attribute-document.test.ts`,
  `tests/api-record-attribute-restrict.test.ts`

- [ ] **Step 1: Failing pin** — seeded Contact Email attribute
      pair's `uri_prefix` equals
      `'/organizations/1/record-types/'
      + 'rec01CustProfRec0rdAB1/attributes/'`; stored body has
      no `record_id` and carries both ACL arrays.

- [ ] **Step 2: Implement the seed move**

Seed attribute invocation entries switch to the nested pattern:

```ts
key: seedPairKey(ATTRIBUTE_DETAIL_PATTERN, a.id),
routePattern: ATTRIBUTE_DETAIL_PATTERN,
idParams: [organizationIdFor(r), r.id, a.id],
```

Body builder `recordAttributeDocumentBodyOf` drops `record_id`
and stamps `DEFAULT_ATTRIBUTE_ACL_ROLES` (create-stamp — storage
always carries both arrays). Pair counts must NOT move.

- [ ] **Step 3: Re-point the flat window**

- Flat `GET /record-attributes` (collection): derive record-type
  heads for the org, then per-type attribute derives, concat,
  id-lex, and RE-ATTACH `record_id` (from each row's address
  type segment) so the flat wire shape is unchanged for the
  window's clients.
- Flat `GET/PUT/DELETE /record-attributes/:id`: resolve the
  owning type by `responses.getAllWhere('uri_id', id)` prefix
  probe (the `resolveGlobalOwner` posture) for reads/deletes;
  PUT addresses from the body's `record_id` (still required on
  the FLAT validator — the flat wire keeps its shape for the
  window; `validateRecordAttributeDocumentBody` stays for flat,
  stamping ACL defaults on both create and replace so nothing
  drifts).
- Composed flat `POST /records`: attribute pairs form at
  `ATTRIBUTE_DETAIL_PATTERN` addresses (type id = top-level
  body id), bodies rectified (no `record_id`, ACL stamped);
  edit-mode RESTRICT keeps firing in-tx.

- [ ] **Step 4: Second snapshot predicate**

Add `/^\/organizations\/[^/]+\/record-attributes\//` to both
gates + extend Task 5's tests (fresh snapshot with flow-record
joins must PASS — anchored, not substring).

- [ ] **Step 5: Run `./test`** — full suite green; counts
      1494/12 unchanged.

- [ ] **Step 6: `./validate`, then commit** (three commits:
      seed+bodies, flat window re-point, snapshot gate)

```bash
git commit -m "Re-home attribute pairs under type prefixes"
git commit -m "Serve flat record-attributes from nested storage"
git commit -m "Reject retired record-attributes prefixes"
```

---

### Task 9: Nested composed op — POST record-types

**Files:**
- Modify: `api/routes.ts` (nested POST registration reusing the
  flat bundle-former), `api/message-pair.ts`
  (`createdEntityUriId` + `PAIR_WIRED_ROUTE_PATTERNS` gain
  `RECORD_TYPES_COLLECTION_PATTERN`), `api/routes.ts`
  `WRITE_RESPONSE_SPECS[RECORD_TYPES_COLLECTION_PATTERN] =
  { status: HTTP_NO_CONTENT }`
- Test: `tests/api-record-types-composed-op.test.ts`

- [ ] **Step 1: Failing tests**

```text
POST .../record-types kind create (admin) → 204; document +
     N attribute pairs at nested addresses; GETs see them
POST kind edit with removedAttributeIds referencing a bound
     attribute → 409 naming the referrers; NOTHING appended
     (whole batch rolls back — mirror
     api-record-attribute-restrict.test.ts's rollback case)
POST member → 403      (admin-gated from birth — the nested
     surface never grants member mutation)
POST body organization_id forged ≠ path org → stamped/ignored
     exactly as the facade test pins today (bound org wins)
kind unknown → 400 (existing validator message)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

Register POST on `RECORD_TYPES_COLLECTION_PATTERN` reusing the
flat route's bundle-former + `postRecordWriteOp` verbatim
(operation pair at the nested collection address with
`uriId = body.id` via `createdEntityUriId` — add the pattern to
its resolver set:

```ts
const CREATE_BODY_ID_FIELDS:
    Readonly<Record<string, string>> = {
    'invitations': 'invitationId',
    [RECORD_TYPES_COLLECTION_PATTERN]: 'id',
};
```

— document pair at `RECORD_TYPE_DETAIL_PATTERN`, attribute
pairs at `ATTRIBUTE_DETAIL_PATTERN`). The op/document pairs
share one `uri_id` (the existing supersession collapse —
preserve it; `tests/mock-data-pairs.test.ts:453-460`
distinguishes them by status only).

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add nested composed record-types write op"
```

---

### Task 10: PATCH joins the verb alphabet

Every four-verb-literal site widens; no route carries a patch
handler yet. Security-critical: `writeAuthorizerFor` widens so a
future flat PATCH can never bypass the ownership fence.

**Files:**
- Modify: `api/routes.ts` (`Route`, `route()`, `PatchHandler`),
  `api/api.ts` (`isWrite`, `hasWriteHandler`, body parse, verb
  switch arm + 405, facade `hasBody`, `writeResponseSpecFor`),
  `api/write-authorizer.ts` (method check),
  `api/authorization.ts` (root PATCH admin row),
  `api/message-pair.ts` (`HOISTED_HEADER_NAMES` + `'if-match'`)
- Tests: `tests/api-patch-verb.test.ts` (create);
  `tests/pair-write-coverage.test.ts` (widen the walker to
  `entry.patch`); extend the six `api-*-verb-gaps` suites with
  PATCH pins

**Interfaces:**
- Produces:

```ts
// api/routes.ts
export type PatchHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
) => Promise<unknown>;
export interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    patch?: PatchHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}
// PerVerbWriteResponseSpec gains patch?: WriteResponseSpec
// api/message-pair.ts
export const IF_MATCH_HEADER = 'if-match';
```

Also (reconciliation 5, same commit): `GetHandler` appends
`roles: readonly string[]`; `PutHandler`/`DeleteHandler` append
`organization: Id | undefined, roles: readonly string[]`;
`PostHandler` appends `roles`. Gate dispatch sites pass
`fenced.ctx.roles` / organization. No existing handler changes.

- [ ] **Step 1: Failing tests**

```text
PATCH /ideas/idea-1 (admin, route exists, no patch handler)
    → 405 'Method PATCH not allowed on /ideas/idea-1'
PATCH /ideas/idea-1 (member) → 403 (policy before verb gap —
    no member PATCH row outside instances)
PATCH /nowhere (admin)       → 404
PATCH unauthenticated        → 401
pair-write-coverage: a synthetic route with only a patch
    handler and no PAIR_WIRED entry FAILS the walker
```

- [ ] **Step 2: Run to verify failure** (405 case currently
      403s; walker case currently invisible)

- [ ] **Step 3: Implement**

- `api/api.ts:458` body parse:
  `method === 'PUT' || method === 'POST'
  || method === 'PATCH'`.
- `:522` `isWrite` gains `|| method === 'PATCH'`;
  `hasWriteHandler` gains `matched.patch !== undefined`.
- Verb switch gains a `case 'PATCH':` arm mirroring PUT's
  shape (405 when `!matched.patch`; dispatch with
  `(effective, params, body!, actor, pair, organization,
  fenced.ctx.roles)`).
- Facade `hasBody` (`:161-162`) gains PATCH (correctness for
  any facade-window PATCH; moot post-inversion for instances).
- `writeAuthorizerFor` method check:
  `PUT | DELETE | PATCH`.
- `ROUTE_POLICY` root rows gain
  `{ verb: 'PATCH', pathPrefix: '/', roles: ['admin'] }` —
  covenant consequence, pinned: admin PATCH probes on
  handler-less routes now answer 405 (known verb, no handler),
  members still 403.
- `HOISTED_HEADER_NAMES` gains `'if-match'` (stored verbatim —
  it is not a credential; two PATCHes differing only in
  If-Match are different messages).
- `writeResponseSpecFor`: per-verb resolution becomes explicit
  (`put` / `patch` / else `post`) — never let PATCH silently
  take the `post` branch.
- `pair-write-coverage.test.ts` walker widens to `entry.patch`
  (this is covenant maintenance, not weakening: the alphabet
  grew, the gate must see it).

- [ ] **Step 4: Run tests + all verb-gap suites** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Widen the verb alphabet with PATCH"
```

Note (R3 foreshadow): client `*WithEtag` siblings land in
Task 21. They must DELEGATE through shared await sites so
the `simulateLatency` literal-count pin stays 4 — do not
add a fifth bare `await adapter.simulateLatency()` when
PATCH lands on the client facade.

---

### Task 11: 428 + If-Match / ETag primitives

**Files:**
- Modify: `api/http-errors.ts`, `api/message-pair.ts`
- Test: `tests/if-match-primitives.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 15–19):

```ts
// api/http-errors.ts
export const HTTP_PRECONDITION_REQUIRED = 428;

// api/message-pair.ts
export function parseIfMatch(
    header: string,
): string | undefined;
// '"abc"'      → 'abc'
// '*'          → undefined (caller 400s)
// '"a", "b"'   → undefined (lists rejected)
// 'W/"abc"'    → undefined (weak rejected)
// 'abc'        → undefined (unquoted rejected)
export function strongEtagOf(pairId: string): string;
// → '"' + pairId + '"'
export function attachEtag(
    response: Response, pairId: string,
): Response;  // headers.set('ETag', strongEtagOf(pairId));
              // returns the same Response
```

- [ ] **Step 1: Failing tests** — the five `parseIfMatch`
      cases above plus `strongEtagOf('x') === '"x"'` and
      `attachEtag` visibility on a `Response.json`.
- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** (pure functions; ~20 lines)
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add 428 constant and If-Match primitives"
```

---

### Task 12: Value engine — move, then server validation

**Files:**
- Rename: `web-app/app/record-constraints.ts` →
  `api/record-constraints.ts` (pure move; re-point the four
  importers: `web-app/app/adapters/record-transitions.ts:18-27`,
  `web-app/app/presenters/workbox-detail.ts:28-29`,
  `tests/record-constraints.test.ts:13`,
  `tests/presenter-workbox-detail.test.ts:27`; its own
  `import type` paths shift to `./types.ts`). **R7:** the move
  commit's only layer offense is the `RecordAttribute` type
  import from the web-app adapter. Commit 2 restates that shape
  locally as `AttributeSchemaRow` and drops the web-app type
  import — never in the move commit.
- Create (second commit): `validateInstanceValues` beside it
- Test: `tests/instance-value-validation.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 15, 17):

```ts
// api/record-constraints.ts (added in commit 2)
export interface AttributeSchemaRow {
    readonly id: string;
    readonly name: string;
    readonly attributeType: AttributeType;
    readonly options: readonly string[];
    readonly constraints: readonly Constraint[];
    readonly readRoles: readonly string[];
    readonly writeRoles: readonly string[];
}
export function validateInstanceValues(
    set: readonly { attribute_id: string;
        value: string }[],
    attributesById:
        ReadonlyMap<string, AttributeSchemaRow>,
): void;
// throws ValidationError naming the attribute and the
// failure: type conformance per reconciliation 9, then
// the existing constraint engine
// (validateAttributeValue), formatted via formatViolation.
// Empty-string value → ValidationError (absence is clear,
// never '').
```

- [ ] **Step 1: Pure-move commit** (`git mv`, import re-points,
      NOTHING else) — run `./validate` — commit:

```bash
git commit -m "Move record-constraints into the api layer"
```

- [ ] **Step 2: Failing tests** for `validateInstanceValues`:

```text
number 'abc'            → 400 message names attribute + type
number '42'             → passes
number '42' with range_min 50 → 400 via constraint engine
date '2026-13-99'       → 400; '2026-08-05' passes
select value ∉ options  → 400; ∈ options passes
checkbox 'yes'          → 400; 'true'/'false' pass
text anything non-empty → passes
value ''                → 400
```

- [ ] **Step 3: Implement** — type conformance switch +
      delegate to `validateAttributeValue`; compose the
      `ValidationError` message as
      `'value for attribute "<name>" <violation text>'`.
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Validate instance values at the server gate"
```

---

### Task 13: Attribute ACL evaluation module

The platform's first field-level × role-aware projection.

**Files:**
- Create: `api/attribute-acl.ts`
- Test: `tests/attribute-acl.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 15–19):

```ts
export function rolesCanRead(
    roles: readonly string[],
    attribute: AttributeSchemaRow,
): boolean;   // roles includes 'admin' → true (bypass);
              // else intersection(roles, readRoles) ≠ ∅
export function rolesCanWrite(
    roles: readonly string[],
    attribute: AttributeSchemaRow,
): boolean;   // same shape over writeRoles
export function assertWritableAttributeIds(
    attributeIds: readonly string[],
    attributesById:
        ReadonlyMap<string, AttributeSchemaRow>,
    roles: readonly string[],
): void;
// unknown id → ValidationError (→ 400; ladder step 9 —
//     schema truth is member-readable, no leak)
// any non-writable id → ApiError 403 all-or-nothing:
//     'forbidden: attribute <id> is not writable with the
//      held roles'
export function projectReadableValues(
    values: readonly { attribute_id: string;
        value: string }[],
    attributesById:
        ReadonlyMap<string, AttributeSchemaRow>,
    roles: readonly string[],
): { attribute_id: string; value: string }[];
// structural shape here; Task 14's InstanceValue aliases
// it (this task lands first)
// drops values whose attribute the caller may not read;
// a value whose attribute id is unknown (deleted attr
// cannot happen — RESTRICT leg 4 — but fold defensively?
// NO: trust the gates; unknown-in-projection is impossible
// by RESTRICT and is not guarded (no internal defense)
```

- [ ] **Step 1: Failing tests**

```text
member + read_roles ['member','admin'] → readable
member + read_roles []                 → not readable
admin  + read_roles []                 → readable (bypass)
member + write w/o read (submit-only)  → writable, not readable
unknown attribute id in write set      → ValidationError
one unwritable id among writable ones  → ApiError 403
    (all-or-nothing)
custom role 'auditor' in read_roles + member token
                                       → not readable
    (closed token alphabet — matches nothing today)
projection of zero readable            → []
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** (pure; no I/O)
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add attribute ACL evaluation and projection"
```

---

### Task 14: Instance derive module — full-state head (R5)

Thin derive module. NO fold. NO `derive-documents.ts` change.
Revision pairs are method PUT with `{values}`; genesis PUT
wire bodies use `{set}` — one normalizer at the seam.

**Files:**
- Create: `api/derive-record-instances.ts`
- Modify: `api/family-registry.ts` (pattern constants only —
  or export patterns from here and re-export; pick ONE voice)
- Test: `tests/derive-record-instances.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 15–20 and the RESTRICT legs):

```ts
export const INSTANCES_COLLECTION_PATTERN =
    RECORD_TYPE_DETAIL_PATTERN + '/instances';
export const INSTANCE_DETAIL_PATTERN =
    INSTANCES_COLLECTION_PATTERN + '/:instance-id';
export const INSTANCE_HISTORY_PATTERN =
    INSTANCE_DETAIL_PATTERN + '/history';
// (patterns live in api/family-registry.ts with the others)

export interface InstanceValue {
    readonly attribute_id: string;
    readonly value: string;
}
export interface InstanceRevision {
    readonly at: string;
    readonly pairId: string;
    readonly values: readonly InstanceValue[];
}
export interface InstanceHead {
    readonly id: string;
    readonly pairId: string;      // wire ETag source
    readonly values: readonly InstanceValue[];
}
export function instancesUriPrefix(
    organization: Id, recordTypeId: Id,
): string;
export function revisionValuesOf(
    body: Record<string, unknown>,
): InstanceValue[];
// body.values ?? body.set — genesis wire uses {set};
// revision pairs use {values}. ONE normalizer; no second
// dialect leaks into handlers or adapters.
export function mergeInstanceValues(
    head: readonly InstanceValue[],
    delta: {
        set?: readonly InstanceValue[];
        clear?: readonly string[];
    },
): InstanceValue[];
// pure: apply set overwrites, then clear deletes; emit
// attribute_id-lexicographic for deterministic wire bytes.
// clear of already-absent is a no-op on the map (caller may
// still append a revision — that is Task 17's concern).
export function deriveInstanceHead(
    db: DbAdapter, organization: Id,
    recordTypeId: Id, instanceId: Id,
): Promise<InstanceHead | undefined>;
// undefined when absent OR tombstoned (DELETE is the last
// document pair) — tombstone = absent for every read path.
// Head body: revisionValuesOf(head.request body) — ONE head
// pair read via documentHeadPairId / documentPairsAt.
export function deriveInstanceCollection(
    db: DbAdapter, organization: Id, recordTypeId: Id,
): Promise<InstanceHead[]>;   // id-lex ASC, tombstones
                              // omitted
export function deriveInstanceRevisions(
    db: DbAdapter, organization: Id,
    recordTypeId: Id, instanceId: Id,
): Promise<InstanceRevision[]>;  // ASC; empty when absent
                                 // or tombstoned; each entry
                                 // carries FULL state
```

- [ ] **Step 1: Failing tests** (pure merge/normalizer +
      adapter-level):

```text
revisionValuesOf({set:[{a=1},{b=2}]})     → [{a=1},{b=2}]
revisionValuesOf({values:[{a=1}]})        → [{a=1}]
merge: head {a=1,b=2} + set[a=3]          → {a=3,b=2}
merge: … + clear['b']                     → {a=3};
      cleared attribute is ABSENT, not null/''
merge: clear of already-absent            → unchanged map
head: after genesis PUT only              → full set as values
head: after PATCH revision pair           → merged full state
      from the NEW head pair (one read — no fold)
head: DELETE pair last                    → undefined
collection: two live + one tombstoned     → two rows, id-lex
revisions: genesis + 2 patches            → 3 full-state
      entries ASC; index last == head
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** — pure helpers first; derives
      via existing `documentPairsAt` / `documentHeadPairId`
      over PUT|DELETE pairs only (PATCH pairs never appear
      because `DOCUMENT_METHODS` is unchanged). Re-point
      Task 7's inline fourth-leg instance scan in
      `api/record-attribute-refs.ts` at
      `deriveInstanceCollection` / head values (delete any
      inline twin). **Do not edit `derive-documents.ts`.**
- [ ] **Step 4: Run tests + the drift suites** (no method-
      filter change means existing families stay
      byte-identical — pin it).
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Derive record instances from full-state heads"
```

---

### Task 15: Instance PUT genesis — the create-only posture

**Files:**
- Modify: `api/family-registry.ts` (`ConcurrencyClass` +
  pattern set), `api/api.ts` (create-only gate arm + ETag
  attach R8), `api/routes.ts` (route + handler + spec +
  policy), `api/validators.ts` (PUT body),
  `api/message-pair.ts` (`PAIR_WIRED_ROUTE_PATTERNS` only —
  R10)
- Test: `tests/api-instances-create.test.ts`

**Interfaces:**

```ts
// api/family-registry.ts
export type ConcurrencyClass =
    'simple' | 'locked' | 'create-only';
export const CREATE_ONLY_PUT_ROUTE_PATTERNS:
    ReadonlySet<string> =
    new Set([INSTANCE_DETAIL_PATTERN]);

// api/validators.ts
export function validateInstancePutBody(
    body: Record<string, unknown>,
): { set: { attribute_id: string; value: string }[] };
// keys: exactly ['set'] (+ tolerated none) — a 'clear' key
// → 'unexpected key "clear" for InstancePutBody'
// duplicate attribute_id within set → 400
// '' value → 400 (G9)
```

Wire 200 body (echoes the request-derived delta — never the
head):

```ts
{
    id: param(params, 2),
    organization_id: param(params, 0),
    record_type_id: param(params, 1),
    set: validated.set,
}
```

**Storage note (R5):** genesis is ONE pair — the wire PUT
`{set}` pair IS revision 0. `revisionValuesOf` treats `set`
as the full state at birth. No second pair on create.

- [ ] **Step 1: Failing tests**

```text
PUT {set:[…]} member, type exists   → 200 + ETag header ==
    '"' + <new pair response id> + '"'; GET shows values
PUT {set: []}                       → 200 (empty genesis;
    zero write roles still allowed — path-tier only)
PUT under absent type               → 404 record_types
PUT with If-Match header            → 400 'If-Match is not
    accepted on PUT…'
PUT {set:[…], clear:[…]}            → 400 unexpected key
PUT duplicate attribute_id in set   → 400
PUT value ''                        → 400 (G9)
PUT unwritable attribute (member,
    write_roles [])                 → 403 all-or-nothing
PUT admin same attribute            → 200 (bypass)
PUT bad value (number 'abc')        → 400 naming attribute
PUT at an address with a live head  → 409 'instance already
    exists at <pathname>' (non-identical body)
PUT at a tombstoned address         → 409 (address spent)
byte-identical PUT resend           → 200 replay of the
    stored response; ETag == ORIGINAL pair id (R8)
two creates racing one address      → first 200, second 409
    (interleave a below-gate append between the second
    caller's pre-tx work and its transaction, the
    tests/api-flow-document.test.ts:856-925 idiom — proves
    the IN-TX check, not just the sequential 409)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

Gate arm (before pair formation, after the write authorizer):

```ts
const isCreateOnlyWrite = method === 'PUT'
    && CREATE_ONLY_PUT_ROUTE_PATTERNS
        .has(routePattern);
if (
    isCreateOnlyWrite
    && request.headers.get(IF_MATCH_HEADER) !== null
) {
    return Response.json(
        {
            error: 'If-Match is not accepted on PUT: '
                + 'create is unconditional at '
                + pathname,
        },
        { status: HTTP_BAD_REQUEST },
    );
}
```

and the pair forms with `headPairId: undefined` for
create-only (neither `follows` nor `supersedes` — genesis
carries nothing; the in-tx check owns the race).

Handler order (ladder!): parent type 404 → body shape 400 →
write-ACL 403 (`assertWritableAttributeIds`) → value 400
(`validateInstanceValues`) → transaction (R9 in-tx verify):

```ts
await db.transaction(
    ['requests', 'responses'],
    async (view) => {
        const responses = await view.responses
            .getAllWhere('uri_prefix', prefix);
        const spent = responses.some(
            (r) => r.uri_id === instanceId,
        );
        if (spent) {
            throw new ApiError(
                'instance already exists at '
                    + pathname,
                HTTP_CONFLICT,
            );
        }
        if (pair !== undefined) {
            await appendMessagePair(view, pair);
        }
    },
);
```

(Read-check-write inside ONE tx — the WO-claim /
invitation-accept precedent; any prior response row at the
address, tombstone included, spends it.)

**R10:** Wire the pattern into `PAIR_WIRED_ROUTE_PATTERNS`
**only** — do NOT add it to `DOCUMENT_CLASS_ROUTE_PATTERNS`
(that set's sole effect is the lock-head read feeding
supersedes/locked-echo, which the bespoke instance gate
replaces). `WRITE_RESPONSE_SPECS[INSTANCE_DETAIL_PATTERN]`
gets a per-verb entry (`put` now, `patch` in Task 17).

**Policy (R6):** definitive MEMBER_VERBS / root admin rows —
instance writes ride the nested member row for GET and the
explicit collection policy for write verbs:

```ts
'/organizations/:id/record-types/:tid/instances':
    ['GET', 'PUT', 'PATCH', 'DELETE'],
```

(or the house-equivalent prefix form that the segment
boundary matcher already accepts — state the chosen key
verbatim in the commit; no hedge).

**ETag (R8):** at the gate's write-return site, for
`INSTANCE_DETAIL_PATTERN`, wrap with
`attachEtag(response, stored.id)` (replays included — a
replayed create echoes its original identity).

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add create-only instance PUT genesis"
```

---

### Task 16: Instance GET detail + list — projection + ETag

**Files:**
- Modify: `api/routes.ts` (two GET handlers), `api/api.ts`
  (detail ETag attach on the GET side)
- Test: `tests/api-instances-read.test.ts`

Wire shapes:

```ts
// detail 200
{
    id, organization_id, record_type_id,
    values: [{ attribute_id, value }],   // read-projected
}
// list row (adds the row-embedded etag; header only on
// detail)
{
    id, organization_id, record_type_id,
    values: [...], etag: '<pairId>',     // no quotes in JSON
}
```

- [ ] **Step 1: Failing tests**

```text
GET detail member                → 200; only read-permitted
    values; ETag header '"' + head pairId + '"'
GET detail, caller reads ZERO    → 200 { …, values: [] }
GET detail admin                 → 200 all values (bypass)
GET detail absent / tombstoned   → 404 via missedReadError (R2)
GET detail foreign instance id under own org path → 403
    (missedReadError / resolveGlobalOwner — R2)
GET list                         → 200 id-lex ASC; tombstones
    omitted; each row's etag equals its detail ETag validator
    (sans quotes)
GET list under absent type       → 404
ETag byte source                 → header VALUE ≠ the stored
    responses.etag column for the same pair (pin the
    collision away)
GET after PATCH                  → full merged values from
    ONE head pair (no fold)
```

- [ ] **Step 2: Run to verify failure**

- [ ] **Step 3: Implement**

Handlers call `deriveInstanceHead` / `deriveInstanceCollection`
+ `projectReadableValues` (attributes resolved via the parent
type's attribute derive; `requireRecordTypeExists` first).
Detail miss → `missedReadError(db, instanceId, organization,
'record_instances')` (R2 — never a bare 404).

Detail ETag: in the gate's GET post-dispatch arm (the
`Response-ID` attach precedent at `api/api.ts:764-796`), for
`INSTANCE_DETAIL_PATTERN` compute
`documentHeadPairId(effective, instancesUriPrefix(
params[0], params[1]), params[2])` and attach via
`attachEtag`. Head is the latest PUT|DELETE document pair
(revision or genesis or tombstone) — never a PATCH wire pair.

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Project instance reads by attribute ACL"
```

---

### Task 17: Instance PATCH — If-Match + full-state revision (R5)

**Files:**
- Modify: `api/api.ts` (PATCH pre-dispatch ladder + ETag
  attach R8), `api/routes.ts` (patch handler + spec +
  two-pair append), `api/validators.ts` (PATCH body)
- Test: `tests/api-instances-patch.test.ts`

**Interfaces:**

```ts
// api/validators.ts
export function validateInstancePatchBody(
    body: Record<string, unknown>,
): {
    set: { attribute_id: string; value: string }[];
    clear: string[];
};
// keys ⊆ ['set', 'clear']; both optional; effective
// emptiness ((set?.length ?? 0) + (clear?.length ?? 0)
// === 0) → 400; duplicate id within set → 400; id in both
// set and clear → 400; '' in set → 400 (G9)
```

Gate PATCH ladder (pre-dispatch, AFTER the replay fast path —
ordering is load-bearing exactly as the locked class pins):

```ts
if (
    method === 'PATCH' && hasWriteHandler
    && PAIR_WIRED_ROUTE_PATTERNS.has(routePattern)
) {
    const head = await deriveInstanceHeadForGate(
        effective, params,
    );  // derived head: tombstone == absent
    if (head === undefined) {
        // R2: honest foreign 403 / absent 404
        return await missedReadError(
            effective, param(params, 2),
            organization, 'record_instances',
        );
        // (or the gate-local equivalent that yields the
        // same status body pair — one voice with GET)
    }
    const raw = request.headers.get(IF_MATCH_HEADER);
    if (raw === null) {
        return Response.json(
            {
                error: 'If-Match is required to PATCH '
                    + pathname,
            },
            { status: HTTP_PRECONDITION_REQUIRED },
        );
    }
    const echo = parseIfMatch(raw);
    if (echo === undefined) {
        return Response.json(
            {
                error: 'If-Match must carry exactly one '
                    + 'strong validator',
            },
            { status: HTTP_BAD_REQUEST },
        );
    }
    if (echo !== head.pairId) {
        return Response.json(
            {
                error: 'If-Match does not match the '
                    + 'current instance at ' + pathname,
            },
            { status: HTTP_PRECONDITION_FAILED },
        );
    }
    // proceed: wire pair carries follows = head.pairId
}
```

**Two-pair append (R5) — load-bearing:**

1. Pre-tx (outside the IDB transaction — validators/crypto
   never await non-IDB inside tx): merge
   `mergeInstanceValues(head.values, validated)` →
   `mergedValues`.
2. Form the wire PATCH pair as today (method PATCH, body
   `{set, clear}`, `follows = head.pairId`, If-Match
   hoisted into the hash, success body = delta echo).
3. Form the revision pair via `formDocumentPairFor` with
   **EXPLICIT** `follows: head.pairId` (never its own
   re-read — pin with a race test; see
   `api/routes.ts:3020-3035` covenant):

```ts
const revisionPair = await formDocumentPairFor(db, {
    routePattern: INSTANCE_DETAIL_PATTERN,
    params: [orgId, typeId, instanceId],
    method: 'PUT',
    body: { values: mergedValues },
    requesterIdentityId: actor,
    requestAt: wirePair.requestAt, // or nowUtc per house
    organization: orgId,
    chain: 'follows',
    follows: head.pairId,   // EXPLICIT — never re-read
    response: { status: 200, body: {} },
});
```

4. In ONE tx (R9): re-read head; if head.pairId ≠ If-Match
   target → 412; else `appendMessagePair(wire)` then
   `appendMessagePair(revision)`. Append order controls
   head: revision is last → GET sees full state.
5. UNIQUE `responses.follows` remains the serializable
   backstop when two writers share the same If-Match
   (decision 15).

Handler order: shape 400 → unknown attribute 400 → write-ACL
403 (over set ∪ clear ids) → value 400 (set only) → two-pair
tx. `clear` of an already-absent value passes (convergent
retry still appends a full-state revision whose values equal
the prior head). Success body echoes the delta only:

```ts
{
    id: param(params, 2),
    organization_id: param(params, 0),
    record_type_id: param(params, 1),
    set: validated.set,
    clear: validated.clear,
}
```

**ETag on success and replay (R8):** wire ETag = the
**revision** pair's response id (the new head), not the
PATCH operation pair. On byte-identical PATCH resend, recover
the original ETag with
`responses.getAllWhere('follows', <parsed If-Match>)` → the
wire pair's response, then the revision that followed it
(or attach from the stored success path's recorded head id —
pin: "replay carries its ORIGINAL etag even after later
revisions").

- [ ] **Step 1: Failing tests** (drive with the 5-arg `req`
      helper from `tests/api-flow-tags.test.ts` for the
      If-Match header):

```text
PATCH fresh If-Match          → 200 + new ETag; GET reflects
    full merged state from ONE head pair
PATCH missing If-Match        → 428
PATCH stale If-Match          → 412; client re-GET + retry
    with fresh ETag → 200 (the spec's 412 loop, end-to-end)
PATCH If-Match '*' / list / weak / unquoted → 400
PATCH absent / tombstoned     → 404 via missedReadError (R2);
    never creates/revives
PATCH foreign instance id     → 403 via missedReadError (R2)
PATCH set∩clear overlap       → 400
PATCH duplicate in set        → 400
PATCH both empty              → 400
PATCH value ''                → 400 (G9)
PATCH unknown attribute_id    → 400
PATCH unwritable id in clear  → 403 (ACL covers clear too)
PATCH clear of absent value   → 200; revision appended;
    values unchanged
PATCH write-without-read attr → 200; echo contains the value
    (submit-only is coherent — response never echoes head)
byte-identical PATCH resend (same If-Match, now stale)
                              → 200 REPLAY of the stored
    response — before the outcome ladder; ETag == ORIGINAL
    (R8) even if later revisions advanced the head
two writers, same If-Match, forced through the tx
                              → first 200, second 412 via
    UniqueConstraintError OR in-tx verify (R9)
explicit-follows race pin     → formDocumentPairFor never
    re-reads head when follows is supplied (body was merged
    against the gate-verified head)
ETag/ACL interplay            → a write to an unreadable
    attribute still moves the head ETag; the blind writer
    412s, re-GETs, retries → converges
pair count                    → each PATCH adds TWO pairs
    (wire + revision); GET still one head read
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** per the ladder and two-pair
      append above; the gate-side
      `deriveInstanceHeadForGate` is a thin wrapper over
      `deriveInstanceHead` reading params.
- [ ] **Step 4: Run tests** — PASS. Also re-run
      `tests/document-family.test.ts` +
      `tests/api-flow-document.test.ts` (flows' locked class
      must be byte-identical).
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add If-Match PATCH with full-state revisions"
```

---

### Task 18: Instance DELETE — tombstone posture (R4, R9)

**Files:**
- Modify: `api/routes.ts`, `api/api.ts` if in-tx verify lives
  at the gate
- Test: `tests/api-instances-delete.test.ts`

- [ ] **Step 1: Failing tests** — the spec's tombstone table,
      all six rows, plus R4/R9:

```text
DELETE live instance          → 204; then:
  collection GET              → row omitted
  detail GET                  → 404 (missedReadError)
  history GET                 → 404 (missedReadError)
  PATCH                       → 404 (missedReadError)
  PUT genesis at same id      → 409
  DELETE again (new bytes)    → 204 AND a second tombstone
    pair is APPENDED (R4 tombstone-wins, ledger-complete —
    NOT a no-append special case)
DELETE never-existed id       → 404 via missedReadError (R2)
DELETE byte-identical replay  → 204 (replay fast path)
DELETE member with zero write roles → 204 (path-tier only —
    ACL governs values, not existence)
DELETE with If-Match header   → 204 (unconditional; header
    ignored — it is not part of the DELETE dialect)
resurrect-hole (R9): tombstone interleaved between gate
    head-read and tx append of a concurrent PATCH → PATCH
    412 (or honest miss), NEVER a revived live head after
    a tombstone
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** — handler: parent type 404 →
      address probe:
      - **absent** (zero pairs) → `missedReadError` (R2)
      - **live OR already-tombstoned** → append the
        gate-formed tombstone pair in one tx (R4). In-tx
        (R9): if a concurrent writer moved the head after
        the gate read in a way that violates the
        tombstone-wins covenant, fail closed (412/409 per
        the ladder — never resurrect). DELETE stays out of
        `WRITE_RESPONSE_SPECS` (the gate hardcodes 204).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Tombstone instance DELETE with spent addresses"
```

---

### Task 19: Instance history — full-state revision chain

**Files:**
- Modify: `api/routes.ts`
- Test: `tests/api-instances-history.test.ts`

Wire entry (spec § Instance history):

```ts
{ at, etag, values }
// etag: revision pairId, NO quotes in JSON;
// values: that revision's FULL state, projected
// by the caller's CURRENT read ACL (never ACL-as-of-then)
```

Under R5 each history entry is already full state on the
stored revision (or genesis) pair — no fold at read time.

- [ ] **Step 1: Failing tests**

```text
genesis + 2 PATCHes → 200, three entries, (at,id) DESC,
    index 0 == current head (etag matches detail header
    validator sans quotes); each values is FULL state
projection: member sees only currently-readable values in
    EVERY entry; admin sees all
absent instance      → 404 via missedReadError (R2)
tombstoned           → 404 via missedReadError (R2)
foreign instance id  → 403 via missedReadError (R2)
absent type          → 404
```

- [ ] **Step 2: Run to verify failure**
- [ ] **Step 3: Implement** — `deriveInstanceRevisions` +
      per-entry `projectReadableValues`, `.toReversed()`;
      miss → `missedReadError(..., 'record_instances')`.
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add instance value-revision history route"
```

---

### Task 20: Covenant suite — ladder, RESTRICT activation, pins

**Files:**
- Test: `tests/api-instances-precedence.test.ts`,
  `tests/api-record-types-restrict.test.ts` (extend Task 3's),
  extend `tests/api-nested-attributes.test.ts`

- [ ] **Step 1: Precedence-ladder pins** — one fixture per
      adjacent pair, asserting the EARLIER step answers:

```text
 1 unauthenticated anything            → 401
 2 wrong path org + admin-only verb    → 403 org fence (not
   route policy — assert the fence body)
 3 member PUT record-types/:id (own org) → 403 policy
 4 admin PUT instance under absent type  → 404 record_types
 5 PATCH absent instance w/o If-Match    → 404 (not 428)
 6 PATCH live instance, no If-Match, garbage body → 428
   (before body shape)
 7 PATCH stale If-Match + garbage body   → 412 (before 400)
 8 PATCH fresh If-Match + set∩clear      → 400 shape
 9 fresh If-Match + unknown attribute    → 400 (before ACL)
10 fresh If-Match + unwritable known id  → 403
11 fresh If-Match + writable id, bad value → 400
12 PUT race at a spent address           → 409 (in-tx, last)
```

- [ ] **Step 2: RESTRICT activation** (instances now exist):

```text
type DELETE with one live instance   → 409 'record type <id>
    is referenced by 1 instance(s)'
type DELETE after instance DELETE    → 204 (tombstoned
    instances do not block)
attribute DELETE while an instance head carries its value
                                     → 409 fourth leg names
    'instance(s) <iid>'
attribute DELETE after PATCH clears the value → 204
composed-op edit removedAttributeIds with a valued instance
                                     → 409, whole batch rolls
    back (one predicate, one voice)
```

- [ ] **Step 3: Cross-pins**

```text
If-Match is hash-covered: two PATCHes identical but for
    If-Match are different messages (no replay cross-hit)
ETag byte source ≠ responses.etag column (repeat at the
    covenant tier)
list-row etag == detail ETag validator sans quotes
```

- [ ] **Step 4: Run the full suite** — `./test` green.
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Pin instance status ladder and RESTRICT legs"
```

---

### Task 21: Client PATCH + adapter flip + instances adapter

**Files:**
- Modify: `api/api.ts` (client `PATCH` verb fn),
  `web-app/app/adapters/shared.ts` (`ctx.PATCH`),
  `web-app/app/adapters/records.ts`,
  `web-app/app/adapters/record-attributes.ts`,
  `web-app/app/adapters/record-transitions.ts`
- Create: `web-app/app/adapters/record-instances.ts`
- Tests: `tests/adapters-record-instances.test.ts`; update
  `tests/adapters-records.test.ts`,
  `tests/adapters-record-attributes.test.ts`,
  `tests/pair-write-coverage.test.ts` (**R3:** the
  `simulateLatency` literal-count pin stays **4** — new
  verbs DELEGATE through shared await sites; do NOT grow
  the count to five)

**Interfaces (R3):**

```ts
// api/api.ts — siblings of GETWithResponseId
export async function GETWithEtag<T>(
    adapter: ClientFacadeAdapter, resource: string,
    token: string, requestId?: string,
): Promise<{ body: T; etag: string | undefined }>;
// delegates through getResponse (shared simulateLatency)

export async function PUTWithEtag<T>(
    adapter: ClientFacadeAdapter, resource: string,
    payload: Record<string, unknown>, token: string,
    headerFields?: readonly (readonly [string, string])[],
    requestId?: string,
): Promise<{ body: T; etag: string | undefined }>;
// DELEGATE through a shared putResponse await site
// (extract if needed) so the latency pin stays 4

export async function PATCHWithEtag<T>(
    adapter: ClientFacadeAdapter, resource: string,
    payload: Record<string, unknown>, token: string,
    headerFields?: readonly (readonly [string, string])[],
    requestId?: string,
): Promise<{ body: T; etag: string | undefined }>;
// same delegation rule; strip ETag quotes; return {body,etag}

export async function PATCH<T>(
    adapter: ClientFacadeAdapter, resource: string,
    payload: Record<string, unknown>, token: string,
    headerFields?: readonly (readonly [string, string])[],
    requestId?: string,
): Promise<T>;   // unwrap-only sibling; still one await site

// web-app/app/adapters/shared.ts — RequestContext mirrors:
GETWithEtag / PUTWithEtag / PATCHWithEtag / PATCH

// web-app/app/adapters/record-instances.ts
export interface RecordInstance {
    readonly id: string;
    readonly recordTypeId: string;
    readonly values: ReadonlyMap<string, string>;
    readonly etag: string;
}
export function getRecordInstances(
    ctx: RequestContext, recordTypeId: string,
): Promise<RecordInstance[]>;
export function getRecordInstance(
    ctx, recordTypeId, id,
): Promise<RecordInstance>;
// detail: GETWithEtag → etag from header; list rows may
// still carry embedded etag (spec) but detail is authoritative
export function putRecordInstance(
    ctx, recordTypeId, id: string,
    set: readonly { attributeId: string;
        value: string }[],
): Promise<{ etag: string }>;  // PUTWithEtag; return fresh
                               // etag for create-then-edit
export function patchRecordInstance(
    ctx, recordTypeId, id, etag: string,
    delta: {
        set?: readonly { attributeId: string;
            value: string }[];
        clear?: readonly string[];
    },
): Promise<{ etag: string }>;  // If-Match: '"' + etag + '"';
                               // returns new etag; 412
                               // surfaces as RequestError —
                               // adapter does NOT auto-retry
export function deleteRecordInstance(
    ctx, recordTypeId, id,
): Promise<void>;
export function getRecordInstanceHistory(
    ctx, recordTypeId, id,
): Promise<{
    at: string; etag: string;
    values: ReadonlyMap<string, string>;
}[]>;
```

Flip map (every call site — the scout's inventory):

```text
records.ts:
  GET 'records'          → GET 'organizations/' +
                           activeOrganization(ctx) +
                           '/record-types'
  GET 'records/'+id      → nested detail
  PUT 'records/'+id      → nested detail
  POST 'records' (op)    → POST nested collection
record-attributes.ts:
  GET 'record-attributes'→ getRecordAttributesByRecord now
                           GETs the per-type nested
                           collection (server-side filter —
                           the client-side filterByField
                           dies); getRecordAttributeEntities
                           becomes the per-type call's
                           internal or retires if unused
  toRecordAttribute      → recordId now from
                           record_type_id echo
record-transitions.ts    → follows the attributes signature
flow-records.ts          → UNTOUCHED (decision 9)
Call sites: web-app/records/{index,create,detail}.ts,
  web-app/flows/detail.ts:1432,1507-1512,
  web-app/workbox/detail.ts:258-263
```

- [ ] **Step 1: Failing adapter tests** (memory adapter +
      seeded org, per `tests/adapters-records.test.ts`
      idiom): create → list → patch(with etag) → 412-on-stale
      → re-read → retry → delete → history.
- [ ] **Step 2: Implement client PATCH + `*WithEtag` +
      `ctx` mirrors** (delegate through shared await sites
      with PUT/GET; **latency pin stays 4** — R3).
- [ ] **Step 3: Implement the instances adapter; flip the
      records/attributes adapters + all call sites.**
- [ ] **Step 4: Run `./test`** — adapter suites green.
- [ ] **Step 5: `./validate`, then commit** (two commits:
      client verb, then adapter flip)

```bash
git commit -m "Add PATCH to the client request facade"
git commit -m "Speak nested record-types wire from adapters"
```

---

### Task 22: Minimal instances UI + TEST-PLAN

Deliberately scoped (spec non-goal): an **Instances section on
the record detail page** — list, create, edit, delete. No
standalone page, no history UI (adapter covers it), no ACL
editing UI.

**Files:**
- Modify: `web-app/records/detail.ts`,
  `web-app/app/presenters/record-detail.ts`,
  `web-app/app/styles/pages-records.css`, `TEST-PLAN.md`
- Test: `tests/presenter-record-instances.test.ts`

Behavior:
- Section lists instances (id + readable values, presenter
  emits `SafeHtml`).
- "New instance" mints a base62 id, PUT `{set: []}` via
  `putRecordInstance`, **consumes the returned etag** (R3),
  then enters edit.
- Edit renders ONLY writable attributes as inputs (readable
  non-writable render read-only; unreadable omitted), saves
  via `patchRecordInstance` with the held etag (updates held
  etag from the return); on `RequestError` 412: re-GET via
  `getRecordInstance` / `GETWithEtag`, re-render with fresh
  values + etag, and surface "This instance changed
  underneath you — values refreshed; re-apply your edit"
  (client owns the retry, per spec).
- Delete button per instance (confirm via the house dialog
  pattern — `data-dialog-open` / `handleDialogClick`).
- No inline styles; tones via `data-` attributes;
  `hsl(var(--token))` only.

- [ ] **Step 1: Failing presenter tests** — SafeHtml output for:
      empty state, list with projected values, edit form
      rendering writable vs read-only vs omitted fields.
- [ ] **Step 2: Implement presenter + page state wiring**
      (extend the existing `PageState` machine; new states
      `{kind:'instances-editing', instanceId, draft, etag}`).
- [ ] **Step 3: TEST-PLAN.md** — add browser cases: create
      instance, edit + save, concurrent-tab 412 recovery,
      delete, ACL projection (member vs admin), per the
      existing per-entity mutation-domain table format.
- [ ] **Step 4: Run `./test`; then `TMPDIR=/tmp/claude ./serve
      8080` and walk the new cases by hand once.**
- [ ] **Step 5: `./validate`, then commit**

```bash
git commit -m "Add minimal instances UI to record detail"
```

---

### Task 23: Retire the flat records wire

**Files:**
- Modify: `api/routes.ts` (remove flat `records`,
  `records/:id`, `records/:id/history`, `record-attributes`,
  `record-attributes/:id` registrations + their
  `WRITE_RESPONSE_SPECS` entries + `RECORDS_WIRING` /
  `RECORD_ATTRIBUTES_WIRING` if now unreferenced),
  `api/authorization.ts` (delete the `'/records'` and
  `'/record-attributes'` member rows — member schema
  mutation dies here), `api/message-pair.ts` (remove flat
  patterns from both sets), `api/write-authorizer.ts` (remove
  flat entries), `api/family-registry.ts` (DELETE the alias
  map + `wireFamilyStorageName` — reverting
  `canonicalUriPrefix`/`createdEntityUriId` to their
  pre-alias shape), `api/mock-data/seed-message-pairs.ts`
  (record document/op invocation entries move to the NESTED
  patterns — the last alias consumers)
- Tests: migrate `tests/api-records.test.ts`,
  `api-records-write.test.ts`, `api-records-verb-gaps.test.ts`,
  `api-record-document.test.ts`,
  `api-record-attribute-document.test.ts`,
  `api-record-attribute-restrict.test.ts`,
  `api-facade-records-write.test.ts` (facade now 404s for
  records — repoint its two cases at the nested surface and
  keep one pin: authenticated flat `GET /records` → 404,
  unauthenticated → 401), `api-entity-history-routes.test.ts`
  records section (nested history path),
  `tests/api-routes.test.ts` `COLLECTION_ROUTES` (flat names
  out; nested collection in), `tests/family-registry.test.ts`

- [ ] **Step 1: Failing pins first**

```text
GET /records (authenticated)        → 404 'Not found: /records'
GET /records (unauthenticated)      → 401 (401-first covenant)
facade GET /organizations/1/records → 404 (facade re-enters
    flat; flat is gone)
member PUT nested attributes        → 403 (mutation now
    admin-everywhere — the tightening is complete)
```

- [ ] **Step 2: Remove routes, policy rows, wiring, alias;
      re-point the seed's record invocations to nested
      patterns (`RECORD_TYPES_COLLECTION_PATTERN` /
      `RECORD_TYPE_DETAIL_PATTERN`).** Counts stay 1494/12
      (same invocations, new patterns, same addresses).
- [ ] **Step 3: Migrate the test files** (address swaps; the
      error-body vocabulary for the nested surface says
      `record_types` — the old `records` bodies retire with
      the flat wire).
- [ ] **Step 4: Run `./test`** — green.
- [ ] **Step 5: `./validate`, then commit** (commit-stack:
      pins, retirement, test migration)

```bash
git commit -m "Retire flat records and record-attributes wire"
```

---

### Task 24: Docs sweep + measure + post-ship reminder

**Files:**
- Modify: `API-TREE.md`, `API.md`, `ARCHITECTURE.md`,
  `SCHEMA.md`, `CLAUDE.md`, `measurements/` (via `./measure`)

- [ ] **Step 1: API-TREE.md** — replace the records subtree
      (`:13-16`) with the nested
      record-types/attributes/instances tree; DELETE the
      records dual-wire line (`:13`; work-orders' stays);
      update `:57-58` org-nested mirror; rewrite `:63`'s
      "NINE GET registrations" to "nine lifecycle + one
      value-history (instances)"; absolutes at `:72`
      unchanged.
- [ ] **Step 2: API.md** — rewrite §2.8 as
      record-types/attributes/instances (verbs tables, tiers);
      add the instances outcome + replay + tombstone tables
      and the ETag definition as §5.4's sibling dialect
      (create-only PUT + If-Match PATCH, the 409-vs-412
      divergence NAMED); composed-op §3 entry moves to the
      nested address; §5.7 records narrative updated; new
      §5.20 for the instances family.
- [ ] **Step 3: ARCHITECTURE.md** — `## Records` section
      rewritten (types vs instances vocabulary); facade
      section gains the dispatch-inversion rule (in-table
      nested wins; no auto-exchange; org-match 403); the
      nine-GET list at `:468-480` gains the value-history
      tenth; Adapter Conventions gains `ctx.PATCH` + the
      instances adapter.
- [ ] **Step 4: SCHEMA.md** — new no-table-family subsection
      for record-types/attributes/instances prefixes +
      **full-state revision** note (wire PATCH is
      operation-plane; document head is `{values}`); `:107`
      absolutes unchanged; the responses `etag` column note
      gains "unrelated to the wire ETag".
- [ ] **Step 5: CLAUDE.md** — history-registration language at
      `:235-240` and `:531-539` becomes nine + one; records
      family language updated to record-types; snapshot-gate
      sentence gains the retired-prefix scan.
      (Observed adjacent defect, NOT this change: `:225` cites
      retired `currentRolesForInOrganization` — flag to the
      author, fix only if asked.)
- [ ] **Step 6: `./validate`** (the schema-svg gate confirms
      no drift — the message plane did not change shape), then
      commit docs.

```bash
git commit -m "Document org-nested record-types family"
```

- [ ] **Step 7: Measure** — adapters changed:
      `TMPDIR=/tmp/claude ./measure --pages records,\
record-detail --runs 30`, then `--check`; at the milestone,
      a full `--record` sweep. Commit any budget recalibration
      separately and deliberately.
- [ ] **Step 8: POST-SHIP REMINDER (spec-mandated, say it out
      loud in the completion report):** remind the author to
      schedule optimistic-locking unification — migrate flows
      (and any If-Response-ID surface) to If-Match/ETag, and
      fold the create-409 vs locked-412 "exists" divergence
      into that review (spec decision 13).

---

## Phase 2 — deferred sketch only (G6)

Not implemented in this plan. Separate future PR stack:

1. Work-order transitions carry `instance_id` + asserted
   `record_type_id` (SoT flip from transition field_values).
2. Placement UNIQUE spirit on `(work_order_id, instance_id)`
   at write time; history may visit many nodes.
3. Transition validation: required-ness only at exit nodes
   (decision 14 — still no schema-level required).
4. Field_values on transitions become assertions or drop to
   derived projections of the bound instance.
5. Multi-WO shared instances remain org-owned (decision 7).
6. One record-type per WO remains (decision 9); multi-type
   WOs stay out.
7. Adapter + workbox UI rewiring; measure before/after.

## Risks (G3)

- **Two-pair PATCH races with head re-read** — explicit
  `follows` on `formDocumentPairFor`; R9 in-tx verify;
  UNIQUE backstop.
- **Client discards ETag headers** — R3 `*WithEtag` +
  adapter returns; T22 consumes.
- **Honest-status foreign miss becomes bare 404** — R2
  every miss → `missedReadError`.
- **DELETE resurrect after interleave** — R4
  tombstone-wins append + R9 in-tx probe.
- **Alias window half-broken clients** — alias stores NEW
  addresses only; T23 deletes alias.
- **`shared/` chasm violation** — value engine in `api/`
  (recon 2).
- **Latency pin breakage on PATCH client** — R3 delegate;
  pin stays 4.
- **Fold leftover in code review** — grep for
  `foldInstanceRevisions`; must be zero.
- **Flat path leftovers after T23** — G7 final grep.

## Spec-coverage matrix (G2)

| Spec area | Tasks |
| --- | --- |
| Nested-primary routes; match before facade | 1, 2, 3 |
| Org-match fence; no auto-exchange | 2 |
| Record-types nested CRUD-as-HTTP + history | 2, 3, 9 |
| Storage rename alias `records`→`record-types` | 4, 23 |
| Snapshot retired-prefix gates (decision 18) | 5, 8 |
| Attribute ACL stamp/replace (decisions 5, 12, 16) | 6, 7, 8, 13 |
| Nested attributes surface + RESTRICT legs | 7, 8, 20 |
| Composed POST record-types | 9 |
| PATCH verb alphabet platform-wide | 10 |
| 428 + If-Match / ETag primitives | 11 |
| Server value validation (net-new) | 12 |
| Stored shape = full state; GET one head read | 14, 15, 16, 17 |
| PUT genesis create-only 409 (decision 11) | 15 |
| Instance GET projection + ETag | 16 |
| PATCH If-Match dialect (decision 15) | 17 |
| DELETE tombstone-wins; spent address | 18 |
| Value-revision history (decision 17) | 19 |
| 12-step precedence ladder | 20 |
| Client adapters + nested wire flip | 21 |
| Minimal instances UI + TEST-PLAN | 22 |
| Flat wire retirement | 23 |
| Docs + measure + decision 13 reminder | 24 |
| Phase 2 WO coupling | (sketch only — G6) |
| `''` → 400; no silent coercion | 12, 15, 17 (G9) |

## Final-verification greps (G7)

After Task 23, before declaring the wave done:

```bash
# Leftover flat client paths (must be empty outside flows join
# and historical docs intentionally kept)
rg -n "['\\\"]records['\\\"]|['\\\"]record-attributes['\\\"]" \
    web-app/app/adapters web-app/records tests \
    --glob '!*flow-records*'

# Fold residue must be zero
rg -n "foldInstanceRevisions|DOCUMENT_METHODS.*PATCH" api tests

# Instance pattern must not sit on DOCUMENT_CLASS (R10)
rg -n "DOCUMENT_CLASS_ROUTE_PATTERNS" api \
    | rg -n "instances" || true
```

(Adjust globs if a pin file legitimately mentions the old
names in a "retired path returns 404" assertion — those pins
are expected and named.)

---

## Verification (end-to-end)

1. `./validate` — types, full suite, line lint, schema-svg.
2. `./test` — 300+ files green; new suites:
   dispatch-inversion, record-types read/write/composed-op/
   verb-gaps/restrict, nested-attributes, snapshot-retired-
   prefixes, patch-verb, if-match-primitives, instance-value-
   validation, attribute-acl, derive-record-instances,
   instances create/read/patch/delete/history/precedence,
   adapters-record-instances, presenter-record-instances.
3. Absolutes hold: 1494 seed pairs / 12 bootstrap;
   `EXPECTED_PAIR_COUNT` untouched end-to-end.
3b. G7 greps clean (flat client paths; no fold residue).
3c. Every instance miss surface answers through
   `missedReadError` (R2). PATCH success appends two pairs;
   GET is one head read (R5).
4. Browser pass: `TMPDIR=/tmp/claude ./serve 8080` →
   records page lists types; detail edits schema (admin) and
   drives instances (create/edit/delete; 412 recovery across
   two tabs); TEST-PLAN.md new cases.
5. Snapshot: export current state → import → clean; construct
   a legacy-prefix snapshot → client fast-fail + server 400.
6. `./measure --check` within budgets after the adapter flip.
7. Commit-before-build honored; every commit on master builds
   and passes `./validate` (rebase until true).

## Out of scope (spec-mirrored)

Phase 2 WO coupling (G6 sketch only — instance_id on
transitions, placement UNIQUE, transition validation, SoT
flip); ideas/projects/flows nested migration; flows If-Match
unification (post-ship reminder instead); custom-roles
alphabet widening (`MembershipType`, `MEMBERSHIP_TYPES`,
projection allowlist — three named sites); multi-type WOs;
root-addressed tenant documents; schema-level required flags;
`flows/:id/records` rename (accepted debt); instance UI
beyond Task 22's minimal surface; executing this plan's
Tasks 1–24 (own session); editing the parent plans, the
sibling grok-4.5-synthesis, or the modified spec in the same
commit as Task 0.
