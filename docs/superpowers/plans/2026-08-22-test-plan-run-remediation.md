# Test-Plan Run Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Parallel dispatch follows the DAG below —
> **never git worktrees** (CLAUDE.md). Same checkout,
> file-disjoint lanes, one concern per commit.

**Goal:** A CLI belt that fails on the 2026-08-22 browser
FAILs, a slice seed that satisfies product invariants,
member lifecycle state retired, TEST-PLAN corrected to
this MCP, SV3 settled by measurement.

**Architecture:** Page-boot reads over
`postTestPlanSlices` on the memory backend inside
`./test`. Garden ideas gain submission pairs. F2 gains a
READY `WB Test Flow` (op + document, no join). Member
state is cut leaf-to-root. TEST-PLAN Protocol becomes
serial hunters on one Chrome profile.

**Tech Stack:** TypeScript ES2024, `node:test
--strip-types`, memory `DbAdapter`, page adapters via
`createRequestContext`.

**Spec:**
`docs/superpowers/specs/2026-08-22-test-plan-run-remediation-design.md`

---

## Parallel DAG

Four file-disjoint lanes. An agent may start when every
listed dependency is committed. The orchestrator never
gives two live agents the same path.

```text
Wave 0 (start together)
  A1  belt red     tests/slices-page-boot.test.ts
  B1  invite test  tests/slices-invitation-lifecycle.test.ts
  A0  F2 red       tests/slices-flow-readiness.test.ts
  D1  AT4          TEST-PLAN.md  (AT section + Summary AT
                   count ONLY)
  C1  member UI    presenters + members pages + presenter
                   tests  (NOT TEST-PLAN.md)

Wave 1
  A2  submissions  depends A1
                   api/test-plan-slices.ts
                   tests/test-plan-slices.test.ts
  B2  invite fix   depends B1, only if B1 is red
                   product files B1 names
  C2  type cut     depends C1
                   api/types.ts + fabrication sites +
                   SCHEMA.md + SCHEMA.svg + constructor
                   call sites in tests/

Wave 2
  A3  F2 extras    depends A2 and A0
                   api/test-plan-slices.ts
                   tests/test-plan-slices.test.ts
                   (A0's test now greens)
  C3  dead writes  depends C2
  C4  derive/seed  depends C3
  C5  alphabet     depends C4

Wave 3
  C6  member docs  depends C5 and D1
                   ARCHITECTURE.md, API.md, SCHEMA.md,
                   TEST-PLAN.md (G21, G20, G24a, G11,
                   G19, AA6, AA8 only)

Wave 4
  E1  TEST-PLAN    depends A2, A3, B1 (or B2), C6, D1
                   Protocol, hunter prompt, A3 flow_id,
                   AA-WB-SETUP, AA9, V1, G43, G46, G47,
                   I26, section counts
                   (do not restrip C6's G21/AA6)

Wave 5
  F1  SV3          depends E1
                   measure cookies; then either
                   api/authentication.ts or SV3 text
```

**Max parallelism:** 5 at Wave 0, then 3, then 1.

**Linear commit order** (spec, for rebase if a lane
finishes out of order):

A1 → A2 → B1 → B2? → A3 → D1 → C1 → C2 → C3 → C4 →
C5 → C6 → E1 → F1

A0 may land with A1 (new file). If A3 lands after A2,
A0's red test is the TDD witness.

**Do not use worktrees.** File-disjoint commits on
`master`. Linear history — rebase, never merge.

---

## Agent rules (every subagent prompt)

Start with the literal line:

```
Go to Medium Church!
```

Then: 78-char max on `.ts` / tests; 4-space indent; no
inline `style=`; present-tense imperative subject
≈50 chars; `Co-Authored-By: Grok 4.6 <grok@x.ai>`;
TDD (red, watch fail, green); `./validate` green after
every production commit; touch only this task's files;
no unbidden helpers.

Commandments: Reliability, Uniformity, Clarity,
Idempotency, Simplicity, Atomicity.

Abominations this work risks: unbidden helpers,
test weakening, swallowed failures, premature
generalization, default values, internal defense.

---

## File map

### Lane A — belt + seed

- Create: `tests/slices-page-boot.test.ts`
- Create: `tests/slices-flow-readiness.test.ts`
- Modify: `api/test-plan-slices.ts` —
  `SLICE_ENTITY_IDS`, `formGarden`, `writeGarden`,
  `formF2Extras` (new), `postTestPlanSlices` F2
  reveal `flowId`
- Modify: `tests/test-plan-slices.test.ts` —
  `EXPECTED_SLICE_PAIRS` 350 → 378 → 380

### Lane B — invitations

- Create: `tests/slices-invitation-lifecycle.test.ts`
- Modify (only if red): invitation product path B1
  names. Do not guess a fix.

### Lane C — member state retirement

- UI: `web-app/app/presenters/human-member-detail.ts`,
  `ai-member-detail.ts`, `member.ts`,
  `state-display.ts`; `web-app/members/detail.ts`,
  `index.ts`; `tests/presenter-member-detail.test.ts`,
  `tests/members-detail-reduce.test.ts`
- Type cut: `api/types.ts`, `api/validators.ts`,
  `api/derive-members.ts`,
  `web-app/app/adapters/members.ts`,
  `ai-members.ts`, `members-union.ts`;
  `SCHEMA.md`; `SCHEMA.svg`; test constructors
- Dead writes: `api/routes.ts`, `api/validators.ts`,
  `tests/api-member-documents.test.ts`,
  `tests/drift-roster.test.ts`
- Derive/seed: `api/derive-states.ts`,
  `api/derive-members.ts`, `api/mock-data/members.ts`,
  seed comments; `tests/mock-data-valid.test.ts`,
  `drift-states.test.ts`,
  `drift-phase15-cores-parity.test.ts`;
  measure 1448/8, do not invent
- Alphabet: `MEMBER_STATES` family; adapter stubs;
  `tests/member-fixtures.ts`,
  `tests/adapters-admin.test.ts`,
  `tests/adapters-members.test.ts`,
  `tests/adapters-ai-members.test.ts`
- Docs: `ARCHITECTURE.md`, `API.md`, `SCHEMA.md`,
  TEST-PLAN G/AA member-state lines

### Lane D / E / F — TEST-PLAN + SV3

- `TEST-PLAN.md` (partitioned: D1 AT only; C6 member
  cases; E1 the rest)
- `api/authentication.ts` only if F1 measurement
  says both hosts accept `Secure`

---

## Facts locked for implementers

### Page-boot reads (from `init()`, writes stripped)

`requiresAuth === false` pages are out
(`api-documentation`, `design-system`, `auth`,
`landing`, `not-found`). Qualifying keys = sidebar
and `requiresAuth !== false`.

| key | boot reads |
|---|---|
| dashboard | `getDashboardGauges`; `getObjectiveScoringInputs`; `getCurrentObjectiveDefinitions` with active ids |
| organization | `getOrganization`; `getOrganizationStats`; `getActiveObjectives`; `getObjectives`; `getArchivedObjectiveIds`; `getObjectiveStateDetails`; `getCurrentObjectiveDefinitions`; `getSentInvitations` |
| ideas | `getIdeas` |
| idea-detail | per `getIdeas` row: `getIdea` |
| idea-create | `[]` (explicit) |
| idea-convert | per approved `getIdeas` row: `getIdea`; then `getActiveObjectives`; `getCurrentObjectiveDefinitions` |
| projects | `getProjects`; `getProjectsScoreColumn` |
| project-detail | per project: `getProjectEntity`; `getObjectives`; `getProjectScoring`; `getFlowsByProject`; `getActiveObjectives`; `getCurrentObjectiveDefinitions` |
| records | `getRecords` |
| record-create | `[]` |
| record-detail | per record: `getRecordModel`; `getRecordAttributesByRecord`; `getFlowSummariesForRecord`; `getWorkOrdersForRecord`; `getRecordInstances` |
| flows | `getFlowsWithProjectNames` |
| flow-detail | per flow: `getFlowGraph`; `getHumanMembers`; `getAIMembers`; `getRecordEntities`; `getRecordForFlow`; if bound, `getRecordAttributesByRecord` |
| flow-stats | per flow: `getFlowStats(ctx, id, Date.now())` |
| workbox | `getWorkOrders`; `getWorkOrderHistories`; `getMemberMap`; `getFlowsForCreation` |
| workbox-detail | per work order: `getWorkOrder`; `getWorkOrderHistory`; `getMemberMap`; `getRecordForWorkOrder`; once: `getCurrentHumanMember`. **No** `putWorkOrderClaim` |
| members | `getMembers`; `fillHumanMemberPii` |
| member-detail | per member: `getHumanMember`, on 404 `getAIMember` |
| invitations | `getInvitations` |
| identities | `getIdentityRoster` |
| identity-detail | per roster id: `getIdentity`; `getMemberPii`; if service: `getServiceFacet`; `getIdentityCredentialState`; `getClientRegistration` |
| identity-providers | per roster id: `getProviderEvents` |
| identity-tokens | per roster id: `getTokenChainsFor` |
| billing | `[]` |

Absence of a qualifying key from the manifest is the
completeness failure, not an empty read list.

Red today: garden slices (C, D, E, F, FS, K, R) throw
`Idea has no submission` from `getIdeas` (ideas page
and `getOrganizationStats` on organization). Thin
slices including F2, AA, B, G, H, I, SV seed no ideas
and must boot empty.

### Tokens

AA: `organizationToken()` (Tony / Stark).

Every other slice admin:

```typescript
await claimToken({
    sub: sliceEntityId(token + '-admin'),
    organization,
    organizations: [organization],
    roles: ['admin:' + organization],
});
```

`organizationToken` maps any non-Tony sub to
`member:` roles — do not use it for slice admins.

Invitee: `reachableToken('dtmZgnDBlVcoyjxKzlaKgA',
[])`. `sliceEntityId('g-unseated')` is **not** a
key today. Lane B uses the literal. Do not edit
`SLICE_ENTITY_IDS` in Lane B.

### G extras (literals)

| role | id | email |
|---|---|---|
| admin | `kHaSgLhnsobjMXxNLEzpBw` | `g-admin@test-plan.example` |
| org | `wxOovfCwcKNldjMnmAkuCQ` | — |
| Wayne | `WlkfISpndVJfICRnWksipQ` | — |
| unseated | `dtmZgnDBlVcoyjxKzlaKgA` | `g-unseated@test-plan.example` |
| member | `dmGzDTZwsyIYCQhhRISXrw` | `g-member@test-plan.example` |

### Minted `SLICE_ENTITY_IDS` (Lane A only)

Paste these 28 submission ids plus 3 F2 extras.
Last character is `[AQgw]` (canonical identifier).
Use this table only:

```
'c-idea-active-submission': 'wOBTZC-Vn7GRNJ_y-VodQQ',
'c-idea-in_review-submission': 'H3OKnysC1p66onTEKNdJ-g',
'c-idea-sent_back-submission': 'zj2NKyW7yhGeXzyVM_lIvQ',
'c-idea-approved-submission': '6aBI2B6YGddcsus2Lfhvdg',
'd-idea-active-submission': 'BuxlcYyfIkXk6ZWYmobvww',
'd-idea-in_review-submission': 'cK6oLgyjN_yX87fh4Odr3g',
'd-idea-sent_back-submission': '2-iBj4cvvJD0DIOeUkQyEw',
'd-idea-approved-submission': 'WpglrEJPmlj2NpO4Qh3pDw',
'e-idea-active-submission': 'efje7lqI_mFsIvtcfbUF9A',
'e-idea-in_review-submission': 'Ufigs3kAv6TuXQ3ip-cOFA',
'e-idea-sent_back-submission': '_Cq1L999C3A4bORu1TmSZg',
'e-idea-approved-submission': 'MpE2m39VpzVLSB2ITqEDuQ',
'f-idea-active-submission': 'zeyns2rTOIERuvyYqi93rQ',
'f-idea-in_review-submission': 'ePnd30rnnRkhsrENpk-6gA',
'f-idea-sent_back-submission': 'T-c8PAUI0szvWznxShaMVA',
'f-idea-approved-submission': 'BzoTuEUck3mfl5PGmlysKQ',
'fs-idea-active-submission': 'G1IWGr0vBKSfjzZ34rrLgw',
'fs-idea-in_review-submission': 'ui76pIWMxXFVgRRR2LQuDA',
'fs-idea-sent_back-submission': 'TrD8X5aq7BvciVgOV04BrA',
'fs-idea-approved-submission': 'FNGZGUXcTWh1bKEuvWD7LQ',
'k-idea-active-submission': '-lkidKwbns-b8iacRpNWZg',
'k-idea-in_review-submission': 'EYMK3ZEX4Ue5YVvpcsXX4w',
'k-idea-sent_back-submission': 'kMEtwfnnQl3JLG4am2xoqA',
'k-idea-approved-submission': 'sRC-nTKUbtMbVqm8OR04JA',
'r-idea-active-submission': 'fImPHFkwz6F4e6vVj4jbUg',
'r-idea-in_review-submission': '8LA31IvKumaVpLfxo4Y38w',
'r-idea-sent_back-submission': 'UhfWKRJtf9YNgTQ4z-jBQw',
'r-idea-approved-submission': 'UXH2RjJ6C9IYaD1S65Hckw',
'f2-node-capture-attr-text': 'dL4p4z_U-8XNsYJp-H94xw',
'f2-node-capture-attr-select': 'o1yYjA882AU1i4TyB3a40A',
'f2-edge-capture-archive': 'KmbpGLs7xhDmJhwwqtEtKQ',
```

Reuse existing `f2-flow`, `f2-node-create`,
`f2-node-capture`, `f2-node-archive`,
`f2-edge-begin`, `f2-state-flow`,
`f2-project-flow`, `f2-project-approved`.
F2 is not garden; those project ids are unused
and exist only so `validateFlowCreateBody` can
see a non-empty `projectFlow` that is **never
written as a join pair**.

### Pair counts

| after | `EXPECTED_SLICE_PAIRS` |
|---|---|
| today | 350 |
| A2 submissions | 378 |
| A3 F2 flow | 380 |

Mock `EXPECTED_PAIR_COUNT` 1448 / bootstrap 8:
measure after C4. Leftover `members/:id` pairs are
already gone from seed — do not bump on a guess.

---

### Task A1: Belt red

**Files:**
- Create: `tests/slices-page-boot.test.ts`

- [ ] **Step 1: Write the failing belt**

One seed per section test. Nested subtest per
manifest page. Assertion: every listed read
resolves (does not throw). Completeness: every
`PAGE_REGISTRY` key with `layout === 'sidebar'`
and `requiresAuth !== false` has a manifest
entry.

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
    PARALLEL_SECTIONS,
    type ParallelSection,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    organizationToken, claimToken,
} from './token-fixtures.ts';
import { PAGE_REGISTRY } from
    '../web-app/app/page-registry.ts';
import { getDashboardGauges } from
    '../web-app/app/adapters/dashboard.ts';
import {
    getObjectiveScoringInputs,
    getCurrentObjectiveDefinitions,
    getActiveObjectives,
    getObjectives,
    getArchivedObjectiveIds,
    getObjectiveStateDetails,
} from '../web-app/app/adapters/objectives.ts';
import {
    getOrganization,
    getOrganizationStats,
} from '../web-app/app/adapters/admin.ts';
import {
    getSentInvitations, getInvitations,
} from '../web-app/app/adapters/invitations.ts';
import {
    getIdeas, getIdea,
} from '../web-app/app/adapters/ideas.ts';
import {
    getProjects, getProjectEntity,
    getProjectsScoreColumn,
} from '../web-app/app/adapters/projects.ts';
import { getProjectScoring } from
    '../web-app/app/adapters/project-scoring.ts';
import {
    getFlowsByProject,
    getFlowsWithProjectNames,
    getFlowGraph,
    getRecordForFlow,
} from '../web-app/app/adapters/flow-queries.ts';
import { getFlowStats } from
    '../web-app/app/adapters/flow-stats.ts';
import {
    getRecords, getRecordModel, getRecordEntities,
} from '../web-app/app/adapters/records.ts';
import { getRecordAttributesByRecord } from
    '../web-app/app/adapters/record-attributes.ts';
import { getRecordInstances } from
    '../web-app/app/adapters/record-instances.ts';
import {
    getFlowSummariesForRecord,
    getWorkOrdersForRecord,
    getRecordForWorkOrder,
} from '../web-app/app/adapters/flow-records.ts';
import {
    getWorkOrders, getWorkOrder,
    getWorkOrderHistories,
    getWorkOrderHistory,
} from
    '../web-app/app/adapters/work-orders-queries.ts';
import { getFlowsForCreation } from
    '../web-app/app/adapters/flow-publish.ts';
import {
    getMemberMap, getMembers, fillHumanMemberPii,
} from
    '../web-app/app/adapters/members-union.ts';
import {
    getHumanMember, getHumanMembers,
    getCurrentHumanMember,
} from '../web-app/app/adapters/members.ts';
import { getAIMember, getAIMembers } from
    '../web-app/app/adapters/ai-members.ts';
import {
    getIdentityRoster, getIdentity,
    getMemberPii, getServiceFacet,
    getClientRegistration,
} from '../web-app/app/adapters/identities.ts';
import { getIdentityCredentialState } from
    '../web-app/app/adapters/identity-credentials.ts';
import { getProviderEvents } from
    '../web-app/app/adapters/identity-providers.ts';
import { getTokenChainsFor } from
    '../web-app/app/adapters/identity-tokens.ts';
import type { RequestContext } from
    '../web-app/app/adapters/shared.ts';

type BootFn = (
    ctx: RequestContext,
) => Promise<void>;

const MANIFEST: Record<string, BootFn> = {
    dashboard: async (ctx) => {
        await getDashboardGauges(ctx);
        const inputs =
            await getObjectiveScoringInputs(
                ctx,
            );
        await getCurrentObjectiveDefinitions(
            ctx,
            inputs.activeObjectives.map(
                (o) => o.id,
            ),
        );
    },
    organization: async (ctx) => {
        await getOrganization(ctx);
        await getOrganizationStats(ctx);
        const [
            active, all, archivedIds, details,
        ] = await Promise.all([
            getActiveObjectives(ctx),
            getObjectives(ctx),
            getArchivedObjectiveIds(ctx),
            getObjectiveStateDetails(ctx),
        ]);
        void all;
        void archivedIds;
        void details;
        await getCurrentObjectiveDefinitions(
            ctx, active.map((o) => o.id),
        );
        await getSentInvitations(ctx);
    },
    ideas: async (ctx) => {
        await getIdeas(ctx);
    },
    'idea-detail': async (ctx) => {
        const rows = await getIdeas(ctx);
        for (const row of rows) {
            await getIdea(ctx, row.idea.id);
        }
    },
    'idea-create': async () => {},
    'idea-convert': async (ctx) => {
        const rows = await getIdeas(ctx);
        const approved = rows.filter(
            (row) => row.idea.stateValue()
                === 'approved',
        );
        for (const row of approved) {
            await getIdea(ctx, row.idea.id);
        }
        const active =
            await getActiveObjectives(ctx);
        await getCurrentObjectiveDefinitions(
            ctx, active.map((o) => o.id),
        );
    },
    projects: async (ctx) => {
        await getProjects(ctx);
        await getProjectsScoreColumn(ctx);
    },
    'project-detail': async (ctx) => {
        const projects = await getProjects(ctx);
        for (const project of projects) {
            const id = project.idForLink();
            await getProjectEntity(ctx, id);
            await getObjectives(ctx);
            await getProjectScoring(ctx, id);
            await getFlowsByProject(ctx, id);
            const active =
                await getActiveObjectives(ctx);
            await getCurrentObjectiveDefinitions(
                ctx, active.map((o) => o.id),
            );
        }
    },
    records: async (ctx) => {
        await getRecords(ctx);
    },
    'record-create': async () => {},
    'record-detail': async (ctx) => {
        const records = await getRecords(ctx);
        for (const record of records) {
            const id = record.id;
            await getRecordModel(ctx, id);
            await getRecordAttributesByRecord(
                ctx, id,
            );
            await getFlowSummariesForRecord(
                ctx, id,
            );
            await getWorkOrdersForRecord(
                ctx, id,
            );
            await getRecordInstances(ctx, id);
        }
    },
    flows: async (ctx) => {
        await getFlowsWithProjectNames(ctx);
    },
    'flow-detail': async (ctx) => {
        const flows =
            await getFlowsWithProjectNames(ctx);
        for (const row of flows) {
            const id = row.summary.id;
            await getFlowGraph(ctx, id);
            await getHumanMembers(ctx);
            await getAIMembers(ctx);
            await getRecordEntities(ctx);
            const bound =
                await getRecordForFlow(ctx, id);
            if (bound) {
                await getRecordAttributesByRecord(
                    ctx, bound,
                );
            }
        }
    },
    'flow-stats': async (ctx) => {
        const flows =
            await getFlowsWithProjectNames(ctx);
        for (const row of flows) {
            await getFlowStats(
                ctx, row.summary.id, Date.now(),
            );
        }
    },
    workbox: async (ctx) => {
        await getWorkOrders(ctx);
        await getWorkOrderHistories(ctx);
        await getMemberMap(ctx);
        await getFlowsForCreation(ctx);
    },
    'workbox-detail': async (ctx) => {
        await getCurrentHumanMember(ctx);
        const orders = await getWorkOrders(ctx);
        for (const order of orders) {
            await getWorkOrder(ctx, order.id);
            await getWorkOrderHistory(
                ctx, order.id,
            );
            await getMemberMap(ctx);
            await getRecordForWorkOrder(
                ctx, order.id,
            );
        }
    },
    members: async (ctx) => {
        await fillHumanMemberPii(
            ctx, await getMembers(ctx),
        );
    },
    'member-detail': async (ctx) => {
        const members = await getMembers(ctx);
        for (const member of members) {
            const id = member.idForLink();
            try {
                await getHumanMember(ctx, id);
            } catch {
                await getAIMember(ctx, id);
            }
        }
    },
    invitations: async (ctx) => {
        await getInvitations(ctx);
    },
    identities: async (ctx) => {
        await getIdentityRoster(ctx);
    },
    'identity-detail': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            const identity =
                await getIdentity(ctx, row.id);
            await getMemberPii(ctx, row.id);
            if (!identity.isService()) continue;
            await getServiceFacet(ctx, row.id);
            await getIdentityCredentialState(
                ctx, row.id,
            );
            await getClientRegistration(
                ctx, row.id,
            );
        }
    },
    'identity-providers': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            await getProviderEvents(ctx, row.id);
        }
    },
    'identity-tokens': async (ctx) => {
        const roster =
            await getIdentityRoster(ctx);
        for (const row of roster) {
            await getTokenChainsFor(ctx, row.id);
        }
    },
    billing: async () => {},
};

test('every gated sidebar page is in the belt',
() => {
    const required = Object.entries(
        PAGE_REGISTRY,
    ).filter(([, e]) =>
        e.layout === 'sidebar'
        && e.requiresAuth !== false,
    ).map(([k]) => k).sort();
    assert.deepEqual(
        Object.keys(MANIFEST).sort(),
        required,
    );
});

async function adminCtx(
    section: ParallelSection,
    organization: string,
) {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const row = reveal.find(
        (r) => r.section === section,
    );
    assert.ok(row, section);
    const token = section === 'AA'
        ? await organizationToken()
        : await claimToken({
            sub: sliceEntityId(
                section.toLowerCase() + '-admin',
            ),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        });
    return {
        ctx: createRequestContext(db, token),
        organization: row.organizationId,
    };
}

for (const section of PARALLEL_SECTIONS) {
    test('slice ' + section + ' pages boot',
    async (t) => {
        const organization = section === 'AA'
            ? 'AjdvjuECVZEgZoFajaIEkg'
            : sliceEntityId(
                section.toLowerCase() + '-org',
            );
        const { ctx } = await adminCtx(
            section, organization,
        );
        for (const [page, boot] of
            Object.entries(MANIFEST)
        ) {
            await t.test(page, async () => {
                await boot(ctx);
            });
        }
    });
}
```

If a symbol's real export path differs, follow the
adapter file — do not invent a barrel. Merge any
duplicate imports the compiler names.

If `getRecordForFlow` returns a record id vs
entity, pass that id into
`getRecordAttributesByRecord`. Read the return
type at implementation time.

- [ ] **Step 2: Run and confirm garden red**

```bash
node --test --strip-types \
    tests/slices-page-boot.test.ts
```

Expected: FAIL on garden `ideas` and
`organization` with `Idea has no submission`.
Thin slices including F2 pass empty boots.
Completeness test PASSES (manifest is complete).

If the failure is an import error, fix imports
until the failure is the submission throw.

- [ ] **Step 3: Commit**

```bash
git add tests/slices-page-boot.test.ts
git commit -m "Add slice page-boot belt (red)

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

A red belt is the TDD witness. Do not seed yet.

---

### Task A0: F2 readiness red

**Files:**
- Create: `tests/slices-flow-readiness.test.ts`

May run in parallel with A1.

- [ ] **Step 1: Write the failing readiness pin**

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import { claimToken } from
    './token-fixtures.ts';
import { getFlowsForCreation } from
    '../web-app/app/adapters/flow-publish.ts';

test('F2 admin sees WB Test Flow ready',
async () => {
    const db = memoryDbAdapter();
    const reveal = await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const f2 = reveal.find(
        (r) => r.section === 'F2',
    );
    assert.ok(f2);
    const organization = sliceEntityId('f2-org');
    const ctx = createRequestContext(
        db,
        await claimToken({
            sub: sliceEntityId('f2-admin'),
            organization,
            organizations: [organization],
            roles: ['admin:' + organization],
        }),
    );
    const { ready, notReady } =
        await getFlowsForCreation(ctx);
    assert.equal(notReady.length, 0);
    assert.equal(ready.length, 1);
    assert.equal(ready[0]!.name, 'WB Test Flow');
    assert.equal(
        ready[0]!.id, sliceEntityId('f2-flow'),
    );
    assert.equal(f2.flowId, ready[0]!.id);
});
```

- [ ] **Step 2: Run and confirm red**

```bash
node --test --strip-types \
    tests/slices-flow-readiness.test.ts
```

Expected: FAIL — F2 has no flow (`ready.length`
0, `flowId` undefined).

- [ ] **Step 3: Commit**

```bash
git add tests/slices-flow-readiness.test.ts
git commit -m "Add F2 flow-readiness pin (red)

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task B1: Invitation lifecycle over the slice

**Files:**
- Create: `tests/slices-invitation-lifecycle.test.ts`

Parallel with A1. Do not touch seed files.

- [ ] **Step 1: Write the five-step pin**

Pattern: `tests/adapters-invitations.test.ts`.
G admin via `claimToken`. Unseated via
`reachableToken(unseatedId, [])`.

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryDbAdapter } from
    '../api/db-memory.ts';
import {
    postTestPlanSlices, sliceEntityId,
} from '../api/test-plan-slices.ts';
import { testHashPassword } from
    './mock-seed.ts';
import { createRequestContext } from
    '../web-app/app/adapters/shared.ts';
import {
    claimToken, reachableToken,
} from './token-fixtures.ts';
import {
    postInvitationGrant,
    postInvitationAcceptance,
    postInvitationDecline,
    getInvitations,
} from '../web-app/app/adapters/invitations.ts';
import { getOrganizations } from
    '../web-app/app/adapters/organizations.ts';

const UNSEATED = 'dtmZgnDBlVcoyjxKzlaKgA';
const G_MEMBER = 'dmGzDTZwsyIYCQhhRISXrw';
const WAYNE = 'WlkfISpndVJfICRnWksipQ';

async function seeded() {
    const db = memoryDbAdapter();
    await postTestPlanSlices(
        db, { hashPassword: testHashPassword },
    );
    const gOrg = sliceEntityId('g-org');
    const gAdmin = sliceEntityId('g-admin');
    const gCtx = createRequestContext(
        db,
        await claimToken({
            sub: gAdmin,
            organization: gOrg,
            organizations: [gOrg],
            roles: ['admin:' + gOrg],
        }),
    );
    const wayneCtx = createRequestContext(
        db,
        await claimToken({
            sub: gAdmin,
            organization: WAYNE,
            organizations: [WAYNE],
            roles: ['admin:' + WAYNE],
        }),
    );
    const unseatedCtx = createRequestContext(
        db,
        await reachableToken(UNSEATED, []),
    );
    return { db, gOrg, gCtx, wayneCtx, unseatedCtx };
}

test('G grant to unseated is sent', async () => {
    const { gCtx } = await seeded();
    assert.equal(
        await postInvitationGrant(
            gCtx,
            'g-unseated@test-plan.example',
        ),
        'sent',
    );
});

test('unseated sees one pending for g-org',
async () => {
    const { gCtx, gOrg, unseatedCtx } =
        await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const pending = await getInvitations(
        unseatedCtx,
    );
    assert.equal(pending.length, 1);
    assert.equal(
        pending[0]!.organizationId, gOrg,
    );
    assert.equal(pending[0]!.state, 'pending');
});

test('unseated accept seats g-org; re-accept no-op',
async () => {
    const { gCtx, gOrg, unseatedCtx } =
        await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const [inv] = await getInvitations(
        unseatedCtx,
    );
    assert.ok(inv);
    await postInvitationAcceptance(
        unseatedCtx, inv.id,
    );
    const organizations = await getOrganizations(
        unseatedCtx,
    );
    assert.ok(
        organizations.some((o) => o.id === gOrg),
    );
    await postInvitationAcceptance(
        unseatedCtx, inv.id,
    );
});

test('grant to seated identity is already-member',
async () => {
    const { gCtx } = await seeded();
    await postInvitationGrant(
        gCtx, 'g-unseated@test-plan.example',
    );
    const unseatedCtx = createRequestContext(
        (await seeded()).db,
        await reachableToken(UNSEATED, []),
    );
    void unseatedCtx;
    assert.equal(
        await postInvitationGrant(
            gCtx, 'g-member@test-plan.example',
        ),
        'already-member',
    );
});
```

Rewrite the last test so it uses **one** seed:
after accept of unseated, a second grant to that
email is `'already-member'`; grant to
`g-member@test-plan.example` is `'already-member'`
without accept. Then a **fresh** grant from
`wayneCtx` to the unseated email, decline, orgs
unchanged, re-decline no-op.

`postInvitationAcceptance` remints only if a
cookie session exists; in these tests it no-ops.
`getOrganizations` for a flat token must still
list reachable orgs after accept (seat is on the
pair plane). If `getOrganizations` needs an
org-scoped token after accept, mint
`claimToken({ sub: UNSEATED, organizations:
[gOrg], roles: ['member:' + gOrg] })` for the
read — that is a test helper, not a product
change. Prefer the product path first.

- [ ] **Step 2: Run**

```bash
node --test --strip-types \
    tests/slices-invitation-lifecycle.test.ts
```

Green ⇒ V3–V5 were doc drift; E1 names
`unseated_username`. Red ⇒ Task B2 product fix
before E1.

- [ ] **Step 3: Commit**

```bash
git add tests/slices-invitation-lifecycle.test.ts
git commit -m "Pin slice invitation lifecycle

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task B2: Invitation product fix (only if B1 red)

**Files:** whatever B1's failure names.
Likely `api/invitations-domain.ts` and/or
`web-app/app/adapters/invitations.ts`.

- [ ] **Step 1: Do not weaken B1.** Fix the
  product so B1's assertions hold.
- [ ] **Step 2:** `./validate`
- [ ] **Step 3: Commit** present-tense subject
  naming the fault, Co-Authored-By trailer.

If B1 is green, skip this task entirely.

---

### Task A2: Submissions per garden idea

**Files:**
- Modify: `api/test-plan-slices.ts`
- Modify: `tests/test-plan-slices.test.ts`
- Depends: A1 (belt stays red until this commit)

- [ ] **Step 1: Watch A1 still red** (no new test
  required — A1 is the red). Optional pin in
  `tests/test-plan-slices.test.ts`:

```typescript
test('garden ideas each have one submission',
async () => {
    const { db, reveal } = await seeded();
    for (const section of GARDEN) {
        const row = reveal.find(
            (s) => s.section === section,
        );
        assert.ok(row, section);
        const ideas = await deriveIdeas(
            db, row.organizationId,
        );
        assert.equal(ideas.length, 4, section);
        for (const idea of ideas) {
            const submissions =
                await deriveDocumentsAt(
                    db,
                    canonicalUriCollection(
                        row.organizationId,
                        '/ideas/' + idea.id
                            + '/submissions/',
                    ),
                );
            assert.equal(
                submissions.length, 1, idea.id,
            );
        }
    }
});
```

Use the same `deriveDocumentsAt` /
`canonicalUriCollection` imports already in
`tests/test-plan-slices.test.ts`. Run it — FAIL
(zero submissions).

- [ ] **Step 2: Seed submissions**

In `SLICE_ENTITY_IDS`, add the 28 keys from the
minted table (not the three `f2-*` extras; those
are A3).

Extend `GardenIdea`:

```typescript
type GardenIdea = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly pair: MessagePair;
    readonly submissionId: string;
    readonly submissionBody:
        Record<string, unknown>;
    readonly submissionPair: MessagePair;
};
```

Inside `formGarden`'s idea loop, after the idea
pair:

```typescript
const submissionId = sliceEntityId(
    token + '-idea-' + state + '-submission',
);
const submissionBody = {
    idea_id: id,
    member_id: adminId,
    at: requestAt,
};
const submissionPair = await formSeedPair(
    {
        key: seedPairKey(
            'idea-submissions', submissionId,
        ),
        routePattern:
            'organizations/:id/ideas/:id'
            + '/submissions/:sid',
        idParams: [
            organizationId, id, submissionId,
        ],
        organization: organizationId,
        requesterIdentityId: adminId,
        body: submissionBody,
    },
    requestAt,
);
ideas.push({
    id, body, pair,
    submissionId, submissionBody,
    submissionPair,
});
```

Import `postIdeaSubmissionOp` from `./routes.ts`.
In `writeGarden`:

```typescript
...garden.ideas.map((idea) =>
    postIdeaSubmissionOp(
        adapter,
        idea.submissionId,
        idea.submissionBody,
        idea.submissionPair,
    ),
),
```

Set `EXPECTED_SLICE_PAIRS = 378`.

- [ ] **Step 3: Green**

```bash
node --test --strip-types \
    tests/slices-page-boot.test.ts \
    tests/test-plan-slices.test.ts
```

Expected: belt garden `ideas` /
`organization` PASS. Pair count 378.
Hash uniqueness still holds.

- [ ] **Step 4:** `./validate`
- [ ] **Step 5: Commit**

```bash
git add api/test-plan-slices.ts \
    tests/test-plan-slices.test.ts
git commit -m "Seed submissions for slice ideas

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task A3: F2 READY `WB Test Flow`

**Files:**
- Modify: `api/test-plan-slices.ts`
- Modify: `tests/test-plan-slices.test.ts`
- Depends: A2 (same seed file) and A0 (red pin)

- [ ] **Step 1: A0 still red** until this seed.
- [ ] **Step 2: `formF2Extras`**

Do **not** call `postFlowCreationOp` — it always
appends the join. Form op + document the way
garden does, write those two pairs only.

Graph: Create → Capture → Archive. Capture has
`memberIds: [adminId]` and two attributes
(`f2-node-capture-attr-text`,
`f2-node-capture-attr-select`, both `editable`
required). Edge create→capture reuses
`f2-edge-begin`. Edge capture→archive uses
`f2-edge-capture-archive`. No review node. No
work orders.

Create body still includes `projectFlowId` /
`projectFlow` because `validateFlowCreateBody`
requires them. Point them at unused
`f2-project-flow` / `f2-project-approved`.
**Do not** form or write the join pair.

```typescript
async function formF2Extras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<{
    readonly flowId: string;
    readonly body: Record<string, unknown>;
    readonly operation: MessagePair;
    readonly document: MessagePair;
}> {
    const token = 'f2';
    const flowId = sliceEntityId(token + '-flow');
    const createNodeId = sliceEntityId(
        token + '-node-create',
    );
    const captureNodeId = sliceEntityId(
        token + '-node-capture',
    );
    const archiveNodeId = sliceEntityId(
        token + '-node-archive',
    );
    const graph: Record<string, unknown> = {
        nodes: [
            {
                id: createNodeId,
                name: 'Create',
                positionX: 40,
                positionY: 30,
                isCreate: true,
                isArchive: false,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
            {
                id: captureNodeId,
                name: 'Capture',
                positionX: 260,
                positionY: 140,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [
                    {
                        attributeId: sliceEntityId(
                            'f2-node-capture-attr-text',
                        ),
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attributeId: sliceEntityId(
                            'f2-node-capture-attr-select',
                        ),
                        mode: 'editable',
                        isRequired: true,
                    },
                ],
            },
            {
                id: archiveNodeId,
                name: 'Archive',
                positionX: 480,
                positionY: 250,
                isCreate: false,
                isArchive: true,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: sliceEntityId(
                    token + '-edge-begin',
                ),
                name: 'begin',
                fromNodeId: createNodeId,
                toNodeId: captureNodeId,
            },
            {
                id: sliceEntityId(
                    'f2-edge-capture-archive',
                ),
                name: 'archive',
                fromNodeId: captureNodeId,
                toNodeId: archiveNodeId,
            },
        ],
    };
    const relations = buildFlowGraphRelations(
        [{ id: flowId, graph }],
        requestAt,
    );
    const nodeIds = new Set(
        relations.nodes.map((n) => n.id),
    );
    const flowBody: Record<string, unknown> = {
        id: flowId,
        flow: {
            organization_id: organizationId,
            name: 'WB Test Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId: sliceEntityId(
            token + '-project-flow',
        ),
        projectFlow: {
            project_id: sliceEntityId(
                token + '-project-approved',
            ),
            flow_id: flowId,
            at: requestAt,
        },
        initialState: 'active',
        initialStateEventId: sliceEntityId(
            token + '-state-flow',
        ),
        initialStateAt: requestAt,
        graphDelta: {
            nodes: relations.nodes,
            edges: relations.edges,
            deletions: [],
            memberEvents: relations.members.filter(
                (row) => nodeIds.has(
                    row.flow_node_id,
                ),
            ),
            attributeEvents:
                relations.attributes.filter(
                    (row) => nodeIds.has(
                        row.flow_node_id,
                    ),
                ),
        },
    };
    const validated =
        validateFlowCreateBody(flowBody);
    const operation = await formSeedPair(
        {
            key: seedPairKey('flows', flowId),
            routePattern:
                'organizations/:id/flows/',
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowBody,
        },
        requestAt,
    );
    const document = await formSeedPair(
        {
            key: seedPairKey('flows/:id', flowId),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, flowId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowCreateDocumentBody(
                validated,
            ),
        },
        requestAt,
    );
    return {
        flowId, body: flowBody, operation, document,
    };
}
```

If `asNodeAttribute` wants `attribute_id` snake
in the graph literal, match garden/mock — do not
fight the validator. Read
`buildFlowGraphRelations` and use the same key
shape garden nodes would need if they had
attributes.

Wire in `postTestPlanSlices`: `else if
(section === 'F2')` form extras, push writes
(`appendMessagePair` operation then document, or
`postFlowDocumentOp` for the document plus
`appendMessagePair` for the op), set
`reveal.flowId`.

Add the three F2 keys to `SLICE_ENTITY_IDS`.
`EXPECTED_SLICE_PAIRS = 380`.

- [ ] **Step 3: Green**

```bash
node --test --strip-types \
    tests/slices-flow-readiness.test.ts \
    tests/test-plan-slices.test.ts \
    tests/slices-page-boot.test.ts
```

Expected: F2 ready name `WB Test Flow`,
`notReady` empty, pair count 380, belt still
green (F2 pages empty except the new flow on
flows/workbox).

- [ ] **Step 4:** `./validate`
- [ ] **Step 5: Commit**

```bash
git add api/test-plan-slices.ts \
    tests/test-plan-slices.test.ts \
    tests/slices-flow-readiness.test.ts
git commit -m "Seed F2 WB Test Flow ready

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task D1: AT4

**Files:**
- Modify: `TEST-PLAN.md` — Summary AT count 3 → 4;
  Combined TOTAL +1; AT section body. Do not
  rewrite Protocol, G21, or V1.

- [ ] **Step 1: Insert AT4 after AT3**

AT4 text (wrap at TEST-PLAN's own width; this
file is exempt from 78-char lint):

```
- [ ] **AT4** With `POSTGRES_URL` set (A3
  requires it), run `./test-postgres`. The
  suite creates and drops its own
  `fusion_test_*` schema, so it runs against
  A3's database before A1. PASS: exits 0,
  `fail 0`. `./validate` stays Postgres-free.
```

Change the AT intro: it currently says
`./validate` composes all three sub-steps.
AT1–AT3 stay the `./validate` gate. AT4 is
additional, Postgres-gated, still before A1.
The automated layer is four cases. Abort on
any AT red.

Summary table: `| AT. Automated Test Suite | 4 |`.
Bump **Total** 396 → 397 and Combined TOTAL
3717 → 3718 (or recount if those numbers have
already drifted — count `- [ ] **` IDs, do not
invent).

Fix the stale "including 5 skipped" note: AT2
without `POSTGRES_URL` skips the seven
`pg-*.test.ts` / `schema-lifecycle.test.ts`
stubs. After AT4 those seven run.

- [ ] **Step 2: Commit**

```bash
git add TEST-PLAN.md
git commit -m "Add TEST-PLAN AT4 test-postgres

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C1: Retire member state — UI

**Files:** listed in File map Lane C UI.
Not `api/types.ts`. Not TEST-PLAN.md.

- [ ] **Step 1: Red presenter pins**

In `tests/presenter-member-detail.test.ts`,
change assertions that require `#member-state`,
`#ai-state`, `data-member-field="state"`, or an
Active badge so they **fail on current HTML**
(expect those nodes absent). Run the test —
FAIL because the selects still render. Then
delete the select in production so the new
absence assertions PASS.

Do not weaken a test that still names a live
contract. Invert: the new contract is "no state
control".

- [ ] **Step 2: Delete the control**

- `human-member-detail.ts` /
  `ai-member-detail.ts`: delete
  `buildEditableState`; drop `state` from draft
  types, `FIELD_KEYS`,
  `humanMemberDraftFromMember`; drop title-section
  `MEMBER_STATE_CONFIG` badges.
- `member.ts`: delete `#buildStatusBadge`,
  `STATE_ICONS`, `isArchived()` opacity, the
  `MEMBER_STATE_CONFIG` import.
- `state-display.ts`: delete
  `MEMBER_STATE_CONFIG` only (keep idea/project/
  record configs).
- `members/detail.ts`: delete `field === 'state'`
  branches, `stateChanged`,
  `postHumanMemberStateChange` /
  `postAIMemberStateChange` calls. Keep
  `putHumanMember` / `putAIMember` but they still
  take `_stateEcho` until C5 — pass the current
  `stateValue()` echo so the signature still
  typechecks.
- `members/index.ts`: leave `'active'` until C5
  unless you also change
  `postHumanMemberCreation`'s signature in this
  commit — **do not**. One concern: UI.

- [ ] **Step 3:** `./validate`
- [ ] **Step 4: Commit**

```bash
git commit -m "Remove member state controls

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C2: Type cut

**Depends:** C1.

`MemberEntity` becomes `{ id, type }`.
Constructors:

```typescript
new HumanMember(parent, detail, pii)
new AIMember(parent, detail)
new SystemMember(parent)
```

Delete `#state` / `#stateAt` / `#stateEventId`,
`isActive` / `isPending` / `isArchived`,
`stateValue` / `stateAtValue` /
`stateEventIdValue`, `MemberStateDetail`.

Keep `MEMBER_STATES` until C5.

Fabrication:

```typescript
function seatedHumanParent(
    id: MemberId,
): MemberEntity {
    return { id, type: 'human' };
}
```

Same for `agentParent`, `seatedHumanOf`,
`memberParentOf` (drop `current` trio).
`members-union.ts` `SystemMember` parent loses
the trio. `fillHumanMemberPii` rebuilds without
copying state.

`MemberEntityFields = Omit<MemberEntity, 'id'>`
(already almost that).

`SCHEMA.md` Head-state trio: replace "Members GET
rows still embed the lifecycle trio" with the
seat wire `{ id, organization_id, identity_id,
type, at }`.

Regenerate:

```bash
./generate-schema-svg
```

Commit `SCHEMA.svg` in this same commit (schema
of record is `api/types.ts`).

Retarget every `new HumanMember(..., state)` in
**tests** too (`member-fixtures.ts`,
`presenter-member-detail.test.ts`,
`command-palette-search.test.ts`) or `./test`
fails.

Belt `members` / `member-detail` must still
resolve.

- [ ] **Step 1:** Change constructors; run
  `./test` — FAIL on excess state args.
- [ ] **Step 2:** Update call sites to the new
  arity.
- [ ] **Step 3:** `./validate`
- [ ] **Step 4: Commit**

```bash
git commit -m "Cut member lifecycle trio types

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C3: Dead write family

**Depends:** C2.

Delete from `api/routes.ts`:
`postHumanMemberCreationOp`,
`postAiMemberCreationOp`, `postAiMemberEditOp`,
`postHumanMemberEditOp`, `memberDocumentBodyOf`.
`memberDocumentEntityOf` does not exist (comment
only) — delete that comment.

Delete validators:
`validateHumanMemberCreateBody`,
`validateAIMemberCreateBody`,
`validateAIMemberEditBody`,
`validateHumanMemberEditBody`,
`validateMemberDocumentBody`,
`MemberDocumentBody`. Keep
`validateAiMemberDocumentBody` /
`validateHumanMemberDocumentBody` /
`validateMemberEntity` unless they cannot compile
without the deleted types.

`tests/api-member-documents.test.ts`: keep the
three retired-404 cases (`PUT members/:id` …).
Drop `validateMemberDocumentBody` cases.

`tests/drift-roster.test.ts`: delete
`MEMBERS_TEST_WIRING`. Keep AI/human facet
wiring.

`tests/derive-states-union.test.ts`: rewrite any
`memberDocumentBodyOf` leftover.

- [ ] **Step 1:** Delete; `./validate`
- [ ] **Step 2: Commit**

```bash
git commit -m "Delete retired member write ops

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C4: Legacy derive and seed

**Depends:** C3.

Delete `deriveMemberStates` and
`MEMBERS_DOCUMENT_PREFIX` from
`api/derive-states.ts`.

In `api/derive-members.ts` delete leftover
`/members/` readers (`MEMBERS_PREFIX`,
`memberParentOf`, `deriveMemberParents`,
`deriveMemberParent`) **if** `deriveMembers` still
builds the roster from seats ∩ identities without
them. Gate from the spec: nothing but
`deriveMemberStates` reads `/members/` — after
this commit, nothing does.

`api/mock-data/members.ts`: drop `state:
MemberState` from the seed type and every row.
`member.state` is unread.

Delete unused `bootstrapSystemStateEventId`.
Scrub members/:id genesis comments.

Retarget `tests/mock-data-valid.test.ts`,
`drift-states.test.ts`,
`drift-phase15-cores-parity.test.ts`.

Measure:

```bash
node --test --strip-types \
    tests/mock-data-pairs.test.ts
```

If 1448/8 still match, leave them. If not, set
the constants to the measured counts and update
`CLAUDE.md` / `SCHEMA.md` / `ARCHITECTURE.md`
pins in this same commit.

- [ ] **Step 1:** Delete derive; `./validate`
- [ ] **Step 2: Commit**

```bash
git commit -m "Drop leftover member state derive

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C5: Alphabet and stubs

**Depends:** C4.

Delete `MEMBER_STATES`, `MemberState`,
`isMemberState`, `assertMemberState`.

Delete `postHumanMemberStateChange` /
`postAIMemberStateChange`. Drop `_stateEcho` from
`putHumanMember` / `putAIMember` and
`_initialState` from `postHumanMemberCreation`.
`members/index.ts` loses the `'active'` argument.

`member-fixtures.ts`: drop `state` / `_state`.
`adapters-admin.test.ts`: `seedMember(db, id)`
only; pending/archived seeds were seats anyway —
`activePeopleCount` still counts humans.

- [ ] **Step 1:** Delete alphabet; `./validate`
- [ ] **Step 2: Commit**

```bash
git commit -m "Delete member state alphabet

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task C6: Member-state docs

**Depends:** C5 and D1 (D1 owns AT lines).

- `ARCHITECTURE.md` 38–42: delete the State-select
  paragraph. Fix constructor arity nearby.
- `API.md` §3.4 and `memberStateEvents` (~3360):
  retire the trio/edit-lifecycle story. Seat GET
  is `{ id, organization_id, identity_id, type,
  at }`.
- `SCHEMA.md`: alphabets, history map item 6
  (`GET members/:id/versions` /
  `deriveMemberStates`), domain note.
- `TEST-PLAN.md` **only** these cases: G21 (drop
  State clause and badge sentence; keep Phone /
  Bio / strength chips), G20 (drop State select
  `#member-state` / `MEMBER_STATES`), G24a (drop
  `#ai-state`), G11/G19/AA8 status-badge mentions,
  AA6 `(pending)` / `(archived)` on Emily /
  James.

Do not touch Protocol, V1, G43, AT.

- [ ] **Step 1: Edit docs**
- [ ] **Step 2: Commit**

```bash
git commit -m "Document member state retirement

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task E1: TEST-PLAN corrections

**Depends:** A2, A3, B1 or B2, C6, D1.

`TEST-PLAN.md` only. Leave C6's G21/AA6 as they
landed; if G21 still mentions State, C6 missed —
fix it here as the same concern if still present.

- [ ] **How to invoke step 5 + hunter prompt**

Remove `isolatedContext`. State: this MCP has no
isolated contexts — one Chrome profile, one
cookie jar, one selected page. Parallel mode
keeps its seed and per-section hunters; the
master dispatches them **one at a time**, joining
each before the next. Each hunter begins by
deleting site data for the origin so the shared
jar carries no previous hunter's refresh cookie.
The CLI belt is the parallel layer.

Hunter prompt: drop `isolatedContext name:
{SECTION}`. Add: delete site data for the origin
before sign-in.

- [ ] **Protocol parallel bullet:** spawn hunters
  sequentially, join each, then next. Keep A3
  slice seed.
- [ ] **Historical note:** keep `isolatedContext`
  as history. Add that the 2026-08-22 parallel
  hunters shared one profile.
- [ ] **A3** parallel PASS: add "F2 names
  `flow_id`".
- [ ] **AA-WB-SETUP:** verify seeded `WB Test
  Flow` (reveal `flow_id`) is READY in Create
  Work Order. No gesture build.
- [ ] **AA9:** name `.strength-chip` buttons with
  `data-strength`, toggled by click.
- [ ] **V1:** parallel mode invite
  `unseated_username`
  (`g-unseated@test-plan.example`). Serial keeps
  the Wayne-only mock example.
- [ ] **G43:** parallel expectation: G roster is
  G admin, `G Member`, `G Unseated`, one agent,
  and the system service identity; org-2 PII
  fence has no subjects in the slice. Serial
  keeps the mock Stark roster.
- [ ] **G46:** erase `G Member` (never the
  admin).
- [ ] **G47:** register the system service
  identity.
- [ ] **I26:** restore a case in the hole between
  I25 and I27. Snapshots are gone — do **not**
  restore download/wipe/upload. Use:

```
- [ ] **I26** Confirm Snapshots is gone: sidebar
  has no Snapshots item; `snapshots/` is not a
  PAGE_REGISTRY page (unsigned load is the
  not-found page, not a restore UI). Historical
  I26 (download → wipe → upload) retired with
  the snapshots page.
```

Recount section I if this adds a case (29 → 30)
and fix Summary / Combined TOTAL.

- [ ] **AA/B/G extra ids:** count `- [ ] **ID`
  markers vs the Summary table; fix the table,
  do not invent cases.

- [ ] **Commit**

```bash
git add TEST-PLAN.md
git commit -m "Correct TEST-PLAN to slice MCP

Co-Authored-By: Grok 4.6 <grok@x.ai>"
```

---

### Task F1: SV3 by measurement

**Depends:** E1.

`refreshCookieIsSecure` (`api/authentication.ts`
165–171) returns false only for
`http://localhost`. `http://127.0.0.1` already
gets `Secure`.

- [ ] **Step 1: Measure**

Sign in on `http://localhost:$PORT` and
`http://127.0.0.1:$PORT` in Chrome. Inspect the
jar.

Needs `./serve` (or compose) with
`POSTGRES_URL` and `JWT_HMAC_SIGNING_KEY`. If
the environment cannot open Chrome, record that
in the commit message and do not change code.

- [ ] **Step 2a: Both store Secure**

Delete `refreshCookieIsSecure`.
`refreshCookieAttributes` always pushes
`Secure`. SV3 text stands.

```typescript
function refreshCookieAttributes(
    request: Request,
    extra: readonly string[],
): string {
    void request;
    return [
        'HttpOnly',
        'SameSite=Strict',
        'Path=' + REFRESH_COOKIE_PATH,
        ...extra,
        'Secure',
    ].join('; ');
}
```

If `request` becomes unused, drop the parameter
only if every caller can follow — otherwise keep
the arg and prefix `void request`.

- [ ] **Step 2b: Either rejects Secure**

Leave the code. Correct SV3's parenthetical to
the measured truth (localhost HTTP is not
Secure; 127.0.0.1 is, or whatever you saw).

- [ ] **Step 3: Commit** with the measurement in
  the subject/body (body allowed here because
  the spec requires the recorded result):

```
Settle SV3 refresh Secure by measurement

localhost http: <Secure|not>
127.0.0.1 http: <Secure|not>

Co-Authored-By: Grok 4.6 <grok@x.ai>
```

---

## PR Plan (stack order)

### PR 1: Add slice page-boot belt (red)

- **Files:** `tests/slices-page-boot.test.ts`
- **Dependencies:** None
- **Description:** Task A1

### PR 2: Add F2 flow-readiness pin (red)

- **Files:** `tests/slices-flow-readiness.test.ts`
- **Dependencies:** None
- **Description:** Task A0

### PR 3: Pin slice invitation lifecycle

- **Files:**
  `tests/slices-invitation-lifecycle.test.ts`
- **Dependencies:** None
- **Description:** Task B1

### PR 4: Seed submissions for slice ideas

- **Files:** `api/test-plan-slices.ts`,
  `tests/test-plan-slices.test.ts`
- **Dependencies:** PR 1
- **Description:** Task A2. Greens PR 1 garden
  pages.

### PR 5: Invitation product fix (optional)

- **Files:** named by PR 3 failure
- **Dependencies:** PR 3
- **Description:** Task B2. Skip if PR 3 green.

### PR 6: Seed F2 WB Test Flow ready

- **Files:** `api/test-plan-slices.ts`,
  `tests/test-plan-slices.test.ts`,
  `tests/slices-flow-readiness.test.ts`
- **Dependencies:** PR 2, PR 4
- **Description:** Task A3

### PR 7: Add TEST-PLAN AT4 test-postgres

- **Files:** `TEST-PLAN.md`
- **Dependencies:** None
- **Description:** Task D1

### PR 8: Remove member state controls

- **Files:** presenters + members pages +
  presenter tests
- **Dependencies:** None
- **Description:** Task C1

### PR 9: Cut member lifecycle trio types

- **Files:** `api/types.ts` and fabrication
  sites, SCHEMA, test constructors
- **Dependencies:** PR 8
- **Description:** Task C2

### PR 10: Delete retired member write ops

- **Files:** `api/routes.ts`, validators, tests
- **Dependencies:** PR 9
- **Description:** Task C3

### PR 11: Drop leftover member state derive

- **Files:** derive-states, derive-members, mock
  seed, drift tests
- **Dependencies:** PR 10
- **Description:** Task C4

### PR 12: Delete member state alphabet

- **Files:** types, adapter stubs, fixtures
- **Dependencies:** PR 11
- **Description:** Task C5

### PR 13: Document member state retirement

- **Files:** ARCHITECTURE.md, API.md, SCHEMA.md,
  TEST-PLAN.md (member cases)
- **Dependencies:** PR 12, PR 7
- **Description:** Task C6

### PR 14: Correct TEST-PLAN to slice MCP

- **Files:** `TEST-PLAN.md`
- **Dependencies:** PR 4, PR 6, PR 3 (or 5),
  PR 13, PR 7
- **Description:** Task E1

### PR 15: Settle SV3 refresh Secure by measurement

- **Files:** `api/authentication.ts` and/or
  `TEST-PLAN.md` SV3
- **Dependencies:** PR 14
- **Description:** Task F1

---

## Self-review

**Spec coverage**

| spec | task |
|---|---|
| §1 belt | A1 |
| §2 submissions | A2 |
| §3 invitations | B1 / B2 |
| §4 F2 READY | A0 + A3 |
| §5.1–5.6 | C1–C6 |
| §6 AT4 | D1 |
| §7 TEST-PLAN | E1 |
| §8 SV3 | F1 |
| belt after type cut | C2 keeps A1 green |
| non-goal member state on pair plane | C* delete only |
| `schema-svg` FK_SPECIAL | out of scope |

**Type names:** `MemberEntity` `{ id, type }`
after C2; `claimToken` roles `admin:` + org;
submission body `{ idea_id, member_id, at }`;
F2 name `WB Test Flow`.

**Placeholders:** none. IDs are minted. B2 is
conditional, not TBD.

---

## Orchestrator notes

1. Dispatch Wave 0 (A1, A0, B1, D1, C1) as five
   subagents. Prefix every prompt `Go to Medium
   Church!`. Paste the task text; do not tell
   them to read this whole file.
2. Join. If B1 red, dispatch B2 before E1.
3. A2 only after A1 is committed.
4. A3 only after A2 and A0.
5. C2–C6 strictly sequential.
6. C6 after D1 so AT lines do not collide.
7. E1 last TEST-PLAN pass.
8. F1 needs a browser. If Chrome is unavailable,
   commit the inability in the message and leave
   both artifacts unchanged — do not guess SV3.

After all tasks: `./validate`. Do not re-run the
browser TEST-PLAN (spec non-goal).
