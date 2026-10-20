# A person identity is created only by its person

- Date: 2026-10-14
- Status: design confirmed by the owner in
  conversation, pre-plan
- Worktree: `.worktrees/identities-person-retire`,
  branch `identities-person-retire` (AGENTS.md
  § Worktrees, with `next-release` in place of
  `master`)
- Base: `next-release` at `d4ef5913`
- Lands: on the owner's word, by the owner. Neither
  `next-release` nor `master` moves in this work.
- Item: TODO.md `## Later work`, "Re-aim the
  identities page's person create onto the memberships
  statement (G44's person half)". This spec replaces
  that line rather than doing it.
- Ships: the identities page's add dialog without its
  person half; `postIdentityCreation` narrowed to
  services; the words "organization admin" and
  "operator"; G44 retargeted; three later-work lines
- Defers: every server change; the members statement;
  the service half, G47, and the client secret; the
  other five later-work lines; item 0e

## Problem

The identities page's person create fails. The dialog
POSTs `identities/` and then PUTs the PII
(`postIdentityCreation`, `client/identities.ts:314`).
Since admin-scope, the identity fence answers that PUT
403, because the new identity holds no membership, and
`GET identities/` does not list it. The first hop
leaves an identity no one can reach.

The later-work line proposed re-aiming the page onto
the memberships statement,
`POST organizations/:id/memberships/`. The owner
rejected that direction. An organization admin should
not create a person identity at all. A person identity
is created only by its person, when that person
creates an account. Services and other non-human
identities are the exception.

No sign-up exists yet (SP-6,
`web-app/auth/index.ts:642`). Today a person identity
comes into being by the operator's seed, by an
organization admin's `POST identities/`, or by an
organization admin's statement on the members page
(admin-scope decision 6).

## Decisions

1. The principle: an organization admin never creates
   a person identity. Only the person does, at
   sign-up. This is about authorization, not the
   endpoint: creating a person survives as a
   capability.
2. The identities page stops offering a person create.
   Its add dialog loses the Kind toggle and the person
   form.
3. The server does not change in this work.
   `POST identities/` keeps accepting `kind: 'person'`.
   SP-6 decides where sign-up creates a person and
   what this route answers a person body, together.
   The orphan this route can still mint is recorded,
   not fixed.
4. The members statement (admin-scope decision 6)
   stands. Its conflict with the principle is filed as
   later work, sequenced with SP-6 and item 5.
5. `postIdentityCreation` keeps its name and narrows to
   services. Its person branch and
   `IdentityPiiIntakeFailedError` go.
6. The dialog keeps the label "Add Identity" and its
   `add-identity-*` ids. Its name is decided once, when
   the client-secret line and G47 decide what a
   non-human identity is.
7. Two words are locked: organization admin and
   operator. Prose names a person by one of them,
   never bare "admin".
8. The service's `client_secret` is never verified.
   Its removal is its own later line, before G47.

## 1. The dialog

`web-app/identities/index.html` drops the
`#add-identity-kind-toggle` fieldset and the
`#add-identity-person-form` block (Name, Email, Phone,
Bio). `#add-identity-service-form` loses its `hidden`
class, so the dialog opens on the Client Secret form.
The header, the "Add Identity" button and title, the
footer, and every remaining id stay.

`web-app/identities/index.ts` drops
`onKindRadioChange`, `selectedKind`, `submitPersonForm`,
the kind-toggle listener in `bindAddIdentityDialog`,
the four person fields in `clearAddIdentityFields`,
and the `IdentityPiiIntakeFailedError` import.
`handleAddIdentitySubmit` sends the service form. The
Enter-key handler stays.

The mint-once comment loses its second-hop rationale,
since no second hop remains. It keeps the reason that
is still true: one id per dialog session, so a retry
of a create that already landed answers 409 rather
than minting a second identity.

## 2. The client verb

In `client/identities.ts`, `IdentityCreationSpec`
becomes the service shape only:
`{ kind: 'service'; secret: string }`.
`postIdentityCreation` keeps its name and its three
parameters and loses its person branch. `IdentityPiiIntakeFailedError`
goes, since nothing raises or catches it. The verb's
comment drops the person decomposition and keeps the
service statement: identity plus a hashed
`client_secret` credential in one POST, with the
credential id derived from the identity id.

## 3. Vocabulary

- **Organization admin**: an identity holding an
  accepted membership of `type: 'admin'` in one
  organization. At mint it is the claim
  `admin:<organization-id>`; at the gate,
  `projectClaimRolesForOrganization`
  (`api/authorization.ts:22`) projects it to the role
  `admin` for the claim organization only.
  `ROUTE_POLICY`'s `/` rows grant that role every
  verb, and the identity fence confines it to
  co-members. It reaches no other organization.
- **Operator**: whoever holds `POSTGRES_URL` and
  `JWT_HMAC_SIGNING_KEY` and runs `./deploy`, the
  seed, and the wipe. The operator is not an identity,
  holds no token, and never acts over HTTP. Every
  organization today comes from the operator's seed.

`ARCHITECTURE.md` `## Tenancy` defines both.
`AGENTS.md` gains a voice rule beside `grant`'s: prose
names a person "organization admin" or "operator",
never bare "admin"; the role string and the membership
type `'admin'` stay.

Three phrases read as a tier above organizations and
are rewritten to name the organization admin's `/`
rows:

- `ARCHITECTURE.md:164`, "The `/` admin tier stays"
- `api/routes.ts:3524`, "the root admin tier in
  ROUTE_POLICY"
- `tests/api-organization-isolation.test.ts:1267`,
  "the root admin tier"

Historical specs and plans are not edited. The sweep
of bare prose "admin" across the living docs is a
later line.

## 4. Tests

The covenant changes at the page and at the client
verb. The server's covenant does not, so its tests
stay.

- **Red first, Layer 2.** `tests/browser/dialogs.test.ts`
  gains a case: open `add-identity`; the dialog holds
  no `input[name="identity-kind"]` and no
  `#add-identity-person-form`, and `#svc-secret` is
  visible. `ADD_IDENTITY_FIELDS` drops `#id-name`,
  `#id-email`, `#id-phone`, and `#id-bio`.
- **The type is the Layer 1 gate.** A `kind: 'person'`
  call to `postIdentityCreation` fails `deno check`.
  No test asserts the branch's absence.
- **Deleted with the code.**
  `tests/adapters-identity-creation.test.ts` loses
  "postIdentityCreation stores the person and the
  admin PII hop is forbidden" and "a resent
  postIdentityCreation is 409 and leaves the first
  identity". They pinned the person branch. Their
  server twins stay in
  `tests/api-identities-create.test.ts`, and the
  service resend case stays.
- **Rewritten, same covenant.**
  `tests/adapters-identity-roster.test.ts` mints its
  orphan person by a direct
  `ctx.POST('identities/', { id, kind: 'person' })` in
  "getIdentityRoster omits a membership-less person"
  and "an admin cannot erase a membership-less
  person". Every assertion stays: the 403 bodies and
  the roster omission. The orphan hole stays open, so
  these covenants still bind.
- **Unchanged.** `tests/api-identities-create.test.ts`,
  every server test, the members tests.

Layer 1 (`./test validate`) is green on every
commit; it does not run the browser suite. Layer 2 (`./test validate browser`) is
green before hand-off. The walk gates nothing.

## 5. The record

### G44

TEST-PLAN.md's G44 is retargeted. Click "Add
Identity": the `add-identity` dialog opens on the
service form (`#svc-secret`, "Client Secret"), with no
Kind toggle and no person form. An empty secret shows
"A client secret is required" and keeps the dialog
open. Create toasts "Service identity added" and
closes the dialog. The roster append fails until G47's
line, because `GET identities/` omits services; G44
says so and points at G47.

Pins: the new `tests/browser/dialogs.test.ts` case;
`tests/adapters-identity-creation.test.ts`
"postIdentityCreation mints a service identity with a
hashed client_secret". Exploratory: the toast text.

TODO.md's "Unpinned but pinnable" entry for the
`IdentityPiiIntakeFailedError` toast (G44) goes, and so
does G44's "(see Unpinned but pinnable)" reference.

### TODO.md

`## Later work` removes the re-aim line and files
three in its place:

- A person identity is created only by its person.
  Retire the members statement's identity and PII
  geneses and `POST identities/`'s `kind: 'person'`,
  with SP-6 and item 5; SP-6 decides the route and the
  status. Until then an organization admin's
  `POST identities/` with a person body mints an
  orphan no view lists.
- Remove the never-verified `client_secret`: the
  credential kind, the seed row, the dialog field, and
  the service's Credentials card. OAuth's
  `client_credentials` grant with `private_key_jwt`
  covers the need. Before the service-identity rule
  (G47).
- Rewrite bare prose "admin" in the living docs as
  "organization admin" or "operator".

## 6. Commit order

One concern per commit. Every commit is green at
Layer 1; only the second is red, and only at Layer 2.

1. Add the spec
2. Pin a dialog without a person half (Layer 2 red)
3. Drop the person half from the identities dialog
4. Mint the roster tests' orphan by a direct POST
5. Drop the person-branch creation tests
6. Narrow identity creation to services
7. Define organization admin and operator
8. Name the people in prose
9. Rewrite the root-tier phrases
10. Retarget G44 to the service-only dialog
11. File the person-create follow-up lines

Commit 3 precedes 6: the page calls the person branch.
Commits 4 and 5 precede 6: the narrowed type fails
their files.

## 7. Oracle

1. `./test validate browser` is green on the branch
   tip, and the new dialog case was red at commit 2.
2. `grep -rn "IdentityPiiIntakeFailedError\|identity-kind\|add-identity-person-form" client web-app`
   prints nothing, and
   `grep -rn IdentityPiiIntakeFailedError tests TODO.md TEST-PLAN.md`
   prints nothing.
3. `grep -rn "kind: 'person'" client/identities.ts`
   prints only the two roster lines, the
   `IdentityRosterRow` type (`:75`) and its row
   (`:114`).
4. `git diff d4ef5913 -- api server shared` prints
   only the comment rewrite at `api/routes.ts:3524`.
5. `grep -rn "admin tier" ARCHITECTURE.md api tests`
   prints nothing.

## Close

The owner reviews this spec, then writing-plans turns
it into `docs/superpowers/plans/identities-person-retire.md`
on this branch. The owner lands the branch.
