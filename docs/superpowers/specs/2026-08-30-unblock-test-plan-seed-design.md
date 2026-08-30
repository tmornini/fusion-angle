# Unblock TEST-PLAN walk cases via seed enrichment

- Date: 2026-08-30
- Status: approved design, pre-plan
- Cases unblocked: B25, B26, B27, B29, R21
  (readonly/absent branches)
- Cases left honestly BLOCKED: B21, AA32/F19, I22,
  WB16 (their Layer 1/2 pins decide; config-knob and
  driver-technique machinery was considered and
  declined)

## Problem

The serial walk (Layer 3) records BLOCKED for cases
whose state cannot be produced through the running
origin as a user:

- B25–B27, B29 need a login-capable identity with
  ZERO memberships. The mock seed gives every
  login-capable identity a membership; there is no
  member-removal affordance; the explorer may not
  `js()` the API; `POSTGRES_URL` is never printed.
  The unreachable thing is the zero-membership
  identity itself — invitations are NOT unreachable
  (the admin Invite dialog `#invite-member-btn`
  exists and is walked by V7/V9).
- R21's readonly/absent projection branches need a
  record attribute whose ACL differs from the
  default `['member','admin']`. Setting an ACL is
  `PUT …/attributes/:id` only; no UI reaches it.

## Decision

Enrich the `--mock-data` seed so both states exist
at boot. The walk's own covenant (HTTP-only, no
`js()`) is untouched. Product code is untouched.

## Design

### 1. Zero-membership identity + pending invitation

- One new identity in the seed: login-capable
  (password credential), ZERO membership rows.
  Name: Riley Okafor, email
  `riley.okafor@example.net` — an outside domain,
  since every `@company.com` identity is a seeded
  Stark member and this one belongs to no org.
  Its `username \t password` line reaches crank
  stdout through the existing printer
  (`server/seed.ts` credential listing).
- One pending invitation from Stark Industries
  (`AjdvjuECVZEgZoFajaIEkg`) to that identity's
  email, written through the seed's message-pair
  path so `deriveInvitations` serves it.
- New ids follow the deterministic
  `seed-hash-preimage.ts` registry pattern.
- Because the identity reaches no organization,
  org-fenced surfaces (members, dashboards,
  org-scoped identity lists) do not change.

### 2. Project Brief restricted ACLs

Customer Profile stays untouched — R21's
default-ACL half survives verbatim as the control.
Two EXISTING Project Brief attributes change ACL
(no new rows, no count drift):

- Priority (`pwjGSoPQMbsjmEJLDAgbaA`, select):
  `read_roles: ['admin']`, `write_roles: ['admin']`
  — absent from a member's form. Write tightens
  with read: what a member cannot read a member
  must not write.
- Approved (`qDgLYtdgNBjEEoPqCoMATg`, checkbox):
  `write_roles: ['admin']`, read default —
  `data-access="readonly"` for a member.

Admin bypasses both, so every admin-driven form in
the walk renders exactly as today. Both attributes
are bound (editable, not required) into the seeded
flow's "Solution" node; the member-perspective
sweep (below) confirms no walk case drives that
form as a member.

### 3. TEST-PLAN.md rewrites

- B25–B29 setup note: the unreachability paragraph
  becomes the recipe — sign in as the seeded
  zero-membership identity (credentials from crank
  stdout); do NOT accept the pending invitation
  (accepting grants the first membership and breaks
  B26/B29 on the same pass). The BLOCKED license
  for B25–B27/B29 is removed — its named reason no
  longer exists.
- B27: expects the seeded invitation card render
  (no longer "either branch passes").
- B28: "Restore the deleted membership row" is
  stale — nothing is deleted; the instruction
  becomes: sign in as an untouched seeded member.
- R21: default half unchanged; the "not
  walk-driveable; BLOCKED is correct" narrative is
  replaced by the restricted half — as admin, New
  instance on Project Brief: all writable (admin
  bypass); as Sarah Chen: Approved readonly,
  Priority absent. Existing CLI pins stay the
  deciders; the exploratory line gains the live
  restricted comparison.
- Case count unchanged; the Summary table does not
  move.

### 4. TODO.md — product UI, at the bottom

Two items appended at the bottom, matching the
existing later-work format:

1. ACL-editing UI for record attributes
   (`read_roles` / `write_roles`) — makes R21's
   write path a user gesture.
2. Member-removal affordance under
   members/identities — makes zero-membership
   producible live and restores B28's original
   "restore the deleted row" branch.

## Hazards and sweeps

- Sent-invitations drift: the seeded pending
  invitation appears in the Stark admin's
  Sent-invitations section from boot. Sweep the
  V-section (V7/V9 neighborhood) and any
  invitations-list expectations; update disturbed
  expectations in the TEST-PLAN commit.
- Member-perspective sweep: cases signed in as a
  member are V7, V9, R21, SV6/SV7/SV10 — none
  drives Project Brief instance forms or the
  "Solution" work-order form. Re-verify during
  implementation.
- Credential-count assertions: comments/tests
  naming "11 human passwords" move to 12.
- `generate-api-documentation --check`: if the
  seed count is generated into API.md, the regen
  lands in the seed commit that moved it.
- Tests driving member transitions through the
  "Solution" node (if any) surface as red under
  `./validate` and are judged then: a genuinely
  changed covenant updates with the seed commit
  that changed the world; anything else is a bug
  in the change.

## Testing

TDD, Layer 1 first. New tests pin the WORLD, not
the transform — projection logic is already pinned
by `projectInstanceFields` readonly/absent/bypass
tests:

- Red: the seed yields a login-capable identity
  whose derived membership ledger is empty and
  whose email holds exactly one pending Stark
  invitation.
- Red: Project Brief's Priority and Approved carry
  the restricted ACLs above.
- Green: the seed change. `./validate` gates every
  commit; `./test-all` before any walk. The walk
  is the eventual live confirmation and gates
  nothing.

## Commit sequence

1. Seed the zero-membership identity + invitation
   (with its tests).
2. Restrict Project Brief ACLs (with its tests).
3. Rewrite TEST-PLAN.md B25–B29 setup, B27, B28,
   R21, and swept expectations.
4. Append the two TODO.md product-UI items.
