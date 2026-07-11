# HANDOFF: Clients-Table Elimination — resume at writing-plans

Written 2026-07-11 to hand this work to a fresh session.
Prior session: brainstorm complete, spec committed. You are
picking up at the transition from design to implementation
planning.

## Session bootstrap (do these first, in order)

1. `Go to Church!` — invoke the church-of-code skill and read
   the FULL scroll (`CHURCH-OF-CODE.md`). The master session
   always goes Full; every dispatched subagent prompt MUST begin
   with `Go to Medium Church!` plus the codebase pushdowns
   (CLAUDE.md § Subagents: voice rules, commandments touched,
   abominations risked, patterns to match).
2. The prior session ran `/effort ultracode` (user-set, session
   only). Whether to set it again is the user's call — do not
   assume it.
3. Read the spec — the single source of truth for the design:
   `docs/superpowers/specs/`
   `2026-07-11-clients-table-elimination-design.md`
   (commit c7b2548a). Do not re-litigate decisions recorded
   there.

## Where the process stands

The superpowers:brainstorming skill ran to completion:

- Explore → clarify → approaches → design sections → APPROVED
  ("Approved — write the spec" at the design-review gate).
- Spec written, self-reviewed (two inline fixes: the
  rehome-parity test's disposition made explicit in two
  sections), committed c7b2548a.
- Spec user-review gate: PRESENTED but not yet explicitly
  answered — the user asked for this handoff instead. Confirm
  approval (or take a fresh "proceed" as approval), then:
- NEXT STEP: invoke superpowers:writing-plans to turn the spec
  into the implementation plan. After that, the skill flow
  continues per superpowers (executing-plans /
  subagent-driven-development, TDD during implementation,
  verification-before-completion before any "done" claim).

## User decisions already made (binding; do not re-ask)

1. Scope & tier: FULL registration phase now, demo tier —
   routes to register / rotate JWKS / disable, not a
   read-path-only table retirement.
2. Authz: admin realm, GLOBAL clients (no org ownership).
3. Shape: client = kind-`'service'` identity + a
   `identities/:id/registration` single-slot PUT-overwrite
   facet. Standalone /clients family and /authentication
   placement were considered and rejected (see spec Context).
4. Riders BOTH in scope: `act.sub` wiring on the
   authorization_code grant, and a registration UI on the
   identities detail page.

## What the elimination is (one paragraph)

Delete the last entity table: `TABLE_NAMES` 3→2 — `requests` +
`responses` only, the pure message plane. Client config becomes
a registration facet document derived from pairs;
`grantClientCredentials` re-points its single `rawReadRow` onto
the derive; `rawReadRow` then retires entirely;
`SNAPSHOT_SCHEMA_VERSION` bumps 4→5. Six commits, sequenced in
spec §9 (facet → cutover-read → act.sub → UI → table deletion →
docs), `./validate` green at every step.

## Recon already performed (do not redo)

Workflow wf_6ddc0bd5-d91 (5 agents, ~552k tokens) mapped every
touchpoint; the synthesis was spot-checked against source. Full
per-agent reports (rich file:line citations, especially the
identity-plane report) live on disk:

    ~/.claude/projects/-Users-tmornini-code-fusion-ai/
    5a77e5f2-be3a-4d08-8200-3e13c3a8daaf/subagents/workflows/
    wf_6ddc0bd5-d91/journal.jsonl

(One JSON line per agent result; the identity-plane agent id is
afb520c698ec4cb99.) Load-bearing facts, verified first-hand:

- `clients` has ZERO production writers — no route, adapter, or
  seed writes it; only 14 test files touch it; the mock-data
  fingerprint pins it at count 0. No data migration exists.
- ONE production read: `grantClientCredentials`,
  api/authentication.ts:825-826 (`rawReadRow`). Flow: status
  gate → grant_types gate → `verifyClientAssertion` (pure
  function, api/client-assertion.ts) → `nameFor` →
  `issueTokenPair`. Token `sub` is already the client id.
- Chicken-and-egg pre-solved: `/authentication/token` is
  bearer-exempt (api/api.ts:340-342) and already runs pair-plane
  derives pre-token (authorizePassword, nameFor →
  deriveIdentityPii, tokenRevocationReason,
  subjectOrganizations).
- kind-`'service'` identities SHIP today: `POST /identities
  {kind:'service', credential:{...}}` appends the identity
  document + a client_secret credential document atomically
  (api/routes.ts:3349-3413). `IdentityKind` is
  `'person' | 'service'` (api/types.ts:466).
- Facet template: `identities/:id/pii` and
  `identities/:id/credentials/:cid` (nested single-slot
  PUT-overwrite documents; DOCUMENT_CLASS_ROUTE_PATTERNS +
  PAIR_WIRED_ROUTE_PATTERNS, api/message-pair.ts:590-703;
  derives in api/derive-identity-spine.ts).
- Admin gating is FREE: api/authorization.ts is deny-by-default
  with `admin` on every verb at the root prefix (lines 158-166);
  a route with no member-tier entry is admin-only automatically.
- `AccessTokenClaims` already carries optional `act: {sub}`
  (api/access-token.ts:39-52); `grantTokenExchange` populates
  it; `grantAuthorizationCode` leaves it undefined
  (api/authentication.ts:1017-1059) — that is the act.sub gap
  being wired.
- UI seam exists: web-app/identities/detail.ts already branches
  on `identity.isService()` and loads a ServiceFacet +
  credential state; the registration card/dialog extends that
  page. Adapters in web-app/app/adapters/identities.ts.

## Repo state at handoff

- Branch: `remediation/audit-findings` (do not branch or merge;
  linear history, rebase-only discipline).
- Tree: clean; HEAD c7b2548a
  ("add clients-table elimination design spec").
- Gates: `./validate` (types + tests + 78-char lint +
  SCHEMA.svg drift). Sandbox serve:
  `TMPDIR=/tmp/claude ./serve 8080`.
- No worktrees (CLAUDE.md forbids them). Commit completed,
  tested work without asking; subject ≈50 chars, present-tense
  imperative, Co-Authored-By trailer per session rules.

## Traps the plan must respect (from recon, easy to miss)

- Seven "generic plumbing / backend pin" test files use
  `clients` as the only physical non-message-plane fixture
  table; spec §7 re-points them onto requests/responses with
  deterministic test-authored rows. They are NOT
  clients-specific coverage — do not delete them.
- mock-data-fingerprint.test.ts RETIRES (its EXPECTED map
  empties by design); mock-data pair-count pins (1506 /
  bootstrap 13) are UNAFFECTED — clients seeds nothing.
- The IndexedDB auto-commit constraint: any new facet write path
  must keep validators/crypto OUTSIDE the transaction body
  (CLAUDE.md § Gotchas).
- Honest status covenant: unauthenticated → 401 before any 404;
  facet gate is absent-identity 404 / kind-person 400 /
  non-admin 403. New tests must pin these.
- SNAPSHOT_SCHEMA_VERSION bumps ONCE (4→5) on the retirement
  commit (step 5), not per-step.
- api/derive-identity-spine.ts has a stale module-header comment
  ("NOTHING reads this module in production yet") — already
  false today; do not let it mislead the plan. Fixing it is fair
  game in the commit that touches the module.
- API.md §3.9 is stale TODAY (claims `clients.getById`; code is
  rawReadRow) — the docs pass fixes it as a side effect.

## Checklist state (brainstorming skill tasks)

1. Explore project context — DONE
2. Clarifying questions — DONE (four gates, answers above)
3. Propose approaches — DONE (shape (a) chosen)
4. Present design + approval — DONE
5. Spec written + committed + self-reviewed — DONE; user review
   gate pending → then superpowers:writing-plans

Next concrete action for the new session: confirm the user is
happy with the spec, then invoke superpowers:writing-plans with
the spec as input.
