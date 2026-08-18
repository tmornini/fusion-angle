URI tree of the HTTP surface; source of record is api/routes.ts (the route table), api/api.ts (handleRequest pre-match + facades), api/invitations-domain.ts (the invitation sub-router), and api/organization-requests.ts (the
organization/default-organization sub-routers).

└─|─ /invitations/ • RECONCILED: derived view, but NOT a registered family — the permanent side channel (Author gate 2); grant/accept synthesize PUT-shaped document pairs off the route table, rows derive from PUT-method document heads at /invitations/ and state from op-address pair presence (accepted/declined/revoked/pending), the facade's 404-only verb regime preserved — Phase 15 gate 6 re-homes grant email onto deriveIdentityPiiRows and pendingInvitationFor/loadInvitation onto deriveInvitations (no live invitations-table decision read) — see the roster seam FLIPPED 2026-07-06 block + Phase 15 FLIPPED
  |  └── :id
└─|─ /memberships/ • RETIRED: global family, router 404 — seats live at organizations/:id/members
  |  └── :id
└─|─ /members/ • RETIRED: global family, router 404 — seats live at organizations/:id/members
  |  └── :id
  |      └── /history
└─|─ /ai-members/ • RETIRED: global family, router 404
  |  └── :id
└─|─ /ai-agents/ • RECONCILED: fourteenth registered family, GLOBAL plane ('stateless'); not a member and not an identity; GET collection; GET|PUT :id document (name, description, skill_focus, model)
  |  └── :id
└─|─ /human-members/ • RETIRED: global family, router 404
  |  └── :id
└─|─ /current-member • RETIRED: router 404
└─|─ /identity-pii • RETIRED: router 404 — nested GET|PUT|DELETE identities/:id/pii is the only PII HTTP
└─|─ work-orders/ • RECONCILED: registered org-nested document family (organizationNested:true, concurrency:'simple', lifecycle:'stateless' — flat wire; storage uri_prefix nests org), collection + entity GETs with optional binding enrichment (instance_id + record_type_id), PUT via documentPutHandler, POST create, named ops PUT/GET/DELETE claim, POST transition, PUT binding (create-only); POST release retired (404); no document DELETE
  |  └── :id/
  |      └── claim                            • RECONCILED: PUT/GET/DELETE work-orders/:id/claim — first PUT 201; GET {member_id, expires_at} 200 / 404 only when unclaimed; DELETE releases 204; POST 405; contention 409 + nonexistent-WO 404 + foreign-WO 403 — see API.md §3.18
  |      └── transition                       • RECONCILED: POST work-orders/:id/transition — post-Phase-2 body (instance_id + record_type_id + set/clear); If-Match preconditions bound instance head (named RFC 9110 §13.1.1 deviation); op + revision one-tx; legacy fieldValues key → 400 at the gate; pure moves carry neither If-Match nor asserts — see API.md §3.19
  |      └── release                          • RETIRED: POST work-orders/:id/release — router 404; unclaim is DELETE work-orders/:id/claim — see API.md §3.35
  |      └── binding                          • RECONCILED: PUT work-orders/:id/binding — create-only bind, first 201, rebind 409, POST 405; current bind derived from op pairs (claim precedent); WO GET embeds instance_id + record_type_id — see API.md §3.34
└─|─ /identities/
  |  └── :id
  |      └─|─ /default-organization            • RECONCILED: GET|PUT simple document (api/organization-requests.ts) — self-only tree-ownership gate; pair-plane document at /identities/:id/default-organization/; PUT { organization_id } must be a live seat else 400; GET 404 if never SET; revoke does not rewrite it; token resolution uses SET if live seat else PRIMARY else deny
  |      └─|─ /credentials                     • RECONCILED: collection GET returns rows[]; not a singleton document
  |      |  └── :cid                           • GET|PUT per-credential document at identities/:id/credentials/:cid
  |      └─|─ /notifications                   • TARGET-STATE: postgres LISTEN/NOTIFY for all changes to identity
  |      └─|─ /pii                             • GET|PUT|DELETE nested document; GET self-or-admin; PUT/DELETE self-or-admin; full physical removal from the DB required, i.e. physical delete (sole hard-delete zone; no Delete-At header)
  |      └─|─ /registration                    • RECONCILED (clients retirement): client registration facet — single-slot PUT-overwrite document (grant_types, redirect_uris, jwks, aud, status), admin-realm writes, kind-'service' gate; grantClientCredentials derives it pre-token (bearer-exempt precedent); DELETE tombstone = deregistration
  |      └─|─ /role-grants                     • RETIRED (membership type + claim roles)
  |      └─|─ /providers                       • RECONCILED: GET identities/:id/providers + GET|PUT identities/:id/providers/:eid (GLOBAL multi-document event ledger, nested under the identity); flat GET identity-providers + GET|PUT identity-providers/:id RETIRED (router 404) — name third-party-* retired
  |      └─|─ /token-revocations               • RECONCILED: GET|PUT identities/:id/token-revocations/:rid (GLOBAL-plane, no organization_id, no collection route); GET stays admin-only; PUT member-tier SELF-target only (path identity vs actor) — a member may revoke its own chain, naming another identity still requires admin; path stamps identity_id; flat GET|PUT /identity-token-revocations/:id RETIRED (router 404) — see the Auth RECONCILED 2026-07-06 block
  |      └─|─ /tokens/                         • RECONCILED: GET identities/:id/tokens + GET|PUT identities/:id/tokens/:tid + POST identities/:id/tokens/:jti/rotation + POST identities/:id/tokens/:jti/revocation (GLOBAL event ledger, nested under the identity); both GETs derive from the pair plane (Phase 13 Task 6), PUT is pair-only and stamps identity_id from the path, rotation/revocation append event pairs only (Task 5) — Phase 13 Task 9 retired the identity_tokens row store outright (alongside authorization_codes); flat GET /identity-tokens + GET|PUT /identity-tokens/:id + POST /identity-tokens/:jti/rotation + POST /identity-tokens/:jti/revocation RETIRED (router 404) — see the Auth RECONCILED 2026-07-06 block
  |        |  └── :id
  |        |      ├── /rotation                • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST? — YES, see the /tokens/ RECONCILED note above
  |        |      └── /revocation              • is this a POST, if not, a PUT/GET pair? — POST, see above
  |        \
  |         \- identity authz realm
└─|─ /organizations/
  |  └─|─ :id
  |    |  └── /notifications                  • TARGET-STATE: postgres LISTEN/NOTIFY for all changes to organization
  |    |  └── /objectives                     • RECONCILED: shipped as per-objective documents at objectives/:id (the seventh registered family, 'simple' + lifecycle 'trio' — genesis at create, archive/reactivate via the document PUT), collection served by the generic document handler over per-entity heads, NOT a single org document — see the objectives FLIPPED 2026-07-05 block + states-address retirement (Author gates 1/3)
  |    |      └── :id
  |    |          └── /revisions/
  |    |              └── :rid                • RECONCILED: objectives/:id/revisions — GET collection under objective; PUT leaf only (bespoke deriveObjectiveRevisions)
  |    |  └── /flows/
  |    |      └── :id
  |    |          └── /undo                    • RECONCILED: undo-as-replay (Phase 14 Task 8) — body shrinks to {eventId, at}, both still client-minted; the restore target resolves SERVER-SIDE pre-tx by replaying this flow's OWN flows/:id document-pair history against its OWN undo operation-pair history (stack+pointer, cursor keyed by the undo pairs' stored REQUEST at, never the response at); graphDelta/revivals are now SERVER-computed (SIDECAR-KEEP: the wire SHAPE persists, the client is never told the target to diff against); flow_versions consume/publish stopped (Phase 14), routes RETIRED (Phase 15 Task 7, router 404), TABLE DELETED (Phase Final) — see Phase 14/15/Final FLIPPED
  |    |          └── /versions/               • RECONCILED: RETIRED + DELETED — Phase 15 Task 7 router-404'd GET|POST /flows/:id/versions and GET|PUT|DELETE /flows/:id/versions/:vid; Phase Final DELETED the flow_versions table with the rest of the row plane
  |    |          └── /tags/                   • RECONCILED: flow tags (Phase 14 Task 9) — GET|PUT|DELETE flows/:id/tags/:name, SIMPLE class (the locked four-outcome table is structurally MOOT here — isLockedWrite exact-matches flows/:id, never this 4-segment address); the codebase's FIRST document family with NO backing table at all, derived entirely from the pair plane — flow_response_id (one flow document pair's own pinned response id) is the tag's only body field; DELETE is a marked tombstone, no row to splice; post-Phase-Final every family shares this no-table posture
  |    |              └── :name
  |    |          └── /work-orders/
  |    |              └── :woid               • RECONCILED: flows/:id/work-orders — flow↔work-order join; GET collection; PUT leaf (bespoke deriveFlowWorkOrders)
  |    |          └── /records/
  |    |              └── :frid               • RECONCILED: flows/:id/records — flow↔record-type binding; GET collection + GET|PUT|DELETE leaf (bespoke deriveFlowRecords)
  |    |  └── /ideas/
  |    |      └── :id
  |    |          └── /conversion             • RECONCILED: POST ideas/:id/conversion — promote idea→project (+ baseline score pairs) in one tx
  |    |          └── /submissions/
  |    |              └── :sid                • RECONCILED: ideas/:id/submissions — GET collection under idea; PUT leaf only
  |    |  └── /members/:identity-id           • seat document (Task 52) — accept writes PUT /organizations/:organization-id/members/:identity-id at the invitation's organization, same Operation-ID; seats win leftover /memberships rows until Task 55
  |    |  └── /memberships/                   • leftover join storage until Task 55 (tenancy dual-read)
  |    |  └── /projects/
  |    |      └── :id
  |    |          └── /flows/
  |    |              └── :pfid               • RECONCILED: projects/:id/flows — project↔flow join; GET collection; PUT leaf (bespoke deriveProjectFlows)
  |    |          └── /scores                 • RECONCILED: NOT built as /scores — no consumer; live score documents are the sibling objective-*-scores leaves below
  |    |          └── /objective-baseline-scores/
  |    |              └── :sid                • RECONCILED: projects/:id/objective-baseline-scores — GET collection under project; PUT leaf (bespoke deriveBaselineScores)
  |    |          └── /objective-actual-scores/
  |    |              └── :sid                • RECONCILED: projects/:id/objective-actual-scores — GET collection under project; PUT leaf (bespoke deriveActualScores)
  |    |  └── /record-types/                  • RECONCILED (org-nested record-types wave): nested-primary wire = storage; NO dual-wire /records facade; in-table match BEFORE facade (dispatch inversion); path org must match fenced claim else 403 (no auto-exchange); member READ / admin MUTATION on schema; flat /records and /record-attributes RETIRED (router 404) — see API.md §2.8 / §5.7 / §5.20
  |    |      └── :record-type-id
  |    |          └── /history                • lifecycle-trio history (member GET; one of the nine lifecycle registrations)
  |    |          └── /attributes/
  |    |              └── :attribute-id       • RECONCILED: nested attributes (was flat record-attributes); 'stateless' SIMPLE PUT class; admin mutation; RESTRICT DELETE (WO frozen graph + live flow-graph + state field values + live instance heads carrying a value); body drops record_id (type id rides the uri prefix); ACL arrays read_roles/write_roles on the document
  |    |          └── /instances/
  |    |              └── :instance-id        • RECONCILED: first-class data rows; member path-tier + per-attribute ACL; PUT create-only (409 if address spent, including tombstone); PATCH If-Match required (428 missing / 412 stale); DELETE tombstone-wins + placement RESTRICT (non-terminal bound WO → 409 describeReferrers voice; W5 no-abandon residual); GET projects by read ACL + strong ETag header (list rows embed etag field); full-state revision heads store {values}; wire PATCH is operation-plane set/clear — see API.md §5.20
  |    |                  └── /history        • value-revision chain (NOT a tenth lifecycle clone): {at, etag, values} DESC, projected by caller's CURRENT read ACL — the one value-history registration beside the nine lifecycle GETs
  |    |  └── /work-orders/                   • storage uri_prefix nests org (flat wire is top-level work-orders/ above)
  \    \
   \    \- organization membership authz realm
    \- administration authz realm

└─|─ (lifecycle history)                       • RECONCILED (states-address retirement as-built + org-nested record-types wave): NINE lifecycle GET registrations + ONE value-history (instances), wire (at, id) DESC (index 0 = current) — (1–5) GET ideas|projects|flows|objectives/:id/history and GET organizations/:org/record-types/:id/history via documentStateHistoryHandler(derive*StateHistory, table) → StateEntity[]; empty → missedReadError → foreign 403 / absent 404; (6) GET members/:id/history via deriveMemberStates filter → StateEntity[] DESC, global miss → EntityNotFoundError 404; (7) GET work-orders/:id/history via workOrderHistoryFor → WorkOrderHistoryEventEntity (field_values inline; claim/birth/release carry []); empty → missedReadError('work_orders'); (8) GET work-orders/history via deriveWorkOrderHistories → same WO shape, always 200 array; (9) GET objectives/history via deriveObjectiveHistories → StateEntity only, always 200 array; (value-history) GET organizations/:org/record-types/:type/instances/:id/history → {at, etag, values}[] projected by current read ACL — NOT a lifecycle-trio clone; route order load-bearing (literal history before :id); matchesOnSegmentBoundary extends family GET grants — no new auth entries; head-state trio (state, state_at, state_event_id) embeds on ideas/projects/record-types/objectives/members GET rows (not flows; work-orders stay stateless; instances carry values not trio); field values have NO successor GET (RESTRICT still uses stateFieldValuesFrom + stateEventVisibilityFor); bulk lifecycle collection + bare event-append + per-entity current-state alias + nested field-values write/GET + flat /records[/:id][/history] + flat /record-attributes[/:id] RETIRED → router 404 (unauth → 401 first); states TABLE DELETED (Phase Final); lifecycle writes ride document-trio PUTs + named ops (work-order create/claim/transition/release, invitations); instance value writes ride PUT genesis / PATCH If-Match / DELETE tombstone — see API.md §2.10 / §5.19 / §5.20 + honest HTTP status covenant
└─|─ /clients[/:id]                            • RETIRED (clients retirement): noun retired — client = kind-'service' identity + /identities/:id/registration facet; act.sub carries the acting client on authorization_code redemption; clients TABLE DELETED (TABLE_NAMES 2 — pure message plane); rawReadRow retired with it
└─|─ index.html
└─|─ /authentication/
  |  ├── token
  |  └── authorize
  \
   \- public realm
