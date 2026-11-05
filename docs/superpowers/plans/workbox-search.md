# Workbox search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** One typo-tolerant matcher in `shared/`, served
by `QUERY` on the work-orders, memberships, and
organization-root resources, drives the workbox search
box, the Members page filter, and the top bar.

**Architecture:** The matcher is pure and shared. The
gate learns `QUERY`: a new route slot, `selectMatching`,
reuses the route's GET selection for the fence, ranks
the heads by the text each head's GET would serve, and
answers through the GET's collection serving. The client
gains a `QUERY` transport verb beside `GETCollection` and
one domain verb per resource. The pages call those verbs
and keep the answer's order.

**Tech Stack:** Deno 2.9.8, TypeScript under `deno.json`
(`strict`, `noUncheckedIndexedAccess`,
`verbatimModuleSyntax`, `erasableSyntaxOnly`),
`@std/assert`, the in-process `handleRequest` gate, the
memory adapter, `tests/store-acceptance.ts` (memory and
Postgres), Chrome over CDP for `tests/browser/`.

**Spec:** `docs/superpowers/specs/workbox-search-design.md`
(commit `121d04f30`). Executors read the spec and this
plan. Its "my call" items are decided; do not reopen
them.

## Execution ground

- Worktree:
  `/Users/tmornini/code/fusion-angle/.worktrees/workbox-search`,
  branch `workbox-search`, on master `34ccc9468` (the
  value-reader prerequisite). Every command runs there.
  No dispatch passes the Agent tool `isolation`; nobody
  creates a worktree, runs `./deploy --render`, pushes,
  or force-pushes. Only the controller squashes and
  merges.
- `export DENO_DIR="$TMPDIR/deno-dir"` before any
  `deno`, `./test`, or `./deploy` command.
- Each commit runs `./test validate --syntax`. Each task
  also runs `./test` before its commit, so every task
  lands green. Browser tasks also run
  `./test browser` for their own file
  (`deno test` filter as `bin/test-browser` allows, or
  the whole suite).
- Commit subjects: one line, ~50 chars, present-tense
  imperative, then a blank line and
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  No other body. Never move and change a file in one
  commit.
- A failing test is fixed in code. A test is deleted or
  rewritten only where this plan says the spec retired
  the covenant it pins, and the task names each one.

## Global Constraints

- 78-character lines in every file `./test lint` lints;
  4-space indent; no inline styles (classes and custom
  properties per DESIGN-SYSTEM.md).
- `QUERY` request: `Content-Type: application/json`,
  body `{ "q": "<text>" }`. A non-object body, invalid
  JSON, or a missing or non-string `q` is 400 at the
  gate. A bearer is required, as on the GET.
- `QUERY` response: exactly a collection GET's format —
  `multipart/mixed`, one stored response per matching
  head through the GET's reader, best match first; 204
  when nothing matches. Cache-Control is the GET's
  (`no-store` from `server/http-server.ts:746-749`; no
  code sets it).
- Authorization is the GET's: a foreign path is 403 at
  the organization fence. A QUERY never matches on a
  field the GET serving that field would hide.
- The URL query string means what it means on the GET:
  memberships keeps `?state=accepted|removed`, default
  accepted, and a bad `?state=` is 400.
- `Route.query` (`api/routes.ts:694`) is the GET
  query-string judge. The QUERY slot is
  `selectMatching`. Inside `HTTP_VERBS` the verb is
  `'query'`, derived from `row.selectMatching`, never
  from `row.query`.
- Client verbs take `RequestContext` first and return
  `HttpMessage`s or values that keep one. Adapter naming:
  `queryNoun` for a QUERY, as `getNoun` for a GET.
- Presenters return `SafeHtml`. Storage is snake_case,
  the domain camelCase.
- An empty or whitespace-only query never reaches the
  server from a page: the page shows today's GET.
- No transport verb takes an `AbortSignal`. A page
  drops a stale answer by a per-search sequence number.
- Mobile breakpoint: `(max-width: 767px)`, as
  `responsive.css:18` and `pages-workbox.css:16` write
  it.

## Review Focus

1. **A punctuation-only or symbol query** (`@`, `#`,
   `-`) has no words. Today's substring search finds `@`
   in every email, so the matcher must too, through the
   whole-query substring rule. A query with no words and
   no substring hit must miss, not match everything
   vacuously. Pinned in Task 2.
2. **A deleted head in a selection** (a state-`deleted`
   idea, project, or flow; a DELETE head) must never
   match, even on its id: the GET answers 410 for it.
   Pinned in Tasks 3 and 7. For a deleted flow, Task 5
   pins that its current name is not searched.
3. **A lapsed claim** has its `claim` key still stored.
   The claimant's name must not match once
   `expires_at` has passed: the card is no longer
   claimed. Pinned in Task 5.
4. **A pasted display id with its `#`** (`#a7c3e1f9`)
   and a pasted whole 22-character identifier, which
   holds `-` or `_`, must match. The tokenizer splits
   both the same way on both sides. Pinned in Tasks 2
   and 5.
5. **A typing burst ending in an empty box**: an answer
   to `"ap"` that lands after the box was cleared must
   not repaint filtered lists over today's lists. The
   sequence number covers clearing as well as typing.
   Pinned in Task 8 (browser).

---

## File structure

| File | Responsibility | Task |
|---|---|---|
| `shared/levenshtein-distance.ts` | edit distance | 1 |
| `shared/search-match.ts` | tokenizer, matcher, ranking | 2 |
| `api/routes.ts` | `selectMatching` slot; three routes | 3, 5-7 |
| `api/api.ts` | QUERY gate and dispatch | 3 |
| `api/authorization.ts` | QUERY tier = GET tier | 3 |
| `api/route-surface.ts` | `'query'` verb | 3 |
| `api/served-response.ts` | `servedBodyOf` | 3 |
| `api/head-reads.ts` | `matchingCollection`; `mixed` kind | 3, 7 |
| `web-app/app/generate-api-documentation.ts` | query rooms | 3 |
| `client/http-facade.ts`, `client/request-context.ts` | `QUERY` transport | 4 |
| `api/member-names.ts` | names the caller may read | 5 |
| `api/work-order-search.ts` | work-order fields | 5 |
| `api/membership-search.ts` | membership fields | 6 |
| `api/organization-search.ts` | organization-root selection | 7 |
| `client/work-orders-queries.ts` | `queryWorkOrders` | 5 |
| `client/members-union.ts` | `queryMembershipEntities` | 6 |
| `client/organizations.ts` | `queryOrganization` | 7 |
| `web-app/workbox/*`, `web-app/app/presenters/workbox-inbox.ts`, `web-app/app/workbox-inbox-drag.ts`, `web-app/app/workbox-inbox-rows.ts`, `pages-workbox.css`, `components-inputs.css` | workbox box | 8 |
| `web-app/members/index.ts`, `web-app/app/presenters/member.ts`, `shared/types.ts` | Members QUERY | 9 |
| `web-app/app/command-palette.ts` | top bar | 10 |
| `TODO.md` | two entries | 11 |
| `API.md`, `web-app/api-documentation/` | docs | 12 |

---

### Task 1: Levenshtein distance

Agent: coder. Commandments: Logic, Clarity. Risks:
Premature Generalization (no options, no weights).

**Files:**
- Create: `shared/levenshtein-distance.ts`
- Test: `tests/levenshtein-distance.test.ts`

**Interfaces:**
- Produces:
  `levenshteinDistance(a: string, b: string): number` —
  unit-cost insert, delete, substitute over UTF-16 code
  units; pure; no options.

- [ ] **Step 1: Write the failing test** — one
  `Deno.test` per row, `assertStrictEquals`:

```ts
// [a, b, distance]
['', '', 0], ['', 'abc', 3], ['abc', '', 3],
['kitten', 'sitting', 3], ['flaw', 'lawn', 2],
['aproval', 'approval', 1], ['approval', 'approval', 0],
['abc', 'acb', 2], ['a', 'b', 1],
```

  plus symmetry: `levenshteinDistance(b, a)` equals
  `levenshteinDistance(a, b)` for every row.
- [ ] **Step 2: Run** `deno test --frozen
  tests/levenshtein-distance.test.ts` — FAIL, module
  not found.
- [ ] **Step 3: Implement** with two rolling rows
  (O(min(|a|,|b|)) memory).
- [ ] **Step 4: Run** the test — PASS. Run `./test` —
  PASS.
- [ ] **Step 5: Commit** `Add the Levenshtein distance`.

### Task 2: The search matcher

Agent: architect (the interface Tasks 5-10 build on).
Commandments: Logic, Uniformity, Clarity. Risks:
Default Values (a miss is a variant, never `0` or
`-1`), Premature Generalization (no options object),
Magical Values (name the length cut).

**Files:**
- Create: `shared/search-match.ts`
- Test: `tests/search-match.test.ts`

**Interfaces:**
- Consumes: `levenshteinDistance` (Task 1).
- Produces:

```ts
export const SHORT_WORD_MAX_LENGTH = 4;
export const SHORT_WORD_EDITS = 1;
export const LONG_WORD_EDITS = 2;
export type SearchMatch =
    | { readonly kind: 'matched'; readonly edits: number }
    | { readonly kind: 'missed' };
export function searchWordsOf(text: string): string[];
export function searchMatchOf(
    query: string, fields: readonly string[],
): SearchMatch;
export function rankedBySearch<T>(
    items: readonly T[],
    query: string,
    fieldsOf: (item: T) => readonly string[],
): T[];
```

Rules (spec "The matcher", decided here where it left
the choice):

- `searchWordsOf`: lowercase, split on
  `/[^\p{L}\p{N}]+/u`, drop empty words.
- `searchMatchOf`: a whitespace-only query is
  `missed`. If the lowercased, trimmed query is a
  substring of some lowercased field, `matched` with
  0 edits. Otherwise take the query's words; none is
  `missed`. Each query word matches with 0 edits when
  it is a substring of some lowercased field (this
  covers prefix), else with the least
  `levenshteinDistance` to any field word within its
  tolerance (`SHORT_WORD_EDITS` when its length is at
  most `SHORT_WORD_MAX_LENGTH`, else
  `LONG_WORD_EDITS`). Any word unmatched is `missed`;
  else `matched` with the sum of edits.
- `rankedBySearch`: keep the matched items, stable-sort
  by edits ascending (ties keep input order — the
  resource's GET order).

- [ ] **Step 1: Write the failing tests** — fields are
  one-element arrays unless shown:

| test | query | fields | expect |
|---|---|---|---|
| prefix | `appr` | `Approval` | matched 0 |
| case | `APPROVAL` | `approval` | matched 0 |
| substring mid-word | `rov` | `Approval` | matched 0 |
| 1 edit long | `aproval` | `Approval` | matched 1 |
| 2 edits long | `aprovl` | `Approval` | matched 2 |
| 3 edits long | `aprvl` | `Approval` | missed |
| 1 edit short | `flaw` | `flow` | matched 1 |
| 2 edits short | `flex` | `flow` | missed |
| every word | `review legal` | `Legal review` | matched 0 |
| one word missing | `review zebra` | `Legal review` | missed |
| words across fields | `legal acme` | `Legal`, `Acme` | matched 0 |
| whole UUID | `3f2a9c1e-…` (a literal UUID) | text holding it | matched 0 |
| UUID group | its second group | same | matched 0 |
| identifier with `_` and `-` | `Ab_c-DeFgHiJkLmNoPqRsTu` | holding it | matched 0 |
| `#` display id | `#a7c3e1f9` | `a7c3e1f9` | matched 0 |
| symbol substring | `@` | `carol@example.com` | matched 0 |
| symbol no hit | `@` | `Carol` | missed |
| empty | `` | `x` | missed |
| whitespace | `   ` | `x` | missed |

  Superset: for every row whose query is a
  case-insensitive substring of a field, the result is
  `matched` with 0 edits (a loop over those rows).
  Ranking: `rankedBySearch(['Aproval form',
  'Approval', 'Unrelated', 'Approval two'],
  'approval', (s) => [s])` is
  `['Approval', 'Approval two', 'Aproval form']`.
  `searchWordsOf('Ab_c-De #a7 x.y')` is
  `['ab', 'c', 'de', 'a7', 'x', 'y']`.
- [ ] **Step 2: Run** `deno test --frozen
  tests/search-match.test.ts` — FAIL.
- [ ] **Step 3: Implement** in `shared/search-match.ts`.
- [ ] **Step 4: Run** the test, then `./test` — PASS.
- [ ] **Step 5: Commit** `Add the shared search matcher`.

### Task 3: The QUERY gate

Agent: architect (the slot, serving, and verb every
QUERY route builds on). Commandments: Security,
Reliability, Uniformity, Follow the RFCs (RFC 10008).
Risks: Internal Defense (validate `q` once at the gate),
Foreign Tongues (`selectMatching` is no `search`; the
URL's `ctx.search` is the query string), Premature
Generalization.

**Files:**
- Modify: `api/routes.ts` (`Route`, `route()`, new
  `MatchingSelectHandler` beside `SelectHandler` at
  `:608`)
- Modify: `api/api.ts` (`:761-771` view-query judge,
  `:773-798` body parse, `:983` dispatch switch)
- Modify: `api/authorization.ts` (`ROUTE_POLICY`
  `:183-190`, `MEMBER_VERBS` `'/organizations/:id'`
  row `:159`)
- Modify: `api/route-surface.ts`, `api/served-response.ts`,
  `api/head-reads.ts`
- Modify: `web-app/app/generate-api-documentation.ts`
  and regenerate `web-app/api-documentation/`
- Test: `tests/api-query-gate.test.ts` (create),
  `tests/route-surface.test.ts`,
  `tests/authorization.test.ts`,
  `tests/head-reads-collections.test.ts`

**Interfaces:**
- Produces:

```ts
// api/routes.ts
export type MatchingSelectHandler = (
    adapter: DbAdapter, params: string[], actor: Id,
    organization: Id | undefined,
    roles: readonly string[],
    query: RouteQuery | undefined,
    text: string, // the body's q, validated
) => Promise<HeadSelection>;
// Route and route() gain: selectMatching?: MatchingSelectHandler

// api/served-response.ts — the body exactly as the
// GET serves it: projectedBody, then JSON-parsed.
export function servedBodyOf(
    head: MessagePairEntity, reader: Reader,
): Record<string, unknown>;

// api/head-reads.ts — drops deleted heads, then ranks
// the rest by fieldsOf(served body, head); keeps the
// selection's reader and lifecycle.
export function matchingCollection(
    selection: HeadSelection,
    text: string,
    fieldsOf: (
        body: Record<string, unknown>,
        head: MessagePairEntity,
    ) => readonly string[],
): HeadSelection; // throws if selection is not 'collection'

// api/route-surface.ts
// HTTP_VERBS = ['get', 'query', 'put', 'post', 'patch', 'delete']
// 'query' offered iff row.selectMatching !== undefined
```

Gate behavior (`api/api.ts`):

- The view-query judge runs for `GET` and `QUERY`.
- The body parse runs for `QUERY` too (same
  `parseObjectBody`, same 400 text); then a missing or
  non-string `q` is 400
  `{ error: 'QUERY body requires a string q' }`.
- `case 'QUERY'`: with `matched.selectMatching`, answer
  `servedSelection(await matched.selectMatching(
  effective, params, actor, organization, roles,
  viewQuery, text), transmission)` exactly as `GET`;
  without, 405 `'Method QUERY not allowed on ' +
  pathname`.
- No message pair forms (`isWrite` stays false).
- The `GET`-only organization-document fence exemption
  (`:622-631`) does not widen: a QUERY path whose
  organization is not the token's is 403.
- Authorization: `{ verb: 'QUERY', pathPrefix: '/',
  roles: ['admin'] }` joins `ROUTE_POLICY`, and
  `'QUERY'` joins the `'/organizations/:id'` member row
  only (it covers every nested path).
- `HeadSelection`'s comment (`head-reads.ts:31-37`):
  a QUERY collection is in best-match order, not store
  order.

Generator: `'query'` rooms mirror `'get'` rooms with
these deltas — example body `{"q": "approval"}`;
status codes 200, 204, 400, 401, 403; carries the same stored-pair lines as a GET
collection. No route offers `query` yet, so only the
SVG and verb columns change here.

- [ ] **Step 1: Write the failing tests.**
  `tests/api-query-gate.test.ts` (memory adapter,
  `apiRequest`, `organizationToken`; `QUERY` on
  `/organizations/:org/ideas/`, which has no
  `selectMatching`):
  - `a member QUERY on a route without the slot is
    405` — member token, body `{q:'x'}`; status 405,
    not 403.
  - `QUERY with invalid JSON is 400`; `with an array
    body is 400`; `with no q is 400`; `with a numeric q
    is 400` — status 400 and, for the last two, the
    error text above.
  - `QUERY on a foreign organization path is 403` —
    token for org A, path under org B (real org).
  - `QUERY without a bearer is 401`.

  `tests/route-surface.test.ts`: a fake row with
  `selectMatching` offers `['query']`; a row with only
  the GET judge `query` and `select` offers `['get']`.
  `tests/authorization.test.ts`: admin and member are
  permitted `QUERY` on `/organizations/:id/work-orders`.
  `tests/head-reads-collections.test.ts`:
  `matchingCollection` over three heads (one deleted by
  state) and text matching all three serves two parts,
  best first; text matching none serves 204;
  `servedBodyOf` with a `'keys'` reader drops the
  hidden key.
- [ ] **Step 2: Run** those four files — FAIL.
- [ ] **Step 3: Implement** the interfaces and gate
  behavior above.
- [ ] **Step 4: Regenerate** API docs
  (`./bin/generate-api-documentation`), then
  `./test api-docs` and `./test` — PASS.
- [ ] **Step 5: Commit** `Accept QUERY at the gate`.

### Task 4: The QUERY transport verb

Agent: architect. Commandments: Uniformity, Reliability.
Risks: Premature Generalization (no `AbortSignal`),
Default Values.

**Files:**
- Modify: `client/http-facade.ts` (`HttpFacade` `:30-71`;
  share the multipart parse of `GETCollection`
  `:369-395` with `QUERY`)
- Modify: `client/request-context.ts` (`RequestContext`
  `:141-175`, `openRequestContext` beside
  `GETCollection` `:262-269`)
- Modify: `tests/adapters-shared-recovery.test.ts:609`
  (the literal facade gains `QUERY: unused`)
- Test: `tests/client-transport.test.ts`

**Interfaces:**
- Produces:

```ts
// RequestContext
QUERY<T>(
    resource: string, body: Record<string, unknown>,
): Promise<HttpMessage<T>[]>;
// HttpFacade
QUERY<T>(
    resource: string, body: Record<string, unknown>,
    token: string, headerFields?: HeaderFields,
): Promise<HttpMessage<T>[]>;
```

The context records `recordRequest('QUERY', resource)`,
sends `writeHeaders()`, and runs under `run` (auth
recovery) as `GETCollection` does. The facade sends
`exchangeOnce('QUERY', …, body, …)`; 204 is `[]`; a
200 splits into parts; non-2xx throws as `answered`
does.

- [ ] **Step 1: Write the failing tests** in
  `tests/client-transport.test.ts` with the recording
  fetch (`tests/fixtures/recording-fetch.ts`):
  method is `QUERY`, URL `/api/<resource>`,
  `content-type: application/json`, body
  `{"q":"ap"}`; a 204 answer is `[]`; a two-part
  multipart answer is two `HttpMessage`s with their
  bodies; a 400 answer throws `RequestError` with
  status 400.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the file, then `./test` — PASS.
- [ ] **Step 5: Commit** `Add the QUERY transport verb`.

### Task 5: Work-orders QUERY

Agent: planner. Commandments: Security, Reliability,
Uniformity, Clarity. Risks: Internal Defense, Default
Values (a missing join is absent from the fields, never
`''`), Test Weakening, Foreign Tongues.

**Files:**
- Create: `api/member-names.ts`, `api/work-order-search.ts`
- Modify: `api/routes.ts:4514-4521` (the work-orders
  collection route gains `selectMatching`)
- Modify: `client/work-orders-queries.ts`
- Modify: `tests/store-acceptance.ts` (one case)
- Regenerate: `web-app/api-documentation/`
- Test: `tests/api-work-orders-query.test.ts` (create),
  `tests/adapters-work-orders.test.ts`

**Interfaces:**
- Consumes: Task 2 `searchMatchOf`/`rankedBySearch`;
  Task 3 `MatchingSelectHandler`, `matchingCollection`,
  `servedBodyOf`; Task 4 `ctx.QUERY`.
- Produces:

```ts
// api/member-names.ts — the name each member id has
// under the GETs that serve it to this caller:
// memberships (accepted and removed) joined
// invitee_name, ai-agents/:id name, services/:id name,
// SYSTEM_MEMBER_ID -> 'System'. A member with no
// readable name is absent.
export async function memberNamesOf(
    db: DbAdapter, organization: Id,
): Promise<ReadonlyMap<Id, string>>;

// client/work-orders-queries.ts
export function queryWorkOrderEntities(
    ctx: RequestContext, text: string,
): Promise<HttpMessage<WorkOrderEntity>[]>;
export function queryWorkOrders(
    ctx: RequestContext, text: string,
): Promise<WorkOrder[]>; // map(toWorkOrder)
```

The handler is the route's own select
(`withWorkOrderValueReader(collectionSelect(...))`),
then `matchingCollection` with these fields per head
(audited from `WorkOrderEntity`,
`shared/types.ts:1316-1344`; `body` is `servedBodyOf`):

- `id`, `display_id`;
- `flow_graph.name`; the flow id and the flow's
  current `name` from the `flows/:id/work-orders/`
  join (`flowWorkOrdersUriPrefix`, read for every live
  flow in one `getCollectionHeadPairsBatch`); a deleted
  flow's name is not a field;
- `state` (node id), and that node's `name` and
  `taskInstructions` from `flow_graph.nodes`;
- `transition.member_id` and its name;
- when the claim is unlapsed at request time
  (`isExpiresAtPassed`, `shared/work-order-claims.ts`):
  `claim.member_id` and its name;
- `record_type_id`, `instance_id`, and each value of the
  bound instance that the instance GET's reader
  (`{ sees: 'values', attributesById, roles }`, the
  type's schema from the reader's `boundSchemas`) keeps;
- each `events[].field_values[].value` the event-values
  reader kept (stringified scalars).

The organization's own id is not a field: every item
carries it, so it would match the whole collection.

- [ ] **Step 1: Write the failing tests** in
  `tests/api-work-orders-query.test.ts`, through
  `handleRequest`, seeded as
  `tests/api-work-order-value-acl.test.ts` seeds (admin,
  member, flow, record type with an open and a hidden
  attribute, a bound instance, `seedCreatedWorkOrder`):
  - `matches by flow name with a typo` — two work
    orders on flows "Approval" and "Shipping"; `q`
    `aproval` serves one part, the first.
  - `ranks an exact match above a typo` — flows
    "Approval" and "Aproval", `q` `approval`: parts in
    that order.
  - `matches by display id with its hash`, `by whole
    work-order id`, `by state name`, `by task
    instructions`, `by flow id`, `by claimant name`,
    `by an open bound value`.
  - `a lapsed claim's member does not match` — claim
    with `expires_at` in the past, `q` the claimant's
    unique name: 204.
  - `a member cannot match a hidden bound value` —
    member token, `q` `classified-salary-90000`: 204;
    the admin token: one part.
  - `a member cannot match a hidden event value` — the
    same value set by a transition: member 204.
  - `a deleted flow's name does not match`.
  - `nothing matches is 204`; `an empty q is 204`.
  - `a bad body is 400`; `a foreign path is 403`.
  - `a part is the GET's part` — the matched part's
    wire equals that work order's part in the GET
    collection but for `date` and `request-id`.
  `tests/store-acceptance.ts`: `<name>: work-orders
  QUERY ranks by flow name`. `tests/adapters-work-orders.test.ts`:
  `queryWorkOrders` through the in-page facade returns
  the `WorkOrder`s in best-match order, each keeping its
  message.
- [ ] **Step 2: Run** the three files — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Regenerate** API docs; run `./test` —
  PASS.
- [ ] **Step 5: Commit** `Search work orders over QUERY`.

### Task 6: Memberships QUERY

Agent: planner. Commandments: Security, Reliability,
Uniformity. Risks: Internal Defense, Default Values,
Test Weakening.

**Files:**
- Create: `api/membership-search.ts`
- Modify: `api/routes.ts:5293-5297`
- Modify: `client/members-union.ts`
- Modify: `tests/store-acceptance.ts` (one case)
- Regenerate: `web-app/api-documentation/`
- Test: `tests/api-memberships-query.test.ts` (create),
  `tests/adapters-members-union.test.ts`

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces:

```ts
// api/membership-search.ts — fields of one served
// membership body; Task 7 reuses it.
export interface MembershipSearchJoins {
    readonly agents: ReadonlyMap<Id, AIAgentEntity>;
    readonly services: ReadonlyMap<Id, ServiceEntity>;
    // identities/:id bodies, read only when the caller
    // holds admin: the identities/:id GET refuses
    // every other caller (MEMBER_VERBS has no row).
    readonly profiles: ReadonlyMap<Id, IdentityProfileFields>;
}
export async function membershipSearchJoinsOf(
    db: DbAdapter, organization: Id,
    roles: readonly string[],
): Promise<MembershipSearchJoins>;
export function membershipSearchFields(
    body: Record<string, unknown>,
    joins: MembershipSearchJoins,
): readonly string[];

// client/members-union.ts
export function queryMembershipEntities(
    ctx: RequestContext, text: string,
    state: 'accepted' | 'removed',
): Promise<HttpMessage<MembershipReadEntity>[]>;
```

Fields (audited from `MembershipFields`
`shared/types.ts:1432`, the join
`api/invitations-domain.ts:490-521`, `AIAgentEntity`,
`ServiceEntity`, `IdentityProfileFields`): membership
`id`, `identity_id`, `identity_kind`, `state`, `type`;
`invitee_name` and `invitee_email` when the join
served them (absent when erased); for a person, the
profile `title` and `department` when the caller holds
admin; for an AI, the agent's `name`, `description`,
`skill_focus`, `model`; for a service, its `name` and
`description`.

The handler is the route's own select
(`getOrganizationInvitations` with its `?state=`
judge), then `matchingCollection`.

- [ ] **Step 1: Write the failing tests** in
  `tests/api-memberships-query.test.ts`, seeded as
  `tests/api-memberships.test.ts` seeds (`basis()`):
  - `matches a human by a typo in the name`, `by
    email`, `by identity id`, `by role`; `matches an
    AI by description`; `matches a service by name`.
  - `ranks exact above typo`.
  - `an erased member's email does not match` — PII
    erased (DELETE head on `identities/:id/pii`): 204.
  - `a member cannot match a profile title; an
    admin can` — 204 for the member token, one part for
    the admin token.
  - `?state=removed searches former members`;
    `?state=bogus is 400`.
  - `nothing matches is 204`; `a bad body is 400`;
    `a foreign path is 403`.
  - `a part is the GET's joined part`.
  `tests/store-acceptance.ts`: `<name>: memberships
  QUERY matches by name`.
  `tests/adapters-members-union.test.ts`:
  `queryMembershipEntities` sends `?state=` and keeps
  answer order.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Regenerate** API docs; run `./test` —
  PASS.
- [ ] **Step 5: Commit** `Search memberships over QUERY`.

### Task 7: Organization-root QUERY

Agent: planner. Commandments: Security, Reliability,
Uniformity, Follow the RFCs (Content-Location, RFC 9110
§8.7). Risks: Internal Defense, Premature
Generalization (one new selection kind, not a
framework), Test Weakening.

**Files:**
- Create: `api/organization-search.ts`
- Modify: `api/head-reads.ts` (`mixed` kind),
  `api/routes.ts:5243-5249`
- Modify: `client/organizations.ts`
- Modify: `tests/store-acceptance.ts` (one case)
- Regenerate: `web-app/api-documentation/`
- Test: `tests/api-organization-query.test.ts` (create),
  `tests/head-reads-collections.test.ts`,
  `tests/adapters-organizations.test.ts`

**Interfaces:**
- Consumes: Tasks 2-6 (`memberNamesOf`,
  `membershipSearchJoinsOf`, `membershipSearchFields`).
- Produces:

```ts
// api/head-reads.ts — parts of several families, each
// with its own reader and lifecycle, in the given
// order. Each served part carries
// content-location: head.path + head.name (the
// relative form the API's Location lines use). A
// deleted head is dropped; no part is 204.
// HeadSelection gains:
//   | { readonly kind: 'mixed',
//       readonly parts: readonly MixedPart[] }
export interface MixedPart {
    readonly head: MessagePairEntity;
    readonly lifecycle: Lifecycle;
    readonly reader: Reader;
}

// client/organizations.ts — parts sorted by the
// content-location's family segment.
export interface OrganizationMatches {
    readonly ideas: readonly HttpMessage<IdeaEntity>[];
    readonly projects: readonly HttpMessage<ProjectEntity>[];
    readonly members:
        readonly HttpMessage<MembershipReadEntity>[];
}
export function queryOrganization(
    ctx: RequestContext, text: string,
): Promise<OrganizationMatches>;
```

The handler (`api/organization-search.ts`) selects
ideas and projects with each family's
`collectionSelect` (whole reader, lifecycle `state`)
and accepted person memberships with
`getOrganizationInvitations` (joined reader), ranks
each family alone, and answers `mixed` parts grouped
ideas, projects, members. Fields:

- idea: `id`, `title`, `state`; the submitter's member
  id from `ideas/:id/submissions/` and its name
  (`memberNamesOf`);
- project: `id`, `title`, `state`; each `flow_id` in
  `projects/:id/flows/`;
- member: `membershipSearchFields`.

Every member is searched, not six (spec, my call).
An unknown family in a part's content-location is a
client error thrown, never dropped.

- [ ] **Step 1: Write the failing tests** in
  `tests/api-organization-query.test.ts`:
  - `groups ideas, projects, members in that order` —
    one of each titled/named with a shared word; parts
    in that order; each part's `content-location`
    names its document.
  - `ranks within a family` — two ideas, exact before
    typo.
  - `matches an idea by its submitter's name`; `a
    project by a flow id it joins`.
  - `a deleted idea does not match, even by id`.
  - `an erased member's email does not match`.
  - `nothing matches is 204`; `a bad body is 400`;
    `a foreign path is 403`.
  `tests/head-reads-collections.test.ts`: a `mixed`
  selection with a joined-reader part and a whole part
  serves each through its own reader.
  `tests/store-acceptance.ts`: `<name>: organization
  QUERY groups by family`.
  `tests/adapters-organizations.test.ts`:
  `queryOrganization` sorts parts into the three lists
  in answer order.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Regenerate** API docs; run `./test` —
  PASS.
- [ ] **Step 5: Commit** `Search the organization over QUERY`.

### Task 8: The workbox search box

Agent: planner. Commandments: Reliability, Clarity,
Uniformity, the Office of the Interface (accessibility,
tab order). Risks: Default Values (`emptyCopy` is no
optional parameter), Internal Defense, Premature
Generalization (one page; no shared search widget),
Test Weakening.

**Files:**
- Modify: `web-app/workbox/index.html` (header, box)
- Modify: `web-app/workbox/index.ts`
- Modify: `web-app/app/presenters/workbox-inbox.ts`
- Modify: `web-app/app/workbox-inbox-drag.ts`
- Modify: `web-app/app/workbox-inbox-rows.ts`
- Modify: `web-app/app/styles/pages-workbox.css`,
  `web-app/app/styles/components-inputs.css`
- Test: `tests/workbox-inbox.test.ts`,
  `tests/presenter-workbox-inbox.test.ts`,
  `tests/browser/workbox-search.test.ts` (create)

**Interfaces:**
- Consumes: Task 5 `queryWorkOrders`.
- Produces:

```ts
// presenters/workbox-inbox.ts — buildInboxItems's
// membership rules, input order kept. buildInboxItems
// becomes partitionInboxItems + today's three sorts.
export function partitionInboxItems(
    workOrders: readonly WorkOrder[],
    activeClaimsByWo: ReadonlyMap<Id, ActiveClaim>,
    currentMemberId: Id,
): InboxLists;
export type InboxFilter =
    | { readonly kind: 'none' }
    | { readonly kind: 'matched'; readonly text: string };
// WorkboxInboxPresenter(items, kind, filter: InboxFilter)
// — no default; every caller passes it. A matched
// empty list reads: No work orders match “<text>”

// workbox-inbox-drag.ts
export type InboxOrder =
    | { readonly kind: 'dragged' }
    | {
        readonly kind: 'matched',
        // every position the caller holds claimed
        readonly claimedPositions: readonly number[],
    };
// classifyInboxDrop(source, dest, rightListKind,
//     order: InboxOrder['kind']): 'matched' makes
//     claimed→claimed 'none'.
// initInboxDrag options gain order: () => InboxOrder;
// a claim while 'matched' takes
// computeNewPosition(claimedPositions,
//     claimedPositions.length).

// workbox-inbox-rows.ts
export function queryInboxRows(
    ctx: RequestContext, text: string,
    memberMap: InboxRows['memberMap'],
): Promise<InboxRows>;
```

Page behavior (spec "The workbox page"):

- Header: `.page-header.workbox-header`, a three-column
  grid (`1fr auto 1fr`): title left, box centered,
  button right. The box is
  `<div class="search-wrapper search-wrapper-wide">`
  with `span.search-icon#workbox-search-icon`
  (`iconSearch`) and
  `<input id="workbox-search" type="search"
  class="input search-input" placeholder="Search work
  orders..." aria-label="Search work orders">`.
  `.search-wrapper-wide { max-width: 30rem; }` sits
  beside `.search-wrapper-md` in
  `components-inputs.css`. The grid lives in
  `pages-workbox.css`; under `(max-width: 767px)` the
  box takes its own full-width row below title and
  button. DOM order: title, box, button.
- `SEARCH_PAUSE_MS = 200` (page-local). Typing schedules
  one QUERY after the pause; every input event,
  including clearing, bumps a sequence number, and an
  answer whose number is not current is dropped.
- Empty box, Escape (which also empties the box), or
  deleting all the text: today's GET lists at once.
- Matched answer: `partitionInboxItems` (no sort) over
  `queryInboxRows`; `inboxRows` keeps the last full GET
  so claimed positions span the whole claimed order:
  `claimedPositions` is every position of the caller's
  live claims in the last GET rows and the answer.
- The pills switch the right list over the same answer;
  the text stays.
- After a drop while matched, re-run the QUERY.
- The bell re-runs the QUERY when the box has text,
  today's GET when empty.
- A failed QUERY paints `buildErrorState` into both
  lists with retry re-running the QUERY; never the
  unfiltered lists.
- Mobile: `MOBILE_MEDIA_QUERY = '(max-width: 767px)'`;
  on `matchMedia` match the claimed card moves before
  the available card in `#workbox-inbox`, and back on
  unmatch, so tab order follows the visual order.

- [ ] **Step 1: Write the failing tests.**
  `tests/workbox-inbox.test.ts`:
  `partitionInboxItems keeps input order` (three work
  orders, reversed time order, each lands in its list
  in input order); `buildInboxItems still sorts` (the
  existing rule tests stay unchanged and green).
  `classifyInboxDrop` while `matched`: claimed→claimed
  is `none`, available→claimed is `claim`,
  claimed→available is `release`.
  `tests/presenter-workbox-inbox.test.ts`: a matched
  empty available list renders
  `No work orders match “zz”`; the HTML has
  `id="workbox-search"` with
  `aria-label="Search work orders"`, inside
  `.search-wrapper-wide`, between the title and
  `#create-work-order-btn`.
  `tests/browser/workbox-search.test.ts`
  (`withAdminPage`, set `#workbox-search` value and
  dispatch `input`; terms taken from
  `api/mock-data/work-orders.ts`):
  - `the box narrows both lists` — every card in both
    lists matches the term; the count drops.
  - `Escape clears the filter` — today's card ids
    return in today's order.
  - `a stale answer does not repaint a cleared box` —
    type, then clear inside the pause; after
    `SEARCH_PAUSE_MS` and a settle, today's lists show.
  - `a drag between the lists still claims while
    filtered` — drag an available match onto claimed;
    the card is in claimed and the work order's claim
    is the admin's on a fresh GET.
  - `a drag within claimed does not reorder while
    filtered`.
  - `on a phone claimed comes first` —
    `setViewport(375, 800, true)`: in DOM order the
    claimed card precedes the available card.
- [ ] **Step 2: Run** the unit files and the browser
  file — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./test` and `./test browser` —
  PASS (including `workbox-transition.test.ts`).
- [ ] **Step 5: Commit** `Add the workbox search box`.

### Task 9: Members page over QUERY

Agent: planner. Commandments: Reliability, Security,
Uniformity. Risks: Test Weakening (rewrite only the two
named tests), Default Values, Internal Defense.

**Files:**
- Modify: `web-app/members/index.ts`
- Modify: `web-app/app/presenters/member.ts`
- Modify: `shared/types.ts` (retire the member classes'
  `matchesSearch` at `:738, :838, :886` and any other
  member-class one left with no caller; keep the rest)
- Test: `tests/presenter-members.test.ts`,
  `tests/browser/members-search.test.ts` (create)

**Interfaces:**
- Consumes: Task 6 `queryMembershipEntities`.
- Produces:

```ts
// presenters/member.ts
export type MemberSearch =
    | { readonly kind: 'none' }
    | {
        readonly kind: 'matched',
        readonly text: string,
        // identity ids in best-match order
        readonly identityIds: readonly Id[],
    };
// ManagedMembersState.search: MemberSearch
export function applyManagedMembersSearch(
    state: ManagedMembersState, search: MemberSearch,
): ManagedMembersState;
```

Behavior: `#member-search` input, after
`SEARCH_PAUSE_MS = 200`, sends
`queryMembershipEntities(ctx, text, membership)`;
stale answers drop by sequence number; empty text is
`{ kind: 'none' }` at once. While matched, every
section (You, Humans, AIs, Services) keeps only members
whose identity id is in `identityIds`, ordered by it;
the former list does the same; the kind chips still
filter on top. Switching the accepted/removed toggle
with text re-sends the QUERY with that state. A failed
QUERY toasts as the toggle's failure does and keeps the
last painted list. The row presenters' `matchesSearch`
retire.

Rewritten tests (the spec retires substring search):
`tests/presenter-members.test.ts:329-357` becomes
`a matched search filters and orders all three
sections`; `:467-493` becomes `a matched former list
shows only matched rows`.

- [ ] **Step 1: Write the failing tests** — the two
  rewrites above, plus `a matched search hides YOU when
  the caller is not matched` and `kind chips filter the
  matched answer`. Browser:
  `tests/browser/members-search.test.ts` — `the box
  narrows the roster` (a typo of a seeded name leaves
  that member's row and drops others) and `clearing
  restores the roster`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./test` and `./test browser` —
  PASS.
- [ ] **Step 5: Commit** `Filter members over QUERY`.

### Task 10: The top bar over QUERY

Agent: planner. Commandments: Reliability, Uniformity,
Clarity. Risks: Test Weakening (only retired assertions
go), Default Values.

**Files:**
- Modify: `web-app/app/command-palette.ts`
- Test: `tests/command-palette-search.test.ts`

**Interfaces:**
- Consumes: Task 2 `rankedBySearch`, Task 7
  `queryOrganization`.
- Produces:

```ts
// SearchItem loses `keywords`; pages keep theirs here.
export interface PageSearchEntry {
    readonly item: SearchItem;
    readonly keywords: string;
}
// ideaToSearchItem(idea: Idea) — no submitter needed
// once the server matches.
export function membershipToSearchItem(
    message: HttpMessage<MembershipReadEntity>,
): SearchItem; // title invitee_name, else
               // MEMBER_WITHOUT_PII_NAME
export function matchedSearchItems(
    matches: OrganizationMatches,
    pages: readonly PageSearchEntry[],
    query: string,
): SearchItem[]; // ideas, projects, members, pages;
                 // pages by rankedBySearch over
                 // [title, keywords]
```

Behavior: an empty query shows today's index (first
`PALETTE_DEFAULT_RESULT_COUNT`, from today's GETs). A
typed query, after `DEBOUNCE_MS`, sends
`queryOrganization`; a stale answer drops by sequence
number; a failure paints `mutateLoadError`. `searchItems`
retires.

Rewritten tests: `command-palette-search.test.ts:161-212`
and `:296-309` (substring `searchItems`) become
`matchedSearchItems` tests — groups in category order,
keeps answer order within each, ranks pages by the
matcher (`'wrkbox'` finds Workbox); the builder shape
tests (`:214-294`) drop only their `keywords`
assertions. `:129-158` (empty-query cap) stays, aimed
at the empty-query path.

- [ ] **Step 1: Write the failing tests** above.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `./test` — PASS.
- [ ] **Step 5: Commit** `Search the top bar over QUERY`.

### Task 11: TODO.md entries

Agent: coder. Commandment: Clarity.

**Files:** Modify `TODO.md` "Later work" (`:1249`).

- [ ] **Step 1:** Add the two entries the spec's
  "TODO.md" section words: top-bar search over every
  authorized entity through the organization-root
  QUERY; phone drag in the workbox (with its code
  citations, re-checked against the tree). Match the
  section's bullet style; 78-column prose is not
  linted but keep it.
- [ ] **Step 2: Run** `./test validate --syntax`.
- [ ] **Step 3: Commit** `Record search and phone drag work`.

### Task 12: API.md and the generated docs

Agent: coder. Commandments: Clarity, Uniformity.

**Files:** Modify `API.md` (a `## QUERY` section after
`## Wire contract`); confirm `web-app/api-documentation/`.

- [ ] **Step 1:** Write the section: RFC 10008, the
  body, 400/403/204, multipart format through the GET's
  reader, best-match order, the three routes, the
  organization root's family grouping and
  `content-location`, `?state=` on memberships, and the
  field lists of Tasks 5-7.
- [ ] **Step 2: Run** `./test api-docs` — PASS.
- [ ] **Step 3: Commit** `Document the QUERY routes`.

---

## Landing (controller)

1. Whole-branch review: architect, given the spec, this
   plan, and `git diff master...`. Fix rounds commit as
   `fixup!` of their task's commit.
2. Squash locally to one commit per task (Tasks 1-12),
   above the spec and plan commits, with
   `git rebase --autosquash master` driven by a
   non-interactive `GIT_SEQUENCE_EDITOR=:`.
3. `./test validate` (Layer 1), then
   `./test validate browser` (Layer 2), then
   `./test postgres` (needs Docker and 127.0.0.1:5432
   free). Report any gate that cannot run, with its
   output.
4. From `/Users/tmornini/code/fusion-angle`:
   `git merge --no-ff workbox-search` with subject
   `Search work orders, members, and the top bar` and a
   body that says why and what changed; then
   `git worktree remove .worktrees/workbox-search` and
   `git branch -d workbox-search`.
