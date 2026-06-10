# AUDIT-REPORT — the Doctrine Audit of fusion-ai

Whole-repository audit against every section of the Church of Code scripture,
per AUDIT.md: one indoctrinated hunter per section, mechanical consolidation,
adversarial refutation of every finding. Report-only; the repository was not
mutated.

## Header

- HEAD: a1c603a6fe90e522b631a7758542f724027ca7c0
- Tree: clean at audit start; clean at report time
- Scripture: the Church of Code v1.14 (full scroll)
- Run date (hunt dispatch): 2026-06-10T01:50:37Z
- Validate (sandbox form, TMPDIR=/tmp/claude ./validate):
  GREEN — exit 0; tsc clean; node:test 1,567 + 3 pass, 0 fail; 78-char lint
  clean; SCHEMA.svg matches the schema of record.
- Roster: 60 sections — 12 commandments, 19 articles,
  22 abominations, 7 offices (derived by grep this run)
- Agents: 60 hunters dispatched, 0 FAILED roster rows.
  A monthly spend limit interrupted the run twice: 14 hunters died and were
  re-run live on a journal resume; 106 refuters died and were re-dispatched
  via a hand-authored continuation workflow over exactly the UNVERIFIED
  findings. Final coverage is complete: every finding carries an adversarial
  verdict.
- Raw findings 236, consolidated (merged) 202; refuter
  verdicts: 96 (main run) + 106 (continuation);
  tie-breakers: 0; second refuters (NEW Commandment II): 2.

## Executive summary

VERDICT: after full adversarial refutation, 188 of 202 consolidated findings
stand CONFIRMED; 14 were REFUTED by evidence; 0 DISPUTED; 0 UNVERIFIED. The
./validate gate is GREEN, so Commandment I opens with no failing gate.
Refuters additionally split 15 merged findings into 28 more-precise child
defects, each confirmed on read.

Confirmed findings by commandment (severity is the lowest
numeral implicated, surviving refutation):

-    I:  25 confirmed
-   II:  11 confirmed
-  III:  28 confirmed
-   IV:   2 confirmed
-    V:  44 confirmed, 1 refuted
-   VI:   5 confirmed, 1 refuted
-  VII:   2 confirmed
- VIII:  18 confirmed, 3 refuted
-   IX:  39 confirmed, 5 refuted
-    X:   3 confirmed, 3 refuted
-   XI:   3 confirmed, 1 refuted
-  XII:   8 confirmed

Security: all 7 KNOWN seam flags from ARCHITECTURE.md § Server-tier deploy
blockers re-confirmed present and unwidened (9 KNOWN-tagged findings, 9
confirmed). 9 NEW security-relevant findings were reported; their verdicts
follow.

NEW security-relevant findings:

- [I] api/ledger-reduction.ts:4 — CONFIRMED
  The 'later-APPENDED row wins' tie-break premise is false on the production
  tier: IndexedDB getAll/getWhere return rows in primary-key order (random
  base62 ids, backend-indexeddb.ts:113), while the memory/localStorage tiers
  the tests run on return append order (backend-buffer-tx.ts:83 rows.push). On
  a same-millisecond `at` tie (nowUtc is ms-resolution padded to fake
  microseconds) the winner is decided by random id order — the comment's own
  security claim 'a revoke beats a co-timestamped issue' is not guaranteed
  where it matters, and no memory-tier test can catch it
- [I] api/validators.ts:560 — CONFIRMED
  Timestamp gate admits variable sub-second widths that mis-sort the
  append-only ledgers
- [I] build:61 — CONFIRMED
  Build toolchain (tsc, tsx, esbuild) resolved by npx with no declared
  dependency and no lockfile — ambient/latest version executes at every
  build
- [II] api/store-org-scoped.ts:106 — CONFIRMED
  Org write fence reads EntityNotFound as 'brand-new id', letting a put
  clobber and re-stamp a tombstoned foreign-org row
- [II] web-app/app/flow-graph.ts:580 — CONFIRMED
  Flow-graph SVG interpolates node/edge id unescaped into an attribute
  (stored-XSS injection seam)
- [IV] api/authentication.ts:240 — CONFIRMED
  Same-second boundary: tokens minted up to a second before a
  logout-everywhere revocation survive it
- [IV] api/authorization.ts:14 — CONFIRMED
  The 'later-appended wins' tiebreak premise is false on the production
  IndexedDB backend — the claimed secure revoke-beats-grant tie is
  primary-key (random id) order
- [X] api/store-org-scoped.ts:75 — CONFIRMED
  Org-fence guard and write commit in separate transactions on the
  single-request path — the check-then-stamp is not one action.
  db-org-scoped.ts:137-139 confesses the in-tx re-scope closes 'the TOCTOU for
  free', but handleRequest dispatches single PUT/DELETE on the fenced store
  standalone, where #assertWritable opens its own readonly tx and #inner.put a
  second readwrite tx; two concurrent creates of one id under different orgs
  can both pass the guard, last write stamping the other tenant's org
- [X] web-app/app/adapters/identity-tokens.ts:19 — REFUTED
  Cross-tab exclusivity coordinated by read-then-commit on the shared ledger,
  not by message or platform lock

## Findings ledger

Scripture order by owning section (the most specific doctrine: abomination >
office > article > commandment). Every finding retains its verdict; REFUTED
findings stay in the ledger per the runbook, with the killing evidence in the
refutation ledger. Snippet lines longer than the lint limit are truncated and
marked […]; fidelity lives at the cited file:line.

### I. Reliability

F-001 [I] api/ledger-reduction.ts:4
    The 'later-APPENDED row wins' tie-break premise is false on the production
    tier: IndexedDB getAll/getWhere return rows in primary-key order (random
    base62 ids, backend-indexeddb.ts:113), while the memory/localStorage tiers
    the tests run on return append order (backend-buffer-tx.ts:83 rows.push).
    On a same-millisecond `at` tie (nowUtc is ms-resolution padded to fake
    microseconds) the winner is decided by random id order — the comment's
    own security claim 'a revoke beats a co-timestamped issue' is not
    guaranteed where it matters, and no memory-tier test can catch it
    symbol: latestByKey · sites: 1 · security: NEW · CONFIRMED
    doctrine: "You may achieve every other virtue in this scripture and still
    have NOTHING if your code is not reliable."

        // default is the SECURE tiebreak: on an equal RFC-3339 zulu `at`
        // (which sorts lexically = chronologically), the later-APPENDED
        // row wins (>=), so a revoke beats a co-timestamped issue. Sites

    more sites: api/backend-indexeddb.ts:113, api/backend-buffer-tx.ts:83,
    api/identity-tokens.ts:22, api/authorization.ts:27,
    api/authorization-codes.ts:24

F-002 [I] api/store-state.ts:142
    One ledger, two truths: currentForIn keeps the FIRST-appended row on a
    same-`at` tie (strict >) while deletedIdsIn/isDeletedIn keep the LAST (>=)
    — on a co-timestamped pair ('deleted' then 'active') currentFor reports
    'deleted' while isDeleted reports false, so list filtering and lifecycle
    reads contradict each other
    symbol: StateStore.currentForIn · sites: 3 · security: - · CONFIRMED
    contributors: I. Reliability; IV. Logic
    doctrine: "You may achieve every other virtue in this scripture and still
    have NOTHING if your code is not reliable."

                // Strict `>` keeps the FIRST-appended row on a
                // same-`at` tie — deliberately unlike deletedIdsIn.
                return latestByKey(
                    rows, row => row.entity_id,
                    (a, b) => a.at > b.at,
                ).get(entityId) ?? null;

    more sites: api/store-state.ts:170, api/store-state.ts:189, SCHEMA.md:38,
    SCHEMA.md:618, api/api.ts:1222, tests/store-state-tx.test.ts:129

F-003 [I] web-app/flows/detail.ts:1234
    Debounced property edits (node name, task instructions, edge name) are
    lost on navigation: Debouncer.flush() runs only inside update()
    (flows/detail.ts:608) and no pagehide/beforeunload/visibilitychange
    handler exists anywhere in the app — every page is a full <a href>
    navigation, so leaving within the 800 ms SAVE_DELAY_MS window silently
    drops the pending commit
    symbol: input listener (property panel) · sites: 3 · security: -  […]
    doctrine: "Degrade visibly rather than corrupt silently."

                    if (id === 'prop-node-name') {
                        pageState.saveDebouncer().schedule(
                            () => commit(
                                pageState.presenter()
                                    .withNodeNamed(value),
                                { advanceHistory: true },

    more sites: web-app/flows/detail.ts:1245, web-app/flows/detail.ts:1255

F-004 [I] web-app/organization/index.ts:445
    Pattern: void-called async page handlers without internal rejection
    handling, and no global unhandledrejection handler exists — failures
    vanish to console while the UI proceeds (e.g. postObjectiveReactivation in
    onObjectiveAction fails with zero user feedback; organization handleSave's
    post-save refetch Promise.all is outside its try)
    symbol: bindStableListeners · sites: 12 · security: - · CONFIRMED
    doctrine: "Degrade visibly rather than corrupt silently."

            void onObjectiveAction(e);

    more sites: web-app/organization/index.ts:426,
    web-app/organization/index.ts:438, web-app/organization/index.ts:442,
    web-app/organization/index.ts:476, web-app/organization/index.ts:492,
    web-app/identities/index.ts:198, web-app/identities/index.ts:232,
    web-app/projects/detail.ts:259, web-app/projects/detail.ts:277,
    web-app/projects/detail.ts:294, web-app/app/command-palette.ts:941

### II. Security

F-005 [II] api/access-token.ts:71
    KNOWN re-confirm: Client-shipped HMAC key
    symbol: SIGNING_KEY_MATERIAL · sites: 1 · security: KNOWN · CONFIRMED
    doctrine: ""A breach is not an accident — it is a covenant broken with
    everyone who trusted us with their data." (II. Security)"

        const SIGNING_KEY_MATERIAL =
            'dev-co-located-hmac-secret-frozen-wire-format';

    more sites: api/access-token.ts:115

F-006 [II] api/api.ts:147
    KNOWN re-confirm: Bearer-exempt snapshot plane (+ in-band mock-data
    credential reveal)
    symbol: BEARER_EXEMPT_ROUTES · sites: 2 · security: KNOWN · CONFIRMED
    doctrine: ""The data, once leaked, cannot be unleaked." (II. Security)"

        const BEARER_EXEMPT_ROUTES: ReadonlySet<string> =
            new Set([
                'snapshots/schema',
                'snapshots/mock-data',
                'snapshots/bootstrap',
                'snapshots/import',

    more sites: api/mock-data.ts:500

F-007 [II] api/authentication.ts:341
    KNOWN re-confirm: Unenforced token-exchange delegation
    symbol: grantTokenExchange · sites: 1 · security: KNOWN · CONFIRMED
    doctrine: ""A breach is not an accident — it is a covenant broken with
    everyone who trusted us with their data." (II. Security)"

        // DELEGATION POLICY: whether `actor` may act-as `subject` is NOT
        // yet enforced — that authorization lands with the server tier.
        async function grantTokenExchange(

F-008 [II] api/authorization.ts:61
    KNOWN re-confirm: Admin-or-nothing ROUTE_POLICY
    symbol: ROUTE_POLICY · sites: 1 · security: KNOWN · CONFIRMED
    doctrine: ""A compromised system is a fallen system." (II. Security)"

        export const ROUTE_POLICY: readonly PolicyEntry[] = [
            { verb: 'GET', pathPrefix: '/', roles: ['admin'] },
            { verb: 'PUT', pathPrefix: '/', roles: ['admin'] },
            { verb: 'POST', pathPrefix: '/', roles: ['admin'] },
            { verb: 'DELETE', pathPrefix: '/', roles: ['admin'] },
        ];

F-009 [II] web-app/app/adapters/init.ts:53
    KNOWN re-confirm: De-membership latency on the token claim
    symbol: SESSION_TTL_SECONDS · sites: 1 · security: KNOWN · CONFIRMED
    doctrine: ""A compromised system is a fallen system." (II. Security)"

        const SESSION_TTL_SECONDS = 15 * 60;

F-010 [II] web-app/app/flow-graph.ts:580
    Flow-graph SVG interpolates node/edge id unescaped into an attribute
    (stored-XSS injection seam)
    symbol: buildNode · sites: 2 · security: NEW · CONFIRMED
    doctrine: ""A breach is not an accident — it is a covenant broken with
    everyone who trusted us with their data." (II. Security) — graph ids are
    validated only as bare strings (validators.ts asGraphNode:
    asString(obj['id'])) and rendered inside trusted() with no escaping, while
    the read-only sibling flow-stats-graph.ts escapes the same value (idEsc =
    escapeForHtml(n.id))."

                + ` data-node-id="${node.id}"`

    more sites: web-app/app/flow-graph.ts:859

### III. Uniformity

F-011 [III] api/authentication.ts:152
    MS_PER_SECOND named at api/types.ts:390 yet the literal 1000 spells the
    same conversion at six sites
    symbol: mintTokenResponse (iat computation) · sites: 6 · security: […]
    doctrine: "III: "Name what is opaque; leave the self-disclosing alone —
    see the Abomination on Magical Values for the full teaching." The codebase
    already named the constant (export const MS_PER_SECOND = 1000,
    types.ts:390, used in 6 files, e.g. state-events.ts:159 lockTimeout *
    MS_PER_SECOND) — yet the ms→s conversion is spelled with the bare
    literal at six other sites: one conversion, two spellings."

            const iat = Math.floor(Date.now() / 1000);

    more sites: api/access-token.ts:330, api/authentication.ts:265,
    api/authentication.ts:353, api/api.ts:967,
    web-app/app/command-palette.ts:721

F-012 [III] api/db.ts:38
    Thrown-failure class naming drift: Error suffix on 10 of 13, absent on 3
    throwables, and present on a non-Error
    symbol: EntityNotFound · sites: 4 · security: - · CONFIRMED
    doctrine: "III: "Call a thing a thing, in all things." EntityNotFound is
    thrown (store-entity.ts:89, store-state.ts:61) yet carries no Error family
    marker and does not extend Error; ZipLimitExceeded (zip.ts:27) and
    RecordTransitionViolations (record-transitions.ts:31) extend Error without
    the suffix; ApiError (api.ts:84) carries the suffix while NOT extending
    Error (the contrast is documented at api.ts:102 but the name still reads
    wrong: instanceof Error rejects an 'ApiError')."

        export class EntityNotFound {
            readonly message: string;
            readonly table: string;
            readonly id: string;

    more sites: web-app/app/zip.ts:27,
    web-app/app/adapters/record-transitions.ts:31, api/api.ts:84

F-013 [III] api/db.ts:357
    One noun, two spellings in the schema contract: table
    'identity_default_orgs' abbreviates what 'organizations' and its own
    organization_id column spell in full
    symbol: TABLE_NAMES · sites: 3 · security: - · CONFIRMED
    doctrine: "III: "Call a thing a thing, in all things." The tenant-root
    table is 'organizations' (db.ts:374) and every referencing column is
    organization_id (12/12 in types.ts, including this table's own row type
    IdentityDefaultOrgEntity at types.ts:514) — yet the table name itself
    says 'orgs'. One storage contract, two spellings of the tenant noun."

            'identity_default_orgs',

    more sites: api/types.ts:511, api/db.ts:374

F-014 [III] api/types.ts:46
    One concept, two tongues: snake_case and camelCase mixed within and across
    domain-facing types
    symbol: NodeAttribute · sites: 10 · security: - · CONFIRMED
    doctrine: "III: "Call a thing a thing, in all things." / Sin of Foreign
    Tongues: "What enters speaks one tongue; what exits speaks another. To let
    foreign names pass through is to confess the adapter has done only half
    its work." NodeAttribute mixes both casings in one interface; in
    adapters/state-events.ts TransitionEvent says member_id (line 109) while
    getWorkOrderActiveClaim in the SAME file returns { memberId } (line 146);
    in adapters/objectives.ts the sibling getters exit in different tongues
    — getObjectiveArchivalEvents maps rows to camelCase (memberId, line 110)
    while getObjectiveRevisions passes snake_case rows through (line 116) —
    forcing presenters/project-score-history.ts to juggle a.memberId vs
    r.member_id. GraphEdge.toNodeId (types.ts:1035) and
    TransitionEvent.to_node_id name the same arrow two ways, both consumed by
    workbox-detail.ts."

        export interface NodeAttribute {
            attribute_id: RecordAttributeId;
            mode: 'editable' | 'readonly';
            isRequired: boolean;
        }

    more sites: web-app/app/adapters/state-events.ts:104,
    web-app/app/adapters/objectives.ts:108,
    web-app/app/presenters/project-score-history.ts:110,
    web-app/app/presenters/record-detail.ts:192, api/types.ts:1125,
    api/types.ts:1032, web-app/app/presenters/workbox-detail.ts:519,
    web-app/app/presenters/flow-designer-view.ts:165,
    web-app/app/presenters/workbox-inbox.ts:204

F-015 [III] api/types.ts:980
    Row identifier typed three ways — branded XxxId, generic Id, and raw
    string — across sibling persisted rows
    symbol: ObjectiveRevision · sites: 6 · security: - · CONFIRMED
    doctrine: "III: "Software development is the discipline of readability
    through precise vocabulary. If code does not read correctly, the names are
    — by definition — wrong." One row declares its own id as raw string,
    its foreign keys as ObjectiveId and Id — three spellings of the
    identifier concept in six lines. Objective.id is ObjectiveId (line 975)
    while sibling ProjectEntity.id is plain Id (line 1008). File-wide: 23 rows
    use Id, 8 use branded aliases, 5 use raw string."

        export interface ObjectiveRevision {
            id: string;
            objective_id: ObjectiveId;
            name: string;
            description: string;
            member_id: Id;

    more sites: api/types.ts:990, api/types.ts:999, api/types.ts:1021,
    api/types.ts:1033, api/types.ts:975

F-016 [III] web-app/app/adapters/state-events.ts:60
    State-string casing forked inside the one states ledger: kebab entity
    alphabets vs snake claim family
    symbol: CLAIM_STATES · sites: 4 · security: - · CONFIRMED
    doctrine: "III (Rectification of Names): "if names be not correct,
    language is not in accordance with the truth of things." Multiword state
    values in the SAME states.state column are kebab-case in the entity
    alphabets — 'in-review', 'sent-back' (types.ts:60-68), 'under-review'
    (types.ts:101-109) — but snake_case in the claim family. The casing is
    not the discriminator (the comment at state-events.ts:57-59 keys the split
    on English-vs-base62, not casing). SCHEMA.md:547/766 records both
    spellings, so the fork is contractual but the vocabulary remains forked."

        const CLAIM_STATES = new Set([
            'claimed',
            'claim_released',
            'claim_expired',
        ]);

    more sites: api/types.ts:60, api/types.ts:101, SCHEMA.md:547

F-017 [III] web-app/app/presenters/project-score-history.ts:43
    Two nominalizations of one concept: collection of ObjectiveArchivalEvent
    named #archivations
    symbol: ProjectScoreHistoryPresenter.#archivations · sites: 4 · se […]
    doctrine: "III: "If code does not read correctly, the names are — by
    definition — wrong." The adapter speaks 'archival'
    (getObjectiveArchivalEvents, ObjectiveArchivalEvent, objectives.ts:81/94;
    event kind 'archival' at project-score-history.ts:36) while the
    presenter's field and constructor parameter rename the same collection
    'archivations' (lines 43, 51, 58, 115) — a second nominalization of
    archive resting beside the first."

            readonly #archivations: ObjectiveArchivalEvent[];

    more sites: web-app/app/presenters/project-score-history.ts:51,
    web-app/app/presenters/project-score-history.ts:58,
    web-app/app/presenters/project-score-history.ts:115

### IV. Logic

F-018 [II] api/store-org-scoped.ts:106
    Org write fence reads EntityNotFound as 'brand-new id', letting a put
    clobber and re-stamp a tombstoned foreign-org row
    symbol: OrgScopedStore.#assertWritable · sites: 1 · security: NEW  […]
    doctrine: "IV. Logic: "A single fallacy is a crack in the foundation that
    no amount of testing will reveal." The predicate treats EntityNotFound as
    proof of absence, but EntityStore.getById ALSO throws EntityNotFound for a
    row that exists and is merely tombstoned (api/store-entity.ts:84-91:
    isDeletedIn → throw EntityNotFound) — a fallacy of the excluded
    middle: {absent, mine} is treated as exhaustive while {present,
    tombstoned, foreign-org} is real. A caller in org A who puts to org B's
    deleted row id passes the fence, and #stamp pins organization_id to org A
    (line 127-133), overwriting the row — directly breaching the fence's own
    covenant five lines above (lines 101-104: "never an id owned by another
    tenant ... no clobber, no org theft"). putMany routes through the same
    predicate (line 87). tests/store-org-scoped-write-fence.test.ts (4 tests)
    never exercises a tombstoned row, so the gap is test-invisible."

            async #assertWritable(id: string): Promise<void> {
                let existing: T;
                try {
                    existing = await this.#inner.getById(id);
                } catch (e) {
                    if (e instanceof EntityNotFound) return;

    more sites: api/store-org-scoped.ts:75, api/store-org-scoped.ts:87,
    api/store-entity.ts:85

F-019 [IV] api/authentication.ts:240
    Same-second boundary: tokens minted up to a second before a
    logout-everywhere revocation survive it
    symbol: tokenRevocationReason · sites: 1 · security: NEW · CONFIRMED
    doctrine: "IV. Logic: "An off-by-one is a mistake — a boundary error you
    can see and fix." The gate's stated covenant (lines 226-228) is "a token
    whose iat predates the revocation is dead", but revokedBeforeSeconds
    FLOORS the millisecond revocation stamp to whole seconds
    (api/access-token.ts:330: `Math.floor(Date.parse(at) / 1000)`) and the
    comparison is strict `<`. A token minted at T.100 against a revocation
    stamped T.900 has iat === revokedBefore, so `iat < revokedBefore` is false
    and the predating token survives until its natural exp — the boundary is
    resolved in the lenient (insecure) direction. `iat <= revokedBefore` or
    ceiling the stamp would close the window (at the cost of killing
    same-second re-login mints). Not on the ARCHITECTURE.md deploy-blockers
    list (the nearby 'De-membership latency' blocker covers the 15-min TTL,
    not this 1-second revocation window)."

            const revokedBefore = revokedBeforeSeconds(revs, sub);
            if (revokedBefore !== null && iat < revokedBefore) {
                return 'token revoked';
            }

    more sites: api/access-token.ts:330

F-020 [IV] api/authorization.ts:14
    The 'later-appended wins' tiebreak premise is false on the production
    IndexedDB backend — the claimed secure revoke-beats-grant tie is
    primary-key (random id) order
    symbol: latestByKey default >= tiebreak (currentRolesForInOrg) · si […]
    doctrine: "IV. Logic: "A single fallacy is a crack in the foundation that
    no amount of testing will reveal." The premise — rows iterate in append
    order, so `>=` keeps the later-appended row — holds only on the
    memory/localStorage backends, whose bufferTx pushes new rows at the tail
    (api/backend-buffer-tx.ts:78-83). The production backend reads via
    store.getAll() and index().getAll() (api/backend-indexeddb.ts:109-124),
    which the IndexedDB spec orders by primary key — a 22-char random base62
    id (api/crypto-safe-base62.ts:12) — so on a same-millisecond `at` tie
    (nowUtc is ms-resolution, api/types.ts:415-420) the winner is the
    lexically-largest random id, not the later action. A co-timestamped revoke
    can lose to a grant. The codebase itself concedes the backend split at
    exactly one site (api/api.ts:1225-1227: "the memory tier preserves
    insertion order; IndexedDB's index.getAll returns primary-key order")
    while seven other sites and SCHEMA.md:757-759 ("the deterministic order
    the append-only log captures") still assert determinism. The automated
    suite runs only the insertion-ordered backends — wrong in all, invisible
    in tests."

        // never reading. latestByKey's default >= tiebreak resolves a
        // same-`at` tie to the later-appended row — for this single-
        // writer append-only ledger that is the later action, the
        // secure tie-break (revoke beats grant).

    more sites: api/ledger-reduction.ts:4, api/store-state.ts:166,
    SCHEMA.md:757, api/authentication.ts:574, api/identity-tokens.ts:15,
    web-app/app/adapters/identity-credentials.ts:95,
    web-app/app/adapters/identity-providers.ts:101

### V. Clarity

F-021 [III] web-app/auth/index.ts:605
    Unnamed 800 ms submit-dwell timer in the auth page
    symbol: auth form submit listener setTimeout · sites: 1 · security […]
    doctrine: "III: "Name what is opaque; leave the self-disclosing alone —
    see the Abomination on Magical Values"; Magical Values: "the number whose
    units it will not say". The 800 names neither its unit nor its purpose
    (spinner dwell? simulated latency?), while sibling timers in the same
    surface are named: AUTO_REDIRECT_MS (landing/index.ts:631),
    TOAST_DURATION_MS (toast.ts), CREATE_DWELL_MS (mock-data.ts:72)."

                + ' seeded account.',
                'info',
            );
            isLogin = true;
            updateMode();
        }, 800);

F-022 [V] api/mock-data.ts:3818
    Abbreviation 'DC' used in 35 mock-data comments, never introduced
    symbol: work-order seed commentary ('DC' = Data Capture) · sites: 3 […]
    doctrine: "V: "Say it again, until the meaning stands on its own feet."
    The section preamble (mock-data.ts:3115-3118) spells out "Data Capture",
    but 35 later comments — up to ~1,700 lines away (e.g. "loops
    DC->Review->DC" at 4610) — use bare "DC" with no "(DC)" introduction
    anywhere in the file; a reader landing mid-file cannot decode it without
    scrolling back."

        // happy-path WO02: DC sojourn 1 day
        {
            id: '6eT1jG5MoR9A5PvRvgCUBq',

    more sites: api/mock-data.ts:3851, api/mock-data.ts:4610,
    api/mock-data.ts:4806

F-023 [V] web-app/design-system/index.ts:254
    506 zero-information ${''} splices shred markup readability in the
    design-system page
    symbol: buildFlowPropPanel (representative; pattern spans the whole  […]
    doctrine: "V: "Dense, high-information communication." — ${''} is a
    zero-information token spliced mid-attribute 506 times to satisfy line
    length, splitting words like "Something went${''} wrong". Sin of
    Cleverness: "Language-specific tricks and idioms that sacrifice
    readability... are the vanity of the undisciplined." The righteous idiom
    — class="${ 'a' + ' b' }" keeping tokens whole — sits in the SAME
    function (line 257) and is the standard in every presenter (e.g.
    presenters/idea.ts:131); this is the only file of 401 using the trick."

        <h4 class="${''
            }font-semibold text-sm mb-3">${''
            }Node Properties</h4>
        <div class="${
            'flex flex-col gap-3'
        }">

    more sites: web-app/design-system/index.ts:649,
    web-app/design-system/index.ts:1220, web-app/design-system/index.ts:1693

F-024 [IX] web-app/app/core.ts:208
    Epoch-seconds idiom inlined at 8 sites beside its own named helper
    symbol: Math.floor(Date.now() / 1000) vs nowSeconds() (adapters/init […]
    doctrine: "IX: "And once the better way is found, it must rise to replace
    every similar site — never rest beside them. One codebase, one voice." A
    named helper nowSeconds() exists (adapters/init.ts:58) yet core.ts:197
    confesses the split — "`now` is computed inline; the private nowSeconds
    stays private to init." — stating what, not why. The api tier (which
    cannot import web-app) repeats the idiom 5 times with no local helper,
    though the repo's own error-helpers.ts precedent shows the accepted
    per-tier sibling-copy pattern."

            const now = Math.floor(Date.now() / 1000);
            const decision = resolveCredentialDecision(creds, now);

    more sites: api/authentication.ts:152, api/authentication.ts:265,
    api/authentication.ts:353, api/access-token.ts:330, api/api.ts:967,
    web-app/app/core.ts:174, web-app/app/adapters/shared.ts:229

### VI. Immutability

F-025 [VI] api/api.ts:843
    states/:id PUT can rewrite a prior ledger event — the append-only
    invariant is convention, enforced nowhere
    symbol: route('states/:id') · sites: 1 · security: - · CONFIRMED
    doctrine: "When state mutates silently, trust dies. — VI. Immutability.
    The contract of record (CLAUDE.md § Gotchas) declares 'The states log is
    append-only by convention… Reversal is a new event with the new state,
    not an edit of the prior row', and store-state.ts:15 documents the table
    as 'the append-only event log'. Yet StateStore.put (store-state.ts:70-89)
    performs an unconditional upsert and bufferTx.put replaces in place
    (rows[idx] = written), so a PUT to an existing event id with a DIFFERENT
    payload rewrites history with no error and no trace — indistinguishable
    from the idempotent retry the id-keyed PUT is designed for. The invariant
    the docs and reducers (latestByKey, deletedIdsIn) all depend on is guarded
    by nothing."

        put: (db, p, body) =>
            db.states.put(
                param(p, 0),
                validateStateEntity(
                    withoutId(body),
                ),

F-026 [VI] api/backend-buffer-tx.ts:46
    Memory-backend reads hand out live persistent-store rows; out-of-tx
    mutation silently persists (measured)
    symbol: bufferTx · sites: 4 · security: - · CONFIRMED
    doctrine: "When state mutates silently, trust dies. — VI. Immutability.
    bufferTx's get/getAll/getWhere return row objects by reference, and
    MemoryStorageBackend.transaction buffers tables with a SHALLOW array copy
    (backend-memory.ts:46 'buffer.set(table, [...rows])'), so the returned
    object IS the live store row. Measured this run: mutating a row fetched
    via a readonly tx changed the value seen by the next transaction
    ('aliased: CORRUPTED-OUTSIDE-ANY-TX | same object: true') — bypassing
    assertWritable, dirty tracking, and the NOT-NULL gate
    (storage-serialize.ts header promises 'the test backend cannot lie about
    what the production gate enforces'; on the read path it can). IndexedDB
    structurally clones reads and localStorage re-parses per tx, so the test
    tier's mutation semantics silently diverge from production."

        const row = scoped(table).find(
            r => r.id === id,
        );
        return (row ?? null) as T | null;

    more sites: api/backend-buffer-tx.ts:51, api/backend-buffer-tx.ts:58,
    api/backend-memory.ts:46

### VII. Idempotency

F-027 [VII] api/store-org-scoped.ts:96
    Org-scoped fence turns repeat DELETE into EntityNotFound, breaking the
    base store's documented idempotent delete
    symbol: OrgScopedEntityStore.delete · sites: 2 · security: - · CO […]
    doctrine: ""DELETE removes... An operation that can be repeated without
    consequence is an operation that can be trusted." The base store it wraps
    declares the covenant the fence breaks: "The delete is unconditional and
    idempotent — no read, no findIndex" (api/store-entity.ts:155). Measured
    this run: first delete OK; second delete THREW EntityNotFound; putMany
    re-delete THREW EntityNotFound — so a replayed DELETE on
    records/record-attributes, or a retried records-multi-put edit whose
    removedAttributeIds already landed, fails where the first succeeded. The
    put path proves absence-tolerance costs nothing: #assertWritable (line
    111) catches EntityNotFound and returns; delete does not."

            async delete(id: string): Promise<void> {
                await this.getById(id);
                await this.#inner.delete(id);
            }

    more sites: api/store-org-scoped.ts:83

F-028 [VII] web-app/app/adapters/work-orders-mutations.ts:375
    Work-order state-event operations are repeat-unsafe: check-then-act spans
    separate requests instead of riding the transaction
    symbol: postWorkOrderClaim · sites: 3 · security: - · CONFIRMED
    contributors: VII. Idempotency; X. Atomicity
    doctrine: ""An operation that can be repeated without consequence is an
    operation that can be trusted." postWorkOrderClaim reads the states log
    via ctx.GET then writes via ctx.commit — two requests — and writes
    'claimed' without checking for an existing live claim, so a repeat (or two
    tabs) appends duplicate exclusive claims; the file's own comment confesses
    it. postWorkOrderTransition (line 249) is the same shape with no gate at
    all: nothing checks the work order currently sits at edge.fromNodeId
    (validateRecordTransition, record-transitions.ts:47, checks only attribute
    constraints), so a repeat appends a duplicate transition event that feeds
    flow-stats derivations. The in-tree cure exists: acceptInvitation
    (api/api.ts:1550) runs the state gate INSIDE the write transaction and
    makes the repeat a no-op — these operations do not use it."

        // Two tabs can both observe no live claim, both
        // write a 'claimed' event, both succeed —
        // duplicate claims for one work order. localStorage
        // has no compare-and-swap, so any
        // read-check-write inside this function would
        // still have a TOCTOU window.

    more sites: web-app/app/adapters/work-orders-mutations.ts:249,
    web-app/app/adapters/work-orders-mutations.ts:124,
    web-app/app/adapters/work-orders-mutations.ts:319

### VIII. Simplicity

F-029 [I] web-app/design-system/index.ts:321
    Duplicate class attributes on one element: HTML parsing silently drops the
    second attribute, so 19 written class lists (stats-grid, score-grid, p-6,
    ds-do-card, ...) have no effect
    symbol: init · sites: 19 · security: - · CONFIRMED
    doctrine: "You may achieve every other virtue in this scripture and still
    have NOTHING if your code is not reliable."

                    <div class="ds-grid-4"
                        class="stats-grid">

    more sites: web-app/design-system/index.ts:354,
    web-app/design-system/index.ts:372, web-app/design-system/index.ts:403,
    web-app/design-system/index.ts:419, web-app/design-system/index.ts:451,
    web-app/design-system/index.ts:781, web-app/design-system/index.ts:900,
    web-app/design-system/index.ts:902, web-app/design-system/index.ts:919,
    web-app/design-system/index.ts:971, web-app/design-system/index.ts:1231,
    web-app/design-system/index.ts:1470, web-app/design-system/index.ts:1472,
    web-app/design-system/index.ts:1481, web-app/design-system/index.ts:1523,
    web-app/design-system/index.ts:1532, web-app/design-system/index.ts:1588,
    web-app/design-system/index.ts:1627

F-030 [VIII] api/mock-data.ts:555
    Monolithic functions far beyond skull size: populateMockDataIn spans 5,985
    lines (555–6539, 90% of a 6,644-line file); design-system init spans
    1,412 lines (287–1698, one setHtml template)
    symbol: populateMockDataIn · sites: 2 · security: - · CONFIRMED
    doctrine: "the competent programmer approaches every task in full
    humility, aware of the strictly limited size of his own skull"

        async function populateMockDataIn(
            adapter: DbAdapter,
        ): Promise<void> {
            const members: SeedHumanMember[] = [

    more sites: web-app/design-system/index.ts:287

F-031 [VIII] web-app/app/adapters/identities.ts:189
    Dead exports: 54 exported value symbols whose only repo-wide occurrence is
    their own definition — 36 icon functions plus 18 others including a
    whole adapter operation (putMemberPii), 9 state-alphabet helpers in
    api/types.ts, three notify*Change pub-sub emitters, and
    closeBroadcastChannel
    symbol: putMemberPii · sites: 54 · security: - · CONFIRMED
    doctrine: "If I had more time, I would have written a shorter letter."

        export async function putMemberPii(

    more sites: api/types.ts:320, api/types.ts:358, api/types.ts:194,
    api/types.ts:202, api/types.ts:314, api/types.ts:352, api/types.ts:1355,
    api/types.ts:1726, api/types.ts:1732,
    web-app/app/adapters/broadcast-channel.ts:62,
    web-app/app/adapters/work-orders-queries.ts:135, web-app/app/dom.ts:132,
    web-app/app/adapters/ai-members.ts:34, web-app/app/adapters/members.ts:44,
    web-app/app/adapters/invitations.ts:26, web-app/app/flow-layout.ts:27,
    web-app/app/flow-layout.ts:28, web-app/app/icons.ts:879,
    web-app/app/icons.ts:820, web-app/app/icons.ts:223,
    web-app/app/icons.ts:1119, web-app/app/icons.ts:284,
    web-app/app/icons.ts:306, web-app/app/icons.ts:1403,
    web-app/app/icons.ts:1032, web-app/app/icons.ts:959,
    web-app/app/icons.ts:1377, web-app/app/icons.ts:719,
    web-app/app/icons.ts:1276, web-app/app/icons.ts:908,
    web-app/app/icons.ts:445, web-app/app/icons.ts:1259,
    web-app/app/icons.ts:1073, web-app/app/icons.ts:777,
    web-app/app/icons.ts:1042, web-app/app/icons.ts:1237,
    web-app/app/icons.ts:1442, web-app/app/icons.ts:1385,
    web-app/app/icons.ts:1295, web-app/app/icons.ts:188,
    web-app/app/icons.ts:454, web-app/app/icons.ts:467,
    web-app/app/icons.ts:331, web-app/app/icons.ts:317,
    web-app/app/icons.ts:1183, web-app/app/icons.ts:400,
    web-app/app/icons.ts:1352, web-app/app/icons.ts:1019,
    web-app/app/icons.ts:1340, web-app/app/icons.ts:1314,
    web-app/app/icons.ts:517, web-app/app/icons.ts:1327,
    web-app/app/icons.ts:860

F-032 [VIII] web-app/app/adapters/work-orders-queries.ts:14
    21 compiler-measured dead declarations: unused imports (4 in one import
    block here; also html, log, $required, getProjectState elsewhere), unused
    parameters in exported validators, an unused private method
    #selectedNodeIds, unused locals — invisible because tsconfig omits
    noUnusedLocals/noUnusedParameters
    symbol: (file scope) · sites: 21 · security: - · CONFIRMED
    doctrine: "If I had more time, I would have written a shorter letter."

        import {
            getTransitionEventsByWorkOrder,
            getWorkOrderTransitionEvents,
            getWorkOrderActiveClaim,
            getActiveClaimsByWorkOrder,
            getWorkOrderCurrentNodeId,

    more sites: api/mock-data.ts:402,
    web-app/app/adapters/project-publish.ts:41,
    web-app/app/adapters/project-publish.ts:62,
    web-app/app/adapters/work-orders-mutations.ts:28,
    web-app/app/adapters/work-orders-queries.ts:15,
    web-app/app/adapters/work-orders-queries.ts:16,
    web-app/app/adapters/work-orders-queries.ts:17,
    web-app/app/flow-graph.ts:2, web-app/app/flow-graph.ts:453,
    web-app/app/flow-graph.ts:459,
    web-app/app/presenters/ai-member-detail.ts:431,
    web-app/app/presenters/flow-designer.ts:6,
    web-app/app/presenters/flow-designer.ts:19,
    web-app/app/presenters/flow-designer.ts:390,
    web-app/app/presenters/idea.ts:605, web-app/app/presenters/project.ts:91,
    web-app/flows/detail.ts:1543, web-app/projects/detail.ts:28,
    web-app/records/detail.ts:375, web-app/workbox/detail.ts:2

F-033 [VIII] web-app/app/styles/utilities.css:185
    Dead utility CSS classes: 5 of 40 sampled selectors (12.5% of a 680-class
    inventory, extrapolating to ~85) are referenced nowhere in any .ts or
    .html, with no dynamic class construction to revive them
    symbol: (file scope) · sites: 5 · security: - · CONFIRMED
    doctrine: "If I had more time, I would have written a shorter letter."

        .bg-blue-500 { background-color: hsl(var(--blue-500)); }

    more sites: web-app/app/styles/utilities.css:10,
    web-app/app/styles/utilities.css:27, web-app/app/styles/utilities.css:92,
    web-app/app/styles/utilities.css:137

F-034 [VIII] web-app/design-system/index.ts:254
    The ${''} empty-interpolation splice trick, 506 occurrences confined to
    one file: noise tokens injected to defeat the line linter, while the rest
    of the codebase splits long template strings by plain concatenation
    symbol: buildFlowPropPanel · sites: 506 · security: - · CONFIRMED
    doctrine: "Language-specific tricks and idioms that sacrifice readability
    for concision are the vanity of the undisciplined."

                <h4 class="${''
                    }font-semibold text-sm mb-3">${''

    more sites: web-app/design-system/index.ts:255,
    web-app/design-system/index.ts:261

F-035 [IX] web-app/app/presenters/idea.ts:164
    mutateSlot copied byte-for-byte (modulo one trivially inlined local) into
    five presenter files — a 7-line helper resting beside itself five times,
    well past the three-instance threshold
    symbol: mutateSlot · sites: 5 · security: - · CONFIRMED
    doctrine: "And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice."

        function mutateSlot(
            container: HTMLElement,
            cls: string,
            markup: SafeHtml,
        ): void {
            const slot = $required(cls, container);

    more sites: web-app/app/presenters/human-member-detail.ts:156,
    web-app/app/presenters/project-detail.ts:162,
    web-app/app/presenters/ai-member-detail.ts:112,
    web-app/app/presenters/identity-detail.ts:71

### IX. Generality

F-036 [IX] tests/adapters-admin.test.ts:27
    The identical three-line test bootstrap (new MemoryDbAdapter() + await
    seedAdminSchema(db) + createRequestContext(db, await devToken())) is
    re-declared in 14 test files while a shared fixtures home
    (tests/test-fixtures.ts, token-fixtures.ts) already exists
    symbol: setupDb · sites: 14 · security: - · CONFIRMED
    doctrine: "Two instances are coincidence. Three is pattern. … And once
    the better way is found, it must rise to replace every similar site —
    never rest beside them."

            const db = new MemoryDbAdapter();
            await seedAdminSchema(db);
            const ctx = createRequestContext(db, await devToken());
            return { db, ctx };

    more sites: tests/adapters-dashboard.test.ts:28,
    tests/adapters-organizations.test.ts:16,
    tests/adapters-projects.test.ts:74, tests/adapters-members.test.ts:46,
    tests/adapters-ideas.test.ts:64, tests/snapshot-quota.test.ts:27,
    tests/adapters-shared-commit.test.ts:28,
    tests/adapters-flow-records.test.ts:59,
    tests/adapters-flow-stats.test.ts:113,
    tests/adapters-members-union.test.ts,
    tests/adapters-record-attributes.test.ts,
    tests/adapters-session-logout.test.ts,
    tests/adapters-project-scoring-validation.test.ts

F-037 [IX] web-app/app/adapters/flow-queries.ts:147
    Inline single-field equality filters rest beside filterByField, which
    declares itself 'the single-field equality filter the adapters repeat' (25
    references)
    symbol: (file scope) · sites: 2 · security: - · CONFIRMED
    doctrine: "And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice."

                    .filter(
                        pw =>
                            pw.project_id
                                === projectId,
                    )

    more sites: web-app/app/adapters/work-orders-mutations.ts:155
    (graph.edges.filter(e => e.fromNodeId === startNode.id))

F-038 [IX] web-app/app/adapters/shared.ts:82
    CommitError carries failedAt/applied fields with exactly one possible
    value (0, []) — a partial-failure contract the atomic batch design makes
    impossible; constructed once, read only by tests asserting the constants
    symbol: CommitError · sites: 1 · security: - · CONFIRMED
    doctrine: "configurable behavior added 'in case we need it later' … 'the
    framework written before the second use case' (On the Sin of Premature
    Generalization)"

        export class CommitError extends Error {
            readonly failedAt: number;
            readonly applied: readonly WriteOp[];
        [… sole construction, :167 …]
                        throw new CommitError(0, [], e as Error);

    more sites: web-app/app/adapters/shared.ts:167 (only construction: new
    CommitError(0, [], …); comment admits 'applied is always empty'),
    tests/adapters-shared-commit.test.ts:98 (only readers assert failedAt===0,
    applied.length===0)

F-039 [IX] web-app/app/loading-states.ts:194
    formatErrorMessage re-implements the instanceof-Error message extraction
    beside extractErrorMessage, whose file header declares itself 'The lone
    home of the instanceof Error extraction the web-app layer repeats'
    symbol: formatErrorMessage · sites: 1 · security: - · CONFIRMED
    doctrine: "And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice."

        export function formatErrorMessage(
            error: unknown,
            noMatchMessage: string,
        ): string {
            if (error instanceof Error)
                return error.message;

    more sites: web-app/app/error-helpers.ts:3 (the contradicted 'lone home'
    claim), web-app/app/page-loader.ts:47 (consumer),
    web-app/app/database-init.ts:41 (consumer)

F-040 [IX] web-app/app/presenters/human-member-detail.ts:156
    mutateSlot is byte-identical in five detail presenters, and their
    buildShell headers (back button + title-slot + actions-slot) repeat the
    same structure differing only by entity prefix — five sites, never
    abstracted
    symbol: mutateSlot · sites: 5 · security: - · CONFIRMED
    doctrine: "Two instances are coincidence. Three is pattern. Below three,
    duplicate without shame; at three, the abstraction begins to speak."

        function mutateSlot(
            container: HTMLElement,
            cls: string,
            markup: SafeHtml,
        ): void {
            setHtml($required(cls, container), markup);

    more sites: web-app/app/presenters/ai-member-detail.ts:112,
    web-app/app/presenters/project-detail.ts:162,
    web-app/app/presenters/idea.ts:164,
    web-app/app/presenters/identity-detail.ts:71,
    web-app/app/presenters/human-member-detail.ts:119 (buildShell; siblings at
    identity-detail.ts:36, ai-member-detail.ts:75, project-detail.ts:102,
    idea.ts:125)

F-041 [IX] web-app/app/presenters/identity-tokens.ts:68
    Three private buildEmptyState() functions identical but for the message
    string (plus the identical length===0 render ternary around them) across
    the identity presenters — exactly at the three threshold, no shared
    muted-empty-note helper
    symbol: buildEmptyState · sites: 3 · security: - · CONFIRMED
    doctrine: "Two instances are coincidence. Three is pattern. … at three,
    the abstraction begins to speak."

        function buildEmptyState(): SafeHtml {
            return html`<div class="${
                'p-4 text-sm text-muted text-center'
            }">No tokens.</div>`;
        }

    more sites: web-app/app/presenters/identity-list.ts:79,
    web-app/app/presenters/identity-providers.ts:49

F-042 [IX] web-app/members/detail.ts:472
    The catch-extract-log-toast failure ritual (catch (err) { const detail =
    extractErrorMessage(err); log.error(…); showToast(…detail…, 'error')
    }) repeats verbatim-in-shape at six sites across five page modules
    symbol: (file scope) · sites: 6 · security: - · CONFIRMED
    doctrine: "Two instances are coincidence. Three is pattern. … at three,
    the abstraction begins to speak."

            } catch (err) {
                const detail = extractErrorMessage(err);
                log.error(
                    'human member save failed',
                    'members', err,
                );

    more sites: web-app/identities/index.ts:185,
    web-app/identities/index.ts:219, web-app/ideas/detail.ts:114,
    web-app/members/index.ts:415, web-app/projects/detail.ts:664

F-043 [IX] web-app/projects/detail.ts:225
    59 raw querySelector/querySelectorAll call sites rest beside the dom.ts
    typed helpers ($, $$, $input, $button) — including in files that import
    those helpers (projects/detail.ts, members/index.ts)
    symbol: (file scope) · sites: 59 · security: - · CONFIRMED
    doctrine: "And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice."

                container
                    .querySelector('[data-retry-btn]')
                    ?.addEventListener(
                        'click',
                        () => init(params),
                    );

    more sites: web-app/members/index.ts:143
    (document.querySelectorAll<HTMLElement> — the $$ shape),
    web-app/members/index.ts:342 (document.querySelector<HTMLInputElement> —
    the $input shape), web-app/projects/detail.ts:458
    (section.querySelector(…) as HTMLButtonElement | null — the cast
    $button exists to eliminate), web-app/app/command-palette.ts (6 sites),
    web-app/ideas/convert.ts (5 sites), web-app/flows/detail.ts (4 sites) —
    59 total measured outside dom.ts; a minority may legitimately need
    NodeList/SVG semantics (shape-verification sampled)

### X. Atomicity

F-044 [X] api/store-org-scoped.ts:75
    Org-fence guard and write commit in separate transactions on the
    single-request path — the check-then-stamp is not one action.
    db-org-scoped.ts:137-139 confesses the in-tx re-scope closes 'the TOCTOU
    for free', but handleRequest dispatches single PUT/DELETE on the fenced
    store standalone, where #assertWritable opens its own readonly tx and
    #inner.put a second readwrite tx; two concurrent creates of one id under
    different orgs can both pass the guard, last write stamping the other
    tenant's org
    symbol: OrgScopedEntityStore.put · sites: 3 · security: NEW · CONFIRMED
    doctrine: "atomicity means all actions as one, or none at all … Wrap the
    indivisible operation in the transactional primitive your platform
    provides — never simulate atomicity at the application layer"

            async put(
                id: string,
                fields: Omit<T, 'id'>,
            ): Promise<T> {
                await this.#assertWritable(id);
                return this.#inner.put(id, this.#stamp(fields));

    more sites: api/store-org-scoped.ts:79, api/store-org-scoped.ts:96

F-045 [X] web-app/app/adapters/identity-tokens.ts:75
    Client-side token rotation/revocation reads the ledger in one request and
    commits the plan in another — read-plan-append is not one action —
    while the atomic twin already exists (grantRefresh,
    api/authentication.ts:282, does the same read-plan-append in ONE tx 'so a
    concurrent reuse of the same jti can not double-rotate'). The hazard note
    (lines 19-26) claims only Web Locks or Postgres can fix it — disproved
    in-tier by grantRefresh. Reachability today: tests only (production
    refresh rides authentication/token via session-refresh.ts), but the
    functions are exported production code
    symbol: postTokenRotation · sites: 2 · security: - · CONFIRMED
    doctrine: "atomicity means all actions as one, or none at all … never
    simulate atomicity at the application layer"

        export async function postTokenRotation(
            ctx: RequestContext,
            presentedJti: string,
        ): Promise<string> {
            const rows = await ctx.GET<IdentityTokenEntity[]>(
                'identity-tokens',

    more sites: web-app/app/adapters/identity-tokens.ts:98

### XII. Performance

F-046 [XII] api/api.ts:1330
    Invitation routes derive each row's state with a separate serial
    transaction (N+1 over the states ledger)
    symbol: invitationsForInvitee / sentInvitations / pendingInvitationF […]
    doctrine: "XII: "in high-frequency serial operations, throughput" and "no
    code is faster than no code." Each iteration opens its own readonly
    transaction (StateStore.allFor → #run, store-state.ts:114-119) for one
    indexed read, awaited serially per invitation; sentInvitations does the
    same via currentInvitationState (api.ts:1381-1383), pendingInvitationFor
    via the candidates loop (api.ts:1510-1513). One states read plus the
    latestByKey reduce the codebase already owns (ledger-reduction) serves
    every row in a single pass — N-1 transaction round-trips are waste. Low
    absolute cost at demo row counts; the pattern is the defect."

            for (const inv of mine) {
                const events = await adapter.states.allFor(inv.id);
                const latest = latestByKey(events, ev => ev.entity_id)
                    .get(inv.id);

    more sites: api/api.ts:1381-1384, api/api.ts:1510-1513

F-047 [XII] web-app/app/presenters/flow-designer.ts:658
    Flow designer rebuilds the entire canvas via innerHTML on every
    pointer-move, interleaved with forced layout reads
    symbol: FlowDesignerPresenter.renderUpdate / #updateCanvas · sites: […]
    doctrine: "XII: "Every wasted millisecond is a small death. In the UI it
    erodes fluidity" — "humans can perceive cause/effect latency down to low
    single-digit milliseconds." Each pointermove during
    drag/pan/marquee/connect runs three layout-forcing reads in the handler
    (getScreenCTM via screenToSvg, document.elementFromPoint,
    svg.getBoundingClientRect — flow-interactions.ts:480-512), then the
    FSM's request-update commits a new presenter whose renderUpdate
    (flow-designer.ts:579-587) innerHTML-replaces name header, toolbar, props
    panel AND the full SVG canvas (buildGraphSvg over every
    node/edge/waypoint; setHtml = element.innerHTML, safe-html.ts:51-52).
    reconcileFitFromDom (flows/detail.ts:624-646) then reads getBBox() on the
    fresh subtree and, with Auto-Fit on, commits a SECOND full rebuild per
    event. No rAF coalescing, no narrow update (e.g. transform on the dragged
    group): O(graph) string build + DOM teardown/reparse + multiple forced
    synchronous layouts per pointer event on the app's highest-frequency UI
    path."

            #updateCanvas(
                container: HTMLElement,
            ): void {
                setHtml(
                    $required(
                        '.flow-canvas-host',

    more sites: web-app/app/flow-interactions.ts:480-512,
    web-app/flows/detail.ts:873-896, web-app/flows/detail.ts:624-646

F-048 [XII] web-app/dashboard/index.ts:29
    Dashboard aggregates re-fetch the same five tables three times in one
    render
    symbol: renderObjectiveAggregates / getObjectiveAggregates / getObje […]
    doctrine: "XII: "As Ezra Zygmuntowicz has taught us: no code is faster
    than no code." getObjectiveAggregates (project-scoring.ts:242-254) and
    getObjectiveTrendlines (project-scoring.ts:304-316) EACH internally
    re-fetch getActiveObjectives + projects + project states + all baseline
    scores + all actual scores — the same five logical reads the page-level
    call already issues, so one render performs up to 3x the GETs (each
    repeating per-request auth/authz ledger derivation and the
    whole-states-log tombstone reduce), then re-filters and re-reduces the
    same rows three times on one thread. The parallel dispatch bounds the
    latency (the scripture's own cost model: parallel reads cost max, not
    sum), but the duplicated main-thread parse/reduce work sums — and this
    path refires on every project/objective/score broadcast. Least-severe
    defensible reading: redundant duplicate reads, not an N+1."

            const [active, aggregates, trendlines] =
                await Promise.all([
                    getActiveObjectives(ctx),
                    getObjectiveAggregates(ctx),
                    getObjectiveTrendlines(ctx),
                ]);

    more sites: web-app/app/adapters/project-scoring.ts:242-254,
    web-app/app/adapters/project-scoring.ts:304-316

F-049 [XII] web-app/dashboard/index.ts:37
    Serial per-objective N+1: each loop iteration re-fetches the ENTIRE
    objective-revisions table
    symbol: getCurrentObjectiveDefinition (loops in renderObjectiveAggre […]
    doctrine: "XII: "Every wasted millisecond is a small death. In the UI it
    erodes fluidity; in high-frequency serial operations, throughput" and "no
    code is faster than no code." getCurrentObjectiveDefinition →
    getObjectiveRevisions → ctx.GET('objective-revisions')
    (objectives.ts:120-123) fetches EVERY revision row — full route
    dispatch, HMAC verify, authz ledger reads, tx, full-table read plus
    whole-states-log tombstone reduce — once per objective, awaited
    SERIALLY. N-1 of the N identical table reads are pure waste; one fetch +
    one in-memory group-by serves all (openHistoryModal even builds that exact
    revsByObj map at detail.ts:909-917 — after N fetches).
    ideas/convert.ts:105-113 already holds the parallel form, unrisen to these
    sites. The dashboard site refires on every project/objective/score
    broadcast."

            for (const o of active) {
                defs.set(o.id,
                    await getCurrentObjectiveDefinition(
                        ctx, o.id,
                    ));
            }

    more sites: web-app/organization/index.ts:122-129,
    web-app/projects/detail.ts:733-740, web-app/projects/detail.ts:903-908

### We believe in the S.O.L.I.D. principles

F-050 [VIII] api/api.ts:1659
    api.ts fuses HTTP router, auth gates, the whole invitations domain, commit
    dispatch, and the client-side verb facade in one 2,076-line module —
    many reasons to change
    symbol: handleRequest · sites: 6 · security: - · CONFIRMED
    doctrine: "S — Single Responsibility (Martin): one reason to change"

        export async function handleRequest(
            adapter: DbAdapter,
            request: Request,
        ): Promise<Response> {
            const { pathname } = new URL(request.url);

    more sites: api/api.ts:513, api/api.ts:956, api/api.ts:1401,
    api/api.ts:500, api/api.ts:1983

F-051 [VIII] api/db-backed.ts:263
    The transaction view returned by #viewForTx is typed DbAdapter but its
    transaction() throws — one static contract, two behavioral modes
    distinguishable only by provenance, so a substitute does not substitute
    cleanly
    symbol: BackedDbAdapter.#viewForTx · sites: 1 · security: - · REFUTED
    doctrine: "L — Liskov Substitution (Liskov): subtypes substitute
    cleanly, readable where readable, writable where writable"

                    transaction: () => {
                        throw new Error(
                            'Nested transaction is not supported.',
                        );
                    },

F-052 [VIII] api/db.ts:111
    Keyed-read capability is re-acquired by type assertion (keyed() and
    scope() cast EntityStore to EntityStore & KeyedCollectionReader), sound
    only by call discipline — OrgScopedEntityStore implements EntityStore
    but NOT KeyedCollectionReader, so a fenced store passed through the cast
    would fail at runtime
    symbol: keyed · sites: 2 · security: - · CONFIRMED
    doctrine: "D — Dependency Inversion (Martin): depend on abstractions,
    not concretions — configure during initialization"

        export function keyed<T extends { id: string }>(
            store: EntityStore<T>,
        ): KeyedCollectionReader<T> {
            return store as EntityStore<T> & KeyedCollectionReader<T>;
        }

    more sites: api/db-org-scoped.ts:69, api/db-org-scoped.ts:86,
    api/api.ts:1786

F-053 [VIII] api/db.ts:331
    DbAdapter carries members every implementor and decorator must service
    that are dead or non-storage: flush() and close() have zero callers
    anywhere (BackedDbAdapter bodies are empty no-ops) and simulateLatency()
    is a demo network-emulation concern called only by the client verb facade
    symbol: DbAdapter · sites: 3 · security: - · CONFIRMED
    doctrine: "I — Interface Segregation (Martin): many small interfaces
    over one bloated contract"

            initialize(): Promise<void>;
            close(): Promise<void>;
            flush(): Promise<void>;
            deleteSchema(): Promise<void>;
            hasSchema(): Promise<boolean>;

    more sites: api/db.ts:338, api/db-backed.ts:180, api/db-backed.ts:181,
    api/db-org-scoped.ts:129, api/db-org-scoped.ts:136

F-054 [IX] api/api.ts:1788
    The org-owned probe-store set is enumerated twice — in handleRequest's
    entity-states guard and in orgScopedAdapter — so extending the system
    with a new org-owned entity requires synchronized modification of two
    distant lists with nothing enforcing agreement
    symbol: handleRequest · sites: 2 · security: - · CONFIRMED
    doctrine: "O — Open/Closed (Meyer): open for extension, closed for
    modification — stability via encapsulation and delegation"

                        [
                            adapter.ideas, adapter.projects,
                            adapter.flows, adapter.records,
                            adapter.objectives, adapter.workOrders,
                            adapter.invitations,
                        ],

    more sites: api/db-org-scoped.ts:95

F-055 [X] api/backend-localstorage.ts:96
    LocalStorageBackend substitutes for StorageBackend but its simulated
    transaction cannot keep the atomic-commit promise under a mid-flush quota
    error — the multi-key flush is not OS-atomic, as the file itself
    confesses (lines 79-81)
    symbol: LocalStorageBackend.transaction · sites: 1 · security: -  […]
    doctrine: "L — Liskov Substitution (Liskov): subtypes substitute cleanly
    — and Commandment X: "Wrap the indivisible operation in the
    transactional primitive your platform provides — never simulate
    atomicity at the application layer""

                    const result = await fn(tx);
                    for (const table of dirty) {
                        await this.#store(
                            table, buffer.get(table)!,
                        );
                    }

    more sites: api/backend-localstorage.ts:79

### We believe in telling, not asking

F-056 [IX] web-app/app/core.ts:322
    Boot demands the DOM prove the sidebar layout though PAGE_REGISTRY
    declares it
    symbol: DOMContentLoaded boot handler · sites: 1 · security: - ·  […]
    doctrine: ""We do not demand they prove themselves before we allow them to
    serve." PAGE_REGISTRY declares `layout: 'sidebar' | 'standalone'`
    (web-app/app/page-registry.ts:20) — the same declaration compose.ts:16
    builds the page FROM — and boot already holds pageName (core.ts:295).
    Yet before initSidebarLayout may serve, the composed document is
    interrogated for structural proof of what the registry entry states
    outright: two truths where the declared one would do."

                if (
                    document.querySelector(
                        '.sidebar-layout',
                    )
                ) {

F-057 [IX] web-app/app/loading-states.ts:253
    withLoadingState: a verb-process that returns a nullable result to the
    call site, forcing 15 callers to interrogate it before they may proceed
    symbol: withLoadingState · sites: 16 · security: - · CONFIRMED
    doctrine: ""Methods upon verbs begin asynchronous processes that pass
    results to communicating sequential processes — never returning to the
    call site." withLoadingState is a verb-named async process (skeleton →
    fetch → error/empty rendering) yet it hands a `T | null` back to the
    call site, where null conflates two already-handled outcomes (error
    rendered, empty rendered). Every caller must then ask the result to prove
    itself — e.g. ideas/index.ts:78 `if (!ideas) return;`,
    records/detail.ts:113 `if (!loaded) return;` — the ritual CLAUDE.md
    itself documents as a gotcha ("callers must check for null before using
    the result"). Telling — passing an onData continuation so the process
    never returns — would erase the 15 interrogation guards. Trace: "Through
    this discipline we achieve polymorphism — and through it, generality"
    → Commandment IX, "once the better way is found, it must rise to replace
    every similar site.""

            fetchFn: () => Promise<T>,
            retryFn?: () => void,
            emptyState?: EmptyStateConfig,
            timeoutMs?: number,
        ): Promise<T | null> {

    more sites: web-app/ideas/index.ts:43, web-app/records/detail.ts:85,
    web-app/records/index.ts:45, web-app/identity-tokens/index.ts:39,
    web-app/projects/index.ts:78, web-app/dashboard/index.ts:59,
    web-app/members/index.ts:83, web-app/workbox/detail.ts:300,
    web-app/workbox/index.ts:121, web-app/workbox/index.ts:194,
    web-app/workbox/index.ts:250, web-app/members/detail.ts:158,
    web-app/identities/index.ts:46, web-app/ideas/detail.ts:176,
    web-app/identities/detail.ts:95, web-app/flows/stats.ts:104

F-058 [IX] web-app/app/presenters/member.ts:109
    Member list badge re-derives the state→presentation mapping by predicate
    cascade though the object already answers via
    stateLabel()/stateClassName()
    symbol: MemberListItemPresenter.#buildStatusBadge · sites: 1 · sec […]
    doctrine: ""We tell our objects what we need. We do not interrogate their
    state." The Member object exposes the tell route —
    stateLabel()/stateClassName() backed by MEMBER_STATE_CONFIG
    (api/types.ts:731-741, 1215-1231) — and seven sibling presenters use it
    (e.g. presenters/record-list.ts:163-169, presenters/idea.ts:206-209). This
    presenter instead interrogates isActive() then isPending() and falls
    through to Archived, re-deriving the labels 'Active'/'Pending'/'Archived'
    externally — the mapping now lives in two places. Commandment IX: "once
    the better way is found, it must rise to replace every similar site —
    never rest beside them. One codebase, one voice.""

            #buildStatusBadge(): SafeHtml {
                if (this.#member.isActive())
                    return html`<span
                        class="${
                            'status-badge-success'
                        }">

F-059 [IX] web-app/app/root-redirect.ts:19
    Root redirect interrogates the storage backend's private key layout
    instead of an owner-declared signal
    symbol: redirectRoot · sites: 1 · security: - · CONFIRMED
    doctrine: ""To reach into an object's internal state violates its
    sovereignty" (Sin of Asking, Not Telling); "We do not interrogate their
    state." The redirect scans the localStorage backend's internal key
    namespace (prefix duplicated from api/backend-localstorage.ts:15
    KEY_PREFIX = 'fusion-ai:') rather than consuming a signal the storage
    owner declares. The asking has spread coupling:
    session-credentials.ts:26-31 must name its key OUTSIDE the prefix purely
    so it "must not masquerade as a schema" to this scan, and notes
    ACTIVE_ORG_KEY does the same. Meanwhile the live tier is IndexedDB
    (adapters/init.ts:24 IndexedDbDbAdapter), so the interrogated organ no
    longer holds the schema truth at all — the textbook brittleness of
    asking internals instead of telling the owner to publish a marker."

        (function redirectRoot(): void {
            const hasSchema = Object.keys(localStorage)
                .some(k => k.startsWith(STORAGE_KEY_PREFIX));
            setLocation(hasSchema
                ? 'landing/index.html'
                : 'snapshots/index.html');

    more sites: web-app/app/adapters/session-credentials.ts:31,
    api/backend-localstorage.ts:15

F-060 [IX] web-app/landing/index.ts:600
    Ask-then-tell on classList where a single tell already returns the new
    state
    symbol: mobile-menu-toggle click handler · sites: 2 · security: -  […]
    doctrine: ""We do not interrogate their state." The handler asks the menu
    whether it wears 'hidden', then tells it to toggle to the computed
    inverse. `classList.toggle('hidden')` already returns the token's
    resulting presence — one tell yields both the mutation and the truth
    needed for the icon swap; the contains() ask is a redundant interrogation
    before the command. Same shape at toast.ts:12, where closeActiveToast asks
    the element whether it already carries the 'toast--closing' state the
    module itself put there, instead of owning that fact."

                        const isHidden =
                            menu.classList.contains(
                                'hidden',
                            );
                        menu.classList.toggle(
                            'hidden',

    more sites: web-app/app/toast.ts:12

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-060a [IX] web-app/landing/index.ts:600
        Ask-then-tell on classList where a bare toggle() already returns the
        new state

            const isHidden =
                menu.classList.contains(
                    'hidden',
                );
            menu.classList.toggle(
                'hidden',
                !isHidden,
            );

### Relationships between entities are sacred covenants

F-061 [I] api/api.ts:322
    Destroying a record attribute never dissolves its covenants: graph-JSON
    references and state_field_values rows dangle, and the workbox presenter
    throws on them
    symbol: applyRecordMultiPut · sites: 4 · security: - · CONFIRMED
    doctrine: "Codd revealed that relationships occupy their own relations.
    [Because the node<->attribute and value<->attribute references have no
    relation of their own, destruction of one party cannot dissolve the
    covenant; readers crash.] Commandment I: You may achieve every other
    virtue in this scripture and still have NOTHING if your code is not
    reliable."

                    if (
                        entries.length > 0
                        || removedIds.length > 0
                    ) {
                        await view.recordAttributes.putMany(
                            entries, removedIds,

    more sites: web-app/records/detail.ts:462,
    web-app/app/presenters/workbox-detail.ts:383,
    web-app/app/presenters/workbox-detail.ts:571

F-062 [I] web-app/app/adapters/admin.ts:59
    organizations.used_seats is a stale cached aggregate of the membership
    covenant — maintained by nothing, false from birth (bootstrap: 1
    membership row, used_seats 18), displayed in the org Usage card
    symbol: Organization.seatsUsage · sites: 5 · security: - · CONFIRMED
    doctrine: "What the ledger remembers, the cache only re-remembers — two
    truths to reconcile, neither claiming primacy. [The memberships relation
    is the source of the seat count; SCHEMA.md: 'The members roster is DERIVED
    from this ledger.'] Commandment I: You may achieve every other virtue in
    this scripture and still have NOTHING if your code is not reliable."

                const used = this.#entity.used_seats;
                const total = this.#entity.seats;

    more sites: api/mock-data.ts:6628,
    web-app/app/presenters/organization.ts:249,
    web-app/app/adapters/admin.ts:71, api/types.ts:1161

F-063 [III] api/types.ts:1151
    state_field_values.field_id wears a name that does not name its relation
    (it references record_attributes.id)
    symbol: StateFieldValueEntity · sites: 3 · security: - · CONFIRMED
    contributors: Relationships between entities are sacred covenants; We
    speak our own idiom
    doctrine: "Call a thing a thing, in all things. [Commandment III; the
    covenant column's name conceals which relation it joins.]"

        export interface StateFieldValueEntity {
            id: Id;
            state_event_id: Id;
            field_id: Id;
            value: string;
        }

    more sites: SCHEMA.md:807, web-app/app/presenters/workbox-detail.ts:569,
    web-app/app/presenters/workbox-detail.ts:574

F-064 [XII] web-app/app/adapters/work-orders-mutations.ts:182
    The flow<->work-order covenant is recorded twice — flow_work_orders join
    row AND flowId embedded in the flow_graph snapshot — and consumers split
    across the two truths
    symbol: postWorkOrderCreation · sites: 4 · security: - · CONFIRMED
    doctrine: "Codd revealed that relationships occupy their own relations.
    [The relation exists (flow_work_orders, written in the same commit with
    its moment of union) but is denied primacy: live relationship reads go
    through the document copy.]"

            const flowGraph: WorkOrderFlowGraph =
                {
                    flowId: flow.id,
                    name: flow.name,
                    lockTimeout: flow.lock_timeout,

    more sites: web-app/app/adapters/record-transitions.ts:72,
    web-app/workbox/detail.ts:255, web-app/app/adapters/flow-records.ts:84

### We believe in being informed of state changes

F-065 [I] web-app/app/adapters/work-orders-mutations.ts:53
    Dead cross-tab watch entries: kebab-case API-resource names never match
    the snake_case table names the storage seam broadcasts
    symbol: workOrderChanges / createSubscriptionChannel · sites: 7 ·  […]
    doctrine: ""Subscribe. Listen. Be notified. ... The devout trust the
    bell." The bell posts canonical snake_case store names
    (api/backend-indexeddb.ts:286 `this.#post(tables)`; api/api.ts:434 maps
    resources via `first.replace(/-/g, '_')`; api/db.ts TABLE_NAMES is
    snake_case), so watch entries 'work-orders', 'state-field-values',
    'flow-work-orders', 'flow-versions', 'project-flows', 'idea-submissions',
    'record-attributes' can NEVER match — the declared subscription is
    silently broken. Channels watching 'states' are masked (unionTablesFor
    always adds 'states' to commit scope), but flowChanges watches no live
    name except 'flows', so e.g. deleteFlowVersion (single-op ctx.DELETE on
    flow_versions) is unheard cross-tab. Commandment I: "You may achieve every
    other virtue in this scripture and still have NOTHING if your code is not
    reliable.""

        const workOrderChanges =
            createSubscriptionChannel(
                [
                    'work-orders',
                    'states',
                    'state-field-values',

    more sites: web-app/app/adapters/flow-mutations.ts:27,
    web-app/app/adapters/flow-mutations.ts:28,
    web-app/app/adapters/ideas.ts:41, web-app/app/adapters/records.ts:52,
    web-app/app/adapters/work-orders-mutations.ts:55,
    web-app/app/adapters/work-orders-mutations.ts:56

F-066 [V] web-app/app/adapters/broadcast-channel.ts:60
    closeBroadcastChannel's contract comment claims a pagehide/adapter-close
    wiring that does not exist — zero callers repo-wide
    symbol: closeBroadcastChannel · sites: 1 · security: - · CONFIRMED
    doctrine: "Repo-wide grep finds no caller of closeBroadcastChannel and no
    pagehide listener anywhere; the bell's lifecycle teardown is documented as
    wired but is dead code with a false contract comment. Commandment V: "Say
    what is true, not what sounds reasonable.""

        // Close the channel — called on pagehide / adapter close so a
        // reopened connection starts clean.
        export function closeBroadcastChannel(): void {
            channel?.close();
            channel = undefined;
        }

F-067 [IX] web-app/app/adapters/work-orders-deletions.ts:13
    deleteWorkOrderClaim mutates the claim state without ringing the
    work-order bell — the only silent mutation in its family
    symbol: deleteWorkOrderClaim · sites: 1 · security: - · CONFIRMED
    doctrine: "Every sibling mutation in work-orders-mutations.ts ends with
    `workOrderChanges.notify()` (lines 239, 351, 362, 431); this one does not,
    and the sole caller (workbox/detail.ts:204) masks it only by navigating
    away afterward — any future caller inherits a stale-view trap.
    Commandment IX: "And once the better way is found, it must rise to replace
    every similar site — never rest beside them. One codebase, one voice.""

        export async function deleteWorkOrderClaim(
            ctx: RequestContext,
            workOrderId: string,
        ): Promise<void> {
            await ctx.commit({
                ops: [

F-068 [IX] web-app/identities/index.ts:70
    The identities surface family displays mutable data but subscribes to no
    change channel — deaf to cross-tab writes while every other domain page
    listens
    symbol: refresh · sites: 4 · security: - · CONFIRMED
    doctrine: ""Subscribe. Listen. Be notified." Every other data page
    (dashboard, ideas, projects, members, records, flows, workbox,
    organization, invitations) subscribes to its change channel; the
    identities family (identities/index.ts, identities/detail.ts,
    identity-providers/index.ts, identity-tokens/index.ts — grep -c
    subscribe returns 0 for all four) only re-renders after its OWN mutations,
    so another tab's identity/credential/token writes leave these views stale,
    falling short of the CLAUDE.md contract "a successful readwrite commit
    posts the touched table names over a BroadcastChannel ... so other tabs
    refresh." Commandment IX: "it must rise to replace every similar site —
    never rest beside them. One codebase, one voice.""

        async function refresh(): Promise<void> {

    more sites: web-app/identities/detail.ts:1,
    web-app/identity-providers/index.ts:1, web-app/identity-tokens/index.ts:1

### We validate at every edge

F-069 [I] api/access-token.ts:220
    JWT claim gate validates orgs elements but not roles elements
    symbol: hasClaimShape · sites: 1 · security: - · CONFIRMED
    doctrine: "Input: the voice of the uninstructed is frequently corrupt"

            return typeof c.sub === 'string'
                && Array.isArray(c.roles)
                && typeof c.name === 'string'

F-070 [I] api/api.ts:1814
    Request-body parse casts valid-JSON non-objects (null, number, array) past
    the 400 gate into 500 territory
    symbol: handleRequest · sites: 3 · security: - · CONFIRMED
    doctrine: "Input: the voice of the uninstructed is frequently corrupt"

                try {
                    body = (await request.json()) as Record<
                        string,
                        unknown
                    >;

    more sites: api/api.ts:1147, api/api.ts:1419

F-071 [I] api/validators.ts:1095
    JSON-encoded columns gate only parse-ability at entity instantiation;
    structural constraints enforced downstream in read adapters
    symbol: validateFlowEntity · sites: 7 · security: - · CONFIRMED
    doctrine: "Enforce constraints on entity instantiation — never
    downstream."

                graph: pickJsonObjectField(
                    body, 'graph',
                ),

    more sites: api/validators.ts:1136, api/validators.ts:1164,
    api/validators.ts:937, api/validators.ts:940, api/validators.ts:1564,
    api/validators.ts:1588, web-app/app/adapters/flow-queries.ts:38

F-072 [I] web-app/app/adapters/broadcast-channel.ts:54
    BroadcastChannel message cast unvalidated in the adapter that exists to
    validate it
    symbol: subscribeTablesChanged · sites: 1 · security: - · CONFIRMED
    doctrine: "Framework APIs and delegate callbacks: other people's dharma,
    validated in our adapter"

            const listener = (event: MessageEvent): void => {
                const message = event.data as TablesMessage;
                handler(message.tables);
            };

    more sites: web-app/app/channels.ts:51

F-073 [V] api/api.ts:1156
    Missing body fields coerced to '' sentinels, conflating missing-parameter
    with forbidden/unauthorized error classes
    symbol: identityDefaultOrgRoute (PUT branch) · sites: 5 · security […]
    doctrine: "When a value is truly absent, my friends, model that absence at
    the call site — not in the helper. Helpers shall not pretend absence."

                const org = typeof body.organization_id === 'string'
                    ? body.organization_id
                    : '';

    more sites: api/authentication.ts:619, api/authentication.ts:346,
    api/authentication.ts:262

### We handle failure with grace

F-074 [I] web-app/app/presenters/flow-designer.ts:193
    Flow canvas persists are fire-and-forget: #saveFlow awaits
    postFlowVersion/putFlow with no catch and is void-invoked at 11 sites;
    with no global unhandledrejection handler, a failed save surfaces nowhere
    while the canvas keeps the unsaved state — silent divergence between
    displayed and stored flow. The sibling flow-edit layer
    (flow-operations.ts) proves the codebase knows the righteous pattern:
    catch → log.error → typed failOp → toast.
    symbol: FlowDesignerPresenter.#saveFlow · sites: 11 · security: -  […]
    doctrine: "Degrade visibly rather than corrupt silently."

            async #saveFlow(
                versioned: boolean,
                snap: FlowSnapshot,
            ): Promise<void> {
        ...
                void this.#saveFlow(false, next);   // line 238

    more sites: web-app/app/presenters/flow-designer.ts:238,
    web-app/app/presenters/flow-designer.ts:253,
    web-app/app/presenters/flow-designer.ts:280,
    web-app/app/presenters/flow-designer.ts:318,
    web-app/app/presenters/flow-designer.ts:356,
    web-app/app/presenters/flow-designer.ts:689,
    web-app/app/presenters/flow-designer.ts:745,
    web-app/app/presenters/flow-designer.ts:766,
    web-app/app/presenters/flow-designer.ts:788,
    web-app/app/presenters/flow-designer.ts:810,
    web-app/app/presenters/flow-designer.ts:835

F-075 [I] web-app/organization/index.ts:426
    void-invoked async UI handlers with no rejection path: rerender
    (organization), refresh (identities), renderActionBarAndObjectives
    (projects), and onObjectiveAction await org-scoped reads with no catch and
    no caller handling — a failed read leaves stale/diverged UI (e.g.
    internal state flips to 'editing' but the re-render never lands) with no
    toast, no error state, no log; only a console unhandled-rejection.
    symbol: onContainerClick → rerender · sites: 9 · security: - ·  […]
    doctrine: "Degrade visibly rather than corrupt silently."

                void rerender();
                return;
        // rerender (line 96) and renderObjectives (line 109) await
        // getActiveObjectives/getObjectives/... with no try/catch

    more sites: web-app/organization/index.ts:438,
    web-app/organization/index.ts:445, web-app/organization/index.ts:492,
    web-app/identities/index.ts:198, web-app/identities/index.ts:232,
    web-app/projects/detail.ts:259, web-app/projects/detail.ts:277,
    web-app/projects/detail.ts:294

F-076 [V] web-app/records/detail.ts:627
    Catch discards the original fault: toast-only handlers drop err without
    log.error or message enrichment, deviating from the codebase's own
    dominant log+toast pattern — the failure surfaces to the user as a
    generic string but its story is destroyed (org-switcher's bare catch never
    even binds the error).
    symbol: handleSave · sites: 3 · security: - · CONFIRMED
    doctrine: "Enrich errors at each boundary layer — original fault plus
    the context of every step that touched it — until the failure surfaces
    with its full story."

            } catch (err) {
                showToast(
                    'Failed to save Record',
                    'error',
                );
                return;

    more sites: web-app/records/create.ts:65, web-app/app/org-switcher.ts:88

### We choose platform primitives

F-077 [VIII] build:57
    tsx runner retained where the platform's node --strip-types already serves
    the repo
    symbol: (file scope) · sites: 4 · security: - · CONFIRMED
    doctrine: "We choose platform primitives over third-party abstractions…
    What the platform provides, the platform maintains."

        npx tsx web-app/app/compose.ts "$BUILD_DIR"

    more sites: generate-schema-svg:7, web-app/app/compose.ts:8,
    web-app/app/compose.ts:9

F-078 [VIII] web-app/app/dialog.ts:68
    Hand-rolled modal system (focus stack, Escape capture, aria-hidden,
    backdrop divs) re-implements the platform <dialog> element — zero
    <dialog>/showModal usage repo-wide, and the hand-roll lacks the
    primitive's inert-background focus trap
    symbol: openDialog · sites: 7 · security: - · CONFIRMED
    doctrine: "What the platform provides, the platform maintains."

            dialog.classList.remove('hidden');
            dialog.setAttribute(
                'aria-hidden', 'false',
            );
            stack.pushId(dialogId);
            if (stack.hasSingle()) {

    more sites: web-app/organization/index.html:17,
    web-app/snapshots/index.html:22, web-app/projects/detail.html:6,
    web-app/members/index.html:76, web-app/identities/index.html:26,
    web-app/flows/index.html:23

### We measure before we optimize

F-079 [V] CLAUDE.md:358
    CLAUDE.md asserts a speculative link prefetch that commit 7db71890 deleted
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    doctrine: "We do not assert; we measure. We do not declare; we witness.
    (and per AUDIT.md: 'A doc that misstates fact X violates Clarity (V)';
    Commandment V: 'Say what is true, not what sounds reasonable.') Exhaustive
    repo grep finds 'prefetch' ONLY in CLAUDE.md; commit 7db71890 'delete
    speculative link prefetch' removed it from navigation.ts and core.ts, and
    no file-protocol detection exists in navigation.ts either — the contract
    of record still declares an unmeasured optimization the codebase already
    repented of."

        - **`file:///` protocol.** Navigation detects file protocol
          and skips link prefetching. Page URLs use relative paths.

F-080 [XI] api/backend-localstorage.ts:17
    Gzip compression of two localStorage tables with no recorded measurement
    of the quota bottleneck
    symbol: COMPRESSED_TABLES · sites: 1 · security: - · CONFIRMED
    doctrine: "Measure first. Prove the bottleneck exists. Then — and only
    then — optimize. (Commandment XI: 'True when the above eleven are
    honored. Chaotic when pursued prematurely.') The introducing commit
    e2de1f07 carries no number, the file carries no size/quota rationale
    comment, and no root *.md records a measurement proving these two tables
    approach the localStorage quota — the space optimization (plus
    base64+gzip costs on every read/write of these tables) was asserted into
    existence, not measured."

        const COMPRESSED_TABLES: ReadonlySet<string> = new Set([
            'states',
            'flow_versions',
        ]);

        const COMPRESSION_PREFIX = 'gz1:';

### We derive from the ledger

F-081 [II] api/api.ts:1734
    De-membership latency: the gate trusts the token's mint-time org claim —
    a cached snapshot of the memberships ledger — for up to the 15-minute
    TTL
    symbol: handleRequest · sites: 4 · security: KNOWN · CONFIRMED
    contributors: We derive from the ledger; Context as the single vessel
    doctrine: "What the ledger remembers, the cache only re-remembers — two
    truths to reconcile, neither claiming primacy."

                const org = authResult.organization
                    ?? await identityDefaultOrg(
                        adapter, authResult.id,
                    );

    more sites: web-app/app/adapters/init.ts:53, api/api.ts:1037,
    api/api.ts:1115, api/api.ts:1269

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-081a [II] api/api.ts:1734
        De-membership latency: the gate trusts the token's mint-time org claim
        — a cached snapshot of the memberships ledger — for up to the
        15-minute TTL

                    const org = authResult.organization
                        ?? await identityDefaultOrg(
                            adapter, authResult.id,
                        );

    F-081b [IX] api/api.ts:1846
        The server-side pipeline carries no vessel: route handlers receive
        (effective, params, body) fragments, invitation handlers receive
        (adapter, principal, id), and authenticateRequest is invoked from four
        parallel branch pipelines — identity, org, and trace never ride one
        enriched context (the org-scoped adapter is the only enrichment that
        flows)

                            return Response.json(
                                await matched.get(
                                    effective,
                                    params,
                                ),
                            );

F-082 [V] SCHEMA.md:33
    SCHEMA.md declares state columns 'all retired' while clients.status
    remains a mutable lifecycle column outside the paid-for ledger
    symbol: (file scope) · sites: 3 · security: - · CONFIRMED
    doctrine: "Say what is true, not what sounds reasonable."

        **State and deletion:** Entity rows themselves never carry
        state columns (`status`, `readiness`, `deleted_at`,
        `deprecated_at`, etc. are all retired). Every entity
        lifecycle change is recorded as one row in the unified
        `states` event log.

    more sites: SCHEMA.md:300, api/types.ts:577

### Messaging first, state second, datastore last

F-083 [I] web-app/app/root-redirect.ts:19
    Schema-presence is asked beneath its designed message — the root
    redirect interrogates the retired demo tier's key namespace
    symbol: redirectRoot · sites: 4 · security: - · CONFIRMED
    contributors: Messaging first, state second, datastore last; Insulation
    through adapters
    doctrine: "Violates: 'Design the messages first. Derive the state the
    messages require. Choose the datastore to serve the state. The datastore
    is a servant — never a master.' A designed message exists for exactly
    this question — route('snapshots/schema') at api/api.ts:860, asked
    correctly at boot via GET in adapters/init.ts:36-41 — but the root page
    derives its routing decision by probing the localStorage backend's private
    keyspace ('fusion-ai:', duplicated as KEY_PREFIX at
    api/backend-localstorage.ts:15 and STORAGE_KEY_PREFIX at
    web-app/app/storage-keys.ts:4). Git history proves the mastery: the
    probe's last touch (33123fae) is an ancestor of 3cf986af 'Boot the app on
    the IndexedDB adapter', and no code on the IndexedDB tier ever writes a
    'fusion-ai:' localStorage key — the datastore moved and the probe
    silently kept answering for the old one, contradicting the file's own
    contract comment ('landing page (data present)'). command-palette.ts:943
    bypasses the same message a second way (adapter.hasSchema() called
    directly from a UI module). Commandment trace — I: 'You may achieve
    every other virtue in this scripture and still have NOTHING if your code
    is not reliable.'"

        (function redirectRoot(): void {
            const hasSchema = Object.keys(localStorage)
                .some(k => k.startsWith(STORAGE_KEY_PREFIX));
            setLocation(hasSchema
                ? 'landing/index.html'
                : 'snapshots/index.html');

    more sites: web-app/app/command-palette.ts:943,
    api/backend-localstorage.ts:15, web-app/app/storage-keys.ts:4,
    web-app/app/logger.ts:6

F-084 [IX] web-app/app/presenters/workbox-detail.ts:146
    The datastore's JSON-string encoding (flow_graph: JsonObjectField) crosses
    the adapter seam raw — presenters and pages parse storage encoding
    downstream
    symbol: WorkOrderDetailPresenter (constructor) / validateWorkOrderFl […]
    doctrine: "Violates: 'The datastore is a servant — never a master.'
    WorkOrderEntity.flow_graph (api/types.ts:1091) is a branded persistence
    encoding (JsonObjectField = string & brand), and it is handed across the
    seam untranslated, so two presenters and two page modules must each know
    that the datastore persists graphs as JSON strings and re-parse/validate
    per use — the storage encoding dictates presentation-layer code. The
    codebase has already found and documented the better way for the identical
    problem one screen up: RecordAttribute's comment (api/types.ts:1121-1124)
    — 'above the storage seam options and constraints are real arrays, never
    the JsonArrayField strings the datastore persists.' Commandment trace —
    IX: 'And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice.'"

                this.#workOrder = workOrder;
                this.#flowGraph =
                    validateWorkOrderFlowGraph(
                        workOrder.flow_graph,
                    );

    more sites: web-app/app/presenters/workbox-inbox.ts:185,
    web-app/workbox/index.ts:175, web-app/workbox/detail.ts:237,
    api/types.ts:1091

### Context as the single vessel

F-085 [VIII] web-app/app/adapters/shared.ts:103
    Bag and runner fused: the vessel carries the I/O verb closures
    (GET/PUT/DELETE/POST/commit), so the context as a whole is neither
    serializable nor loggable — only its state half (requestId, identity)
    is; the steps ride inside the bag instead of serving it
    symbol: RequestContext · sites: 1 · security: - · REFUTED
    doctrine: "Context is the only argument passed to methods —
    serializable, loggable, complete by covenant. ... a bag whose sole
    responsibility is to BE the bag. The context flows; the steps serve."

        export interface RequestContext {
            readonly requestId: string;
            readonly identity: Principal;
            GET<T>(resource: string): Promise<T>;
            // ... PUT/DELETE/POST ...
            commit(tx: Transaction): Promise<void>;

F-086 [IX] web-app/app/adapters/init.ts:37
    I/O performed outside the vessel: adapters/init.ts imports the raw
    transport GET from api/api.ts (the contract says 'adapters never import
    them directly') and command-palette feature code reaches the raw storage
    adapter for hasSchema(), beside the established vessel idiom
    symbol: initAdapter · sites: 2 · security: - · REFUTED
    doctrine: "Context is the only argument passed to methods. — and
    Commandment IX: 'once the better way is found, it must rise to replace
    every similar site — never rest beside them. One codebase, one voice.'"

            const schema =
                await GET<string | null>(
                    adapter, 'snapshots/schema',
                    getSessionToken(),
                );

    more sites: web-app/app/command-palette.ts:942

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-086a [IX] web-app/app/command-palette.ts:942
        Feature code reaches the raw storage adapter: command-palette's
        eager-load gate calls getDbAdapter().hasSchema() directly — the only
        raw DbAdapter method call outside adapters/ — instead of receiving
        boot's already-computed hasSchema (core.ts threads it to the sibling
        initSidebarLayout but not to initCommandPalette) or using an
        adapter-layer accessor

                    const adapter = getDbAdapter();
                    if (await adapter.hasSchema()) {

F-087 [X] web-app/app/adapters/shared.ts:125
    One vessel, two truths: ctx.identity is frozen at creation while
    recovery-enabled verbs resolve getSessionToken() live per call, so the
    vessel's stated identity and the principal executing its verbs can diverge
    (org switch or session recovery mid-flight); consumers like activeOrg(ctx)
    and role-grant attribution read the frozen half
    symbol: createRequestContext · sites: 1 · security: - · REFUTED
    doctrine: "And the vessel, my friends, is a bag whose sole responsibility
    is to BE the bag. Two reads see one truth. Not for speed — for
    ATOMICITY. Speed is the consequence; atomicity is the goal."

            const identity = principalFromToken(token);
        // ...
                return recover
                    ? withAuthRecovery(adapter, make)
                    : make(token);
        // shared.ts:191:  return await make(getSessionToken());

    more sites: web-app/app/adapters/shared.ts:191,
    web-app/app/adapters/shared.ts:174, web-app/app/adapters/records.ts:206

### Composition over inheritance

F-088 [VIII] api/db-indexeddb.ts:14
    Class inheritance used as construction presets over BackedDbAdapter where
    factory functions would compose
    symbol: IndexedDbDbAdapter · sites: 3 · security: - · CONFIRMED
    doctrine: ""Gamma, Helm, Johnson, and Vlissides wrote in Design Patterns:
    favor object composition over class inheritance. Composition organizes
    code by what it does; inheritance organizes code by what it is. The
    faithful compose." The three tier adapters are class inheritance
    organizing code by what it IS (tier identity), while the actual variation
    is already fully composed — backend, latency shim, and open hook are
    constructor arguments to the concrete base. Each subclass adds zero
    overrides, zero state, zero behavior; the files' own comments concede it:
    "A construction preset over BackedDbAdapter" (db-memory.ts:7,
    db-localstorage.ts:11-12). A factory function returning new
    BackedDbAdapter(...) expresses the identical composition without lineage.
    Mitigation, honestly weighed: depth-1, Liskov-clean (no promise of the
    parent is altered), so this is the mildest possible form of the sin —
    extends as syntax sugar over a composition the base already performs."

        export class IndexedDbDbAdapter extends BackedDbAdapter {
            constructor(
                post?: (tables: readonly string[]) => void,
            ) {
                const backend = new IndexedDbBackend(post);
                super(

    more sites: api/db-memory.ts:8, api/db-localstorage.ts:13

### Insulation through adapters

F-089 [IX] web-app/app/adapters/work-orders-mutations.ts:77
    WebCrypto digest inlined in a business (data-access) adapter rather than a
    dedicated seam
    symbol: generateDisplayId · sites: 1 · security: - · REFUTED
    doctrine: ""The thinnest adapter is not ceremony — it is the DIVORCE
    POINT. Measure adapters by their seams." Every other WebCrypto touch lives
    in a dedicated single-purpose seam — api/access-token.ts (sign/verify),
    api/password-hash.ts (deriveBits), api/crypto-safe-base62.ts
    (getRandomValues) — but here crypto.subtle.digest sits inline amid
    work-order claim/display-id domain logic in a data-access adapter, the
    kind ARCHITECTURE.md defines as using ctx for I/O, distinct from platform
    shims that "wrap browser primitives behind adapters the app owns".
    Divorcing WebCrypto now means editing business logic, widening the divorce
    surface beyond the dedicated seams. Borderline by the letter (the module
    is an owned adapter); cited at the least severe defensible numeral."

            const data = new TextEncoder()
                .encode(uuid);
            const hash = await crypto.subtle
                .digest('SHA-256', data);

F-090 [IX] web-app/flows/detail.ts:1053
    Adapter seams pass platform Blob/File types, forcing page modules to touch
    the primitives themselves
    symbol: handleExportZip · sites: 4 · security: - · REFUTED
    doctrine: ""Measure adapters by their seams, not their function count."
    adapters/blob-download.ts downloadBlob(blob: Blob, filename) admits the
    platform type at its seam, so every caller page must construct new Blob
    itself — the insulation stops one constructor short; a (bytes, mimeType,
    filename) seam would keep the primitive inside the adapter. Likewise
    flows/index.ts handleFileSelect reads file.arrayBuffer() in the page
    before calling the adapter, while the snapshot import path hands the File
    to the adapter (putSnapshotFromFile) — the same primitive handled on
    both sides of the seam. "Our code touches external code only through
    adapters we own.""

            const blob = new Blob(
                [result.data as
                    unknown as ArrayBuffer],
                { type: 'application/zip' },
            );
            downloadBlob(blob, result.name);

    more sites: web-app/snapshots/index.ts:480, web-app/flows/index.ts:313,
    web-app/flows/index.ts:353

F-091 [IX] web-app/identities/detail.ts:156
    Native blocking window.confirm used raw in a page module
    symbol: handleErase · sites: 1 · security: - · CONFIRMED
    doctrine: ""Some shape the entity and speak the domain; others wrap a
    single primitive against the day it evolves. Both are sacred." — and the
    Sin of Coupling: "Every external dependency — library, service,
    framework — gets an adapter. No exceptions." The codebase shims window
    one property deep elsewhere (adapters/viewport.ts wraps window.innerWidth;
    adapters/location.ts wraps window.location.href) and owns a full dialog
    system (core.ts openDialog/closeDialog per CLAUDE.md), yet this lone BOM
    dialog primitive is touched raw in a page — the only such site
    repo-wide. Commandment IX: "One codebase, one voice.""

            const confirmed = window.confirm(
                'Erase this identity\'s personal information?'
                + ' The identity itself survives.',
            );

### We speak our own idiom

F-092 [III] web-app/app/adapters/projects.ts:55
    Adapter exported surface speaks storage vocabulary: 12 get*Row(s) exports
    consumed by 8 page modules, against the repo's own convention ('Adapter
    functions use domain nouns (getIdea, not getIdeaEntity)', ARCHITECTURE.md
    § Naming Conventions)
    symbol: getProjectRows · sites: 12 · security: - · CONFIRMED
    doctrine: "What enters speaks one tongue; what exits speaks another. To
    let foreign names pass through is to confess the adapter has done only
    half its work."

        export async function getProjectRows(
            ctx: RequestContext,
        ): Promise<ProjectEntity[]> {
            return ctx.GET<ProjectEntity[]>('projects');
        }

    more sites: web-app/app/adapters/ideas.ts:62,
    web-app/app/adapters/work-orders-queries.ts:107,
    web-app/app/adapters/ai-members.ts:111,
    web-app/app/adapters/flow-queries.ts:72, web-app/app/adapters/flows.ts:4,
    web-app/app/adapters/ideas.ts:68, web-app/app/adapters/members.ts:189,
    web-app/app/adapters/projects.ts:237,
    web-app/app/adapters/record-attributes.ts:46,
    web-app/app/adapters/records.ts:65,
    web-app/app/adapters/work-orders-queries.ts:115

F-093 [III] web-app/app/presenters/record-detail.ts:192
    Storage snake_case idiom spoken natively in presenters and page modules
    — including a presenter-born draft type adopting storage casing
    (ARCHITECTURE.md § Presenter Pattern blesses presenters taking the
    entity; the casing still crosses the divorce point)
    symbol: AttributeDraft · sites: 50 · security: - · CONFIRMED
    doctrine: "Vocabulary native to one idiom, imported into code that speaks
    a different idiom, is a violation independent of any data correctness.
    Naming alone is the violation."

        export interface AttributeDraft {
            id: string;
            name: string;
            attribute_type: AttributeType;
            sort_order: number;

    more sites: web-app/records/detail.ts:487,
    web-app/app/presenters/workbox-detail.ts:195,
    web-app/app/presenters/workbox-detail.ts:569,
    web-app/app/presenters/workbox-inbox.ts:229,
    web-app/app/presenters/project-score-history.ts:110,
    web-app/workbox/index.ts:176, web-app/projects/detail.ts:914,
    web-app/flows/detail.ts:1384

F-094 [III] web-app/flows/detail.ts:1380
    Page modules bypass the adapter divorce point: raw ctx.GET with storage
    table names and an inline snake_case wire shape in the page layer, while
    the documented binding seam (adapters/flow-records.ts) exists
    symbol: deleteExistingFlowRecord · sites: 2 · security: - · CONFIRMED
    doctrine: "The adapter is the divorce point not only of structure but of
    vocabulary."

        const all = await ctx.GET<
            Array<{ id: string; flow_id: string }>
        >('flow-records');
        const existing = all.find(
            r => r.flow_id === flowId,
        );

    more sites: web-app/records/detail.ts:131

### Every operation is an HTTP operation

F-095 [III] api/db.ts:136
    api-tier operation primitives named off the HTTP idiom (StateStore
    reads/append, schema-snapshot lifecycle, seeders)
    symbol: StateStore.record · sites: 13 · security: - · CONFIRMED
    doctrine: ""Every operation is an HTTP operation... Single-noun
    primitives: get_noun, put_noun, delete_noun, post_noun_operation."
    EntityStore on the same tier speaks
    getAll/getById/getAllWhere/put/putMany/delete, and the layers above rename
    these very operations into HTTP (routes: GET/POST/DELETE snapshots/schema,
    PUT snapshots/import; adapters:
    getSnapshot/putSnapshot/postSchemaCreation/postMockDataLoad/postBootstrap)
    — leaving these the lone non-HTTP voice in the stack: record is a
    POST-shaped append (composed from put, store-state.ts:91);
    currentFor/allFor/deletedIds and their *In twins are GET-shaped reads
    carrying no verb where the sibling read is getAllWhere;
    createSchema/exportSnapshot/importSnapshot (db.ts:216,335-337) are routed
    operations named in create/export/import vocabulary;
    populateMockData/populateBootstrapData (mock-data.ts:541,6541) are POSTed
    seed operations named populate. Backend and parent-scoped implementations
    mirror the interface (e.g. store-parent-scoped.ts:248). Trace to
    Commandment III: "Call a thing a thing, in all things.""

            record(
                id: Id,
                entityId: Id,
                state: string,
                memberId: Id,
            ): Promise<void>;

    more sites: api/db.ts:142, api/db.ts:145, api/db.ts:146, api/db.ts:151,
    api/db.ts:155, api/db.ts:156, api/db.ts:216, api/db.ts:335, api/db.ts:336,
    api/db.ts:337, api/mock-data.ts:541, api/mock-data.ts:6541

F-096 [III] web-app/app/adapters/authentication.ts:25
    Adapter-layer operations named outside the HTTP-verb idiom
    symbol: loginViaPassword · sites: 7 · security: - · CONFIRMED
    doctrine: ""Single-noun primitives: get_noun, put_noun, delete_noun,
    post_noun_operation. ... The naming convention is the documentation." The
    adapters folder IS the operation surface and its own siblings prove the
    idiom (postSessionLogout, postSessionRefresh, postOrgSessionExchange,
    postClipboardCopy, getPreference), yet seven operations speak
    login/set/write/download/clear/ensure instead: loginViaPassword drives two
    POSTs; setLocation (location.ts:5) is the navigation shim beside the
    conformant getQueryString; writePreference (preferences.ts:18) is a
    localStorage PUT paired with a conformant getPreference; downloadBlob is
    POST-shaped while the equivalent clipboard shim is postClipboardCopy;
    setSessionToken/clearSessionToken/ensureSessionToken are
    put/delete/get-or-mint on the session-token noun. Trace to Commandment
    III: "Call a thing a thing, in all things... If code does not read
    correctly, the names are — by definition — wrong.""

        export async function loginViaPassword(
            ctx: RequestContext,
            username: string,
            password: string,
        ): Promise<SessionCredentials | null> {

    more sites: web-app/app/adapters/location.ts:5,
    web-app/app/adapters/preferences.ts:18,
    web-app/app/adapters/blob-download.ts:3, web-app/app/adapters/init.ts:75,
    web-app/app/adapters/init.ts:79, web-app/app/adapters/init.ts:88

### Communicating sequential processes

F-097 [VI] web-app/app/adapters/shared.ts:231
    Boot hands the session to concurrent read flows by mutating a shared
    holder; the admitted race is patched by 401-retry
    symbol: recoverSession · sites: 1 · security: - · REFUTED
    doctrine: ""Processes share memory by communicating — *never*
    communicate by sharing memory." The org-scoped session travels from the
    boot flow to every reader through the mutable module holder `let
    sessionToken` (init.ts:55), sampled at call time by sessionContext();
    ordering is by scheduling accident, and the code admits a read can observe
    the stale anonymous seed mid-mutation. The compensation is a server 401
    plus single-shot retry (withAuthRecovery) rather than an awaited
    session-ready handoff. Commandment VI: "When state mutates silently, trust
    dies.""

        // A live access token ('install') that still drew a 401 did not
        // expire — the holder was the unscoped anonymous seed (a read
        // raced ahead of boot scoping). Re-install the live token and
        // re-scope; the caller retries once.

    more sites: web-app/app/adapters/init.ts:55, web-app/app/core.ts:150

F-098 [X] web-app/app/adapters/identity-tokens.ts:19
    Cross-tab exclusivity coordinated by read-then-commit on the shared
    ledger, not by message or platform lock
    symbol: postTokenRotation · sites: 2 · security: NEW · REFUTED
    doctrine: ""Processes share memory by communicating — *never*
    communicate by sharing memory." (Articles of Faith, We believe in
    communicating sequential processes). Two real processes (tabs) decide
    refresh-token liveness and work-order claim exclusivity by racing
    GET-then-commit over the shared ledger. The sibling site
    (work-orders-mutations.ts:365) admits "Two tabs can both observe no live
    claim, both write a 'claimed' event, both succeed — duplicate claims"
    and interposes a disabled UI button as the interim lock — exclusivity
    simulated in application-layer shared state while the in-code comment
    itself names the unused platform coordination primitive (Web Locks)."

        // CROSS-TAB SHARED-WRITE HAZARD. postTokenRotation reads the
        // ledger then appends — two tabs (or parallel agents) rotating
        // the same chain both read v0 and the second commit overwrites
        // the first, so a rotation can be lost (and reuse-detection
        // missed). An in-memory mutex cannot fix this — tabs share no
        // heap — only a browser-mediated lock (Web Locks) or the

    more sites: web-app/app/adapters/work-orders-mutations.ts:365

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-098a [X] web-app/app/adapters/work-orders-mutations.ts:365
        Work-order claim exclusivity decided by read-then-commit across
        separate transactions (duplicate-claim TOCTOU)

            // Two tabs can both observe no live claim, both
            // write a 'claimed' event, both succeed —
            // duplicate claims for one work order. localStorage
            // has no compare-and-swap, so any
            // read-check-write inside this function would
            // still have a TOCTOU window.

### We acknowledge the cost of the discipline

F-099 [IX] api/api.ts:767
    organizations PUT pays the same validator twice — the only route of 29
    to do so
    symbol: routes · sites: 1 · security: - · CONFIRMED
    doctrine: "Once data has crossed the threshold of validation, trust it
    completely. To distrust validated data is to lack faith in your peers. —
    Every EntityStore is already constructed with its validator
    (api/db-backed.ts:279 wires validateOrganizationEntity into the
    organizations store; api/store-entity.ts:113 runs this.#validate(body) on
    every put, in all three backend tiers). The route-level putValidate runs
    the identical validator on the identical body immediately before the store
    runs it again — the validator cost paid twice at this one site while the
    other 28 put-capable routes pay once at the store, and with no
    compensating benefit (both paths throw the same plain Error class)."

        makeIdRoute<OrganizationEntity>({
            noun: 'organizations',
            store: db => db.organizations,
            verbs: ['get', 'put'],
            putValidate: validateOrganizationEntity,
        }),

### On the Sin of Premature Optimization

F-100 [V] CLAUDE.md:358
    CLAUDE.md documents link prefetching and file-protocol detection that do
    not exist in the code
    symbol: ## Gotchas — `file:///` protocol bullet · sites: 1 · sec […]
    contributors: XI. Efficiency; On the Sin of Premature Optimization; On the
    Sin of the Cache
    doctrine: "V. Clarity: "Say what is true, not what sounds reasonable." The
    repo-root contract of record describes an efficiency mechanism (link
    prefetching) and a protocol-detection branch that exist nowhere: `rg
    prefetch` matches only CLAUDE.md:359; web-app/app/navigation.ts (read in
    full this run) contains no protocol check and no prefetch; `rg
    'location\.protocol'` over all .ts returns zero hits; no `rel="prefetch"`
    in any HTML."

        - **`file:///` protocol.** Navigation detects file protocol
          and skips link prefetching. Page URLs use relative paths.
          Code supports `file:///` locally but testing is HTTP-only.

F-101 [XI] api/db.ts:393
    Speculative secondary indexes: 22 of 41 declared index columns have no
    keyed reader anywhere
    symbol: TABLE_INDEXES · sites: 22 · security: - · CONFIRMED
    doctrine: ""Never optimize what you have not measured." (On the Sin of
    Premature Optimization). Commandment XI trace: "True when the above eleven
    are honored. Chaotic when pursued prematurely." An index exists only to
    accelerate reads; the policy indexes EVERY FK column, yet exhaustive
    symbol search of every getWhere/getAllWhere call site shows only 19 of the
    41 declared (table,column) pairs are ever read through an index. The other
    22 — e.g. flow_versions.flow_id, project_flows.*, flow_work_orders.*,
    state_field_values.*, flow_records.*, invitations.*,
    idea_submissions.idea_id, objective_revisions.objective_id, both
    project_objective_*_scores pairs, states.member_id,
    identity_tokens.identity_id, identity_providers.identity_id,
    authorization_codes.identity_id, record_attributes.record_id —
    accelerate reads that do not exist: the api.ts routes serving those tables
    read getAll() + JS filter
    (api/api.ts:604,620,665,678,706,742,812,1321,1375,1507), and the org fence
    resolves their owners via parent getById, not their FK indexes
    (api/db-org-scoped.ts:192-243). IndexedDB maintains each index on every
    put — a write-side cost provisioned 'in case', never measured into
    existence."

        // The secondary indexes each store carries: every FK and
        // read-discriminator column, declared beside TABLE_NAMES as
        // the schema of record both backends read. A keyed read
        // (`Tx.getWhere`) names one of these.
        export const TABLE_INDEXES:
            Record<string, readonly string[]> = {

    more sites: api/db.ts:400, api/db.ts:401, api/db.ts:402, api/db.ts:406,
    api/db.ts:407, api/db.ts:409, api/db.ts:410, api/db.ts:412, api/db.ts:413,
    api/db.ts:415, api/db.ts:416, api/db.ts:418, api/db.ts:419, api/db.ts:421,
    api/db.ts:423

### On the Sin of the Cache

F-102 [II] api/api.ts:1205
    KNOWN re-confirmed: token org claim is a TTL-lived membership snapshot —
    de-membership latency up to 15 min
    symbol: callerActiveOrg / orgScopedAdapter · sites: 1 · security:  […]
    doctrine: ""What the ledger remembers, the cache only re-remembers — two
    truths to reconcile" (We derive from the ledger). The tenancy fence
    (api.ts:1803 'effective = orgScopedAdapter(adapter, org);') trusts the
    verified mint-time `org` claim for SESSION_TTL_SECONDS = 15*60
    (web-app/app/adapters/init.ts:53); revoking a membership does not bite
    until the token expires. Disclosed at ARCHITECTURE.md:281:
    "**De-membership latency on the token claim.** A session token carries its
    `orgs`/roles claim for `SESSION_TTL_SECONDS`..." Seam re-confirmed
    UNWIDENED this run: the per-request token-revocation ledger consult exists
    (api.ts:975 tokenRevocationReason), and every authority-bearing
    enumeration re-derives from the membership ledger instead of the claim
    (api.ts:1093 'derived FRESH from the membership ledger (never the token
    claim, so it cannot be stale)'). The snapshot is TTL-bounded like
    Cache-Control — the doctrine's one sanctioned declarative cache shape
    — but it remains a cached authorization fact awaiting the server tier.
    Commandment II: "A compromised system is a fallen system.""

            return principal.organization
                ?? await identityDefaultOrg(adapter, principal.id);

    more sites: web-app/app/adapters/init.ts:53, ARCHITECTURE.md:281

F-103 [XI] web-app/app/command-palette.ts:304
    Command-palette search index is a one-shot snapshot kept in sync by
    nothing
    symbol: getSearchIndex / state.isDataLoaded · sites: 1 · security: […]
    doctrine: ""It is a tax paid in staleness, in two-sources-of-truth, in
    maintenance overhead on every write path" and "every cache must be
    measured into existence" (On the Sin of the Cache); kin Article: "derived
    caches of its truth are duplication, not optimization... the cache is kept
    in sync by nothing." The index snapshots ideas, projects, and members once
    per page load (line 331 sets isDataLoaded=true; the only subscription,
    subscribeSchemaChanges at line 949, is a one-shot deferral until schema
    exists, not invalidation). It is also EAGER-built at page init (lines
    941-957, 'eager search index load failed') — three table reads warmed
    for a surface the user may never open, with no measurement on record.
    Meanwhile the app's own freshness infrastructure exists for exactly these
    tables — createSubscriptionChannel wraps ideaChanges
    (adapters/ideas.ts:40), projectChanges (adapters/projects.ts:32),
    memberChanges (adapters/members.ts:34) — and every sampled data page
    subscribes and re-derives; the palette alone caches. An entity created,
    renamed, or deleted in-page or cross-tab (BroadcastChannel) is wrong in
    search until full navigation."

            async function getSearchIndex(
            ): Promise<void> {
                if (state.isDataLoaded) return;

    more sites: web-app/app/command-palette.ts:331,
    web-app/app/command-palette.ts:941

### On the Sin of Premature Generalization

F-104 [IX] web-app/app/adapters/clients.ts:7
    Adapter verb suites shipped before any consumer — 28 production-dead
    functions whose only caller is their own unit test
    symbol: getClient · sites: 28 · security: - · CONFIRMED
    doctrine: ""Beware these sinful practices! … the framework written
    before the second use case" — full HTTP-verb suites were stamped per
    noun regardless of which verbs any page needs. The entire clients adapter
    (getClient/putClient/deleteClient — no clients page exists),
    postTokenIssue/postTokenRevocation/getTokenChainState,
    postProviderLink/postProviderUnlink (the identity-providers page never
    mutates), get/put/deleteRecordAttribute, postRoleGrant/getRolesFor, and 13
    more have zero callers in any page or module; each is exercised only by
    the test file that ships beside it. Word-boundary cross-reference over all
    production .ts and .html this run; in-file usage separately ruled out
    (definition-only)."

        export async function getClient(
            ctx: RequestContext,
            id: Id,
        ): Promise<ClientEntity> {
            return ctx.GET<ClientEntity>(`clients/${id}`);
        }

    more sites: web-app/app/adapters/identity-tokens.ts:53,
    web-app/app/adapters/identity-tokens.ts:98,
    web-app/app/adapters/identity-tokens.ts:170,
    web-app/app/adapters/clients.ts:14, web-app/app/adapters/clients.ts:22,
    web-app/app/adapters/authorization-codes.ts:36,
    web-app/app/adapters/authorization-codes.ts:48,
    web-app/app/adapters/authorization-codes.ts:63,
    web-app/app/adapters/flow-queries.ts:57,
    web-app/app/adapters/flow-records.ts:30,
    web-app/app/adapters/identities.ts:38,
    web-app/app/adapters/identity-credentials.ts:39,
    web-app/app/adapters/identity-credentials.ts:51,
    web-app/app/adapters/identity-providers.ts:35,
    web-app/app/adapters/identity-providers.ts:46,
    web-app/app/adapters/identity-token-revocations.ts:25,
    web-app/app/adapters/objectives.ts:47,
    web-app/app/adapters/objectives.ts:158,
    web-app/app/adapters/record-attributes.ts:55,
    web-app/app/adapters/record-attributes.ts:77,
    web-app/app/adapters/record-attributes.ts:97,
    web-app/app/adapters/records.ts:166, web-app/app/adapters/records.ts:252,
    web-app/app/adapters/role-grants.ts:34,
    web-app/app/adapters/role-grants.ts:50, api/access-token.ts:60,
    api/provider-models.ts:66

F-105 [IX] web-app/app/icons.ts:223
    Dead exported surface: 54 symbols defined and referenced nowhere —
    speculative inventory and symmetry-stamped suites
    symbol: iconBell · sites: 54 · security: - · CONFIRMED
    doctrine: ""'But we'll need this everywhere!' We'll need it. *Everywhere.*
    Will we? … Wait for the third instance. Let the pattern speak. Abstract
    what is genuinely shared — and only that." — 36 of 104 icon functions
    are definition-only (zero references in any .ts, .html, or test,
    word-boundary verified this run): inventory imported ahead of any use
    case. Same pattern: api/types.ts stamps a STATES/is/assert guard suite per
    state alphabet, but only the project alphabet's guards found consumers —
    isFlowState/assertFlowState (types.ts:314/320),
    isObjectiveState/assertObjectiveState, isAttributeType, isConfidenceLevel,
    CONFIDENCE_CONFIG, projectStateIsScorable/AllowsMeasurement are dead; and
    three notify*Change hooks (e.g. members.ts:44) were stamped beside a
    sibling (notifyObjectiveChange) that is used, never called themselves."

        export function iconBell(size: number, cssClass: string) {

    more sites: api/types.ts:320, api/types.ts:358, api/types.ts:1355,
    api/types.ts:202, api/types.ts:194, api/types.ts:314, api/types.ts:352,
    api/types.ts:1732, api/types.ts:1726, web-app/app/adapters/members.ts:44,
    web-app/app/adapters/ai-members.ts:34,
    web-app/app/adapters/invitations.ts:26,
    web-app/app/adapters/broadcast-channel.ts:62,
    web-app/app/adapters/identities.ts:189,
    web-app/app/adapters/work-orders-queries.ts:135, web-app/app/dom.ts:132,
    web-app/app/flow-layout.ts:27, web-app/app/flow-layout.ts:28,
    web-app/app/icons.ts:188, web-app/app/icons.ts:284,
    web-app/app/icons.ts:306, web-app/app/icons.ts:317,
    web-app/app/icons.ts:331, web-app/app/icons.ts:400,
    web-app/app/icons.ts:445, web-app/app/icons.ts:454,
    web-app/app/icons.ts:467, web-app/app/icons.ts:517,
    web-app/app/icons.ts:719, web-app/app/icons.ts:777,
    web-app/app/icons.ts:820, web-app/app/icons.ts:860,
    web-app/app/icons.ts:879, web-app/app/icons.ts:908,
    web-app/app/icons.ts:959, web-app/app/icons.ts:1019,
    web-app/app/icons.ts:1032, web-app/app/icons.ts:1042,
    web-app/app/icons.ts:1073, web-app/app/icons.ts:1119,
    web-app/app/icons.ts:1183, web-app/app/icons.ts:1237,
    web-app/app/icons.ts:1259, web-app/app/icons.ts:1276,
    web-app/app/icons.ts:1295, web-app/app/icons.ts:1314,
    web-app/app/icons.ts:1327, web-app/app/icons.ts:1340,
    web-app/app/icons.ts:1352, web-app/app/icons.ts:1377,
    web-app/app/icons.ts:1385, web-app/app/icons.ts:1403,
    web-app/app/icons.ts:1442

F-106 [IX] web-app/app/loading-states.ts:252
    Dead configurability knobs in shared UI helpers:
    timeoutMs/TimeoutError/fetchWithTimeout (0 of 20 call sites),
    EmptyStateConfig.action + buildEmptyState action (0 users; the export has
    0 external importers), 'stats-row' SkeletonType + buildSkeletonStatsRow (0
    callers), icon() ariaLabel (0 of ~104 calls)
    symbol: withLoadingState · sites: 21 · security: - · CONFIRMED
    contributors: IX. Generality; On the Sin of Premature Generalization; On
    the Sin of Asking, Not Telling
    doctrine: "Beware these sinful practices! … configurable behavior added
    'in case we need it later' (On the Sin of Premature Generalization);
    'Never generalize before exploratory duplication.'"

            retryFn?: () => void,
            emptyState?: EmptyStateConfig,
            timeoutMs?: number,
        ): Promise<T | null> {

    more sites: web-app/app/loading-states.ts:218 (export class TimeoutError
    — zero importers), web-app/app/loading-states.ts:228 (fetchWithTimeout
    — reachable only via the never-passed timeoutMs),
    web-app/app/loading-states.ts:14 ('stats-row' union member; case at :144;
    builder at :49), web-app/app/loading-states.ts:211
    (EmptyStateConfig.action — zero configs set it; param twin at :174),
    web-app/app/icons.ts:7 (ariaLabel? param — no icon function passes it;
    every icon renders aria-hidden), web-app/app/loading-states.ts:218,
    web-app/app/loading-states.ts:228, web-app/ideas/index.ts:78,
    web-app/dashboard/index.ts:65, web-app/records/detail.ts:113,
    web-app/records/index.ts:80, web-app/identity-tokens/index.ts:45,
    web-app/members/index.ts:96, web-app/members/detail.ts:198,
    web-app/projects/index.ts:94, web-app/identities/detail.ts:120,
    web-app/identities/index.ts:52, web-app/workbox/detail.ts:332,
    web-app/workbox/index.ts:128, web-app/workbox/index.ts:201,
    web-app/workbox/index.ts:257, web-app/ideas/detail.ts:182,
    web-app/flows/detail.ts:1442, web-app/flows/index.ts:108,
    web-app/flows/stats.ts:149, web-app/invitations/index.ts:36,
    web-app/identity-providers/index.ts:45

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-106a [IX] web-app/app/loading-states.ts:252
        Dead timeout machinery in withLoadingState: timeoutMs param passed by
        0 of 20 call sites; TimeoutError exported with zero importers;
        fetchWithTimeout reachable only via the never-passed flag

                timeoutMs?: number,
            ): Promise<T | null> {
            ...
                const run = timeoutMs
                    ? () => fetchWithTimeout(
                        fetchFn, timeoutMs,
                    )
                    : fetchFn;

    F-106b [IX] web-app/app/loading-states.ts:14
        Dead 'stats-row' skeleton variant: union member, unreachable switch
        case, and buildSkeletonStatsRow builder have zero callers repo-wide

                | 'stats-row';
            ...
                    case 'stats-row':
                        return buildSkeletonStatsRow();

    F-106c [IX] web-app/app/icons.ts:7
        Unreachable ariaLabel knob in the private icon() helper: none of the
        104 exported icon functions has a third parameter to forward it, so
        every icon renders aria-hidden

                ariaLabel?: string,
            ): SafeHtml {
                const a11y = ariaLabel
                    ? `role="img" aria-label="${ariaLabel}"`
                    : 'aria-hidden="true"';

### On the Sin of Shared Mutable State

F-107 [I] web-app/app/adapters/shared.ts:186
    Unserialized concurrent token refresh over the shared mutable session
    credential: parallel 401s each run recovery against the same refresh jti;
    the grant brands the losers as reuse, revokes the whole chain (including
    the winner's fresh pair), scrubs the credential, and force-logs the user
    out. No single-flight guard exists in-tab, and no cross-tab coordination
    exists for the localStorage credential. Trigger paths are live: pages
    issue Promise.all reads on recovery-enabled contexts (e.g.
    web-app/projects/index.ts:54-58), so one expired token yields N
    simultaneous recoveries. The 'install' branch comment at shared.ts:231-237
    records this interleaving family biting once before (a read raced ahead of
    boot scoping) and being patched downstream rather than serialized.
    symbol: withAuthRecovery · sites: 5 · security: - · CONFIRMED
    doctrine: ""Every thread that touches the shared variable multiplies the
    possible interleavings... If two processes need the same data, one sends a
    message; the other receives it. There is no third way." Each concurrent
    verb call touches the shared sessionToken and localStorage credential
    directly instead of awaiting one refresh process's message. Commandment I:
    "You may achieve every other virtue in this scripture and still have
    NOTHING if your code is not reliable." The interleaving destroys a healthy
    session (api/authentication.ts:256: 'A non-live jti is reuse — the whole
    chain is revoked, then 401')."

        async function withAuthRecovery<T>(
            adapter: DbAdapter,
            make: (tok: string) => Promise<T>,
        ): Promise<T> {
            try {
                return await make(getSessionToken());

    more sites: web-app/app/adapters/shared.ts:217,
    web-app/app/adapters/shared.ts:285,
    web-app/app/adapters/session-credentials.ts:38,
    web-app/projects/index.ts:54

F-108 [VI] api/backend-memory.ts:46
    Memory-tier transactions alias committed rows to callers: the buffer
    shallow-copies each table array but shares the row objects with the live
    store, and bufferTx get/getWhere return those live references. Row types
    declare no readonly and nothing clones (zero structuredClone sites), so
    one in-place mutation of a fetched row silently rewrites committed state
    — even from inside an aborted transaction, falsifying the file's own
    rollback claim ('A throw skips the flush, so the live store is
    byte-identical'). IndexedDB structured-clones every read; the test tier
    aliases — divergent value semantics across the very seam the automated
    suite stands on. Latent: no current caller was found mutating a fetched
    row, but the seam is unfenced.
    symbol: MemoryStorageBackend.transaction · sites: 3 · security: -  […]
    doctrine: ""If two processes need the same data, one sends a message; the
    other receives it. There is no third way." Aliasing one mutable row object
    between the committed store and the transaction's caller is the third way.
    Commandment VI: "When state mutates silently, trust dies... values are the
    true abstraction — immutable, comparable, and free of time.""

                    for (const table of tables) {
                        const rows = this.#tables.get(table);
                        if (rows === undefined) {
                            throw new MissingTableError(table);
                        }
                        buffer.set(table, [...rows]);

    more sites: api/backend-buffer-tx.ts:43, api/backend-buffer-tx.ts:58

### On the Sin of Global State

F-109 [VI] web-app/app/adapters/shared.ts:191
    Recovery-enabled RequestContext reads and rewrites the live session-token
    global mid-request while ctx.identity stays frozen at creation
    symbol: withAuthRecovery · sites: 4 · security: - · CONFIRMED
    contributors: On the Sin of Global State; On the Sin of Scattered Context;
    The Office of the Context
    doctrine: "On the Sin of Global State: "Global variables whisper to every
    corner of the codebase, and none can say who spoke first or who last." The
    Office of the Context: "Each field of the context is set exactly once, in
    exactly one place... No step revisits another's work"; the Article on
    context: "Two reads see one truth." Commandment VI: "When state mutates
    silently, trust dies." ctx.identity is captured from the creation-time
    token (shared.ts:125 `const identity = principalFromToken(token);`), yet
    every verb on a recover-enabled context ignores that captured token and
    re-reads the mutable module global (line 191); recovery then rewrites the
    global mid-request (`setSessionToken(flatToken);` line 268, and line 321
    after org exchange) and consults the cross-tab-shared ACTIVE_ORG_KEY
    localStorage preference (line 318) instead of the vessel's own claim —
    so the vessel's identity field and its wire credential can diverge within
    one request lifetime, and the org actually scoped is decided by global
    state another tab may have written."

        async function withAuthRecovery<T>(
            adapter: DbAdapter,
            make: (tok: string) => Promise<T>,
        ): Promise<T> {
            try {
                return await make(getSessionToken());

    more sites: web-app/app/adapters/shared.ts:268,
    web-app/app/adapters/shared.ts:318, web-app/app/adapters/shared.ts:321,
    web-app/app/adapters/shared.ts:125, web-app/app/core.ts:152,
    web-app/app/adapters/shared.ts:136, web-app/app/adapters/shared.ts:268,
    web-app/app/adapters/shared.ts:321

F-110 [VI] web-app/app/state.ts:77
    state.ts exports its raw setState mutator, granting every module silent
    write access to theme/sidebar state that bypasses persistence and DOM
    application
    symbol: setState · sites: 1 · security: - · CONFIRMED
    doctrine: "On the Sin of Global State: "If everything needs access, then
    NOTHING owns it — and state without ownership is sin without
    accountability." Commandment VI: "When state mutates silently, trust
    dies." The module's AppState is otherwise righteously private, but the
    export list (state.ts:214) ships the raw mutator to the whole app: any
    importer can mutate theme/sidebar without writePreference or
    applyResolvedTheme running, silently desyncing state from localStorage and
    the DOM. Repo-wide search this run found ZERO external callers (app,
    pages, tests) — the door is open and unused. Cast the export out; the
    righteous entry points (persistThemePreference, collapseSidebar,
    initState) already carry every legitimate write."

        function setState(
            partial: Partial<AppState>,
        ): void {
            state = { ...state, ...partial };
        }

    more sites: web-app/app/state.ts:214

### On the Sin of Null

F-111 [V] api/api.ts:1344
    Empty-string sentinels mask absent related rows in invitation wire views
    (default-values kin)
    symbol: invitationsForInvitee · sites: 4 · security: - · CONFIRMED
    contributors: We measure before we optimize; On the Sin of Null
    doctrine: "The unmeasured optimization is the root of the family of
    impatience — premature optimization, shared mutable state, global state,
    default values, and unmeasured caches... Where you find one, look for its
    kin. (Articles: 'Default values that mask the absence of real data are
    comfortable lies.') A missing organizations row for an invitation's
    organization_id is an impossible state, masked to '' instead of surfacing;
    invitee_email at api/api.ts:1389 likewise. The invited_by_name case at
    1346-1348 is the documented erased-PII contract ('the presenter then omits
    the line') yet still encodes absence as a '' sentinel on the wire."

        organization_name:
            orgName.get(inv.organization_id) ?? '',
        identity_id: inv.identity_id,
        invited_by_name: grant
            ? personName.get(grant.member_id) ?? ''
            : '',

    more sites: api/api.ts:1347, api/api.ts:1389, api/api.ts:1344,
    web-app/app/presenters/invitation-list.ts:45

F-112 [V] api/mock-data.ts:266
    Null-slot parallel array in mock work-order generator, re-asserted
    non-null by index alignment
    symbol: generateFlowWorkload · sites: 3 · security: - · CONFIRMED
    doctrine: "The sin is reaching for null whenever the domain offers richer
    alternatives. — null marks creator/archive steps, then a second loop
    re-derives the same condition and asserts `stepMember[j]!` (line 297), a
    cross-loop invariant the reader must reconstruct; a per-step tagged union
    would carry the truth in the type. Traced to Commandment V: 'Dense,
    high-information communication.'"

                const stepMember: (Id | null)[] = [];
                for (const nid of path.nodeIds) {
                    if (
                        nid === creatorId
                        || nid === archiveId
                    ) {
                        stepMember.push(null);

    more sites: api/mock-data.ts:272, api/mock-data.ts:297

F-113 [V] api/types.ts:546
    Stored empty-string sentinel: parent_jti = '' encodes root-of-chain in the
    identity_tokens column
    symbol: IdentityTokenEntity · sites: 6 · security: - · CONFIRMED
    doctrine: "a sentinel value standing in for absence (`-1`, `""`, `0`) ...
    Where the doctrine prescribes a related table, the absence of the row IS
    the absence of the event. No null. No sentinel. No ambiguity. — traced
    to Commandment V: 'Dense, high-information communication. No
    equivocation.' The column sometimes holds a jti, sometimes a meaningless
    empty — two meanings in one field, reverse-engineered at the presenter
    (parentJti === '' ? DISPLAY_ABSENT : ...)."

        // `chain_id` groups a refresh-rotation lineage: an issue creates
        // a root (parent_jti = '' — a self-disclosing empty, never
        // null); each rotation appends 'rotated' for the old jti and
        ...
            parent_jti: string;

    more sites: api/identity-tokens.ts:136, api/identity-tokens.ts:151,
    api/authentication.ts:188, web-app/app/presenters/identity-tokens.ts:34,
    SCHEMA.md:261

F-114 [V] api/types.ts:743
    department = '' read as absence via hasDepartment() existence predicate
    driving business logic
    symbol: HumanMember.hasDepartment · sites: 2 · security: - · CONFIRMED
    doctrine: "a `nullable` column sometimes set, often null, with conditional
    logic everywhere asking 'if it exists' — here the NOT NULL '' variant of
    the same sin; the Articles prescribe 'Nullable data is ideally represented
    as the lack of a row in a related table.' featuredHumanMembers
    (adapters/members.ts:167) filters on the predicate, proving '' is read as
    absence, not as empty text. Traced to Commandment V: 'No equivocation.'"

            hasDepartment(): boolean {
                return this.#department !== '';
            }

    more sites: web-app/app/adapters/members.ts:167

F-115 [V] web-app/app/adapters/flow-publish.ts:65
    Sometimes-set optional problemCount with downstream ?? 0 coercion that can
    render '0 nodes need attention' on a disabled row
    symbol: FlowPickerEntry · sites: 3 · security: - · CONFIRMED
    doctrine: "a `nullable` column sometimes set, often null, with conditional
    logic everywhere asking 'if it exists' — the optional is set only on
    notReady entries (flow-publish.ts:98), encoding what list membership
    already encodes; the consumer (workbox/index.ts:384 `const count =
    f.problemCount ?? 0;`) coerces the gap, masking a broken invariant as a
    zero count. Traced to Commandment V: 'No equivocation.'"

        export interface FlowPickerEntry {
            id: Id;
            name: string;
            problemCount?: number;
        }

    more sites: web-app/app/adapters/flow-publish.ts:98,
    web-app/workbox/index.ts:384

F-116 [V] web-app/app/adapters/state-events.ts:217
    Creation-transition sentinel from_node_id = '' with existence checks in
    two consumer modules
    symbol: projectTransitions · sites: 4 · security: - · CONFIRMED
    doctrine: "a sentinel value standing in for absence (`-1`, `""`, `0`) ...
    No null. No sentinel. No ambiguity. — the derived TransitionEvent
    encodes 'no prior node' as '', and each consumer must know the convention:
    flow-stats-aggregate.ts:321 `if (t.from_node_id === '') continue;` and
    workbox-detail.ts:584 `t.from_node_id === '' ? 'Created' : ...`. A tagged
    union ({kind:'creation'} | {kind:'move', fromNodeId}) is the richer
    alternative the codebase uses elsewhere. Traced to Commandment V: 'No
    equivocation.'"

            let prior = '';
            for (const ev of transitions) {
                out.push({
                    id: ev.id,
                    work_order_id: workOrderId,
                    from_node_id: prior,

    more sites: web-app/app/adapters/state-events.ts:100,
    web-app/app/flow-stats-aggregate.ts:321,
    web-app/app/presenters/workbox-detail.ts:584

F-117 [V] web-app/app/format.ts:30
    Format helpers pretend absence: invalid timestamps render as the same dash
    as genuine absence
    symbol: formatDate · sites: 4 · security: - · CONFIRMED
    doctrine: "When a value is truly absent, my friends, model that absence at
    the call site — not in the helper. Helpers shall not pretend absence.
    — timestamps are gate-validated RFC-3339 (SCHEMA.md timestamp
    convention), so an unparseable value inside the walls is corruption, yet
    three formatters render it identically to legitimate absence ('—');
    toDateInputValue:71 `if (!iso) return '';` likewise absorbs a falsy
    timestamp. Traced to Commandment V: 'No equivocation. No dissembling.'"

        function formatDate(iso: string): string {
            const parsedDate = new Date(iso);
            if (isNaN(parsedDate.getTime())) return DISPLAY_ABSENT;

    more sites: web-app/app/format.ts:45, web-app/app/format.ts:58,
    web-app/app/format.ts:71

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-117a [V] web-app/app/format.ts:30
        Date formatters render corrupt timestamps as the legitimate-absence
        dash

            const parsedDate = new Date(iso);
                if (isNaN(parsedDate.getTime())) return DISPLAY_ABSENT;

    F-117b [VIII] web-app/app/format.ts:71
        toDateInputValue dead falsy guard: no-op internal defense on a string
        parameter

            if (!iso) return '';
                return iso.slice(0, 10);

F-118 [V] web-app/app/presenters/flow-stats.ts:50
    Double-encoded absence: pinnedNodeId?: string | null — undefined AND
    null both mean 'no pin', normalized with ?? null at consumers
    symbol: FlowStatsUi · sites: 4 · security: - · CONFIRMED
    doctrine: "No null. No sentinel. No ambiguity. — two representations of
    one absence in a single field; the page initializes with null
    (flows/stats.ts:132-133) while the type admits undefined, forcing
    `ui.pinnedNodeId ?? ui.hoveredNodeId ?? null` normalization chains
    (flow-stats.ts:267-268, flows/stats.ts:176). Traced to Commandment V: 'No
    equivocation.'"

        export interface FlowStatsUi {
            selectedPathIndex: number;
            pinnedNodeId?: string | null;
            hoveredNodeId?: string | null;
        }

    more sites: web-app/app/presenters/flow-stats.ts:267,
    web-app/flows/stats.ts:176, web-app/flows/stats.ts:253

### On the Sin of Default Values

F-119 [V] api/api.ts:1344
    Invitation payloads mask absent joins (erased PII, unresolvable org name)
    with empty-string sentinels
    symbol: invitationsForInvitee · sites: 3 · security: - · CONFIRMED
    contributors: We validate at every edge; On the Sin of Default Values
    doctrine: "Default values that mask the absence of real data are
    comfortable lies."

                    organization_name:
                        orgName.get(inv.organization_id) ?? '',
                    identity_id: inv.identity_id,
                    invited_by_name: grant
                        ? personName.get(grant.member_id) ?? ''
                        : '',

    more sites: api/api.ts:1347, api/api.ts:1389

F-120 [V] api/backend-indexeddb.ts:159
    Function/constructor parameter defaults hide the missing argument
    (pattern, 12 sites)
    symbol: IndexedDbBackend.constructor (post) · sites: 12 · security […]
    doctrine: ""function parameter defaults that hide the missing argument ...
    Each one conceals a missing requirement behind a fiction of completeness.
    If a value has a sensible default, define it as a named constant and pass
    it explicitly." The sharpest site defaults the cross-tab broadcast poster
    to a silent no-op `() => {}` — a caller that forgets the poster gets a
    backend whose commits notify no other tab, with no error and no trace.
    Sister sites default behavior booleans (`hasSchema = true`, layout.ts:90),
    toast severity (`'info'`, toast.ts:41; `'error'`, flow-operations.ts:124),
    the DOM root (`document`, dom.ts:150), recovery policy (`{ recover?:
    boolean } = {}`, shared.ts:122), and presenter inputs (`new Map()`).
    Traced to Commandment V: "Dense, high-information communication. No
    equivocation. No dissembling.""

            constructor(
                post: (tables: readonly string[]) => void =
                    () => {},
            ) {
                this.#db = null;
                this.#post = post;

    more sites: web-app/app/layout.ts:90, web-app/app/toast.ts:41,
    web-app/app/dom.ts:150, web-app/app/zip.ts:356,
    web-app/app/flow-operations.ts:124,
    web-app/app/adapters/record-transitions.ts:53,
    web-app/app/adapters/init.ts:31, web-app/app/adapters/shared.ts:122,
    web-app/app/presenters/project.ts:380,
    web-app/app/presenters/project-action-bar.ts:29, api/access-token.ts:176

F-121 [V] web-app/records/create.ts:42
    Missing form element coerced to empty input (`?.value ?? ''`)
    symbol: handleSubmit · sites: 2 · security: - · CONFIRMED
    doctrine: ""silent coercion: `?? ''` ... conceals a missing requirement
    behind a fiction of completeness." If `#record-create-name` or
    `#record-create-description` is absent from the composed page — an
    impossible state, i.e. a bug — the coercion renders it indistinguishable
    from the user submitting an empty field: the page toasts 'Record name is
    required' instead of crashing, and a missing description element silently
    submits ''. The codebase's own standard is the opposite
    (adapters/shared.ts:330: "we crash rather than invent a default"). Traced
    to Commandment V: "No equivocation. No dissembling.""

            const name = (nameEl?.value ?? '').trim();
            const description =
                (descEl?.value ?? '').trim();
            if (name === '') {
                showToast(
                    'Record name is required',

    more sites: web-app/records/create.ts:44

F-122 [V] web-app/workbox/index.ts:384
    `?? 0` fabricates a problem count the producer guarantees present
    symbol: buildNotReadyRow · sites: 1 · security: - · CONFIRMED
    doctrine: ""silent coercion: ... `value || 0` ... conceals a missing
    requirement behind a fiction of completeness." Every notReady entry is
    constructed WITH problemCount (web-app/app/adapters/flow-publish.ts:98,
    `problemCount: readiness.problems.length`); only the optional field type
    (`problemCount?: number`, flow-publish.ts:65) makes absence expressible,
    and the consumer invents 0 — which, if it ever fired, would render the
    lie "0 nodes need attention" on a flow listed precisely because it has
    problems. Traced to Commandment V: "Say what is true, not what sounds
    reasonable.""

        function buildNotReadyRow(f: FlowPickerEntry) {
            const count = f.problemCount ?? 0;
            const subtitle = count === 1
                ? '1 node needs attention'
                : `${count} nodes need attention`;

### On the Sin of Internal Defense

F-123 [I] web-app/app/adapters/dashboard.ts:101
    Downstream date-parse guard confesses an unconstrained gate:
    validateProjectEntity admits start_date/target_end_date as bare strings
    (api/validators.ts:1047-1052, pickString) although validateTimestampField
    exists (api/validators.ts:566); the dashboard adapter then NaN-checks
    downstream and silently drops the project from the aggregate
    symbol: getDashboardGauges · sites: 2 · security: - · CONFIRMED
    doctrine: "To check a NOT NULL column for null downstream is to confess
    — right there in your own code — that you do not believe in your own
    validation rites."

                const start = new Date(
                    p.start_date,
                ).getTime();
                if (isNaN(start)) continue;

    more sites: web-app/app/adapters/dashboard.ts:105

F-124 [V] web-app/app/flow-graph.ts:1009
    bezierAt defends against the very input its own comment declares trusted:
    'we only call this on paths we constructed' (flow-graph.ts:1000), then a
    length guard plus ?? BEZIER_ORIGIN fallback for the malformed path it just
    said cannot occur
    symbol: bezierAt · sites: 1 · security: - · CONFIRMED
    doctrine: ""just in case" fallbacks within your own walls"

        // syntax because we only call this on paths we constructed.
        …
            if (coords.length < 8) {
                return {
                    x: coords[0] ?? BEZIER_ORIGIN,
                    y: coords[1] ?? BEZIER_ORIGIN,

F-125 [V] web-app/app/presenters/identity-list.ts:74
    Unreachable display fallbacks on gate-validated fields: identity kind is
    validated as 'person'|'service' at the gate (api/validators.ts:676) and
    literal-constructed by the adapter (adapters/identities.ts:136-149), AI
    model is gate-checked by isProviderModelId (api/validators.ts:964) — yet
    presenters widen to Record<string,string> and fall back anyway
    symbol: buildRow · sites: 4 · security: - · CONFIRMED
    doctrine: "If the data has crossed the threshold of validation, it is
    clean. Trust it."

        const KIND_LABEL: Readonly<Record<string, string>> = {
            person: 'Person',
            service: 'Service',
        };
        …
        }">${KIND_LABEL[row.kind] ?? row.kind}</span>

    more sites: web-app/app/presenters/identity-detail.ts:111,
    web-app/app/presenters/ai-member-detail.ts:157,
    web-app/app/presenters/member.ts:201

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-125a [V] web-app/app/presenters/identity-list.ts:74
        Kind-label table widened to Record<string,string> with a dead ??
        fallback: IdentityRosterRow.kind and Identity.kindValue() are the
        closed gate-validated union 'person'|'service' (api/validators.ts:676;
        adapters/identities.ts:73-83) and KIND_LABEL covers both members, yet
        the widened key type manufactures an undefined the presenter then
        defends against

            const KIND_LABEL: Readonly<Record<string, string>> = {
                person: 'Person',
                service: 'Service',
            };
            …
            }">${KIND_LABEL[row.kind] ?? row.kind}</span>

    F-125b [V] web-app/app/presenters/member.ts:201
        DISPLAY_ABSENT fallbacks on catalog lookup of a gate-validated model
        id: every stored ai_members.model passes isProviderModelId at the gate
        (api/validators.ts:964) against the same code-resident PROVIDER_MODELS
        that findProviderModel reads (api/provider-models.ts:6-8 'single
        source of truth'), so the optional-chain/ternary absence branch is
        unreachable within the walls

            ${findProviderModel(
                this.#member.modelId(),
            )?.name ?? DISPLAY_ABSENT}

F-126 [V] web-app/flows/detail.ts:769
    Silent ?.addEventListener / if (el) guards on elements the module itself
    renders unconditionally — a missing element yields dead controls with no
    error (verified unconditional for the flow lock switch at
    presenters/flow-designer.ts:538, the idea-create back button at
    presenters/idea-create.ts:64, the invite button at members/index.html:13,
    and the flow-stats card at presenters/flow-stats.ts:104)
    symbol: bindSwitches · sites: 22 · security: - · CONFIRMED
    doctrine: "The defensive check clutters the code with doubt and teaches
    the next reader that the system's own contracts are not to be trusted."

            $(
                '#flow-lock-switch', container,
            )?.addEventListener(
                'click',

    more sites: web-app/ideas/create.ts:117, web-app/members/index.ts:236,
    web-app/app/presenters/flow-stats.ts:379,
    web-app/app/presenters/flow-designer.ts:596,
    web-app/app/command-palette.ts:753, web-app/snapshots/index.ts:172,
    web-app/snapshots/index.ts:194, web-app/snapshots/index.ts:460,
    web-app/snapshots/index.ts:505, web-app/snapshots/index.ts:514,
    web-app/snapshots/index.ts:530, web-app/ideas/convert.ts:92,
    web-app/ideas/convert.ts:131, web-app/ideas/convert.ts:428,
    web-app/ideas/convert.ts:436, web-app/ideas/convert.ts:531,
    web-app/ideas/convert.ts:537, web-app/ideas/create.ts:123,
    web-app/ideas/create.ts:130, web-app/flows/detail.ts:782,
    web-app/flows/detail.ts:795

F-127 [V] web-app/projects/index.ts:75
    Page init silently abandons when the page's own root element is missing,
    bypassing the existing visible-error path
    symbol: init · sites: 23 · security: - · CONFIRMED
    doctrine: "guard clauses deep inside trusted boundaries … Validate at
    the gates. Trust within the walls."

            const listEl = $(
                '#projects-list', document,
            );
            if (!listEl) return;

    more sites: web-app/dashboard/index.ts:55, web-app/records/index.ts:42,
    web-app/identities/index.ts:36, web-app/ideas/index.ts:40,
    web-app/members/index.ts:57, web-app/flows/index.ts:84,
    web-app/invitations/index.ts:28, web-app/identity-tokens/index.ts:36,
    web-app/identity-providers/index.ts:36, web-app/auth/index.ts:69,
    web-app/snapshots/index.ts:81, web-app/not-found/index.ts:7,
    web-app/landing/index.ts:577, web-app/design-system/index.ts:289,
    web-app/ideas/create.ts:37, web-app/ideas/convert.ts:64,
    web-app/records/detail.ts:70, web-app/members/detail.ts:113,
    web-app/projects/detail.ts:162, web-app/ideas/detail.ts:155,
    web-app/identities/detail.ts:92, web-app/flows/stats.ts:102

F-128 [V] web-app/projects/index.ts:193
    Dead module-state re-guards: every guarded caller binds or subscribes only
    after init assigns the vars, which are never reset — the nil checks can
    never fire
    symbol: rerenderProjects · sites: 6 · security: - · CONFIRMED
    doctrine: "redundant nil checks on validated fields … teaches the next
    reader that the system's own contracts are not to be trusted"

        function rerenderProjects(): void {
            if (!projectState || !projectListEl) return;

    more sites: web-app/projects/index.ts:130, web-app/projects/index.ts:148,
    web-app/projects/index.ts:159, web-app/projects/index.ts:209,
    web-app/projects/index.ts:224

### On the Sin of Entangled Nouns

F-129 [I] api/types.ts:1161
    organizations.used_seats and last_activity: stored aggregates duplicating
    ledger truth, kept in sync by nothing
    symbol: OrganizationEntity · sites: 5 · security: - · CONFIRMED
    contributors: We derive from the ledger; On the Sin of Entangled Nouns
    doctrine: "Where an authoritative event ledger exists, derived caches of
    its truth are duplication, not optimization. ... the cache is kept in sync
    by nothing. What the ledger remembers, the cache only re-remembers — two
    truths to reconcile, neither claiming primacy."

            next_billing: string;
            seats: number;
            used_seats: number;
            projects_limit: number;
            ideas_limit: number;
            last_activity: string;

    more sites: api/mock-data.ts:1260, web-app/app/adapters/admin.ts:59,
    web-app/app/adapters/admin.ts:93,
    web-app/app/presenters/organization.ts:249, api/types.ts:1164
    (last_activity, same fused-aggregate shape), api/api.ts:1558 (membership
    written; used_seats untouched in the same commit),
    web-app/app/adapters/admin.ts:59 (the fused column read as truth for the
    seats gauge)

F-130 [IX] api/types.ts:962
    Pattern: ownership relationships welded onto entity rows as
    organization_id / record_id FK columns instead of their own relations,
    with no moment of union
    symbol: IdeaEntity · sites: 8 · security: - · REFUTED
    contributors: Relationships between entities are sacred covenants; On the
    Sin of Entangled Nouns
    doctrine: "Codd revealed that relationships occupy their own relations.
    [Abomination of Entangled Nouns: 'A foreign key is never just a
    reference… Declare relationships in join tables.' Pricing per the same
    abomination: 'performance is the TWELFTH commandment'.]"

        export interface IdeaEntity {
            id: Id;
            organization_id: Id;
            title: string;

    more sites: api/types.ts:1009, api/types.ts:1058, api/types.ts:1089,
    api/types.ts:1104, api/types.ts:1112, api/types.ts:1113, api/types.ts:976,
    api/types.ts:976 (Objective.organization_id), api/types.ts:1009
    (ProjectEntity.organization_id), api/types.ts:1058
    (FlowEntity.organization_id), api/types.ts:1089
    (WorkOrderEntity.organization_id), api/types.ts:1104
    (RecordEntity.organization_id), api/types.ts:1112
    (RecordAttributeEntity.organization_id), api/types.ts:1113
    (RecordAttributeEntity.record_id)

F-131 [IX] api/types.ts:1027
    Member<->node and attribute<->node relationships live as arrays inside
    graph JSON documents, not their own relations, with no moment of union
    symbol: GraphNode · sites: 4 · security: - · CONFIRMED
    contributors: Relationships between entities are sacred covenants; On the
    Sin of Entangled Nouns
    doctrine: "Codd revealed that relationships occupy their own relations. We
    add the moment of union — for relationships have time."

            isCreate: boolean;
            isArchive: boolean;
            memberIds: MemberId[];
            attributes: NodeAttribute[];
            taskInstructions: string;
        }

    more sites: api/types.ts:46, api/types.ts:1064, api/types.ts:1091,
    api/types.ts:47 (NodeAttribute.attribute_id → record_attributes,
    in-document), api/types.ts:1083 (the same document copied into
    work_orders.flow_graph), web-app/app/flow-graph.ts:443 (app-layer scan
    policing the in-document relationship)

F-132 [IX] api/types.ts:1080
    One flow↔work-order union declared twice: join table AND a flowId inside
    the JSON snapshot, with readers split between them
    symbol: WorkOrderFlowGraph.flowId · sites: 2 · security: - · CONFIRMED
    doctrine: ""A foreign key is never just a reference. It is a
    denormalization that fuses what should be independent."
    postWorkOrderCreation writes the union twice in one commit — flowId into
    the flow_graph document (work-orders-mutations.ts:184) and a
    flow_work_orders join row (work-orders-mutations.ts:215) — and consumers
    split: record-transitions.ts:71-72 resolves the flow from the document FK
    (`getRecordForFlow(ctx, fg.flowId)`) while flow-stats.ts:48 resolves it
    from the join table. Two declarations of one covenant, neither claiming
    primacy. Commandment IX: "once the better way is found, it must rise to
    replace every similar site — never rest beside them. One codebase, one
    voice." The join table flow_work_orders already holds the identities of
    the joined and the moment of union; the in-document FK rests beside it."

        export interface WorkOrderFlowGraph {
            flowId: Id;
            name: string;
            lockTimeout: number;
            nodes: GraphNode[];
            edges: GraphEdge[];

    more sites: web-app/app/adapters/work-orders-mutations.ts:184 (flowId
    written into the snapshot),
    web-app/app/adapters/work-orders-mutations.ts:215 (flow_id written into
    flow_work_orders), web-app/app/adapters/record-transitions.ts:72 (reader
    consuming the document FK, not the join)

### On the Sin of Inheritance

F-133 [IX] api/db-memory.ts:8
    Backend tiers derive from concrete BackedDbAdapter as zero-override
    constructor presets where a composing factory function would carry no
    lineage
    symbol: MemoryDbAdapter · sites: 3 · security: - · REFUTED
    doctrine: "'Inheritance binds by lineage; composition binds by capability.
    When an ancestor changes, every descendant trembles.' Three subclasses
    extend the concrete BackedDbAdapter solely to preset its constructor
    arguments; a factory returning the composed base (the actual variation —
    backend, latency shim, open hook — is already constructor-injected)
    would deliver the same names with no lineage. Letter-of-the-section
    finding only: zero overrides, zero added members, substitutability holds
    trivially, single level, and each file's header honestly declares 'A
    construction preset over BackedDbAdapter.' The spirit of composition is
    largely honored; the extends keyword is the residue. Least-severe
    defensible trace via IX: 'Through this discipline we achieve polymorphism
    — and through it, generality … made manifest.'"

        export class MemoryDbAdapter extends BackedDbAdapter {
            constructor() {
                super(
                    new MemoryStorageBackend(),
                    async () => {},
                    async () => {},

    more sites: api/db-localstorage.ts:13, api/db-indexeddb.ts:14

F-134 [IX] tests/store-entity-validation.test.ts:28
    Test helper subclasses a concrete backend and overrides a method to
    observe it, beside a codebase that decorates
    symbol: CountingBackend · sites: 1 · security: - · CONFIRMED
    contributors: Composition over inheritance; On the Sin of Inheritance
    doctrine: ""Inheritance binds by lineage; composition binds by capability.
    When an ancestor changes, every descendant trembles — when a composed
    capability changes, only its callers notice, and they were prepared" (On
    the Sin of Inheritance); "The faithful compose." This is the repo's only
    behavioral override (the sole super.member access in the codebase). The
    codebase's own established way to layer behavior over a store or backend
    is the decorator — OrgScopedEntityStore, ParentScopedEntityStore,
    ParentScopedStateStore all implement-and-delegate. A counting decorator
    implementing StorageBackend and delegating to a composed
    MemoryStorageBackend would bind by capability and survive ancestor change;
    the subclass instead rides MemoryStorageBackend's concrete transaction
    signature by lineage. Commandment IX trace: "once the better way is found,
    it must rise to replace every similar site — never rest beside them. One
    codebase, one voice.""

        class CountingBackend extends MemoryStorageBackend {
            transactions = 0;
            async transaction<R>(
        …
                this.transactions++;
                return super.transaction(tables, mode, fn);

### On the Sin of Coupling

F-135 [I] build:61
    Build toolchain (tsc, tsx, esbuild) resolved by npx with no declared
    dependency and no lockfile — ambient/latest version executes at every
    build
    symbol: (file scope) · sites: 9 · security: NEW · CONFIRMED
    contributors: We choose platform primitives; On the Sin of Coupling
    doctrine: "Every dependency is a future migration."

        npx esbuild web-app/app/core.ts \
          --bundle \
          --minify \
          --keep-names \
          --target=es2024 \
          --format=iife \

    more sites: build:57, build:75, build:85, build:105, build:113,
    validate:4, generate-schema-svg:7, serve:17

F-136 [IX] web-app/app/adapters/work-orders-mutations.ts:77
    WebCrypto primitive named inline in a business mutation adapter
    symbol: generateDisplayId · sites: 1 · security: - · CONFIRMED
    doctrine: "Every external dependency — library, service, framework —
    gets an adapter. No exceptions."

            const hash = await crypto.subtle
                .digest('SHA-256', data);

F-137 [IX] web-app/app/auth-redirect.ts:74
    Raw URLSearchParams parse duplicated beside the url-params.ts shim
    symbol: parseQuery · sites: 1 · security: - · CONFIRMED
    doctrine: "Every external dependency — library, service, framework —
    gets an adapter. No exceptions."

        function parseQuery(query: string): Record<string, string> {
            const params: Record<string, string> = {};
            new URLSearchParams(query).forEach((value, key) => {
                params[key] = value;
            });
            return params;

F-138 [IX] web-app/app/theme-init.ts:19
    Pre-paint module bypasses the owned preferences adapter it sits beside
    symbol: applyTheme · sites: 3 · security: - · CONFIRMED
    contributors: We acknowledge the cost of the discipline; On the Sin of
    Coupling
    doctrine: "The adapter costs. ... The faithful pay willingly — having
    counted, and found the cost of absence the greater. — and Commandment
    IX: 'And once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice.' The
    codebase paid the adapter cost (adapters/preferences.ts getPreference
    wraps exactly this call; state.ts, logger.ts, core.ts, org-switcher.ts,
    shared.ts all pay the toll), and theme-init.ts even imports
    adapters/media-query.ts in the same file — yet reads localStorage raw at
    two sites, leaving two voices for one primitive."

        const stored = localStorage.getItem(
            STORAGE_KEY_THEME,
        );

    more sites: web-app/app/theme-init.ts:35, web-app/app/root-redirect.ts:19

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-138a [IX] web-app/app/theme-init.ts:19
        Pre-paint module bypasses the owned preferences adapter it sits beside

            const stored = localStorage.getItem(
                STORAGE_KEY_THEME,
            );

    F-138b [IX] web-app/app/root-redirect.ts:19
        Root redirect enumerates localStorage raw — no owned seam exists for
        key enumeration

            const hasSchema = Object.keys(localStorage)
                .some(k => k.startsWith(STORAGE_KEY_PREFIX));

### On the Sin of Swallowed Failures

F-139 [I] api/authentication.ts:438
    Bare catch conflates faults with expected failures and destroys the
    evidence
    symbol: grantClientCredentials · sites: 5 · security: - · CONFIRMED
    doctrine: ""A system that swallows exceptions and continues is a system
    that lies about its health." and "An empty catch block is not error
    handling — it is destruction of evidence." (On the Sin of Swallowed
    Failures); the companion Article commands "Never catch an error you cannot
    meaningfully handle — to swallow an exception is excommunicable!" and
    "Distinguish expected failures from bugs". Here a MissingTableError or
    IndexedDB fault is reported as 401 'unknown client' with the error object
    discarded unlogged — the same file's line 82 (nameFor) shows the
    righteous narrow form: `if (e instanceof EntityNotFound) return
    identityId; throw e;`. The pattern repeats: members/detail.ts:126 catches
    ALL errors from getHumanMember (which throws RequestError with a status
    the invitations adapter proves is narrowable) and silently retries as AI
    — errHuman is destroyed whenever the AI path succeeds;
    password-hash.ts:123 returns false ('wrong password') for a corrupt stored
    PHC blob, unlogged; org-switcher.ts:88 discards the error unlogged behind
    a generic 'try again' toast; backend-indexeddb.ts:88 reclassifies ANY
    objectStore() throw (including InvalidStateError, a use-after-commit bug)
    as MissingTableError."

            let client: ClientEntity;
            try {
                client = await adapter.clients.getById(clientId);
            } catch {
                return failure(401, 'unknown client');
            }

    more sites: web-app/members/detail.ts:126, api/password-hash.ts:123,
    web-app/app/org-switcher.ts:88, api/backend-indexeddb.ts:88

F-140 [I] web-app/identities/detail.ts:46
    Log-and-continue masks unexpected failures as benign UI states
    symbol: loadIdentity · sites: 2 · security: - · CONFIRMED
    doctrine: ""A `log-and-continue` is a lie whispered to the next request,
    which inherits corrupted state and fails in ways far harder to diagnose."
    (On the Sin of Swallowed Failures); the Article commands "Degrade visibly
    rather than corrupt silently." The null return makes the init caller
    (identities/detail.ts:101-103) navigateTo('identities') — a database
    fault is masked as a silent bounce back to the list with no error UI,
    defeating the withLoadingState error-state-with-retry machinery it is
    wrapped in; the second consumer (line 175) silently returns, leaving stale
    page state. Same shape at organization/index.ts:355: renderSentInvitations
    warn-logs and hides the admin section on ANY failure, though its own
    comment at line 344 concedes "a denial here is unexpected" — and the
    scripture rules "an impossible state is a bug… and must crash"; the
    hidden box is indistinguishable from having no pending invitations."

            } catch (err) {
                log.error(
                    'getIdentity failed',
                    'identities', err,
                );
                return null;

    more sites: web-app/organization/index.ts:355

### On the Sin of the Greedy Catch

F-141 [I] web-app/app/flow-operations.ts:702
    Mutation sequences wrapped in one try with a single uniform catch
    symbol: performUndo · sites: 7 · security: - · CONFIRMED
    doctrine: ""The greedy catch is a single `try` thrown around five
    operations, or seven, or ten — and a single `catch` that pretends to
    handle them all. When the catch fires, you cannot name which call failed.
    You cannot tell whether the others ran." performUndo's try (line 648)
    wraps FIVE awaited operations — getFlowVersions, putFlow,
    deleteFlowVersion, getFlowGraph, getFlowVersions — under this one catch.
    A fault after putFlow leaves the flow reverted but the version row
    unconsumed; the uniform 'Undo failed' implies nothing changed. Trace to
    Commandment I: "You may achieve every other virtue in this scripture and
    still have NOTHING if your code is not reliable.""

            } catch (err) {
                log.error(
                    'performUndo failed',
                    'flow-operations', err,
                );
                return failOp('Undo failed');

    more sites: web-app/app/flow-operations.ts:726 (performRedo:
    postFlowVersion + putFlow + getFlowGraph, catch at 753 -> 'Redo failed'),
    web-app/flows/detail.ts:1329 (handleBindRecord: getRecordForFlow +
    deleteExistingFlowRecord + putFlowRecord + getRecordAttributesByRecord,
    catch at 1364 -> 'Failed to update Record binding'; delete-then-put can
    half-apply), web-app/projects/detail.ts:656 (handleSave: putProject +
    conditional postProjectStateChange, catch at 663 -> 'project save
    failed'), web-app/members/detail.ts:462 (putHumanMember + conditional
    postHumanMemberStateChange, catch at 471 -> 'human member save failed'),
    web-app/members/detail.ts:519 (putAIMember + conditional
    postAIMemberStateChange, catch at 529 — the log says 'putAIMember
    failed' even when the state-change POST failed), web-app/app/core.ts:179
    (scopeBootIfCredentialed: setSessionToken/refreshAndInstall +
    scopeBootToActiveOrg, catch at 188 -> one 'opportunistic org scope failed'
    warn)

F-142 [II] api/api.ts:1956
    KNOWN re-confirm: Raw error.message in the 500 fallback
    symbol: handleRequest · sites: 1 · security: KNOWN · CONFIRMED
    contributors: II. Security; On the Sin of the Greedy Catch
    doctrine: ""A breach is not an accident — it is a covenant broken with
    everyone who trusted us with their data." (II. Security)"

                return Response.json(
                    { error: extractErrorMessage(error) },
                    { status: HTTP_INTERNAL_ERROR },
                );

F-143 [II] api/authentication.ts:451
    KNOWN re-confirm: Structural-only client_assertion
    symbol: grantClientCredentials · sites: 2 · security: KNOWN · CONFIRMED
    contributors: II. Security; We handle failure with grace; On the Sin of
    the Greedy Catch
    doctrine: ""A breach is not an accident — it is a covenant broken with
    everyone who trusted us with their data." (II. Security)"

            if (assertion.split('.').length !== 3) {
                return failure(401, 'malformed client_assertion');
            }

    more sites: api/backend-indexeddb.ts:88 (indexedDbTx store(): bare catch
    rebrands ANY objectStore() throw — including a finished-transaction
    InvalidStateError — as MissingTableError(table), which routes boot to
    snapshots recovery; sibling openTx at backend-indexeddb.ts:65 does it
    right via firstMissingStore + rethrow)

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-143a [II] api/authentication.ts:451
        KNOWN re-confirm: Structural-only client_assertion (seam flag present,
        unwidened)

                if (assertion.split('.').length !== 3) {
                    return failure(401, 'malformed client_assertion');
                }

    F-143b [I] api/authentication.ts:439
        Bare catch maps EVERY clients.getById fault to 401 'unknown client',
        swallowing MissingTableError that handleRequest deliberately rethrows
        for boot recovery

                let client: ClientEntity;
                try {
                    client = await adapter.clients.getById(clientId);
                } catch {
                    return failure(401, 'unknown client');
                }

    F-143c [I] api/backend-indexeddb.ts:88
        indexedDbTx store() bare catch rebrands ANY objectStore() throw —
        including a finished-transaction InvalidStateError — as
        MissingTableError, misrouting bugs into snapshots recovery

                const store = (table: string): IDBObjectStore => {
                    try {
                        return idbTransaction.objectStore(table);
                    } catch {
                        throw new MissingTableError(table);
                    }
                };

F-144 [V] web-app/organization/index.ts:224
    Parallel read-pairs under one catch whose log names only the first call
    symbol: init · sites: 4 · security: - · CONFIRMED
    doctrine: ""a `try` block wrapping more than a single function call" and
    "When the catch fires, you cannot name which call failed." The catch at
    line 230 logs 'getOrganization failed' even when getOrganizationStats is
    the call that failed — the log asserts an attribution the catch cannot
    know. Trace to Commandment V: "Say what is true, not what sounds
    reasonable.""

            try {
                const ctx = sessionContext();
                [org, stats] = await Promise.all([
                    getOrganization(ctx),
                    getOrganizationStats(ctx),
                ]);

    more sites: web-app/projects/detail.ts:204 (Promise.all of loadProjectView
    + getFlowsByProject; catch at 210 logs 'getProject failed'),
    web-app/ideas/convert.ts:102 (getActiveObjectives + per-objective
    getCurrentObjectiveDefinition; catch at 115 logs 'getActiveObjectives
    failed'), web-app/organization/index.ts:350 (getSentInvitations +
    presenter render + classList in one try; catch at 355 logs
    'getSentInvitations failed' for a render fault too)

F-145 [V] web-app/records/create.ts:65
    Catches that discard the fault entirely behind a uniform toast — no
    name, no log, no inspection
    symbol: handleSubmit · sites: 3 · security: - · CONFIRMED
    doctrine: ""a generic `catch (Exception e)` that handles faults it does
    not name" and "the top-level safety net that turns every failure into a
    uniform 'something went wrong'". `err` is bound but never read, never
    logged, never typed-checked — every fault class becomes the same toast
    and the evidence is gone. Contrast every other page handler in the repo,
    which logs the op name with the error. Trace to Commandment V: "Dense,
    high-information communication. No equivocation.""

            } catch (err) {
                showToast(
                    'Failed to create Record',
                    'error',
                );
                return;

    more sites: web-app/records/detail.ts:627 (handleSave: catch (err) unused,
    uniform 'Failed to save Record', no log), web-app/app/org-switcher.ts:88
    (setActiveOrgAsDefault: bare catch, uniform 'Could not set the default —
    please try again.', error never logged)

### On the Sin of Polling

F-146 [XII] web-app/app/toast.ts:16
    Toast removal waits on a duration-matched timer instead of the
    transitionend bell
    symbol: closeActiveToast · sites: 1 · security: - · CONFIRMED
    doctrine: ""'But I need to know when it's ready!' Then wait for it to tell
    you." — On the Sin of Polling; and the Article: "We believe in being
    informed of state changes... Subscribe. Listen. Be notified... The devout
    trust the bell." The code needs to know when the .toast--closing fade is
    finished; the platform announces exactly that via transitionend (no
    listener for it exists anywhere in the repo — verified this run), yet
    the code consults a clock whose value is hand-synced to CSS by comment:
    "// Matches the `.toast--closing` fade in components-toast.css //
    (var(--duration-slow))" (toast.ts:3-4, const TOAST_TRANSITION_MS = 300 at
    line 6). A single timer, not a repeating poll — the mildest form of the
    sin: predicting the event instead of trusting the bell, with a duplicated
    duration that drifts silently if --duration-slow changes. Commandment
    trace (XII): "Every wasted millisecond is a small death. In the UI it
    erodes fluidity" — a drifted timer clips the fade mid-animation or
    leaves the dead node lingering; least severe defensible numeral taken per
    the audit rule."

            toast.classList.add('toast--closing');
            setTimeout(
                () => toast.remove(),
                TOAST_TRANSITION_MS,
            );

### On the Sin of Scattered Context

F-147 [V] web-app/app/adapters/shared.ts:140
    The trace ID rides the vessel but is never read: ctx.requestId has zero
    production consumers, the logger's log.with(requestId) binding has zero
    callers, and the id never crosses the transport into handleRequest —
    every log line ships untraced
    symbol: createRequestContext · sites: 3 · security: - · CONFIRMED
    contributors: Context as the single vessel; On the Sin of Scattered
    Context; The Office of the Context
    doctrine: "Context is the only argument passed to methods —
    serializable, loggable, complete by covenant. — and the Office of the
    Context: 'Observability is not bolted on — it is carried in the vessel
    from the start.' Clarity: 'Dense, high-information communication.'"

                requestId: generateCryptoSafeBase62(),

    more sites: web-app/app/logger.ts:113, web-app/app/logger.ts:113,
    api/api.ts:1983, web-app/projects/detail.ts:211

F-148 [IX] api/api.ts:985
    The api tier has no vessel: identity, org, method, and path are
    dismembered into 2-5 loose positional fragments at every handoff
    symbol: authorizeRequest · sites: 11 · security: - · CONFIRMED
    doctrine: ""Context is the only argument passed to methods —
    serializable, loggable, complete by covenant." (Article: context as the
    single vessel) and Commandment IX: "And once the better way is found, it
    must rise to replace every similar site — never rest beside them. One
    codebase, one voice." The client tier already found the better way —
    RequestContext — yet the api mainline beside it threads (adapter,
    principal, org, method, pathname) through eleven helper signatures, each
    reassembling the fragments. The server-side request UUID the Office
    prescribes does not exist at all, so the two tiers speak two voices about
    the same request."

        async function authorizeRequest(
            adapter: DbAdapter,
            principal: Principal,
            org: Id,
            method: string,
            pathname: string,

    more sites: api/api.ts:1012, api/api.ts:1082, api/api.ts:1097,
    api/api.ts:1201, api/api.ts:1317, api/api.ts:1362, api/api.ts:1404,
    api/api.ts:1526, api/api.ts:1579, api/api.ts:1614

F-149 [X] web-app/organization/index.ts:518
    Second vessel minted mid-gesture: the baton is re-minted instead of
    passed, splitting one user action across two unlinked contexts
    symbol: handleSave · sites: 4 · security: - · CONFIRMED
    doctrine: ""Every mainline method receives the context filled with the
    gifts of its ancestors." (On the Sin of Scattered Context) and the
    Article: "Two reads see one truth. Not for speed — for ATOMICITY."
    handleSave mints ctx at line 500 for the save and freshCtx at 518 for the
    refetch — one gesture, two vessels, two requestIds, two identity
    snapshots. Likewise flows/detail.ts:337 (reportOpFailure re-mints inside a
    helper whose callers each minted their own inline) and identities/index.ts
    (postIdentityCreation mints at 175/214, then refresh() at 198/232 mints
    again at line 73). The dominant codebase pattern — one mint per gesture,
    ctx passed down (workbox, projects/detail) — sits right beside these."

            showToast('Organization saved', 'success');
            const freshCtx = sessionContext();
            const [freshOrg, freshStats] =
                await Promise.all([
                    getOrganization(freshCtx),

    more sites: web-app/flows/detail.ts:337, web-app/identities/index.ts:198,
    web-app/identities/index.ts:232

### On the Sin of Noun-First Thinking

F-150 [I] web-app/app/presenters/flow-designer.ts:193
    Flow save is fire-and-forget: #saveFlow has no error handling, all 11 call
    sites are void-called, and concurrent saves are unserialized — a failed
    or reordered putFlow silently diverges the rendered flow from the
    persisted flow
    symbol: FlowDesignerPresenter.#saveFlow · sites: 12 · security: -  […]
    contributors: I. Reliability; On the Sin of Noun-First Thinking
    doctrine: "We handle failure with grace. Degrade visibly rather than
    corrupt silently."

            async #saveFlow(
                versioned: boolean,
                snap: FlowSnapshot,
            ): Promise<void> {
                const ctx = sessionContext();
                if (versioned) {

    more sites: web-app/app/presenters/flow-designer.ts:238,
    web-app/app/presenters/flow-designer.ts:253,
    web-app/app/presenters/flow-designer.ts:280,
    web-app/app/presenters/flow-designer.ts:318,
    web-app/app/presenters/flow-designer.ts:356,
    web-app/app/presenters/flow-designer.ts:689,
    web-app/app/presenters/flow-designer.ts:745,
    web-app/app/presenters/flow-designer.ts:766,
    web-app/app/presenters/flow-designer.ts:788,
    web-app/app/presenters/flow-designer.ts:810,
    web-app/app/presenters/flow-designer.ts:835

F-151 [III] web-app/app/presenters/record-detail.ts:25
    Raw storage rows decide what participates in the records/workbox
    presentation processes
    symbol: RecordDetailView · sites: 8 · security: - · CONFIRMED
    doctrine: ""When you begin with the data model, you have already decided
    what participates before you know what the process requires — and every
    subsequent decision is a negotiation with that premature commitment." The
    negotiation is visible: workbox/detail.ts:237 parses workOrder.flow_graph
    to plan its reads, then hands the raw row to WorkboxDetailPresenter, which
    re-parses the SAME column at :147; records.ts:46 ships the raw row
    (entity: RecordEntity) beside its own RecordModel facet, and the hatch's
    only consumer (records/index.ts:118, r.entity.id) needs nothing the facet
    lacks. The idea/project/member/flow surfaces shape participants first
    (Idea, Project, Member, FlowSnapshot); the records/workbox surface lets
    the datastore noun pass through unshaped — Commandment III: "The -er
    acts; the -able submits — Interface Segregation made manifest in
    vocabulary, the first step of process-first thinking.""

        export interface RecordDetailView {
            readonly record: RecordEntity;
            readonly state: RecordState;
            readonly attributes:
                readonly RecordAttribute[];

    more sites: web-app/app/presenters/workbox-detail.ts:128,
    web-app/app/presenters/workbox-inbox.ts:174,
    web-app/app/adapters/records.ts:46, web-app/workbox/detail.ts:237,
    web-app/workbox/index.ts:175, web-app/records/index.ts:118,
    web-app/records/detail.ts:677

### On the Sin of Obscurity

F-152 [III] api/mock-data.ts:49
    Seed-date helper dt() reads backwards at future-date call sites
    symbol: dt · sites: 16 · security: - · CONFIRMED
    doctrine: "Section: 'Write so that the next reader — who may be you, six
    months hence — can rebuild the theory from the code alone.' Commandment
    III: 'If code does not read correctly, the names are — by definition —
    wrong.' The two-letter name says nothing, and at 16 call sites the
    parameter named daysAgo receives a NEGATIVE value to mean days in the
    FUTURE — `next_billing: dt(-300, 0, 0)` (line 1258) reads as '300 days
    ago' but means 300 days ahead. The reader must excavate the helper and
    mentally negate the name to rebuild the theory; the name lies at exactly
    the sites where the date matters (next_billing, target_end_date)."

        function dt(
            daysAgo: number,
            hour: number,
            minute: number,
        ): string {

    more sites: api/mock-data.ts:1258, api/mock-data.ts:1268,
    api/mock-data.ts:1294, api/mock-data.ts:1328, api/mock-data.ts:1344,
    api/mock-data.ts:1376, api/mock-data.ts:1394, api/mock-data.ts:1411,
    api/mock-data.ts:1428, api/mock-data.ts:1444, api/mock-data.ts:1461,
    api/mock-data.ts:1494, api/mock-data.ts:1510, api/mock-data.ts:1527,
    api/mock-data.ts:1544, api/mock-data.ts:6626

F-153 [V] web-app/design-system/index.ts:294
    Markup shredded by 506 empty-interpolation ${''} line-wrap splices
    symbol: init · sites: 506 · security: - · CONFIRMED
    doctrine: "Section: 'Code that cannot be read cannot be trusted. Code that
    cannot be trusted cannot be maintained.' Commandment V: 'Dense,
    high-information communication.' The ${''} splice (a zero-width
    interpolation swallowing the line break) appears 506 times in this one
    file, dismembering every attribute and text node into fragments — no
    class list or heading can be read without mentally deleting the splices.
    The 78-char Office is satisfiable by breaking at natural whitespace (class
    attributes collapse whitespace) or extracting constants, as every other
    template in the repo does; this file alone chose the unreadable means, and
    the 19 duplicate-attribute defects bred inside it (next finding) are the
    harm made visible."

                    <h1 class="${''
                        }text-3xl font-bold${''
                        } font-display">${''
                        }Fusion AI Design System</h1>

    more sites: web-app/design-system/index.ts:254,
    web-app/design-system/index.ts:261

F-154 [V] web-app/design-system/index.ts:321
    Duplicate class attributes on one tag — the second silently dead — at
    19 sites
    symbol: init · sites: 19 · security: - · CONFIRMED
    doctrine: "Commandment V: 'No equivocation. No dissembling.' Section:
    'Code that cannot be read cannot be trusted.' A tag bearing two class
    attributes asserts two truths; the HTML parser keeps the first and
    silently drops the second, so stats-grid, p-6, convert-grid, ds-do-card
    and kin never apply. The reader cannot rebuild which class the author
    meant to govern — and evidently the author could not either, since the
    pattern recurs 19 times in the same file whose markup the ${''} splices
    made unscannable."

                    <div class="ds-grid-4"
                        class="stats-grid">

    more sites: web-app/design-system/index.ts:353,
    web-app/design-system/index.ts:371, web-app/design-system/index.ts:402,
    web-app/design-system/index.ts:418, web-app/design-system/index.ts:450,
    web-app/design-system/index.ts:780, web-app/design-system/index.ts:899,
    web-app/design-system/index.ts:901, web-app/design-system/index.ts:918,
    web-app/design-system/index.ts:970, web-app/design-system/index.ts:1230,
    web-app/design-system/index.ts:1469, web-app/design-system/index.ts:1471,
    web-app/design-system/index.ts:1480, web-app/design-system/index.ts:1522,
    web-app/design-system/index.ts:1531, web-app/design-system/index.ts:1587,
    web-app/design-system/index.ts:1626

### On the Sin of Cleverness

F-155 [VIII] api/db-backed.ts:170
    Bulk Object.assign(this, …) binds ~33 readonly store properties declared
    with definite-assignment '!' — no store is ever visibly assigned, so
    grep and go-to-definition find only declarations; the compiler's
    initialization check is waived for concision (fenced only by DbStores
    typing on both sides)
    symbol: BackedDbAdapter.constructor · sites: 1 · security: - · REFUTED
    doctrine: "if you write the code as cleverly as possible, you are, by
    definition, not smart enough to debug it."

                Object.assign(
                    this,
                    this.#buildStores(backendRunner(backend)),
                );

F-156 [VIII] tests/presenter-misc.test.ts:83
    Nested ternary with inline empty-string sign-prefix concat in test
    fixture; production speaks plainly via formatSigned (scoring-format.ts:62)
    and named sign vars
    symbol: makeBipolarGauge · sites: 2 · security: - · CONFIRMED
    doctrine: "Elegance is not concision — elegance is clarity under
    pressure."

                    display: outerValue === undefined
                        ? '—'
                        : (outerValue >= 0 ? '+' : '')
                            + outerValue,

    more sites: tests/presenter-misc.test.ts:91

F-157 [VIII] web-app/app/generate-schema-svg.ts:234
    Get-or-init Map mutation chained inside a nullish-coalescing expression
    symbol: layout · sites: 1 · security: - · CONFIRMED
    doctrine: "Language-specific tricks and idioms that sacrifice readability
    for concision are the vanity of the undisciplined."

            const byRank = new Map<number, Table[]>();
            for (const t of tables) {
                const r = rank.get(t.name)!;
                (byRank.get(r) ?? byRank.set(r, []).get(r)!).push(t);
            }

F-158 [VIII] web-app/app/presenters/record-detail.ts:151
    javascript:void(0) href trick for inert anchors — void-operator-in-URI;
    the house pattern elsewhere is href="#" (project-detail.ts:727)
    symbol: RecordDetailPresenter.#buildBoundFlowsCard · sites: 2 · se […]
    doctrine: "Language-specific tricks and idioms that sacrifice readability
    for concision are the vanity of the undisciplined."

                                <a class="${
                                    'link record-flow-link'
                                }"
                                data-flow-id="${f.id}"
                                href="javascript:void(0)"
                                    >${f.name}</a>

    more sites: web-app/app/presenters/record-detail.ts:177

### On the Sin of Magical Values

F-159 [III] tests/validators.test.ts:298
    Tests restate DEFAULT_LOCK_TIMEOUT as the raw 28800 the scripture itself
    names
    symbol: lock_timeout fixture · sites: 4 · security: - · CONFIRMED
    doctrine: ""the number whose units it will not say (28800 seconds…)" —
    the scripture's verbatim example. The field name says neither seconds nor
    '8-hour default'; the app names it righteously (api/types.ts:1044
    `DEFAULT_LOCK_TIMEOUT = 8 * SECONDS_PER_HOUR`, importable by tests) and
    SCHEMA.md:407 documents 'Seconds (default 28800 = 8h)', yet four fixture
    sites re-encode the theory as the opaque numeral. Contrast: sibling
    fixtures whose field names speak units (avgSeconds: 414720) pass at face
    value; lock_timeout does not."

                lock_timeout: 28800,

    more sites: tests/validators.test.ts:353, tests/validators.test.ts:384,
    tests/adapters-dashboard.test.ts:107

F-160 [III] web-app/app/toast.ts:61
    Printable glyphs hidden behind \uXXXX codepoint escapes at 12 sites
    symbol: closeBtn.textContent · sites: 12 · security: - · CONFIRMED
    doctrine: ""the string that is a fragment of binary protocol … Where the
    literal cannot be read at face value, speak its name." '×' (×), '…'
    (…), '•'×8 (the masked-password bullets at auth/index.ts:251-254),
    '↑/↓/↵' (palette key glyphs), '→' (→), '—' (—) — each
    demands the reader decode a hex codepoint to know what renders; the
    literal glyph in the UTF-8 source, or a named constant, would speak."

            closeBtn.textContent = '×';

    more sites: web-app/auth/index.ts:251, web-app/app/flow-graph.ts:405,
    web-app/app/command-palette.ts:651, web-app/app/command-palette.ts:660,
    web-app/app/presenters/flow-designer-view.ts:152,
    web-app/app/presenters/flow-designer-view.ts:294,
    web-app/landing/index.ts:460

F-161 [III] web-app/auth/index.ts:380
    The lg breakpoint restated as bare 1024 in the only TS viewport check
    symbol: getViewportWidth() >= 1024 guard · sites: 2 · security: -  […]
    doctrine: ""the number whose units it will not say … Where the literal
    cannot be read at face value, speak its name." The breakpoint vocabulary
    (sm 640 / md 768 / lg 1024 / xl 1280) is contract prose in CLAUDE.md and
    DESIGN-SYSTEM.md and CSS media queries; the sole TypeScript width check
    restates lg by memory as an unnamed numeral, twice (also line 388) — the
    px unit and the breakpoint identity both unspoken."

            if (
                branding
                && getViewportWidth() >= 1024
            ) {

    more sites: web-app/auth/index.ts:388

F-162 [III] web-app/auth/index.ts:605
    Bare one-off numerals at point of use: 800 ms delay, 40 px padding,
    slice(0,16) ISO cut, SVG text offsets
    symbol: auth submit handler setTimeout · sites: 6 · security: - · […]
    doctrine: ""The sin lies in the OPAQUE — the number whose units it will
    not say … sizing constants like 16 or 28. Where the literal cannot be
    read at face value, speak its name." The 800 says neither ms nor why;
    sibling modules name the very same concepts (SAVE_DELAY_MS=800 at
    web-app/flows/detail.ts:78, AUTO_REDIRECT_MS at
    web-app/landing/index.ts:631, ZOOM_TO_FIT_PADDING_PX=70 at
    web-app/app/flow-interactions.ts:15), and web-app/flows/stats.ts:112
    passes a bare `40` padding while web-app/app/adapters/flow-export.ts:124
    cuts an ISO stamp with `.slice(0, 16) + 'Z'` — 16 is count-the-chars
    knowledge."

                    isLogin = true;
                    updateMode();
                }, 800);

    more sites: web-app/flows/stats.ts:112,
    web-app/app/adapters/flow-export.ts:124,
    web-app/app/generate-schema-svg.ts:280,
    web-app/app/generate-schema-svg.ts:281,
    web-app/app/generate-schema-svg.ts:289

F-163 [III] web-app/design-system/index.ts:195
    Design-system page re-hardcodes flow-graph's named edge-label geometry (7,
    12, 20, '6 3')
    symbol: buildFlowEdgeSvg · sites: 3 · security: - · CONFIRMED
    doctrine: ""the literal that is opaque must be given [a name]" — and
    these literals ALREADY have names the page declines to use: 7 is
    LABEL_CHAR_WIDTH (web-app/app/flow-graph.ts:110), 12 is LABEL_PADDING
    (:111), 20 is LABEL_HEIGHT (:113), '6 3' is CYCLE_DASH (:108). The
    showcase page that documents the design system re-states the flow
    renderer's geometry from memory as unnamed numerals — two copies for the
    next editor to desynchronize."

            const dash = isDashed
                ? ' stroke-dasharray="6 3"' : '';
            const mid = (x1 + x2) / 2;
            const lw = label.length * 7 + 12;
            const lh = 20;

    more sites: web-app/design-system/index.ts:193,
    web-app/design-system/index.ts:196

F-164 [III] web-app/landing/index.ts:148
    Icon pixel sizes passed as 160 bare numerals across 9 ad-hoc values —
    including the scripture's own 28
    symbol: icon* size argument · sites: 160 · security: - · CONFIRMED
    doctrine: ""The sin lies in the OPAQUE — … sizing constants like 16 or
    28." DESIGN-SYSTEM.md §9 names a context vocabulary (Inline 16 / Buttons
    16 / Cards 20 / Feature 24 / Empty states 48) but the code carries none of
    it: 160 call sites pass bare first-arg numerals with distribution 16×67,
    20×42, 14×19, 24×12, 12×8, 18×7, 28×3, 40×1, 10×1 — five of nine
    values (10/12/14/18/28) are outside the contract's table and the table's
    48 never appears in code. 'Everyone knows… until they don't' made
    measurable."

                        }">${iconLogo(28, '')}</div>

    more sites: web-app/app/nav-items.ts:10,
    web-app/app/presenters/ai-member-detail.ts:123, web-app/auth/index.ts:523,
    web-app/not-found/index.ts:21, web-app/ideas/convert.ts:495

### On the Sin of Deep Nesting

F-165 [VIII] web-app/app/theme-toggle.ts:122
    Handler bodies nest control flow six indent levels deep
    symbol: initThemeAndDropdowns · sites: 4 · security: - · CONFIRMED
    doctrine: ""Deep nesting is taxonomy masquerading as architecture. It
    buries the important beneath layers of the incidental." — the
    persist-and-warn act (theme-toggle), the index-creation loop
    (backend-indexeddb), the stepper branch (flows/stats), and the violations
    render (workbox/detail) each sit at the sixth indent level beneath wiring
    ceremony (forEach -> addEventListener -> callback -> guard -> try/catch).
    Mitigating: roughly two of the six levels at each site are 78-char
    argument-wrap continuations, not blocks; measured logical block depth
    peaks at ~5-6. Extraction of a named handler would surface the important
    act. Traced to VIII: "Simplicity is the fruit of GREAT effort" — the
    section names no commandment, so the least severe defensible numeral is
    taken."

                                let persisted: boolean;
                                try {
                                    persisted =
                                        persistThemePreference(
                                            theme,
                                        );

    more sites: api/backend-indexeddb.ts:185, web-app/flows/stats.ts:201,
    web-app/workbox/detail.ts:153

### On the Sin of Foreign Tongues

F-166 [III] api/types.ts:1125
    The storage tongue (snake_case row fields) is the working vocabulary of
    presenters and page modules — the self-described 'domain twin' keeps the
    datastore's names
    symbol: RecordAttribute · sites: 52 · security: - · CONFIRMED
    contributors: Messaging first, state second, datastore last; On the Sin of
    Foreign Tongues
    doctrine: "Violates: 'Choose the datastore to serve the state. The
    datastore is a servant — never a master' — here the datastore's column
    names master the presentation layer's vocabulary. The codebase's own voice
    mandates 'snake_case storage / camelCase domain', and the type's own
    comment declares the adapter the divorce point, yet the 'domain twin'
    retains attribute_type, sort_order, organization_id, record_id;
    NodeAttribute (api/types.ts:46-50) mixes two tongues inside one interface
    (attribute_id beside isRequired and mode); presenters render storage
    fields directly (record-detail.ts:124 emits `${a.attribute_type}` into
    SafeHtml; workbox-detail, workbox-inbox, flow-designer-view,
    project-score-history read flow_graph/display_id/to_node_id/member_id),
    and four page modules do the same. The Member union (api/types.ts:937)
    proves the divorce is achievable here. Commandment trace — III
    Uniformity: 'Call a thing a thing, in all things... If code does not read
    correctly, the names are — by definition — wrong.'"

        // The parsed domain twin of RecordAttributeEntity: the
        // adapter is the divorce point, so above the storage seam
        // `options` and `constraints` are real arrays, never the
        // JsonArrayField strings the datastore persists.
        export interface RecordAttribute {
            attribute_type: AttributeType;

    more sites: api/types.ts:47, web-app/app/presenters/record-detail.ts:124,
    web-app/app/presenters/workbox-detail.ts:56,
    web-app/app/presenters/workbox-inbox.ts:204,
    web-app/app/presenters/project-score-history.ts:110,
    web-app/app/presenters/flow-designer-view.ts:165,
    web-app/projects/detail.ts:914, web-app/flows/detail.ts:1384,
    web-app/workbox/index.ts:176, web-app/workbox/detail.ts:82,
    web-app/app/adapters/state-events.ts:104,
    web-app/app/presenters/workbox-detail.ts:195,
    web-app/records/detail.ts:677

F-167 [III] api/types.ts:1210
    Presentation vocabulary (CSS class names, badge-* design-system tokens)
    defined in the API/schema-of-record layer
    symbol: StatusDisplay · sites: 37 · security: - · CONFIRMED
    contributors: We speak our own idiom; On the Sin of Foreign Tongues
    doctrine: "Names from one layer do not belong in another. Vocabulary
    native to one idiom, imported into code that speaks a different idiom, is
    a violation independent of any data correctness."

        export interface StatusDisplay {
            label: string;
            className: string;
        }
        ...
                className: 'badge-success',

    more sites: api/types.ts:1215, api/types.ts:1233, api/types.ts:1267,
    api/types.ts:1281, api/types.ts:1299, api/types.ts:1333,
    api/types.ts:1221, api/types.ts:740, api/types.ts:866

F-168 [III] web-app/records/detail.ts:131
    Page modules speak raw transport verbs and storage table names, bypassing
    adapter vocabulary
    symbol: loadFlowSummaries · sites: 2 · security: - · CONFIRMED
    doctrine: ""a controller named `userController.getUserList` — HTTP
    plumbing standing in for domain language" — On the Sin of Foreign
    Tongues. The page layer speaks the transport verb GET and the storage
    table name 'flows' where a domain adapter call (getFlows) belongs;
    flows/detail.ts:1380-1384 goes further, naming the join table
    'flow-records' and an inline snake_case row shape ({ id; flow_id }) in
    page code. Also breaches the contract of record: ARCHITECTURE.md:451-454
    'all data access (reads and writes) goes through the adapter layer
    (adapters/)', and ARCHITECTURE.md:491 'RequestContext is the only I/O
    surface. Every data-access adapter takes ctx ... and uses
    ctx.GET/PUT/DELETE/POST/commit' — the verbs belong to adapters."

            const all = await ctx.GET<FlowEntity[]>(
                'flows',
            );

    more sites: web-app/flows/detail.ts:1380

F-169 [IX] web-app/app/theme-init.ts:19
    theme-init reads preference state raw beside the owned preferences reader,
    with divergent corrupt-value behavior
    symbol: applyTheme · sites: 3 · security: - · CONFIRMED
    contributors: Messaging first, state second, datastore last; Insulation
    through adapters; We speak our own idiom; On the Sin of Foreign Tongues
    doctrine: "Violates: 'Derive the state the messages require' / 'The
    datastore is a servant — never a master' — the same persisted
    theme/sidebar state has two independent readers: state.ts goes through the
    owned access layer (getPreference, adapters/preferences.ts) and throws on
    a corrupt value (state.ts:46-48), while theme-init.ts reads localStorage
    raw and silently treats the same corrupt value as system-default — two
    truths for one state, diverging on the corrupt case. The bypass is not
    forced by the bootstrap constraint: theme-init already imports the
    media-query adapter (line 14-16) and esbuild bundles imports into the
    pre-bundle IIFE, so preferences.ts was equally importable. Commandment
    trace — IX: 'once the better way is found, it must rise to replace every
    similar site — never rest beside them. One codebase, one voice.'"

            const stored = localStorage.getItem(
                STORAGE_KEY_THEME,
            );
            const dark = stored === 'dark'
                || (stored !== 'light'
                    && mediaQueryMatches(

    more sites: web-app/app/theme-init.ts:35, web-app/app/theme-init.ts:35,
    web-app/app/auth-redirect.ts:74, web-app/app/root-redirect.ts:19,
    web-app/app/root-redirect.ts:19

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-169a [IX] web-app/app/theme-init.ts:19
        theme-init reads theme/sidebar preference state raw beside the owned
        validated reader, diverging silently on corrupt values

                const stored = localStorage.getItem(
                    STORAGE_KEY_THEME,
                );
                const dark = stored === 'dark'
                    || (stored !== 'light'
                        && mediaQueryMatches(

    F-169b [III] web-app/app/root-redirect.ts:19
        root-redirect enumerates localStorage raw for the schema-presence
        check while importing the location adapter in the same file

                const hasSchema = Object.keys(localStorage)
                    .some(k => k.startsWith(STORAGE_KEY_PREFIX));

    F-169c [IX] web-app/app/auth-redirect.ts:74
        auth-redirect parseQuery re-rolls the
        URLSearchParams-forEach-into-Record body of the owned url-params
        adapter

            function parseQuery(query: string): Record<string, string> {
                const params: Record<string, string> = {};
                new URLSearchParams(query).forEach((value, key) => {
                    params[key] = value;
                });
                return params;
            }

### The Office of Format

F-170 [IX] build:5
    Two-space indent unit in repo scripts and hand-maintained JSON configs
    symbol: usage() · sites: 5 · security: - · CONFIRMED
    doctrine: "Office of Format: 'Prefer spaces — four of them — for
    indentation, except as demanded by language or toolchain.' Neither bash
    nor JSON demands two; the TS/CSS/HTML surface is uniformly four-space
    (zero off-grid lines measured this run), so these files break the indent
    voice. Commandment trace (IX): 'One codebase, one voice.'
    (.claude/settings.local.json excluded as toolchain-written.)"

        usage() {
          cat <<'USAGE'

    more sites: serve:5, validate:13, web-app/app/tsconfig.json:2,
    package.json:2

F-171 [IX] build:92
    build script carries 11 lines up to 114 chars — plain shell, not links,
    not compelled
    symbol: root-redirect.js bundle check · sites: 11 · security: - · […]
    doctrine: "Office of Format: 'Wrap lines at seventy-eight characters
    unless language or format compel otherwise. Links and URLs are exempt.'
    These are echo/test one-liners bash wraps trivially with \ or
    restructuring — no link, no compulsion (sibling scripts test, serve,
    validate, generate-schema-svg all hold 78). Commandment trace (IX): 'One
    codebase, one voice' — every other surface, including lint-exempt
    compose.ts (max 73), keeps the breath."

        [ -s "$BUILD_DIR/assets/root-redirect.js" ] || { echo "ERROR: ro […]

    more sites: build:39, build:69, build:70, build:82, build:83, build:93,
    build:107, build:108, build:114, build:115

F-172 [IX] web-app/app/styles/base.css:156
    Blank final line beyond the sanctioned final newline in 39 files
    symbol: end-of-file (after closing keyframes brace) · sites: 39 ·  […]
    doctrine: "Office of Format: 'No trailing whitespace, save the final
    newline. A newline shall follow the last line in every file.' Only the
    single final newline is saved; the second newline leaves an empty last
    line of trailing whitespace. Commandment trace (IX): 'One codebase, one
    voice' — 466 of 505 tracked files end with exactly one newline; these 39
    rest beside them."

          to { opacity: 0; }
        }
        <blank final line — file ends \n\n, verified via od -c>

    more sites: api/types.ts:1737, build:132, DESIGN-SYSTEM.md:662,
    api/validators.ts:1792, web-app/app/adapters/flow-versions.ts:148,
    web-app/app/adapters/projects.ts:276, web-app/app/adapters/shared.ts:340,
    web-app/app/flow-operations.ts:761,
    web-app/app/styles/command-palette.css:178,
    web-app/app/styles/components-avatar.css:55,
    web-app/app/styles/components-badges.css:257,
    web-app/app/styles/components-buttons.css:159,
    web-app/app/styles/components-cards.css:179,
    web-app/app/styles/components-controls.css:47,
    web-app/app/styles/components-dialog.css:142,
    web-app/app/styles/components-feedback.css:248,
    web-app/app/styles/components-inputs.css:77,
    web-app/app/styles/components-layout-helpers.css:119,
    web-app/app/styles/components-menus.css:80,
    web-app/app/styles/components-metrics.css:296,
    web-app/app/styles/components-page-placeholder.css:21,
    web-app/app/styles/components-tables.css:31,
    web-app/app/styles/components-tabs.css:60,
    web-app/app/styles/components-toast.css:61,
    web-app/app/styles/dark-mode.css:207, web-app/app/styles/fonts.css:68,
    web-app/app/styles/layout.css:380, web-app/app/styles/pages-auth.css:93,
    web-app/app/styles/pages-design-system.css:222,
    web-app/app/styles/pages-flow-detail.css:371,
    web-app/app/styles/pages-flow-stats.css:397,
    web-app/app/styles/pages-ideas.css:175,
    web-app/app/styles/pages-landing.css:557,
    web-app/app/styles/pages-members.css:47,
    web-app/app/styles/pages-projects.css:212,
    web-app/app/styles/pages-workbox.css:99,
    web-app/app/styles/responsive.css:88, web-app/app/styles/utilities.css:390

### The Office of the Commit

F-173 [V] git:40b09c42:1
    68 merge commits knot the history — 67 in the Dec-2025 Lovable era, 1 in
    the curated 2026 era
    symbol: merge commits on master · sites: 68 · security: - · CONFIRMED
    doctrine: ""The history shall be linear. Rebase, then fast forward. Never
    merge. A merge commit is a knot in the narrative — two timelines lashed
    together rather than reconciled." Commandment V: "Dense, high-information
    communication. No equivocation." The 67 Dec-2025 merges predate the
    curated era; 40b09c42 (2026-03-26) is the one knot tied after the
    congregation took the vow. Recent practice is clean: zero merges in the
    newest 1000 commits."

        40b09c42 2026-03-26 add workflow designer with SVG graph editor
        fd2553a0 2025-12-25 Enforce mobile Edge flow
        da525271 2025-12-25 Fix mobile responsiveness across pages
        (68 merges total; 0 in the newest 1000 commits)

    more sites: git:fd2553a0:1, git:da525271:1

F-174 [V] git:8ad2d3d2:1
    12 commits rename files while rewriting their content (similarity below
    90%)
    symbol: rename+modify commits · sites: 12 · security: - · CONFIRMED
    doctrine: ""Never move or rename and change content in the same commit."
    Commandment V: "Dense, high-information communication." At R052-R065 half
    the file changed during the move — git's rename detection barely holds
    and the diff is unreadable as either move or edit. 13 further commits show
    R090-R099 renames carrying only the import-path edits a TypeScript move
    forces if the commit is also to build ("Every commit on master must
    build") — those are the unavoidable minimum and were excluded from
    sites."

        COMMIT 8ad2d3d2 land Phases 3-7: rebuild UI for Workers
          R065 web-app/app/presenters/person-detail.ts -> human-worker-d […]
          R053 web-app/app/sidebar-person.ts -> sidebar-worker.ts
        COMMIT 82e0f0bb rectify Profile to Person Detail; banish lying fields
          R052 web-app/profile/index.ts -> web-app/people/detail.ts

    more sites: git:ac48de82:1, git:82e0f0bb:1

F-175 [VIII] git:5286808e:1
    46 subjects run past 72 characters (max 98) against the ~50-character
    canon — practice ended April 2026
    symbol: overlong commit subjects · sites: 46 · security: - · CONFIRMED
    doctrine: ""Each message: a single line, approximately fifty characters."
    Commandment VIII: "If I had more time, I would have written a shorter
    letter." The tail: 22 in 2026-02, 15 in 2026-03, 9 in 2026-04, zero since
    — repentance observed. Whole-history median is 45 chars, on canon; this
    finding is the 2% tail, and most overlong subjects double as multi-concern
    confessions (see the contiguity finding)."

        fix flow designer: zoom labels, fit-to-view, node collision, lay […]
        fix idea conversion: transfer budget to estimated_cost, fix elap […]

    more sites: git:0eb3fb9e:1, git:dbbc5493:1

F-176 [VIII] git:63bb18a0:1
    541 commits carry a prose body beyond the mandated trailer — ongoing
    through June 2026
    symbol: subject+body commit messages · sites: 541 · security: - · […]
    doctrine: ""Each message: a single line, approximately fifty characters
    … If your commit needs a subject and body, it is too large — use `git
    commit -p` like a devotee." Commandment VIII: "If I had more time, I would
    have written a shorter letter." Count excludes the CLAUDE.md-mandated
    Co-Authored-By trailer (codebase voice, not a finding) and 1 git-generated
    revert boilerplate. Distribution: 67 (2025-12), 89 (2026-02), 108
    (2026-03), 237 (2026-04), 35 (2026-05), 6 (2026-06) — the practice
    continues to the day of audit."

        Close the invitation accept/grant TOCTOU windows

        Re-check invitation state INSIDE the accept/decline/revoke
        transaction so a concurrent revoke cannot slip between the
        pending check and the membership write — a revoke must stop
        access. Move the grant member/pending check into its tx ...

    more sites: git:991930d4:1, git:fb3de6d2:1

F-177 [VIII] git:6d2a12fd:1
    49 multi-concern commits bundle unrelated changes against 'tiny,
    semantically contiguous bits'
    symbol: multi-concern commit · sites: 49 · security: - · CONFIRMED
    doctrine: ""Commit in tiny, semantically contiguous bits." Commandment
    VIII: "Simplicity is the fruit of GREAT effort." Five unrelated defects
    across four surfaces in one commit; 8ad2d3d2 "land Phases 3-7: rebuild UI
    for Workers" lands five phases (60 files, 3158+/4884-) at once. 47
    subjects enumerate 3+ concerns plus 2 multi-phase landings. Mechanical
    one-semantic-change sweeps (e.g. 27617bf9 add .ts extensions, 96 files)
    were NOT counted — uniform mechanical change is contiguous."

        fix 5 regression bugs: duplicate heading, wrong field, unformatt […]
        - Remove static page-header from review-queue.html ...
        - Add #expectedOutcome field to IdeaApprovalPresenter ...
        - Format submittedAt with formatDate() in approval presenter
        - Add getDashboardStats() call and #stats-container to dashboard

    more sites: git:8ad2d3d2:1, git:5286808e:1

### The Office of Time

F-178 [I] api/validators.ts:560
    Timestamp gate admits variable sub-second widths that mis-sort the
    append-only ledgers
    symbol: ISO_ZULU / validateTimestampField · sites: 1 · security: N […]
    doctrine: "Office of Time: "Persist all timestamps in RFC-3339, zulu
    timezone, with the fullest sub-second resolution the environment provides.
    This is not negotiable." The gate deliberately accepts fractionless and
    1-9-digit stamps ('width is the mint's job, not the gate's',
    tests/validators-fields.test.ts:56-62) — but the gate IS the persistence
    edge for externally-sourced rows: PUT states/:id (api/api.ts:843) and the
    bearer-exempt snapshot plane (api/snapshot-validator.ts reuses these
    validators) persist client-supplied `at` verbatim. The codebase's own
    witness names the hazard: tests/timestamps.test.ts:9 "(mixed 3-vs-6-digit
    strings sort wrong under lexical compare)", and the latest-wins reductions
    depend on lexical=chronologic (api/ledger-reduction.ts:4,
    api/access-token.ts:307, SCHEMA.md:503). A fractionless '…T00:00:00Z'
    sorts AFTER every fractional stamp in its own second ('Z' > '.'), so an
    admitted stamp can shadow the true latest event — including
    latestRevocationAt (api/access-token.ts:311), whose result gates token
    validity. Commandment I: "You may achieve every other virtue in this
    scripture and still have NOTHING if your code is not reliable.""

        const ISO_ZULU =
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;

F-179 [I] web-app/app/presenters/project-detail.ts:95
    Form helper coerces absent/invalid input: Number('') stores a fabricated
    $0k cost; invalid state silently falls back
    symbol: projectPatchFromDraft · sites: 37 · security: - · CONFIRMED
    contributors: We validate at every edge; The Office of Time
    doctrine: "Default values that mask the absence of real data are
    comfortable lies. … Helpers shall not pretend absence."

                    estimated_cost:
                        Number(draft.costBaseline)
                        * COST_DIVISOR,

    more sites: web-app/app/presenters/project-detail.ts:85,
    web-app/app/presenters/project-detail.ts:674, api/mock-data.ts:1293,
    web-app/ideas/convert.ts:597, api/validators.ts:1047, SCHEMA.md:381,
    web-app/app/presenters/project-detail.ts:93, web-app/ideas/convert.ts:598,
    api/mock-data.ts:1294

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-179a [I] web-app/app/presenters/project-detail.ts:95
        Form helper coerces absent/invalid input: Number('') stores a
        fabricated $0k cost; invalid state silently falls back

                        estimated_cost:
                            Number(draft.costBaseline)
                            * COST_DIVISOR,

    F-179b [III] api/validators.ts:1047
        Project date columns persisted in two temporal grammars, unvalidated
        at the gate

                    start_date: pickString(
                        body, 'start_date',
                    ),
                    target_end_date: pickString(
                        body, 'target_end_date',
                    ),

### The Office of the Context

F-180 [V] ARCHITECTURE.md:496
    Contract asserts a per-ctx read snapshot that no mechanism provides: every
    ctx verb builds a fresh Request through handleRequest with its own per-op
    transactions, so writes (same tab or cross-tab) can interleave between two
    awaited reads on one ctx; for sessionContext even the token is re-read
    live per verb
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    contributors: Context as the single vessel; The Office of the Context
    doctrine: "Two reads see one truth. Not for speed — for ATOMICITY. —
    claimed by the contract but unimplemented; per AUDIT.md, 'A doc that
    misstates fact X violates Clarity (V)'; Clarity: 'Say what is true, not
    what sounds reasonable.'"

          Multi-table reads share one ctx so every adapter call in a
          request sees the same snapshot.

    more sites: api/api.ts:1983, web-app/app/adapters/shared.ts:142

F-181 [V] CLAUDE.md:431
    The two contracts of record disagree on the vessel covenant: CLAUDE.md
    says RequestContext is 'the only argument to adapter methods' while
    ARCHITECTURE.md says 'takes ctx: RequestContext first' — measured
    reality: 132 of 192 ctx-taking adapter functions take parameters beside
    the vessel
    symbol: (file scope) · sites: 2 · security: - · CONFIRMED
    contributors: Context as the single vessel; The Office of the Context
    doctrine: "Context is the only argument passed to methods —
    serializable, loggable, complete by covenant. — one of the two contract
    statements misstates the implemented covenant; Clarity: 'Say what is true,
    not what sounds reasonable.'"

        - **Existing codebase patterns to match.** RequestContext
          as the only argument to adapter methods, SafeHtml from

    more sites: ARCHITECTURE.md:491, web-app/app/adapters/records.ts:198,
    ARCHITECTURE.md:491

F-182 [IX] api/api.ts:1612
    Server half of the pipeline has no vessel: principal, org, body, and
    params travel as positional fragments through 29 signatures
    symbol: revokeInvitation · sites: 29 · security: - · CONFIRMED
    doctrine: "Office of the Context: 'The vessel flows; the steps serve. The
    Article names the belief; this Office holds it in code.' On the api side
    the Office is not held in code: authentication's principal, the resolved
    org, the deserialized body, and route params are dismembered into
    positional arguments across 29 (adapter, ...fragments) signatures, and no
    server-side request id exists at all. Sin of Scattered Context: 'the baton
    is passed whole from runner to runner — not dismembered and reassembled
    at each handoff... Every mainline method receives the context filled with
    the gifts of its ancestors.' Commandment IX: 'And once the better way is
    found, it must rise to replace every similar site — never rest beside
    them. One codebase, one voice' — the vessel pattern, proven on the
    client half, rests beside the fragment pattern on the server half."

        async function revokeInvitation(
            adapter: DbAdapter,
            principal: Principal,
            id: Id,
        ): Promise<Response> {

    more sites: api/api.ts:985, api/api.ts:1401, api/api.ts:1360,
    api/api.ts:1317, api/api.ts:1115, api/api.ts:1524, api/api.ts:1577

F-183 [XI] api/authentication.ts:412
    Authentication revisits its own work: identical bearer verified and
    revocation-checked twice, facade re-entry verifies a third time and
    re-reads the body
    symbol: exchangeBearerForOrg · sites: 3 · security: - · REFUTED
    doctrine: "Office of the Context: 'Authentication resolves the identity...
    Deserialization resolves the body... No step revisits another's work.' The
    facade self-delegation passes the SAME bearer as subject_token and
    actor_token, so grantTokenExchange verifies it twice
    (authentication.ts:354-356) and revocation-checks the identical claims
    twice (363-376); facadeRequest then re-enters handleRequest (api.ts:1075),
    where the just-self-minted token is verified a THIRD time with a third
    revocation read, after the body was read as text (api.ts:1073) only to be
    re-parsed as JSON downstream. Separately, authenticateRequest holds
    verified claims (api.ts:968) yet rebuilds the principal by re-splitting
    and re-decoding the raw token (api.ts:982 principalFromToken). Commandment
    XI: 'Efficiency emerges from humility — from clarity, from simplicity,
    from code that can be reasoned about.'"

            return grantTokenExchange(adapter, {
                subject_token: bearer,
                actor_token: bearer,
                organization: org,
            });

    more sites: api/api.ts:982, api/api.ts:1073

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-183a [XI] api/api.ts:982
        authenticateRequest discards verified claims and rebuilds the
        principal by re-decoding the raw token

                const result = await verifyAccessToken(token, now);
                ...
                return principalFromToken(token);

### The Office of Verification

F-184 [V] tests/channels.test.ts:47
    Assertion-free tests whose names promise covenants the body never checks
    symbol: test('unsubscribe is idempotent') · sites: 3 · security: - […]
    doctrine: "A test that cannot fail is not a test — it is a comfort
    object."

        test('unsubscribe is idempotent', () => {
            const ch = createChannel<void>();
            const unsub = ch.subscribe(() => {});
            unsub();
            unsub();
            ch.send();

    more sites: tests/channels.test.ts:55,
    tests/adapters-snapshots.test.ts:300

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-184a [V] tests/channels.test.ts:47
        Idempotency test observes no second subscriber, so a silently
        corrupting double-unsubscribe survives it

            test('unsubscribe is idempotent', () => {
                const ch = createChannel<void>();
                const unsub = ch.subscribe(() => {});
                unsub();
                unsub();
                ch.send();
            });

### The Office of the Interface

F-185 [III] web-app/app/component-mobile-header.html:36
    Icon-only mobile-header search buttons have no accessible name
    symbol: (file scope) · sites: 2 · security: - · CONFIRMED
    doctrine: ""screen-reader affordance — gates of entry, not polish at the
    end." | Trace to III: "Call a thing a thing, in all things." The button
    has no name at all — no text, no aria-label, and its inline SVG carries
    no title; every other btn-icon in the same file and the 13 other btn-icon
    sites repo-wide are aria-labeled. No runtime labeling exists
    (mobile-drawer.ts:109-123 only attaches click)."

                                <button
                                    class="btn btn-ghost
                                        btn-icon"
                                    id="mobile-search-toggle"
                                ><svg

    more sites: web-app/app/component-mobile-header.html:210

F-186 [III] web-app/app/presenters/member.ts:56
    Clickable navigation cards and filter chips are plain divs/spans —
    unreachable and unnamed for keyboard and screen-reader users
    symbol: HumanMemberRowPresenter · sites: 9 · security: - · CONFIRMED
    doctrine: ""Accessibility is not a feature; it is the precondition of an
    interface. Color contrast, keyboard navigation, screen-reader affordance
    — gates of entry, not polish at the end." | Trace to III: "Call a thing
    a thing, in all things. … If code does not read correctly, the names are
    — by definition — wrong." A div performing as a link/button is the
    wrong name in the markup vocabulary; the page delegates click via
    closest('[data-member-id]') (members/index.ts:193) with no tabindex, role,
    or keydown anywhere (zero keydown in any card-list page module)."

                <div class="${
                    'card card-hover p-4 cursor-pointer'
                    + ' flex items-center gap-4'
                    + (this.#member.isArchived()
                        ? ' opacity-50' : '')
                }"

    more sites: web-app/app/presenters/member.ts:165,
    web-app/app/presenters/flow.ts:33,
    web-app/app/presenters/identity-list.ts:52,
    web-app/app/presenters/idea.ts:610,
    web-app/app/presenters/record-list.ts:116,
    web-app/app/presenters/workbox-inbox.ts:125,
    web-app/app/presenters/project.ts:99,
    web-app/app/presenters/state-badge.ts:16

F-187 [III] web-app/records/create.html:16
    Form labels not programmatically associated with their controls (no for=,
    control not wrapped)
    symbol: (file scope) · sites: 45 · security: - · CONFIRMED
    doctrine: ""screen-reader affordance — gates of entry, not polish at the
    end." | Trace to III: "Call a thing a thing, in all things." The label
    names nothing the accessibility tree can bind: 45 of 83 labels repo-wide
    have neither for= nor a wrapped control (mechanical scan; same files prove
    the righteous form exists, e.g. human-member-detail.ts:294 label
    for="member-department")."

                        <label class="label mb-1 block"
                        >Name</label>
                        <input
                            class="input"
                            id="record-create-name"

    more sites: web-app/records/create.html:25,
    web-app/app/presenters/project-objectives.ts:187,
    web-app/app/presenters/project-objectives.ts:212,
    web-app/app/presenters/idea-conversion.ts:434,
    web-app/app/presenters/idea-conversion.ts:465,
    web-app/app/presenters/idea-conversion.ts:514,
    web-app/app/presenters/idea-conversion.ts:561,
    web-app/app/presenters/idea-conversion.ts:689,
    web-app/app/presenters/workbox-detail.ts:461,
    web-app/app/presenters/flow-designer-view.ts:142,
    web-app/app/presenters/flow-designer-view.ts:147,
    web-app/app/presenters/flow-designer-view.ts:253,
    web-app/app/presenters/flow-designer-view.ts:261,
    web-app/app/presenters/flow-designer-view.ts:289,
    web-app/app/presenters/flow-designer-view.ts:344,
    web-app/app/presenters/flow-designer-view.ts:352,
    web-app/app/presenters/flow-designer-view.ts:357,
    web-app/app/presenters/record-detail.ts:275,
    web-app/app/presenters/flow-designer.ts:532,
    web-app/app/presenters/flow-designer.ts:542,
    web-app/app/presenters/flow-designer.ts:552,
    web-app/members/index.html:134, web-app/members/index.html:144,
    web-app/members/index.html:156, web-app/members/index.html:167,
    web-app/members/index.html:196, web-app/members/index.html:206,
    web-app/members/index.html:223, web-app/members/index.html:243,
    web-app/identities/index.html:84, web-app/identities/index.html:94,
    web-app/identities/index.html:105, web-app/identities/index.html:115,
    web-app/design-system/index.ts:261, web-app/design-system/index.ts:269,
    web-app/design-system/index.ts:277, web-app/design-system/index.ts:788,
    web-app/design-system/index.ts:798, web-app/design-system/index.ts:810,
    web-app/design-system/index.ts:831, web-app/design-system/index.ts:849,
    web-app/design-system/index.ts:862, web-app/design-system/index.ts:1240,
    web-app/design-system/index.ts:1266

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-187a [III] web-app/records/create.html:16
        Form labels adjacent to real controls lack for= (and do not wrap) —
        no programmatic label-control association

                            <label class="label mb-1 block"
                            >Name</label>
                            <input
                                class="input"
                                id="record-create-name"

    F-187b [III] web-app/app/presenters/flow-designer-view.ts:142
        <label> element misused as caption for static read-only text — no
        labelable control exists to associate

            <label class="text-xs text-muted"
                >Name</label>
            <div class="text-sm">${label}</div>

F-188 [V] DESIGN-SYSTEM.md:71
    DESIGN-SYSTEM.md documented contrast ratios match none of the shipped
    token values
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    doctrine: "Trace to V: "Say what is true, not what sounds reasonable."
    Computed from tokens.css/light-mode.css (WCAG relative luminance): primary
    text on white = 15.91 (claim 8.5); muted on white = 6.06 (claim 5.2);
    button text on primary = 5.35 (claim 6.8); status text on soft minimum =
    4.87 for success (claim 5.1+). Two claims overstate the shipped contrast;
    the success pair falls below the documented floor."

        ### Contrast Ratios
        - Primary text on white: **8.5:1** ✓
        - Muted text on white: **5.2:1** ✓
        - Button text on primary: **6.8:1** ✓
        - Status text on soft bg: **5.1:1+** ✓

F-189 [V] web-app/app/drag-reorder.ts:89
    List reordering is pointer-only — no keyboard alternative for a
    priority-setting operation
    symbol: initDragReorder · sites: 1 · security: - · CONFIRMED
    doctrine: ""keyboard navigation … gates of entry, not polish at the
    end." | Trace to V (least severe defensible): drag-reorder.ts wires
    pointerdown/drag only — zero keydown handlers exist in it or in the
    consuming list pages (ideas, records, workbox, projects), so
    position/priority can only be changed by mouse or touch."

            container.addEventListener(
                'pointerdown',
                (e) => {
                    pointerTarget =
                        e.target as Element;
                },

F-190 [V] web-app/app/styles/components-buttons.css:104
    .btn-success text contrast 3.20:1 fails WCAG AA in light mode despite the
    'WCAG AA Compliant' contract
    symbol: (file scope) · sites: 2 · security: - · CONFIRMED
    doctrine: ""Color contrast, keyboard navigation, screen-reader affordance
    — gates of entry, not polish at the end." | Trace to V: "Say what is
    true, not what sounds reasonable" — DESIGN-SYSTEM.md:62 heads the
    palette "Status Colors (WCAG AA Compliant)". Light mode ships
    --success-foreground: 0 0% 100% on --success: 152 60% 40% = 3.20:1 (hover
    4.08:1), below the 4.5:1 AA floor for the button's --text-sm text;
    rendered live on the idea Approve button (presenters/idea.ts:368-369). The
    design-system badge pair --accent-text on --accent-soft computes 4.28:1
    (pages-design-system.css:194)."

        .btn-success {
          background-color: hsl(var(--success));
          color: hsl(var(--success-foreground));
        }
        .btn-success:hover { background-color: hsl(var(--success-hover)); }

    more sites: web-app/app/styles/pages-design-system.css:194

F-191 [V] web-app/auth/index.ts:597
    Sign-up is a dead end: the form accepts input, spins, then refuses —
    first interaction cannot succeed
    symbol: init · sites: 3 · security: - · CONFIRMED
    doctrine: ""The first interaction must succeed." | Trace to V: "No
    equivocation. No dissembling." The page renders a full Create-account mode
    (email, password, company name, 'Create account' submit) that validates,
    disables the button, shows a loader for 800 ms, then always fails with a
    toast that names no credentials and no path to them — the interface
    promises a flow it cannot deliver."

                    submitBtn.removeAttribute('disabled');
                    showToast(
                        'Sign-up is coming soon — sign in with a'
                        + ' seeded account.',
                        'info',
                    );

    more sites: web-app/auth/index.ts:487, web-app/members/index.ts:266

    Split by the refuter into distinct defects,
    each confirmed on read:

    F-191a [V] web-app/auth/index.ts:597
        Sign-up is a dead end: the form accepts input, spins, then refuses —
        first interaction cannot succeed

                        submitBtn.removeAttribute('disabled');
                        showToast(
                            'Sign-up is coming soon — sign in with a'
                            + ' seeded account.',
                            'info',
                        );

    F-191b [V] web-app/auth/index.ts:487
        Inline field-validation errors are invisible to assistive technology
        — no aria-invalid, no aria-describedby, no live region

                    if (emailErr) {
                        emailError.textContent =
                            emailErr;
                        emailError.classList.remove(
                            'hidden',
                        );
                        emailInput.classList.add(
                            'input-error',
                        );

F-192 [V] web-app/landing/index.ts:509
    Landing page ships 15 dead href="#" links and a dead 'Talk to Sales'
    button
    symbol: (file scope) · sites: 16 · security: - · CONFIRMED
    doctrine: ""Defaults that work, exits visible — the escape hatch is part
    of the welcome." and "Beauty serves clarity. The interface that confuses
    is ugly, however it adorns itself." | Trace to V: "Say what is true, not
    what sounds reasonable." Footer Product/Company/Resources columns and
    three social links promise navigation and deliver a scroll-to-top; the
    'Talk to Sales' CTA (landing/index.ts:475) has no data-goto-auth and no
    handler — the only click delegation targets '[data-goto-auth]'
    (landing/index.ts:620)."

                                <li><a href="#">${

    more sites: web-app/landing/index.ts:475, web-app/landing/index.ts:512,
    web-app/landing/index.ts:515, web-app/landing/index.ts:518,
    web-app/landing/index.ts:526, web-app/landing/index.ts:529,
    web-app/landing/index.ts:532, web-app/landing/index.ts:535,
    web-app/landing/index.ts:543, web-app/landing/index.ts:546,
    web-app/landing/index.ts:549, web-app/landing/index.ts:552,
    web-app/landing/index.ts:566, web-app/landing/index.ts:567,
    web-app/landing/index.ts:568

F-193 [V] web-app/snapshots/index.ts:274
    Snapshot upload control is keyboard-unreachable: a non-focusable label
    wraps a display:none file input
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    doctrine: ""keyboard navigation … gates of entry, not polish at the
    end." | Trace to V (least severe defensible): the wrapped <input
    type="file" class="hidden"> resolves to display:none (utilities.css:225
    `.hidden { display: none; }`), removing it from tab order and the
    accessibility tree; the label itself is not focusable, so the import half
    of the first-run recovery page cannot be operated by keyboard."

                <label class="${
                    'btn btn-outline'
                    + ' cursor-pointer text-center'
                }"
                    data-tone="success">
                    Upload Snapshot

F-194 [IX] web-app/app/dialog.ts:99
    Dialogs do not trap Tab focus while the mobile drawer does — keyboard
    focus escapes open modals into obscured page content
    symbol: openDialog · sites: 1 · security: - · CONFIRMED
    doctrine: ""keyboard navigation … gates of entry, not polish at the
    end." | Trace to IX: "And once the better way is found, it must rise to
    replace every similar site — never rest beside them. One codebase, one
    voice." mobile-drawer.ts:71-100 implements the full Tab/Shift-Tab
    containment over FOCUSABLE_SELECTOR; openDialog only focuses the first
    element and constrains nothing — the only 'Tab' key handler in
    web-app/app is the drawer's."

            const focusable =
                dialog.querySelector<HTMLElement>(
                    FOCUSABLE_SELECTOR,
                );
            focusable?.focus();

F-195 [IX] web-app/projects/detail.html:56
    Two dialogs carry no role and no accessible name (9 of 11 do)
    symbol: (file scope) · sites: 2 · security: - · CONFIRMED
    doctrine: ""screen-reader affordance — gates of entry, not polish at the
    end." | Trace to IX: "once the better way is found, it must rise to
    replace every similar site — never rest beside them. One codebase, one
    voice." Nine sibling dialogs declare role="dialog"/"alertdialog" with
    aria-labelledby (e.g. projects/detail.html:9,
    organization/index.html:94-96); these two announce as plain divs."

        <div id="history-dialog"
            class="dialog dialog-xwide hidden" aria-hidden="true">
            <div id="history-modal-body"></div>
        </div>

    more sites: web-app/flows/index.html:27

F-196 [XII] serve:4
    ./serve refuses to run without a port — configuration demanded before
    first use
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    doctrine: ""They shall require no configuration — for the user's time is
    sacred and their patience is not infinite. … No configuration before
    first use. Defaults that work" | Trace to XII (least severe defensible):
    "in the user's view, patience." Every documented invocation uses 8080
    (CLAUDE.md, README flow); a default port would make the first interaction
    `./serve`. The sibling ./build shows the righteous form: every argument
    optional with working defaults."

        if [ $# -ne 1 ]; then
          echo "Usage: ./serve <port>" >&2
          exit 1
        fi

F-197 [XII] web-app/auth/index.ts:532
    Unconditional 800 ms artificial delay wraps every sign-in submit
    symbol: init · sites: 1 · security: - · CONFIRMED
    doctrine: "Trace to XII: "Every wasted millisecond is a small death. In
    the UI it erodes fluidity; … in the user's view, patience." The real
    loginViaPassword call begins only after a fixed setTimeout(…, 800)
    (closes at auth/index.ts:605) — 800 ms of fabricated latency added to
    every authentication attempt, including failures."

                setTimeout(async () => {
                    if (isLogin) {

    more sites: web-app/auth/index.ts:605

### The Office of Commentary

F-198 [V] api/mock-data.ts:404
    Doc comment welded to the wrong constant: ORG_TWO's description sits on
    STARK_ORG; ORG_TWO is bare
    symbol: (file scope) · sites: 1 · security: - · CONFIRMED
    doctrine: "Documentation comments at module and contract boundaries are
    different in kind — they are the contract itself, not commentary on it."

        // The demo's second organization. org '2' is a new ROW, not
        // a new table — generate-schema-svg derives FK targets from
        // *_id pluralization, so a new table would shift the schema.
        // The seed's root org id (Stark Industries). Local to the
        // seed — there is no global default org any more.
        const STARK_ORG = '1';

    more sites: api/mock-data.ts:411

F-199 [V] api/mock-data.ts:439
    Two stacked doc paragraphs over one function restate the same contract
    twice
    symbol: seedHumanCredentials · sites: 1 · security: - · CONFIRMED
    doctrine: "Dense, high-information communication. No equivocation. No
    dissembling."

        // Mint a fresh crypto-grade password for EVERY login-capable
        // person identity (one with a PII email), hash it into the
        // credential ledger, and return the plaintexts in-band for a
        // one-time reveal. [...] Both seed paths call this.
        // Seed login credentials for every login-capable person (one
        // with a PII email) plus the system client secret. Runs AFTER

    more sites: api/mock-data.ts:446

F-200 [V] web-app/app/component-top-bar.html:71
    Label comments restating the adjacent element's id/name (one even
    mislabels: 'Ideas Grid' atop a flex column)
    symbol: (file scope) · sites: 11 · security: - · CONFIRMED
    doctrine: "When a comment is required, it explains *why*, never *what*.
    The comment that explains "what" points at code that should have been
    clearer. Fix the code; delete the comment."

        <!-- Theme Toggle -->
        <div class="dropdown">
            <button
                class="btn btn-ghost
                    btn-icon"
                id="theme-toggle"

    more sites: web-app/ideas/index.html:31, api/mock-data.ts:3058,
    web-app/organization/index.html:15, web-app/organization/index.html:51,
    web-app/organization/index.html:88, web-app/projects/detail.html:4,
    web-app/projects/detail.html:28, web-app/projects/detail.html:52,
    web-app/app/component-mobile-header.html:52,
    web-app/snapshots/index.html:2

F-201 [V] web-app/app/logger.ts:72
    Suppression directive for a linter that exists nowhere in the toolchain
    symbol: makeLogMethod · sites: 1 · security: - · CONFIRMED
    doctrine: "We abide by our strictures rather than annotate our way around
    them."

                const prefix = formatPrefix(
                    level, context, requestId,
                );
                // eslint-disable-next-line no-console
                switch (level) {
                    case 'debug':

F-202 [IX] tests/navigation.test.ts:10
    51 @ts-expect-error directives stub globals that 12 sibling test files
    already stub comment-free via typed casts; the tsc gate
    (web-app/app/tsconfig.json include set) never checks tests/, leaving the
    directives inert under ./validate
    symbol: (file scope) · sites: 51 · security: - · CONFIRMED
    doctrine: "We abide by our strictures rather than annotate our way around
    them. [trace: IX] And once the better way is found, it must rise to
    replace every similar site — never rest beside them. One codebase, one
    voice."

        // @ts-expect-error - Node global stub
        globalThis.window = { location: fakeLocation };
        // @ts-expect-error - Node global stub
        globalThis.document = {

    more sites: tests/flow-operations.test.ts:7,
    tests/adapters-preferences.test.ts:91,
    tests/presenter-member-detail.test.ts:7

## Exemplars ledger

Credit where the code honors the doctrine — scripture leads with the
righteous. Exemplars land unrefuted: credit, not claims.

### I. Reliability

- api/backend-indexeddb.ts:312
  The transaction seam aborts the real IDBTransaction on a thrown body and
  rejects with the ORIGINAL error — platform-primitive atomicity, the
  failure surfaced whole, the inner catch documented as preserving the real
  fault rather than swallowing it.
- api/authentication.ts:282
  Token rotation closes its TOCTOU inside one transaction, with an explicit
  in-code note that both reads are index hits in the open tx (no interleaved
  non-IDB await) — the documented IndexedDB auto-commit constraint honored
  and explained at the site.
- web-app/auth/index.ts:544
  Distinguishes expected failure (wrong password returns null) from a bug (a
  throw is a DB/crypto fault), restores the UI, and surfaces the failure
  visibly — 'Distinguish expected failures from bugs' practiced verbatim.
- api/validators.ts:58
  Edge parsing wrapped once, with the error enriched by the label and the
  original message — 'Enrich errors at each boundary layer — original
  fault plus the context of every step that touched it.' Every
  unguarded-looking JSON.parse in the repo routes through a guard like this.
- api/store-serializer.ts:1
  A lost-update race in the simulated tiers identified, closed, and documented
  with its exact failure mode and its honest limit (cross-tab ordering out of
  reach until the IndexedDB tier) — reliability defended where the platform
  primitive is absent.
- api/api.ts:1452
  Invitation grant runs check and write in one transaction so concurrent
  grants cannot double-append, returning the outcome from the tx itself —
  concurrency-correct by construction, with the scripture cited at the site.
- web-app/app/core.ts:280
  A boot fault degrades visibly into a recovery page with working seed/import
  controls — failure handled with grace, the escape hatch part of the
  welcome, never a silent dead app.

### II. Security

- api/authentication.ts:599
  The password loop returns one uniform 401 for unknown-user, missing-secret,
  and wrong-password, and runs the SAME PBKDF2 work on every failure
  (equalizeFailureTiming) so no timing channel leaks user existence —
  textbook anti-enumeration.
- api/password-hash.ts:88
  PBKDF2-SHA256 at 600k iterations with per-credential salt, a constant-time
  digest compare, fail-closed unknown-algo registry, and self-describing PHC
  strings — the credential-at-rest covenant honored.
- api/crypto-safe-base62.ts:14
  All ids, auth codes, and jtis draw from crypto.getRandomValues with
  rejection sampling for an unbiased ~131-bit alphabet — no Math.random
  anywhere on a security path.
- api/access-token.ts:265
  verifyAccessToken pins alg to a hardcoded HS256 header (no client-supplied
  alg → no alg-confusion), verifies the HMAC via subtle.verify
  (constant-time), then enforces aud, nbf, and exp before trusting any claim.
- api/db-org-scoped.ts:55
  The tenant fence is an EXPLICIT allowlist (no reflective wrap-everything; a
  new store is global until deliberately fenced), and transaction() re-scopes
  INSIDE the tx so a guard read and its write share one transaction —
  closing the org TOCTOU.
- api/api.ts:231
  Credential reads project the opaque `secret` out at the API boundary on both
  the collection and :id routes, exposing existence and lifecycle but never
  the hash.
- web-app/app/flow-stats-graph.ts:299
  The read-only stats canvas escapes node/edge ids before interpolating them
  into SVG attributes — the righteous counterpart that proves the editor's
  flow-graph.ts:580 omission is a real gap, not a non-issue.

### III. Uniformity

- web-app/app/adapters/invitations.ts:138
  One of 184 adapter exports honoring
  getNoun/putNoun/deleteNoun/postNounOperation with consistently nominalized
  operations (Acceptance, Decline, Revocation, Conversion, StateChange) —
  'the naming convention is the documentation'; only 3 non-conforming exports
  exist and all are platform shims (setLocation, setSessionToken,
  createRequestContext).
- api/types.ts:515
  All 18 persisted row types that carry an event moment name it 'at' — not
  one created_at, timestamp, date, or time anywhere in the schema. One
  concept, one name, in all things; the moment-of-union teaching made uniform.
- api/mock-data.ts:74
  The opaque PRNG constants (0x6D2B79F5, 4294967296) are disclosed by naming
  the canonical algorithm itself — 'name what is opaque' without translating
  plain algorithm idiom into ceremony. Neighboring constants (MS_PER_HOUR,
  CREATE_DWELL_MS) name their units explicitly.
- web-app/app/adapters/state-events.ts:31
  buildStateEventOp's contract comment declares uniform vocabulary as the
  design goal of the helper — uniformity enforced at the source rather than
  hoped for at the call sites.
- web-app/app/presenters/ai-member-detail.ts:514
  The renderShell/renderUpdate protocol repeats verbatim across 11 presenters,
  all 35 presenter classes carry the -er Presenter name (the processor named
  with -er), and the verb split is honest everywhere: render* mounts into a
  container (side effect), build* returns SafeHtml (pure) — verified at call
  sites in ai-member-detail, flow-stats, human-member-detail, idea.
- web-app/app/adapters/state-events.ts:34
  The context vessel is named ctx at 204 of 204 RequestContext parameter sites
  repo-wide — zero 'context', zero drift; likewise orgId appears 0 times
  against 4 organizationId, and user* identifiers appear 0 times against the
  member/identity vocabulary.

### IV. Logic

- api/access-token.ts:300
  RFC-7519-exact boundary directions on both nbf and exp, and the exp boundary
  is mirrored verbatim in web-app/app/credential-resolution.ts:51 (`now <
  decodeAccessToken(token).exp`) whose comment names the rule — 'a token AT
  its exp is dead'. One boundary, two modules, zero drift: boundary reasoning
  made explicit instead of left implicit.
- api/access-token.ts:306
  The one tiebreak site whose reasoning is airtight: it does not assert which
  row wins a same-`at` tie — it PROVES the question immaterial, because only
  the `at` value is extracted and tied rows share it. This is 'less wrong,
  never fallacious' practiced: eliminating the ambiguous case by construction
  rather than by assumption.
- web-app/app/flow-stats-aggregate.ts:250
  Explicit reasoning about the degenerate zero-length boundary: a naive `sec >
  0` gate would silently drop instantaneous visits. The code names the edge
  case, states why the obvious predicate is wrong, and uses interval-touch
  instead — the off-by-one seen, reasoned through, and fixed before it
  shipped.
- web-app/app/adapters/projects.ts:123
  Defuses the vacuous-truth fallacy of every(): on an empty baseline set,
  every() returns true and a project with no baselines would read as fully
  actual-scored. The explicit non-empty guard keeps the predicate honest —
  the only every() site in the repo where vacuous truth could mislead, and it
  is the one that guards.
- web-app/app/flow-cycle-edges.ts:33
  Textbook three-color back-edge detection: the visited/onStack distinction
  correctly classifies cross-edges as non-cycle and back-edges as
  cycle-closing — the classic place to confuse 'seen before' with 'on the
  current path', and it does not. Shared by designer and stats canvas so the
  cycle predicate cannot fork into two drifting truths.

### V. Clarity

- api/store-state.ts:15
  Dense, high-information module-boundary documentation: states the covenant
  (append-only, one row one fact), names the commandment that motivates the
  design, and explains the transaction seam — why-commentary with zero
  equivocation.
- api/authorization.ts:8
  Says plainly what the function computes AND why the tie-break is chosen —
  the comment ends "the secure tie-break (revoke beats grant)" — security
  rationale spoken in plain speech even though plain speech is costly.
- web-app/app/zip.ts:40
  The exact opaque literal the scripture indicts by name (0xEDB88320) is given
  a name AND its derivation — the Magical Values discipline practiced to the
  letter: the opaque is named, the self-disclosing left alone.
- api/store-parent-scoped.ts:25
  Spot-verified TRUE against the code this run (getById throws EntityNotFound,
  never a 403). The comment says what is true, names the existence-oracle
  rationale, and the header honestly discloses its own DEPLOYMENT CONSTRAINT
  rather than dissembling about demo-grade isolation.
- TT-GAP-ANALYSIS.md:3
  A contract of record that leads by declaring its own staleness, names the
  superseded vocabulary explicitly, and points to the current truth — no
  equivocation, no dissembling about what the document is and is not.

### VI. Immutability

- api/store-state.ts:15
  Storage truth modeled as Hickey's immutable values 'free of time': lifecycle
  is derived by reducing facts (latestByKey), reversal is a NEW event, never
  an edit — the whole datastore answers 'why did THAT happen?' by
  construction. (The unenforced PUT seam is reported separately; the design
  itself is the section's leading exemplar.)
- web-app/app/state.ts:80
  App state typed Readonly<AppState> and replaced whole via spread — never
  mutated in place — so every change has exactly one visible site and
  subscribers observe values, not drifting references.
- web-app/app/flow-history.ts:44
  Undo/redo as pure functions over readonly snapshots ([...stack, v] to push,
  slice to pop) — history state cannot be corrupted in place, the classic
  mutable-undo bug is structurally impossible.
- web-app/app/presenters/record-detail.ts:201
  recordDraftFromView deep-copies at the edit boundary (toSorted + spread per
  level), so the page's mutable editing draft never aliases fetched data —
  edits cannot silently leak into shared state.
- web-app/app/flow-fsm-reduce.ts:696
  The flow-canvas gesture FSM is a pure reducer: (state, input) -> fresh state
  value plus actions, never in-place mutation — interactive-canvas state
  transitions stay traceable.
- web-app/app/safe-html.ts:18
  Shared lookup table frozen at module load — the platform primitive
  enforcing that a security-relevant constant cannot be silently altered at
  runtime.

### VII. Idempotency

- api/store-entity.ts:116
  The storage seam's put is a true PUT — full-state overwrite with
  caller-supplied id, no read-modify-write — and the comment names
  Commandment VII as the reason.
- api/store-state.ts:17
  Even the append-only ledger is written through PUT with caller-supplied ids,
  so a retried write lands on the same row instead of duplicating the event
  — verified across all 8 record() call sites.
- api/api.ts:1550
  The whole invitation lifecycle (grant/accept/decline/revoke) gates state
  INSIDE the write transaction: re-accept is a no-op, re-grant returns the
  existing pending invitation (the grant comment cites Commandment VII at line
  1450) — POST operations made repeat-safe by design.
- api/api.ts:331
  The batch commit plane admits only put and delete — the type itself
  forbids non-idempotent verbs, so every multi-noun operation is composed from
  idempotent primitives.
- api/mock-data.ts:6611
  Bootstrap and mock seeds use fixed deterministic ids
  ('bootstrap-system-active', 'bootstrap-membership-current'), so a replayed
  seed upserts the same rows instead of multiplying them.
- api/backend-buffer-tx.ts:93
  The simulated-transaction backend keeps delete a no-op on an absent row and
  put a replace-or-append upsert — the idempotent primitive semantics of
  IndexedDB's keyPath store faithfully preserved in the test/demo tier.
- web-app/app/adapters/shared.ts:103
  The only mutation vocabulary the client owns is GET/PUT/DELETE/POST —
  'PUT, GET, DELETE — not INSERT, UPDATE, DELETE' made the literal
  interface; and its 401-recovery retry is sound precisely because the Bearer
  gate rejects before any handler side effect.

### VIII. Simplicity

- api/error-helpers.ts:6
  A 12-line module: one function, one job, no ceremony. The header comment
  names it 'the lone home of the instanceof Error extraction the api layer
  repeats' and documents the deliberate sibling-copy tradeoff that keeps the
  api tier standalone — brevity achieved with the reasoning preserved.
- web-app/app/duration-units.ts:14
  A five-row data table plus one loop replaces what is usually an if/else
  cascade of unit conversions; every magnitude is a named constant and
  negative input is rejected at the gate. 'Simplicity is the fruit of GREAT
  effort' made visible in twenty lines.
- api/store-state.ts:15
  A 201-line store whose entire model fits in one sentence — 'One row, one
  fact'. The append-only ledger design removes whole classes of update/merge
  complexity, and the boundary comment is contract documentation, not apology.
- web-app/app/tsconfig.json:6
  Maximal strictness (strict, noUncheckedIndexedAccess,
  exactOptionalPropertyTypes, noImplicitReturns) sustained across ~101k lines
  with — measured this run — zero 'as any', zero @ts-ignore, zero
  TODO/FIXME/HACK, and zero commented-out code in production sources. The
  humble path held without a single escape hatch.

### IX. Generality

- api/db-memory.ts:8
  Three storage tiers (memory, localStorage, IndexedDB) — the abstraction
  (BackedDbAdapter, 413 lines) was extracted exactly when the pattern reached
  three, and each subclass is a pure construction preset overriding nothing:
  the inverse of 'a base class with three subclasses, each overriding most of
  it.'
- web-app/app/icons.ts:3
  ~104 icon functions compose one shared svg-wrapper; only iconLogo, whose
  viewBox/stroke genuinely differ, keeps its own raw <svg> — 'Abstract what
  is genuinely shared — and only that.' (The unused ariaLabel knob is the
  separate finding; the wrapper itself is righteous.)
- api/ledger-reduction.ts:12
  One ledger-reduction abstraction used in 14 files; downstream reducers
  (latestPerPair in scoring-format.ts, latestStatesForIds in state-events.ts)
  compose it instead of re-implementing, and the hunt for inline
  .at-comparison latest-wins loops found zero bypasses — the better way rose
  to replace every similar site.
- api/error-helpers.ts:1
  Exactly two sibling copies, each documenting why the duplication is
  deliberate (the api tier stays standalone): 'Two instances are coincidence
  … Below three, duplicate without shame' — exploratory duplication with
  the reason written down, not premature unification across a tier boundary.
- api/api.ts:254
  Thirty noun/:id routes flow through one factory wired once at instantiation;
  the only hand-rolled :id routes are sub-resources and the states log, whose
  deviation the factory's own comment documents ('The states log keeps its own
  explicit routes'). Both optional knobs (putValidate, getTransform) have a
  real consumer — generalized after use, not before.
- web-app/app/presenters/state-badge.ts:9
  The shared badge process with injected per-entity config and icon — the
  comment itself speaks the doctrine ('the process is shared, the participants
  vary'), and the hunt found zero hand-rolled data-state/data-dimmed badges
  resting beside it.

### X. Atomicity

- api/backend-indexeddb.ts:15
  The scripture's exact command made code: the indivisible operation is
  wrapped in the platform's transactional primitive, embraced without apology
  — abort-on-throw, commit-on-oncomplete, and the file is the single divorce
  point that names indexedDB.*
- api/api.ts:500
  The commit batch route gives every multi-write client mutation one platform
  transaction — 'all actions as one, or none at all' — and the adapters
  consistently ride it (24 ctx.commit sites, zero sequential-PUT batches
  found)
- api/authentication.ts:471
  The genuinely indivisible operation (single-use code consume + chain-root
  issue) is recognized as such and wrapped whole in the primitive — the
  double-spend window closed in-tx, not by application-layer locking
- api/mock-data.ts:448
  Honors the platform primitive's real constraint instead of simulating around
  it: crypto hoisted before the tx, the tx body kept to pure row ops — and
  this discipline held at every one of the 18 transaction bodies audited
- api/store-entity.ts:116
  'Yet idempotent operations obviate most transactional needs' — the write
  is a single idempotent upsert, so no read-modify-write transaction is needed
  at all; design so you rarely need it
- web-app/app/adapters/session-credentials.ts:49
  The access/refresh pair is stored as one key, one platform-atomic write —
  the pair can never tear, so no transaction is ever required: 'Design so you
  rarely need it' at its purest
- api/db-backed.ts:214
  Snapshot import: everything fallible (parse, validate, quota) runs before
  the transaction, then clear+put commits whole or aborts whole on the
  IndexedDB tier — the wipe-on-fail recovery hack was retired because real
  atomicity made it unnecessary

### XI. Efficiency

- SCHEMA.md:33
  The contract of record codifies system-wide retirement of every derived
  cache of ledger truth — 'derived caches of its truth are duplication, not
  optimization. Data derivable from it must be derived.' XI honored at the
  schema level: efficiency never pursued by denormalization.
- api/store-state.ts:170
  Tombstone truth is re-derived from the full append-only log on every
  EntityStore.getAll — no cached deleted-flag, no second source of truth.
  The comment even names the cost honestly ('Hot path for getAll on every
  EntityStore') and accepts it rather than caching prematurely.
- web-app/app/adapters/state-events.ts:171
  Efficiency earned the doctrinal way: a measured-shape N-per-page waste was
  replaced by ONE ledger scan plus a pure reduction — simplification, not a
  cache. 'Efficiency emerges from... simplicity, from code that can be
  reasoned about.'
- web-app/flows/detail.ts:122
  The save debouncer ships its own measuring instrument — every fire logs
  burstSchedules, burstDurMs, keystrokesPerSec, callDurMs. 'We do not assert;
  we measure. We do not declare; we witness.' The optimization carries the
  evidence that can justify or retire it. (command-palette.ts:728 does the
  same.)
- api/authentication.ts:592
  One of only two memoizations in the entire codebase, and it defends itself
  in doctrine's own vocabulary — security purpose first, then the explicit
  disclaimer 'not a measured cache.' The other (access-token.ts:106
  signingKeyHandle) is a non-extractable CryptoKey handle the platform cannot
  re-derive.
- web-app/app/adapters/dashboard.ts:72
  The Sin-of-the-Cache cost model honored in code: 'Under async I/O, parallel
  reads cost max, not sum.' Independent reads piggyback in one Promise.all
  throughout the adapters (members-union.ts:75,
  state-events.ts:305/344/357/399) instead of being cached or serialized.
- api/ledger-reduction.ts:12
  Every ledger consumer reduces through this one single-pass O(n) fold — no
  sorts, no per-call allocation churn, one voice. Efficiency inherited from
  simplicity and uniformity exactly as XI promises: 'not a goal but a
  consequence.'

### XII. Performance

- api/backend-indexeddb.ts:116
  Narrowed reads ride a REAL IndexedDB index (created from TABLE_INDEXES at
  upgrade time) instead of scan-and-filter in JS — the platform primitive
  doing the work, so the states hot path (entity_id lookups) and the org fence
  (organization_id slices) read only matching rows. Performance inherited from
  honoring the platform, exactly as XII emerging from the prior commandments
  prescribes.
- api/access-token.ts:109
  The HMAC CryptoKey is imported once and the memoized promise shared by every
  sign/verify — one-time setup hoisted off the per-request hot path. The
  neighboring doctrine note (authentication.ts:597: 'Lazy-init of a derived
  constant, not a measured cache') shows the congregation knows the difference
  between a derived constant and the Sin of the Cache.
- web-app/app/adapters/members.ts:131
  Independent reads are dispatched in parallel — 37 Promise.all sites across
  the adapters layer and ZERO serial await-in-for-of loops in it (verified
  exhaustively this run). Parallel reads cost max, not sum: the adapters layer
  practices the scripture's own cost model throughout.
- web-app/flows/detail.ts:117
  The flow-save Debouncer (and its twin in command-palette.ts:703-749)
  coalesces the high-frequency keystroke path AND instruments itself — burst
  rate, schedules per burst, callDurMs logged on every fire. 'We do not
  assert; we measure' made executable: the hot path ships its own measurement.
- web-app/app/command-palette.ts:920
  A preload justified by a NAMED measured cost (100-300 ms, well above Dan
  Luu's perception threshold), fired un-awaited (line 941) so boot is never
  blocked — an optimization measured into existence, then applied without
  apology, precisely as the Sin of Premature Optimization demands.

### We believe in the S.O.L.I.D. principles

- api/db.ts:96
  Interface Segregation practiced and named in the code itself: the keyed-read
  capability is deliberately kept off the EntityStore contract so decorators
  and the history store never carry a method they do not serve — many small
  interfaces over one bloated contract, with the reasoning written at the
  seam.
- api/db-backed.ts:162
  Dependency Inversion made flesh: one adapter over ANY StorageBackend, with
  every per-tier variation (backend, latency shim, open hook) injected at
  construction — 'depend on abstractions, not concretions — configure
  during initialization' — and the three tiers (memory, localStorage,
  IndexedDB) are pure construction presets over it.
- web-app/app/adapters/init.ts:30
  The composition root: the only production site constructing a concrete
  adapter (verified repo-wide — one `new IndexedDbDbAdapter` outside tests),
  with an injectable factory so boot-path tests substitute the in-memory tier.
  Configuration happens during initialization; everything downstream sees only
  the DbAdapter abstraction.
- api/store-org-scoped.ts:32
  Open/Closed via decoration: tenant fencing is added to the system without
  modifying a single store or handler — 'Handlers and inner stores never
  learn org exists; the guard rides the SAME seam every store already crosses'
  (file comment, lines 22-25). It is also exemplary SRP: the class has exactly
  one reason to change — the fence policy.
- web-app/app/page-registry.ts:43
  Open/Closed by registration: a new page is one declarative entry —
  compose.ts, navigateTo, the sidebar, the boot gates, and the command palette
  all extend behavior from the registry without modification. The data-driven
  route table in api/api.ts:513 (76 route()/makeIdRoute entries) honors the
  same principle at the API layer.
- web-app/app/adapters/shared.ts:103
  Interface Segregation at the layer every page touches: the entire data
  surface a page adapter may use is four HTTP verbs plus commit and an
  identity — small and focused, hiding the 43-member DbAdapter behind a
  contract sized to what callers actually need.

### We believe in telling, not asking

- api/backend-indexeddb.ts:248
  The open() hook self-heals a storeless connection at the gate and the
  comment explicitly forbids downstream hasSchema prove-yourself guards —
  the database is never demanded to prove itself before it serves; it is
  healed once and trusted thereafter.
- web-app/app/state.ts:125
  Callers (theme-toggle.ts:124) tell the state owner the new theme; the owner
  runs memory, DOM, and persistence as one process. No caller reads the
  current theme to compute the next — no external read-modify-write of the
  owner's state anywhere in the repo.
- web-app/app/presenters/record-list.ts:163
  The presenter tells the domain object to disclose its own display config
  (stateLabel/stateClassName backed by RECORD_STATE_CONFIG); raw #state is
  hard-private and never interrogated — the state→presentation mapping
  lives with its owner, the pattern seven presenter families share.
- web-app/app/command-palette.ts:949
  After a single race-closing read at boot, the palette subscribes to be TOLD
  when the schema arrives rather than re-interrogating hasSchema — ask once
  at the edge, then trust the bell.
- web-app/app/adapters/init.ts:101
  No isSeeded() interrogation is offered or needed: the contract ("a
  boot-order bug, not a state to mask — crash") replaces prove-yourself
  checks at every call site. Callers serve without demanding the holder prove
  itself; breach of covenant is proclaimed, not interrogated around.

### Relationships between entities are sacred covenants

- api/types.ts:1167
  memberships is the Article made code — it speaks the section's own words
  ('covenant', 'moment of union') and holds exactly the identities of the
  joined plus at; the members roster, reachable-orgs, and token-exchange all
  DERIVE from this relation rather than caching it.
- api/validators.ts:1276
  The gate ENFORCES covenant purity: assertOnlyKeys over
  ['organization_id','identity_id','at'] rejects any join row carrying payload
  beyond the joined identities and the moment of union — the same discipline
  repeated for invitations, idea_submissions, project_flows, flow_work_orders,
  and flow_records, bound again at the storage edge in db-backed.ts.
- api/types.ts:1189
  A relationship that demanded more (a lifecycle:
  pending/accepted/declined/revoked) was NOT stuffed with extra columns — it
  was promoted to a truthfully-named entity whose lifecycle lives in the
  states event log, exactly the section's teaching: a relationship demanding
  more is an entity, so name it as one.
- api/api.ts:1547
  acceptInvitation writes the membership covenant row and the 'accepted'
  lifecycle event in ONE transaction with an in-tx pending check — the union
  is stamped with one moment (at = nowUtc()), idempotent on re-accept, and the
  covenant lands in the INVITATION's org, never the caller's active org.
- api/types.ts:1143
  StateFieldValueEntity cites Codd by name in the contract comment: transition
  payload occupies its own relation pinned by state_event_id rather than
  riding as columns on the event row — relationships occupying their own
  relations, consciously.
- web-app/app/adapters/admin.ts:116
  getOrganizationStats derives projects/ideas/people counts live from the
  relations and the states log every read — the righteous discipline for
  relationship-derived numbers, stated as creed in the comment (and the
  standard against which the neighboring used_seats finding is measured).

### We believe in being informed of state changes

- api/backend-indexeddb.ts:286
  The bell is rung at the storage seam itself — every readwrite commit
  announces its touched tables automatically, so no publisher can ever forget
  to notify. The Observer pattern installed where it cannot be bypassed.
- web-app/app/adapters/broadcast-channel.ts:39
  Cross-tab notification as a single thin adapter — 'The ONLY place
  BroadcastChannel is named — the divorce point.' Subscribe returns its
  unsubscribe; post and subscribe are no-ops under Node so tests never hang.
- web-app/app/invitations-indicator.ts:28
  The top-bar bell literally practices the section and cites it: 'It OBSERVES
  the invitation change channel, so accepting/declining ... updates the count
  without a reload (the Observer article — trust the bell).'
- web-app/app/command-palette.ts:949
  Awaiting schema readiness by subscribing once and unsubscribing on first
  fire — the devout do not rattle the door with repeated hasSchema() checks;
  they wait for the bell.
- web-app/app/adapters/state-events.ts:142
  Claim expiry is derived lazily from the ledger at read time ('A claimed
  event older than lockTimeout is implicitly expired and reads as null') —
  no expiry-watch timer pacing the hallway, no anxious polling of the clock.
- web-app/app/adapters/schema.ts:9
  The watch list is built from the imported schema of record (api/db.ts
  TABLE_NAMES), correct by construction — the righteous contrast to the
  hand-typed kebab-case names of the dead-entries finding.
- web-app/app/state.ts:169
  Theme and sidebar state are observed, never polled: matchMedia change events
  for OS theme flips and StorageEvent for cross-tab preference sync —
  pub-sub end to end.

### We validate at every edge

- api/db-backed.ts:274
  Every one of the 32 stores is constructed WITH its entity validator, and
  EntityStore.put/putMany run it on every write — constraints enforced on
  entity instantiation, exactly as the section commands, regardless of which
  route or adapter calls in.
- web-app/app/adapters/session-credentials.ts:33
  Textbook storage-edge gate: localStorage read is parsed, shape-checked field
  by field, token-decodability asserted — and honest absence (null) is
  explicitly distinguished from corruption (SessionCredentialsCorruptError),
  never null-masked.
- api/storage-serialize.ts:23
  The NOT NULL covenant ('In the datastore, every attribute is NOT NULL')
  enforced as a shared gate both backends must cross — and api/types.ts row
  types carry zero nullable/optional columns (grep hit 0), with tombstones
  living in the states event log, their own tomb.
- api/snapshot-validator.ts:170
  The file-import edge runs every row of every table through its entity
  validator with precise per-row error labels, BEFORE the import transaction
  — witnessed this run: tests/snapshot-import-validation.test.ts 16/16 pass.
- api/backend-localstorage.ts:126
  'Storage: what was written was commonly stored incorrectly' — the read
  path distrusts the encoded blob (decompress, parse, array-shape, per-row
  isRowShaped) and rejects loudly rather than limping on.
- web-app/app/state.ts:179
  The cross-tab StorageEvent callback — other people's dharma — is
  validated before use, and loadStoredTheme throws 'corrupt stored theme' on a
  bad stored value instead of defaulting it away.
- web-app/app/auth-redirect.ts:8
  The URL-param edge validated against the PAGE_REGISTRY closed set
  (open-redirect defense), and the default destination is documented as a
  decision, not a fallback masking absence — the section's own vocabulary,
  lived in code.
- api/validators.ts:566
  Rejects ambiguous timestamps (date-only, zoned offsets) at the gate where
  Date.parse alone would wave them through; paired with assertOnlyKeys (line
  621) enforcing exact key sets — no extra keys, no missing keys — on
  every entity body.
- web-app/app/zip.ts:300
  Binary file-input edge validated in depth: PKZIP signatures checked, bounds
  checked, and a decompression-bomb cap imposed where the platform primitive
  provides none.
- web-app/app/adapters/org-session.ts:49
  The persisted active-org localStorage value is never trusted raw — it is
  validated against the freshly-derived reachable set before use, falling
  through a documented decision chain rather than a blind default.

### We handle failure with grace

- web-app/app/adapters/shared.ts:192
  withAuthRecovery catches ONLY the one error it can meaningfully handle (a
  401), retries exactly once, and on a second 401 scrubs and bounces —
  'Never catch an error you cannot meaningfully handle' made code; everything
  else propagates untouched.
- web-app/app/database-init.ts:20
  Bootstrap failure replaces the whole body with a raw-CSS error panel
  carrying the original fault message and a recovery hint — degrading
  visibly even when class-based styling itself cannot be trusted.
- api/backend-localstorage.ts:148
  Storage-edge faults are re-thrown enriched with the table name plus the
  original message — 'original fault plus the context of every step that
  touched it'.
- api/api.ts:1935
  The router's boundary catch is a typed ladder: it RE-THROWS
  MissingTableError (which it cannot handle — core.ts redirects to the
  snapshots recovery page), translates ApiError/EntityNotFound to their
  statuses, and only then falls back to 500 — an error you cannot handle
  belongs to a layer above.
- web-app/app/layout.ts:115
  Promise.allSettled keeps one widget's denial from suppressing the others,
  and every rejection is logged with its reason — the comment says it
  outright: 'rejections are logged, never swallowed'.
- web-app/auth/index.ts:544
  The login path explicitly distinguishes the expected failure (wrong password
  → typed null) from a bug (a THROW), and surfaces the fault visibly while
  restoring the UI — the section's expected-vs-bug distinction practiced and
  documented in place.
- web-app/app/adapters/session-credentials.ts:83
  A raw JSON.parse fault is converted at the storage edge into a typed, named
  error; callers then handle it deliberately — bootAuthGate scrubs and
  bounces (core.ts:202), the auth-exempt path stays anonymous by documented
  design (core.ts:171).
- web-app/app/flow-operations.ts:226
  Every one of the 10 flow-edit operations (grep-verified 10/10) catches its
  commit, logs the original fault, and returns a typed failOp the page
  surfaces as a toast — expected failure modeled as data, the fault never
  lost.

### We choose platform primitives

- package.json:1
  The entire manifest: zero runtime AND zero dev dependencies declared. An
  enterprise platform with auth, tenancy, ZIP, gzip, and an event-ledger store
  rides solely on browser and Node platform primitives — the Article lived
  to the letter.
- test:10
  The test runner is the platform itself — node:test plus native
  type-stripping — where most codebases reach for jest/vitest/ts-node. What
  the platform provides, the platform maintains.
- api/access-token.ts:127
  JWT mint/verify via Web Crypto HMAC-SHA256 (and PBKDF2 via subtle.deriveBits
  in api/password-hash.ts:77) instead of jsonwebtoken/jose — the platform's
  crypto primitive chosen over the canonical third-party abstraction.
- web-app/app/zip.ts:291
  The ZIP module hand-rolls only what the platform lacks (the container format
  and CRC32, each documented with its RFC) and delegates inflation to the
  platform's DecompressionStream — instead of importing JSZip. The precise
  boundary the Article draws.
- api/api.ts:1659
  The internal REST API speaks the platform fetch primitives — Request,
  Response.json, URL — as its envelope, not an invented message shape or an
  express-like routing framework. Every operation is an HTTP operation, on
  platform types.
- web-app/app/adapters/broadcast-channel.ts:1
  Cross-tab refresh uses the platform's BroadcastChannel — wrapped once in
  an owned adapter — where the ecosystem default is a pub-sub library.
  Platform primitive chosen, and insulated.
- api/backend-localstorage.ts:28
  Snapshot compression rides the platform's CompressionStream rather than pako
  — gzip provided by the platform, maintained by the platform.

### We measure before we optimize

- web-app/flows/detail.ts:122
  The flow-save Debouncer ships its own measurement instrument — burst
  schedule count, burst duration, keystrokes/sec, and the deferred call's own
  duration, logged on every fire and flush. Commit 12d2c124 'instrument both
  debouncers for measurement' states the instrumentation exists so 'the data
  drives keep/lower/remove decisions' — the optimization's fate is
  explicitly deferred to a number. We do not assert; we measure.
- web-app/app/command-palette.ts:728
  The palette search debounce (DEBOUNCE_MS = 100) carries identical
  performance.now() instrumentation — the 100ms choice is being witnessed in
  production logs rather than declared correct.
- web-app/app/adapters/snapshots.ts:172
  The snapshot import literally measures before it acts:
  navigator.storage.estimate() yields the real available quota, the headroom
  ratio is a named constant with a stated reason (parse doubles peak memory),
  and the no-measurement path falls back to a NAMED conservative cap —
  measurement first, optimization (rejection) only on a proven number.
- api/authentication.ts:592
  The comment engages the cache doctrine by name and distinguishes itself from
  it: the lazy-init exists to equalize timing (Security, II), not to speed
  anything up, and the author says so — 'not a measured cache'.
  Doctrine-aware self-classification of a borderline pattern.
- api/authentication.ts:88
  Auth-critical derived data is recomputed from the ledger on every call with
  the refusal to cache stated in the contract comment — the temptation to
  keep an unmeasured cache of roles/orgs is named and resisted.
- api/store-state.ts:164
  The acknowledged hot path derives the deleted-set fresh from the append-only
  states log on every getAll rather than maintaining a cached Set or a
  denormalized status column — no cache exists anywhere in the runtime (the
  exhaustive 'cache' grep returns only comments refusing one).
- CLAUDE.md:381
  A concurrency-safety claim in the contract of record carries its evidence
  tag — 'verified in-browser' — a measured witness, not an assertion.
- AUDIT.md:33
  The repo's own audit process encodes this section's settlement rule verbatim
  — disagreement become a number, the number a truth.

### We derive from the ledger

- api/ledger-reduction.ts:12
  The single canonical pure reduce over every append-only ledger: each
  'current X' in the system derives through it fresh per read — the
  section's command 'Data derivable from it must be derived' has one shared
  home, never a stored copy.
- api/store-entity.ts:33
  Deletion is never a cached flag on the row: every entity read re-derives
  tombstones from the states ledger inside the SAME transaction — derivation
  made atomic, so the ledger is the only truth even mid-write.
- api/authorization.ts:18
  Roles are derived fresh from the role_grants ledger at the gate on EVERY
  request (api.ts authorizeRequest reads the ledger, never a token claim), so
  a revoke takes effect on the next request — no cached authorization to go
  stale.
- web-app/app/adapters/admin.ts:119
  getOrganizationStats computes live counts from ledger-filtered tables and
  its comment preaches the section verbatim — 'The log is the truth — no
  stale denormalized counter sits between this reader and the entities it
  counts.'
- api/authentication.ts:92
  Reachable-org enumeration re-reads the memberships ledger on every call;
  ARCHITECTURE.md § Facade reinforces it: 'derived fresh from the membership
  ledger (never the possibly-stale token claim)'.
- web-app/app/adapters/state-events.ts:142
  The active claim is derived from ledger events plus lockTimeout arithmetic
  on every read — an implicitly expired claim reads as null with NO stored
  flag to reconcile; the materialized claim_expired event is durable audit
  appended to the same ledger, and the read path never depends on it.
- web-app/app/invitations-indicator.ts:40
  The pending-invitations badge count is re-derived from the invitation states
  ledger on every change-channel notification — observed, not cached: no
  stored counter to drift when an invitation is accepted in another tab.

### Messaging first, state second, datastore last

- web-app/app/adapters/shared.ts:103
  Messaging first, made literal: even though the datastore is in the same
  browser process, every data access from 42 adapter files is an HTTP-verb
  message over a named resource, carried in a single vessel with identity and
  requestId, plus an atomic commit(tx) batch message. The message design
  exists independently of the storage tier beneath — the section's ordering
  embodied.
- api/db.ts:202
  The datastore as servant: three backends (memory, localStorage, IndexedDB)
  swap beneath this byte-level seam without a single message or store-semantic
  changing — 'backends own persistence + encoding, stores own semantics.'
  Choosing (and re-choosing) the datastore to serve the state cost the message
  layer nothing, which is the proof the ordering was right.
- web-app/app/adapters/broadcast-channel.ts:39
  Cross-tab change notification is a posted message, not a poll — the repo
  contains zero setInterval loops. A readwrite commit announces what changed;
  sibling tabs subscribe and are told. 'The devout do not pace the hallway...
  The devout trust the bell' — and the channel is named in exactly one
  adapter file, the divorce point.
- web-app/app/channels.ts:41
  The datastore's table vocabulary is confined to the adapter layer: every
  createSubscriptionChannel caller is an adapter, and pages subscribe only to
  domain-named channels (invitationChanges, recordChanges, workOrderChanges).
  Storage namespace in, domain message out — the seam translating exactly
  where the section demands.
- web-app/app/adapters/init.ts:36
  Boot asks 'is there a schema?' through the designed message rather than
  interrogating the store — the tier-independent way to ask, and the
  standing rebuke to root-redirect's raw keyspace probe. The route table
  likewise offers derived-state messages (entity-states/:id,
  entity-states/:id/history, current-member): state second, derived from the
  ledger the messages record.

### Context as the single vessel

- web-app/app/adapters/shared.ts:103
  'The attributes immutable even as the vessel itself is enriched' — both
  state attributes are readonly, and an exhaustive repo-wide hunt for any
  assignment to a context attribute found zero sites. The covenant holds in
  the type AND in practice.
- web-app/projects/detail.ts:652
  'Processing begins with a request; each step uses and perhaps enriches the
  context' — each user action mints exactly one vessel and every step of the
  operation (entity put, then state change) rides the same baton. The dominant
  pattern across the 102 creation sites.
- web-app/app/adapters/shared.ts:157
  The write batch travels whole through the vessel as ONE posted operation
  that commits in one transaction — the baton passed whole, never
  dismembered; 'Speed is the consequence; atomicity is the goal' honored on
  the write path.
- tests/adapters-shared.test.ts:103
  'The request UUID resolves the trace' (Office of the Context) — the field
  is set exactly once at construction, and its stability and per-request
  uniqueness are under test; tests configure the vessel by injection
  (MemoryDbAdapter), depending on the abstraction.
- web-app/app/adapters/shared.ts:330
  'complete by covenant' — an incomplete vessel (no org on a post-boot
  session) is treated as an impossible state and crashes with a named breach
  rather than inventing a default; trust within the walls, proclaimed loudly
  when violated.
- web-app/app/flow-interactions.ts:60
  The vessel discipline extends beyond the request plane: every other *Context
  type in the codebase (FlowGestureContext, LayoutContext) is declared
  Readonly — immutable bags throughout, one voice.

### Process first, noun second

- api/api.ts:1983
  Pure rheocode — 'pounder.pound(poundable, nailable)' made literal. The
  process function owns everything; the tool (adapter) and participants
  (resource, token) are parameters, infinitely substitutable: memory,
  localStorage, and IndexedDB adapters all flow through this one stable
  process. PUT/POST/DELETE at api.ts:2004/2052/2030 follow identically.
- web-app/app/flow-operations.ts:163
  'Name the action. Parameterize the participants.' The action is the
  top-level symbol; the flow snapshot is a participant, never an owner —
  there is no flow.addEdge(). Siblings performDeleteSelectedNodes (line 327),
  performUndo (641), performRedo (711) keep the same discipline.
- api/types.ts:1373
  The noun stripped of process verbs: all seven domain classes in types.ts own
  only accessors, -able capability predicates (isConvertible(): this.#state
  === 'approved'), and pure derivations (timelineProgress). The conversion
  PROCESS lives in the adapter verb postIdeaConversion — nouns are
  participants, processes are elsewhere and named.
- api/store-parent-scoped.ts:109
  A process factory: the resolving process is the stable contract
  (OwningOrgResolver<T>); the participants — the parent store and the
  id-extractor — are parameterized functions, infinitely substitutable.
  viaMembership (line 147) swaps the participants without touching the
  process, proving 'the process is stable; the participants vary.'
- web-app/app/adapters/shared.ts:119
  The vessel is assembled from parameterized participants rather than reaching
  for them; with initAdapter(makeAdapter) at adapters/init.ts:30 ('makeAdapter
  is injectable so boot-path tests can substitute an in-memory tier') the
  storage participant substitutes freely at the composition root.
- api/store-entity.ts:11
  The storing process configured at initialization with four substitutable
  participants — constructor(table, run: TxRunner, stateStore: StateStore,
  validate: EntityValidator<T>). One stable process serves every table; the
  participants vary per table and per backend — Dependency Inversion in
  service of process-first.

### Composition over inheritance

- api/store-org-scoped.ts:32
  The tenancy fence — the most security-critical behavior in the repo — is
  added by COMPOSITION, not inheritance: a decorator that implements the
  EntityStore contract, composes #inner, and delegates with
  filtering/stamping. The header names the pattern outright: "The divorce
  point. An EntityStore decorator bound to one org" (line 19-21). Capability
  over lineage, exactly as the Article demands.
- api/db-backed.ts:100
  One concrete adapter over ANY StorageBackend — per-tier variation
  (backend, latency, open hook) is injected through the constructor and
  delegated to, never specialized via subclass overrides. The header comment
  even shows commandment discipline: "the 32-store wiring... live[s] here once
  (Commandment IX — the third backend, IndexedDB, triggers the
  abstraction)". Composition organizes this code by what it does.
- api/backend-buffer-tx.ts:16
  The classic base-class temptation — two backends (memory, localStorage)
  sharing transaction mechanics — is resolved as a shared FUNCTION both
  backends compose, not a common superclass: "Backend-agnostic by construction
  — the two simulated backends (memory, localStorage) differ only in how
  they fill the buffer (preload) and drain it (flush)" (lines 10-13). Both
  backends declare `implements StorageBackend` with zero inheritance.
- api/types.ts:675
  The textbook IS-A bait — human/AI/system member variants — is modeled
  with NO Member base class: three independent classes carrying a `kind`
  discriminant, each COMPOSED from row facets (parent MemberEntity + detail
  row + pii + state), united by `export type Member =` (types.ts:937), a
  type-level union instead of a hierarchy. The IS-A relationship lives in the
  type system, not in implementation lineage.
- api/store-parent-scoped.ts:204
  When the contract differs, the code writes a SECOND small decorator rather
  than forcing a shared superclass: "StateStore is not an EntityStore (it has
  record/currentFor/allFor, no putMany/delete), so it needs its own decorator"
  (lines 195-197). Interface Segregation and composition working together —
  two small decorators over one bloated hierarchy.

### Insulation through adapters

- api/backend-indexeddb.ts:13
  The claim in the header is TRUE — verified this run by exhaustive grep:
  zero IndexedDB symbols (indexedDB, IDBDatabase, IDBTransaction, IDBRequest)
  exist outside the backend pair. The StorageBackend seam lets memory and
  localStorage backends substitute wholesale, so the divorce is proven by
  construction: three interchangeable tiers behind one seam.
- web-app/app/adapters/broadcast-channel.ts:1
  Again verified true by exhaustive grep — BroadcastChannel appears nowhere
  else. The adapter even absorbs platform divergence (Node's channel exposes
  unref(), the browser's does not) so callers never learn which host they run
  on. This is the Article speaking in first person from the code.
- web-app/app/adapters/event-listener.ts:8
  "Others wrap a single primitive against the day it evolves" — a wrapper
  around exactly one primitive (addEventListener) that pairs add with remove
  so "a caller can never remove a different listener than it added", consumed
  by the other platform-event adapters (broadcast-channel, media-query,
  storage-event). The single-primitive sacred form, with a safety property
  added at the seam.
- web-app/app/adapters/clipboard.ts:1
  "The thinnest adapter is not ceremony — it is the DIVORCE POINT." Four
  lines, one primitive, one seam, named in domain HTTP-verb voice
  (postClipboardCopy, not writeText) — the only navigator.clipboard touch in
  the repository. The cheapest possible divorce, paid willingly.
- web-app/app/adapters/preferences.ts:3
  The owned localStorage preference seam: quota-exceeded policy is decided
  ONCE at the seam (writePreference logs and returns false; other errors
  propagate), and consumers stay in domain voice — logger.ts reads its level
  via getPreference, never naming localStorage. Also exemplary at the layer
  above: exhaustive grep shows no module outside adapters/ imports the
  api/api.ts transport — the RequestContext seam ARCHITECTURE.md declares
  ("adapters never import them directly") holds repo-wide.

### We speak our own idiom

- web-app/app/adapters/broadcast-channel.ts:1
  Self-describing divorce point: the platform primitive is named in exactly
  one file (verified by repo-wide grep), and the exports speak the domain
  tongue (postTablesChanged / subscribeTablesChanged), not the platform's.
- web-app/app/adapters/session-credentials.ts:44
  Explicit vocabulary translation at the adapter exit: the OAuth wire idiom
  (access_token) enters, the camelCase domain idiom (accessToken) exits; a
  header comment names the wire-matching keys deliberately. Repo-wide grep
  confirms no OAuth wire vocabulary escapes the adapters.
- ARCHITECTURE.md:86
  A written per-layer vocabulary covenant — and it HOLDS: exhaustive grep of
  all web-app .ts/.html string literals found zero user-facing
  'entity'/'instances' strings. The contract of record practices the Article.
- web-app/app/adapters/preferences.ts:3
  The storage primitive enters; the role vocabulary ('preference') exits —
  the exact inversion of the redisClient-in-business-logic sin. Four modules
  (state.ts, logger.ts, core.ts, org-switcher.ts) consume the role name, never
  the primitive.
- api/backend-indexeddb.ts:16
  IndexedDB vocabulary (IDBTransaction, IDBDatabase, indexedDB) is confined to
  this single file behind the StorageBackend seam — repo-wide grep over api/
  and web-app/ found no other speaker. The platform tongue stays inside its
  adapter.

### We believe in shallow structure

- README.md:3
  The Article's exact demand — 'the top level of a project should give you a
  rough idea of what type of app it is' — is met in the first sentence at
  the repo root, and the surrounding root listing (api/, web-app/, tests/,
  build/serve/test/validate, the contract scrolls) corroborates it: a
  zero-dependency web app with an API layer and a test suite, legible from one
  ls.
- web-app/app/page-registry.ts:23
  Source = Output Alignment: every page is a depth-1 directory under web-app/
  (dashboard, ideas, projects, flows, members, ...) and both compose.ts and
  navigateTo() resolve output as {sourceDir}/{sourceFile}.html — ls web-app
  literally reads as the README module list. The domain sits at the surface;
  nothing is buried under taxonomy. 'Flat is faithful' made mechanical.
- test:7
  The single nested directory in the whole tracked tree (tests/tz/, depth 2)
  is not taxonomy — the directory boundary is itself the mechanism (excluded
  from the non-recursive glob, run under a pinned offset zone), and the reason
  is documented at the point of use. 'The Unix way is to make structure
  visible — not to bury it beneath ceremony.'
- api/store-org-scoped.ts:1
  api/ holds 34 files in ONE flat namespace using prefix families (store-*,
  db-*, backend-*) instead of store/, db/, backend/ subtrees — every
  internal import is a single './x.ts'. The same pattern governs
  web-app/app/styles/ (components-*, pages-*) and the flow-* family in
  web-app/app/. Filename families deliver the categorization deep nesting
  falsely promises, while ls api discloses the entire storage architecture at
  one level.

### Every operation is an HTTP operation

- api/api.ts:1983
  "Every application is an HTTP application" made literal: the entire data
  plane exports GET/PUT/DELETE/POST that build real Request objects (method,
  Bearer header, JSON body) and route through handleRequest — even though
  the store is the browser's own IndexedDB with no network. Every operation in
  the app crosses an HTTP boundary by construction.
- api/api.ts:331
  POST /commit is the section's multi-noun rule made code: "Multi-noun
  operations: post_operation, composed from single-noun primitives." Each
  CommitOp is a put or delete addressed by resource path, re-dispatched via
  matchRoute (dispatchOpInTx, api/api.ts:459) to the identical single-noun
  route handlers, inside one transaction. postIdeaConversion and
  applyRecordMultiPut compose the same way.
- web-app/app/adapters/clipboard.ts:1
  The idiom reaches all the way down to single-primitive platform shims: a
  clipboard write is named as a POST operation. Across ~150 exported adapter
  functions the getNoun/putNoun/deleteNoun/postNounOperation convention holds
  — the naming convention genuinely IS the documentation of each operation's
  semantics.
- api/api.ts:1109
  Verb semantics engineered, not merely named: a PUT over an append-only
  ledger is made idempotent by writing nothing on a repeat — honoring
  Commandment VII's "An operation that can be repeated without consequence is
  an operation that can be trusted" while keeping the ledger append-only.
- api/api.ts:254
  "The verbs a resource exposes are data; each maps to its one fixed store op
  (get→getById, put→put∘withoutId, delete→delete)" (file's own comment
  at api/api.ts:238). The single-noun primitive mapping of the section is a
  first-class, declarative construct — verbs are configuration, wired once
  at instantiation.

### Communicating sequential processes

- web-app/app/adapters/broadcast-channel.ts:39
  Cross-tab data change is communicated as a typed message on a named channel
  — the section's mandate made literal. The file header declares itself "The
  ONLY place BroadcastChannel is named", and the no-echo property means the
  poster never double-refreshes: pure send/receive, zero shared-state
  inspection.
- api/backend-indexeddb.ts:284
  The message fires only inside oncomplete and only for readwrite —
  announce-after-durable-commit. Receivers trust the bell instead of polling
  shared storage: the repo contains zero setInterval, zero focus-refresh, zero
  rAF polling. The poster is dependency-injected (init.ts:24), keeping the
  backend ignorant of the transport.
- web-app/app/channels.ts:14
  A minimal in-tab channel, and createSubscriptionChannel composes the
  cross-tab BroadcastChannel message into per-table page-refresh notifications
  consumed by 22 adapter channels — Hoare's "asynchronous composition of
  communicating sequential processes" as the system's actual structuring
  method.
- api/store-serializer.ts:12
  Concurrent transactions on the simulated backends are enqueued into one
  sequential consumer — would-be shared-memory interleaving ("two concurrent
  transactions both pre-load a table at v0 and the second flush clobbers the
  first") converted into ordered sequential processing, with its cross-heap
  limit honestly documented.
- web-app/app/state.ts:179
  Theme/sidebar state crosses tabs as platform change events — messages
  received and validated at the edge — never by re-reading shared
  localStorage on a schedule; in-tab state is an immutably reassigned snapshot
  (state = { ...state, ...partial }).

### We acknowledge the cost of the discipline

- api/db-backed.ts:279
  The validator cost paid once, universally, at a single wiring site:
  #buildStores constructs all 32 stores WITH their entity validators, so every
  live write through every backend tier validates — 'Enforce constraints on
  entity instantiation — never downstream' honored literally. My strongest
  hypothesis (28 unvalidated PUT routes) died against this wall, which is
  exactly what a paid discipline is for.
- web-app/app/adapters/session-credentials.ts:50
  The section made code: the cost is counted IN WRITING — the comment names
  the sibling adapter, names the divergence, and justifies it by consequence.
  The same file pays the validator cost at the storage edge
  (parseBlob/tokenField/assertDecodable) and distinguishes corrupt from
  honestly-absent so a poisoned blob can never masquerade as logged-out.
- SCHEMA.md:585
  The join-table cost paid and described in the Article's own vocabulary
  ('Join tables hold only the identities of the joined and the moment of
  union'); the whole Relationships section (idea_submissions, project_flows,
  flow_work_orders) is id + two FKs + at, nothing more — no entity wearing a
  false name.
- package.json:1
  Zero dependencies and zero devDependencies — the steepest discipline cost
  in the repo, paid in full: hand-rolled in-browser ZIP, WebCrypto HMAC JWTs,
  node:test with --strip-types. 'Every dependency is a future migration' was
  counted, and the cost of absence found the greater.
- ARCHITECTURE.md:232
  Acknowledgment of cost as documentary practice: a written ledger of
  discipline costs deliberately DEFERRED (key custody, delegation policy, JWS
  verification), each one named, scoped, and flagged for the moment the trust
  boundary appears — counting the cost is precisely what my section demands,
  and here the counting is the artifact.
- api/store-entity.ts:116
  Paying willingly is not paying blindly: this comment records a discipline
  cost REFUSED because it bought nothing — the read-then-splice guard was
  recognized as internal defense and removed, with the reasoning left for the
  next reader. Counting cuts both ways, and this is the receipt.

### On the Sin of Premature Optimization

- api/authentication.ts:592
  The one memoization in the auth spine names the doctrine and distinguishes
  itself from it: the motive is closing a timing side-channel (Security, II),
  not phantom speed, and the comment explicitly declares 'not a measured
  cache' so no reader mistakes it for an optimization.
- web-app/app/command-palette.ts:920
  An optimization admitted only with its absolute, user-perceptible cost
  stated — 100-300 ms, well above Dan Luu's perception threshold — exactly
  the form the scripture demands: 'Measure to find it, measure to PROVE it,
  then optimize without apology.'
- web-app/flows/detail.ts:122
  The save debouncer (and its twin at command-palette.ts:728) ships its own
  instrument: every fire logs burst schedules, keystrokes/sec, and call
  duration via performance.now(), so the coalescing optimization's premise is
  continuously witnessed rather than assumed — 'We do not assert; we
  measure.'
- api/store-entity.ts:33
  Every getAll re-derives the deleted-id set from the full states ledger
  inside the same transaction; api/store-state.ts:169 even names this the 'Hot
  path for getAll on every EntityStore' and still refuses a cached tombstone
  set or status column — deliberate non-optimization on a self-acknowledged
  hot path until measurement demands otherwise.
- api/db-indexeddb.ts:19
  The persistence tier deliberately injects lognormal simulated network
  latency (api/latency.ts, 10-500 ms clamp) on every adapter op, so all pages
  are built and felt against realistic future-server costs — the structural
  antidote to phantom-cost reasoning, and the measured basis behind the
  palette's quoted 100-300 ms.
- web-app/app/flow-layout.ts:550
  A tuning constant chosen by witnessed convergence on the actual workload
  scale (5-30 node graphs) and documented with its empirical basis —
  measurement before tuning, and the absolute scale stated.

### On the Sin of the Cache

- SCHEMA.md:33
  The Article 'We derive from the ledger' made structural: every derived-state
  cache was RETIRED from the schema; current state is re-reduced from the
  states ledger on every read. The system that 'has already paid for the
  ledger' derives from it — no second truth exists to go stale.
- api/ledger-reduction.ts:12
  Derivation as a first-class primitive: a pure reduction that recomputes the
  winning row per key from the append-only ledger at every call site
  (credentials, roles, invitations, auth codes). The codebase's answer to
  'current X' is a fold, never a stored copy.
- api/api.ts:1093
  The fence refuses its own readily available snapshot (the signed `orgs`
  claim riding the very same request) and pays the ledger read instead —
  cache refusal exactly where staleness would matter most.
- web-app/app/adapters/admin.ts:116
  Live counts via Promise.all over the source tables — the correct PARALLEL
  cost model the Sin names (parallel reads cost max, not sum) deployed as the
  argument against a denormalized counter cache, in the code's own words.
- web-app/app/adapters/org-session.ts:4
  Names rot as the reason not to cache: persists only the un-rottable user
  CHOICE and re-derives the perishable artifact at boot. The distinction
  between preference persistence and truth caching, drawn correctly.
- api/authentication.ts:597
  The code speaks the doctrine's own distinction: a once-computed derived
  CONSTANT (no write path, no staleness surface) is declared as such and
  separated by name from the unmeasured cache the Sin condemns. Twin at
  api/access-token.ts:109 (memoized non-extractable CryptoKey handle).
- web-app/app/invitations-indicator.ts:16
  The pending-invitations badge holds no cached count: it OBSERVES the
  invitation change channel and re-derives from the ledger on every
  notification — informed of state changes rather than re-remembering them.

### On the Sin of Premature Generalization

- api/db-backed.ts:92
  The codebase consciously waited for the third instance before abstracting
  — the comment cites Commandment IX by name. And the shape is righteous:
  the three subclasses (MemoryDbAdapter, LocalStorageDbAdapter,
  IndexedDbDbAdapter) are thin construction presets over composition,
  overriding nothing — the inverse of 'a base class with three subclasses,
  each overriding most of it'.
- api/api.ts:254
  Abstraction after the pattern spoke loudly: 29 instantiations of one route
  factory, traced this run. Its two optional fields (putValidate,
  getTransform) are wired once at instantiation — 'Dependency Inversion, not
  a per-request branch' per its own header — and both are exercised by real
  routes, not held 'in case'.
- api/db.ts:202
  One seam, three living implementations (MemoryStorageBackend,
  LocalStorageBackend, IndexedDbBackend — confirmed by class search this
  run). 'Three is pattern' — the interface earns its existence with exactly
  the exploratory population the doctrine demands.
- web-app/app/field-key-validator.ts:6
  Extraction after exploratory duplication, recorded in the comment itself
  ('the guard the modules otherwise hand-roll identically') and proven by four
  production consumers traced this run — the abstraction rose to replace the
  hand-rolled sites rather than rest beside them.

### On the Sin of Shared Mutable State

- api/backend-indexeddb.ts:284
  Cross-tab shared data lives behind the platform's transactional primitive,
  and on commit the tab SENDS the touched table names over BroadcastChannel;
  other tabs refresh on receipt. Share memory by communicating, never
  communicate by sharing — the section's prescription fulfilled end to end
  (adapters/broadcast-channel.ts + channels.ts complete the message path).
- api/store-serializer.ts:4
  Names the exact interleaving hazard on the shared table map —
  last-writer-wins clobber — and eliminates it by total ordering through a
  promise chain. Reasoning about the interleavings, then removing them, is
  precisely what the section demands of anyone who must share.
- web-app/app/state.ts:72
  App state is a Readonly value replaced wholesale ({ ...state, ...partial }),
  never mutated in place; cross-tab convergence arrives by StorageEvent
  message (state.ts:179), not by tabs peeking at each other's memory. Hickey's
  value discipline plus message-based sync in one small module.
- api/authentication.ts:279
  Concurrent mutation of the shared token chain is arbitrated inside the
  platform transaction over the append-only ledger — the one place
  interleaving is permitted to be decided. The server-side half of refresh
  handles sharing righteously; the client-side half (finding 1) does not.

### On the Sin of Global State

- web-app/app/adapters/init.ts:101
  Necessary per-tab ambient state with a named owner: the holder is
  module-private, mutated only through a four-function funnel (core boot,
  login, recovery, logout — measured this run), and an unseeded read crashes
  loudly with a boot-order diagnosis instead of inventing a token. State WITH
  ownership and accountability — the antithesis of the sin.
- web-app/app/command-palette.ts:287
  A large interactive surface whose entire mutable state lives function-scoped
  inside initCommandPalette(), closed over by its handlers — nothing at
  module scope, no whispering possible. Exactly one owner: the closure that
  created it.
- web-app/flows/detail.ts:282
  The heaviest stateful page in the app encapsulates its state in a class of
  #private fields with named accessors and crash-on-uninit getters
  ('pageState.presenter() called before setPresenter()', line 218).
  Module-private, single owner, reset by full-page navigation — controlled
  state, not chaos.
- web-app/app/channels.ts:14
  Pub-sub without a global event bus: each channel's subscriber Set is closed
  over per instance, and each adapter module owns exactly one channel for its
  entity family (22 sites measured). 'Be informed of state changes' made
  manifest while every piece of state keeps one owner.
- web-app/app/state.ts:72
  Import-pure module state: loading the module touches no global (asserted by
  tests/state-init.test.ts's static-import contract), hydration happens at
  exactly one boot seam, and the var is typed Readonly with
  replacement-not-mutation updates. Who spoke first is always answerable:
  initState, then the named entry points.
- tests/state-init.test.ts:41
  Tests must touch the one truly global object to stub browser APIs in
  zero-dependency Node — and every sampled site does it under try/finally
  restore (also adapters-preferences.test.ts:102-104), so no test inherits
  another's globals. The unavoidable global handled with restore discipline
  and per-file process isolation.

### On the Sin of Null

- api/types.ts:617
  The section's prescription made flesh: absence as a tagged union, no null,
  no sentinel, decided at the call site exactly as the Articles demand ('model
  that absence at the call site — not in the helper').
- api/types.ts:506
  'Nullable data is ideally represented as the lack of a row in a related
  table' — the unset default org IS the absence of the row, documented as
  deliberate doctrine.
- api/storage-serialize.ts:23
  'In the datastore, every attribute is NOT NULL' — enforced by a real gate
  every backend shares, so a null can never reach a row; the test backends
  cannot lie about what production enforces.
- SCHEMA.md:33
  The temporal-fact bullet of the section, honored at schema scale:
  completedAt/deletedAt-style nullable columns were RETIRED into an
  append-only event ledger — 'the absence of a row IS the absence of the
  event' — and the grep for such columns returns zero production hits.
- web-app/app/adapters/members-union.ts:122
  Crashes on the impossible absence (unknown member) instead of nulling, and
  renders erased PII via the named constant MEMBER_WITHOUT_PII_NAME by
  switching on the tagged union — no sentinel, no ambiguity, absence decided
  where it is displayed.
- web-app/app/flow-fsm-reduce.ts:83
  UI selection state modeled as discriminated unions with an explicit { kind:
  'none' } arm rather than null — the 'richer alternative' the section
  demands, used consistently across flow-fsm-reduce, flow-interactions, and
  flow-designer-actions.
- api/identity-tokens.ts:115
  RotationPlan returns a tagged 'unknown' arm for a jti never issued — the
  absence of provenance is a first-class domain value, not a null return the
  caller must remember to check.

### On the Sin of Default Values

- api/ledger-reduction.ts:33
  Letter-perfect observance of "When a value is truly absent ... model that
  absence at the call site — not in the helper. Helpers shall not pretend
  absence" — the helper returns null and the comment explicitly assigns
  fallback choice to the caller.
- web-app/app/auth-redirect.ts:11
  The section's remedy verbatim: "If a value has a sensible default, define it
  as a named constant and pass it explicitly" — and the comment names the
  sin it refuses ('never a buried ?? ...') in the scripture's own vocabulary.
- web-app/app/adapters/shared.ts:330
  Refuses the comfortable lie outright: an absent active org is an impossible
  state, so the code throws instead of defaulting — "Default values that
  mask the absence of real data are comfortable lies" honored at a
  tenancy-critical seam.
- web-app/app/adapters/state-events.ts:280
  Distinguishes absence-as-bug from absence-as-default and throws accordingly
  — the ledger is trusted to be complete, and no fictitious initial state is
  invented (same pattern repeats at lines 319 and 370).
- web-app/app/adapters/flow-defaults.ts:11
  Sensible defaults defined as named constants and passed explicitly into the
  constructed entity (buildStartAndCompleteNodes, lines 24-49) — exactly the
  prescribed alternative to schema or parameter defaults;
  api/db-indexeddb.ts:22 does the same, passing DEFAULT_LATENCY_CONFIG
  explicitly rather than defaulting it inside the helper.
- web-app/app/format.ts:6
  Displayed absence as a single named constant consumed across presenters (`??
  DISPLAY_ABSENT` in member.ts, workbox-inbox.ts, ai-member-detail.ts,
  project-score-history.ts) — "Presentation transforms are not coercion —
  formatting a value for display is service, not concealment", and the em-dash
  makes absence visible instead of faking data.

### On the Sin of Internal Defense

- web-app/app/dom.ts:53
  The righteous in-wall idiom for the page's own DOM contract: a missing
  required element is an impossible state and crashes loudly with a named
  error — 30 call sites use it. It is the codebase's own proof that the
  silent-return guards (findings 1 and 5) are a choice, not a necessity.
- web-app/app/presenters/project-objectives.ts:133
  A Map.get narrowing forced by the type system is resolved by proclaiming the
  breach, not by a fallback definition — 'an impossible state is a bug…
  and must crash.' The same throwing pattern recurs in
  organization-objectives.ts:106, dashboard-objective-aggregates.ts:97,
  idea-conversion.ts:670, workbox-detail.ts:93/513/523.
- web-app/app/adapters/members-union.ts:127
  A broken member reference within the walls crashes with the offending id
  named — trust enforced by contract rather than masked by a placeholder
  name.
- web-app/app/adapters/work-orders-mutations.ts:140
  Validation exactly at the storage edge — 'Storage: what was written was
  commonly stored incorrectly' — after which the graph is trusted
  completely; the subsequent no-start-node check throws a named invariant
  error rather than falling back.
- api/api.ts:1337
  Genuine domain absence (erased PII) is distinguished from defense in writing
  at the call site — the fallback to '' is a documented modeling decision,
  not a just-in-case guard, exactly the discipline that separates
  absence-modeling from internal defense.

### On the Sin of Entangled Nouns

- api/types.ts:1173
  The Article made code: a join table holding ONLY the identities of the
  joined and the moment of union — its header comment (types.ts:1167-1168)
  reads "The covenant binding an identity to an organization, with the moment
  of union," echoing the scripture word for word. And members itself refuses
  the weld: "one profile, many memberships" — no organization_id column on
  the entity.
- api/types.ts:1145
  The codebase cites the section's own prophet by name: per-field transition
  values are pinned to their parent event in their OWN relation rather than as
  columns on the event row — Codd's normalization principles honored
  explicitly, in writing.
- api/types.ts:1136
  "Declare relationships in join tables" obeyed exactly: the flow↔Record
  binding lives in flow_records with the moment of union, and FlowEntity
  carries NO record_id column. project_flows, flow_work_orders, and
  idea_submissions (types.ts:1196-1201 — the submitter as a join row, never
  a column on ideas) follow the identical pure shape.
- api/store-parent-scoped.ts:19
  The unentangled design proven viable inside this very architecture:
  junctions and ledgers refuse a stamped organization_id and the owning org is
  DERIVED from the relation at read time (viaParent, viaMembership,
  ownerOrgOfEntity) — dissolving the performance plea the section already
  rebuts ("Both designs are O(n)").

### On the Sin of Inheritance

- api/store-org-scoped.ts:32
  The decorator the section dreams of: the org fence extends EntityStore
  behavior with zero inheritance. It implements the contract and delegates to
  a composed #inner whose required capabilities are named as a type
  intersection — binding by capability, literally. Its own comment calls it
  'An EntityStore decorator', and the parent-scoped sibling
  (store-parent-scoped.ts:31, :204) repeats the pattern.
- api/db-backed.ts:100
  Where a lesser design would have an abstract base with three overriding
  subclasses ('a base class with three subclasses, each overriding most of
  it'), the per-tier variation here rides entirely in constructor-injected
  capabilities — backend, latency shim, open hook. One concrete class, one
  interface, all variation composed. The header comment even cites Commandment
  IX: the third backend triggered the abstraction.
- api/api.ts:102
  The one righteous use of extends — the platform's throwable extension
  point — wielded consciously: the comment is explicit Liskov reasoning ('so
  catch sites matching instanceof Error still see it' — the subtype honoring
  every promise the parent made). All 12 Error subclasses in the repo are
  single-level, set this.name, and add typed context fields; no error inherits
  from another error.
- api/store-history-entity.ts:16
  HistoryEntityStore shares most of EntityStore's shape and could have been a
  tempting subclass; instead it is a sibling by contract — implementing the
  same interfaces with its own divergent semantics (no tombstone reads).
  Lineage refused exactly where it would have lied: a history store
  substituted for an entity store would not honor the tombstone-filtering
  promise.

### On the Sin of Coupling

- web-app/app/adapters/broadcast-channel.ts:1
  A self-declared divorce point, and the declaration is true: repo-wide grep
  finds BroadcastChannel nowhere else. 'The thinnest adapter is not ceremony
  — it is the DIVORCE POINT' made literal, with the Node-vs-browser seam
  handled inside the wall.
- api/backend-indexeddb.ts:13
  The entire IndexedDB API is confined behind the StorageBackend seam —
  verified by an exhaustive grep returning zero IDB references outside the
  backend files. Memory and localStorage tiers substitute cleanly behind the
  same interface.
- web-app/app/adapters/shared.ts:119
  The single sanctioned wrap of the api transport: every data adapter speaks
  only ctx.GET/PUT/DELETE/POST, and an exhaustive grep confirms no other
  adapter imports the standalone transport functions — the contract in
  ARCHITECTURE.md § Adapter Conventions holds in the code.
- web-app/app/zip.ts:39
  An owned in-browser ZIP reader/writer — own CRC-32, own central directory,
  ZIP-bomb limits — built on the platform's DecompressionStream instead of
  importing a JSZip-class library. 'We choose platform primitives over
  third-party abstractions' with the format spoken in the app's own voice.
- package.json:1
  Zero dependencies, runtime or dev — nothing to weld the hull to. The
  Mermaid format (mermaid-parse.ts/mermaid-generate.ts) and self-hosted woff2
  fonts complete the picture: no external code or asset crosses into the
  shipped bundle.
- web-app/app/adapters/media-query.ts:12
  A single-primitive shim composed from another shim (subscribeEventListener
  pairs add with remove) — 'others wrap a single primitive against the day
  it evolves. Both are sacred.' matchMedia is named nowhere else in the app.

### On the Sin of Swallowed Failures

- web-app/app/adapters/preferences.ts:25
  Names the one expected failure (quota), warn-logs it, returns a boolean so
  the caller can surface user-initiated failures, and RETHROWS everything else
  — 'Distinguish expected failures from bugs' made flesh; nothing is
  swallowed.
- web-app/app/adapters/invitations.ts:124
  Narrows to the two named expected statuses, converts them into typed domain
  outcomes the caller must branch on, and rethrows every genuine fault — the
  exact narrow form the Finding-1 sites abandoned.
- web-app/auth/index.ts:544
  The comment states the doctrine's own fault-vs-expected-failure distinction,
  then degrades visibly: evidence logged, button restored, toast shown — no
  failure pretends to be a wrong password.
- web-app/snapshots/index.ts:128
  When a seed fails after the wipe, the half-state is proclaimed to the user
  by name ('Database is empty —') rather than concealed — 'degrade visibly
  rather than corrupt silently' at its loudest.
- web-app/app/core.ts:280
  Boot narrows the single recoverable failure class to the recovery page and
  treats every other init fault as 'a genuine dead-end' rendered by
  handleDatabaseError — halting IS graceful when the alternative is silent
  corruption.
- validate:2
  All four repo-root scripts (build, test, validate, serve) open with set -euo
  pipefail and contain zero '|| true' or '2>/dev/null' suppressions — the
  shell tier lets every failure crash the run.

### On the Sin of the Greedy Catch

- web-app/app/adapters/shared.ts:190
  withAuthRecovery is the doctrine made code: one try, one call, one error it
  can name and meaningfully handle (a 401 drives one refresh + retry); every
  other fault 'surfaces untouched' per its own header comment. Even the retry
  has its own separate named catch (line 202).
- web-app/app/adapters/authentication.ts:39
  loginViaPassword makes two grant calls (authorize, then token) and gives
  EACH its own try with its own named UnauthorizedError catch — 'Five calls
  speak five covenants' honored with two. A DB/crypto fault surfaces; only the
  named 401 becomes 'no session'.
- api/backend-localstorage.ts:136
  #load gives decompression and JSON.parse separate single-call trys, each
  rethrowing with the exact step and table name attached — 'Enrich errors at
  each boundary layer... until the failure surfaces with its full story.' You
  can always name which call failed.
- web-app/app/adapters/preferences.ts:22
  writePreference names exactly the one expected fault (quota), logs it at
  warn, and reports it via the boolean return; every unexpected fault
  rethrows. The expected-failure/bug distinction the scripture demands, in
  nine lines.
- api/api.ts:1651
  loadInvitation is the textbook form — one try, one call, one named error
  converted to the domain's null, all else surfacing. The same shape recurs in
  db-org-scoped.ts:113, store-org-scoped.ts:108, store-parent-scoped.ts:114
  and 180, and authentication.ts:78 — one codebase, one voice.
- web-app/app/flow-operations.ts:222
  Eight flow operations (performAddEdge through
  performUpdateAttributeRequired) each wrap exactly ONE commitFlowMutation
  call in their try, log the specific operation that failed, and return a
  typed failOp the UI renders — disciplined single-covenant catches at scale
  (contrast performUndo/performRedo in the same file).

### On the Sin of Asking, Not Telling

- web-app/app/page-loader.ts:16
  Boot tells the page module to serve — one registry dispatch, then `await
  mod.init(getUrlParams())` (line 22). No caller interrogates a page module's
  internals or demands it prove itself; every page is infinitely substitutable
  behind one contract. 'Through this discipline we achieve polymorphism.'
- web-app/app/adapters/broadcast-channel.ts:39
  After a commit, the result is PASSED to communicating sequential processes
  — other tabs' subscribers — exactly as the section demands: 'passing
  results to communicating sequential processes, not back to the call site.'
  The poster is never echoed; nobody asks whether other tabs refreshed.
- web-app/app/adapters/invitations.ts:138
  A verb-method done right: returns void, tells the API to accept (the server
  derives the membership org from the invitation itself — the caller never
  interrogates the invitation and assembles state), then notifies observers so
  the result flows onward, never back to the call site.
- web-app/app/state.ts:96
  getThemeIcon keeps the decision with the module that owns the state: callers
  (theme-toggle.ts:18) say 'give me the icon' instead of interrogating
  state.theme and choosing themselves — 'We tell our objects what we need.
  We do not interrogate their state.' The raw state object is never exported.
- web-app/app/core.ts:209
  The pure planner emits a decision MESSAGE; the imperative shell dispatches
  it at exactly one site (bootAuthGate). Interrogation of the union is
  centralized into dispatch rather than scattered — the tell-style use of a
  discriminated union, mirrored by the FSM reducer owning all 16 of its
  kind-checks in flow-fsm-reduce.ts.
- web-app/app/presenters/member.ts:253
  The heterogeneous member union is split ONCE via named guards (defined once
  in api/types.ts:942/948), each member wrapped in its kind's row presenter,
  which is then told to render — polymorphism achieved, internals #-private
  so sovereignty is compiler-enforced. 'We do not demand they prove themselves
  before we allow them to serve.'

### On the Sin of Polling

- web-app/app/adapters/broadcast-channel.ts:39
  The anti-polling spine of the whole app: a successful readwrite commit POSTS
  the touched table names over BroadcastChannel and other tabs subscribe
  (subscribeTablesChanged, line 48) — no tab ever polls IndexedDB for
  changes. 'A system of cells communicating through messages does not poll —
  the message arrives or it does not.' Bonus righteousness: the poster is
  never echoed, so the originating tab never double-refreshes, and the whole
  primitive lives behind a divorce-point adapter.
- web-app/app/channels.ts:50
  createSubscriptionChannel composes the cross-tab message into a page-level
  pub-sub: pages declare which tables they watch and are TOLD when an
  overlapping commit lands. Subscribe. Listen. Be notified — the Observer
  pattern as the page-refresh mechanism, with zero timers anywhere in the data
  path.
- web-app/app/invitations-indicator.ts:28
  The top-bar pending-invitations bell — literally a bell — updates by
  observing the invitation change channel, never by re-fetching on a timer.
  Its own header comment cites the doctrine: 'It OBSERVES the invitation
  change channel... (the Observer article — trust the bell).' Scripture
  honored knowingly, by name.
- web-app/app/state.ts:179
  Cross-tab theme/sidebar sync arrives via StorageEvent subscription (and OS
  dark-mode flips via subscribeMediaQuery at line 170) — the tab is informed
  of state changes rather than re-reading localStorage or matchMedia on any
  cadence. The devout do not pace the hallway.
- api/backend-indexeddb.ts:284
  Transaction durability is awaited through the platform's own events —
  oncomplete (line 284), onabort (290), onerror (299) — and even
  schema-version eviction is message-driven: 'db.onversionchange = () =>
  db.close();' (line 238). The storage seam never spins or sleeps waiting for
  commit; it waits for IndexedDB to tell it.
- web-app/app/drag-reorder.ts:254
  Newly rendered cards become draggable when the DOM announces a childList
  mutation — a MutationObserver where a lesser hand would have re-scanned
  the container on a timer. The same righteous wrapping appears in
  adapters/resize-observer.ts:5 (ResizeObserver) and
  adapters/media-query.ts:11 (matchMedia 'change'), each behind its own thin
  adapter.

### On the Sin of Scattered Context

- web-app/app/adapters/shared.ts:103
  The vessel made flesh: trace, verified identity, and the four HTTP verbs in
  one bag, with the DbAdapter and bearer token sealed inside the closure. The
  entire page tier speaks ctx and never touches storage handles or credentials
  — the baton carries the fragments so the runners never have to gather
  them.
- web-app/app/adapters/shared.ts:330
  A gift of the ancestors read straight from the vessel's verified claim —
  no scattered org parameter threaded through page code — and an impossible
  state crashes rather than inventing a default. 'Every mainline method
  receives the context filled with the gifts of its ancestors.'
- api/api.ts:1716
  The Office of the Context honored even without a vessel object: the org is
  resolved exactly once, in exactly one place, then shared by authorization
  and woven into orgScopedAdapter so no downstream step can revisit or
  re-derive it. Authentication resolves the identity once per dispatch branch;
  no step redoes another's work.
- web-app/app/flow-operations.ts:163
  The business-logic layer receives the baton whole from its caller and never
  mints its own — context first, participants after, exactly the relay the
  section demands.
- web-app/workbox/index.ts:190
  The workbox page mints ONE vessel at entry (index.ts:71) and passes it whole
  into both list initializers — one gesture, one context, fanned across
  every loader. The counter-pattern to the mid-relay re-minting cited in the
  findings.

### On the Sin of Noun-First Thinking

- web-app/app/flow-operations.ts:163
  "Name the action. Parameterize the participants." The process owns
  everything — a verb-named operation receives context and snapshot as
  participants, validates, commits via commitFlowMutation, and returns a typed
  OpResult. The nouns are infinitely substitutable; the process is stable.
- api/store-state.ts:91
  "You understand the data model BY understanding the processes." The states
  ledger inverts noun-first design: no entity carries a status column; an
  entity's lifecycle IS the latest event currentForIn derives from the
  append-only process trace. The data model is literally derived from the
  recorded process.
- api/ledger-reduction.ts:12
  A reducer process parameterized over substitutable participants — any row
  bearing `at` may participate, with key and comparison passed in. The
  pounder.pound(poundable, nailable) shape: the process owns the reduction;
  the row types vary freely beneath it.
- web-app/app/presenters/record-list.ts:77
  The righteous half of the records surface: the render process (an -er)
  receives the shaped RecordModel facet as participant — the raw storage row
  never enters. The contrast with RecordDetailView two files away shows the
  codebase knows the way.

### On the Sin of Obscurity

- api/ledger-reduction.ts:1
  The header rebuilds the entire theory — what the reduction is, who
  decides, and WHY the tiebreak defaults secure — before a single line of
  code. Naur's 'programming is theory building' made literal.
- api/crypto-safe-base62.ts:1
  A subtle cryptographic correctness argument (modulo bias) that no reader
  could re-derive from the loop alone is stated in three lines, with
  UNBIASED_CEILING named to match. The inscription on what would otherwise be
  a tomb.
- web-app/app/zip.ts:34
  Binary-protocol code is where theory dies first; here the opaque constant
  carries its provenance, its RFC citation, and the derivation from the
  canonical polynomial — the next reader can verify rather than trust.
- api/access-token.ts:86
  The security spine narrates its own threat model, what is frozen versus what
  the server tier relocates, and the deployment constraint in capitals — the
  understanding is shipped with the artifact, exactly as the section demands.
- web-app/app/flow-layout.ts:703
  A Sugiyama-style layout engine — the densest math in the repo — explains
  not just what each pass does but why median beats mean, letting a reader six
  months hence rebuild the design decision, not merely the mechanics.
- web-app/app/flow-interactions.ts:20
  The code refuses an obscure sentinel (magic 0) in favor of a discriminated
  union whose variants name the theory — and the comment records the refusal
  so the pattern teaches the next reader.

### On the Sin of Cleverness

- web-app/app/zip.ts:40
  Unavoidably bitwise CRC code handled with maximal clarity: the opaque
  polynomial is a named constant, the RFC is cited, and a second comment
  explains why the table-driven form exists. Clarity under pressure, exactly
  as the section demands.
- api/password-hash.ts:88
  The one XOR/OR-accumulate trick in the repo is justified, named, and its why
  (timing side channel) is written down — the disciplined form of necessary
  cleverness.
- web-app/app/mermaid-parse.ts:76
  A genuinely hairy parser regex decomposed line-by-line under a
  plain-language comment, with every shape regex a named constant
  (DOUBLE_CIRCLE_RE, STADIUM_RE, RECT_RE) — regex pressure resolved into
  readability, not golf.
- web-app/app/duration-units.ts:14
  A compact-duration formatter is the classic nested-ternary trap; this one is
  a declarative table plus a plain loop. The concision is in the data, not in
  tricks.
- web-app/app/flow-layout.ts:55
  Crossing-count in the Sugiyama layout written as a transparent O(n²) double
  loop with a named helper (arePairsInverted) instead of a clever
  merge-sort/BIT counter — the humble route chosen where cleverness usually
  breeds.
- api/api.ts:415
  The routing core explicitly refuses the clever route — 'closed and
  enumerated — no reflection' — an anti-cleverness vow written into the
  code itself.

### On the Sin of Magical Values

- web-app/app/zip.ts:40
  Names the scripture's own example of the opaque sin — 0xEDB88320 — with
  full RFC 1952 provenance; the file also names LOCAL_SIG/CENTRAL_SIG/END_SIG
  (the file magic bytes the scripture indicts), header sizes,
  MAX_ZIP_COMMENT_LEN, and DEFAULT_ZIP_LIMITS with a calibration comment
  explaining why each limit is what it is.
- api/types.ts:1044
  The scripture's other verbatim example — 28800 seconds — never appears
  as a numeral in app code: it is spoken as arithmetic (8 × SECONDS_PER_HOUR)
  under a name that says both role and default-ness, and every
  mock-data/adapter site imports the name.
- web-app/app/flow-graph.ts:110
  The flow renderer names ~40 geometry numerals exhaustively — GRID_CELL,
  BIDI_SPREAD_FRAC, CURVE_TENSION, HIT_TARGET_WIDTH, CYCLE_DASH — exactly
  the 'sizing constants like 16 or 28' class the scripture says must be given
  names; the theory of the canvas is fully spoken in its constant block.
- api/crypto-safe-base62.ts:10
  The modulo-bias rejection threshold — a numeral most codebases bury as 248
  — is DERIVED in code from named parts, so the narrative gap the scripture
  warns of ('a piece of the theory left unspoken') simply does not exist.
- web-app/app/toast.ts:6
  Not only named with units, but the comment binds the TS constant to its CSS
  twin (var(--duration-slow)) — naming the cross-layer coupling that a bare
  300 would have left as a trap.
- api/password-hash.ts:30
  Every security-sensitive crypto numeral is named with its unit in the name
  (BYTES, BITS, ITERATIONS); the auth spine continues the discipline with
  ACCESS_TTL_SECONDS = 15 * 60 and REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60
  (api/authentication.ts:64-65) — self-disclosing arithmetic instead of 900
  and 2592000.

### On the Sin of Deep Nesting

- test:8
  The repository's ONLY nested test directory exists for a functional reason
  (a fixed-offset timezone partition) and announces that reason at its
  consumer, the ./test script. 189 test files otherwise sit flat at one level.
  This honors "The Unix way is to make structure visible — not to bury it
  beneath ceremony": the one secret is no secret.
- web-app/app/page-registry.ts:23
  One directory per page at depth two, with PAGE_REGISTRY declaring the
  source-to-output mapping so the file you edit is the file the browser loads.
  No taxonomy layer stands between source and serving path — "Deep nesting
  hides the domain. Flat is faithful."
- CLAUDE.md:214
  The top level reads as the app — api/, web-app/, tests/, and the
  build/serve/test/validate scripts — honoring "the top level of a project
  should give you a rough idea of what type of app it is" (Article: We believe
  in shallow structure). Measured this run: the deepest tracked path in the
  entire repository is four segments (web-app/app/presenters/*.ts), below the
  condemned "directory five levels deep."

### On the Sin of Foreign Tongues

- api/types.ts:1523
  The Project domain class performs the full vocabulary divorce my section
  demands: the snake_case row enters the constructor and dies there; camelCase
  accessors and behavior (timelineProgress, isApproved) exit. What enters
  speaks one tongue; what exits speaks another — performed, not just
  claimed.
- web-app/app/adapters/invitations.ts:43
  The invitations adapter is the divorce point done whole: the snake_case
  InviteeRow/SentRow shapes are private interfaces that never escape the file,
  the exported domain types speak camelCase, and the consuming presenter
  (invitation-list.ts) contains zero snake_case accesses. The seam holds in
  both structure and vocabulary.
- ARCHITECTURE.md:467
  The contract of record codifies an explicit anti-foreign-tongue rule:
  storage taxonomy ('Entity') is barred from the adapter's exported vocabulary
  by convention. The scripture's first sinful practice — framework taxonomy
  leaking through the wall — is named and forbidden in the repo's own law.
- web-app/app/adapters/preferences.ts:3
  The storage primitive renamed to its role: localStorage is spoken only
  inside the shim, and the app's tongue is 'preference' — the exact inverse
  of the redisClient-in-business-logic sin. Likewise
  adapters/broadcast-channel.ts contains BroadcastChannel entirely, exporting
  postTablesChanged/subscribeTablesChanged.

### The Office of Format

- validate:8
  The Office made executable: ./validate hard-fails on any line over 78 across
  every .ts/.html/.css and root .md — 'When the formatter has spoken, obey
  the formatter,' and this repo built the formatter into its gate. Re-ran the
  identical pass this run: zero violations on the covered surface.
- web-app/app/compose.ts:1
  compose.ts is excluded from the lint by name, yet its measured max line is
  73 chars and its indentation is uniformly four-space — obedience without
  compulsion; the one file the formatter excuses still keeps the breath.
- TEST-PLAN.md:1
  2,637 lines exempted from the 78-char wrap by the contract of record
  (CLAUDE.md documents the rationale: each test bullet scans as one
  self-contained line), yet it carries zero trailing whitespace, zero tabs,
  and a single final newline — the exemption taken narrowly, every other
  clause of the Office kept.

### The Office of the Commit

- build:38
  The commit-before-build covenant enforced in tooling, not left to
  discipline: "Locally, commit before you build — the artifact is the
  product of state, and state must be saved. A build from uncommitted state
  cannot be traced, reproduced, verified, or trusted." The gate makes the
  untraceable build impossible.
- CLAUDE.md:20
  The contract of record preaches the same covenant the build script enforces
  — doctrine written into the repo-root contract, with CLAUDE.md:402
  ('Commit completed, tested work. Do not ask.') encoding ABC — always be
  committing — as standing instruction.
- git:b0690b75:1
  A textbook observance of "Never move or rename and change content in the
  same commit": the file move lands first (renames plus only the import-path
  edits the build covenant forces), then nine minutes later the content rename
  lands as a pure-modification commit with zero renames — each diff readable
  as exactly one thing.
- git:a1c603a6:1
  The living practice honors the Office's core: "ABC — always be
  committing!" at ~25 commits per active day; every subject completes "When
  applied, this commit will ___" (zero mood violations across the entire
  history); no broken-work markers ever pushed to the consecrated ground; no
  observed force-push.

### The Office of Time

- api/types.ts:415
  The canonical mint: RFC-3339, zulu, the fullest resolution the environment
  provides, padded to one schema-documented width so lexical order stays
  chronologic — the Office's persistence rule made into a single named
  source of truth used at 61 sites.
- api/validators.ts:566
  validateTimestampField enforces the unambiguous zulu shape at the gate for
  every ledger `at` (19 call sites), rejecting date-only and zoned-offset
  stamps that Date.parse would wave through, then backstops with Date.parse
  against impossible dates — validation at the edge, in the Office's own
  vocabulary.
- web-app/app/format.ts:26
  Render to local time for display and display alone, honored precisely:
  instants render local; calendar dates (formatDate vs formatCalendarDate,
  lines 38-52) are pinned zone-neutral so a project day never drifts across
  zones — the instant/calendar distinction articulated and kept in the
  display layer only.
- tests/tz/format-local.test.ts:15
  A dedicated suite run under TZ=Pacific/Honolulu proves instants render in
  LOCAL time and calendar dates stay zone-neutral — with a zone-guard test
  that fails loudly if invoked in the wrong zone instead of asserting
  nonsense. The main suite's TZ=UTC blind spot, named and closed.
- tests/mock-data-valid.test.ts:111
  Pins every seeded ledger (states, both score ledgers) to the canonical
  6-digit zulu width, explicitly to protect the lexicographic=chronologic
  invariant — the width covenant tested, not assumed.
- web-app/app/credential-resolution.ts:20
  The expiry decision takes `now` as a parameter instead of reading the wall
  clock — time as an explicit input, never ambient localtime inside business
  logic; the decision is testable at any instant.

### The Office of the Context

- web-app/app/adapters/shared.ts:103
  The vessel's fields are typed readonly and set exactly once at creation; the
  exhaustive mutation hunt (...ctx spreads, field reassignment) found zero
  violations across the repo — 'The attributes immutable even as the vessel
  itself is enriched' is held in code, by the type system.
- api/api.ts:1716
  The main gate resolves the org in exactly one place per request and shares
  the one resolution with authorization and the org-scoped adapter — 'Each
  field of the context is set exactly once, in exactly one place' both
  practiced and preached in the comment.
- web-app/projects/detail.ts:205
  One vessel minted per user operation and passed whole through every adapter
  handoff — the baton passed whole, never dismembered and reassembled; the
  102 sessionContext() sites repo-wide follow this same shape, and the
  transport-bypass hunt confirmed adapters never import the raw api verbs
  around the vessel.
- web-app/app/adapters/shared.ts:330
  Reads the resolved identity field from the vessel rather than re-parsing the
  token, and crashes on the impossible state instead of inventing a default
  — no step revisits authentication's work, and an impossible state is
  treated as a bug that must crash, not a gap to paper over.

### The Office of Verification

- test:10
  The runner itself names the scripture's false prophet ('a false prophet on a
  non-UTC machine') and eliminates it by pinning TZ=UTC for the main suite,
  then deliberately re-running the time-rendering covenant under a fixed
  UTC-10 zone — determinism engineered at the suite boundary.
- tests/tz/format-local.test.ts:14
  A guard test that makes the suite's environmental precondition itself
  falsifiable — per its comment, 'a stray invocation fails loudly instead of
  asserting nonsense.' The exact inverse of a comfort object: it exists so the
  other tests CAN meaningfully fail.
- tests/api-org-isolation.test.ts:322
  Asserts the foreign-org row exists in storage BEFORE asserting its exclusion
  from the response, so an empty seed can never produce a vacuous pass — the
  test is engineered to be able to fail. It also drives the full HTTP facade
  (handleRequest + real tokens): behavior at the highest level, never the
  sausage.
- tests/sp6-org-switch-e2e.test.ts:43
  End-to-end of the browser's boot→token-exchange→org-fenced-read flow
  through the real API spine, asserting only observable outputs (which ideas
  each token sees) — 'we test at the highest level possible,' granting
  maximum freedom to refactor everything beneath.
- tests/token-fixtures.ts:7
  Fixture design that pre-empts the intermittent false prophet: fixed iat plus
  enormous TTL makes token verification independent of the machine's wall
  clock, so no test inherits a time-of-day failure mode.
- tests/mock-data-valid.test.ts:78
  Every per-row validator loop is paired with a generated non-empty seed
  assertion over the same table, so a regression to an empty table fails the
  suite rather than letting the row-validation loop pass vacuously.
- tests/adapter-parity.test.ts:63
  Runs one behavioral scenario against two storage implementations and asserts
  only the outputs agree — 'test that the input produces the correct output
  but never test how the sausage is made,' made literal across backends. Zero
  lifecycle hooks anywhere in the suite (grep: 0 hits) reinforce 'each test is
  an isolated world': every test builds its own db, ctx, and stubs inline.

### The Office of the Interface

- web-app/app/dialog.ts:199
  initTabs implements the complete WAI-ARIA tabs pattern —
  role=tab/tablist/tabpanel, aria-selected, roving tabindex,
  ArrowLeft/Right/Home/End — keyboard navigation built in as a gate of
  entry, not bolted on.
- web-app/app/command-palette.ts:619
  The command palette is a full ARIA combobox: listbox/option roles,
  aria-activedescendant, aria-posinset/setsize, aria-modal, and a polite
  live-region result count (lines 676-678) — screen-reader affordance as a
  precondition.
- web-app/app/styles/responsive.css:81
  Universal reduced-motion reset, and base.css:144-150 extends it into the
  ::view-transition pseudo tree the universal selector cannot reach —
  DESIGN-SYSTEM.md Motion Principle 4 honored completely.
- web-app/app/components-layout.html:47
  Skip link targeting <main id="main-content" tabindex="-1"> on every composed
  page — keyboard users enter through the front door.
- web-app/app/toast.ts:29
  Toasts announce via a polite atomic live region, each toast carries
  role=status and an aria-labeled Dismiss button — the exit visible, the
  announcement automatic.
- web-app/app/core.ts:296
  The first interaction succeeds by design: a pristine database routes any
  page to the auth-exempt Snapshots page, whose 'Load mock data' button seeds
  two orgs and reveals one-time sign-in credentials with a copy-all and a
  Continue button (snapshots/index.ts:151-196) — defaults that work, no
  configuration before first use.
- build:4
  The build CLI is a model interface: --help with examples, every argument
  optional with working defaults (~/Desktop/), and unknown arguments answered
  with the usage text — Hello-World-grade first interaction.
- web-app/app/dialog.ts:52
  Every dialog honors Escape (routed through the cancel button when present),
  closes on backdrop click, and restores the opener's focus on close — the
  escape hatch is part of the welcome.

### The Office of Commentary

- api/api.ts:134
  Pure why at a security contract boundary: ordering rationale, threat model,
  and an explicit 'any addition here is security-sensitive' warning — the
  contract itself, not commentary on it.
- web-app/app/database-init.ts:15
  The one place a stricture (CSS-first) genuinely cannot apply, and the
  comment states the why at the site — the sanctioned exception CLAUDE.md
  codifies, not an annotation around the rule.
- web-app/app/adapters/state-events.ts:79
  Explains why apparently-redundant code stays — pre-empting a wrong
  'cleanup' — the exact why-never-what the office prescribes.
- api/backend-indexeddb.ts:55
  Boundary doc naming the gap the wrapper closes and why the sibling guard
  cannot — dense why with zero restatement of the code below it.
- web-app/app/styles/pages-flow-stats.css:121
  CSS comment explaining a non-obvious platform mechanism (context-stroke) and
  the design intent it buys — why, in a layer where what-comments usually
  breed.
- web-app/organization/index.html:4
  HTML comment that states the fragment's behavioral contract (admin-only, why
  hidden) instead of restating the markup — the counter-example to the
  label-comment pattern finding.

## Section-coverage roster

One row per enumerated section. TRUNCATED means the hunter set its honesty
bit: at least one hunt was sampled rather than exhaustive, or context ran
short. An absent row would be an un-run hunt; there are none.

01 TRUNCATED hunts:15 (12e/3s) find: 5 exem: 7  I. Reliability
02 OK        hunts:10 (8e/2s) find: 8 exem: 7  II. Security
03 TRUNCATED hunts:26 (21e/5s) find: 7 exem: 6  III. Uniformity
04 TRUNCATED hunts:25 (18e/7s) find: 4 exem: 5  IV. Logic
05 TRUNCATED hunts:23 (18e/5s) find: 4 exem: 5  V. Clarity
06 OK        hunts:16 (14e/2s) find: 2 exem: 6  VI. Immutability
07 TRUNCATED hunts:14 (12e/2s) find: 2 exem: 7  VII. Idempotency
08 TRUNCATED hunts:19 (17e/2s) find: 7 exem: 4  VIII. Simplicity
09 TRUNCATED hunts:26 (22e/4s) find: 9 exem: 6  IX. Generality
10 TRUNCATED hunts:11 (9e/2s) find: 3 exem: 7  X. Atomicity
11 OK        hunts:17 (16e/1s) find: 1 exem: 7  XI. Efficiency
12 TRUNCATED hunts:18 (17e/1s) find: 4 exem: 5  XII. Performance
13 TRUNCATED hunts:14 (13e/1s) find: 6 exem: 6  We believe in the S.O.L. […]
14 OK        hunts:15 (15e/0s) find: 5 exem: 5  We believe in telling, n […]
15 OK        hunts:13 (13e/0s) find: 6 exem: 6  Relationships between en […]
16 OK        hunts:14 (14e/0s) find: 4 exem: 7  We believe in being info […]
17 TRUNCATED hunts:17 (14e/3s) find: 7 exem:10  We validate at every edge
18 OK        hunts:10 (9e/1s) find: 4 exem: 8  We handle failure with grace
19 OK        hunts:16 (16e/0s) find: 3 exem: 7  We choose platform primitives
20 OK        hunts:14 (13e/1s) find: 3 exem: 8  We measure before we optimize
21 TRUNCATED hunts:11 (10e/1s) find: 3 exem: 7  We derive from the ledger
22 OK        hunts:15 (15e/0s) find: 4 exem: 5  Messaging first, state s […]
23 TRUNCATED hunts:13 (12e/1s) find: 7 exem: 6  Context as the single vessel
24 OK        hunts:12 (11e/1s) find: 0 exem: 6  Process first, noun second
25 OK        hunts: 8 (8e/0s) find: 2 exem: 5  Composition over inheritance
26 OK        hunts:21 (21e/0s) find: 5 exem: 5  Insulation through adapters
27 OK        hunts:15 (15e/0s) find: 6 exem: 5  We speak our own idiom
28 OK        hunts:10 (9e/1s) find: 0 exem: 4  We believe in shallow structure
29 OK        hunts: 8 (8e/0s) find: 2 exem: 5  Every operation is an HTT […]
30 OK        hunts:16 (16e/0s) find: 2 exem: 5  Communicating sequential […]
31 OK        hunts:13 (12e/1s) find: 2 exem: 6  We acknowledge the cost  […]
32 OK        hunts:16 (16e/0s) find: 2 exem: 6  On the Sin of Premature  […]
33 OK        hunts:15 (15e/0s) find: 3 exem: 7  On the Sin of the Cache
34 TRUNCATED hunts: 9 (6e/3s) find: 3 exem: 4  On the Sin of Premature G […]
35 TRUNCATED hunts:15 (10e/5s) find: 2 exem: 4  On the Sin of Shared Mut […]
36 TRUNCATED hunts:16 (14e/2s) find: 2 exem: 6  On the Sin of Global State
37 TRUNCATED hunts:14 (11e/3s) find: 8 exem: 7  On the Sin of Null
38 OK        hunts:14 (14e/0s) find: 4 exem: 6  On the Sin of Default Values
39 TRUNCATED hunts:13 (10e/3s) find: 6 exem: 5  On the Sin of Internal Defense
40 OK        hunts: 9 (9e/0s) find: 4 exem: 4  On the Sin of Entangled Nouns
41 OK        hunts:11 (11e/0s) find: 2 exem: 4  On the Sin of Inheritance
42 OK        hunts:23 (23e/0s) find: 4 exem: 6  On the Sin of Coupling
43 OK        hunts:10 (9e/1s) find: 2 exem: 6  On the Sin of Swallowed F […]
44 OK        hunts: 7 (7e/0s) find: 5 exem: 6  On the Sin of the Greedy Catch
45 OK        hunts:17 (16e/1s) find: 1 exem: 6  On the Sin of Asking, No […]
46 OK        hunts:15 (15e/0s) find: 1 exem: 6  On the Sin of Polling
47 OK        hunts:11 (11e/0s) find: 4 exem: 5  On the Sin of Scattered  […]
48 TRUNCATED hunts:14 (12e/2s) find: 2 exem: 4  On the Sin of Noun-First […]
49 TRUNCATED hunts:17 (15e/2s) find: 3 exem: 6  On the Sin of Obscurity
50 OK        hunts:30 (29e/1s) find: 4 exem: 6  On the Sin of Cleverness
51 OK        hunts:17 (17e/0s) find: 6 exem: 6  On the Sin of Magical Values
52 OK        hunts:10 (8e/2s) find: 1 exem: 3  On the Sin of Deep Nesting
53 OK        hunts:17 (17e/0s) find: 4 exem: 4  On the Sin of Foreign Tongues
54 OK        hunts:11 (10e/1s) find: 3 exem: 3  The Office of Format
55 OK        hunts:16 (16e/0s) find: 5 exem: 4  The Office of the Commit
56 OK        hunts:20 (20e/0s) find: 2 exem: 6  The Office of Time
57 TRUNCATED hunts:18 (17e/1s) find: 6 exem: 4  The Office of the Context
58 TRUNCATED hunts:15 (12e/3s) find: 1 exem: 7  The Office of Verification
59 TRUNCATED hunts:20 (16e/4s) find:14 exem: 8  The Office of the Interface
60 TRUNCATED hunts:14 (12e/2s) find: 5 exem: 6  The Office of Commentary

## Refutation ledger

14 findings were REFUTED; 0 DISPUTED. Each entry carries the evidence that
killed it. Refuted findings remain visible in the findings ledger above.

### [X] [We believe in the S.O.L.I.D. principles] api/backend-localstora […]

LocalStorageBackend substitutes for StorageBackend but its simulated
transaction cannot keep the atomic-commit promise under a mid-flush quota
error — the multi-key flush is not OS-atomic, as the file itself confesses
(lines 79-81)

- evidence: The finding charges an LSP breach plus a Commandment X violation;
  both fail against the contract and the call graph, re-read this run. (1) The
  supertype promise is tiered by its own text: api/db.ts:162-168 documents the
  Tx handle as "the real primitive Phase B fulfills with a native IndexedDB
  transaction; memory + localStorage simulate it transitionally (buffer
  touched tables, flush on success, discard on throw)."
  LocalStorageBackend.transaction (api/backend-localstorage.ts:82-103)
  delivers exactly that promised behavior — logic-error rollback via skipped
  flush. Liskov is violated only when a subtype breaks a promise the parent
  made; OS-atomicity was never promised for this tier, and the gap is declared
  at the contract (api/db.ts), at the implementation
  (backend-localstorage.ts:74-81), and in CLAUDE.md ("the one gap IndexedDB
  closes"). (2) Commandment X says wrap the indivisible operation in the
  transactional primitive your platform provides — and the codebase does:
  the runtime tier api/backend-indexeddb.ts:272-317 wraps every store op in a
  genuine IDBTransaction (commits on oncomplete, aborts on a thrown body), and
  the web app composition root web-app/app/adapters/init.ts:3 imports ONLY
  api/db-indexeddb.ts. localStorage the platform offers no transactional
  primitive at all; the codebase's response was the one the commandment
  prescribes — move the runtime to the tier that has one (Phase B, shipped).
  (3) The cited failure mode is unreachable on any executing path: every
  construction site of LocalStorageBackend/LocalStorageDbAdapter is in tests/
  (Node runner), where globalThis.localStorage is an in-memory Map shim
  (tests/adapter-parity.test.ts:21 installLocalStorageShim;
  tests/backend-tx-localstorage.test.ts) that never throws QuotaExceededError.
  Even if reached, #store (backend-localstorage.ts:186-205) enriches and
  surfaces the quota error — visible degradation, not silent corruption. A
  documented, contract-carved-out limitation of a test-only tier, with the
  platform primitive adopted at runtime, is the completed migration the
  commandment demands, not a sin against it.
- measurement:

      $ grep -rn "new LocalStorageBackend\|new LocalStorageDbAdapter" -- […]
      → 39 hits in tests/*.test.ts (backend-tx-localstorage, snapshot- […]
      $ grep -rn "from.*db-indexeddb\|from.*db-localstorage" web-app --i […]
      → web-app/app/adapters/init.ts:3: } from '../../../api/db-indexe […]
      The browser runtime never loads the localStorage tier; the only ex […]

### [VIII] [We believe in the S.O.L.I.D. principles] api/db-backed.ts:263

The transaction view returned by #viewForTx is typed DbAdapter but its
transaction() throws — one static contract, two behavioral modes
distinguishable only by provenance, so a substitute does not substitute
cleanly

- evidence: The finding asserts an LSP violation: the tx view is "typed
  DbAdapter but its transaction() throws — two behavioral modes
  distinguishable only by provenance." Re-read this run, the claim fails on
  the supertype contract itself. (1) The DbAdapter interface declaration at
  /Users/tmornini/code/fusion-ai/api/db.ts:339-346 carries the contract
  comment on transaction(): "Run `fn` inside one transaction. The view it
  receives exposes the same stores bound to the open tx, so every op joins it
  — GET-modify-PUT and multi-PUT commit atomically. A nested
  view.transaction throws." Per the Office of Commentary, documentation at a
  contract boundary IS the contract. LSP — and the scripture's own
  Abomination on Inheritance ("a subtype must honor every promise the parent
  type has made") — binds the substitute to the parent's declared promises;
  the parent explicitly promises the nested throw, so the view at
  /Users/tmornini/code/fusion-ai/api/db-backed.ts:250-268 honors every promise
  made. The scripture's L gloss ("readable where readable, writable where
  writable") is satisfied: the view is fully readable and writable on all 32
  stores, identically to the root. (2) "Distinguishable only by provenance"
  overstates: a view exists only as the lexical parameter of a
  transaction(...) callback and cannot usefully outlive it — its mode is
  visible at every use site. (3) The throw is the scripture-mandated behavior,
  not a defect: Design by Contract ("When those terms are violated, the
  failure is not an accident to recover from — it is a breach of covenant to
  be proclaimed"), "an impossible state is a bug… and must crash," and
  Commandment X ("Wrap the indivisible operation in the transactional
  primitive your platform provides — never simulate atomicity at the
  application layer") — IndexedDB has no nested transactions, so silently
  joining or simulating nesting would be the real sin. (4) The behavior is
  pinned by a passing automated test: tests/db-transaction-view.test.ts:79-97
  "a nested view transaction throws" (measurement below, 4/4 pass). (5) No
  production path reaches the throw: every transaction-callback body in
  api/api.ts and api/authentication.ts uses only the view's stores; the batch
  dispatcher dispatchOpInTx (api.ts:459-492) dispatches only put/delete
  handlers, and the sole tx-opening handler applyRecordMultiPut is wired
  post-only on 'records-multi-put' (api.ts:749-752) — additionally
  'records_multi_put' is not in COMMIT_TABLES, so such an op is rejected 400
  at the validation gate before any tx. (6) The DbAdapter typing of the view
  is load-bearing, not accidental: orgScopedAdapter(base: DbAdapter):
  DbAdapter (api/db-org-scoped.ts:55-58) re-wraps the open view at
  db-org-scoped.ts:140-144 so the org fence rides INSIDE the tx (closing the
  TOCTOU), and the uniform route-handler signatures (api.ts:157-177) let one
  handler family serve both direct dispatch and in-tx batch dispatch. One
  contract with a declared, tested, platform-mandated precondition is not two
  contracts; a substitute that keeps every declared promise substitutes
  cleanly.
- measurement:

      $ node --test --strip-types tests/db-transaction-view.test.ts
      ✔ a view commits writes across stores atomically (1.299833ms)
      ✔ a throw inside the view rolls back every store (0.946333ms)
      ✔ stores in the view share one uncommitted buffer (0.144625ms)
      ✔ a nested view transaction throws (0.177041ms)
      ℹ tests 4
      ℹ pass 4
      ℹ fail 0

### [IX] [Context as the single vessel] web-app/app/adapters/init.ts:37

I/O performed outside the vessel: adapters/init.ts imports the raw transport
GET from api/api.ts (the contract says 'adapters never import them directly')
and command-palette feature code reaches the raw storage adapter for
hasSchema(), beside the established vessel idiom

- evidence: The cited primary site is refuted on three independent grounds.
  (1) Scope of the contract: ARCHITECTURE.md:491-495 reads in full "Every
  data-access adapter takes `ctx: RequestContext` first and uses
  `ctx.GET/PUT/DELETE/POST/commit`. The standalone `GET/PUT/...` exports in
  `api/api.ts` are the transport `ctx` delegates to — adapters never import
  them directly." The subject is data-access adapters. Reductio:
  web-app/app/adapters/shared.ts:3-9 — the vessel factory itself, also in
  adapters/ — imports all four raw verbs; the finding's plain-directory
  reading would condemn the vessel's own implementation, so it cannot be the
  contract's meaning. init.ts is the composition root (CLAUDE.md: "The
  composition root is web-app/app/adapters/init.ts";
  web-app/app/command-palette.ts:31-32: "init.ts is the composition root —
  intentionally outside the adapter barrel"), takes no ctx, and is not a
  data-access adapter. (2) Layering: shared.ts:13-17 imports
  getDbAdapter/getSessionToken/setSessionToken FROM init.ts — the vessel is
  built atop the composition root; init.ts importing createRequestContext back
  would be a module cycle. (3) Deliberateness, proven by git: commit 3638fa90
  "route init.ts schema check through ctx.GET" (2026-04-28 13:56) applied the
  vessel idiom to this exact line; commit 04d6bbf7 "move adapter ownership
  from api.ts to init.ts" (2026-04-28 15:03) reverted it to explicit transport
  threading, its message documenting that createFetchContext's production
  default is init.ts's getDbAdapter(). Commandment IX's "must rise to replace
  every similar site" does not bind the one site the better way structurally
  cannot occupy; the Article says "Processing begins with a request" — boot
  precedes the request baton — and SOLID-D prescribes configuring during
  initialization. ARCHITECTURE.md:310-312 documents the transport as "no
  module-level adapter; threaded explicitly". The finding however wrongly
  merged a second, DISTINCT, real defect:
  web-app/app/command-palette.ts:942-943, where feature-layer code obtains the
  raw storage adapter and performs I/O on it (adapter.hasSchema()) — the
  ONLY raw DbAdapter method call outside adapters/ in the entire web-app
  (measured). It sits beside the vessel idiom in the same file (getSearchIndex
  loads via sessionContext-based adapters), and the boot ancestor already
  computed the answer: core.ts threads hasSchema into the sibling
  initSidebarLayout(hasSchema) (core.ts:329) but not into initCommandPalette()
  (core.ts:344), so the palette re-derives upstream knowledge by reaching into
  the storage tier. That child is confirmed and returned in split[]; note the
  routed alternative (GET snapshots/schema, api/api.ts:860-865) exports the
  entire database to answer a boolean, so the righteous fix is threading
  boot's hasSchema or an adapter-layer accessor, not the heavy route.
- measurement:

      $ grep -rn "^import { GET }\|GET as httpGet" web-app/app/adapters  […]
      web-app/app/adapters/init.ts:8:import { GET } from '../../../api/a […]
      web-app/app/adapters/shared.ts:4:    GET as httpGet,
      $ sed -n '13,17p' web-app/app/adapters/shared.ts
      import {
          getDbAdapter,
          getSessionToken,
          setSessionToken,
      } from './init.ts';
      $ git show -s --format='%h %s' 3638fa90 04d6bbf7
      3638fa90 route init.ts schema check through ctx.GET
      04d6bbf7 move adapter ownership from api.ts to init.ts
      $ grep -rn 'adapter\.' web-app --include='*.ts' | grep -v 'adapter […]
      web-app/app/command-palette.ts:943:        if (await adapter.hasSc […]

### [VIII] [Context as the single vessel] web-app/app/adapters/shared.ts:103

Bag and runner fused: the vessel carries the I/O verb closures
(GET/PUT/DELETE/POST/commit), so the context as a whole is neither
serializable nor loggable — only its state half (requestId, identity) is;
the steps ride inside the bag instead of serving it

- evidence: The cited fusion exists as described
  (web-app/app/adapters/shared.ts:103-117 carries GET/PUT/DELETE/POST/commit
  beside requestId/identity), but it is not a doctrinal deviation — it is
  the load-bearing mechanism of the audit-exempt mandated voice. (1) The
  charter exempts "RequestContext is the only argument to adapter methods";
  adapters are free functions, the transport verbs in api/api.ts:1983-2010
  demand explicit (adapter, resource, token) threading with no module-level
  adapter, and ARCHITECTURE.md:491-497 covenants "RequestContext is the only
  I/O surface... The standalone GET/PUT/... exports in api/api.ts are the
  transport ctx delegates to — adapters never import them directly." Under
  those constraints the I/O capability has exactly one non-global home: the
  context. The finding's remedy forces either a second argument to every
  adapter (breaking the mandated voice) or a module-level transport singleton
  (the Sin of Global State — graver). (2) Loggability holds where the
  covenant matters, measured on the real module: JSON.stringify of a genuinely
  constructed ctx emits the complete state half
  ({"requestId":...,"identity":{...}}) and the bearer token does NOT leak into
  the log surface. The unserializable residue is precisely the secret-bearing
  capability that must never be logged; a wholly serializable "complete" bag
  would have to carry the raw bearer token as data — a Commandment II
  regression outranking the Article. The closures also honor "Objects carry
  state, not arguments": the token is carried as captured state rather than
  threaded through every step. (3) "The context flows; the steps serve" is
  intact: the pipeline steps are the adapter free functions
  (getOrganizations(ctx), ...), each small, focused, and taking the ctx as the
  baton; the verbs are the vessel's transport seam (the divorce point to
  api/api.ts), not steps riding in the bag.
- measurement:

      node --strip-types "$TMPDIR/ctx-measure.ts" — script builds a re […]

### [X] [Context as the single vessel] web-app/app/adapters/shared.ts:125

One vessel, two truths: ctx.identity is frozen at creation while
recovery-enabled verbs resolve getSessionToken() live per call, so the
vessel's stated identity and the principal executing its verbs can diverge
(org switch or session recovery mid-flight); consumers like activeOrg(ctx) and
role-grant attribution read the frozen half

- evidence: The frozen/live split exists as code
  (web-app/app/adapters/shared.ts:125 freezes principalFromToken(token);
  shared.ts:191 runs recovery-enabled verbs on getSessionToken()), but no
  named harm is reachable. (1) Org switch mid-flight is impossible:
  switchToOrg (web-app/app/org-switcher.ts:37-47) writes the ACTIVE_ORG_KEY
  preference and calls location.reload() — it never calls setSessionToken
  — and the token holder is a per-tab module variable
  (web-app/app/adapters/init.ts:55), unreachable from other tabs; the reload
  destroys every in-flight context. (2) The subject cannot diverge: the
  complete mid-page setSessionToken writer set is boot
  (core.ts:150/181/211/246, all awaited before any page-module init per
  core.ts:306-357) and recovery (shared.ts:268/321); recovery either
  re-installs the SAME stored access token (install branch) or mints from the
  identity verified out of the refresh token (api/authentication.ts mintPair)
  — so role-grant attribution by_member_id: ctx.identity.id
  (role-grants.ts:29) always equals the live subject; login/logout are full
  navigations. (3) The org claim can diverge only in a cross-tab triple race
  (foreign-tab preference rewrite + 15-min expiry inside a milliseconds-long
  context + recovery re-scope), and even then the server resolves the org ONCE
  from the VERIFIED token claim, never path or body (api/api.ts:1671,1717) and
  stamps every write (api/store-org-scoped.ts:76); records.ts:203-205
  explicitly documents the client stamp as validator-satisfying only — worst
  case is one stale read render in a dying context. (4) The frozen identity is
  the doctrinally mandated design — the Office of the Context: each field
  set exactly once, Authentication resolves the identity — and
  session-logout.ts:11-12 codifies reading identity from the vessel; the
  live-token verb routing is the documented single-shot recovery seam
  (shared.ts:127-130,180-185), pinned by
  tests/adapters-shared-recovery.test.ts.
- measurement:

      $ grep -rn "setSessionToken(\|clearSessionToken(\|location.reload" […]
      web-app/app/page-loader.ts:62: () => location.reload(),
      web-app/app/core.ts:150: setSessionToken(
      web-app/app/core.ts:181: setSessionToken(decision.accessToken);
      web-app/app/core.ts:211: setSessionToken(decision.accessToken);
      web-app/app/core.ts:246: setSessionToken(creds.accessToken);
      web-app/app/org-switcher.ts:46: location.reload();
      web-app/app/adapters/shared.ts:268: setSessionToken(flatToken);
      web-app/app/adapters/shared.ts:321: setSessionToken(
      web-app/app/adapters/session-logout.ts:25: clearSessionToken();
      web-app/auth/index.ts:577: setSessionToken(creds.accessToken);
      — org-switcher never writes the token; only boot (pre-page-init) […]
      $ node --test --strip-types tests/adapters-shared-recovery.test.ts
      ✔ a recover context silently refreshes a dead access token
      ✔ a live credential with an anonymous-seed holder re-scopes rath […]
      ✔ recovery with both tokens dead scrubs and bounces
      ℹ pass 3 / fail 0

### [IX] [Insulation through adapters] web-app/app/adapters/work-orders- […]

WebCrypto digest inlined in a business (data-access) adapter rather than a
dedicated seam

- evidence: The cited code exists at work-orders-mutations.ts:72-88, but the
  defect does not stand. (1) The digest is already behind an owned named seam:
  generateDisplayId(uuid)=>Promise<string> is the repo's single digest
  touchpoint with exactly one caller (line 174); divorcing WebCrypto edits the
  17-line helper body only — no caller, no claim/transition logic changes.
  The finding's load-bearing claim 'Divorcing WebCrypto now means editing
  business logic' is false on read. (2) The 'every other WebCrypto touch lives
  in a dedicated single-purpose seam' comparison mischaracterizes the
  codebase: api/access-token.ts inlines crypto.subtle.importKey/sign/verify in
  private helpers (signingKey, signAccessToken, verifyTokenSignature) amid
  token-domain logic (Principal, AccessTokenClaims, claims shaping,
  latestByKey ledger reduction) — structurally identical placement to
  generateDisplayId. The only true single-primitive wrapper,
  api/crypto-safe-base62.ts, earned its module via many call sites; the digest
  has one. (3) Under the finding's own commandment IX ('Below three, duplicate
  without shame; at three, the abstraction begins to speak'), one digest site
  does not justify a dedicated module, and no digest seam exists anywhere for
  this site to 'rest beside' — there is no already-found better way to rise
  to. (4) The codebase does not categorically shim platform built-ins: new
  TextEncoder() is used directly in six files including line 75 of this very
  function (unflagged), zip.ts, flow-export.ts, base64url.ts. The finding
  concedes the letter is satisfied ('the module is an owned adapter'); its
  spirit-level supports collapse on inspection.
- measurement:

      cd /Users/tmornini/code/fusion-ai && grep -rn "crypto\.subtle" --i […]

### [IX] [Insulation through adapters] web-app/flows/detail.ts:1053

Adapter seams pass platform Blob/File types, forcing page modules to touch the
primitives themselves

- evidence: All cited lines re-read this run and accurate as quoted
  (web-app/flows/detail.ts:1053-1058, web-app/snapshots/index.ts:480-494,
  web-app/flows/index.ts:312-314 and 352-354,
  web-app/app/adapters/blob-download.ts:3-13,
  web-app/app/adapters/snapshots.ts:227-243). The doctrinal conclusion fails
  on five grounds. (1) The scripture explicitly blesses direct use of platform
  primitives ("We choose platform primitives over third-party abstractions...
  What the platform provides, the platform maintains"); the Insulation article
  and Sin of Coupling target external dependencies ("library, service,
  framework") via the divorce-point rationale — Blob/File/Uint8Array are
  platform value types in a zero-runtime-dependency browser app with no
  divorce scenario, and even the successor download API (showSaveFilePicker
  writable.write) consumes Blobs, so "against the day it evolves" favors the
  existing Blob seam over the proposed one. (2) The adapter is hermetic where
  it matters: URL.createObjectURL/revokeObjectURL — the leak-prone lifecycle
  choreography — appears in exactly one file, inside the adapter (measured);
  the Blob is payload crossing the seam, not coupling surface. (3) The
  proposed (bytes, mimeType, filename) remedy fails its own standard: it still
  passes platform types (Uint8Array, MIME strings) at the seam, and the
  snapshot caller's payload is a JSON string, forcing either a union seam or
  page-side TextEncoder use — and the finding itself counts page-side new
  Uint8Array(await file.arrayBuffer()) as a violation, which its remedy
  reproduces for the download direction's byte producers. (4) The claimed
  both-sides-of-the-seam inconsistency is deliberate gate placement, not
  drift: putSnapshotFromFile takes File because the quota pre-flight gate
  needs file.size BEFORE reading content (snapshots.ts:236 throws
  SnapshotTooLargeError; documented in CLAUDE.md gotchas "Snapshot quota
  pre-flight"), i.e. validators at the gate; the flow-import page must branch
  by extension between two adapters with parser-native payloads
  (postFlowFromZip takes ZIP bytes at flow-export.ts:1005-1009,
  postFlowFromMermaid takes text) interleaved with dialog orchestration
  (project select, closeDialog) — page-level routing the adapter cannot own
  without absorbing UI flow. (5) The very commandment cited (IX) bars the fix:
  "Two instances are coincidence. Three is pattern. Below three, duplicate
  without shame" — downloadBlob has exactly two call sites (measured), so
  factoring a one-line platform constructor out of two sites is the premature
  generalization the commandment defers. Additionally, the implied standard
  "page modules must not touch platform primitives" is neither the scripture's
  nor the codebase's: pages pervasively use addEventListener,
  HTMLInputElement, input.files, and document directly (e.g.
  web-app/flows/index.ts:121-260, web-app/organization/index.ts:180-453).
  Residual warts — the duplicated `as unknown as ArrayBuffer` cast
  (detail.ts:1054, zip.ts:296, a TS lib BlobPart typing artifact, second site
  in an owned pure module not a page) and the double file.arrayBuffer() read
  within one function (flows/index.ts:313, 353, a hoistable local duplication)
  — are each below three sites and are not the defect as titled.
- measurement:

      $ grep -rn "downloadBlob(" --include="*.ts" web-app/ | grep -v "ex […]
      web-app/snapshots/index.ts:489:            downloadBlob(
      web-app/flows/detail.ts:1058:    downloadBlob(blob, result.name);
      ---
      web-app/app/adapters/blob-download.ts:7:    const url = URL.create […]
      (exactly 2 call sites — below the rule-of-three the cited comman […]

### [X] [Communicating sequential processes] web-app/app/adapters/identi […]

Cross-tab exclusivity coordinated by read-then-commit on the shared ledger,
not by message or platform lock

- evidence: The headline claim — "two real processes (tabs) decide
  refresh-token liveness... by racing GET-then-commit" via postTokenRotation
  — is false at HEAD a1c603a6. (1) The cited adapter function has ZERO
  production callers: grep over the repo finds postTokenRotation only at its
  definition
  (/Users/tmornini/code/fusion-ai/web-app/app/adapters/identity-tokens.ts:75),
  its own hazard comment (:19), and tests/adapters-identity-tokens.test.ts;
  the identity-tokens page and identities detail page call only the read,
  getTokenChainsFor (web-app/identity-tokens/index.ts:42). (2) The actual
  production rotation path is the OAuth refresh grant:
  web-app/app/adapters/session-refresh.ts POSTs 'authentication/token' into
  api/authentication.ts, where since commit d1d11b94 ("Consume and issue auth
  grants atomically", 2026-06-05 — one day AFTER the adapter comment landed
  in a4607fbb, 2026-06-04) the chain read, planRotation, and event appends all
  run inside ONE adapter.transaction(['identity_tokens'], ...)
  (api/authentication.ts:283-315), with the in-code covenant "a concurrent
  reuse of the same jti can not double-rotate". (3) That transaction is the
  genuine platform primitive: the composition root boots IndexedDbDbAdapter
  (web-app/app/adapters/init.ts:24), whose transaction() opens a real
  db.transaction([...stores], mode) (api/backend-indexeddb.ts:66); IndexedDB
  serializes overlapping readwrite transactions across tab connections, so a
  concurrent second rotation reads the first tab's appends and planRotation
  returns 'replay' — chain revoked, reuse DETECTED, not missed. The hazard
  comment at identity-tokens.ts:19 (and its claim that "only Web Locks or the
  Postgres tier can" fix this) is stale documentation on a test-only path, not
  a live defect — and even as a doc defect it is KNOWN (self-documented),
  not NEW. The second merged site is a genuinely distinct, real defect and is
  split out: postWorkOrderClaim (work-orders-mutations.ts:375, comment at
  :365) checks claim liveness via ctx.GET('states') in one transaction and
  commits the 'claimed' event via ctx.commit in another, with no check inside
  the write tx — duplicate claims possible, interim "lock" is a disabled UI
  button; same TOCTOU family in postWorkOrderTransition (:249) deciding
  claim_released from a prior-transaction read. That child is CONFIRMED on
  read and carries the finding forward; the merged headline as cited is
  refuted. Commandment 10 (Atomicity) is the correct trace for the surviving
  defect — the platform transactional primitive the token path already uses
  is available and unused at the work-orders site, with exclusivity simulated
  at the application layer.
- measurement:

      $ grep -rn "postTokenRotation" /Users/tmornini/code/fusion-ai --in […]
      web-app/app/adapters/identity-tokens.ts:19 (comment), :75 (definit […]
      $ sed -n '280,315p' /Users/tmornini/code/fusion-ai/api/authentication.ts
      "// Read the token ledger, plan the rotation, and append its event […]
      $ git log --format="%h %ad %s" --date=short -1 a4607fbb; git log . […]
      a4607fbb 2026-06-04 Add token-lifecycle vessel adapter (the hazard […]
      $ grep -n "backend" web-app/app/adapters/init.ts → line 24: retu […]

### [VI] [Communicating sequential processes] web-app/app/adapters/share […]

Boot hands the session to concurrent read flows by mutating a shared holder;
the admitted race is patched by 401-retry

- evidence: The finding's load-bearing claims — "concurrent read flows",
  "ordering is by scheduling accident", and "the compensation is a server 401
  plus single-shot retry rather than an awaited session-ready handoff" — are
  each contradicted by the code at HEAD a1c603a6, re-read this run. 1. The
  awaited handoff exists. The boot is one sequential async chain in
  /Users/tmornini/code/fusion-ai/web-app/app/core.ts:270-367: `await
  bootAuthGate()` (line 311) then `await bootOrgGate()` (line 314, which
  awaits `scopeBootToActiveOrg()`, installing the org-scoped token via
  `setSessionToken` at line 150) complete strictly BEFORE `await
  initSidebarLayout(...)` (line 328), `await loadAndInitCommandPalette()`
  (line 344), and `await initPageModule(pageName)` (line 357). Every
  `sessionContext()` call site in the repo (62 sites, all in page modules,
  sidebar widgets, the palette, and post-init event handlers) is created
  downstream of those awaits. No reader runs concurrent with boot scoping; the
  ordering is structural, not scheduling accident. 2. The only reader class
  outside the page-init chain — cross-tab refresh callbacks — cannot fire
  mid-boot. `createSubscriptionChannel`
  (/Users/tmornini/code/fusion-ai/web-app/app/channels.ts:41-60) attaches its
  BroadcastChannel listener at adapter-module import time, but its subscriber
  set (channels.ts:16-31) is empty until a page registers a refresh callback
  during page init — after the gates. A broadcast arriving mid-boot finds no
  subscribers and triggers no read. 3. The comment's "(a read raced ahead of
  boot scoping)" is the recovery branch's account of the auth-exempt-sidebar
  incident, fixed STRUCTURALLY in the same-day sibling commit c068b049 "Skip
  sidebar and palette org reads when unscoped" (Jun 7 2026, same commit batch
  as 2262a8a8 which added the cited comment). At HEAD the only readers that
  could ever sample the anonymous seed — the sidebar member chip / header /
  invitations bell (/Users/tmornini/code/fusion-ai/web-app/app/layout.ts:103,
  `if (hasSchema && sessionIsOrgScoped())`) and the command-palette index
  (/Users/tmornini/code/fusion-ai/web-app/app/command-palette.ts:309, `if
  (!sessionIsOrgScoped()) return;`) — gate on the scoped-session predicate
  and never fire on the seed. On auth-exempt pages with a stored credential,
  `scopeBootIfCredentialed()` is likewise awaited (core.ts:318) before any
  reader initializes. That incident was never a scheduling race at all: on an
  anonymous visit to an auth-exempt page, boot deliberately never scopes, so
  the org-bound reads 401ed deterministically — gating, not retry, is the
  fix that landed. 4. The 'install' branch of recoverSession
  (/Users/tmornini/code/fusion-ai/web-app/app/adapters/shared.ts:238-239) is
  not the patch for an open race; it is the boundary backstop for a
  stale-holder state that still arises through NON-race paths — chiefly a
  revoked-but-unexpired token: the Bearer gate's revocation-ledger check
  (/Users/tmornini/code/fusion-ai/api/api.ts:975-981) 401s a token whose
  stored `exp` still reads live, so `resolveCredentialDecision` says
  'install'; re-scope then 401s and falls through to scrub+bounce, exactly as
  the second half of the cited comment states. The branch's contract is
  covered by
  /Users/tmornini/code/fusion-ai/tests/adapters-shared-recovery.test.ts, whose
  stale-holder test (lines 99-123) constructs the state synthetically with
  `setSessionToken(seed)` — it races nothing. 5. The mechanism the doctrine
  objects to — the mutable module holder `let sessionToken`
  (/Users/tmornini/code/fusion-ai/web-app/app/adapters/init.ts:55) sampled at
  call time — is the CLAUDE.md-declared architecture: "**State.**
  Module-level vars + pub-sub for theme, mobile, auth, sidebar." Per the audit
  charter, conformance to the mandated codebase voice is not a finding. With
  the race claim dead, only the mandated pattern remains.
- measurement:

      $ grep -n "sessionIsOrgScoped" web-app/app/layout.ts web-app/app/c […]
      web-app/app/layout.ts:103:    if (hasSchema && sessionIsOrgScoped()) {
      web-app/app/command-palette.ts:309:        if (!sessionIsOrgScoped […]

      $ node --test --strip-types tests/adapters-shared-recovery.test.ts
      ✔ a recover context silently refreshes a dead access token
      ✔ a live credential with an anonymous-seed holder re-scopes rath […]
      ✔ recovery with both tokens dead scrubs and bounces
      ℹ tests 3 / pass 3 / fail 0
      (the stale-holder state is constructed synthetically via setSessio […]

      $ git log --oneline -L 217,253:web-app/app/adapters/shared.ts | head -2
      2262a8a8 Re-scope a live token in recovery, never scrub
      (same-day sibling: c068b049 "Skip sidebar and palette org reads wh […]

### [IX] [On the Sin of Entangled Nouns] api/types.ts:962

Pattern: ownership relationships welded onto entity rows as organization_id /
record_id FK columns instead of their own relations, with no moment of union

- evidence: All 8 cited sites verified present at HEAD a1c603a6
  (api/types.ts:962, 976, 1009, 1058, 1089, 1104, 1112, 1113). The defect
  nevertheless fails. (1) Security outranks the cited doctrine by the
  scripture's own method: the Entangled Nouns abomination forecloses only the
  PERFORMANCE plea by rank ('performance is the TWELFTH commandment'); this
  codebase's plea is Commandment II. The welded organization_id IS the tenant
  fence: /Users/tmornini/code/fusion-ai/api/store-org-scoped.ts:14-17
  (OrgScoped requires the column), :50-58 ('The organization_id index IS the
  fence'), :106-117 (#assertWritable write fence), :125-130 (#stamp: 'the
  store owns the containment fact, so the caller can neither forge nor omit
  it'). The join-derived alternative the finding demands is already
  implemented for junctions and is demonstrably weaker in shipped code:
  /Users/tmornini/code/fusion-ai/api/store-parent-scoped.ts:70-78 ('Writes
  DELEGATE — they are not parent-fenced') and :13-16,56-58 (null-owner
  orphan rows are VISIBLE to all orgs) — moving tenancy to a join relation
  makes 'entity with no owner' representable and cross-tenant-visible, a
  Commandment I+II regression. ARCHITECTURE.md:116-124 lists the fence as the
  security mechanism. (2) The absolutist 'FK is never just a reference'
  reading self-destructs: the covenant article's prescribed join tables are
  themselves made of FK columns ('Join tables hold only the identities of the
  joined and the moment of union'). The article's boundary partitions
  relationships-with-time (which this schema DOES give relations: memberships
  with at — SCHEMA.md:584-586; FlowWorkOrderEntity with at —
  types.ts:1095-1100; idea_submissions, flow_records) from total immutable
  containment facts (tenancy, record_id parentage), which are never nullable
  and so belong on the row per the articles' own NOT-NULL clause. (3) The IX
  'better way resting beside' trace fails: SCHEMA.md:566-568 states one
  uniform rule applied consistently across all 8 sites and all join tables —
  not a better way resting beside a worse one. (4) The finding's one factual
  claim beyond pattern existence — 'records no moment of union' — is
  false: org ownership is fixed at creation and unforgeable thereafter (#stamp
  + #assertWritable), so the moment of union is the entity's creation event,
  recorded with at and member_id in the append-only states ledger
  (StateEntity, /Users/tmornini/code/fusion-ai/api/types.ts:429-435). The
  deviation is documented (SCHEMA.md:566-568), load-bearing for Commandment
  II, and verified by 13 passing fence tests this run.
- measurement:

      $ node --test --strip-types tests/store-org-scoped.test.ts tests/s […]
      ✔ an org-scoped putMany cannot overwrite a foreign row
      ✔ an org-scoped put still creates a brand-new row
      ✔ an org-scoped put updates a row it already owns
      ✔ getAll returns only the bound org rows
      ✔ getById returns an own-org row
      ✔ getById 404s a foreign-org row
      ✔ a foreign-org 404 is identical to an absent 404
      ✔ put stamps the bound org, ignoring a forged body
      ✔ putMany stamps the bound org onto every entry
      ✔ delete 404s a foreign-org id and splices nothing
      ✔ putMany 404s a foreign-org delete id, splices nothing
      ✔ delete removes an own-org row
      tests 13, pass 13, fail 0

### [IX] [On the Sin of Inheritance] api/db-memory.ts:8

Backend tiers derive from concrete BackedDbAdapter as zero-override
constructor presets where a composing factory function would carry no lineage

- evidence: Re-read this run:
  /Users/tmornini/code/fusion-ai/api/db-memory.ts:8,
  api/db-localstorage.ts:13, api/db-indexeddb.ts:14, and the parent
  api/db-backed.ts:100. The fact pattern is as cited (three zero-override
  constructor presets extending concrete BackedDbAdapter), but it does not
  commit the sin the section defines, and the proposed remedy removes nothing
  the doctrine measures. (1) The section's named harm — 'When an ancestor
  changes, every descendant trembles' / hierarchies that 'lie about
  substitutability' — is measurably absent: 0 instanceof checks repo-wide, 0
  protected members in BackedDbAdapter (all state is #private and physically
  unreachable from subclasses), 0 super.member accesses; each subclass touches
  the ancestor only through its public constructor. A factory function calling
  new BackedDbAdapter(backend, latency, open) binds to exactly that same
  signature — when the ancestor changes, the factory trembles identically.
  The extends keyword adds zero coupling the remedy would remove; a remedy
  that improves no doctrinal harm metric marks a notation preference, not a
  defect. (2) The finding's load-bearing premise — 'a factory returning the
  composed base would deliver the same names with no lineage' — is false in
  TypeScript: a class is simultaneously a value and a nominal type, and the
  type half is consumed at 53 annotation sites (db: MemoryDbAdapter across
  tests/, e.g. tests/api-invitations-fence.test.ts:31). A factory exports no
  type name. (3) The actual variation is constructor-injected capability —
  'composition binds by capability' is what this code does; db-backed.ts:92-99
  documents the abstraction was triggered at the third backend per the
  at-three rule. The Book's named anti-pattern is 'a base class with three
  subclasses, each overriding most of it' — this is its exact inverse. (4)
  The Articles endorse the shape: 'Open/Closed (Meyer): open for extension,
  closed for modification — stability via encapsulation and delegation' and
  'Dependency Inversion … configure during initialization' — the
  subclasses are pure initialization-time configuration over an encapsulated
  base. The finding's own text concedes 'the spirit of composition is largely
  honored; the extends keyword is the residue' — residue without a harm
  vector is taste, and taste is excluded from findings by the audit charter.
- measurement:

      $ grep -rn "instanceof \(Memory\|LocalStorage\|IndexedDb\)\?\w*DbA […]
      0
      $ grep -c "protected" api/db-backed.ts
      0
      $ grep -n "super\." api/db-memory.ts api/db-localstorage.ts api/db […]
      0
      $ grep -rn ": MemoryDbAdapter" --include="*.ts" tests | wc -l
      53

### [VIII] [On the Sin of Cleverness] api/db-backed.ts:170

Bulk Object.assign(this, …) binds ~33 readonly store properties declared
with definite-assignment '!' — no store is ever visibly assigned, so grep
and go-to-definition find only declarations; the compiler's initialization
check is waived for concision (fenced only by DbStores typing on both sides)

- evidence: The finding's facts are accurate but its defect claim — a waived
  compiler check leaving an un-greppable, hard-to-debug binding — is killed
  on four counts. (1) The fence is structurally COMPLETE, not a concession:
  BackedDbAdapter `implements DbAdapter` (api/db-backed.ts:100) and `DbAdapter
  extends DbStores` (api/db.ts:329), so the compiler REQUIRES the class to
  declare every one of the 33 store keys; `#buildStores(run): DbStores`
  (api/db-backed.ts:274) REQUIRES the returned object literal to contain every
  one of the 33 keys (missing-property check); `Object.assign` copies all keys
  at construction (lines 170-173). Mechanical verification: all 33 DbStores
  keys are both declared in the class and wired in #buildStores (TOTAL=33
  DECLARED=33 WIRED=33). Adding a 34th table to DbStores fails compilation on
  BOTH sides until declared AND wired — the guarantee the `!` waives is
  re-established at a different layer with equal strength; there is no path to
  an undefined store. (2) The pattern is the DRY consequence of the tx view,
  not concision vanity: the identical 33-store wiring must be bound twice —
  to the backend in the constructor and to an open tx in #viewForTx via
  `...this.#buildStores(ambientRunner(tx))` (line 252). The alternative is
  either ~70 lines of `this.x = stores.x` transcription ceremony or
  duplicating the 130-line wiring. The mechanism is documented at three sites:
  the class header (db-backed.ts:92-99), above #buildStores ("The constructor
  binds it to the backend; the transaction view rebinds the same wiring",
  lines 271-273), and at DbStores itself (db.ts:243-246, "factored out of
  DbAdapter so an adapter can build the whole bundle in one place
  (#buildStores) and a transaction can rebuild it bound to an open tx (A9)").
  (3) The grep claim is overstated: grep for any store name in db-backed.ts
  finds the declaration AND its explicit construction site in #buildStores
  (e.g. `members: new EntityStore('members', run, stateStore,
  validateMemberEntity)` at lines 291-294) — only the syntactic form
  `this.members =` is absent (grep confirms zero hits, exit=1); each store's
  construction is individually visible with table name and validator. (4)
  Runtime binding is proven live: tests/adapter-parity.test.ts constructs
  MemoryDbAdapter (extends BackedDbAdapter, api/db-memory.ts:8) and exercises
  bound stores including `db.states.deletedIds()` — 1 pass, 0 fail.
  Kernighan's test does not indict a 12-line constructor whose single
  statement is a commented bulk bind of a type-fenced bundle; this is the
  mainstream TS idiom for binding a shared property bag, and the scripture
  itself condemns the alternative as ceremony ("To extract these... is to
  translate plain speech into ceremony").
- measurement:

      $ sed -n '/^export interface DbStores {/,/^}/p' api/db.ts | grep - […]
      TOTAL=33 DECLARED=33 WIRED=33

      $ grep -rn "this\.\(members\|states\|ideas\|projects\|flows\|organ […]
      exit=1

      $ node --test --strip-types tests/adapter-parity.test.ts
      ℹ tests 1 / pass 1 / fail 0

### [XI] [The Office of the Context] api/authentication.ts:412

Authentication revisits its own work: identical bearer verified and
revocation-checked twice, facade re-entry verifies a third time and re-reads
the body

- evidence: Re-read this run: api/authentication.ts:332-417,
  api/api.ts:956-983, 1033-1076, 1659-1830, api/access-token.ts:229-304. The
  facts are accurate but the headline defect does not stand. (1)
  grantTokenExchange is the general RFC 8693 grant where subject and actor are
  in general DIFFERENT tokens — verifying and revocation-checking both
  (authentication.ts:354-376) is each check done once per token role, not
  revisited work; the comment at 332-340 documents both-token verification as
  deliberate gate parity. exchangeBearerForOrg's degenerate subject==actor
  reuse is Commandment IX generality at a measured cost of ~14 us extra HMAC
  plus one duplicated indexed revocation read; special-casing token equality
  would be the Sin of Premature Optimization by the scroll's own words ('Never
  optimize what you have not measured'). (2) The facade re-entry (api.ts:1075)
  is the documented security architecture — api.ts:1667-1671: 're-enter the
  gate against the flat resource path, so the existing handler is fenced
  automatically. Org rides the one verified token, never the path' — and
  CLAUDE.md Tenancy binds orgScopedAdapter to the org 'from the VERIFIED token
  claim (never the path)'. The inner verification of the minted token is
  load-bearing: skipping it requires a pre-verified-principal side door, a
  second trust path into the org fence, trading Security (II) and Uniformity
  (III) for microseconds. The body text() at 1073 is the Fetch API's only
  portable way to forward a consumed body into a new Request, and the single
  request.json() gate (1811-1828) is what yields the uniform malformed-JSON
  400; the inner request is a NEW vessel passing the one gate once — Office
  of the Context is satisfied per vessel. The scroll ranks XI as 'not a goal
  but a consequence — what you inherit when you honor the commandments that
  precede this one'; measured absolute cost is tens of microseconds, far below
  the low-single-digit-ms perception threshold the scroll demands before
  optimizing. (3) The 'Separately' clause IS a real, distinct defect with a
  different mechanism and blast radius (every authenticated request, not just
  the facade): api.ts:968 holds verified result.claims containing every
  Principal field (sub, roles, name, org, orgs), yet :982 returns
  principalFromToken(token), which re-splits, re-base64-decodes,
  re-JSON.parses, and re-shape-checks the same string
  (access-token.ts:229-259) and builds the principal from the unverified
  re-decode. No higher commandment defends it; the fix is strictly simpler. It
  violates the audit's own merge key (different file, different symbol,
  different defect than the facade sites) — split out as its own confirmed
  finding.
- measurement:

      node --input-type=module -e "import { mintAccessToken, verifyAcces […]

### [V] [The Office of Verification] tests/channels.test.ts:47

Assertion-free tests whose names promise covenants the body never checks

- evidence: The doctrine claim — comfort objects that cannot fail — is
  mechanically false at all three cited sites. node:test fails a sync test on
  any throw and an async test on any awaited rejection, so an assertion-free
  body is still a failable test. Running the EXACT cited bodies against
  covenant-breaking mutants produced 3/3 failures: (1)
  tests/channels.test.ts:47 fails when the second unsub() throws — the
  no-throw contract is the core of 'safe to call twice'; (2)
  tests/channels.test.ts:55 fails when send on an empty channel throws, and
  with zero subscribers nothing else is observable, so the body checks the
  entire covenant the name states; (3) tests/adapters-snapshots.test.ts:300
  directly awaits putSnapshot(ctx, json) (line 305), so any rejection fails it
  — it is the positive control for the surrounding battery of 7
  assert.rejects tests (lines 196-298, 309-355); without it a validator that
  rejected everything would pass the whole file. Sites 2 and 3 are fully
  sound: their names promise exactly the no-throw/no-reject covenant their
  bodies enforce. One distinct, narrower defect survives at site :47 only and
  is returned as a split child: a SILENTLY corrupting mutant (unguarded
  subs.splice(subs.indexOf(fn),1), where double-unsub hits indexOf -1 and
  splice(-1,1) removes the LAST subscriber) passes the cited test untouched,
  because the test has a single subscriber and no post-condition observer —
  it proves the no-throw half of idempotency but not the no-side-effect half.
  grep confirms channels.test.ts is the only test file touching createChannel,
  so no other test covers double-unsub with a second live subscriber. The
  shipped implementation (web-app/app/channels.ts) uses a Set whose delete is
  inherently idempotent, so this is a test-strength hole against future
  refactors, not a live bug.
- measurement:

      $ node --test --strip-types tests/channels.test.ts → 6 pass, 0 f […]

## Not-verifiable appendix

Questions only runtime can answer — browser truth belongs to TEST-PLAN.md,
separately invoked. Collected verbatim from the hunters, deduplicated.

- Whether IndexedDB getAll/index-getAll primary-key ordering in the shipped
  browsers actually randomizes same-`at` tie winners (finding F4) — the spec
  mandates key order, but witnessing the divergence from the memory tier needs
  a browser run (TEST-PLAN.md territory)
- Whether navigating away during the 800 ms debounce window actually drops the
  pending property-edit commit, or some browser-side flush intervenes (finding
  F5) — needs browser
- Whether rejected #saveFlow / void-called handler promises surface anywhere
  observable at runtime beyond devtools console (findings F1/F2) — needs
  browser
- The full ./validate verdict — Phase 0 of AUDIT.md assigns it to the
  orchestrator; this hunter ran only the single tests/timestamps.test.ts file
  (pass 2/2)
- Whether the flow-graph.ts:580/859 unescaped-id interpolation is end-to-end
  exploitable depends on whether innerHTML-inserted inline-SVG fires event
  handlers in the target browser — the unescaped attribute breakout is
  statically certain, exploitability is a browser-runtime question
  (TEST-PLAN.md).
- Every KNOWN seam flag is INERT today because the whole store is client-side
  IndexedDB in the page-runner's own browser (ARCHITECTURE.md § Server-tier
  deploy blockers); each becomes a live exposure only when a real server tier
  is split out — a deployment/runtime condition, not statically observable.
- KNOWN-7 (de-membership latency up to the 15-min SESSION_TTL_SECONDS) only
  manifests over a live network with a real revocation event; cannot be
  measured statically.
- All ARCHITECTURE.md § Server-tier deploy blockers pointer line numbers have
  drifted from their symbols' current locations (e.g. BEARER_EXEMPT_ROUTES
  cited api.ts:100 / actual 147; grantTokenExchange cited 307 / actual 341;
  ROUTE_POLICY cited 77 / actual 61). The seams are present and unwidened in
  posture, so this is doc-pointer drift (Clarity, owned by another section),
  not a Security widening.
- Whether user-visible rendered labels (button captions, headings, empty-state
  copy) speak one vocabulary per concept across pages — needs the composed
  DOM in a browser per TEST-PLAN.md; the static SafeHtml templates were
  spot-readable but final label uniformity is a runtime/visual question.
- Whether data-page values, PAGE_REGISTRY sourceDir/sourceFile, and composed
  output filenames stay name-aligned at build time — enforced by compose.ts
  plus the ./validate gate, which this audit may not run (read-only, no full
  suite).
- Whether logger/console message vocabulary is uniform across runtime paths
  (warn-level non-critical writes, View Transition aborts) — observable only
  in a live session.
- Whether same-millisecond `at` ties actually occur on live write paths (e.g.,
  two states rows for one entity inside one batched commit, or a rapid
  grant+revoke) — nowUtc() is ms-resolution so the window exists, but only
  runtime timing shows its frequency; findings 1 and 2 are conditional on a
  tie occurring.
- The actual row ordering shipping browsers return from
  IDBObjectStore.getAll()/IDBIndex.getAll() — the spec mandates primary-key
  order and api/api.ts:1226 asserts the same, but a static audit cannot run
  the IndexedDB backend to witness it.
- The real-world width of the 1-second revocation survival window
  (authentication.ts:240) under wall-clock skew between the revocation stamp
  and token mint — runtime only.
- Whether the zone-blend in project elapsed-days
  (web-app/app/presenters/project.ts:215-231: UTC-midnight calendar start vs
  local-instant Date.now()) renders a visibly wrong day count in far-from-UTC
  zones — needs a browser pinned to a non-UTC timezone.
- Whether the unnamed 800 ms auth-submit dwell is a deliberate UX timing
  choice (simulated latency vs spinner-readability) — only product intent or
  runtime observation can answer; the code carries no name or comment.
- Whether the design-system gallery's ${''}-spliced markup renders
  pixel-identically to the concatenation idiom in a real browser — static
  audit; the page was not served.
- 14 of the 15 strong 'never/always' comment claims found in api/ were not
  individually verified against their code paths this run (one —
  store-parent-scoped 404-not-403 — was spot-checked and held true).
- Whether any browser-tier page path mutates rows returned from IndexedDB
  reads while relying on structured-clone isolation — and would therefore
  behave differently against the aliasing memory test backend (and vice
  versa). Static grep found no such mutation; only runtime/browser
  (TEST-PLAN.md) can prove the negative across all DOM-driven flows.
- Whether any live caller ever issues a states/:id PUT reusing an existing
  event id with a changed payload (history rewrite in practice). Static search
  found only idempotent seed uses (mock-data.ts) and the route itself;
  observing real traffic needs runtime.
- Whether the workbox UI's disable-while-pending compensating control (cited
  in the postWorkOrderClaim comment) actually prevents double claim/transition
  invocation in a live browser — TEST-PLAN.md territory.
- Real IDBTransaction semantics the design relies on — keyPath put-as-upsert
  and delete-on-absent succeeding silently — are platform contract,
  verifiable only in-browser.
- Whether a duplicate transition event from a double-submit visibly skews
  flow-stats heat/sojourn/path aggregates at runtime (the static derivation in
  state-events.ts projectTransitions would emit a self-transition row).
- Whether the 19 silently-dropped duplicate class attributes produce visible
  layout defects on the rendered design-system page — needs the browser
  (TEST-PLAN.md).
- Whether ./build minification/tree-shaking strips the 54 dead exports and the
  extrapolated ~85 dead utility CSS classes from the shipped bundle —
  running the build is forbidden in this static audit.
- Whether the three never-called notify*Change emitters mean some
  cross-component refresh path is silently inert at runtime, or whether
  BroadcastChannel refresh fully supersedes them — needs runtime
  observation.
- Whether any runtime-only path constructs withLoadingState/buildSkeleton/icon
  arguments dynamically (e.g., spread of computed options) such that the
  statically-dead knobs (timeoutMs, action, 'stats-row', ariaLabel) are
  actually exercised — static call-site search found none, but only browser
  runtime per TEST-PLAN.md could prove dynamic dispatch absent.
- Whether any of the 59 raw querySelector/querySelectorAll sites depend on DOM
  behavior the dom.ts helpers do not reproduce (live NodeList semantics,
  SVGElement returns) — shape-verification was sampled; a per-site browser
  check would settle the residue.
- Whether the standalone org-fence guard/write window (finding 1) is actually
  winnable in a real browser — IDB readonly/readwrite interleaving across
  two tabs needs runtime measurement (TEST-PLAN.md L5 family covers the append
  case, not the guard-then-put case)
- Whether two real tabs can produce a duplicate work-order claim through
  postWorkOrderClaim (finding 2) — a browser-runtime race per TEST-PLAN.md's
  cross-tab cases
- Whether the localStorage tier's multi-key flush can genuinely tear on a
  mid-write quota error in a real browser (its comment and CLAUDE.md both
  claim so; the tier is test-only today, but the claim itself needs a browser
  quota harness to witness)
- Whether an IDBTransaction in a real browser actually auto-commits early if a
  future change awaits a non-IDB promise inside a tx body — the static audit
  confirms no such await exists today; the failure mode itself is runtime-only
- Whether the two debounce delays (DEBOUNCE_MS = 100 in
  web-app/app/command-palette.ts:65; SAVE_DELAY_MS = 800 in
  web-app/flows/detail.ts:78) were measured INTO existence — the artifact
  ships the measuring instrument (callDurMs/keystrokesPerSec logs at
  command-palette.ts:728 and flows/detail.ts:122), but only runtime logs can
  show the measured filter/save cost justifies the added input latency.
- Whether CROSSING_SWEEP_COUNT = 24 (web-app/app/flow-layout.ts:553-555,
  'empirically sufficient for our typical 5–30 node graphs (more sweeps do
  not converge faster on this scale)') reflects an actual measurement — the
  claim is in the comment; the measurement is not in the repo.
- Whether the repeated parallel full-`states` GETs within one page load (e.g.,
  getDashboardStats triggers ctx.GET('states') once per bulk state-map and
  re-fetches `ideas`/`projects` inside getIdeaStates/getProjectStates,
  state-events.ts:305/344) cost perceptible time at production data scale —
  request-scoped deduplication would be a cache the doctrine forbids without
  exactly that measurement.
- Whether seed-time per-row `await adapter.X.put(...)` loops in
  api/mock-data.ts (e.g., line 6371) produce perceptible first-boot latency on
  the pristine-seed path — demo-tier, unmeasured, and raising it without
  measurement would itself be the Original Sin.
- Whether the per-pointermove full-canvas innerHTML rebuild (finding 2)
  actually drops frames at realistic graph sizes — needs browser profiling
  under gesture load; static audit cannot run the browser.
- Whether StateStore.deletedIdsIn's whole-states-log read+reduce on EVERY
  EntityStore.getAll/getAllWhere (store-entity.ts:33-78,
  store-state.ts:170-184; the comment itself says 'Hot path for getAll on
  every EntityStore' and the log 'never deletes', so cost grows monotonically)
  is a measurable latency contributor at realistic event volumes. Any
  structural fix (a tombstone materialization) collides with the higher-ranked
  derive-from-the-ledger Article, so only measurement can arbitrate — not
  reported as a finding.
- Whether per-request re-derivation of auth/authz from the membership and role
  ledgers ('derived fresh from the membership ledger (never cached)',
  authentication.ts:89) contributes perceptible latency on multi-GET page
  renders — doctrine-mandated freshness (Commandment II outranks XII); only
  runtime measurement can size the cost.
- Absolute impact of findings 1, 3 and 4 depends on table sizes and
  per-transaction IndexedDB overhead — the low-single-digit-millisecond
  perception threshold can only be tested at runtime; the
  serial/redundant-read PATTERNS are verified statically, their magnitudes are
  not.
- Whether a mid-flush localStorage quota error actually leaves partial
  multi-key state (finding 6) requires a browser runtime with quota forcing
  — static read confirms only the absence of an OS-atomic primitive, as the
  file's own comment states.
- Whether calling exportSnapshot/importSnapshot on a transaction view
  (db-backed.ts:259-261 delegates to the parent, which opens a FRESH backend
  transaction while one is open) deadlocks, queues, or auto-commits on
  IndexedDB is runtime behavior the static read cannot decide.
- Whether any runtime path ever hands a fenced (OrgScopedEntityStore) store to
  keyed()/scope() (finding 4) — call discipline holds on every static path
  read this run, but only runtime instrumentation proves the absence
  universally.
- Whether root-redirect.ts's localStorage prefix scan ever finds 'fusion-ai:'
  keys under the live IndexedDB tier (adapters/init.ts:24) — i.e., whether
  the root page now misroutes a data-bearing install to snapshots/index.html
  — requires a browser run with seeded data; statically the scan and the
  live backend point at different organs.
- Whether any withLoadingState caller's early `return` on null skips wiring
  (subscriptions, listeners) that should still occur on the error/empty path
  is a runtime-behavioral question; the static evidence shows only the
  interrogation ritual itself.
- Whether the three pure FSM reducers' discriminant switches (e.g.
  web-app/app/flow-fsm-reduce.ts:24) would benefit from polymorphic dispatch
  is judged here as value-oriented and conformant; confirming that judgment is
  a change-impact question only iteration over time can measure — "let the
  matter be settled by MEASUREMENT."
- Whether removing a record attribute that a stored work order references
  actually crashes the workbox detail page in-browser (the two throw sites are
  static fact; the user-reachable repro needs the browser per TEST-PLAN.md)
- Whether the org page Usage card visibly renders Seats 18/N against a
  one-member pristine bootstrap (browser render needed to witness the
  displayed lie)
- Whether any UI path can reach DELETE records/{id} (deleteRecord has no
  app-code caller this run — only tests — so the dangling
  flow_records/record_attributes it would leave is route-surface-only until
  runtime proves otherwise)
- Whether archiving a member while assigned to flow-node memberIds degrades
  the flow designer or runner (no pruning exists — static fact — but the
  rendered consequence needs the browser)
- Which dead watch entries produce user-visible cross-tab staleness in a real
  two-tab session: every commit-batch tx scope includes 'states' (api/api.ts
  unionTablesFor), so channels watching 'states' over-fire and mask their dead
  entries, but single-op writes (e.g. deleteFlowVersion via ctx.DELETE) open
  narrower scopes — only a browser run (TEST-PLAN K29-class cross-tab cases)
  can witness which paths actually go unheard.
- Whether flows/detail's deliberate lack of a data subscription (it subscribes
  only to resize) causes a stale-lock experience — i.e. whether a second tab
  learns another tab locked the flow before attempting a save — is runtime
  behavior mediated by the lock_timeout protocol.
- The no-echo-to-poster BroadcastChannel semantics that channels.ts relies on
  ('the poster is never echoed, so it does not double-refresh') is
  browser-runtime behavior the static read cannot confirm.
- Whether a real second tab posting a malformed message on the
  'fusion-ai:data' BroadcastChannel crashes the subscriber callback
  (channels.ts:51 tables.some on undefined) — needs a browser with two tabs;
  static read shows no guard.
- Whether input[type=number] consistently yields value '' (hence
  Number('')→0) for both cleared and invalid content across target browsers
  — spec-based claim; TEST-PLAN.md browser run can confirm the $0k save.
- IndexedDB structured-clone round-trip fidelity for edge values (the NOT-NULL
  gate rejects null/undefined at put, but NaN survives typeof checks only
  until asNumber's isFinite — confirming no other path stores NaN needs
  runtime).
- Whether the 500 catch-all actually surfaces the TypeError from a JSON `null`
  PUT body (the 400-vs-500 misclassification) — needs a live handleRequest
  invocation with a crafted request; statically traced only.
- Whether a failed #saveFlow actually leaves the canvas diverged from storage
  and only a console 'Uncaught (in promise)' behind — needs the browser
  (TEST-PLAN.md flow-designer cases).
- Whether the IndexedDB transaction abort path (backend-indexeddb.ts:316)
  preserves and surfaces the original fault on a real mid-write quota error
  — needs a browser with constrained storage.
- Whether toasts and buildErrorState panels render and remain readable on the
  failing paths (DOM/visual behavior) — manual browser regression territory.
- Runtime behavior of the localStorage tier's non-OS-atomic multi-key flush on
  a mid-write quota error (the one gap CLAUDE.md says IndexedDB closes).
- Whether compose.ts executes cleanly under node --strip-types once its two
  extensionless imports (compose.ts:8-9) gain .ts suffixes — proving it
  requires running the composer, which writes output files (forbidden in this
  static, read-only audit).
- Which versions of tsc/tsx/esbuild npx actually resolves on contributor
  machines, and whether builds differ across them — an environment/runtime
  question; no lockfile exists to answer it statically.
- Whether the native <dialog> element's showModal() focus/inert/Escape
  semantics reproduce the app's stacked-dialog UX (DialogStack supports nested
  dialogs) — browser behavior, TEST-PLAN.md territory.
- Whether the 100ms palette and 800ms flow-save debounce delays are justified
  by the data their instrumentation collects (commit 12d2c124 defers
  keep/lower/remove to 'Unit 6c') — needs the runtime debouncer logs, per
  TEST-PLAN.md browser runs
- Whether the gzip'd localStorage tables (states, flow_versions) actually
  approach the browser's localStorage quota under demo data — needs an
  in-browser storage measurement of the demo tier
- Whether the simulated network latency distribution (api/latency.ts
  log-normal mu=ln(60), 10-500ms clamp) resembles any measured real-network
  profile — comparable only once a server tier exists
- Whether the organization page's Seats usage bar visibly renders the stale
  used_seats value (18) against the live membership count after an invitation
  accept — browser truth, belongs to TEST-PLAN.md
- Whether a de-membered identity can actually exercise its stale org claim
  within the 15-minute TTL — runtime behavior, and INERT today per
  ARCHITECTURE.md (no server trust boundary exists until the backend split)
- Runtime confirmation that the root page (web-app/index.html →
  root-redirect.js) actually misroutes a populated-IndexedDB browser to
  snapshots/index.html: requires a live browser profile; any stray
  'fusion-ai:'-prefixed localStorage key (e.g. the manually set
  'fusion-ai:log-level' read by logger.ts:6) would flip the probe to landing,
  masking or unmasking the defect per profile.
- Whether the 18 full-ledger GET<StateEntity[]>('states') reads in adapters
  cost perceptible latency at realistic data volumes — message-granularity
  could be finer (indexed getWhere exists at the Tx seam), but the doctrine
  forbids declaring an efficiency defect without measurement ('We measure
  before we optimize'), and measurement needs a running browser with realistic
  data.
- Whether BroadcastChannel table-change messages reach every sibling browsing
  context (including bfcache restores and cross-origin-isolated edge cases)
  — runtime-only behavior; the static wiring (post on commit, subscribe in
  adapters, no echo to poster) is verified.
- Whether interleaved writes between two awaited reads on one ctx ever produce
  a visibly mixed render (the finding against ARCHITECTURE.md:496 proves no
  isolation mechanism exists; observing an actual anomaly needs the browser
  — TEST-PLAN.md territory)
- Whether the org-switcher's location.reload() (org-switcher.ts:46) closes the
  frozen-identity/live-token divergence window in practice — runtime timing
  of in-flight handlers during the switch
- Whether failure diagnostics actually suffer from untraced logs (log.with
  never called) — log output is only observable at runtime
- Whether runtime DOM/gesture wiring (flow-interactions pointer-capture paths,
  page init() bindings) preserves participant substitutability in the live
  browser — static read shows parameterized binding, but actual wiring is
  browser-only; see TEST-PLAN.md.
- Whether development historically proceeded process-first (messages designed
  before the data model) is a process fact about how the code was authored,
  not recoverable from the static tree.
- Runtime behavioral substitutability of the three preset subclasses for a
  directly constructed BackedDbAdapter across browser tiers (real IndexedDB
  open/latency path vs simulated backends) — static read shows zero
  overrides so Liskov holds structurally, but behavioral equivalence under a
  live IDBTransaction can only be witnessed in a browser, which this static
  audit may not run.
- Whether root-redirect's localStorage-prefix schema sniff ever matches data
  under the production IndexedDB tier: init.ts wires IndexedDbDbAdapter, and
  grep shows the IndexedDB backend writes no localStorage keys at all, so on a
  pure-IndexedDB store the root document would always route to
  snapshots/index.html regardless of seeded data — confirming actual boot
  routing requires a browser run.
- Whether a manually set 'fusion-ai:log-level' localStorage key actually
  misroutes post-wipe recovery to the landing page (statically implied by
  root-redirect.ts:19 prefix scan + logger.ts:6 key choice + the
  session-credentials.ts:26-29 contract; observing the misroute needs a wiped
  browser profile).
- Whether the subscribeEventListener shim could express flow-interactions' {
  passive: false, signal } AbortSignal-based listener options without behavior
  change — the shim takes no options argument; runtime gesture behavior
  under both cleanup styles is browser-only.
- Whether root-redirect.ts's localStorage-key schema probe
  (Object.keys(localStorage) with STORAGE_KEY_PREFIX) still correctly detects
  first-run state now that the composition root boots the IndexedDB backend
  (web-app/app/adapters/init.ts imports api/db-indexeddb.ts) — the
  vocabulary bypass is static fact, but whether the probe's behavior matches
  its comment needs a browser run per TEST-PLAN.md
- Whether the badge-* className strings emitted from api/types.ts configs all
  resolve to live CSS rules at render time (components-badges.css defines them
  statically, but dead/live class coverage is a rendered-DOM question)
- Whether the built ZIP artifact preserves the flat source=output structure
  (the build script promises {sourceDir}/{sourceFile}.html parity, but ./build
  requires a clean-tree run and writes to ~/Desktop — forbidden in a
  read-only static audit).
- Whether navigateTo() at runtime actually resolves every page to
  {sourceDir}/{sourceFile}.html as PAGE_REGISTRY declares (browser-only
  behavior; the static alignment of sourceDir/sourceFile to on-disk paths was
  verified, the runtime resolution was not).
- Whether verb semantics hold under runtime concurrency — two tabs PUTting
  the same resource id, or a commit-batch retry after a mid-flight failure —
  static reads show correct idempotent shapes (full-row PUT overwrite,
  fresh-id appends under post* names), but only the browser run (TEST-PLAN.md)
  can witness the interleavings.
- Whether the same-id retry path of putIdeaSubmission (which re-stamps `at:
  nowUtc()`) is ever actually exercised — its sole caller mints a fresh id
  per invocation, so the non-idempotent byte-level repeat is unreachable in
  the read code; runtime gesture-driven retries could differ.
- Whether the two acknowledged TOCTOU windows (concurrent refresh-token
  rotation in identity-tokens.ts:19, concurrent work-order claim in
  work-orders-mutations.ts:365) actually interleave under real two-tab timing
  — browser runtime only; TEST-PLAN L5 proves concurrent ledger APPENDS both
  survive but never exercises check-then-act across two transactions.
- Whether any live call path still reads the session holder ahead of boot
  scoping after core.ts's current await sequencing — the recoverSession
  compensation masks occurrences, so only runtime tracing of a booting tab can
  measure the race's residual frequency.
- Cross-tab logout/revocation propagation latency: a sibling tab retains its
  in-memory sessionToken until TTL expiry or a 401-driven recovery; bounded by
  the documented de-membership-latency deploy blocker but observable only at
  runtime.
- Whether theme-init.ts's raw localStorage reads are a measured pre-paint
  bundle-size decision: importing getPreference would pull the
  preferences.ts↔logger.ts module pair into the FOUC-critical IIFE — only
  a build plus bundle-size/paint measurement can price that, and the file
  header documents CSP extraction, not adapter avoidance.
- Whether the organizations double-validation has any observable per-request
  cost — runtime measurement only; statically it is redundant work with no
  behavioral difference.
- Whether the simulated localStorage-tier transaction's documented
  non-OS-atomic flush gap (CLAUDE.md Gotchas) ever manifests on a mid-write
  quota error — browser-runtime only, pointed at TEST-PLAN.md.
- Whether the '100-300 ms adapter-fetch latency' figure at
  web-app/app/command-palette.ts:922 was measured in-browser or derived from
  the latency shim's lognormal config — only runtime instrumentation
  confirms the range.
- Whether CROSSING_SWEEP_COUNT = 24 at web-app/app/flow-layout.ts:553 is
  genuinely 'empirically sufficient' (more sweeps do not improve crossings on
  5-30 node graphs) — requires running the layout convergence experiment.
- The actual write-time cost of the 22 unused IndexedDB secondary indexes
  (finding 1) — only browser profiling can quantify the write amplification;
  the finding rests on the verified absence of any reader, not on a measured
  cost.
- Whether the debounce constants (DEBOUNCE_MS = 100 at command-palette.ts:65,
  SAVE_DELAY_MS = 800 at flows/detail.ts:78) match observed keystroke/burst
  rates — the shipped debouncer logs answer this only at runtime.
- Whether the command palette's eager three-table read at page init measurably
  affects boot latency — the measurement that would justify or condemn the
  eager build — is runtime-only.
- Whether rebuilding the palette index on each open (instead of serving the
  snapshot) would exceed the low-single-digit-millisecond perception threshold
  the Sin cites (Dan Luu) — runtime-only; this is the absolute number the
  cache was never measured against.
- Whether replacing the login-time `orgs`-claim read (sessionHasReachableOrg)
  with a fresh GET /organizations adds perceptible latency to the login
  redirect — runtime-only.
- Whether palette staleness manifests in the manual browser flow (create an
  idea in-page or cross-tab, then palette-search for it without navigating)
  — browser regression territory per TEST-PLAN.md, not static analysis.
- Whether any of the 54 dead symbols or 28 test-only adapter verbs is
  scheduled for a named upcoming feature — intent lives outside the
  repository; no repo-root contract of record names a consumer for them.
- Whether the localStorage demo tier still serves real users anywhere:
  LocalStorageDbAdapter has zero production importers (five test files only),
  but CLAUDE.md declares it the demo tier — only a deployment, not the
  source, can confirm the second live use case it claims.
- Whether a slow-network UX requirement exists that would justify wiring
  withLoadingState's timeoutMs — a product/runtime question; statically it
  is unexercised.
- Whether the IndexedDB-era simulated-latency shim (DEFAULT_LATENCY_CONFIG,
  both call sites pass the same constant) models a latency profile the team
  measured — the Articles demand measurement, but the measurement, if made,
  is not in the repo.
- Whether the concurrent-refresh race manifests in real browsers: the window
  is between parallel 401s and the winner's putSessionCredentials; static
  reading proves the interleaving is unguarded, but only runtime (Promise.all
  timing + IndexedDB scheduling) shows the observed frequency.
- The cross-tab variant of finding 1 (two tabs refreshing the same credential
  at expiry) requires a live multi-tab browser session to demonstrate;
  statically there is no coordination channel for credentials.
- Whether any dynamic path mutates a row fetched through the memory tier
  (finding 2): no static mutation site was found, but aliased references
  escape the seam untyped, so only test execution / runtime tracing can prove
  absence.
- CLAUDE.md and ARCHITECTURE.md still describe api/db-localstorage.ts as 'the
  demo tier' while no non-test code instantiates it; whether any deployment
  artifact or manual flow still reaches that tier (with its comment-disclosed
  cross-tab last-writer-wins clobber) is a build/runtime question.
- Whether a mid-page 401 recovery visibly desyncs ctx.identity (captured
  org/claims) from the re-scoped wire token — requires a running browser
  with an expired or revoked token and observation of two reads on one
  context.
- Whether tab A switching org (writing the ACTIVE_ORG_KEY localStorage
  preference) silently re-targets tab B's session org at B's next 401 recovery
  — multi-tab runtime behavior only.
- Whether node --test's process-per-file isolation actually prevents any
  cross-file leakage of stubbed globals in this suite — asserted from runner
  semantics, not executed this run.
- Whether a minted jti could ever equal '' at runtime and collide with the
  parent_jti root sentinel — requires observing live token issuance
  (TEST-PLAN.md browser runtime).
- Whether buildNotReadyRow (web-app/workbox/index.ts:384) can ever receive an
  entry lacking problemCount in a live browser, rendering '0 nodes need
  attention' on a disabled row — requires a browser run.
- Whether the format.ts isNaN→DISPLAY_ABSENT branch ever fires against
  gate-validated stored timestamps in a live datastore — firing would prove
  a validation-gate gap; static reading cannot show it reachable.
- Whether any masked default actually fires at runtime — a notReady picker
  entry lacking problemCount (workbox/index.ts:384), an invitation row
  referencing a vanished organization (api/api.ts:1344), or the records/create
  page composed without its #record-create-name input (records/create.ts:42)
  — needs the browser regression run per TEST-PLAN.md; statically each
  producer appears to always supply the value.
- Whether IndexedDbBackend's no-op `post` default
  (api/backend-indexeddb.ts:159) is ever exercised in a live boot: the only
  statically-found constructor call (web-app/app/adapters/init.ts:24) passes
  postTablesChanged, but dynamic construction paths and the optional-parameter
  chain through IndexedDbDbAdapter (api/db-indexeddb.ts:16-18) can only be
  confirmed dead in a browser.
- Whether bezierAt's degenerate-path branch (`coords[0] ?? BEZIER_ORIGIN`,
  web-app/app/flow-graph.ts:1011) is reachable for the self-constructed paths
  the comment claims — only runtime gesture/render coverage can witness a
  malformed path.
- Whether any of the 20 ?.addEventListener-guarded elements is conditionally
  absent in some runtime UI state (only 4 of 20 verified unconditional by
  static read) — browser verification per TEST-PLAN.md
- Whether the live race window in web-app/identities/index.ts (create-identity
  dialog bound at init before identityListEl is assigned at line 54, making
  the refresh() guard at line 71 reachable during roster load) can actually be
  hit by a user — excluded from finding 2 for this reason; needs browser
  timing
- Whether provider-catalog drift exists in real stored data (an AI member's
  model id valid at write time but later removed from PROVIDER_MODELS), which
  would make the findProviderModel fallbacks in finding 3 live rather than
  dead — needs runtime data inspection
- Whether an invitation's organization_id can ever dangle (api/api.ts:1344
  organization_name ?? '') — no organization-delete path was found
  statically, but proving rows are never absent needs runtime/state-history
  inspection
- Whether the seats gauge visibly diverges from the memberships roster after
  an invitation accept — statically no reconciliation path exists, but
  observing the stale gauge requires the browser runtime.
- Whether any UI path can re-point a stamped organization_id via PUT at
  runtime — SCHEMA.md says the gate stamps on write, but end-to-end
  confirmation belongs to the browser suite.
- The section's O(n) equivalence claim for welded-FK vs join-table reads on
  IndexedDB — a measurement question ("let the matter be settled by
  MEASUREMENT"), and doctrinally moot since performance is the twelfth virtue
  and no defense.
- Whether a thrown EntityNotFound (api/db.ts:38 — deliberately NOT extending
  Error) ever escapes the api layer at runtime and reaches a generic
  `instanceof Error` narrowing site (web-app/app/error-helpers.ts:10,
  web-app/app/loading-states.ts:198), where its message would be invisible.
  Statically, every observed catch narrows on `instanceof EntityNotFound`
  itself; the residual escalation path is a runtime question — and the
  absence of inheritance is in any case the inverse of this section, belonging
  to failure-handling doctrine.
- Behavioral (as opposed to structural) Liskov substitutability of
  IndexedDbDbAdapter under a real browser IndexedDB connection (the open-hook
  timing) cannot be exercised statically; structurally no override exists in
  any BackedDbAdapter subclass, so contract divergence by lineage is
  impossible.
- Whether the theme-init.ts/root-redirect.ts localStorage bypass is a
  deliberate bootstrap-bundle-weight decision (both files already import other
  shims, so bundling cost cannot be confirmed or refuted statically; only a
  build-size measurement or author intent settles it)
- Which actual versions npx resolves for tsx/esbuild/tsc on the build machine,
  and whether a warm npx cache de-facto pins them — needs the runtime
  environment, not the repo
- Whether the hidden #sent-invitations-box (organization/index.ts:355) is
  visually indistinguishable at runtime from the legitimate
  no-pending-invitations state — a browser-rendering question.
- Whether a fault inside getIdentity actually manifests as a silent bounce to
  the identities list in a live browser (statically the null path reaches
  navigateTo('identities') at detail.ts:102, but runtime ordering with
  withLoadingState was not executed).
- Whether unhandled rejections from the void (async () => ...)() boot probes
  (e.g. command-palette.ts:941, adapter.hasSchema()) surface visibly in the
  console across all supported browsers — depends on each browser's
  unhandledrejection reporting.
- Whether a corrupt PHC credential string can arise from any live write path
  to make password-hash.ts:123 reachable — a data-lifecycle question only
  runtime seeding/fuzzing can answer; statically the parse-throw branch
  exists.
- Whether a mid-sequence fault in performUndo or handleBindRecord actually
  leaves observable half-applied state in the browser (flow reverted but
  version unconsumed; record binding deleted but not replaced) requires
  runtime fault injection against IndexedDB — statically the writes are
  separate API calls, not one transaction.
- Which fault classes besides EntityNotFound can actually propagate from
  adapter.clients.getById under each backend in production (determines how
  often 'unknown client' misreports an infrastructure fault) — a
  runtime/backend question.
- Whether IDBTransaction.objectStore() can throw InvalidStateError (finished
  transaction) on the specific code path guarded by backend-indexeddb.ts:88,
  which would make the MissingTableError rebranding misroute boot to snapshots
  recovery — browser runtime behavior.
- Whether withLoadingState's conflated null (error and empty both return null)
  ever causes a caller to skip work it should still do — e.g. wiring
  subscriptions after an empty first load — is browser-runtime behavior;
  belongs to TEST-PLAN.md manual regression.
- Whether the flow-designer selection/FSM discriminated-union dispatch stays
  single-sited under live pointer gesture streams cannot be confirmed
  statically; flow-designer gesture pointer-capture is a known MCP limitation
  per TEST-PLAN.md § Protocol.
- Whether the BroadcastChannel table-change message actually propagates and
  repaints sibling tabs within the ~1s the contract expects (TEST-PLAN.md K29)
  — browser runtime only; the static read confirms post/subscribe wiring but
  not delivery latency.
- Whether the toast finding manifests visually (fade clipped or dead node
  lingering) if var(--duration-slow) ever diverges from
  TOAST_TRANSITION_MS=300 — requires a browser render to observe; statically
  the two constants agree today (components-toast.css uses
  var(--duration-slow), toast.ts hardcodes 300ms).
- Whether subscribeInvitationChanges fires across the accept/decline flows
  without a reload (TEST-PLAN.md's manual browser surface) — the
  subscription wiring is verified statically; the event firing is runtime
  behavior.
- Whether the frozen ctx.identity / live-token divergence (finding 4) can
  actually misdirect a write in practice — an org-switch or 401-driven token
  rotation racing a mid-gesture await — is a browser-runtime race; static
  reading proves the structure, only TEST-PLAN.md-style in-browser testing can
  prove or refute the manifestation.
- Whether handleSave's two vessels (finding 3) can straddle a session-token
  rotation so the refetch reads a different world than the save wrote requires
  the same runtime race; statically only the split trace and dual identity
  snapshots are provable.
- The operational cost of the severed requestId trace (finding 1) cannot be
  measured until a server tier emits logs to correlate; today the only
  provable fact is that no log line and no request ever carries the id.
- Whether the schema was actually authored before the processes (the sin's
  design-order chronology) is a development-history fact; only its residue in
  code shapes is statically auditable. Git archaeology might approximate the
  design order but exceeds this audit's read-only scope.
- Whether the double parse of work_orders.flow_graph in one page load
  (web-app/workbox/detail.ts:237 then presenters/workbox-detail.ts:147)
  carries perceptible runtime cost can only be settled by measurement in a
  browser, which the static audit cannot perform.
- Whether the 19 dead class attributes in web-app/design-system/index.ts
  produce visible layout regressions (stats-grid, p-6, convert-grid never
  applying) — only a browser render of the design-system page can show the
  intended versus actual styling.
- Whether the rich why-comments in long functions (e.g. api/api.ts
  handleRequest's facade/fence narrative, api/access-token.ts's SEAM block)
  remain accurate to runtime behavior rather than stale — a static read
  shows internal consistency, but only the test suite and runtime tracing can
  prove the prose has not drifted from the code.
- Whether the ${''} splice idiom changes rendered output anywhere (e.g.
  whitespace-sensitive text nodes) compared to plain line breaks — requires
  rendering both forms in a browser.
- Whether the javascript:void(0) anchors in record-detail.ts behave
  identically to the href="#" house pattern for keyboard focus, Enter
  activation, and screen readers needs a browser — TEST-PLAN.md territory.
- That BackedDbAdapter's Object.assign store binding leaves no store undefined
  at runtime is fenced by DbStores typing on both sides, but only runtime
  instantiation (or the automated suite, not run here) proves the assign
  precedes first use.
- Whether LABEL_CHAR_WIDTH=7 (and design-system's re-hardcoded `label.length *
  7 + 12`) actually fits rendered glyph widths at the canvas font — visual
  rendering, browser-only (TEST-PLAN.md flow-designer cases).
- Whether the unnamed 800 ms spinner delay in the auth submit handler is
  intended UX pacing or a stale simulated-latency remnant — requires runtime
  observation of the sign-in flow.
- Whether the 160 icon-size call sites render consistently with
  DESIGN-SYSTEM.md §9's context table (the 10/12/14/18/28 px off-table values
  may be deliberate visual tuning or drift) — visual regression,
  browser-only.
- Whether the composed build output (compose.ts temp build dir and the ZIP
  layout) preserves the shallow source structure at serve time — requires
  running ./build or ./serve, which the read-only mandate forbids;
  PAGE_REGISTRY's sourceDir/sourceFile contract asserts the alignment
  statically but only a build proves it.
- Whether IndexedDB's callback-shaped browser API (Promise executor wrapping
  onupgradeneeded) permits a flatter #openConnection without changing commit
  semantics — judging the refactor's safety needs the browser runtime, not
  static reading.
- Whether the pre-bundle theme-init/root-redirect IIFEs operate under a
  bundle-size budget that motivated bypassing the preferences shim — ./build
  is forbidden to this read-only audit, so the composed bundle weight of
  importing adapters/preferences.ts (which pulls logger.ts) was not measured.
- Whether any foreign vocabulary surfaces at runtime through dynamically
  constructed keys (dataset attributes, BroadcastChannel message payload table
  names rendered to users) — requires a browser session, out of scope for a
  static audit.
- Whether npm would rewrite package.json with 2-space indentation on a future
  package operation (which would make its indent toolchain-demanded and excuse
  the finding site) — requires running npm, a write operation.
- Whether SCHEMA.svg's 91-char opening <svg> tag could be attribute-wrapped by
  the generator without affecting SVG renderers — a rendering/runtime
  question; statically the file is generator-owned
  (web-app/app/generate-schema-svg.ts) and drift-gated by
  ./generate-schema-svg --check, so the formatter has spoken and its output
  was judged compelled.
- Authorship of .claude/settings.local.json's two over-length lines and
  2-space indent is attributed to the Claude Code harness as the writing
  toolchain (permission entries are machine-appended); inferred from the
  file's role, not provable statically.
- "Every commit on master builds, functions, and passes tests" — verifying
  requires checking out each of 2294 commits and running the full suite at
  each; both the working-tree writes and full-suite runs are forbidden to this
  audit. Static proxies are clean (0 WIP/fixup subjects, ./validate gate
  exists), but the covenant itself is runtime-only.
- Whether the 23 local commits ahead of origin/master each build and pass
  before the eventual push (the pre-push 'rebase and amend until that holds'
  covenant) — same constraint as above.
- Force-push history beyond the local reflog window — git reflog show
  origin/master records 0 'forced-update' entries, but the reflog only covers
  fetches performed from this clone; only the GitHub-side audit log could
  witness the full remote history.
- Whether builds were historically produced from uncommitted state before the
  clean-tree gate existed in ./build — past invocations leave no trace; only
  the present gate is observable.
- Whether `git commit --amend --no-edit` is practiced as the Office's 'mercy'
  — local-only reflog evidence of other contributors' machines is
  unobservable from this clone.
- Whether mixed-width `at` stamps exist in any real deployment's data — the
  admission path is statically proven, but actual persisted rows are runtime
  state in each user's IndexedDB.
- Whether editing a mock-seeded project in the browser actually rewrites
  start_date from a 6-digit zulu instant to a date-only string — the writer
  path is statically traced (toDateInputValue slice on render, raw draft value
  on save) but only the live edit flow confirms it end-to-end.
- Whether any target browser's Date provides better than millisecond
  resolution — the 6-digit pad presents millisecond truth as microsecond
  width; 'fullest the environment provides' can only be measured at runtime
  per environment.
- Whether the ctx.identity-vs-live-token divergence window in withAuthRecovery
  is reachable under real browser timing (boot races, parallel recoveries
  swapping the global token mid-operation) — only runtime can demonstrate
  the interleaving.
- Whether two reads through one ctx actually interleave with a cross-tab
  IndexedDB write, practically falsifying ARCHITECTURE.md's 'same snapshot'
  claim — statically there is no isolation mechanism, but the observable
  inconsistency needs a live two-tab run.
- The operational cost of the dead requestId — whether console diagnosis of
  real failures is materially harmed by trace-less log lines — is an
  operator/runtime question, not a static one.
- Intermittency (the false prophet) is only provable by repeated full-suite
  runs across machines and load; the audit mandate forbids running the full
  suite. Single-file witness runs (store-state 8/8, channels 6/6) passed under
  TZ=UTC this run.
- Whether the 2ms ordering pauses (tests/store-state.test.ts:70,
  tests/adapters-work-orders.test.ts:174 — used at 5 call sites) hold under
  extreme CI load or an NTP backward clock step is a runtime question;
  statically, setTimeout(2) guarantees Date.now() advances and both sites
  document the rationale.
- DOM-driven behavior (gestures, layout, StorageEvent timing, BroadcastChannel
  cross-tab refresh) is delegated to TEST-PLAN.md manual browser regression
  per CLAUDE.md § Testing; its determinism and isolation cannot be statically
  audited here.
- Rendered color contrast under real compositing (opacity-50 archived cards,
  gradients, font smoothing, both themes) — token math here is the static
  approximation; browser measurement per TEST-PLAN.md
- Whether screen readers actually announce the one-time credential reveal, the
  6 s auto-dismissing toasts, and the command-palette result count in usable
  time — needs assistive-technology runtime
- Visible focus appearance and complete tab order across composed pages
  (including whether the unfocused command-palette input reads as focused
  inside its modal) — needs browser
- Touch-target adequacy on mobile (btn-xs computes 1.75rem = 28px, below the
  44px guideline) — needs rendered layout and viewport measurement
- Whether focus escaping an open dialog (no Tab trap) lands on visually
  obscured but interactive background content in practice — needs browser
  keyboard walk
- Whether the 51 tests/ @ts-expect-error directives are exercised by any
  type-checker at all in practice (no tsconfig covers tests/; editor
  inferred-project behavior is a tooling-runtime question)
- Whether the logger.ts eslint-disable comment serves any developer-local
  uncommitted tooling — nothing in the repo invokes ESLint

End of report. Written once by the orchestrator per AUDIT.md § Procedure step
4.
