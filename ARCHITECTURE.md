# Architecture

This file is the map of the process, the request vessel,
tenancy, derivation, and the conventions that bind them.
Storage shapes and alphabets live in `SCHEMA.md`.
Composition and the wire contract live in `API.md`. The
canvas lives in `FLOW-CANVAS.md`. The URI catalog lives at
`/api-documentation/`. This file does not restate them.

## One origin, one ZIP

Vanilla TypeScript. `./bin/build` emits one
artifact from one source tree (clean tree
required): `fusion-angle-${SHA}.zip`. The
`fusion-angle` executable serves composed
pages and the API on one origin via
`Deno.serve`. Drain is `shutdown()` +
`finished` with the `drainMs` abort. Static
files stream from `Deno.open`, which reads
the compiled file system. The site and
postgres.js 3.4.9 are embedded at compile
time; the permission covenant (`--allow-net`
and a scoped `--allow-env`, no
`--allow-read`) is baked in then too. The
process is `server/boot.ts` behind
`fusion-angle serve`. The client is a fetch
facade (`web-app/app/server-core.ts`).
Postgres is the store. The page talks
`fetch`.

Required env, never logged and never
defaulted: `POSTGRES_URL`,
`JWT_HMAC_SIGNING_KEY`, `PORT`. Optional
`TRUSTED_PROXY_HOPS`. Body over 1 MiB is 413
(`server/http-server.ts`
`REQUEST_BODY_MAX_BYTES`). `serve` neither
seeds nor applies DDL and takes no further
argv; `seed` and `wipe` are the other two
verbs of the same binary (wrappers:
`bin/postgres-seed`, `bin/postgres-wipe`).
Wipe is `DROP SCHEMA public CASCADE`,
recreate `public`, re-grant. Missing
`schema_marker` refuses with `schema_marker
absent; seed with ./bin/postgres-seed`. One
mint process — do not run two replicas.

`./deploy` is the operator path. Compose
keeps `:?required`; `./deploy` mints before
compose. The Dockerfile `CMD` is
`cd render-out && exec ./fusion-angle serve`
with no env copy.

postgres.js 3.4.9 is embedded behind
`api/postgres-client.ts` only (named exception).
localStorage holds UI preferences only — theme, sidebar,
log level, active organization id — never data.

Measured (do not round away): retired Node start-up
0.065s, 674741 bytes; host `fusion-angle` median
0.186s, 73441154 bytes. The Linux binary is 110767200
bytes; the image is 419MB virtual; a cold
`docker compose build` is ~13s. Example ZIP on Desktop:
`fusion-angle-348710d.zip`, 36722188 bytes. A static
asset's logged `latencyMs` also narrowed: the body is a
stream now, so it measures to response construction and
excludes the transfer the awaited Node pipeline included.

Render builds from the Dockerfile. The compose-stack
spec's "no Render config change" is retired. The one
web service switched runtime in place — Render's
runtime is editable after creation, by
`PATCH /v1/services/{id}` with `serviceDetails.runtime`
— so no service was created and no domain moved. The
first Docker deploy measured 24.717982 s from the
deploy's `createdAt` to its `finishedAt`, the
build-artifact spec's "measured at the first deploy"
risk, closed. The Docker build runs no tests and sees
no env vars (the Dockerfile declares no `ARG`), unlike
the retired native build, whose `./validate` step saw
the build-time `POSTGRES_URL`.

## Layers

Five directories. `api/` is the server REST and schema
handlers (Deno over Postgres on the product path; memory
in `./test`). `shared/` is the one-way chasm: the wire
contract — domain types, status codes and error classes,
the bell's wire, claim and token-chain derivation,
record constraints, JSON assertions, graph bodies, and
the two id header names — plus the HTTP message schema
(`http-message/`, with its own `types.ts`) and pure
utilities. `client/` is the API client: the transport,
the request context, the session, the bell, and the
per-noun verbs; it imports only itself and `shared/`,
and `tests/client-import-graph.test.ts` walks
`client/index.ts` to prove it. `api/`, `client/`, and
`web-app/` import `shared/`; `shared/` never imports
`api/`. `web-app/` is the pages, presenters, browser
adapters, app logic, and CSS. `server/` is boot, HTTP,
seed, wipe, and throttle.

`web-app/app/server-core.ts` is the product composition
root: it builds the app's one client over the fetch
transport (`createAppClient`, `web-app/app/client.ts`),
puts it, and calls `bootApp()`. `web-app/app/root-redirect.ts`
builds one for the apex probe. `tests/client-init.ts` is
the test composition root (`initAdapter()` /
`getDbAdapter()` over memory, behind
`tests/in-page-facade.ts`). `routes[]` (`api/routes.ts`)
is the HTTP surface; if a URI is not on the table, it
does not exist. Browse it at `/api-documentation/`.

## The request vessel

One context enters at the gate and rides the pipeline
(`api/request-context.ts`). `handleRequest` mints
`IncomingContext`; authentication enriches it to
`AuthenticatedContext`; `fenceRequest`
(`api/request-auth.ts`) completes `RequestContext`. Each
field is set exactly once, at the step that resolves it.

Incoming: `requestId`, `method`, `pathname`, `base`,
`requestAt`. Authenticated adds `principal`. Request adds
`organization`, `memberOrganizations`, `roles`. Handlers
receive `ctx.base` — there is no org-scoped adapter.

The vessel never carries the bearer token:
authentication reads the header from the raw Request, so
the vessel stays loggable. Route handlers stay
transport-free: the route table is the boundary where the
vessel hands `ctx.base` plus fenced claim projection into
handler arities.

## Tenancy

The org rides the VERIFIED token claim, never the path.
A flat (un-exchanged) token has none and resolves via
`identityDefaultOrganization`: the identity's SET default
organization (message-plane
`/identities/:id/default-organization` document) if that
organization is an accepted membership, else PRIMARY
(earliest remaining join `at`, organization id on tie),
else 403 — there is no global default.

Roles are claims (`admin:O` / `member:O` baked from the
accepted membership's `type` at mint). The gate projects
them for the fenced org
via `projectClaimRolesForOrganization`. NAMED COVENANT:
de-membership, demotion, and logout-everywhere bite at the
next mint/refresh/exchange or access-token expiry
(`ACCESS_TTL_SECONDS`, 15 min in `api/authentication.ts`),
not on the very next request.

`writeAuthorizerFor` (`api/write-authorizer.ts`) 403s a
foreign-id PUT/DELETE/PATCH before genesis in the caller's
namespace. Read isolation: foreign 403, absent 404. Path
`:organization-id` on an org-nested route must equal the
claim org else 403. A membership name's organization
half must equal the path's (403). Its identity half
must equal the path's (404).

## Identity and memberships

`organizations` is the tenant root. A membership is
the document: one row at `/invitations/`, named
`<organization-id>:<identity-id>`, `type` `admin` or
`member`. Five states: `pending`, `accepted`,
`declined`, `revoked`, `removed`. There is no seat
document and no `former-members/` route. `accepted`
grants the role. The members roster is accepted
memberships plus `/ai-agents` (not a members
collection, not identities). Two views over that
prefix, and `?state=` selects. A member reads
`accepted` and `removed`; a member's other
organization view is 403. Removal is a PUT to
`removed`. The last accepted admin refuses (409), and
a removed member's access ends at the next mint,
refresh, or expiry per the named covenant. The system
member is the constant `SYSTEM_MEMBER_ID`
(`shared/types.ts`), not a membership. A removed
membership stays a PUT head in state `removed`, and
the name resolver paints it "Former member" — an
author who left is not an unknown id.

Grant (admin) lands `pending`. Accept (invitee) lands
`accepted` on that same document. It does not write a
seat. Decline and revoke land their states on it.
The invitee reads a membership of an organization it
is not yet in, on the identity view.

Receive at `identities/:id/invitations/` and send at
`organizations/:id/invitations/` are the two views,
not two documents.

## Derivation

A document's head is its latest PUT or DELETE pair, and
a head is its document's whole state. After any write
but a DELETE, the head of each document the write
changed is a PUT whose response body is that document's
whole state. The store sorts JSON keys on write
(`sortJsonKeys`, `shared/http-message/canonical.ts`), so
a stored body's keys are in sorted order. Every family
derives from those stored responses — `api/derive-*.ts`
— through one parser, `bodyOf`
(`api/derive-documents.ts`). A read serves them: a GET
selects heads (`api/head-reads.ts`), and the gate serves
each head's stored response through `servedResponse`
(`api/served-response.ts`), whose `projectedBody` is the
only body transform. A collection joins those responses
as `multipart/mixed`, and on Postgres its heads come from
a skip walk of the document index
(`selectCollectionHeadPairs`,
`api/backend-postgres.ts`). A version is a stored PUT
pair. `versions/:etag` serves that pair through
`servedResponse`. `versions/` joins every PUT as
`multipart/mixed`, oldest first
(`selectVersionAt`, `selectVersionsAt`,
`api/head-reads.ts`). A DELETE pair is not a version.
A deleted document — a DELETE head, or a body state
`deleted` in a lifecycle family — is 410 on its GET
and on both version routes. Nothing
derives from the `request` column;
`tests/request-readers.test.ts` pins that. The
view-accepting convention is five rules, not a
framework:

(a) every core takes `dbOrView: DbAdapter`, so it is
callable both pre-tx (passed `db`) and from within an
already-open write-gate transaction (passed `view`);
(b) a core never opens its own nested transaction;
(c) a core reads the one table through the view its
caller handed in `transaction(fn)`;
(d) write-gate reads are entity-scoped (`getDocumentHistory`,
`getCollectionPairs`), never a whole-plane `getAll()` of
`message_pairs` on a hot path;
(e) a pre-tx call and an in-tx call of the same core
return byte-identical results.

## A response is one unit

The API, the client, and the application treat a response — status line,
headers, and body — as one unit. A stored response is a response message: for
a received request, the message handed to the wire; for a sibling PUT, which
received nothing and sent nothing, the message a read of it serves before the
substitutions below. A read serves those stored bytes with exactly three
substitutions — the status line, `date`, and `request-id`, the lines that
describe this transmission — and three additions from the pair's envelope —
`last-modified` and `response-at` from `response_at`, and
`requester-identity-id` from `requester_identity_id`, the lines that describe
the write — made by ONE function on the pair it serves; `etag` and
`operation-id` stay, naming the state and the write that made it; the body
bytes are never touched, except that a document whose fields carry read roles
is projected to the fields the reader may see, by that same function, the only
place a body is ever transformed. A list is whole responses: `multipart/mixed`
of `application/http; msgtype=response` parts, each the unit a document GET
serves. Nothing parts a response into a body plus picked headers. The client
keeps each response whole, and pages and presenters read from the unit they
were given. The application derives from `response` only, never from
`request`.

The one read function is `servedResponse`
(`api/served-response.ts:74`); the client's splitter is
`splitParts` (`shared/http-message/multipart.ts:90`),
which the collection GET calls (`client/http-facade.ts:390`).

## Flow graph

Graph truth rides the flow document pair body as native
nested JSON: the head `graph` object plus write-side
sidecars `graphDelta` and `revivals`. Live GET serves
`FlowWithGraph` from the body's `graph` field. A work
order freezes its own `flow_graph` inside the work-order
document at creation — a frozen value, not a live
relationship.

The route is the single divorce point.
`GET organizations/:id/flows/:id` (and the list)
reassembles `FlowWithGraph` from the message plane.
Freeze, stats, and export read through `ctx.GET`. Undo
resolves its restore target server-side (stack+pointer
over this flow's document-pair history vs its undo
operation-pair history) and lands a restore pair with
server-computed `graphDelta` / `revivals`.

## Records

Three nouns: record type (schema: name, description,
ordered attributes, constraints), attribute (field plus
ACL), instance (data row). A flow binds to one record
type via `flows/:id/records`.

Six attribute types: `text`, `number`, `select`, `radio`,
`date`, `checkbox`. Three constraint kinds: `regex`,
`range_min`, `range_max`. Applicability has two
enforcement sites: `assertConstraintAppliesTo`
(`shared/types.ts`) at the writer, and the editor
filtering the kind picker.

The work-order transition gate is
`validateRecordTransition`
(`client/record-transitions.ts`): current-node fields
only; aggregated `ConstraintViolation[]`. Attribute DELETE
RESTRICT blocks on live instance heads carrying a value
for that attribute, and on in-flight graph refs.

An instance revision is a PUT whose body is the
instance's whole state: `{ id, organization_id,
record_type_id, values }`, every value included. Public
instance PUT is 405; PATCH does both writes. A create
is a PATCH of an id the client minted, sent with
`If-None-Match: *`: the client declares the instance
new. Its row carries the never-written latch, which is
stale over any head, so a create answers 412 over a
live instance and 410 over a retired one. An update is
a PATCH with `If-Match` naming the head the client
read; the handler merges `set` and `clear` onto that
head, and the statement judges the tag (412 when
stale). A PATCH with neither header is 428. Either
answer is the merged state, projected to the values
the requester may read.

DELETE is a tombstone, and a tombstone is final. A
retired instance answers 410 Gone on its GET, its
PATCH, and a create; its id is never reused (RFC 9110
§15.5.11). An id never written answers 404.

## Work orders

A work order is one document with one head. Its
version carries, in the order `ordered` forms it
(`api/work-order-version.ts`; the store then sorts
keys on write): `id`,
`organization_id`, `display_id`, `flow_graph`,
`position`, then `state` (the current node), the
binding as `instance_id` and `record_type_id`, `claim`
as `{ member_id, at, expires_at }`, and `events`.
`state`, the binding, and `claim` are absent keys when
unset, never null. `events` holds only the lifecycle
events that led from the previous version to this one,
each `{ id, state, member_id, at, field_values }`.

Five operations each land one version through the
former, answering the work order's state:

- **Create** (`POST work-orders/`): a genesis version
  whose `events` are three births — the start node,
  the post-start node, and the creator's claim —
  beside the flow's join document.
- **Claim** (`PUT …/claim`): `claim` becomes the
  requester. A lapsed prior claim is recorded first as
  `claim_expired`, authored by its holder. A live claim
  by another member is 409.
- **Release** (`DELETE …/claim`): `claim` goes and
  `claim_released` is recorded. With no live claim
  nothing lands.
- **Transition** (`POST …/transition`): `state` moves
  to the target node; the event carries its
  `field_values`, and `claim_released` rides it when
  the body releases. A value-bearing transition also
  lands the bound instance's revision.
- **Binding** (`PUT …/binding`): sets the two binding
  keys, with no event. A rebind to another instance is
  409.

The four after the create are in order: `If-Match`
names the work order's head, and a value-bearing
transition names the instance's head too, one
entity-tag each. The document PUT (If-Match or
If-None-Match: *) sets `display_id`, `flow_graph`,
and `position` over the head's other keys and records
no event; a reorder (`putWorkOrderPosition`) reads the
head and latches it.

History is the version chain: every version's
`events`, newest first (`historyOf`).

Claim alphabet (`shared/work-order-claims.ts`):
`claimed` / `claim_released` / `claim_expired`.

The server judges a claim by one clock: a claim is live
until its `expires_at`, against the request's stamp
(`isClaimLive`). The client mints the claim's event ids
and stamps (`putWorkOrderClaim`); the server decides
whether a prior claim lapsed. The workbox pages read a
claim's liveness from history against the graph's lock
timeout (`activeClaimFromHistory`).

The workbox shows every active and archived work order
to every user; there is no per-user visibility filter.
`buildInboxItems` in `presenters/workbox-inbox.ts` runs
the active/archive split, the claimed-and-unfinished
exclusion, and the sort — nothing more.

## Conventions

Every `PAGE_REGISTRY` page module exports `init()`.
Presenters take data and return `SafeHtml`; they never
touch the DOM, never fetch, never mutate. Editable views
split a read presenter from an `*Edit` presenter; the
page owns a `PageState` discriminated union
(`{kind: 'reading'} | {kind: 'editing', draft}`) and
constructs the appropriate one per render.

Page modules never call transport verbs from `api/api.ts`
— data access goes through `client/`. Pages may import
error and status symbols.

Naming: `mutate*` updates existing DOM; `toneFor*` /
`levelFor*` return `data-tone` / `data-level` values;
`assert*` validators at the gate return a typed value or
throw; raw stored-shape reads carry the Entity suffix
(`getProjectEntity`).

Client verbs take `ctx: RequestContext` first. Mutations
return `Promise<void>` by default; change-awareness flows
through notification channels. Named non-void exceptions:
`putRecordInstance` / `patchRecordInstance` → `{ etag }`;
`postInvitationGrant` → `InvitationGrantOutcome`;
`postMockDataLoad` / `postBootstrap` →
`SeededCredentials`; `postSessionRefresh` /
`postPasswordLogin` → `SessionCredentials`;
`postOrganizationSessionExchange` → `string`;
`postFlowFromBackup` → `string`; `postFlowFromMermaid` /
`postFlowFromZip` → `{ flowId, warnings }`.

## KNOWN seams

- Stale-until-navigation (no LISTEN) —
  `tests/advisory-lock.test.ts`
- XSS can use the refresh cookie from the page —
  `tests/api-authentication-token.test.ts`
- A raw dump still has verbatim auth messages —
  `tests/api-shadow-ledger-auth.test.ts`
- Single mint process — `server/boot.ts`
  (one process, not enforced)
- Throttle is a global cap if `TRUSTED_PROXY_HOPS`
  is wrong; refresh/exchange unlimited —
  `tests/http-throttle.test.ts`
- Erased PII persists as superseded pairs;
  derived reads and login show none —
  `tests/api-pii-tombstone.test.ts`

[AUDIT.md](AUDIT.md) re-confirms each seam is still
KNOWN.

## Do not resurrect

- `states` table and the event-append path —
  pinned by comments in
  `tests/api-entity-history-routes.test.ts`
- flat `/records` and `/record-attributes` —
  `tests/api-records-verb-gaps.test.ts`
- `flows/:id/versions` writes —
  `tests/api-flows-versions-retired.test.ts`
- flat member POSTs —
  `tests/api-human-members.test.ts`
- org-scoped decorator stores —
  `tests/api-write-authorizer.test.ts`
- token / identity_providers HTTP —
  `tests/api-identity-spine-verb-gaps.test.ts`
- role grants —
  `tests/api-identity-spine-verb-gaps.test.ts`
- bulk history routes —
  `tests/api-objective-history.test.ts`,
  `tests/api-entity-history-routes.test.ts`,
  `tests/api-work-order-history.test.ts`
- flat `GET /members/:id/versions` —
  `tests/api-members-history.test.ts` (404; membership
  versions are the invitation document's PUT pairs)
- redo — `tests/api-flows-verb-gaps.test.ts`
- a work order's `/history` —
  `tests/api-work-order-history.test.ts` ('a work order's
  /history is a router 404'; history is `versions/`)

## How we got here

The store was a row plane, then dual-write, then the pair
plane. Org-scoped decorator stores gave way to claim
projection plus the write authorizer. Six deploy blockers
were disposed.
