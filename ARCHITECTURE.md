# Architecture

This file is the map of the process, the request vessel,
tenancy, derivation, and the conventions that bind them.
Storage shapes and alphabets live in `SCHEMA.md`.
Composition and the wire contract live in `API.md`. The
canvas lives in `FLOW-CANVAS.md`. The URI catalog lives at
`/api-documentation/`. This file does not restate them.

## One origin, one ZIP

Vanilla TypeScript. `./build` emits one artifact from one
source tree (clean tree required):
`fusion-angle-server-${SHA}.zip`. Node serves composed
pages and the API on one origin. The process is
`server/boot.ts` / `server.mjs`. The client is a fetch
facade (`web-app/app/server-core.ts`). Postgres is the
store. The page talks `fetch`.

Required env, never logged and never defaulted:
`POSTGRES_URL`, `JWT_HMAC_SIGNING_KEY`,
`HTTP_SERVER_PORT`. Optional `TRUSTED_PROXY_HOPS`. Body
over 1 MiB is 413 (`server/http-server.ts`
`REQUEST_BODY_MAX_BYTES`). The server neither seeds nor
applies DDL and takes no argv (`server.mjs` takes no
arguments; seed with `./postgres-seed`). Missing
`schema_marker` refuses with `schema_marker absent; seed
with ./postgres-seed`. One mint process — do not run two
replicas.

postgres.js 3.4.9 is bundled behind
`api/postgres-client.ts` only (named exception).
localStorage holds UI preferences only — theme, sidebar,
log level, active organization id — never data.

## Layers

Four directories. `api/` is the server REST and schema
handlers (Node over Postgres on the product path; memory
in `./test`). `shared/` is the one-way chasm: the HTTP
wire schema (`http-message/`, with its own `types.ts`)
plus pure utilities (`base64url.ts`, `identifier.ts`,
`secret.ts`, `digest.ts`, `password-hash.ts`,
`ledger-reduction.ts`, `error-helpers.ts`). Both `api/`
and `web-app/` import `shared/`; `shared/` never imports
`api/`. `web-app/` is the pages, adapters, presenters, and
CSS. `server/` is boot, HTTP, seed, wipe, and throttle.

`web-app/app/server-core.ts` is the product composition
root: it installs the fetch facade and calls `bootApp()`.
`web-app/app/adapters/init.ts` is the test composition
root (`initAdapter()` / `getDbAdapter()` over memory).
`routes[]` (`api/routes.ts`) is the HTTP surface; if a URI
is not on the table, it does not exist. Browse it at
`/api-documentation/`.

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
organization is a live seat, else PRIMARY (earliest
remaining join `at`, identifier order on tie), else 403 —
there is no global default.

Roles are claims (`admin:O` / `member:O` baked from seat
`type` at mint). The gate projects them for the fenced org
via `projectClaimRolesForOrganization`. NAMED COVENANT:
de-membership, demotion, and logout-everywhere bite at the
next mint/refresh/exchange or access-token expiry
(`ACCESS_TTL_SECONDS`, 15 min in `api/authentication.ts`),
not on the very next request.

`writeAuthorizerFor` (`api/write-authorizer.ts`) 403s a
foreign-id PUT/DELETE/PATCH before genesis in the caller's
namespace. Read isolation: foreign 403, absent 404. Path
`:organization-id` on an org-nested route must equal the
claim org else 403.

## Identity, seats, invitations

`organizations` is the tenant root. A seat at
`organizations/:id/members/:identity-id` is the
identity↔org relationship, carrying `type` `"admin"` |
`"member"`. The members roster is seats plus `/ai-agents`
(not members, not identities). The system member is the
constant `SYSTEM_MEMBER_ID` (`api/types.ts`), not a seat.

Invitation alphabet: pending, accepted, declined, revoked.
Invitations are not org-fenced: the invitee must read an
invitation to an org it is not yet in. Grant (admin)
appends pending. Accept (invitee) appends accepted and
writes the seat in the same transaction, stamped with the
invitation's org — not the caller's active org. Decline
and revoke append their terminal states.

Two HTTP nests over one prefix: receive at
`/identities/:id/invitations/` and send at
`/organizations/:id/invitations/`.

## Derivation

Every family is a fold over pairs at an address —
`api/derive-*.ts`. The view-accepting convention is five
rules, not a framework:

(a) every core takes `dbOrView: DbAdapter`, so it is
callable both pre-tx (passed `db`) and from within an
already-open write-gate transaction (passed `view`);
(b) a core never opens its own nested transaction;
(c) a core reads only the stores its caller listed in
`transaction(...)`;
(d) write-gate reads are entity-scoped (`getAllAtAddress`,
`getAllWhere`), never a whole-plane `getAll()` of
`message_pairs` on a hot path;
(e) a pre-tx call and an in-tx call of the same core
return byte-identical results.

The one named whole-plane scan is
`deriveStateFieldValueReferrers` in
`api/derive-state-field-values.ts` (SFV RESTRICT): no
`attribute_id` index exists, so the gate scans.

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
ACL), instance (data row, full-state `{ values }`). A
flow binds to one record type via `flows/:id/records`.

Six attribute types: `text`, `number`, `select`, `radio`,
`date`, `checkbox`. Three constraint kinds: `regex`,
`range_min`, `range_max`. Applicability has two
enforcement sites: `assertConstraintAppliesTo`
(`api/types.ts`) at the writer, and the editor filtering
the kind picker.

The work-order transition gate is
`validateRecordTransition`
(`adapters/record-transitions.ts`): current-node fields
only; aggregated `ConstraintViolation[]`. Attribute DELETE
RESTRICT blocks on live instance heads carrying a value
for that attribute, and on in-flight graph refs.

Public instance PUT is 405. PATCH creates and updates
(If-Match 428 / 412). DELETE is a tombstone.

## Work orders

Claim alphabet (`api/work-order-claims.ts`): `claimed` /
`claim_released` / `claim_expired`.

The workbox shows every active and archived work order
to every user; there is no per-user visibility filter.
`buildInboxItems` in `presenters/workbox-inbox.ts` runs
the active/archive split, the claimed-and-unfinished
exclusion, and the sort — nothing more.

`getWorkOrderActiveClaim(ctx, workOrderId, lockTimeout)`
returns `null` for a `'claimed'` event older than
`lockTimeout` seconds even when no `'claim_expired'` /
`'claim_released'` event has yet superseded it.
`putWorkOrderClaim` materializes that implicit expiration
as an explicit `'claim_expired'` event when a new claim
notices a stale prior.

## Conventions

Every `PAGE_REGISTRY` page module exports `init()`.
Presenters take data and return `SafeHtml`; they never
touch the DOM, never fetch, never mutate. Editable views
split a read presenter from an `*Edit` presenter; the
page owns a `PageState` discriminated union
(`{kind: 'reading'} | {kind: 'editing', draft}`) and
constructs the appropriate one per render.

Page modules never call transport verbs from `api/api.ts`
— data access goes through `adapters/`. Pages may import
error and status symbols.

Naming: `mutate*` updates existing DOM; `toneFor*` /
`levelFor*` return `data-tone` / `data-level` values;
`assert*` validators at the gate return a typed value or
throw; raw stored-shape reads carry the Entity suffix
(`getProjectEntity`).

Adapters take `ctx: RequestContext` first. Mutations
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

## Later work

- READY gate rejects dangling attribute
  refs and unbind prunes them —
  `tests/adapters-flow-publish.test.ts`
- One client 401-recovery voice through
  `redirectToLogin()` with `?return=` —
  `tests/adapters-http-facade.test.ts`
- Toast pause on hover and focus
- Physical PII erasure — closes KNOWN
  seam: Erased PII persists as superseded
  pairs
- Mock seed's fixed 2026-06-15 anchor —
  after 2026-09-13 serial-mode FS3
  carries in-flight heat only
- Work-order locked verbs not executed —
  `tests/family-registry.test.ts`
- Token-at-rest hashing — closes KNOWN seam:
  A raw dump still has verbatim auth messages
- Two-role views — `tests/backend-postgres.test.ts`
- `putRecordInstance` still PATCHes (name lie) —
  `tests/adapters-record-instances.test.ts`,
  `tests/api-instances-create.test.ts`
- Same-body PATCH still appends 201 —
  `tests/api-instances-create.test.ts`
- Roster seat that names an AI agent —
  `tests/family-registry.test.ts`

## Do not resurrect

- `states` table and the event-append address —
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
  `tests/api-members-history.test.ts`,
  `tests/api-work-order-history.test.ts`
- redo — `tests/api-flows-verb-gaps.test.ts`

## How we got here

The store was a row plane, then dual-write, then the pair
plane. Org-scoped decorator stores gave way to claim
projection plus the write authorizer. Six deploy blockers
were disposed.
