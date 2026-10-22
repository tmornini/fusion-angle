# Service members Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Every actor in an organization is an identity
with an accepted membership. The memberships statement
creates human, AI, and service members. AI and service
documents move under one organization. Neither is ever an
organization admin. `client_secret` and the identities
page's create go, and G47 is restored.

**Architecture:** Pairs of commits: a red pin, then the
change that turns it green, each at the lowest layer that
can see it. The generic document-family machinery
(`api/document-family.ts`) carries both organization
families. A new `documentEditHandler` makes their PUT edit
only. The statement's body gains a `kind` discriminator,
and each kind declares its own geneses. The client sorts
the roster by asking which organization document a
membership's identity names. Docs come last.

**Tech Stack:** Deno 2.9.6, TypeScript under `deno.json`
(`strict`, `noUnusedLocals`, `noUnusedParameters`,
`noUncheckedIndexedAccess`), `@std/assert`, the in-process
`handleRequest` gate, the memory adapter, Chrome over CDP
for `tests/browser/`.

**Spec:** `docs/superpowers/specs/service-members-design.md`
(commit `2af0b94b`). Executors read the spec and this plan.
Do not reopen the spec's twelve decisions or the owner's
two rulings below.

## Execution ground

- Worktree:
  `/Users/tmornini/code/fusion-angle/.worktrees/service-members`,
  branch `service-members`, based on `next-release` at
  `e9cc642c`. The spec is `2af0b94b`, and this plan rides
  the next commit. Every command runs from the worktree.
- The owner lands the branch. No task, implementer,
  reviewer, or controller rebases, merges, lands, pushes,
  or force-pushes. Nobody commits on `next-release` or
  `master`, and nobody creates a worktree. No Agent
  dispatch passes `isolation`.
- Never run `./deploy`, `./bin/build`, `./bin/measure`,
  `./bin/postgres-seed`, or `./bin/postgres-wipe`.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any `deno`,
  `./test`, or `./deploy` command. A fresh `DENO_DIR`
  downloads from `jsr.io` and npm. Under the sandbox,
  declare `jsr.io`, `registry.npmjs.org`, and
  `*.npmjs.org` on the Bash call. If a download is
  refused, report the refusal; do not work around it.
- Pre-flight: `./test check` passed at `2af0b94b` in this
  sandbox, with no TS7006 cache fault.
- Layer 1 is `./test validate`. Run it on the dirty tree,
  before `git commit`: a clean HEAD may SHA-skip, and a
  skip proves nothing about the edit.
- Layer 2 runs outside the sandbox only when the whole
  Bash command is exactly `./test browser` or
  `./test validate browser`, with no `export`, `&&`,
  pipe, redirect, or env prefix. The `DENO_DIR` export
  therefore goes in an earlier, separate Bash call. A
  compound form stays sandboxed and fails with "Chrome
  DevToolsActivePort timed out". If Chrome cannot run,
  report BLOCKED with the output. Never skip Layer 2.
- A red commit's run is captured to
  `$TMPDIR/service-members/task<N>-red.log`.

## Global Constraints

- Every commit is green at Layer 1, except the red-pin
  commits this plan names as red. A red commit is lint
  green and fails only its named cases. It is also
  type-check green, except in Tasks 21, 23, and 29. Each
  of those pins a name its green task creates, so
  `./test check` fails there with exactly the TS2307 or
  TS2345 errors the task names. `./test` runs with
  `--no-check`, so the pins still run and fail on their
  assertions, or fail at file load for a missing module.
- The Layer 2 red commits are Tasks 9 and 25, plus the
  browser case in Task 29. Each is red only in its named
  cases.
- The branch tip is green at Layer 2 and at
  `./test postgres` before hand-off.
- Commit subject: about 50 characters, present-tense
  imperative, exactly as the task names it. Its only body
  is the trailer, committed as
  `git commit -m "<subject>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.
- Stage by path only (`git add <path>…`). Never
  `git add -A` or `git commit -a`.
- Lines are at most 78 characters in every file
  `./test lint` lints (code and scripts, not `.md`).
  Indent is 4 spaces. No inline styles: use CSS custom
  properties and classes, per DESIGN-SYSTEM.md.
- `grant` is a verb. Prose names a person "organization
  admin" or "operator", never a bare "admin". The role
  string `admin` and the membership type `'admin'` stay.
- A rewritten test keeps every assertion it had, unless
  its covenant left with the code. Each task names any
  test it deletes and the spec decision that retires it.
- Every route change regenerates the API documentation in
  the same commit, with `./bin/generate-api-documentation`.
  Expected output: `wrote web-app/api-documentation`.
  `./test` runs its `--check`. Route edits do not touch
  `SCHEMA.svg`: its inputs are `shared/types.ts`'s
  `MessagePairEntity`, `api/db.ts`, and
  `api/schema-postgres.ts`, and no task changes them.
- `TEST-PLAN.md` may cite only test files that exist.
  `./test`'s lint fails on a dead path. A task that
  deletes a test file fixes that file's TEST-PLAN
  citations in the same commit.
- The codebase's patterns:
  - `RequestContext` is the first argument to client
    verbs.
  - A client verb returns an `HttpMessage`, an array of
    them, or a value that keeps one.
  - A write from a held message takes the message it
    latches.
  - Presenters return `SafeHtml`.
  - Storage is snake_case and the domain camelCase.
  - Adapters use HTTP-verb naming
    (`getNoun`/`putNoun`/`deleteNoun`/`postNounOperation`).
  - Validators sit at the gate, not downstream.
  - No untyped `any` comes in from an external boundary.

## Owner rulings and settled calls

The owner answered two questions while this plan was
written.

1. **Reinstatement.** The item PUT's `removed → accepted`
   (`api/memberships.ts:138-168`, pinned by
   `tests/api-memberships.test.ts:661` 'removed to
   accepted restores the seat') stays. It reinstates an AI
   or service member like a human, and the new admin
   refusal still blocks `type: 'admin'`. Spec decision 9's
   "removal is permanent" holds only for the statement,
   which answers 409 on an existing identity. Task 38
   files the Later-work line as "a members-page control to
   reinstate a removed member; the API already reinstates
   through the item PUT".
2. **Remove for AI and service members.** The AI member
   detail and the new service member detail each get the
   human's Remove affordance and confirm dialog (Task 30).
   `postMembershipRemoval` takes any seated member.

The spec's "Claude's call" items stand as written:

- An AI is live while its membership is accepted
  (Tasks 19 and 20).
- The statement answers 409 on an existing identity.
- `POST identities/` keeps its person branch.
- Each seeded AI joins Stark, since no seeded flow names
  one in Wayne (Task 18).
- Member kinds are `human`, `ai`, and `service`, and both
  AI and service members have a `service` identity.

## Builder's decisions this plan fixes

These are the spec's "Left to the builder" items.

- **The statement body.** A top-level `kind` names the
  member kind, and the body is exactly one of:
  - `{ id, kind: 'human', membership: { type, at }, identity: { title, department, strengths, team_dimensions }, pii: { name, email, phone, bio } }`
  - `{ id, kind: 'ai', membership: { type, at }, ai: { name, description, skill_focus, model } }`
  - `{ id, kind: 'service', membership: { type, at }, service: { name, description } }`

  `kind` is required. A missing or unknown kind is 400,
  because a defaulted kind would be a comfortable lie.
- **Wiring.** `AI_AGENTS_WIRING` and a new
  `SERVICES_WIRING` take `httpNest: 'organization'`, and
  both registry rows take `organizationNested: true`.
  Their item routes are
  `organizations/:id/ai-agents/:id` and
  `organizations/:id/services/:id`.
- **"PUT never creates."** One generic
  `documentEditHandler(wiring)` sits in
  `api/document-family.ts` beside `documentPutHandler`.
  It reads the head and takes `throwDocumentMiss` on an
  absent one, as `documentSelect` does in that file.
  Paired with `conditional: 'required'`, a PUT with no
  precondition gets the gate's 428, and an absent id gets
  404 whatever conditional it carries. The organization
  document (`putLiveOrganizationDocumentOp`) and work
  orders (`requireWorkOrderHead`) keep their own checks.
  This plan does not refactor them.
- **The roster's member kind.** A member is human if and
  only if its identity's kind is `'person'`. The
  memberships read carries a server-derived
  `identity_kind` (`person` | `service`), which is not
  stored. Every reader classifies with one predicate,
  `isHumanSeat` (`client/members.ts`). One rule
  everywhere.
- **Every member kind uses a seat; only people count as
  active people.** `usedSeats`
  (`web-app/app/organization-view.ts`,
  `deriveOrganizationFacts`) counts every accepted
  membership's identity, AI and service included.
  `activePeopleCount` (`client/admin.ts`,
  `getOrganizationStats`) counts person seats only
  (`seats.filter(isHumanSeat)`), so no AI or service
  reads as a human.
- **No role control to hide.** Spec decision 11 says the
  members page shows no role control for an AI or service
  member. The page shows none for anyone today: no
  presenter renders one, and `postHumanMemberCreation`
  hard-codes `type: 'member'` (`client/members.ts:275`).
  So the page side holds with no change, and the API
  refusal (Task 8) is the whole rule.
- **A service member detail page** shows the service's
  name, its description, and a link to its identity, plus
  Edit and Remove. Edit is the owner's ruling, given
  after this plan was first drafted. It works as the AI
  page's does: Name and Description are both required,
  and the PUT
  `organizations/:id/services/:id` latches the read it
  came from.

## Order, and where it departs from the prompt

The prompt's order holds, except for three moves that
dependencies force.

1. **The non-creating AI PUT lands last among the code
   tasks (Tasks 31-32), not with the move (Task 2).** Until
   Task 28, the members page creates an AI by PUT. Until
   Task 20, the AI test fixtures create one the same way.
   Refusing the create first would break the page between
   commits.
2. **The seed (Tasks 17-18) lands inside the members-page
   group.** It comes after the roster sort (Tasks 15-16)
   and before AI liveness (Tasks 19-20). Once liveness
   reads accepted memberships, an AI with no membership
   leaves the picker and fails the flow write law. The
   seeded Claude Sonnet sits in Lead-to-Close's Inbound
   Triage `agentIds` (`api/mock-data/lead-to-close-flow.ts:69`,
   `:85-95`), so the seed must already give it a
   membership. The roster sort must land before the seed
   for the same reason: a seeded AI membership would
   otherwise read as a human with erased PII.
3. **G44 is rewritten in Task 10, not in the docs tail.**
   Task 10 deletes `tests/adapters-identity-creation.test.ts`,
   and G44 cites it (`TEST-PLAN.md:5844`). `./test`'s lint
   fails on a dead path.

The prompt puts both TODO.md closures in the docs tail
(Task 38). The spec's Docs line says "both lines close in
the commit that lands their behavior". This plan follows
the prompt and flags the conflict for the owner.

## Review Focus

These are the five failure modes most likely to bite a
person that the spec implies and no spec test exercises.
Each is pinned in the task named.

1. **An AI or service member read as a human.** The
   following must agree on one rule:
   - the command palette (`web-app/app/command-palette.ts:318`)
   - the flow designer's people picker (`web-app/flows/detail.ts:1711`)
   - the organization's people count (`client/admin.ts:79-84`)
   - member detail's human-first load (`web-app/members/detail.ts:150-174`)

   Pinned in Task 15, at `getHumanMemberMap`,
   `getHumanMember`, and `getOrganizationSeats`.
2. **A removed AI still offered or accepted.** A removed
   AI's id must leave the designer's AI picker and fail
   `agentIds` at the write law (400). Its document stays,
   and its id stays refused in `memberIds`. Pinned in
   Task 19.
3. **A double click on Create.** The id is minted once per
   dialog session (`pendingMemberId`,
   `web-app/members/index.ts:77`). A second submit of the
   same session answers 409 and adds no second member,
   for every kind. Pinned in Task 21 at the client verb.
   Task 26's dialog keeps `currentMemberId()`.
4. **A foreign id or a foreign path.** A Wayne token gets
   403 on Stark's `ai-agents/` or `services/` path. Under
   its own path, a Stark id answers 404. Pinned in Tasks 1
   and 3.
5. **Promotion through a side door.** Each must refuse an
   AI or service member as admin:
   - a direct seat (`If-None-Match: *`, `type: 'admin'`)
   - a retype (`accepted → accepted`, `type: 'admin'`)
   - a reinstatement (`removed → accepted`, `type: 'admin'`)

   Pinned in Task 7.

---

## Dispatch and review protocol

The controller follows
superpowers:subagent-driven-development. For each task it
dispatches the agent the task names, with the
**Implementer prompt** below and the task's full section
pasted under it. After each writing task, one read-only
`planner` reviews the commit with the **Review prompt**. A
failed review returns to a fresh implementer of the same
type, carrying the findings. While the commit is still the
branch tip, the fix is amended into it
(`git commit --amend --no-edit`) and Layer 1 is rerun. A
second failed round goes to `architect`.

After Task 38, an `architect` reviews the whole branch
with the **Branch review prompt**. A fix it requires lands
as its own commit, with Layer 1 green.

One worker per worktree: writing tasks run one at a time,
in order. Only read-only agents run in parallel.

### Implementer prompt

```
Go to Medium Church!

You implement Task <N> of
docs/superpowers/plans/service-members.md in the worktree
/Users/tmornini/code/fusion-angle/.worktrees/service-members
(branch service-members). Work only there. Create no
worktree, pass no isolation, and never rebase, merge,
push, or force-push. Never run ./deploy, ./bin/build,
./bin/measure, seed, or wipe. Before any deno or ./test
command, run export DENO_DIR="$TMPDIR/deno-dir" as its own
Bash call. Run ./test browser and ./test validate browser
as the whole Bash command, with nothing else on the line.

Read the spec
(docs/superpowers/specs/service-members-design.md), then
the plan's Global Constraints, Builder's decisions, and
Task <N>, pasted below. Do exactly Task <N>'s steps.
Write only what the task holds: no extra helper, fixture,
or assertion. A red task touches no product file.

Codebase brief:
- Lines are at most 78 characters in files ./test lint
  lints (code and scripts, not .md). Indent is 4 spaces.
  No inline styles: use CSS custom properties and
  classes, per DESIGN-SYSTEM.md.
- Commit subjects are present-tense imperative, about 50
  characters, with the Co-Authored-By trailer as the only
  body. Stage by path.
- "grant" is a verb. Prose says "organization admin" or
  "operator", never a bare "admin". The role string
  'admin' stays.
- RequestContext is the first argument to client verbs.
  A client verb returns an HttpMessage, an array of them,
  or a value that keeps one. A write from a held message
  takes the message it latches.
- Presenters return SafeHtml.
- Storage is snake_case and the domain camelCase.
- Adapters use HTTP-verb naming
  (getNoun/putNoun/deleteNoun/postNounOperation).
- Validators sit at the gate, not downstream.
- No untyped any comes in from an external boundary.
- noUncheckedIndexedAccess is on. noUnusedLocals is on,
  so remove any import you stop using.
- Every transaction body awaits only row operations.

Commandments touched: <the task's list>.
Abominations risked: <the task's list>.

Report: the commit SHA; the ./test validate summary; for
a red task, the exact FAILED lines; for a Layer 2 task,
the ./test browser summary.
```

### Review prompt (planner, read-only, after each task)

```
Go to Medium Church!

Review Task <N> of docs/superpowers/plans/service-members.md,
committed as HEAD in the worktree
/Users/tmornini/code/fusion-angle/.worktrees/service-members.
Work only there. Edit nothing and commit nothing. Create
no worktree and pass no isolation. Before any deno or
./test command, run export DENO_DIR="$TMPDIR/deno-dir" as
its own Bash call.

Read the spec, then the plan's Global Constraints,
Builder's decisions, Review Focus, and Task <N>. Run
`git show HEAD`. Judge three things:
1. Spec compliance. The diff does exactly what Task <N>
   names. The subject matches it character for
   character, and the only body is the trailer.
2. Doctrine. Name every violation of the commandments and
   abominations Task <N> lists, and any of: Test
   Weakening, Unbidden Helper Code, Internal Defense,
   Default Values, Swallowed Failures.
3. Proof. Rerun the task's gate command and report its
   summary. For a red task, confirm that exactly the
   named cases fail, each on its named assertion. For a
   rewritten test, confirm every kept assertion is still
   there.

Codebase brief: as in the Implementer prompt.

Report APPROVED, or a numbered list of findings, each
with file:line and the fix.
```

### Branch review prompt (architect, read-only, after Task 38)

```
Go to Medium Church!

Review the whole branch service-members in the worktree
/Users/tmornini/code/fusion-angle/.worktrees/service-members:
`git log --oneline 2af0b94b..HEAD` and
`git diff 2af0b94b..HEAD`. Edit nothing and commit
nothing. Create no worktree and pass no isolation. Before
any deno or ./test command, run
export DENO_DIR="$TMPDIR/deno-dir" as its own Bash call.

Read the spec and the plan in full. Judge:
- Every spec decision and Verification line is
  implemented, one concern per commit, in the plan's
  order.
- Red commits fail only their named cases. The Layer 1
  red logs under $TMPDIR/service-members/ match.
- No deleted test outside those the plan names. No
  rewritten test lost an assertion.
- The Review Focus five, read against HEAD.
- `grep -rn "client_secret" api client shared server web-app`
  prints nothing.
- `grep -rn "'ai-agents/'\|\"/ai-agents/\|'/ai-agents'" api client web-app`
  shows no global-plane route.
- Doctrine: Reliability, Security, Uniformity, Clarity,
  Idempotency, Simplicity; Test Weakening, Unbidden
  Helper Code, Internal Defense, Foreign Tongues, Default
  Values.

Codebase brief: as in the Implementer prompt.

Report APPROVED, or a numbered list of findings, each
with file:line, a severity, and the fix.
```

---

## Part A: AI documents move under the organization

### Task 1: Pin the organization-scoped AI routes

**Agent:** `coder`

**Commit subject:** `Pin the organization-scoped AI routes`

**Brief:** Commandments: Security (foreign path and id),
Reliability, Uniformity. Abominations: Unbidden Helper
Code, Test Weakening.

**Files:**
- Modify: `tests/api-ai-agents.test.ts`. Add three cases
  after the imports' helpers, before
  'PUT /ai-agents/:id writes the four fields; GET returns
  them' (`:97`).
- Modify: `tests/api-routes.test.ts:37`, the
  `SERVED_COLLECTIONS` entry.

**Interfaces:**
- Consumes the file-local helpers `req`, `freshDb`, and
  `agentFields`, plus the imports already in
  `tests/api-ai-agents.test.ts`. Add
  `claimToken` (`tests/token-fixtures.ts:83`) to its
  token import, `GETCollection`
  (`tests/in-page-facade.ts:133`) to its facade import,
  and `partBodiesOf` (`tests/http-fixtures.ts`) to its
  http-fixtures import.
- Produces three case names that Task 2 turns green:
  - 'an AI document lives under its organization'
  - 'another organization reads no AI of ours'
  - 'the global ai-agents routes are gone'

  It also changes the generated case
  `GET organizations/<STARK>/ai-agents/ selects nothing
  on an empty db`.

- [ ] **Step 1: Add the three cases**

```ts
const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';

function aiPath(organization: string, id = ''): string {
    return '/organizations/' + organization
        + '/ai-agents/' + id;
}

Deno.test('an AI document lives under its organization',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const body = agentFields('Scoped agent');
    const put = await handleRequest(db, req(
        'PUT', aiPath(STARK, id), DEV_TOKEN, body,
    ));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
    const got = await handleRequest(db, req(
        'GET', aiPath(STARK, id), DEV_TOKEN,
    ));
    assertStrictEquals(got.status, 200);
    assertEquals(await got.json(), { id, ...body });
    const listed = await handleRequest(db, req(
        'GET', aiPath(STARK), DEV_TOKEN,
    ));
    assertStrictEquals(listed.status, 200);
    assertEquals(
        (await partBodiesOf<{ id: string }>(listed))
            .map((row) => row.id),
        [id],
    );
});

// Foreign path 403 at the organization fence; a Stark id
// under Wayne's own path does not exist there (404).
Deno.test('another organization reads no AI of ours',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    const put = await handleRequest(db, req(
        'PUT', aiPath(STARK, id), DEV_TOKEN,
        agentFields('Stark agent'),
    ));
    assertStrictEquals(put.status, 201);
    await put.body?.cancel();
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const foreignPath = await handleRequest(db, req(
        'GET', aiPath(STARK, id), wayne,
    ));
    assertStrictEquals(foreignPath.status, 403);
    await foreignPath.body?.cancel();
    const foreignId = await handleRequest(db, req(
        'GET', aiPath(WAYNE, id), wayne,
    ));
    assertStrictEquals(foreignId.status, 404);
    await foreignId.body?.cancel();
    assertEquals(
        await GETCollection(
            db, aiPath(WAYNE).slice(1), wayne,
            operationIdHeader(),
        ),
        [],
    );
});

Deno.test('the global ai-agents routes are gone',
async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const [method, path, body] of [
        ['GET', '/ai-agents/', undefined],
        ['GET', '/ai-agents/' + id, undefined],
        ['PUT', '/ai-agents/' + id, agentFields('Global')],
    ] as const) {
        const res = await handleRequest(db, req(
            method, path, DEV_TOKEN, body,
        ));
        assertStrictEquals(res.status, 404, method + path);
        await res.body?.cancel();
    }
});
```

- [ ] **Step 2: Retarget the served-collection row**

At `tests/api-routes.test.ts:37`, replace `'ai-agents/',`
with `'organizations/' + STARK + '/ai-agents/',`.

- [ ] **Step 3: Layer 1 is red in exactly these four
  cases**

Run `./test check`, then `./test lint`. Both exit 0.

Run `./test 2>&1 | tee "$TMPDIR/service-members/task1-red.log" | tail -60`
(after `mkdir -p "$TMPDIR/service-members"`). Expected:
FAILED, with exactly these four cases red:

| Case | Actual | Expected |
|---|---|---|
| 'an AI document lives under its organization' | 404 | 201 |
| 'another organization reads no AI of ours' | 404 | 201 |
| 'the global ai-agents routes are gone' | 200/204 | 404 |
| 'GET organizations/…/ai-agents/ selects nothing on an empty db' | rejects 404 | `[]` |

If any other case is red, stop and report.

- [ ] **Step 4: Commit**

```bash
git add tests/api-ai-agents.test.ts tests/api-routes.test.ts
git commit -m "Pin the organization-scoped AI routes" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Move AI agents under the organization

**Agent:** `architect` (the wiring, the law's signature,
and the client path are interfaces every later task
builds on, and the change touches about twenty test
files)

**Commit subject:** `Move AI agents under the organization`

**Brief:** Commandments: Security, Uniformity,
Reliability, Generality (the move rides the generic
family machinery, with no special case). Abominations:
Coupling, Foreign Tongues, Test Weakening (only paths
change, never an assertion), Internal Defense.

**Files:**
- `api/family-registry.ts:84-92`: the `ai-agents` row
  takes `organizationNested: true`. Rewrite its two
  comments: organization plane, one document per
  organization, and genesis is the members statement
  (Task 6). Until Task 32, PUT also creates.
- `api/routes.ts`:
  - `:513-525`: `AI_AGENTS_WIRING` takes
    `httpNest: 'organization'`. Rewrite the comment as
    "an organization's AI member document; its identity is
    a `service` identity (Task 6)".
  - `:2980`: the spec key becomes
    `'organizations/:id/ai-agents/:id'`.
  - `:3662-3670`: the four routes become
    `documentCollectionRoute(AI_AGENTS_WIRING)`,
    `documentEntityRoute(AI_AGENTS_WIRING)`,
    `documentVersionsSelectRoute(AI_AGENTS_WIRING)`, and
    `documentVersionSelectRoute(AI_AGENTS_WIRING)`. Move
    all four beside the objectives routes (`:5242-5244`),
    in that order.
  - `:1306-1315`: the flow write law, below.
  - `:1319-1327`: `postFlowDocumentOp`.
  - `:4191`: the POST flows caller.
- `api/document-family.ts:171-186`: `liveGlobalDocumentIds`
  becomes `liveOrganizationDocumentIds`. Its comment
  names the organization prefix.
- `api/message-pair.ts:1816`: `'ai-agents/:id'` becomes
  `'organizations/:id/ai-agents/:id'`.
- `api/authorization.ts:144`: delete the
  `'/ai-agents': ['GET'],` row. The `'/organizations/:id'`
  GET row (`:148`) already admits a member's GET at any
  depth.
- `api/mock-data/seed-message-pairs.ts:1690-1700`: the
  pass-1 invocation takes `routePattern:
  'organizations/:id/ai-agents/:id'`,
  `idParams: [STARK_ORGANIZATION, m.id]`, and
  `organization: STARK_ORGANIZATION`. Its key is
  `seedMessagePairKey('organizations/:id/ai-agents/:id', m.id)`.
  Above the loop, add a comment: "Every seeded AI belongs
  to Stark: no seeded flow names one in Wayne (spec
  decision 10)".
- `api/mock-data.ts:1003-1014`: the same key.
- `api/mock-data/ai-members.ts:3-5`: replace the stale
  header comment (it names member, membership, and detail
  rows the seed never writes) with "the seed writes each
  one's organization document in Stark".
- `client/members.ts:50`: export `requireOrganization`.
- `client/ai-members.ts:84-159`: every path becomes
  `'organizations/' + requireOrganization(ctx) + '/ai-agents/' + …`.
  Add one private `aiAgentsPath(ctx: RequestContext): string`
  that returns the collection path.
- `client/members-union.ts:55`: the same collection path,
  through the exported `requireOrganization`. A flat
  session with no organization keeps its current
  empty-list branch, as the memberships read beside it
  does.
- `web-app/app/generate-api-documentation.ts:256-261`:
  the example re-keys to
  `'/organizations/:id/ai-agents/:id'`.
- Regenerate `web-app/api-documentation/`.
- Tests (path moves only; every assertion stays):
  - `tests/member-fixtures.ts:174-200` (`aiAgentDocumentMessagePair`
    takes the organization, `MEMBER_ORGANIZATION`) and
    `:233-243` (`seedAIMember`)
  - `tests/api-ai-agents.test.ts` (L97, L131, L161)
  - `tests/api-ai-members.test.ts` (L43, L68)
  - `tests/adapters-ai-members.test.ts` (L33 title and
    path)
  - `tests/api.test.ts` (L144, L158)
  - `tests/api-member-tier.test.ts:69`
  - `tests/head-reads-collections.test.ts:47-49`
  - `tests/api-versions-etag.test.ts` (L147 `:151` `:171`,
    L694, L728)
  - `tests/family-registry.test.ts:98-102`: rename it to
    'ai-agents is an organization-plane family', asserting
    `organizationNested: true`
  - `tests/document-family.test.ts:180`
  - `tests/drift-roster.test.ts` (L206, L303, L575, L632)
  - `tests/drift-states.test.ts:1285`
  - `tests/derive-states-union.test.ts:233-243`, `:765`
  - `tests/mock-data-pairs.test.ts:315-332`: rename it to
    'a seeded AI agent pair sits at its organization's
    ai-agents document'; the path becomes
    `'/organizations/' + STARK_ORGANIZATION + '/ai-agents/'`
  - `tests/mock-data-valid.test.ts:606-612`
  - `tests/adapters-flow-stats.test.ts:242`
  - `tests/write-response-spec-shape.test.ts:116`
  - `tests/browser/api-documentation.test.ts:187-212`

**Interfaces:**
- Produces:
  - `liveOrganizationDocumentIds(db: DbAdapter, organization: Id, family: string): Promise<Set<string>>`
    in `api/document-family.ts`, reading
    `canonicalPath(organization, '/' + family + '/')`.
  - `assertLiveFlowGraphWriteLaw(db: DbAdapter, organization: Id, graph: Record<string, unknown>): Promise<void>`
    (private, `api/routes.ts`).
  - `postFlowDocumentOp(db, id, body, actor, messagePair?, organization?: Id)`.
    The sixth parameter is the one `documentPutHandler`
    already passes. The op takes `requireOrganization(organization)`
    before it calls the law.
  - `export function requireOrganization(ctx: RequestContext): string`
    in `client/members.ts`.
  - Storage: AI documents sit at
    `/organizations/<organization>/ai-agents/<id>`. The
    stored body is still
    `{ id, name, description, skill_focus, model }`, from
    the unchanged `aiAgentDocumentEntityOf`.
- Consumes: Task 1's four cases, which must go green.

- [ ] **Step 1: The server move (registry, wiring, routes,
  spec, pair wiring, policy row)**

As listed under Files. `entityIdParam` (`api/document-family.ts:270-277`)
reads the id at index 1 once `httpNest` is
`'organization'`, and the gate's path fence (`api/api.ts:617-648`)
covers the new paths without edit.
`throwDocumentMiss` takes the nested branch, and the miss
stays `'Not found: ai-agents/<id>'` and
`'Gone: ai-agents/<id>'`, keyed on `notFoundTable`.

- [ ] **Step 2: The law reads the organization's AI
  documents**

`assertLiveFlowGraphWriteLaw` calls
`liveOrganizationDocumentIds(db, organization, 'ai-agents')`.
Both callers pass the organization:
- `postFlowDocumentOp` (`:1327`)
- the POST flows handler (`:4191`), which already holds
  `org`

`assertFlowGraphWriteLaw` (`api/validators.ts:198-222`)
does not change. Its comment at `:198-200` names "live
/ai-agents documents". Make it read "the organization's
live AI documents".

- [ ] **Step 3: The seed, the client, the generator, the
  docs regeneration**

As listed under Files. Run
`./bin/generate-api-documentation`. The `get/ai-agents…`
and `put/ai-agents…` pages go, and
`get/organizations/id/ai-agents…` and
`put/organizations/id/ai-agents/id` appear.

- [ ] **Step 4: Move the tests' paths**

Every listed site swaps the global path for the
organization path. A site that uses `DEV_TOKEN` or
`organizationToken()` uses Stark
(`AjdvjuECVZEgZoFajaIEkg`). A site that reads storage
directly uses
`canonicalPath(STARK, '/ai-agents/')`, which is
`'/organizations/AjdvjuECVZEgZoFajaIEkg/ai-agents/'`.

In `tests/browser/api-documentation.test.ts:187-212`, the
hash becomes `'#get/organizations/id/ai-agents'` and the
h1 becomes `'GET /api/organizations/:id/ai-agents/'`.
That room is generated beside `get/organizations/id/ideas`
(`web-app/api-documentation/rooms.ts:978`).

- [ ] **Step 5: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 1's
four cases are `ok`. Also run
`grep -rn "'ai-agents/'\|'/ai-agents/'" api client web-app tests`.
Expected: no hit outside
`tests/api-ai-agents.test.ts`'s 'the global ai-agents
routes are gone'.

- [ ] **Step 6: Layer 2 is green**

Run `./test browser` as its own Bash call. Expected:
`ok | … | 0 failed`. The api-documentation case reads the
moved room.

- [ ] **Step 7: Commit**

Stage every file listed, by path, including
`web-app/api-documentation/` (`git add web-app/api-documentation`).

```bash
git commit -m "Move AI agents under the organization" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Pin the services family

**Agent:** `coder`

**Commit subject:** `Pin the organization services family`

**Brief:** Commandments: Security, Idempotency (PUT never
creates), Uniformity. Abominations: Unbidden Helper Code.

**Files:**
- Create: `tests/api-services.test.ts`
- Modify: `tests/api-routes.test.ts`. Add
  `'organizations/' + STARK + '/services/',` to
  `SERVED_COLLECTIONS`, after the ai-agents row.

**Interfaces:**
- Consumes `apiRequest` (`tests/http-fixtures.ts:182`),
  `seedAdminSchema`, `DEV_TOKEN`, `claimToken`, and
  `memoryDbAdapter`.
- Produces three cases that Task 4 turns green, plus the
  generated served-collection case:
  - 'a services PUT with no precondition is 428'
  - 'a services PUT never creates'
  - 'another organization reaches no service of ours'

- [ ] **Step 1: Write `tests/api-services.test.ts`**

```ts
import { assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import { apiRequest } from './http-fixtures.ts';
import { claimToken, DEV_TOKEN } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const WAYNE = 'BBjWJsjYIDkTRKIIPrzWRw';
const BODY = {
    name: 'Nightly import',
    description: 'Loads the ledger export',
};

function servicePath(organization: string, id = ''): string {
    return '/organizations/' + organization
        + '/services/' + id;
}

async function freshDb() {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    return db;
}

// Only the members statement creates a service (Task 6),
// so the PUT is class B: it rewrites a live head or
// nothing (RFC 6585 §3; RFC 9110 §13.2.1).
Deno.test('a services PUT with no precondition is 428',
async () => {
    const db = await freshDb();
    const res = await handleRequest(db, apiRequest({
        method: 'PUT',
        path: servicePath(STARK, generateIdentifier()),
        token: DEV_TOKEN,
        body: BODY,
    }));
    assertStrictEquals(res.status, 428);
    await res.body?.cancel();
});

Deno.test('a services PUT never creates', async () => {
    const db = await freshDb();
    const id = generateIdentifier();
    for (const headers of [
        { 'If-None-Match': '*' },
        { 'If-Match': '"' + generateIdentifier() + '"' },
    ]) {
        const res = await handleRequest(db, apiRequest({
            method: 'PUT',
            path: servicePath(STARK, id),
            token: DEV_TOKEN,
            body: BODY,
            headers,
        }));
        assertStrictEquals(res.status, 404);
        assertEquals(await res.json(), {
            error: 'Not found: services/' + id,
        });
    }
    assertStrictEquals(
        await db.messagePairs.getHeadPair(
            servicePath(STARK), id,
        ),
        null,
    );
});

Deno.test('another organization reaches no service of ours',
async () => {
    const db = await freshDb();
    const wayne = await claimToken({
        organization: WAYNE,
        organizations: [WAYNE],
        roles: ['admin:' + WAYNE],
    });
    const res = await handleRequest(db, apiRequest({
        method: 'GET',
        path: servicePath(STARK),
        token: wayne,
    }));
    assertStrictEquals(res.status, 403);
    await res.body?.cancel();
});
```

The `'Not found: services/<id>'` body comes from
`EntityNotFoundError('services', id)`, the shape
`'Not found: ai-agents/<id>'` already has
(`tests/drift-roster.test.ts:206`). If the gate's 404 body
differs in shape, keep the status assertion, and set the
body assertion to the body the family's GET miss answers
(the same `throwDocumentMiss`). Report the difference.

- [ ] **Step 2: Layer 1 is red in exactly four cases**

Run `./test check` and `./test lint`; both exit 0. Run
`./test` and tee it to `task3-red.log`. Expected red:
- '…no precondition is 428' (404 against 428)
- '…another organization…' (404 against 403)
- the generated
  `GET organizations/<STARK>/services/ selects nothing…`
  (rejects 404)

'a services PUT never creates' passes now, since there is
no route. It is a pin that Task 4 must keep, not a red
case. Report it as `ok`.

- [ ] **Step 3: Commit**

```bash
git add tests/api-services.test.ts tests/api-routes.test.ts
git commit -m "Pin the organization services family" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Add the organization services family

**Agent:** `planner`

**Commit subject:** `Add the organization services family`

**Brief:** Commandments: Uniformity (a third
organization-nested stateless family, wired like
`ai-agents`), Idempotency, Security. Abominations:
Premature Generalization (one `documentEditHandler`, no
options object), Default Values, Coupling.

**Files:**
- `shared/types.ts`: after `AIAgentEntity` (`:800-806`),
  add `ServiceEntity`.
- `api/validators.ts`: after `validateAiAgentDocumentBody`
  (`:1024-1050`), add `SERVICE_DOCUMENT_BODY_KEYS` and
  `validateServiceDocumentBody`.
- `api/document-family.ts`: add `documentEditHandler`
  after `documentPutHandler` (`:325-333`), and add
  `'services'` to `STREAM_FAMILIES` (`:481-487`).
- `api/family-registry.ts`: add a `services` row after
  `ai-agents`.
- `api/routes.ts`:
  - add `serviceDocumentEntityOf`, `SERVICES_WIRING`, and
    `postServiceDocumentOp` beside the AI ones
  - add `registerDocumentFamilyWiring(SERVICES_WIRING)`
  - add the spec key
    `'organizations/:id/services/:id': { ...documentWriteResponseSpec(SERVICES_WIRING), conditional: 'required' }`,
    the spread form flows uses (`:2810-2813`)
  - add four routes after the AI ones:
    `documentCollectionRoute(SERVICES_WIRING)`; then
    `route('organizations/:id/services/:id', { select: documentSelect(SERVICES_WIRING), put: documentEditHandler(SERVICES_WIRING) })`;
    then the versions pair
- `api/message-pair.ts:1816`: add
  `'organizations/:id/services/:id'`.
- `web-app/app/generate-api-documentation.ts`: add a
  `writeExample('put', '/organizations/:id/services/:id', { name: 'name', description: 'description' })`
  after the AI example.
- Regenerate `web-app/api-documentation/`.

**Interfaces:**
- Produces:
  - `export interface ServiceEntity { id: Id; name: string; description: string; }`
    (`shared/types.ts`)
  - `validateServiceDocumentBody(body: Record<string, unknown>): { readonly entity: Omit<ServiceEntity, 'id'> }`.
    Keys are exactly `['name', 'description']`, with the
    label `'ServiceEntity'`, read by `pickString`, as the
    AI validator does.
  - `export function documentEditHandler(wiring: DocumentFamilyWiring): PutHandler`.
    It reads `db.messagePairs.getHeadPair(canonicalPath(organizationId, '/' + wiring.family + '/'), id)`.
    On `null` it throws `throwDocumentMiss(wiring, db, organizationId, id)`.
    Otherwise it returns `wiring.documentOp(...)`
    exactly as `documentPutHandler` does. Its comment says
    why: only a statement creates this family, so the PUT
    edits a live head, and a miss is the family's own 404
    whatever conditional the request carries
    (RFC 9110 §13.2.1).
  - `serviceDocumentEntityOf(document: DerivedDocument, _organization: Id): object`,
    returning `{ id: document.name, ...document.body }`.
  - `postServiceDocumentOp(db, _id, body, _actor, messagePair?)`,
    the same shape as `postAiAgentDocumentOp`
    (`:2572-2588`).
  - `SERVICES_WIRING: DocumentFamilyWiring = { family: 'services', httpNest: 'organization', lifecycle: 'stateless', notFoundTable: 'services', validateDocument: validateServiceDocumentBody, documentOp: postServiceDocumentOp, entityOf: serviceDocumentEntityOf }`.
  - Registry row: `{ family: 'services', organizationNested: true, createBodyIdField: 'id' }`.
    Mark `createBodyIdField` INERT in a comment: there is
    no collection POST, and the members statement is the
    genesis.
- Consumes: Task 3's cases.

- [ ] **Step 1: Add the type, validator, handler, wiring,
  routes, spec, pair wiring, and registry row**

As listed under Files.

- [ ] **Step 2: Regenerate the API documentation**

Run `./bin/generate-api-documentation`. The new
`get/organizations/id/services…` and
`put/organizations/id/services/id` rooms list 412 and 428
(`statusCodesFor`, `web-app/app/generate-api-documentation.ts:657-728`).

- [ ] **Step 3: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 3's
four cases are `ok`.

- [ ] **Step 4: Commit**

```bash
git add shared/types.ts api/validators.ts \
    api/document-family.ts api/family-registry.ts \
    api/routes.ts api/message-pair.ts \
    web-app/app/generate-api-documentation.ts \
    web-app/api-documentation
git commit -m "Add the organization services family" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part B: the statement's three kinds

### Task 5: Pin the statement's AI and service kinds

**Agent:** `planner`

**Commit subject:** `Pin the statement's AI and service kinds`

**Brief:** Commandments: Reliability, Security (G47's
fence, the token's organization), Atomicity (three
geneses, one statement), Idempotency (the resend is 409).
Abominations: Test Weakening, Unbidden Helper Code.

**Files:**
- Modify: `tests/api-organization-memberships.test.ts`.
  - The existing case 'admin POST memberships creates one
    accepted person' (`:224`) adds `kind: 'human'` to
    `body`.
  - Four cases go after it.
  - Import `firstProviderModel` from
    `./member-fixtures.ts`.
- Create: `tests/api-service-members.test.ts`, with the
  G47 oracle and the token claim.

**Interfaces:**
- Consumes `seeded()` (`:40`), `nest()` (`:33`), `STARK`,
  and `AT`.
- From the fixtures:
  - `framedRequest`, `presentedFields`, and
    `withoutCredentialFields` (`tests/http-fixtures.ts:145`,
    `:109`, `:55`)
  - `makeAssertionSigner` (`tests/client-assertion-fixtures.ts:18`)
  - `decodeAccessToken` (`api/access-token.ts`)
  - `partBodiesOf`
- Produces these cases, which Task 6 turns green:
  - 'admin POST memberships creates one accepted person'
    (now red: `kind` is an unexpected key)
  - 'admin POST memberships creates one accepted AI'
  - 'admin POST memberships creates one accepted service'
  - 'a memberships POST names its member kind'
  - 'a service member PUT edits its live document'
  - 'an organization admin reaches a service member
    identity (G47)'
  - 'a service member token carries its membership
    organization'

- [ ] **Step 1: The four statement cases**

The helpers sit at file scope, after `statesOf`:

```ts
function aiBody(id: string) {
    return {
        id,
        kind: 'ai',
        membership: { type: 'member', at: AT },
        ai: {
            name: 'Ops Assistant',
            description: 'Triage',
            skill_focus: 'routing',
            model: firstProviderModel().id,
        },
    };
}

function serviceBody(id: string) {
    return {
        id,
        kind: 'service',
        membership: { type: 'member', at: AT },
        service: {
            name: 'Nightly import',
            description: 'Loads the ledger export',
        },
    };
}

async function post(
    db: MemoryDbAdapter, token: string, body: unknown,
): Promise<Response> {
    return handleRequest(db, apiRequest({
        method: 'POST', path: nest('memberships'),
        token, body,
    }));
}

async function read(
    db: MemoryDbAdapter, token: string, path: string,
): Promise<Response> {
    return handleRequest(db, apiRequest({
        method: 'GET', path, token,
    }));
}
```

Each kind case asserts the following:
- The POST answers 201. Its `location` is the
  invitation item.
- Its JSON is the accepted membership:
  `{ id: name, organization_id: STARK, identity_id: id, type: 'member', state: 'accepted', at: AT }`.
- `GET /identities/<id>` with `admin` answers 200 and
  `{ id, kind: 'service' }`. This is the fence admitting a
  co-member.
- The kind's document answers 200 and
  `{ id, ...<the kind's sub-object> }`:
  - AI: `GET /organizations/<STARK>/ai-agents/<id>`
  - service: `GET /organizations/<STARK>/services/<id>`
- `db.messagePairs.getHeadPair('/identities/' + id + '/', 'pii')`
  is `null`. AI and service members have no PII.
- A resend answers 409 and stores nothing (the
  `getAll().length` count, as `:279-296` does).
- The `member` token answers 403.

```ts
Deno.test('admin POST memberships creates one accepted AI',
async () => {
    const { db, admin, member } = await seeded();
    const id = generateIdentifier();
    const name = membershipNameOf(STARK, id);
    const body = aiBody(id);
    const created = await post(db, admin, body);
    assertStrictEquals(created.status, 201);
    assertStrictEquals(
        created.headers.get('location'),
        '/organizations/' + STARK + '/invitations/' + name,
    );
    assertEquals(await created.json(), {
        id: name, organization_id: STARK, identity_id: id,
        type: 'member', state: 'accepted', at: AT,
    });
    const identity = await read(
        db, admin, '/identities/' + id,
    );
    assertStrictEquals(identity.status, 200);
    assertEquals(
        await identity.json(), { id, kind: 'service' },
    );
    const agent = await read(
        db, admin,
        '/organizations/' + STARK + '/ai-agents/' + id,
    );
    assertStrictEquals(agent.status, 200);
    assertEquals(await agent.json(), { id, ...body.ai });
    assertStrictEquals(
        await db.messagePairs.getHeadPair(
            '/identities/' + id + '/', 'pii',
        ),
        null,
    );
    const count = (await db.messagePairs.getAll()).length;
    const resent = await post(db, admin, body);
    assertStrictEquals(resent.status, 409);
    await resent.body?.cancel();
    assertStrictEquals(
        (await db.messagePairs.getAll()).length, count,
    );
    const forbidden = await post(
        db, member, aiBody(generateIdentifier()),
    );
    assertStrictEquals(forbidden.status, 403);
    await forbidden.body?.cancel();
});
```

'admin POST memberships creates one accepted service' is
the same case with `serviceBody`, `services/`, and
`body.service`.

```ts
// No default member kind: a body that names none is
// refused, never read as a human.
Deno.test('a memberships POST names its member kind',
async () => {
    const { db, admin } = await seeded();
    const { kind: _kind, ...kindless } = aiBody(
        generateIdentifier(),
    );
    for (const body of [
        kindless,
        { ...aiBody(generateIdentifier()), kind: 'robot' },
        { ...aiBody(generateIdentifier()), kind: 'service' },
    ]) {
        const res = await post(db, admin, body);
        assertStrictEquals(res.status, 400);
        await res.body?.cancel();
    }
});

Deno.test('a service member PUT edits its live document',
async () => {
    const { db, admin } = await seeded();
    const id = generateIdentifier();
    const created = await post(db, admin, serviceBody(id));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    const path = '/organizations/' + STARK + '/services/' + id;
    const held = await read(db, admin, path);
    assertStrictEquals(held.status, 200);
    await held.body?.cancel();
    const edited = { name: 'Nightly import', description: 'v2' };
    const put = await handleRequest(db, apiRequest({
        method: 'PUT', path, token: admin, body: edited,
        headers: { 'If-Match': held.headers.get('ETag')! },
    }));
    assertStrictEquals(put.status, 200);
    assertEquals(await put.json(), { id, ...edited });
});
```

The third body in 'names its member kind' sends `kind:
'service'` with an `ai` sub-object. That is a key
mismatch, and must be 400.

- [ ] **Step 2: `tests/api-service-members.test.ts`**

```ts
import { assert, assertEquals, assertStrictEquals } from
    '@std/assert';
import { handleRequest } from '../api/api.ts';
import {
    memoryDbAdapter,
    type MemoryDbAdapter,
} from '../api/db-memory.ts';
import { decodeAccessToken } from '../api/access-token.ts';
import {
    apiRequest,
    framedRequest,
    partBodiesOf,
    presentedFields,
    withoutCredentialFields,
} from './http-fixtures.ts';
import { makeAssertionSigner } from
    './client-assertion-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const STARK = 'AjdvjuECVZEgZoFajaIEkg';
const AT = '2026-01-01T00:00:00.000000Z';

// A service created by the members statement is a
// co-member: the identity fence admits the organization
// admin, and its token's claims name the organization.
async function serviceMember(): Promise<{
    db: MemoryDbAdapter; admin: string; id: string;
}> {
    const db = memoryDbAdapter();
    await seedAdminSchema(db);
    const admin = await organizationToken();
    const id = generateIdentifier();
    const created = await handleRequest(db, apiRequest({
        method: 'POST',
        path: '/organizations/' + STARK + '/memberships/',
        token: admin,
        body: {
            id,
            kind: 'service',
            membership: { type: 'member', at: AT },
            service: { name: 'CI bot', description: 'Builds' },
        },
    }));
    assertStrictEquals(created.status, 201);
    await created.body?.cancel();
    return { db, admin, id };
}

function registration(jwks: string) {
    return {
        grant_types: 'client_credentials',
        redirect_uris: '',
        jwks,
        aud: 'fusion-angle',
        status: 'active',
    };
}
```

Case 'an organization admin reaches a service member
identity (G47)':
- `GET /identities/<id>` (admin) answers 200.
- `PUT /identities/<id>/registration` with
  `registration('{"keys":[]}')` and no latch answers 201.
  This is a first registration, per
  `tests/adapters-client-registration.test.ts:92`.
- `GET /identities/` (admin) answers 200, and
  `partBodiesOf<{ id: string }>(…)` includes `id`.

Case 'a service member token carries its membership
organization':
- Make `signer = await makeAssertionSigner('ES256')`.
- `PUT` the registration with `registration(signer.jwks)`,
  expecting 201.
- Sign
  `{ iss: id, sub: id, aud: 'fusion-angle', exp: now + 300, iat: now, jti: generateIdentifier() }`.
- POST `http://localhost/authentication/token` with
  `{ grant_type: 'client_credentials', client_id: id, client_assertion }`,
  built the way `tokenRequest` does
  (`tests/api-authentication-token.test.ts:196-209`):
  `withoutCredentialFields`, then `framedRequest`.
- Assert 200.
- `decodeAccessToken(access_token)` has `sub === id` and
  `organizations` deep-equal to `[STARK]`.

- [ ] **Step 3: Layer 1 is red in exactly six cases**

Run `./test check` and `./test lint`; both exit 0. Run
`./test` and tee it to `task5-red.log`. Expected red, each
at its first status assertion:

| Case | Actual | Expected |
|---|---|---|
| 'admin POST memberships creates one accepted person' | 400 | 201 |
| '…creates one accepted AI' | 400 | 201 |
| '…creates one accepted service' | 400 | 201 |
| 'a service member PUT edits its live document' | 400 | 201 |
| '…reaches a service member identity (G47)' | 400 | 201 |
| '…token carries its membership organization' | 400 | 201 |

'a memberships POST names its member kind' passes now.
Every one of its bodies is malformed for today's
validator. It pins the covenant Task 6 must keep, as
Task 3's 'never creates' does. Report it as `ok`.

- [ ] **Step 4: Commit**

```bash
git add tests/api-organization-memberships.test.ts \
    tests/api-service-members.test.ts
git commit -m "Pin the statement's AI and service kinds" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Create AI and service members in the statement

**Agent:** `architect` (the statement's body and its
sibling shapes are the contract that Tasks 8, 18, 22,
and 28 build on)

**Commit subject:** `Create AI and service members by statement`

**Brief:** Commandments: Atomicity, Reliability, Security,
Uniformity, Clarity. Abominations: Default Values (no
defaulted kind), Null (no optional sub-object),
Premature Generalization, Internal Defense (the validator
decides; the handler trusts it).

**Files:**
- `api/validators.ts:1917-2025`: `MEMBERSHIP_CREATE_KEYS`
  becomes three per-kind key lists, and
  `validateMembershipCreateBody` returns
  `MembershipCreate`.
- `api/invitations-domain.ts:684-791`:
  `postOrganizationMembership` builds the siblings per
  kind. Its comment (`:682-683`) becomes "one accepted
  member of any kind; the handler declares the three
  geneses".
- `client/members.ts:262-288`: `postHumanMemberCreation`
  sends `kind: 'human'`.
- Tests:
  - `tests/adapters-members.test.ts:65`: the verbatim
    body pin gains `kind: 'human'`, right after `id`.
  - `tests/api-human-members.test.ts:35`: its POST body
    gains `kind: 'human'`.
  - Any other direct statement body: grep
    `"memberships/'"` and `'/memberships/'` POSTs under
    `tests/`.

**Interfaces:**
- Produces, in `api/validators.ts`:

```ts
export type MembershipCreate =
    | {
        readonly kind: 'human';
        readonly id: string;
        readonly membership: MembershipCreateSeat;
        readonly identity: {
            readonly title: string;
            readonly department: string;
            readonly strengths: string[];
            readonly team_dimensions: Record<string, number>;
        };
        readonly pii: Omit<IdentityPiiEntity, 'id'>;
    }
    | {
        readonly kind: 'ai';
        readonly id: string;
        readonly membership: MembershipCreateSeat;
        readonly ai: Omit<AIAgentEntity, 'id'>;
    }
    | {
        readonly kind: 'service';
        readonly id: string;
        readonly membership: MembershipCreateSeat;
        readonly service: Omit<ServiceEntity, 'id'>;
    };

export interface MembershipCreateSeat {
    readonly type: MembershipType;
    readonly at: string;
}
```

- `validateMembershipCreateBody(body): MembershipCreate`
  works as follows:
  - It reads `kind` first, with `validateEnumField(body, 'kind', ['human', 'ai', 'service'], 'member kind', 'MembershipCreate')`.
  - It then asserts that kind's exact keys:
    - `['id', 'kind', 'membership', 'identity', 'pii']`
    - `['id', 'kind', 'membership', 'ai']`
    - `['id', 'kind', 'membership', 'service']`
  - `ai` goes through `validateAiAgentDocumentBody`, and
    `service` through `validateServiceDocumentBody`.
  - The human branch keeps today's checks and messages
    verbatim.
  - A non-object `ai` or `service` throws
    `'ai must be an object'` or `'service must be an object'`,
    matching `'pii must be an object'`.
- The stored sibling states:
  - The membership: unchanged, with
    `type: created.membership.type`.
  - The identity at `canonicalPath(undefined, '/identities/')`:
    `{ id, kind: 'person', ...identity }` for a human, and
    `{ id, kind: 'service' }` for AI and service.
  - The third genesis:
    - human: the PII at `identityPrefixFor(id)`, as today
    - ai: `canonicalPath(organizationId, '/ai-agents/')`,
      name `id`, state `{ id, ...created.ai }`
    - service: `canonicalPath(organizationId, '/services/')`,
      name `id`, state `{ id, ...created.service }`

  Each AI and service state equals what that family's
  `entityOf` stores for a PUT. Every sibling keeps
  `{ kind: 'genesis', declarer: 'handler' }`.
- Consumes `validateAiAgentDocumentBody`,
  `validateServiceDocumentBody` (Task 4), and
  `canonicalPath`.

- [ ] **Step 1: The validator's union**

As above. Put a private `membershipCreateSeat(body)`
helper after the key lists, used by all three branches. It
holds today's `membership` object check and its `type`
and `at` reads, unchanged.

- [ ] **Step 2: The handler's siblings**

`postOrganizationMembership` keeps:
- `requireWriteStamp`, `requireAdmin`, and the received
  pair
- the answer: `created`, with the invitation-item
  location
- `notify`

The siblings list is the membership sibling, then a
per-kind pair from one private
`memberGeneses(organizationId: Id, created: MembershipCreate): StateSibling[]`.
Import `StateSibling` under whatever name
`runStateWrite`'s siblings element type already
carries. The `switch` on `created.kind` is exhaustive;
let `never` prove it.

- [ ] **Step 3: The client and the human tests**

`postHumanMemberCreation` adds `kind: 'human'` right
after `id`. The three test sites add the same key at the
same place.

- [ ] **Step 4: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and every
Task 5 case is `ok`. The API-docs check passes with no
regeneration: the route set and the conditional classes
are unchanged.

- [ ] **Step 5: Commit**

```bash
git add api/validators.ts api/invitations-domain.ts \
    client/members.ts tests/adapters-members.test.ts \
    tests/api-human-members.test.ts
git commit -m "Create AI and service members by statement" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part C: never an organization admin

### Task 7: Pin the admin refusal

**Agent:** `coder`

**Commit subject:** `Pin the AI and service admin refusal`

**Brief:** Commandments: Security, Logic (every path that
yields `type: 'admin'`). Abominations: Test Weakening.

**Files:**
- Modify: `tests/api-organization-memberships.test.ts`.
  Add 'an AI or service member is never created an
  organization admin' after Task 5's cases.
- Modify: `tests/api-memberships.test.ts`. Add 'an AI or
  service member is never made an organization admin'
  after 'removed to accepted restores the seat' (`:661`).

**Interfaces:**
- Consumes Task 5's `aiBody`, `serviceBody`, and `post`,
  plus `api-memberships`'s `basis()` (`:63`), `putState`,
  `directSeat` (`:177`), `itemPath`, `ORG`, and
  `membershipNameOf`.

- [ ] **Step 1: The statement case**

For `aiBody(id)` and `serviceBody(id)`, each with
`membership: { type: 'admin', at: AT }`:
- the POST answers 400, with
  `{ error: 'an AI or service member cannot be an organization admin' }`
- `getHeadPair('/invitations/', membershipNameOf(STARK, id))`
  is `null`

- [ ] **Step 2: The item-PUT case**

In `basis()`'s world, for each of the AI and service
kinds:
1. POST the statement at
   `/organizations/<ORG>/memberships/` with
   `type: 'member'`, and expect 201.
2. **Retype:**
   `putState(db, 'organizations', ORG, name, admin, { state: 'accepted', type: 'admin', at })`.
   Expect 409 and
   `{ error: 'an AI or service member cannot be an organization admin' }`.
   The seat stays `type: 'member'`.
3. **Reinstate as admin:**
   - PUT `{ state: 'removed', at }` and expect 200.
   - PUT `{ state: 'accepted', type: 'admin', at }` and
     expect the same 409.
   - PUT `{ state: 'accepted', type: 'member', at }` and
     expect 200. This pins the owner's ruling 1:
     reinstatement stays.
4. **Direct seat:** for a fresh identity holding a
   `service` identity document and no membership
   (`seedServiceIdentity`, `tests/identity-fixtures.ts:243`),
   `directSeat(db, admin, id, 'admin', at)` answers the
   same 409.

Choose `at` values in increasing order, the way the
neighbouring cases do.

- [ ] **Step 3: Layer 1 is red in exactly these two
  cases**

Run `./test`, teed to `task7-red.log`. Expected:
- the statement case fails at 201 against 400
- the item-PUT case fails at the retype's 200 against 409

- [ ] **Step 4: Commit**

```bash
git add tests/api-organization-memberships.test.ts \
    tests/api-memberships.test.ts
git commit -m "Pin the AI and service admin refusal" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Refuse an admin AI or service member

**Agent:** `planner`

**Commit subject:** `Refuse an admin AI or service member`

**Brief:** Commandments: Security, Logic, Uniformity (one
message at both gates). Abominations: Internal Defense
(the statement refuses in the validator, the PUT in the
handler, and neither twice), Magical Values (name the
message once).

**Files:**
- `api/validators.ts`: in `validateMembershipCreateBody`'s
  `ai` and `service` branches, refuse
  `membership.type === 'admin'`.
- `api/invitations-domain.ts:873-876`: in
  `putMembership`, after `const next = settledMembership(outcome.next);`
  and before `refuseLastAdmin`, refuse when
  `next.type === 'admin'` and
  `(await deriveIdentityKind(db, parsed.identityId)) === 'service'`.
  `deriveIdentityKind` is at
  `api/derive-identity-spine.ts:426`. The read runs before
  `landMembership`, outside any transaction.

**Interfaces:**
- Produces
  `export const SERVICE_ADMIN_REFUSAL = 'an AI or service member cannot be an organization admin';`
  in `api/validators.ts`. The validator throws it as a
  `ValidationError` (400). `putMembership` throws
  `new ApiError(SERVICE_ADMIN_REFUSAL, HTTP_CONFLICT)`
  (409), the status every refused membership transition
  answers.
- The system identity is a `service` identity with no
  membership, and nothing seats it, so the PUT rule is
  exact.

- [ ] **Step 1: The two refusals**

As above. Add a one-line comment at the PUT rule: "an
identity that signs in by client credentials is never an
organization admin (spec decision 11)".

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and both Task 7
cases are `ok`.

- [ ] **Step 3: Commit**

```bash
git add api/validators.ts api/invitations-domain.ts
git commit -m "Refuse an admin AI or service member" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part D: the identities page's create and `client_secret`

### Task 9: Pin an identities page with no create

**Agent:** `coder`

**Commit subject:** `Pin an identities page with no create`

**Brief:** Commandments: Clarity, Simplicity.
Abominations: Unbidden Helper Code.

**Files:**
- Modify: `tests/browser/dialogs.test.ts`. Add one case
  before 'the add-identity dialog reopens with every
  field empty' (`:56`).

**Interfaces:**
- Consumes `withAdminPage`, `registryUrl`, and `page.ready`.
- Produces 'the identities page offers no create'. Task 10
  cites it in G44.

- [ ] **Step 1: Add the case**

```ts
Deno.test('the identities page offers no create',
async () => {
    await withAdminPage(browser.get(), async (page, origin) => {
        await page.navigate(
            registryUrl(origin.baseUrl, 'identities'),
        );
        await page.ready('identities');
        assertEquals(
            await page.evaluate<boolean>(
                `document.querySelector(`
                + `'[data-dialog-open="add-identity"]')`
                + ` === null`
                + ` && document.querySelector(`
                + `'#add-identity-dialog') === null`,
            ),
            true,
        );
    });
});
```

- [ ] **Step 2: Layer 1 green, Layer 2 red in this case
  only**

Run `./test validate`, which exits 0. Then run
`./test browser` as its own call. It cannot take a pipe,
so in a later call, write its FAILED lines to
`$TMPDIR/service-members/task9-red.log`. Expected: FAILED,
with 'the identities page offers no create' the only red
case. Do the same for Tasks 25 and 29's browser runs.

- [ ] **Step 3: Commit**

```bash
git add tests/browser/dialogs.test.ts
git commit -m "Pin an identities page with no create" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Retire the identities page's create

**Agent:** `planner`

**Commit subject:** `Retire the identities page's create`

**Brief:** Commandments: Simplicity, Uniformity (services
are created on the members page). Abominations: Test
Weakening (only tests whose covenant leaves with the code
are deleted, per spec decision 7), Unbidden Helper Code.

**Files:**
- `web-app/identities/index.html:10-17`, `:25-85`: delete
  `#add-identity-btn` and `#add-identity-dialog`. The
  subtitle "People and services across the platform"
  stays.
- `web-app/identities/index.ts`: delete
  - `bindAddIdentityDialog` (`:128-152`)
  - `clearAddIdentityFields` (`:157-159`)
  - `onDialogKeydown` (`:161-168`)
  - `handleAddIdentitySubmit` (`:170-198`)
  - `pendingIdentityId` and `currentIdentityId` (`:42-47`)
  - the icon fills and the dialog delegate in `init`
  - every import that leaves with them (the client map's
    §7 list: `postIdentityCreation`, `generateIdentifier`,
    `populateIcons`, `showToast`, `reportFault`, the
    icons, `handleDialogClick`, `closeDialog`, and `$`,
    `$input` if unused)
- `client/identities.ts:270-304`: delete
  `IdentityCreationSpec` and `postIdentityCreation`, and
  `client/index.ts:17`'s re-export of them, if it names
  them.
- `tests/adapters-identity-creation.test.ts`: delete the
  file. Both cases (`:42`, `:75`) pin
  `postIdentityCreation` (spec decision 7).
- `tests/adapters-identity-roster.test.ts:66`, `:88`: mint
  the membership-less service with
  `seedServiceIdentity(db, id)` (`tests/identity-fixtures.ts:243`)
  in place of `postIdentityCreation`. Every assertion
  stays.
- `tests/browser/dialogs.test.ts`: delete
  `ADD_IDENTITY_FIELDS` (`:14`) and the cases at `:56`
  and `:76`. Their dialog is gone (spec decision 7).
- `TEST-PLAN.md:5828-5848` (G44): rewrite, as below.
  `./test`'s lint forces this; the reason is in the
  plan's Order section.

**Interfaces:**
- Produces an identities page that only lists. `init`
  keeps `getIdentityRoster`, `renderRoster`, `refresh`,
  `onListClick`, and `subscribeIdentityChanges`.

- [ ] **Step 1: The page, the client verb, and the tests**

As listed under Files.

- [ ] **Step 2: Rewrite G44**

Replace G44's whole entry with:

```
- [ ] **G44** Navigate to `identities/index.html`. PASS:
  the page lists identities and offers no create: no
  "Add Identity" button and no `add-identity` dialog.
  People join through the members page's statement;
  services and AIs are created there too (G14b).
  Source: `web-app/identities/index.ts`.
  Pin: tests/browser/dialogs.test.ts 'the identities
       page offers no create'.
```

G14b is written in Task 36. Until then the reference is
forward, which is prose, not a path the lint checks.

- [ ] **Step 3: Layer 1 and Layer 2 are green**

Run `./test validate` (exit 0), then `./test browser` as
its own call. Expected: `0 failed`, and 'the identities
page offers no create' is `ok`.

- [ ] **Step 4: Commit**

```bash
git add web-app/identities/index.html \
    web-app/identities/index.ts client/identities.ts \
    client/index.ts tests/adapters-identity-roster.test.ts \
    tests/browser/dialogs.test.ts TEST-PLAN.md
git rm tests/adapters-identity-creation.test.ts
git commit -m "Retire the identities page's create" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Pin the refused service create

**Agent:** `coder`

**Commit subject:** `Pin the refused service identity create`

**Brief:** Commandments: Security (no membership-less
service), Uniformity. Abominations: Test Weakening.

**Files:**
- Modify: `tests/api-identities-create.test.ts`. Add one
  case after 'an admin may POST identities but a plain
  member is denied' (`:241`).

- [ ] **Step 1: Add the case**

'POST identities (service) is 400 and stores nothing':
- An admin POSTs `{ id, kind: 'service' }`.
- It answers 400 with
  `{ error: 'invalid identity kind "service" on IdentityCreateBody' }`,
  the message `validateEnumField` forms
  (`api/validators.ts:388-403`).
- `db.messagePairs.getHeadPair('/identities/', id)` is
  `null`.

Use the file's own request helper and admin token.

- [ ] **Step 2: Layer 1 is red in this case only**

Run `./test`, teed to `task11-red.log`. Expected: it
fails at 400. Today a credential-less service body is
`asObject`'s 400 with another message, so the case fails
on the body assertion. Report the actual body.

- [ ] **Step 3: Commit**

```bash
git add tests/api-identities-create.test.ts
git commit -m "Pin the refused service identity create" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Refuse a service at `POST identities/`

**Agent:** `planner`

**Commit subject:** `Refuse a service at POST identities`

**Brief:** Commandments: Security, Simplicity.
Abominations: Test Weakening (only the service-branch
cases go, per spec decision 12), Obscurity (fix the
stale "hashed client-side" comments as they go).

**Files:**
- `api/validators.ts`:
  - `:3575-3594`: delete the service variant of
    `IdentityCreateBody` and
    `IDENTITY_CREATE_SERVICE_KEYS`
  - `:3599-3644`: the kind enum becomes `['person']`, and
    the service branch goes
  - the comment at `:3599-3606` loses its credential and
    "hashed client-side" sentences
- `api/routes.ts:3544-3615`: delete the
  `if (b.kind === 'service')` credential block
  (`:3572-3607`) and its comment (`:3544-3550`). The
  identity sibling list is the one identity genesis.
  Remove `hashPassword` and `validateIdentityCredentialEntity`
  from the imports if nothing else in the file uses them.
- `tests/api-identities-create.test.ts`: delete
  - the `credential()` helper (`:56-65`)
  - 'POST identities (service) writes the identity and
    its client_secret credential in one operation' (`:127`)
  - '…rolls back the identity when its credential
    sub-object is invalid' (`:212`)
  - 'a route PUT of the create's credential is forbidden
    and stores nothing' (`:346`)

  All three pin the service branch (spec decision 12).

**Interfaces:**
- Produces
  `IdentityCreateBody = { readonly id: string; readonly kind: 'person' }`.

- [ ] **Step 1: The validator, the route, and the three
  tests**

As above.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 11's
case is `ok`.

- [ ] **Step 3: Commit**

```bash
git add api/validators.ts api/routes.ts \
    tests/api-identities-create.test.ts
git commit -m "Refuse a service at POST identities" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Pin the retired `client_secret`

**Agent:** `coder`

**Commit subject:** `Pin the retired client_secret credential`

**Brief:** Commandments: Security, Simplicity, Clarity.
Abominations: Test Weakening (the counts move with the
behavior; no assertion is loosened).

**Files:**
- Modify: `tests/api-credential-write-answer.test.ts`. Add
  'a client_secret credential is refused at the gate'.
- Modify: `tests/presenter-identity-detail.test.ts`:
  - `:145` 'named service detail shows its name and
    Service badge, never the secret': delete the
    `activeCredentialKinds: ['client_secret']` line and the
    `/Credentials/` and `/client_secret/` matches; add
    `assertNotMatch(out, /Credentials/)`.
  - `:180`: drop `activeCredentialKinds`.
  - Every other `activeCredentialKinds:` line in the file
    goes.
- Modify: `tests/mock-data-pairs.test.ts`:
  - `:172`: `EXPECTED_MESSAGE_PAIR_COUNT` becomes `1881`.
  - `:1015`: bootstrap becomes `8`.
  - The bootstrap row list (`:1021-1025`) loses the system
    credential row.
  - `:946-967`: the credential key-set case reads a human
    credential id in place of the system's
    `'cFiyyRHxbIEVqeVFNPmDnw'` (`:951`).
- Modify: `tests/drift-identities.test.ts:582` (and its
  title at `:519`): credentials `13` becomes `12`.

**Interfaces:**
- The presenter change makes `activeCredentialKinds` a
  key that `IdentityDetailView` no longer has. That makes
  `./test check` fail, which a red commit may not do. So
  in this task, keep the view key in the test calls and
  delete only the assertions. Task 14 drops the key from
  both sides. Concretely:
  - keep `activeCredentialKinds: []` at every call
  - replace `['client_secret']` with `[]`
  - assert `assertNotMatch(out, /Credentials/)`

- [ ] **Step 1: The gate case**

As an admin, through the file's own helper,
`PUT /identities/<seeded person>/credentials/<cid>` with
`{ identity_id, kind: 'client_secret', status: 'set', secret: 'x', at }`.
It answers 400 with
`{ error: 'invalid credential kind "client_secret" on IdentityCredentialEntity' }`
(`api/validators.ts:587-611`). The credential head is
`null`.

- [ ] **Step 2: The presenter and count edits**

As listed under Files.

- [ ] **Step 3: Layer 1 is red in exactly these cases**

Run `./test`, teed to `task13-red.log`. Expected red:
- 'a client_secret credential is refused at the gate'
  (201 or 200 against 400)
- 'named service detail…' and 'nameless service detail…'
  (the Credentials card still renders)
- 'a mock-data seed populates pairs' (1882 against 1881)
- the bootstrap count case (9 against 8)
- the credential key-set case, if it reads the system id
- drift-identities' credential count (13 against 12)

Report the exact list.

- [ ] **Step 4: Commit**

```bash
git add tests/api-credential-write-answer.test.ts \
    tests/presenter-identity-detail.test.ts \
    tests/mock-data-pairs.test.ts \
    tests/drift-identities.test.ts
git commit -m "Pin the retired client_secret credential" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Remove the `client_secret` credential

**Agent:** `planner`

**Commit subject:** `Remove the client_secret credential`

**Brief:** Commandments: Security, Simplicity, Clarity.
Abominations: Default Values, Obscurity (stale comments
go), Test Weakening.

**Files:**
- `shared/types.ts:511-513`:
  `IdentityCredentialKind = 'password'`.
- `api/validators.ts:596`: the enum becomes `['password']`.
- `api/mock-data.ts`:
  - `SeedCredentialPlan.system` (`:273-276`)
  - its mint in `hashSeedCredentials` (`:295-302`)
  - the system write in `postSeedCredentialsIn`
    (`:332-348`)
  - the pass-throughs at `:410` and `:1248`
  - the comment at `:200-202`

  All go. The system identity document stays
  (`:665-674`, `:1293-1299`).
- `api/mock-data/seed-message-pairs.ts`:
  - the `systemCredential` parameter (`:2429-2432`) and
    the system pair (`:2456-2474`)
  - the comments at `:1076-1077` ("12 human passwords +
    the system client secret") and `:2410` ("the 13
    (mock-data) / 2 (bootstrap)"), which become 12 and 1
- `web-app/app/presenters/identity-detail.ts`:
  - `buildCredentialsCard` (`:230-256`)
  - its call (`:334`)
  - `activeCredentialKinds` in `IdentityDetailView`
    (`:41`)
  - `iconShield`, if it is now unused
- `web-app/identities/detail.ts:17`, `:46`, `:66`,
  `:73-82`, `:94-95`: the credential-state read and the
  view key go.
  `getIdentityCredentialState`
  (`client/identity-credentials.ts:56`) stays: the
  credentials route still serves password heads, and
  `tests/adapters-identity-credentials.test.ts` uses it.
- `tests/presenter-identity-detail.test.ts`: every
  `activeCredentialKinds: []` goes.
- `tests/credential-surfacing.test.ts:65-69`: the comment
  loses "System client_secret is not surfaced".
- `tests/mock-data-pairs.test.ts:141-146`: the count
  comment loses "the system client-secret credential".

- [ ] **Step 1: The type, validator, seed, presenter, and
  loader**

As listed.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and every
Task 13 case is `ok`.

Run
`grep -rn "client_secret\|client-secret\|client secret" api client shared server web-app`.
Expected: nothing. `tests/` may still name it only in
Task 13's refusal case.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts api/validators.ts api/mock-data.ts \
    api/mock-data/seed-message-pairs.ts \
    web-app/app/presenters/identity-detail.ts \
    web-app/identities/detail.ts \
    tests/presenter-identity-detail.test.ts \
    tests/credential-surfacing.test.ts \
    tests/mock-data-pairs.test.ts
git commit -m "Remove the client_secret credential" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part E: the roster sorts by member kind

### Task 15: Pin a roster sorted by member kind

**Agent:** `planner`

**Commit subject:** `Pin a roster sorted by member kind`

**Brief:** Commandments: Logic, Uniformity (one rule for
every human roster), Reliability. Abominations: Test
Weakening, Unbidden Helper Code (a local statement
helper per file; no shared fixture yet).

**Files:**
- Modify: `tests/adapters-members-union.test.ts`. Add
  'getMembers never reads an AI or service member as a
  human'.
- Modify: `tests/adapters-members.test.ts`. Add
  'getHumanMembers lists no AI or service member' and
  'getHumanMember reads an AI or service member as
  absent'.
- Modify: `tests/adapters-admin.test.ts`. Add
  'activePeopleCount counts people only'.

**Interfaces:**
- Each file gets one local
  `postMember(db: MemoryDbAdapter, body: Record<string, unknown>): Promise<void>`.
  It POSTs `/organizations/AjdvjuECVZEgZoFajaIEkg/memberships/`
  with `organizationToken()` through `handleRequest`, and
  asserts 201. The bodies are Task 5's `aiBody` and
  `serviceBody` shapes, inline.
- Consumes `getMembers` (`client/members-union.ts:41`),
  `getHumanMembers` (`client/members.ts:165`),
  `getHumanMember` (`:180`), and the admin stats verb
  that yields `activePeopleCount`
  (`client/admin.ts:79-84`). Read its exact name there.

- [ ] **Step 1: The four cases**

The world is `seedAdminSchema` (Tony, admin of Stark),
one AI member, and one service member, both through the
statement.
- **getMembers:** no member with `isHumanMember(m)` has
  either id.
- **getHumanMembers:** the returned ids are exactly
  Tony's.
- **getHumanMember:** for either id it returns `null`.
- **activePeopleCount:** it is `1`.

- [ ] **Step 2: Layer 1 is red in exactly these four**

Run `./test`, teed to `task15-red.log`. Each fails on its
first assertion. Today every accepted membership is a
human.

- [ ] **Step 3: Commit**

```bash
git add tests/adapters-members-union.test.ts \
    tests/adapters-members.test.ts tests/adapters-admin.test.ts
git commit -m "Pin a roster sorted by member kind" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Sort the roster by member kind

**Agent:** `planner`

**Commit subject:** `Sort the roster by member kind`

**Brief:** Commandments: Logic, Uniformity, Performance
(the reads run in parallel). Abominations: Premature
Generalization, Internal Defense, Scattered Context.

**Files:**
- `client/members.ts`:
  - one exported
    `isHumanSeat(seat: HttpMessage<MembershipReadEntity>): boolean`
    that tests `identity_kind === 'person'`
  - `getHumanMemberMap` filters the accepted memberships
    with it before `buildHumanMemberMap`
  - `getHumanMember` refuses a seat that is not accepted
    or not `isHumanSeat`
- `client/members-union.ts`: `getMembers` splits the
  memberships by `isHumanSeat` (humans vs AI and service).
- `client/admin.ts`: `getOrganizationStats`'s
  `activePeopleCount` counts `isHumanSeat` seats only.
  `usedSeats` counts every member kind; it does not
  change.

**Interfaces:**
- No extra GET: the kind rides the memberships read as
  `identity_kind`.

- [ ] **Step 1: The three readers**

As above.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 15's
four cases are `ok`. `tests/adapters-shared.test.ts:59`,
`:81` ('getHumanMemberMap fetches members via adapter',
'Fresh ctx re-fetches each call') stay green. If either
counts GETs, it now sees two more per call. Update the
count, and report it as a behavior change: the verb
reads more.

- [ ] **Step 3: Commit**

```bash
git add client/members.ts client/members-union.ts \
    client/admin.ts
git commit -m "Sort the roster by member kind" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Add any test file Step 2 touched.

---

## Part F: the seed

### Task 17: Pin the seeded AI members

**Agent:** `coder`

**Commit subject:** `Pin the seeded AI members`

**Brief:** Commandments: Reliability, Uniformity.
Abominations: Test Weakening.

**Files:**
- Modify: `tests/mock-data-pairs.test.ts`:
  - `:172` becomes `1889` (1881, plus four service
    identities, plus four memberships)
  - a new case after `:315`'s
- Modify: `tests/drift-identities.test.ts:214`: identities
  `13` becomes `17`.
- Modify: `tests/mock-data-two-organizations.test.ts:542-567`:
  'password credential per identity' skips every
  `service` identity, not only the system's. This is the
  same covenant: a person signs in by password.

**Interfaces:**
- Consumes `buildAiMembers()` (`api/mock-data/ai-members.ts:6`),
  `STARK_ORGANIZATION`, `membershipNameOf`, and the file's
  seeded-pairs reader.

- [ ] **Step 1: The new case**

'each seeded AI is a service identity with an accepted
Stark membership'. For every `buildAiMembers()` entry
`m`:
- the head at `('/identities/', m.id)` has body
  `{ id: m.id, kind: 'service' }`
- the head at
  `('/invitations/', membershipNameOf(STARK_ORGANIZATION, m.id))`
  has `type: 'member'` and `state: 'accepted'`
- no `/invitations/` head names `m.id` in Wayne

- [ ] **Step 2: Layer 1 is red in exactly these**

Run `./test`, teed to `task17-red.log`. Expected red:
- the new case
- 'a mock-data seed populates pairs' (1881 against 1889)
- drift-identities' identity count (13 against 17)

The two-organizations edit stays green: today it skips
only the system, and no AI identity exists yet.

- [ ] **Step 3: Commit**

```bash
git add tests/mock-data-pairs.test.ts \
    tests/drift-identities.test.ts \
    tests/mock-data-two-organizations.test.ts
git commit -m "Pin the seeded AI members" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: Seed each AI as a member of Stark

**Agent:** `planner`

**Commit subject:** `Seed each AI as a member of Stark`

**Brief:** Commandments: Reliability, Uniformity (an AI
member is seeded the way the statement makes one).
Abominations: Premature Optimization, Test Weakening.

**Files:**
- `api/mock-data/seed-message-pairs.ts`. Beside the AI
  document invocations (`:1690-1701`), add two
  invocations per AI:
  - a `service` identity at `identities/:id`
    (`identityDocumentBodyOf('service')`), as the system
    identity's (`:1460-1471`)
  - an accepted `member` membership through
    `MEMBERSHIP_ITEM_ROUTE` with
    `membershipSeedBody(STARK_ORGANIZATION, m.id, 'member')`,
    as the humans' (`:1354-1381`)
- `api/mock-data.ts`. In the same waves:
  - `postIdentityDocumentOp`, beside the system
    identity's (`:665-674`)
  - `putInvitationOnOrganizationNest` with the supplied
    pair, beside the humans' (`:625-637`)
- `api/mock-data/seed-message-pairs.ts:1350-1353`: extend
  the membership comment to name AI members.
- `tests/mock-data-pairs.test.ts:83-171`: rewrite the
  count comment's AI lines, which are stale today. Each
  AI now forms its organization document, its `service`
  identity, and its accepted membership. Correct the
  system line too.

**Interfaces:**
- Seed keys:
  - `seedMessagePairKey('identities/:id', m.id)`
  - `seedMessagePairKey(MEMBERSHIP_ITEM_ROUTE, m.id + '-0')`

  Read the humans' suffix form at `:1354-1381`, and match
  it.
- The bootstrap seed does not change: it seeds no AI.

- [ ] **Step 1: Pass 1 and pass 2**

As above.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 17's
cases are `ok`. The following must stay green:
- `tests/drift-identities.test.ts:205-250`. It filters
  to Stark-seated ids, which now include the four AIs.
- `tests/mock-data-two-organizations.test.ts:399-414`.
  Each AI is single-organization.

- [ ] **Step 3: `./test postgres` is green**

Run `./test postgres`. It needs Docker and
127.0.0.1:5432 free. Expected: exit 0.
`tests/pg-seed.test.ts:312-337` still prints 12 sign-in
lines: AIs have no password.

- [ ] **Step 4: Commit**

```bash
git add api/mock-data/seed-message-pairs.ts \
    api/mock-data.ts tests/mock-data-pairs.test.ts
git commit -m "Seed each AI as a member of Stark" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part G: an AI is live while its membership is accepted

### Task 19: Pin AI liveness and the program-member law

**Agent:** `planner`

**Commit subject:** `Pin AI liveness and program memberIds`

**Brief:** Commandments: Logic, Reliability, Security
(the write law). Abominations: Test Weakening.

The owner's ruling, given after the first draft: the
flow write law's `memberIds` check refuses a service
member's id as it refuses an AI's (option A). The law's
message, "person identities only", becomes true again.
The law dates from `2c5ed9a2`, where it guarded the move
of AI ids out of `memberIds`. "Not an AI" meant "a
person" only while people and AIs were the only members.
Checking `memberIds` against membership in general stays
out of scope.

**Files:**
- Modify: `tests/api-ai-agents.test.ts`. Add:
  - 'a flow write naming a removed AI member in agentIds
    is 400'
  - 'a flow write naming a removed AI member in memberIds
    is 400'
- Modify: `tests/api-service-members.test.ts`. Add 'a
  flow write naming a service member in memberIds is
  400'.
- Modify: `tests/adapters-ai-members.test.ts`. Add
  'getAIMembers omits an AI whose membership is removed'.
- Modify: `tests/adapters-members-union.test.ts`. Add
  'getMembers omits an AI whose membership is removed'.

**Interfaces:**
- Each file's world:
  1. `seedAdminSchema`.
  2. One AI member made by the statement (a local
     `postMember`, as in Task 15).
  3. That membership removed:
     `PUT /organizations/<STARK>/invitations/<STARK>:<id>`
     with `{ state: 'removed', at }` and `If-Match` set to
     the statement's `ETag`.

  The removal answers 200.

- [ ] **Step 1: The five cases**

The flow PUTs use `tests/api-ai-agents.test.ts`'s
`flowDocument` and `graphNode` shape, with
`If-None-Match: *`. `tests/api-service-members.test.ts`
copies the two helpers locally; it is one file's need,
not a fixture.

- **Removed AI in `agentIds`.** With the AI removed, a
  flow PUT with `graphNode([], [id])` answers 400. The AI
  document still answers 200, because removal leaves it.
- **Removed AI in `memberIds`.** With the AI removed, a
  flow PUT with `graphNode([id])` answers 400, with
  `{ error: 'memberIds may name person identities only, not AI agents or services' }`.
  A program stays a program after its membership ends.
- **Service in `memberIds`.** With `serviceMember()`'s
  world, a flow PUT with `graphNode([id])` answers 400,
  with the same body. The flow head is `null` afterwards.
- **getAIMembers:** the result has no member with that
  id.
- **getMembers:** no `isAIMember` member has that id.

- [ ] **Step 2: Layer 1 is red in exactly these**

Run `./test`, teed to `task19-red.log`. Expected red:

| Case | Actual | Expected |
|---|---|---|
| removed AI in `agentIds` | 201 | 400 |
| service in `memberIds` | 201 | 400 |
| getAIMembers omits… | lists the AI | omits it |
| getMembers omits… | lists the AI | omits it |

'Removed AI in `memberIds`' is red on its body only. Its
status is already 400, because Task 2's law refuses any
of the organization's AI documents, but the message
differs. Report its actual body.

- [ ] **Step 3: Commit**

```bash
git add tests/api-ai-agents.test.ts \
    tests/api-service-members.test.ts \
    tests/adapters-ai-members.test.ts \
    tests/adapters-members-union.test.ts
git commit -m "Pin AI liveness and program memberIds" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: Read AI liveness and refuse program memberIds

**Agent:** `architect` (`AIMember` gains its membership,
which Task 30's Remove latches; the law's two sets are
shared by both write paths)

**Commit subject:** `Read AI liveness, refuse program memberIds`

**Brief:** Commandments: Logic, Uniformity (the server
law and the client picker read one rule), Reliability,
Telling not asking. Abominations: Shared Mutable State,
Internal Defense, Test Weakening (the unit tests' call
sites gain an argument, and their assertions stay).

**Files:**
- `api/validators.ts:198-222`: `assertFlowGraphWriteLaw`
  takes two sets. The `memberIds` message and the comment
  become the ones below.
- `api/routes.ts:1306-1315`: `assertLiveFlowGraphWriteLaw`
  runs three reads in parallel:
  - `liveOrganizationDocumentIds(db, organization, 'ai-agents')`
  - `liveOrganizationDocumentIds(db, organization, 'services')`
  - `organizationMembershipHeads(db, organization, { kind: 'state', state: 'accepted' })`
    (`api/memberships.ts:321-332`)

  From them it builds:
  - `programIds`: the AI document ids together with the
    service document ids
  - `liveAgentIds`: the AI document ids whose id is an
    accepted membership's `identity_id`
- `tests/validators.test.ts:806`, `:831`, and every other
  `assertFlowGraphWriteLaw(` call: pass both sets. Each
  case passes its old set as both arguments, and every
  assertion stays.
  `'not AI agents'` (`:806`) still matches the new
  message.
- `shared/types.ts:808-866`: `AIMember` takes and keeps
  `readonly membership: HttpMessage<MembershipEntity>`,
  as `HumanMember` does (`:721-740`).
- `client/ai-members.ts`:
  - `buildAIAgentMap` (`:62-82`)
  - `getAIMemberMap`, `getAIMembers` (`:84-98`)
  - `getAIMember` (`:100-117`)
  - `buildAIMemberMap` (`:30-60`), which has no
    importer: delete it
- `client/members-union.ts:41-64`: `getMembers` joins the
  AIs to its accepted memberships.
- `tests/member-fixtures.ts`:
  - `makeAIMember` (`:101-109`) gains a membership
    message. Extract the membership `responseMessage`
    that `makeHumanMember` builds into a private
    `seatedMembership(id: string): HttpMessage<MembershipEntity>`,
    used by both.
  - `seedAIMember` (`:233-243`) lands the AI through the
    statement, as Tony through `handleRequest`, so a
    seeded AI is a member.
  - Delete `aiAgentDocumentMessagePair` (`:174-200`) once
    nothing uses it.

**Interfaces:**
- Produces:
  - `assertFlowGraphWriteLaw(graph: StoredGraph, programIds: ReadonlySet<string>, liveAgentIds: ReadonlySet<string>): void`.
    It does two things:
    - A `memberIds` entry in `programIds` throws
      `'memberIds may name person identities only, not AI agents or services'`.
    - An `agentIds` entry not in `liveAgentIds` throws
      `'agentIds must name a live AI agent'`, unchanged.

    The comment reads: "memberIds may name person
    identities only: an AI or service member is a
    program, whether or not its membership is accepted.
    agentIds must name the organization's live AI
    members."
  - `new AIMember(parent: MemberEntity, detail: AIMemberEntity, membership: HttpMessage<MembershipEntity>)`
  - `buildAIAgentMap(agents: readonly AIAgentEntity[], memberships: readonly HttpMessage<MembershipEntity>[]): Map<MemberId, AIMember>`.
    It keeps only agents whose id holds a membership in
    `memberships`, and gives each its own.
  - `getAIMember(ctx, id)` GETs the document and the
    membership item (`organizations/<org>/invitations/<org>:<id>`).
    A non-accepted membership is a 404 `RequestError`, as
    a missing document is. Member detail's
    `isAbsentMember` (`web-app/members/detail.ts:143-148`)
    already reads that as absent.
- [ ] **Step 1: The server law**

As above.

- [ ] **Step 2: The client and the shared type**

As above. `getAIMembers` GETs accepted memberships and
the AI documents in parallel.

- [ ] **Step 3: The fixtures**

As above. Every test that seeds an AI through
`seedAIMember` now gets a member. Any test that counted
the identities or memberships of a world holding a
seeded AI moves its count with the behavior. Name each
one in the report.

- [ ] **Step 4: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 19's
five cases are `ok`.

Three cases create their AI by `PUT`, which no longer
makes a live AI:
- `tests/api-ai-agents.test.ts:131`
- `tests/api-ai-agents.test.ts:161`
- `tests/api-ai-members.test.ts:68`

Rewrite each AI's creation to the statement, keeping
every assertion.

- [ ] **Step 5: Layer 2 is green**

Run `./test browser` as its own call. Expected:
`0 failed`. The flow designer's picker lists the four
seeded AIs, which hold their Stark memberships from
Task 18.

- [ ] **Step 6: Commit**

Stage every file listed, plus the tests Step 4 rewrote.

```bash
git commit -m "Read AI liveness, refuse program memberIds" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part H: the Service member kind on the members page

### Task 21: Pin the service member verbs

**Agent:** `coder`

**Commit subject:** `Pin the service member client verbs`

**Brief:** Commandments: Uniformity (the AI verbs' shape),
Idempotency (one id per dialog session). Abominations:
Unbidden Helper Code.

**Files:**
- Create: `tests/adapters-service-members.test.ts`.

**Interfaces:**
- Produces these cases, which Task 22 turns green:
  - 'postServiceMemberCreation posts the memberships
    statement'
  - 'a second postServiceMemberCreation of one id is 409'
  - 'getServiceMember reads the document and its
    membership'
  - 'getMembers lists a service member as a service'
  - 'a service member save latches its read and answers
    the new head'
- Consumes `recordedContext` (`tests/in-page-facade.ts:95`),
  `adminContext` (`tests/context-fixtures.ts:16`),
  `assertRejects`, and `RequestError`.
- The file imports `postServiceMemberCreation`,
  `getServiceMember`, `getServiceMemberEntity`, and
  `putServiceMember` from `../client/service-members.ts`,
  which Task 22 creates. Until then `./test check` fails
  with exactly one TS2307 for that specifier. That is
  this red commit's named type error (Global
  Constraints).

- [ ] **Step 1: The five cases**

- **'postServiceMemberCreation posts the memberships
  statement'.** Through `recordedContext`, one write is
  sent. It is a POST to
  `/api/organizations/<STARK>/memberships/` with no
  `If-Match` or `If-None-Match`, and the body is exactly:

  ```
  { id, kind: 'service',
    membership: { type: 'member', at: <the sent at> },
    service: { name: 'CI bot', description: 'Builds' } }
  ```

  Read `at` from the sent body and assert it is an
  RFC-3339 Z timestamp.
- **'a second postServiceMemberCreation of one id is
  409'.** The second call rejects with a `RequestError`
  of status 409. One accepted membership exists.
- **'getServiceMember reads the document and its
  membership'.** It returns a member whose `kind` is
  `'service'`, `nameText()` is `'CI bot'`,
  `descriptionText()` is `'Builds'`, and whose
  `membership.body().toValue().state` is `'accepted'`.
- **'getMembers lists a service member as a service'.**
  Exactly one member has `kind === 'service'`, and it has
  that id.
- **'a service member save latches its read and answers
  the new head'.** This mirrors
  `tests/adapters-ai-members.test.ts:78`.
  1. Create the member.
  2. `held = await getServiceMemberEntity(ctx, id)`.
  3. Through `recordedContext`,
     `putServiceMember(ctx, held, { name: 'CI bot', description: 'Builds v2' })`.
  4. The one write sent is a PUT to
     `/api/organizations/<STARK>/services/<id>` whose
     `If-Match` is `held`'s ETag.
  5. The returned message's body is
     `{ id, name: 'CI bot', description: 'Builds v2' }`.

- [ ] **Step 2: Red in exactly this file**

`./test lint` exits 0. `./test check` fails with only
`TS2307: Cannot find module '…/client/service-members.ts'`.
`./test`, teed to `task21-red.log`, fails only
`tests/adapters-service-members.test.ts`, at module load.

- [ ] **Step 3: Commit**

```bash
git add tests/adapters-service-members.test.ts
git commit -m "Pin the service member client verbs" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: Add the service member client verbs

**Agent:** `planner`

**Commit subject:** `Add the service member client verbs`

**Brief:** Commandments: Uniformity, Clarity, Single
Responsibility. Abominations: Premature Generalization
(a sibling file to `client/ai-members.ts`, not a generic
member module), Foreign Tongues.

**Files:**
- `shared/types.ts`:
  - `MemberKind` (`:21`) gains `'service'`.
  - Add `ServiceMember` after `AIMember`.
  - Add `isServiceMember` after `isAIMember` (`:948-952`).
  - The `Member` union (`:936-940`) gains `ServiceMember`.
- `api/validators.ts:465-478`: `validateMemberEntity`'s
  enum gains `'service'`, keeping it truthful to
  `MemberKind`.
- Create `client/service-members.ts`.
- `client/index.ts`: re-export it.
- `client/members-union.ts:41-64`: `getMembers` adds the
  service members, joined to their accepted memberships
  as Task 20 joins AIs.
**Interfaces:**
- Produces, in `shared/types.ts`:

```ts
export class ServiceMember {
    readonly kind = 'service' as const;
    readonly membership: HttpMessage<MembershipEntity>;
    constructor(
        detail: ServiceEntity,
        membership: HttpMessage<MembershipEntity>,
    );
    idForLink(): string;
    nameText(): string;
    name(): string;
    descriptionText(): string;
    matchesSearch(term: string): boolean; // name or description
}
```

- Produces, in `client/service-members.ts`:
  - `subscribeServiceMemberChanges(fn: () => void): () => void`,
    over a `serviceMemberChanges` channel, as
    `client/ai-members.ts:14-21`
  - `type ServiceMemberDraft = Omit<ServiceEntity, 'id'>`
  - `buildServiceMembers(services: readonly ServiceEntity[], memberships: readonly HttpMessage<MembershipEntity>[]): ServiceMember[]`
  - `getServiceMember(ctx: RequestContext, id: MemberId): Promise<ServiceMember>`,
    whose miss is the same 404 rule as `getAIMember`
  - `postServiceMemberCreation(ctx: RequestContext, id: MemberId, input: ServiceMemberDraft): Promise<void>`,
    which POSTs the statement, then notifies
    `notifyMembershipChanges()` and its own channel
  - `getServiceMemberEntity(ctx: RequestContext, id: MemberId): Promise<HttpMessage<ServiceEntity>>`,
    as `getAIMemberEntity` (`client/ai-members.ts:119-124`)
  - `putServiceMember(ctx: RequestContext, held: HttpMessage<ServiceEntity>, input: ServiceMemberDraft): Promise<HttpMessage<ServiceEntity>>`,
    a PUT latched with `[held]`, then a notify on its own
    channel, as `putAIMember` (`:128-145`)

- [ ] **Step 1: The type, the verbs, and the union**

As above.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 21's
five cases are `ok`. The members page compiles, because
`ManagedMembersPresenter` filters by kind and ignores a
`'service'` member until Task 24.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts api/validators.ts \
    client/service-members.ts client/index.ts \
    client/members-union.ts
git commit -m "Add the service member client verbs" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Pin the Services chip and section

**Agent:** `coder`

**Commit subject:** `Pin the Services chip and section`

**Brief:** Commandments: Clarity, Uniformity.
Abominations: Test Weakening.

**Files:**
- Modify: `tests/member-fixtures.ts`. Add
  `makeServiceMember(id: string, name: string): ServiceMember`,
  using Task 20's `seatedMembership`.
- Modify: `tests/presenter-members.test.ts`:
  - add 'kind=service filter shows only SERVICES'
  - add 'ManagedMembersPresenter renders a SERVICES
    section below AIs'
  - extend 'kind=ai filter hides YOU and HUMANS' (`:201`)
    and 'kind=human filter hides AIs but keeps YOU'
    (`:232`) with one service member each, asserting
    SERVICES is hidden

**Interfaces:**
- `applyManagedMembersKind(s, 'service')` fails
  `./test check` with TS2345 while `MemberKindFilter` is
  `'all' | 'human' | 'ai'`. That is this red commit's
  named type error. Write no cast: Task 24 widens the
  type.

- [ ] **Step 1: The cases**

- **'kind=service filter shows only SERVICES'.** The
  HTML holds `SERVICES` and the service's name. It does
  not hold `YOU`, `HUMANS`, or `AIs`.
- **'…renders a SERVICES section below AIs'.**
  `html.indexOf('AIs') < html.indexOf('SERVICES')`, and
  the service row links `member-detail` with its id.
- **The extended cases.** Each asserts
  `!html.includes('SERVICES')`.

- [ ] **Step 2: Layer 1 is red in exactly these four**

`./test check` fails with only TS2345, at the
`'service'` argument. Run `./test`, teed to
`task23-red.log`. Exactly the four cases fail, on their
assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/member-fixtures.ts \
    tests/presenter-members.test.ts
git commit -m "Pin the Services chip and section" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Render service members on the roster

**Agent:** `planner`

**Commit subject:** `Render service members on the roster`

**Brief:** Commandments: Clarity, Uniformity,
Accessibility (the chip's `aria-pressed`, as its
siblings). Abominations: Premature Generalization,
inline styles.

**Files:**
- `web-app/app/presenters/member.ts`:
  - `MemberKindFilter` (`:27-30`) gains `'service'`.
  - Add `ServiceMemberRowPresenter` after
    `AIMemberRowPresenter` (`:125-198`): avatar icon,
    `nameText()`, `descriptionText()`, and a
    `member-detail` link.
  - `ManagedMembersPresenter` (`:258-397`) gains a
    SERVICES section after AIs, with the header
    `SERVICES` and the empty copy
    `No services match your filter.`
  - Kind `service` hides YOU, HUMANS, and AIs. Kind `ai`
    hides SERVICES. Kind `human` hides AIs and SERVICES.
  - Add `serviceCount()` beside `aiCount()`.
- `web-app/members/index.html:48-68`: add
  `data-kind-chip="service"` "Services" after "AIs".
  Subtitle (`:5-8`): "Manage humans, AIs, and services in
  your organization".
- `web-app/members/index.ts:330-334`: `onKindChipClick`
  accepts `'service'`.
- `web-app/app/page-registry.ts:234`: the members page's
  keywords gain `services`.

- [ ] **Step 1: The presenter, chip, and keywords**

Pick the service avatar from the existing icon module,
choosing one that reads as a program. Name the choice in
the report. Add no new icon.

- [ ] **Step 2: Layer 1 is green**

Run `./test validate`. Expected: exit 0, and Task 23's
cases are `ok`.

- [ ] **Step 3: Commit**

```bash
git add web-app/app/presenters/member.ts \
    web-app/members/index.html web-app/members/index.ts \
    web-app/app/page-registry.ts
git commit -m "Render service members on the roster" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Pin the Service kind in the add-member dialog

**Agent:** `coder`

**Commit subject:** `Pin the Service kind in the add dialog`

**Brief:** Commandments: Reliability, Accessibility,
Uniformity. Abominations: Unbidden Helper Code.

**Files:**
- Modify: `tests/browser/member-create.test.ts`. Add
  'adding a service member toasts success and lists it'.
- Modify: `tests/browser/dialogs.test.ts:16-20`.
  `ADD_MEMBER_FIELDS` gains `'#service-name'` and
  `'#service-description'`.

- [ ] **Step 1: The browser case**

1. `openAddMember(page, origin.baseUrl)`.
2. Click `#add-member-kind-toggle input[value="service"]`.
3. Wait until `#add-member-service-form` is visible
   (`checkVisibility()`).
4. Set `#service-name` to `'CI bot'` and
   `#service-description` to `'Builds every commit'`.
5. Click `#add-member-submit`.
6. `until` a toast includes `'Service member added'`,
   the dialog closes, and the body text includes
   `'CI bot'`.
7. Then hold the same `stays` and error-toast checks
   'adding a human member…' holds.

- [ ] **Step 2: Layer 1 green, Layer 2 red in these two**

Run `./test validate` (exit 0), then `./test browser` as
its own call. Expected red, and nothing else:
- the new case: the radio is absent, so `click` fails
- 'the add-member dialog reopens with every field
  empty': `#service-name` is absent

- [ ] **Step 3: Commit**

```bash
git add tests/browser/member-create.test.ts \
    tests/browser/dialogs.test.ts
git commit -m "Pin the Service kind in the add dialog" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 26: Add the Service kind to the add-member dialog

**Agent:** `planner`

**Commit subject:** `Add the Service kind to the add dialog`

**Brief:** Commandments: Accessibility (a labelled
radio, labelled fields, Enter submits), Reliability (one
id per dialog session), Clarity. Abominations: Swallowed
Failures (a failure reports through `reportFault` and
keeps the dialog open), Default Values.

**Files:**
- `web-app/members/index.html`:
  - `:115-142`: a third radio, `value="service"`, label
    "Service", after AI.
  - After `#add-member-ai-form` (`:239-288`), add
    `#add-member-service-form` with class `hidden`. It
    holds `#service-name` (label "Name") and
    `<textarea id="service-description">` (label
    "Description"), both marked required, in the AI
    form's markup idiom.
- `web-app/members/index.ts`:
  - `selectedKind()` (`:538-548`) returns
    `'human' | 'ai' | 'service'`.
  - `onKindRadioChange` (`:503-527`) shows exactly the
    selected form.
  - `clearAddMemberFields` (`:405-414`) clears the two
    new fields.
  - `handleAddMemberSubmit` (`:550-558`) dispatches to a
    new `submitServiceForm`, modelled on `submitAIForm`
    (`:611-659`):
    - toast `'Name and description are required'`
    - call
      `postServiceMemberCreation(ctx, currentMemberId(), trimStrings({ name, description }))`
    - on failure, `reportFault` with
      `'Failed to add service member'`
    - on success, toast `'Service member added'`, then
      `closeDialog('add-member')`
  - `init`: subscribe `subscribeServiceMemberChanges` to
    `refresh`, beside the AI subscription (`:150-155`).

- [ ] **Step 1: Markup and handlers**

As above.

- [ ] **Step 2: Layer 1 and Layer 2 are green**

Run `./test validate` (exit 0), then `./test browser` as
its own call. Expected: `0 failed`.

- [ ] **Step 3: Commit**

```bash
git add web-app/members/index.html web-app/members/index.ts
git commit -m "Add the Service kind to the add dialog" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part I: the AI create moves to the statement

### Task 27: Pin the AI create on the statement

**Agent:** `coder`

**Commit subject:** `Pin the AI create on the statement`

**Brief:** Commandments: Uniformity (every member kind is
one statement). Abominations: Test Weakening.

**Files:**
- Modify: `tests/adapters-ai-members.test.ts`. Retitle
  the case at `:33` (Task 2 retitled it to the
  organization path) to 'postAIMemberCreation posts the
  memberships statement'.

- [ ] **Step 1: Rewrite the case's expectation**

Through `recordedContext`, one write is sent. It is a
POST to `/api/organizations/<STARK>/memberships/` with no
`If-Match` or `If-None-Match`, and the body is:

```
{ id, kind: 'ai',
  membership: { type: 'member', at: <sent at> },
  ai: { name, description, skill_focus, model } }
```

Then `getAIMember(ctx, id).nameText()` is the name. The
old case's name read-back stays as that last assertion.

- [ ] **Step 2: Layer 1 is red in this case only**

Run `./test`, teed to `task27-red.log`. It fails on the
method: PUT against POST.

- [ ] **Step 3: Commit**

```bash
git add tests/adapters-ai-members.test.ts
git commit -m "Pin the AI create on the statement" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 28: Create AI members through the statement

**Agent:** `coder`

**Commit subject:** `Create AI members through the statement`

**Brief:** Commandments: Uniformity, Simplicity.
Abominations: Foreign Tongues.

**Files:**
- `client/ai-members.ts:147-159`: `postAIMemberCreation`
  POSTs the statement body of Task 27. It then notifies
  `notifyMembershipChanges()` and the AI channel. Its
  signature is unchanged.

- [ ] **Step 1: The verb**

As above. Import `notifyMembershipChanges` from wherever
`client/members.ts:287` gets it, and `nowUtc`.

- [ ] **Step 2: Layers 1 and 2 are green**

Run `./test validate`, then `./test browser` as its own
call. Expected: both green.

- [ ] **Step 3: Commit**

```bash
git add client/ai-members.ts
git commit -m "Create AI members through the statement" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part J: member detail for AI and service members

### Task 29: Pin the AI and service member detail

**Agent:** `planner`

**Commit subject:** `Pin the AI and service member detail`

**Brief:** Commandments: Clarity, Accessibility,
Uniformity (Remove reads as a human's). Abominations:
Test Weakening, Unbidden Helper Code.

**Files:**
- Create: `tests/presenter-service-member-detail.test.ts`.
- Modify: `tests/presenter-member-detail.test.ts`, which
  holds the AI detail cases (its fixture is at `:138`).
- Modify: `tests/adapters-members.test.ts`. Add
  'postMembershipRemoval removes an AI or service
  member'.
- Modify: `tests/browser/member-create.test.ts`. Add
  'removing a service member drops it from the roster'.

**Interfaces:**
- The service presenter test imports
  `ServiceMemberDetailPresenter` from
  `../web-app/app/presenters/service-member-detail.ts`,
  which Task 30 creates. That is TS2307.
- The removal case passes an `AIMember` and a
  `ServiceMember` to `postMembershipRemoval`, whose
  parameter is `HumanMember` until Task 30. That is
  TS2345.
- These are this red commit's named type errors (Global
  Constraints). Write no cast.

- [ ] **Step 1: The red cases**

- **Service detail presenter.** 'service member detail
  shows its name, description, identity link, Edit, and
  Remove'. It is built from `makeServiceMember` (Task 23).
  The HTML holds:
  - the name and the description
  - `href` equal to
    `buildPageUrl('identity-detail', { identityId: id })`
  - `id="member-edit-btn"`
  - `data-dialog-open="confirm-remove"`
- **Service detail presenter, edit mode.** 'service
  member edit mode shows Name and Description fields'.
  The editable render holds inputs prefilled with the
  name and the description, plus `member-cancel-btn`. It
  does not hold `member-remove-btn`. This mirrors the AI
  presenter's edit-mode case in
  `tests/presenter-member-detail.test.ts`; read that case
  and match its draft shape and its calls.
- **AI detail presenter.** 'AI member detail links its
  identity and offers Remove'. The same link and
  `confirm-remove` assertions. `member-edit-btn` stays.
- **Removal adapter.** 'postMembershipRemoval removes an
  AI or service member'. Make one AI and one service
  member through the statement. For each:
  1. Read it (`getAIMember`, `getServiceMember`).
  2. Call `postMembershipRemoval(ctx, member)`.
  3. The membership item's state is `removed`.
  4. The member's document still answers 200, and so
     does its identity.
- **Browser.**
  1. Add a service member as in Task 25.
  2. Click its row, then `page.ready('member-detail')`.
  3. Assert the identity link is visible.
  4. Click `#member-remove-btn`, then
     `[data-member-action="confirm-remove"]`.
  5. `until` the `'Member removed'` toast.
  6. Navigate to members. The body no longer includes
     `'CI bot'`.

- [ ] **Step 2: Red at Layers 1 and 2 in exactly these**

- `./test lint` exits 0.
- `./test check` fails with only the TS2307 and the two
  TS2345 above.
- `./test`, teed to `task29-red.log`, fails:
  - `tests/presenter-service-member-detail.test.ts`, at
    module load
  - the AI presenter case, on its link assertion

  The removal case passes at runtime. `AIMember` has
  carried its membership since Task 20, and the verb
  reads only `idForLink()` and `membership`. Its red is
  the TS2345. Report it as `ok`.
- `./test browser`, as its own call, fails only the
  browser case, at the identity link.

- [ ] **Step 3: Commit**

```bash
git add tests/presenter-service-member-detail.test.ts \
    tests/presenter-member-detail.test.ts \
    tests/adapters-members.test.ts \
    tests/browser/member-create.test.ts
git commit -m "Pin the AI and service member detail" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 30: Show and remove AI and service members

**Agent:** `architect` (a third detail variant, a shared
`SeatedMember` type, and the removal verb's parameter)

**Commit subject:** `Show and remove AI and service members`

**Brief:** Commandments: Uniformity (one Remove for every
kind), Accessibility, Clarity, Liskov (each seated
member offers what removal reads). Abominations:
Inheritance (a union type, not a base class), Premature
Generalization, Swallowed Failures.

**Files:**
- `shared/types.ts`: add
  `export type SeatedMember = HumanMember | AIMember | ServiceMember;`
- `client/members.ts:295-305`:
  `postMembershipRemoval(ctx: RequestContext, member: SeatedMember)`.
  It notifies membership changes, then the member's own
  kind channel.
- `web-app/app/presenters/human-member-detail.ts:562`:
  export `buildRemoveAffordance`. It now has three users.
  Only the `export` keyword changes, with no move.
- Create `web-app/app/presenters/service-member-detail.ts`:
  `ServiceMemberDetailPresenter` and
  `ServiceMemberDraftFields { name: string; description: string }`.
  It has a read mode and an edit mode, as
  `web-app/app/presenters/ai-member-detail.ts` does:
  - one "Service Member" card (Name, Description) and the
    identity link
  - read mode: Edit plus `buildRemoveAffordance(removal)`
  - edit mode: Cancel plus Save
- `web-app/members/detail.ts`: add `saveServiceMember`,
  modelled on `saveAIMember` (`:581-636`):
  - toast `'Name and description are required'` when
    either trimmed field is empty
  - `getServiceMemberEntity`, then
    `putServiceMember(ctx, held, { ...rest, ...patch })`,
    then a reload with `getServiceMember`
  - copy: `'Failed to save service member'`,
    `'Service member saved'`,
    `'Failed to reload service member'`
- `web-app/app/presenters/ai-member-detail.ts`:
  - the "AI Member" card (`:305-316`) gains the identity
    link
  - `buildReadonlyActionButtons` (`:383-394`) takes a
    `SeatRemoval` and renders
    `buildRemoveAffordance(removal)` after Edit
- `web-app/members/detail.ts`:
  - the state (`:62-88`) gains `variant: 'service'`
  - `loadMemberByEitherKind` (`:150-174`) tries human,
    then AI, then service, each absent on
    `isAbsentMember`
  - `seatRemovalOf` (`:153-169`) runs for every variant
  - `performRemove` (`:470-481`) removes any variant
  - `init` subscribes to the service channel

**Interfaces:**
- The identity link's copy is "Identity". Its URL is
  `buildPageUrl('identity-detail', { identityId: member.idForLink() })`
  (`web-app/app/page-registry.ts:272-282`).
- `seatRemovalOf`
  (`web-app/app/presenters/human-member-detail.ts:158`)
  hides Remove only for the last admin. AI and service
  members are never admin (Task 8). Pass them through it
  unchanged, with no special case.

- [ ] **Step 1: The type, the verb, the presenters, the
  page**

As above.

- [ ] **Step 2: Layers 1 and 2 are green**

Run `./test validate`. Expected: exit 0, and every
Task 29 case is `ok`. Then run `./test browser` as its
own call. Expected: `0 failed`.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts client/members.ts \
    web-app/app/presenters/human-member-detail.ts \
    web-app/app/presenters/service-member-detail.ts \
    web-app/app/presenters/ai-member-detail.ts \
    web-app/members/detail.ts
git commit -m "Show and remove AI and service members" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part K: the AI PUT stops creating

### Task 31: Pin the non-creating AI PUT

**Agent:** `coder`

**Commit subject:** `Pin the non-creating AI PUT`

**Brief:** Commandments: Idempotency, Uniformity (as
`services`). Abominations: Test Weakening.

**Files:**
- Modify: `tests/api-ai-agents.test.ts`. Add 'an AI PUT
  with no precondition is 428' and 'an AI PUT never
  creates'. These are Task 3's two cases, with the
  `ai-agents` path and `agentFields`, asserting
  `'Not found: ai-agents/' + id`.

- [ ] **Step 1: Layer 1 is red in exactly these two**

Run `./test`, teed to `task31-red.log`. Today's results:
- 'with no precondition is 428': 201 against 428
- 'never creates': 201 on `If-None-Match: *` against 404

- [ ] **Step 2: Commit**

```bash
git add tests/api-ai-agents.test.ts
git commit -m "Pin the non-creating AI PUT" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 32: Stop creating AI members by PUT

**Agent:** `planner`

**Commit subject:** `Stop creating AI members by PUT`

**Brief:** Commandments: Idempotency, Uniformity,
Security. Abominations: Test Weakening (a test that
created by PUT now creates by statement; its assertions
stay).

**Files:**
- `api/routes.ts`:
  - The spec key `'organizations/:id/ai-agents/:id'`
    becomes
    `{ ...documentWriteResponseSpec(AI_AGENTS_WIRING), conditional: 'required' }`.
  - The item route becomes
    `route('organizations/:id/ai-agents/:id', { select: documentSelect(AI_AGENTS_WIRING), put: documentEditHandler(AI_AGENTS_WIRING) })`,
    replacing `documentEntityRoute`.
  - The wiring comment: "the members statement creates;
    the PUT edits a live head".
- `api/family-registry.ts`: the `ai-agents` comment
  loses "Until Task 32, PUT also creates".
- Regenerate `web-app/api-documentation/`. The AI PUT
  room gains 428 and loses "(optional)".
- Tests that create an AI by PUT move to the statement
  or `seedAIMember`, every assertion kept:
  - `tests/api-ai-agents.test.ts`: Task 1's two cases,
    and L97 'PUT … writes the four fields', now 'an AI
    PUT rewrites the four fields'. It creates by
    statement, PUTs with the GET's `If-Match`, and keeps
    every field assertion.
  - `tests/api-ai-members.test.ts:43`
  - `tests/api.test.ts:144`, `:158` (the rogue-key case
    keeps its 400; send it with `If-Match`)
  - `tests/api-versions-etag.test.ts:694`, `:728` (the
    two-PUT case latches each PUT; its version count
    gains the genesis, as `org-document-put-fence` did
    for organizations)
  - `tests/drift-roster.test.ts` (L303, L575, L632):
    L575's "exactly one document message pair" becomes
    the statement's pairs at the AI document. L632's
    byte-identical resend replays with its `If-Match`.
  - `tests/drift-states.test.ts:1285`
  - `tests/derive-states-union.test.ts:233-243`
    (`createAiMember` creates by statement)

  Grep `ai-agents/` under `tests/` for any PUT left.

- [ ] **Step 1: The spec, the route, and the
  regeneration**

As above.

- [ ] **Step 2: Move the creating tests**

As above. For each, state in the report the test's old
creation call and its new one.

- [ ] **Step 3: Layers 1 and 2 are green**

Run `./test validate` (exit 0; Task 31's cases `ok`),
then `./test browser` as its own call (`0 failed`). The
AI detail Edit already latches (`putAIMember`,
`client/ai-members.ts:128-145`), so the page is
unaffected.

- [ ] **Step 4: Commit**

Stage `api/routes.ts`, `api/family-registry.ts`,
`web-app/api-documentation`, and every test file moved.

```bash
git commit -m "Stop creating AI members by PUT" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part L: the record

Each docs task is `coder` and one commit. Its gate is
`./test validate` (exit 0). The lint checks TEST-PLAN
paths. Prose rules: "organization admin" and "operator",
never a bare "admin"; `grant` is a verb; about 78
characters per line.

### Task 33: Record the member kinds and the flow law

**Commit subject:** `Record the member kinds and flow law`

**Files:** `API.md`, `FLOW-CANVAS.md`
- **`:50-62`, the identity fence.** `GET identities/`
  lists co-members, including AI and service members.
- **`:365-375` and `:389-396`.** The memberships
  statement now carries a `kind`. It covers three kinds,
  and each kind has three handler-declared geneses:
  - human: membership, `person` identity, PII
  - ai: membership, `service` identity, the
    `organizations/<organization-id>/ai-agents/<id>`
    document
  - service: membership, `service` identity, the
    `organizations/<organization-id>/services/<id>`
    document

  A missing or unknown kind is 400. A resend is 409, and
  a member token is 403. An `ai` or `service` body with
  `type: 'admin'` is 400.
- **`:444-452`.** Promoting an AI or service member to
  `admin`, by retype, direct seat, or reinstatement, is
  409. The item PUT reinstates a removed member of any
  kind.
- **New `### Organization member documents` under
  `## Compositions worth knowing`.**
  `organizations/:id/ai-agents/` and
  `organizations/:id/services/`:
  - GET (member); PUT is class B (`required`)
  - an absent id is 404 whatever conditional it carries;
    no precondition is 428
  - one document per organization
  - the global `ai-agents/` routes are gone
- **`:273-279`.** The conditional table's `required` row
  names both families.
- **`:521-529`.** Mock seed
  `EXPECTED_MESSAGE_PAIR_COUNT = 1889`; bootstrap eight.
- **`POST identities/`.** Person only, and a service is
  400.
- **The flow write law, under the flows composition.** A
  node's `memberIds` refuses any of the organization's
  AI or service member ids, accepted or removed, with
  400. Its `agentIds` must name AI members whose
  membership is accepted.
- **`FLOW-CANVAS.md:160-162`.** `memberIds` is person
  members. `agentIds` holds the organization's live AI
  members, not "live `/ai-agents` ids". The write law
  refuses AI and service member ids in `memberIds`.

### Task 34: Name services as co-members in ARCHITECTURE.md

**Commit subject:** `Name services as co-members in tenancy`

**Files:** `ARCHITECTURE.md`
- **§ Tenancy (`:178-189`).** One paragraph: every actor
  is an identity with an accepted membership, so a
  service is a co-member and the identity fence, the
  roster, and the token claims need no rule of their
  own. Services and AIs are never organization admins.
- **§ Identity and memberships (`:199-201`).** The
  roster is accepted memberships. Each membership's kind
  is the organization document its identity names:
  `ai-agents/`, `services/`, or neither (human). An AI or
  service is live while its membership is accepted.
- **`:219-227`.** Removal of any kind is a membership
  write.

### Task 35: Name the one credential kind in SCHEMA.md

**Commit subject:** `Name the password credential kind`

**Files:** `SCHEMA.md` `## Secrets` (`:137-172`). Add one
paragraph after `:166-172`:
- `password` is the only credential kind
- a service signs in by `client_credentials` with
  `private_key_jwt`, verified against its registration's
  `jwks`, and holds no stored secret
- a `client_secret` body is refused at the gate

### Task 36: Rewrite the members-page cases in TEST-PLAN

**Commit subject:** `Rewrite the members cases for services`

**Files:** `TEST-PLAN.md`
- **AA4 (`:631`).** The Kind toggle has Human, AI, and
  Service.
- **AA7a (`:683-696`).** AIs are seated members of Stark,
  not global. Creating "Ops Assistant" is one POST
  `organizations/:id/memberships/` with `kind: 'ai'`.
  Pin: tests/adapters-ai-members.test.ts
  'postAIMemberCreation posts the memberships statement'.
- **G11 (`:5180`) and G13 (`:5236`).** The chips are
  All, Humans, AIs, and Services. The groups are YOU,
  HUMANS, AIs, and SERVICES. Pins: the Task 23 cases.
- **New G14b, after G14a (`:5333`).** Kind=Service:
  - Name and Description required, so "Name and
    description are required"
  - Create gives "Service member added" and the row under
    SERVICES
  - the member's detail links its identity, whose
    registration card is G47
  - Edit changes the description, and "Service member
    saved" shows it
  - Remove ends the membership, and the row leaves
    SERVICES

  The added pins are
  tests/adapters-service-members.test.ts 'a service
  member save latches its read and answers the new
  head', and tests/browser/member-create.test.ts
  'removing a service member drops it from the roster'.

  Pin: tests/browser/member-create.test.ts 'adding a
  service member toasts success and lists it'.
- **G14a (`:5333-5347`).** The AI create is the
  statement.
- **G19 (`:5685`).** `MEMBER_VERBS` no longer lists
  `/ai-agents`.
- **G24 (`:5768`) and G41 (`:6134`).** The AI PUT is
  under the organization and needs `If-Match`. AI detail
  offers Remove and an identity link. Pin: Task 29's AI
  presenter case.
- **G43 (`:5259-5283`).** The identities page has no
  Add Identity. Service rows are the system identity
  plus every AI and service member. Drop "AA7a's 'Ops
  Assistant' is … not an identity row".
- **The session-role note (`:5168-5178`).**
  `getMemberMap` reads accepted memberships, the
  organization's `ai-agents/` and `services/`, and the
  system member.
- **The summary table (`:463`, `:470`).** G gains one
  case (G14b): 41, total 405.

### Task 37: Restore G47 in TEST-PLAN

**Commit subject:** `Restore the G47 registration case`

**Files:** `TEST-PLAN.md:5923-5974`.
- Delete G47's failing preamble (`:5923-5929`, "This case
  fails because … would restore").
- Its opening becomes: "On the members page (admin
  session), add a Service member 'CI bot' (G14b), open
  its detail, follow its Identity link → the identity
  detail page".
- The rest of the procedure stays.
- Add a pin: tests/api-service-members.test.ts 'an
  organization admin reaches a service member identity
  (G47)'.

### Task 38: Close the TODO lines and file reinstatement

**Commit subject:** `Close the client_secret and G47 lines`

**Files:** `TODO.md`
- Delete the Later-work bullets at `:3329-3334`
  (`client_secret`) and `:3337-3338` (the
  service-identity rule).
- **File, in their place, the owner's ruling 1 line:**
  "A members-page control to reinstate a removed member.
  The API already reinstates one through the item PUT
  (`removed → accepted`); the page offers Remove only.
  Oracle: a removed AI, service, or human member
  restores from the Former members view, as `type:
  'member'`."
- **Item 5 (`:553-574`).** It cites `postIdentityCreation`
  and `client/identities.ts:284`, which are gone. Rewrite
  that clause: "no page mints a credential: the seed
  does; a service signs in by `client_credentials` and
  holds none".
- **Item 12 (`:747-772`).** The citation
  `tests/family-registry.test.ts:97-105` now names
  'ai-agents is an organization-plane family'. Update
  the line range, and add "an AI seat's identity is a
  `service` identity with an accepted membership".
- **`:2529-2535`.** The `buildHumanMemberMap` citation:
  update its line.

---

## Finish gate

### Task 39: Run the finish gate

**Agent:** `coder` (verification only; commits nothing)

Runs after the architect's branch review and any fixes.

- [ ] **Step 1: Clean tree, the log**

Run `git status --short && git log --oneline 2af0b94b..HEAD`.
Expected: no status output, and 38 task commits plus any
review-fix commits above the plan commit.

- [ ] **Step 2: Layer 1**

Run `export DENO_DIR="$TMPDIR/deno-dir"` (its own call),
then `./test validate` on the tip. A clean HEAD may
SHA-skip. If it does, run `./test` and `./test check`
directly. Expected: exit 0.

- [ ] **Step 3: Layer 2**

Run exactly `./test validate browser`. Expected: exit 0,
and the browser summary `0 failed`.

- [ ] **Step 4: Postgres**

Run `./test postgres`. Expected: exit 0. The seed changed
in Tasks 14 and 18.

- [ ] **Step 5: The spec's Verification oracles**

Run each and report PASS or FAIL with its output:
- `grep -rn "client_secret" api client shared server web-app`
  prints nothing.
- `grep -rn "postIdentityCreation\|add-identity" client web-app`
  prints nothing.
- `grep -n "liveGlobalDocumentIds" -r api` prints
  nothing.
- `ls web-app/api-documentation/get | grep -x ai-agents`
  prints nothing.
- Each red log under `$TMPDIR/service-members/` holds its
  task's FAILED names.

The controller reports to the owner and stops. The owner
lands the branch.

---

## Questions for the owner

Settled by the owner after the first draft:
- TODO closures stay in the docs tail (Task 38).
- The service member detail page is editable (Tasks 21,
  22, 29, and 30).
- The flow write law refuses a service member's id in
  `memberIds`, as it refuses an AI's (option A; Tasks 19
  and 20). Checking `memberIds` against membership in
  general stays out of scope.

None remain open.
