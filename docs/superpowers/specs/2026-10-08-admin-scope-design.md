# Admins act within their organization

- Date: 2026-10-08
- Status: design confirmed by the owner in
  conversation, pre-plan
- Worktree: `.worktrees/admin-scope`, branch
  `admin-scope` (AGENTS.md § Worktrees, with
  `todo-audit` in place of `master`)
- Base: `todo-audit` at `619a9e3e`
- Lands: `git -C .worktrees/todo-audit merge --ff-only
  admin-scope`, on the owner's word. `master` does not
  move. Cleanup after landing: the owner runs
  `git worktree remove .worktrees/admin-scope` from
  the main checkout, then `git -C .worktrees/todo-audit
  branch -d admin-scope`. Never `-D`.
- Item: TODO.md `0d`, first under
  `## Critical product path`
- Ships: the identity fence; the organization nest's
  `invitations/` and `memberships/` views; member
  creation as one statement at
  `POST organizations/:id/memberships/`; `expires_at`
  on a pending invitation; the `/invitations/` storage
  prefix in the generated map; `grant` as a verb
- Defers: the item and version relocation under
  `memberships/`; `identities/:id/memberships/` and
  the `identities/:id/organizations/` consolidation;
  the identities page's person create; service
  identities; a derived map of every storage prefix;
  the retired role-grant identifiers; deletion after
  expiry

## Problem

Any organization's admin can write a password
credential for an identity in another organization and
sign in as it. `ROUTE_POLICY` grants `admin` every verb
at `/` (`api/authorization.ts:180-184`). `identities/…`
is the global plane, which the organization fence never
sees. The credential PUT checks nothing:
`postIdentityCredentialDocumentOp` (`api/routes.ts:2610`)
ignores the path identity and the actor and lands the
body, whose `secret` the gate reads as a bare string
(`api/validators.ts:607`, inside the validator that
starts at `:587`), while sign-in reads that identity's
own credentials (`deriveCredentialsFor`,
`api/authentication.ts:1729`). No test drives either
answer.

The same unscoped arm reaches every admin-reachable
`identities/:id/…` write and read: the identity PUT
(`api/routes.ts:3595`), PII (`:3690-3694`;
`authorizeIdentityPii`, `api/request-auth.ts:160-176`,
admits any admin), credentials (`:3793`), registration
(`:3826`, `:3833`), tokens (`:3911`), providers
(`:4019`), the token chain (`SELF_ONLY_TOKEN_ROUTES`,
`api/api.ts:430-434`, checked at `:807-845`, where
`callerIsAdmin` is the claim organization's `admin`
role, `:701-702`), and `GET identities/`, which serves
the stored heads at the global prefix whatever the
caller's organization (`:3509-3514`). The PII and
credentials reads carry a membership fence
(`:3659-3686`, `:3774-3785`) that admits an identity
with no membership. No root operator exists.

Member creation on the members page is three writes in
order: the identity, its PII, then the accepted
membership (`postHumanMemberCreation`,
`client/members.ts:276`). A fence on membership refuses
the first two, so the create must become one write.

## Decisions

1. The fence is the gate. One rule in `api/api.ts`
   covers every `identities/:id/…` route and
   `GET identities/`. No per-route fence survives it.
2. The rule is co-membership. When the path identity is
   not the actor, it must hold an accepted membership
   in the fenced organization. Absent, orphan, and
   foreign all answer the same 403. Self stays self.
3. No cross-organization operator exists, and this spec
   adds none. The `/` admin tier stays, and reaches
   co-members only.
4. The identity nest is self-only. Its admin arm goes.
5. The organization nest splits by state: `invitations/`
   is the offer, `memberships/` is the seat. Members
   read `memberships/`. Items stay where they are.
6. Member creation is one statement:
   `POST organizations/:id/memberships/`, three
   handler-declared geneses, every profile field
   required.
7. A pending invitation carries `expires_at`. Accept
   after it is refused. Nothing is deleted.
8. The `/invitations/` prefix enters the generated map
   as a backing URI with no verb, derived from the
   family registry, gated by `--check`.
9. `grant` is a verb here. The noun stays only where
   RFC 6749, RFC 7591, or Postgres dictate it, and
   inside the OAuth adapter, where it is the RFC's
   word. The owner may flip the adapter at review.
10. The identities page's person create and service
    identities are consequences this spec records, not
    work it does.

## 1. The identity fence

### Rule

In `handleRequest`, after `authorizeRequest` and before
body parse, for every matched route whose first segment
is `identities` and whose second is `:id`: when the path
identity is not the actor, read
`membershipOf(adapter, organization, pathIdentity)`
(`api/memberships.ts`). `null` answers 403 with the
fixed body
`forbidden: <METHOD> <path> names an identity outside
this organization`, and nothing else runs. An accepted
membership admits the request to the route's own
handler, unchanged.

The read is one head at `/invitations/`, named
`<organization-id>:<identity-id>`. The caller's own
roles stay claims under the named ≤15-minute covenant.
The target's membership is read live, so a removed
co-member is refused on the next request.

The fence answers one status for every identity the
caller may not name. It does not read the identity, and
an absent identity has no membership, so an admin
naming one answers 403 where today it answers 404.
RFC 9110 §15.5.4 lets a server hide existence.

### Reach

Every route under `identities/:id/`: the identity
document and its versions, `pii`, `credentials/` and
its items, `registration`, `token-revocations/:rid`,
`tokens/` and its items and the rotation and revocation
operations, `providers/` and its items,
`default-organization`, `organizations/`, and the
invitation views and versions. The collection
`GET identities/` narrows its selector to the identities
holding an accepted membership in the fenced
organization: the organization's accepted membership
heads (`organizationMembershipHeads`) intersected with
the identity heads, the intersection the roster already
derives (`api/derive-members.ts`). `POST identities/`
names no identity and is not fenced.

### What the fence retires

The orphan-visible fences in the PII selector
(`api/routes.ts:3659-3686`), the credentials collection
(`:3700-3745`), and the credential item (`:3774-3785`)
go, and `ownerOrganizationViaMembershipPairPlane`
(`:681`) with them. `authorizeIdentityPii` keeps its
self-or-admin rule; the fence runs after it.

Region B (`api/api.ts:807-845`) keeps its code. Its
comment changes: a member acts on its own chain, an
admin on a co-member's, and the identity fence has
already refused the rest.

### The identity nest, self-only

`identities/:id/invitations/`, its item, both version
routes, and `identities/:id/organizations/` require
`actor === :id`. `requireSelfOrAdmin`
(`api/invitations-domain.ts:101`) becomes `requireSelf`
on those routes, and `selectIdentityOrganizations`
(`api/organization-requests.ts:36`) drops its admin arm.
No page reads the identity nest for another identity.
An admin has the organization nest. The `MEMBER_VERBS`
rows for the identity nest stay.

## 2. The organization nest's two views

One document per membership at `/invitations/`, named
`<organization-id>:<identity-id>`, five states as today.
A view is a selection over that collection by one
indexed body field and one state, plus authorization.
A write through a view lands at `/invitations/`.

| View | States | Default | Who reads |
|---|---|---|---|
| `organizations/:id/invitations/` | `pending`, `declined`, `revoked` | `pending` | admin |
| `organizations/:id/memberships/` | `accepted`, `removed` | `accepted` | member, admin |

No query selects the default. `?state=` names one state
of the view; a state outside the view is 400 with the
view's alphabet named. A second query key or two states
is 400 as today. A member on `invitations/` is 403. The
member rule is today's `MEMBER_VISIBLE_STATES` made a
view: the `MEMBER_VERBS` row
`'/organizations/:id/invitations': ['GET']` becomes
`'/organizations/:id/memberships': ['GET']`.

`POST organizations/:id/invitations/` stays the
invitation POST (section 4 changes its body).
`POST organizations/:id/memberships/` is section 3.

Items and versions stay at
`organizations/:id/invitations/:membership-id` for every
state. The admin's PUTs there are unchanged: revoke,
removal, type change, a direct accepted write. The
roster reads a membership on `memberships/` and removes
it through the item it names, latching the head it
read; the ETag is the pair id, so the collection it was
read from does not matter. Moving the items and
versions under `memberships/` is deferred with the
identity nest's split, since `identities/:id/memberships/`
would subsume `identities/:id/organizations/` and that
is the organization switcher's read.

Client reads move: `acceptedMemberships`
(`client/members.ts`), `getAdminSeatIds`
(`client/admin.ts:45`), `getMembers` and
`getFormerMembers` (`client/members-union.ts:53`,
`:140`) read `memberships/`; `getSentInvitations`
(`client/invitations.ts`) reads `invitations/` with its
state. Nothing else reads the organization nest.

## 3. The statement

`POST organizations/:id/memberships/`. Admin only, by
the root tier; no member row. Conditional `none`
(`WRITE_RESPONSE_SPECS`). The body:

```json
{
    "id": "<identity id, client-minted>",
    "membership": { "type": "member", "at": "<RFC-3339 zulu>" },
    "identity": {
        "title": "", "department": "",
        "strengths": [], "team_dimensions": {}
    },
    "pii": { "name": "", "email": "", "phone": "", "bio": "" }
}
```

`validateMembershipCreateBody` (`api/validators.ts`)
holds the gate: exactly these four keys; `id` an
identifier; `membership.type` in the membership
alphabet and `membership.at` a timestamp; `identity`
exactly the four profile keys, through
`validateIdentityEntity` with `kind: 'person'` pinned
by the handler, never read off the body; `pii` exactly
the four PII keys, through `validateIdentityPiiEntity`.
Every key is required. The page's empty strengths list
and empty assessment map are the page's call-site
values, not defaults the gate supplies.

The handler, `postOrganizationMembership` in
`api/invitations-domain.ts`, forms three siblings, each
a handler-declared genesis, and lands them through
`runStateWrite` in one statement:

1. the parent: the membership at `/invitations/`, named
   `<organization-id>:<id>`, state `accepted`, the
   body's type and `at`;
2. the identity at `/identities/`, named `<id>`, body
   `{ kind: 'person', ...profile }`;
3. the PII at `/identities/<id>/`, named `pii`.

It answers 201 with the membership's state, an ETag
naming the membership's pair, and `Location`
`/organizations/<organization-id>/invitations/<name>`,
the item. A resend is 409 and stores nothing, since a
handler declared the geneses. An identity id already
written is 409 the same way. Re-admitting a removed
member is the admin's accepted PUT on the item, not a
create. After a landed statement the handler notifies
the organization and the identity as the invitation
POST does.

`postHumanMemberCreation` keeps its name and its
signature and sends this one POST.
`HumanMemberPiiIntakeFailedError` goes: there is no
torn state to name. The members page keeps its own
gate, name and email required, and
`humanMemberCreationFromDraft` keeps supplying the
empty list and map.

The statement precedes the fence in the commit order,
so every commit keeps the members page working.

## 4. `expires_at`

The invitation POST body becomes
`{ email, at, expiresAt }`. `at` replaces `grantAt`.
`expiresAt` is required, a timestamp after `at`. The
page passes it explicitly:
`INVITATION_EXPIRY_DAYS = 14` in `client/invitations.ts`,
added to `nowUtc()`.

The stored pending body carries `expires_at` as its
seventh key. Every other state keeps the six keys.
`validateMembershipBody` (`api/memberships.ts`) requires
`expires_at` when `state` is `pending` and refuses it
otherwise. `storedMembership` writes it for `pending`
only. `membershipTransition` builds the next state from
the request, so a transition out of `pending` drops it
without a rule of its own. `pending` arrives only by
POST, since the item PUT refuses `pending`, so every
pending head has one.

Accept on a pending head whose `expires_at` is at or
before the server's request time, `requestAt`, never the
body's `at`, is 409, `the invitation expired at
<expires_at>`, like every refused transition. Decline
and revoke still land, since they end the offer. A
repeated POST on a pending head stores nothing, as
today, so an expiry is extended by revoking and inviting
again. The invitations page and the bell treat
`expires_at` at or before now as expired: no Accept, no
count. Deletion after expiry is deferred.

The seed's one pending invitation (the unaffiliated
identity's, `api/mock-data/seed-message-pairs.ts:2175`)
expires one year after `MOCK_SEED_TIMESTAMP`, a named
seed constant. B27 and V4 stay walkable through 2026;
the horizon is a note in TEST-PLAN.md. Existing pending
bodies in a live ledger lack the key; 0i's wipe and
reseed carries it, so there is no migration.

## 5. The storage map

The generated API documentation derives its rooms from
the route table alone, so a URI that serves no verb has
no way in. `FAMILY_REGISTRY` (`api/family-registry.ts`)
gains `invitations`, global plane, with no collection
create. The generator renders every registered family's
storage prefix in `API.svg`; a prefix with no route
offers no verb and no room and is marked as backing,
and each view room names the prefix it reads and the
body field it selects on. `/invitations/` shows its two
indexed fields and its five states. The `--check` gate
covers the whole space. Registration must not change
dispatch: an unregistered first segment is global in
`canonicalPath` today, the registration keeps
`/invitations/` global, and a test pins the prefix.
API.md keeps its pointer role.

## 6. Vocabulary

`grant` is a verb in this repo. Renames, each its own
commit, never beside a content change:

- `postOrganizationInvitationGrant` →
  `postOrganizationInvitation`
- `postInvitationGrant` → `postInvitation`;
  `InvitationGrantOutcome` → `InvitationOutcome`
- `InvitationGrantSeedInput` → `InvitationSeedInput`;
  `formInvitationGrantSeedInput` →
  `formInvitationSeedInput`; `granterId` → `inviterId`
- the body key `grantAt` → `at` (section 4)
- test helpers named for the noun
- prose in API.md ("Membership grant", "the grants"),
  ARCHITECTURE.md ("Grant (admin)"), TEST-PLAN.md, and
  comments (`api/memberships.ts:183`)

Stays: `grant_type` and `invalid_grant` (RFC 6749),
`grant_types` (RFC 7591), Postgres `GRANT`, and the
OAuth adapter's helpers that echo the RFC's
"authorization grant". The retired role-grant
identifiers are a separate cleanup, named in TODO.md.
AGENTS.md's voice rules gain the line.

## 7. Consequences recorded

- The identities page's person create
  (`postIdentityCreation`, `client/identities.ts:314`)
  lands a membership-less identity, then its PII PUT is
  403. The first hop leaves an identity no admin can
  reach and no view lists. Until a follow-up re-aims the
  page, G44's person half fails. The members statement
  is now the person create.
- Service identities hold no membership. Every admin
  route under `identities/<service>/…` is 403, and
  `GET identities/` omits them. G47 fails. A follow-up
  gives services a membership or a rule of their own.
- Tests that act on an identity with no membership
  through an admin token flip red and are rewritten to
  seed the membership first or to assert the 403:
  `tests/api-human-members.test.ts` (its first case),
  `tests/adapters-members.test.ts` (the three-write
  pin), `tests/api-identities-create.test.ts`,
  `tests/api-organization-isolation.test.ts` (the
  orphan-visible halves), the client-registration
  adapter tests, and whatever else the suite names.
- Walk cases: AA5 and G14 read one POST; V1 and V2
  read the renamed verbs and `expiresAt`; B27 shows
  the expiry; G44 and G47 carry the consequences above.

## 8. Oracle

Red first, then green, each in `./test`:

1. Two organizations. B's admin PUTs a password
   credential on A's member, then signs in as that
   member with it. Today: 201 and a code. After: 403,
   nothing appended, and sign-in 401.
2. Per route in section 1: B's admin naming A's member
   is 403 and the pair count is unchanged; B's admin
   naming B's member answers as today. `GET identities/`
   lists B's co-members only.
3. An admin on a co-member's identity nest is 403; self
   is 200.
4. The statement lands three heads and answers 201 with
   the membership; a resend is 409; a member is 403; a
   body missing one profile key is 400; the roster
   lists the person.
5. `memberships/` answers accepted by default and
   `?state=removed` to a member; `?state=pending` there
   is 400; `invitations/` answers pending by default,
   403 to a member, and `?state=declined` to an admin.
6. The invitation POST without `expiresAt` is 400; the
   pending head carries `expires_at`; accept after it
   is 409; accept before it is 200 with a six-key body.
7. The generated map names `/invitations/` as backing,
   and `--check` is green.

Layer 2: `tests/browser/member-create.test.ts` stays
green on the new wire; `invitations.test.ts` unchanged.

## Close

0d leaves TODO.md by the close protocol. New TODO lines:
the identities page re-aim, the service identity rule,
the item and version relocation with
`identities/:id/memberships/`, the derived map of every
storage prefix, the role-grant identifiers, and deletion
after expiry.
