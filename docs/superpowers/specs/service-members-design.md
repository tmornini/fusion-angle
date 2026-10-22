# Services and AIs are members with identities

- Date: 2026-10-20
- Status: design confirmed by the owner in
  conversation, pre-plan
- Worktree: `.worktrees/service-members`, branch
  `service-members` (AGENTS.md § Worktrees, with
  `next-release` in place of `master`)
- Base: `next-release` at `e9cc642c`
- Lands: on the owner's word, by the owner. Neither
  `next-release` nor `master` moves in this work.
- Items: two TODO.md `## Later work` lines, "Remove
  the never-verified `client_secret`" and "A
  service-identity rule: membership or a fence of its
  own (G47)". This spec does both and closes both.
- Ships: a Service member kind on the members page;
  AI and service members created by the memberships
  statement, each with a service identity and an
  accepted membership; `ai-agents` and `services`
  scoped to one organization; neither ever an
  organization admin; `client_secret` gone; the
  identities page's create gone; G47 restored
- Defers: a person creating their own identity and
  the personal organization (SP-6, item 5); key
  registration from the members page; the headless AI
  worker (item 12); item 0e

## Problem

A service identity holds no membership. The identity
fence (`api/api.ts:735-760`) admits another identity
only through co-membership, so every organization
admin route under `identities/<service>/` answers
403, `GET identities/` omits services, and the
registration card flow fails (TEST-PLAN G47). A
service created on the identities page is reachable
by no one.

The service create also mints a `client_secret`
credential (`client/identities.ts:282-300`) that
nothing verifies. Services authenticate by
`client_credentials` with `private_key_jwt`: the
assertion is checked against the `jwks` of the
registration at `identities/:id/registration`
(`api/authentication.ts:1314`,
`api/derive-identity-spine.ts:403`). The secret is a
credential in name only.

An AI member, meanwhile, is a bare document on the
global plane (`PUT ai-agents/:id`,
`client/ai-members.ts:150`; `organizationNested:
false` in `api/family-registry.ts:85`) with no
identity at all. `GET ai-agents/` lists every
organization's AIs to any member
(`api/authorization.ts:144`).
Item 12 already assumes an AI seat acts through a
service identity's token, so that every pair it lands
names the agent as `requester_identity_id`.

## Intent

Authentication and authorization are uniform. Every
actor in an organization — a person, an AI, or some
other program — is an identity with an accepted
membership. The fence, the list views, and the token
claims (`subjectClaims` reads memberships) then need
no rule of their own for services.

Creating a service feels like creating an AI member:
one dialog on the members page, descriptive fields,
no secret.

## Decisions

1. **Three member kinds, two identity kinds.** The
   identity's kind says how it signs in: `person` by
   password, `service` by client credentials. The
   member's kind says what it is: `human`, `ai`, or
   `service`. An AI member and a service member are
   both `service` identities. (`IdentityKind` stays
   `'person' | 'service'`; `MemberKind` gains
   `'service'`.)
2. **A service member is a non-AI program** acting
   through the API — an import script, a sync with
   another system, a CI bot. Its document holds `name`
   and `description`, nothing else.
3. **The memberships statement creates every kind.**
   `POST organizations/:id/memberships/`
   (`postOrganizationMembership`,
   `api/invitations-domain.ts:684`) stays one
   statement of three handler-declared geneses; the
   body names the kind:
   - human: the accepted membership, the `person`
     identity, its PII (as today, until the SP-6 line
     retires it);
   - ai: the accepted membership, a `service`
     identity, the
     `organizations/<organization-id>/ai-agents/<id>`
     document (`name`, `description`, `skill_focus`,
     `model`);
   - service: the accepted membership, a `service`
     identity, the
     `organizations/<organization-id>/services/<id>`
     document (`name`, `description`).
   The identity id, the member document id, and the
   membership's identity half are one id, minted by
   the client. A resend answers 409; a member token
   answers 403, as today.
4. **AI and service documents belong to one
   organization** (owner's decision). `ai-agents`
   moves from the global plane to
   `organizations/:id/ai-agents/`, and `services`
   starts there. The same id at two organizations is
   two documents (AGENTS.md § Foreign ids 404), so one
   AI identity joining a second organization gets a
   second document there. A list or read shows only
   the caller's organization's AIs and services; the
   global `ai-agents/` routes go.
5. **`PUT ai-agents/:id` no longer creates.** It edits
   an existing AI member's document, under the
   conditional rules a non-creating PUT already
   follows (AGENTS.md § Follow the RFCs: an absent one
   is 404, no precondition is 428). `services/:id`
   follows the same rule from the start.
6. **`client_secret` goes entirely.** The credential
   kind (`shared/types.ts:513`, the validator at
   `api/validators.ts:596`), both seed rows
   (`api/mock-data/seed-message-pairs.ts:2467`,
   `api/mock-data.ts:336`), the nested credential in
   `postIdentityCreation`, and the service's
   Credentials card. `password` is the only
   credential kind left. A `client_secret` credential
   is refused at the gate.
7. **The identities page creates nothing.** People
   already left it (identities-person-retire);
   services now leave for the members page. Its
   "Add Identity" button and dialog go, and
   `postIdentityCreation` goes with them. The page
   keeps listing and showing identities, and the
   service's identity detail keeps its client
   registration card.
8. **Signing in is unchanged.** An organization admin
   creates the member, opens its identity, and
   registers its `jwks`; the service then mints
   tokens by `client_credentials` with
   `private_key_jwt`, and `sub` is its identity. A
   member detail page for an AI or service member
   links to that identity page.
9. **Removal is membership removal**, exactly as for a
   human. The identity remains; its tokens end at the
   next mint, refresh, or exchange, or at access TTL
   (AGENTS.md § Tenancy).
   *Builder-check calls (Claude's, for the owner to
   check):*
   - An AI or service member is live while its
     membership is accepted. The flow designer's AI
     picker (`web-app/flows/detail.ts:1712`) and the
     flow write law (`liveGlobalDocumentIds(db,
     'ai-agents')`, `api/routes.ts:1313`) read
     accepted AI memberships, not the `ai-agents/`
     collection. Removal stays one membership write;
     the member document remains, as a person's
     identity does.
   - Removal is permanent in this work: the statement
     answers 409 on the existing identity, and a new
     member takes a new id. Reinstating one is filed
     as a `## Later work` line.
10. **No data migration.** Item 0i wipes and reseeds
   every live database, so stored `client_secret`
   rows and identity-less AI documents go with it.
   The seed writes the new shape: every seeded AI
   member gains a `service` identity under its
   existing id, so roster seats that name it still
   resolve, and an accepted membership plus an
   organization-scoped document in each organization
   whose seeded flows name it, and in the first
   organization when none does (Claude's call). The
   seed's system
   identity stays a `service` identity, without its
   `client_secret` row, and the `system` member kind
   stays.
11. **An AI or service member is never an
    organization admin** (owner's decision). The gate
    refuses `type: 'admin'` for the ai and service
    kinds in the statement, and refuses promoting an
    AI or service membership to `admin`. The members
    page shows no role control for them. The
    last-admin guard therefore always counts people.
12. **`POST identities/` stops creating services.**
    `api/routes.ts:3518` refuses `kind: 'service'`
    with 400, so no API path mints a service identity
    without a membership. Its `kind: 'person'` branch
    stays until the SP-6 line retires it (Claude's
    call).

## The members page

- The Kind control in the add-member dialog gains
  **Service** beside Human and AI. Its form is Name
  and Description, both required.
- The AI form keeps its four fields; its submit moves
  from `PUT ai-agents/:id` to the memberships
  statement.
- The roster gains a **Services** chip beside Humans
  and AIs.
- The roster is built from accepted memberships.
  Today `getHumanMemberMap` (`client/members.ts:132`)
  treats every accepted membership as a human. Once
  AIs and services hold memberships, the roster must
  sort each membership by its member kind, so no AI
  or service reads as a human with erased PII.

## Verification

Red first, then green, each at the lowest layer that
can see it:

- The G47 oracle: an organization admin's GET on a
  co-member service identity, its registration PUT,
  and `GET identities/` listing it, all succeed for a
  service created by the statement. TEST-PLAN G47 is
  rewritten to create the service on the members page
  and loses its failing preamble.
- A `client_secret` credential body is refused at the
  gate.
- The statement creates each of the three kinds with
  its three geneses in one statement; a resend is
  409.
- `PUT ai-agents/:id` on an absent id answers 404.
- A member of one organization cannot list or read
  another organization's AIs or services; the global
  `ai-agents/` route is gone.
- An ai or service body with `type: 'admin'`, and a
  promotion of an AI or service membership to
  `admin`, are refused.
- A service token's claims carry the organization of
  its membership.
- The human roster lists no AI or service member.
- G44 is retired or rewritten with the identities
  page's create.

## Docs

API.md (the statement's three kinds, the non-creating
AI PUT, the organization-scoped `ai-agents` and
`services` routes, the admin refusal), ARCHITECTURE.md
§ Tenancy (services are co-members; no rule of their
own), SCHEMA.md (credential kinds), TEST-PLAN (G44,
G47, the members page cases), and TODO.md: both
lines close in the commit that lands their behavior.

## Left to the builder

- The statement body's shape for naming the kind and
  carrying each kind's document.
- The organization-nested wiring for `ai-agents` and
  `services`, after an existing organization-nested
  family; `AI_AGENTS_WIRING` (`api/routes.ts:513`)
  and its registry row change nest.
- How the roster learns each membership's member kind.
- The commit order, within one-concern commits and a
  red test before each behavior change.
