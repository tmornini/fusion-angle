# TEST-PLAN Parallel DAG — Design

Date: 2026-08-19
Status: draft (brainstorm 2026-08-19; re-anchored
to TEST-PLAN.md 2026-08-19)
Spec-only. No implementation in this document.

## Goal

Make `TEST-PLAN.md` a section-level dependency graph
so a parallel run is correct on one Postgres and
wall-clock is the longest section, not the sum of
setup plus exclusive tails.

Correctness first, wall-clock second. The master
session is the scheduler: it gates, seeds, dispatches,
joins, and writes mitigation specs. It does not drive
the product UI after preflight and does not patch
FAILs in the same run.

## Context

Re-anchored to `TEST-PLAN.md` on 2026-08-19 after
`6db373f9` (C2 / SV3 product align) plus a case
census. Decisions below do not change. Counts,
today's agent map, seed fixtures, and the document
rewrite target do.

`TEST-PLAN.md` already requires sub-agents. Default
execution is one `server.mjs`, one Postgres, many
Chrome `isolatedContext` jars. Isolation today is
URI-family ownership (seven Phase 2 agents) plus
tribal exclusive tails: Phase 1 AA rebuild, sign-out
last, I alone, K8 last. Assertions use `≥ N` because
siblings append to the same tenant.

There is no case DAG. `DEFERRED` means “dependency
BLOCKED,” not a declared edge. There is no
mitigation-spec pipeline after FAIL.

The six-phase subsection is already marked SUPERSEDED
as the operational recipe and kept as an agent map.
That map is still what dispatchers follow.

### TEST-PLAN.md as of this re-anchor

`## Summary` still prints **393**. Counted cases
(checkbox `- [ ] **ID**`, including wrapped titles,
plus K `**Kn.**` headings):

| Section | table | counted |
|---|--:|--:|
| AT | 3 | 3 |
| A | 5 | 5 |
| AA | 46 | 46 |
| B | 29 | 31 |
| C | 7 | 7 |
| D | 38 | 38 |
| E | 12 | 12 |
| F | 77 | 77 |
| F2 | 31 | 31 |
| FS | 9 | 9 |
| G | 38 | 38 |
| H | 2 | 2 |
| I | 29 | 29 |
| J | 3 | 3 |
| K | 30 | 30 |
| R | 25 | 25 |
| SV | 9 | 10 |
| **Total** | **393** | **396** |

Table drift: B0 and B0b (apex hops); SV8b
(BroadcastChannel two windows). First-cut rewrite
fixes the table. This spec uses **396**.

Nested letter prefixes that are **not** `##`
sections — they ride the parent hunter:

- V1–V9 live inside G (invitations)
- WB* and AA-WB-SETUP live inside F2
- K is a `##` section, but today's dispatch splits
  it across Agent-G (K1–K6), Agent-E (K7, K9–K26,
  K30), Agent-CH (K27–K29), and Phase 4 (K8)
- K7 currently waits up to 10 minutes on Agent-G's
  K3 rename. One K hunter kills that wait: K7 stays
  last in K's body, after K30; K8 is skipped

Today's written Phase 2 bundles (cases the agent
actually runs, not the `##` table alone):

| Agent | Sections | cases |
|---|---|--:|
| Phase-1 | AA3–AA42 + subs | 46 |
| Agent-B | B0, B0b, B1–B29 (sign-out last) | 31 |
| Agent-CH | C + H + K27–K29 | 12 |
| Agent-D | D | 38 |
| Agent-E | E + K7, K9–K26, K30 | 32 |
| Agent-F | F | 77 |
| Agent-F2 | F2 + FS + R | 65 |
| Agent-G | G (incl. V1–V9) + K1–K6 | 44 |
| Phase-3 | I | 29 |
| Phase-4 | K8 | 1 |
| Server | SV2–SV4, SV6–SV10 (A3=SV1) | 9 |

`## Summary Format`'s agent table is behind: Agent-B
omits B0/B0b; Agent-G omits V and G47; Server still
says 8.

Product pins hunters inherit (not DAG shape, but
case text asserts them):

- C2: 12 sidebar links, order Dashboard → …
  Identities, Billing, **API**, Design System
- SV3: `refresh_token` is `Secure` always, including
  `http://localhost` and `http://127.0.0.1`
- A2: 18 page directories, 29 HTML files, including
  `api-documentation/` and `invitations/`

Cases that need more than one org or identity
**inside one hunter's slice** (not a second hunter):

- G36 and V1–V9: two orgs, multi-org admin, a second
  identity not seated in the primary org
- SV6–SV10: two identities in one org; SV8/SV8b/SV9
  share one jar; SV6/SV7/SV10 use two jars
- B25–B29: a login-capable seat the hunter unseats
  via pair fixture (zero-membership gate)
- R1's “foreign record type hidden” is automatic
  with one org (nothing foreign in the list)

## Non-goals

- Splitting fat sections (F) into workflow clusters
- One tenant per case
- A machine-readable graph beside TEST-PLAN.md
- A graph-validator or seed-helper script in the
  first cut
- An external workflow engine as orchestrator
- Auto-rerun or auto-patch of FAILs
- Rewriting all 396 case bodies in the first cut
- Promoting V (nested in G) to its own `##` section

## User decisions

1. Isolation: per-tenant slices on one Postgres.
2. Provisioning: seed-time materialization.
3. Job size: one tenant per `##` section; cases in
   document order inside the section.
4. AA is a parallel section, not shared setup.
5. Global lock: operator-process mutations only
   (K8, J). Sign-out, org-switch, theme, sidebar,
   command palette, SV two-jar stay inside the
   hunter’s tenant and jar.
6. Master close-out: join + canonical summary + one
   mitigation spec per FAIL cluster.
7. Graph home: section headers in TEST-PLAN.md.
8. Machinery: scripture + seed + master-as-scheduler.
   No new runner process.

“One tenant per section” means one **disjoint
slice**, not always one organization. G's slice
contains two orgs because G's cases require that.
Slices still do not share org id, identity, or
cookie jar with siblings.

## Architecture

One Postgres, one `server.mjs`, N disjoint
slices created at seed. Each `parallel: yes`
section is a job: one hunter, one slice, one Chrome
`isolatedContext`, cases in document order. Jobs do
not share org id, identity, or cookie jar. Assertions
inside a job are exact.

DAG edges only:

- `AT` → `A` (validate, build, one origin, seed)
- `A` → all `parallel: yes` sections
- those → `global_lock: process` (K8, then J)

No Phase-1 UI rebuild. Mutation-domain tables and the
six-phase appendix become historical notes, not
scheduler law. K's split across G/E/CH/Phase 4
collapses to the K hunter (except K8).

Serial `--serial`: one tenant (today’s mock org),
document order, unchanged case text.

## Components

### Section header (the graph)

Every `##` section carries four fields:

- `tenant:` `required` | `none`
- `parallel:` `yes` | `no`
- `global_lock:` `none` | `process`
- `depends:` section ids (`AT`, `A`, or the join)

Case lists stay as they are. Nested prefixes stay
inside the parent `##` (V in G, WB in F2). No
sibling JSON graph.

First-cut map (serial document order unchanged).
Counted cases; K hunter skips K8 (29 of 30); SV
hunter skips SV1 because A3 is SV1 (9 of 10):

| Section | cases | tenant | parallel | lock | depends |
|---|--:|---|---|---|---|
| AT | 3 | none | no | none | — |
| A | 5 | none | no | none | AT |
| AA | 46 | required | yes | none | A |
| B | 31 | required | yes | none | A |
| C | 7 | required | yes | none | A |
| D | 38 | required | yes | none | A |
| E | 12 | required | yes | none | A |
| F | 77 | required | yes | none | A |
| F2 | 31 | required | yes | none | A |
| FS | 9 | required | yes | none | A |
| G | 38 | required | yes | none | A |
| H | 2 | required | yes | none | A |
| I | 29 | required | yes | none | A |
| K | 29 | required | yes | none | A |
| R | 25 | required | yes | none | A |
| SV | 9 | required | yes | none | A |
| J | 3 | none | no | process | all parallel |

Fourteen parallel hunters. K8 is not a case inside
the K hunter on the parallel path. K’s product
cases run in document order in the K tenant: K1–K6,
K9–K30, K7 last. After join, the master runs K8
alone (process lock, wipe/reseed of the shared DB),
then J. Serial mode still runs K8 in document order
inside K.

### Seed

Parallel A3 materializes one disjoint slice per
`parallel: yes` section. N equals that section
count (14). Stderr prints a credential map:
section id → `{orgId, username, password}` (and
the extra ids a slice needs). Hunters do not
create tenants.

Default slice: one org + admin + the minimum
fixtures that section's cases read. Section
exceptions, still inside that slice:

- **AA:** bootstrap-only (org + admin). The cases
  ARE the garden; do not pre-load mock data.
- **G:** two orgs, multi-org admin, plus a second
  identity not seated in the primary org (G36, V).
- **SV:** two identities in one org.
- **B:** admin plus a login-capable seat the hunter
  may unseat for B25–B29.
- **F2:** org + admin; AA-WB-SETUP still creates
  `WB Test Flow` in this slice, not in F's.

If a section cannot run from that minimum, A3 FAILs.
Hunters must not invent Phase-1 UI setup.

Serial A3 stays today’s `--seed-mock-data` reveal
(SV1). That mock still spans two orgs (Stark /
Wayne); serial case text keeps those names.

### Hunter

One spawn per parallel section. Prompt: Medium
Church, CLAUDE.md, that `##` section's body only
(including nested prefixes), tenant credentials,
origin URL, `isolatedContext` name = section id.
Sign in as that admin. Return per-case PASS /
FAIL / BLOCKED / DEFERRED / DRIFT. Do not read
other sections. Do not re-seed.

Tab-scoped MCP tools only (navigate, find,
evaluate, snapshot, form fill). Coordinate clicks
and screenshots are display-global and collide
across concurrent hunters — already TEST-PLAN law.

### Master

`./validate`, build, start seeded server, grant
Chrome origin (`http://localhost`) **before**
dispatch, spawn, join in document order, write
mitigation files, print `## Summary Format` plus
those paths. Then K8, then J. Master does not patch.

## Data flow

Serial (`--serial`): empty DB → `--seed-mock-data` →
one jar → document order including K8 in K → J.
Headers are not consulted.

Parallel (default):

```
AT (fail-fast)
  → A1 build + A2 unzip + grant Chrome origin
  → A3 seed N slices
  → fan-out hunters
  → join
  → K8 (process lock)
  → J
  → summary + mitigation files
```

BroadcastChannel / `fusion-angle:data` still fires.
Siblings are other slices, so a refresh in D does
not change E’s roster. C and FS assert against
their slice only.

SV6–SV10: both jars belong to the SV hunter’s
slice (two identities in that org). Auth throttle
stays inside that hunter.

B sign-out last **inside B**. B’s identity is
private; logout-everywhere cannot evict another
hunter.

I owns theme/sidebar localStorage in its own
`isolatedContext`. No exclusive Phase 3.

G org-switch (G36) and invitation accept (V4)
stay inside G's two-org slice. They do not race
another hunter's `fusion-angle:active-organization-id`.

## Failure

| Event | Action |
|---|---|
| AT red | Abort. No seed, no hunters. |
| A3 seed fail | Abort. No hunters. |
| Hunter crash | That section FAIL (MCP BLOCKED as today). Siblings finish. |
| Hunter FAIL cases | Join continues. Then one mitigation spec per cluster. |
| K8 fail | Record FAIL; still attempt J; still write earlier mitigations. |
| J1 sandbox EPERM | Unchanged: J1 BLOCKED, J2 DEFERRED. |

Master never re-dispatches a hunter to retry.

BLOCKED remains reserved for known MCP limits
(pointer-capture, `resize_window`, file I/O, sandbox
EPERM). It is never a mask for a real failure.

## Document rewrite

Keep: encoding note, Scope, Known MCP limitations,
case lists.

Replace:

- **How to invoke** and **Sub-agent invocation
  contract** — sliced `##` sections, not seven
  Phase 2 agents plus Phase 1/3/4
- **Protocol** and **Execution Order** — DAG
  recipe: parse headers; AT → A → fan-out → K8 → J
- **`## Summary` counts** — 396; B 31; SV 10
- **`## Summary Format` agent table** — one row
  per hunter section, not Phase-1 / Agent-* /
  Phase-3 / Phase-4
- `--serial` remains document order on one mock
  tenant

Move to a short Historical note (not an agent map):

- Six-phase parallel protocol
- Entity mutation domain table
- `≥ N` as the default assertion style
- Phase 1 UI rebuild from `--seed-bootstrap`
- Sign-out / I exclusive after join
- K split across G / E / CH / Phase 4, and K7's
  cross-agent wait on K3

Keep as facts, not as the scheduler: cookie jar =
`isolatedContext`; operator seed wipes the whole DB
(why K8 is process-locked); the MCP limitation list
(gestures, `resize_window`, file I/O, sandbox EPERM,
tab-group volatility, CSP-blocked `await`, list
paint 5–14s, first-click-focus).

Case text: first cut does not retarget 396 bodies.
“Sign in as demo@…” means “sign in as this hunter’s
admin.” Stark / Wayne names in a case mean that
hunter’s seeded org names from the credential map.
A later pass may retarget proper nouns.

## Mitigation files

After join, one markdown file per FAIL cluster under
`docs/superpowers/test-plan-mitigations/`. Product
design specs stay in `docs/superpowers/specs/`.

Each file: section, cases, expected, observed,
suspected layer (UI / adapter / API / seed / MCP).
Master lists paths in the summary. Implementing those
specs is a later session.

## Verification (no new runner)

- A hunter prompt contains only its `##` body
  (G includes V1–V9; F2 includes WB* and
  AA-WB-SETUP; K omits K8).
- Two concurrent hunters may create an idea with the
  same title; each list shows one.
- A D assertion that used `≥ N` can use `= N` inside
  its tenant; leftover `≥` is doc debt, not protocol.
- No hunter is still running when K8 restarts the
  process.
- G36 sees two orgs on G's admin; V1 can invite an
  identity that is not seated in G's primary org.
- `--serial` still walks A → … → J on one mock org.

## Rudimentary time saved per run

Assumptions, not measurements:

- MCP-driven UI case ≈ 2.5 minutes (list paint
  waits of 5–14s, forms, navigation). AT + A1–A2 ≈
  10 minutes. K8 + J ≈ 5 minutes.
- Today’s **written** parallel path: Phase 1 AA
  serial, then seven Phase 2 agents (wall = max
  bundle), then I exclusive, then K8.
- Phase 2 bundles today: F = 77; F2+FS+R = 65;
  G+K1–K6 = 44; D = 38; E = 32; B = 31. Critical
  path case count = 77 (F).
- New parallel sections: 14 hunters; critical path
  still F = 77. AA (46) and I (29) overlap F.
  G drops to 38 (K1–K6 move to K).
- Parallel seed of N slices is slower than one
  mock seed; budget +5 minutes (unmeasured).

Today wall-clock (minutes):

`10 + 46×2.5 + 77×2.5 + 29×2.5 + 5`
`= 10 + 115 + 193 + 73 + 5 = 396` ≈ **6.6 h**

New wall-clock:

`10 + 5 + 77×2.5 + 5 = 213` ≈ **3.6 h**

**Saved ≈ 3 hours per full parallel run (~45%).**

The saving is almost entirely the exclusive tails
(AA setup + I), not finer fan-out: F remains the
longest job. Splitting F later would move the
critical path (next longest parallel section is
AA at 46 cases ≈ 1.9 h). B's extra two cases and
SV8b do not move the critical path.

If a given run already skips Phase 1 (mock seed
only, no AA rebuild), today’s path is
`10 + 193 + 73 + 5 = 281` ≈ 4.7 h, and the new
path still saves ≈ **1.1 h** (I no longer serial).

Seed-N cost is the uncertainty. If materializing
14 slices is much slower than +5 minutes, subtract
that from the saving. Context size is a separate
win: a hunter holds one section (F at 77 cases
worst) instead of the 396-case document.

## Implementation sketch (not this spec)

Later plan, not this document:

1. Add section headers and rewrite Protocol /
   Execution Order / invoke / sub-agent contract /
   Summary counts / Summary Format agent table.
2. Teach mock seed (or a sibling flag) to emit N
   slices (G two-org, SV two-identity, AA
   bootstrap-only) and a stderr credential map.
3. Drop `≥ N` guidance; hunters assert in-tenant.
4. First parallel run is the proof; mitigation
   directory is created when the first FAIL cluster
   appears.
