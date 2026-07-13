import {
    EntityNotFoundError,
    ForeignOrganizationError,
} from './db.ts';
import type {
    DbAdapter,
} from './db.ts';
import { missedReadError } from './derive-states.ts';
import type {
    FlowCreateBody,
    FlowUndoBody,
    WorkOrderCreateBody,
    RecordWriteBody,
    ObjectiveCreateBody,
} from './validators.ts';
import type {
    Id,
    AIMemberEntity,
    FlowEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    HumanMemberEntity,
    IdentityEntity,
    IdentityKind,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    ClientRegistrationEntity,
    IdentityTokenRevocationEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    StateEntity,
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
    WorkOrderEntity,
    MemberEntity,
    MemberKind,
    MemberState,
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
    validateFlowWorkOrderEntity,
    validateFlowUndoBody,
    validateIdeaConversionBody,
    validateIdeaDocumentBody,
    validateIdeaSubmissionEntity,
    validateIdentityCreateBody,
    validateIdentityDocumentBody,
    validateIdentityPiiEntity,
    validateIdentityCredentialEntity,
    validateClientRegistrationEntity,
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
    validateFlowTagEntity,
    validateFlowTagName,
    validateRecordAttributeDocumentBody,
    validateRecordDocumentBody,
    validateRecordWriteBody,
    validateRoleGrantEntity,
    validateWorkOrderClaimBody,
    validateWorkOrderCreateBody,
    validateWorkOrderDocumentBody,
    validateWorkOrderReleaseBody,
    validateWorkOrderTransitionBody,
    validateWorkOrderFlowGraphJson,
    pickString,
    pickBoolean,
    pickNumber,
    pickJsonObjectField,
    validateStoredGraphJson,
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
    HTTP_OK,
    HTTP_NO_CONTENT,
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
    deriveIdeaStateHistory,
    ideaEntityOf,
} from './derive-ideas.ts';
import {
    deriveProjectStateHistory,
    projectEntityOf,
} from './derive-projects.ts';
import {
    flowEntityOf,
    deriveFlow,
    deriveFlows,
    deriveFlowStateHistory,
    resolveFlowUndoTarget,
    type FlowUndoResolution,
} from './derive-flows.ts';
import {
    buildFlowGraphDelta,
    buildFlowGraphRevivals,
} from './flow-graph-diff.ts';
import { deriveProjectFlows } from './derive-project-flows.ts';
import {
    deriveFlowWorkOrders,
} from './derive-flow-work-orders.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
} from './derive-flow-records.ts';
import { deriveFlowTag } from './derive-flow-tags.ts';
import {
    deriveObjectiveRevisions,
} from './derive-objective-revisions.ts';
import { deriveRecordStateHistory } from './derive-records.ts';
import {
    deriveObjectiveStateHistory,
    deriveObjectiveHistories,
} from './derive-objectives.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
} from './derive-project-scores.ts';
import {
    deriveMembers,
    deriveMemberParent,
    memberParentOf,
} from './derive-members.ts';
import {
    deriveIdentityPiiRows,
    deriveIdentityPii,
    deriveCredentialsFor,
    deriveCredential,
    deriveClientRegistration,
    deriveIdentityKind,
    deriveRoleGrants,
    deriveRoleGrant,
    deriveIdentityProviders,
    deriveIdentityProvider,
    deriveTokenRevocation,
} from './derive-identity-spine.ts';
import {
    deriveMemberStates,
    deriveWorkOrderHistories,
    workOrderClaimHistoryFor,
    workOrderDocumentHeadFor,
    workOrderHistoryFor,
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
    documentStateHistoryHandler,
    documentHeadPairId,
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
// validateDocument). Phase Final Task 2: the ideas ROW half is
// stripped; the pair + states.postEvent land in ONE transaction
// (states ROW half stripped (pair plane only)). Genesis
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
    // ideaEntityOf requires the lifecycle-current event; the
    // generic trio path always supplies it after DELETED filter.
    entityOf: (document, organization, current) =>
        ideaEntityOf(document, organization, current!),
};
const PROJECTS_WIRING: DocumentFamilyWiring = {
    family: 'projects',
    lifecycle: 'trio',
    notFoundTable: 'projects',
    validateDocument: validateProjectDocumentBody,
    documentOp: postProjectDocumentOp,
    // projectEntityOf requires the lifecycle-current event;
    // the generic trio path always supplies it after DELETED
    // filter.
    entityOf: (document, organization, current) =>
        projectEntityOf(document, organization, current!),
};
// The flows wiring row — Task 3's flip commit, GET-wired at
// Task 8. entityOf is derive-flows.ts's OWN flowEntityOf, not a
// routes.ts-local mapper: it returns FlowWithGraph (the entity
// plus the document's own `graph` field). Live flows GET is
// hand-written (deriveFlow/deriveFlows) so this slot is unused
// for reads; the wrapper ignores `current` and omits pairCount
// (hasUndoHistory false) — same as the prior 2-arg assignability
// shim. flowEntityOf's third param is pairCount (number), not
// StateEntity, so it cannot sit in the entityOf slot directly.
const FLOWS_WIRING: DocumentFamilyWiring = {
    family: 'flows',
    lifecycle: 'trio',
    notFoundTable: 'flows',
    validateDocument: validateFlowDocumentBody,
    documentOp: postFlowDocumentOp,
    entityOf: (document, organization, _current?) =>
        flowEntityOf(document, organization),
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
    _current?: StateEntity,
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
// Head document → wire RecordEntity. Entity fields come from
// the head body; the lifecycle trio is stamped from the
// lifecycle-current StateEntity (never re-copied from the
// head body — genesis-wins-under-skew). `current` is required
// on the live trio path (document-family always supplies it
// after the DELETED filter).
function recordDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
    current: StateEntity,
): RecordEntity {
    const body = document.body;
    return {
        id: document.uriId,
        organization_id: organization,
        name: pickString(body, 'name'),
        description: pickString(body, 'description'),
        position: pickNumber(body, 'position'),
        state: current.state,
        state_at: current.at,
        state_event_id: current.id,
    };
}
// The records wiring row — the fifth family, and the first
// 'trio' family whose :id address also carries a live DELETE
// route (Author gate 9: documentLifecycleEvents now skips a
// DELETE-method pair — see its own comment in derive-
// documents.ts). notFoundTable is 'records' (its storage table
// name matches its family name, like ideas/projects/flows).
// recordDocumentEntityOf requires the lifecycle-current event;
// the generic trio path always supplies it after DELETED
// filter.
const RECORDS_WIRING: DocumentFamilyWiring = {
    family: 'records',
    lifecycle: 'trio',
    notFoundTable: 'records',
    validateDocument: validateRecordDocumentBody,
    documentOp: postRecordDocumentOp,
    entityOf: (document, organization, current) =>
        recordDocumentEntityOf(
            document, organization, current!,
        ),
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
    _current?: StateEntity,
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
// construction. Head document → wire ObjectiveEntity. Entity
// fields come from the head body; the lifecycle trio is stamped
// from the lifecycle-current StateEntity (never re-copied from
// the head body — genesis-wins-under-skew). `current` is required
// on the live trio path (document-family always supplies it
// after the DELETED filter).
function objectiveDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
    current: StateEntity,
): ObjectiveEntity {
    return {
        id: document.uriId,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
        state: current.state,
        state_at: current.at,
        state_event_id: current.id,
    };
}
// The objectives wiring row — the seventh family, now the
// FIFTH 'trio' one (states-address retirement). Its three
// old 'stateless' rationales are all RETIRED with the
// states/:id address that anchored them: the wire body DOES
// grow the trio (the zero-delta covenant died with the
// address), genesis IS an explicit minted event (the seed
// re-baselined its pins — no 911 pin survives), and
// absence-as-active (R2) is retired — a fresh objective now
// carries a genesis event like every other trio family.
// notFoundTable is 'objectives' — its storage table name
// matches its family name, like ideas/projects/flows/records
// (work-orders/record-attributes are the two whose names
// diverge). objectiveDocumentEntityOf requires the lifecycle-
// current event; the generic trio path always supplies it
// after DELETED filter.
const OBJECTIVES_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    lifecycle: 'trio',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: (document, organization, current) =>
        objectiveDocumentEntityOf(
            document, organization, current!,
        ),
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
    _current?: StateEntity,
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
// document address); objectives and the members parent document
// (MEMBERS_WIRING below) both now carry document trios on their
// own addresses (states-address retirement); record-attributes
// and memberships share neither — a membership carries NO
// lifecycle concept whatsoever, a pure join relation (Codd's
// own teaching: the identities of the joined, plus the moment
// of union). GET stays hand-written old-plane until Task 8;
// only PUT rides the generic machinery this task —
// memberships/:id's own DELETE stays hand-written too, the
// records/:id template (no generic DELETE component exists).
// notFoundTable is 'memberships' — its storage table name
// matches its family name, like ideas/projects/flows/records/
// objectives (work-orders/record-attributes are the two whose
// names diverge).
const MEMBERSHIPS_WIRING: DocumentFamilyWiring = {
    family: 'memberships',
    lifecycle: 'stateless',
    notFoundTable: 'memberships',
    validateDocument: validateMembershipDocumentBody,
    documentOp: postMembershipDocumentOp,
    entityOf: membershipDocumentEntityOf,
};
// Head document → wire MemberEntity. Entity field (`type`)
// from the head body; the lifecycle trio is stamped from the
// lifecycle-current StateEntity via derive-members.ts's
// memberParentOf (never re-copied from the head body —
// genesis-wins-under-skew). `current` is required on the live
// trio path (document-family always supplies it after the
// DELETED filter). `_organization` stays unused: the members
// directory is GLOBAL plane (family-registry.ts:
// organizationNested: false) — the FIRST family on it — so
// there is no fence value to stamp at all.
function memberDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
    current: StateEntity,
): MemberEntity {
    return memberParentOf(document, current);
}
// The members wiring row — the ninth family, a 'trio' one
// since the states-address retirement. The old FREEZE-at-
// genesis refutation is RETIRED: its premise — a competing
// states/:id log receiving archive/reactivate events the
// document plane could never see — died with the address.
// Every lifecycle write now rides THIS document address:
// create folds initialState* into the members/:id pair, a
// state change PUTs a fresh trio, a detail edit echoes the
// current trio byte-identically and FOLDS by message_hash
// (appendMessagePair's dedup skip) instead of appending;
// documentLifecycleEvents' first-occurrence-wins dedup by
// state_event_id resolves any echo that does land. Global
// plane: no organization stamping (the members directory row
// carries no organization_id) — see documentWriteResponseSpec's
// registration-first consult (document-family.ts).
// memberDocumentEntityOf requires the lifecycle-current
// event; the generic trio path always supplies it after
// DELETED filter.
const MEMBERS_WIRING: DocumentFamilyWiring = {
    family: 'members',
    lifecycle: 'trio',
    notFoundTable: 'members',
    validateDocument: validateMemberDocumentBody,
    documentOp: postMemberDocumentOp,
    entityOf: (document, organization, current) =>
        memberDocumentEntityOf(
            document, organization, current!,
        ),
};
// The bare ai_members facet row spreads safely (no
// organization_id, no trio — the SAME reason memberDocumentEntityOf's
// own comment gives). `_organization` stays unused: ai-members is
// GLOBAL plane too (family-registry.ts: organizationNested:false).
function aiMemberDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
    _current?: StateEntity,
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
    _current?: StateEntity,
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
    _current?: StateEntity,
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

// Phase Final Task 1(a): the attribute's owning organization
// from its STORED document-pair head response body (the
// WRITE_RESPONSE_SPECS successBody stamp). Row fallback
// remains for raw-seeded RESTRICT fixtures until Stage B
// deletes the table; production always has pairs.
async function recordAttributeOrganizationFromPairs(
    db: DbAdapter,
    uriPrefix: string,
    id: Id,
): Promise<Id | null> {
    const headPairId = await documentHeadPairId(
        db, uriPrefix, id,
    );
    if (headPairId === undefined) return null;
    const headResponse =
        await db.responses.getById(headPairId);
    // pairResponseBody only reads responseMessage — form a
    // minimal carrier so the pure decoder stays one voice.
    const headBody = pairResponseBody({
        responseMessage: headResponse.message,
    } as MessagePair);
    const organizationId = headBody?.['organization_id'];
    if (typeof organizationId !== 'string') {
        throw new Error(
            'record-attribute head lacks organization_id: '
            + id,
        );
    }
    return organizationId;
}

// Record creation or edit, discriminated by payload.kind.
// Phase Final Task 2: records + record_attributes ROW halves
// stripped — attributes/record body ride the operation +
// document + attribute pairs; states.postEvent on create/edit
// stays until the states-trace group. Removed attributes are
// RESTRICTED inside the same tx (pair-plane referrers; 409
// bytes preserved). `pairs` is optional so the seed's below-
// facade call keeps compiling; the route always supplies the
// bundle.
export async function postRecordWriteOp(
    db: DbAdapter,
    payload: Record<string, unknown>,
    _actor: Id,
    pairs?: RecordWritePairs,
    // Verified token organization for the RESTRICT SFV
    // visibility probe (stateEventVisibilityFor). Optional so
    // the below-facade seed path (creates only; never removes
    // referenced attributes) keeps compiling; the live route
    // always supplies it when removals can fire.
    organization?: Id,
): Promise<void> {
    const body = validateRecordWriteBody(payload);
    const removedIds =
        body.kind === 'edit'
            ? body.removedAttributeIds
            : [];
    // State event + RESTRICT + pairs commit as one
    // transaction. Attribute bodies live only on the pair
    // plane (attributePuts/attributeDeletes).
    await db.transaction(
        [...new Set([
            // Phase Final Task 2: states ROW half stripped.
            ...ATTRIBUTE_RESTRICT_TABLES,
            'requests', 'responses',
        ])],
        async (view) => {
            // Phase Final Task 2: states ROW half stripped —
            // document/attribute pairs alone carry truth.
            if (removedIds.length > 0) {
                // Prefer the verified token claim; fall back to
                // the body's stamped organization_id only for
                // below-facade callers that omit organization
                // (seed never removes referenced attributes).
                const boundOrganization = requireOrganization(
                    organization ?? body.record.organization_id,
                );
                const referrers =
                    await collectAttributeReferrers(
                        view, boundOrganization, removedIds,
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

// Phase Final Task 2: writeFlowGraphDelta RETIRED. The four
// graph relation tables no longer receive dual-write puts;
// graphDelta/revivals stay in document-pair bodies
// (SIDECAR-KEEP) feeding deriveFlowGraphStates. Flow lifecycle
// Phase Final Task 2: states ROW half stripped.

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
// transition). Phase Final Task 2: the ideas ROW half is
// stripped — the pair + states.postEvent commit as ONE
// transaction (states ROW half stripped — pair plane only).
// WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade callers
// and type parity. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'ideas/:id' is pair-wired and never
// bearer-exempt.
export async function postIdeaDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<IdeaEntity> {
    const doc = validateIdeaDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<IdeaEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Project document write (Decision 7): ONE shape serves
// create, edit, and transition — genesis is head-presence-
// defined (a fresh id's PUT simply finds no head, so the
// ternary below falls to `actor`, authoring the birth like any
// other transition). Phase Final Task 2: the projects ROW half
// is stripped — the pair + states.postEvent commit as ONE
// transaction (states ROW half stripped — pair plane only).
// WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade callers
// and type parity. `pair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'projects/:id' is pair-wired and never
// bearer-exempt.
export async function postProjectDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<ProjectEntity> {
    const doc = validateProjectDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<ProjectEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: projects ROW half stripped;
        // states ROW half stripped (pair plane only).
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Record document write (Decision 7, the fifth family): ONE
// shape serves create, edit, and transition — genesis is
// head-presence-defined, byte-identical to postIdeaDocumentOp/
// postProjectDocumentOp. UNLIKE those two, a record's genesis
// normally arrives through the composed create
// (postRecordWriteOp, POST /records) rather than this PUT —
// this op's genesis arm exists for a live PUT-first flow.
// Phase Final Task 2: the records ROW half is stripped — the
// pair + states.postEvent commit as ONE transaction (states
// row half strips with the states-trace group).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes; the
// reconstructed return is for below-facade callers and type
// parity. `pair` is optional so the seed's below-facade call
// keeps compiling; the route always supplies one.
export async function postRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<RecordEntity> {
    const doc = validateRecordDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<RecordEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: records ROW half stripped;
        // states ROW half stripped (pair plane only).
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Record attribute document write — the sixth family, and the
// SECOND 'stateless' one (vacuous BY CONSTRUCTION). Phase Final
// Task 2: the record_attributes ROW half is stripped — pure
// pair-plane write (postWorkOrderDocumentOp shape).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes; the
// reconstructed return is for below-facade callers and type
// parity. validateRecordAttributeDocumentBody rejects a body
// carrying the trio at the gate. `pair` is optional. The actor
// parameter is spelled `_actor`: no state event here to author.
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
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<RecordAttributeEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: record_attributes ROW half
        // stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Idea submission write: a genesis-only document address (an
// idea is submitted once per sid; no edit/transition case
// exists for this family). Phase Final Task 2: the
// idea_submissions ROW half is stripped — pure pair-plane
// write (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes. Exported so the seed can
// drive submission creation through the same op the route
// uses (Decision 6's below-facade carve-out). `pair` is
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
    const entity = withoutId(body) as unknown as
        Omit<IdeaSubmissionEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id: sid, ...entity };
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

// Flow creation. Phase Final Task 2: flows + graph relation
// + project_flows ROW halves stripped — pair plane carries
// the document (graphDelta SIDECAR-KEEP) and the join; only
// the initial 'active' states.postEvent remains until the
// states-trace group. graphDelta is still validated at the
// HTTP gate and stored on the document pair. Exported so the
// seed can drive flow creation through the same gate the
// route uses (Decision 6's below-facade carve-out). `pairs`
// is optional so the seed's below-facade call keeps
// compiling; the route always supplies the triple.
export async function postFlowCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    pairs?: FlowCreationPairs,
): Promise<void> {
    validateFlowCreateBody(body);
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
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

// Flow document write (Decision 7, the LOCKED class). Phase
// Final Task 2: flows + graph relation ROW halves stripped —
// the pair + states.postEvent (flow lifecycle + revivals)
// commit as ONE transaction. graphDelta/revivals stay in the
// document-pair body (SIDECAR-KEEP → deriveFlowGraphStates);
// graph is the client-authored snapshot carried on the pair
// for GET reassembly via flowEntityOf. UNLIKE ideas/projects,
// this op carries NO member_id ternary: flows mint a FRESH
// trio on every PUT (design decision 2). version-publish
// (flow_versions) is NOT part of this op — no writers remain.
// WRITE_RESPONSE_SPECS successBody forms the wire bytes; the
// reconstructed return is for below-facade callers and type
// parity. `pair` is optional so a below-facade caller with no
// pair keeps compiling; the live route always supplies one.
export async function postFlowDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<FlowEntity> {
    const doc = validateFlowDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<FlowEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: flows + graph ROW halves
        // stripped; states ROW half stripped (pair plane only).
        ['requests', 'responses'],
        async (view) => {
            // Revival states events dual-write until the
            // states-trace strip; pair body also carries
            // revivals for deriveFlowGraphStates (SIDECAR-KEEP).
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Undo-as-replay (Phase 14 Task 8): given a resolution
// ALREADY produced by resolveFlowUndoTarget, perform the
// restore write. Phase Final Task 2: flows + graph ROW
// halves stripped — the 'updated' state event, revivals
// states events, and the operation + synthesized document
// pairs (graphDelta/revivals SIDECAR-KEEP on the document
// body) commit as ONE transaction. Exhaustion appends only
// the operation pair. `follows: current.id` anchors the
// document pair to the EXACT head this resolution saw so a
// racing save 412s via the responses.follows unique index.
export async function postFlowUndoOp(
    db: DbAdapter,
    id: Id,
    actor: Id,
    organization: Id,
    pair: MessagePair,
    resolution: FlowUndoResolution,
    b: FlowUndoBody,
): Promise<unknown> {
    const { current, target } = resolution;
    if (target === undefined) {
        // Exhaustion: the gate still requires this wired write's
        // own operation pair to land (api.ts's post-dispatch
        // "wired write stored no pair" guard, true for every
        // pair-wired route), so it is appended ALONE — no
        // document pair, no domain writes — a genuine no-op a
        // LATER resolution walk correctly ignores (it carries no
        // correlated document pair to displace anything).
        return db.transaction(
            ['requests', 'responses'],
            async (view) => {
                await appendMessagePair(view, pair);
            },
        );
    }
    const currentGraph = validateStoredGraphJson(
        pickJsonObjectField(current.body, 'graph'),
        'flows/:id/undo current.graph',
    );
    const targetGraph = validateStoredGraphJson(
        pickJsonObjectField(target.body, 'graph'),
        'flows/:id/undo target.graph',
    );
    // graphDelta/revivals still computed for the document-pair
    // body (SIDECAR-KEEP → deriveFlowGraphStates); no row-plane
    // graph writer remains after writeFlowGraphDelta's strip.
    const delta = buildFlowGraphDelta(
        currentGraph, targetGraph, id,
        generateCryptoSafeBase62, b.at,
    );
    const revivals = buildFlowGraphRevivals(
        currentGraph, targetGraph,
        generateCryptoSafeBase62, b.at,
    );
    const flowFields = {
        name: pickString(target.body, 'name'),
        is_locked: pickBoolean(target.body, 'is_locked'),
        is_auto_layout:
            pickBoolean(target.body, 'is_auto_layout'),
        is_auto_fit:
            pickBoolean(target.body, 'is_auto_fit'),
        lock_timeout:
            pickNumber(target.body, 'lock_timeout'),
    };
    const documentBody = {
        ...flowFields,
        state: 'updated',
        state_at: b.at,
        state_event_id: b.eventId,
        graph: pickJsonObjectField(target.body, 'graph'),
        graphDelta: delta,
        revivals,
    };
    validateFlowDocumentBody(documentBody);
    // The flows family is LOCKED, so this document write takes
    // the FOLLOWS slot (never supersedes; the op holds no echo
    // of its own — design decision 5).
    const documentPair = await formDocumentPairFor(db, {
        routePattern: 'flows/:id',
        params: [id],
        body: documentBody,
        requesterIdentityId: actor,
        requestAt: pair.requestAt,
        organization,
        chain: 'follows',
        follows: current.id,
    });
    return db.transaction(
        // Phase Final Task 2: flows + graph ROW halves stripped.
        ['requests', 'responses'],
        async (view) => {
            await appendMessagePair(view, pair);
            await appendMessagePair(view, documentPair);
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

// The wire body a live PUT objectives/:id would carry for
// this SAME write: the entity field (organization_id
// STRIPPED — the org rides the address) plus the lifecycle
// trio mapped from the create body's initialState* — the
// recordDocumentBodyOf shape, so a synthesized document pair
// is byte-indistinguishable from what a live PUT would have
// stored for the identical write.
export function objectiveDocumentBodyOf(
    createBody: ObjectiveCreateBody,
): Record<string, unknown> {
    const {
        organization_id: _organizationId, ...entity
    } = createBody.objective;
    return {
        ...entity,
        state: createBody.initialState,
        state_at: createBody.initialStateAt,
        state_event_id: createBody.initialStateEventId,
    };
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

// Objective creation: operation + document + first-revision
// pairs commit as ONE transaction. Phase Final Task 2:
// objectives + objective_revisions ROW halves stripped —
// pure pair-plane write. The genesis lifecycle trio folds
// onto the document pair via objectiveDocumentBodyOf
// (states-address retirement); no separate states/:id event
// is written. Exported so the seed can drive objective
// creation through the same gate the route uses (Decision
// 6's below-facade carve-out). `pairs` is optional so the
// seed's below-facade shape keeps compiling; the route
// always supplies the bundle, since 'objectives' is pair-
// wired and never bearer-exempt. Create appends THREE pairs
// — operation, document, revision — in that order, LAST.
export async function postObjectiveCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pairs?: ObjectiveCreationPairs,
): Promise<void> {
    validateObjectiveCreateBody(body);
    return db.transaction(
        // Phase Final Task 2: objectives +
        // objective_revisions ROW halves stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pairs !== undefined) {
                await appendMessagePair(view, pairs.operation);
                await appendMessagePair(view, pairs.document);
                await appendMessagePair(view, pairs.revision);
            }
        },
    );
}

// Objective document write — the fifth lifecycle-trio family
// (states-address retirement). Phase Final Task 2: the
// objectives ROW half is stripped — pure pair-plane write
// (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity.
// validateObjectiveDocumentBody admits entity field plus the
// lifecycle trio; Task 1 widens the gate only — state-event
// minting lands with later tasks. `pair` is optional so a
// future below-facade caller keeps compiling; the live route
// always supplies one, since 'objectives/:id' is pair-wired
// and never bearer-exempt. The actor parameter is spelled
// `_actor` while state-event authorship is still pending.
export async function postObjectiveDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<ObjectiveEntity> {
    const doc = validateObjectiveDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<ObjectiveEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: objectives ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
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

// The wire body a live PUT members/:id would carry for this
// SAME write: `type` plus the lifecycle trio. The member kind
// is a server-supplied fact the caller pins; the trio is the
// caller's own — initialState* mapped on create, the echoed
// (or freshly minted) trio on edit/state-change. The ONE
// builder all ai/human create/edit sites share.
export function memberDocumentBodyOf(
    type: MemberKind,
    trio: {
        readonly state: MemberState;
        readonly stateAt: string;
        readonly stateEventId: string;
    },
): Record<string, unknown> {
    return {
        type,
        state: trio.state,
        state_at: trio.stateAt,
        state_event_id: trio.stateEventId,
    };
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

// AI-member creation: operation + member document + detail
// document pairs and the initial state event commit as ONE
// transaction. Phase Final Task 2: members + ai_members ROW
// halves stripped — pure pair-plane write; states.postEvent
// stays until the states-trace group. The initial event is
// authored by the verified caller (actor), never the body.
// Exported so the seed can drive AI-member creation through
// the same gate the route uses (Decision 6's below-facade
// carve-out). `pairs` is optional so the seed's below-facade
// shape keeps compiling; the route always supplies the
// bundle, since 'ai-members' is pair-wired and never
// bearer-exempt. Create appends THREE pairs — operation,
// member document, detail document — in that order, LAST.
export async function postAiMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    pairs?: MemberWritePairs,
): Promise<void> {
    validateAIMemberCreateBody(body);
    return db.transaction(
        // Phase Final Task 2: members + ai_members ROW
        // halves stripped; states stays until states-trace.
        ['requests', 'responses'],
        async (view) => {
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

// Human-member creation: initial state event and the
// document-pair bundle commit as ONE transaction. Phase Final
// Task 2: members + human_members + identities ROW halves
// stripped; states ROW half stripped (pair plane only). PII
// enters via PUT identities/:id/pii. The initial event is
// authored by the verified caller (actor), never the body.
// Exported so the seed can drive human-member creation
// through the same gate the route uses. `pairs` is optional
// so the seed's below-facade shape keeps compiling; the route
// always supplies the bundle. Create appends THREE pairs
// (operation, member document, detail document), plus a
// FOURTH identities/:id document IFF supplied.
export async function postHumanMemberCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    pairs?: MemberWritePairs,
): Promise<void> {
    validateHumanMemberCreateBody(body);
    return db.transaction(
        // Phase Final Task 2: members + human_members +
        // identities ROW halves stripped; states stays.
        ['requests', 'responses'],
        async (view) => {
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

// AI-member edit: Phase Final Task 2 strips members +
// ai_members ROW halves — pure pair-plane write (no states
// interaction; genesis/archive ride PUT states/:id). Exported
// so the route can call it after forming the bundle inline;
// `pairs` is optional so a below-facade caller keeps
// compiling. Edit appends THREE pairs, the SAME order as
// create.
export async function postAiMemberEditOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    pairs?: MemberWritePairs,
): Promise<void> {
    validateAIMemberEditBody(body);
    return db.transaction(
        // Phase Final Task 2: members + ai_members ROW
        // halves stripped.
        ['requests', 'responses'],
        async (view) => {
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

// Human-member edit: Phase Final Task 2 strips members +
// human_members + identities ROW halves — pure pair-plane
// write. No states interaction. PII changes ONLY via PUT
// identities/:id/pii. A FOURTH identities/:id document pair
// appends LAST IFF supplied; its body ({kind:'person'}) is
// byte-identical to create's, so it FOLDS by message_hash.
export async function postHumanMemberEditOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    pairs?: MemberWritePairs,
): Promise<void> {
    validateHumanMemberEditBody(body);
    return db.transaction(
        // Phase Final Task 2: members + human_members +
        // identities ROW halves stripped.
        ['requests', 'responses'],
        async (view) => {
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

// Identity creation: Phase Final Task 2 strips the
// identities + identity_credentials ROW halves — pure
// pair-plane write. A person's PII enters later via PUT
// identities/:id/pii. NO state event (an identity carries
// no lifecycle event at creation). The pairs a live POST
// /identities forms: operation (204 at identities/:id) +
// identities/:id document ({kind} alone). A service ALSO
// forms the credential-document pair at
// identities/:id/credentials/:cid, appended last.
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
// the same gate the route uses. `pairs` is optional so the
// seed's below-facade shape keeps compiling; the route always
// supplies the bundle. Create appends operation + identity
// document (+ credential document for service), LAST.
export async function postIdentityCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    pairs?: IdentityWritePairs,
): Promise<void> {
    validateIdentityCreateBody(body);
    return db.transaction(
        // Phase Final Task 2: identities + identity_credentials
        // ROW halves stripped.
        ['requests', 'responses'],
        async (view) => {
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

// Work-order creation. Phase Final Task 2: work_orders +
// flow_work_orders ROW halves stripped — THREE initial state
// events (start, post-start, creation-time 'claimed') and
// the operation/document/join pairs commit as ONE
// transaction. Events are applied IN ORDER and authored by
// the verified caller (actor), never the body. Seed drives
// work-order genesis through postWorkOrderDocumentOp /
// postFlowWorkOrderDocumentOp instead; states traces stay
// direct until the states-trace group. The route always
// supplies the triple and forms all three pairs pre-tx.
export async function postWorkOrderCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    pairs?: WorkOrderCreationPairs,
): Promise<void> {
    validateWorkOrderCreateBody(body);
    return db.transaction(
        // Phase Final Task 2: work_orders + flow_work_orders
        // ROW halves stripped.
        ['requests', 'responses'],
        async (view) => {
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
//
// PHASE 14 TASK 4: the prior-claim decision read is re-
// anchored onto the pair plane (workOrderClaimHistoryFor,
// api/derive-states.ts) — ENTITY-SCOPED indexed reads inside
// this SAME transaction, never a nested tx — in place of the
// row-plane view.states.getAllFor(workOrderId). Author gate 3:
// latestClaimEvent and isClaimEventExpired (the live Date.now
// clock) stay byte-identical — ONLY the event SOURCE flips.
//
// PHASE 15 TASK 2: the claim-gate graph read is re-anchored
// onto workOrderDocumentHeadFor (pair-plane document head)
// in place of view.workOrders.getById. isClaimEventExpired +
// 409 bytes + EntityNotFoundError mapping stay byte-identical
// — ONLY the row source flips. Phase Final Task 2: work_orders
// dropped from the tx list (no dual-write half remains).
export async function postWorkOrderClaimOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    organization: Id,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        // Phase Final Task 2: work_orders ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            validateWorkOrderClaimBody(body);
            const wo = await workOrderDocumentHeadFor(
                view, organization, workOrderId,
            );
            if (wo === null) {
                throw await missedReadError(
                    view, workOrderId, organization,
                    'work_orders',
                );
            }
            const graph =
                validateWorkOrderFlowGraphJson(
                    wo.flow_graph,
                    'work_orders.flow_graph',
                );
            const events = await workOrderClaimHistoryFor(
                view, organization, workOrderId,
            );
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
            // Phase Final Task 2: states ROW half stripped —
            // claim_expired + claimed live on the op pair body
            // (workOrderClaimHistoryFor reads them back).
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Release a work order's claim — the claim op's single-
// transaction, pair-on-every-exit shape. Unlike claim, no
// gate decision exists here: release has no 409 branch, and
// the pair appends whether or not a live claim exists (a
// wired route must never resolve a pair the transaction
// never stored), so deciding liveness at the gate would
// change nothing observable. The decision is made ONCE, at
// derive time (applyReleasePair): a live unexpired claim as
// of releaseAt derives the claim_released event; otherwise
// the pair derives zero events — the idempotent no-op. 204
// either way. The head read below is the 404 existence and
// org fence, nothing more. Release stays open to any org
// member (today's unclaim posture; the UI shows Unclaim only
// when claimed).
//
// NOTE the deliberate shape: unlike claim, release has NO
// foreign-claim 409 and NO branch that skips the append —
// the live-or-not decision is REPLAYED at derive time
// (Task 10's applyReleasePair), deterministically, from the
// same (at, id)-ordered history the gate would read. The
// gate itself only guards existence (404) and body validity
// (400). This keeps the op idempotent (a resend folds by
// message_hash) and keeps gate and derive from ever
// disagreeing. The head read stays even though lockTimeout
// is only consumed at replay: it IS the 404 existence fence.
export async function postWorkOrderReleaseOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    _actor: Id,
    organization: Id,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            validateWorkOrderReleaseBody(body);
            const wo = await workOrderDocumentHeadFor(
                view, organization, workOrderId,
            );
            if (wo === null) {
                throw await missedReadError(
                    view, workOrderId, organization,
                    'work_orders',
                );
            }
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Transition a work order along an edge. Phase Final Task 2:
// state_field_values ROW half stripped — field values ride
// the transition operation pair body only (fieldValues fold
// → derive-state-field-values two-source union). This op
// writes ATOMICALLY: the transition state event, then the
// OPTIONAL 'claim_released' event, then the pair. Gate
// re-validates each field via validateStateFieldValueEntity
// (re-homed from the store put). Authorship is stamped from
// the verified caller (actor). `pair` is optional.
export async function postWorkOrderTransitionOp(
    db: DbAdapter,
    _workOrderId: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<void> {
    validateWorkOrderTransitionBody(body);
    return db.transaction(
        // Phase Final Task 2: state_field_values ROW half
        // stripped; fieldValues live on the op pair body.
        ['requests', 'responses'],
        async (view) => {
            // Phase Final Task 2: states ROW half stripped —
            // transition + optional claim_released live on
            // the op pair body.
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
// event of its own. Phase Final Task 2: the work_orders ROW
// half is stripped — pure pair-plane write
// (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity.
// validateWorkOrderDocumentBody rejects a body carrying the
// trio at the gate. Exported so the seed can drive a work-
// order document write through the same op the route uses.
// `pair` is optional. The actor parameter is spelled `_actor`:
// no state event here to author.
export async function postWorkOrderDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<WorkOrderEntity, 'id'>> {
    const doc = validateWorkOrderDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<WorkOrderEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: work_orders ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Flow work-order join document write. Phase Final Task 2:
// the flow_work_orders ROW half is stripped — pure pair-plane
// write. WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade
// callers and type parity. `pair` is optional. The actor
// parameter is spelled `_actor`: no state event here to author.
export async function postFlowWorkOrderDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<FlowWorkOrderEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<FlowWorkOrderEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: flow_work_orders ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Flow record join document write. Phase Final Task 2: the
// flow_records ROW half is stripped — pure pair-plane write
// (postFlowWorkOrderDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity. `pair` is
// optional. The actor parameter is spelled `_actor`: no state
// event here to author.
export async function postFlowRecordDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<FlowRecordEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<FlowRecordEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: flow_records ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Flow tag document write — the codebase's FIRST pair-plane-ONLY
// write (Phase 14 Task 9): no table, no row, no dual-write. The
// pair alone carries everything (uriPrefix/uriId encode the
// address; the stored request's method distinguishes a PUT tag
// from a DELETE tombstone; supersedes/follows encode the SIMPLE-
// class chain), so this op needs neither `id` nor `body` — the
// SAME shape identity-tokens/:id's own pair-only PUT rides (Phase
// 13 Task 9). `pair` is optional so a below-facade caller with no
// pair keeps compiling; ZERO seed tags means no such caller
// exists today (Step 0), but the shape stays uniform with every
// sibling op above.
export async function postFlowTagDocumentOp(
    db: DbAdapter,
    pair?: MessagePair,
): Promise<void> {
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
        },
    );
}

// Objective baseline-score document write. Phase Final Task 2:
// the project_objective_baseline_scores ROW half is stripped —
// pure pair-plane write (postIdeaSubmissionOp shape).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes.
// Exported so the seed can drive the same write path (Decision
// 6's below-facade carve-out). `pair` is optional so a
// below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused: there is no
// state event here to author.
export async function postBaselineScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<
    ProjectObjectiveBaselineScoreEntity
> {
    const entity = withoutId(body) as unknown as
        Omit<ProjectObjectiveBaselineScoreEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Objective actual-score document write. Phase Final Task 2:
// the project_objective_actual_scores ROW half is stripped —
// pure pair-plane write, byte-twin of
// postBaselineScoreDocumentOp. WRITE_RESPONSE_SPECS forms the
// wire bytes. `_actor` is unused: no state event to author.
export async function postActualScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<ProjectObjectiveActualScoreEntity> {
    const entity = withoutId(body) as unknown as
        Omit<ProjectObjectiveActualScoreEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return { id, ...entity };
        },
    );
}

// Membership document write — Phase Final Task 2: the
// memberships ROW half is stripped — pure pair-plane write
// (postFlowTagDocumentOp shape). No states interaction
// (memberships never post events). `pair` is optional so a
// below-facade caller keeps compiling; the live route always
// supplies one. WRITE_RESPONSE_SPECS successBody forms the
// wire bytes; the reconstructed return is for type parity.
export async function postMembershipDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<MembershipEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<MembershipEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: memberships ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Member document write — Phase Final Task 2: the members
// ROW half is stripped — pure pair-plane write. No states
// interaction (genesis/archive ride PUT states/:id). `pair`
// is optional so a below-facade caller keeps compiling; the
// live route always supplies one.
export async function postMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<MemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<MemberEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: members ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// AI-member document write — Phase Final Task 2: the
// ai_members ROW half is stripped — pure pair-plane write.
// No states interaction. The composed POST edit arm at this
// route sits beside this PUT; verbs stay independent. `pair`
// is optional so a below-facade caller keeps compiling.
export async function postAiMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<AIMemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<AIMemberEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: ai_members ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Human-member document write — Phase Final Task 2: the
// human_members ROW half is stripped — pure pair-plane
// write. NO live PUT exists on human-members/:id (get/post
// only); this op serves synthesis/seed callers. No states
// interaction. `pair` is optional so a below-facade caller
// keeps compiling.
export async function postHumanMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<HumanMemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<HumanMemberEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: human_members ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Identity PII document write — Phase Final Task 2: the
// identity_pii ROW half is stripped — pure pair-plane write
// via replacePiiSlot (hard-delete zone). No states
// interaction. `pair` is optional so a below-facade caller
// keeps compiling; the live route always supplies one.
// WRITE_RESPONSE_SPECS successBody forms the wire bytes.
export async function postIdentityPiiDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityPiiEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<IdentityPiiEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: identity_pii ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await replacePiiSlot(view, pair.uriPrefix, pair);
            }
            return entity;
        },
    );
}

// Identity document write — Phase Final Task 2: the
// identities ROW half is stripped — pure pair-plane write.
// No states interaction. `pair` is optional so a below-
// facade caller keeps compiling; the live route always
// supplies one.
export async function postIdentityDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<IdentityEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: identities ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Identity credential document write — Phase Final Task 2:
// the identity_credentials ROW half is stripped — pure
// pair-plane write. No states interaction. `pair` is
// optional so a below-facade caller keeps compiling.
export async function postIdentityCredentialDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityCredentialEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<IdentityCredentialEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: identity_credentials ROW half
        // stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Client-registration document write (clients elimination) —
// pure pair-plane write, the postIdentityCredentialDocumentOp
// shape: Supersedes-chained appendMessagePair, never the pii
// hard-delete zone. `pair` is optional so a below-facade
// caller keeps compiling; the live route always supplies one.
// WRITE_RESPONSE_SPECS successBody forms the wire bytes.
export async function postClientRegistrationDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<ClientRegistrationEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<ClientRegistrationEntity, 'id'>;
    return db.transaction(
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// The registration facet's kind gate (validators at the
// gate, never downstream): the facet exists only under a
// kind-'service' identity. Absent identity -> 404; person
// -> 400. Runs before every verb on
// identities/:id/registration.
async function requireServiceIdentity(
    db: DbAdapter,
    identityId: Id,
): Promise<void> {
    const kind = await deriveIdentityKind(db, identityId);
    if (kind === undefined) {
        throw new EntityNotFoundError(
            'identities', identityId,
        );
    }
    if (kind !== 'service') {
        throw new ApiError(
            'client registration requires a'
            + " kind-'service' identity",
            HTTP_BAD_REQUEST,
        );
    }
}

// Role grant document write — Phase Final Task 2: the
// role_grants ROW half is stripped — pure pair-plane write.
// organization_id is stamped by WRITE_RESPONSE_SPECS from the
// fence (never trusted client echo). `pair` is optional so a
// below-facade caller keeps compiling.
export async function postRoleGrantDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<RoleGrantEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<RoleGrantEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: role_grants ROW half stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// Identity provider document write — Phase Final Task 2: the
// identity_providers ROW half is stripped (gate 1 DEFAULT:
// DELETE at Stage B) — pure pair-plane write. Extracted so
// below-facade fixtures form pairs derivation can see.
export async function postIdentityProviderDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    pair?: MessagePair,
): Promise<Omit<IdentityProviderEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<IdentityProviderEntity, 'id'>;
    return db.transaction(
        // Phase Final Task 2: identity_providers ROW half
        // stripped.
        ['requests', 'responses'],
        async (view) => {
            if (pair !== undefined) {
                await appendMessagePair(view, pair);
            }
            return entity;
        },
    );
}

// The pre-tx response body for each pair-wired write —
// computed through the SAME validator/stamp its own handler
// applies, so the gate's precomputed body is byte-identical to
// the pair plane's stored response (WRITE_RESPONSE_SPECS +
// responseFromStored). A pattern absent here, or present with
// no successBody, returns 204 with no body. Keyed by route
// pattern, not verb — but ONLY for the pattern's PUT or POST
// verb: a DELETE on a wired pattern never consults this map
// (the gate hardcodes 204 for every DELETE — see api/api.ts),
// so a pattern that carries both a PUT (200, its written row)
// and a DELETE (204) needs exactly one entry here, describing
// the PUT alone.
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
    'ideas/:id/conversion': { status: HTTP_NO_CONTENT },
    'ideas/:id/submissions/:sid': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdeaSubmissionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale.
    'projects/:id': documentWriteResponseSpec(PROJECTS_WIRING),
    'projects/:id/flows/:pfid': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateProjectFlowEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'flows': { status: HTTP_NO_CONTENT },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. flows/:id is the
    // FIRST locked-class entry (Task 3): the response shape is
    // unchanged either way (RESPONSE-BYTE PARITY, verified at
    // plan time) — only the gate's pre-dispatch four-outcome
    // table (api.ts) differs for a locked family, never this
    // successBody.
    'flows/:id': documentWriteResponseSpec(FLOWS_WIRING),
    'flows/:id/undo': { status: HTTP_NO_CONTENT },
    // flows/:id/versions[+/:vid] WRITE_RESPONSE_SPECS RETIRED
    // (Phase 15 Task 7): ZERO seed pairs at those addresses.
    'work-orders': { status: HTTP_NO_CONTENT },
    'work-orders/:id':
        documentWriteResponseSpec(WORK_ORDERS_WIRING),
    'work-orders/:id/claim': { status: HTTP_NO_CONTENT },
    'work-orders/:id/release': { status: HTTP_NO_CONTENT },
    'work-orders/:id/transition': { status: HTTP_NO_CONTENT },
    'flows/:id/work-orders/:woid': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowWorkOrderEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'records': { status: HTTP_NO_CONTENT },
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
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateFlowRecordEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // The ONE validation site for a tag PUT (Phase 14 Task 9):
    // the tag NAME (param 1, the address's own uriId) through
    // validateFlowTagName, the body through validateFlowTagEntity
    // — both pure, run pre-tx while the pair is formed, so a
    // malformed name or body throws BEFORE anything is stored
    // (the ideas/:id/submissions/:sid precedent above). GET/DELETE
    // never re-validate the name (route comment); `flow_id` is
    // stamped from the address here, never a client body key.
    'flows/:id/tags/:name': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: validateFlowTagName(param(params, 1)),
            flow_id: param(params, 0),
            ...validateFlowTagEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'objectives': { status: HTTP_NO_CONTENT },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. objectives/:id emits
    // the SAME bytes as before ({id, organization_id, position}):
    // validateObjectiveDocumentBody's entity/organization_id
    // separation guarantees doc.entity never carries the key,
    // byte-identical to today's hand-built body.
    'objectives/:id': documentWriteResponseSpec(OBJECTIVES_WIRING),
    'objectives/:id/revisions/:rid': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateObjectiveRevisionEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-baseline-scores/:sid': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateBaselineScoreEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'projects/:id/objective-actual-scores/:sid': {
        status: HTTP_OK,
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
    'ai-members': { status: HTTP_NO_CONTENT },
    // Per-verb: PUT rides the generic document-form builder (see
    // the ideas/:id entry above for the shared rationale) — the
    // SAME registration-first consult that keeps members/:id
    // byte-unchanged applies here too (ai-members is also
    // organizationNested:false), so the emitted bytes stay
    // UNCHANGED from the hand-written body this replaces. POST
    // is the composed edit (204, no body), untouched this task.
    'ai-members/:id': {
        put: documentWriteResponseSpec(AI_MEMBERS_WIRING),
        post: { status: HTTP_NO_CONTENT },
    },
    'human-members': { status: HTTP_NO_CONTENT },
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
        post: { status: HTTP_NO_CONTENT },
    },
    'identities': { status: HTTP_NO_CONTENT },
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
        status: HTTP_OK,
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
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdentityCredentialEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    'identities/:id/registration': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateClientRegistrationEntity(
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
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityTokenEntity(withoutId(body ?? {})),
        }),
    },
    'identity-token-revocations/:id': {
        status: HTTP_OK,
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
        status: HTTP_OK,
        successBody: () => ({
            jti: generateCryptoSafeBase62(),
        }),
    },
    'identity-tokens/:jti/revocation': { status: HTTP_NO_CONTENT },
    'organizations/:id': {
        status: HTTP_OK,
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
        status: HTTP_OK,
        successBody: (params, body, _actor, organization) => ({
            id: param(params, 0),
            ...validateRoleGrantEntity({
                ...withoutId(body ?? {}),
                organization_id: organization,
            }),
        }),
    },
    'identity-providers/:id': {
        status: HTTP_OK,
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateIdentityProviderEntity(
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
    // Anchors chain 'follows' to a CALLER-SUPPLIED pair id
    // instead of a fresh headPairIdAt read — REQUIRED whenever
    // the caller already read the address' head as part of
    // computing the pair's own BODY (undo-as-replay's
    // resolveFlowUndoTarget, api/derive-flows.ts, Phase 14 Task
    // 8 fix wave): letting this function's OWN independent
    // headPairIdAt read decide `follows` AFTER the body was
    // already diffed against an earlier read opens a window —
    // a save landing BETWEEN the two reads moves the real head,
    // so the undo write would anchor to that FRESH head (no
    // collision, 204) while its own diff still reflects the
    // STALE snapshot, silently discarding the concurrent save
    // instead of colliding on the responses.follows unique
    // index and 412ing. Ignored unless chain === 'follows'.
    readonly follows?: Id;
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
        : chain === 'follows' && input.follows !== undefined
            ? input.follows
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
                const memberBody = memberDocumentBodyOf('ai', {
                    state: b.initialState,
                    stateAt: b.initialStateAt,
                    stateEventId: b.initialStateEventId,
                });
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
                // Bound (not discarded): detail shape plus the
                // echoed lifecycle trio, threaded into the
                // synthesized members/:id document body.
                const e = validateAIMemberEditBody(body);
                const memberBody = memberDocumentBodyOf('ai', {
                    state: e.state,
                    stateAt: e.stateAt,
                    stateEventId: e.stateEventId,
                });
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
                const memberBody = memberDocumentBodyOf('human', {
                    state: b.initialState,
                    stateAt: b.initialStateAt,
                    stateEventId: b.initialStateEventId,
                });
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
                // Bound (not discarded): detail shape plus the
                // echoed lifecycle trio, threaded into the
                // synthesized members/:id document body.
                const e = validateHumanMemberEditBody(body);
                const memberBody = memberDocumentBodyOf(
                    'human', {
                        state: e.state,
                        stateAt: e.stateAt,
                        stateEventId: e.stateEventId,
                    },
                );
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
        delete: (db, _p, _actor, pair) => {
            // Phase Final Task 2: identity_pii ROW half
            // stripped — pair-plane replacePiiSlot only.
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
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
                throw new ForeignOrganizationError(
                    'identity_credentials', identityId,
                );
            }
            return rows.map(withoutSecret);
        },
    }),
    // GET is FLIPPED (Phase 10 Task 8): derived via
    // deriveCredential, fenced the SAME way (gate 15) — a
    // foreign identity's credential 403s; a genuinely absent
    // one still 404s via EntityNotFoundError. FENCE-INPUT FIX
    // (post-session review): the path :id only ADDRESSES the
    // scan (deriveCredential reads the row at
    // /identities/{path id}/credentials/{cid} — that is where
    // the pair lives); the pre-flip fence read the ROW's OWN
    // identity_id field — the hand-written route this flip
    // replaced ignored the path entirely, fetching by cid
    // alone via parentScope.getById, which then fenced via
    // viaMembership on the ROW's stored identity_id. So the
    // fence input below is `credential.identity_id`, never the
    // path — a below-facade write whose body.identity_id
    // disagrees with its own address now fences EXACTLY as the
    // row plane did.
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
                throw new ForeignOrganizationError(
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
    // The client-registration facet (clients elimination):
    // client = kind-'service' identity + this single-slot
    // PUT-overwrite document. Hand-written closure — the
    // pii/credentials precedent; documentGet/PutHandler only
    // serve 2-segment family/:id patterns. ADMIN-ONLY via
    // deny-by-default (/identities has no MEMBER_VERBS
    // entry); GLOBAL plane (no org nesting, no
    // write-ownership fence). DELETE is a marked tombstone =
    // deregistration; the gate forms the 204 pair, the
    // handler appends it — idempotent by construction.
    route('identities/:id/registration', {
        get: async (db, p) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return deriveClientRegistration(db, identityId);
        },
        put: async (db, p, body, actor, pair) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return postClientRegistrationDocumentOp(
                db, identityId, body, actor, pair,
            );
        },
        delete: async (db, p, _actor, pair) => {
            await requireServiceIdentity(db, param(p, 0));
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
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
        put: (db, _p, body, _actor, pair) => {
            // Phase Final Task 2: identity_token_revocations
            // ROW half stripped — pure pair-plane write.
            // WRITE_RESPONSE_SPECS successBody forms the wire.
            const entity = withoutId(body) as unknown as
                Omit<IdentityTokenRevocationEntity, 'id'>;
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return entity;
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
    // above is — a foreign-org grant 403s
    // (ForeignOrganizationError); a genuinely absent one 404s
    // via deriveRoleGrant's EntityNotFoundError.
    route('role-grants/:id', {
        get: async (db, p, _actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const id = param(p, 0);
            const grant = await deriveRoleGrant(db, id);
            if (grant.organization_id !== organizationId) {
                throw new ForeignOrganizationError(
                    'role_grants', id,
                );
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
            // Phase Final Task 2: idea + project + baseline ROW
            // halves stripped; only states events + pairs remain
            // (states row half strips with the states-trace
            // group).
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
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
        // its relation tables. HAND-WRITTEN again as of Phase 14
        // Task 8 (undo-as-replay) — calls deriveFlows directly
        // rather than riding the generic documentCollectionRoute:
        // FlowWithGraph now carries `hasUndoHistory`
        // (api/types.ts), a field derive-flows.ts's flowEntityOf
        // computes from the SAME per-flow pair count deriveFlows
        // already gathers for its own lifecycle walk —
        // DocumentFamilyWiring's `entityOf` slot is fixed at
        // (document, organization) for every OTHER family
        // (ideas/projects/work-orders/records), so widening it
        // to carry a flows-only field would ripple into every
        // one of them for no benefit. POST stays this
        // hand-written create — unlike ideas/projects, flows never
        // folded genesis into the document PUT (Decision 6), so a
        // separate create verb remains here.
        get: (db, _p, _actor, organization) =>
            deriveFlows(db, requireOrganization(organization)),
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
    // flows/:id is the FIRST locked-class route (Task 3). GET was
    // FLIPPED (Phase 4 Task 8) onto the generic documentEntityRoute,
    // then partially UN-flipped here (Phase 14 Task 8,
    // undo-as-replay): GET is hand-written again, calling
    // deriveFlow directly, because FlowWithGraph now carries
    // `hasUndoHistory` (api/types.ts) — a field computed from this
    // flow's own document-pair count, which deriveFlow already
    // gathers for its lifecycle walk but the GENERIC entityOf
    // contract `(document, organization) => unknown`
    // (document-family.ts, shared by ideas/projects/work-orders/
    // records) has no slot for. Widening that shared interface
    // for one flows-only field would ripple into every other
    // family's entityOf for no benefit — a hand-written GET,
    // reusing the SAME deriveFlow this module already exported
    // for exactly this purpose ("Task 8 wires the route",
    // derive-flows.ts's own comment), is the smaller, contained
    // change. PUT stays fully generic (documentPutHandler) —
    // unaffected, since the write side never touched entityOf.
    // The gate's four-outcome table (api.ts, keyed off
    // familyRegistration('flows').concurrency === 'locked')
    // resolves genesis/412/follows entirely BEFORE dispatch;
    // documentPutHandler carries no concurrency branch of its
    // own — it dispatches straight to postFlowDocumentOp.
    // Phase Final Task 2: flows + graph ROW halves stripped;
    // graphDelta/revivals ride the pair body (SIDECAR-KEEP).
    // Member-tier PUT — MEMBER_VERBS['/flows'] includes 'PUT'.
    {
        segments: ['flows', ':id'],
        get: (db, p, _actor, organization) =>
            deriveFlow(
                db, requireOrganization(organization),
                param(p, 0),
            ),
        put: documentPutHandler(FLOWS_WIRING),
    },
    // GET flows/:id/history (states-URI elimination A3):
    // deriveFlowStateHistory ASC → DESC; empty →
    // missedReadError('flows'). Segment count 3 vs 2 so no
    // collision with flows/:id. Member-tier GET via
    // matchesOnSegmentBoundary on '/flows'.
    route('flows/:id/history', {
        get: documentStateHistoryHandler(
            deriveFlowStateHistory, 'flows',
        ),
    }),
    // Undo-as-replay (Phase 14 Task 8). Phase Final Task 2:
    // flows + graph ROW halves stripped; restore writes the
    // 'updated' state event, revival states events, and the
    // operation + document pairs. graphDelta/revivals are
    // server-computed into the document pair body
    // (SIDECAR-KEEP → deriveFlowGraphStates). No flow_versions
    // row is read or written. Exhaustion appends only the
    // operation pair. FOLLOWS collision → 412 via the
    // responses.follows unique index.
    route('flows/:id/undo', {
        post: async (
            db, p, body, actor, pair, organization,
        ) => {
            const id = param(p, 0);
            const b = validateFlowUndoBody(body);
            if (pair === undefined || organization === undefined) {
                // Never live for flows (member-tier POST, always
                // pair-wired) — kept so this handler's control
                // flow matches every other wired route's
                // defensive shape (TypeScript cannot prove
                // bearerExempt was false at this depth).
                return undefined;
            }
            const resolution = await resolveFlowUndoTarget(
                db, organization, id, pair.uriPrefix,
            );
            if (resolution === undefined) {
                throw await missedReadError(
                    db, id, organization, 'flows',
                );
            }
            return postFlowUndoOp(
                db, id, actor, organization, pair, resolution, b,
            );
        },
    }),
    // flows/:id/versions[+/:vid] RETIRED (Phase 15 Task 7):
    // zero live product callers; FlowVersion TYPE lives in
    // flow-history.ts; flow_versions TABLE stays (storage
    // DELETE NOTHING). ZERO seed pairs — specs deleted fully.
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
        // Phase Final Task 2: project_flows ROW half stripped —
        // pure pair-plane write (join derives from the ledger).
        put: (db, p, body, _actor, pair) => {
            const pfid = param(p, 1);
            const entity = withoutId(body) as unknown as
                Omit<ProjectFlowEntity, 'id'>;
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return { id: pfid, ...entity };
                },
            );
        },
        delete: (db, _p, _actor, pair) => {
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
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
    // GET work-orders/history (states-URI elimination A2):
    // org-scoped bulk lifecycle + field_values fold, (at, id)
    // DESC. Always 200 array. MUST register BEFORE
    // work-orders/:id so matchRoute's first-match does not
    // capture the literal segment as `:id`. Member-tier GET
    // via matchesOnSegmentBoundary on '/work-orders'.
    route('work-orders/history', {
        get: (db, _p, _actor, organization) =>
            deriveWorkOrderHistories(
                db, requireOrganization(organization),
            ),
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
        post: (db, p, body, actor, pair, organization) =>
            postWorkOrderClaimOp(
                db, param(p, 0), body, actor,
                requireOrganization(organization), pair,
            ),
    }),
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS. See postWorkOrderReleaseOp for the
    // transaction shape.
    route('work-orders/:id/release', {
        post: (db, p, body, actor, pair, organization) =>
            postWorkOrderReleaseOp(
                db, param(p, 0), body, actor,
                requireOrganization(organization), pair,
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
    // GET work-orders/:id/history (states-URI elimination A1):
    // lifecycle + inline field_values fold, (at, id) DESC.
    // Miss posture lives inside workOrderHistoryFor (empty →
    // missedReadError). No api.ts pre-dispatch guard — the
    // derive reads only this org's uri_prefix addresses.
    // Member-tier GET via matchesOnSegmentBoundary on
    // '/work-orders'.
    route('work-orders/:id/history', {
        get: (db, p, _actor, organization) =>
            workOrderHistoryFor(
                db,
                requireOrganization(organization),
                param(p, 0),
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
    // GET states/:id/field-values RETIRED (states-URI
    // elimination C4): field values fold inline on
    // GET work-orders/:id/history (and bulk history).
    // PUT/DELETE states/:id/field-values/:fvid RETIRED
    // (Phase 15 Task 7): live writes ride the transition
    // fold only. WRITE_RESPONSE_SPECS entry + seed address
    // formation SURVIVE (finding 7).
    // GET records is FLIPPED (Task 7): the collection derives
    // from the message ledger rather than the old records
    // table. Rides the generic documentCollectionGetHandler
    // — wire-identical to the hand-written db.records.getAll()
    // dispatch it replaces (RECORDS_WIRING's own entityOf,
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
                                status: HTTP_NO_CONTENT,
                                body: undefined,
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
            return postRecordWriteOp(
                db, body, actor, pairs, organization,
            );
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
        // Phase Final Task 2: records ROW half stripped —
        // DELETE is a pure pair-plane tombstone append.
        delete: (db, _p, _actor, pair) => {
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // GET records/:id/history (states-URI elimination A3):
    // deriveRecordStateHistory ASC → DESC; empty →
    // missedReadError('records'). Member-tier GET via
    // matchesOnSegmentBoundary on '/records'.
    route('records/:id/history', {
        get: documentStateHistoryHandler(
            deriveRecordStateHistory, 'records',
        ),
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
        delete: async (db, p, _actor, pair) => {
            const id = param(p, 0);
            // Phase Final Stage B: organization_id from the
            // attribute's STORED document-pair response body
            // only — record_attributes table retired. RESTRICT
            // 409 bytes stay; the pair is the only delete
            // side-effect.
            if (pair === undefined) {
                throw new Error(
                    'record-attribute DELETE without pair',
                );
            }
            const pairOrganizationId =
                await recordAttributeOrganizationFromPairs(
                    db, pair.uriPrefix, id,
                );
            if (pairOrganizationId === null) {
                throw new EntityNotFoundError(
                    'record_attributes', id,
                );
            }
            return db.transaction(
                [...new Set([
                    ...ATTRIBUTE_RESTRICT_TABLES,
                    'requests', 'responses',
                ])],
                async (view) => {
                    await deleteRecordAttributeSafe(
                        view,
                        pairOrganizationId,
                        id,
                    );
                    await appendMessagePair(view, pair);
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
    // own precedent above. flows/:id/versions table-backed
    // nested read RETIRED Phase 15 Task 7 (zero callers).
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
        // Phase Final Task 2: flow_records ROW half stripped —
        // DELETE is a pure pair-plane tombstone append.
        delete: (db, _p, _actor, pair) => {
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                },
            );
        },
    }),
    // Flow tags: the codebase's FIRST pair-plane-ONLY document
    // family (Phase 14 Task 9, election #2's companion) — no
    // backing table, no dual-write, derived entirely from message
    // pairs. Bespoke route() wiring reusing deriveDocumentsAt/
    // documentPairsAt exactly like the identities/:id/pii analog
    // (gate 8), SIMPLE class (a repeat PUT records Supersedes —
    // 'flows/:id/tags/:name' is registered in message-pair.ts's
    // DOCUMENT_CLASS_ROUTE_PATTERNS below): the locked class flows
    // itself rides is structurally MOOT here — api.ts's isLockedWrite
    // exact-matches routePattern === family + '/:id' ('flows/:id'),
    // and this pattern is 4 segments, so it never rides that arm
    // no matter what family-registry.ts declares for 'flows'. The
    // tag NAME (param 1) is the address's own uriId — the FIRST
    // user-authored address segment in this codebase
    // (validateFlowTagName, api/validators.ts), validated ONLY at
    // the write gate below (WRITE_RESPONSE_SPECS), never re-checked
    // on GET/DELETE — mirroring how every sibling family's :id
    // param is unchecked on read (an address that never validly
    // wrote can never be found either way). DELETE is MARKED, not
    // physical: postFlowTagDocumentOp appends a DELETE pair at the
    // SAME address, and deriveFlowTag's own deriveDocumentsAt call
    // already excludes a DELETE head, exactly like every other
    // document family. PUT and DELETE share ONE op
    // (postFlowTagDocumentOp) since NEITHER needs `id` or `body` —
    // the pair alone (formed by the gate from the matched route)
    // carries the address and the method; a hand-written DELETE
    // closure calling the SAME op keeps the PUT-only op's own name
    // honest (it writes a tag document, never a tombstone) while
    // avoiding a second, byte-identical transaction body.
    // Member-tier — '/flows/:id/tags' carries GET/PUT/DELETE in
    // MEMBER_VERBS (api/authorization.ts), mirroring
    // '/flows/:id/records'.
    route('flows/:id/tags/:name', {
        get: (db, p, _actor, organization) =>
            deriveFlowTag(
                db, requireOrganization(organization),
                param(p, 0), param(p, 1),
            ),
        put: (db, _p, _body, _actor, pair) =>
            postFlowTagDocumentOp(db, pair),
        delete: (db, _p, _actor, pair) =>
            postFlowTagDocumentOp(db, pair),
    }),

    // Hand-written in place of makeIdRoute<OrganizationEntity>
    // so PUT can append its message pair — the factory's fixed
    // closures have no per-family pair selector (see
    // message-pair.ts). GET reproduces the factory closure
    // byte-equivalently; verbs stay {get, put}. organizations
    // is DOCUMENT-class: a repeat PUT records Supersedes.
    // GLOBAL plane — no organization_id stamp (this table IS
    // the tenant root). GET dispatches to deriveOrganization
    // (api/derive-organizations.ts). A bespoke call, not the
    // generic documentGetHandler(wiring): that machinery
    // requires a wiring row's documentOp, and organizations has
    // none. Phase Final Task 2: the organizations ROW half is
    // stripped — pure pair-plane write (postFlowTagDocumentOp
    // shape). WRITE_RESPONSE_SPECS successBody forms the wire
    // bytes (and validates via validateOrganizationEntity).
    route('organizations/:id', {
        get: (db, p) => deriveOrganization(db, param(p, 0)),
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 0);
            const entity = withoutId(body) as unknown as
                Omit<OrganizationEntity, 'id'>;
            return db.transaction(
                // Phase Final Task 2: organizations ROW half
                // stripped.
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return { id, ...entity };
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
        // Phase Final Task 2: memberships ROW half stripped —
        // DELETE is a pure pair-plane tombstone append.
        delete: (db, _p, _actor, pair) => {
            return db.transaction(
                ['requests', 'responses'],
                async (view) => {
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
    // PUT already rides; memberDocumentEntityOf stamps entity
    // fields plus the lifecycle-current trio (A10). PUT rides
    // the generic documentPutHandler(MEMBERS_WIRING) (prior
    // commit). Verbs stay {get, put} — members/:id has no
    // DELETE today, mirroring the identities/:id precedent.
    // Global plane: no organization stamping (the members
    // directory row carries no organization_id) — see
    // documentWriteResponseSpec's own registration-first consult
    // (document-family.ts).
    route('members/:id', {
        get: documentGetHandler(MEMBERS_WIRING),
        put: documentPutHandler(MEMBERS_WIRING),
    }),
    // GET members/:id/history (states-URI elimination A4):
    // deriveMemberStates filtered to entity_id; empty →
    // EntityNotFoundError('members', id) — global-family
    // posture (organizationNested: false), not
    // missedReadError. Wire StateEntity (at, id) DESC.
    // Member-tier GET via matchesOnSegmentBoundary on
    // '/members'.
    route('members/:id/history', {
        get: async (db, params) => {
            const id = param(params, 0);
            const history = (await deriveMemberStates(db))
                .filter((e) => e.entity_id === id)
                .sort((a, b) =>
                    a.at < b.at ? -1
                        : a.at > b.at ? 1
                            : a.id < b.id ? -1
                                : a.id > b.id ? 1
                                    : 0);
            if (history.length === 0) {
                throw new EntityNotFoundError(
                    'members', id,
                );
            }
            return history.toReversed();
        },
    }),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — GET dispatches to the derived
    // entity, PUT to postIdeaDocumentOp, wire-identical to the
    // hand-written {get, put} pair it replaces. The Decision-7/
    // MEMBER_ID-CAVEAT prose that lived here moved to the
    // IDEAS_WIRING block above.
    documentEntityRoute(IDEAS_WIRING),
    // GET ideas/:id/history (states-URI elimination A3):
    // deriveIdeaStateHistory ASC → DESC; empty →
    // missedReadError('ideas'). Member-tier GET via
    // matchesOnSegmentBoundary on '/ideas'.
    route('ideas/:id/history', {
        get: documentStateHistoryHandler(
            deriveIdeaStateHistory, 'ideas',
        ),
    }),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — see the ideas/:id entry above for
    // the shared rationale; the Decision-7/MEMBER_ID-CAVEAT
    // prose moved to the PROJECTS_WIRING block above.
    documentEntityRoute(PROJECTS_WIRING),
    // GET projects/:id/history (states-URI elimination A3):
    // deriveProjectStateHistory ASC → DESC; empty →
    // missedReadError('projects'). Member-tier GET via
    // matchesOnSegmentBoundary on '/projects'.
    route('projects/:id/history', {
        get: documentStateHistoryHandler(
            deriveProjectStateHistory, 'projects',
        ),
    }),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger rather than the old objectives table. Rides
    // the generic documentCollectionGetHandler —
    // objectiveDocumentEntityOf stamps entity fields plus the
    // lifecycle-current trio (A9). POST stays this hand-written
    // bundle — objectives' own create forms the document PLUS
    // its first revision pair in one pass
    // (postObjectiveCreationOp), mirroring records'/work-
    // orders' own precedent.
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
    // GET objectives/history (states-URI elimination A5):
    // org-scoped bulk lifecycle StateEntity rows, (at, id)
    // DESC. Always 200 array. MUST register BEFORE
    // objectives/:id so matchRoute's first-match does not
    // capture the literal segment as `:id`. Member-tier GET
    // via matchesOnSegmentBoundary on '/objectives'.
    route('objectives/history', {
        get: (db, _p, _actor, organization) =>
            deriveObjectiveHistories(
                db, requireOrganization(organization),
            ),
    }),
    // objectives/:id is the seventh family. GET is FLIPPED
    // (Task 7): absorbed into the generic documentEntityRoute —
    // GET dispatches to documentGetHandler(OBJECTIVES_WIRING);
    // objectiveDocumentEntityOf stamps entity fields plus the
    // lifecycle-current trio (A9). PUT stays
    // documentPutHandler(OBJECTIVES_WIRING), unchanged from
    // before this flip (Task 2); objectives/:id has no DELETE
    // today, mirroring the ideas/projects/work-orders
    // precedent that already rides this same
    // documentEntityRoute shape.
    documentEntityRoute(OBJECTIVES_WIRING),
    // GET objectives/:id/history (states-URI elimination A3):
    // deriveObjectiveStateHistory ASC → DESC; empty →
    // missedReadError('objectives'). Member-tier GET via
    // matchesOnSegmentBoundary on '/objectives'.
    route('objectives/:id/history', {
        get: documentStateHistoryHandler(
            deriveObjectiveStateHistory, 'objectives',
        ),
    }),
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
    // Hand-written so PUT can append its message pair in the
    // same transaction (see message-pair.ts). Phase Final
    // Task 2: objective_revisions ROW half stripped — pure
    // pair-plane write. WRITE_RESPONSE_SPECS successBody forms
    // the wire bytes; the reconstructed return is for type
    // parity with the former store put.
    route('objectives/:id/revisions/:rid', {
        put: (db, p, body, _actor, pair) => {
            const id = param(p, 1);
            const entity = withoutId(body) as unknown as
                Omit<ObjectiveRevisionEntity, 'id'>;
            return db.transaction(
                // Phase Final Task 2: objective_revisions ROW
                // half stripped.
                ['requests', 'responses'],
                async (view) => {
                    if (pair !== undefined) {
                        await appendMessagePair(view, pair);
                    }
                    return { id, ...entity };
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
    // GET /states RETIRED (states-URI elimination C3): the
    // bulk five-source union is gone. Per-entity history lives
    // on GET <family>/:id/history; work-order and objective
    // bulk history live on GET work-orders/history and
    // GET objectives/history. GET /states/:id/field-values
    // retired with C4 (inline fold on WO history). bare
    // states/:id is already a router 404 (states-address
    // retirement Task 13). entity-states history retired
    // with C2.

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
