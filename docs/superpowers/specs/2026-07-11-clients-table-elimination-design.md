# Clients-Table Elimination — Design

Date: 2026-07-11
Status: approved (brainstorm 2026-07-11; all user gates passed)
Branch context: remediation/audit-findings

## Context

`clients` is the last entity table. `TABLE_NAMES` is three:
`clients`, `requests`, `responses` — and the latter two ARE the
message plane. Eliminating `clients` collapses the schema to the
pure pair plane: every noun in the system becomes a derivation.
It also retires SCHEMA.md's last named immutability deviation —
`clients.status`, "the schema's one mutable lifecycle column on
a survivor row."

The target shape was pre-committed in three docs (SCHEMA.md
§ clients, ARCHITECTURE.md, API-TREE.md line 63's Follow-on):
client = kind-`'service'` identity + registration facet, retiring
the standalone clients noun; sub vs acting client moves to token
claims.

User decisions (brainstorm gates):

1. Scope & tier: FULL registration phase now (demo tier) —
   routes to register, rotate JWKS, disable; not read-path-only.
2. Authz: admin realm, global — clients stay global platform
   config; registration writes are admin-only.
3. Shape: (a) identity + registration facet (over a standalone
   pair-plane /clients family, and over an /authentication
   registration posture, which breaks the tree's verb-realm
   convention and was dismissed).
4. Riders: BOTH in scope — act.sub claim wiring on the
   authorization_code grant, and a registration UI on the
   identities surface.

Load-bearing recon facts (workflow wf_6ddc0bd5-d91, spot-checked
against source):

- Zero production writers: no route, adapter, or seed path ever
  inserts a `clients` row; only 14 test files touch it. The
  mock-data fingerprint pins clients at count 0.
- One production read: `grantClientCredentials`
  (api/authentication.ts:825-826) via
  `rawReadRow<ClientEntity>('clients', clientId)`. All five
  non-id columns serve this one grant; `verifyClientAssertion`
  is a pure function of `(assertion, client, now)`.
- Chicken-and-egg pre-solved: `/authentication/token` is
  bearer-exempt and already runs pair-plane derives pre-token
  (`authorizePassword`, `nameFor` → `deriveIdentityPii`,
  `tokenRevocationReason`, `subjectOrganizations`).
- kind-`'service'` identities already ship:
  `POST /identities {kind:'service', credential:{...}}`
  atomically appends the identity document plus a
  `client_secret`-kind credential document
  (api/routes.ts:3349-3413).
- Admin gating is free: api/authorization.ts is deny-by-default
  with `admin` allowed on every verb at the root prefix; a route
  with no member-tier entry is admin-only automatically.
- `AccessTokenClaims` already carries optional `act: {sub}`
  (RFC 8693), populated by `grantTokenExchange`, left undefined
  by `grantAuthorizationCode` — the recorded gap.

## Design

### 1. Data model — the registration facet

New singleton document address: `identities/:id/registration`
(nested pattern (a) — the `/pii` posture minus the hard-delete
zone). Registered in `DOCUMENT_CLASS_ROUTE_PATTERNS` and
`PAIR_WIRED_ROUTE_PATTERNS` (api/message-pair.ts).

Body (snake_case storage, the five ClientEntity columns
unchanged):

    { grant_types, redirect_uris, jwks, aud, status }

- `grant_types` / `redirect_uris`: space-delimited (OAuth
  convention, unchanged).
- `jwks`: the client's JSON Web Key Set, JSON string.
- `aud`: audience the client's assertions must claim.
- `status`: `'active' | 'disabled'`.

Semantics: PUT-overwrite ("current registration, replace
whole") via the Supersedes-chain document machinery. Register,
rotate-JWKS, and disable are all the same PUT; every revision is
an appended pair — registration history for free. DELETE is a
marked tombstone = deregistration; the derive treats a
tombstoned facet as absent.

Gate (validators at the gate, never downstream):

- Identity absent → 404.
- Identity kind is not `'service'` → 400.
- Body validator: `validateClientEntity` re-shaped into the
  registration body validator (CLIENT_BODY_KEYS re-pointed).

`ClientEntity` the storage row type retires; the domain shape
that `verifyClientAssertion` consumes (`{id, jwks, aud,
status}`) is storage-agnostic and re-points to the derived
registration document + identity id.

### 2. Token-mint re-point

New derive `deriveClientRegistration(adapter, identityId)` joins
the identity spine (api/derive-identity-spine.ts, beside
pii/credentials/role-grants/providers/token-revocations).

`grantClientCredentials` swaps its single `rawReadRow` for the
derive:

- absent or tombstoned facet → 401 `unknown client` (same wire
  behavior as today's null row);
- `status !== 'active'` → 401 `client is disabled`;
- `grant_types` membership check → 400 (unchanged);
- `verifyClientAssertion` unchanged (pure function);
- `nameFor` unchanged (PII probe with id fallback).

### 3. act.sub wiring

`grantAuthorizationCode` mints with `act: {sub:
issuer.clientId}` — the acting client, now an identity id in the
same space `act` already expects — mirroring
`grantTokenExchange`'s existing `act: {sub: actor}` usage.
`sub` stays the user (`issuer.identityId`).

### 4. Routes and authz

`PUT|GET|DELETE /identities/:id/registration` via the generic
document handlers with identities wiring. NO member-tier authz
entry — the route falls to the root admin tier by the existing
deny-by-default policy: admin-only reads and writes, zero new
authz machinery. Global plane (identities are global; no org
nesting; no write authorizer involvement).

### 5. Registration UI

Identities detail page, kind-`'service'` identities only (the
page already branches on `identity.isService()` and loads a
ServiceFacet + credential state):

- A "Client registration" card beside the existing service
  cards: status tone (data-tone variant pattern), grant types,
  redirect URIs, audience, JWKS summary.
- One native `<dialog>` (`data-dialog-open` /
  `handleDialogClick` pattern) with the registration form,
  serving register / edit / rotate-JWKS; disable/enable is a
  status control in the same dialog.
- Adapter: `getClientRegistration` / `putClientRegistration`
  (RequestContext first argument, HTTP-verb naming) in
  web-app/app/adapters/.
- Presenter: extend IdentityDetailPresenter's view model;
  SafeHtml output.
- CSS: existing card/dialog/form components; little to no new
  CSS. No raw hex; hsl(var(--token)) only if any is needed.

### 6. Table deletion mechanics

- `TABLE_NAMES` 3→2 (api/db.ts) — requests + responses only.
- `DbStores` drops the `clients` member; db-backed.ts drops the
  `new HistoryEntityStore('clients', ...)` wiring and imports.
  `HistoryEntityStore` itself survives (requests/responses).
- `SNAPSHOT_SCHEMA_VERSION` 4→5; a v4 export is rejected by a
  v5 import (the established asymmetric gate).
- snapshot-validator.ts drops its `case 'clients'` arm; survivor
  keys shrink to requests+responses.
- `RETIRED_TABLES` in web-app/app/adapters/snapshots.ts gains
  `'clients'`.
- `rawReadRow` RETIRES entirely — its only production caller is
  gone; the doc comment's "residual probes" have no live
  exercisers (Simplicity). Its interface entry and both backend
  implementations go with it (the cast site is already gone
  after step 2). The rawReadRow section of
  pin-invitation-client-rehome-parity.test.ts retires with its
  subject; the file's invitation-rehome pins survive untouched.
- generate-schema-svg re-run regenerates SCHEMA.svg (fully
  mechanical; no clients-specific hardcoding).
- Orphan-store posture: leave-inert, matching the gate-6
  canonical residual statement (pre-elimination origins keep the
  dropped object store as an unread orphan until deleteSchema or
  reseed).
- Mock-data pair counts (1506 / bootstrap 13) UNAFFECTED —
  clients seeds zero rows and zero pairs today.

### 7. Tests

Re-pointing:

- Grant-specific fixtures (api-authentication-token,
  api-shadow-ledger-auth, api-shadow-ledger-tokens):
  `db.clients.put(...)` → forming registration-facet pairs (and
  the identity document where the fixture needs one).
  pin-invitation-client-rehome-parity's rawReadRow section
  retires with its subject (see § Table deletion mechanics).
- Generic-plumbing files (db-transaction-view,
  backend-unique-constraint, db-localstorage-compression,
  snapshot-import-validation, snapshot-wipe-on-fail,
  adapters-snapshots, snapshot-import-identity-validation):
  re-point onto requests/responses with deterministic
  test-authored rows (crypto-randomness only matters for
  mock-data ids, which these tests do not touch).
- mock-data-fingerprint.test.ts RETIRES — its EXPECTED map
  empties by design (requests/responses are excluded from that
  pinning strategy on purpose).
- db-table-names.test.ts: `clients` moves from the survivor
  assertion to the dropped list.
- client-assertion.test.ts: type re-point only (shape-only
  today).

New coverage:

- Facet route: PUT/GET/DELETE happy paths; absent identity 404;
  kind-'person' 400; non-admin caller 403; unauthenticated 401
  (before 404 — honest status covenant).
- deriveClientRegistration: absent, present, superseded,
  tombstoned.
- grantClientCredentials over the facet: happy path, unknown
  client 401, disabled 401, wrong grant_types 400.
- act.sub claim pin on authorization_code redemption.
- Snapshot v4-reject pin (version gate).

### 8. Docs

- SCHEMA.md: delete `### clients`; TABLE_NAMES count three→two;
  version-gate narrative gains the 4→5 bump; registration facet
  documented with the identity-spine facets.
- API-TREE.md: `/clients[/:id]` flips to a retirement record;
  the `/identities/:id` block gains `/registration`. Wording
  (tree voice):

      /identities/:id/registration • RECONCILED (clients
      retirement): client registration facet — single-slot
      PUT-overwrite document (grant_types, redirect_uris, jwks,
      aud, status), admin-realm writes, kind-'service' gate;
      grantClientCredentials derives it pre-token
      (bearer-exempt precedent); DELETE tombstone =
      deregistration

      /clients[/:id] • RETIRED (clients retirement): noun
      retired — client = kind-'service' identity +
      /identities/:id/registration facet; act.sub carries the
      acting client on authorization_code redemption; clients
      TABLE DELETED (TABLE_NAMES 2 — pure message plane;
      SNAPSHOT_SCHEMA_VERSION 4→5); rawReadRow retired with it

- ARCHITECTURE.md: 4 sites.
- CLAUDE.md: Database bullet (three→two tables), Auth bullet,
  Testing bullet (fingerprint file retirement).
- TEST-PLAN.md: 3 existing sites + a new manual case for the
  registration UI (register → rotate → disable on a service
  identity).
- API.md §3.9: rewrite for the facet — also fixes its
  pre-existing stale `clients.getById` claim (code has been
  rawReadRow).

### 9. Sequencing

One concern per commit; `./validate` green at every step.

1. Facet: route-pattern registries + body validator + derive +
   PUT/GET/DELETE routes + new tests.
2. Re-point grantClientCredentials onto the derive; re-fixture
   the grant tests.
3. act.sub wiring on authorization_code + claim pin.
4. UI: adapter → presenter → detail page + TEST-PLAN case.
5. Table deletion: TABLE_NAMES, stores, snapshot version +
   validator, RETIRED_TABLES, rawReadRow retirement, fixture
   re-points, fingerprint retirement, SCHEMA.svg regen.
6. Docs pass.

Steps 1-4 land with the table still present but unread on the
client path after step 2 — the playbook's build-derive →
cutover-read → delete-table order, collapsed because there is
no production write path to dual-run.

## Verification

- `./validate` at every commit (types + tests + line lint +
  SCHEMA.svg drift gate).
- Browser pass: `TMPDIR=/tmp/claude ./serve 8080`, drive the
  identities detail page via Chrome MCP — create a service
  identity, register a client, rotate JWKS, disable, deregister;
  confirm the card and dialog behaviors.
- Grant path end-to-end via the automated suite (WebCrypto-signed
  client_assertion fixtures already exist in
  api-authentication-token.test.ts).
- Snapshot round-trip: export on v5, re-import; confirm a v4
  export is rejected with SnapshotVersionMismatchError.

## Out of scope

- Server-tier hard-PKCE, jti replay tracking (named server-tier
  seams, unchanged).
- client_secret-credential grants (client_credentials remains
  private_key_jwt-only, unchanged).
- Any re-gating of the auth-free snapshot plane (unchanged
  dev-tier posture).
