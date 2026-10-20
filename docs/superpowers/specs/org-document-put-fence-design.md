# The organization document's PUT takes the path fence

- Date: 2026-10-19
- Status: design confirmed by the owner in
  conversation, pre-plan
- Worktree: `.worktrees/org-document-put-fence`,
  branch `org-document-put-fence` (AGENTS.md
  § Worktrees, with `next-release` in place of
  `master`)
- Base: `next-release` at `c9dfce78`, the tip of
  identities-person-retire, which filed the line this
  work closes
- Lands: on the owner's word, by the owner. Neither
  `next-release` nor `master` moves in this work.
- Item: TODO.md `## Later work`, "Fence
  `PUT organizations/:id`"
- Ships: the path fence on the organization document's
  PUT; that PUT's conditional moved to `required`; the
  tenancy prose rewritten; the personal-organization
  line filed; two leftovers from identities-person-retire
- Defers: personal organizations; SP-6 sign-up; item 5
  first sign-in

## Problem

An organization admin can create an organization, or
overwrite another organization's document, with
`PUT organizations/:id`.

The path-organization fence exempts the organization
document's routes (`api/api.ts:629`,
`!isOrganizationDocumentPath(...)`). The membership
fence below it gates GET only (`api/api.ts:664`); its
comment says "PUT is not gated here — a new org is
created before its first membership exists".
`ROUTE_POLICY`'s `/` PUT row (`api/authorization.ts:180`)
grants the role, the write spec is
`conditional: 'optional'` (`api/routes.ts:3067`), and
`postOrganizationDocumentOp` (`api/routes.ts:3469`)
checks no membership.

A probe reproduced it on the mock seed. With an
organization admin token scoped to STARK, a PUT of a
fresh id answered 201, a second PUT 200, a PUT on
ORGANIZATION_TWO 200 (overwritten), and a GET on the
fresh id 403.

ARCHITECTURE.md `## Tenancy` states the hole in its
"Two names for people" paragraph and narrows the next
paragraph's "reach co-members only" to "on the identity
plane" because of it.

## Decisions

1. No request creates an organization. The operator's
   seed does, below the HTTP layer
   (`postOrganizationDocumentOp` called directly,
   `api/mock-data.ts:773`).
2. A person identity's genesis will also create that
   person's personal organization, an organization
   like any other. That is its own spec, sequenced
   with SP-6 and item 5, which own person creation.
   This work files the line; it builds nothing toward
   it. A personal organization will be a
   handler-declared genesis inside the person's
   creating statement, never a PUT.
3. The organization document's PUT takes the path
   fence: its `:id` must equal the token's claim
   organization. An absent id and a foreign id both
   answer the path fence's fixed 403. RFC 9110
   §15.5.4 fits a request understood and refused;
   §15.5.5's 404 is for a missing representation or
   hidden existence, and a PUT's target need not
   exist. One answer for absent and foreign is no
   existence oracle. AGENTS.md "foreign paths 403"
   names this case, and the path fence already calls
   a nonexistent path organization 403.
4. Only the claim organization's organization admin
   reaches the PUT. That follows from decision 3 and
   the `admin` role `ROUTE_POLICY` already requires; a
   member stays 403 by role. No new check.
5. The PUT's conditional is `required` (class B), the
   class of the flow and work-order PUTs. A PUT here
   only rewrites a live head; it is never a genesis.
   No precondition answers 428 (RFC 6585 §3); a stale
   `If-Match` answers 412, and so does
   `If-None-Match: *` against the always-live head
   (RFC 9110 §13.1.1). The product client already
   latches `If-Match` (`client/organizations.ts:37`).
6. Reads do not change. A GET of the document or its
   versions keeps the membership fence: a real
   foreign organization is 403, an absent one 404.
7. Nothing in the product depends on the unfenced PUT.
   The seed and the bootstrap seed write below the
   fence; `tests/root-admin-fixture.ts` forms its pair
   directly. Thirteen test sites in six files lean on
   it, as setup or as the subject (section 2): twelve
   cases the fence breaks, and one setup PUT it leaves
   dead. A case that needs another organization seeds
   it with `seedOrganizationDocument`; a case whose
   subject is the PUT's write path PUTs its fixture's
   own claim organization with the current `If-Match`;
   the dead PUT is deleted.

## 1. The fence

Behavior, organization admin, token claim STARK:

| Request | Today | After |
|---|---|---|
| PUT a fresh id | 201, created | 403, path-fence body, nothing stored |
| PUT ORGANIZATION_TWO | 200, overwritten | 403, path-fence body |
| PUT STARK, no precondition | 200 | 428 |
| PUT STARK, stale `If-Match` or `If-None-Match: *` | 412 | 412 |
| PUT STARK, current `If-Match` | 200 | 200 |
| A member's PUT on its own organization | 403 by role | 403 by role |
| GET item or versions | 403 foreign, 404 absent | unchanged |

The organization document's routes carry only `select`
and `put` (`api/routes.ts:5052-5087`), so the PUT is
the one write the exemption passes.

Two edits:

- `api/api.ts:629`. The exemption becomes
  `!(method === 'GET' && isOrganizationDocumentPath(
  fencePattern))`: the document's reads skip the path
  fence and keep the membership fence below; its
  write takes the path fence. The comment above the
  arm (`:616-623`) and the membership fence's comment
  (`:657-663`) say so, and the latter drops "PUT is not
  gated here". `isOrganizationDocumentPath`'s own
  comment already says "version reads" and stays.
- `api/routes.ts:3067`. `organizations/:id` becomes
  `conditional: 'required'`; its comment says a PUT
  never creates the document, the operator's seed
  does.

`postOrganizationDocumentOp`, `ROUTE_POLICY`, the seed,
and the bootstrap seed do not change.

## 2. Tests

Red first. One commit adds three Layer 1 cases, red on
the branch:

- R1, `tests/api-organization-isolation.test.ts`,
  beside "a content-tier member is still denied admin
  writes" (`:267`). An organization admin of
  organizationA PUTs a fresh id: 403 with the path
  fence's body, and `deriveOrganizations` holds no
  head for that id.
- R2, same file. An organization admin of
  organizationA, no member of organizationB, PUTs
  organizationB, whose document the case seeds: 403,
  and `deriveOrganization(db, organizationB)` still
  carries the seeded name.
- R3, `tests/drift-organizations.test.ts`, beside leg
  4 (`:270`). The organization admin's PUT on its own
  claim organization with no precondition: 428.

No pin for a stale `If-Match` or `If-None-Match: *`:
under `optional` the shared gate already answers both
412, so a new pin could not fail.

The fix commit carries the twelve cases it breaks, and
deletes one setup PUT it leaves dead. Each case keeps
its covenant. A case that needs an organization other
than its token's claim seeds it with
`seedOrganizationDocument(db, id, name)`
(`tests/test-fixtures.ts`), the path the operator's
seed takes. A case whose subject is the PUT's write
path PUTs its fixture's own claim organization with
`If-Match` from the head it reads. A count changes
only where a case's own setup changes:

- `tests/derive-organizations.test.ts`, six cases.
  Five PUT `DEV_TOKEN`'s claim organization
  `AjdvjuECVZEgZoFajaIEkg`, which `seedAdminSchema`
  seeds, with the current `If-Match`, and assert 200:
  "deriveOrganization mirrors the PUT wire body
  exactly" (`:73`), "a second live PUT supersedes the
  first" (`:129`), "the pair lives at the flat
  /organizations/ prefix" (`:153`; still four pairs,
  and it finds the PUT's own pair by its ETag, since
  the seed's pair now shares its name), "a PUT whose
  body echoes id round-trips" (`:175`), and "stored
  PUT body equals organizationEntityOf id-first"
  (`:198`). "deriveOrganizations mirrors every PUT
  wire body, id-lex ordered" (`:85`) seeds its two
  organizations directly; it asserts order and names,
  not how they were written.
- `tests/api-organization-isolation.test.ts:229`
  (`contentMemberDb`), setup only, moves to
  `seedOrganizationDocument`. `:174` is deleted, not
  moved: `twoOrganizations` already seeds
  organizationA, so that PUT only overwrote it, and
  behind the fence it is a 403 nothing reads.
- `tests/adapters-organizations.test.ts:59` and `:79`,
  setup only, move to `seedOrganizationDocument`.
- `tests/adapters-admin.test.ts:243`, "getOrganization
  derives seat usage from the memberships ledger": its
  setup PUT (`:255`) latches the head it reads.
- `tests/api-versions-etag.test.ts:387`, "two
  organization PUTs list oldest first": it seeds its
  claim organization, then PUTs twice with `If-Match`.
  The list holds three versions, the seed's first, and
  still runs oldest first.
- `tests/drift-organizations.test.ts` leg 4 sends
  `If-Match` from the head it reads and still asserts
  200 and full wire, derive, and stored parity.

Unchanged and green: `tests/adapters-admin.test.ts:270`
("putOrganizationGeneralInfo latches the held
organization": the client latches `If-Match`; `:243`
above is a different case),
`api-organization-isolation.test.ts:271` (a member's
403), the seed and mock-data suites.

`generate-api-documentation` regenerates the
`put/organizations/id` room in
`web-app/api-documentation/rooms.ts`: its header reads
the `required` wording and its statuses gain 428. The
fix commit carries it, so `--check` stays green.

Layer 2 gets no new case. The organization page saves
through `putOrganization`, which latches `If-Match`,
pinned at Layer 1 through the in-page facade.
`./test validate browser` is the gate before landing.

## 3. The record

- ARCHITECTURE.md `## Tenancy`, "Two names for
  people": "It reaches no other organization's
  documents but one: … overwrite another's document."
  becomes "It reaches no other organization's
  documents." "Organizations come from the operator's
  seed, or from that unfenced `PUT organizations/:id`."
  becomes "Organizations come only from the operator's
  seed; no request creates one."
- The next paragraph. After "Global-plane reads of an
  organization document answer a foreign owner 403, an
  absent one 404." add "Its PUT takes the path fence:
  a foreign or absent id is 403, and the claim
  organization's own PUT requires If-Match." "reach
  co-members only on the identity plane" becomes
  "reach only co-members and the claim organization".
- API.md's conditional table: the `required` row names
  the organization document PUT beside the flow and
  work-order PUTs.
- TODO.md: drop the "Fence `PUT organizations/:id`"
  line. File, beside "A person identity is created
  only by its person" (`:3315`): a person identity's
  genesis also creates that person's personal
  organization, an organization like any other, with
  an accepted `admin` membership, in the same
  statement; with SP-6 and item 5. Open: the default
  organization, since PRIMARY takes the earliest join
  and the personal organization would be every
  person's earliest.
- TODO.md: file, beside it, the absent-claim genesis
  hole. A claim naming an organization with no
  document passes the path fence on
  `PUT organizations/:id`, and `If-None-Match: *` there
  creates the document, against decision 5's "never a
  genesis". It is unreachable today, because every
  claim organization has a seeded document, and
  nothing pins that. Open: which status refuses it,
  and at which gate. The line decides nothing.
- TODO.md:558 cites `client/identities.ts:314` for
  `postIdentityCreation`; it is `:284`.
- `docs/superpowers/specs/identities-person-retire-design.md`
  §7 oracle 3 reads
  ``grep -rn "kind: 'person'" client/identities.ts``
  prints nothing, which the roster's type and row
  (`:75`, `:114`) keep false. It becomes: the grep
  prints only those two roster lines.

## 4. Commit order

Each commit one line, present-tense imperative, with
the `Co-Authored-By` trailer.

1. Add the organization document fence spec
2. Amend the fence spec's test sites
3. Add the organization document fence plan
4. Pin the organization document PUT fence (R1-R3,
   red)
5. Fence the organization document PUT (section 1's
   edits, section 2's moved tests, the regenerated
   `rooms.ts`)
6. Rewrite the tenancy prose on the fence
   (ARCHITECTURE.md)
7. Name the organization PUT a class B write (API.md)
8. Close the fence line and file personal organizations
   (TODO.md)
9. File the absent-claim organization genesis
   (TODO.md)
10. Retarget the postIdentityCreation citation
    (TODO.md:558)
11. Correct the person-retire roster oracle

## 5. Oracle

1. R1-R3 are red at commit 4 and green at commit 5.
2. `./test validate browser` is green on the branch
   tip.
3. `grep -n "unfenced\|but one:" ARCHITECTURE.md`
   prints nothing.
4. ``grep -n "Fence `PUT organizations" TODO.md``
   prints nothing.
5. `git diff c9dfce78 -- server api/mock-data
   api/mock-data.ts api/authorization.ts` prints
   nothing.

## Close

The owner reviews this spec, then writing-plans turns
it into `docs/superpowers/plans/org-document-put-fence.md`
on this branch. The owner lands the branch.
