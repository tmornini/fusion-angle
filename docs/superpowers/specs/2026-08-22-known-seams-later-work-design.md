# Split Known residuals into KNOWN seams and Later work

Date: 2026-08-22
Status: Approved (conversation); awaiting spec review

## Problem

`ARCHITECTURE.md` § Known residuals is one list. It
mixes three kinds of claim:

1. Accepted demo posture (verbatim auth in a dump,
   XSS can use the refresh cookie, one mint process,
   throttle hop, no LISTEN).
2. Deferred projects (work-order locked verbs,
   token-at-rest hashing, two-role views, AI seats).
3. Leftovers and shipped law (`withLifecycleTrio` is
   identity since `5136e991`; instance public PUT 405
   is law in § Records).

AUDIT.md treats that heading as the canonical KNOWN
register, counted at run time. Nothing on the
`./validate` path checks a bullet still holds. The
list drifted: three earlier items were dropped when
the yank and members rewrite landed; `withLifecycleTrio`
was not.

## Goals

- Two sibling headings above `## Do not resurrect`:
  `## KNOWN seams` and `## Later work`.
- AUDIT.md's KNOWN register points at
  `§ KNOWN seams` only. Later work is not counted.
- Every bullet is pinned, except the one operational
  exception (single mint process). Closing a seam or
  shipping later work fails `./validate` until that
  commit edits the pin and the list together.
- Drop claims that are no longer residuals.
- Re-point living citations in the same change.

## Non-goals

- A new `./validate` script that parses the lists.
- Deleting the `withLifecycleTrio` no-op.
- SSE, token hashing, two-role DDL, locked work-order
  verbs, wiring AI seats, or any other later-work
  execution.
- Rewriting historical `docs/superpowers/specs/` or
  `docs/superpowers/plans/`.
- New TEST-PLAN cases. SV10 stays the browser
  counterpart of stale-until-navigation.

## Document structure

Replace `## Known residuals` with:

```
## KNOWN seams
## Later work
## Do not resurrect
```

`## KNOWN seams` is the security/demo posture that is
live and accepted. Commandment II re-confirms these
flags, unwidened.

`## Later work` is deferred projects. A later-work
item that closes a KNOWN seam names that seam. It is
not copied into both lists.

Bullet voice matches `## Do not resurrect`:

```
- Claim — tests/foo.ts
```

A closer:

```
- Token-at-rest hashing — closes KNOWN seam:
  A raw dump still has verbatim auth messages
```

The closer has no second pin. The named KNOWN seam's
pin is the oracle. When hashing ships, that pin fails;
the same commit removes both bullets.

The one operational exception (no code oracle):

```
- Single mint process — server/boot.ts
  (one process, not enforced)
```

That exception is allowed once. Do not invent a test
that greps the doc.

`§ One origin` already says "One mint process — do
not run two replicas." Keep that sentence. KNOWN
seams is the audit register; the duplication is
deliberate.

## Pin contract

The named test asserts today's behavior. It passes
while the claim holds.

Prefer an existing test. Add one only when no oracle
exists. No new validate script. The suite is the gate.

A later-work pin asserts the incomplete state. It is
not a ban. The fix commit changes the test to the new
truth and edits the list.

Browser-only truth stays in TEST-PLAN.md. The
automated pin is the seam flag.

Honest gap: XSS-use. Tests pin the cookie shape
(HttpOnly, Path). They do not prove an XSS payload
can refresh. Closing XSS-use is a new test plus a
list edit, not a silent pass.

## KNOWN seams

Five bullets. AUDIT.md's count `m` is 5.

1. Stale-until-navigation (no LISTEN) —
   `tests/advisory-lock.test.ts`. New pin in that
   file: `api/backend-postgres.ts` issues `pg_notify`;
   neither that file nor `server/**/*.ts` contains a
   `LISTEN` query. TEST-PLAN SV10 is the browser
   counterpart, not the `./validate` oracle.
2. XSS can use the refresh cookie from the page —
   `tests/api-authentication-token.test.ts`
   (`token JSON has no refresh_token; Set-Cookie is
   HttpOnly`). Honest gap as above.
3. A raw dump still has verbatim auth messages —
   `tests/api-shadow-ledger-auth.test.ts`
   (`live secrets land in the auth-flow ledger rows`).
4. Single mint process — `server/boot.ts` (one
   process, not enforced).
5. Throttle is a global cap if `TRUSTED_PROXY_HOPS`
   is wrong; refresh/exchange unlimited —
   `tests/http-throttle.test.ts` (`spoofed
   X-Forwarded-For from a non-trusted hop is
   ignored`; `six refresh token grants reach the
   handler`; `six token-exchange grants reach the
   handler`).

## Later work

Six bullets.

1. Work-order locked verbs not executed —
   `tests/family-registry.test.ts` (`work-orders is
   the fourth registered family, simple like ideas
   and projects`).
2. Token-at-rest hashing — closes KNOWN seam:
   A raw dump still has verbatim auth messages.
3. Two-role views — `tests/backend-postgres.test.ts`.
   New pin: `POSTGRES_SCHEMA` has no `CREATE VIEW`
   (case-insensitive).
4. `putRecordInstance` still PATCHes (name lie) —
   `tests/adapters-record-instances.test.ts` (create
   still imports that name) and
   `tests/api-instances-create.test.ts` (`public
   instance PUT is 405`). Combined oracle: rename
   fails the import; a real PUT create fails 405.
5. Same-body PATCH still appends 201 —
   `tests/api-instances-create.test.ts`. New pin:
   live instance, If-Match of the current ETag, same
   `set` values, a new Operation-ID → 201 and pair
   count +1. This is not byte-identical replay.
6. Roster seat that names an AI agent —
   `tests/family-registry.test.ts` (`ai-agents is a
   live global-plane family, not a member and not an
   identity`).

## Drop

- `withLifecycleTrio still exists` — identity since
  `5136e991`. GET already carries domain `state`.
  The leftover function stays (non-goal).
- Instance public PUT is 405 as a residual — shipped
  law in `## Records` and `API.md` Two PUT classes.
  The 405 test stays; it is not a residual pin.

## Re-points (living docs only)

| Site | From | To |
|---|---|---|
| AUDIT.md § Security: KNOWN vs NEW | `§ Known residuals` | `§ KNOWN seams` |
| AGENTS.md `## Read next` | `residuals, do-not-resurrect` | `KNOWN seams, later work, do-not-resurrect` |
| README.md Docs table | `residuals` | `KNOWN seams` |

Citation rule already in the root-docs rewrite:
every `ARCHITECTURE.md § …` in `api/`, `web-app/`,
`tests/`, and root markdown must name a live heading.
`docs/superpowers/**` historical files are exempt.

## Close protocol

When a pin fails because the work shipped:

1. Change the test to the new truth, or delete it if
   the old incomplete behavior is gone.
2. Remove the ARCHITECTURE bullet.
3. If the bullet was a closer, remove the later-work
   line in the same commit.
4. If a KNOWN seam is gone, AUDIT.md's `m` is the
   new bullet count. Do not restate the list there.

Moving a finding KNOWN → NEW still requires showing
the flag absent or changed, as AUDIT.md already says.

## Verification

- `./validate` green.
- `grep -n 'Known residuals' ARCHITECTURE.md AUDIT.md
  AGENTS.md README.md` is empty.
- `grep -n '## KNOWN seams' ARCHITECTURE.md` and
  `grep -n '## Later work' ARCHITECTURE.md` both hit.
- The three new pins fail if inverted (LISTEN added,
  `CREATE VIEW` added, same-body PATCH returns 200
  with no append).

## Commits

One concern per commit, linear, validate-green:

1. Add the three new pins.
2. Rewrite the ARCHITECTURE headings and bullets.
3. Re-point AUDIT.md, AGENTS.md, README.md.
