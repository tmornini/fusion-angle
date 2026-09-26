import {
    EntityNotFoundError,
    ForeignOrganizationError,
    RetiredEntityError,
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
    AIAgentEntity,
    FlowEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    HumanMemberEntity,
    IdentityEntityFields,
    IdentityKind,
    IdentityPiiEntity,
    IdentityCredentialEntity,
    ClientRegistrationEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    StateEntity,
    ObjectiveEntity,
    ProjectEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
    RecordEntity,
    RecordAttributeEntity,
    MembershipEntity,
    IdentityProviderEntity,
    WorkOrderEntity,
    WorkOrderFlowGraph,
    MemberEntity,
    AttributeType,
    Constraint,
} from '../shared/types.ts';
import {
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    ValidationError,
} from '../shared/types.ts';
import { hashPassword } from
    '../shared/password-hash.ts';
import {
    validateAiAgentDocumentBody,
    assertFlowGraphWriteLaw,
    validateFlowCreateBody,
    validateFlowDocumentBody,
    validateFlowWorkOrderEntity,
    validateFlowUndoBody,
    validateIdeaConversionBody,
    validateIdeaDocumentBody,
    validateIdentityCreateBody,
    validateIdentityDocumentBody,
    validateIdentityCredentialEntity,
    validateSeatDocumentBody,
    validateObjectiveCreateBody,
    validateObjectiveDocumentBody,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateProjectDocumentBody,
    validateProjectFlowEntity,
    validateFlowTagName,
    validateRecordAttributeDocumentBody,
    validateAttributeDocument,
    validateInstancePutBody,
    validateInstancePatchBody,
    validateRecordDocumentBody,
    validateRecordWriteBody,
    validateWorkOrderBindingBody,
    validateWorkOrderClaimBody,
    validateWorkOrderCreateBody,
    validateWorkOrderDocumentBody,
    validateWorkOrderTransitionBody,
    validateDefaultOrganizationBody,
    pickString,
    pickStringArray,
    pickBoolean,
    pickNumber,
} from './validators.ts';
import {
    asWorkOrderFlowGraph,
    asStoredGraph,
} from '../shared/flow-graph-body.ts';
import { asObject } from '../shared/json-assert.ts';
import {
    attemptFor,
    runWrite,
    runStateWrite,
    canonicalPath,
    documentHeadAt,
    formWriteMessagePair,
    messagePairResponseBody,
    ifMatchFromMessagePair,
    rawIfMatchFromMessagePair,
    parseIfMatch,
    IF_MATCH_HEADER,
    strongEtagOf,
} from './message-pair.ts';
import type {
    MessagePair, ReceivedRequest, StateProjection,
} from './message-pair.ts';
import { messageStore } from './message-store.ts';
import type { FieldLine } from '../shared/http-message/types.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';
import {
    latestClaimEvent,
    isClaimEventExpired,
    isClaimState,
    isExpiresAtPassed,
    addUtcSeconds,
} from '../shared/work-order-claims.ts';
import {
    collectAttributeReferrers,
    hasReferrers,
    describeReferrers,
    deleteRecordAttributeSafe,
} from './record-attribute-refs.ts';
import {
    collectRecordTypeReferrers,
    hasTypeReferrers,
    describeTypeReferrers,
} from './record-type-refs.ts';
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
    HTTP_PRECONDITION_FAILED,
    HTTP_PRECONDITION_REQUIRED,
} from '../shared/http-errors.ts';
import {
    reduceCreateGraphDelta,
} from './flow-graph-relations.ts';
import {
    storedGraph,
} from '../shared/types.ts';
import {
    deriveIdeaSubmissions,
    ideaEntityOf,
    ideaSubmissionEntityOf,
} from './derive-ideas.ts';
import {
    projectEntityOf,
} from './derive-projects.ts';
import {
    deriveRecordTypeCollection,
    deriveRecordTypeEntity,
    recordTypeEntityOf,
    recordTypesUriPrefix,
    requireRecordTypeExists,
} from './derive-record-types.ts';
import {
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    RECORD_TYPE_VERSIONS_PATTERN,
    RECORD_TYPE_VERSION_PATTERN,
    ATTRIBUTES_COLLECTION_PATTERN,
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCES_COLLECTION_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    INSTANCE_VERSIONS_PATTERN,
    INSTANCE_VERSION_PATTERN,
    ORGANIZATION_MEMBERS_COLLECTION_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    ORGANIZATION_FORMER_MEMBERS_COLLECTION_PATTERN,
} from './family-registry.ts';
import {
    deriveDocumentsAt,
    byIdAscending,
    requestBodyOf,
} from './derive-documents.ts';
import {
    instancesUriPrefix,
    deriveInstanceHead,
    deriveInstanceCollection,
    deriveInstanceRevisions,
    mergeInstanceValues,
    revisionValuesOf,
    type InstanceValue,
} from './derive-record-instances.ts';
import {
    assertWritableAttributeIds,
    projectReadableValues,
} from './attribute-acl.ts';
import {
    validateInstanceValues,
    type AttributeSchemaRow,
} from '../shared/record-constraints.ts';
import {
    flowEntityOf,
    deriveFlow,
    deriveFlows,
    resolveFlowUndoTarget,
    type FlowUndoResolution,
} from './derive-flows.ts';
import {
    buildFlowGraphDelta,
    buildFlowGraphRevivals,
} from './flow-graph-diff.ts';
import {
    deriveProjectFlows,
    projectFlowEntityOf,
} from './derive-project-flows.ts';
import {
    deriveFlowWorkOrders,
    flowWorkOrderEntityOf,
} from './derive-flow-work-orders.ts';
import {
    deriveFlowRecords,
    deriveFlowRecord,
    flowRecordEntityOf,
    recordTypeIdsForWorkOrder,
} from './derive-flow-records.ts';
import {
    deriveFlowTag,
    flowTagEntityOf,
} from './derive-flow-tags.ts';
import {
    deriveObjectiveRevisions,
    objectiveRevisionEntityOf,
} from './derive-objective-revisions.ts';
import {
    deriveBaselineScores,
    deriveActualScores,
    scoreEntityOf,
} from './derive-project-scores.ts';
import {
    deriveOrganizationMemberSeats,
    deriveOrganizationMemberSeat,
    deriveOrganizationFormerSeats,
    seatsPrefixFor,
    seatEntityOf,
} from './derive-memberships.ts';
import {
    deriveIdentityPii,
    deriveCredentialsFor,
    deriveCredential,
    deriveClientRegistration,
    deriveIdentityKind,
    deriveIdentityProvidersFor,
    deriveIdentityProvider,
    deriveTokenRevocation,
    piiEntityOf,
    registrationEntityOf,
    identityProviderEntityOf,
    tokenRevocationEntityOf,
} from './derive-identity-spine.ts';
import {
    workOrderBindingFor,
    workOrderClaimDocumentFor,
    workOrderClaimHistoryFor,
    workOrderDocumentHeadFor,
    workOrderHistoryFor,
    workOrderLifecycleStatesFor,
} from './derive-states.ts';
import {
    deriveOrganization,
    deriveOrganizations,
    organizationEntityOf,
} from './derive-organizations.ts';
import {
    deriveIdentityTokensFor,
    deriveIdentityToken,
    identityTokenEntityOf,
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
    documentVersionListRoute,
    documentVersionRoute,
    storedRevisionDocument,
    versionSnapshotsAt,
    lookupStoredRevision,
    documentWriteResponseSpec,
    registerDocumentFamilyWiring,
    liveGlobalDocumentIds,
    type DocumentFamilyWiring,
} from './document-family.ts';
import {
    getIdentityDefaultOrganization,
    getIdentityOrganizations,
    putIdentityDefaultOrganization,
} from './organization-requests.ts';
import {
    getOrganizationInvitations,
    postOrganizationInvitationGrant,
    getInvitationOnOrganizationNest,
    putInvitationOnOrganizationNest,
    getInvitationVersionsOnOrganizationNest,
    getInvitationVersionOnOrganizationNest,
    getIdentityInvitations,
    getInvitationOnIdentityNest,
    putInvitationOnIdentityNest,
    getInvitationVersionsOnIdentityNest,
    getInvitationVersionOnIdentityNest,
} from './invitations-domain.ts';
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
// FULL document — the entity's own fields plus state —
// validated once at the gate (documentWriteResponseSpec, via
// validateDocument). Phase Final Task 2: the ideas ROW half is
// stripped; the pair + states.postEvent land in ONE transaction
// (states ROW half stripped (message plane only)). Genesis
// is head-presence-defined — a fresh id's PUT simply finds no
// head, so it authors like any other transition.
const IDEAS_WIRING: DocumentFamilyWiring = {
    family: 'ideas',
    httpNest: 'organization',
    lifecycle: 'state',
    notFoundTable: 'ideas',
    validateDocument: validateIdeaDocumentBody,
    documentOp: postIdeaDocumentOp,
    entityOf: ideaEntityOf,
};
const PROJECTS_WIRING: DocumentFamilyWiring = {
    family: 'projects',
    httpNest: 'organization',
    lifecycle: 'state',
    notFoundTable: 'projects',
    validateDocument: validateProjectDocumentBody,
    documentOp: postProjectDocumentOp,
    entityOf: projectEntityOf,
};
// The flows wiring row. entityOf is derive-flows.ts's OWN
// flowEntityOf. G2 stored PUT is flowStoredEntityOf (that
// mapper minus hasUndoHistory). Live GET stays on
// deriveFlow/deriveFlows so a state-'deleted' head 404s
// (stored PUT has no trio) and hasUndoHistory is stamped
// from pair count. This slot stays the 2-arg assignability
// shim (pairCount omitted). flowEntityOf's third param is
// pairCount (number), not StateEntity.
const FLOWS_WIRING: DocumentFamilyWiring = {
    family: 'flows',
    httpNest: 'organization',
    lifecycle: 'state',
    notFoundTable: 'flows',
    validateDocument: validateFlowDocumentBody,
    documentOp: postFlowDocumentOp,
    entityOf: (document, organization) =>
        flowEntityOf(document, organization),
};
// The work-orders wiring row — the fourth family, and the
// FIRST 'stateless' one (Decision 7's state-in-entity design
// does not apply to a work-order document; see
// postWorkOrderDocumentOp's own comment for why). Both PUT
// (Task 2/3) and GET (Task 7)
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
): object {
    return {
        id: document.name,
        organization_id: organization,
        ...document.body,
    };
}
const WORK_ORDERS_WIRING: DocumentFamilyWiring = {
    family: 'work-orders',
    httpNest: 'organization',
    lifecycle: 'stateless',
    notFoundTable: 'work_orders',
    validateDocument: validateWorkOrderDocumentBody,
    documentOp: postWorkOrderDocumentOp,
    entityOf: workOrderDocumentEntityOf,
};
// Objectives wiring follows; record-types and nested
// attributes use inline handlers (Task 23 retired flat
// RECORDS_WIRING / RECORD_ATTRIBUTES_WIRING).
//
// The generic GET machinery (documentGetHandler/
// documentCollectionGetHandler) this entityOf serves
// flips onto objectives: GET objectives/:id and GET
// objectives ride it. The wire row is constructed ID
// FIRST — {id, organization_id, position} — the SAME
// seven-sibling convention every shipped entityOf
// follows; picked explicitly (pickNumber) rather than a
// body spread: the wire body tolerates an organization_id
// key alongside position, and a spread would let that raw,
// unstamped key leak into the read path ahead of the
// fenced `organization` argument — picking only
// `position` closes that off by construction. Head
// document → wire ObjectiveEntity. Entity fields and
// domain `state` alike come from the head body.
function objectiveDocumentEntityOf(
    document: DerivedDocument,
    organization: Id,
): ObjectiveEntity {
    return {
        id: document.name,
        organization_id: organization,
        position: pickNumber(document.body, 'position'),
        state: pickString(document.body, 'state'),
    };
}
// The objectives wiring row — the seventh family, now the
// FIFTH 'state' one (states-document retirement). Its three
// old 'stateless' rationales are all RETIRED with the
// states/:id document that anchored them: the wire body DOES
// grow state (the zero-delta covenant died with the
// document), genesis IS an explicit minted event (the seed
// re-baselined its pins — no 911 pin survives), and
// absence-as-active (R2) is retired — a fresh objective now
// carries a genesis event like every other state family.
// notFoundTable is 'objectives' — its storage table name
// matches its family name, like ideas/projects/flows/records
// (work-orders/record-attributes are the two whose names
// diverge).
const OBJECTIVES_WIRING: DocumentFamilyWiring = {
    family: 'objectives',
    httpNest: 'organization',
    lifecycle: 'state',
    notFoundTable: 'objectives',
    validateDocument: validateObjectiveDocumentBody,
    documentOp: postObjectiveDocumentOp,
    entityOf: objectiveDocumentEntityOf,
};
// The bare identities row spreads safely (no organization_id,
// no state). `_organization` stays unused: identities is
// GLOBAL plane (family-registry.ts: organizationNested:false).
export function identityDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): object {
    return {
        id: document.name,
        ...document.body,
    };
}
// The identities wiring row — the TWELFTH registered family, and
// the FOURTH member of MEMBERS_WIRING's shared-log-with-genesis
// 'stateless' bucket (see its own comment above for the full
// rationale-contrast): the shared id (member.id === identity.id,
// always) has its ACTIVE/ARCHIVED lifecycle carried by the
// membership SEAT itself, added and removed via PUT/DELETE
// organizations/:id/members/:id (postMembershipDocumentOp), so
// the identities document plane carries NO lifecycle of its
// own. A 'stateless' family's ONLY tombstone signal is a DELETE-method
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
    httpNest: 'global',
    lifecycle: 'stateless',
    notFoundTable: 'identities',
    validateDocument: validateIdentityDocumentBody,
    documentOp: postIdentityDocumentOp,
    entityOf: identityDocumentEntityOf,
};
export function aiAgentDocumentEntityOf(
    document: DerivedDocument,
    _organization: Id,
): object {
    return {
        id: document.name,
        ...document.body,
    };
}
// The ai-agents wiring row — the FOURTEENTH registered
// family. Not a member and not an identity: a standing
// agent document on the global plane. Stateless: no
// lifecycle state. notFoundTable matches the family name.
const AI_AGENTS_WIRING: DocumentFamilyWiring = {
    family: 'ai-agents',
    httpNest: 'global',
    lifecycle: 'stateless',
    notFoundTable: 'ai-agents',
    validateDocument: validateAiAgentDocumentBody,
    documentOp: postAiAgentDocumentOp,
    entityOf: aiAgentDocumentEntityOf,
};
registerDocumentFamilyWiring(IDEAS_WIRING);
registerDocumentFamilyWiring(PROJECTS_WIRING);
registerDocumentFamilyWiring(FLOWS_WIRING);
registerDocumentFamilyWiring(WORK_ORDERS_WIRING);
registerDocumentFamilyWiring(OBJECTIVES_WIRING);
registerDocumentFamilyWiring(IDENTITIES_WIRING);
registerDocumentFamilyWiring(AI_AGENTS_WIRING);

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
// GetHandler trails organization + roles (the fenced claim
// projection). Existing handlers may ignore trailing args —
// fewer-parameter closures are assignable.
export type GetHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    organization: Id | undefined,
    roles: readonly string[],
) => Promise<unknown>;

// PutHandler, PatchHandler, PostHandler, and DeleteHandler
// carry a trailing pair: it is undefined for bearer-exempt and
// not-yet-wired writes (TypeScript cannot prove bearerExempt
// was false inside the gate's one shared dispatch switch), and
// defined for a route named in message-pair.ts's
// MESSAGE_PAIR_WIRED_ROUTE_PATTERNS. A wired handler's LAST in-tx act
// is appending it (absence there is a wiring bug — crash
// loud); an unwired handler ignores the extra argument
// (TypeScript permits a closure with fewer declared
// parameters than its assigned type). Organization + roles
// trail every write verb (reconciliation 5 / Task 10).
export type PutHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
) => Promise<unknown>;

// Task 10: PATCH joins the verb alphabet. No route carries a
// patch handler yet — the type + Route slot land so later
// instance routes can wire without another alphabet widen.
export type PatchHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
    received?: ReceivedRequest,
) => Promise<unknown>;

type DeleteHandler = (
    adapter: DbAdapter,
    params: string[],
    actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
    received?: ReceivedRequest,
) => Promise<void>;

// PostHandler also carries fence organization + roles,
// mirroring GetHandler's rationale: the verified token claim
// the gate resolved, never the path. Undefined organization
// for a bearer-exempt or global route. Only the conversion
// handler consults organization today (to form the created
// project's OWN document pair beside the operation
// message pair above); every other POST handler ignores the extra
// trailing args, the same fewer-parameter-closure precedent
// `messagePair` already established.
type PostHandler = (
    adapter: DbAdapter,
    params: string[],
    payload: Record<string, unknown>,
    actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
    requestAt: string,
    operationId: string,
    received?: ReceivedRequest,
) => Promise<unknown>;

export interface Route {
    segments: string[];
    get?: GetHandler;
    put?: PutHandler;
    patch?: PatchHandler;
    delete?: DeleteHandler;
    post?: PostHandler;
}

export function route(
    pattern: string,
    handlers: {
        get?: GetHandler;
        put?: PutHandler;
        patch?: PatchHandler;
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
// covenant in types.ts and SCHEMA.md § Secrets.
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
// (Phase 12 Task 5: the message-plane derivation, api/derive-
// organizations.ts — itself reading only requests/responses, the
// SAME global passthrough the prior db.organizations.getAll()
// read rode) so this holds for however many organizations
// actually exist, not only the ones a test happened to seed.
async function membershipsAcrossAllOrganizations(
    db: DbAdapter, _actor: Id,
): Promise<MembershipEntity[]> {
    const organizations = await deriveOrganizations(db);
    const perOrganization = await Promise.all(
        organizations.map((organization) =>
            deriveOrganizationMemberSeats(
                db, organization.id,
            ),
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
// own operation message pair, the synthesized document message pair (at the
// record's own records/:id document — the SAME document the
// operation message pair shares, since records' createBodyIdField
// override collapses the two onto one name, the flows
// precedent), one synthesized attribute-PUT pair per
// attributes[] entry, and one synthesized attribute-DELETE pair
// per removedAttributeIds entry (edit only — removedAttributeIds
// does not exist on RecordWriteCreateBody, so a create's
// attributeDeletes is always empty). All pairs share ONE
// requestAt (the write's own origination) yet strictly-later
// RESPONSE `at` stamps (appendMessagePairOnce's nowUtc() is
// monotonic), so the document message pair — appended after the
// operation message pair — becomes the document's head; a duplicate
// create's Supersedes therefore resolves against the prior
// DOCUMENT message pair, not the prior operation message pair (the Phase 5
// shared-document mechanism, re-pinned here).
export interface RecordWriteMessagePairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly attributePuts: readonly MessagePair[];
    readonly attributeDeletes: readonly MessagePair[];
}

// The shared BODY builders — the ONE-voice seam: pure functions
// consumed by BOTH the live route-inline formation
// (nested POST .../record-types) and the seed's invocation
// construction (api/mock-data/seed-message-pairs.ts). NOT a
// shared pair-FORMER (Premature Generalization, verification-
// corrected against an earlier draft): the route needs the
// fence organization and the response specs to form a pair; the
// seed needs neither. Pair formation stays two pipelines,
// sharing only these bodies.

// The wire body a live PUT .../record-types/:id would carry
// for this
// SAME write: the entity fields (organization_id excluded, like
// every genuine client PUT — validateRecordDocumentBody's own
// comment) plus `state`, mapped from initialState on create
// and echoed verbatim (never re-derived) on edit, so a
// synthesized document message pair is byte-indistinguishable
// from what a live PUT would have stored for the identical
// write.
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
        }
        : {
            ...entity,
            state: writeBody.state,
        };
}

// Nested attribute storage body: strip id /
// organization_id / record_id (parentage is the URI
// under the type). ACL arrays pass through when given;
// DEFAULT_ATTRIBUTE_ACL_ROLES stamps only a body that
// carries none — a genuinely NEW attribute. The
// composed edit hands each existing attribute its
// stored arrays (formRecordWriteMessagePairs), so the
// nested attribute PUT stays the only ACL writer.
export function recordAttributeDocumentBodyOf(
    row: Record<string, unknown>,
): Record<string, unknown> {
    const {
        id: _id,
        organization_id: _organizationId,
        record_id: _recordId,
        ...rest
    } = row;
    const defaultRoles: string[] = [
        ...DEFAULT_ATTRIBUTE_ACL_ROLES,
    ];
    return {
        ...rest,
        read_roles:
            Array.isArray(rest['read_roles'])
                ? rest['read_roles']
                : [...defaultRoles],
        write_roles:
            Array.isArray(rest['write_roles'])
                ? rest['write_roles']
                : [...defaultRoles],
    };
}

// Shared composed-write pair bundle for nested POST
// .../record-types (Task 9 / Task 23). Document path is
// RECORD_TYPE_DETAIL_PATTERN; attributes form at
// ATTRIBUTE_DETAIL_PATTERN.
async function formRecordWriteMessagePairs(
    db: DbAdapter,
    b: RecordWriteBody,
    actor: Id,
    messagePair: MessagePair,
    organization: Id,
    documentRoutePattern: string,
    documentParams: readonly string[],
): Promise<RecordWriteMessagePairs> {
    const documentBody = recordDocumentBodyOf(b);
    // The document gate the synthesized pair passes, as a
    // live PUT would.
    validateRecordDocumentBody(documentBody);
    const document = await formDocumentMessagePairFor({
        routePattern: documentRoutePattern,
        params: [...documentParams],
        body: documentBody,
        requesterIdentityId: actor,
        requestAt: messagePair.requestAt,
        operationId: messagePair.operationId,
        requestId: messagePair.requestId,
        organization,
    });
    // Covenant: an ACL is set only by the nested
    // attribute PUT; the composed edit carries each
    // stored ACL forward, and a new attribute takes
    // the default. The composed body can never carry
    // roles (the validator's key set — correctly).
    const storedAttributes = b.kind === 'edit'
        ? await loadAttributeSchemaById(
            db, organization, b.id,
        )
        : undefined;
    const attributePuts = await Promise.all(
        b.attributes.map(async (attr) => {
            const stored = storedAttributes?.get(attr.id);
            const raw = attr as unknown as
                Record<string, unknown>;
            const attributeBody =
                recordAttributeDocumentBodyOf(
                    stored === undefined
                        ? raw
                        : {
                            ...raw,
                            read_roles: [
                                ...stored.readRoles,
                            ],
                            write_roles: [
                                ...stored.writeRoles,
                            ],
                        },
                );
            return formDocumentMessagePairFor({
                routePattern:
                    ATTRIBUTE_DETAIL_PATTERN,
                params: [
                    organization, b.id, attr.id,
                ],
                body: attributeBody,
                requesterIdentityId: actor,
                requestAt: messagePair.requestAt,
                operationId: messagePair.operationId,
                requestId: messagePair.requestId,
                organization,
            });
        }),
    );
    const removedIds = b.kind === 'edit'
        ? b.removedAttributeIds : [];
    const attributeDeletes = await Promise.all(
        removedIds.map(async (id) => {
            // DELETE responses are UNIVERSALLY 204 with no
            // body (message-pair.ts resolution, mirrored
            // here for the synthesized removal pair) —
            // SPEC-LESS, so an explicit response override
            // skips WRITE_RESPONSE_SPECS entirely.
            return formDocumentMessagePairFor({
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
                params: [
                    organization, b.id, id,
                ],
                body: undefined,
                requesterIdentityId: actor,
                requestAt: messagePair.requestAt,
                operationId: messagePair.operationId,
                requestId: messagePair.requestId,
                organization,
                method: 'DELETE',
                response: {
                    status: HTTP_NO_CONTENT,
                    body: undefined,
                },
            });
        }),
    );
    return {
        operation: messagePair,
        document,
        attributePuts,
        attributeDeletes,
    };
}

// Nested attributes URI prefix under a live type.
function attributesUriPrefix(
    organization: Id,
    recordTypeId: Id,
): string {
    return '/organizations/' + organization
        + '/record-types/' + recordTypeId
        + '/attributes/';
}

// Live attribute heads → AttributeSchemaRow map for
// instance ACL + value gates (Tasks 15/17). Roles and
// type fields ride the stored nested document body; a
// head without its role arrays is a breach proclaimed
// here, never a case handled.
function attributeSchemaOf(
    id: string,
    body: Record<string, unknown>,
): AttributeSchemaRow {
    const optionsRaw = body['options'];
    const constraintsRaw = body['constraints'];
    return {
        id,
        name: pickString(body, 'name'),
        attributeType: pickString(
            body, 'attribute_type',
        ) as AttributeType,
        options: Array.isArray(optionsRaw)
            ? optionsRaw as string[]
            : [],
        constraints: Array.isArray(constraintsRaw)
            ? constraintsRaw as Constraint[]
            : [],
        readRoles: pickStringArray(body, 'read_roles'),
        writeRoles: pickStringArray(body, 'write_roles'),
    };
}

export async function loadAttributeSchemaById(
    db: DbAdapter,
    organization: Id,
    recordTypeId: Id,
): Promise<Map<string, AttributeSchemaRow>> {
    const prefix = attributesUriPrefix(
        organization, recordTypeId,
    );
    const messagePairs = await db.messagePairs.getCollectionPairs(prefix,
    );
    const documents = deriveDocumentsAt(
        messagePairs, prefix,
    );
    const map = new Map<string, AttributeSchemaRow>();
    for (const [id, document] of documents) {
        map.set(
            id,
            attributeSchemaOf(id, document.body),
        );
    }
    return map;
}

// G6: GET derive is the stored PUT. Document echoes plus
// the stored nested document body (both ACL keys required).
export function nestedAttributeWireOf(
    organization: Id,
    recordTypeId: Id,
    attributeId: Id,
    requestBody: Record<string, unknown>,
): Record<string, unknown> {
    const entity = validateAttributeDocument(
        withoutId(requestBody),
    );
    return {
        id: attributeId,
        organization_id: organization,
        record_type_id: recordTypeId,
        ...entity,
    };
}

// One formed row against the document already stored.
// No head means the row is new. Field equality is the
// caller's edit, read before the statement opens.
async function requestDiffers(
    db: DbAdapter,
    pair: MessagePair,
): Promise<boolean> {
    const head = await messageStore(db).getDocumentHead(
        pair.path, pair.name,
    );
    if (head === null) return true;
    return !sameValue(
        requestBodyOf(head.request),
        requestBodyOf(pair.requestMessage),
    );
}

function sameValue(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (
        typeof left !== 'object'
        || typeof right !== 'object'
        || left === null
        || right === null
    ) {
        return false;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (
            !Array.isArray(left)
            || !Array.isArray(right)
        ) {
            return false;
        }
        if (left.length !== right.length) return false;
        for (let i = 0; i < left.length; i++) {
            if (!sameValue(left[i], right[i])) {
                return false;
            }
        }
        return true;
    }
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    if (keys.length !== Object.keys(rightRecord).length) {
        return false;
    }
    for (const key of keys) {
        if (!Object.hasOwn(rightRecord, key)) {
            return false;
        }
        if (!sameValue(leftRecord[key], rightRecord[key])) {
            return false;
        }
    }
    return true;
}

// The statement stores nothing when any submitted row
// matches. Submit the record document only when its
// fields differ, and an attribute put only when that
// attribute differs. A resend submits the unchanged
// rows, matches, and stores nothing.
async function recordRowsToSubmit(
    db: DbAdapter,
    formed: RecordWriteMessagePairs,
): Promise<MessagePair[]> {
    const recordChanged = await requestDiffers(
        db, formed.document,
    );
    const changedPuts: MessagePair[] = [];
    for (const pair of formed.attributePuts) {
        if (await requestDiffers(db, pair)) {
            changedPuts.push(pair);
        }
    }
    // A DELETE whose head is already DELETE matches and
    // would drop the puts beside it. Leave that one out
    // when another row changes. A pure resend still
    // submits it, so the statement matches.
    const pendingDeletes: MessagePair[] = [];
    for (const pair of formed.attributeDeletes) {
        if (!(await deleteAlreadyApplied(db, pair))) {
            pendingDeletes.push(pair);
        }
    }
    const hasChange = recordChanged
        || changedPuts.length > 0
        || pendingDeletes.length > 0;
    const rows = [formed.operation];
    if (recordChanged || !hasChange) {
        rows.push(formed.document);
    }
    rows.push(...(hasChange
        ? changedPuts
        : formed.attributePuts));
    rows.push(...(hasChange
        ? pendingDeletes
        : formed.attributeDeletes));
    return rows;
}

async function deleteAlreadyApplied(
    db: DbAdapter,
    pair: MessagePair,
): Promise<boolean> {
    const head = await db.messagePairs.getHeadPair(
        pair.path, pair.name,
    );
    return head !== null && head.method === 'DELETE';
}

// Record creation or edit, discriminated by payload.kind.
// Phase Final Task 2: records + record_attributes ROW halves
// stripped — attributes/record body ride the operation +
// document + attribute pairs; states.postEvent on create/edit
// stays until the states-trace group. Removed attributes are
// RESTRICTED inside the same tx (message-plane referrers; 409
// bytes preserved). `messagePairs` is optional so the seed's below-
// facade call keeps compiling; the route always supplies the
// bundle.
export async function postRecordWriteOp(
    db: DbAdapter,
    payload: Record<string, unknown>,
    _actor: Id,
    messagePairs?: RecordWriteMessagePairs,
    // Verified token organization scoping the RESTRICT
    // referrer sweep (collectAttributeReferrers). Optional so
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
    // Choose rows before the read. RESTRICT runs first;
    // the statement is the write.
    const rows = messagePairs === undefined
        ? undefined
        : await recordRowsToSubmit(db, messagePairs);
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
        await db.readTransaction(async (view) => {
            // Flat window: body.id is the record (type)
            // id; fourth-leg instance scan scopes there.
            const referrers =
                await collectAttributeReferrers(
                    view,
                    boundOrganization,
                    removedIds,
                    body.id,
                );
            for (const [id, refs] of referrers) {
                if (hasReferrers(refs)) {
                    throw new ApiError(
                        describeReferrers(id, refs),
                        HTTP_CONFLICT,
                    );
                }
            }
        });
    }
    if (rows !== undefined) {
        await runWrite(db, attemptFor(rows), rows);
    }
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
// fresh id's PUT simply finds no head, authoring the birth
// like any other transition). Phase Final Task 2: the ideas
// ROW half is stripped — the pair + states.postEvent commit as
// ONE transaction (states ROW half stripped — message plane
// only).
// WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade callers
// and type parity. `messagePair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'ideas/:id' is pair-wired and never
// bearer-exempt.
export async function postIdeaDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<IdeaEntity> {
    const doc = validateIdeaDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<IdeaEntity, 'id'>;
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// Project document write (Decision 7): ONE shape serves
// create, edit, and transition — genesis is head-presence-
// defined (a fresh id's PUT simply finds no head, authoring
// the birth like any other transition). Phase Final Task 2:
// the projects ROW half is stripped — the pair +
// states.postEvent commit as ONE transaction (states ROW half
// stripped — message plane only).
// WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade callers
// and type parity. `messagePair` is optional so the seed's
// below-facade call keeps compiling unchanged; the route always
// supplies one, since 'projects/:id' is pair-wired and never
// bearer-exempt.
export async function postProjectDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<ProjectEntity> {
    const doc = validateProjectDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<ProjectEntity, 'id'>;
    // Phase Final Task 2: projects ROW half stripped;
    // states ROW half stripped (message plane only).
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// Record document write (Decision 7, the fifth family): ONE
// shape serves create, edit, and transition — genesis is
// head-presence-defined, byte-identical to postIdeaDocumentOp/
// postProjectDocumentOp. UNLIKE those two, a record's genesis
// normally arrives through the composed create
// (postRecordWriteOp, POST .../record-types) rather than
// this PUT —
// this op's genesis arm exists for a live PUT-first flow.
// Phase Final Task 2: the records ROW half is stripped — the
// pair + states.postEvent commit as ONE transaction (states
// row half strips with the states-trace group).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes; the
// reconstructed return is for below-facade callers and type
// parity. `messagePair` is optional so the seed's below-facade call
// keeps compiling; the route always supplies one.
export async function postRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<RecordEntity> {
    const doc = validateRecordDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<RecordEntity, 'id'>;
    // Phase Final Task 2: records ROW half stripped;
    // states ROW half stripped (message plane only).
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// Record attribute document write — the sixth family, and the
// SECOND 'stateless' one (vacuous BY CONSTRUCTION). Phase Final
// Task 2: the record_attributes ROW half is stripped — pure
// message-plane write (postWorkOrderDocumentOp shape).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes; the
// reconstructed return is for below-facade callers and type
// parity. validateRecordAttributeDocumentBody rejects a body
// carrying state at the gate. `messagePair` is optional. The actor
// parameter is spelled `_actor`: no state event here to author.
export async function postRecordAttributeDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<RecordAttributeEntity> {
    const doc = validateRecordAttributeDocumentBody(
        withoutId(body),
    );
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<RecordAttributeEntity, 'id'>;
    // Phase Final Task 2: record_attributes ROW half
    // stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// Idea submission write: a genesis-only document (an
// idea is submitted once per sid; no edit/transition case
// exists for this family). Phase Final Task 2: the
// idea_submissions ROW half is stripped — pure message-plane
// write (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes via ideaSubmissionEntityOf
// (GET derive). Exported so the seed can
// drive submission creation through the same op the route
// uses (Decision 6's below-facade carve-out). `messagePair` is
// optional so a future below-facade caller with no pair keeps
// compiling; the live route always supplies one, since
// 'ideas/:id/submissions/:sid' is pair-wired and never
// bearer-exempt.
export async function postIdeaSubmissionOp(
    db: DbAdapter,
    sid: Id,
    body: Record<string, unknown>,
    messagePair?: MessagePair,
): Promise<IdeaSubmissionEntity> {
    const entity = ideaSubmissionEntityOf({
        name: sid,
        messagePairId: sid,
        method: 'PUT',
        body: withoutId(body),
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
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
        graph: storedGraph(
            reduceCreateGraphDelta(b.graphDelta),
        ),
        graphDelta: b.graphDelta,
        revivals: [],
    };
}

// The three pairs a live POST /flows forms (Task 5): the gate's
// own operation message pair (204, at the flows/:id document per Task 1's
// createdEntityName override — POST 'flows' and PUT 'flows/:id'
// collapse onto the SAME (path, name), see derive-
// documents.ts's DOCUMENT_METHODS filter for why the two never
// collide as documents), plus the document and join pairs the
// route pre-forms below. All three share ONE requestAt (the
// create's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePairOnce's nowUtc() is monotonic), so the
// document message pair — appended after the
// operation message pair — becomes the document's head.
export interface FlowCreationMessagePairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly join: MessagePair;
}

// Flow creation. Phase Final Task 2: flows + graph relation
// + project_flows ROW halves stripped — message plane carries
// the document (graphDelta SIDECAR-KEEP) and the join; only
// the initial 'active' states.postEvent remains until the
// states-trace group. graphDelta is still validated at the
// HTTP gate and stored on the document message pair. Exported so the
// seed can drive flow creation through the same gate the
// route uses (Decision 6's below-facade carve-out). `messagePairs`
// is optional so the seed's below-facade call keeps
// compiling; the route always supplies the triple.
// An unchanged document is left out when the join
// changes. A resend of every body is what matches.
async function flowRowsToSubmit(
    db: DbAdapter,
    formed: FlowCreationMessagePairs,
): Promise<MessagePair[]> {
    const documentChanged = await requestDiffers(
        db, formed.document,
    );
    const joinChanged = await requestDiffers(
        db, formed.join,
    );
    const hasChange = documentChanged || joinChanged;
    const rows = [formed.operation];
    if (documentChanged || !hasChange) {
        rows.push(formed.document);
    }
    if (joinChanged || !hasChange) {
        rows.push(formed.join);
    }
    return rows;
}

export async function postFlowCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    messagePairs?: FlowCreationMessagePairs,
): Promise<void> {
    validateFlowCreateBody(body);
    const rows = messagePairs === undefined
        ? undefined
        : await flowRowsToSubmit(db, messagePairs);
    if (rows !== undefined) {
        await runWrite(
            db, attemptFor(rows), rows,
        );
    }
    return;
}

// Flow document write (Decision 7, class B). Phase
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
// parity. `messagePair` is optional so a below-facade caller with no
// pair keeps compiling; the live route always supplies one.
async function assertLiveFlowGraphWriteLaw(
    db: DbAdapter,
    graph: Record<string, unknown>,
): Promise<void> {
    const parsed = asStoredGraph(
        graph, 'FlowDocumentBody.graph',
    );
    const liveAgentIds = await liveGlobalDocumentIds(
        db, 'ai-agents',
    );
    assertFlowGraphWriteLaw(parsed, liveAgentIds);
}

export async function postFlowDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<FlowEntity> {
    const doc = validateFlowDocumentBody(withoutId(body));
    await assertLiveFlowGraphWriteLaw(db, doc.graph);
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<FlowEntity, 'id'>;
    // Phase Final Task 2: flows + graph ROW halves
    // stripped; states ROW half stripped (message plane only).
    // Revival states events dual-write until the
    // states-trace strip; pair body also carries
    // revivals for deriveFlowGraphStates (SIDECAR-KEEP).
    // The statement judges the received PUT's own tag.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// Undo-as-replay (Phase 14 Task 8): given a resolution
// ALREADY produced by resolveFlowUndoTarget, perform the
// restore write. Phase Final Task 2: flows + graph ROW
// halves stripped — the 'updated' state event, revivals
// states events, and the operation + synthesized document
// message pairs (graphDelta/revivals SIDECAR-KEEP on the document
// body) commit as ONE transaction. Exhaustion appends only
// the operation message pair. `current.id` is the in-tx latch so a
// racing save 412s when the lock head has moved.
export async function postFlowUndoOp(
    db: DbAdapter,
    id: Id,
    actor: Id,
    organization: Id,
    messagePair: MessagePair,
    resolution: FlowUndoResolution,
    b: FlowUndoBody,
): Promise<unknown> {
    const { current, target } = resolution;
    if (target === undefined) {
        // Exhaustion: the gate still requires this wired write's
        // own operation message pair to land (api.ts's post-dispatch
        // "wired write stored no pair" guard, true for every
        // pair-wired route), so it is appended ALONE — no
        // document message pair, no domain writes — a genuine no-op a
        // LATER resolution walk correctly ignores (it carries no
        // correlated document message pair to displace anything).
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
        return;
    }
    const currentGraph = asStoredGraph(
        current.body['graph'],
        'flows/:id/undo current.graph',
    );
    const targetGraph = asStoredGraph(
        target.body['graph'],
        'flows/:id/undo target.graph',
    );
    // graphDelta/revivals still computed for the document-pair
    // body (SIDECAR-KEEP → deriveFlowGraphStates); no row-plane
    // graph writer remains after writeFlowGraphDelta's strip.
    const delta = buildFlowGraphDelta(
        currentGraph, targetGraph, id,
        generateIdentifier, b.at,
    );
    const revivals = buildFlowGraphRevivals(
        currentGraph, targetGraph,
        generateIdentifier, b.at,
    );
    const flowFields = {
        name: pickString(target.body, 'name'),
        is_locked:
            pickBoolean(current.body, 'is_locked'),
        is_auto_layout:
            pickBoolean(
                current.body, 'is_auto_layout',
            ),
        is_auto_fit:
            pickBoolean(
                current.body, 'is_auto_fit',
            ),
        lock_timeout:
            pickNumber(target.body, 'lock_timeout'),
    };
    const documentBody = {
        ...flowFields,
        state: 'updated',
        state_at: b.at,
        state_event_id: b.eventId,
        graph: asObject(
            target.body['graph'],
            'flows/:id/undo target.graph',
        ),
        graphDelta: delta,
        revivals,
    };
    validateFlowDocumentBody(documentBody);
    const documentMessagePair = await formDocumentMessagePairFor({
        routePattern: 'organizations/:id/flows/:id',
        params: [organization, id],
        body: documentBody,
        requesterIdentityId: actor,
        requestAt: messagePair.requestAt,
        operationId: messagePair.operationId,
        requestId: messagePair.requestId,
        organization,
        latchedHeadMessagePairId: current.id,
    });
    // Phase Final Task 2: flows + graph ROW halves stripped.
    const latest = await db.readTransaction(
        async (view) =>
            (await messageStore(view).getDocumentHead(
                documentMessagePair.path,
                documentMessagePair.name,
            ))?.id,
    );
    // The CLIENT's pin, not this walk's own read:
    // the gate proved it matched the head before
    // dispatch, so a mismatch here means a racer
    // committed in between — a real conflict, never
    // a scheduling artifact of our own resolution.
    const pinned =
        messagePair.pinnedDocumentMessagePairId
            ?? current.id;
    if (latest !== pinned) {
        throw new ApiError(
            'If-Match does not match the current'
            + ' document at /flows/' + id,
            HTTP_PRECONDITION_FAILED,
        );
    }
    const pairs = [
        messagePair, documentMessagePair,
    ];
    await runWrite(db, attemptFor(pairs), pairs);
    return;
}

// The three pairs a live POST /objectives forms (Task 3): the
// gate's own operation message pair (204, at the objectives/:id document
// per the create-body-id-field override — POST 'objectives' and
// PUT 'objectives/:id' collapse onto the SAME (path,
// name), the flows/records precedent), the synthesized document
// message pair (objectives/:id), and the synthesized revision pair
// (objectives/:id/revisions/:rid) the route pre-forms below. All
// three share ONE requestAt (the create's own origination) yet
// strictly-later RESPONSE `at` stamps (appendMessagePairOnce's
// nowUtc() is monotonic), so the document message pair — appended after
// the operation message pair — becomes the shared document's head; the
// revision pair lives at its OWN distinct document (a fresh
// revision id per create), so it is always genesis there unless
// a live PUT had already visited that exact revision id.
export interface ObjectiveCreationMessagePairs {
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
// STRIPPED — the org rides the path) plus state mapped
// from the create body's initialState* — the
// recordDocumentBodyOf shape, so a synthesized document message pair
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
// pure message-plane write. The genesis state folds onto
// the document message pair via objectiveDocumentBodyOf
// (states-document retirement); no separate states/:id event
// is written. Exported so the seed can drive objective
// creation through the same gate the route uses (Decision
// 6's below-facade carve-out). `messagePairs` is optional so the
// seed's below-facade shape keeps compiling; the route
// always supplies the bundle, since 'objectives' is pair-
// wired and never bearer-exempt. Create appends THREE pairs
// — operation, document, revision — in that order, LAST.
export async function postObjectiveCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    messagePairs?: ObjectiveCreationMessagePairs,
): Promise<void> {
    validateObjectiveCreateBody(body);
    // Phase Final Task 2: objectives +
    // objective_revisions ROW halves stripped.
    if (messagePairs !== undefined) {
        const pairs = [
            messagePairs.operation,
            messagePairs.document,
            messagePairs.revision,
        ];
        await runWrite(
            db, attemptFor(pairs), pairs,
        );
    }
    return;
}

// Objective document write — the fifth lifecycle-state family
// (states-document retirement). Phase Final Task 2: the
// objectives ROW half is stripped — pure message-plane write
// (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity.
// validateObjectiveDocumentBody admits entity field plus
// state; Task 1 widens the gate only — state-event
// minting lands with later tasks. `messagePair` is optional so a
// future below-facade caller keeps compiling; the live route
// always supplies one, since 'objectives/:id' is pair-wired
// and never bearer-exempt. The actor parameter is spelled
// `_actor` while state-event authorship is still pending.
export async function postObjectiveDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<ObjectiveEntity> {
    const doc = validateObjectiveDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<ObjectiveEntity, 'id'>;
    // Phase Final Task 2: objectives ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return { id, ...entity };
}

// The wire body a synthesized PUT identities/:id carries:
// `kind` alone. A live PUT may also fold a person profile;
// this builder is the create/seed path, where a person
// without a profile is valid. The identity kind is a
// server-supplied fact the caller pins, never read off a
// request body — the ONE builder the identity-create route
// and the seed share.
export function identityDocumentBodyOf(
    kind: IdentityKind,
    profile?: {
        readonly title: string;
        readonly department: string;
        readonly strengths: string[];
        readonly team_dimensions: Record<string, number>;
    },
): Record<string, unknown> {
    if (kind === 'service' || profile === undefined) {
        return { kind };
    }
    return { kind, ...profile };
}

// Identity creation: Phase Final Task 2 strips the
// identities + identity_credentials ROW halves — pure
// message-plane write. A person's PII enters later via PUT
// identities/:id/pii. NO state event (an identity carries
// no lifecycle event at creation). The pairs a live POST
// /identities forms: operation (204 at identities/:id) +
// identities/:id document ({kind} alone). A service ALSO
// forms the credential-document message pair at
// identities/:id/credentials/:cid, appended last.
export type IdentityWriteMessagePairs =
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
// the same gate the route uses. `messagePairs` is optional so the
// seed's below-facade shape keeps compiling; the route always
// supplies the bundle. Create appends operation + identity
// document (+ credential document for service), LAST.
export async function postIdentityCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    messagePairs?: IdentityWriteMessagePairs,
): Promise<void> {
    validateIdentityCreateBody(body);
    // Phase Final Task 2: identities + identity_credentials
    // ROW halves stripped.
    if (messagePairs !== undefined) {
        const pairs = [
            messagePairs.operation,
            messagePairs.identityDocument,
        ];
        if (messagePairs.kind === 'service') {
            pairs.push(
                messagePairs.credentialDocument,
            );
        }
        await runWrite(
            db, attemptFor(pairs), pairs,
        );
    }
    return;
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
        flow_graph: asObject(
            b.workOrder['flow_graph'], 'flow_graph',
        ),
        position: pickNumber(b.workOrder, 'position'),
    };
}

// The three pairs a live POST /work-orders forms (Task 3):
// the gate's own operation message pair (204, at the work-orders/:id
// document per the registry's createBodyIdField — POST
// 'work-orders' and PUT 'work-orders/:id' collapse onto the
// SAME (path, name), exactly as flows/:id did for its
// own create), plus the document and join pairs the route
// pre-forms below. All three share ONE requestAt (the
// create's own origination) yet strictly-later RESPONSE `at`
// stamps (appendMessagePairOnce's nowUtc() is monotonic), so the
// document message pair — appended after the
// operation message pair — becomes the document's head.
export interface WorkOrderCreationMessagePairs {
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly join: MessagePair;
    readonly claim: MessagePair;
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
// An unchanged document, join, or claim is left out
// when another row changes. A resend of every body
// is what matches, and the statement stores nothing.
async function workOrderRowsToSubmit(
    db: DbAdapter,
    formed: WorkOrderCreationMessagePairs,
): Promise<MessagePair[]> {
    const documentChanged = await requestDiffers(
        db, formed.document,
    );
    const joinChanged = await requestDiffers(
        db, formed.join,
    );
    const claimChanged = await requestDiffers(
        db, formed.claim,
    );
    const hasChange = documentChanged
        || joinChanged
        || claimChanged;
    const rows = [formed.operation];
    if (documentChanged || !hasChange) {
        rows.push(formed.document);
    }
    if (joinChanged || !hasChange) {
        rows.push(formed.join);
    }
    if (claimChanged || !hasChange) {
        rows.push(formed.claim);
    }
    return rows;
}

export async function postWorkOrderCreationOp(
    db: DbAdapter,
    body: Record<string, unknown>,
    _actor: Id,
    messagePairs?: WorkOrderCreationMessagePairs,
): Promise<void> {
    validateWorkOrderCreateBody(body);
    const rows = messagePairs === undefined
        ? undefined
        : await workOrderRowsToSubmit(db, messagePairs);
    // Phase Final Task 2: work_orders + flow_work_orders
    // ROW halves stripped.
    if (rows !== undefined) {
        await runWrite(
            db, attemptFor(rows), rows,
        );
    }
    return;
}

// Claim a work order. A live claim by another member is
// a 409 before any write. The same actor's repeat whose
// body matches answers 200 and stores nothing. A claim
// aged past the flow's lockTimeout is superseded.
//
// The decision read and the write are separate, so two
// callers can both observe no claim head. That write is
// genesis: the nil succession slot admits one PUT, and
// the other answers 409. A present head — expired, the
// same actor, or a DELETE — is in-order with If-Match
// set to that head. Stale and succession refusal are the
// same 409. A reclaim after DELETE matches that DELETE,
// never a second genesis: the nil slot already holds
// the first claim.
//
// Exported so the seed can drive a claim through the
// same gate the route uses. `messagePair` is optional.
// A wired return must run the statement, matched no-op
// included: the gate crashes when the answer is absent.
//
// PHASE 14 TASK 4: the prior-claim decision read is re-
// anchored onto the message plane (workOrderClaimHistoryFor,
// api/derive-states.ts) — ENTITY-SCOPED indexed reads inside
// this SAME transaction, never a nested tx — in place of the
// row-plane view.states.getAllFor(workOrderId). Author gate 3:
// latestClaimEvent and isClaimEventExpired (the live Date.now
// clock) stay byte-identical — ONLY the event SOURCE flips.
//
// PHASE 15 TASK 2: the claim-gate graph read is re-anchored
// onto workOrderDocumentHeadFor (message-plane document head)
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
    messagePair?: MessagePair,
): Promise<void> {
    validateWorkOrderClaimBody(body);
    // Phase Final Task 2: work_orders ROW half stripped.
    // claim_expired + claimed live on the operation
    // message pair body (workOrderClaimHistoryFor reads
    // them back).
    const claimRead = await db.readTransaction(async (view) => {
        const wo = await workOrderDocumentHeadFor(
            view, organization, workOrderId,
        );
        if (wo === null) {
            throw await missedReadError(
                view, workOrderId, organization,
                'work_orders',
            );
        }
        const graph = asWorkOrderFlowGraph(
            wo.flow_graph,
            'work_orders.flow_graph',
        );
        const events = await workOrderClaimHistoryFor(
            view, organization, workOrderId,
        );
        const prior = latestClaimEvent(
            events, workOrderId,
        );
        const claimDoc = await workOrderClaimDocumentFor(
            view, organization, workOrderId,
        );
        const priorExpired = claimDoc !== null
            ? isExpiresAtPassed(claimDoc.expiresAt)
            : prior !== null
                && isClaimEventExpired(
                    prior, graph.lockTimeout,
                );
        const head = messagePair === undefined
            ? null
            : await documentHeadAt(
                view, messagePair.path, messagePair.name,
            );
        return {
            claimed: prior !== null
                && prior.state === 'claimed'
                && !priorExpired
                && prior.member_id !== actor,
            headId: head === null ? null : head.id,
        };
    });
    if (claimRead.claimed) {
        throw new ApiError(
            'work order is already claimed',
            HTTP_CONFLICT,
        );
    }
    if (messagePair !== undefined) {
        // The gate's answer map is keyed by this object,
        // so the attempt latch has to land on it.
        if (claimRead.headId === null) {
            Object.assign(messagePair, {
                genesis: 'handler' as const,
            });
        } else {
            Object.assign(messagePair, {
                latchedHeadMessagePairId: claimRead.headId,
            });
        }
        const answer = await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
        if (
            answer.outcome === 'refused'
            || answer.outcome === 'stale'
        ) {
            throw new ApiError(
                'work order is already claimed',
                HTTP_CONFLICT,
            );
        }
    }
}

// DELETE work-orders/:id/claim — tombstone the claim
// document. The gate's DELETE table already 404s a never-
// written document and 204s an already-DELETE head without
// dispatch. A PUT head proceeds here; append the DELETE
// pair. applyReleaseMessagePair synthesizes claim_released from
// the pair (id/at/actor) — no caller-minted body.
export async function deleteWorkOrderClaimOp(
    db: DbAdapter,
    _workOrderId: Id,
    _actor: Id,
    _organization: Id,
    messagePair?: MessagePair,
): Promise<void> {
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return;
}

// Current node id from lifecycle ASC + frozen graph.
// Latest non-claim event's state; none → isCreate node;
// undefined when neither exists (empty graph residual).
function currentNodeIdFor(
    lifecycle: readonly StateEntity[],
    graph: WorkOrderFlowGraph,
): string | undefined {
    for (let i = lifecycle.length - 1; i >= 0; i--) {
        const event = lifecycle[i]!;
        if (!isClaimState(event.state)) {
            return event.state;
        }
    }
    const create = graph.nodes.find(
        (node) => node.isCreate,
    );
    return create?.id;
}

// W10 required-at-exit: every gate-tier leave of a node
// with isRequired refs validates MERGED state (head +
// this delta). Unbound → 400 naming the bind (A3).
// Preloaded head/bind/schema reuse the value-bearing
// path's already-read rows (ONE head read).
async function assertRequiredAttributesAtExit(
    db: DbAdapter,
    organization: Id,
    workOrderId: Id,
    flowGraph: Record<string, unknown>,
    delta: {
        readonly set: readonly {
            readonly attribute_id: string;
            readonly value: string;
        }[];
        readonly clear: readonly string[];
    },
    preloaded?: {
        bind: { instanceId: Id; recordTypeId: Id };
        headValues: readonly InstanceValue[];
        attributesById: ReadonlyMap<
            string, AttributeSchemaRow
        >;
    },
): Promise<void> {
    const graph = asWorkOrderFlowGraph(
        flowGraph, 'work_orders.flow_graph',
    );
    const lifecycle = await workOrderLifecycleStatesFor(
        db, organization, workOrderId,
    );
    const nodeId = currentNodeIdFor(lifecycle, graph);
    if (nodeId === undefined) {
        return;
    }
    const node = graph.nodes.find(
        (candidate) => candidate.id === nodeId,
    );
    if (node === undefined) {
        return;
    }
    const required = node.attributes.filter(
        (ref) => ref.isRequired,
    );
    if (required.length === 0) {
        return;
    }
    const bind = preloaded !== undefined
        ? preloaded.bind
        : await workOrderBindingFor(
            db, organization, workOrderId,
        );
    if (bind === null) {
        throw new ValidationError(
            'work order has no instance binding',
        );
    }
    let headValues = preloaded?.headValues;
    let attributesById = preloaded?.attributesById;
    if (headValues === undefined) {
        const head = await deriveInstanceHead(
            db, organization,
            bind.recordTypeId, bind.instanceId,
        );
        headValues = head?.values ?? [];
    }
    if (attributesById === undefined) {
        attributesById = await loadAttributeSchemaById(
            db, organization, bind.recordTypeId,
        );
    }
    const merged = mergeInstanceValues(
        headValues, {
            set: delta.set,
            clear: delta.clear,
        },
    );
    const present = new Map<string, string>();
    for (const entry of merged) {
        present.set(entry.attribute_id, entry.value);
    }
    const missing: string[] = [];
    for (const ref of required) {
        const value = present.get(ref.attributeId);
        if (value === undefined || value === '') {
            const row = attributesById.get(
                ref.attributeId,
            );
            missing.push(
                row !== undefined
                    ? row.name
                    : ref.attributeId,
            );
        }
    }
    if (missing.length > 0) {
        throw new ValidationError(
            'required attribute(s) missing at exit: '
            + missing.join(', '),
        );
    }
}

// Transition a work order along an edge. Dual-tolerant
// below the facade (seed tier + stored-data fidelity):
// legacy pure-append OR instance set/clear against the
// bound instance head. organization === undefined is the
// below-facade seed tier (validate + append only). The
// live gate rejects the legacy key in the dispatch arrow
// (Task 8 CUT). Gate tier fences the WO (404/403); value-
// bearing instance shape adds bind assert + If-Match
// ladder + ACL/constraints + W10 required-at-exit + one
// tx of op + revision. Authorship is stamped from the
// verified caller (actor). `messagePair` is optional.
export async function postWorkOrderTransitionOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    actor: Id,
    organization: Id | undefined,
    roles: readonly string[],
    messagePair?: MessagePair,
): Promise<void> {
    const validated =
        validateWorkOrderTransitionBody(body);
    if (organization === undefined) {
        // Below-facade tier (seed): no gate, no fence —
        // validate + append, the WO-create precedent.
        // Historical seed moves are not re-gated (W10).
        if (messagePair !== undefined) {
            await runWrite(
                db,
                attemptFor([messagePair]),
                [messagePair],
            );
        }
        return;
    }
    const valueBearing =
        validated.kind === 'instance'
        && (validated.set.length
            + validated.clear.length > 0);
    if (!valueBearing) {
        // Pure move: legacy kind OR instance-kind empty
        // delta. Pre-tx fence + W10 required-at-exit;
        // one-dialect If-Match reject; then append.
        const wo = await workOrderDocumentHeadFor(
            db, organization, workOrderId,
        );
        if (wo === null) {
            throw await missedReadError(
                db, workOrderId, organization,
                'work_orders',
            );
        }
        if (
            validated.kind === 'instance'
            && messagePair !== undefined
            && rawIfMatchFromMessagePair(messagePair)
                !== undefined
        ) {
            throw new ValidationError(
                'If-Match is forbidden on a'
                + ' pure-move transition',
            );
        }
        await assertRequiredAttributesAtExit(
            db, organization, workOrderId,
            wo.flow_graph,
            { set: [], clear: [] },
        );
        if (messagePair !== undefined) {
            await runWrite(
                db,
                attemptFor([messagePair]),
                [messagePair],
            );
        }
        return;
    }
    // Value-bearing instance-kind. PRE-TX after fence
    // (instance-PATCH shape: tx wraps only the appends).
    const wo = await workOrderDocumentHeadFor(
        db, organization, workOrderId,
    );
    if (wo === null) {
        throw await missedReadError(
            db, workOrderId, organization,
            'work_orders',
        );
    }
    if (validated.kind !== 'instance') {
        // Exhaustiveness: valueBearing implies instance.
        throw new Error(
            'value-bearing transition is not instance',
        );
    }
    const bind = await workOrderBindingFor(
        db, organization, workOrderId,
    );
    if (bind === null) {
        throw new ValidationError(
            'work order has no instance binding',
        );
    }
    if (
        bind.instanceId !== validated.instanceId
        || bind.recordTypeId !== validated.recordTypeId
    ) {
        throw new ValidationError(
            'instance_id/record_type_id do not match'
            + ' the work order\'s binding',
        );
    }
    if (messagePair === undefined) {
        throw new Error(
            'value-bearing transition requires a'
            + ' formed pair',
        );
    }
    const transitionPath =
        '/organizations/' + organization
        + '/work-orders/' + workOrderId
        + '/transition';
    const rawIfMatch = rawIfMatchFromMessagePair(messagePair);
    if (rawIfMatch === undefined) {
        throw new ApiError(
            'If-Match is required to transition with'
            + ' set/clear at ' + transitionPath,
            HTTP_PRECONDITION_REQUIRED,
        );
    }
    const ifMatchTarget = parseIfMatch(rawIfMatch);
    if (ifMatchTarget === undefined) {
        throw new ValidationError(
            'If-Match must carry exactly one strong'
            + ' validator',
        );
    }
    // Compose postInstancePatchOp pipeline against the
    // bound instance (org, bind.recordTypeId,
    // bind.instanceId). COPY head-assert blocks inline
    // (A5 — do not extract).
    const org = organization;
    const typeId = bind.recordTypeId;
    const instanceId = bind.instanceId;
    const pathname = '/organizations/' + org
        + '/record-types/' + typeId
        + '/instances/' + instanceId;
    const head = await deriveInstanceHead(
        db, org, typeId, instanceId,
    );
    if (head === undefined) {
        throw new ApiError(
            'If-Match does not match the current '
                + 'instance at ' + pathname,
            HTTP_PRECONDITION_FAILED,
        );
    }
    const attributesById = await loadAttributeSchemaById(
        db, org, typeId,
    );
    if (ifMatchTarget !== head.messagePairId) {
        throw new ApiError(
            'If-Match does not match the current '
                + 'instance at ' + pathname,
            HTTP_PRECONDITION_FAILED,
        );
    }
    const aclIds = [
        ...validated.set.map(
            (entry) => entry.attribute_id,
        ),
        ...validated.clear,
    ];
    assertWritableAttributeIds(
        aclIds, attributesById, roles,
    );
    validateInstanceValues(
        validated.set, attributesById,
    );
    // W10 required-at-exit AFTER ACL 403 + constraints
    // 400 (ladder pin 7). Reuse head — ONE read.
    await assertRequiredAttributesAtExit(
        db, organization, workOrderId,
        wo.flow_graph,
        {
            set: validated.set,
            clear: validated.clear,
        },
        {
            bind,
            headValues: head.values,
            attributesById,
        },
    );
    const mergedValues = mergeInstanceValues(
        head.values, {
            set: validated.set,
            clear: validated.clear,
        },
    );
    const revisionState = instanceStateOf(
        org, typeId, instanceId, mergedValues,
    );
    const revisionMessagePair = await formDocumentMessagePairFor({
        routePattern: INSTANCE_DETAIL_PATTERN,
        params: [org, typeId, instanceId],
        method: 'PUT',
        body: revisionState,
        requesterIdentityId: actor,
        requestAt: messagePair.requestAt,
        operationId: messagePair.operationId,
        requestId: messagePair.requestId,
        organization: org,
        response: {
            status: HTTP_OK,
            body: revisionState,
        },
        headerFields: [{
            name: IF_MATCH_HEADER,
            value: strongEtagOf(ifMatchTarget),
        }],
    });
    const latchedMessagePairId = head.messagePairId;
    await db.readTransaction(async (view) => {
        const liveWo =
            await workOrderDocumentHeadFor(
                view, organization, workOrderId,
            );
        if (liveWo === null) {
            throw await missedReadError(
                view, workOrderId, organization,
                'work_orders',
            );
        }
        // The latched pair must still be the head.
        const latest = (await messageStore(view)
            .getDocumentHead(
                revisionMessagePair.path,
                revisionMessagePair.name,
            ))?.id;
        if (latest !== latchedMessagePairId) {
            throw new ApiError(
                'If-Match does not match the current '
                    + 'instance at ' + pathname,
                HTTP_PRECONDITION_FAILED,
            );
        }
    });
    const pairs = [
        messagePair, revisionMessagePair,
    ];
    await runWrite(db, attemptFor(pairs), pairs);
}

// Bind a work order to one org-owned instance of one
// record type (spec W1). Member tier rides the
// /work-orders MEMBER_VERBS segment prefix — no policy
// edit (the /claim precedent). Claim-AGNOSTIC (A7).
// Rebind is forbidden in v1: a prior binding pair
// naming a different (instance, type) → 409 in-tx;
// a byte-identical resend replays via message_hash.
// Covenant ladder: fence → body → instance → join →
// in-tx 409 (NOT claim's body-first order).
export async function postWorkOrderBindingOp(
    db: DbAdapter,
    workOrderId: Id,
    body: Record<string, unknown>,
    _actor: Id,
    organization: Id,
    messagePair?: MessagePair,
): Promise<void> {
    await db.readTransaction(async (view) => {
        const wo = await workOrderDocumentHeadFor(
            view, organization, workOrderId,
        );
        if (wo === null) {
            throw await missedReadError(
                view, workOrderId, organization,
                'work_orders',
            );
        }
        const bind = validateWorkOrderBindingBody(body);
        // Instance miss is EntityNotFoundError (404)
        // — never missedReadError (would 403 foreign
        // and create an existence oracle; W1 / W7).
        const head = await deriveInstanceHead(
            view, organization,
            bind.recordTypeId, bind.instanceId,
        );
        if (head === undefined) {
            throw new EntityNotFoundError(
                'record_instances',
                bind.instanceId,
            );
        }
        const chain =
            await recordTypeIdsForWorkOrder(
                view, organization, workOrderId,
            );
        if (
            chain === null
            || !chain.recordTypeIds.includes(
                bind.recordTypeId,
            )
        ) {
            throw new ValidationError(
                'record_type_id is not joined to'
                + ' the work order\'s flow',
            );
        }
        const prior = await workOrderBindingFor(
            view, organization, workOrderId,
        );
        if (
            prior !== null
            && (prior.instanceId
                    !== bind.instanceId
                || prior.recordTypeId
                    !== bind.recordTypeId)
        ) {
            throw new ApiError(
                'work order is already bound to'
                + ' a different instance',
                HTTP_CONFLICT,
            );
        }
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
}

// Work-order document write — the fourth family's evidence for
// the 'stateless' lifecycle class (Decision 7 does NOT apply
// here): a work order's lifecycle is written ONLY by the
// create/claim/transition ops above and the states/:id unclaim
// path, never by a document PUT, so this op posts NO states
// event of its own. Phase Final Task 2: the work_orders ROW
// half is stripped — pure message-plane write
// (postFlowTagDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity.
// validateWorkOrderDocumentBody rejects a body carrying
// state at the gate. Exported so the seed can drive a work-
// order document write through the same op the route uses.
// `messagePair` is optional. The actor parameter is spelled `_actor`:
// no state event here to author.
export async function postWorkOrderDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<WorkOrderEntity, 'id'>> {
    const doc = validateWorkOrderDocumentBody(withoutId(body));
    const entity = {
        ...doc.entity,
        ...documentOperationOrganization(body),
    } as unknown as Omit<WorkOrderEntity, 'id'>;
    // Phase Final Task 2: work_orders ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Flow work-order join document write. Phase Final Task 2:
// the flow_work_orders ROW half is stripped — pure message-plane
// write. WRITE_RESPONSE_SPECS successBody forms the wire
// bytes; the reconstructed return is for below-facade
// callers and type parity. `messagePair` is optional. The actor
// parameter is spelled `_actor`: no state event here to author.
export async function postFlowWorkOrderDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<FlowWorkOrderEntity> {
    const entity = flowWorkOrderEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    // Phase Final Task 2: flow_work_orders ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Flow record join document write. Phase Final Task 2: the
// flow_records ROW half is stripped — pure message-plane write
// (postFlowWorkOrderDocumentOp shape). WRITE_RESPONSE_SPECS
// successBody forms the wire bytes; the reconstructed return
// is for below-facade callers and type parity. `messagePair` is
// optional. The actor parameter is spelled `_actor`: no state
// event here to author. `organization` is the verified token
// claim the record probe reads in.
export async function postFlowRecordDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    organization: Id,
    messagePair?: MessagePair,
): Promise<FlowRecordEntity> {
    const entity = flowRecordEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    const recordsPrefix = recordTypesUriPrefix(organization);
    // Phase Final Task 2: flow_records ROW half stripped.
    // Record miss is EntityNotFoundError (404) —
    // never missedReadError (would 403 foreign and
    // create an existence oracle; W1 / W7), the
    // work-order binding's instance-probe posture.
    const recordHead = await db.readTransaction(
        async (view) => deriveDocumentsAt(
            await view.messagePairs.getDocumentHistory(
                recordsPrefix, entity.record_id,
            ),
            recordsPrefix,
        ).get(entity.record_id),
    );
    if (recordHead === undefined) {
        throw new EntityNotFoundError(
            'records', entity.record_id,
        );
    }
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Flow tag document write — the codebase's FIRST message-plane-ONLY
// write (Phase 14 Task 9): no table, no row, no dual-write. The
// pair alone carries everything (path/name encode the
// document; the stored request's method distinguishes a PUT tag
// from a DELETE tombstone), so this op needs neither `id`
// nor `body` — the
// SAME shape identity-tokens/:id's own pair-only PUT rides (Phase
// 13 Task 9). `messagePair` is optional so a below-facade caller with no
// pair keeps compiling; ZERO seed tags means no such caller
// exists today (Step 0), but the shape stays uniform with every
// sibling op above.
export async function postFlowTagDocumentOp(
    db: DbAdapter,
    messagePair?: MessagePair,
): Promise<void> {
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return;
}

// Objective baseline-score document write. Phase Final Task 2:
// the project_objective_baseline_scores ROW half is stripped —
// pure message-plane write (postIdeaSubmissionOp shape).
// WRITE_RESPONSE_SPECS successBody forms the wire bytes.
// Exported so the seed can drive the same write path (Decision
// 6's below-facade carve-out). `messagePair` is optional so a
// below-facade caller with no pair keeps compiling; the live
// route always supplies one. `_actor` is unused: there is no
// state event here to author.
export async function postBaselineScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<
    ProjectObjectiveBaselineScoreEntity
> {
    const entity = scoreEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Objective actual-score document write. Phase Final Task 2:
// the project_objective_actual_scores ROW half is stripped —
// pure message-plane write, byte-twin of
// postBaselineScoreDocumentOp. WRITE_RESPONSE_SPECS forms the
// wire bytes. `_actor` is unused: no state event to author.
export async function postActualScoreDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<ProjectObjectiveActualScoreEntity> {
    const entity = scoreEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Membership document write — Phase Final Task 2: the
// memberships ROW half is stripped — pure message-plane write
// (postFlowTagDocumentOp shape). No states interaction
// (memberships never post events). `messagePair` is optional so a
// below-facade caller keeps compiling; the live route always
// supplies one. WRITE_RESPONSE_SPECS successBody forms the
// wire bytes; the reconstructed return is for type parity.
export async function postMembershipDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<MembershipEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<MembershipEntity, 'id'>;
    // Phase Final Task 2: memberships ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Member document write — Phase Final Task 2: the members
// ROW half is stripped — pure message-plane write. No states
// interaction (genesis/archive ride the membership SEAT via
// PUT/DELETE organizations/:id/members/:id,
// postMembershipDocumentOp). `messagePair` is optional so a
// below-facade caller keeps compiling; the live route always
// supplies one.
export async function postMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<MemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<MemberEntity, 'id'>;
    // Phase Final Task 2: members ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// AI-member document write — Phase Final Task 2: the
// ai_members ROW half is stripped — pure message-plane write.
// No states interaction. The composed POST edit arm at this
// route sits beside this PUT; verbs stay independent. `messagePair`
// is optional so a below-facade caller keeps compiling.
export async function postAiMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<AIMemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<AIMemberEntity, 'id'>;
    // Phase Final Task 2: ai_members ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Human-member document write — Phase Final Task 2: the
// human_members ROW half is stripped — pure message-plane
// write. NO live PUT exists on human-members/:id (get/post
// only); this op serves synthesis/seed callers. No states
// interaction. `messagePair` is optional so a below-facade caller
// keeps compiling.
export async function postHumanMemberDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<HumanMemberEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<HumanMemberEntity, 'id'>;
    // Phase Final Task 2: human_members ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Identity PII document write — Phase Final Task 2: the
// identity_pii ROW half is stripped — pure message-plane write.
// No states interaction. `messagePair` is optional so a below-
// facade caller keeps compiling; the live route always
// supplies one.
export async function postIdentityPiiDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<IdentityPiiEntity> {
    const entity = piiEntityOf(id, {
        name: 'pii',
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    // Phase Final Task 2: identity_pii ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Identity document write — Phase Final Task 2: the
// identities ROW half is stripped — pure message-plane write.
// No states interaction. `messagePair` is optional so a below-
// facade caller keeps compiling; the live route always
// supplies one.
export async function postIdentityDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<IdentityEntityFields> {
    const entity = withoutId(body) as unknown as
        IdentityEntityFields;
    // Phase Final Task 2: identities ROW half stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// AI-agent document write — message-plane only. Not a
// member and not an identity. `messagePair` is optional so a
// below-facade caller keeps compiling.
export async function postAiAgentDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<AIAgentEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<AIAgentEntity, 'id'>;
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Identity credential document write — Phase Final Task 2:
// the identity_credentials ROW half is stripped — pure
// message-plane write. No states interaction. `messagePair` is
// optional so a below-facade caller keeps compiling.
export async function postIdentityCredentialDocumentOp(
    db: DbAdapter,
    _id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<Omit<IdentityCredentialEntity, 'id'>> {
    const entity = withoutId(body) as unknown as
        Omit<IdentityCredentialEntity, 'id'>;
    // Phase Final Task 2: identity_credentials ROW half
    // stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// Client-registration document write (clients elimination) —
// pure message-plane write, the postIdentityCredentialDocumentOp
// shape: Supersedes-chained appendMessagePairOnce. `messagePair`
// is optional so a below-facade caller keeps compiling; the
// live route always supplies one. WRITE_RESPONSE_SPECS
// successBody forms the wire bytes via registrationEntityOf
// (GET derive). DELETE stays a marked tombstone (append).
export async function postClientRegistrationDocumentOp(
    db: DbAdapter,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<ClientRegistrationEntity> {
    const entity = registrationEntityOf(id, {
        name: '',
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
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


// Identity provider document write — Phase Final Task 2: the
// identity_providers ROW half is stripped (gate 1 DEFAULT:
// DELETE at Stage B) — pure message-plane write. Extracted so
// below-facade fixtures form pairs derivation can see.
export async function postIdentityProviderDocumentOp(
    db: DbAdapter,
    identityId: Id,
    id: Id,
    body: Record<string, unknown>,
    _actor: Id,
    messagePair?: MessagePair,
): Promise<IdentityProviderEntity> {
    const raw = withoutId(body);
    if (
        'identity_id' in raw
        && raw['identity_id'] !== identityId
    ) {
        throw new ApiError(
            'identity_id does not match path identity',
            HTTP_BAD_REQUEST,
        );
    }
    const stamped = { ...raw, identity_id: identityId };
    const entity = identityProviderEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: stamped,
    });
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

// The conditional a write takes (§2): optional for class A
// and every DELETE, required (If-Match or If-None-Match: *)
// for class B, in-order (If-Match) for class C, none for
// class D creates and class E operations.
export type Conditional =
    | 'optional'
    | 'required'
    | 'in-order'
    | 'none';

export type WriteMethod = 'PUT' | 'POST' | 'PATCH' | 'DELETE';

// The pre-tx response body for each pair-wired write —
// computed through the SAME validator/stamp its own handler
// applies, so the gate's precomputed body is byte-identical to
// the message plane's stored response (WRITE_RESPONSE_SPECS +
// responseFromStored). A spec with no successBody forms no
// response body. Keyed by route pattern, not verb: a DELETE
// never consults its successBody (the gate forms no body for
// any DELETE — see api/api.ts), so a pattern that carries both
// a PUT and a DELETE needs exactly one entry here, and its
// conditional governs both.
export interface WriteResponseSpec {
    readonly conditional: Conditional;
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
// plain WriteResponseSpec by the absence of `conditional` at
// the top level (see writeResponseSpecFor in api.ts).
export interface PerVerbWriteResponseSpec {
    readonly put?: WriteResponseSpec;
    readonly patch?: WriteResponseSpec;
    readonly post?: WriteResponseSpec;
    readonly delete?: WriteResponseSpec;
}

export const WRITE_RESPONSE_SPECS:
    Readonly<
        Record<string, WriteResponseSpec | PerVerbWriteResponseSpec>
    > = {
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody: it validates the
    // full wire document (entity + state) through the wiring's
    // OWN validator. G1 state families emit wiring.entityOf
    // (id first, state last — the GET derive), live writes
    // included: entityOf runs over the incoming body and
    // yields the same object GET derives from the head.
    'organizations/:id/ideas/:id':
        documentWriteResponseSpec(IDEAS_WIRING),
    'organizations/:id/ideas/:id/conversion': {
        conditional: 'optional',
    },
    'organizations/:id/ideas/:id/submissions/:sid': {
        conditional: 'optional',
        successBody: (params, body) =>
            ideaSubmissionEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale.
    'organizations/:id/projects/:id':
        documentWriteResponseSpec(PROJECTS_WIRING),
    'organizations/:id/projects/:id/flows/:pfid': {
        conditional: 'optional',
        successBody: (params, body) =>
            projectFlowEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    'organizations/:id/flows/': {
        conditional: 'none',
        // The receipt shares the document name. An empty
        // body matches a DELETE tombstone, so a recreate
        // would store nothing.
        successBody: (_params, body) => body ?? {},
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. A flow is class B:
    // every PUT names the head it replaces or declares its
    // genesis.
    'organizations/:id/flows/:id': {
        ...documentWriteResponseSpec(FLOWS_WIRING),
        conditional: 'required',
    },
    'organizations/:id/flows/:id/undo': {
        conditional: 'in-order',
    },
    // flows/:id/versions[+/:vid] WRITE_RESPONSE_SPECS RETIRED
    // (Phase 15 Task 7): ZERO seed pairs at those documents.
    'organizations/:id/work-orders/': {
        conditional: 'none',
        // The receipt shares the document name. An empty
        // body matches a DELETE tombstone, so a recreate
        // would store nothing.
        successBody: (_params, body) => body ?? {},
    },
    'organizations/:id/work-orders/:id':
        documentWriteResponseSpec(WORK_ORDERS_WIRING),
    'organizations/:id/work-orders/:id/claim': {
        conditional: 'optional',
        // The response is the claim document. An empty
        // body matches every other empty claim, so a
        // new claim would store nothing.
        successBody: (_params, body) => body ?? {},
    },
    'organizations/:id/work-orders/:id/transition': {
        conditional: 'optional',
    },
    'organizations/:id/work-orders/:id/binding': {
        conditional: 'optional',
    },
    'organizations/:id/flows/:id/work-orders/:woid': {
        conditional: 'optional',
        successBody: (params, body) =>
            flowWorkOrderEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    // Nested composed POST (Task 9 / Task 23): 204 op response;
    // document + attribute pairs form at nested documents.
    [RECORD_TYPES_COLLECTION_PATTERN]: {
        conditional: 'optional',
        // The receipt shares the document name. An empty
        // body matches a DELETE tombstone, so a recreate
        // would store nothing.
        successBody: (_params, body) => body ?? {},
    },
    // Nested record-types detail (Task 3): put-only per-verb
    // entry. Id is param 1 (:record-type-id); organization_id
    // is param 0 (path org, already org-matched at the gate).
    [RECORD_TYPE_DETAIL_PATTERN]: {
        put: {
            conditional: 'optional',
            successBody: (params, body) => {
                const raw = withoutId(body ?? {});
                validateRecordDocumentBody(raw);
                const id = param(params, 1);
                const organization = param(params, 0);
                return recordTypeEntityOf(
                    {
                        name: id,
                        messagePairId: id,
                        method: 'PUT',
                        body: raw,
                    },
                    organization,
                );
            },
        },
        delete: { conditional: 'optional' },
    },
    // Nested attributes detail (Task 7): put-only. Params:
    // 0=org, 1=type, 2=attribute. Path-derived echoes for
    // organization_id / record_type_id. Create stamps ACL
    // defaults when keys omitted; replace requires both —
    // successBody picks by key presence for the response
    // shape; the handler re-checks against head presence.
    [ATTRIBUTE_DETAIL_PATTERN]: {
        put: {
            conditional: 'optional',
            successBody: (params, body) =>
                nestedAttributeWireOf(
                    param(params, 0),
                    param(params, 1),
                    param(params, 2),
                    withoutId(body ?? {}),
                ),
        },
        delete: { conditional: 'optional' },
    },
    // Instances: PATCH creates with If-None-Match: * and
    // updates with If-Match; the former answers the state.
    [INSTANCE_DETAIL_PATTERN]: {
        patch: { conditional: 'required' },
        delete: { conditional: 'optional' },
    },
    'organizations/:id/flows/:id/records/:frid': {
        conditional: 'optional',
        successBody: (params, body) =>
            flowRecordEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    // The ONE validation site for a tag PUT (Phase 14 Task 9):
    // the tag NAME (param 2, the document's own name) through
    // validateFlowTagName; the body through flowTagEntityOf.
    // Both run pre-tx while the pair is formed, so a
    // malformed name or body throws BEFORE anything is stored
    // (the ideas/:id/submissions/:sid precedent above). GET/DELETE
    // never re-validate the name (route comment); `flow_id` is
    // stamped from the document here, never a client body key.
    'organizations/:id/flows/:id/tags/:name': {
        conditional: 'optional',
        successBody: (params, body) =>
            flowTagEntityOf(param(params, 1), {
                name: validateFlowTagName(param(params, 2)),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    'organizations/:id/objectives/': {
        conditional: 'none',
    },
    // The generic document-form builder (api/document-family.ts)
    // absorbs the hand-written successBody — see the ideas/:id
    // entry above for the shared rationale. G1: objectives/:id
    // emits objectiveDocumentEntityOf (id first, state last).
    'organizations/:id/objectives/:id':
        documentWriteResponseSpec(OBJECTIVES_WIRING),
    'organizations/:id/objectives/:id/revisions/:rid': {
        conditional: 'optional',
        successBody: (params, body) =>
            objectiveRevisionEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    ['organizations/:id/projects/:id'
        + '/objective-baseline-scores/:sid']: {
        conditional: 'optional',
        successBody: (params, body) => {
            const raw = withoutId(body ?? {});
            validateBaselineScoreEntity(raw);
            return scoreEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: raw,
            });
        },
    },
    ['organizations/:id/projects/:id'
        + '/objective-actual-scores/:sid']: {
        conditional: 'optional',
        successBody: (params, body) => {
            const raw = withoutId(body ?? {});
            validateActualScoreEntity(raw);
            return scoreEntityOf({
                name: param(params, 2),
                messagePairId: param(params, 2),
                method: 'PUT',
                body: raw,
            });
        },
    },
    'identities/': { conditional: 'none' },
    // G3: identities/:id emits identityDocumentEntityOf
    // (GET derive). Creation and the human-member half share
    // this spec via formDocumentMessagePairFor.
    'identities/:id': documentWriteResponseSpec(IDENTITIES_WIRING),
    'ai-agents/:id': documentWriteResponseSpec(AI_AGENTS_WIRING),
    // G5: piiEntityOf (GET derive). DELETE is a marked
    // tombstone pair; PUT appends.
    'identities/:id/pii': {
        conditional: 'optional',
        successBody: (params, body) => piiEntityOf(
            param(params, 0),
            {
                name: 'pii',
                messagePairId: param(params, 0),
                method: 'PUT',
                body: withoutId(body ?? {}),
            },
        ),
    },
    // The written row's `secret` rides the wire here — a
    // deliberate zero-change carry-over (see the route comment
    // above 'identities/:id/credentials/:cid' in the routes
    // array).
    'identities/:id/credentials/:cid': {
        conditional: 'optional',
        successBody: (params, body) => ({
            id: param(params, 1),
            ...validateIdentityCredentialEntity(
                withoutId(body ?? {}),
            ),
        }),
    },
    // G5: registrationEntityOf (GET derive). DELETE is a
    // marked tombstone (append), not a slot replace.
    'identities/:id/registration': {
        conditional: 'optional',
        successBody: (params, body) =>
            registrationEntityOf(param(params, 0), {
                name: '',
                messagePairId: param(params, 0),
                method: 'PUT',
                body: withoutId(body ?? {}),
            }),
    },
    // The default organization's state: the identity's id
    // and the organization it names (§4), the singleton
    // shape pii and registration use.
    'identities/:id/default-organization': {
        conditional: 'optional',
        successBody: (params, body) => ({
            id: param(params, 0),
            ...validateDefaultOrganizationBody(body ?? {}),
        }),
    },
    // Seat document: path is the relationship. Body is
    // type + at. organization_id / identity_id are
    // reconstructed from the path for the wire entity.
    [ORGANIZATION_MEMBER_DETAIL_PATTERN]: {
        conditional: 'optional',
        successBody: (params, body) => {
            const organization = param(params, 0);
            const identityId = param(params, 1);
            const seat = validateSeatDocumentBody(
                withoutId(body ?? {}),
            );
            return {
                id: identityId,
                organization_id: organization,
                identity_id: identityId,
                type: seat.type,
                at: seat.at,
            };
        },
    },
    // G4: GET wins. identityTokenEntityOf is id-first;
    // identity_id is stamped from the path so stored PUT
    // = GET (omit-PUT cannot poison GET).
    'identities/:id/tokens/:jti': {
        conditional: 'optional',
        successBody: (params, body) =>
            identityTokenEntityOf({
                name: param(params, 1),
                messagePairId: param(params, 1),
                method: 'PUT',
                body: {
                    ...withoutId(body ?? {}),
                    identity_id: param(params, 0),
                    jti: param(params, 1),
                },
            }),
    },
    // G4: tokenRevocationEntityOf (GET derive). identity_id
    // is stamped from the path so stored PUT = GET
    // (omit-PUT cannot poison GET).
    'identities/:id/token-revocations/:rid': {
        conditional: 'optional',
        successBody: (params, body) =>
            tokenRevocationEntityOf({
                name: param(params, 1),
                messagePairId: param(params, 1),
                method: 'PUT',
                body: {
                    ...withoutId(body ?? {}),
                    identity_id: param(params, 0),
                },
            }),
    },
    // The gate PRE-MINTS the successor jti here — the ONE
    // mint site for a fresh write. The route handler reads this
    // exact value back off the formed pair (messagePairResponseBody)
    // rather than minting a second one.
    'identities/:id/tokens/:jti/rotation': {
        conditional: 'none',
        successBody: () => ({
            jti: generateIdentifier(),
        }),
    },
    'identities/:id/tokens/:jti/revocation': {
        conditional: 'none',
    },
    // G3: GET wins. Stored PUT = GET, `id` first.
    'organizations/:id': {
        conditional: 'optional',
        successBody: (params, body) => organizationEntityOf({
            name: param(params, 0),
            messagePairId: param(params, 0),
            method: 'PUT',
            body: withoutId(body ?? {}),
        }),
    },
    // G4: identityProviderEntityOf (GET derive). identity_id
    // is stamped from the path so stored PUT = GET.
    'identities/:id/providers/:eid': {
        conditional: 'optional',
        successBody: (params, body) =>
            identityProviderEntityOf({
                name: param(params, 1),
                messagePairId: param(params, 1),
                method: 'PUT',
                body: {
                    ...withoutId(body ?? {}),
                    identity_id: param(params, 0),
                },
            }),
    },
    // The grants and the invitation routes form their own
    // pairs; their conditional is still the gate's.
    'authentication/token': { conditional: 'none' },
    'authentication/authorize': { conditional: 'none' },
    'organizations/:id/invitations/': {
        conditional: 'none',
    },
    'identities/:id/invitations/:id': {
        conditional: 'optional',
    },
    'organizations/:id/invitations/:id': {
        conditional: 'optional',
    },
};

// Every write route declares its conditional. A route that
// does not is a fault in this table, never an unguarded
// write.
export function conditionalOf(
    routePattern: string,
    method: WriteMethod,
): Conditional {
    const entry = WRITE_RESPONSE_SPECS[routePattern];
    if (entry === undefined) {
        throw new Error(
            'no conditional for write route: ' + routePattern,
        );
    }
    if ('conditional' in entry) {
        return entry.conditional;
    }
    const spec = method === 'PUT'
        ? entry.put
        : method === 'PATCH'
            ? entry.patch
            : method === 'DELETE'
                ? entry.delete
                : entry.post;
    if (spec === undefined) {
        throw new Error(
            'no conditional for ' + method + ' '
                + routePattern,
        );
    }
    return spec.conditional;
}

// The plain/PerVerb resolution every route-inline document-pair
// block shares (Phase 9 Task 2): a plain WriteResponseSpec
// answers for itself ('conditional' at the top level); a
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
        : 'conditional' in entry ? entry : entry.put;
    if (spec === undefined) {
        throw new Error(
            'no per-write response spec for'
            + ' ' + routePattern,
        );
    }
    return spec;
}

export interface DocumentMessagePairFormInput {
    readonly routePattern: string;
    // Pattern params, in order (e.g. ['members/:id']'s single
    // :id, or ['projects/:id/objective-baseline-scores/:sid']'s
    // [projectId, baselineId]).
    readonly params: readonly Id[];
    // undefined only for the record-attribute DELETE tombstone
    // sites, which carry no body — mirroring WriteMessagePairInput's own
    // body: Record<string, unknown> | undefined.
    readonly body: Record<string, unknown> | undefined;
    readonly requesterIdentityId: Id;
    readonly requestAt: string;
    readonly organization: Id | undefined;
    readonly method?: 'PUT' | 'DELETE';
    // The spec-less tombstone sites (finding 10 i): an explicit
    // response, bypassing WRITE_RESPONSE_SPECS entirely.
    readonly response?: {
        readonly status: number;
        readonly body: unknown;
    };
    // A synthesized PUT that restores a flow (undo)
    // latches the head it restored from; the statement
    // judges that latch.
    readonly latchedHeadMessagePairId?: string;
    readonly headerFields?: readonly FieldLine[];
    readonly operationId: string;
    readonly requestId: string;
}

// The shared document-pair former (Phase 9 Task 2, Commandment
// IX): replaces every route-inline formWriteMessagePair block that
// shared this ONE core shape — resolve the response, resolve the
// document, form the pair. Lives beside WRITE_RESPONSE_SPECS
// (routes.ts, not message-pair.ts): the specs live here, and
// message-pair.ts must never import routes.ts (Step 0(c) — the
// import graph stays acyclic; routes.ts already imports
// formWriteMessagePair FROM message-pair.ts, so the dependency runs
// one way only). Builds the pair PRE-TX only — the in-tx
// appendMessagePairOnce calls stay at each op's own transaction.
export async function formDocumentMessagePairFor(
    input: DocumentMessagePairFormInput,
): Promise<MessagePair> {
    const routeSegments = input.routePattern.split('/');
    let nextParam = 0;
    const pathSegments = routeSegments.map((segment) =>
        segment.startsWith(':')
            ? input.params[nextParam++]!
            : segment,
    );
    let responseBody: unknown;
    if (input.response !== undefined) {
        responseBody = input.response.body;
    } else {
        const spec = resolveWriteResponseSpec(input.routePattern);
        responseBody = spec.successBody?.(
            [...input.params], input.body,
            input.requesterIdentityId, input.organization,
        );
    }
    return formWriteMessagePair({
        method: input.method ?? 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: input.routePattern,
        routeSegments,
        pathSegments,
        headerFields: input.headerFields ?? [],
        body: input.body,
        requesterIdentityId: input.requesterIdentityId,
        requestAt: input.requestAt,
        organization: input.organization,
        responseBody,
        operationId: input.operationId,
        requestId: input.requestId,
        ...(input.latchedHeadMessagePairId !== undefined
            ? { latchedHeadMessagePairId: input.latchedHeadMessagePairId }
            : {}),
    });
}

// Instance DELETE tombstone append (Task 18 / R4 / R9).
// Spent document = any prior response at the instance
// name (live head OR existing tombstone). Virgin
// document → missedReadError (R2). Spent → append the
// gate-formed DELETE pair in one tx (R4 tombstone-wins
// is ledger-complete — every non-replay DELETE appends,
// including over an already-tombstoned head). In-tx
// re-probe (R9) closes a concurrent un-spend race:
// never treat a virgin document as tombstonable. W5
// placement RESTRICT: any org WO whose CURRENT bind
// names this instance AND whose current node is
// non-terminal in its OWN frozen flow_graph → 409.
// No attribute ACL — path-tier only (existence, not
// values). If-Match on DELETE is not a dialect (gate
// ignores it).
export async function postInstanceDeleteOp(
    db: DbAdapter,
    p: string[],
    _actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    _roles: readonly string[],
): Promise<void> {
    const org = requireOrganization(organization);
    const typeId = param(p, 1);
    const instanceId = param(p, 2);
    await requireRecordTypeExists(db, org, typeId);
    if (messagePair === undefined) {
        throw new Error(
            'instance DELETE requires a formed pair',
        );
    }
    const prefix = instancesUriPrefix(org, typeId);
    const spentPre = await instanceDocumentSpent(
        db, prefix, instanceId,
    );
    if (!spentPre) {
        throw await missedReadError(
            db, instanceId, org, 'record_instances',
        );
    }
    // Re-probe spent before the statement so a
    // concurrent writer cannot leave us appending a
    // tombstone onto a virgin document.
    await db.readTransaction(async (view) => {
        const spent = await instanceDocumentSpent(
            view, prefix, instanceId,
        );
        if (!spent) {
            throw await missedReadError(
                view, instanceId, org,
                'record_instances',
            );
        }
        // W5: RESTRICT while any bind is in-flight
        // (non-terminal current node on that WO's
        // frozen graph). Terminal + unbound free.
        const blockers =
            await inFlightPlacementBlockersFor(
                view, org, instanceId,
            );
        if (blockers.length > 0) {
            throw new ApiError(
                'record instance ' + instanceId
                + ' is placed in-flight on work'
                + ' order(s) '
                + blockers.join(', '),
                HTTP_CONFLICT,
            );
        }
    });
    await runWrite(
        db, attemptFor([messagePair]), [messagePair],
    );
}

// Org WOs whose CURRENT bind names `instanceId` AND
// whose current node is non-terminal in that WO's own
// frozen flow_graph. Cost-ordered, entity-scoped in-tx
// reads only (collectAttributeReferrers shape): ONE
// collection-prefix WO-heads read; binding/lifecycle
// only for candidates that still bind this instance.
// Current node = latest non-claim lifecycle state's
// `state`; a WO with no transition yet sits at its
// graph's isCreate node. Terminal = no outgoing edge.
async function inFlightPlacementBlockersFor(
    view: DbAdapter,
    organization: Id,
    instanceId: Id,
): Promise<string[]> {
    const workOrdersPrefix = canonicalPath(
        organization, '/work-orders/',
    );
    const woMessagePairs = await view.messagePairs.getCollectionPairs(
        workOrdersPrefix,
    );
    const woHeads = deriveDocumentsAt(
        woMessagePairs, workOrdersPrefix,
    );
    const blockers: string[] = [];
    for (const [woId, doc] of woHeads) {
        const bind = await workOrderBindingFor(
            view, organization, woId,
        );
        if (
            bind === null
            || bind.instanceId !== instanceId
        ) {
            continue;
        }
        const graph = asWorkOrderFlowGraph(
            doc.body['flow_graph'],
            'work_orders.flow_graph',
        );
        const lifecycle =
            await workOrderLifecycleStatesFor(
                view, organization, woId,
            );
        const nodeId = currentNodeIdFor(
            lifecycle, graph,
        );
        if (nodeId === undefined) {
            continue;
        }
        const inFlight = graph.edges.some(
            (edge) => edge.fromNodeId === nodeId,
        );
        if (inFlight) {
            blockers.push(woId);
        }
    }
    return blockers;
}

async function instanceDocumentSpent(
    db: DbAdapter,
    prefix: string,
    instanceId: Id,
): Promise<boolean> {
    const messagePairs =
        await db.messagePairs.getDocumentHistory(
            prefix, instanceId,
        );
    return messagePairs.length > 0;
}

// An instance's whole state (§4): the GET's shape with
// every value, stored on each revision.
export function instanceStateOf(
    organization: Id,
    typeId: Id,
    instanceId: Id,
    values: readonly InstanceValue[],
): Record<string, unknown> {
    return {
        id: instanceId,
        organization_id: organization,
        record_type_id: typeId,
        values,
    };
}

// What this requester may read of an instance's state.
export function instanceProjection(
    attributesById: ReadonlyMap<string, AttributeSchemaRow>,
    roles: readonly string[],
): StateProjection {
    return (state) => ({
        ...state,
        values: projectReadableValues(
            revisionValuesOf(state), attributesById, roles,
        ),
    });
}

// Instance create: PATCH with If-None-Match: * (§3). The
// client declares the genesis; the statement judges it.
// Tombstone-wins is this family's rule, not the ledger's:
// the statement refuses a never-written create over a
// tombstone, so a retired name never comes back.
async function postInstanceCreateOp(
    db: DbAdapter,
    p: string[],
    body: Record<string, unknown>,
    messagePair: MessagePair,
    organization: Id | undefined,
    roles: readonly string[],
): Promise<void> {
    const org = requireOrganization(organization);
    const typeId = param(p, 1);
    const instanceId = param(p, 2);
    await requireRecordTypeExists(db, org, typeId);
    const validated = validateInstancePutBody(body);
    const attributesById = await loadAttributeSchemaById(
        db, org, typeId,
    );
    assertWritableAttributeIds(
        validated.set.map((entry) => entry.attribute_id),
        attributesById,
        roles,
    );
    validateInstanceValues(validated.set, attributesById);
    const prefix = instancesUriPrefix(org, typeId);
    await runStateWrite(db, {
        kind: 'siblings',
        received: messagePair,
        siblings: [{
            method: 'PUT',
            path: prefix,
            name: instanceId,
            state: instanceStateOf(
                org, typeId, instanceId,
                mergeInstanceValues([], { set: validated.set }),
            ),
            condition: {
                kind: 'never-written', declarer: 'client',
            },
        }],
        project: instanceProjection(attributesById, roles),
        answer: { kind: 'parent' },
    });
}

// Gone only after the owner check passes: a foreign
// organization's retired instance answers as its live one
// does, so a 410 never reveals that it existed.
async function retiredInstanceError(
    db: DbAdapter,
    instanceId: Id,
    organization: Id,
): Promise<RetiredEntityError | ForeignOrganizationError> {
    const missed = await missedReadError(
        db, instanceId, organization, 'record_instances',
    );
    if (missed instanceof ForeignOrganizationError) {
        return missed;
    }
    return new RetiredEntityError('record_instances', instanceId);
}

// Instance update: PATCH with If-Match (§1 C). The handler
// reads the head to merge; the statement judges the tag.
export async function postInstancePatchOp(
    db: DbAdapter,
    p: string[],
    body: Record<string, unknown>,
    _actor: Id,
    messagePair: MessagePair | undefined,
    organization: Id | undefined,
    roles: readonly string[],
): Promise<void> {
    if (messagePair === undefined) {
        throw new Error(
            'instance PATCH requires a formed pair',
        );
    }
    if (messagePair.genesis === 'client') {
        return postInstanceCreateOp(
            db, p, body, messagePair, organization, roles,
        );
    }
    const tag = ifMatchFromMessagePair(messagePair);
    if (tag === undefined) {
        throw new Error(
            'the gate admitted an instance PATCH with no'
                + ' conditional',
        );
    }
    const org = requireOrganization(organization);
    const typeId = param(p, 1);
    const instanceId = param(p, 2);
    const prefix = instancesUriPrefix(org, typeId);
    const head = await deriveInstanceHead(
        db, org, typeId, instanceId,
    );
    if (
        head === undefined
        && await documentHeadAt(db, prefix, instanceId) !== null
    ) {
        throw await retiredInstanceError(db, instanceId, org);
    }
    const attributesById = await loadAttributeSchemaById(
        db, org, typeId,
    );
    const validated = validateInstancePatchBody(body);
    assertWritableAttributeIds(
        [
            ...validated.set.map((entry) => entry.attribute_id),
            ...validated.clear,
        ],
        attributesById,
        roles,
    );
    validateInstanceValues(validated.set, attributesById);
    // A never-written instance merges onto no values; the
    // tag names no head, so the statement answers 412.
    const values = head === undefined ? [] : head.values;
    await runStateWrite(db, {
        kind: 'siblings',
        received: messagePair,
        siblings: [{
            method: 'PUT',
            path: prefix,
            name: instanceId,
            state: instanceStateOf(
                org, typeId, instanceId,
                mergeInstanceValues(values, {
                    set: validated.set,
                    clear: validated.clear,
                }),
            ),
            condition: { kind: 'in-order', head: tag },
        }],
        project: instanceProjection(attributesById, roles),
        answer: { kind: 'parent' },
    });
}

// Offer only: the dedicated arm in handleRequest
// intercepts these patterns before matched.post.
// Reaching this function is a wiring bug.
async function authGrantOffered(): Promise<never> {
    throw new Error(
        'authentication grant is dispatched by'
        + ' the dedicated arm',
    );
}

// PUT /organizations/:id — the tenant root's document,
// a pure message-plane write. The response is the entity
// organizationEntityOf forms.
export async function postOrganizationDocumentOp(
    db: DbAdapter,
    p: string[],
    body: Record<string, unknown>,
    _actor: Id,
    messagePair: MessagePair | undefined,
) {
    const id = param(p, 0);
    const entity = organizationEntityOf({
        name: id,
        messagePairId: id,
        method: 'PUT',
        body: withoutId(body),
    });
    // Phase Final Task 2: organizations ROW half
    // stripped.
    if (messagePair !== undefined) {
        await runWrite(
            db,
            attemptFor([messagePair]),
            [messagePair],
        );
    }
    return entity;
}

export const routes: Route[] = [
    route('identities/', {
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
        // document message pair (+ the credential-document
        // message pair for a service) INLINE PRE-TX, beside
        // the gate's own operation message pair. See
        // postIdentityCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, messagePair, organization,
        ) => {
            let messagePairs: IdentityWriteMessagePairs | undefined;
            if (
                messagePair !== undefined && organization !== undefined
            ) {
                const b = validateIdentityCreateBody(body);
                const identityDocument =
                    await formDocumentMessagePairFor({
                        routePattern: 'identities/:id',
                        params: [b.id],
                        body: identityDocumentBodyOf(b.kind),
                        requesterIdentityId: actor,
                        requestAt: messagePair.requestAt,
                        operationId: messagePair.operationId,
                        requestId: messagePair.requestId,
                        organization,
                    });
                if (b.kind === 'service') {
                    const { id: credId, ...fields } =
                        b.credential as {
                            id: string;
                            secret: string;
                        } & Record<string, unknown>;
                    if (typeof fields.secret !== 'string'
                        || fields.secret === '') {
                        throw new ValidationError(
                            'IdentityCreateServiceBody'
                            + '.credential.secret must'
                            + ' be a non-empty string',
                        );
                    }
                    const credentialDocument =
                        await formDocumentMessagePairFor({
                            routePattern:
                                'identities/:id/credentials/:cid',
                            params: [b.id, credId],
                            body: {
                                ...fields,
                                secret: await hashPassword(
                                    fields.secret,
                                ),
                            },
                            requesterIdentityId: actor,
                            requestAt: messagePair.requestAt,
                            operationId: messagePair.operationId,
                            requestId: messagePair.requestId,
                            organization,
                        });
                    messagePairs = {
                        kind: 'service',
                        operation: messagePair,
                        identityDocument,
                        credentialDocument,
                    };
                } else {
                    messagePairs = {
                        kind: 'person',
                        operation: messagePair,
                        identityDocument,
                    };
                }
            }
            return postIdentityCreationOp(db, body, messagePairs);
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
    // Singleton SET document. Self-only in the handler
    // (actor === :id); admin-everywhere is not a
    // substitute. Storage prefix stays
    // /identities/:id/default-organization/.
    route('identities/:id/default-organization', {
        get: getIdentityDefaultOrganization,
        put: putIdentityDefaultOrganization,
    }),
    route('identities/:id/organizations/', {
        get: getIdentityOrganizations,
    }),
    // Invitation receive nest. Storage prefix stays
    // /invitations/. Two HTTP nests are filters and
    // authorization, not two documents.
    route('identities/:id/invitations/', {
        get: getIdentityInvitations,
    }),
    route('identities/:id/invitations/:id', {
        get: getInvitationOnIdentityNest,
        put: putInvitationOnIdentityNest,
    }),
    route('identities/:id/invitations/:id/versions/', {
        get: getInvitationVersionsOnIdentityNest,
    }),
    route(
        'identities/:id/invitations/:id/versions/:etag',
        {
            get: getInvitationVersionOnIdentityNest,
        },
    ),
    documentCollectionRoute(AI_AGENTS_WIRING),
    route('ai-agents/:id', {
        get: documentGetHandler(AI_AGENTS_WIRING),
        put: documentPutHandler(AI_AGENTS_WIRING),
    }),
    documentVersionListRoute(IDENTITIES_WIRING),
    documentVersionRoute(IDENTITIES_WIRING),
    documentVersionListRoute(AI_AGENTS_WIRING),
    documentVersionRoute(AI_AGENTS_WIRING),
    // PII is a facet of the identity's own subtree: GET is
    // self-or-admin, PUT/DELETE self-or-admin (enforced in
    // the request gate, mirroring
    // /identities/:id/default-organization). There is no
    // flat identity-pii collection (retired, router 404).
    // PUT/DELETE each append a message pair in the same
    // transaction as the write. DELETE is a marked tombstone.
    // The pattern's last segment ('pii') is not a :param, so
    // pathAndNameOf yields name '' (a singleton document at
    // a collection-style path). GET is FLIPPED (Phase 10
    // Task 8): derived via deriveIdentityPii — wire-identical
    // to the hand-written db.identityPii.getById dispatch it
    // replaces.
    // authorizeIdentityPii (the gate dispatch) restricts a GET
    // to self or admin. The handler then applies the same
    // viaMembership org fence credentials use: foreign 403,
    // orphan visible. A member never reads another identity's
    // pii.
    route('identities/:id/pii', {
        get: async (db, p, actor, organization) => {
            const organizationId = requireOrganization(
                organization,
            );
            const identityId = param(p, 0);
            const row = await deriveIdentityPii(
                db, identityId,
            );
            const memberships =
                await membershipsAcrossAllOrganizations(
                    db, actor,
                );
            const owner =
                ownerOrganizationViaMembershipPairPlane(
                    memberships, identityId, organizationId,
                );
            if (owner !== null
                && owner !== organizationId) {
                throw new ForeignOrganizationError(
                    'identity_pii', identityId,
                );
            }
            return row;
        },
        put: (db, p, body, actor, messagePair) =>
            postIdentityPiiDocumentOp(
                db, param(p, 0), body, actor, messagePair,
            ),
        delete: async (db, _p, _actor, messagePair) => {
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
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
    // derived via deriveCredentialsFor, fenced via gate 15
    // (keyed on the PARENT identity id rather than each
    // row's own id) — a
    // hidden identity's credentials read as an EMPTY array, byte-
    // identical to parentScope.getAllWhere silently dropping every
    // matched-but-invisible row (never a 404 — getAllWhere never
    // throws).
    // FENCE-INPUT FIX (post-session review): the path :id only
    // keys the ledger scan (deriveCredentialsFor reads the
    // /identities/{path id}/credentials/ prefix — that is where
    // the pairs live); the pre-flip fence read each ROW's OWN
    // identity_id field (parentScope's getAllWhere on identity_id,
    // path id) filters the OLD-plane store by that field BEFORE
    // fencing, then viaMembership fences on that SAME field). A
    // below-facade write whose body.identity_id disagrees with
    // its own document (producible below-facade, or via a hand-
    // crafted admin PUT — no validator ties body.identity_id to
    // the path :id, so an admin-crafted request CAN produce it;
    // only a web-app-generated request cannot) would otherwise
    // fence on the wrong identity. Reproduced here by filtering the
    // derived rows to identity_id === the path id FIRST — exactly
    // the OLD plane's WHERE — so a mismatched row never survives
    // to the fence step, on either plane.
    route('identities/:id/credentials/', {
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
    // (post-session review): the path :id only keys the
    // scan (deriveCredential reads the row at
    // /identities/{path id}/credentials/{cid} — that is where
    // the pair lives); the pre-flip fence read the ROW's OWN
    // identity_id field — the hand-written route this flip
    // replaced ignored the path entirely, fetching by cid
    // alone via parentScope.getById, which then fenced via
    // viaMembership on the ROW's stored identity_id. So the
    // fence input below is `credential.identity_id`, never the
    // path — a below-facade write whose body.identity_id
    // disagrees with its own document now fences EXACTLY as the
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
        put: (db, p, body, actor, messagePair) =>
            postIdentityCredentialDocumentOp(
                db, param(p, 1), body, actor, messagePair,
            ),
    }),
    // The client-registration facet (clients elimination):
    // client = kind-'service' identity + this single-slot
    // PUT-overwrite document. Hand-written closure — the
    // pii/credentials precedent; documentGet/PutHandler only
    // serve 2-segment family/:id patterns. ADMIN-ONLY via
    // deny-by-default (/identities has no MEMBER_VERBS
    // entry); GLOBAL plane (no org nesting, no
    // write authorizer). DELETE is a marked tombstone =
    // deregistration; the gate forms the 204 pair, the
    // handler appends it — idempotent by construction.
    route('identities/:id/registration', {
        get: async (db, p) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return deriveClientRegistration(db, identityId);
        },
        put: async (db, p, body, actor, messagePair) => {
            const identityId = param(p, 0);
            await requireServiceIdentity(db, identityId);
            return postClientRegistrationDocumentOp(
                db, identityId, body, actor, messagePair,
            );
        },
        delete: async (db, p, _actor, messagePair) => {
            await requireServiceIdentity(db, param(p, 0));
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return;
        },
    }),
    // Nested token-revocations (tokens/providers shape). No
    // collection route. GET is admin-only (not in
    // MEMBER_VERBS). PUT is member-legal via
    // '/identities/:id/token-revocations' PUT; Region B
    // keeps it self-only (path identity vs actor). Flat
    // /identity-token-revocations is retired (router 404).
    // EVENT-APPEND: no head-read, no Supersedes. Path
    // identity is the document — stamped on write and GET.
    route('identities/:id/token-revocations/:rid', {
        get: (db, p) =>
            deriveTokenRevocation(
                db, param(p, 0), param(p, 1),
            ),
        put: async (db, p, body, _actor, messagePair) => {
            const identityId = param(p, 0);
            const id = param(p, 1);
            const raw = withoutId(body);
            if (
                'identity_id' in raw
                && raw['identity_id'] !== identityId
            ) {
                throw new ApiError(
                    'identity_id does not match path identity',
                    HTTP_BAD_REQUEST,
                );
            }
            const stamped = {
                ...raw, identity_id: identityId,
            };
            const entity = tokenRevocationEntityOf({
                name: id,
                messagePairId: id,
                method: 'PUT',
                body: stamped,
            });
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return entity;
        },
    }),
    // Nested token events (credentials/providers shape).
    // GET is admin-only (not in MEMBER_VERBS). POST on
    // rotation/revocation stays member-legal via
    // '/identities/:id/tokens' POST. Flat /identity-tokens
    // is retired (router 404).
    route('identities/:id/tokens/', {
        get: (db, p) =>
            deriveIdentityTokensFor(db, param(p, 0)),
    }),
    // Hand-written so PUT can stamp identity_id from the
    // path (the Task 3 hole: omit-PUT must not poison GET)
    // and append its message pair without a row write.
    // GET is FLIPPED: derived via deriveIdentityToken —
    // 404 body unchanged. PUT is PAIR-ONLY.
    route('identities/:id/tokens/:jti', {
        get: (db, p) =>
            deriveIdentityToken(
                db, param(p, 0), param(p, 1),
            ),
        put: async (db, p, body, _actor, messagePair) => {
            const identityId = param(p, 0);
            const jti = param(p, 1);
            const raw = withoutId(body);
            if (
                'identity_id' in raw
                && raw['identity_id'] !== identityId
            ) {
                throw new ApiError(
                    'identity_id does not match path identity',
                    HTTP_BAD_REQUEST,
                );
            }
            if ('jti' in raw && raw['jti'] !== jti) {
                throw new ApiError(
                    'jti does not match path jti',
                    HTTP_BAD_REQUEST,
                );
            }
            const stamped = {
                ...raw, identity_id: identityId, jti,
            };
            const entity = identityTokenEntityOf({
                name: jti,
                messagePairId: jti,
                method: 'PUT',
                body: stamped,
            });
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return entity;
        },
    }),
    // Rotate a refresh jti. The path identity's own tokens
    // collection is the only ledger this reads: a jti outside
    // it is unknown — 409, the same status as reuse (spec
    // 2026-09-15 § 1). The ledger read, the
    // rotation plan, and its appends ride ONE transaction
    // (rotateRefreshJti — the same body the refresh grant
    // runs), so two concurrent rotations of one chain
    // cannot both observe the live jti (the lost-rotation
    // TOCTOU). A live jti returns its successor; a
    // known-but-not-live jti is reuse — the whole chain's
    // revocation has already landed atomically — then 409.
    // Operation path (name ''). The gate never serves
    // a stored response for a byte-identical resend of this
    // route, so this handler always re-enters and re-checks
    // the reuse guard for real. The gate's successBody
    // resolver PRE-MINTS the successor jti so the pair IS the
    // response; this handler reads that SAME value back off
    // the pair (messagePairResponseBody) and threads it into
    // rotateRefreshJti, which appends the pair as the LAST act
    // of its own transaction — only on the 'rotate' branch, so
    // a 409 (reuse or unknown) stores no pair even though the
    // reuse branch still revokes the chain for real. When pair
    // is undefined (unreachable for this wired, fenced route)
    // a fresh jti is minted here instead — crash-free.
    route('identities/:id/tokens/:jti/rotation', {
        post: async (db, p, _body, _actor, messagePair) => {
            const identityId = param(p, 0);
            const presented = param(p, 1);
            const newJti = messagePair === undefined
                ? generateIdentifier()
                : (messagePairResponseBody(messagePair)?.['jti'] as
                    string | undefined)
                    ?? generateIdentifier();
            const outcome = await rotateRefreshJti(
                db, identityId, presented, newJti, messagePair,
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
    // session). A jti outside the path identity's own
    // collection is unknown: an idempotent no-op that still
    // appends its pair. Read and appends ride one
    // transaction (revokeTokenChain guards both exit paths).
    route('identities/:id/tokens/:jti/revocation', {
        post: async (db, p, _body, _actor, messagePair) => {
            const identityId = param(p, 0);
            const presented = param(p, 1);
            await revokeTokenChain(
                db, identityId, presented, messagePair,
            );
        },
    }),
    // Nested provider events (credentials shape). Dual-read
    // still sees leftover /identity-providers/ pairs. No fence:
    // GLOBAL-plane (no organization_id). ADMIN-ONLY — not in
    // MEMBER_VERBS. Flat /identity-providers is retired
    // (router 404).
    route('identities/:id/providers/', {
        get: (db, p) =>
            deriveIdentityProvidersFor(db, param(p, 0)),
    }),
    route('identities/:id/providers/:eid', {
        get: (db, p) =>
            deriveIdentityProvider(
                db, param(p, 0), param(p, 1),
            ),
        put: (db, p, body, actor, messagePair) =>
            postIdentityProviderDocumentOp(
                db, param(p, 0), param(p, 1),
                body, actor, messagePair,
            ),
    }),
    // The grant closures retire into api.ts's dedicated
    // authentication POST arm (Task 3, C1 discharge): both
    // routes are bearerExempt and form their own pair deep
    // inside postToken/postAuthorize, pre-tx, since only the
    // grant can resolve the requester identity. The table
    // offers POST so the generator advertises the verb;
    // matchRoute still 404s an unknown path and 405s a
    // non-POST verb on either pattern.
    route('authentication/token', {
        post: authGrantOffered,
    }),
    route('authentication/authorize', {
        post: authGrantOffered,
    }),
    // Create retired into the SAME document PUT ideas/:id
    // already serves (Decision 7, Phase 2 Task 3, R1): genesis
    // is head-presence-defined, so there is no longer a
    // separate create verb here — POST now 405s exactly like
    // any other method-absent route. GET is FLIPPED (Phase 2
    // Task 5): the list derives from the message ledger rather
    // than the old ideas table. Absorbed (Phase 4 Task 2) into
    // the generic documentCollectionRoute — wire-identical to
    // the hand-written dispatch it replaces.
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
    // Phase 3 Task 4: the operation message pair above lives at the
    // ideas-family OPERATION path (name '') — a projects-
    // prefix scan finds no pair for a conversion-born project
    // without a SECOND pair at the project's OWN document.
    // Synthesized below, BYTE-INDISTINGUISHABLE from a
    // live PUT /projects/:id's pair at that same document (same
    // response spec, same head-read), so derivation needs no
    // conversion special case. Phase 5 Task 5: the idea's OWN
    // 'promoted' transition gets a THIRD pair the same way, at
    // the idea's EXISTING document — unlike the project
    // pair above (a fresh document, genesis), the idea's head-
    // read finds its prior pair, so this one records Supersedes
    // provenance. This closes the standing watch-point: before
    // this task, a converted idea's derived history MISSED its
    // 'promoted' event because no pair recorded it. Phase 7
    // Task 4: each validated baseline gets its OWN pair too, at
    // its project-nested document (projects/:id/objective-
    // baseline-scores/:sid) — every baseline id is client-
    // minted FRESH per conversion, so these are genesis like
    // the project pair above, never Supersedes. All 3+N formed
    // PRE-TX — formed pre-tx — crypto, hashing, and timers
    // never run inside an open transaction (AGENTS.md §
    // Transaction bodies await only row ops) — then
    // appended as the tx's LAST acts, beside the operation
    // message pair. Formed ONLY when the gate supplied both a pair and
    // a fence organization; a below-facade caller with neither
    // (none exists for conversion today) skips all 3+N
    // appends, preserving dual-write discipline.
    route('organizations/:id/ideas/:id/conversion', {
        post: async (
            db, p, body, actor, messagePair, organization,
        ) => {
            const ideaId = param(p, 1);
            const b = validateIdeaConversionBody(body);
            // The document a live PUT /projects/:id would
            // carry: the entity's own fields plus the state
            // this conversion assigns. Validated pre-tx —
            // a malformed project body now 400s here instead of
            // at the in-tx store re-validation; same observable,
            // earlier.
            const projectDocument = {
                ...b.project,
                state: b.projectState,
            };
            validateProjectDocumentBody(projectDocument);
            // The document a live PUT /ideas/:id would carry for
            // this SAME conversion: the promoted idea's own
            // fields plus domain `state`. Validated pre-tx,
            // mirroring projectDocument above.
            const ideaDocument = {
                ...b.idea,
                state: b.ideaState,
            };
            validateIdeaDocumentBody(ideaDocument);
            let projectMessagePair: MessagePair | undefined;
            let ideaMessagePair: MessagePair | undefined;
            const baselineMessagePairs: MessagePair[] = [];
            if (
                messagePair !== undefined
                && organization !== undefined
            ) {
                projectMessagePair = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/projects/:id',
                    params: [organization, b.projectId],
                    body: projectDocument,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                // The idea's OWN document message pair, at its EXISTING
                // document (the idea was created earlier, through
                // a live PUT /ideas/:id) — this head-read finds
                // that prior pair, so this one records Supersedes,
                // unlike the project pair above (a fresh document,
                // genesis).
                ideaMessagePair = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/ideas/:id',
                    params: [organization, ideaId],
                    body: ideaDocument,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                // The per-baseline pairs (Task 4): N synthesized
                // pairs, one per validated baseline, at each
                // baseline's OWN document — every baseline id is
                // client-minted FRESH for this conversion, so
                // each pair is genesis there (the store's document
                // head read (`messageStore(db).getDocumentHead`) finds no
                // prior pair) unless a live PUT had already
                // visited that exact id. Body is the baseline's
                // `fields` VERBATIM — the live standalone PUT
                // body, unlike projectDocument/ideaDocument above
                // (which assemble a document from disjoint
                // parts) — so the response spec's successBody
                // below is what runs validateBaselineScoreEntity.
                for (const baseline of b.baselines) {
                    baselineMessagePairs.push(
                        await formDocumentMessagePairFor({
                            routePattern:
                                'organizations/:id/projects/:id'
                                + '/objective-baseline-scores'
                                + '/:sid',
                            params: [
                                organization, b.projectId,
                                baseline.id,
                            ],
                            body: baseline.fields,
                            requesterIdentityId: actor,
                            requestAt: messagePair.requestAt,
                            operationId: messagePair.operationId,
                            requestId: messagePair.requestId,
                            organization,
                        },
                    ));
                }
            }
            // Phase Final Task 2: idea + project + baseline ROW
            // halves stripped; only states events + pairs remain
            // (states row half strips with the states-trace
            // group).
            const pairs = [
                ...(messagePair !== undefined
                    ? [messagePair] : []),
                ...(projectMessagePair !== undefined
                    ? [projectMessagePair] : []),
                ...(ideaMessagePair !== undefined
                    ? [ideaMessagePair] : []),
                ...baselineMessagePairs,
            ];
            if (pairs.length > 0) {
                await runWrite(
                    db, attemptFor(pairs), pairs,
                );
            }
            return;
        },
    }),
    // GET is FLIPPED (Phase 3 Task 6): the list derives from
    // the message ledger rather than the old projects table.
    // Absorbed (Phase 4 Task 2) into the generic
    // documentCollectionRoute — wire-identical to the
    // hand-written dispatch it replaces.
    documentCollectionRoute(PROJECTS_WIRING),
    // Idea submissions nest under their parent idea: param 0 is
    // the path org, param 1 is the idea, so the SERVER filters
    // the collection to that idea (the org fence still rides
    // the facade re-entry). GET is FLIPPED (Phase 2 Task 5):
    // the collection derives from the message ledger at this
    // idea's submissions document rather than the old
    // idea_submissions table. The leaf id is param 2; only PUT
    // is exposed on ideas/:id/submissions/:sid, exactly as the
    // flat makeIdRoute carried it.
    route('organizations/:id/ideas/:id/submissions/', {
        get: (db, p, _actor, organization) =>
            deriveIdeaSubmissions(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route('organizations/:id/ideas/:id/submissions/:sid', {
        put: (db, p, body, _actor, messagePair) =>
            postIdeaSubmissionOp(db, param(p, 2), body, messagePair),
    }),
    route('organizations/:id/flows/', {
        // GET stays deriveFlows: stamps hasUndoHistory from
        // pair count and omits a state-'deleted' head.
        // POST stays this hand-written create — unlike
        // ideas/projects, flows never folded genesis into
        // the document PUT (Decision 6).
        get: (db, _p, _actor, organization) =>
            deriveFlows(db, requireOrganization(organization)),
        // Member-tier POST — /flows carries POST in
        // MEMBER_VERBS. Forms the document + join pairs pre-tx
        // (Task 5) beside the gate's own operation message pair — the
        // SAME shape a live genesis PUT /flows/:id and a live
        // PUT /projects/:id/flows/:pfid would each carry — ONLY
        // when the gate supplied both a pair and a fence
        // organization (the Phase 3 condition verbatim); a
        // below-facade caller (api/mock-data.ts, no gate) skips
        // all three, preserving dual-write discipline. See
        // postFlowCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, messagePair, organization,
        ) => {
            let messagePairs: FlowCreationMessagePairs | undefined;
            if (messagePair !== undefined && organization !== undefined) {
                const b = validateFlowCreateBody(body);
                const documentBody = flowCreateDocumentBody(b);
                validateFlowDocumentBody(documentBody);
                await assertLiveFlowGraphWriteLaw(
                    db, documentBody.graph as
                        Record<string, unknown>,
                );
                const document = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/flows/:id',
                    params: [organization, b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
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
                // document through this task; pinned by the same-
                // join-id retry test in tests/drift-flows.test.ts).
                const join = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/projects/:id'
                        + '/flows/:pfid',
                    params: [
                        organization, projectId,
                        b.projectFlowId,
                    ],
                    body: b.projectFlow,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                messagePairs = { operation: messagePair, document, join };
            }
            return postFlowCreationOp(db, body, actor, messagePairs);
        },
    }),
    // flows/:id takes a conditional PUT ('required').
    // G2 GET stays deriveFlow (stamp hasUndoHistory; 404
    // a state-'deleted' head). PUT stays
    // documentPutHandler; the statement judges its latch.
    // graphDelta/revivals ride the pair body (SIDECAR-KEEP).
    // Member-tier PUT.
    {
        segments: [
            'organizations', ':id', 'flows', ':id',
        ],
        get: (db, p, _actor, organization) =>
            deriveFlow(
                db, requireOrganization(organization),
                param(p, 1),
            ),
        put: documentPutHandler(FLOWS_WIRING),
    },
    // GET flows/:id/versions/: pair-chain index. Old
    // table-backed /versions/:vid stays a miss (404).
    // List is StateEntity[] DESC; snapshot is the stored
    // flow document. Do not change the flow payload.
    documentVersionListRoute(FLOWS_WIRING),
    documentVersionRoute(FLOWS_WIRING),
    // Undo-as-replay (Phase 14 Task 8). Phase Final Task 2:
    // flows + graph ROW halves stripped; restore writes the
    // 'updated' state event, revival states events, and the
    // operation + document message pairs. graphDelta/revivals are
    // server-computed into the document message pair body
    // (SIDECAR-KEEP → deriveFlowGraphStates). No flow_versions
    // row is read or written. Exhaustion appends only the
    // operation message pair. A moved lock head → 412 via the
    // in-tx head re-read.
    route('organizations/:id/flows/:id/undo', {
        post: async (
            db, p, body, actor, messagePair, organization,
        ) => {
            const id = param(p, 1);
            const b = validateFlowUndoBody(body);
            if (messagePair === undefined || organization === undefined) {
                // Never live for flows (member-tier POST, always
                // pair-wired) — kept so this handler's control
                // flow matches every other wired route's
                // defensive shape (TypeScript cannot prove
                // bearerExempt was false at this depth).
                return undefined;
            }
            const resolution = await resolveFlowUndoTarget(
                db, organization, id, messagePair.path,
            );
            if (resolution === undefined) {
                throw await missedReadError(
                    db, id, organization, 'flows',
                );
            }
            return postFlowUndoOp(
                db, id, actor, organization, messagePair, resolution, b,
            );
        },
    }),
    // Pair-chain GET flows/:id/versions[/]:etag is
    // registered above. Old table-backed :vid is a miss.
    // Project↔flow joins nest under their parent project:
    // param 0 is the path org, param 1 is the project, so the
    // SERVER filters the collection to that project (the org
    // fence still rides the facade re-entry). The leaf id is
    // param 2; PUT and DELETE are exposed exactly as the
    // flat makeIdRoute carried them. GET is FLIPPED (Phase 4
    // Task 8): the join list derives from the
    // message ledger at this project's flows document rather than
    // the old project_flows table — deriveProjectFlows is a
    // bespoke derivation (not a DocumentFamilyWiring family; a
    // join row carries no lifecycle state of its own), so this
    // calls it directly rather than through a generic constructor.
    route('organizations/:id/projects/:id/flows/', {
        get: (db, p, _actor, organization) =>
            deriveProjectFlows(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route('organizations/:id/projects/:id/flows/:pfid', {
        // Phase Final Task 2: project_flows ROW half stripped —
        // pure message-plane write (join derives from the ledger).
        // G6: reconstructed return is projectFlowEntityOf.
        put: async (db, p, body, _actor, messagePair) => {
            const pfid = param(p, 2);
            const entity = projectFlowEntityOf({
                name: pfid,
                messagePairId: pfid,
                method: 'PUT',
                body: withoutId(body),
            });
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return entity;
        },
        delete: async (db, _p, _actor, messagePair) => {
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
        },
    }),
    // GET list: generic documentCollectionGetHandler rows
    // plus a per-row workOrderBindingFor attach (instance_id
    // + record_type_id when bound; keys ABSENT when unbound
    // so unbound wire bytes stay unchanged). Browser-tier N
    // on a read-only route — Task 7 measure is the evidence
    // gate. POST stays this hand-written create — unlike
    // ideas/projects, work-orders never folded genesis into
    // the document PUT (Decision 6), mirroring flows' own
    // precedent, so a separate create verb remains here.
    route('organizations/:id/work-orders/', {
        get: async (db, p, actor, organization, roles) => {
            const org = requireOrganization(organization);
            const rows = await documentCollectionGetHandler(
                WORK_ORDERS_WIRING,
            )(db, p, actor, organization, roles) as {
                id: string;
            }[];
            const binds = await Promise.all(
                rows.map(row => workOrderBindingFor(
                    db, org, row.id,
                )),
            );
            const out: unknown[] = [];
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i]!;
                const bind = binds[i]!;
                out.push({
                    ...row,
                    ...(bind === null
                        ? {}
                        : {
                            instance_id:
                                bind.instanceId,
                            record_type_id:
                                bind.recordTypeId,
                        }),
                });
            }
            return out;
        },
        // Member-tier POST — /work-orders carries POST in
        // MEMBER_VERBS (the claim sub-route is also a member
        // POST). Forms the document + join pairs pre-tx
        // (Task 3) beside the gate's own operation message pair — the
        // SAME shape a live genesis PUT /work-orders/:id and a
        // live PUT /flows/:id/work-orders/:woid would each
        // carry — ONLY when the gate supplied both a pair and
        // a fence organization (the Phase 3 condition
        // verbatim); a below-facade caller (api/mock-data.ts,
        // no gate) skips all three, preserving dual-write
        // discipline. See postWorkOrderCreationOp for the
        // transaction shape.
        post: async (
            db, _p, body, actor, messagePair, organization,
        ) => {
            let messagePairs: WorkOrderCreationMessagePairs | undefined;
            if (messagePair !== undefined && organization !== undefined) {
                const b = validateWorkOrderCreateBody(body);
                const documentBody =
                    workOrderCreateDocumentBody(b);
                validateWorkOrderDocumentBody(documentBody);
                const document = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/work-orders/:id',
                    params: [organization, b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
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
                // out at this document through this task; pinned
                // by the same-join-id retry test in
                // tests/drift-work-orders.test.ts).
                const join = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/flows/:id'
                        + '/work-orders/:woid',
                    params: [
                        organization, flowId,
                        b.flowWorkOrderId,
                    ],
                    body: b.flowWorkOrder,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                const graph = asWorkOrderFlowGraph(
                    b.workOrder['flow_graph'],
                    'workOrder.flow_graph',
                );
                const claimAt = b.stateEventAts[2]!;
                const claim = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/work-orders/:id'
                        + '/claim',
                    params: [organization, b.id],
                    body: {
                        claimEventId: b.stateEventIds[2]!,
                        claimAt,
                        expireEventId:
                            b.stateEventIds[2]! + '-exp',
                        expireAt: claimAt,
                        expires_at: addUtcSeconds(
                            claimAt, graph.lockTimeout,
                        ),
                    },
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                messagePairs = {
                    operation: messagePair, document, join, claim,
                };
            }
            return postWorkOrderCreationOp(
                db, body, actor, messagePairs,
            );
        },
    }),
    // work-orders/:id is the fourth family. GET exits the
    // generic documentEntityRoute path deliberately: the
    // derivedDocumentEntity shape (via documentGetHandler)
    // plus ONE workOrderBindingFor read that embeds
    // instance_id + record_type_id when bound (keys ABSENT
    // when unbound — unbound wire bytes unchanged). PUT
    // still rides documentPutHandler(WORK_ORDERS_WIRING)
    // — member-tier via
    // MEMBER_VERBS['/work-orders']. Verbs stay {get, put}
    // — no DELETE.
    route('organizations/:id/work-orders/:id', {
        get: async (db, p, actor, organization, roles) => {
            const org = requireOrganization(organization);
            const id = param(p, 1);
            const entity = await documentGetHandler(
                WORK_ORDERS_WIRING,
            )(db, p, actor, organization, roles);
            const bind = await workOrderBindingFor(
                db, org, id,
            );
            return {
                ...(entity as object),
                ...(bind === null
                    ? {}
                    : {
                        instance_id: bind.instanceId,
                        record_type_id: bind.recordTypeId,
                    }),
            };
        },
        put: documentPutHandler(WORK_ORDERS_WIRING),
    }),
    // PUT claims, GET returns facts (404 only when
    // unclaimed), DELETE releases (DELETE head =
    // unclaimed). Member-tier via MEMBER_VERBS
    // GET/PUT/DELETE on /work-orders.
    route('organizations/:id/work-orders/:id/claim', {
        get: async (db, p, _actor, organization) => {
            const org = requireOrganization(
                organization,
            );
            const workOrderId = param(p, 1);
            const claim = await workOrderClaimDocumentFor(
                db, org, workOrderId,
            );
            if (claim === null) {
                throw new EntityNotFoundError(
                    'work_order_claims', workOrderId,
                );
            }
            return {
                member_id: claim.memberId,
                expires_at: claim.expiresAt,
            };
        },
        put: (db, p, body, actor, messagePair, organization) =>
            postWorkOrderClaimOp(
                db, param(p, 1), body, actor,
                requireOrganization(organization), messagePair,
            ),
        delete: (db, p, actor, messagePair, organization) =>
            deleteWorkOrderClaimOp(
                db, param(p, 1), actor,
                requireOrganization(organization), messagePair,
            ),
    }),
    // Member-tier POST — /work-orders carries POST in
    // MEMBER_VERBS, and isPermitted matches on the segment
    // prefix, so the sub-route is member-permitted like
    // /claim. See postWorkOrderTransitionOp for the
    // transaction shape. organization is NOT
    // requireOrganization — the op discriminates the
    // below-facade seed tier (undefined) from the gate.
    // Task 8 CUT: gate rejects the legacy fieldValues key
    // here only; the op stays dual-tolerant for seed.
    route('organizations/:id/work-orders/:id/transition', {
        post: (
            db, p, body, actor, messagePair,
            organization, roles,
        ) => {
            if ('fieldValues' in body) {
                throw new ValidationError(
                    'WorkOrderTransitionBody.fieldValues'
                    + ' is retired: send set/clear against'
                    + ' the bound instance',
                );
            }
            return postWorkOrderTransitionOp(
                db, param(p, 1), body, actor,
                organization, roles, messagePair,
            );
        },
    }),
    // Create-only PUT — first bind 201; rebind 409;
    // no DELETE. POST is gone. Member-tier via
    // MEMBER_VERBS PUT on /work-orders.
    route('organizations/:id/work-orders/:id/binding', {
        put: (db, p, body, actor, messagePair, organization) =>
            postWorkOrderBindingOp(
                db, param(p, 1), body, actor,
                requireOrganization(organization), messagePair,
            ),
    }),
    // GET work-orders/:id/history (states-URI elimination A1):
    // lifecycle + inline field_values fold, (at, id) DESC.
    // Miss posture lives inside workOrderHistoryFor (empty →
    // missedReadError). No api.ts pre-dispatch guard — the
    // derive reads only this org's paths.
    // Member-tier GET via matchesOnSegmentBoundary on
    // '/work-orders'.
    route('organizations/:id/work-orders/:id/history', {
        get: (db, p, _actor, organization) =>
            workOrderHistoryFor(
                db,
                requireOrganization(organization),
                param(p, 1),
            ),
    }),
    // Flow work-order joins nest under their parent flow:
    // param 0 is the path org, param 1 is the flow, so the
    // SERVER filters the collection to that flow. The leaf
    // id is param 2; only PUT is exposed (the
    // flat route never carried GET/DELETE on the leaf). GET is
    // FLIPPED (Task 7): the join list derives from the message
    // ledger at this flow's work-orders document rather than the
    // old flow_work_orders table — deriveFlowWorkOrders is a
    // bespoke derivation (not a DocumentFamilyWiring family; a
    // join row carries no lifecycle state of its own), so this
    // calls it directly rather than through a generic
    // constructor, mirroring deriveProjectFlows' own precedent.
    route('organizations/:id/flows/:id/work-orders/', {
        get: (db, p, _actor, organization) =>
            deriveFlowWorkOrders(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route('organizations/:id/flows/:id/work-orders/:woid', {
        put: (db, p, body, actor, messagePair) =>
            postFlowWorkOrderDocumentOp(
                db, param(p, 2), body, actor, messagePair,
            ),
    }),
    // GET states/:id/field-values RETIRED (states-URI
    // elimination C4): field values fold inline on
    // GET organizations/:id/work-orders/:id/history.
    // PUT/DELETE states/:id/field-values/:fvid RETIRED
    // (Phase 15 Task 7): live writes ride the transition
    // fold only. WRITE_RESPONSE_SPECS entry + seed document
    // formation SURVIVE (finding 7).
    // Nested record-types surface (Task 2 READ + Task 3
    // WRITE + Task 9 composed POST). Org-nested primary
    // documents; member GET via MEMBER_VERBS
    // '/organizations/:id/record-types'; mutations stay admin
    // by absence. Handlers are inline (param index 1 is
    // :record-type-id) rather than the document-family
    // factories — documentPutHandler takes param 1 as id
    // on an org nest (param 0 is the path org). PUT
    // reuses postRecordDocumentOp (same state body /
    // pair append). POST reuses formRecordWriteMessagePairs +
    // postRecordWriteOp with nested documents.
    // DELETE is inline records/:id posture plus type RESTRICT.
    route(RECORD_TYPES_COLLECTION_PATTERN, {
        get: (db, _p, _actor, organization) =>
            deriveRecordTypeCollection(
                db, requireOrganization(organization),
            ),
        // Admin-only composed create/edit (MEMBER_VERBS has
        // GET only). Same transaction / RESTRICT discipline
        // as flat POST /records; document message pair at the nested
        // detail document, attributes at ATTRIBUTE_DETAIL_
        // PATTERN.
        post: async (
            db, _p, body, actor, messagePair, organization,
        ) => {
            let messagePairs: RecordWriteMessagePairs | undefined;
            if (
                messagePair !== undefined
                && organization !== undefined
            ) {
                const b = validateRecordWriteBody(body);
                messagePairs = await formRecordWriteMessagePairs(
                    db, b, actor, messagePair, organization,
                    RECORD_TYPE_DETAIL_PATTERN,
                    [organization, b.id],
                );
            }
            return postRecordWriteOp(
                db, body, actor, messagePairs, organization,
            );
        },
    }),
    route(RECORD_TYPE_DETAIL_PATTERN, {
        get: (db, p, _actor, organization) =>
            deriveRecordTypeEntity(
                db, requireOrganization(organization),
                param(p, 1),
            ),
        put: (db, p, body, actor, messagePair) =>
            postRecordDocumentOp(
                db, param(p, 1), body, actor, messagePair,
            ),
        // Admin DELETE with NET-NEW type RESTRICT. RESTRICT
        // check and tombstone append share one tx; referrer
        // scan awaits only row ops on the view (AGENTS.md §
        // Transaction bodies await only row ops). Path org
        // is already gate-matched to
        // the token org; DeleteHandler has no fence arg.
        delete: async (db, params, _actor, messagePair) => {
            const organization = requireOrganization(
                param(params, 0),
            );
            const id = param(params, 1);
            await db.readTransaction(async (view) => {
                const refs =
                    await collectRecordTypeReferrers(
                        view, organization, id,
                    );
                if (hasTypeReferrers(refs)) {
                    throw new ApiError(
                        describeTypeReferrers(id, refs),
                        HTTP_CONFLICT,
                    );
                }
            });
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
        },
    }),
    route(RECORD_TYPE_VERSIONS_PATTERN, {
        get: async (db, p, _actor, organization) => {
            const org = requireOrganization(organization);
            const id = param(p, 1);
            const snapshots = await versionSnapshotsAt(
                db, recordTypesUriPrefix(org), id,
                (document) =>
                    recordTypeEntityOf(document, org),
            );
            if (snapshots.length === 0) {
                throw await missedReadError(
                    db, id, org, 'record_types',
                );
            }
            return snapshots;
        },
    }),
    route(RECORD_TYPE_VERSION_PATTERN, {
        get: async (db, p, _actor, organization) => {
            const org = requireOrganization(organization);
            const id = param(p, 1);
            const etag = param(p, 2);
            const found = await lookupStoredRevision(
                db, recordTypesUriPrefix(org), id, etag,
            );
            if (
                found === undefined
                || found.method !== 'PUT'
            ) {
                throw await missedReadError(
                    db, id, org, 'record_types',
                );
            }
            const body = requestBodyOf(
                found.request,
            );
            return recordTypeEntityOf(
                {
                    name: id,
                    messagePairId: found.id,
                    method: found.method,
                    body,
                },
                org,
            );
        },
    }),
    // Nested attributes collection (Task 7): member GET under
    // a live type. Parent probe first (record_types 404);
    // heads at .../attributes/, id-lex. No POST (parity with
    // the flat family — composed op + PUT are the creators).
    route(ATTRIBUTES_COLLECTION_PATTERN, {
        get: async (db, p, _actor, organization) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            await requireRecordTypeExists(db, org, typeId);
            const prefix = attributesUriPrefix(org, typeId);
            const messagePairs = await db.messagePairs.getCollectionPairs(
                prefix,
            );
            const documents = deriveDocumentsAt(
                messagePairs, prefix,
            );
            const rows: { id: string }[] = [];
            for (const [id, document] of documents) {
                const wire = nestedAttributeWireOf(
                    org, typeId, id, document.body,
                );
                rows.push(wire as { id: string });
            }
            return rows.sort(byIdAscending);
        },
    }),
    // Nested attribute detail (Task 7): member GET, admin
    // PUT (create vs replace by head presence), admin DELETE
    // with four-leg RESTRICT. No WRITE_AUTHORIZERS (deep
    // sub-family — parent type 404 + path org gate).
    route(ATTRIBUTE_DETAIL_PATTERN, {
        get: async (db, p, _actor, organization) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            const attrId = param(p, 2);
            await requireRecordTypeExists(db, org, typeId);
            const prefix = attributesUriPrefix(org, typeId);
            const messagePairs = await db.messagePairs.getCollectionPairs(
                prefix,
            );
            const document = deriveDocumentsAt(
                messagePairs, prefix,
            ).get(attrId);
            if (document === undefined) {
                throw await missedReadError(
                    db, attrId, org, 'record_attributes',
                );
            }
            return nestedAttributeWireOf(
                org, typeId, attrId, document.body,
            );
        },
        put: async (db, p, body, _actor, messagePair) => {
            const org = param(p, 0);
            const typeId = param(p, 1);
            await requireRecordTypeExists(db, org, typeId);
            validateAttributeDocument(withoutId(body));
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return;
        },
        delete: async (db, p, _actor, messagePair) => {
            const org = param(p, 0);
            const typeId = param(p, 1);
            const attrId = param(p, 2);
            await requireRecordTypeExists(db, org, typeId);
            if (messagePair === undefined) {
                throw new Error(
                    'nested attribute DELETE without pair',
                );
            }
            const prefix = attributesUriPrefix(org, typeId);
            const messagePairs = await db.messagePairs.getCollectionPairs(
                prefix,
            );
            if (!deriveDocumentsAt(
                messagePairs, prefix,
            ).has(attrId)) {
                throw await missedReadError(
                    db, attrId, org, 'record_attributes',
                );
            }
            await db.readTransaction(async (view) => {
                await deleteRecordAttributeSafe(
                    view, org, attrId, typeId,
                );
            });
            await runWrite(
                db,
                attemptFor([messagePair]),
                [messagePair],
            );
        },
    }),
    // Nested instances collection (Task 16): member GET
    // under a live type. Parent probe first; heads via
    // deriveInstanceCollection; each row projects values
    // by attribute ACL and embeds etag (pair id, no quotes).
    route(INSTANCES_COLLECTION_PATTERN, {
        get: async (
            db, p, _actor, organization, roles,
        ) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            await requireRecordTypeExists(db, org, typeId);
            const attributesById =
                await loadAttributeSchemaById(
                    db, org, typeId,
                );
            const heads = await deriveInstanceCollection(
                db, org, typeId,
            );
            const rows = [];
            for (const head of heads) {
                const values = projectReadableValues(
                    head.values, attributesById, roles,
                );
                rows.push({
                    id: head.id,
                    organization_id: org,
                    record_type_id: typeId,
                    values,
                    etag: head.messagePairId,
                });
            }
            return rows;
        },
    }),
    // Nested instance value-revision versions (Task 19).
    // NOT a document-versions clone: each entry is full state
    // from a revision (or genesis) PUT pair (R5 — no fold),
    // projected by the caller's CURRENT read ACL. Wire
    // (at, id) DESC so index 0 is the live head. Empty →
    // missedReadError('record_instances') (R2: foreign 403
    // / absent-or-tombstoned 404). Parent type miss first.
    // etag is the revision pair id.
    route(INSTANCE_VERSIONS_PATTERN, {
        get: async (
            db, p, _actor, organization, roles,
        ) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            const instanceId = param(p, 2);
            await requireRecordTypeExists(db, org, typeId);
            const revisions = await deriveInstanceRevisions(
                db, org, typeId, instanceId,
            );
            if (revisions.length === 0) {
                throw await missedReadError(
                    db, instanceId, org,
                    'record_instances',
                );
            }
            const attributesById =
                await loadAttributeSchemaById(
                    db, org, typeId,
                );
            const entries = [];
            for (const rev of revisions.toReversed()) {
                const values = projectReadableValues(
                    rev.values, attributesById, roles,
                );
                entries.push({
                    at: rev.at,
                    etag: rev.messagePairId,
                    values,
                });
            }
            return entries;
        },
    }),
    route(INSTANCE_VERSION_PATTERN, {
        get: async (
            db, p, _actor, organization, roles,
        ) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            const instanceId = param(p, 2);
            const etag = param(p, 3);
            await requireRecordTypeExists(db, org, typeId);
            const found = await lookupStoredRevision(
                db,
                instancesUriPrefix(org, typeId),
                instanceId,
                etag,
            );
            if (
                found === undefined
                || found.method !== 'PUT'
            ) {
                throw await missedReadError(
                    db, instanceId, org,
                    'record_instances',
                );
            }
            const attributesById =
                await loadAttributeSchemaById(
                    db, org, typeId,
                );
            const values = projectReadableValues(
                revisionValuesOf(
                    requestBodyOf(found.request),
                ),
                attributesById,
                roles,
            );
            return instanceStateOf(
                org, typeId, instanceId, values,
            );
        },
    }),
    // Nested instance detail (Task 20): public PUT is
    // 405. PATCH creates (If-None-Match: *) and updates
    // (If-Match). Task 16 GET projection +
    // missedReadError R2. Task 18 DELETE tombstone-wins
    // R4/R9. Ladder PATCH create: parent type 404 →
    // body 400 (set required; clear forbidden) → write-
    // ACL 403 → value 400 → tombstone 409 → one
    // statement (received PATCH + revision PUT). Ladder
    // PATCH update: tombstone 404 → shape → unknown attr
    // → ACL on set∪clear → value on set → one statement,
    // which judges the tag.
    // Ladder DELETE: parent type 404 → document spent
    // (any pair, including tombstone) else missedReadError;
    // in-tx re-probe + append tombstone (R4 ledger-
    // complete). No WRITE_AUTHORIZERS (deep sub-family).
    // GET/write ETag attaches in api.ts. DELETE takes its
    // conditional from the spec's delete slot and forms no
    // response body.
    route(INSTANCE_DETAIL_PATTERN, {
        get: async (
            db, p, _actor, organization, roles,
        ) => {
            const org = requireOrganization(organization);
            const typeId = param(p, 1);
            const instanceId = param(p, 2);
            await requireRecordTypeExists(db, org, typeId);
            const head = await deriveInstanceHead(
                db, org, typeId, instanceId,
            );
            if (head === undefined) {
                const retired = await documentHeadAt(
                    db, instancesUriPrefix(org, typeId),
                    instanceId,
                ) !== null;
                throw retired
                    ? await retiredInstanceError(
                        db, instanceId, org,
                    )
                    : await missedReadError(
                        db, instanceId, org,
                        'record_instances',
                    );
            }
            const attributesById =
                await loadAttributeSchemaById(
                    db, org, typeId,
                );
            return {
                id: head.id,
                organization_id: org,
                record_type_id: typeId,
                values: projectReadableValues(
                    head.values, attributesById, roles,
                ),
            };
        },
        patch: (db, p, body, actor, messagePair, organization,
            roles,
        ) => postInstancePatchOp(
            db, p, body, actor, messagePair, organization, roles,
        ),
        delete: (db, p, actor, messagePair, organization, roles,
        ) => postInstanceDeleteOp(
            db, p, actor, messagePair, organization, roles,
        ),
    }),
    // Flow↔record bindings nest under their parent flow:
    // param 0 is the path org, param 1 is the flow, so the
    // SERVER filters the collection to that flow. The leaf
    // id is param 2. GET is FLIPPED (Task 7): both
    // the collection and the by-id read now ride deriveFlowRecords
    // / deriveFlowRecord — a bespoke derivation (not a
    // DocumentFamilyWiring family; a join row carries no lifecycle
    // state of its own), so this calls it directly rather than
    // through a generic constructor, mirroring deriveFlowWorkOrders'
    // own precedent above. flows/:id/versions table-backed
    // nested read RETIRED Phase 15 Task 7 (zero callers).
    route('organizations/:id/flows/:id/records/', {
        get: (db, p, _actor, organization) =>
            deriveFlowRecords(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route('organizations/:id/flows/:id/records/:frid', {
        get: (db, p, _actor, organization) =>
            deriveFlowRecord(
                db, requireOrganization(organization),
                param(p, 1), param(p, 2),
            ),
        put: (db, p, body, actor, messagePair, organization) =>
            postFlowRecordDocumentOp(
                db, param(p, 2), body, actor,
                requireOrganization(organization), messagePair,
            ),
        // Phase Final Task 2: flow_records ROW half stripped —
        // DELETE is a pure message-plane tombstone append.
        delete: async (db, _p, _actor, messagePair) => {
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
        },
    }),
    // Flow tags: the codebase's FIRST message-plane-ONLY document
    // family (Phase 14 Task 9, election #2's companion) — no
    // backing table, no dual-write, derived entirely from message
    // pairs. Bespoke route() wiring reusing deriveDocumentsAt/
    // documentMessagePairsAt exactly like the identities/:id/pii analog
    // (gate 8); a repeat PUT records Supersedes. The tags
    // route takes its own entry's conditional, never the
    // flow entity's: its pattern never equals
    // organizations/:id/flows/:id. The
    // tag NAME (param 2) is the document's own name — the FIRST
    // user-authored path segment in this codebase
    // (validateFlowTagName, api/validators.ts), validated ONLY at
    // the write gate below (WRITE_RESPONSE_SPECS), never re-checked
    // on GET/DELETE — mirroring how every sibling family's :id
    // param is unchecked on read (a document that never validly
    // wrote can never be found either way). DELETE is MARKED, not
    // physical: postFlowTagDocumentOp appends a DELETE pair at the
    // SAME document, and deriveFlowTag's own deriveDocumentsAt call
    // already excludes a DELETE head, exactly like every other
    // document family. PUT and DELETE share ONE op
    // (postFlowTagDocumentOp) since NEITHER needs `id` or `body` —
    // the pair alone (formed by the gate from the matched route)
    // carries the document and the method; a hand-written DELETE
    // closure calling the SAME op keeps the PUT-only op's own name
    // honest (it writes a tag document, never a tombstone) while
    // avoiding a second, byte-identical transaction body.
    // Member-tier — '/flows/:id/tags' carries GET/PUT/DELETE in
    // MEMBER_VERBS (api/authorization.ts), mirroring
    // '/flows/:id/records'.
    route('organizations/:id/flows/:id/tags/:name', {
        get: (db, p, _actor, organization) =>
            deriveFlowTag(
                db, requireOrganization(organization),
                param(p, 1), param(p, 2),
            ),
        put: (db, _p, _body, _actor, messagePair) =>
            postFlowTagDocumentOp(db, messagePair),
        delete: (db, _p, _actor, messagePair) =>
            postFlowTagDocumentOp(db, messagePair),
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
    // stripped — pure message-plane write (postFlowTagDocumentOp
    // shape). WRITE_RESPONSE_SPECS successBody forms the wire
    // bytes via organizationEntityOf (id-first; GET wins).
    route('organizations/:id', {
        get: (db, p) => deriveOrganization(db, param(p, 0)),
        put: postOrganizationDocumentOp,
    }),
    route('organizations/:id/versions/', {
        get: async (db, p) => {
            const id = param(p, 0);
            const prefix = canonicalPath(
                undefined, '/organizations/',
            );
            const rows = await versionSnapshotsAt(
                db, prefix, id, organizationEntityOf,
            );
            if (rows.length === 0) {
                throw new EntityNotFoundError(
                    'organizations', id,
                );
            }
            return rows;
        },
    }),
    route('organizations/:id/versions/:etag', {
        get: async (db, p) => {
            const id = param(p, 0);
            const etag = param(p, p.length - 1);
            const document = await storedRevisionDocument(
                db,
                canonicalPath(
                    undefined, '/organizations/',
                ),
                id,
                etag,
            );
            if (document === undefined) {
                throw new EntityNotFoundError(
                    'organizations', id,
                );
            }
            return organizationEntityOf(document);
        },
    }),
    // GET is FLIPPED (Task 8): derived via
    // documentCollectionGetHandler — wire-identical to the
    // hand-written db.memberships.getAll() dispatch it replaces
    // (memberships is organizationNested:true, so the derived
    // prefix fences to the caller's org exactly as the
    // org-scoped adapter already did for the hand-written read).
    // Invitation send nest. POST grants pending. PUT
    // revokes. Storage prefix stays /invitations/.
    route('organizations/:id/invitations/', {
        get: getOrganizationInvitations,
        post: postOrganizationInvitationGrant,
    }),
    route('organizations/:id/invitations/:id', {
        get: getInvitationOnOrganizationNest,
        put: putInvitationOnOrganizationNest,
    }),
    route(
        'organizations/:id/invitations/:id/versions/',
        {
            get: getInvitationVersionsOnOrganizationNest,
        },
    ),
    route(
        'organizations/:id/invitations/:id/versions/:etag',
        {
            get: getInvitationVersionOnOrganizationNest,
        },
    ),
    // The seats the ledger has DELETEd — the organization's
    // former members. The name resolver reads it beside the
    // live roster to tell "left" from "never existed".
    // Same prefix as the roster, opposite head method;
    // fenced by the path organization like every
    // organizations/ route.
    route(ORGANIZATION_FORMER_MEMBERS_COLLECTION_PATTERN, {
        get: (db, _p, _actor, organization) =>
            deriveOrganizationFormerSeats(
                db, requireOrganization(organization),
            ),
    }),
    route(ORGANIZATION_MEMBERS_COLLECTION_PATTERN, {
        get: (db, _p, _actor, organization) =>
            deriveOrganizationMemberSeats(
                db, requireOrganization(organization),
            ),
    }),
    route(ORGANIZATION_MEMBER_DETAIL_PATTERN, {
        get: (db, p, _actor, organization) =>
            deriveOrganizationMemberSeat(
                db, requireOrganization(organization),
                param(p, 1),
            ),
        put: (db, p, body, actor, messagePair) =>
            postMembershipDocumentOp(
                db, param(p, 1), body, actor, messagePair,
            ),
        // The last admin seat cannot be removed: the actor
        // is authorized, the organization's state forbids.
        // The admin seats are derived INSIDE the transaction
        // — a row op. The refusal is thrown after it, the
        // invitations-domain shape.
        delete: async (
            db, p, _actor, messagePair, organization,
        ) => {
            const fenced = requireOrganization(organization);
            const identityId = param(p, 1);
            const lastAdmin = await db.readTransaction(
                async (view) => {
                    const admins = (
                        await deriveOrganizationMemberSeats(
                            view, fenced,
                        )
                    ).filter(seat => seat.type === 'admin');
                    return admins.length === 1
                        && admins[0]!.identity_id
                            === identityId;
                },
            );
            if (lastAdmin) {
                throw new ApiError(
                    'the last admin seat cannot be removed',
                    HTTP_CONFLICT,
                );
            }
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
        },
    }),
    route(
        ORGANIZATION_MEMBER_DETAIL_PATTERN
            + '/versions/',
        {
            get: async (db, p, _actor, organization) => {
                const org = requireOrganization(
                    organization,
                );
                const id = param(p, 1);
                const rows = await versionSnapshotsAt(
                    db, seatsPrefixFor(org), id,
                    (document) => seatEntityOf(
                        document, org,
                    ),
                );
                if (rows.length === 0) {
                    throw new EntityNotFoundError(
                        'organization_members', id,
                    );
                }
                return rows;
            },
        },
    ),
    route(
        ORGANIZATION_MEMBER_DETAIL_PATTERN
            + '/versions/:etag',
        {
            get: async (db, p, _actor, organization) => {
                const org = requireOrganization(
                    organization,
                );
                const id = param(p, 1);
                const etag = param(p, p.length - 1);
                const document =
                    await storedRevisionDocument(
                        db, seatsPrefixFor(org), id, etag,
                    );
                if (document === undefined) {
                    throw new EntityNotFoundError(
                        'organization_members', id,
                    );
                }
                return seatEntityOf(document, org);
            },
        },
    ),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — GET dispatches to the derived
    // entity, PUT to postIdeaDocumentOp, wire-identical to the
    // hand-written {get, put} pair it replaces. The Decision-7/
    // MEMBER_ID-CAVEAT prose that lived here moved to the
    // IDEAS_WIRING block above.
    documentEntityRoute(IDEAS_WIRING),
    // GET ideas/:id/versions/: entityOf snapshots
    // DESC, each stamped with the pair facts (etag, at,
    // member_id); empty → missedReadError('ideas').
    documentVersionListRoute(IDEAS_WIRING),
    documentVersionRoute(IDEAS_WIRING),
    // Absorbed (Phase 4 Task 2) into the generic
    // documentEntityRoute — see the ideas/:id entry above for
    // the shared rationale; the Decision-7/MEMBER_ID-CAVEAT
    // prose moved to the PROJECTS_WIRING block above.
    documentEntityRoute(PROJECTS_WIRING),
    // GET projects/:id/versions/: entityOf snapshots
    // DESC, each stamped with the pair facts (etag, at,
    // member_id); empty → missedReadError('projects').
    documentVersionListRoute(PROJECTS_WIRING),
    documentVersionRoute(PROJECTS_WIRING),
    // GET is FLIPPED (Task 7): the collection derives from the
    // message ledger rather than the old objectives table. Rides
    // the generic documentCollectionGetHandler —
    // objectiveDocumentEntityOf reads entity fields and `state`
    // alike from the head body. POST stays this hand-written
    // bundle — objectives' own create forms the document PLUS
    // its first revision pair in one pass
    // (postObjectiveCreationOp), mirroring records'/work-
    // orders' own precedent.
    route('organizations/:id/objectives/', {
        get: documentCollectionGetHandler(OBJECTIVES_WIRING),
        // Forms the document + revision pairs pre-tx (Task 3)
        // beside the gate's own operation message pair — the SAME shape
        // a live genesis PUT /objectives/:id and a live PUT
        // /objectives/:id/revisions/:rid would each carry — ONLY
        // when the gate supplied both a pair and a fence
        // organization (the route('flows') condition verbatim);
        // a below-facade caller (api/mock-data.ts, no gate) skips
        // both, preserving dual-write discipline. See
        // postObjectiveCreationOp for the transaction shape.
        post: async (
            db, _p, body, actor, messagePair, organization,
        ) => {
            let messagePairs: ObjectiveCreationMessagePairs | undefined;
            if (messagePair !== undefined && organization !== undefined) {
                const b = validateObjectiveCreateBody(body);
                const documentBody = objectiveDocumentBodyOf(b);
                validateObjectiveDocumentBody(documentBody);
                const document = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/objectives/:id',
                    params: [organization, b.id],
                    body: documentBody,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                const revisionBody = objectiveRevisionBodyOf(b);
                validateObjectiveRevisionEntity(revisionBody);
                const revision = await formDocumentMessagePairFor({
                    routePattern:
                        'organizations/:id/objectives/:id'
                        + '/revisions/:rid',
                    params: [
                        organization, b.id, b.revisionId,
                    ],
                    body: revisionBody,
                    requesterIdentityId: actor,
                    requestAt: messagePair.requestAt,
                    operationId: messagePair.operationId,
                    requestId: messagePair.requestId,
                    organization,
                });
                messagePairs = {
                    operation: messagePair, document, revision,
                };
            }
            return postObjectiveCreationOp(db, body, messagePairs);
        },
    }),
    // objectives/:id is the seventh family. GET is FLIPPED
    // (Task 7): absorbed into the generic documentEntityRoute —
    // GET dispatches to documentGetHandler(OBJECTIVES_WIRING);
    // objectiveDocumentEntityOf reads entity fields and `state`
    // alike from the head body. PUT stays
    // documentPutHandler(OBJECTIVES_WIRING), unchanged from
    // before this flip (Task 2); objectives/:id has no DELETE
    // today, mirroring the ideas/projects/work-orders
    // precedent that already rides this same
    // documentEntityRoute shape.
    documentEntityRoute(OBJECTIVES_WIRING),
    // GET objectives/:id/versions/: entityOf snapshots
    // DESC, each stamped with the pair facts (etag, at,
    // member_id); empty → missedReadError('objectives').
    documentVersionListRoute(OBJECTIVES_WIRING),
    documentVersionRoute(OBJECTIVES_WIRING),
    // Objective revisions nest under their parent objective:
    // param 0 is the path org, param 1 is the objective, so
    // the SERVER filters the collection to that objective
    // (the org fence still rides the facade re-entry). GET
    // is FLIPPED (Task 7): rides deriveObjectiveRevisions —
    // a bespoke derivation, not a DocumentFamilyWiring family
    // (a nested document carries no lifecycle state of its
    // own), so this calls it directly rather than through a
    // generic constructor, mirroring deriveFlowRecords' own
    // precedent above. The leaf id is param 2; only PUT is
    // exposed, unchanged from before this flip.
    route('organizations/:id/objectives/:id/revisions/', {
        get: (db, p, _actor, organization) =>
            deriveObjectiveRevisions(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    // Hand-written so PUT can append its message pair in the
    // same transaction (see message-pair.ts). Phase Final
    // Task 2: objective_revisions ROW half stripped — pure
    // message-plane write. WRITE_RESPONSE_SPECS successBody forms
    // the wire bytes; the reconstructed return is for type
    // parity with the former store put.
    route('organizations/:id/objectives/:id/revisions/:rid', {
        put: async (db, p, body, _actor, messagePair) => {
            const id = param(p, 2);
            const entity = objectiveRevisionEntityOf({
                name: id,
                messagePairId: id,
                method: 'PUT',
                body: withoutId(body),
            });
            // Phase Final Task 2: objective_revisions ROW
            // half stripped.
            if (messagePair !== undefined) {
                await runWrite(
                    db,
                    attemptFor([messagePair]),
                    [messagePair],
                );
            }
            return entity;
        },
    }),
    // Objective baseline scores nest under their parent
    // project: param 0 is the path org, param 1 is the
    // project, so the SERVER filters the collection to that
    // project (the org fence still rides the facade
    // re-entry). GET is FLIPPED (Task 7): rides
    // deriveBaselineScores — the SAME bespoke-derivation
    // reasoning as deriveObjectiveRevisions above (a project-
    // nested document, not a DocumentFamilyWiring family). The
    // leaf id is param 2; only PUT is exposed, unchanged from
    // before this flip.
    route(
        'organizations/:id/projects/:id'
        + '/objective-baseline-scores/',
        {
        get: (db, p, _actor, organization) =>
            deriveBaselineScores(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route(
        'organizations/:id/projects/:id'
        + '/objective-baseline-scores/:sid',
        {
        put: (db, p, body, actor, messagePair) =>
            postBaselineScoreDocumentOp(
                db, param(p, 2), body, actor, messagePair,
            ),
    }),
    // Objective actual scores nest under their parent project,
    // identically: param 0 is the path org, param 1 is the
    // project (server filter), leaf id is param 2, PUT only.
    // GET is FLIPPED (Task 7): rides
    // deriveActualScores, the actuals byte-twin of
    // deriveBaselineScores above.
    route(
        'organizations/:id/projects/:id'
        + '/objective-actual-scores/',
        {
        get: (db, p, _actor, organization) =>
            deriveActualScores(
                db, requireOrganization(organization),
                param(p, 1),
            ),
    }),
    route(
        'organizations/:id/projects/:id'
        + '/objective-actual-scores/:sid',
        {
        put: (db, p, body, actor, messagePair) =>
            postActualScoreDocumentOp(
                db, param(p, 2), body, actor, messagePair,
            ),
    }),
    // Bulk lifecycle collection RETIRED (states-URI
    // elimination C3): the five-source union is gone.
    // Per-entity history lives on GET <family>/:id/history
    // (work-orders stay /history; every other family stays
    // /versions/). Nested field-values collection retired
    // with C4 (inline fold on WO history). bare states/:id
    // is already a router 404 (states-document retirement
    // Task 13). Per-entity history alias retired with C2.
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
                // A trailing / is a collection
                // segment, never an :id.
                const captured =
                    pathSegments[i]!;
                if (captured === '') {
                    matched = false;
                    break;
                }
                params.push(captured);
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
