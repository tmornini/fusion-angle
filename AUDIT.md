# AUDIT.md — The fusion-ai Audit Runbook

> *Measure, don't assert.* Every finding carries `file:line`
> evidence read THIS run, adversarially verified. — the Church
> of Code, On the Sin of Obscurity.

This is the reusable, numbered procedure for auditing this
repository across eight dimensions ordered by the scripture's own
priority — Reliability first, Performance last — so that **severity
falls out of doctrine, not opinion**. It audits for doctrine
(commandments *and* abominations), security, and the quality
dimensions that keep `master` consecrated.

A run is **report-only by default**: it changes no code and emits
one dated, severity-ranked `AUDIT-REPORT.md`. Remediation is a
separate, explicitly-invoked pass (§9).

---

## §0 — How to use this runbook

1. **Pick the baseline.** `AUDIT_BASE` is the ref the change
   surface is measured against. Default to the most recent
   `audit/*` git tag; if none exists, the user supplies an
   explicit ref or date. The first audit of a fresh tree may use
   the repository root commit. Do NOT assume `origin/master` —
   `master` is frequently fast-forwarded and may be 0 ahead.
2. **Honor the sandbox.** Prefix EVERY `build`/`test`/`serve`/
   `validate` invocation with `TMPDIR=/tmp/claude` — the tsx IPC
   socket and the temp build dir must land inside the
   sandbox-allowed path. Example: `TMPDIR=/tmp/claude ./validate`.
3. **Work in the main checkout.** No git worktrees (repo policy).
   A report-only run mutates nothing, so isolation buys nothing.
4. **Scale the run.** The full procedure (§4) fans out specialist
   agents; a quick single-operator pass walks §2 in order. Either
   way the §1 disciplines are binding.

---

## §1 — The Rule of Evidence (binding on every step)

The cardinal audit sin is the verdict delivered without reading
the code — *hearsay restated as fact*. These five rules close it.

1. **No finding without evidence.** Every claim carries the
   `file:line` AND a verbatim snippet read in THIS run, plus the
   specific commandment / abomination / spec it violates. A claim
   you cannot quote is a claim you have not verified.
2. **Anchor by symbol, never by stored line number.** Line numbers
   drift between runs (e.g. `BEARER_EXEMPT_ROUTES` has moved as the
   file grew). Re-derive every location with `grep`/symbol search
   each run; cite the line you just found, not one a prior report
   remembered.
3. **Measure, don't assert.** When two readings disagree, the
   disagreement becomes a number — a grep count, one `node --test`
   file, a re-rendered DOM. The number is the teaching.
4. **Split code-hits from doc-hits.** A deletion/rename claim
   (a removed symbol, a `worker → member` rename) reports the
   code-hit count AND the doc-hit count as SEPARATE numbers. A
   symbol gone from code but alive in four docs is a real
   documentation finding, not a phantom — and not a code finding.
5. **Make the run reproducible.** The report header records: the
   `HEAD` SHA, `AUDIT_BASE`, the raw `./validate` result, the
   build dir, and the run date in RFC-3339 Z. A finding nobody can
   reproduce is a rumor with a citation.

---

## §2 — The eight dimensions (severity = scripture order)

Each dimension specifies **METHOD · CRITERIA · EVIDENCE ·
CHANGE-SURFACE**. The numbering is the severity spine: a defect in
D1 outranks a defect in D8 because Reliability outranks design
polish in the Twelve Commandments.

### D1 — Reliability & data integrity (Commandment I)

- **Method.** `./validate` green is the precondition for every
  other dimension (a red gate is the headline finding; see §4
  Phase 0). Then read the storage seam for the invariants below.
- **Criteria.**
    1. Real `IDBTransaction` atomicity: a `transaction(…)` body
       commits on `oncomplete`, aborts on a thrown body.
    2. The **auto-commit constraint** — a transaction body awaits
       ONLY row ops. Any awaited non-IDB promise (timer, crypto,
       gzip, fetch) yields a macrotask and commits the tx early.
       Validators, HMAC, and compression run OUTSIDE the tx.
    3. Append-only `states` ledger: `record` only appends; an
       entity's lifecycle is the latest event on its `entity_id`;
       reversal is a NEW event, never an edit of a prior row.
    4. Idempotency (Commandment VII): PUT overwrites, DELETE
       removes — repeating either has no further consequence.
    5. Snapshot import is one atomic `clear`+`put` over
       `TABLE_NAMES`; quota pre-flight rejects oversized imports
       BEFORE the transaction.
    6. Cross-tab write safety: a committed readwrite posts touched
       table names over `BroadcastChannel`; the poster is NOT
       echoed (no double-refresh).
- **Evidence.** The catching test per invariant; the tx-body read
  proving only row ops are awaited; the `BroadcastChannel` post +
  the self-skip guard.
- **Change-surface.** `api/db.ts`, `api/backend-indexeddb.ts`,
  `api/store-state.ts`, `api/store-entity.ts`,
  `web-app/app/adapters/snapshots.ts`,
  `web-app/app/adapters/broadcast-channel.ts`.

### D2 — Security (Commandment II)

- **Method.** Trace the spine end to end, asserting each property
  by reading source AND its dedicated test: grant → token
  mint/verify → Bearer gate → per-org authz → org fence. Classify
  every concern KNOWN vs NEW (§7). Threat model: the browser is
  UNTRUSTED; the audit reasons about the server-tier split even
  while the demo ships client-only.
- **Criteria.**
    1. Org scope comes from the VERIFIED token claim, never the
       path.
    2. Real HMAC-SHA256 verify — a tampered body fails the
       signature; `aud`/`nbf`/`exp` enforced.
    3. Revocation is complete: identity-wide `iat < revokedBefore`
       AND the per-`jti` chain, enforced at the gate, on refresh,
       and on exchange; refresh-reuse revokes the chain.
    4. Cross-org authz fence: a grant in org A is invisible in B.
    5. Org WRITE fence: a foreign/absent id returns **404, not
       403** — no existence disclosure.
    6. Token-exchange runs the membership check (non-member → 403).
    7. Real OAuth ceremony: authorize → code → token completes
       (capture it in the network panel), and revocation is
       honored on the exchange path — not merely "login reached
       the dashboard".
    8. XSS: `web-app/app/safe-html.ts` is the ONLY `innerHTML`
       write; audit every `trusted()` call site individually.
    9. PBKDF2 params adequate; no user enumeration (uniform 401);
       no secrets in source beyond the declared seam; deny-by-
       default everywhere (`isPermitted` false on no match).
- **Evidence.** The annotated grant→fence trace (`file:line` per
  hop + the asserting test); the two KNOWN/NEW lists; the
  `innerHTML`/`trusted()` audit; the secrets-scan output.
- **Change-surface.** `api/access-token.ts`, `api/authentication.ts`,
  `api/authorization.ts`, `api/api.ts` (gate + facade +
  `BEARER_EXEMPT_ROUTES`), `api/store-org-scoped.ts`,
  `api/db-org-scoped.ts`, `api/password-hash.ts`,
  `api/snapshot-validator.ts`, `web-app/app/safe-html.ts`.

### D3 — Commandments adherence (III–XII + Articles + Offices)

- **Method.** Read-only review of the change surface against the
  Twelve Commandments, the Articles of Faith, and the Daily
  Offices. **Credit exemplars** — the scripture leads with the
  righteous — and cite violations, `file:line` per Article.
- **Criteria / exemplars to confirm.** Append-only ledgers with
  pure-reduction derivation (Immutability VI, derive-from-ledger);
  the org fence as a thin adapter divorce-point; `RequestContext`
  resolved once and threaded as the single vessel; SafeHtml
  discipline; deny-by-default; HTTP-verb adapter naming
  (`getNoun`/`putNoun`/`deleteNoun`/`postNounOperation`); join
  tables for relationships (a join holds only the joined identities
  and the moment of union); validate-at-every-edge; RFC-3339 Z
  timestamps; enrich-errors-at-each-boundary.
- **Evidence.** An exemplars ledger (Article → `file:line`); each
  partial violation with its commandment + severity.
- **Change-surface.** The auth/tenancy/snapshot modules,
  `safe-html.ts`, and the adapters/presenters touched since
  `AUDIT_BASE`.

### D4 — Abominations avoided (Book of Abominations)

- **Method.** Per-sin grep + read, concentrated on changed code.
  Each hit is classified **sin** or **allowed-with-reason** with
  `file:line`. Distinguish self-disclosing literals (allowed) from
  opaque magic values (sin).
- **Criteria (PASS = absent or justified).** null/sentinel
  (model absence at the call site, not in a helper); default
  values (a body-parse coercion at an edge is validation, not a
  silent default); internal defense (no redundant checks inside
  validated walls); **swallowed catch** (no empty/log-and-continue
  catch); **greedy catch** — one `try`, one call, one named error;
  CREDIT the `snapshot-validator` single-call catch as the
  documented compliant exception (each line handles one distinct
  error path); shared-mutable / global state; magic values (credit
  named PBKDF2 / TTL / audience constants); foreign tongues (no
  storage primitive or framework noun leaking into the domain;
  zero stray `worker`); entangled nouns (relationships live in join
  tables, not welded FKs; `organization_id` is a tenant stamp, not
  entanglement); premature optimization / cache / generalization
  (the authoritative source is re-derived from the ledger, not
  cached).
- **Evidence.** A sin ledger (sin → grep → hits → verdict),
  INCLUDING explicit "no hits" rows that prove each hunt ran. An
  absent ledger row is an un-run hunt, not a pass.
- **Change-surface.** As D3, plus any deleted modules (prove the
  prior global is gone with an absence grep).

### D5 — Documentation fidelity, coverage & single source

Three faults, not one: docs that LIE about the code (fidelity),
docs that REPEAT each other (duplication), and surfaces NO doc
describes (coverage). The scripture binds all three — "one
codebase, one voice" (Generality IX), and a fact restated in two
docs is a cache that drifts (the Sin of the Cache).

- **Method.** Doc↔code drift greps; `./generate-schema-svg
  --check`; a dangling-reference sweep (removed dirs, deleted
  symbols, renamed vocabulary); a contract-comment audit (Office
  of Commentary — at a contract boundary the comment IS the
  contract); confirm CLAUDE.md's test pointers resolve; a
  **duplication sweep** (the same fact, number, list, or
  definition stated in two docs); a **coverage map** (every major
  subsystem → the one doc that owns it).
- **Criteria — fidelity.** `SCHEMA.svg` matches the schema of
  record (`api/db.ts` + `api/types.ts`); SCHEMA.md's table list
  matches `TABLE_NAMES` exactly; no doc references a removed
  directory or deleted file; contract comments match behavior
  (the access-token seam note, the store-org-scoped 404-not-403
  note, the snapshot gotchas); a symbol deleted from code but
  surviving in prose is a FAIL until removed or marked historical.
- **Criteria — no duplication.** Each fact has ONE authoritative
  home; other docs LINK to it, they do not restate it (this repo
  already practices it: "CLAUDE.md does not duplicate them",
  pointing at `TEST-PLAN.md § Protocol`). A fact copied into a
  second doc is a finding — two sources of truth that drift apart,
  the Sin of the Cache. The remedy is a link, not a second copy.
- **Criteria — complete coverage.** Every major surface has a
  documenting home: the `api/` auth/tenancy spine, adapters,
  presenters, the page registry, the flow canvas, the schema, the
  design system, the test protocol. A significant undocumented
  surface is a COVERAGE GAP (a first-class finding); a doc with no
  live surface behind it is stale and must be retired or marked
  historical.
- **Evidence.** The `generate-schema-svg --check` exit + output;
  each drift grep with `file:line` hits; a doc-claim → source →
  match/mismatch table; a duplication ledger (fact → the docs it
  appears in → its canonical home); a coverage map (surface → doc
  → covered/GAP).
- **Change-surface.** Every repo-root `.md`, `SCHEMA.svg`, and any
  removed doc directory, cross-checked against `db.ts`,
  `types.ts`, the auth/snapshot modules, and the architecture
  surface each doc claims to cover.

### D6 — CLI test confidence

- **Method.** Run `./validate`; build a coverage gap map (source
  module → its test by name-stem, crediting transitive coverage
  via `api/db-memory.ts`); audit behavior-vs-implementation per
  the Office of Verification; run **mutation-style probing** — the
  gold standard for "high confidence".
- **Criteria.** `./validate` exits 0; every new auth/tenancy
  module has a behavior test; cross-org isolation is tested;
  revocation is honored on exchange/refresh; NO assertion-free or
  tautological tests; NO flaky tests (a test that fails
  intermittently is a false prophet — worse than none). Mutation
  probes resolve to a NAMED catching test: break the org filter →
  caught by the authz test; flip `aud` → caught by the
  access-token test; collapse 403-vs-404 → caught by the
  store-org-scoped test. A probe with no catcher is an UNCAUGHT
  finding.
- **Evidence.** The full `./validate` output; the coverage gap
  table (LIVE / transitive / NONE); per-probe source line +
  catching test name (or UNCAUGHT); two consecutive identical
  `./test` runs (determinism).
- **Change-surface.** The `tests/*` files and the source modules
  they cover.

### D7 — Browser functional correctness

- **Method.** Serve at `:8080`; drive via the claude-in-chrome
  MCP; run the FULL TEST-PLAN.md 6-phase protocol, prioritizing the
  change surface. Requires a GREEN `./validate` and a live server
  (§4 Phase 3).
- **Criteria.** Landing loads 200 with zero console errors; login
  reaches the dashboard via the real OAuth ceremony; each new /
  renamed page renders and survives a hard refresh; the
  org-switcher re-scopes data on reload with no cross-org bleed;
  snapshot export → wipe → import round-trips identically; no
  request 500s (expected 401/403/404 are honest states).
- **Evidence.** Per-page screenshot; network JSON for login + one
  org-switch; per-page console dump; executed TEST-PLAN case IDs
  with verdicts.
- **Change-surface.** The page directories, `org-switcher.ts`, the
  auth/snapshot page modules, `page-registry.ts`, the
  `component-*.html` files, the markup-emitting presenters.

### D8 — Browser design consistency & accessibility

- **Method.** Static CSS/HTML grep audit + a runtime audit at
  sm640 / md768 / lg1024 / xl1280 in BOTH light and dark, on every
  new / renamed page; accessibility per the Office of the
  Interface.
- **Criteria.** Zero raw hex outside token CSS; all colors
  `hsl(var(--token))`; zero inline `style="` except the sanctioned
  dynamic CSS-custom-prop and bootstrap-fallback cases; variants
  use `[data-tone]` / `[data-level]`; light/dark parity; clean
  reflow at all four breakpoints; ARIA / keyboard operability;
  WCAG AA contrast (accessibility is the precondition of an
  interface, not late polish).
- **Evidence.** The grep outputs; a screenshot matrix {pages ×
  themes × breakpoints}; computed-contrast readings; a tab-order
  recording for the new interactive surfaces.
- **Change-surface.** `web-app/app/styles/*.css`, the
  `component-*.html` files, the markup-emitting presenters,
  DESIGN-SYSTEM.md as the contract.

---

## §3 — Cross-cutting threads

Some surfaces span dimensions and must be audited as one thread,
not scattered across D1–D8.

- **Snapshots (primary, elevated).** The four `BEARER_EXEMPT`
  routes expose a whole-DB, all-orgs, no-auth, org-fence-bypassing
  export/import/wipe surface, returning in-band `SeededCredentials`
  — spanning crypto, validation, atomicity, and quota at once.
  Audit it across D1 (atomic clear+put, quota pre-flight), D2 (the
  public plane as a KNOWN compromise), D5 (the documented
  gotchas), D6 (import-validation tests), and D7 (the round-trip).
- **The auth spine (SP-1…SP-6).** Identity/PII split, the token
  gate, OAuth grants, authorization, tenancy, and the identity
  surface form one trust chain; a finding in one link is a finding
  about the chain.
- **Cross-tab coordination.** The `StorageEvent` (theme/sidebar)
  and `BroadcastChannel` (table touches) seams are reliability
  surfaces that regress quietly; verify the poster-not-echoed
  guard and the tolerance patterns hold.

---

## §4 — The orchestration engine (the prescribed procedure)

Run the audit as a sequence of ultracode workflows — one per
phase, so the orchestrator stays in the loop between phases. Every
subagent prompt MUST begin with the literal `Go to Church!` and
carry the voice rules (78-char / 4-space / SafeHtml /
`RequestContext`-sole-arg / HTTP-verb adapters / snake_case storage
↔ camelCase domain / validators-at-the-gate) plus the commandments
and sins its dimension touches.

`./validate` is a **barrier** between the static and dynamic
halves: the served bundle is built from the same source, so a red
gate makes the browser run meaningless.

- **Phase 0 — Foundation & gate (serial).** Capture the change
  surface: `git diff --name-status $AUDIT_BASE..HEAD` and
  `git log --oneline $AUDIT_BASE..HEAD`. Run `./validate` once.
  GREEN → proceed (it also yields the authoritative CLI test count
  for D6, proves no SCHEMA.svg drift for D5, and confirms 78-char
  compliance). RED → that IS the top finding; static dimensions
  still run against source, all dynamic dimensions are BLOCKED.
  Then build + serve from current source:
  `TMPDIR=/tmp/claude ./build --no-zip <dir>/` then
  `python3 -m http.server 8080`.
- **Phase 1 — Static fan-out (parallel).** Read-only specialist
  finders over disjoint concerns, one per dimension / sub-lens,
  deliberately overlapping on the same files (redundancy
  strengthens the coverage matrix). Each emits claim + `file:line`
  + verbatim snippet + the violated rule.
- **Phase 2 — Static adversarial verify (parallel).** Fresh
  refuter agents (new context, `Go to Church!`) try to DISPROVE
  each Phase-1 finding: re-read the lines, hunt an upstream guard,
  a gate validator, a deleted symbol, a correct doc; prefer a
  runnable check over prose. Quorum: CONFIRMED lands; REFUTED is
  dropped but logged; DISPUTED goes to a third tie-break agent who
  must produce a measurement, not an opinion. A NEW S0/S1 security
  item requires 2-of-2 confirmation.
- **Phase 3 — Browser validation.** The TEST-PLAN.md 6-phase
  protocol, nested verbatim; drives D7, D8, and the runtime half
  of D2. Requires GREEN validate + live server.
- **Phase 4 — Browser adversarial verify (parallel).** Each
  FAIL/DRIFT is independently re-driven before it lands.
  Environmentally BLOCKED cases are not re-verified.
- **Phase 5 — Consolidation (serial).** Merge CONFIRMED findings,
  build the coverage matrix (§5), write `AUDIT-REPORT.md` ONCE.
  Report-only ⇒ no agent mutates the repo ⇒ no write races.

Run the static half (1–2) to completion before the dynamic half
(3–4): static is cheaper, front-loads the highest-signal findings,
and one Chrome cannot host the static and browser fleets at once.

---

## §5 — The coverage matrix

Mechanical proof of completeness, built from git — not from agent
self-report.

1. **Spine.** One row per `git diff --name-status
   $AUDIT_BASE..HEAD` entry (an `R` row records the old → new path
   of a rename).
2. **Auto-map by file class.** `tests/*` → D6; `*.md` +
   `SCHEMA.svg` → D5; `api/*` + `web-app/app/**/*.ts` → D1/D2/D3/D4;
   `web-app/**/*.html` + `styles/*.css` + page dirs → D7/D8.
3. **Evidence binding.** Every agent emits the `file:line` it
   touched — per finding AND per examined-clean file. Phase 5
   joins those back onto the spine.
4. **Gaps are first-class.** A spine row with zero touches is a
   COVERAGE GAP, reported as its own item, not silently dropped. A
   deletion is "absence verified" when a grep proves the symbol is
   gone. Report `covered/total`.

---

## §6 — Severity model

Anchored to scripture priority: I Reliability > II Security > …
> XII Performance.

- **S0 — critical.** Data loss, auth bypass, or a live NEW
  security hole.
- **S1 — high.** Broken behavior, a Logic fallacy (the wrong
  operator, not an off-by-one), or a swallowed exception in a
  critical path.
- **S2 — medium.** Doc/code drift, an implementation-coupled test,
  a design inconsistency.
- **S3 — low.** Format, naming, or magic-value polish.

Each finding renders as one line:
`[S] [DIM] title — file:line — snippet — violated rule —
verify status`.

---

## §7 — Security: KNOWN vs NEW

Report ALL concerns, but classify each. A KNOWN compromise is
keyed to an in-code seam flag; the run RE-CONFIRMS the flag still
exists and the compromise has not widened. The four standing
KNOWN, in-development compromises:

1. **Client-shipped HMAC key** (`SIGNING_KEY_MATERIAL` in
   `api/access-token.ts`, with its deploy-constraint flag) →
   demo-grade isolation until the server tier.
2. **Snapshot public plane** — whole-DB export/import/wipe with no
   auth and no org fence (`BEARER_EXEMPT_ROUTES` in `api/api.ts`),
   `SeededCredentials` returned in-band → safe only client-side.
3. **Cross-tab states-log write race** (documented in CLAUDE.md) →
   real atomicity awaits the server tier.
4. **Snapshot wipe-on-fail** without rollback on the simulated
   tier (documented in CLAUDE.md) → IndexedDB already closes this;
   the localStorage simulation is the residual gap.

Anything security-relevant LACKING a seam flag is NEW (report it
separately). Moving a finding KNOWN → NEW requires showing the
in-code seam flag is absent or changed.

---

## §8 — The deliverable report

One file at the repo root, written once: `AUDIT-REPORT.md`
(historically `VALIDATION-REPORT.md`). Sections:

- **§0 Executive summary.** Verdict; `./validate` GREEN/RED; CLI +
  browser counts; finding tally by severity × dimension; coverage
  `covered/total` files + gaps; KNOWN re-confirmed n/4; the top
  NEW findings. Lead with the truth — a disciplined codebase
  earns "refinements, not an indictment"; a broken gate earns the
  headline.
- **§1–8 One section per dimension.** D2 splits into
  **KNOWN/accepted** vs **NEW**.
- **Coverage matrix.** Per-file + the file-class rollup + gaps.
- **Adversarial-verification ledger.** CONFIRMED / REFUTED /
  DISPUTED, so refuted claims stay auditable.
- **Appendices.** Raw `./validate` output; the TEST-PLAN
  per-section summary; the environmental-BLOCKED catalog (MCP
  limits are BLOCKED, never FAIL).

---

## §9 — Remediation pass (appendix, separately invoked)

Report-only is the default. Remediation is a distinct, opt-in pass
the user requests after reading the report.

1. One commit per finding, ordered safest-first: doc-only changes
   before code changes.
2. `TMPDIR=/tmp/claude ./validate` MUST be GREEN before each
   commit.
3. Present-tense imperative commit subjects (~50 chars), ending
   with the `Co-Authored-By:` trailer. Never move/rename and change
   content in the same commit.
4. Surface every adjudication-needed finding as a single
   AskUserQuestion before touching code.
5. Re-run the relevant dimension after remediation to confirm the
   finding is closed and nothing regressed.

---

## §10 — Risks to the audit itself + mitigations

- **Bundle drift.** Always rebuild from current source in Phase 0;
  record the build dir + source SHA in the report header.
- **Cross-tab race during parallel browser agents.** It is a KNOWN
  compromise, not a bug to discover: use TEST-PLAN's disjoint
  mutation domains and `≥ N`-tolerant re-reads; a count mismatch
  from this race is BLOCKED, never FAIL.
- **Browser MCP flakiness / gesture pointer-capture.** Recover
  tabs via `tabs_context_mcp`; use the documented JSON-injection
  workaround for flow-designer gestures (PASS-via-injection, not
  BLOCKED); prefer keyboard events.
- **Non-emulable environment** (`resize_window`, reduced-motion).
  Verify by source inspection; BLOCKED only when neither driving
  nor source yields a verdict.
- **False positives.** The Phase 2/4 refuter quorum and the
  code-vs-doc grep split exist precisely to catch them. A fast
  verdict is the failure mode this whole runbook is built against.

---

## §11 — Critical anchor files (re-derive by symbol)

Find each by its SYMBOL, then cite the line you found this run —
never a line number copied from this table.

| File | Symbol to grep | Audits |
| --- | --- | --- |
| `api/access-token.ts` | `SIGNING_KEY_MATERIAL` | D2, §7 |
| `api/api.ts` | `BEARER_EXEMPT_ROUTES` | D2, §3 |
| `api/authorization.ts` | `isPermitted` | D2 |
| `api/store-org-scoped.ts` | the 404-not-403 fence | D2 |
| `api/db-org-scoped.ts` | `orgScopedAdapter` | D2 |
| `api/snapshot-validator.ts` | `parseAndValidateSnapshot` | D1, D2 |
| `web-app/app/safe-html.ts` | `innerHTML`, `trusted` | D2 |
| `api/db.ts` | `TABLE_NAMES` | D1, D5 |
| `validate` | `generate-schema-svg` | D5, D6 |

The doc set — CLAUDE.md, ARCHITECTURE.md, SCHEMA.md,
DESIGN-SYSTEM.md, TEST-PLAN.md, FLOW-CANVAS.md, README.md — are
contracts of record; D5 holds them to the source.
