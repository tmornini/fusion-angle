# Unblock TEST-PLAN Walk Cases via Seed Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking. Ride this spec's worktree (AGENTS.md
> § Worktrees).

> **For the dispatching orchestrator (AGENTS.md § Subagents):**
> every subagent prompt MUST begin with the literal phrase
> `Go to Medium Church!`, then push down: the 78-char lint on
> code/scripts (not `.md`), 4-space indent, the `org`
> identifier ban (never `orgId`/`myOrg`-style camelCase —
> spell `organization`), present-tense-imperative ~50-char
> commit subjects with the mandated trailer, TDD at Layer 1,
> the Sin of Test Weakening (when test and code diverge, the
> code changes — except where the WORLD legitimately changed:
> a seed-count pin updates with the seed commit that moved
> the world), and the seed's two-pass pattern (pass 1 forms
> every message pair pre-tx; pass 2 writes row ops only).

**Goal:** Enrich the `--mock-data` seed with a zero-membership
identity + pending invitation and two restricted Project Brief
ACLs, so TEST-PLAN walk cases B25–B27, B29 (and B28's rewrite)
and R21's readonly/absent branches become walk-driveable; then
rewrite the affected TEST-PLAN cases and append two TODO.md
product-UI items.

**Architecture:** Seed-only change — product code untouched.
The seed's two-pass shape is preserved: every new message pair
is formed in pass 1 (`api/mock-data/seed-message-pairs.ts`)
under a deterministic key and appended in pass 2
(`api/mock-data.ts`) inside the existing transaction. The new
identity lives OUTSIDE `buildMembers()` (the members loop is
index-sensitive via `assignOrganization` and seeds a
membership per entry). The invitation mirrors the live
`grantInvitation` pair-pair (operation + document) exactly.
ACLs ride the existing attribute-document pipeline
(`recordAttributeDocumentBodyOf` passes explicit
`read_roles`/`write_roles` through; absent arrays get the
stamped default).

**Tech Stack:** TypeScript under `node --strip-types`,
`node:test`, the repo's own `./validate` gate. No new
dependencies.

**Spec:**
`docs/superpowers/specs/2026-08-30-unblock-test-plan-seed-design.md`

**Worktree:** `.worktrees/2026-08-30-unblock-test-plan-seed`
on branch `2026-08-30-unblock-test-plan-seed` (AGENTS.md
§ Worktrees). Create it from master before the first
execution commit. Subagents work in that worktree and never
create their own.

## Global Constraints

- Lint: 78-char max line on code and scripts (NOT `.md`);
  4-space indent; trailing newline; no trailing whitespace.
- Identifier ban: no camelCase `org` abbreviation
  (`org[A-Z]`, `xOrg…`, `Org[A-Z]` forms). Spell
  `organization`.
- Commits: one concern each; subject ≈50 chars,
  present-tense imperative, no body prose; end the message
  with the two mandated trailer lines (Co-Authored-By +
  Claude-Session) exactly as the harness instructs.
- `./validate` must be green before every commit. It runs:
  whole-tree `tsc`, browser-subset `tsc`, `./test` (UTC pass
  on `tests/*.test.ts`, then a Honolulu pass on
  `tests/tz/*.test.ts`), the 78-char lint, the `org` ban,
  `generate-schema-svg --check`,
  `generate-api-documentation --check`.
- Counts are MEASURED, never invented: run the red test,
  read the actual number from its output, verify it equals
  the predicted value below, then update the pin. If
  measurement and prediction disagree, STOP and investigate
  the seed change before touching any pin.
- Product code (`api/` outside `api/mock-data*`, `server/`,
  `web-app/`, `shared/`) is untouched in every task.
- Fixed values from the spec, verbatim:
  - Identity: Riley Okafor, `riley.okafor@example.net`.
  - Stark Industries organization id:
    `AjdvjuECVZEgZoFajaIEkg` (`STARK_ORGANIZATION`).
  - Priority attribute `pwjGSoPQMbsjmEJLDAgbaA`:
    `read_roles: ['admin']`, `write_roles: ['admin']`.
  - Approved attribute `qDgLYtdgNBjEEoPqCoMATg`:
    `write_roles: ['admin']`, read stays default.
  - Customer Profile untouched (R21's control half).

## Pre-computed deterministic ids

Computed with `api/mock-data/seed-kit.ts`'s `seedIdentifier`
(verified by running it; re-verify in Task 1 Step 3):

| Preimage (mnemonic) | Encoded id |
|---|---|
| `seed-identity-riley-okafor` | `_CgIO8a_dKa_WNNUSWlA2A` |
| `seed-cred-riley-okafor-password` | `QacaZo3vrtz5vlkyE9Z3bA` |
| `seed-invitation-riley-stark` | `Y9RaCmZFXXb2Kbk8ugJb3w` |
| `seed-invitation-riley-stark-grant` | `YJFHEn7knODIJLHy6rQTRQ` |

## Context an implementer must know (verified against source)

- **Two-pass seed.** `postMockDataLoad` (`api/mock-data.ts`)
  calls `formMockDataMessagePairs(nowUtc())` (pass 1, no tx,
  async crypto allowed), then one `TABLE_NAMES` transaction
  running `postMockDataLoadIn` (pass 2, row ops only), then
  `seedHumanCredentials` (its own local pass-1/pass-2, since
  PBKDF2 resolves late), then `postSchemaCreation()`.
  A missing pair key crashes via `requireMessagePair`.
- **Riley stays OUT of `buildMembers()`.** The members loop
  seeds one membership per entry via `assignOrganization
  (index)` (index-sensitive; pools feed objective/score
  picks). Riley gets: identity document + PII document +
  password credential + one pending invitation. NO
  membership pair, NO default-organization pair.
- **Invitation derivations need TWO pairs** (see
  `api/derive-invitations.ts`, `api/derive-states.ts`
  `deriveInvitationStates`): a POST operation pair at the
  flat `invitations` pattern whose stored body carries
  `invitationId`, `grantEventId`, `grantAt`, `identity_id`
  (uri_id resolves from `invitationId` via
  `CREATE_BODY_ID_FIELDS` in `api/message-pair.ts`), and a
  PUT document pair at `invitations/:id` whose body is
  `{ organization_id, identity_id, at }`. State 'pending' is
  the ABSENCE of any answering op pair. `invited_by_name`
  resolves from the operation pair's
  `requesterIdentityId` → PII name, so the granter must be
  Tony Stark (`XXZruirZyAOoRpNxaDnpSA`, PII name
  "Tony Stark"), whose Stark-admin grant also matches the
  live path.
- **The invitation pairs cannot ride `formSeedMessagePair`:**
  `documentSeedResponse` throws for routes absent from
  `WRITE_RESPONSE_SPECS` (invitations is a side channel that
  forms its own pairs in `api/invitations-domain.ts`), and
  the live grant stores 200-with-body responses, not the
  generic 204. A dedicated former mirrors `grantInvitation`.
- **ACL plumbing:** seeded attribute pair bodies are built by
  `recordAttributeDocumentBodyOf` (`api/routes.ts`) straight
  from the `buildRecordAttributes()` rows — explicit
  `read_roles`/`write_roles` arrays pass through; absent ones
  get `DEFAULT_ATTRIBUTE_ACL_ROLES` (`['member','admin']`)
  stamped. `recordSeedBody` maps attribute fields explicitly,
  so the composed create body never carries roles (the
  validator's key set forbids them there). Pass 2 appends the
  pre-formed pairs verbatim (`postRecordWriteOp`).
- **Org layout that R21's rewrite depends on:** records are
  partitioned by `assignOrganization(index)` over
  `buildRecords()` — Customer Profile (index 0) is Stark;
  **Project Brief (index 1) is ORGANIZATION_TWO (Wayne,
  `BBjWJsjYIDkTRKIIPrzWRw`)**. Sarah Chen is Stark-only, so
  the spec's "as Sarah Chen" for the restricted half is
  impossible; the member perspective uses Mike Thompson
  (`mike.thompson@company.com`, Wayne-only; V8 revokes his
  invitation C, so he stays Wayne-only through the walk).
  The demo admin Tony Stark is in BOTH orgs (org switcher).
- **Orphan visibility:** the PII fence hides identities that
  belong to a DIFFERENT org; an identity that belongs to NO
  org is a genuine orphan and its PII is VISIBLE (pinned by
  `tests/drift-identities.test.ts`'s three-way fence test).
  So Riley renders as a NAMED row on `identities/index.html`
  — G43's census moves (Task 3), and the fenced-PII
  expectations in drift-identities gain Riley (Task 1).
- **Known count pins that legitimately move with the world
  (Task 1, same commit):** listed in Task 1 Step 7. The seed
  adds exactly 5 message pairs: identity document, PII
  document, credential document, invitation operation,
  invitation document → `EXPECTED_MESSAGE_PAIR_COUNT`
  1448 → 1453.

---

### Task 1: Seed the zero-membership identity + pending invitation

**Files:**
- Modify: `api/mock-data/members.ts` (add
  `buildUnaffiliatedIdentity`)
- Modify: `api/mock-data/seed-message-pairs.ts` (invitation
  consts + former, two invocations, count comments)
- Modify: `api/mock-data.ts` (pass-2 writes, credential
  recipient, credential-id map entry)
- Modify: `api/mock-data/seed-hash-preimage.ts` (4 registry
  entries, header count comment)
- Test (new): `tests/mock-data-unaffiliated-identity.test.ts`
- Modify (world-moved pins, same commit):
  `tests/mock-data-pairs.test.ts`,
  `tests/credential-surfacing.test.ts`,
  `tests/pg-seed.test.ts`, `tests/drift-identities.test.ts`,
  `tests/drift-memberships-identity.test.ts`, `API.md`

**Interfaces:**
- Produces: `buildUnaffiliatedIdentity(): SeedHumanMember`
  (exported from `api/mock-data/members.ts`) — Riley's seed
  row, id `_CgIO8a_dKa_WNNUSWlA2A`, email
  `riley.okafor@example.net`.
- Produces: `UNAFFILIATED_INVITATION_ID` (exported const,
  `api/mock-data/seed-message-pairs.ts`) =
  `seedIdentifier('seed-invitation-riley-stark')`.
- Produces: `formInvitationSeedMessagePairs(requestAt):
  Promise<ReadonlyMap<string, MessagePair>>` (exported from
  `seed-message-pairs.ts`), keys
  `'invitations:<id>'` and `'invitations/:id:<id>'` via
  `seedMessagePairKey`.
- Consumes: existing `identityPersonSeedBody`,
  `humanMemberPiiSeedBody`, `formWriteMessagePair`,
  `seedHumanCredentials`, `appendMessagePair`,
  `requireMessagePair` — all already present.

- [ ] **Step 1: Write the failing world-pin test**

Create `tests/mock-data-unaffiliated-identity.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    deriveMembershipsForIdentity,
} from '../api/derive-memberships.ts';
import {
    deriveCredentialsFor,
    deriveIdentityPiiRows,
} from '../api/derive-identity-spine.ts';
import {
    deriveInvitations,
    invitationOpStateFor,
} from '../api/derive-invitations.ts';
import {
    getIdentityInvitations,
} from '../api/invitations-domain.ts';
import {
    buildUnaffiliatedIdentity,
} from '../api/mock-data/members.ts';
import {
    STARK_ORGANIZATION,
} from '../api/mock-data/seed-constants.ts';
import { sharedMockDb } from './mock-seed.ts';

// The zero-membership identity: TEST-PLAN B25–B29's
// fixture. These pin the WORLD the seed creates — the
// projection/gate logic is pinned elsewhere
// (boot-organization-gate, presenter-invitation-list,
// api-invitations-fence).

test('the seed yields a login-capable identity whose'
+ ' derived membership ledger is empty', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    assert.deepEqual(
        await deriveMembershipsForIdentity(
            db, unaffiliated.id,
        ),
        [],
    );
    const credentials = await deriveCredentialsFor(
        db, unaffiliated.id,
    );
    assert.equal(credentials.length, 1);
    assert.equal(credentials[0]!.kind, 'password');
    const pii = (await deriveIdentityPiiRows(db)).find(
        (row) => row.id === unaffiliated.id,
    );
    assert.ok(pii, 'unaffiliated identity has a PII row');
    assert.equal(pii.email, 'riley.okafor@example.net');
});

test('the unaffiliated identity holds exactly one'
+ ' pending Stark invitation', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const mine = (await deriveInvitations(db)).filter(
        (row) => row.identity_id === unaffiliated.id,
    );
    assert.equal(mine.length, 1);
    const invitation = mine[0]!;
    assert.equal(
        invitation.organization_id, STARK_ORGANIZATION,
    );
    assert.equal(invitation.state, 'pending');
    assert.equal(
        await invitationOpStateFor(db, invitation.id),
        undefined,
    );
});

test('the invitee view carries the org name and the'
+ ' inviting admin (TEST-PLAN B27 card)', async () => {
    const db = await sharedMockDb();
    const unaffiliated = buildUnaffiliatedIdentity();
    const views = await getIdentityInvitations(
        db, [unaffiliated.id], unaffiliated.id,
        undefined, [],
    ) as Record<string, unknown>[];
    assert.equal(views.length, 1);
    const view = views[0]!;
    assert.equal(
        view['organization_name'], 'Stark Industries',
    );
    assert.equal(view['invited_by_name'], 'Tony Stark');
    assert.equal(view['state'], 'pending');
});
```

- [ ] **Step 2: Run the test to verify it fails for the
  right reason**

Run:
`node --strip-types --test tests/mock-data-unaffiliated-identity.test.ts`

Expected: FAIL to even load — `buildUnaffiliatedIdentity` is
not exported from `../api/mock-data/members.ts` (a type/import
error). That is the correct red.

- [ ] **Step 3: Re-verify the pre-computed ids**

Run:

```bash
node --strip-types -e "
import('./api/mock-data/seed-kit.ts')
    .then(({ seedIdentifier }) => {
        for (const m of [
            'seed-identity-riley-okafor',
            'seed-cred-riley-okafor-password',
            'seed-invitation-riley-stark',
            'seed-invitation-riley-stark-grant',
        ]) console.log(m, '->', seedIdentifier(m));
    });"
```

Expected output (must match the table in the header —
STOP if it does not):

```
seed-identity-riley-okafor -> _CgIO8a_dKa_WNNUSWlA2A
seed-cred-riley-okafor-password -> QacaZo3vrtz5vlkyE9Z3bA
seed-invitation-riley-stark -> Y9RaCmZFXXb2Kbk8ugJb3w
seed-invitation-riley-stark-grant -> YJFHEn7knODIJLHy6rQTRQ
```

- [ ] **Step 4: Add the identity builder to
  `api/mock-data/members.ts`**

Append at the end of the file (after `buildMembers`):

```ts
// The zero-membership identity: login-capable (password
// credential, PII email) yet holding no seat anywhere —
// TEST-PLAN B25–B29 sign in as this identity to walk the
// boot/login org gate, and one seeded PENDING Stark
// invitation awaits it (seed-message-pairs.ts). NOT in
// buildMembers(): that loop seeds a membership per entry
// and assignOrganization is index-sensitive; this
// identity's whole point is the empty membership ledger.
// Outside email domain — every @company.com identity is a
// seeded member. id preimage: seed-identity-riley-okafor
// (seed-hash-preimage.ts).
export function buildUnaffiliatedIdentity():
    SeedHumanMember {
    return {
        id: '_CgIO8a_dKa_WNNUSWlA2A',
        name: 'Riley Okafor',
        email: 'riley.okafor@example.net',
        title: 'Consultant',
        department: 'Advisory',
        strengths: [
            'Process Design',
            'Facilitation',
        ],
        team_dimensions: {
            driver: 60,
            analytical: 70,
            expressive: 65,
            amiable: 72,
        },
        phone: '+1 (555) 310-6642',
        bio: 'Independent consultant'
            + ' awaiting a first'
            + ' organization membership.',
    };
}
```

- [ ] **Step 5: Form the new pairs in pass 1
  (`api/mock-data/seed-message-pairs.ts`)**

5a. Extend the members import:

```ts
import {
    buildMembers,
    buildUnaffiliatedIdentity,
} from './members.ts';
```

5b. Near `SEED_INSTANCE_ID` (the seedIdentifier-const
precedent), add:

```ts
// The unaffiliated identity's pending Stark invitation —
// exported so pass 2 (mock-data.ts) appends the SAME two
// pairs pass 1 forms. Preimages registered in
// seed-hash-preimage.ts.
export const UNAFFILIATED_INVITATION_ID =
    seedIdentifier('seed-invitation-riley-stark');
const UNAFFILIATED_INVITATION_GRANT_EVENT_ID =
    seedIdentifier('seed-invitation-riley-stark-grant');
```

5c. In `buildMockDataInvocations`, immediately AFTER the
`members.forEach((member, index) => { … });` loop closes
(before the system-identity invocation), add:

```ts
    // The unaffiliated identity
    // (buildUnaffiliatedIdentity): identity + PII
    // documents only — NO membership and NO
    // default-organization invocation; the empty
    // membership ledger IS the point (TEST-PLAN
    // B25–B29). Its credential pair rides
    // seedHumanCredentials' own pass, like every human.
    // Its invitation pairs are formed by
    // formInvitationSeedMessagePairs below — the
    // invitations side channel has no
    // WRITE_RESPONSE_SPECS entry, so they cannot ride
    // formSeedMessagePair.
    const unaffiliated = buildUnaffiliatedIdentity();
    invocations.push({
        key: seedMessagePairKey(
            'identities/:id', unaffiliated.id,
        ),
        routePattern: 'identities/:id',
        idParams: [unaffiliated.id],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: identityPersonSeedBody(unaffiliated),
    });
    invocations.push({
        key: seedMessagePairKey(
            'identities/:id/pii', unaffiliated.id,
        ),
        routePattern: 'identities/:id/pii',
        idParams: [unaffiliated.id],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: humanMemberPiiSeedBody(unaffiliated),
    });
```

5d. After `formDefaultOrganizationSeedMessagePair` (before
`formInstanceChainMessagePairs`), add the invitation former:

```ts
// The seeded pending invitation's own pair former:
// mirrors grantInvitation's fresh outcome
// (api/invitations-domain.ts) — the operation message
// pair at the flat 'invitations' collection (uri_id
// resolves from the body's invitationId via
// CREATE_BODY_ID_FIELDS, api/message-pair.ts) and the
// document message pair at invitations/:id, both HTTP_OK
// with the live handler's own response bodies, so the
// stored pair can never drift from what the live grant
// would have stored for the identical request. The
// granter is the Stark admin ('XXZruirZyAOoRpNxaDnpSA')
// — invitationIdentityView resolves invited_by_name from
// the operation pair's requesterIdentityId. One
// operationId spans both pairs, exactly as the live
// grant threads one Operation-ID through its bundle.
export async function formInvitationSeedMessagePairs(
    requestAt: string,
): Promise<ReadonlyMap<string, MessagePair>> {
    const invitationId = UNAFFILIATED_INVITATION_ID;
    const identityId = buildUnaffiliatedIdentity().id;
    const granterId = 'XXZruirZyAOoRpNxaDnpSA';
    const grantAt = MOCK_SEED_TIMESTAMP;
    const operationId = generateIdentifier();
    const grantEventId =
        UNAFFILIATED_INVITATION_GRANT_EVENT_ID;
    const messagePairs = new Map<string, MessagePair>();
    messagePairs.set(
        seedMessagePairKey('invitations', invitationId),
        await formWriteMessagePair({
            method: 'POST',
            pathname: '/invitations',
            routePattern: 'invitations',
            routeSegments: ['invitations'],
            pathSegments: ['invitations'],
            headerFields: [],
            body: {
                invitationId,
                grantEventId,
                grantAt,
                identity_id: identityId,
            },
            requesterIdentityId: granterId,
            requestAt,
            organization: undefined,
            responseStatus: HTTP_OK,
            responseBody: {
                id: invitationId,
                organization_id: STARK_ORGANIZATION,
                identity_id: identityId,
                at: grantAt,
                state: 'pending',
            },
            operationId,
        }),
    );
    const documentBody = {
        organization_id: STARK_ORGANIZATION,
        identity_id: identityId,
        at: grantAt,
    };
    messagePairs.set(
        seedMessagePairKey(
            'invitations/:id', invitationId,
        ),
        await formWriteMessagePair({
            method: 'PUT',
            pathname: '/invitations/' + invitationId,
            routePattern: 'invitations/:id',
            routeSegments: ['invitations', ':id'],
            pathSegments: ['invitations', invitationId],
            headerFields: [],
            body: documentBody,
            requesterIdentityId: granterId,
            requestAt,
            organization: undefined,
            responseStatus: HTTP_OK,
            responseBody: {
                id: invitationId,
                ...documentBody,
            },
            operationId,
        }),
    );
    return messagePairs;
}
```

5e. In `formMockDataMessagePairs`, after the
default-organization loop and before the instance-chain loop,
add:

```ts
    // The unaffiliated identity's pending Stark
    // invitation (operation + document pairs).
    for (const [key, messagePair] of
        await formInvitationSeedMessagePairs(requestAt)
    ) {
        messagePairs.set(key, messagePair);
    }
```

5f. Update the stale credential counts in this file's
comments (the world moves in this commit):
- Header block: `The 12 identity-credential document`
  `message pairs (11 human passwords + the system client`
  `secret)` → `The 13 identity-credential document`
  `message pairs (12 human passwords + the system client`
  `secret)`.
- `identityCredentialSeedBody` doc comment: `(11 human`
  `passwords + the system client secret, …)` → `(12 human`
  `passwords + the system client secret, …)`.
- `formSeedCredentialMessagePairs` doc comment: `the 12`
  `(mock-data) / 2 (bootstrap)` → `the 13 (mock-data) / 2`
  `(bootstrap)`.

- [ ] **Step 6: Write pass 2 + credentials
  (`api/mock-data.ts`)**

6a. Extend imports: add `buildUnaffiliatedIdentity` to the
`./mock-data/members.ts` import, and
`UNAFFILIATED_INVITATION_ID` to the
`./mock-data/seed-message-pairs.ts` import list.

6b. Add the credential-id map entry (inside
`SEED_PASSWORD_CREDENTIAL_BY_IDENTITY`, keep the object's
existing style; note the previous last line gains a comma):

```ts
    'hPrdaZfedPOJYevSaGziHw': 'yUTTGOBIUIRXFLdXmPmFGA',
    '_CgIO8a_dKa_WNNUSWlA2A': 'QacaZo3vrtz5vlkyE9Z3bA'
```

6c. In `postMockDataLoadIn`, after
`const members = buildMembers();` add:

```ts
    const unaffiliated = buildUnaffiliatedIdentity();
```

and add these three entries to the FIRST `Promise.all` array
(alongside the system-identity entry):

```ts
        postIdentityDocumentOp(
            adapter,
            unaffiliated.id,
            identityPersonSeedBody(unaffiliated),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'identities/:id', unaffiliated.id,
                ),
            ),
        ),
        postIdentityPiiDocumentOp(
            adapter,
            unaffiliated.id,
            humanMemberPiiSeedBody(unaffiliated),
            SYSTEM_MEMBER_ID,
            requireMessagePair(
                messagePairs,
                seedMessagePairKey(
                    'identities/:id/pii', unaffiliated.id,
                ),
            ),
        ),
        (async () => {
            // Live grant order: operation, then document
            // (grantInvitation, invitations-domain.ts).
            await appendMessagePair(
                adapter,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'invitations',
                        UNAFFILIATED_INVITATION_ID,
                    ),
                ),
            );
            await appendMessagePair(
                adapter,
                requireMessagePair(
                    messagePairs,
                    seedMessagePairKey(
                        'invitations/:id',
                        UNAFFILIATED_INVITATION_ID,
                    ),
                ),
            );
        })(),
```

(`identityPersonSeedBody` and `humanMemberPiiSeedBody` are
already in this file's seed-message-pairs import list — no
import change for them.)

6d. In `postMockDataLoad`, widen the credential recipients:

```ts
    const creds = await seedHumanCredentials(
        adapter,
        [
            ...buildMembers(),
            buildUnaffiliatedIdentity(),
        ].map((member) => ({
            identityId: member.id,
            email: member.email,
        })),
        options?.hashPassword,
    );
```

and touch the comment above it: `Task 1(d): same
buildMembers enumeration that pass 2 used for PII` →
`Task 1(d): same buildMembers (+ the unaffiliated
identity) enumeration that pass 2 used for PII`.

6e. `api/mock-data/seed-hash-preimage.ts`: insert the four
entries at their case-insensitively sorted positions,
matching the file's evident ordering (put the
`_CgIO8a_dKa_WNNUSWlA2A` entry LAST, before the closing
brace — `_` has no letter fold):

```ts
    'QacaZo3vrtz5vlkyE9Z3bA':
        'seed-cred-riley-okafor-password',
    'Y9RaCmZFXXb2Kbk8ugJb3w': 'seed-invitation-riley-stark',
    'YJFHEn7knODIJLHy6rQTRQ':
        'seed-invitation-riley-stark-grant',
    '_CgIO8a_dKa_WNNUSWlA2A': 'seed-identity-riley-okafor',
```

(If a wrapped-value line breaks the file's one-line-per-entry
style under 78 chars, keep one line where it fits and wrap
only where it does not.)

- [ ] **Step 7: Run the new test — green; then measure the
  moved pins**

Run:
`node --strip-types --test tests/mock-data-unaffiliated-identity.test.ts`
Expected: 3 tests PASS.

Run: `./test`
Expected FAILS (the world moved — each updates NOW, same
commit; any OTHER failure is a bug in Steps 4–6, stop and
fix):

1. `tests/mock-data-pairs.test.ts` — actual pair count 1453
   vs pinned 1448. Verify the failure output says 1453.
   Update `EXPECTED_MESSAGE_PAIR_COUNT = 1453`, and in its
   comment: change `+ 12 identity-credential` /
   `11 human password credentials` to
   `+ 13 identity-credential` /
   `12 human password credentials`, and append before the
   `Measure after seed` sentence:
   `+ 2 unaffiliated-identity documents (identities/:id +`
   `identities/:id/pii for the zero-membership identity —`
   `no membership, no default-organization pair) + 2`
   `invitation pairs (the seeded pending Stark`
   `invitation's operation + document,`
   `formInvitationSeedMessagePairs)`.
2. `tests/credential-surfacing.test.ts` — title
   `'mock-data surfaces exactly eleven human credentials'`
   → `…exactly twelve…`; `assert.equal(creds.identities`
   `.length, 11)` → `12`; comment `11 human passwords`
   `(buildMembers)` → `12 human passwords (buildMembers +`
   `buildUnaffiliatedIdentity)`.
3. `tests/pg-seed.test.ts`
   `'mock-data seed prints every human sign-in'` — tab-line
   count `11` → `12`.
4. `tests/drift-identities.test.ts` — four measured moves:
   identities collection `12` → `13` (and its title
   `12 incl. system` → `13 incl. system`); identity-pii rows
   `11` → `12` twice (titles `(11 seeded slots)` →
   `(12 seeded slots)`); credentials `12` → `13`. The
   three-way viaMembership fence legs now include Riley: an
   orphan (member of NO org) is VISIBLE in BOTH orgs' fenced
   PII collections — extend the fenced expectations with
   Riley's row per the actual failure output. Never weaken
   the foreign-org-hidden assertions.
5. `tests/drift-memberships-identity.test.ts` — extend
   `allSeededIdentityIds()` with
   `buildUnaffiliatedIdentity().id` (import it), update its
   comment (`the 11 seeded humans` → `the 12 seeded humans,`
   `the zero-membership identity included`), change
   `assert.equal(ids.length, 12)` → `13`, and the leg-1
   title `(11 humans + system) — 12 seat documents total`
   → `(12 humans + system) — 12 seat documents total`.
   `assert.equal(total, 12)` STAYS 12 — Riley holds no seat.

Then hand edits with no red test of their own:
- `API.md` line ~179:
  `` `EXPECTED_MESSAGE_PAIR_COUNT = 1448`; bootstrap `` →
  `` `EXPECTED_MESSAGE_PAIR_COUNT = 1453`; bootstrap ``.
- `api/mock-data/seed-hash-preimage.ts` header comment:
  `92 actuals / 1448 pairs` → `92 actuals / 1453 pairs`.

- [ ] **Step 8: Run the full gate**

Run: `./validate`
Expected: green. Any remaining red is a bug in this task —
fix the CODE (or, only for a pin whose covenant the seed
legitimately changed, the pin — argue it from the world, not
from convenience).

- [ ] **Step 9: Commit**

```bash
git add api/mock-data.ts api/mock-data \
    tests/mock-data-unaffiliated-identity.test.ts \
    tests/mock-data-pairs.test.ts \
    tests/credential-surfacing.test.ts \
    tests/pg-seed.test.ts \
    tests/drift-identities.test.ts \
    tests/drift-memberships-identity.test.ts \
    API.md
git commit -m "Seed a zero-membership identity with invitation

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015tsCDbsF8Hc1MTwf3niJcv"
```

---

### Task 2: Restrict Project Brief seed ACLs

**Files:**
- Modify: `api/mock-data/records.ts` (widen the seed row
  type; two rows gain explicit ACLs)
- Test: `tests/mock-data-records.test.ts` (one new
  world-pin test)

**Interfaces:**
- Produces: `SeedRecordAttribute` (exported type,
  `api/mock-data/records.ts`) =
  `Omit<RecordAttributeEntity, 'organization_id'> &
  { read_roles?: string[]; write_roles?: string[] }`;
  `buildRecordAttributes(): SeedRecordAttribute[]`.
- Consumes: `loadAttributeSchemaById` (exported,
  `api/routes.ts`) → `Map<string, AttributeSchemaRow>` with
  `readRoles`/`writeRoles` arrays;
  `projectBriefRecordId` / `customerProfileRecordId`
  (exported, `api/mock-data/records.ts`).
- Downstream (no change needed, verified):
  `recordAttributeDocumentBodyOf` passes explicit arrays
  through and stamps `['member','admin']` where absent;
  `recordSeedBody` maps attribute fields explicitly, so the
  composed create body never carries roles.

- [ ] **Step 1: Write the failing test**

Append to `tests/mock-data-records.test.ts`. Extend its
imports: add `loadAttributeSchemaById` to the existing
`../api/routes.ts` import, and add:

```ts
import {
    customerProfileRecordId,
    projectBriefRecordId,
} from '../api/mock-data/records.ts';
```

Then append the test:

```ts
test(
    'Project Brief Priority and Approved carry the'
    + ' restricted seed ACLs; the rest keep the default',
    async () => {
        const db = await seeded();
        const projectBrief = await loadAttributeSchemaById(
            db, ORGANIZATION_TWO, projectBriefRecordId,
        );
        const priority = projectBrief.get(
            'pwjGSoPQMbsjmEJLDAgbaA',
        );
        assert.ok(priority, 'Priority attribute exists');
        assert.deepEqual(priority.readRoles, ['admin']);
        assert.deepEqual(priority.writeRoles, ['admin']);
        const approved = projectBrief.get(
            'qDgLYtdgNBjEEoPqCoMATg',
        );
        assert.ok(approved, 'Approved attribute exists');
        assert.deepEqual(
            approved.readRoles, ['member', 'admin'],
        );
        assert.deepEqual(approved.writeRoles, ['admin']);
        const projectName = projectBrief.get(
            'ptlpsUrQssxuTLkouUAnNw',
        );
        assert.ok(projectName, 'Project Name exists');
        assert.deepEqual(
            projectName.readRoles, ['member', 'admin'],
        );
        assert.deepEqual(
            projectName.writeRoles, ['member', 'admin'],
        );
        const customerProfile =
            await loadAttributeSchemaById(
                db, STARK_ORGANIZATION,
                customerProfileRecordId,
            );
        assert.ok(customerProfile.size >= 3);
        for (const row of customerProfile.values()) {
            assert.deepEqual(
                row.readRoles, ['member', 'admin'],
            );
            assert.deepEqual(
                row.writeRoles, ['member', 'admin'],
            );
        }
    },
);
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
`node --strip-types --test tests/mock-data-records.test.ts`
Expected: the new test FAILS on
`priority.readRoles` — `['member','admin']` vs `['admin']`.
Existing tests stay green.

- [ ] **Step 3: Change the seed rows**

In `api/mock-data/records.ts`:

3a. Below the imports, add the type; change
`buildRecordAttributes`'s return type to
`SeedRecordAttribute[]`:

```ts
// Seed attribute rows may carry an explicit ACL. Where the
// arrays are absent, recordAttributeDocumentBodyOf
// (api/routes.ts) stamps DEFAULT_ATTRIBUTE_ACL_ROLES into
// the stored attribute document — storage always carries
// both arrays explicitly, so absence here means "default",
// never "unset".
export type SeedRecordAttribute =
    Omit<RecordAttributeEntity, 'organization_id'> & {
        read_roles?: string[];
        write_roles?: string[];
    };
```

3b. Priority row (`pwjGSoPQMbsjmEJLDAgbaA`) gains, after
`constraints: [],`:

```ts
            // TEST-PLAN R21's restricted half: admin-only
            // read AND write — ABSENT from a member's New
            // instance form. Write tightens with read:
            // what a member cannot read a member must not
            // write.
            read_roles: ['admin'],
            write_roles: ['admin'],
```

3c. Approved row (`qDgLYtdgNBjEEoPqCoMATg`) gains, after
`constraints: [],`:

```ts
            // TEST-PLAN R21's restricted half: default
            // read, admin-only write — data-access=
            // "readonly" for a member.
            write_roles: ['admin'],
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
`node --strip-types --test tests/mock-data-records.test.ts`
Expected: all PASS.

- [ ] **Step 5: Run the full gate (the spec's
  member-transition hazard check)**

Run: `./validate`
Expected: green. The spec names a hazard: any test driving a
MEMBER transition through the "Solution" node would surface
red here. Research predicts NONE exists (only
`tests/drift-records.test.ts` touches Project Brief, with
admin tokens on both sides of wire-vs-derive parity). If one
DOES surface: a genuinely changed covenant updates with this
commit; anything else is a bug in this change — judge it,
do not silence it.

- [ ] **Step 6: Commit**

```bash
git add api/mock-data/records.ts \
    tests/mock-data-records.test.ts
git commit -m "Restrict Project Brief seed ACLs

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015tsCDbsF8Hc1MTwf3niJcv"
```

---

### Task 3: Rewrite the unblocked TEST-PLAN cases

**Files:**
- Modify: `TEST-PLAN.md` (B25–B29 setup, B27, B28, R21, V8,
  G43; nothing else)

No code, no tests: `TEST-PLAN.md` is the walk's script; its
truth was pinned by Tasks 1–2. The Summary table does NOT
move (case count unchanged). The BLOCKED driving notes for
B21, AA32/F19, and WB16 (near the top, "Driving notes")
STAY — those cases remain honestly BLOCKED. Do not touch
G46's erase-caution (B/V cases run before G46; nothing after
G46 needs Riley).

- [ ] **Step 1: Replace the B25–B29 setup paragraph**

Find the blockquote line beginning
`> Setup for B25–B29:` (under
`### Zero-membership landing (org gate)`). Replace the whole
paragraph with:

```markdown
> Setup for B25–B29: these exercise the boot/login org gate that lands a ZERO-membership identity on its pending invitations (accepting one grants the first membership and unblocks every org-scoped route). The mock seed provides that identity: Riley Okafor, `riley.okafor@example.net` — login-capable (its `username<TAB>password` line prints on crank stdout with the other demo sign-ins), holder of ZERO membership rows, with one seeded PENDING invitation from Stark Industries. Sign in as Riley with the stdout credentials to enter the zero-membership state. Do NOT accept (or decline) the pending invitation while B25–B29 are in flight — accepting grants the first membership and breaks B26/B29 on the same pass. `getOrganizations` is fenced to the derived membership ledger, so an identity that truly reaches no org lands here regardless of how it got there.
```

- [ ] **Step 2: Replace B27's case line and extend its pin**

Replace the `- [ ] **B27** …` line with:

```markdown
- [ ] **B27** As the zero-membership identity, land on `invitations/index.html`. PASS: the page renders and STAYS — no redirect loop (the gate's self-guard exempts the invitations page); it shows the seeded pending invitation card — Stark Industries, an "Invited by Tony Stark · {date}" sub-line, a Pending state badge, and Accept / Decline buttons. Click neither — B29 still needs the zero-membership state.
```

Replace B27's pin block with:

```markdown
  Pin: tests/boot-organization-gate.test.ts
       'invitations page keeps an empty organization
       list' (its `resolveOrganizationGate([],
       'invitations')` assertion returns the empty
       list itself, not `null` — the self-guard);
       tests/mock-data-unaffiliated-identity.test.ts
       'the invitee view carries the org name and the
       inviting admin (TEST-PLAN B27 card)' (decides
       the seeded pending row this card renders);
       tests/presenter-invitation-list.test.ts 'a
       pending invitation shows the org, inviter, and
       Accept / Decline' (decides the card's shape);
       exploratory — the live stay and the rendered
       seeded card
```

- [ ] **Step 3: Replace B28's case line**

Replace the `- [ ] **B28** …` line with (pin block stays):

```markdown
- [ ] **B28** Sign in as an untouched seeded member (any non-Riley credential from crank stdout, e.g. the demo admin), then load a gated page. PASS: lands on the `?return=` target / dashboard as before — the org gate does not fire for an identity that reaches an org (B16/B18 unaffected by the new gate).
```

- [ ] **Step 4: Rewrite R21**

Replace the entire `- [ ] **R21** …` case (its prose AND its
pin block, through the line before `## J. Teardown`) with:

```markdown
- [ ] **R21** ACL projection (member vs admin). The New
  instance form's per-attribute access
  (`data-access="writable"` / `"readonly"` / omitted)
  follows each attribute's `read_roles`/`write_roles`,
  with admin bypassing both. Default half (Customer
  Profile, Stark — every attribute keeps the default
  `['member','admin']` ACL): as the demo admin, click New
  instance on Customer Profile — every field renders
  `data-access="writable"`; sign in as Sarah Chen
  (`sarah.chen@company.com`, a Stark member) and open New
  instance — every field still renders
  `data-access="writable"`. Restricted half (Project
  Brief, Wayne — the seed sets Priority to
  `read_roles: ['admin']` / `write_roles: ['admin']` and
  Approved to `write_roles: ['admin']`): as the demo
  admin switched to Wayne Enterprises, click New instance
  on Project Brief — every field, Priority and Approved
  included, renders `data-access="writable"` (admin
  bypass); sign in as Mike Thompson
  (`mike.thompson@company.com`, a Wayne-only member) and
  open New instance on Project Brief — Approved renders
  `data-access="readonly"`, Priority is ABSENT from the
  form, and Project Name / Description stay writable.
  Setting an ACL remains `PUT …/attributes/:id` only — no
  UI reaches it; the seed, not the walk, produced the
  restricted state (TODO.md names the ACL-editing UI).
  Pin: tests/presenter-record-instances.test.ts
       'projectInstanceFields drops unreadable and
       marks write vs read';
       tests/presenter-record-instances.test.ts
       'projectInstanceFields: admin bypasses ACL';
       tests/mock-data-records.test.ts 'Project Brief
       Priority and Approved carry the restricted seed
       ACLs; the rest keep the default' (decides the
       seeded ACL world this case walks);
       tests/adapters-record-attributes.test.ts
       'getRecordAttributesByRecord maps storage rows
       to the camelCase domain shape'; exploratory —
       the live four-way comparison across the two
       record types and the two sign-ins
```

Note the deliberate deviation from the spec's draft: the
spec wrote "as Sarah Chen" for the restricted half, but
Project Brief lives in ORGANIZATION_TWO
(`assignOrganization(1)`, pinned by
`tests/drift-records.test.ts`) and Sarah Chen is Stark-only —
she cannot reach the form. Mike Thompson is Wayne-only for
the whole walk (V8 revokes his invitation C). The commit
carries the correction; the spec file is not edited.

- [ ] **Step 5: Sweep V8 (Sent invitations)**

Three edits inside the `- [ ] **V8 …**` case:

5a. `Grant invitation C if none is pending (V4 consumed A;
V5 declined B).` → `Grant invitation C (V4 consumed A; V5
declined B).`

5b. After the sentence ending `…a state badge, and a Revoke
button.` insert:

```markdown
  TWO rows are pending here: invitation C and the SEEDED
  pending invitation to `riley.okafor@example.net`
  (present from boot — B25–B29's fixture; do NOT revoke
  it).
```

5c. Replace `With no outstanding invitations, the list shows
"No outstanding invitations."` with:

```markdown
  Riley's seeded row remains pending after C is revoked,
  so the live empty state is not reachable on this walk;
  tests/presenter-invitation-list.test.ts 'an empty sent
  list shows the empty state' alone decides the "No
  outstanding invitations." copy.
```

- [ ] **Step 6: Update G43's identity-roster census**

In the `- [ ] **G43** …` case, replace:

`the list renders 6 named person rows (Emily Rodriguez,
Sarah Chen, Lisa Wang, Marcus Johnson, Tony Stark, Jessica
Park), plus a 7th, Jordan Rivera, if AA5's create held;`

with:

`the list renders 7 named person rows (Emily Rodriguez,
Sarah Chen, Lisa Wang, Marcus Johnson, Tony Stark, Jessica
Park, and Riley Okafor — the zero-membership identity is a
genuine ORPHAN, and the viaMembership fence hides only
identities that belong to a DIFFERENT org, so an orphan's
PII is visible), plus an 8th, Jordan Rivera, if AA5's
create held;`

(The `5 "Identity without PII"` and `1 service row` clauses
stay.)

- [ ] **Step 7: Verify the sweep is complete**

Run and eyeball each hit — every remaining mention must
already be consistent with the new world:

```bash
grep -n "zero-membership\|riley\|Riley" TEST-PLAN.md
grep -n "No outstanding invitations" TEST-PLAN.md
grep -n "6 named\|BLOCKED for B25" TEST-PLAN.md
```

Expected: `BLOCKED for B25` and `6 named` return nothing;
Riley mentions appear only in the B-setup, B27, B28 (as
"non-Riley"), V8, and G43. The Summary table still reads
`| B. Entry Pages | 31 |` and `| Total | 401 |` — case
count unchanged.

- [ ] **Step 8: Gate and commit**

Run: `./validate` (TEST-PLAN.md is exempt from the 78-char
lint, but the gate must still be green).

```bash
git add TEST-PLAN.md
git commit -m "Rewrite TEST-PLAN cases unblocked by the seed

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015tsCDbsF8Hc1MTwf3niJcv"
```

---

### Task 4: Append the two TODO.md product-UI items

**Files:**
- Modify: `TODO.md` (two bullets at the very end of
  `## Later work`, immediately before `## Sequencing`)

- [ ] **Step 1: Append the two bullets**

At the end of the `## Later work` bullet list (after the
final bullet about the first click after a page reload,
before the `## Sequencing` header), append:

```markdown
- ACL-editing UI for record attributes (`read_roles` /
  `write_roles`) — R21's restricted branches are
  seed-produced today; setting an ACL is
  `PUT …/attributes/:id` only, and no page reaches it.
  Oracle: an admin edits an ACL through the UI and a
  member-perspective New-instance form flips live;
  TEST-PLAN R21 gains the write path as a user gesture
- Member-removal affordance under members/identities —
  zero-membership is seed-produced today (Riley Okafor);
  no page deletes a membership row. Oracle: removing a
  member's last seat lands that identity on
  `invitations/index.html` at next boot (TEST-PLAN
  B25–B29 driven live); restores B28's original
  "restore the deleted membership row" branch
```

- [ ] **Step 2: Gate and commit**

Run: `./validate`
Expected: green.

```bash
git add TODO.md
git commit -m "Note ACL and member-removal UI in TODO

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_015tsCDbsF8Hc1MTwf3niJcv"
```

---

## Completion checklist (whole plan)

- [ ] Four commits, in the spec's order, each `./validate`
      green.
- [ ] `git log --oneline -4` reads: TODO note, TEST-PLAN
      rewrite, ACL restriction, seed identity — newest
      first.
- [ ] No product code changed:
      `git diff master --stat -- api server web-app shared`
      touches ONLY `api/mock-data.ts` and `api/mock-data/*`.
- [ ] The operator (not this plan) runs Layer 2
      (`./test-all`) before any build/walk. In THIS
      worktree, `npm ci` skipped esbuild's postinstall
      (`npm install-scripts approve esbuild` first if
      Layer 2 / `./build` is run here).
- [ ] Hand back for review; the serial walk (Layer 3) is
      exploration and gates nothing.
