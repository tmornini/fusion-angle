import { EntityNotFoundError } from './db.ts';
import type {
    DbAdapter,
} from './db.ts';
import type {
    FlowGraphDelta,
    FlowCreateBody,
    WorkOrderCreateBody,
    RecordWriteBody,
    ObjectiveCreateBody,
} from './validators.ts';
import type {
    Id,
    AIMemberEntity,
    FlowEntity,
    FlowVersionEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    HumanMemberEntity,
    IdentityEntity,
    IdentityKind,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    IdentityTokenRevocationEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    ObjectiveEntity,
    ObjectiveRevisionEntity,
    ProjectEntity,
    ProjectFlowEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    RecordEntity,
    RecordAttributeEntity,
    RoleGrantEntity,
    MembershipEntity,
    IdentityProviderEntity,
    StateFieldValueEntity,
    WorkOrderEntity,
    MemberEntity,
    MemberKind,
    OrganizationEntity,
} from './types.ts';
import {
    validateAIMemberCreateBody,
    validateAIMemberEditBody,
    validateAiMemberDocumentBody,
    validateHumanMemberCreateBody,
    validateHumanMemberDocumentBody,
    validateHumanMemberEditBody,
    validateMemberDocumentBody,
    validateFlowCreateBody,
    validateFlowDocumentBody,
    validateFlowVersionEntity,
    validateFlowVersionPublishBody,
    validateFlowWorkOrderEntity,
    validateFlowUndoBody,
    validateIdeaConversionBody,
    validateIdeaDocumentBody,
    validateIdeaSubmissionEntity,
    validateIdentityCreateBody,
    validateIdentityDocumentBody,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateIdentityProviderEntity,
    validateIdentityTokenEntity,
    validateIdentityTokenRevocationEntity,
    validateMembershipDocumentBody,
    validateObjectiveCreateBody,
    validateObjectiveDocumentBody,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateOrganizationEntity,
    validateProjectDocumentBody,
    validateProjectFlowEntity,
    validateFlowRecordEntity,
    validateRecordAttributeDocumentBody,
    validateRecordDocumentBody,
    validateRecordWriteBody,
    validateRoleGrantEntity,
    validateStateBody,
    validateStateFieldValueEntity,
    validateWorkOrderClaimBody,
    validateWorkOrderCreateBody,
    validateWorkOrderDocumentBody,
    validateWorkOrderTransitionBody,
    validateWorkOrderFlowGraphJson,
    pickString,
    pickBoolean,
    pickNumber,
} from './validators.ts';
import {
    appendMessagePair,
    canonicalUriPrefix,
    formWritePair,
    headPairIdAt,
    pairResponseBody,
} from './message-pair.ts';
import type { MessagePair } from './message-pair.ts';
import { replacePiiSlot } from './pii-hard-delete.ts';
import { messageAddress } from './message-address.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import {
    latestClaimEvent,
    isClaimEventExpired,
} from './work-order-claims.ts';
import {
    ATTRIBUTE_RESTRICT_TABLES,
    collectAttributeReferrers,
    hasReferrers,
    describeReferrers,
    deleteRecordAttributeSafe,
} from './record-attribute-refs.ts';
import {
    rotateRefreshJti,
    revokeTokenChain,
} from './authentication.ts';
import {
    ApiError,
    HTTP_BAD_REQUEST,
    HTTP_CONFLICT,
} from './http-errors.ts';
import {
    reduceCreateGraphDelta,
} from './flow-graph-relations.ts';
import {
    storedGraphField,
} from './types.ts';
import {
    deriveIdeaSubmissions,
    ideaEntityOf,
} from './derive-ideas.ts';
import { projectEntityOf } from './derive-projects.ts';
import { flowEntityOf } from './derive-flows.ts';
import { deriveProjectFlows } from './derive-project-flows.ts';
import {
    deriveFlowWorkOrders,
} from './derive-flow-work-orders.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
} from './derive-flow-records.ts';
import {
    deriveObjectiveRevisions,
} from './derive-objective-revisions.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
} from './derive-project-scores.ts';
import {
    deriveMembers,
    deriveMemberParent,
} from './derive-members.ts';
import {
    deriveIdentityPiiRows,
    deriveIdentityPii,
    deriveCredentialsFor,
    deriveCredential,
    deriveRoleGrants,
    deriveRoleGrant,
    deriveIdentityProviders,
    deriveIdentityProvider,
    deriveTokenRevocation,
} from './derive-identity-spine.ts';
import {
    deriveStates,
    deriveStatesFor,
} from './derive-states.ts';
import {
    deriveOrganization,
    deriveOrganizations,
} from './derive-organizations.ts';
import {
    deriveIdentityTokens,
    deriveIdentityToken,
} from './derive-identity-tokens.ts';
import {
    param,
    requireOrganization,
    withoutId,
    documentCollectionGetHandler,
    documentCollectionRoute,
    documentEntityRoute,
    documentGetHandler,
    documentPutHandler,
    documentWriteResponseSpec,
    registerDocumentFamilyWiring,
    type DocumentFamilyWiring,
} from './document-family.ts';
import type { DerivedDocument } from './derive-documents.ts';
// Re-exported: param/requireOrganization/withoutId moved to
// document-family.ts (see the import above and its own
// comment), but api.ts and existing tests still import them
// FROM here — this keeps that surface stable rather than
// touching every external call site for an internal move.
export { param, requireOrganization, withoutId };

// The ideas/projects wiring rows — the ONE copy, built HERE
// beside the ops/validators/entity-mappers they reference (all
// local bindings, so no cycle), then handed to
// registerDocumentFamilyWiring so document-family.ts's own
// table (api.ts's gate consult, and every documentEntityRoute/
// documentCollectionRoute/documentWriteResponseSpec call below)
// sees the SAME row rather than a hand-maintained duplicate.
// This import is a ONE-WAY dependency, not a cycle:
// param/requireOrganization/withoutId now live IN
// document-family.ts (moved there — see its own comment) rather
// than being re-imported from here, so document-family.ts has NO
// runtime import of routes.ts left (only the type-only Route/
// GetHandler/PutHandler/WriteResponseSpec import, erased by
// --strip-types) — document-family.ts is therefore always fully
// evaluated before ANY of this module's own top-level code runs,
// regardless of which of the two a future entry point happens to
// reach first, so registerDocumentFamilyWiring below is safe to
// call at module scope. (An earlier attempt that left
// param/requireOrganization/withoutId here, calling
// registerDocumentFamilyWiring across a genuine two-way value
// cycle, reproduced the exact TDZ ReferenceError the ORIGINAL
// lazy design existed to avoid — order-dependent on which module
// an entry point reached first; see the fix report.)
//
// Decision 7 state-in-entity (Phase 2/3): the PUT body is the
// FULL document — the entity's own fields plus the state trio —
// validated once at the gate (documentWriteResponseSpec, via
// validateDocument). The op DECOMPOSES it: the old-plane row and
// the states event write land separately, in the SAME
// transaction, so the row stays byte-identical to today. Genesis
// is head-presence-defined — a fresh id's PUT simply finds no
// head, so it authors like any other transition.
//
// MEMBER_ID CAVEAT: sameEvent (store-state.ts) compares member_id
// too, so a state-UNCHANGED edit (the resent trio matches the
// current head byte-for-byte) must replay the STORED head
// event's member_id — never the editing actor — or a different
// member plainly editing a field after someone else's transition
// would 409 (LedgerImmutabilityError). A genuinely fabricated
// trio still fails sameEvent on state/at and 409s, exactly as a
// bare states/:id resend would.
const IDEAS_WIRING: DocumentFamilyWiring = {
    family: 'ideas',
    lifecycle: 'trio',
    notFoundTable: 'ideas',
    validateDocument: validateIdeaDocumentBody,
    documentOp: postIdeaDocumentOp,
    entityOf: ideaEntityOf,
};
const PROJECTS_WIRING: DocumentFamilyWiring = {
    family: 'projects',
    lifecycle: 'trio',
    notFoundTable: 'projects',
    validateDocument: validateProjectDocumentBody,
    documentOp: postProjectDocumentOp,
    entityOf: projectEntityOf,
};
// The flows wiring row — Task 3's flip commit, GET-wired at
// Task 8. entityOf is derive-flows.ts's OWN flowEntityOf, not a
// routes.ts-local mapper: it returns FlowWithGraph (the entity
// plus the document's own `graph` field), the shape both
// documentGetHandler (flows/:id) and documentCollectionRoute
// (flows) now serve verbatim — no flows-special branch inside
// either generic constructor. ideas/projects' own entityOf
// mappers return their bare entity shape (no such extra field),
// so this is the ONE per-family divergence document-family.ts's
// `entityOf: (document, organization) => unknown` slot already
// tolerates by design, not a widened interface.
const FLOWS_WIRING: DocumentFamilyWiring = {
    family: 'flows',
    lifecycle: 'trio',
    notFoundTable: 'flows',
    validateDocument: validateFlowDocumentBody,
    documentOp: postFlowDocumentOp,
    entityOf: flowEntityOf,
};
// The work-orders wiring row — the fourth family, and the
// FIRST 'stateless' one (Decision 7's lifecycle trio does not
// apply to a work-order document; see postWorkOrderDocumentOp's
// own comment for why). Both PUT (Task 2/3) and GET (Task 7)
// now ride the generic machinery, so entityOf serves a live GET
// reader (documentGetHandler / documentCollectionGetHandler)
// exactly as ideaEntityOf/projectEntityOf/flowEntityOf each
// serve their OWN family's GET path: the head pair's body,
// stamped with id and organization_id, already carries exactly
// the {display_id, flow_graph, position} keys
// validateWorkOrderDocumentBody's gate admits, so no per-field
// picking is needed. notFoundTable is 'work_orders' — the first
// family whose storage table name (db-backed.ts's EntityStore
// key) differs from its family name.
function workOrderDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): unknown {
    return {
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    };
}
const WORK_ORDERS_WIRING: DocumentFamilyWiring = {
    family: 'work-orders',
    lifecycle: 'stateless',
    notFoundTable: 'work_orders',
    validateDocument: validateWorkOrderDocumentBody,
    documentOp: postWorkOrderDocumentOp,
    entityOf: workOrderDocumentEntityOf,
};
// The generic GET machinery (documentGetHandler/
// documentCollectionGetHandler) this entityOf serves flips onto
// records at Task 7 (this commit): GET records/:id and GET
// records now ride it, exactly as ideaEntityOf/projectEntityOf/
// flowEntityOf/workOrderDocumentEntityOf each serve their OWN
// family's GET path. It still picks fields explicitly (never a
// body spread) rather than standing in as a placeholder, the
// SAME shape ideaEntityOf/projectEntityOf already use, so the
// Task 7 flip finds it already correct instead of inheriting a
// trio-leaking stand-in.
function recordDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): RecordEntity {
    const body = document.body;
    return {
        id: document.uriId,
        organization_id: organization,
        name: pickString(body, 'name'),
        description: pickString(body, 'description'),
        position: pickNumber(body, 'position'),
    };
}
// The records wiring row — the fifth family, and the first
// 'trio' family whose :id address also carries a live DELETE
// route (Author gate 9: documentLifecycleEvents now skips a
// DELETE-method pair — see its own comment in derive-
// documents.ts). notFoundTable is 'records' (its storage table
// name matches its family name, like ideas/projects/flows).
const RECORDS_WIRING: DocumentFamilyWiring = {
    family: 'records',
    lifecycle: 'trio',
    notFoundTable: 'records',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    entityOf: recordDocumentEntityOf,
};
// The generic GET machinery this entityOf serves flips onto
// record-attributes at Task 7 too (this commit, the SAME
// commit as RECORDS_WIRING's own flip above): GET
// record-attributes/:id and GET record-attributes now ride it.
// A body spread is safe here exactly as
// workOrderDocumentEntityOf's own comment argues: the head
// pair's body, stamped with id and organization_id, already
// carries exactly the {record_id, name, attribute_type,
// sort_order, options, constraints} keys
// validateRecordAttributeDocumentBody's gate admits — no
// per-field picking needed, and (UNLIKE a 'trio' family) there
// is no trio to leak, since 'stateless' rejects one at the gate.
function recordAttributeDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): unknown {
    return {
        id: document.uriId,
        organization_id: organization,
        ...document.body,
    };
}
// The record-attributes wiring row — the sixth family, and the
// SECOND 'stateless' one (work-orders is the first). Sharper
// evidence than work-orders': a work order's lifecycle CAN be
// (and is) authored — just never through the document address —
// so ITS 'stateless' classification is vacuous-in-PRACTICE
// (WORK_ORDERS_WIRING's own comment). A record attribute carries
// no lifecycle concept AT ALL: no RecordAttributeState alphabet
// exists anywhere in types.ts, and no call site posts a states
// event keyed to an attribute id (grep-proven at research) — its
// 'stateless' classification is vacuous BY CONSTRUCTION —
// memberships (MEMBERSHIPS_WIRING below, Phase 8) joins this
// SAME bucket as its actual sibling, not "the stronger of the
// two" this comment once claimed when record-attributes stood
// alone against work-orders' vacuous-in-practice one.
// notFoundTable is 'record_attributes' — the SECOND family
// whose storage table name (db-backed.ts's EntityStore key)
// differs from its hyphenated family/route name (work-orders/
// work_orders was the first).
const RECORD_ATTRIBUTES_WIRING: DocumentFamilyWiring = {
    family: 'record-attributes',
    lifecycle: 'stateless',
    notFoundTable: 'record_attributes',
    validateDocument: validateRecordAttributeDocumentBody,
    documentOp: postRecordAttributeDocumentOp,
    entityOf: recordAttributeDocumentEntityOf,
};
// The generic GET machinery (documentGetHandler/
// documentCollectionGetHandler) this entityOf serves flips onto
// objectives at Task 7 (this commit): GET objectives/:id and GET
// objectives now ride it, exactly as recordDocumentEntityOf/
// recordAttributeDocumentEntityOf each served their OWN family's
// GET path at the prior flip. The wire row is constructed ID
// FIRST — {id, organization_id, position} — the SAME seven-
// sibling convention every shipped entityOf follows; picked
// explicitly (pickNumber) rather than a body spread, mirroring
// recordDocumentEntityOf's own choice (NOT
// workOrderDocumentEntityOf's/recordAttributeDocumentEntityOf's
// spread): the wire body tolerates an organization_id key
// alongside position, and a spread would let that raw, unstamped
// key leak into the read path ahead of the fenced `organization`
// argument — picking only `position` closes that off by
// construction.
function objectiveDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): unknown {
    return {
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
    };
}
// The objectives wiring row — the seventh family, and the
// THIRD 'stateless' one, with a THIRD distinct rationale (Author
// gate 3 — the SECOND named partial amendment to Decision 7).
// Work-orders' 'stateless' is vacuous-in-practice (its lifecycle
// CAN be authored, just never through the document address);
// record-attributes' is vacuous BY CONSTRUCTION (no lifecycle
// concept exists at all). Objectives are neither: the trio COULD
// represent the objective alphabet, but is FORBIDDEN three ways
// — the wire body would have to grow it (a zero-delta
// violation), a minted genesis event would abort the states 911
// pin at reseed (the genesis dilemma), and absence-as-active is
// R2's named covenant — so objectives' lifecycle keeps riding
// the SHARED states log (already pair-wired) while this
// document address carries entity fields only. This THIRD
// distinct rationale once read as evidence that 'stateless'
// would need to become a type-level fork (Commandment IX: three
// is pattern) — a claim this comment made when objectives WAS
// the third instance. The roster phase (Phase 8) adjudicated
// it: no fork. Memberships (MEMBERSHIPS_WIRING below) is a
// FOURTH 'stateless' family with yet another distinct rationale,
// and MEMBERS_WIRING (below, Phase 8 Task 3) is a fifth —
// 'stateless' stays ONE type covering every one of them, never
// split.
// notFoundTable is 'objectives' — its storage table name
// matches its family name, like ideas/projects/flows/records
// (work-orders/record-attributes are the two whose names
// diverge).
const OBJECTIVES_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'stateless',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: objectiveDocumentEntityOf,
};
// The generic GET machinery (not yet flipped for memberships —
// Task 8) this entityOf will serve: the head pair's body already
// carries exactly {organization_id, identity_id, at} —
// memberships' wire PUT body includes its OWN organization_id
// (UNLIKE work-orders'/record-attributes' tolerated-but-optional
// stamp), so a spread is safe here for the same reason
// recordAttributeDocumentEntityOf's own comment gives: no
// per-field picking needed, and there is no trio to leak.
// `_organization` stays unused: this entityOf reads
// organization_id off the body itself, never the fence argument
// — the org-scoped store already stamps organization_id at
// write time (the objectives fence-stamp analogue), so this
// read path simply echoes what a live PUT wrote.
function membershipDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): unknown {
    return {
        id: document.uriId,
        ...document.body,
    };
}
// The memberships wiring row — the eighth family, and the
// FOURTH 'stateless' one, joining RECORD_ATTRIBUTES_WIRING's
// vacuous-BY-CONSTRUCTION bucket as its actual sibling (that
// row's own comment above now admits memberships rather than
// standing alone). This is the CORRECTED stateless-fork
// contrast (Author gate 3, adjudicated at the roster phase —
// OBJECTIVES_WIRING's own comment above re-reads its "type-level
// fork" claim as history, not standing doctrine): work-orders'
// 'stateless' is vacuous-in-practice (family-scoped event pairs
// post through the create/claim/transition ops, just never the
// document address); objectives' rides the states log's own
// absence-as-active covenant (R2); the member families
// (MEMBERS_WIRING below, Phase 8 Task 3, and its ai-members/
// human-members siblings) share that SAME log WITH a genesis
// event; record-attributes and memberships share neither — a
// membership carries NO lifecycle concept
// whatsoever, a pure join relation (Codd's own teaching: the
// identities of the joined, plus the moment of union). GET stays
// hand-written old-plane until Task 8; only PUT rides the
// generic machinery this task — memberships/:id's own DELETE
// stays hand-written too, the records/:id template (no generic
// DELETE component exists). notFoundTable is 'memberships' — its
// storage table name matches its family name, like ideas/
// projects/flows/records/objectives (work-orders/record-
// attributes are the two whose names diverge).
const MEMBERSHIPS_WIRING: DocumentFamilyWiring = {
    family: 'memberships',
    lifecycle: 'stateless',
    notFoundTable: 'memberships',
    validateDocument: validateMembershipDocumentBody,
    documentOp: postMembershipDocumentOp,
    entityOf: membershipDocumentEntityOf,
};
// The wire body carries exactly the member's own fields (no
// organization_id anywhere, no trio) — a spread is safe for the
// SAME reason membershipDocumentEntityOf's own comment gives: no
// per-field picking needed, and 'stateless' rejects a trio at
// the gate. `_organization` stays unused: the members directory
// is GLOBAL plane (family-registry.ts: organizationNested:
// false) — the FIRST family on it — so there is no fence value
// to stamp at all.
function memberDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): unknown {
    return {
        id: document.uriId,
        ...document.body,
    };
}
// The members wiring row — the ninth family, and the FIFTH
// 'stateless' one, opening a bucket distinct from all four
// before it (Author gate 3, verification-corrected — no
// type-level fork; 'stateless' stays ONE type covering all five
// rationales). Members, ai-members, and human-members
// (AI_MEMBERS_WIRING/HUMAN_MEMBERS_WIRING below) share ONE
// shared-log-WITH-genesis rationale: the shared member id
// receives REAL states events — a genesis event at create,
// archive/reactivate via PUT states/:id — so a trio-carrying
// document plane here would FREEZE every member's state at
// genesis forever the moment a second states event posted — the
// decisive refutation, distinct from every prior bucket: NOT
// work-orders' vacuous-in-practice (family-scoped event pairs
// post through the create/claim/transition ops, just never the
// document address, §5.6); NOT objectives' absence-as-active
// covenant, which rides this SAME shared log but with NO genesis
// event ever minted (§5.8); NOT record-attributes'/memberships'
// vacuous-BY-CONSTRUCTION pair, which carry no lifecycle concept
// whatsoever (§5.9). notFoundTable is 'members' — its storage
// table name matches its family name, like ideas/projects/flows/
// records/objectives/memberships (work-orders/record-attributes
// are the two families whose names diverge). This is also the
// FIRST 'stateless' row served by a LIVE, wired PUT this SAME
// commit (documentPutHandler/documentWriteResponseSpec below) —
// documentWriteResponseSpec's own registration-first consult
// (document-family.ts, this commit) omits the organization_id
// stamp for exactly the reason above: no such field exists on
// this entity at all.
const MEMBERS_WIRING: DocumentFamilyWiring = {
    family: 'members',
    lifecycle: 'stateless',
    notFoundTable: 'members',
    validateDocument: validateMemberDocumentBody,
    documentOp: postMemberDocumentOp,
    entityOf: memberDocumentEntityOf,
};
// The bare ai_members facet row spreads safely (no
// organization_id, no trio — the SAME reason memberDocumentEntityOf's
// own comment gives). `_organization` stays unused: ai-members is
// GLOBAL plane too (family-registry.ts: organizationNested:false).
function aiMemberDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): unknown {
    return {
        id: document.uriId,
        ...document.body,
    };
}
// The ai-members wiring row — the tenth family, joining
// MEMBERS_WIRING's shared-log-with-genesis 'stateless' bucket
// (see its own comment above for the full rationale-contrast):
// the SAME shared member id, the SAME genesis-at-create/PUT-
// states/:id lifecycle, no new bucket needed. notFoundTable is
// 'ai_members' — its storage table name (db-backed.ts's
// EntityStore key) diverges from its hyphenated family/route
// name, the SAME snake_case divergence work-orders/record-
// attributes established.
const AI_MEMBERS_WIRING: DocumentFamilyWiring = {
    family: 'ai-members',
    lifecycle: 'stateless',
    notFoundTable: 'ai_members',
    validateDocument: validateAiMemberDocumentBody,
    documentOp: postAiMemberDocumentOp,
    entityOf: aiMemberDocumentEntityOf,
};
// The human_members facet row spreads safely, the SAME reason
// aiMemberDocumentEntityOf's own comment gives. `_organization`
// stays unused: human-members is GLOBAL plane too
// (family-registry.ts: organizationNested:false).
function humanMemberDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): unknown {
    return {
        id: document.uriId,
        ...document.body,
    };
}
// The human-members wiring row — the eleventh family, and the
// THIRD (last) member of MEMBERS_WIRING's shared-log-with-
// genesis 'stateless' bucket (see its own comment above for the
// full rationale-contrast). UNLIKE members/ai-members, this
// wiring row serves NO live route: human-members/:id carries
// only {get, post} today, and this task adds no route or verb —
// the FIRST registered family without a live document PUT
// (documentOp/entityOf exist for a future synthesis/seed caller
// only, mirroring the projects-createBodyIdField inert-slot
// precedent: a fully-shaped row with no live caller yet).
// notFoundTable is 'human_members' — its storage table name
// diverges from its hyphenated family/route name, the SAME
// snake_case divergence AI_MEMBERS_WIRING's own comment names.
const HUMAN_MEMBERS_WIRING: DocumentFamilyWiring = {
    family: 'human-members',
    lifecycle: 'stateless',
    notFoundTable: 'human_members',
    validateDocument: validateHumanMemberDocumentBody,
    documentOp: postHumanMemberDocumentOp,
    entityOf: humanMemberDocumentEntityOf,
};
// The bare identities row spreads safely (no organization_id, no
// trio — the SAME reason memberDocumentEntityOf's own comment
// gives). `_organization` stays unused: identities is GLOBAL
// plane too (family-registry.ts: organizationNested:false).
function identityDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): unknown {
    return {
        id: document.uriId,
        ...document.body,
    };
}
// The identities wiring row — the TWELFTH registered family, and
// the FOURTH member of MEMBERS_WIRING's shared-log-with-genesis
// 'stateless' bucket (see its own comment above for the full
// rationale-contrast): the shared id (member.id === identity.id,
// always) already receives a genesis states event at create and
// archive/reactivate via PUT states/:id, so the identities
// document plane carries NO lifecycle of its own — its REAL
// states events ride the untouched states plane instead. A
// 'stateless' family's ONLY tombstone signal is a DELETE-method
// head, already 404-absent via deriveDocumentsAt with no further
// walk needed (document-family.ts's derivedDocumentEntity) — the
// SAME deleted-filter escape hatch every 'stateless' family
// before it accepted. notFoundTable is 'identities' — its
// storage table name matches its family name, like ideas/
// projects/flows/records/objectives/memberships/members (work-
// orders/record-attributes/ai-members/human-members are the
// families whose names diverge).
const IDENTITIES_WIRING: DocumentFamilyWiring = {
    family: 'identities',
    lifecycle: 'stateless',
    notFoundTable: 'identities',
    validateDocument: validateIdentityDocumentBody,
    documentOp: postIdentityDocumentOp,
    entityOf: identityDocumentEntityOf,
};
registerDocumentFamilyWiring(IDEAS_WIRING);
registerDocumentFamilyWiring(PROJECTS_WIRING);
registerDocumentFamilyWiring(FLOWS_WIRING);
registerDocumentFamilyWiring(WORK_ORDERS_WIRING);
registerDocumentFamilyWiring(RECORDS_WIRING);
registerDocumentFamilyWiring(RECORD_ATTRIBUTES_WIRING);
registerDocumentFamilyWiring(OBJECTIVES_WIRING);
registerDocumentFamilyWiring(MEMBERSHIPS_WIRING);
registerDocumentFamilyWiring(MEMBERS_WIRING);
registerDocumentFamilyWiring(AI_MEMBERS_WIRING);
registerDocumentFamilyWiring(HUMAN_MEMBERS_WIRING);
registerDocumentFamilyWiring(IDENTITIES_WIRING);

// Every handler receives the verified caller's id (actor) as
// its final argument — the one place authorship is sourced.
// The gate resolves it from the token; handlers that author
// state events or identify the caller stamp it, and the rest
// (the makeIdRoute closures) simply ignore the extra arg. A GET
// handler also receives the fence organization — the verified
// token claim the gate resolved, never the path — undefined for
// a bearer-exempt or global route; a ledger-derived, org-owned
// read requires it (see requireOrganization) while every other
// GET handler ignores the extra trailing arg, the same
// fewer-parameter-closure precedent actor already established.
// Exported so api/document-family.ts's generic constructors
// declare their return types with the SAME handler vocabulary
// routes.ts itself uses, rather than a structurally-duplicated
// alias.
export type GetHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    organization: Id | undefined,
) => Promise<unknown>;

// PutHandler, PostHandler, and DeleteHandler carry a trailing
// pair: it is undefined for bearer-exempt and not-yet-wired
// writes (TypeScript cannot prove bearerExempt was false inside
// the gate's one shared dispatch switch), and defined for a
// route named in message-pair.ts's PAIR_WIRED_ROUTE_PATTERNS.
// A wired handler's LAST in-tx act is appending it (absence
// there is a wiring bug — crash loud); an unwired handler
// ignores the extra argument (TypeScript permits a closure
// with fewer declared parameters than its assigned type).
export type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    pair: MessagePair | undefined,
) => Promise<void>;

// PostHandler alone also carries a trailing fence
// organization, mirroring GetHandler's rationale above: the
// verified token claim the gate resolved, never the path.
// Undefined for a bearer-exempt or global route. Only the
// conversion handler consults it today (to form the created
// project's OWN document-address pair beside the operation
// pair above); every other POST handler ignores the extra
// trailing arg, the same fewer-parameter-closure precedent
// `pair` already established.
type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    pair: MessagePair | undefined,
    organization: Id | undefined,
) => Promise<unknown>;

export interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}

export function route(
    pattern: string,
    handlers: {
        get?: GetHandler;
        put?: PutHandler;
        delete?: DeleteHandler;
        post?: PostHandler;
    },
): Route {
    return {
        segments: pattern.split('/'),
        ...handlers,
    };
}

// Project the opaque `secret` out of a credential before it
// crosses the API boundary — reads expose existence and
// lifecycle, never the hash. Makes true the non-leakage
// covenant in types.ts and SCHEMA.md SP-1.
function withoutSecret(
    cred: IdentityCredentialEntity,
): Omit<IdentityCredentialEntity, 'secret'> {
    const { secret: _secret, ...rest } = cred;
    return rest;
}

// GATE 15 — THE PRODUCTION MEMBERSHIP PAIR PLANE (Phase 10 Task
// 8 Session B): identity_pii and identity_credentials carry NO
// organization_id of their own, so their read fence (viaMembership,
// api/store-parent-scoped.ts) derives visibility from the
// membership ledger instead. A GET handler here receives ONLY the
// caller's already-org-SCOPED adapter (api.ts hands it `effective`)
// — that adapter's OWN .memberships facet is filtered to the
// caller's org already, so it cannot see a foreign-org row and
// would misreport it as an orphan (visible), silently WIDENING the
// fence rather than reproducing it. The scoped adapter's
// .requests/.responses DO pass through globally (db-organization-
// scoped.ts: "the message plane... passes through unwrapped"), so
// this reads the SAME membership ledger every org's derivation
// would, via the SAME documentCollectionGetHandler(MEMBERSHIPS_
// WIRING) reduction GET /memberships itself rides — mirroring
// tests/drift-identities.test.ts's own gate-15 proof
// (pairPlaneMembershipsAcrossKnownOrganizations), generalized from
// that test's hardcoded two-org set to deriveOrganizations(db)
// (Phase 12 Task 5: the pair-plane derivation, api/derive-
// organizations.ts — itself reading only requests/responses, the
// SAME global passthrough the prior db.organizations.getAll()
// read rode) so this holds for however many organizations
// actually exist, not only the ones a test happened to seed.
async function membershipsAcrossAllOrganizations(
    db: DbAdapter, actor: Id,
): Promise<MembershipEntity[]> {
    const organizations = await deriveOrganizations(db);
    const perOrganization = await Promise.all(
        organizations.map((organization) =>
            documentCollectionGetHandler(MEMBERSHIPS_WIRING)(
                db, [], actor, organization.id,
            ) as Promise<MembershipEntity[]>,
        ),
    );
    return perOrganization.flat();
}

// viaMembership's OWN three-way algorithm (api/store-parent-
// scoped.ts), re-derived here over the PAIR-PLANE union above
// rather than the row-plane's identity_id index — the SAME
// reduction tests/drift-identities.test.ts's
// pairPlaneOwnerOrganization proves equal to the row-plane fence
// on all three legs (co-member, FOREIGN-org, orphan): null
// (orphan, visible), the bound org (co-member, visible), or a
// DIFFERENT org (foreign, hidden).
function ownerOrganizationViaMembershipPairPlane(
    memberships: readonly MembershipEntity[],
    identityId: Id,
    boundOrganization: Id,
): Id | null {
    const mine = memberships.filter(
        (m) => m.identity_id === identityId,
    );
    if (mine.length === 0) return null;
    return mine.some(
        (m) => m.organization_id === boundOrganization,
    )
        ? boundOrganization
        : mine[0]!.organization_id;
}

// The bundle a live POST /records forms (Phase 6 Task 4, the
// migration's first VARIABLE-CARDINALITY synthesis): the gate's
// own operation pair, the synthesized document pair (at the
// record's own records/:id address — the SAME address the
// operation pair shares, since records' createBodyIdField
// override collapses the two onto one uri_id, the flows
// precedent), one synthesized attribute-PUT pair per
// attributes[] entry, and one synthesized attribute-DELETE pair
// per removedAttributeIds entry (edit only — removedAttributeIds
// does not exist on RecordWriteCreateBody, so a create's
// attributeDeletes is always empty). All pairs share ONE
// requestAt (the write's own origination) yet strictly-later
// RESPONSE `at` stamps (appendMessagePair's nowUtc() is
// monotonic), so the document pair — appended after the
// operation pair — becomes the address's head; a duplicate
// create's Supersedes therefore resolves against the prior
// DOCUMENT pair, not the prior operation pair (the Phase 5
// shared-address mechanism, re-pinned here).
export interface RecordWritePairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly attributePuts: readonly MessagePair[];
    readonly attributeDeletes: readonly MessagePair[];
}

// The shared BODY builders — the ONE-voice seam: pure functions
// consumed by BOTH the live route-inline formation
// (route('records', ...) below) and the seed's invocation
// construction (api/mock-data/seed-message-pairs.ts). NOT a
// shared pair-FORMER (Premature Generalization, verification-
// corrected against an earlier draft): the route needs the
// fence organization and the response specs to form a pair; the
// seed needs neither. Pair formation stays two pipelines,
// sharing only these bodies.

// The wire body a live PUT records/:id would carry for this
// SAME write: the entity fields (organization_id excluded, like
// every genuine client PUT — validateRecordDocumentBody's own
// comment) plus the lifecycle trio. Create maps the trio from
// initialState*; edit carries the body's own echoed trio
// verbatim (never re-derived), so a synthesized document pair
// is byte-indistinguishable from what a live PUT would have
// stored for the identical write.
export function recordDocumentBodyOf(
    writeBody: RecordWriteBody,
): Record<string, unknown> {
    const {
        organization_id: _organizationId, ...entity
    } = writeBody.record;
    return writeBody.kind === 'create'
        ? {
            ...entity,
            state: writeBody.initialState,
            state_at: writeBody.initialStateAt,
            state_event_id: writeBody.initialStateEventId,
        }
        : {
            ...entity,
            state: writeBody.state,
            state_at: writeBody.state_at,
            state_event_id: writeBody.state_event_id,
        };
}

// The id-strip destructure precedent (Task 3's Step 0 finding):
// a live PUT record-attributes/:id's stored body is the entity
// fields minus `id` and `organization_id` — reproduced here
// rather than re-derived, so a synthesized attribute pair's
// body can never drift from what the live route would have
// stored for the identical row.
export function recordAttributeDocumentBodyOf(
    row: Record<string, unknown>,
): Record<string, unknown> {
    const {
        id: _id, organization_id: _organizationId, ...rest
    } = row;
    return rest;
}

// Record creation or edit, discriminated by payload.kind.
// Exported so the seed can drive record creation through
// the same gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write insertion
// seam. `pairs` is optional so the seed's below-facade call
// (api/mock-data.ts, no gate, no pairs) keeps compiling
// unchanged; the route always supplies the bundle, since
// 'records' is pair-wired and never bearer-exempt.
export async function postRecordWriteOp(
    db: DbAdapter,
    payload: Record<string, unknown>,
    actor: Id,
    pairs?: RecordWritePairs,
): Promise<void> {
    const body = validateRecordWriteBody(payload);
    const entries = body.attributes.map(attr => {
        const { id, ...fields } = attr;
        return { id, fields };
    });
    const removedIds =
        body.kind === 'edit'
            ? body.removedAttributeIds
            : [];
    // The record, its state event, and its attributes commit
    // as one transaction — a mid-write failure rolls the whole
    // thing back rather than orphaning the record. Removed
    // attributes are RESTRICTED inside the same tx: a
    // referenced attribute 409s and the whole batch rolls back
    // (api/record-attribute-refs.ts).
    await db.transaction(
        [...new Set([
            'records', 'record_attributes', 'states',
            ...ATTRIBUTE_RESTRICT_TABLES,
            'requests', 'responses',
        ])],
        async (view) => {
            await view.records.put(body.id, body.record);
            if (body.kind === 'create') {
                // Genesis: exactly ONE state event, authored by
                // the verified caller (actor), never a client-
                // supplied member.
                await view.states.postEvent(
                    body.initialStateEventId,
                    body.id,
                    body.initialState,
                    actor,
                    body.initialStateAt,
                );
            } else {
                // The SAME sameEvent decompose
                // postRecordDocumentOp runs: the edit body now
                // carries the echoed trio, so the synthesized
                // document pair forms purely from the body. A
                // byte-identical echo of the stored head
                // converges to a no-op write (states.put's own
                // idempotency by id); a genuinely different
                // trio at the SAME id still 409s via
                // LedgerImmutabilityError, exactly as before.
                const head = await view.states.getCurrentFor(
                    body.id,
                );
                const memberId = (
                    head !== null
                    && head.id === body.state_event_id
                    && head.state === body.state
                    && head.at === body.state_at
                ) ? head.member_id : actor;
                await view.states.postEvent(
                    body.state_event_id,
                    body.id,
                    body.state,
                    memberId,
                    body.state_at,
                );
            }
            if (removedIds.length > 0) {
                const referrers =
                    await collectAttributeReferrers(
                        view, removedIds,
                    );
                for (const [id, refs] of referrers) {
                    if (hasReferrers(refs)) {
                        throw new ApiError(
                            describeReferrers(id, refs),
                            HTTP_CONFLICT,
                        );
                    }
                }
            }
            if (
                entries.length > 0
                || removedIds.length > 0
            ) {
                await view.recordAttributes.putMany(
                    entries, removedIds,
                );
            }
            // The whole bundle or none (Atomicity): the
            // operation pair, the document pair, N attribute-
            // PUT pairs, and M attribute-DELETE pairs — appended
            // LAST, in that order, so each pair's response `at`
            // strictly follows the one before it (nowUtc
            // monotonicity) and the document pair becomes the
            // shared address's head.
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                for (const p of pairs.attributePuts) {
                    await appendMessagePair(view, p);
                }
                for (const p of pairs.attributeDeletes) {
                    await appendMessagePair(view, p);
                }
            }
        },
    );
}

// Write a FlowGraphDelta to the four relation tables inside an
// ALREADY-OPEN transaction view: node/edge upserts, append-only
// member/attribute events, and node/edge deletion events
// (authored by actor, never the body). The one delta-write
// voice — POST /flows (create), PUT /flows/:id (save), and
// undo/redo all route through it (create passes an empty
// deletions array). The view's table set must already include
// flow_nodes, flow_edges, flow_node_members,
// flow_node_attributes, and states.
async function writeFlowGraphDelta(
    view: DbAdapter,
    delta: FlowGraphDelta,
    actor: Id,
): Promise<void> {
    for (const n of delta.nodes) {
        const {
            id, flow_id, name, position_x, position_y,
            is_create, is_archive, task_instructions, at,
        } = n;
        await view.flowNodes.put(id, {
            flow_id, name, position_x, position_y,
            is_create, is_archive, task_instructions, at,
        });
    }
    for (const e of delta.edges) {
        const {
            id, flow_id, name, from_node_id, to_node_id, at,
        } = e;
        await view.flowEdges.put(id, {
            flow_id, name, from_node_id, to_node_id, at,
        });
    }
    for (const m of delta.memberEvents) {
        const {
            id, flow_node_id, member_id, action, at,
        } = m;
        await view.flowNodeMembers.put(id, {
            flow_node_id, member_id, action, at,
        });
    }
    for (const a of delta.attributeEvents) {
        const {
            id, flow_node_id, attribute_id, mode,
            is_required, action, at,
        } = a;
        await view.flowNodeAttributes.put(id, {
            flow_node_id, attribute_id, mode,
            is_required, action, at,
        });
    }
    for (const d of delta.deletions) {
        await view.states.postEvent(
            d.eventId, d.entityId, 'deleted', actor, d.at,
        );
    }
}

// The organization_id extraction/merge shape every document op
// below needs: the org-scoped store stamps organization_id from
// the verified token and re-validates through its own entity
// validator, so a fenced write's `doc.entity` never carries it;
// the below-facade seed path (no scoping wrapper) has no such
// stamp, so it embeds organization_id in the RAW request body
// instead, and this helper reads it straight back so the seed's
// write still carries it — inert for the fenced route
// (overwritten either way regardless of what this returns),
// load-bearing for the seed. Seven sites now share this exact
// shape (ideas, projects, flows, work-orders, records,
// record-attributes, objectives) — past the rule-of-three, so
// it is extracted once rather than duplicated a seventh time.
function documentOperationOrganization(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const organizationId = body['organization_id'];
    return typeof organizationId === 'string'
        ? { organization_id: organizationId }
        : {};
}

// Idea document write (Decision 7): ONE shape serves create,
// edit, and transition — genesis is head-presence-defined (a
// fresh id's PUT simply finds no head, so the ternary below
// falls to `actor`, authoring the birth like any other
// transition). The idea row and its trio's state event commit
// as ONE transaction — a mid-write failure rolls the whole
// thing back rather than leaving a half-written document.
// validateIdeaDocumentBody's typed `entity` never carries
// organization_id (the org-scoped store stamps it from the
// verified token for the LIVE, fenced route, overwriting
// whatever it finds regardless); the seed's below-facade call
// (api/mock-data.ts, no gate, no scoping wrapper) drives a RAW
// store that has no such stamp, so it embeds organization_id in
// the raw body and this op reads it straight back to merge it
// in — inert for the fenced route (overwritten either way),
// load-bearing for the seed. Exported so the seed can drive
// idea creation through the same op the route uses (Decision
// 6's below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'ideas/:id' is pair-wired and never
// bearer-exempt.
export async function postIdeaDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<IdeaEntity> {
    const doc = validateIdeaDocumentBody(withoutId(body));
    return db.transaction(
        ['ideas', 'states', 'requests', 'responses'],
        async (view) => {
            const head = await view.states.getCurrentFor(id);
            const memberId = (
                head !== null
                && head.id === doc.state_event_id
                && head.state === doc.state
                && head.at === doc.state_at
            ) ? head.member_id : actor;
            const written = await view.ideas.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<IdeaEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                memberId, doc.state_at,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Project document write (Decision 7): ONE shape serves
// create, edit, and transition — genesis is head-presence-
// defined (a fresh id's PUT simply finds no head, so the
// ternary below falls to `actor`, authoring the birth like any
// other transition). The project row and its trio's state
// event commit as ONE transaction — a mid-write failure rolls
// the whole thing back rather than leaving a half-written
// document. validateProjectDocumentBody's typed `entity` never
// carries organization_id (the org-scoped store stamps it from
// the verified token for the LIVE, fenced route, overwriting
// whatever it finds regardless); the seed's below-facade call
// (api/mock-data.ts, no gate, no scoping wrapper) drives a RAW
// store that has no such stamp, so it embeds organization_id in
// the raw body and this op reads it straight back to merge it
// in — inert for the fenced route (overwritten either way),
// load-bearing for the seed. Exported so the seed can drive
// project creation through the same op the route uses (Decision
// 6's below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'projects/:id' is pair-wired and never
// bearer-exempt.
export async function postProjectDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<ProjectEntity> {
    const doc = validateProjectDocumentBody(withoutId(body));
    return db.transaction(
        ['projects', 'states', 'requests', 'responses'],
        async (view) => {
            const head = await view.states.getCurrentFor(id);
            const memberId = (
                head !== null
                && head.id === doc.state_event_id
                && head.state === doc.state
                && head.at === doc.state_at
            ) ? head.member_id : actor;
            const written = await view.projects.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<ProjectEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                memberId, doc.state_at,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Record document write (Decision 7, the fifth family): ONE
// shape serves create, edit, and transition — genesis is
// head-presence-defined, byte-identical to postIdeaDocumentOp/
// postProjectDocumentOp above (the SAME member_id ternary, the
// SAME sameEvent MEMBER_ID CAVEAT). UNLIKE those two, a record's
// genesis normally arrives through the composed create
// (postRecordWriteOp, POST /records) rather than this PUT — this
// op's genesis arm exists for a live PUT-first flow, and mirrors
// ideas/projects exactly rather than special-casing records as
// PUT-only-for-edits. Not yet wired to any route (the fold
// commit adds RECORDS_WIRING + the route swap); exported so its
// below-gate decompose behavior can be pinned ahead of that wire,
// mirroring postFlowDocumentOp's own Task-2-era convention.
export async function postRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<RecordEntity> {
    const doc = validateRecordDocumentBody(withoutId(body));
    return db.transaction(
        ['records', 'states', 'requests', 'responses'],
        async (view) => {
            const head = await view.states.getCurrentFor(id);
            const memberId = (
                head !== null
                && head.id === doc.state_event_id
                && head.state === doc.state
                && head.at === doc.state_at
            ) ? head.member_id : actor;
            const written = await view.records.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<RecordEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                memberId, doc.state_at,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Record attribute document write — the sixth family, and the
// SECOND 'stateless' one (RECORD_ATTRIBUTES_WIRING's own
// comment: vacuous BY CONSTRUCTION, not merely in practice, the
// sharper contrast against work-orders). A document PUT here is
// a pure entity edit: the record_attributes row and its pair
// commit as ONE transaction — a mid-write failure rolls the
// whole thing back rather than leaving a half-written attribute.
// validateRecordAttributeDocumentBody rejects a body carrying
// the trio at the gate, so this op never needs to defend against
// one downstream. documentOperationOrganization's merge mirrors
// postWorkOrderDocumentOp's own shape for uniformity, though it
// is DORMANT here: zero client callers exist for this PUT (this
// task's own premise), and the seed batches attribute creation
// through postRecordWriteOp instead — never this op — so the
// merge is inert rather than load-bearing. `pair` is optional so
// a future below-facade caller keeps compiling; the live route
// always supplies one, since 'record-attributes/:id' is
// pair-wired and never bearer-exempt. The actor parameter is
// spelled `_actor` for the same reason postWorkOrderDocumentOp
// spells it that way: there is no state event here to author.
export async function postRecordAttributeDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<RecordAttributeEntity> {
    const doc = validateRecordAttributeDocumentBody(
        withoutId(body),
    );
    return db.transaction(
        ['record_attributes', 'requests', 'responses'],
        async (view) => {
            const written = await view
                .recordAttributes.put(
                    id,
                    {
                        ...doc.entity,
                        ...documentOperationOrganization(body),
                    } as unknown as
                        Omit<RecordAttributeEntity, 'id'>,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Idea submission write: a genesis-only document address (an
// idea is submitted once per sid; no edit/transition case
// exists for this family) — the idea_submissions row and its
// message pair commit as ONE transaction. Exported so the seed
// can drive submission creation through the same op the route
// uses (Decision 6's below-facade carve-out), exactly as
// postIdeaDocumentOp does for ideas themselves. `pair` is
// optional so a future below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'ideas/:id/submissions/:sid' is pair-wired and never
// bearer-exempt.
export async function postIdeaSubmissionOp(
    db: DbAdapter,
    sid: Id,
    body: Record<string, unknown>,
    pair?: MessagePair,
): Promise<IdeaSubmissionEntity> {
    return db.transaction(
        ['idea_submissions', 'requests', 'responses'],
        async (view) => {
            const written = await view.ideaSubmissions.put(
                sid,
                withoutId(body) as unknown as
                    Omit<IdeaSubmissionEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// The create's synthesized document body (Task 5): the SAME
// shape a live genesis PUT /flows/:id would carry — the flow's
// own five fields, the initial-state trio, the reduced graph
// (via reduceCreateGraphDelta, the ONE shared reduction the
// live route and the seed both call — never two hand-rolled
// constructions), and the two transitional decomposition
// sidecars (graphDelta verbatim; revivals empty — a fresh flow
// revives nothing). Exported so the seed's pass-1 pair
// body-builder (api/mock-data/seed-message-pairs.ts) calls this
// SAME function rather than reconstructing the document by
// hand. Entity fields are picked directly (mirroring
// flowEntityOf below) rather than spread from `b.flow` verbatim
// — the seed's own `b.flow` also carries a tolerated
// organization_id (validateFlowDocumentBody's optional extra)
// that must never leak into the byte-compared document, so both
// callers converge on the identical five-key shape regardless.
export function flowCreateDocumentBody(
    b: FlowCreateBody,
): Record<string, unknown> {
    return {
        name: pickString(b.flow, 'name'),
        is_locked: pickBoolean(b.flow, 'is_locked'),
        is_auto_layout: pickBoolean(b.flow, 'is_auto_layout'),
        is_auto_fit: pickBoolean(b.flow, 'is_auto_fit'),
        lock_timeout: pickNumber(b.flow, 'lock_timeout'),
        state: b.initialState,
        state_at: b.initialStateAt,
        state_event_id: b.initialStateEventId,
        graph: storedGraphField(
            reduceCreateGraphDelta(b.graphDelta),
        ),
        graphDelta: b.graphDelta,
        revivals: [],
    };
}

// The three pairs a live POST /flows forms (Task 5): the gate's
// own operation pair (204, at the flows/:id address per Task 1's
// createdEntityUriId override — POST 'flows' and PUT 'flows/:id'
// collapse onto the SAME (uriPrefix, uriId), see derive-
// documents.ts's DOCUMENT_METHODS filter for why the two never
// collide as documents), plus the document and join pairs the
// route pre-forms below. All three share ONE requestAt (the
// create's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePair's nowUtc() is monotonic), so the
// document pair — appended after the operation pair — becomes
// the address's head.
export interface FlowCreationPairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly join: MessagePair;
}

// Flow creation: the flows row, its project_flows join
// row, the initial 'active' state event, and the four
// relation table rows from graphDelta commit as ONE
// transaction — a mid-write failure rolls the whole
// thing back rather than orphaning a half-built flow.
// The org-scoped flows store stamps organization_id from
// the verified token and re-validates through
// validateFlowEntity, so the flow body OMITS it; the
// join row is re-validated by the project_flows store.
// The initial event is authored by the verified caller
// (actor), never the body. graphDelta is pre-validated
// at the HTTP gate (validateFlowCreateBody); the route
// writes its rows through writeFlowGraphDelta — the same
// helper PUT/undo/redo use. The create delta carries no
// deletions (a fresh flow tombstones nothing). Exported
// so the seed can drive flow creation through the same
// gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write
// insertion seam. `pairs` is optional so the seed's below-
// facade call (api/mock-data.ts, no gate, no pairs) keeps
// compiling unchanged; the route always supplies the
// triple, since 'flows' is pair-wired and never
// bearer-exempt. The route (not this op) forms all three
// pairs pre-tx — see route('flows', ...) below — since
// forming the document/join pairs needs the fence
// organization and the flows/:id + projects/:id/flows/:pfid
// response specs, both route-table concerns.
export async function postFlowCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pairs?: FlowCreationPairs,
): Promise<void> {
    const b = validateFlowCreateBody(body);
    const delta = b.graphDelta;
    return db.transaction(
        [
            'flows', 'project_flows', 'states',
            'flow_nodes', 'flow_edges',
            'flow_node_members',
            'flow_node_attributes',
            'requests', 'responses',
        ],
        async (view) => {
            await view.flows.put(
                b.id,
                b.flow as unknown as
                    Omit<FlowEntity, 'id'>,
            );
            await view.projectFlows.put(
                b.projectFlowId,
                b.projectFlow as unknown as
                    Omit<ProjectFlowEntity, 'id'>,
            );
            await view.states.postEvent(
                b.initialStateEventId,
                b.id,
                b.initialState,
                actor,
                b.initialStateAt,
            );
            // The delta's deletions are empty on create
            // (a fresh flow tombstones nothing), so the
            // helper writes only the seeding upserts and
            // member/attribute events.
            await writeFlowGraphDelta(
                view, delta, actor,
            );
            // Three pairs or none (Atomicity): the operation
            // pair (the gate's own), the synthesized document
            // pair, and the synthesized join pair — appended in
            // that order, LAST, so the document pair's response
            // `at` strictly follows the operation pair's.
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                await appendMessagePair(view, pairs.join);
            }
        },
    );
}

// Flow document write (Decision 7, the LOCKED class — Task 3):
// the flow row, its trio's state event, the graph delta to the
// four relation tables, and any revivals commit as ONE
// transaction — a mid-write failure rolls the whole thing back
// rather than leaving a half-written document. UNLIKE
// postIdeaDocumentOp/postProjectDocumentOp, this op carries NO
// member_id ternary: flows mint a FRESH trio on every PUT
// (design decision 2) — nothing here ever resends a STORED
// trio verbatim, since the C6 client retry loop mints a new
// state_event_id/state_at on every attempt (the E6 split).
// A byte-identical resend is caught by the gate's pre-tx
// idempotency fast path (never reaching this op at all); a
// same-id, genuinely different-content collision still 409s
// via LedgerImmutabilityError — today's covenant, unchanged.
// version-publish (a flow_versions row) is NOT part of this op
// (Decision 3) — it rides its own POST /flows/:id/versions
// transaction. `graphDelta`/`revivals` are TRANSITIONAL
// decomposition-only sidecars — the old-plane relation writer
// alone consumes them; no derivation reads either one, and
// both retire at Phase Final. `graph` is the client-authored
// post-save working snapshot, carried verbatim (no transform)
// — this op never touches it beyond passing validation; a
// future derivation (Task 7) re-normalizes nodes[]/edges[] from
// the relation tables, not from this field. The org-scoped
// flows store stamps organization_id from the verified token
// and re-validates through validateFlowEntity, so the entity
// body OMITS it; the below-facade seed path (Task 6, no
// scoping wrapper) embeds it in the raw body and this op reads
// it straight back to merge it in — inert for the fenced route
// (overwritten either way), load-bearing for the seed. Exported
// so the seed can drive flow genesis through the same op the
// route uses (Decision 6's below-facade carve-out). `pair` is
// optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'flows/:id' is pair-wired and never bearer-exempt.
export async function postFlowDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<FlowEntity> {
    const doc = validateFlowDocumentBody(withoutId(body));
    const delta = doc.graphDelta;
    return db.transaction(
        [
            'flows', 'states',
            'flow_nodes', 'flow_edges',
            'flow_node_members',
            'flow_node_attributes',
            'requests', 'responses',
        ],
        async (view) => {
            const written = await view.flows.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<FlowEntity, 'id'>,
            );
            await view.states.postEvent(
                doc.state_event_id, id, doc.state,
                actor, doc.state_at,
            );
            await writeFlowGraphDelta(view, delta, actor);
            for (const r of doc.revivals) {
                await view.states.postEvent(
                    r.eventId, r.entityId,
                    'restored', actor, r.at,
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// The three pairs a live POST /objectives forms (Task 3): the
// gate's own operation pair (204, at the objectives/:id address
// per the create-body-id-field override — POST 'objectives' and
// PUT 'objectives/:id' collapse onto the SAME (uriPrefix,
// uriId), the flows/records precedent), the synthesized document
// pair (objectives/:id), and the synthesized revision pair
// (objectives/:id/revisions/:rid) the route pre-forms below. All
// three share ONE requestAt (the create's own origination) yet
// strictly-later RESPONSE `at` stamps (appendMessagePair's
// nowUtc() is monotonic), so the document pair — appended after
// the operation pair — becomes the shared address's head; the
// revision pair lives at its OWN distinct address (a fresh
// revision id per create), so it is always genesis there unless
// a live PUT had already visited that exact revision id.
export interface ObjectiveCreationPairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly revision: MessagePair;
}

// The shared BODY builders — the ONE-voice seam both the live
// route-inline formation (route('objectives', ...) below) and
// the seed's invocation construction
// (api/mock-data/seed-message-pairs.ts) consume — the
// recordDocumentBodyOf precedent.

// The wire body a live PUT objectives/:id would carry for this
// SAME write: organization_id STRIPPED (the live client's PUT
// body is `{position}` alone; the org rides the address).
export function objectiveDocumentBodyOf(
    createBody: ObjectiveCreateBody,
): Record<string, unknown> {
    const {
        organization_id: _organizationId, ...entity
    } = createBody.objective;
    return entity;
}

// The wire body a live PUT objectives/:id/revisions/:rid would
// carry for this SAME write: the create body's revision
// sub-object VERBATIM — already the exact {objective_id, name,
// description, member_id, at} shape validateObjectiveRevisionEntity
// admits (objective revisions carry no organization_id column at
// all), so no stripping is needed here.
export function objectiveRevisionBodyOf(
    createBody: ObjectiveCreateBody,
): Record<string, unknown> {
    return createBody.revision;
}

// Objective creation: the objective row and its FIRST
// revision commit as ONE transaction — a mid-write
// failure rolls the whole thing back rather than
// orphaning a definitionless objective. The org-scoped
// store stamps organization_id from the verified token
// before validating the objective, so the body OMITS
// it. No state event is written (a fresh objective reads
// as active until a later archival event), so the
// handler needs no actor. Exported so the seed can drive
// objective creation through the same gate the route
// uses (Decision 6's below-facade carve-out) — this is
// also Phase 1's dual-write insertion seam. `pairs` is
// optional so the seed's below-facade calls (api/mock-
// data.ts, no gate, no pairs) keep compiling unchanged;
// the route always supplies the bundle, since 'objectives'
// is pair-wired and never bearer-exempt. Task 3: create
// appends THREE pairs — the operation pair (the gate's
// own), the synthesized document pair, and the synthesized
// revision pair — in that order, LAST, pairs-or-nothing.
export async function postObjectiveCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pairs?: ObjectiveCreationPairs,
): Promise<void> {
    const b = validateObjectiveCreateBody(body);
    return db.transaction(
        [
            'objectives', 'objective_revisions',
            'requests', 'responses',
        ],
        async (view) => {
            await view.objectives.put(
                b.id,
                b.objective as unknown as
                    Omit<ObjectiveEntity, 'id'>,
            );
            await view.objectiveRevisions.put(
                b.revisionId,
                b.revision as unknown as
                    Omit<ObjectiveRevisionEntity, 'id'>,
            );
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                await appendMessagePair(view, pairs.revision);
            }
        },
    );
}

// Objective document write — the seventh family, and the THIRD
// 'stateless' one (OBJECTIVES_WIRING's own comment: a third
// distinct rationale, Author gate 3). A document PUT here is a
// pure entity edit: the objectives row and its pair commit as
// ONE transaction — a mid-write failure rolls the whole thing
// back rather than leaving a half-written objective.
// validateObjectiveDocumentBody rejects a body carrying the
// trio at the gate, so this op never needs to defend against
// one downstream. documentOperationOrganization's merge mirrors
// postRecordAttributeDocumentOp's own shape for uniformity,
// though it is DORMANT here for the same reason: zero client
// callers ever supply organization_id on this PUT, and the seed
// batches objective creation through postObjectiveCreationOp
// instead — never this op — so the merge is inert rather than
// load-bearing. NEVER a states event (Global Constraints: the
// states 911 pin is ABSOLUTE) — no genesis, no trio, no
// lifecycle walk anywhere in this plane. `pair` is optional so
// a future below-facade caller keeps compiling; the live route
// always supplies one, since 'objectives/:id' is pair-wired and
// never bearer-exempt. The actor parameter is spelled `_actor`
// for the same reason postWorkOrderDocumentOp/
// postRecordAttributeDocumentOp spell it that way: there is no
// state event here to author.
export async function postObjectiveDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<ObjectiveEntity> {
    const doc = validateObjectiveDocumentBody(withoutId(body));
    return db.transaction(
        ['objectives', 'requests', 'responses'],
        async (view) => {
            const written = await view.objectives.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<ObjectiveEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// The three pairs a live POST /ai-members or /human-members
// create, or a live POST /ai-members/:id or /human-members/:id
// edit, forms (Task 4, the migration's FIRST composed-EDIT
// synthesis): the gate's own operation pair (the create's 204
// at the bare family address, or the edit's 204 at the entity
// address — both already pair-wired), the synthesized member
// document pair (members/:id — the ONE shared roster row every
// member kind writes through), and the synthesized detail
// document pair (ai-members/:id or human-members/:id — the
// kind-specific facet). All three share ONE requestAt (the
// write's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePair's nowUtc() is monotonic). members/:id
// never hosts the operation pair (a wholly separate address), so
// memberDocument is that address's first-ever pair on create and
// its new head on every edit. detailDocument shares the
// OPERATION pair's own address — the flows create-address-
// collapse precedent (a bare create-POST's createBodyIdField
// override and an edit-POST's path-derived uriId both land on
// the SAME (uriPrefix, uriId) as a live PUT there would) — so it
// becomes THAT address's new head, appended after the operation
// pair.
//
// identityDocument (Task 5) widens this SAME bundle for the
// human create/edit routes alone: the synthesized identities/:id
// document pair, byte-indistinguishable from a live PUT there
// ({kind:'person'}), appended LAST — after detailDocument. The AI
// routes never populate it (finding 10: postAiMemberCreationOp
// writes no identities row — an AI member has no identity of its
// own), so postAiMemberCreationOp/postAiMemberEditOp always
// receive it undefined; the field stays on this ONE shared type
// rather than forking a person-only sibling, since every
// consuming op already honors it uniformly via the SAME
// `!== undefined` guard the other two fields use. On a human
// EDIT the body is byte-identical to the create's own, so it
// FOLDS by message_hash (appendMessagePair's dedup skip) rather
// than appending a second row — the SAME fold memberDocument's
// own `type` field already exercises on every edit.
export interface MemberWritePairs {
    readonly operation: MessagePair;
    readonly memberDocument: MessagePair;
    readonly detailDocument: MessagePair;
    readonly identityDocument?: MessagePair;
}

// The shared BODY builders — the ONE-voice seam both the live
// route-inline formation (the four routes below) and the seed's
// invocation construction (api/mock-data/seed-message-pairs.ts)
// consume — the objectiveDocumentBodyOf/objectiveRevisionBodyOf
// precedent.

// The wire body a live PUT members/:id would carry for this SAME
// write: `type` alone — validateMemberDocumentBody's only field.
// The member kind is a server-supplied fact the caller pins
// (never read off a request body), so this takes the kind
// directly rather than re-deriving it from a body shape — the
// ONE builder both the ai and human create/edit sites share.
export function memberDocumentBodyOf(
    type: MemberKind,
): Record<string, unknown> {
    return { type };
}

// The wire body a live PUT identities/:id would carry for this
// SAME write: `kind` alone — validateIdentityDocumentBody's only
// field. Same rationale as memberDocumentBodyOf: the identity
// kind is a server-supplied fact the caller pins, never read off
// a request body — the ONE builder both the identity-create
// route and the human create/edit routes share (the latter
// always pass 'person', the sole kind a member's own identity
// ever takes).
export function identityDocumentBodyOf(
    kind: IdentityKind,
): Record<string, unknown> {
    return { kind };
}

// The wire body a live PUT ai-members/:id would carry for this
// SAME write: the create/edit body's detail sub-object VERBATIM
// — already the exact {name, description, model, skill_focus}
// shape validateAiMemberDocumentBody admits, so no stripping or
// re-shaping is needed. Accepts either AIMemberCreateBody or
// AIMemberEditBody (both carry a `.detail` field of this SAME
// shape) — the loose Record<string, unknown> parameter is the
// one seam serving both call sites, the SAME reason
// objectiveRevisionBodyOf needs no per-field picking.
export function aiMemberDetailBodyOf(
    body: Record<string, unknown>,
): Record<string, unknown> {
    return body.detail as Record<string, unknown>;
}

// The wire body a synthesized PUT human-members/:id would carry
// for this SAME write: the create/edit body's detail sub-object
// VERBATIM — the aiMemberDetailBodyOf precedent, for the sibling
// facet that carries no live PUT of its own (HUMAN_MEMBERS_
// WIRING's own comment: the first registered family without
// one).
export function humanMemberDetailBodyOf(
    body: Record<string, unknown>,
): Record<string, unknown> {
    return body.detail as Record<string, unknown>;
}

// AI-member creation: the parent member row, the
// ai_members detail row, and the initial state event
// commit as ONE transaction — a mid-write failure rolls
// the whole thing back rather than orphaning a half-built
// member. Each facet store re-validates its own body as
// the composing puts land. The parent member type is a
// server-supplied fact the handler pins; members and
// ai_members are GLOBAL passthrough stores, so the facet
// puts go straight to their stores. The initial event is
// authored by the verified caller (actor), never the
// body. Exported so the seed can drive AI-member creation
// through the same gate the route uses (Decision 6's
// below-facade carve-out) — this is also Phase 1's
// dual-write insertion seam. `pairs` is optional so the
// seed's below-facade calls (api/mock-data.ts, no gate,
// no pairs) keep compiling unchanged; the route always
// supplies the bundle, since 'ai-members' is pair-wired
// and never bearer-exempt. Task 4: create appends THREE
// pairs — the operation pair (the gate's own), the
// synthesized member document pair, and the synthesized
// detail document pair — in that order, LAST,
// pairs-or-nothing.
export async function postAiMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pairs?: MemberWritePairs,
): Promise<void> {
    const b = validateAIMemberCreateBody(body);
    return db.transaction(
        [
            'members', 'ai_members', 'states',
            'requests', 'responses',
        ],
        async (view) => {
            await view.members.put(
                b.id, { type: 'ai' },
            );
            await view.aiMembers.put(
                b.id,
                b.detail as unknown as
                    Omit<AIMemberEntity, 'id'>,
            );
            await view.states.postEvent(
                b.initialStateEventId,
                b.id,
                b.initialState,
                actor,
                b.initialStateAt,
            );
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(
                    view, pairs.memberDocument,
                );
                await appendMessagePair(
                    view, pairs.detailDocument,
                );
            }
        },
    );
}

// Human-member creation: the parent member row, the
// identity, the detail row, and the initial state event
// commit as ONE transaction — a mid-write failure rolls
// the whole thing back rather than orphaning a half-built
// member. PII no longer lands here (Phase 10 Task 2's
// intake decomposition): it enters later via the separate
// PUT identities/:id/pii, so a create can never roll back
// on a bad PII sub-object — the torn-state acceptance the
// phase names. Each facet store re-validates its own body
// as the composing puts land. The parent member type and
// the identity kind are server-supplied facts the handler
// pins; members/identities are GLOBAL passthrough stores,
// so the facet puts go straight to their stores. The
// initial event is authored by the verified caller
// (actor), never the body. Exported so the seed can drive
// human-member creation through the same gate the route
// uses (Decision 6's below-facade carve-out) — this is
// also Phase 1's dual-write insertion seam. `pairs` is
// optional so the seed's below-facade calls (api/mock-
// data.ts, no gate, no pairs) keep compiling unchanged;
// the route always supplies the bundle, since
// 'human-members' is pair-wired and never bearer-exempt.
// Task 4: create appends THREE pairs — the operation pair
// (the gate's own), the synthesized member document pair,
// and the synthesized detail document pair — in that
// order, LAST, pairs-or-nothing. The PII facet's own
// document pair (identities/:id/pii) is formed and
// appended by its OWN, separate write (the client's second
// hop; the seed's own companion postIdentityPiiDocumentOp
// call) — never synthesized here. Task 5: a FOURTH pair —
// the synthesized identities/:id document — appends LAST,
// after detailDocument, IFF the route supplied one (a human
// member's own identity row, unlike an AI member — finding
// 10 — which never carries one, so postAiMemberCreationOp's
// OWN bundle stays exactly three).
export async function postHumanMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pairs?: MemberWritePairs,
): Promise<void> {
    const b = validateHumanMemberCreateBody(body);
    return db.transaction(
        [
            'members', 'identities',
            'human_members', 'states',
            'requests', 'responses',
        ],
        async (view) => {
            await view.members.put(
                b.id, { type: 'human' },
            );
            await view.identities.put(
                b.id, { kind: 'person' },
            );
            await view.humanMembers.put(
                b.id,
                b.detail as unknown as
                    Omit<HumanMemberEntity, 'id'>,
            );
            await view.states.postEvent(
                b.initialStateEventId,
                b.id,
                b.initialState,
                actor,
                b.initialStateAt,
            );
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(
                    view, pairs.memberDocument,
                );
                await appendMessagePair(
                    view, pairs.detailDocument,
                );
                if (pairs.identityDocument !== undefined) {
                    await appendMessagePair(
                        view, pairs.identityDocument,
                    );
                }
            }
        },
    );
}

// AI-member edit: extracted byte-for-byte from the anonymous
// POST ai-members/:id closure (Task 4) — the parent member row
// and the ai_members detail row re-put as ONE transaction; no
// states interaction (an edit does not move the member's
// lifecycle — genesis/archive ride PUT states/:id instead).
// Exported, mirroring the creation ops above, so the route can
// call it after forming the bundle inline; `pairs` is optional
// so a below-facade caller with no pairs keeps compiling. Task
// 4: the FIRST composed-EDIT synthesis — edit now appends THREE
// pairs, the SAME order as create.
export async function postAiMemberEditOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    pairs?: MemberWritePairs,
): Promise<void> {
    const b = validateAIMemberEditBody(body);
    return db.transaction(
        [
            'members', 'ai_members',
            'requests', 'responses',
        ],
        async (view) => {
            await view.members.put(
                id, { type: 'ai' },
            );
            await view.aiMembers.put(
                id,
                b.detail as unknown as
                    Omit<AIMemberEntity, 'id'>,
            );
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(
                    view, pairs.memberDocument,
                );
                await appendMessagePair(
                    view, pairs.detailDocument,
                );
            }
        },
    );
}

// Human-member edit: extracted byte-for-byte from the anonymous
// POST human-members/:id closure (Task 4) — the postAiMemberEditOp
// precedent, for the sibling facet: the member facets re-put as
// ONE transaction; no states interaction (an edit does not move
// the member's lifecycle). PII no longer lands here (Phase 10
// Task 2's intake decomposition): it changes ONLY via the
// separate PUT identities/:id/pii, fired by the client IFF its
// dirty check finds it changed — this op never sees it either
// way, so a detail-only edit stays exactly this one write. Task
// 5: a FOURTH pair — the synthesized identities/:id document —
// appends LAST, IFF the route supplied one; its body
// ({kind:'person'}) is byte-identical to the create's own, so it
// FOLDS by message_hash (appendMessagePair's dedup skip) rather
// than appending a second row.
export async function postHumanMemberEditOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    pairs?: MemberWritePairs,
): Promise<void> {
    const b = validateHumanMemberEditBody(body);
    return db.transaction(
        [
            'members', 'identities',
            'human_members',
            'requests', 'responses',
        ],
        async (view) => {
            await view.members.put(
                id, { type: 'human' },
            );
            await view.identities.put(
                id, { kind: 'person' },
            );
            await view.humanMembers.put(
                id,
                b.detail as unknown as
                    Omit<HumanMemberEntity, 'id'>,
            );
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(
                    view, pairs.memberDocument,
                );
                await appendMessagePair(
                    view, pairs.detailDocument,
                );
                if (pairs.identityDocument !== undefined) {
                    await appendMessagePair(
                        view, pairs.identityDocument,
                    );
                }
            }
        },
    );
}

// Identity creation: the identity row alone (person), OR the
// identity row and its client_secret credential row (service)
// as ONE transaction — a mid-write failure rolls the service
// pair back rather than orphaning a kindless identity. A
// person's PII no longer lands here (Phase 10 Task 2's intake
// decomposition): it enters later via the separate PUT
// identities/:id/pii, so a person create can never roll back on
// a bad PII sub-object — the torn-state acceptance the phase
// names. The identity kind is the server-supplied fact the
// handler pins; identities/identity_credentials are GLOBAL/
// parent-scoped stores (no org stamp), so the facet puts go
// straight to their stores, each re-validating its own body as
// the composing put lands. The credential's secret is hashed
// client-side — the route touches no crypto. NO state event (an
// identity carries no lifecycle event at creation), so the
// handler needs no actor. The tx table set branches per mode so
// each names exactly the tables it writes.
// The pairs a live POST /identities create forms (Task 5): the
// gate's own operation pair (the 204 at the identities/:id
// address — createBodyIdField collapses POST identities and PUT
// identities/:id onto the SAME address, the ai-members/detail-
// document create-address-collapse precedent), and the
// synthesized identities/:id document pair — byte-
// indistinguishable from a live PUT there ({kind} alone) —
// sharing that SAME address, appended after the operation pair.
// A service ALSO forms the credential-document pair
// (identities/:id/credentials/:cid — its OWN address; the secret
// already arrives client-hashed), appended last. The
// discriminated union mirrors IdentityCreatePersonBody/
// IdentityCreateServiceBody one layer down (validators.ts) rather
// than an optional credentialDocument field, so a person bundle
// can never carry a stray credential pair by construction.
export type IdentityWritePairs =
    | {
        readonly kind: 'person';
        readonly operation: MessagePair;
        readonly identityDocument: MessagePair;
    }
    | {
        readonly kind: 'service';
        readonly operation: MessagePair;
        readonly identityDocument: MessagePair;
        readonly credentialDocument: MessagePair;
    };

// Exported so the seed can drive identity creation through
// the same gate the route uses (Decision 6's below-facade
// carve-out) — this is also Phase 1's dual-write insertion
// seam. `pairs` is optional so the seed's below-facade calls
// (api/mock-data.ts, no gate, no pairs) keep compiling
// unchanged; the route always supplies the bundle, since
// 'identities' is pair-wired and never bearer-exempt. Task 5:
// create appends the operation pair, the synthesized identities
// document pair (+ the credential document pair for service) —
// in that order, LAST, bundle-or-nothing.
export async function postIdentityCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pairs?: IdentityWritePairs,
): Promise<void> {
    const b = validateIdentityCreateBody(body);
    const tables = b.kind === 'person'
        ? ['identities', 'requests', 'responses']
        : [
            'identities', 'identity_credentials',
            'requests', 'responses',
        ];
    return db.transaction(
        tables,
        async (view) => {
            await view.identities.put(
                b.id, { kind: b.kind },
            );
            if (b.kind === 'service') {
                const { id: credId, ...fields } =
                    b.credential as {
                        id: string;
                    } & Record<string, unknown>;
                await view.identityCredentials.put(
                    credId,
                    fields as unknown as
                        Omit<
                            IdentityCredentialEntity, 'id'
                        >,
                );
            }
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(
                    view, pairs.identityDocument,
                );
                if (pairs.kind === 'service') {
                    await appendMessagePair(
                        view, pairs.credentialDocument,
                    );
                }
            }
        },
    );
}

// The create's synthesized document body (Task 3, the
// flow-creation-triple precedent): the SAME shape a live
// genesis PUT /work-orders/:id would carry — the work
// order's own three fields, picked directly from b.workOrder
// (never spread verbatim) so a below-facade caller's
// tolerated organization_id (validateWorkOrderCreateBody
// never restricts workOrder's own keys) never leaks into the
// byte-compared document. The ONE construction both the
// route's pre-tx pair body and this comment's own covenant
// describe — never a second, divergently-picked literal.
function workOrderCreateDocumentBody(
    b: WorkOrderCreateBody,
): Record<string, unknown> {
    return {
        display_id: pickString(b.workOrder, 'display_id'),
        flow_graph: pickString(b.workOrder, 'flow_graph'),
        position: pickNumber(b.workOrder, 'position'),
    };
}

// The three pairs a live POST /work-orders forms (Task 3):
// the gate's own operation pair (204, at the work-orders/:id
// address per the registry's createBodyIdField — POST
// 'work-orders' and PUT 'work-orders/:id' collapse onto the
// SAME (uriPrefix, uriId), exactly as flows/:id did for its
// own create), plus the document and join pairs the route
// pre-forms below. All three share ONE requestAt (the
// create's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePair's nowUtc() is monotonic), so the
// document pair — appended after the operation pair — becomes
// the address's head.
export interface WorkOrderCreationPairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly join: MessagePair;
}

// Work-order creation: the work_orders row, its
// flow_work_orders join row, and THREE initial state
// events (the start transition, the post-start
// transition, and the creation-time 'claimed') commit as
// ONE transaction — a mid-write failure rolls the whole
// thing back rather than orphaning a half-built work
// order. The org-scoped work_orders store stamps
// organization_id from the verified token and re-validates
// through validateWorkOrderEntity, so the work-order body
// OMITS it; the join row derives org from its flow and is
// re-validated by the flow_work_orders store. The three
// events are applied IN ORDER and authored by the verified
// caller (actor), never the body. `pairs` stays optional on
// the signature; today only the live route ever calls this
// op — since Phase 5 Task 4 the seed (api/mock-data.ts) drives
// work-order creation through postWorkOrderDocumentOp /
// postFlowWorkOrderDocumentOp instead, with its
// states/state_field_values traces staying direct writes,
// never through this op. The route always supplies the
// triple, since 'work-orders' is pair-wired and never
// bearer-exempt. The route (not this op) forms all three
// pairs pre-tx — see route('work-orders', ...) below — since
// forming the document/join pairs needs the fence
// organization and the work-orders/:id +
// flows/:id/work-orders/:woid response specs, both
// route-table concerns.
export async function postWorkOrderCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    actor: Id,
    pairs?: WorkOrderCreationPairs,
): Promise<void> {
    const b = validateWorkOrderCreateBody(body);
    return db.transaction(
        [
            'work_orders', 'flow_work_orders', 'states',
            'requests', 'responses',
        ],
        async (view) => {
            await view.workOrders.put(
                b.id,
                b.workOrder as unknown as
                    Omit<WorkOrderEntity, 'id'>,
            );
            await view.flowWorkOrders.put(
                b.flowWorkOrderId,
                b.flowWorkOrder as unknown as
                    Omit<FlowWorkOrderEntity, 'id'>,
            );
            for (let i = 0; i < 3; i++) {
                await view.states.postEvent(
                    b.stateEventIds[i]!,
                    b.id,
                    b.states[i]!,
                    actor,
                    b.stateEventAts[i]!,
                );
            }
            // Three pairs or none (Atomicity): the operation
            // pair (the gate's own), the synthesized document
            // pair, and the synthesized join pair — appended
            // in that order, LAST, so the document pair's
            // response `at` strictly follows the operation
            // pair's.
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                await appendMessagePair(view, pairs.join);
            }
        },
    );
}

// Claim a work order. The read of the prior claim and
// the append of the new claim events ride ONE
// transaction, so two concurrent claims cannot both
// observe "no live claim" (the duplicate-claim TOCTOU).
// A live claim by another member is a 409; by the
// caller, an idempotent no-op. A claim aged past the
// flow's lockTimeout is superseded: 'claim_expired'
// (naming the prior claimant) and the new 'claimed'
// land atomically. Exported so the seed can drive a
// work-order claim through the same gate the route uses
// — this is also Phase 1's dual-write insertion seam. `pair`
// is optional, mirroring postWorkOrderCreationOp; it is
// appended on EVERY exit path (the idempotent re-claim
// no-op included), since a wired route must never resolve a
// pair the transaction never stored (the gate crashes loud
// on that mismatch).
export async function postWorkOrderClaimOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        ['work_orders', 'states', 'requests', 'responses'],
        async (view) => {
            const b =
                validateWorkOrderClaimBody(body);
            const wo = await view.workOrders
                .getById(workOrderId);
            const graph =
                validateWorkOrderFlowGraphJson(
                    wo.flow_graph,
                    'work_orders.flow_graph',
                );
            const events = await view.states
                .getAllFor(workOrderId);
            const prior = latestClaimEvent(
                events, workOrderId,
            );
            const priorLive = prior !== null
                && prior.state === 'claimed'
                && !isClaimEventExpired(
                    prior, graph.lockTimeout,
                );
            if (priorLive) {
                if (prior.member_id === actor) {
                    if (pair !== undefined) {
                        await appendMessagePair(
                            view, pair,
                        );
                    }
                    return;
                }
                throw new ApiError(
                    'work order is already'
                        + ' claimed',
                    HTTP_CONFLICT,
                );
            }
            if (
                prior !== null
                && prior.state === 'claimed'
            ) {
                await view.states.postEvent(
                    b.expireEventId, workOrderId,
                    'claim_expired',
                    prior.member_id, b.expireAt,
                );
            }
            await view.states.postEvent(
                b.claimEventId, workOrderId,
                'claimed', actor, b.claimAt,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Transition a work order along an edge. The web-app
// computes WHAT to write — the target node, the field-value
// rows, and whether a live claim must be implicitly released
// — exactly as POST /work-orders keeps its graph derivation
// client-side. This op writes them ATOMICALLY: the
// transition state event (entity_id = the work order, state =
// the target node), then each state_field_values row (the
// field inputs, re-validated by the store as they land), then
// the OPTIONAL 'claim_released' event. A mid-write failure
// rolls the whole thing back. Authorship of the transition
// event AND the release event is stamped from the verified
// caller (actor) — the same author the old commit batch
// produced, where both events flowed through PUT /states/:id.
// Exported so the seed can drive a work-order transition
// through the same gate the route uses — this is also
// Phase 1's dual-write insertion seam. `pair` is optional,
// mirroring postWorkOrderCreationOp.
export async function postWorkOrderTransitionOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    pair?: MessagePair,
): Promise<void> {
    const b = validateWorkOrderTransitionBody(body);
    return db.transaction(
        [
            'states', 'state_field_values',
            'requests', 'responses',
        ],
        async (view) => {
            await view.states.postEvent(
                b.transitionEventId,
                workOrderId,
                b.targetState,
                actor,
                b.transitionAt,
            );
            for (const row of b.fieldValues) {
                await view.stateFieldValues.put(
                    row.id,
                    row.fields as unknown as
                        Omit<StateFieldValueEntity, 'id'>,
                );
            }
            if (b.release !== null) {
                await view.states.postEvent(
                    b.release.id,
                    workOrderId,
                    b.release.state,
                    actor,
                    b.release.at,
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Work-order document write — the fourth family's evidence for
// the 'stateless' lifecycle class (Decision 7 does NOT apply
// here): a work order's lifecycle is written ONLY by the
// create/claim/transition ops above and the states/:id unclaim
// path, never by a document PUT, so this op posts NO states
// event of its own — UNLIKE postIdeaDocumentOp/
// postProjectDocumentOp/postFlowDocumentOp, which each fold a
// lifecycle trio into the SAME transaction. A document PUT here
// is a pure entity edit: the work_orders row and its pair
// commit as ONE transaction — a mid-write failure rolls the
// whole thing back rather than leaving a half-written document.
// validateWorkOrderDocumentBody rejects a body carrying the
// trio at the gate (the stateless covenant is validator-
// enforced, not caller discipline), so this op never needs to
// defend against one downstream. The org-scoped work_orders
// store stamps organization_id from the verified token and
// re-validates through validateWorkOrderEntity, so the entity
// body OMITS it; the below-facade seed path (no scoping
// wrapper) embeds it in the raw body and this op reads it
// straight back to merge it in — inert for the fenced route
// (overwritten either way), load-bearing for the seed. Exported
// so the seed can drive a work-order document write through the
// same op the route uses (Decision 6's below-facade carve-out).
// `pair` is optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'work-orders/:id' is pair-wired and never bearer-exempt. The
// actor parameter is spelled `_actor`: it exists for the
// wiring's documentOp signature uniformity only (every
// DocumentFamilyWiring.documentOp takes one) — there is no
// state event here to author, so the pair's own
// requesterIdentityId is the only authorship this write carries.
export async function postWorkOrderDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<WorkOrderEntity, 'id'>> {
    const doc = validateWorkOrderDocumentBody(withoutId(body));
    return db.transaction(
        ['work_orders', 'requests', 'responses'],
        async (view) => {
            const written = await view.workOrders.put(
                id,
                {
                    ...doc.entity,
                    ...documentOperationOrganization(body),
                } as unknown as Omit<WorkOrderEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Flow work-order join document write — extracted byte-for-
// byte from the hand-written flows/:id/work-orders/:woid PUT
// handler (Phase 1 fix-3 / Phase 4 0a950480's extract-function
// idiom: bundle the definition with its one call-site re-
// point, own commit) so the seed can drive the same write path
// (Decision 6's below-facade carve-out). A document PUT here is
// a pure entity edit: the flow_work_orders row and its pair
// commit as ONE transaction. `pair` is optional so a below-
// facade caller with no pair keeps compiling; the live route
// always supplies one, since 'flows/:id/work-orders/:woid' is
// pair-wired and never bearer-exempt. The actor parameter is
// spelled `_actor` for the same reason postWorkOrderDocumentOp
// spells it that way: there is no state event here to author.
export async function postFlowWorkOrderDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<FlowWorkOrderEntity, 'id'>> {
    return db.transaction(
        ['flow_work_orders', 'requests', 'responses'],
        async (view) => {
            const written = await view.flowWorkOrders
                .put(
                    id,
                    withoutId(body) as unknown as
                        Omit<FlowWorkOrderEntity, 'id'>,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Flow record join document write — extracted byte-for-byte
// from the hand-written flows/:id/records/:frid PUT handler
// (Phase 1 fix-3 / Phase 4 0a950480's extract-function idiom:
// bundle the definition with its one call-site re-point, own
// commit) so the seed can drive the same write path (Decision
// 6's below-facade carve-out, mirroring
// postFlowWorkOrderDocumentOp above). A document PUT here is a
// pure entity edit: the flow_records row and its pair commit
// as ONE transaction. `pair` is optional so a below-facade
// caller with no pair keeps compiling; the live route always
// supplies one, since 'flows/:id/records/:frid' is pair-wired
// and never bearer-exempt. The actor parameter is spelled
// `_actor` for the same reason postFlowWorkOrderDocumentOp
// spells it that way: there is no state event here to author.
export async function postFlowRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<FlowRecordEntity, 'id'>> {
    return db.transaction(
        ['flow_records', 'requests', 'responses'],
        async (view) => {
            const written = await view.flowRecords
                .put(
                    id,
                    withoutId(body) as unknown as
                        Omit<FlowRecordEntity, 'id'>,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Objective baseline-score document write — extracted byte-for-
// byte from the hand-written projects/:id/objective-baseline-
// scores/:sid PUT handler (the postFlowRecordDocumentOp precedent
// above) so the seed can drive the same write path (Decision 6's
// below-facade carve-out, closing the scores half of the Phase 0
// seed deferral, Phase 7 Task 5). A document PUT here is a pure
// entity edit: the project_objective_baseline_scores row and its
// pair commit as ONE transaction. `pair` is optional so a
// below-facade caller with no pair keeps compiling; the live
// route always supplies one, since this pattern is pair-wired
// and never bearer-exempt. The actor parameter is spelled
// `_actor` for the same reason postFlowRecordDocumentOp spells
// it that way: there is no state event here to author.
export async function postBaselineScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<ProjectObjectiveBaselineScoreEntity, 'id'>> {
    return db.transaction(
        [
            'project_objective_baseline_scores',
            'requests', 'responses',
        ],
        async (view) => {
            const written = await view
                .projectObjectiveBaselineScores.put(
                    id,
                    withoutId(body) as unknown as
                        Omit<
                            ProjectObjectiveBaselineScoreEntity,
                            'id'
                        >,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Objective actual-score document write — extracted byte-for-
// byte from the hand-written projects/:id/objective-actual-
// scores/:sid PUT handler, identically to
// postBaselineScoreDocumentOp above (the postFlowRecordDocumentOp
// precedent), closing the actuals half of the Phase 0 seed
// deferral (Phase 7 Task 5). `pair` is optional so a below-facade
// caller with no pair keeps compiling; the live route always
// supplies one. `_actor` is unused for the same reason
// postBaselineScoreDocumentOp's is: there is no state event here
// to author.
export async function postActualScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<ProjectObjectiveActualScoreEntity, 'id'>> {
    return db.transaction(
        [
            'project_objective_actual_scores',
            'requests', 'responses',
        ],
        async (view) => {
            const written = await view
                .projectObjectiveActualScores.put(
                    id,
                    withoutId(body) as unknown as
                        Omit<
                            ProjectObjectiveActualScoreEntity,
                            'id'
                        >,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Membership document write — extracted byte-for-byte from the
// hand-written memberships/:id PUT closure (the
// postBaselineScoreDocumentOp precedent above): a membership row
// and its pair commit as ONE transaction; no states interaction
// (memberships never post events). `pair` is optional so a
// below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused for the same
// reason postBaselineScoreDocumentOp's is: there is no state
// event here to author.
export async function postMembershipDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<MembershipEntity, 'id'>> {
    return db.transaction(
        ['memberships', 'requests', 'responses'],
        async (view) => {
            const written = await view.memberships.put(
                id,
                withoutId(body) as unknown as
                    Omit<MembershipEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Member document write — extracted byte-for-byte from the
// hand-written members/:id PUT closure (the
// postMembershipDocumentOp precedent above): a members row and
// its pair commit as ONE transaction; no states interaction (an
// edit does not move the member's lifecycle — genesis/archive
// ride PUT states/:id instead). `pair` is optional so a
// below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused for the same
// reason postMembershipDocumentOp's is: there is no state event
// here to author.
export async function postMemberDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<MemberEntity, 'id'>> {
    return db.transaction(
        ['members', 'requests', 'responses'],
        async (view) => {
            const written = await view.members.put(
                id,
                withoutId(body) as unknown as
                    Omit<MemberEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// AI-member document write — extracted byte-for-byte from the
// hand-written ai-members/:id PUT closure (the
// postMemberDocumentOp precedent above): a bare ai_members facet
// row and its pair commit as ONE transaction; no states
// interaction (an edit does not move the member's lifecycle —
// genesis/archive ride PUT states/:id instead). This is the
// SAME PUT the composed POST edit arm at this route sits beside
// (UNTOUCHED by this extraction — Task 4's own scope); the two
// verbs stay independent, per-verb dispatches. `pair` is
// optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one. `_actor` is
// unused for the same reason postMemberDocumentOp's is: there
// is no state event here to author.
export async function postAiMemberDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<AIMemberEntity, 'id'>> {
    return db.transaction(
        ['ai_members', 'requests', 'responses'],
        async (view) => {
            const written = await view.aiMembers.put(
                id,
                withoutId(body) as unknown as
                    Omit<AIMemberEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Human-member document write — authored NEW, mirroring
// postAiMemberDocumentOp's shape exactly: NO live PUT exists to
// extract from (human-members/:id carries only {get, post}
// today, and this task adds no route or verb to it — the
// first registered family without a live document PUT), so
// this op exists for a future synthesis/seed caller only. A
// human_members facet row and its pair would commit as ONE
// transaction; no states interaction (an edit does not move the
// member's lifecycle — genesis/archive ride PUT states/:id
// instead). `pair` is optional so a below-facade caller with no
// pair keeps compiling; `_actor` is unused for the same reason
// postAiMemberDocumentOp's is: there is no state event here to
// author.
export async function postHumanMemberDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<HumanMemberEntity, 'id'>> {
    return db.transaction(
        ['human_members', 'requests', 'responses'],
        async (view) => {
            const written = await view.humanMembers.put(
                id,
                withoutId(body) as unknown as
                    Omit<HumanMemberEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Identity PII document write — extracted byte-for-byte from the
// hand-written identities/:id/pii PUT closure (the
// postMembershipDocumentOp precedent above): an identity_pii row
// and its pair commit as ONE transaction; no states interaction
// (a PII write does not move the identity's own lifecycle).
// `pair` is optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one. `_actor` is
// unused for the same reason postMembershipDocumentOp's is:
// there is no state event here to author. The pair rides
// `replacePiiSlot` (Phase 10 Task 3), not the generic
// `appendMessagePair` — /pii is the message plane's sanctioned
// hard-delete zone (api/pii-hard-delete.ts).
export async function postIdentityPiiDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityPiiEntity, 'id'>> {
    return db.transaction(
        ['identity_pii', 'requests', 'responses'],
        async (view) => {
            const written = await view.identityPii.put(
                id,
                withoutId(body) as unknown as
                    Omit<IdentityPiiEntity, 'id'>,
            );
            if (pair !== undefined) {
                await replacePiiSlot(view, pair.uriPrefix, pair);
            }
            return written;
        },
    );
}

// Identity document write — extracted byte-for-byte from the
// hand-written identities/:id PUT closure (the
// postIdentityPiiDocumentOp precedent above): an identities row
// and its pair commit as ONE transaction; no states interaction
// — an edit does not move the identity's own lifecycle, since
// the shared id's REAL states events ride the untouched states
// plane instead (the members-family precedent: MEMBERS_WIRING's
// shared-log-with-genesis bucket below). `pair` is optional so
// a below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused for the same
// reason postIdentityPiiDocumentOp's is: there is no state
// event here to author.
export async function postIdentityDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityEntity, 'id'>> {
    return db.transaction(
        ['identities', 'requests', 'responses'],
        async (view) => {
            const written = await view.identities.put(
                id,
                withoutId(body) as unknown as
                    Omit<IdentityEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Identity credential document write — extracted byte-for-byte
// from the hand-written identities/:id/credentials/:cid PUT
// closure (the postIdentityDocumentOp precedent above): an
// identity_credentials row and its pair commit as ONE
// transaction; no states interaction (a credential write does
// not move the identity's own lifecycle). `pair` is optional so
// a below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused for the same
// reason postIdentityDocumentOp's is: there is no state event
// here to author.
export async function postIdentityCredentialDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityCredentialEntity, 'id'>> {
    return db.transaction(
        ['identity_credentials', 'requests', 'responses'],
        async (view) => {
            const written = await view
                .identityCredentials.put(
                    id,
                    withoutId(body) as unknown as
                        Omit<IdentityCredentialEntity, 'id'>,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Role grant document write — extracted byte-for-byte from the
// hand-written role-grants/:id PUT closure (the
// postIdentityCredentialDocumentOp precedent above): a
// role_grants row and its pair commit as ONE transaction; no
// states interaction (a role grant is its own ledger, not a
// states event). The written row's organization_id is stamped
// by the ORG-SCOPED store this transaction's `view` binds to
// (the role-grants/:id WRITE_RESPONSE_SPECS entry re-derives the
// SAME stamp from the fence for the wire body, untouched by this
// extraction — see its own comment in WRITE_RESPONSE_SPECS).
// `pair` is optional so a below-facade caller with no pair keeps
// compiling; the live route always supplies one. `_actor` is
// unused for the same reason postIdentityCredentialDocumentOp's
// is: there is no state event here to author.
export async function postRoleGrantDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<RoleGrantEntity, 'id'>> {
    return db.transaction(
        ['role_grants', 'requests', 'responses'],
        async (view) => {
            const written = await view.roleGrants.put(
                id,
                withoutId(body) as unknown as
                    Omit<RoleGrantEntity, 'id'>,
            );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// Identity provider document write — extracted byte-for-byte
// from the hand-written identity-providers/:id PUT closure (the
// postRoleGrantDocumentOp precedent above): an identity_providers
// row and its pair commit as ONE transaction; no states
// interaction (a provider link/unlink is its own ledger, not a
// states event). `pair` is optional so a below-facade caller
// with no pair keeps compiling; the live route always supplies
// one. `_actor` is unused for the same reason
// postRoleGrantDocumentOp's is: there is no state event here to
// author. Extracted for Phase 10 Task 8 Session B, the
// controller-sanctioned deviation mirroring Task 4's own
// extraction: a below-facade fixture (tests/identity-fixtures.ts)
// needs an exported op to form a pair for a raw-put row that
// would otherwise go derivation-invisible once GET
// identity-providers flips.
export async function postIdentityProviderDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityProviderEntity, 'id'>> {
    return db.transaction(
        ['identity_providers', 'requests', 'responses'],
        async (view) => {
            const written = await view
                .identityProviders.put(
                    id,
                    withoutId(body) as unknown as
                        Omit<IdentityProviderEntity, 'id'>,
                );
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return written;
        },
    );
}

// The pre-tx response body for each pair-wired write —
// computed through the SAME validator/stamp its own handler
// applies, so the gate's precomputed body is byte-identical to
// what the transaction actually writes (pinned by
// tests/api-shadow-ledger-ideas.test.ts: each 200 route's wire
// body deep-equals a direct domain read taken afterward). A
// pattern absent here, or present with no successBody, returns
// 204 with no body. Keyed by route pattern, not verb — but
// ONLY for the pattern's PUT or POST verb: a DELETE on a wired
// pattern never consults this map (the gate hardcodes 204 for
// every DELETE — see api/api.ts), so a pattern that carries
// both a PUT (200, its written row) and a DELETE (204) needs
// exactly one entry here, describing the PUT alone.
export interface WriteResponseSpec {
    readonly status: number;
    readonly successBody?: (
        params: string[],
        body: Record<string, unknown> | undefined,
        actor: Id,
        organization: Id | undefined,
    ) => unknown;
}

// Almost every wired pattern exposes exactly one non-DELETE
// verb, so a single WriteResponseSpec fully describes its
// success shape. 'ai-members/:id' is the first pattern to wire
// BOTH a PUT (the bare ai_members facet put, 200 + written row)
// and a POST (the composed members + ai_members edit, 204, no
// body) — their response shapes genuinely diverge, so that one
// entry supplies a spec per verb instead. Distinguished from a
// plain WriteResponseSpec by the absence of `status` at the top
// level (see isPerVerbWriteResponseSpec in api.ts).
export interface PerVerbWriteResponseSpec {
    readonly put?: WriteResponseSpec;
    readonly post?: WriteResponseSpec;
}

export const WRITE_RESPONSE_SPECS:
    Readonly<
        Record<string, WriteResponseSpec | PerVerbWriteResponseSpec>
    > = {
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody: it validates the
    // full wire document (entity + trio) through the wiring's
    // OWN validator and discards the trio — the same GET/PUT
    // symmetry Decision 7's wire-parity rule holds for reads.
    'ideas/:id': documentWriteResponseSpec(IDEAS_WIRING),
    'ideas/:id/conversion': { status: 204 },
    'ideas/:id/submissions/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdeaSubmissionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'states/:id': {
        status: 200,
        successBody: (params, body, actor) => ({
            id: param(params, 0),
            ...validateStateBody(withoutId(body ?? {})),
            member_id: actor,
        }),
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale.
    'projects/:id': documentWriteResponseSpec(PROJECTS_WIRING),
    'projects/:id/flows/:pfid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateProjectFlowEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'flows': { status: 204 },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. flows/:id is the
    // FIRST locked-class entry (Task 3): the response shape is
    // unchanged either way (RESPONSE-BYTE PARITY, verified at
    // plan time) — only the gate's pre-dispatch four-outcome
    // table (api.ts) differs for a locked family, never this
    // successBody.
    'flows/:id': documentWriteResponseSpec(FLOWS_WIRING),
    'flows/:id/undo': { status: 204 },
    'flows/:id/versions': { status: 204 },
    'flows/:id/versions/:vid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowVersionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'work-orders': { status: 204 },
    'work-orders/:id':
        documentWriteResponseSpec(WORK_ORDERS_WIRING),
    'work-orders/:id/claim': { status: 204 },
    'work-orders/:id/transition': { status: 204 },
    'flows/:id/work-orders/:woid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowWorkOrderEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'records': { status: 204 },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. records/:id emits the
    // SAME bytes as before ({id, organization_id, name,
    // description, position}): validateRecordDocumentBody's
    // entity/trio separation guarantees doc.entity never carries
    // the trio, byte-identical to today's hand-built body.
    'records/:id': documentWriteResponseSpec(RECORDS_WIRING),
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. record-attributes/:id
    // emits the SAME bytes as before ({id, organization_id,
    // record_id, name, attribute_type, sort_order, options,
    // constraints}): validateRecordAttributeDocumentBody's
    // entity/organization_id separation guarantees doc.entity
    // never carries the key, byte-identical to today's
    // hand-built body.
    'record-attributes/:id':
        documentWriteResponseSpec(RECORD_ATTRIBUTES_WIRING),
    'flows/:id/records/:frid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowRecordEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'objectives': { status: 204 },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. objectives/:id emits
    // the SAME bytes as before ({id, organization_id, position}):
    // validateObjectiveDocumentBody's entity/organization_id
    // separation guarantees doc.entity never carries the key,
    // byte-identical to today's hand-built body.
    'objectives/:id': documentWriteResponseSpec(OBJECTIVES_WIRING),
    'objectives/:id/revisions/:rid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateObjectiveRevisionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-baseline-scores/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateBaselineScoreEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-actual-scores/:sid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateActualScoreEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. members/:id is the
    // FIRST organizationNested:false family this builder serves
    // — documentWriteResponseSpec's own registration-first
    // consult (this commit) omits the organization_id stamp
    // entirely for this class, so the emitted bytes stay
    // UNCHANGED from the hand-written body above ({id, type}):
    // validateMemberDocumentBody's entity carries no
    // organization_id to spread in the first place, and the
    // consult never adds one from the fence either — key-set and
    // value equality re-confirmed at Step 0(a) of the task that
    // wired this row.
    'members/:id': documentWriteResponseSpec(MEMBERS_WIRING),
    'ai-members': { status: 204 },
    // Per-verb: PUT rides the generic document-form builder (see
    // the ideas/:id entry above for the shared rationale) — the
    // SAME registration-first consult that keeps members/:id
    // byte-unchanged applies here too (ai-members is also
    // organizationNested:false), so the emitted bytes stay
    // UNCHANGED from the hand-written body this replaces. POST
    // is the composed edit (204, no body), untouched this task.
    'ai-members/:id': {
        put: documentWriteResponseSpec(AI_MEMBERS_WIRING),
        post: { status: 204 },
    },
    'human-members': { status: 204 },
    // Per-verb (Task 4): the synthesized detail document pair a
    // create/edit bundle forms at this address needs a PUT-shaped
    // spec (the ai-members/:id precedent) even though NO live PUT
    // route exists here — HUMAN_MEMBERS_WIRING's own comment names
    // this the first registered family without one. The `put` slot
    // therefore serves ONLY the route-inline bundle formation and
    // the seed's own document-class response lookup, never a real
    // client PUT. `post` stays the composed edit (204, no body),
    // unchanged.
    'human-members/:id': {
        put: documentWriteResponseSpec(HUMAN_MEMBERS_WIRING),
        post: { status: 204 },
    },
    'identities': { status: 204 },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the members/:id
    // entry above for the shared rationale. identities is ALSO
    // organizationNested:false, so documentWriteResponseSpec's
    // registration-first consult omits the organization_id stamp
    // here too — the emitted bytes stay UNCHANGED from the
    // hand-written body above ({id, kind}):
    // validateIdentityDocumentBody's entity carries no
    // organization_id to spread in the first place, and the
    // consult never adds one from the fence either — key-set and
    // value equality re-confirmed at Step 0(a) of the task that
    // wired this row.
    'identities/:id': documentWriteResponseSpec(IDENTITIES_WIRING),
    'identities/:id/pii': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityPiiEntity(withoutId(body ?? {})),
        }),
    },
    // The written row's `secret` rides the wire here — a
    // deliberate zero-change carry-over (see the route comment
    // above 'identities/:id/credentials/:cid' in the routes
    // array).
    'identities/:id/credentials/:cid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdentityCredentialEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. memberships/:id emits
    // the SAME bytes as before ({id, organization_id, identity_id,
    // at}): documentWriteResponseSpec stamps organization_id from
    // the fence FIRST, then spreads doc.entity — since
    // MembershipDocumentBody's entity carries its OWN
    // organization_id (unlike objectives' fence-stamped-only
    // {position}), the spread overwrites the stamp with the SAME
    // client-supplied value the hand-written body above already
    // echoed verbatim — key-set and value equality, re-confirmed
    // at Step 0(a) of the task that wired this row.
    'memberships/:id': documentWriteResponseSpec(MEMBERSHIPS_WIRING),
    'identity-tokens/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityTokenEntity(withoutId(body ?? {})),
        }),
    },
    'identity-token-revocations/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityTokenRevocationEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The gate PRE-MINTS the successor jti here — the ONE
    // mint site for a fresh write (this route is REPLAY_
    // EXEMPT_ROUTE_PATTERNS-wired, so a resend never bypasses
    // this resolver the way a document/event-append route's
    // idempotent replay would). The route handler reads this
    // exact value back off the formed pair (pairResponseBody)
    // rather than minting a second one.
    'identity-tokens/:jti/rotation': {
        status: 200,
        successBody: () => ({
            jti: generateCryptoSafeBase62(),
        }),
    },
    'identity-tokens/:jti/revocation': { status: 204 },
    'organizations/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateOrganizationEntity(withoutId(body ?? {})),
        }),
    },
    // role_grants rides the ORG-SCOPED store (unlike its GLOBAL-
    // plane siblings above), which auto-stamps organization_id
    // from the verified token — the wire body omits it (see
    // web-app/app/adapters/role-grants.ts). The gate has no
    // access to that scoped store, so it re-derives the same
    // stamp here, mirroring 'projects/:id' et al.
    'role-grants/:id': {
        status: 200,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateRoleGrantEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'identity-providers/:id': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityProviderEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'states/:id/field-values/:fvid': {
        status: 200,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateStateFieldValueEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
};

// The plain/PerVerb resolution every route-inline document-pair
// block shares (Phase 9 Task 2): a plain WriteResponseSpec
// answers for itself ('status' at the top level); a
// PerVerbWriteResponseSpec answers through its `.put` arm — the
// SAME two shapes the hand-written call sites checked one at a
// time, folded into one shape-driven lookup. The guard-throw
// text is byte-kept: every site hardcoded this exact literal,
// parameterized here by the pattern that would have been
// hardcoded at that site.
function resolveWriteResponseSpec(
    routePattern: string,
): WriteResponseSpec {
    const entry = WRITE_RESPONSE_SPECS[routePattern];
    const spec = entry === undefined
        ? undefined
        : 'status' in entry ? entry : entry.put;
    if (spec === undefined) {
        throw new Error(
            'no per-write response spec for'
            + ' ' + routePattern,
        );
    }
    return spec;
}

// The chain class a formed pair's head resolution takes
// (finding 10 iii/iv): 'supersedes' (default) reads the address'
// real head via headPairIdAt and stores it as headPairId —
// today's ordinary document-revisit shape. 'follows' reads the
// SAME real head but stores it as `follows`, NEVER headPairId —
// the flows/:id/undo locked slot (backed by the responses.follows
// unique index). 'none' skips the head-read entirely and stores
// neither field — the two genesis-forced join sites (flow-create,
// work-order-create), which are Genesis-undefined BY DESIGN even
// on a same-join-id retry (Step 0(d') pin).
export type DocumentPairChainClass =
    'supersedes' | 'follows' | 'none';

export interface DocumentPairFormInput {
    readonly routePattern: string;
    // Pattern params, in order (e.g. ['members/:id']'s single
    // :id, or ['projects/:id/objective-baseline-scores/:sid']'s
    // [projectId, baselineId]).
    readonly params: readonly Id[];
    // undefined only for the record-attribute DELETE tombstone
    // sites, which carry no body — mirroring WritePairInput's own
    // body: Record<string, unknown> | undefined.
    readonly body: Record<string, unknown> | undefined;
    readonly requesterIdentityId: Id;
    readonly requestAt: string;
    readonly organization: Id | undefined;
    readonly method?: 'PUT' | 'DELETE';
    readonly chain?: DocumentPairChainClass;
    // The spec-less tombstone sites (finding 10 i): an explicit
    // response, bypassing WRITE_RESPONSE_SPECS entirely.
    readonly response?: {
        readonly status: number;
        readonly body: unknown;
    };
}

// The shared document-pair former (Phase 9 Task 2, Commandment
// IX): replaces every route-inline formWritePair block that
// shared this ONE core shape — resolve the response, resolve the
// address, head-read per the chain class, form the pair. Lives
// beside WRITE_RESPONSE_SPECS (routes.ts, not message-pair.ts):
// the specs live here, and message-pair.ts must never import
// routes.ts (Step 0(c) — the import graph stays acyclic; routes.ts
// already imports formWritePair/headPairIdAt FROM message-pair.ts,
// so the dependency runs one way only). Builds the pair PRE-TX
// only — the in-tx appendMessagePair calls stay at each op's own
// transaction, untouched.
export async function formDocumentPairFor(
    db: DbAdapter,
    input: DocumentPairFormInput,
): Promise<MessagePair> {
    const routeSegments = input.routePattern.split('/');
    let nextParam = 0;
    const pathSegments = routeSegments.map((segment) =>
        segment.startsWith(':')
            ? input.params[nextParam++]!
            : segment,
    );
    const address = messageAddress(routeSegments, pathSegments);
    const chain = input.chain ?? 'supersedes';
    const head = chain === 'none'
        ? undefined
        : await headPairIdAt(
            db,
            canonicalUriPrefix(
                input.organization, address.uriPrefix,
            ),
            address.uriId,
        );
    let responseStatus: number;
    let responseBody: unknown;
    if (input.response !== undefined) {
        responseStatus = input.response.status;
        responseBody = input.response.body;
    } else {
        const spec = resolveWriteResponseSpec(input.routePattern);
        responseStatus = spec.status;
        responseBody = spec.successBody?.(
            [...input.params], input.body,
            input.requesterIdentityId, input.organization,
        );
    }
    return formWritePair({
        method: input.method ?? 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: input.routePattern,
        routeSegments,
        pathSegments,
        headerFields: [],
        body: input.body,
        requesterIdentityId: input.requesterIdentityId,
        requestAt: input.requestAt,
        organization: input.organization,
        responseStatus,
        responseBody,
        headPairId: chain === 'supersedes' ? head : undefined,
        ...(chain === 'follows' && head !== undefined
            ? { follows: head } : {}),
    });
}

export const routes: Route[] = [
    route('members', {
        // GET is FLIPPED (Task 8): derived via deriveMembers —
        // wire-identical to the hand-written membership-join
        // dispatch it replaces. The org-scoped memberships
        // prefix stands in for the fenced db.memberships
        // read; deriveMemberParents' own global MEMBERS_PREFIX
        // stands in for the unfenced db.members.getAll() read.
        // The join IS the org fence — it re-scopes on an org
        // switch with no denormalized column to keep in sync.
        // The system member still rides along unconditionally
        // — deriveMembers' own filter, mirrored from this
        // closure's prior body — so author resolution
        // (getMemberMap) still finds it; the human/ai roster
        // filters it out by type.
        get: (db, _p, _actor, organization) =>
            deriveMembers(db, requireOrganization(organization)),
    }),
    route('ai-members', {
        // GET is FLIPPED (Task 8): derived via
        // documentCollectionGetHandler — wire-identical to the
        // hand-written db.aiMembers.getAll() dispatch it
        // replaces; ai-members is GLOBAL plane
        // (organizationNested:false), so the read stays
        // unfenced exactly as before.
        get: documentCollectionGetHandler(AI_MEMBERS_WIRING),
        // Admin-only — POST /ai-members has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. Task 4: forms the member-document and
        // detail-document pairs INLINE PRE-TX, beside the gate's
        // own operation pair — the objectives-family precedent
        // (route('objectives', ...) below). See
        // postAiMemberCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: MemberWritePairs | undefined;
            if (
                pair !== undefined && organization !== undefined
            ) {
                const b = validateAIMemberCreateBody(body);
                const memberBody = memberDocumentBodyOf('ai');
                validateMemberDocumentBody(memberBody);
                const memberDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'members/:id',
                        params: [b.id],
                        body: memberBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const detailBody = aiMemberDetailBodyOf(body);
                validateAiMemberDocumentBody(detailBody);
                const detailDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'ai-members/:id',
                        params: [b.id],
                        body: detailBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                pairs = {
                    operation: pair,
                    memberDocument,
                    detailDocument,
                };
            }
            return postAiMemberCreationOp(db, body, actor, pairs);
        },
    }),
    // PUT rides the generic documentPutHandler(AI_MEMBERS_WIRING)
    // (this commit) — wire-identical to postAiMemberDocumentOp's
    // own direct dispatch it replaces (the extraction commit
    // immediately prior). POST stays hand-written beside it — the
    // composed members + ai_members edit, the first pattern in
    // this codebase to need a PER-VERB WriteResponseSpec entry
    // (see message-pair.ts / WRITE_RESPONSE_SPECS). GET reproduces
    // the prior closure byte-equivalently.
    route('ai-members/:id', {
        // GET is FLIPPED (Task 8): absorbed into the generic
        // documentGetHandler(AI_MEMBERS_WIRING) — the SAME
        // wiring row PUT already rides — wire-identical to the
        // hand-written db.aiMembers.getById dispatch it
        // replaces.
        get: documentGetHandler(AI_MEMBERS_WIRING),
        put: documentPutHandler(AI_MEMBERS_WIRING),
        // AI-member edit (Task 4, the migration's FIRST composed-
        // EDIT synthesis): forms the SAME member-document/detail-
        // document bundle the create route above forms, beside
        // the gate's own operation pair (already pair-wired at
        // this exact address). Admin-only, exactly as create — no
        // member-tier POST entry exists. See postAiMemberEditOp
        // for the transaction shape.
        post: async (db, p, body, actor, pair, organization) => {
            const id = param(p, 0);
            let pairs: MemberWritePairs | undefined;
            if (
                pair !== undefined && organization !== undefined
            ) {
                // Gate-check only (result discarded): guarantees
                // body.detail is present and object-shaped before
                // aiMemberDetailBodyOf reads it below — the SAME
                // discard-the-result pattern the objectives route
                // above uses for its OWN synthesized-body checks.
                validateAIMemberEditBody(body);
                const memberBody = memberDocumentBodyOf('ai');
                validateMemberDocumentBody(memberBody);
                const memberDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'members/:id',
                        params: [id],
                        body: memberBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const detailBody = aiMemberDetailBodyOf(body);
                validateAiMemberDocumentBody(detailBody);
                const detailDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'ai-members/:id',
                        params: [id],
                        body: detailBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                pairs = {
                    operation: pair,
                    memberDocument,
                    detailDocument,
                };
            }
            return postAiMemberEditOp(db, id, body, pairs);
        },
    }),
    route('human-members', {
        // GET is FLIPPED (Task 8): derived via
        // documentCollectionGetHandler — wire-identical to the
        // hand-written db.humanMembers.getAll() dispatch it
        // replaces; human-members is GLOBAL plane
        // (organizationNested:false), so the read stays
        // unfenced exactly as before.
        get: documentCollectionGetHandler(HUMAN_MEMBERS_WIRING),
        // Admin-only — POST /human-members has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. Task 4: forms the member-document and
        // detail-document pairs INLINE PRE-TX, the ai-members
        // precedent above, at the human-facet addresses. Task 5:
        // ALSO forms the identities/:id document pair — a human
        // member's own identity row, which an AI member never has
        // (finding 10) — appended LAST. See
        // postHumanMemberCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: MemberWritePairs | undefined;
            if (
                pair !== undefined && organization !== undefined
            ) {
                const b = validateHumanMemberCreateBody(body);
                const memberBody = memberDocumentBodyOf('human');
                validateMemberDocumentBody(memberBody);
                const memberDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'members/:id',
                        params: [b.id],
                        body: memberBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const detailBody = humanMemberDetailBodyOf(body);
                validateHumanMemberDocumentBody(detailBody);
                const detailDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'human-members/:id',
                        params: [b.id],
                        body: detailBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const identityDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'identities/:id',
                        params: [b.id],
                        body: identityDocumentBodyOf('person'),
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                pairs = {
                    operation: pair,
                    memberDocument,
                    detailDocument,
                    identityDocument,
                };
            }
            return postHumanMemberCreationOp(
                db, body, actor, pairs,
            );
        },
    }),
    // HUMAN_MEMBERS_WIRING registers alongside members/ai-members
    // (Phase 8 Task 3) but serves NO live PUT route here — verbs
    // stay {get, post}, the SAME 405 verb-gap pin from Task 2
    // (tests/api-roster-verb-gaps.test.ts) proves survives
    // untouched. The wiring row's documentOp/entityOf, and this
    // task's WRITE_RESPONSE_SPECS['human-members/:id'].put, exist
    // for the synthesized bundle below and the seed only — see
    // HUMAN_MEMBERS_WIRING's own comment above. GET is FLIPPED
    // (Task 8): absorbed into the generic
    // documentGetHandler(HUMAN_MEMBERS_WIRING) — wire-identical
    // to the hand-written db.humanMembers.getById dispatch it
    // replaces.
    route('human-members/:id', {
        get: documentGetHandler(HUMAN_MEMBERS_WIRING),
        // Human-member edit (Task 4, the SAME composed-EDIT
        // synthesis as ai-members/:id above): forms the member-
        // document/detail-document bundle beside the gate's own
        // operation pair. Task 5: ALSO forms the identities/:id
        // document pair, the SAME {kind:'person'} body the create
        // route forms — byte-identical, so it FOLDS by
        // message_hash rather than appending a second row (the
        // memberDocument fold precedent, cross-family). Admin-
        // only, exactly as create — no member-tier POST entry
        // exists. See postHumanMemberEditOp for the transaction
        // shape.
        post: async (db, p, body, actor, pair, organization) => {
            const id = param(p, 0);
            let pairs: MemberWritePairs | undefined;
            if (
                pair !== undefined && organization !== undefined
            ) {
                // Gate-check only (result discarded): guarantees
                // body.detail is present and object-shaped before
                // humanMemberDetailBodyOf reads it below — the
                // SAME discard-the-result pattern the objectives
                // route above uses for its OWN synthesized-body
                // checks.
                validateHumanMemberEditBody(body);
                const memberBody = memberDocumentBodyOf('human');
                validateMemberDocumentBody(memberBody);
                const memberDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'members/:id',
                        params: [id],
                        body: memberBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const detailBody = humanMemberDetailBodyOf(body);
                validateHumanMemberDocumentBody(detailBody);
                const detailDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'human-members/:id',
                        params: [id],
                        body: detailBody,
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                const identityDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'identities/:id',
                        params: [id],
                        body: identityDocumentBodyOf('person'),
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                pairs = {
                    operation: pair,
                    memberDocument,
                    detailDocument,
                    identityDocument,
                };
            }
            return postHumanMemberEditOp(db, id, body, pairs);
        },
    }),
    route('identities', {
        // GET is FLIPPED (Phase 10 Task 8): derived via
        // documentCollectionGetHandler — wire-identical to the
        // hand-written db.identities.getAll() dispatch it
        // replaces (identities is organizationNested:false, so
        // the derivation ignores whatever organization value the
        // caller passes, exactly as the GLOBAL-plane scoped
        // adapter's own db.identities alias already did).
        get: documentCollectionGetHandler(IDENTITIES_WIRING),
        // Admin-only — POST /identities has no member-tier
        // entry, so it falls to the root admin tier in
        // ROUTE_POLICY. Task 5: forms the identities/:id
        // document pair (+ the credential-document pair for a
        // service) INLINE PRE-TX, beside the gate's own operation
        // pair — the human-members precedent above. See
        // postIdentityCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: IdentityWritePairs | undefined;
            if (
                pair !== undefined && organization !== undefined
            ) {
                const b = validateIdentityCreateBody(body);
                const identityDocument = await formDocumentPairFor(
                    db, {
                        routePattern: 'identities/:id',
                        params: [b.id],
                        body: identityDocumentBodyOf(b.kind),
                        requesterIdentityId: actor,
                        requestAt: pair.requestAt,
                        organization,
                    },
                );
                if (b.kind === 'service') {
                    const { id: credId, ...fields } =
                        b.credential as {
                            id: string;
                        } & Record<string, unknown>;
                    const credentialDocument =
                        await formDocumentPairFor(db, {
                            routePattern:
                                'identities/:id/credentials/:cid',
                            params: [b.id, credId],
                            body: fields,
                            requesterIdentityId: actor,
                            requestAt: pair.requestAt,
                            organization,
                        });
                    pairs = {
                        kind: 'service',
                        operation: pair,
                        identityDocument,
                        credentialDocument,
                    };
                } else {
                    pairs = {
                        kind: 'person',
                        operation: pair,
                        identityDocument,
                    };
                }
            }
            return postIdentityCreationOp(db, body, pairs);
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): absorbed into the generic
    // documentGetHandler(IDENTITIES_WIRING) — the SAME wiring row
    // PUT already rides — wire-identical to the hand-written
    // db.identities.getById dispatch it replaces. PUT rides the
    // generic documentPutHandler(IDENTITIES_WIRING) — wire-
    // identical to postIdentityDocumentOp's own direct dispatch
    // it replaces. Verbs stay {get, put}.
    route('identities/:id', {
        get: documentGetHandler(IDENTITIES_WIRING),
        put: documentPutHandler(IDENTITIES_WIRING),
    }),
    // PII is a facet of the identity's own subtree: GET is
    // self-only, PUT/DELETE self-or-admin (enforced in the
    // request gate, mirroring /identities/:id/default-org). The
    // identity-pii COLLECTION below (admin roster) is separate.
    // PUT/DELETE each REPLACE the slot's message pair
    // (replacePiiSlot, api/pii-hard-delete.ts) in the same
    // transaction as the write — the message plane's sanctioned
    // hard-delete zone: CHAINLESS (retired from DOCUMENT_CLASS_
    // ROUTE_PATTERNS, message-pair.ts — no Supersedes, no
    // Follows) and the ONLY address whose prior pair is
    // physically deleted rather than superseded. The pattern's
    // last segment ('pii') is not a :param, so messageAddress
    // yields uriId '' (a singleton document at a collection-
    // style address). GET is FLIPPED (Phase 10 Task 8): derived
    // via deriveIdentityPii — wire-identical to the hand-written
    // db.identityPii.getById dispatch it replaces. No fence is
    // reproduced HERE: authorizeIdentityPii (the gate dispatch,
    // api.ts/request-auth.ts, UNTOUCHED by this task) already
    // restricts a GET to the caller reading its OWN pii, and a
    // fenced request's own membership always includes its active
    // org, so the row is always visible to itself regardless of
    // any org fence.
    route('identities/:id/pii', {
        get: (db, p) => deriveIdentityPii(db, param(p, 0)),
        put: (db, p, body, actor, pair) =>
            postIdentityPiiDocumentOp(
                db, param(p, 0), body, actor, pair,
            ),
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['identity_pii', 'requests', 'responses'],
                async (view) => {
                    await view.identityPii.delete(id);
                    if (pair !== undefined) {
                        await replacePiiSlot(
                            view, pair.uriPrefix, pair,
                        );
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveIdentityPiiRows, THEN fenced by gate 15's production
    // membership pair plane (above) — reproducing, byte-
    // identically, the SAME three-way viaMembership decision the
    // hand-written db.identityPii.getAll() dispatch (the org-
    // scoped adapter's own parentScope+viaMembership) made.
    route('identity-pii', {
        get: async (db, _p, actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const rows = await deriveIdentityPiiRows(db);
            const memberships =
                await membershipsAcrossAllOrganizations(
                    db, actor,
                );
            return rows.filter((row) => {
                const owner = ownerOrganizationViaMembershipPairPlane(
                    memberships, row.id, organizationId,
                );
                return owner === null || owner === organizationId;
            });
        },
    }),
    // Credentials nest under their parent identity: the identity
    // id is param 0, so the SERVER filters the collection to that
    // identity by its identity_id FK (the org fence still rides
    // the facade re-entry — viaMembership derives visibility from
    // the co-membership ledger). Both the collection and the leaf
    // GET project the opaque `secret` out (withoutSecret) so the
    // hash never crosses the boundary. The leaf id is param 1; GET
    // and PUT are exposed exactly as the flat makeIdRoute carried
    // them. ADMIN-ONLY: /identities is not member-tier, so these
    // fall to the root admin entries — NO MEMBER_VERBS entry. The
    // PUT wire response carries `secret` — a deliberate zero-
    // change carry-over from the un-wired behavior (see
    // WRITE_RESPONSE_SPECS's 'identities/:id/credentials/:cid'
    // entry, which reconstructs the FULL entity, unlike the GETs'
    // withoutSecret projection). GET is FLIPPED (Phase 10 Task 8):
    // derived via deriveCredentialsFor, fenced the SAME way
    // identity-pii's collection above is (gate 15, keyed on the
    // PARENT identity id rather than each row's own id) — a
    // hidden identity's credentials read as an EMPTY array, byte-
    // identical to parentScope.getAllWhere silently dropping every
    // matched-but-invisible row (never a 404 — getAllWhere never
    // throws).
    // FENCE-INPUT FIX (post-session review): the path :id only
    // ADDRESSES the ledger scan (deriveCredentialsFor reads the
    // /identities/{path id}/credentials/ prefix — that is where
    // the pairs live); the pre-flip fence read each ROW's OWN
    // identity_id field (parentScope's getAllWhere('identity_id',
    // path id) filters the OLD-plane store by that field BEFORE
    // fencing, then viaMembership fences on that SAME field). A
    // below-facade write whose body.identity_id disagrees with
    // its own address (producible below-facade, or via a hand-
    // crafted admin PUT — no validator ties body.identity_id to
    // the path :id, so an admin-crafted request CAN produce it;
    // only a web-app-generated request cannot) would otherwise
    // fence on the wrong identity. Reproduced here by filtering the
    // derived rows to identity_id === the path id FIRST — exactly
    // the OLD plane's WHERE — so a mismatched row never survives
    // to the fence step, on either plane.
    route('identities/:id/credentials', {
        get: async (db, p, actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const identityId = param(p, 0);
            const rows = (
                await deriveCredentialsFor(db, identityId)
            ).filter(
                (credential) => credential.identity_id === identityId,
            );
            if (rows.length === 0) return [];
            const memberships =
                await membershipsAcrossAllOrganizations(
                    db, actor,
                );
            const owner = ownerOrganizationViaMembershipPairPlane(
                memberships, identityId, organizationId,
            );
            if (owner !== null && owner !== organizationId) {
                return [];
            }
            return rows.map(withoutSecret);
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveCredential, fenced the SAME way (gate 15) — a hidden
    // identity's credential 404s BYTE-IDENTICALLY to a genuinely
    // absent one (EntityNotFoundError('identity_credentials', cid),
    // the SAME table/id parentScope.getById throws — no existence
    // is confirmed either way). FENCE-INPUT FIX (post-session
    // review): the path :id only ADDRESSES the scan
    // (deriveCredential reads the row at /identities/{path id}/
    // credentials/{cid} — that is where the pair lives); the
    // pre-flip fence read the ROW's OWN identity_id field — the
    // hand-written route this flip replaced ignored the path
    // entirely, fetching by cid alone via parentScope.getById,
    // which then fenced via viaMembership on the ROW's stored
    // identity_id. So the fence input below is
    // `credential.identity_id`, never the path — a below-facade
    // write whose body.identity_id disagrees with its own address
    // now fences EXACTLY as the row plane did.
    route('identities/:id/credentials/:cid', {
        get: async (db, p, actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const identityId = param(p, 0);
            const cid = param(p, 1);
            const credential = await deriveCredential(
                db, identityId, cid,
            );
            const memberships =
                await membershipsAcrossAllOrganizations(
                    db, actor,
                );
            const owner = ownerOrganizationViaMembershipPairPlane(
                memberships, credential.identity_id, organizationId,
            );
            if (owner !== null && owner !== organizationId) {
                throw new EntityNotFoundError(
                    'identity_credentials', cid,
                );
            }
            return withoutSecret(credential);
        },
        put: (db, p, body, actor, pair) =>
            postIdentityCredentialDocumentOp(
                db, param(p, 1), body, actor, pair,
            ),
    }),
    // Hand-written in place of makeIdRoute<
    // IdentityTokenRevocationEntity> so PUT can append its
    // message pair in the same transaction as the write — the
    // factory's fixed closures have no per-family pair
    // selector (see message-pair.ts). identity_token_revocations
    // is a HistoryEntityStore ledger row, so this is
    // EVENT-APPEND: no head-read, no Supersedes (message-pair.ts
    // DOCUMENT_CLASS_ROUTE_PATTERNS omits it on purpose). Verbs
    // stay {get, put}. GET is FLIPPED (Phase 10 Task 8): derived
    // via deriveTokenRevocation — wire-identical to the
    // hand-written db.identityTokenRevocations.getById dispatch
    // it replaces. No fence: identity_token_revocations is
    // GLOBAL-plane (no organization_id field at all), matching
    // its sibling identity-providers below.
    route('identity-token-revocations/:id', {
        get: (db, p) =>
            deriveTokenRevocation(db, param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                [
                    'identity_token_revocations',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .identityTokenRevocations.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    IdentityTokenRevocationEntity,
                                    'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveRoleGrants, THEN fenced to the caller's org by
    // organization_id — SIMPLER than identity-pii/credentials'
    // gate 15 membership-pair-plane fence above, because
    // role_grants carries its OWN organization_id (gate 16:
    // deriveRoleGrants reads it off the stored RESPONSE, the
    // fence-stamped value), matching the row plane's
    // OrganizationScopedEntityStore#getAll (filter ==
    // organization_id).
    route('role-grants', {
        get: async (db, _p, _actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            return (await deriveRoleGrants(db)).filter(
                (grant) => grant.organization_id === organizationId,
            );
        },
    }),
    // Hand-written in place of makeIdRoute<RoleGrantEntity> so
    // PUT can append its message pair in the same transaction
    // as the write — the factory's fixed closures have no
    // per-family pair selector (see message-pair.ts). role_grants
    // is a HistoryEntityStore ledger row (latest-wins per
    // (organization_id, identity_id, role)), so this is
    // EVENT-APPEND: no head-read, no Supersedes. Verbs stay
    // {get, put}. GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveRoleGrant, then fenced the SAME way the collection
    // above is — a foreign-org grant 404s BYTE-IDENTICALLY to a
    // genuinely absent one (EntityNotFoundError('role_grants',
    // id), the SAME table/id OrganizationScopedEntityStore#getById
    // throws — Step 0 confirmed this exact byte shape before the
    // flip).
    route('role-grants/:id', {
        get: async (db, p, _actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const id = param(p, 0);
            const grant = await deriveRoleGrant(db, id);
            if (grant.organization_id !== organizationId) {
                throw new EntityNotFoundError('role_grants', id);
            }
            return grant;
        },
        put: (db, p, body, actor, pair) =>
            postRoleGrantDocumentOp(
                db, param(p, 0), body, actor, pair,
            ),
    }),
    // GET is FLIPPED (Phase 13 Task 6, gate 7 discharged):
    // derived via deriveIdentityTokens — every identity_tokens
    // writer forms its own event pair from Task 5 on (issued
    // roots, rotations, revocations alike), so the derivation now
    // sees every row the old plane did. Wire-identical to the
    // hand-written db.identityTokens.getAll() dispatch it
    // replaces: id-LAST key order (the stored row's own shape),
    // byIdAscending collection order (== IndexedDB's production
    // getAll order) — tests/drift-identity-tokens.test.ts pins
    // both.
    route('identity-tokens', {
        get: (db) => deriveIdentityTokens(db),
    }),
    // Hand-written in place of makeIdRoute<IdentityTokenEntity>
    // so PUT can append its message pair without a row write.
    // GET is FLIPPED (Phase 13 Task 6, gate 7 discharged):
    // derived via deriveIdentityToken — wire-identical to the
    // hand-written db.identityTokens.getById dispatch it
    // replaces, including the 404 body. PUT is PAIR-ONLY (Phase
    // 13 Task 9: the row write retires — nothing has read
    // identity_tokens rows since Task 6); the wire response is
    // unaffected, since it derives from WRITE_RESPONSE_SPECS'
    // successBody (the validated body + id), never from a stored
    // row. `pair` is always defined for this wired, fenced route
    // — the transaction still wraps the append for parity with
    // this address's other writers (rotation/revocation).
    route('identity-tokens/:id', {
        get: (db, p) => deriveIdentityToken(db, param(p, 0)),
        put: (db, _p, _body, _actor, pair) =>
            db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            ),
    }),
    // Rotate a refresh jti. The ledger read, the rotation
    // plan, and its appends ride ONE transaction
    // (rotateRefreshJti — the same body the refresh grant
    // runs), so two concurrent rotations of one chain
    // cannot both observe the live jti (the lost-rotation
    // TOCTOU). A live jti returns its successor; a
    // known-but-not-live jti is reuse — the whole chain's
    // revocation has already landed atomically — then 409.
    // Operation-addressed (uriId ''); REPLAY_EXEMPT_ROUTE_
    // PATTERNS-wired (message-pair.ts) — the gate never serves
    // a stored response for a byte-identical resend of this
    // route, so this handler always re-enters and re-checks
    // the reuse guard for real. The gate's successBody
    // resolver PRE-MINTS the successor jti so the pair IS the
    // response; this handler reads that SAME value back off
    // the pair (pairResponseBody) and threads it into
    // rotateRefreshJti, which appends the pair as the LAST act
    // of its own transaction — only on the 'rotate' branch, so
    // a 409 (reuse or unknown) stores no pair even though the
    // reuse branch still revokes the chain for real. When pair
    // is undefined (unreachable for this wired, fenced route)
    // a fresh jti is minted here instead — crash-free.
    route('identity-tokens/:jti/rotation', {
        post: async (db, p, _body, _actor, pair) => {
            const presented = param(p, 0);
            const newJti = pair === undefined
                ? generateCryptoSafeBase62()
                : (pairResponseBody(pair)?.['jti'] as
                    string | undefined)
                    ?? generateCryptoSafeBase62();
            const outcome = await rotateRefreshJti(
                db, presented, newJti, pair,
            );
            if (outcome.kind === 'rotate') {
                return { jti: outcome.newJti };
            }
            throw new ApiError(
                'refresh token is not live (reuse): '
                    + presented,
                HTTP_CONFLICT,
            );
        },
    }),
    // Revoke the whole chain a jti belongs to (log out one
    // session). Read and appends ride one transaction; an
    // unknown jti is an idempotent no-op that still appends
    // its pair (revokeTokenChain guards both exit paths).
    route('identity-tokens/:jti/revocation', {
        post: async (db, p, _body, _actor, pair) => {
            await revokeTokenChain(db, param(p, 0), pair);
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveIdentityProviders — wire-identical to the
    // hand-written db.identityProviders.getAll() dispatch it
    // replaces. No fence: GLOBAL-plane (no organization_id field
    // at all), matching identities' own global-plane collection
    // above.
    route('identity-providers', {
        get: (db) => deriveIdentityProviders(db),
    }),
    // Hand-written in place of makeIdRoute<
    // IdentityProviderEntity> so PUT can append its message
    // pair in the same transaction as the write — the
    // factory's fixed closures have no per-family pair
    // selector (see message-pair.ts). identity_providers is a
    // HistoryEntityStore ledger row (linked/unlinked events) and
    // a GLOBAL-plane store (no organization_id field at all), so
    // this is EVENT-APPEND: no head-read, no Supersedes. Verbs
    // stay {get, put}. GET is FLIPPED (Phase 10 Task 8): derived
    // via deriveIdentityProvider — wire-identical to the
    // hand-written db.identityProviders.getById dispatch it
    // replaces. PUT rides postIdentityProviderDocumentOp (the
    // controller-sanctioned extraction, prior commit).
    route('identity-providers/:id', {
        get: (db, p) => deriveIdentityProvider(db, param(p, 0)),
        put: (db, p, body, actor, pair) =>
            postIdentityProviderDocumentOp(
                db, param(p, 0), body, actor, pair,
            ),
    }),
    // The grant closures retire into api.ts's dedicated
    // authentication POST arm (Task 3, C1 discharge): both
    // routes are bearerExempt and now form their own redacted
    // pair deep inside postToken/postAuthorize, pre-tx, since
    // only the grant can resolve the requester identity. The
    // bare registration survives so matchRoute still 404s an
    // unknown path and 405s a non-POST verb on either pattern.
    route('authentication/token', {}),
    route('authentication/authorize', {}),
    // Create retired into the SAME document PUT ideas/:id
    // already serves (Decision 7, Phase 2 Task 3, R1): genesis
    // is head-presence-defined, so there is no longer a
    // separate create verb here — POST now 405s exactly like
    // any other method-absent route. GET is FLIPPED (Phase 2
    // Task 5): the list derives from the message ledger rather
    // than the old ideas table. Absorbed (Phase 4 Task 2) into
    // the generic documentCollectionRoute — wire-identical to
    // the hand-written deriveIdeas dispatch it replaces.
    documentCollectionRoute(IDEAS_WIRING),
    // Convert an idea to a project (promotion): the LONE
    // cross-aggregate write. A new projects row, the promoted
    // ideas row, TWO state events (the idea's 'promoted' and the
    // new project's initial), and N project_objective_baseline_
    // scores rows commit as ONE transaction — a mid-write failure
    // rolls the whole thing back rather than landing a project
    // without its baselines (or an idea promoted without its
    // project). The idea is the route param. The org-scoped
    // projects store stamps organization_id from the verified
    // token and re-validates through validateProjectEntity, so
    // the project body OMITS it; the ideas store re-validates the
    // promoted idea, and the baseline store each row, as the
    // composing puts land. Both events are authored by the
    // verified caller (actor), never the body. Composed IN THE
    // SAME ORDER the old commit batch used (project, idea, idea
    // event, project event, baselines). Member-tier POST —
    // isPermitted matches /ideas on the segment prefix, so
    // /ideas/:id/conversion is member-permitted.
    //
    // Phase 3 Task 4: the operation pair above lives at the
    // ideas-family OPERATION address (uri_id '') — a projects-
    // prefix scan finds no pair for a conversion-born project
    // without a SECOND pair at the project's OWN document
    // address. Synthesized below, BYTE-INDISTINGUISHABLE from a
    // live PUT /projects/:id's pair at that same address (same
    // response spec, same head-read), so derivation needs no
    // conversion special case. Phase 5 Task 5: the idea's OWN
    // 'promoted' transition gets a THIRD pair the same way, at
    // the idea's EXISTING document address — unlike the project
    // pair above (a fresh address, genesis), the idea's head-
    // read finds its prior pair, so this one records Supersedes
    // provenance. This closes the standing watch-point: before
    // this task, a converted idea's derived history MISSED its
    // 'promoted' event because no pair recorded it. Phase 7
    // Task 4: each validated baseline gets its OWN pair too, at
    // its project-nested address (projects/:id/objective-
    // baseline-scores/:sid) — every baseline id is client-
    // minted FRESH per conversion, so these are genesis like
    // the project pair above, never Supersedes. All 3+N formed
    // PRE-TX — crypto and the head-reads stay outside
    // db.transaction, the IndexedDB auto-commit constraint —
    // then appended as the tx's LAST acts, beside the operation
    // pair. Formed ONLY when the gate supplied both a pair and
    // a fence organization; a below-facade caller with neither
    // (none exists for conversion today) skips all 3+N
    // appends, preserving dual-write discipline.
    route('ideas/:id/conversion', {
        post: async (
            db, p, body, actor, pair, organization,
        ) => {
            const ideaId = param(p, 0);
            const b = validateIdeaConversionBody(body);
            // The document a live PUT /projects/:id would
            // carry: the entity's own fields plus the lifecycle
            // trio this conversion assigns. Validated pre-tx —
            // a malformed project body now 400s here instead of
            // at the in-tx store re-validation; same observable,
            // earlier.
            const projectDocument = {
                ...b.project,
                state: b.projectState,
                state_at: b.projectStateAt,
                state_event_id: b.projectStateEventId,
            };
            validateProjectDocumentBody(projectDocument);
            // The document a live PUT /ideas/:id would carry for
            // this SAME conversion: the promoted idea's own
            // fields plus the 'promoted' trio this conversion
            // assigns. Validated pre-tx, mirroring projectDocument
            // above.
            const ideaDocument = {
                ...b.idea,
                state: b.ideaState,
                state_at: b.ideaStateAt,
                state_event_id: b.ideaStateEventId,
            };
            validateIdeaDocumentBody(ideaDocument);
            let projectPair: MessagePair | undefined;
            let ideaPair: MessagePair | undefined;
            const baselinePairs: MessagePair[] = [];
            if (
                pair !== undefined
                && organization !== undefined
            ) {
                projectPair = await formDocumentPairFor(db, {
                    routePattern: 'projects/:id',
                    params: [b.projectId],
                    body: projectDocument,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                // The idea's OWN document pair, at its EXISTING
                // address (the idea was created earlier, through
                // a live PUT /ideas/:id) — this head-read finds
                // that prior pair, so this one records Supersedes,
                // unlike the project pair above (a fresh address,
                // genesis).
                ideaPair = await formDocumentPairFor(db, {
                    routePattern: 'ideas/:id',
                    params: [ideaId],
                    body: ideaDocument,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                // The per-baseline pairs (Task 4): N synthesized
                // pairs, one per validated baseline, at each
                // baseline's OWN address — every baseline id is
                // client-minted FRESH for this conversion, so
                // each pair is genesis there (headPairIdAt finds
                // no prior pair) unless a live PUT had already
                // visited that exact id. Body is the baseline's
                // `fields` VERBATIM — the live standalone PUT
                // body, unlike projectDocument/ideaDocument above
                // (which assemble a document from disjoint
                // parts) — so the response spec's successBody
                // below is what runs validateBaselineScoreEntity.
                for (const baseline of b.baselines) {
                    baselinePairs.push(await formDocumentPairFor(
                        db, {
                            routePattern:
                                'projects/:id/objective-baseline'
                                + '-scores/:sid',
                            params: [b.projectId, baseline.id],
                            body: baseline.fields,
                            requesterIdentityId: actor,
                            requestAt: pair.requestAt,
                            organization,
                        },
                    ));
                }
            }
            return db.transaction(
                [
                    'projects', 'ideas', 'states',
                    'project_objective_baseline_scores',
                    'requests', 'responses',
                ],
                async (view) => {
                    await view.projects.put(
                        b.projectId,
                        b.project as unknown as
                            Omit<ProjectEntity, 'id'>,
                    );
                    await view.ideas.put(
                        ideaId,
                        b.idea as unknown as
                            Omit<IdeaEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.ideaStateEventId,
                        ideaId,
                        b.ideaState,
                        actor,
                        b.ideaStateAt,
                    );
                    await view.states.postEvent(
                        b.projectStateEventId,
                        b.projectId,
                        b.projectState,
                        actor,
                        b.projectStateAt,
                    );
                    for (const baseline of b.baselines) {
                        await view.projectObjectiveBaselineScores
                            .put(
                                baseline.id,
                                baseline.fields as unknown as
                                    Omit<
                                        ProjectObjectiveBaselineScoreEntity,
                                        'id'
                                    >,
                            );
                    }
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    if (projectPair !== undefined) {
                        await appendMessagePair(
                            view, projectPair,
                        );
                    }
                    if (ideaPair !== undefined) {
                        await appendMessagePair(
                            view, ideaPair,
                        );
                    }
                    for (const baselinePair of baselinePairs) {
                        await appendMessagePair(
                            view, baselinePair,
                        );
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Phase 3 Task 6): the list derives from
    // the message ledger rather than the old projects table.
    // Absorbed (Phase 4 Task 2) into the generic
    // documentCollectionRoute — wire-identical to the
    // hand-written deriveProjects dispatch it replaces.
    documentCollectionRoute(PROJECTS_WIRING),
    // Idea submissions nest under their parent idea: the idea id
    // is param 0, so the SERVER filters the collection to that
    // idea (the org fence still rides the facade re-entry). GET
    // is FLIPPED (Phase 2 Task 5): the collection derives from
    // the message ledger at this idea's submissions address
    // rather than the old idea_submissions table. The leaf id is
    // param 1; only PUT is exposed on ideas/:id/submissions/:sid,
    // exactly as the flat makeIdRoute carried it.
    route('ideas/:id/submissions', {
        get: (db, p, _actor, organization) =>
            deriveIdeaSubmissions(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('ideas/:id/submissions/:sid', {
        put: (db, p, body, _actor, pair) =>
            postIdeaSubmissionOp(db, param(p, 1), body, pair),
    }),
    route('flows', {
        // GET is FLIPPED (Phase 4 Task 8): the list derives from
        // the message ledger rather than the old flows table plus
        // its relation tables. Rides the generic
        // documentCollectionRoute — wire-identical to the
        // hand-written deriveFlows dispatch it replaces (the
        // wiring's own entityOf, derive-flows.ts's flowEntityOf,
        // carries the `graph` field, so the list needs no
        // flows-special reassembly step). POST stays this
        // hand-written create — unlike ideas/projects, flows never
        // folded genesis into the document PUT (Decision 6), so a
        // separate create verb remains here.
        get: documentCollectionGetHandler(FLOWS_WIRING),
        // Member-tier POST — /flows carries POST in
        // MEMBER_VERBS. Forms the document + join pairs pre-tx
        // (Task 5) beside the gate's own operation pair — the
        // SAME shape a live genesis PUT /flows/:id and a live
        // PUT /projects/:id/flows/:pfid would each carry — ONLY
        // when the gate supplied both a pair and a fence
        // organization (the Phase 3 condition verbatim); a
        // below-facade caller (api/mock-data.ts, no gate) skips
        // all three, preserving dual-write discipline. See
        // postFlowCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: FlowCreationPairs | undefined;
            if (pair !== undefined && organization !== undefined) {
                const b = validateFlowCreateBody(body);
                const documentBody = flowCreateDocumentBody(b);
                validateFlowDocumentBody(documentBody);
                const document = await formDocumentPairFor(db, {
                    routePattern: 'flows/:id',
                    params: [b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                // The live :pfid PUT's request shape, verified by
                // content: validateProjectFlowEntity accepts
                // EXACTLY project_id/flow_id/at
                // (api/validators.ts) — the same three keys
                // b.projectFlow already carries, so it doubles as
                // the join pair's body verbatim.
                validateProjectFlowEntity(b.projectFlow);
                const projectId = pickString(
                    b.projectFlow, 'project_id',
                );
                // Genesis-undefined (chain 'none'): a flow's
                // create-time join is always fresh (design
                // decision — no duplicate-create carve-out at this
                // address through this task; pinned by the same-
                // join-id retry test in tests/drift-flows.test.ts).
                const join = await formDocumentPairFor(db, {
                    routePattern: 'projects/:id/flows/:pfid',
                    params: [projectId, b.projectFlowId],
                    body: b.projectFlow,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    chain: 'none',
                });
                pairs = { operation: pair, document, join };
            }
            return postFlowCreationOp(db, body, actor, pairs);
        },
    }),
    // flows/:id is the FIRST locked-class route (Task 3). GET is
    // FLIPPED (Phase 4 Task 8): absorbed into the generic
    // documentEntityRoute — the SAME wiring row PUT already rides
    // (Task 3), so this replaces the hand-written old-plane
    // reassembly with documentGetHandler(FLOWS_WIRING), wire-
    // identical to it (derive-flows.ts's flowEntityOf carries the
    // `graph` field the entity route's generic shape needs, so no
    // flows-special branch lives inside documentGetHandler
    // itself). After this commit NO hand-written document-family
    // route object remains for any registered family (ideas,
    // projects, flows) — the third-family obligation's discharge.
    // The gate's four-outcome table (api.ts, keyed off
    // familyRegistration('flows').concurrency === 'locked')
    // resolves genesis/412/follows entirely BEFORE dispatch;
    // documentPutHandler carries no concurrency branch of its
    // own — it dispatches straight to postFlowDocumentOp, which
    // DECOMPOSES the document (flow row PUT, state event, graph
    // delta, revivals) in one transaction. version-publish (a
    // flow_versions row) no longer rides this PUT at all
    // (Decision 3) — it is POST /flows/:id/versions's own
    // transaction now (postFlowVersion, called separately by the
    // client before the save). Member-tier PUT —
    // MEMBER_VERBS['/flows'] includes 'PUT'.
    documentEntityRoute(FLOWS_WIRING),
    // Undo a flow edit: the flow row PUT, the 'updated' state
    // event, the DELETE of the consumed version, the graph delta
    // to the four relation tables, and the revivals — all as ONE
    // transaction. The flow can never land reverted while the
    // version row survives unconsumed. The org-scoped flows store
    // stamps organization_id and re-validates the flow body (so
    // it OMITS it); the event is authored by the verified caller
    // (actor). graphDelta lands the target graph in relations
    // exactly as PUT /flows/:id does; the revivals THEN post
    // 'restored' events (authored by actor) that supersede the
    // tombstones of the nodes/edges the target re-introduces, so
    // a node the user deleted reappears in reads on undo.
    // Member-tier POST via the /flows segment prefix. Task 5: the
    // op ALSO synthesizes its own document pair pre-tx, from the
    // body alone (no reads beyond the pre-tx head lookup) — the
    // flows family is LOCKED, so this document write takes the
    // FOLLOWS slot (never supersedes; the op holds no echo of its
    // own — design decision 5). On a follows collision (a save
    // raced this undo for the SAME head) the whole transaction
    // aborts via the responses.follows unique index →
    // UniqueConstraintError → the gate's existing 412 mapping
    // (api.ts) — performUndo (web-app) absorbs that with a
    // jittered retry, rebuilding against a FRESH baseline.
    route('flows/:id/undo', {
        post: async (
            db, p, body, actor, pair, organization,
        ) => {
            const id = param(p, 0);
            const b = validateFlowUndoBody(body);
            const delta = b.graphDelta;
            let documentPair: MessagePair | undefined;
            if (pair !== undefined && organization !== undefined) {
                const documentBody = {
                    name: pickString(b.flow, 'name'),
                    is_locked: pickBoolean(b.flow, 'is_locked'),
                    is_auto_layout:
                        pickBoolean(b.flow, 'is_auto_layout'),
                    is_auto_fit: pickBoolean(b.flow, 'is_auto_fit'),
                    lock_timeout: pickNumber(b.flow, 'lock_timeout'),
                    state: 'updated',
                    state_at: b.at,
                    state_event_id: b.eventId,
                    graph: b.graph,
                    graphDelta: b.graphDelta,
                    revivals: b.revivals,
                };
                validateFlowDocumentBody(documentBody);
                // The flows family is LOCKED, so this document
                // write takes the FOLLOWS slot (never supersedes;
                // the op holds no echo of its own — design
                // decision 5).
                documentPair = await formDocumentPairFor(db, {
                    routePattern: 'flows/:id',
                    params: [id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    chain: 'follows',
                });
            }
            return db.transaction(
                [
                    'flows', 'flow_versions', 'states',
                    'flow_nodes', 'flow_edges',
                    'flow_node_members',
                    'flow_node_attributes',
                    'requests', 'responses',
                ],
                async (view) => {
                    await view.flows.put(
                        id,
                        b.flow as unknown as
                            Omit<FlowEntity, 'id'>,
                    );
                    await view.states.postEvent(
                        b.eventId, id, 'updated', actor,
                        b.at,
                    );
                    await view.flowVersions.delete(
                        b.consumedVersionId,
                    );
                    await writeFlowGraphDelta(
                        view, delta, actor,
                    );
                    for (const r of b.revivals) {
                        await view.states.postEvent(
                            r.eventId, r.entityId,
                            'restored', actor, r.at,
                        );
                    }
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    if (documentPair !== undefined) {
                        await appendMessagePair(view, documentPair);
                    }
                },
            );
        },
    }),
    // Flow versions nest under their parent flow: the flow id is
    // param 0, so the SERVER filters the collection to that flow
    // (the org fence still rides the facade re-entry). The leaf
    // id is param 1. Reads stay TABLE-BACKED BY DESIGN, not
    // deferral: flow_versions is a mutable working set with
    // sanctioned physical deletes (version-cap trims store no
    // tombstone pairs), so the append-only ledger cannot serve
    // it. It stays until the undo-as-replay election — whose
    // trigger is the Phase 4 retrospective, an author decision,
    // never this code's.
    route('flows/:id/versions', {
        get: (db, p) =>
            db.flowVersions.getAllWhere('flow_id', param(p, 0)),
        // Publish a flow version: the new snapshot row is put and
        // the named over-cap versions are deleted as ONE
        // transaction — a mid-write failure rolls the whole thing
        // back rather than landing the snapshot with the trim
        // half-applied (or vice versa). The web-app computes WHICH
        // versions to trim (its own cap-retention derivation), so
        // the route writes the put + the named deletes exactly.
        // flow_versions is parent-scoped — its org derives from the
        // flow at read time and writes delegate — and re-validates
        // the snapshot through validateFlowVersionEntity as the put
        // lands. NO state event is written, so the handler needs no
        // actor. The body already carries flow_id; the flow id is
        // param 0. Member-tier POST — /flows/:id/versions carries
        // POST in MEMBER_VERBS.
        post: (db, _p, body, _actor, pair) => {
            const b = validateFlowVersionPublishBody(body);
            return db.transaction(
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    await view.flowVersions.put(
                        b.id,
                        b.version as unknown as
                            Omit<FlowVersionEntity, 'id'>,
                    );
                    for (const t of b.trimIds) {
                        await view.flowVersions.delete(t);
                    }
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // PUT/DELETE each append their message pair in the same
    // transaction as the write (message-pair.ts). DOCUMENT-
    // class: a version row is a plain, revisitable row — a
    // repeat PUT records Supersedes and a DELETE tombstones it,
    // exactly like flow_work_orders/state_field_values above.
    // The cap-trim machinery (flows.ts's save/undo/redo/publish
    // ops) calls `flowVersions.delete` directly, inside ITS OWN
    // transaction, for versions past the retention cap — that
    // physical splice is untouched and stores no pair; only a
    // request through THIS route (a client-addressed DELETE of
    // one named version) appends one. The leaf nests under its
    // parent flow (param 0); `vid` is param 1.
    route('flows/:id/versions/:vid', {
        get: (db, p) => db.flowVersions.getById(param(p, 1)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    const written = await view.flowVersions
                        .put(
                            id,
                            withoutId(body) as unknown as
                                Omit<FlowVersionEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                ['flow_versions', 'requests', 'responses'],
                async (view) => {
                    await view.flowVersions.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // Project↔flow joins nest under their parent project: the
    // project id is param 0, so the SERVER filters the collection
    // to that project (the org fence still rides the facade
    // re-entry). The leaf id is param 1; PUT and DELETE are
    // exposed exactly as the flat makeIdRoute carried them. GET is
    // FLIPPED (Phase 4 Task 8): the join list derives from the
    // message ledger at this project's flows address rather than
    // the old project_flows table — deriveProjectFlows is a
    // bespoke derivation (not a DocumentFamilyWiring family; a
    // join row carries no lifecycle trio of its own), so this
    // calls it directly rather than through a generic constructor.
    route('projects/:id/flows', {
        get: (db, p, _actor, organization) =>
            deriveProjectFlows(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('projects/:id/flows/:pfid', {
        put: (db, p, body, _actor, pair) => {
            const pfid = param(p, 1);
            return db.transaction(
                ['project_flows', 'requests', 'responses'],
                async (view) => {
                    const written = await view.projectFlows
                        .put(
                            pfid,
                            withoutId(body) as unknown as
                                Omit<ProjectFlowEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const pfid = param(p, 1);
            return db.transaction(
                ['project_flows', 'requests', 'responses'],
                async (view) => {
                    await view.projectFlows.delete(pfid);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Task 7): the list derives from the
    // message ledger rather than the old work_orders table.
    // Rides the generic documentCollectionGetHandler —
    // wire-identical to the hand-written
    // db.workOrders.getAll() dispatch it replaces
    // (WORK_ORDERS_WIRING's own entityOf,
    // workOrderDocumentEntityOf, already carries the bare
    // entity shape, so the list needs no work-orders-special
    // reassembly step). POST stays this hand-written create —
    // unlike ideas/projects, work-orders never folded genesis
    // into the document PUT (Decision 6), mirroring flows'
    // own precedent, so a separate create verb remains here.
    route('work-orders', {
        get: documentCollectionGetHandler(WORK_ORDERS_WIRING),
        // Member-tier POST — /work-orders carries POST in
        // MEMBER_VERBS (the claim sub-route is also a member
        // POST). Forms the document + join pairs pre-tx
        // (Task 3) beside the gate's own operation pair — the
        // SAME shape a live genesis PUT /work-orders/:id and a
        // live PUT /flows/:id/work-orders/:woid would each
        // carry — ONLY when the gate supplied both a pair and
        // a fence organization (the Phase 3 condition
        // verbatim); a below-facade caller (api/mock-data.ts,
        // no gate) skips all three, preserving dual-write
        // discipline. See postWorkOrderCreationOp for the
        // transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: WorkOrderCreationPairs | undefined;
            if (pair !== undefined && organization !== undefined) {
                const b = validateWorkOrderCreateBody(body);
                const documentBody =
                    workOrderCreateDocumentBody(b);
                validateWorkOrderDocumentBody(documentBody);
                const document = await formDocumentPairFor(db, {
                    routePattern: 'work-orders/:id',
                    params: [b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                // The live :woid PUT's request shape, verified
                // by content: validateFlowWorkOrderEntity
                // accepts EXACTLY flow_id/work_order_id/at —
                // the same three keys b.flowWorkOrder already
                // carries, so it doubles as the join pair's
                // body verbatim.
                validateFlowWorkOrderEntity(b.flowWorkOrder);
                const flowId = pickString(
                    b.flowWorkOrder, 'flow_id',
                );
                // Genesis-undefined (chain 'none'): a work
                // order's create-time join is always fresh
                // (design decision — no duplicate-create carve-
                // out at this address through this task; pinned
                // by the same-join-id retry test in
                // tests/drift-work-orders.test.ts).
                const join = await formDocumentPairFor(db, {
                    routePattern: 'flows/:id/work-orders/:woid',
                    params: [flowId, b.flowWorkOrderId],
                    body: b.flowWorkOrder,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                    chain: 'none',
                });
                pairs = { operation: pair, document, join };
            }
            return postWorkOrderCreationOp(
                db, body, actor, pairs,
            );
        },
    }),
    // work-orders/:id is the fourth family. GET is FLIPPED
    // (Task 7): absorbed into the generic documentEntityRoute
    // — the SAME wiring row PUT already rides (Task 3), so
    // this replaces the hand-written db.workOrders.getById
    // dispatch with documentGetHandler(WORK_ORDERS_WIRING),
    // wire-identical to it (workOrderDocumentEntityOf
    // reproduces the head pair's stamped {id, organization_id,
    // ...body} shape verbatim, so no work-orders-special
    // branch lives inside documentGetHandler itself — the
    // 'stateless' lifecycle also skips the trio walk
    // derivedDocumentEntity runs for ideas/projects/flows).
    // After this commit NO hand-written document-family route
    // object remains for ANY registered family (ideas,
    // projects, flows, work-orders) — the fourth-family
    // obligation's discharge, and the LAST: every registered
    // family now rides the generic documentEntityRoute /
    // documentCollectionRoute pair. work-orders/:id is
    // 'simple' concurrency (Decision 7's lifecycle trio does
    // not apply to a stateless document), so documentPutHandler
    // dispatches straight through with no concurrency branch,
    // matching the projects/:id precedent. Verbs stay {get,
    // put} — work-orders/:id has no DELETE, mirroring
    // documentEntityRoute's shape (no change from before this
    // flip). Member-tier PUT — MEMBER_VERBS['/work-orders']
    // includes 'PUT'.
    documentEntityRoute(WORK_ORDERS_WIRING),
    // See postWorkOrderClaimOp for the transaction shape.
    route('work-orders/:id/claim', {
        post: (db, p, body, actor, pair) =>
            postWorkOrderClaimOp(
                db, param(p, 0), body, actor, pair,
            ),
    }),
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS, and isPermitted matches on the segment
    // prefix, so the sub-route is member-permitted like
    // /claim. See postWorkOrderTransitionOp for the
    // transaction shape.
    route('work-orders/:id/transition', {
        post: (db, p, body, actor, pair) =>
            postWorkOrderTransitionOp(
                db, param(p, 0), body, actor, pair,
            ),
    }),
    // Flow work-order joins nest under their parent flow: the
    // flow id is param 0, so the SERVER filters the collection to
    // that flow. The leaf id is param 1; only PUT is exposed (the
    // flat route never carried GET/DELETE on the leaf). GET is
    // FLIPPED (Task 7): the join list derives from the message
    // ledger at this flow's work-orders address rather than the
    // old flow_work_orders table — deriveFlowWorkOrders is a
    // bespoke derivation (not a DocumentFamilyWiring family; a
    // join row carries no lifecycle trio of its own), so this
    // calls it directly rather than through a generic
    // constructor, mirroring deriveProjectFlows' own precedent.
    route('flows/:id/work-orders', {
        get: (db, p, _actor, organization) =>
            deriveFlowWorkOrders(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('flows/:id/work-orders/:woid', {
        put: (db, p, body, actor, pair) =>
            postFlowWorkOrderDocumentOp(
                db, param(p, 1), body, actor, pair,
            ),
    }),
    // Field values nest under their parent STATE EVENT: the
    // state event id is param 0, so the SERVER filters the
    // collection to that event by its state_event_id FK (the org
    // fence still rides the facade re-entry — the multi-hop
    // resolver derives the owning org from the event's entity).
    // The leaf id is param 1; PUT and DELETE are exposed exactly
    // as the flat makeIdRoute carried them.
    route('states/:id/field-values', {
        get: (db, p) =>
            db.stateFieldValues.getAllWhere(
                'state_event_id', param(p, 0),
            ),
    }),
    // PUT/DELETE each append their message pair in the same
    // transaction as the write (message-pair.ts). DOCUMENT-
    // class: state_field_values is a plain, revisitable row
    // (unlike its parent states log), so a repeat PUT records
    // Supersedes and a DELETE tombstones it. The leaf nests
    // under its parent STATE EVENT (param 0), fenced by the
    // multi-hop resolver (api/store-parent-scoped.ts) exactly
    // as the bare store call was — this is a transaction wrap
    // plus pair append, not a behavior change.
    route('states/:id/field-values/:fvid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'state_field_values',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .stateFieldValues.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    StateFieldValueEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
        delete: (db, p, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'state_field_values',
                    'requests', 'responses',
                ],
                async (view) => {
                    await view.stateFieldValues.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger rather than the old records table. Rides
    // the generic documentCollectionGetHandler — wire-identical
    // to the hand-written db.records.getAll() dispatch it
    // replaces (RECORDS_WIRING's own entityOf,
    // recordDocumentEntityOf, already picks the exact {id,
    // organization_id, name, description, position} shape, so
    // the list needs no records-special reassembly step). POST
    // stays this hand-written bundle — records' own create forms
    // the document PLUS N attribute pairs in one pass
    // (postRecordWriteOp), unlike ideas/projects' bare genesis
    // fold, so a separate create verb remains here, mirroring
    // work-orders' and flows' own precedent.
    route('records', {
        get: documentCollectionGetHandler(RECORDS_WIRING),
        // Member-tier POST — /records carries POST in
        // MEMBER_VERBS. Forms the document pair, one
        // attribute-PUT pair per attributes[] entry, and one
        // attribute-DELETE pair per removedAttributeIds entry
        // (edit only) pre-tx, beside the gate's own operation
        // pair — the SAME shape a live PUT records/:id and N/M
        // live PUT/DELETE record-attributes/:id requests would
        // each carry — ONLY when the gate supplied both a pair
        // and a fence organization (the route('flows') condition
        // verbatim); a below-facade caller (api/mock-data.ts, no
        // gate) skips all pairs, preserving dual-write
        // discipline. See postRecordWriteOp for the transaction
        // shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: RecordWritePairs | undefined;
            if (pair !== undefined && organization !== undefined) {
                const b = validateRecordWriteBody(body);
                const documentBody = recordDocumentBodyOf(b);
                // Belt-and-suspenders (the flows precedent): a
                // create's initialStateEventId carries no
                // non-empty check of its own (R2's byte-pinned
                // birth names), so an empty value must still
                // 400 here — at the document trio's own gate —
                // rather than silently minting an invalid
                // synthesized pair.
                validateRecordDocumentBody(documentBody);
                const document = await formDocumentPairFor(db, {
                    routePattern: 'records/:id',
                    params: [b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                const attributePuts = await Promise.all(
                    b.attributes.map(async (attr) => {
                        const attributeBody =
                            recordAttributeDocumentBodyOf(
                                attr as unknown as
                                    Record<string, unknown>,
                            );
                        return formDocumentPairFor(db, {
                            routePattern: 'record-attributes/:id',
                            params: [attr.id],
                            body: attributeBody,
                            requesterIdentityId: actor,
                            requestAt: pair.requestAt,
                            organization,
                        });
                    }),
                );
                const removedIds = b.kind === 'edit'
                    ? b.removedAttributeIds : [];
                const attributeDeletes = await Promise.all(
                    removedIds.map(async (id) => {
                        // DELETE responses are UNIVERSALLY 204
                        // with no body (message-pair.ts
                        // resolution, mirrored here for the
                        // synthesized removal pair) — SPEC-LESS,
                        // so an explicit response override skips
                        // WRITE_RESPONSE_SPECS entirely.
                        return formDocumentPairFor(db, {
                            routePattern: 'record-attributes/:id',
                            params: [id],
                            body: undefined,
                            requesterIdentityId: actor,
                            requestAt: pair.requestAt,
                            organization,
                            method: 'DELETE',
                            response: {
                                status: 204, body: undefined,
                            },
                        });
                    }),
                );
                pairs = {
                    operation: pair,
                    document,
                    attributePuts,
                    attributeDeletes,
                };
            }
            return postRecordWriteOp(db, body, actor, pairs);
        },
    }),
    // records/:id is the fifth family, and the FIRST whose own
    // :id address also carries a live DELETE (RECORDS_WIRING's
    // own comment names why). GET is FLIPPED (Task 7): absorbed
    // into the generic documentGetHandler(RECORDS_WIRING) — the
    // SAME wiring row PUT already rides — wire-identical to the
    // hand-written db.records.getById dispatch it replaces
    // (recordDocumentEntityOf reproduces the shape verbatim, and
    // the 'trio' lifecycle walk 404s a lifecycle-deleted record
    // exactly as the old physical-delete plane did). PUT stays
    // documentPutHandler(RECORDS_WIRING) — the Decision 7 trio
    // fold, unchanged from before this flip. DELETE stays
    // hand-written — a splice + pair append in the same
    // transaction, exactly as before (the factory's fixed
    // closures have no per-family pair selector; see
    // message-pair.ts) — a splice route is not a document
    // verb-class member (Task 9 covers the DELETE pattern).
    route('records/:id', {
        get: documentGetHandler(RECORDS_WIRING),
        put: documentPutHandler(RECORDS_WIRING),
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['records', 'requests', 'responses'],
                async (view) => {
                    await view.records.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger rather than the old record_attributes
    // table. Rides the generic documentCollectionGetHandler —
    // wire-identical to the hand-written
    // db.recordAttributes.getAll() dispatch it replaces
    // (RECORD_ATTRIBUTES_WIRING's own entityOf,
    // recordAttributeDocumentEntityOf, already spreads the head
    // pair's body verbatim, so the list needs no
    // record-attributes-special reassembly step). No POST here —
    // record-attributes carries no create verb of its own,
    // unchanged from before this flip.
    route('record-attributes', {
        get: documentCollectionGetHandler(
            RECORD_ATTRIBUTES_WIRING,
        ),
    }),
    // record-attributes/:id is the sixth family. GET is FLIPPED
    // (Task 7): absorbed into the generic
    // documentGetHandler(RECORD_ATTRIBUTES_WIRING) — the SAME
    // wiring row PUT already rides — wire-identical to the
    // hand-written db.recordAttributes.getById dispatch it
    // replaces (recordAttributeDocumentEntityOf reproduces the
    // shape verbatim; the 'stateless' lifecycle skips the trio
    // walk entirely, so a DELETE head is the only tombstone
    // signal, already 404-absent via deriveDocumentsAt). PUT
    // stays documentPutHandler(RECORD_ATTRIBUTES_WIRING),
    // unchanged from before this flip. DELETE stays
    // hand-written — the RESTRICT check and the pair append ride
    // the SAME transaction, exactly as before (the factory's
    // fixed closures have no per-family pair selector; see
    // message-pair.ts) — a splice route is not a document
    // verb-class member (Task 9 covers the DELETE pattern).
    route('record-attributes/:id', {
        get: documentGetHandler(RECORD_ATTRIBUTES_WIRING),
        put: documentPutHandler(RECORD_ATTRIBUTES_WIRING),
        // DELETE is RESTRICT, not cascade: an attribute
        // still named by state_field_values rows or bound
        // in a flow / work-order graph refuses to die (409
        // naming the referrers) — destroying it would
        // orphan immutable event payloads. The referrer
        // check and the splice ride ONE transaction, so no
        // writer can slip a new reference between them; the
        // pair appends inside that SAME transaction, as the
        // last act after the safe delete succeeds.
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                [...new Set([
                    'record_attributes',
                    ...ATTRIBUTE_RESTRICT_TABLES,
                    'requests', 'responses',
                ])],
                async (view) => {
                    await deleteRecordAttributeSafe(view, id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // Flow↔record bindings nest under their parent flow: the flow
    // id is param 0, so the SERVER filters the collection to that
    // flow. The leaf id is param 1. GET is FLIPPED (Task 7): both
    // the collection and the by-id read now ride deriveFlowRecords
    // / deriveFlowRecord — a bespoke derivation (not a
    // DocumentFamilyWiring family; a join row carries no lifecycle
    // trio of its own), so this calls it directly rather than
    // through a generic constructor, mirroring deriveFlowWorkOrders'
    // own precedent above. This closes the LAST deferred old-plane
    // nested read under flows — the one remaining table-backed
    // nested read, flows/:id/versions above, stays that way BY
    // DESIGN (its own comment), never a deferral this phase closes.
    route('flows/:id/records', {
        get: (db, p, _actor, organization) =>
            deriveFlowRecords(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('flows/:id/records/:frid', {
        get: (db, p, _actor, organization) =>
            deriveFlowRecord(
                db, requireOrganization(organization),
                param(p, 0), param(p, 1),
            ),
        put: (db, p, body, actor, pair) =>
            postFlowRecordDocumentOp(
                db, param(p, 1), body, actor, pair,
            ),
        delete: (db, p, _actor, pair) => {
            const frid = param(p, 1);
            return db.transaction(
                ['flow_records', 'requests', 'responses'],
                async (view) => {
                    await view.flowRecords.delete(frid);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),

    // Hand-written in place of makeIdRoute<OrganizationEntity>
    // so PUT can append its message pair in the same
    // transaction as the write — the factory's fixed closures
    // have no per-family pair selector (see message-pair.ts).
    // GET reproduces the factory closure byte-equivalently;
    // verbs stay {get, put}. organizations is a plain
    // EntityStore (mutable), so this is DOCUMENT-class: a
    // repeat PUT records Supersedes. GLOBAL plane — no
    // organization_id stamp (this table IS the tenant root).
    // GET is FLIPPED (Phase 12 Task 5): dispatches to
    // deriveOrganization (api/derive-organizations.ts) — wire-
    // identical to the hand-written db.organizations.getById
    // read it replaces (tests/drift-organizations.test.ts legs
    // 2/2b/3a/4/6 pin the parity, including the id-LAST key
    // order the seven-sibling entityOf convention departs from
    // on purpose). A bespoke call, not the generic
    // documentGetHandler(wiring) every other flipped family
    // rides: that machinery requires a wiring row's documentOp,
    // and organizations has none — PUT stays hand-written and
    // unflipped below, so a documentOp built only to satisfy the
    // type would never be called. PUT: the row write and its
    // message-pair append still happen in the SAME transaction
    // as always — only this read moved.
    route('organizations/:id', {
        get: (db, p) => deriveOrganization(db, param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['organizations', 'requests', 'responses'],
                async (view) => {
                    const written = await view.organizations
                        .put(
                            id,
                            withoutId(body) as unknown as
                                Omit<OrganizationEntity, 'id'>,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // GET is FLIPPED (Task 8): derived via
    // documentCollectionGetHandler — wire-identical to the
    // hand-written db.memberships.getAll() dispatch it replaces
    // (memberships is organizationNested:true, so the derived
    // prefix fences to the caller's org exactly as the
    // org-scoped adapter already did for the hand-written read).
    route('memberships', {
        get: documentCollectionGetHandler(MEMBERSHIPS_WIRING),
    }),
    // GET is FLIPPED (Task 8): absorbed into the generic
    // documentGetHandler(MEMBERSHIPS_WIRING) — the SAME wiring
    // row PUT already rides — wire-identical to the
    // hand-written db.memberships.getById dispatch it replaces.
    // PUT rides the generic documentPutHandler(MEMBERSHIPS_WIRING)
    // (prior commit) — wire-identical to postMembershipDocumentOp's
    // own direct dispatch it replaces. DELETE stays hand-written
    // in place of makeIdRoute<MembershipEntity>'s fixed closure so
    // it can append its message pair in the same transaction as
    // the write (the factory has no per-family pair selector — see
    // message-pair.ts; no generic DELETE component exists either —
    // the records/:id template). Verbs stay {get, put, delete}.
    route('memberships/:id', {
        get: documentGetHandler(MEMBERSHIPS_WIRING),
        put: documentPutHandler(MEMBERSHIPS_WIRING),
        delete: (db, p, _actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['memberships', 'requests', 'responses'],
                async (view) => {
                    await view.memberships.delete(id);
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // GET is FLIPPED (Task 8): derived via
    // deriveMemberParent(db, actor) — wire-identical to the
    // hand-written db.members.getById(actor) dispatch it
    // replaces (members is GLOBAL plane, so the actor's own id
    // resolves the same row regardless of active org).
    route('current-member', {
        get: (db, _p, actor) => deriveMemberParent(db, actor),
    }),

    // GET is FLIPPED (Task 8): absorbed into the generic
    // documentGetHandler(MEMBERS_WIRING) — the SAME wiring row
    // PUT already rides — wire-identical to the hand-written
    // db.members.getById dispatch it replaces. PUT rides the
    // generic documentPutHandler(MEMBERS_WIRING) (prior commit)
    // — wire-identical to postMemberDocumentOp's own direct
    // dispatch it replaces. Verbs stay {get, put} — members/:id
    // has no DELETE today, mirroring the identities/:id
    // precedent. Global plane: no organization stamping (the
    // members directory row carries no organization_id) — see
    // documentWriteResponseSpec's own registration-first consult
    // (document-family.ts).
    route('members/:id', {
        get: documentGetHandler(MEMBERS_WIRING),
        put: documentPutHandler(MEMBERS_WIRING),
    }),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — GET dispatches to the derived
    // entity, PUT to postIdeaDocumentOp, wire-identical to the
    // hand-written {get, put} pair it replaces. The Decision-7/
    // MEMBER_ID-CAVEAT prose that lived here moved to the
    // IDEAS_WIRING block above.
    documentEntityRoute(IDEAS_WIRING),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — see the ideas/:id entry above for
    // the shared rationale; the Decision-7/MEMBER_ID-CAVEAT
    // prose moved to the PROJECTS_WIRING block above.
    documentEntityRoute(PROJECTS_WIRING),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger rather than the old objectives table. Rides
    // the generic documentCollectionGetHandler — wire-identical
    // to the hand-written db.objectives.getAll() dispatch it
    // replaces (OBJECTIVES_WIRING's own entityOf,
    // objectiveDocumentEntityOf, already picks the exact {id,
    // organization_id, position} shape, so the list needs no
    // objectives-special reassembly step). POST stays this
    // hand-written bundle — objectives' own create forms the
    // document PLUS its first revision pair in one pass
    // (postObjectiveCreationOp), mirroring records'/work-orders'
    // own precedent.
    route('objectives', {
        get: documentCollectionGetHandler(OBJECTIVES_WIRING),
        // Forms the document + revision pairs pre-tx (Task 3)
        // beside the gate's own operation pair — the SAME shape
        // a live genesis PUT /objectives/:id and a live PUT
        // /objectives/:id/revisions/:rid would each carry — ONLY
        // when the gate supplied both a pair and a fence
        // organization (the route('flows') condition verbatim);
        // a below-facade caller (api/mock-data.ts, no gate) skips
        // both, preserving dual-write discipline. See
        // postObjectiveCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, pair, organization,
        ) => {
            let pairs: ObjectiveCreationPairs | undefined;
            if (pair !== undefined && organization !== undefined) {
                const b = validateObjectiveCreateBody(body);
                const documentBody = objectiveDocumentBodyOf(b);
                validateObjectiveDocumentBody(documentBody);
                const document = await formDocumentPairFor(db, {
                    routePattern: 'objectives/:id',
                    params: [b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                const revisionBody = objectiveRevisionBodyOf(b);
                validateObjectiveRevisionEntity(revisionBody);
                const revision = await formDocumentPairFor(db, {
                    routePattern: 'objectives/:id/revisions/:rid',
                    params: [b.id, b.revisionId],
                    body: revisionBody,
                    requesterIdentityId: actor,
                    requestAt: pair.requestAt,
                    organization,
                });
                pairs = { operation: pair, document, revision };
            }
            return postObjectiveCreationOp(db, body, pairs);
        },
    }),
    // objectives/:id is the seventh family. GET is FLIPPED
    // (Task 7): absorbed into the generic documentEntityRoute —
    // GET dispatches to documentGetHandler(OBJECTIVES_WIRING),
    // wire-identical to the hand-written db.objectives.getById
    // dispatch it replaces (objectiveDocumentEntityOf reproduces
    // the shape verbatim; the 'stateless' lifecycle skips the
    // trio walk entirely, so there is no DELETE-head concept to
    // filter). PUT stays documentPutHandler(OBJECTIVES_WIRING),
    // unchanged from before this flip (Task 2); objectives/:id
    // has no DELETE today, mirroring the ideas/projects/
    // work-orders precedent that already rides this same
    // documentEntityRoute shape.
    documentEntityRoute(OBJECTIVES_WIRING),
    // Objective revisions nest under their parent objective: the
    // objective id is param 0, so the SERVER filters the
    // collection to that objective (the org fence still rides the
    // facade re-entry). GET is FLIPPED (Task 7): rides
    // deriveObjectiveRevisions — a bespoke derivation, not a
    // DocumentFamilyWiring family (a nested address carries no
    // lifecycle trio of its own), so this calls it directly
    // rather than through a generic constructor, mirroring
    // deriveFlowRecords' own precedent above. The leaf id is
    // param 1; only PUT is exposed, unchanged from before this
    // flip.
    route('objectives/:id/revisions', {
        get: (db, p, _actor, organization) =>
            deriveObjectiveRevisions(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    // Hand-written in place of a bare store put so PUT can
    // append its message pair in the same transaction as the
    // write (see message-pair.ts).
    route('objectives/:id/revisions/:rid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            return db.transaction(
                [
                    'objective_revisions',
                    'requests', 'responses',
                ],
                async (view) => {
                    const written = await view
                        .objectiveRevisions.put(
                            id,
                            withoutId(body) as unknown as
                                Omit<
                                    ObjectiveRevisionEntity, 'id'
                                >,
                        );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // Objective baseline scores nest under their parent project:
    // the project id is param 0, so the SERVER filters the
    // collection to that project (the org fence still rides the
    // facade re-entry). GET is FLIPPED (Task 7): rides
    // deriveBaselineScores — the SAME bespoke-derivation
    // reasoning as deriveObjectiveRevisions above (a project-
    // nested address, not a DocumentFamilyWiring family). The
    // leaf id is param 1; only PUT is exposed, unchanged from
    // before this flip.
    route('projects/:id/objective-baseline-scores', {
        get: (db, p, _actor, organization) =>
            deriveBaselineScores(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('projects/:id/objective-baseline-scores/:sid', {
        put: (db, p, body, actor, pair) =>
            postBaselineScoreDocumentOp(
                db, param(p, 1), body, actor, pair,
            ),
    }),
    // Objective actual scores nest under their parent project,
    // identically: project id is param 0 (server filter), leaf id
    // is param 1, PUT only. GET is FLIPPED (Task 7): rides
    // deriveActualScores, the actuals byte-twin of
    // deriveBaselineScores above.
    route('projects/:id/objective-actual-scores', {
        get: (db, p, _actor, organization) =>
            deriveActualScores(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),
    route('projects/:id/objective-actual-scores/:sid', {
        put: (db, p, body, actor, pair) =>
            postActualScoreDocumentOp(
                db, param(p, 1), body, actor, pair,
            ),
    }),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger via deriveStates (api/derive-states.ts's
    // six-source union), not the raw states table — the
    // client's own GET consumer (deriveOrganizationFacts and
    // every get*States/get*StateDetails reader in
    // state-events.ts) rides transitively, no web-app change.
    route('states', {
        get: (db, _p, _actor, organization) =>
            deriveStates(db, requireOrganization(organization)),
    }),
    // GET is NOT flipped: a single event by its OWN event id has
    // zero product callers (deferred to Phase Final).
    route('states/:id', {
        get: (db, p) =>
            db.states.getById(param(p, 0)),
        // The author is the verified caller (actor), stamped
        // over any client-supplied member_id — the ledger
        // records who acted, not who the body claims.
        put: (db, p, body, actor, pair) => {
            const id = param(p, 0);
            return db.transaction(
                ['states', 'requests', 'responses'],
                async (view) => {
                    const written = await view.states.put(
                        id,
                        {
                            ...validateStateBody(
                                withoutId(body),
                            ),
                            member_id: actor,
                        },
                    );
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return written;
                },
            );
        },
    }),
    // GET is NOT flipped: an entity's bare CURRENT state has
    // zero product callers (deferred to Phase Final).
    route('entity-states/:id', {
        get: (db, p) =>
            db.states.getCurrentFor(param(p, 0)),
    }),
    // GET is FLIPPED (Task 7): derives via deriveStatesFor —
    // the gate ALREADY fences this route (api/api.ts's
    // entity-states/:id[/history] guard resolves the entity's
    // owner via the RAW probes before dispatch), so the handler
    // does not re-fence; deriveStatesFor's own header documents
    // that precondition. Every client reader that names this
    // address (getWorkOrderCurrentNodeId, getWorkOrderActive
    // Claim, getProjectState/getRecordStateDetail/etc.) rides
    // transitively, no web-app change.
    route('entity-states/:id/history', {
        get: (db, p, _actor, organization) =>
            deriveStatesFor(
                db, requireOrganization(organization),
                param(p, 0),
            ),
    }),

    route('snapshots/schema', {
        get: async (db) =>
            (await db.hasSchema())
                ? db.getSnapshot()
                : null,
        delete: (db) => db.deleteSchema(),
    }),
    // DEMO-ONLY: these seed routes return SeededCredentials —
    // freshly-minted plaintext sign-ins surfaced in-band, once.
    // Only PBKDF2 hashes are stored; the in-band plaintext
    // return is deleted at the server tier.
    route('snapshots/mock-data', {
        post: async (db) => {
            const { postMockDataLoad } =
                await import('./mock-data.ts');
            return postMockDataLoad(db);
        },
    }),
    route('snapshots/bootstrap', {
        post: async (db) => {
            const {
                postBootstrap,
            } = await import('./mock-data.ts');
            return postBootstrap(db);
        },
    }),
    route('snapshots/import', {
        put: (db, _, payload) => {
            if (
                typeof payload.json
                    !== 'string'
            ) {
                throw new ApiError(
                    'Missing or invalid'
                    + ' "json" field:'
                    + ' expected a string.',
                    HTTP_BAD_REQUEST,
                );
            }
            return db.putSnapshot(
                payload.json,
            );
        },
    }),
];

export function matchRoute(
    table: readonly Route[],
    pathSegments: string[],
): { route: Route; params: string[] } | null {
    for (
        const routeDefinition of table
    ) {
        if (
            routeDefinition.segments.length
            !== pathSegments.length
        ) {
            continue;
        }
        const params: string[] = [];
        let matched = true;
        for (
            let i = 0;
            i
                < routeDefinition.segments
                    .length;
            i++
        ) {
            if (
                routeDefinition
                    .segments[i]!
                    .startsWith(':')
            ) {
                params.push(
                    pathSegments[i]!,
                );
            } else if (
                routeDefinition.segments[i]
                !== pathSegments[i]
            ) {
                matched = false;
                break;
            }
        }
        if (matched) {
            return {
                route: routeDefinition,
                params,
            };
        }
    }
    return null;
}
