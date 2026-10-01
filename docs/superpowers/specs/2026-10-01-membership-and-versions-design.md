# A membership is an invitation, and a version is a stored response

- Date: 2026-10-01
- Status: design confirmed by the owner section by
  section, pre-plan
- Worktree: `.worktrees/membership-and-versions`,
  branch `membership-and-versions` (AGENTS.md
  § Worktrees, with `ledger-store` in place of
  `master`)
- Base: `ledger-store` at `fbc78952` (head reads
  landed)
- Lands: `git -C .worktrees/ledger-store merge
  --ff-only membership-and-versions`, on the owner's
  word. `master` stays at `origin/master`; nothing
  here moves it. Cleanup after landing, in this
  order: (1) the owner runs `git worktree remove
  .worktrees/membership-and-versions` from the main
  checkout, since the sandbox cannot delete a
  worktree; (2) then `git -C .worktrees/ledger-store
  branch -d membership-and-versions`, never from the
  main checkout, which sits on `master` and would
  call a landed branch "not fully merged". Never
  `-D`.
- Ships: membership as one invitation document per
  organization and identity, its two filtered views
  over a body GIN index, mint and every fence reading
  it; every version read served as stored responses,
  with three lines a read adds from the pair's
  envelope; the census down to one pattern
- Defers: `…/work-orders/:id/history` and the
  covenant (item 1's fifth spec); the three names
  invitation reads join today (item 2); filtering
  other collections (a TODO bullet); the retries
  bullet; the decode reductions in TODO's
  `## Later work`
- Witness: a GIN probe under
  `measurements/probes/`; `./test` timed before and
  after; the operator's before-and-after
  `./bin/measure --record --visualize` against
  `9a8396a` (the head-reads tip measure,
  `measurements/history.jsonl`), gating nothing

## Problem

Head reads left thirty GET routes answering handler
JSON (`tests/parted-reads.test.ts`). Twenty-four are
version reads, four are invitation reads, one is
`former-members/`, and one is the work-order history
the fifth spec builds.

The version reads wrap each stored body in facts the
store keeps beside it. `versionSnapshotsAt`
(`api/document-family.ts:416-444`) spreads the body
and adds `etag`, `at`, and `member_id` from the pair's
envelope, newest first; flows answer lifecycle rows
instead (`:512-529`); instances project values per
row (`api/routes.ts:4954-4988`). Two fields named
`at` mean different facts on one row, and comments
say so (`api/invitations-domain.ts:880-892`,
`shared/types.ts:1380-1386`).

The invitation reads join three names into each
body: the organization's name, the inviter's PII
name, and the invitee's PII email
(`api/invitations-domain.ts:97-162`). Two of them are
PII, and all three are read across the membership
fence.

Membership itself is two families. A seat at
`organizations/:id/members/:identity-id` holds
privilege; an invitation at `/invitations/:id` holds
consent; accepting writes both. A removed seat is a
DELETE head, which no read serves, so a third route,
`former-members/`, derives a list from those heads
(`api/derive-memberships.ts:258-287`). Mint, the
default organization, the PII fence, and the
organizations list each read every organization's
seats to answer a question about one identity
(`api/derive-memberships.ts:157-198`,
`api/routes.ts:698-710`).

This is item 1's fourth spec (`TODO.md:455-542`).

## Axiom

A membership is one document whose state says
whether it holds a seat, and a read serves a stored
response, adding only what the pair's envelope says
about the write.

## Decisions

1. **A membership is an invitation.** One family,
   stored at `/invitations/`, one document per
   organization and identity, named
   `<organization-id>:<identity-id>`. The seat family
   retires into it. §1.

2. **Five states.** `INVITATION_STATES` becomes
   `pending`, `accepted`, `declined`, `revoked`,
   `removed`. `accepted` holds a seat; `revoked` is
   an offer withdrawn before acceptance; `removed` is
   a seat taken away. None is `deleted`, so no
   membership is ever Gone. §1.

3. **Two filtered views, one collection.**
   `identities/:id/invitations/` selects by
   `identity_id`, `organizations/:id/invitations/` by
   `organization_id`, each with an optional
   `?state=`. `former-members/` retires: former
   members are `?state=removed`. §2.

4. **A body GIN index selects them.** A partial index
   over the stored body as `jsonb`, at
   `/invitations/` only, through a function that
   never raises. State is judged on the head, never on
   an older version. §2.

5. **Two reads decide who holds a seat.**
   `membershipOf` by name and `membershipsOfIdentity`
   by view; every seat read moves to them. §3.

6. **The invitation names are item 2's.** The
   invitation reads serve the stored body; the three
   joined names go until item 2's fence admits a read
   scoped to the relationship. §4.

7. **Every write from a held membership latches.** The
   three transitions' tag-only reads retire. §4.

8. **A version is a stored response.**
   `versions/:etag` serves that PUT pair through the
   one function; `versions/` is `multipart/mixed` of
   every PUT pair, oldest first. §5.

9. **Gone is gone.** A deleted document's version
   routes answer 410, as its document GET does. §5.

10. **A read adds three lines from the envelope.**
    `last-modified` and `response-at` from
    `response_at`, `requester-identity-id` from
    `requester_identity_id`, placed in canonical order
    by construction. Write answers carry them too.
    §6.

11. **The covenant's wording is amended here,** in
    TODO.md, in the commit that makes reads add the
    lines. The fifth spec lands the amended wording.
    §6.

12. **Names follow the route.** The instances version
    list gains its trailing slash;
    `getRecordInstanceHistory` and
    `getObjectiveHistories` become `…Versions`. §5.

13. **One spec, membership first.** Part 1 takes the
    census from 30 to 19, part 2 to 1. No merged
    route is built twice. Sequence.

14. **Carried in, and not reopened.** Head reads'
    one function, its projection forms, multipart
    framing, the 410 ladder, `HttpMessage<T>`, the
    transport's seven methods, and latching. State by
    PUT's whole state by family. The bell per
    inserted row.

## Found on the base

1. **Few readers.** In the product, only three
   version lists have a reader: objectives
   (`client/objectives.ts:85-102`, for `state`,
   `member_id`, and `at`), flows (a count,
   `client/flow-queries.ts:238`), and instances, whose
   verb no page calls (`client/record-instances.ts:
   173-186`; only `tests/adapters-record-instances.
   test.ts`). No `versions/:etag` route has a product
   reader.
2. **What a stored response says.** A stored PUT
   response carries `content-length`, `content-type`,
   `date`, `etag`, `operation-id`, and, for a
   received write, `request-id` (`formedResponse`,
   `api/message-pair.ts:306-330`). The statement
   splices `response_at` into the `date` line at
   insert (`DATE_PLACEHOLDER`,
   `api/ledger-root.ts:13`), so the stored `date` is
   `response_at` to the second. No stored line names
   the requester; `requester_identity_id` is an
   envelope column only.
3. **What a version superseded is already ordered.**
   `fa_message_pairs_succession` is unique on `(path,
   name, supersedes)` for PUT and DELETE, so a
   document's versions are one chain and `response_at,
   id` order names each one's predecessor.
4. **No GIN index exists.** `message_pairs_body` left
   with the message plane (`0aed8df6`). The four
   indexes are document, collection, succession, and
   request-id (`api/schema-postgres.ts:224-233`). The
   body is not a column: it is the octets after CRLF
   CRLF inside `response`, as
   `fa_message_body_bytes` reads it (`:176-192`). The
   root's body is a hex digest, not JSON.
5. **The gate rejects a non-identifier param.**
   `rejectMalformedIdentifierParams`
   (`api/api.ts:336-358`) refuses any `:param` that
   is not a 22-character identifier, `name` excepted.
6. **No route reads a query.** The server passes
   `url.search` to the API
   (`server/http-server.ts:600-605`); routing matches
   the pathname alone.
7. **Mint reads every organization.**
   `deriveMembershipsForIdentity` reads each
   organization's seat collection
   (`api/derive-memberships.ts:157-198`), and the PII,
   credentials, and providers fence reads every seat
   in every organization
   (`membershipsAcrossAllOrganizations`,
   `api/routes.ts:698-710`).
8. **The seed holds no DELETE head**, so
   `former-members/` is empty on mock data, and a
   DELETE's stored response has no body to name its
   seat.
9. **Former members have one reader.**
   `getFormerMembers` (`client/members-union.ts:
   128-142`) feeds `getMemberMap`, so a departed
   author still names. No page lists former members.
10. **Three transitions read for a tag.** Accept,
    decline, and revoke GET the invitation only to
    latch on it (`client/invitations.ts`).
11. **The invitation joins.** `organization_name` and
    `invited_by_name` on the identity nest,
    `invitee_email` on the organization nest
    (`api/invitations-domain.ts:97-162`); the
    presenters show an absence marker when a key is
    missing (`web-app/app/presenters/invitation-list.
    ts:42-69`).
12. **The instances version list has no slash**
    (`INSTANCE_VERSIONS_PATTERN`,
    `api/family-registry.ts`), the only list route of
    the census without one, and its client verb says
    "history".
13. **Write answers.** A landed write answers the
    stored response through `landedWire`; a no-op
    answers the head through `servedResponse`
    (`api/message-pair.ts:1474-1496`).
14. **`serializeWire` sorts its fields**
    (`credentialsLast(sortFields(fields))`,
    `shared/http-message/wire-codec.ts:257`);
    `servedResponse` appends its lines and relies on
    it (`api/served-response.ts:58-95`).
15. **An objective lifecycle event is a transition.**
    The score history counts a version as an event
    only when its `state` differs from its
    predecessor's (`client/objectives.ts:119-148`); a
    reorder re-sending `archived` is an echo.

## Out of scope

- `…/work-orders/:id/history` and the covenant
  `## A response is one unit`: item 1's fifth spec,
  which builds that read once and lands the wording
  §6 amends.
- The three names invitation reads join today: item
  2, whose fence may admit a read scoped to the
  relationship. A TODO bullet carries it.
- Filtering any other collection by a body field,
  objectives' lifecycle events by an index among
  them, and widening the partial index: a TODO
  bullet.
- Whether an admin may seat an identity without its
  consent: the direct seat keeps today's power.
- The retries bullet; the decode reductions in
  TODO's `## Later work`; pagination.

## Sequence

Every commit is green when it lands, and a route's
wire never changes apart from its reader.

**Part 1: membership.**

1. **The gate.** The `:membership-id` param kind;
   `?state=` parsing for the two views.
2. **The seam and the index.**
   `getCollectionHeadPairsContaining` on both
   backends and its store-acceptance case;
   `fa_message_body_json`, `fa_message_pairs_body`,
   the `EXPLAIN` pin, the schema SVG.
3. **The family beside the seats.** Wiring, the five
   states, transitions, the last-admin guard, the two
   views, the item routes, and their `versions/`
   pairs. Mock data and the seed write memberships;
   while consumers move, the seed writes both shapes.
4. **Consumers move, one per commit,** each with its
   pin (§3's table).
5. **Client and pages.** Verbs, the two selectors,
   removal, latched transitions.
6. **Retirement.** Seats, `former-members/`, the old
   invitation shapes, the seed's seat writes. The
   census goes 30 → 19.

**Part 2: version reads.**

7. **The three lines** in `servedResponse` and write
   answers; the covenant amendment in TODO.md.
8. **Version reads, one family per commit,** route,
   client verb, and tests together, with the 410
   ladder. The instances slash rides its family's
   commit. Each verb rename is its own commit, before
   its content changes. The Gone oracle line is
   rewritten.
9. **The census at one pattern.**
10. **Docs.**

## 1. The membership document

**Name and place.** Stored at `/invitations/`, named
`<organization-id>:<identity-id>`. A route param kind,
`:membership-id`, passes the gate only as two
identifiers joined by one `:`; anything else answers
400.

**Body.** `id`, `organization_id`, `identity_id`,
`type` (`admin` | `member`), `state`, and `at`.
`organization_id` and `identity_id` never change: the
name fixes them. `at` is the moment the current state
was entered, a domain fact the grant, the
transitions, and the direct seat each send. The
family declares `lifecycle: 'state'`.

**Transitions.** Every write but the grant is a PUT
latched on the head it read. The body of a transition
names it; the handler forms the whole state from the
head and the transition.

| Actor | From | To | Route |
|---|---|---|---|
| admin | none, `declined`, `revoked`, `removed` | `pending` (201) | POST `organizations/:id/invitations/` by email |
| admin | `pending` | none (no-op, 200) | the same POST |
| admin | `accepted` | refused, 409 | the same POST |
| invitee | `pending` | `accepted`, `declined` | PUT `identities/:id/invitations/:membership-id` |
| admin | `pending` | `revoked` | PUT `organizations/:id/invitations/:membership-id` |
| admin | `accepted` | `removed` | the same PUT |
| admin | `accepted` | `accepted`, another `type` | the same PUT |
| admin | none, `revoked`, `removed` | `accepted` | the same PUT; none declares a create |

Any other transition answers 409. The grant stays a
POST: the admin sends an email, and the server
resolves it to the name, then lands a sibling PUT
there, a handler genesis or a successor latched on
the head it read. The client no longer mints
`invitationId` or `grantEventId`.

**The last-admin guard** refuses a write that would
leave the organization no `accepted` admin: a removal
or a demotion. It reads the organization's view inside
a read transaction and refuses after it, as today.

**Nests.** The organization nest is fenced by the
token's organization; a name whose organization half
is not the path organization answers 403 on every
verb, before any genesis. The identity nest is self or
admin; a name whose identity half is not the path
identity answers 404, as today.

**Routes.**

| Route | GET | Writes |
|---|---|---|
| `identities/:id/invitations/` | view | |
| `identities/:id/invitations/:membership-id` | item | PUT |
| `…/:membership-id/versions/`, `…/versions/:etag` | §5 | |
| `organizations/:id/invitations/` | view | POST |
| `organizations/:id/invitations/:membership-id` | item | PUT |
| `…/:membership-id/versions/`, `…/versions/:etag` | §5 | |

**Retired.** `organizations/:id/members/`,
`…/members/:identity-id` (GET, PUT, DELETE), its two
version routes, and `former-members/`;
`seatsPrefixFor`, `deriveOrganizationMemberSeats`,
`deriveOrganizationMemberSeat`,
`deriveOrganizationFormerSeats`, `seatEntityOf`, and
`FormerSeatEntity`; the accept handler's second write.

## 2. The views and the index

**The wire.** The two views take an optional
`?state=` naming exactly one value of
`INVITATION_STATES`. A repeated, unknown, or empty
`state`, or any other query parameter, answers 400 at
the gate. Without `state` a view serves every
membership of its nest. Each part is what the item
route serves, ordered by `response_at, id` of the
head; an empty selection answers 204.

**The selection.**

1. Ask the index for the pairs at `/invitations/`
   whose body contains `{"organization_id": O}` or
   `{"identity_id": I}`. The name fixes those fields,
   so any matching version means the document belongs
   to the view.
2. Read each such document's head through
   `fa_message_pairs_document`.
3. Keep the heads whose body carries the requested
   `state`. State is judged on the head: an older
   `accepted` version under a `removed` head selects
   nothing.

**The function.** `fa_message_body_json(response
bytea) RETURNS jsonb`, IMMUTABLE, PARALLEL SAFE:
the body octets as `jsonb` when the stored header
block carries `content-type: application/json`, NULL
otherwise. It never raises in an index expression, so
a body that is not JSON inserts as before.

**The index.**

```sql
CREATE INDEX IF NOT EXISTS fa_message_pairs_body
    ON fa_message_pairs
    USING gin (fa_message_body_json(response)
        jsonb_path_ops)
    WHERE path = '/invitations/';
```

Partial, so only membership writes pay for it.
`jsonb_path_ops` serves `@>`, the one operator a
containment filter asks. The organization view could
ride a range on `name`, whose prefix is `O:`; the
identity view cannot, its `:I` being a suffix. Both
use the index, one mechanism, the trial the owner
asked for.

**The seam.** One method on both backends,
`getCollectionHeadPairsContaining(path, contains)`,
where `contains` is a flat object of string fields;
it returns the heads of the documents with a matching
version, in `response_at, id` order. The view's state
filter runs on those heads. The memory backend filters
in memory; `tests/store-acceptance.ts` holds both
backends to the same answers, the head-versus-version
case included.

**The pin.** `./test postgres` pins the plan of each
view: a bitmap scan of `fa_message_pairs_body`, no
sequential scan of `fa_message_pairs`.

**The probe.** `measurements/probes/` gains a GIN
probe: seed insert time and index size with and
without the index, and a view read at 10,000
memberships across 100 organizations against a
sequential scan.

## 3. Mint, fence, and tenancy

**Two reads.** `membershipOf(db, organization,
identity)` reads the head at `/invitations/<O>:<I>`
and answers the membership when its state is
`accepted`, nothing otherwise. `membershipsOfIdentity
(db, identity)` is the identity view at `accepted`.
Nothing else decides who holds a seat.

| Consumer | Today | Then |
|---|---|---|
| `subjectClaims`: mint, refresh, exchange (`api/authentication.ts:397`) | every organization's seats | `membershipsOfIdentity` |
| `identityDefaultOrganization`, the primary organization (`:438`, `:462`) | a seat probe, every organization's seats | `membershipOf`, `membershipsOfIdentity` |
| the default-organization PUT (`api/organization-requests.ts:121`) | a seat probe | `membershipOf` |
| `identities/:id/organizations/` (`:60`) | every organization's seats | `membershipsOfIdentity` |
| the PII, credentials, and providers fence (`api/routes.ts:698`) | every seat in every organization | the target's `membershipsOfIdentity` |
| grant and accept (`api/invitations-domain.ts:523`, `:727`) | a seat probe | the head at the name |
| the last-admin guard | the organization's seats | the organization view at `accepted`, `type: admin` |
| the roster (`api/derive-members.ts:37`) | the organization's seats | the organization view at `accepted` |

**The primary organization** stays the earliest `at`
among accepted memberships, lowest organization id on
a tie: the moment of acceptance, the fact a seat's
`at` recorded.

**Tenancy.** A membership's organization is the first
half of its name, checked as §1's nests say. SCHEMA.md
§8 becomes "Tenancy rides `path`, and a membership's
name". The named covenant stands: de-membership,
demotion, and revocation bite at next mint, refresh,
or exchange, or access TTL.

## 4. The client

**Types.** `MembershipEntity` is the membership body:
it gains `state`, keeps `type` and `at`, and its `id`
is the composite name. `InvitationView` drops
`organizationName` and `invitedByName`;
`SentInvitation` drops `inviteeEmail`. Nothing fills
them until item 2, and the presenters show the
absence marker in their place. `FormerSeatEntity`
retires; `FormerMember` is built from a `removed`
membership's `identity_id`.

**Reads.**

| Verb | Then |
|---|---|
| `getHumanMemberMap`, `getMembers`, `getOrganizationSeats` | `organizations/O/invitations/?state=accepted` |
| `getAdminSeatIds` | the same view, kept where `type === 'admin'` |
| `getHumanMember` | `organizations/O/invitations/O:I` |
| `getFormerMembers` | `organizations/O/invitations/?state=removed` |
| `getInvitations` | `identities/I/invitations/`, multipart |
| `getSentInvitations` | `organizations/O/invitations/` with the selector's state |

**Writes.** Each takes the message the page holds and
latches on it.

| Verb | Then |
|---|---|
| `postInvitationAcceptance`, `postInvitationDecline` | the held part; no read |
| `postInvitationRevocation` | the held part, `pending` → `revoked`; no read |
| `postMembershipRemoval` (from `deleteHumanMemberSeat`) | the held part, `accepted` → `removed` |
| `postHumanMemberCreation`'s seat | `accepted` at `O:I`, `If-None-Match: *` |
| `postInvitationGrant` | sends `email` and `grantAt` |

Remint after accept keeps its two attempts. A
membership write notifies both `invitationChanges` and
`humanMemberChanges`: one write changes both surfaces.

**Pages.** The invitations page and its indicator
hold their parts. The organization page's invitations
box gains a selector, **Pending**, **Declined**,
**Revoked**, and revokes from the part it holds. The
members page gains a selector, **Members**
(`accepted`) and **Former members** (`removed`);
former members render in their own row style with no
edit actions, and detail removes through
`postMembershipRemoval`. Both selectors are segmented
controls reachable by keyboard, styled by
DESIGN-SYSTEM classes and tokens, no inline style.
`getOrganizationStats` counts from the members view.

## 5. Version reads

**Scope.** Nine families' `versions/` and
`versions/:etag`: identities, ai-agents, ideas,
projects, objectives, record types, organizations,
flows, instances. Part 1 builds the membership
family's four the same way.

**`versions/:etag`** serves the PUT pair the tag names
at that document, through `servedResponse` with the
family's reader. The ladder, the head-reads ladder:

1. The fence: 403.
2. A document never written: 404.
3. A deleted document, a DELETE head or a
   state-`deleted` head in a lifecycle family: 410.
4. A tag that names no PUT pair at this document:
   404.
5. Otherwise the served pair.

**`versions/`** is `multipart/mixed` of every PUT pair
at the document, each part what `versions/:etag`
serves for it, ordered `response_at, id`, oldest
first. DELETE pairs are not versions. Its ladder is
steps 1-3, then the parts; a written document always
has one.

**Instances** project each version by the reader's
current attribute schema, the `values` reader; the
last two `projectReadableValues` calls retire. The
list route becomes `…/instances/:instance-id/versions/`.

**Flows** list PUT pairs like every family, in place
of lifecycle rows. The designer offers Undo when the
list has more than one part; the plan re-walks
TEST-PLAN F36 and F45 against it.
`documentStateHistoryHandler` and the route's use of
`documentLifecycleEvents` retire; undo's own target
walk stays until item 11.

**Client.**

- `getFlowVersions` returns `HttpMessage<FlowEntity>[]`.
- `getObjectiveHistories` becomes
  `getObjectiveVersions`, returning messages;
  `getObjectiveLifecycleEvents` reads each part's
  `state` from the body and its `memberId` and `at`
  from the `requester-identity-id` and `response-at`
  lines. The client reads the lines; the page is
  handed domain values.
- `getRecordInstanceHistory` becomes
  `getRecordInstanceVersions`, returning
  `HttpMessage<RecordInstanceEntity>[]`;
  `RecordInstanceHistoryEntry` retires.
- Tests read a version's tag from its `etag` line,
  never by quoting a body field by hand.

**Retired.** `versionSnapshotsAt`,
`serveDocumentRevision`, `storedRevisionDocument`,
`invitationVersionSnapshots`, the per-family version
handlers, and `StateEntity` where only this route
used it.

**Gone.** TODO's `Gone for every document` bullet
says "history and past versions still answer 200";
that line becomes "history and past versions answer
410 with the document".

## 6. The three lines

**The function.** `servedResponse(stored,
transmission, envelope, reader)`; `envelope` is
`{ responseAt, requesterIdentityId }` of the pair
served. Every caller holds that row. It reads no
clock and no row.

| Line | Source | |
|---|---|---|
| status line | `HTTP/1.1 200 ` | replaced |
| `date` | this transmission | replaced |
| `request-id` | this transmission | replaced |
| `content-length` | the body as served | replaced when projected |
| `last-modified` | `response_at` as IMF-fixdate (`httpDateOf`) | added |
| `requester-identity-id` | `requester_identity_id` | added |
| `response-at` | `response_at`, RFC-3339 zulu, six fraction digits | added |
| every other stored line | as stored | |

`last-modified` follows RFC 9110 §8.8.2, whose
HTTP-date stops at the second; `response-at` carries
the column's full resolution, named for its column as
`requester-identity-id` is. Both come from the one
column at read time, so they cannot disagree.

**Order by construction.** The stored head block is
canonical. The function makes one ordered pass over
it: it replaces `content-length`, `date`, and
`request-id` where they stand, writes each added line
before the first stored line whose name sorts after
it, drops any stored copy of an added line, and passes
every other line through. The served order is
`content-length`, `content-type`, `date`, `etag`,
`last-modified`, `location` when stored,
`operation-id`, `request-id`,
`requester-identity-id`, `response-at`. Nothing
compares or reorders; the list it hands
`serializeWire` already equals `sortFields` of itself.

**Write answers.** A landed write's answer gains the
three lines from the row the statement inserted,
through `landedWire`; a no-op's comes from
`servedResponse`. A page that replaces its held
message with a write's answer holds what a GET of that
head serves, but for status, `date`, and `request-id`.
The plan confirms the statement's answer carries the
inserted row's `response_at` and
`requester_identity_id`, and adds them to its
`RETURNING` where it does not.

**One head, one response** holds: a document GET and
its collection part come from one function with one
envelope.

**The covenant amendment.** In TODO.md item 1, in the
commit that makes reads add the lines, the sentence

> A read serves those stored bytes with exactly three
> substitutions — the status line, `date`, and
> `request-id`, the lines that describe this
> transmission — made by ONE function on the head;

becomes

> A read serves those stored bytes with exactly three
> substitutions — the status line, `date`, and
> `request-id`, the lines that describe this
> transmission — and three additions from the pair's
> envelope — `last-modified` and `response-at` from
> `response_at`, and `requester-identity-id` from
> `requester_identity_id`, the lines that describe
> the write — made by ONE function on the pair it
> serves;

The rest of the approved wording is unchanged.

## 7. The census

`tests/parted-reads.test.ts` loses the eleven
membership patterns when part 1 retires them (the
four invitation reads, the four invitation version
reads, the two member version reads,
`former-members/`) and the eighteen version patterns
as part 2 converts them, one family per commit. It
ends naming `organizations/:id/work-orders/:id/history`
alone, for the fifth spec.

## Error and wire

| Status | When |
|---|---|
| 200 | a live document, a version of one, a view or version list that selects at least one |
| 204 | a view that selects none |
| 400 | a malformed `:membership-id`; a bad `?state=` or any other query parameter |
| 403 | the fence; a membership name whose organization is not the path's |
| 404 | a name never written; a tag naming no PUT pair at the document; a membership name whose identity is not the path's |
| 405 | DELETE on a membership |
| 409 | a membership transition not in §1's table; the last admin |
| 410 | a deleted document, on its GET and on both version routes |
| 412 | a latched write whose head has moved |

Every 2xx read carries the three added lines beside
`date`, `request-id`, `etag`, and `operation-id`.
Refusals keep today's `{ error }` body.

## Testing

Layer 1 in `tests/`, then `./test postgres`. Layer 2
(`./test browser`) and `./bin/measure` need Chrome:
the operator runs each and tees it to a file under
`.worktrees/membership-and-versions/.superpowers/`.

New pins:

- Each §1 transition by actor, and each refusal:
  409, 412, 403 for a foreign name, 400 for a
  malformed one, the last admin by removal and by
  demotion.
- Each view: nest filtering, `?state=`, 400 on a bad
  query, 204 when empty, order, and the
  head-versus-version case.
- Every §3 consumer: `pending`, `declined`,
  `revoked`, and `removed` hold nothing; an
  `accepted` version under a `removed` head holds
  nothing; an `accepted` head holds its `type`.
- The GIN plan; a body that is not JSON still
  inserts; the two backends agree.
- `servedResponse`: the three lines, their order by
  construction, a stored copy dropped, landed and
  no-op answers carrying them.
- Each version route: 403, 404, 410, 404 for a
  foreign tag; parts equal to items; oldest first;
  instance projection.
- The two selectors: each state reachable by
  keyboard, the right rows under each.
- The census at one pattern.

Standing pins that change, rewritten to the new truth
or deleted with the behavior they named, never
weakened: the seat, member-version, and former-seat
tests; the invitation shapes and their joined names;
the version rows' `etag`, `at`, and `member_id`
(`tests/api-versions-etag.test.ts`); tests that quote a
version tag by hand; the flow lifecycle rows; version
reads of a deleted document answering 200. The plan
names each file.

## Docs that change when this ships

- API.md: membership routes, the views and
  `?state=`, version reads, the three lines, the
  status table.
- The generated API documentation, through its
  generator and `./test api-docs`.
- SCHEMA.md: §8 tenancy; the index and its function;
  what `last-modified` and `response-at` say.
- ARCHITECTURE.md: `## Tenancy`, where memberships
  live; how a version is served. No covenant.
- DESIGN-SYSTEM.md: the segmented control, where no
  existing component serves.
- TEST-PLAN.md: membership removal, the two
  selectors, the invitation flows.
- TODO.md: item 1's progress and the spec that
  follows; the covenant amendment (§6); the Gone line
  (§5); a bullet for filtering other collections,
  with objectives' two preconditions (a transition
  recorded in the body, a collection-wide versions
  view) and the index's reach; a bullet for item 2 to
  restore the three invitation names; the
  three-shapes bullet loses `RecordInstanceHistoryEntry`.
- `measurements/probes/README.md`: the GIN probe.

## For the next brainstorms

The fifth spec, work-order events, inherits
`…/work-orders/:id/history`, the census's last
pattern, and the covenant as §6 amends it: its commit
that empties the census adds `## A response is one
unit` to ARCHITECTURE.md.

Item 2 inherits the three invitation names and the
relationship-scoped read that would restore them, and
memberships' tenancy riding the name as well as the
path.

The filtering bullet inherits the partial index's
reach and the objectives' lifecycle events.
