Take a look at this URI schema.

Please analyze how this fits into the applications's state needs, what verbs need to be implemented, what's missing, etc.

Know that every entity will be kept in a backend structured in this way: ~/.claude/plans/go-to-church-binary-stonebraker.md.

That mechanism will replace the existing ledger's and common states system by moving said state into each message stored message.

└─|─ /invitations/ • RECONCILED: derived view, but NOT a registered family — the permanent side channel (Author gate 2); grant/accept synthesize PUT-shaped document pairs off the route table, rows derive from PUT-method document heads at /invitations/ and state from op-address pair presence (accepted/declined/revoked/pending), the facade's 404-only verb regime preserved — Phase 15 gate 6 re-homes grant email onto deriveIdentityPiiRows and pendingInvitationFor/loadInvitation onto deriveInvitations (no live invitations-table decision read) — see the roster seam FLIPPED 2026-07-06 block + Phase 15 FLIPPED, go-to-church-peaceful-castle.md §Phases 3…N
  |  └── :id
└─|─ /memberships/ • RECONCILED: shipped as the EIGHTH registered family (organizationNested:true, 'stateless' — a pure join relation, no lifecycle), collection + entity GETs served by the generic document handlers, DELETE a marked tombstone; the members/human-members/ai-members derive-on-read directory is realized over this ∩ the ninth-through-eleventh global-plane member families — see the same block (Author gate 1)
  |  └── :id
└─|─ /records/ • derived view over org-nested canonical storage
  |  └── :id
  |      └── /attribute-definitions.          • RECONCILED: shipped as the sibling record-attributes/:id family (canonical storage, per-attribute documents, 'stateless', the sixth registered family), not a nested single document — see the records FLIPPED 2026-07-05 block, go-to-church-peaceful-castle.md §Phased sequence
  |      └── /attribute-values                • RECONCILED: NOT built — no consumer; would derive the latest value per attribute (same block, B2)
└─|─ work-orders/ • derived view over org-nested canonical storage
  |  └── :id/
  |      └── claim                            • RECONCILED: claim graph head from workOrderDocumentHeadFor (Phase 15 Task 2); contention 409 + nonexistent-WO 404 + foreign-WO 403 held — see Phase 15 FLIPPED + honest HTTP status covenant
  |      └── transition                       • RECONCILED: dangling state_event_id on a field value → 400 at the gate (Phase 15 Task 3, wire delta 4; forged clients only)
  |      └── release                          • RECONCILED: POST work-orders/:id/release — named unclaim op, 204, read-decide-append, replayed at derive; foreign-WO 403; nonexistent-WO 404
└─|─ /identities/
  |  └── :id                                   • default-organization is an attribute of the identity itself
  |      └─|─ /credentials                     • all of them, single document
  |      └─|─ /notifications                   • TARGET-STATE: postgres LISTEN/NOTIFY for all changes to identity
  |      └─|─ /pii                             • full physical removal from the DB required, i.e. physical delete, all others: Delete-At: header
  |      └─|─ /registration                    • RECONCILED (clients retirement): client registration facet — single-slot PUT-overwrite document (grant_types, redirect_uris, jwks, aud, status), admin-realm writes, kind-'service' gate; grantClientCredentials derives it pre-token (bearer-exempt precedent); DELETE tombstone = deregistration
  |      └─|─ /role-grants                     • all of them, single document
  |      └─|─ /third-party-identity-providers  • all of them, single document
  |      └─|─ /token-revocations               • RECONCILED: shipped FLAT, not nested here — GET|PUT /identity-token-revocations/:id (GLOBAL-plane, no organization_id), the answer WAS "PUT/GET"; GET stays admin-only, PUT widened to member-tier SELF-target only at WP8 (Phase 13 Task 8) — a member may revoke its own chain, naming another identity still requires admin — see the Auth RECONCILED 2026-07-06 block, go-to-church-peaceful-castle.md §Phases 3…N
  |      └─|─ /memberships/                    • /memberships/ with forced and/or filtered identity
  |      └─|─ /organizations/                  • /organizations/ with forced and/or filtered identity
  |      └─|─ /work-orders/                    • /work-orders/ with forced and/or filtered identity
  |      └─|─ /tokens/                         • RECONCILED: shipped FLAT, not nested here — GET /identity-tokens, GET|PUT /identity-tokens/:id, POST /identity-tokens/:jti/rotation, POST /identity-tokens/:jti/revocation; both GETs derive from the pair plane (Phase 13 Task 6), PUT is pair-only and rotation/revocation append event pairs only (Task 5) — Phase 13 Task 9 retired the identity_tokens row store outright (alongside authorization_codes) — see the Auth RECONCILED 2026-07-06 block, go-to-church-peaceful-castle.md §Phases 3…N
  |        |  └── :id
  |        |      ├── /rotation                • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST, if not, a PUT/GET pair? — POST, see above
  |        \
  |         \- identity authz realm
└─|─ /organizations/
  |  └─|─ :id
  |    |  └── /notifications                  • TARGET-STATE: postgres LISTEN/NOTIFY for all changes to organization
  |    |  └── /objectives                     • RECONCILED: shipped as per-objective documents at objectives/:id (the seventh registered family, 'simple' + lifecycle 'trio' — genesis at create, archive/reactivate via the document PUT), collection served by the generic document handler over per-entity heads, revision history as per-objective message history at objectives/:id/revisions/, NOT a single org document — see the objectives FLIPPED 2026-07-05 block + states-address retirement, go-to-church-peaceful-castle.md §Phased sequence (Author gates 1/3)
  |    |  └── /flows/
  |    |      └── :id
  |    |          └── /undo                    • RECONCILED: undo-as-replay (Phase 14 Task 8) — body shrinks to {eventId, at}, both still client-minted; the restore target resolves SERVER-SIDE pre-tx by replaying this flow's OWN flows/:id document-pair history against its OWN undo operation-pair history (stack+pointer, cursor keyed by the undo pairs' stored REQUEST at, never the response at); graphDelta/revivals are now SERVER-computed (SIDECAR-KEEP: the wire SHAPE persists, the client is never told the target to diff against); flow_versions consume/publish stopped (Phase 14), routes RETIRED (Phase 15 Task 7, router 404), TABLE DELETED (Phase Final) — see Phase 14/15/Final FLIPPED, go-to-church-peaceful-castle.md §Phases 3…N
  |    |          └── /versions/               • RECONCILED: RETIRED + DELETED — Phase 15 Task 7 router-404'd GET|POST /flows/:id/versions and GET|PUT|DELETE /flows/:id/versions/:vid; Phase Final DELETED the flow_versions table with the rest of the row plane
  |    |          └── /tags/                   • RECONCILED: flow tags (Phase 14 Task 9) — GET|PUT|DELETE flows/:id/tags/:name, SIMPLE class (the locked four-outcome table is structurally MOOT here — isLockedWrite exact-matches flows/:id, never this 4-segment address); the codebase's FIRST document family with NO backing table at all, derived entirely from the pair plane — flow_response_id (one flow document pair's own pinned response id) is the tag's only body field; DELETE is a marked tombstone, no row to splice; post-Phase-Final every family shares this no-table posture — see .superpowers/sdd/progress.md
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

└─|─ (lifecycle history)                       • RECONCILED (states-address retirement as-built): NINE GET registrations, wire (at, id) DESC (index 0 = current) — (1–5) GET ideas|projects|records|flows|objectives/:id/history via documentStateHistoryHandler(derive*StateHistory, table) → StateEntity[]; empty → missedReadError → foreign 403 / absent 404; (6) GET members/:id/history via deriveMemberStates filter → StateEntity[] DESC, global miss → EntityNotFoundError 404; (7) GET work-orders/:id/history via workOrderHistoryFor → WorkOrderHistoryEventEntity (field_values inline; claim/birth/release carry []); empty → missedReadError('work_orders'); (8) GET work-orders/history via deriveWorkOrderHistories → same WO shape, always 200 array; (9) GET objectives/history via deriveObjectiveHistories → StateEntity only, always 200 array; route order load-bearing (literal history before :id); matchesOnSegmentBoundary extends family GET grants — no new auth entries; head-state trio (state, state_at, state_event_id) embeds on ideas/projects/records/objectives/members GET rows (not flows; work-orders stay stateless); field values have NO successor GET (RESTRICT still uses stateFieldValuesFrom + stateEventVisibilityFor); bulk lifecycle collection + bare event-append + per-entity current-state alias + nested field-values write/GET RETIRED → router 404 (unauth → 401 first); states TABLE DELETED (Phase Final); lifecycle writes ride document-trio PUTs + named ops (work-order create/claim/transition/release, invitations) — see API.md §2.10 / §5.19 + honest HTTP status covenant
└─|─ /clients[/:id]                            • RETIRED (clients retirement): noun retired — client = kind-'service' identity + /identities/:id/registration facet; act.sub carries the acting client on authorization_code redemption; clients TABLE DELETED (TABLE_NAMES 2 — pure message plane); rawReadRow retired with it
└─|─ index.html
└─|─ /authentication/
  |  ├── token
  |  └── authorize
└─|─ /snapshots/
  |  └── export                               • TARGET-STATE: not shipped as a dedicated route today — export is client-side over GET /snapshots/schema (full snapshot body); a first-class /snapshots/export remains a known future addition
  |  └── import                               • RECONCILED: shipped as PUT /snapshots/import (atomic clear+put; pure message-plane keys requests+responses; no schema version marker)
  |  └── mock-data                            • RECONCILED: POST /snapshots/mock-data (demo seed; 1506 pairs / bootstrap 13 absolute post states-address retirement; SeededCredentials re-pointed off identity rows at Final Task 1(d))
  |  └── schema                               • RECONCILED: GET|DELETE /snapshots/schema (existence + full export, or drop)
  |  └── bootstrap                            • RECONCILED: POST /snapshots/bootstrap (pristine minimal seed)
  |  └── pristine                             • TARGET-STATE: deferred — bootstrap covers the minimal seed today; a dedicated /snapshots/pristine remains a known future addition if the two seed paths must diverge on the wire
  \
   \- public realm
