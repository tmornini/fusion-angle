Take a look at this URI schema.

Please analyze how this fits into the applications's state needs, what verbs need to be implemented, what's missing, etc.

Know that every entity will be kept in a backend structured in this way: ~/.claude/plans/go-to-church-binary-stonebraker.md.

That mechanism will replace the existing ledger's and common states system by moving said state into each message stored message.

└─|─ /invitations/ • RECONCILED: derived view, but NOT a registered family — the permanent side channel (Author gate 2); grant/accept synthesize PUT-shaped document pairs off the route table, rows derive from PUT-method document heads at /invitations/ and state from op-address pair presence (accepted/declined/revoked/pending), the facade's 404-only verb regime preserved — see the roster seam FLIPPED 2026-07-06 block, go-to-church-peaceful-castle.md §Phases 3…N
  |  └── :id
└─|─ /memberships/ • RECONCILED: shipped as the EIGHTH registered family (organizationNested:true, 'stateless' — a pure join relation, no lifecycle), collection + entity GETs served by the generic document handlers, DELETE a marked tombstone; the members/human-members/ai-members derive-on-read directory is realized over this ∩ the ninth-through-eleventh global-plane member families — see the same block (Author gate 1)
  |  └── :id
└─|─ /records/ • derived view over org-nested canonical storage
  |  └── :id
  |      └── /attribute-definitions.          • RECONCILED: shipped as the sibling record-attributes/:id family (canonical storage, per-attribute documents, 'stateless', the sixth registered family), not a nested single document — see the records FLIPPED 2026-07-05 block, go-to-church-peaceful-castle.md §Phased sequence
  |      └── /attribute-values                • RECONCILED: NOT built — no consumer; would derive the latest value per attribute (same block, B2)
└─|─ work-orders/ • derived view over org-nested canonical storage
  |  └── :id/
  |      └── claim
  |      └── transition
└─|─ /identities/
  |  └── :id                                   • default-organization is an attribute of the identity itself
  |      └─|─ /credentials                     • all of them, single document
  |      └─|─ /notifications                   • postgres LISTEN/NOTIFY for all changes to identity
  |      └─|─ /pii                             • full physical removal from the DB required, i.e. physical delete, all others: Delete-At: header
  |      └─|─ /role-grants                     • all of them, single document
  |      └─|─ /third-party-identity-providers  • all of them, single document
  |      └─|─ /token-revocations               • RECONCILED: shipped FLAT, not nested here — GET|PUT /identity-token-revocations/:id (GLOBAL-plane, no organization_id), the answer WAS "PUT/GET"; GET stays admin-only, PUT widened to member-tier SELF-target only at WP8 (Phase 13 Task 8) — a member may revoke its own chain, naming another identity still requires admin — see the Auth RECONCILED 2026-07-06 block, go-to-church-peaceful-castle.md §Phases 3…N
  |      └─|─ /memberships/                    • /memberships/ with forced and/or filtered identity
  |      └─|─ /organizations/                  • /organizations/ with forced and/or filtered identity
  |      └─|─ /work-orders/                    • /work-orders/ with forced and/or filtered identity
  |      └─|─ /tokens/                         • RECONCILED: shipped FLAT, not nested here — GET /identity-tokens, GET|PUT /identity-tokens/:id, POST /identity-tokens/:jti/rotation, POST /identity-tokens/:jti/revocation; both GETs derive from the pair plane (Phase 13 Task 6), PUT is pair-only and rotation/revocation append event pairs only (Task 5) — Phase 13 Task 9 retired the identity_tokens row store outright (SNAPSHOT_SCHEMA_VERSION 1→2, alongside authorization_codes) — see the Auth RECONCILED 2026-07-06 block, go-to-church-peaceful-castle.md §Phases 3…N
  |        |  └── :id
  |        |      ├── /rotation                • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST, if not, a PUT/GET pair? — POST, see above
  |        \
  |         \- identity authz realm 
└─|─ /organizations/
  |  └─|─ :id
  |    |  └── /notifications                  • postgres LISTEN/NOTIFY for all changes to organization
  |    |  └── /objectives                     • RECONCILED: shipped as per-objective documents at objectives/:id (the seventh registered family, 'simple' + lifecycle 'stateless'), collection served by the generic document handler over per-entity heads, revision history as per-objective message history at objectives/:id/revisions/, NOT a single org document — see the objectives FLIPPED 2026-07-05 block, go-to-church-peaceful-castle.md §Phased sequence (Author gates 1/3)
  |    |  └── /flows/
  |    |      └── :id
  |    |          └── /undo                    • RECONCILED: undo-as-replay (Phase 14 Task 8) — body shrinks to {eventId, at}, both still client-minted; the restore target resolves SERVER-SIDE pre-tx by replaying this flow's OWN flows/:id document-pair history against its OWN undo operation-pair history (stack+pointer, cursor keyed by the undo pairs' stored REQUEST at, never the response at); graphDelta/revivals are now SERVER-computed (SIDECAR-KEEP: the wire SHAPE persists, the client is never told the target to diff against); flow_versions no longer receives a write on this path — routes/table REMAIN (DELETE NOTHING), Phase Final retires — see .superpowers/sdd/progress.md, Phase 14 Task 8
  |    |          └── /tags/                   • RECONCILED: flow tags (Phase 14 Task 9) — GET|PUT|DELETE flows/:id/tags/:name, SIMPLE class (the locked four-outcome table is structurally MOOT here — isLockedWrite exact-matches flows/:id, never this 4-segment address); the codebase's FIRST document family with NO backing table at all, derived entirely from the pair plane — flow_response_id (one flow document pair's own pinned response id) is the tag's only body field; DELETE is a marked tombstone, no row to splice; API-only this phase, no designer UI — see .superpowers/sdd/progress.md, Phase 14 Task 9
  |    |              └── :name
  |    |  └── /ideas/
  |    |      └── :id
  |    |  └── /memberships/                   • canonical storage (tenancy covenant)
  |    |  └── /projects/
  |    |      └── :id
  |    |          └── /scores                 • RECONCILED: NOT built — no consumer; the baseline and actual scores are shipped as per-row documents at projects/:id/objective-baseline-scores and objective-actual-scores, each flipped via a bespoke per-parent derive module — see the same block (Author gate 2)
  |    |  └── /records/                       • canonical storage
  |    |  └── /work-orders/                   • canonical storage
  \    \
   \    \- organization membership authz realm
    \- administration authz realm

└─|─ index.html
└─|─ /authentication/
  |  ├── token
  |  └── authorize
└─|─ /snapshots/
  |  └── export
  |  └── import
  |  └── mock-data
  |  └── pristine
  \
   \- public realm
