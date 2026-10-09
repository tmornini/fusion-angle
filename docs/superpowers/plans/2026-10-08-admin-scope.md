# Admins act within their organization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`)
> syntax for tracking. Ride this worktree. Do not
> create one. Do not rebase, merge, land, push,
> force-push, or delete a branch. One worker. Subagents
> work here and never pass the Agent tool `isolation`.
>
> **For the dispatching orchestrator:** every subagent
> prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the voice
> rules (78-char lint on code and scripts, which covers
> this plan's code, not `.md`; 4-space indent; no inline
> styles; present-tense imperative ~50-char commit
> subjects, no body, then the trailers under Global
> Constraints), the commandments and abominations the
> task names, the AGENTS.md § Subagents patterns (quoted
> in Global Constraints), and a base precondition (HEAD
> is the SHA the dispatch names and `git status --short`
> is empty, else STOP). Subagents work in
> `/Users/tmornini/code/fusion-angle/.worktrees/admin-scope`,
> never pass the Agent tool `isolation`, and never run
> `./deploy` in any form, `./bin/build`,
> `./bin/measure`, `./bin/postgres-seed`,
> `./bin/postgres-wipe`, or any seed or wipe verb. No
> walk. Layer 2 is authorised only where a task names
> `./test browser` or `./test validate browser`.
>
> Task 0 is yours, before any dispatch. Then, per task,
> in order, before the next task starts:
>
> 1. Implementer: a fresh agent of the type the task
>    names (`coder` for rename-only and docs tasks;
>    `planner` for behavior tasks).
> 2. Spec-compliance review: a fresh agent of type
>    `planner`.
> 3. Quality review: another fresh agent of type
>    `planner`, who walks each rule the task touches for
>    false matches and false misses.
>
> After Task 17: a fresh agent of type `architect`
> reviews `ed1f973c..HEAD` against the spec. Pass no
> model override to any dispatch.
>
> A reviewer's finding is fixed by a fresh agent of the
> task's implementer type that amends the task's own
> commit (`git commit --amend --no-edit`; the branch is
> local), re-runs the task's gates, and is reviewed
> again by a fresh `planner` of the same kind. A finding
> that says the spec is wrong is not fixed: STOP and
> report it to the owner. If Chrome cannot launch, STOP
> at that step and report it; do not work around it.

**Goal:** Hold every organization's admin to co-members
on the identity plane; split the organization nest into
`invitations/` and `memberships/`; create a person as
one statement at `POST organizations/:id/memberships/`;
carry `expires_at` on a pending invitation; register
`/invitations/` as backing storage; make `grant` a verb.

**Architecture:** Vocabulary renames land first, each
its own commit, no behavior change except the `grantAt`
→ `at` wire key. The `memberships/` view and the
statement land next, in that order, so the members page
works at every commit. The identity fence and the
identity-nest self-only rule follow. `expires_at`, the
storage map, and the docs close the item.

**Tech Stack:** Deno 2.9.6, TypeScript (`strict`,
`noUncheckedIndexedAccess`, `erasableSyntaxOnly`,
`verbatimModuleSyntax`), `@std/assert`, Chrome over CDP
for Layer 2.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-scope-design.md`
(commit `ed1f973c`). The spec is the source of truth.
Its ten numbered decisions, `INVITATION_EXPIRY_DAYS =
14`, the seed pending invitation expiring one year after
`MOCK_SEED_TIMESTAMP`, `grant` as a verb, items staying
at `organizations/:id/invitations/:membership-id`, and
the identities-page / service-identity consequences are
settled. Do not reopen them.

**Worktree:** `.worktrees/admin-scope`, branch
`admin-scope`, cut from `todo-audit` at `619a9e3e`.
Commit 1 is the spec (`ed1f973c`), commit 2 this plan.
Lands by `git -C .worktrees/todo-audit merge --ff-only
admin-scope`, on the owner's word. `master` does not
move. Never `-D`. Never force-push.

**Out of bounds:** the spec, this plan, `master`,
`todo-audit`, item and version relocation under
`memberships/`, `identities/:id/memberships/`, the
identities page's person create, service identities, a
derived map of every storage prefix, the retired
role-grant identifiers, deletion after expiry, and every
file a task does not name. If the spec is wrong, STOP
and report.

---

## Global Constraints

- Sandbox, before any `deno` command, `./test`, or
  `./deploy`:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
```

- Work in
  `/Users/tmornini/code/fusion-angle/.worktrees/admin-scope`.
- Code edits are exact string replacements. Every old
  text below was unique on `ed1f973c`. If the Edit tool
  refuses a non-unique old text, STOP and report.
- Touch nothing the task does not name: no reflow, no
  drive-by fix, no helper the task does not give.
- Voice: 78-character lines in files `./test lint`
  still lints; 4-space indent; no inline styles; no
  untyped `any`; `noUncheckedIndexedAccess` is on.
  Spell `organization`. `grant` is a verb: the noun
  stays only for RFC 6749 `grant_type` /
  `invalid_grant`, RFC 7591 `grant_types`, Postgres
  `GRANT`, and the OAuth adapter's internals.
- Pins that stay, every commit: `POST /human-members`
  is retired 404 (`tests/api-human-members.test.ts`
  `'POST /human-members is retired 404'`). Nothing ever
  writes under `organizations/:id/members/`.
- Red first on every behavior change. A rename-only
  task has no red test.
- Gate before every commit, with a 600000 ms timeout:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test validate > "$TMPDIR/0d-gate.log" 2>&1
echo "exit $?"
sed 's/\x1b\[[0-9;]*m//g' "$TMPDIR/0d-gate.log" \
    | grep -E '^(ok|FAILED) \|'
```

  Expected: `exit 0`, then the UTC pass `ok | N passed
  | 0 failed`, then the timezone pass `ok | 8 passed |
  0 failed`. The tree is dirty when it runs, so the SHA
  skip never fires. Any fail: STOP and report. N may
  rise as tasks add tests; it must not fall unless the
  task deletes a test it names.

- Layer 1, chosen files (`FILES` names them):

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/admin-scope
export DENO_DIR="$TMPDIR/deno-dir"
FILES='tests/api-identity-fence.test.ts'
JWT_HMAC_SIGNING_KEY=test-hmac-signing-key TZ=UTC \
deno test --frozen --no-check \
    --sanitize-ops --sanitize-resources \
    --allow-env --allow-read --allow-write --allow-net \
    --preload ./tests/hmac-test-key.ts \
    --preload ./tests/local-storage-stub.ts \
    --preload ./tests/session-storage-stub.ts \
    --preload ./tests/worker-name-prefix.ts \
    $FILES 2>&1 | sed 's/\x1b\[[0-9;]*m//g' \
    | grep -E '\.\.\. (ok|FAILED)|^(ok|FAILED) \|'
```

- Commit message: one subject line (the task's exact
  subject), no body, a blank line, the Co-Authored-By
  trailer naming the model that writes the commit, then
  the session line the executing session's attribution
  reminder gives, if it gives one:

```bash
git commit -F - <<'MSG'
<exact subject>

Co-Authored-By: Grok 4.6 <noreply@x.ai>
SESSION_LINE
MSG
```

- Author stays the repository's configured user. Do not
  pass `--author`. Stage only the files the task names,
  by path. Never bare `git stash`. Never `-D`. Never
  force-push.
- AGENTS.md § Subagents patterns, pushed down to every
  subagent: RequestContext as the first argument to
  client verbs; a client verb returns an `HttpMessage`,
  an array of them, or a value that keeps one (the
  aggregates TODO.md's three-shapes bullet names
  excepted); a write from a held message takes the
  message it latches; SafeHtml from presenters;
  snake_case storage / camelCase domain; HTTP-verb
  adapter naming (`getNoun` / `putNoun` / `deleteNoun`
  / `postNounOperation`); validators at the gate, not
  downstream; no untyped `any` from external
  boundaries.
- Subagents never run `./deploy --render`.

---

## File structure

| File | Responsibility |
|---|---|
| `api/api.ts` | Identity fence after `authorizeRequest`, before body parse; drop `memberViewRefusal` on the invitations collection |
| `api/authorization.ts` | `MEMBER_VERBS` row moves from invitations to memberships |
| `api/membership-gate.ts` | `invitationsViewQueryOf`, `membershipsViewQueryOf`; `viewQueryOf` stays for the identity nest |
| `api/memberships.ts` | `expires_at` on pending; `validateMembershipBody`; `storedMembership` via the domain; comment rename |
| `api/validators.ts` | `validateMembershipCreateBody` |
| `api/invitations-domain.ts` | `postOrganizationMembership`; `requireSelf`; invitation POST `{ email, at, expiresAt }`; accept-after-expiry 409 |
| `api/organization-requests.ts` | `selectIdentityOrganizations` drops its admin arm |
| `api/routes.ts` | `GET`/`POST organizations/:id/memberships/`; `GET identities/` intersection; retire orphan fences; `WRITE_RESPONSE_SPECS` |
| `api/family-registry.ts` | `invitations` family, global, no collection create |
| `api/mock-data/seed-message-pairs.ts` | Seed types; pending `expires_at` one year after `MOCK_SEED_TIMESTAMP` |
| `api/mock-data.ts` | Call-site names for the renamed seed types |
| `client/members.ts` | `acceptedMemberships` → `memberships/`; `postHumanMemberCreation` one POST; drop `HumanMemberPiiIntakeFailedError` |
| `client/members-union.ts` | `getMembers` / `getFormerMembers` read `memberships/` |
| `client/admin.ts` | `getAdminSeatIds` reads `memberships/` |
| `client/invitations.ts` | `postInvitation`; `{ email, at, expiresAt }`; `INVITATION_EXPIRY_DAYS = 14` |
| `web-app/members/index.ts` | Renamed client verbs; drop PII-intake catch |
| `web-app/invitations/index.ts` | No Accept on an expired pending |
| `web-app/app/invitations-indicator.ts` | Bell count omits expired |
| `web-app/app/presenters/invitation-list.ts` | No Accept on expired |
| `web-app/app/generate-api-documentation.ts` | Backing prefix; view rooms name storage; example bodies |
| `shared/types.ts` | Pending membership carries `expires_at` |
| `tests/api-identity-fence.test.ts` | Oracle 1–3 |
| `tests/api-organization-memberships.test.ts` | Oracle 4–5 |
| `tests/api-invitation-expiry.test.ts` | Oracle 6 |

---

## Tests that flip, rewritten to the new truth

The covenant changed. Rewrite these; never weaken them.
Each row names the task that rewrites it.

| Test | Why it goes red | Rewrite |
|---|---|---|
| `tests/api-human-members.test.ts` `'PUT identity and an accepted membership creates the person'` | Three writes; after the fence the identity PUT is 403 | Task 8: one `POST …/memberships/`; roster on `memberships/` |
| `tests/adapters-members.test.ts` `'postHumanMemberCreation persists identity PII and an accepted membership'` | Asserts three PUTs and `If-None-Match: *` | Task 8: one POST; body is the statement |
| `tests/adapters-members.test.ts` `'postHumanMemberCreation run twice leaves one accepted membership'` | Second call 409 after handler-declared genesis | Task 8: second call 409, one accepted head remains |
| `tests/adapters-members.test.ts` `'postHumanMemberCreation accepts a removed membership, latched on its head'` | Re-admit is the item PUT, not create | Task 8: create of a removed id is 409 |
| `tests/api-identities-create.test.ts` (admin GET/PUT after a membership-less POST) | Fence 403s the follow-on hops | Task 9: POST still 201; admin GET/PUT on that id is 403 |
| `tests/api-organization-isolation.test.ts` `'identity-pii shows an orphan with no membership'` | Orphan was 200; fence is 403 | Task 9: 403, fixed body |
| `tests/api-organization-isolation.test.ts` `'nested credentials show an orphan with no membership'` | Same | Task 9: 403, pair count unchanged |
| `tests/adapters-client-registration.test.ts` (admin on a service) | Services hold no membership | Task 9: 403, or keep only self-shaped cases |
| Every `organizations/…/invitations/?state=accepted` reader | Accepted leaves the invitations view | Task 7: `memberships/?state=accepted` or default |
| `tests/membership-gate.test.ts` `'a view with no query selects every state'` | Organization views default to one state | Task 7: identity nest keeps `every`; org views have their own parsers |
| `tests/api-invitations-fence.test.ts` `'grant: empty grantAt is rejected (400)'` and kin | Key is `at` | Task 5 |
| `tests/browser/invitations.test.ts` `grantAt` body | Key is `at`, then `expiresAt` is required | Task 5 then Task 11 |
| `tests/memberships.test.ts` `validateMembershipBody` | Pending requires `expires_at` | Task 11 |
| Invitation POSTs still sending `{ email, at }` | `expiresAt` is required | Task 11 |
| Test helpers `grant(`, `grantWayne(`, `grantSarahToWayne(`, `grantTo(`, `grantDave(`, `grantAndAccept(`, `byGrantThenIdentity` | Named for the noun | Task 4 |
| `POST /human-members is retired 404` | Must stay | Never rewrite |
| Nothing writes `organizations/:id/members/` | Must stay | Never rewrite |

---

## Commit order

Renames (1–6) → views (7) → statement (8) → fence (9) →
identity nest (10) → `expires_at` (11) → storage map
(12) → docs (13–17). The members page works at every
commit after Task 7: create is still three writes until
Task 8, then one statement, then the fence.

---

### Task 0: Orchestrator preamble

**Agent:** none (dispatching session).

- [ ] **Step 1: Confirm the worktree**

```bash
cd /Users/tmornini/code/fusion-angle/.worktrees/admin-scope
git rev-parse HEAD
git branch --show-current
git status --short
```

Expected: HEAD is this plan's commit after it lands,
branch `admin-scope`, empty status. Before this plan
commits, HEAD is `ed1f973c`.

- [ ] **Step 2: Do not dispatch until the owner
  approves this plan in this session.**

---

### Task 1: Rename postOrganizationInvitationGrant

**Agent:** `coder`

**Doctrine:** III Uniformity. Abomination: Foreign
Tongues. No behavior change.

**Files:**
- Modify: `api/invitations-domain.ts` (export name and
  comment `POST /organizations/:id/invitations/ —
  grant pending` → `POST /organizations/:id/invitations/
  — invite pending`)
- Modify: `api/routes.ts` (import and `post:` binding)
- Modify: `api/mock-data.ts` (import and call)
- Modify: `api/mock-data/seed-message-pairs.ts`
  (comment at the pass-2 call)
- Modify: `tests/mock-data-pairs.test.ts` (comment)

Do not rename `grantFields`, `grantAt`, seed types, or
client verbs. Do not touch `api/authentication.ts`.

- [ ] **Step 1: Rename the export and every reference**

In `api/invitations-domain.ts`, rename
`postOrganizationInvitationGrant` →
`postOrganizationInvitation`. Rename `grantFields` in
this same commit to `invitationFields` (the parser the
renamed handler owns). Keep the `grantAt` key.

Update the import and the `post:` binding in
`api/routes.ts`, the import and call in
`api/mock-data.ts`, and comments that spell the old
function name in `api/mock-data/seed-message-pairs.ts`
and `tests/mock-data-pairs.test.ts`.

Leave `postInvitationGrant`, seed types, and docs.

- [ ] **Step 2: Verify**

```bash
export DENO_DIR="$TMPDIR/deno-dir"
rg -n 'postOrganizationInvitationGrant' api client \
    server shared tests web-app
```

Expected: no matches under those trees. Docs and
`docs/` may still name it.

- [ ] **Step 3: `./test validate`** as under Global
  Constraints. Expected: exit 0.

- [ ] **Step 4: Commit**

Subject: `Rename postOrganizationInvitationGrant`

---

### Task 2: Rename postInvitationGrant

**Agent:** `coder`

**Doctrine:** III Uniformity.

**Files:**
- Modify: `client/invitations.ts`
- Modify: `web-app/members/index.ts`
- Modify: `tests/adapters-invitations.test.ts`

`client/index.ts` re-exports the module; it has no
local name.

- [ ] **Step 1: Rename**

`postInvitationGrant` → `postInvitation`.
`InvitationGrantOutcome` → `InvitationOutcome`.

The function still POSTs `{ email, grantAt: nowUtc() }`.

- [ ] **Step 2: Verify**

```bash
rg -n 'postInvitationGrant|InvitationGrantOutcome' \
    api client server shared tests web-app
```

Expected: no matches. Docs may still name them.

- [ ] **Step 3: `./test validate`**. Expected: exit 0.

- [ ] **Step 4: Commit**

Subject: `Rename postInvitationGrant and its outcome`

---

### Task 3: Rename the invitation seed types

**Agent:** `coder`

**Doctrine:** III Uniformity.

**Files:**
- Modify: `api/mock-data/seed-message-pairs.ts`
- Modify: `api/mock-data.ts`

- [ ] **Step 1: Rename**

`InvitationGrantSeedInput` → `InvitationSeedInput`.
`formInvitationGrantSeedInput` →
`formInvitationSeedInput`.
`granterId` → `inviterId` (the field on that input
only). The body still has `grantAt`.

- [ ] **Step 2: Verify**

```bash
rg -n 'InvitationGrantSeedInput|formInvitationGrantSeedInput|granterId' \
    api client server shared tests web-app
```

Expected: no matches. OAuth and Postgres `GRANT` stay.
`docs/` may still name them.

- [ ] **Step 3: `./test validate`**. Expected: exit 0.

- [ ] **Step 4: Commit**

Subject: `Rename invitation seed types and inviterId`

---

### Task 4: Rename test helpers named for the noun

**Agent:** `coder`

**Doctrine:** III Uniformity. Do not rename
`grant_type`, `invalid_grant`, `grant_types`,
`grantTypeOf`, or `api/authentication.ts` `grant*`
functions (RFC 6749 / RFC 7591 / OAuth adapter).

**Files:**
- Modify: `tests/api-invitation-document.test.ts`
  (`grant` → `invite`, `granted` → `invited`)
- Modify: `tests/api-invitation-nests.test.ts`
  (`grantWayne` → `inviteWayne`)
- Modify: `tests/api-invitations-fence.test.ts`
  (`grantSarahToWayne` → `inviteSarahToWayne`)
- Modify: `tests/api-memberships.test.ts` (`grant` →
  `invite`)
- Modify: `tests/api-versions-etag.test.ts`
  (`grantDave` → `inviteDave`)
- Modify: `tests/derive-invitation-lifecycle-for.test.ts`
  (`grant` → `invite`)
- Modify: `tests/derive-invitation-op-state.test.ts`
  (`grant` → `invite`)
- Modify: `tests/derive-states-union.test.ts`
  (`grantAndAccept` → `inviteAndAccept`)
- Modify: `tests/drift-roster.test.ts` (`grantTo` →
  `inviteTo`)
- Modify: `client/members.ts`
  (`byGrantThenIdentity` → `byAtThenIdentity`)
- Modify: any test that imports `byGrantThenIdentity`

- [ ] **Step 1: Rename each helper.** Keep bodies and
  assertions. Do not change `grantAt`.

- [ ] **Step 2: Verify**

```bash
rg -n 'function grant|grantWayne|grantSarahToWayne|grantTo\(|grantDave|grantAndAccept|byGrantThenIdentity' \
    api client tests web-app
```

Expected: no matches except RFC/OAuth (`grant_type`,
`grantRefresh`, `grantDoor` in message-plane tests for
the auth door, `grantRequest` in token-exchange tests).
If a hit is an invitation helper, rename it.

- [ ] **Step 3: `./test validate`**. Expected: exit 0.

- [ ] **Step 4: Commit**

Subject: `Rename invitation test helpers off grant`

---

### Task 5: Rename grantAt to at

**Agent:** `planner`

**Doctrine:** III Uniformity. This is the wire key.
Behavior is the same payload with a new name.

**Files:**
- Modify: `api/invitations-domain.ts` (`invitationFields`)
- Modify: `api/mock-data/seed-message-pairs.ts` (seed body)
- Modify: `client/invitations.ts` (POST body)
- Modify: `web-app/app/generate-api-documentation.ts`
  (example `{ email, at: AT }`)
- Modify: every test that POSTs `grantAt` (the list in
  the grep at `ed1f973c`:
  `tests/api-pii-tombstone.test.ts`,
  `tests/api-invitations-fence.test.ts`,
  `tests/derive-invitation-op-state.test.ts`,
  `tests/derive-invitation-lifecycle-for.test.ts`,
  `tests/api-invitation-nests.test.ts`,
  `tests/api-invitation-document.test.ts`,
  `tests/api-organization-member-seat.test.ts`,
  `tests/api-memberships.test.ts`,
  `tests/api-versions-etag.test.ts`,
  `tests/api-authentication-token.test.ts`,
  `tests/head-reads-documents.test.ts`,
  `tests/pin-invitation-write-path-parity.test.ts`,
  `tests/adapters-shared-recovery.test.ts`,
  `tests/derive-states-union.test.ts`,
  `tests/drift-roster.test.ts`,
  `tests/drift-states.test.ts`,
  `tests/browser/invitations.test.ts`)
- Modify: `shared/types.ts` comment that names
  `grantAt` on `InvitationEntity`
- Generate: `web-app/api-documentation/rooms.ts` (and
  any sibling the generator writes) by running the
  generator so `--check` stays green

Do not add `expiresAt` yet. The POST body is
`{ email, at }`.

- [ ] **Step 1: Red** — not a new test. The existing
  grantAt assertions fail once the parser requires
  `at`. Change the parser and every caller in this
  commit so the suite is green, not red-on-landing.

- [ ] **Step 2: Implementation**

In `invitationFields`, the keys become `['email',
'at']`, the label `'Invitation'`, and the timestamp
field `at`. The handler still passes that timestamp as
the membership's `at`.

Client:

```typescript
{ email, at: nowUtc() }
```

Seed body: `grantAt: MOCK_SEED_TIMESTAMP` →
`at: MOCK_SEED_TIMESTAMP`.

Generator example at
`web-app/app/generate-api-documentation.ts`:

```typescript
{ email: 'email', at: AT },
```

Then:

```bash
export DENO_DIR="$TMPDIR/deno-dir"
./test api-docs
```

That regenerates `rooms.ts` (and SVG/elevation if they
change). Stage the generated files this command
writes.

Rename the fence tests `'grant: empty grantAt is
rejected (400)'` → `'invite: empty at is rejected
(400)'` and the sibling names that still say grantAt.

- [ ] **Step 3: Verify**

```bash
rg -n 'grantAt' api client server shared tests web-app
```

Expected: no matches. `docs/` and closed specs may
still name it.

- [ ] **Step 4: `./test validate`**. Expected: exit 0.

- [ ] **Step 5: Commit**

Subject: `Rename invitation grantAt to at`

---

### Task 6: Rename the memberships comment

**Agent:** `coder`

**Doctrine:** III Uniformity.

**Files:**
- Modify: `api/memberships.ts:183`

- [ ] **Step 1:** Change `// The grant on a pending
  head changes nothing.` to `// A pending invite posted
  again changes nothing.`

- [ ] **Step 2: `./test validate`**. Expected: exit 0.

- [ ] **Step 3: Commit**

Subject: `Rename the pending-invite no-op comment`

---

### Task 7: Split the organization nest into two views

**Agent:** `planner`

**Doctrine:** I Reliability, III Uniformity, V Clarity.
Abominations: Premature Generalization (two parsers,
not a flags object), Unbidden Helper Code.

The members page keeps working: client reads move in
this same commit as `MEMBER_VERBS`. Create is still
three writes.

**Files:**
- Modify: `api/membership-gate.ts`
- Modify: `api/api.ts` (drop the invitations
  `memberViewRefusal` arm)
- Modify: `api/authorization.ts` (`MEMBER_VERBS`)
- Modify: `api/routes.ts` (new collection route;
  invitations collection uses `invitationsViewQueryOf`)
- Modify: `api/invitations-domain.ts` (identity nest
  still uses `viewQueryOf`; org nest selectors keep
  using the judged query)
- Modify: `client/members.ts` (`acceptedMemberships`)
- Modify: `client/members-union.ts`
- Modify: `client/admin.ts`
- Modify: `tests/membership-gate.test.ts`
- Create: `tests/api-organization-memberships.test.ts`
  (oracle 5)
- Modify: every test that GETs
  `organizations/…/invitations/?state=accepted` or
  `?state=removed` (the File structure table's test
  list plus
  `tests/api-pii-tombstone.test.ts`,
  `tests/api-invitations-fence.test.ts`,
  `tests/adapters-members.test.ts`,
  `tests/api-human-members.test.ts`,
  `tests/adapters-organization-dedupe.test.ts`,
  `tests/drift-roster.test.ts`,
  `tests/api.test.ts`,
  `tests/head-reads-collections.test.ts`,
  `tests/api-actor-from-token.test.ts`,
  `tests/adapters-shared-recovery.test.ts`,
  `tests/api-member-tier.test.ts`,
  `tests/api-routes.test.ts`,
  `tests/adapters-flow-stats.test.ts`,
  `tests/sp6-organization-switch-e2e.test.ts`,
  `tests/browser-origin.test.ts`,
  `tests/api-memberships.test.ts`,
  `tests/adapters-members-union.test.ts`)

`getSentInvitations` stays on `invitations/` with an
explicit state.

- [ ] **Step 1: Write the failing tests**

Add to `tests/membership-gate.test.ts`:

```typescript
Deno.test('invitations view defaults to pending', () => {
    assertEquals(
        invitationsViewQueryOf(''),
        { kind: 'state', state: 'pending' },
    );
});

Deno.test('invitations view names its alphabet on a'
    + ' foreign state', () => {
    const judged = invitationsViewQueryOf(
        '?state=accepted',
    );
    assertStrictEquals(judged.kind, 'refused');
    if (judged.kind === 'refused') {
        assertEquals(
            judged.error,
            'state must be one of pending, declined,'
                + ' revoked',
        );
    }
});

Deno.test('memberships view defaults to accepted', () => {
    assertEquals(
        membershipsViewQueryOf(''),
        { kind: 'state', state: 'accepted' },
    );
});

Deno.test('memberships view names its alphabet on a'
    + ' foreign state', () => {
    const judged = membershipsViewQueryOf(
        '?state=pending',
    );
    assertStrictEquals(judged.kind, 'refused');
    if (judged.kind === 'refused') {
        assertEquals(
            judged.error,
            'state must be one of accepted, removed',
        );
    }
});
```

Keep `viewQueryOf('')` → `{ kind: 'every' }` for the
identity nest. Keep the two-state / extra-key 400
tests on all three parsers.

Create `tests/api-organization-memberships.test.ts`
oracle 5, using `seedAdminSchema`,
`organizationToken()`, and `seedSeat` /
`seedPersonIdentity` as
`tests/api-invitation-nests.test.ts` does:

1. Admin GET `organizations/:id/memberships/` → 200,
   every part `state === 'accepted'`.
2. Member GET `organizations/:id/memberships/?state=removed`
   → 200 or 204.
3. Member GET `organizations/:id/memberships/?state=pending`
   → 400, alphabet in the body.
4. Admin GET `organizations/:id/invitations/` → 200,
   every part `state === 'pending'` (or 204 if none).
5. Member GET `organizations/:id/invitations/` → 403.
6. Admin GET `organizations/:id/invitations/?state=declined`
   → 200 or 204.
7. Admin GET `organizations/:id/invitations/?state=accepted`
   → 400, invitations alphabet in the body.

Use `handleRequest` + `apiRequest`. Do not invent a
second query key.

- [ ] **Step 2: Run the new tests; they fail**

```bash
FILES='tests/membership-gate.test.ts tests/api-organization-memberships.test.ts'
```

Expected: FAIL — `invitationsViewQueryOf` is not
exported; `memberships/` does not match.

- [ ] **Step 3: Implement**

`api/membership-gate.ts` — add two parsers that reuse
the existing one-key / one-state shape of
`viewQueryOf`, then admit only their alphabet. Empty
search is the view default, not `every`:

```typescript
const INVITATION_VIEW_STATES:
    readonly InvitationState[] = [
        'pending', 'declined', 'revoked',
    ];
const MEMBERSHIP_VIEW_STATES:
    readonly InvitationState[] = [
        'accepted', 'removed',
    ];

function viewQueryIn(
    search: string,
    allowed: readonly InvitationState[],
    fallback: InvitationState,
    alphabetError: string,
): ViewQuery | QueryRefusal {
    const judged = viewQueryOf(search);
    if (judged.kind === 'refused') return judged;
    if (judged.kind === 'every') {
        return { kind: 'state', state: fallback };
    }
    if (!allowed.includes(judged.state)) {
        return { kind: 'refused', error: alphabetError };
    }
    return judged;
}

export function invitationsViewQueryOf(
    search: string,
): ViewQuery | QueryRefusal {
    return viewQueryIn(
        search, INVITATION_VIEW_STATES, 'pending',
        'state must be one of pending, declined,'
            + ' revoked',
    );
}

export function membershipsViewQueryOf(
    search: string,
): ViewQuery | QueryRefusal {
    return viewQueryIn(
        search, MEMBERSHIP_VIEW_STATES, 'accepted',
        'state must be one of accepted, removed',
    );
}
```

`api/authorization.ts` — replace the invitations
member GET row:

```typescript
    '/organizations/:id/memberships': ['GET'],
```

`api/routes.ts` — invitations collection
`query: invitationsViewQueryOf`. Add, beside it:

```typescript
    route('organizations/:id/memberships/', {
        query: membershipsViewQueryOf,
        select: getOrganizationInvitations,
    }),
```

No POST yet. Items stay on
`organizations/:id/invitations/:membership-id`.

`api/api.ts` — delete the block that calls
`memberViewRefusal` when
`routePattern === 'organizations/:id/invitations/'`.
Members never reach that GET. Drop the
`memberViewRefusal` import if unused.

Client reads: every
`'…/invitations/?state=accepted'` and
`'…/invitations/?state=removed'` under `client/`
becomes `'…/memberships/?state=accepted'` and
`'…/memberships/?state=removed'`. Default memberships
GET is accepted; passing `?state=accepted` is allowed
and keeps today's URLs explicit.

Rewrite the listed tests' paths the same way.

`memberSeesState` stays: organization-nest items still
hide pending/declined/revoked from a member who cannot
GET them after this `MEMBER_VERBS` swap; the function
still guards the item selector if an admin token is
not present. Do not delete it.

- [ ] **Step 4: Run the new tests.** Expected: PASS.

- [ ] **Step 5: `./test validate`**. Expected: exit 0.
  If a test still GETs `invitations/?state=accepted`,
  rewrite it in this commit.

- [ ] **Step 6: Commit**

Subject: `Split organization nest into two views`

---

### Task 8: Land member creation as one statement

**Agent:** `planner`

**Doctrine:** I Reliability, VII Idempotency, X
Atomicity. Abominations: Swallowed Failures (409
surfaces), Test Weakening (the three-write pin is
rewritten, not softened).

The fence is not up. Three-write create still works
until this client change. After this commit, create is
one POST, so Task 9 cannot break the members page.

**Files:**
- Modify: `api/validators.ts`
- Modify: `api/invitations-domain.ts`
- Modify: `api/routes.ts` (`post` on memberships/,
  `WRITE_RESPONSE_SPECS`)
- Modify: `tests/pair-write-coverage.test.ts` (named
  exempt `organizations/:id/memberships/`)
- Modify: `client/members.ts`
- Modify: `web-app/members/index.ts`
- Modify: `tests/api-human-members.test.ts` (first
  case)
- Modify: `tests/adapters-members.test.ts` (the three
  pins in the flip table)
- Modify: `tests/api-organization-memberships.test.ts`
  (oracle 4)

- [ ] **Step 1: Write the failing tests** (oracle 4)
  in `tests/api-organization-memberships.test.ts`:

Admin POST `organizations/:id/memberships/` with a
client-minted id, `membership: { type: 'member', at }`,
`identity` four profile keys (empty strengths list and
empty map at the call site), `pii` four keys.

Assert:
- 201
- body `state === 'accepted'`, `identity_id` the minted
  id, `type === 'member'`
- `Location` is
  `/organizations/<org>/invitations/<org>:<id>`
- ETag present
- three heads: membership at `/invitations/` named
  `<org>:<id>`, identity at `/identities/` named id,
  PII at `/identities/<id>/` named `pii`
- resend same body → 409, pair count unchanged
- member token → 403
- body missing `title` → 400
- GET `organizations/:id/memberships/` lists the
  person

Keep `'POST /human-members is retired 404'`.

- [ ] **Step 2: Run it.** Expected: FAIL — no POST
  handler.

- [ ] **Step 3: Implement**

`validateMembershipCreateBody` in `api/validators.ts`:

```typescript
const MEMBERSHIP_CREATE_KEYS: readonly string[] = [
    'id', 'membership', 'identity', 'pii',
];
const MEMBERSHIP_CREATE_MEMBERSHIP_KEYS:
    readonly string[] = ['type', 'at'];

export function validateMembershipCreateBody(
    body: Record<string, unknown>,
): {
    readonly id: string;
    readonly membership: {
        readonly type: MembershipType;
        readonly at: string;
    };
    readonly identity: {
        readonly title: string;
        readonly department: string;
        readonly strengths: string[];
        readonly team_dimensions: Record<string, number>;
    };
    readonly pii: Omit<IdentityPiiEntity, 'id'>;
} {
    assertOnlyKeys(
        body, MEMBERSHIP_CREATE_KEYS,
        'MembershipCreate',
    );
    const id = pickIdentifier(body, 'id');
    const membershipRaw = body['membership'];
    if (
        membershipRaw === null
        || typeof membershipRaw !== 'object'
        || Array.isArray(membershipRaw)
    ) {
        throw new ValidationError(
            'membership must be an object',
        );
    }
    const membershipBody = membershipRaw as
        Record<string, unknown>;
    assertOnlyKeys(
        membershipBody, MEMBERSHIP_CREATE_MEMBERSHIP_KEYS,
        'MembershipCreate.membership',
    );
    const identityRaw = body['identity'];
    if (
        identityRaw === null
        || typeof identityRaw !== 'object'
        || Array.isArray(identityRaw)
    ) {
        throw new ValidationError(
            'identity must be an object',
        );
    }
    const identityBody = identityRaw as
        Record<string, unknown>;
    const identity = validateIdentityEntity({
        kind: 'person',
        ...identityBody,
    });
    if (identity.kind !== 'person'
        || identity.title === undefined) {
        throw new ValidationError(
            'identity requires the four profile keys',
        );
    }
    const piiRaw = body['pii'];
    if (
        piiRaw === null
        || typeof piiRaw !== 'object'
        || Array.isArray(piiRaw)
    ) {
        throw new ValidationError(
            'pii must be an object',
        );
    }
    return {
        id,
        membership: {
            type: validateEnumField(
                membershipBody, 'type',
                ['admin', 'member'],
                'membership type',
                'MembershipCreate.membership',
            ),
            at: validateTimestampField(
                membershipBody, 'at',
                'MembershipCreate.membership',
            ),
        },
        identity: {
            title: identity.title,
            department: identity.department,
            strengths: identity.strengths,
            team_dimensions: identity.team_dimensions,
        },
        pii: validateIdentityPiiEntity(
            piiRaw as Record<string, unknown>,
        ),
    };
}
```

`kind` is pinned by the handler's call, never read off
the body. `assertOnlyKeys` on the spread object
refuses a body that named `kind`.

`postOrganizationMembership` in
`api/invitations-domain.ts` mirrors
`postOrganizationInvitation`: `requireAdmin`,
`requireWriteStamp`, `received` required. Form three
handler-declared genesis siblings and
`runStateWrite` once:

1. Parent: PUT `/invitations/`, name
   `membershipNameOf(organizationId, id)`, state from
   `storedMembership` of `{ id: name, organization_id,
   identity_id: id, type, state: 'accepted', at }`.
2. Identity: PUT `canonicalPath(undefined,
   '/identities/')`, name `id`, state `{ id, kind:
   'person', ...profile }`. Do not import
   `identityDocumentEntityOf` from `api/routes.ts`
   (routes already imports this module).
3. PII: PUT `identityPrefixFor(id)` from
   `api/derive-identity-spine.ts`, name `pii`, state
   the four PII keys.

Answer `{ kind: 'created', location:
'/organizations/' + organizationId + '/invitations/'
+ name }`. On land, `notify` organization and
identity as the invitation POST does.

`WRITE_RESPONSE_SPECS['organizations/:id/memberships/']
= { conditional: 'none' }`.

`tests/pair-write-coverage.test.ts`
`NAMED_EXEMPT_ROUTE_PATTERNS` gains
`'organizations/:id/memberships/'` (same reason as
the invitation POST: the handler forms the pairs).

`client/members.ts` — `postHumanMemberCreation` keeps
its name and signature and sends one POST. Delete
`HumanMemberPiiIntakeFailedError`.

```typescript
export async function postHumanMemberCreation(
    ctx: RequestContext,
    id: string,
    input: HumanMemberDraft,
): Promise<void> {
    const { name, email, phone, bio, ...detail } =
        input;
    await ctx.POST(
        'organizations/' + requireOrganization(ctx)
            + '/memberships/',
        {
            id,
            membership: {
                type: 'member',
                at: nowUtc(),
            },
            identity: {
                title: detail.title,
                department: detail.department,
                strengths: detail.strengths,
                team_dimensions: detail.team_dimensions,
            },
            pii: { name, email, phone, bio },
        },
    );
    notifyHumanMemberChanges();
    notifyMembershipChanges();
}
```

`web-app/members/index.ts` — drop the
`HumanMemberPiiIntakeFailedError` import and the
catch branch; every failure is `'Failed to add
member'`.

Rewrite the three `adapters-members` pins and the
human-members first case to the statement. The
removed-member pin becomes: create of that id is 409;
re-admit remains the admin's accepted PUT on the
item, which this task does not change.

- [ ] **Step 4: Run oracle 4 and the rewritten pins.**
  Expected: PASS.

- [ ] **Step 5: `./test validate`**. Expected: exit 0.

- [ ] **Step 6: Commit**

Subject: `Create a member as one memberships POST`

---

### Task 9: Fence identities to co-members

**Agent:** `planner`

**Doctrine:** I Reliability, II Security. Abominations:
Internal Defense (the per-route orphan fences go; the
gate is the fence), Test Weakening.

**Files:**
- Create: `tests/api-identity-fence.test.ts`
- Modify: `api/api.ts`
- Modify: `api/routes.ts` (`GET identities/` select;
  delete `ownerOrganizationViaMembershipPairPlane` and
  the PII / credentials membership fences)
- Modify: the flip-table files for identities-create,
  organization-isolation orphans, client-registration
- Modify: Region B comment in `api/api.ts`

- [ ] **Step 1: Write the failing tests**

`tests/api-identity-fence.test.ts`, oracle 1 and 2.

World: two organization documents, four people. Admin
A and member A accepted in A. Admin B and member B
accepted in B. Seed via `seedOrganizationDocument`,
`seedPersonIdentity`, `seedSeat`. Tokens via
`organizationToken(id, org)`.

Oracle 1: count pairs at
`credentialsPrefixFor(memberA)` (or
`getCollectionPairs` on that prefix). Admin B PUT
password credential on member A. Assert 403, body
`forbidden: PUT <path> names an identity outside this
organization`, pair count unchanged. POST
`authentication/authorize` password for member A's
email with that secret → 401, no code.

Oracle 2: for each of these paths, Admin B naming
member A is 403 and pair count unchanged; Admin B
naming member B is today's success status (2xx, or
the route's current empty/404 where B has no
document):

- `GET`/`PUT identities/:id`
- `GET`/`PUT identities/:id/pii`
- `GET identities/:id/credentials/`
- `PUT identities/:id/credentials/:cid`
- `GET`/`PUT identities/:id/registration`
- `PUT identities/:id/token-revocations/:rid`
- `GET identities/:id/tokens/`
- `PUT identities/:id/tokens/:jti`
- `POST identities/:id/tokens/:jti/rotation`
- `POST identities/:id/tokens/:jti/revocation`
- `GET identities/:id/providers/`
- `PUT identities/:id/providers/:eid`
- `GET`/`PUT identities/:id/default-organization`
- `GET identities/:id/organizations/`
- `GET identities/:id/invitations/`
- `GET identities/:id/invitations/:membership-id`
- version routes under those items

`GET identities/` as Admin B lists only B's
co-members (admin B and member B), never A's.

An absent id Admin B names is 403, not 404.

Self (member B GET own pii) is 200.

`POST identities/` is not fenced: Admin B POST a new
person id still 201.

- [ ] **Step 2: Run it.** Expected: FAIL — Admin B's
  credential PUT is 201.

- [ ] **Step 3: Implement**

In `handleRequest`, after match is confirmed and
`membershipNameGate`, before view query and body
parse (after `authorizeRequest` has run):

```typescript
    if (
        matched.segments[0] === 'identities'
        && matched.segments[1] === ':id'
    ) {
        const pathIdentity = params[0];
        if (
            typeof pathIdentity === 'string'
            && pathIdentity !== actor
        ) {
            const seated = organization === undefined
                ? null
                : await membershipOf(
                    adapter, organization, pathIdentity,
                );
            if (seated === null) {
                return Response.json(
                    {
                        error: 'forbidden: ' + method
                            + ' ' + pathname
                            + ' names an identity'
                            + ' outside this'
                            + ' organization',
                    },
                    { status: HTTP_FORBIDDEN },
                );
            }
        }
    }
```

Import `membershipOf` from `./memberships.ts`.

`GET identities/` select: replace
`collectionSelect(IDENTITIES_WIRING)` with a selector
that intersects `getCollectionHeadPairs('/identities/')`
with `organizationMembershipHeads(db, org, { kind:
'state', state: 'accepted' })` by
`membership.identity_id === head.name`, then
`wholeCollectionSelection`. Use
`requireOrganization(organization)`. This is the
roster intersection `derive-members.ts` already
computes, without the person-kind filter (a seated
service would appear; none exist).

Delete `ownerOrganizationViaMembershipPairPlane` and
the membership walks in the PII selector, the
credentials collection selector, and the credential
item selector. Those selectors read the head as a
normal document. `authorizeIdentityPii` stays.

Region B comment: a member acts on its own chain, an
admin on a co-member's, and the identity fence has
already refused the rest. Keep the code.

Rewrite the flip-table tests this task owns. Do not
touch the statement tests.

- [ ] **Step 4: Run the fence file and the rewritten
  tests.** Expected: PASS.

- [ ] **Step 5: `./test validate`**. Expected: exit 0.
  Any remaining admin-on-orphan 200 is a miss: rewrite
  it here.

- [ ] **Step 6: Commit**

Subject: `Fence identities to the claim organization`

---

### Task 10: Identity nest is self-only

**Agent:** `planner`

**Doctrine:** II Security, III Uniformity.

**Files:**
- Modify: `api/invitations-domain.ts`
- Modify: `api/organization-requests.ts`
- Modify: `tests/api-identity-fence.test.ts` (oracle 3)
- Modify: `tests/api-identity-organizations.test.ts`
  (`'GET identities/:id/organizations/ is self or
  admin'` becomes self-only)

`MEMBER_VERBS` rows for the identity nest stay.

- [ ] **Step 1: Red tests**

Oracle 3 in `tests/api-identity-fence.test.ts`: Admin
B GET `identities/<memberB>/invitations/` → 403.
Member B GET own invitations → 200. Admin B GET
`identities/<memberB>/organizations/` → 403. Member B
GET own organizations → 200.

- [ ] **Step 2: Run it.** Expected: FAIL — admin still
  admitted.

- [ ] **Step 3: Implement**

Replace `requireSelfOrAdmin` with `requireSelf` on
the identity-nest routes
(`getIdentityInvitations`,
`getInvitationOnIdentityNest`, both version
handlers). Error bodies keep today's invitation
wording, minus the admin arm:

```typescript
function requireSelf(
    actor: Id,
    identityId: Id,
    message: string,
): void {
    if (actor !== identityId) {
        throw new ApiError(message, HTTP_FORBIDDEN);
    }
}
```

`selectIdentityOrganizations`: drop
`&& !roles.includes('admin')`. Self only. The
`roles` parameter may stay unused; prefix it `_roles`
if the handler signature requires it.

- [ ] **Step 4: Tests PASS. `./test validate`.**

- [ ] **Step 5: Commit**

Subject: `Make the identity nest self-only`

---

### Task 11: Carry expires_at on a pending invitation

**Agent:** `planner`

**Doctrine:** I Reliability, Office of Time (RFC-3339
zulu). Abomination: Default Values (the page passes
`expiresAt` explicitly; the gate does not supply it).

**Files:**
- Modify: `shared/types.ts` (`MembershipEntity`)
- Modify: `api/memberships.ts`
  (`validateMembershipBody`, `membershipTransition`
  already drops unknown keys by building `next` from
  the request)
- Modify: `api/invitations-domain.ts`
  (`invitationFields`, `storedMembership`, accept
  guard)
- Modify: `api/mock-data/seed-constants.ts` (named
  expiry constant)
- Modify: `api/mock-data/seed-message-pairs.ts`
- Modify: `client/invitations.ts`
- Modify: `web-app/invitations/index.ts`
- Modify: `web-app/app/invitations-indicator.ts`
- Modify: `web-app/app/presenters/invitation-list.ts`
- Modify: `web-app/app/generate-api-documentation.ts`
  (example `{ email, at, expiresAt }`)
- Create: `tests/api-invitation-expiry.test.ts`
- Modify: `tests/browser/invitations.test.ts` (add
  `expiresAt`)
- Modify: `tests/memberships.test.ts`
  (`validateMembershipBody` pending requires
  `expires_at`; other states refuse it)
- Modify: every invitation POST in tests that still
  sends `{ email, at }` (the Task 5 list): add
  `expiresAt` after `at`
- Generate: API docs via `./test api-docs`

- [ ] **Step 1: Write the failing tests** (oracle 6)

`tests/api-invitation-expiry.test.ts`:

1. POST invitations/ without `expiresAt` → 400.
2. POST `{ email, at, expiresAt }` with `expiresAt`
   after `at` → 201; stored pending body has seven
   keys including `expires_at`.
3. Accept after `expires_at` (set `expiresAt` in the
   past relative to the accept's `requestAt`) → 409,
   body `the invitation expired at <expires_at>`,
   head still pending.
4. Accept before `expires_at` → 200; stored body has
   six keys, no `expires_at`.
5. Decline after expiry still 200. Revoke after
   expiry still 200.

- [ ] **Step 2: Run it.** Expected: FAIL — extra key
  or missing expiresAt is 400 from `assertOnlyKeys`.

- [ ] **Step 3: Implement**

`MembershipEntity` is a union: pending has
`expires_at: string`; every other state has exactly
the six keys. `validateMembershipBody` requires
`expires_at` when `state === 'pending'` and refuses
it otherwise (`assertOnlyKeys` with
`MEMBERSHIP_BODY_KEYS` plus `expires_at` only for
pending).

`storedMembership` writes `expires_at` only for
pending.

`invitationFields` keys `['email', 'at',
'expiresAt']`. `expiresAt` is a timestamp after `at`
(strictly after; equal is 400). Label `'Invitation'`.
The handler puts `expires_at` on the pending body.

In `putMembership`, after the latch agrees and before
`membershipTransition`, if `from?.state === 'pending'`
and `request.state === 'accepted'` and `from.expires_at`
is at or before `requestAt`, throw
`ApiError('the invitation expired at ' +
from.expires_at, HTTP_CONFLICT)`. Decline and revoke
do not take this arm.

`membershipTransition` builds `next` without
`expires_at`, so a transition out of pending drops it
with no extra rule.

Seed: add

```typescript
export const MOCK_SEED_INVITATION_EXPIRES_AT =
    '2027-01-01T00:00:00.000000Z';
```

in `api/mock-data/seed-constants.ts` (one year after
`MOCK_SEED_TIMESTAMP`). The pending seed body includes
`expiresAt: MOCK_SEED_INVITATION_EXPIRES_AT`.

Client:

```typescript
export const INVITATION_EXPIRY_DAYS = 14;

function invitationExpiresAt(at: string): string {
    return addUtcSeconds(at, INVITATION_EXPIRY_DAYS
        * 24 * 60 * 60);
}
```

Import `addUtcSeconds` from
`shared/work-order-claims.ts` (already the UTC adder).
`postInvitation` sends `{ email, at, expiresAt }` with
`at = nowUtc()` and `expiresAt =
invitationExpiresAt(at)`, both explicit.

`InvitationView` gains `expiresAt: string |` only
when the body has it. The page and bell treat
`expires_at` at or before `nowUtc()` as expired:
`inviteeActions` omitted; bell count skips those
rows. Decline stays available on the page if the
presenter still shows it; Accept does not. Spec: "no
Accept, no count." Decline may remain; Accept must
not.

Pass `expiresAt` in `tests/browser/invitations.test.ts`.
Spec's "unchanged" is the scenario, not the body key.

- [ ] **Step 4: Tests PASS. Run `./test api-docs`.
  `./test validate`.**

- [ ] **Step 5: Commit**

Subject: `Expire a pending invitation at expires_at`

---

### Task 12: Register /invitations/ as backing storage

**Agent:** `planner`

**Doctrine:** III Uniformity, V Clarity. Registration
must not change dispatch: `/invitations/` stays
global.

**Files:**
- Modify: `api/family-registry.ts`
- Modify: `tests/family-registry.test.ts`
- Modify: `web-app/app/generate-api-documentation.ts`
- Modify: `tests/api-documentation-generator.test.ts`
- Generate: `web-app/api-documentation/*` via
  `./test api-docs`
- Add: a pin that `canonicalPath(org, '/invitations/')`
  is `'/invitations/'`

- [ ] **Step 1: Write the failing tests**

In `tests/family-registry.test.ts`:

```typescript
Deno.test('invitations is a global backing family',
() => {
    assertEquals(familyRegistration('invitations'), {
        family: 'invitations',
        organizationNested: false,
        createBodyIdField: 'id',
    });
});
```

Keep `familyRegistration('memberships')` undefined.

In `tests/api-documentation-generator.test.ts`:

```typescript
Deno.test('the map names /invitations/ as backing',
() => {
    const svg = svgOf(routes);
    assertMatch(svg, /\/invitations\//);
    assertMatch(svg, /backing/);
});
```

A dispatch pin (new test in
`tests/family-registry.test.ts` or
`tests/api-invitation-nests.test.ts`):
`canonicalPath('AjdvjuECVZEgZoFajaIEkg',
'/invitations/') === '/invitations/'`.

- [ ] **Step 2: Run them.** Expected: FAIL —
  `familyRegistration('invitations')` is undefined;
  SVG has no backing mark.

- [ ] **Step 3: Implement**

Append to `FAMILY_REGISTRY`:

```typescript
    {
        family: 'invitations',
        organizationNested: false,
        createBodyIdField: 'id', // INERT — no
            // collection POST at /invitations/; the
            // HTTP views POST at the organization nest.
    },
```

Generator: import `FAMILY_REGISTRY`. `svgOf` draws a
backing row for each registered family whose first
segment is not `wingNameOf` of any route. The row's
URI is `/api/<family>/`, every verb column empty, a
caption `backing` plus, for `invitations`, the two
indexed fields `organization_id`, `identity_id` and
the five states. No verb room, no `catalogRoomsOf`
entry.

View GET rooms (`verbRoomHtml` when the URI is an
organization or identity invitations/memberships
collection): a Storage section naming `/invitations/`
and the body field the view selects on
(`organization_id` or `identity_id`).

Run `./test api-docs` and stage what it writes.

- [ ] **Step 4: Tests PASS. `./test validate`.**
  `--check` is green (oracle 7).

- [ ] **Step 5: Commit**

Subject: `Register invitations as backing storage`

---

### Task 13: Update API.md

**Agent:** `coder`

**Doctrine:** V Clarity. One concern: the pointer doc.

**Files:**
- Modify: `API.md` only

- [ ] **Step 1:** Rewrite `## Dispatch order` Region B
  sentence: a member acts on its own chain, an admin
  on a co-member's; the identity fence has already
  refused the rest. Add the identity fence after
  `authorizeRequest` and before body parse, with the
  403 body.

- [ ] **Step 2:** Rewrite `## Compositions worth
  knowing`:
  - POST creates list gains the memberships statement
    (three handler-declared geneses, 201 the
    membership, Location the invitation item).
  - Replace **Membership grant** with **Invitation
    POST** (`postOrganizationInvitation`, body
    `{ email, at, expiresAt }`) and **Membership
    statement** (`POST organizations/:id/memberships/`
    → `postOrganizationMembership`).
  - **Memberships:** two organization views
    (`invitations/` pending/declined/revoked, default
    pending, admin; `memberships/` accepted/removed,
    default accepted, member and admin). Items stay
    at `invitations/:membership-id`. Identity nest
    is self-only. `/invitations/` is backing storage.

Do not leave "the grants" as a membership noun.

- [ ] **Step 3: `./test validate`**. Expected: exit 0
  (docs are not linted).

- [ ] **Step 4: Commit**

Subject: `Document the identity fence in API.md`

---

### Task 14: Update ARCHITECTURE.md

**Agent:** `coder`

**Files:**
- Modify: `ARCHITECTURE.md` `## Tenancy` and
  `## Identity and memberships` only, plus the client
  verb exception that names `postInvitationGrant`

- [ ] **Step 1:** Tenancy: global-plane identity reads
  and writes are the identity fence (co-membership;
  absent/orphan/foreign 403; self stays self). The `/`
  admin tier stays and reaches co-members only.

- [ ] **Step 2:** Identity and memberships: two
  organization views as the spec's table. Replace
  `Grant (admin) lands pending` with `An admin's
  invitation POST lands pending`. Client exceptions:
  `postInvitation` → `InvitationOutcome`.

- [ ] **Step 3: `./test validate`.**

- [ ] **Step 4: Commit**

Subject: `Document the two views in ARCHITECTURE.md`

---

### Task 15: Update TEST-PLAN.md cases

**Agent:** `coder`

**Files:**
- Modify: `TEST-PLAN.md` cases AA5, G14, V1, V2, B27,
  G44, G47, and the Members-list grant sentence at
  the G11 preamble

Copy existing wording; change only what the spec
names. Do not rewrap.

- [ ] **Step 1: AA5 and G14** — Create Human is one
  POST `organizations/:id/memberships/`. It does not
  write a seat. Pin stays
  `tests/adapters-members.test.ts`
  `'postHumanMemberCreation persists identity PII and
  an accepted membership'` (now the statement).

- [ ] **Step 2: V1 and V2** — verbs
  `postInvitation` / `postOrganizationInvitation`;
  body `{ email, at, expiresAt }`.

- [ ] **Step 3: B27** — the seeded pending invitation
  expires one year after `MOCK_SEED_TIMESTAMP`
  (`2027-01-01T00:00:00.000000Z`). Walkable through
  2026. Horizon note in the case.

- [ ] **Step 4: G44** — person half fails until a
  follow-up re-aims the page; the members statement
  is now the person create. Record the consequence;
  do not change the identities page.

- [ ] **Step 5: G47** — service identity admin routes
  403; `GET identities/` omits services. Record the
  consequence.

- [ ] **Step 6: G11 preamble** — Invite stays
  admin-gated: `postInvitation` posts the
  organization nest.

- [ ] **Step 7: `./test validate`.**

- [ ] **Step 8: Commit**

Subject: `Retarget TEST-PLAN cases to the statement`

---

### Task 16: Add the grant voice rule to AGENTS.md

**Agent:** `coder`

**Files:**
- Modify: `AGENTS.md` voice-rules bullet under
  `## Subagents`

- [ ] **Step 1:** After the existing voice-rules
  sentence, add: `grant` is a verb; the noun stays
  only for RFC 6749 `grant_type` / `invalid_grant`,
  RFC 7591 `grant_types`, Postgres `GRANT`, and the
  OAuth adapter's internals.

Keep 78-column wrap.

- [ ] **Step 2: `./test validate`.**

- [ ] **Step 3: Commit**

Subject: `Call grant a verb in the voice rules`

---

### Task 17: Close 0d and file the follow-ups

**Agent:** `coder`

**Files:**
- Modify: `TODO.md` only

Close protocol: the pin flipped red and the tests now
state the new truth (Tasks 8–11) → remove the 0d
bullet → remove the named comments at the file:line
cites 0d still names, if those comments remain and
exist only to mark this hole. 0d is not a KNOWN seam;
do not edit `ARCHITECTURE.md` here. `AUDIT.md`'s `m`
is unchanged.

- [ ] **Step 1:** Remove the **0d.** bullet under
  `## Critical product path`. The opening count
  "Fifteen items" becomes "Fourteen items". The
  sentence that names 0d as the first remaining
  0-item starts at the ledger's one deploy (0e). Do
  not renumber 0e–0i. Update `## Sequencing`
  `0d → 0i: no second tenant shares an origin until
  an` so 0d is shipped and 0i remains the wipe.

- [ ] **Step 2:** Add under `## Later work`, each its
  own bullet, in this order:
  1. Re-aim the identities page's person create onto
     the memberships statement (G44's person half).
  2. A service-identity rule: membership or a fence
     of its own (G47).
  3. Move items and versions under `memberships/`,
     with `identities/:id/memberships/` subsuming
     `identities/:id/organizations/`.
  4. A derived map of every storage prefix, gated by
     `--check`.
  5. Retire the leftover role-grant identifiers.
  6. Delete a pending invitation after `expires_at`.

- [ ] **Step 3:** The later-work bullet "An admin
  seats an identity without its consent" still names
  0d. Point it at the shipped fence and the
  memberships statement, not at item 0d.

- [ ] **Step 4:** The race bullet that names
  `postOrganizationInvitationGrant` — update the
  function name to `postOrganizationInvitation` if
  that cite still stands. Do not change the race
  work.

- [ ] **Step 5: `./test validate`.**

- [ ] **Step 6: Commit**

Subject: `Close 0d and file the follow-up lines`

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Decision 1–3, §1 fence | 9 |
| Decision 4, identity nest | 10 |
| Decision 5, two views | 7 |
| Decision 6, statement | 8 |
| Decision 7, `expires_at` | 11 |
| Decision 8, storage map | 12 |
| Decision 9, `grant` as a verb | 1–6, 16 |
| Decision 10, recorded consequences | 15 (G44, G47), 17 |
| Oracle 1–2 | 9 |
| Oracle 3 | 10 |
| Oracle 4 | 8 |
| Oracle 5 | 7 |
| Oracle 6 | 11 |
| Oracle 7 | 12 |
| Close protocol + new TODO lines | 17 |
| API.md, ARCHITECTURE.md, TEST-PLAN.md | 13–15 |
| AGENTS.md voice line | 16 |
| Generated API docs | 5, 11, 12 |
| Members page works before the fence | 7 then 8 then 9 |
| Items stay at invitations/:id | never moved |
| POST /human-members 404 | never rewritten |
| No writes under members/ | never added |

**Placeholders:** none. **Type names:**
`InvitationOutcome`, `InvitationSeedInput`,
`inviterId`, `validateMembershipCreateBody`,
`postOrganizationMembership`,
`invitationsViewQueryOf`, `membershipsViewQueryOf`,
`INVITATION_EXPIRY_DAYS`,
`MOCK_SEED_INVITATION_EXPIRES_AT` are used
consistently.

---

## After Task 17 (orchestrator)

- [ ] `./test validate browser`. If Chrome cannot
  launch, say so plainly. Do not skip silently.
- [ ] Report what landed, what is red, and what was
  left out. Do not merge.
