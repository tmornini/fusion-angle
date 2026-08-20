# TEST-PLAN Parallel DAG — Design

Date: 2026-08-19
Status: draft (brainstorm 2026-08-19; awaiting user
review)
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

## Non-goals

- Splitting fat sections (F) into workflow clusters
- One tenant per case
- A machine-readable graph beside TEST-PLAN.md
- A graph-validator or seed-helper script in the
  first cut
- An external workflow engine as orchestrator
- Auto-rerun or auto-patch of FAILs
- Rewriting all 393 case bodies in the first cut

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

## Architecture

One Postgres, one `server.mjs`, N disjoint
organizations created at seed. Each `parallel: yes`
section is a job: one hunter, one tenant, one Chrome
`isolatedContext`, cases in document order. Jobs do
not share org id, identity, or cookie jar. Assertions
inside a job are exact.

DAG edges only:

- `AT` → `A` (validate, build, one origin, seed)
- `A` → all `parallel: yes` sections
- those → `global_lock: process` (K8, then J)

No Phase-1 UI rebuild. Mutation-domain tables and the
six-phase appendix become historical notes, not
scheduler law.

Serial `--serial`: one tenant (today’s mock org),
document order, unchanged case text.

## Components

### Section header (the graph)

Every `##` section carries four fields:

- `tenant:` `required` | `none`
- `parallel:` `yes` | `no`
- `global_lock:` `none` | `process`
- `depends:` section ids (`AT`, `A`, or the join)

Case lists stay as they are. No sibling JSON graph.

First-cut map (serial document order unchanged):

| Section | tenant | parallel | lock | depends |
|---|---|---|---|---|
| AT | none | no | none | — |
| A | none | no | none | AT |
| AA B C D E F F2 FS G H I K R SV | required | yes | none | A |
| J | none | no | process | all parallel |

K8 is not a case inside the K hunter on the parallel
path. K’s product cases (K1–K6, K9–…) run in the K
tenant. After join, the master runs K8 alone (process
lock, wipe/reseed of the shared DB), then J. Serial
mode still runs K8 in document order inside K.

### Seed

Parallel A3 materializes one org + admin + minimum
fixtures per `parallel: yes` section. N equals that
section count. Stderr prints a credential map:
section id → `{orgId, username, password}`. Hunters
do not create tenants.

If a section cannot run from that minimum, A3 FAILs.
Hunters must not invent Phase-1 UI setup.

Serial A3 stays today’s `--seed-mock-data` reveal
(SV1).

### Hunter

One spawn per parallel section. Prompt: Medium Church,
CLAUDE.md, that section’s cases only, tenant
credentials, origin URL, `isolatedContext` name =
section id. Sign in as that admin. Return per-case
PASS / FAIL / BLOCKED / DEFERRED / DRIFT. Do not read
other sections. Do not re-seed.

### Master

`./validate`, build, start seeded server, grant
Chrome origin, spawn, join in document order, write
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
  → A3 seed N tenants
  → fan-out hunters
  → join
  → K8 (process lock)
  → J
  → summary + mitigation files
```

BroadcastChannel / `fusion-angle:data` still fires.
Siblings are other orgs, so a refresh in D does not
change E’s roster. C and FS assert against their org
only.

SV6–SV10: both jars belong to the SV hunter’s tenant
(two identities in that org). Auth throttle stays
inside that hunter.

B sign-out last **inside B**. B’s identity is
private; logout-everywhere cannot evict another
hunter.

I owns theme/sidebar localStorage in its own
`isolatedContext`. No exclusive Phase 3.

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

Keep: encoding note, How to invoke, Scope, Known MCP
limitations, case lists, Summary Format.

Replace Protocol and Execution Order with the DAG
recipe: parse headers; AT → A → fan-out → K8 → J;
sub-agent contract names sliced sections, not seven
Phase 2 agents; `--serial` is document order on one
mock tenant.

Move to a short Historical note (not an agent map):

- Six-phase parallel protocol
- Entity mutation domain table
- `≥ N` as the default assertion style
- Phase 1 UI rebuild from `--seed-bootstrap`
- Sign-out / I exclusive after join

Keep as facts, not as the scheduler: cookie jar =
`isolatedContext`; operator seed wipes the whole DB
(why K8 is process-locked); the MCP limitation list.

Case text: first cut does not retarget 393 bodies.
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

- A hunter prompt contains only its `##` cases.
- Two concurrent hunters may create an idea with the
  same title; each list shows one.
- A D assertion that used `≥ N` can use `= N` inside
  its tenant; leftover `≥` is doc debt, not protocol.
- No hunter is still running when K8 restarts the
  process.
- `--serial` still walks A → … → J on one mock org.

## Rudimentary time saved per run

Assumptions, not measurements:

- MCP-driven UI case ≈ 2.5 minutes (list paint
  waits of 5–14s, forms, navigation). AT + A1–A2 ≈
  10 minutes. K8 + J ≈ 5 minutes.
- Today’s **written** parallel path: Phase 1 AA
  serial, then seven Phase 2 agents (wall = max
  bundle), then I exclusive, then K8.
- Phase 2 bundles today: F = 77; F2+R+FS = 65;
  G = 38; D = 38; others smaller. Critical path
  case count = 77 (F).
- New parallel sections: 14 hunters; critical path
  still F = 77. AA (46) and I (29) overlap F.
- Parallel seed of N tenants is slower than one
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
AA at 46 cases ≈ 1.9 h).

If a given run already skips Phase 1 (mock seed
only, no AA rebuild), today’s path is
`10 + 193 + 73 + 5 = 281` ≈ 4.7 h, and the new
path still saves ≈ **1.1 h** (I no longer serial).

Seed-N cost is the uncertainty. If materializing
14 tenants is much slower than +5 minutes, subtract
that from the saving. Context size is a separate
win: a hunter holds one section (F at 77 cases
worst) instead of the 393-case document.

## Implementation sketch (not this spec)

Later plan, not this document:

1. Add section headers and rewrite Protocol /
   Execution Order / invoke / sub-agent contract.
2. Teach mock seed (or a sibling flag) to emit N
   tenant slices and a stderr credential map.
3. Drop `≥ N` guidance; hunters assert in-tenant.
4. First parallel run is the proof; mitigation
   directory is created when the first FAIL cluster
   appears.
