// Pre-tx pair formation for both seed paths (postMockDataLoad,
// postBootstrap in ../mock-data.ts). formWriteMessagePair's hashing is
// async crypto and cannot run inside the seed's one big
// TABLE_NAMES transaction. Formed pre-tx — crypto, hashing,
// and timers never run inside an open transaction
// (AGENTS.md § Transaction bodies await only row ops). So
// the seed becomes two
// passes: every op-invocation's pair is formed HERE, before any
// transaction opens (pass 1); the seed's existing single
// transaction then executes row ops only, passing each op its
// pre-formed pair (pass 2).
//
// Every body-builder below is the ONE construction its family
// uses for BOTH forming the pair (this file) and performing the
// actual write (mock-data.ts) — never two independently written
// literals that merely happen to agree, so a stored pair can
// never drift from what was actually written.
//
// The seed op-invocation families that accept a `pair?`
// parameter are covered here (traced against every
// postXxxCreationOp / postRecordWriteOp call site in
// mock-data.ts): human-members, ideas, idea-submissions,
// projects, flows, work-orders, flow-work-orders, ai-members,
// records, objectives, flow-records, baseline-scores,
// actual-scores, memberships, members. The work-order deferral
// NARROWS this phase to its historical traces alone (states
// events + state_field_values, still direct — a NAMED carve-out
// now bound to the states-consumers flip, not "the work-orders
// phase"); the entity and join rows leave the deferral list
// this phase, closed through postWorkOrderDocumentOp /
// postFlowWorkOrderDocumentOp. A further, previously-unlisted
// direct write — seed-flow-org2 — is ALSO covered here, closed
// through postFlowDocumentOp (Task 6). The 3 seeded flow_records
// join rows are the ONE genuine seed gap this phase closes last
// (Task 5): they formed zero message pairs before, now closed
// through postFlowRecordDocumentOp. Objectives' own create-time
// bundle grows from one pair to three (Phase 7 Task 3): the
// existing operation invocation stays, and the SAME per-pair-key
// discipline flows/records already established adds a document
// and a revision invocation per seeded objective. The scores
// deferral closes (Task 5 of Phase 7), landing WHOLE: baselines
// AND actuals (broader than "baselines" alone — the handoff's
// own phrasing) — one document message pair per seeded row,
// closed through postBaselineScoreDocumentOp /
// postActualScoreDocumentOp.
// The human-members/ai-members create-time bundle grows from one
// pair to three (Phase 8 Task 4, the objectives-family
// precedent generalized to the roster): the existing operation
// invocation stays, and the SAME per-pair-key discipline adds
// an identity-document invocation and a detail-document
// invocation (identities/:id, then PII) per seeded
// member. Bootstrap's lone 'XXZruirZyAOoRpNxaDnpSA' human-member create forms
// this SAME identity path via formBootstrapMessagePair. Memberships
// closed the LAST whole-slice seed deferral (Phase 8 Task 5):
// each seeded membership row (16 — 11 human-member-organization
// rows, `current` counted twice for its two-organization
// membership, + 4 ai-member rows) now folds in its OWN document
// message pair, closed through postMembershipDocumentOp.
// Leftover members/:id parent documents are gone from the
// seed.
// Bootstrap's membership forms this SAME pair via
// formBootstrapMessagePair. NO whole-slice seed
// deferral remains; the work-order historical traces stay the
// one NAMED direct-write carve-out above. The human-member
// create-time bundle widens once more, human-only (Phase 10 Task
// 5): a fourth invocation forms the identities/:id document
// message pair — a human member's own identity row, which an
// AI member never has (finding 10), so the ai-members loop
// below stays a triple.
// Bootstrap's lone 'XXZruirZyAOoRpNxaDnpSA' human-member create forms this
// SAME
// quadruple via formBootstrapMessagePair. Phase 10 Task 6 closes
// the identity spine's remaining raw writes: each seeded AI
// member and the system member ALSO form their OWN identities/:id
// document message pair (a standalone invocation — neither
// create-time bundle above ever carried one, so this widens
// no triple/quadruple), and each seeded role grant forms its
// OWN role-grants/:id document message pair. Every invocation
// here (as always) forms through the SAME formSeedMessagePair
// pipeline, UNTOUCHED — formSeedMessagePair is genesis
// by construction. The 13 identity-credential document
// message pairs (12 human passwords + the system client
// secret) are the ONE exception: a credential's body
// embeds its hashed secret, so each seed path hashes
// first, in hashSeedCredentials (api/mock-data.ts),
// before pass 1, and forms those 13 pairs through
// formSeedCredentialMessagePairs (below), which calls
// formSeedMessagePair directly rather than riding
// buildMockDataInvocations / formBootstrapMessagePair.
//
// Phase 11 Task 3 closed the historical-trace carve-out
// itself (the work-order deferral's last piece, named above):
// every trace event formed its own message pair through the
// SAME formSeedMessagePair pipeline every family above already rides.
// States-document retirement Task 12 reshapes those 861 traces
// (212 hand-authored + 649 generated) 1:1 into
// work-orders/:id/transition op-shaped pairs (op: true),
// folding the 7 mockStateFieldValues into the parent
// transition bodies' fieldValues — no bare states/:id or
// states/:id/field-values/:fvid seed pairs remain. Leftover
// members/:id genesis pairs are gone from the seed.
//
// Phase 12 Task 3 onboards a NEW family — organizations, the
// THIRTEENTH and last unflipped in-scope one
// (api/derive-organizations.ts), registered ahead of this task
// (family-registry.ts, Task 2). Its two seeded organizations
// (Stark Industries, Wayne Enterprises) form their OWN
// organizations/:id document message pair, the SAME
// per-family onboarding playbook every prior family already
// rode. Phase Final Task 2 strips the organizations ROW half
// — pairs alone remain. Bootstrap's own lone
// STARK_ORGANIZATION pair mirrors this via
// formBootstrapMessagePair below.

import type {
    Id,
    IdeaState,
    ProjectState,
    RecordState,
    StateEntity,
    StateFieldValueEntity,
    AIMemberEntity,
    IdeaEntity,
    IdeaSubmissionEntity,
    ProjectEntity,
    RecordEntity,
    RecordAttributeEntity,
    ProjectFlowEntity,
    WorkOrderEntity,
    FlowWorkOrderEntity,
    FlowRecordEntity,
    IdentityCredentialKind,
    OrganizationEntity,
} from '../../shared/types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    SYSTEM_MEMBER_ID,
    storedGraph,
} from '../../shared/types.ts';
import {
    formWriteMessagePair,
    IF_MATCH_HEADER,
    strongEtagOf,
} from '../message-pair.ts';
import { OPERATION_ID_HEADER } from '../../shared/message-id-fields.ts';
import type {
    MessagePair,
    ReceivedRequest,
} from '../message-pair.ts';
import { buildRequestModel } from '../message-form.ts';
import {
    generateIdentifier,
} from '../../shared/identifier.ts';
import {
    HTTP_NO_CONTENT,
} from '../../shared/http-errors.ts';
import {
    WRITE_RESPONSE_SPECS,
    flowCreateDocumentBody,
    recordDocumentBodyOf,
    recordAttributeDocumentBodyOf,
    objectiveDocumentBodyOf,
    objectiveRevisionBodyOf,
    identityDocumentBodyOf,
} from '../routes.ts';
import {
    validateFlowCreateBody,
    validateRecordWriteBody,
    validateObjectiveCreateBody,
} from '../validators.ts';
import { asStoredGraph } from '../../shared/flow-graph-body.ts';
import {
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
} from '../family-registry.ts';
import {
    MOCK_SEED_TIMESTAMP,
    STARK_ORGANIZATION,
    ORGANIZATION_TWO,
    assignOrganization,
    TIER_SEATS_LIMIT,
    TIER_PROJECTS_LIMIT,
    TIER_IDEAS_LIMIT,
} from './seed-constants.ts';
import {
    daysFromNow,
    humanMemberPoolsByOrganization,
    pickHumanMember,
    seedIdentifier,
} from './seed-kit.ts';
import {
    buildMembers,
    buildUnaffiliatedIdentity,
} from './members.ts';
import type { SeedHumanMember } from './members.ts';
import { buildIdeas, buildIdeaSubmissions } from './ideas.ts';
import { buildFlows, buildFlowGraphRelations } from './flows.ts';
import type { FlowSeed, FlowGraphRelations } from './flows.ts';
import { buildAiMembers } from './ai-members.ts';
import {
    buildRecords,
    buildRecordAttributes,
    customerProfileRecordId,
    projectBriefRecordId,
} from './records.ts';
import { OBJECTIVE_SEEDS } from './objectives.ts';
import {
    l2cFlowId,
    l2cProjectFlowId,
    buildLeadToCloseWorkload,
} from './lead-to-close-flow.ts';
import { l2cProjectId, buildProjects } from './projects.ts';
import {
    buildWorkOrders,
    buildFlowWorkOrderJoins,
    buildWorkOrderStateEvents,
} from './work-orders.ts';
import { buildSeedScoreRows } from './scores.ts';
import type { ScoreSeedProject } from './scores.ts';

// ---- hoisted static seed-event data ----
//
// Moved verbatim out of postMockDataLoadIn (mock-data.ts) so
// this file's pass-1 invocation list and that file's pass-2
// writes share ONE declaration apiece — pure literals, so the
// move changes nothing about when or how they're computed.

// Shared with every same-moment array below (flowStateEvents,
// mockProjectFlows, mockFlowRecords) — exported so there is
// exactly one `daysFromNow(-60, 9, 0)` call, not several.
export const wfTimestamp = daysFromNow(-60, 9, 0);

// The genesis facts a seeded document PUT carries beyond the
// entity row: its initial state and the member credited with
// creating it, keyed by entity id.
export interface SeedGenesis<S extends string> {
    readonly entityId: Id;
    readonly state: S;
    readonly memberId: Id;
}

// One genesis row per seeded idea: its initial state and the
// member credited with creating it.
export const ideaGenesis: readonly SeedGenesis<IdeaState>[] = [
    {
        entityId: 'YvOylAxOjQcgmNmsSoVBPQ',
        state: 'in_review',
        memberId: 'MQFcPtrZPIGjMCRAXtZUnA',
    },
    {
        entityId: 'WurwPqXxGtLhRAoCEcPzfQ',
        state: 'approved',
        memberId: 'VvzFEpfYONDAsCCwNlIFCQ',
    },
    {
        entityId: 'yrDiezFyhDHGgXzGeIWoSQ',
        state: 'active',
        memberId: 'CJrglMsNBxOWWfbihHQSeg',
    },
    {
        entityId: 'pYmalQFqpoXdbpYAJfOswA',
        state: 'in_review',
        memberId: 'jrMOZzVdWXvLgMpcHoyBTw',
    },
    {
        entityId: 'RAHAvUqwVABJnzTniWhUTQ',
        state: 'active',
        memberId: 'RPzLGrWcstxLaHoBcViPLQ',
    },
    {
        entityId: 'IjrYiSuRyjkQaqiRLhadAg',
        state: 'sent_back',
        memberId: 'zyGBRshxOnKHUfcyFRqowg',
    },
    {
        entityId: 'MmMKBsQBLxNfbMAOlAaKkQ',
        state: 'in_review',
        memberId: 'MQFcPtrZPIGjMCRAXtZUnA',
    },
    {
        entityId: 'QtpzfPiJsMdmoDpPaHvtVQ',
        state: 'in_review',
        memberId: 'SsVAZghfSzMZRZmxNKIizw',
    },
    {
        entityId: 'eizcntIrQMWrajcGkQZvUA',
        state: 'in_review',
        memberId: 'CJrglMsNBxOWWfbihHQSeg',
    },
    {
        entityId: 'AzSBhumyEAkdkFSUBaJrpA',
        state: 'in_review',
        memberId: 'jrMOZzVdWXvLgMpcHoyBTw',
    },
    {
        entityId: 'PkrEwSLQlrldLRwlAMVhRA',
        state: 'in_review',
        memberId: 'RPzLGrWcstxLaHoBcViPLQ',
    },
];

// One genesis row per seeded project (including the org-2
// override's own row): its initial state and the member
// credited with creating it.
export const projectGenesis: readonly SeedGenesis<ProjectState>[] = [
    {
        // 'submitted' so the scoring loop skips this
        // org-'BBjWJsjYIDkTRKIIPrzWRw'
        // project — no cross-org score against org-'AjdvjuECVZEgZoFajaIEkg'
        // objectives.
        entityId: seedIdentifier('seed-project-org2'),
        state: 'submitted',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'wqGTTFdYUGnmBxWCppmkOQ',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'kAxUZTXdcMCAttuoyCdSYA',
        state: 'archived',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: l2cProjectId,
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'ORXAfsQvNowpmJfBwQAtWg',
        state: 'under_review',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OTmPQEfeyDzqGNOmlFSUMw',
        state: 'archived',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OXxlaOFaAWfVofOqOHeTrQ',
        state: 'sent_back',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'ObmAspkIgRMWsTRDWpkSUw',
        state: 'under_review',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OfgrTrJuepfpmOSjtBhrYA',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OjDbHdsCibzUBZCSRSqucw',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OmGoTHQFHRevqlrGWPgtKA',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OtSStAjEiIerCMcUwNgMbQ',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OvIEhORMAYZxBcQZKkgkow',
        state: 'archived',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'OvJSmafViYCdfyAIdgzJTQ',
        state: 'under_review',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'PGtnaoTOuWCcbADPrancjA',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'PIImLccwpnfvbBBMsIKoMA',
        state: 'approved',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: 'PIfhHMLQQxTxKFDdabXbOw',
        state: 'submitted',
        memberId: SYSTEM_MEMBER_ID,
    },
];

// One state event per seeded flow — the creation moment of
// each flow on the states log, doubling as postFlowCreationOp's
// initial-state input. Authored by SYSTEM_MEMBER_ID at the
// shared wfTimestamp moment.
export const flowStateEvents: StateEntity[] = [
    {
        id: seedIdentifier('fSe01CustomerOnboard0aA'),
        entity_id: 'esKujtyQFYUJaVSXWwavzA',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'ZjCZiapaGHxuAHZxkpZTDw',
        entity_id: 'GgfDbXOJUvvaCekCTcvhuw',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'ZjChxNVgjmPgusJXkTxEXA',
        entity_id: 'DDUhYDIRInXtIrRraxcyHQ',
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: seedIdentifier('fSe04L3adt0Cl0se0aActiv'),
        entity_id: l2cFlowId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
];

// One genesis row per seeded Record: its initial state and
// the member credited with creating it.
export const recordGenesis: readonly SeedGenesis<RecordState>[] = [
    {
        entityId: customerProfileRecordId,
        state: 'active',
        memberId: SYSTEM_MEMBER_ID,
    },
    {
        entityId: projectBriefRecordId,
        state: 'active',
        memberId: SYSTEM_MEMBER_ID,
    },
];

// The seven field-value captures recorded on the hand-authored
// work order's own trace events — its Review transition's Data
// Capture intake fields, plus one reviewer note on its Complete
// transition. Attribute ids are customerProfileRecordId's Data
// Capture / Review record-attribute ids (records.ts). WO-instance
// SoT (Task 6): WO01's two value-bearing transitions ride the
// new-shape set[] + instance revision chain; seedSetFor maps
// these rows (fv row ids retire — new-shape ids are attribute
// ids). Other transitions keep legacy fieldValues forever.
const fCompanyName = 'CPJmMPXRaBIiNdGBofUPVg';
const fEmail = 'oeqelDVElwxHYWkWRVTCYw';
const fPhone = 'kxbdVhmkaEzkJvghWKFzkw';
const fIndustry = 'QHzHnEAmqGSgiEfkXoWMTw';
const fRevenue = 'AXxvHyKNpNYXYKOorywqRQ';
const fEmployees = 'DfkwfBiyfyCyRHvsHnDiqQ';
const fReviewerNotes = 'ElVKgkCreTEHQXJZPBJDKw';

// WO01 Review / Complete event ids — the only value-bearing
// seed transitions (transitionSeedBody's value branch). They
// leave the op-driven loop: in the rehearsal they drive the
// organization-scoped transition op instead.
export const WO01_REVIEW_EVENT_ID =
    'YiTfnydHjXVkotLACabXeQ';
export const WO01_COMPLETE_EVENT_ID =
    'FIGqMByLITfUxFFGaBEePw';
export const VALUE_BEARING_TRANSITION_EVENT_IDS:
    ReadonlySet<string> = new Set([
        WO01_REVIEW_EVENT_ID,
        WO01_COMPLETE_EVENT_ID,
    ]);

// Seeded Customer-Profile instance bound to WO01.
export const SEED_INSTANCE_ID =
    seedIdentifier('inst01W001CustProfAcme1');
export const SEED_RECORD_TYPE_ID =
    customerProfileRecordId;
export const WO01_ID = 'xqcXYHXBJJXcLkRYkRngKA';

// The unaffiliated identity's pending Stark invitation —
// exported so pass 2 (mock-data.ts) grants it through the
// live postOrganizationInvitationGrant. Preimages
// registered in seed-hash-preimage.ts.
export const UNAFFILIATED_INVITATION_ID =
    seedIdentifier('seed-invitation-riley-stark');
const UNAFFILIATED_INVITATION_GRANT_EVENT_ID =
    seedIdentifier('seed-invitation-riley-stark-grant');

export const mockStateFieldValues: StateFieldValueEntity[] = [
    {
        id: 'CCiZyMeJtKzkjmIqUpDgmA',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fCompanyName,
        value: 'Acme Corp',
    },
    {
        id: 'NgDFoYnvUQUoXHdTgLHqVA',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fEmail,
        value: 'onboard@acme.com',
    },
    {
        id: 'lZYDJpDRuccNsrUiAPLxSA',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fPhone,
        value: '+1-555-0100',
    },
    {
        id: 'HDDxSrEmdWbcVdxwhTTuLQ',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fIndustry,
        value: 'Technology',
    },
    {
        id: 'CLkNjzdqMkndamDaVKQOHA',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fRevenue,
        value: '5000000',
    },
    {
        id: 'kVSbxwrbAWOttfrHxYpXEg',
        state_event_id: WO01_REVIEW_EVENT_ID,
        attribute_id: fEmployees,
        value: '250',
    },
    {
        id: 'xcWYWIwHMleaIMKDLhblGg',
        state_event_id: WO01_COMPLETE_EVENT_ID,
        attribute_id: fReviewerNotes,
        value: 'Approved. Strong fit.',
    },
];

// The project<->flow join rows postFlowCreationOp writes
// alongside each flow it creates.
export const mockProjectFlows: ProjectFlowEntity[] = [
    {
        id: 'odduyeNIUVDwJRwKajtzsw',
        project_id: 'wqGTTFdYUGnmBxWCppmkOQ',
        flow_id: 'esKujtyQFYUJaVSXWwavzA',
        at: wfTimestamp,
    },
    {
        id: 'CQBaDoaiAXVHpJztllIDOA',
        project_id: 'kAxUZTXdcMCAttuoyCdSYA',
        flow_id: 'GgfDbXOJUvvaCekCTcvhuw',
        at: wfTimestamp,
    },
    {
        id: 'ECsMuhiPqBaILNBzyRlVqQ',
        project_id: 'wqGTTFdYUGnmBxWCppmkOQ',
        flow_id: 'DDUhYDIRInXtIrRraxcyHQ',
        at: wfTimestamp,
    },
    {
        id: l2cProjectFlowId,
        project_id: l2cProjectId,
        flow_id: l2cFlowId,
        at: wfTimestamp,
    },
];

// Flow ↔ Record bindings. Customer Profile
// (org 'AjdvjuECVZEgZoFajaIEkg') is
// bound
// to two flows (Customer Onboarding and Lead-to-Close); Project
// Brief (org 'BBjWJsjYIDkTRKIIPrzWRw') is bound to the
// org-'BBjWJsjYIDkTRKIIPrzWRw' flow so every binding
// stays within one org. The Layout Test flow is left unbound —
// it exists to exercise Auto Layout. Shared with mock-data.ts's
// own pass-2 write of the SAME rows (through
// postFlowRecordDocumentOp, Phase 6 Task 5) — exported so there
// is exactly one declaration, not two.
export const mockFlowRecords: FlowRecordEntity[] = [
    {
        id: 'dDmnfQddFbigpThjftUlWg',
        flow_id: 'esKujtyQFYUJaVSXWwavzA',
        record_id: customerProfileRecordId,
        at: wfTimestamp,
    },
    {
        id: 'dEOBUSXWcOtSmtDXJpVNuQ',
        flow_id: l2cFlowId,
        record_id: customerProfileRecordId,
        at: wfTimestamp,
    },
    {
        // Project Brief lives in org 'BBjWJsjYIDkTRKIIPrzWRw'
        // (assignOrganization(index 1)), so it binds to
        // the org-'BBjWJsjYIDkTRKIIPrzWRw' flow — flowOrganization ===
        // recordOrganization keeps the binding visible
        // behind the org fence.
        id: 'dGFWxGmaxtWWawferGBezQ',
        flow_id: seedIdentifier('seed-flow-org2'),
        record_id: projectBriefRecordId,
        at: wfTimestamp,
    },
];

// ---- per-family body builders ----
//
// Each returns the EXACT object its family's postXxxOp receives
// as its body/payload argument — the same construction feeds
// both formWriteMessagePair (here) and the actual write (mock-data.ts).

// The wire body a live PUT organizations/:id would carry for a
// seeded organization row (Phase 12 Task 3): the six
// OrganizationEntity fields, no id (a route param, not a body
// field) — the SAME shape validateOrganizationEntity accepts
// (api/derive-organizations.ts's own organizationEntityOf
// reconstructs a row from this SAME shape). organizations is
// GLOBAL plane (the tenant root itself — never organization-
// nested, family-registry.ts), so the invocation's own
// `organization` slot stays undefined, mirroring the
// members-family invocations below rather than memberships'
// org-nested one. seats/projects_limit/ideas_limit ride the SAME
// TIER_* constants (seed-constants.ts) the row write uses, so a
// seeded pair can never drift from what mock-data.ts actually
// stores.
export function organizationSeedBody(
    name: string, domain: string, nextBilling: string,
): Omit<OrganizationEntity, 'id'> {
    return {
        name,
        domain,
        next_billing: nextBilling,
        seats: TIER_SEATS_LIMIT,
        projects_limit: TIER_PROJECTS_LIMIT,
        ideas_limit: TIER_IDEAS_LIMIT,
    };
}

// The two seeded organizations' document bodies: one
// voice for pass 1's invocations and pass 2's op calls.
export function seededOrganizationBody(
    organizationId: Id,
): Record<string, unknown> {
    if (organizationId === STARK_ORGANIZATION) {
        return organizationSeedBody(
            'Stark Industries', 'acmecorp.com',
            daysFromNow(300, 0, 0),
        );
    }
    if (organizationId === ORGANIZATION_TWO) {
        return organizationSeedBody(
            'Wayne Enterprises', 'wayne.example.com',
            daysFromNow(200, 0, 0),
        );
    }
    throw new Error('no seeded organization ' + organizationId);
}

// The PII facet a human seed's separate PUT identities/:id/pii
// carries (Phase 10 Task 2's intake decomposition) — the SAME
// four fields the human seed once embedded in its own
// `pii` key, now split into their own document write. The ONE
// construction both pass 1 (this file's invocation body) and
// pass 2 (mock-data.ts's postIdentityPiiDocumentOp call) share.
export function humanMemberPiiSeedBody(
    member: SeedHumanMember,
): Record<string, unknown> {
    const { name, email, phone, bio } = member;
    return { name, email, phone, bio };
}

// The genesis case of the document PUT ideas/:id (Decision 7,
// Phase 2 Task 3): the flat entity fields plus state, no `id`
// (a route param, not a body field) and no
// `idea`/`initialState*` wrapper. organization_id rides along
// as the validator's tolerated-but-ignored extra — load-bearing
// here since the seed drives postIdeaDocumentOp below the org
// fence (no scoping wrapper to stamp it).
export function ideaSeedBody(
    idea: Omit<IdeaEntity, 'organization_id' | 'state'>,
    state: IdeaState,
    index: number,
): Record<string, unknown> {
    const { id: _id, ...ideaFields } = idea;
    return {
        ...ideaFields,
        organization_id: assignOrganization(index),
        state,
    };
}

// The genesis case of the document PUT
// ideas/:id/submissions/:sid (Phase 2 Task 4b): the flat
// entity fields, no `id` (a route param, not a body field) —
// the SAME shape putIdeaSubmission's ctx.PUT body carries
// (web-app/app/adapters/ideas.ts).
export function ideaSubmissionSeedBody(
    submission: IdeaSubmissionEntity,
): Record<string, unknown> {
    const { id: _id, ...fields } = submission;
    return { ...fields };
}

// The genesis case of the document PUT projects/:id (mirrors
// ideaSeedBody exactly): the flat entity fields plus state,
// no `id` (a route param, not a body field).
// organization_id rides along as the validator's tolerated-but-
// ignored extra — load-bearing here since the seed drives
// postProjectDocumentOp below the org fence (no scoping wrapper
// to stamp it). Unlike ideas, every Stark project shares one
// org, so `organization` is passed straight through rather than
// derived from an index.
export function projectSeedBody(
    project: Omit<ProjectEntity, 'organization_id' | 'state'>,
    state: ProjectState,
    organization: Id,
): Record<string, unknown> {
    const { id: _id, ...projectFields } = project;
    return {
        ...projectFields,
        organization_id: organization,
        state,
    };
}

// The 17th seeded project: organization 'BBjWJsjYIDkTRKIIPrzWRw' owns a
// small,
// self-contained slice so each org owns at least one (mirrors
// ORGANIZATION_TWO_OBJECTIVE). A near-copy of the first Stark
// project under its own id and title — the ONE shared
// construction both the invocation loop (this file) and the
// write (mock-data.ts) use, so pass 1's pair can never drift
// from what pass 2 actually stores. The literal id (matching
// the sibling 'seed-flow-org2' / 'seed-state-flow-org2' sentinels
// above) is exported so both files compare against the SAME
// string rather than each re-typing it.
export const secondOrganizationProjectId =
    seedIdentifier('seed-project-org2');

type ProjectSeedFields = Omit<
    ProjectEntity, 'organization_id' | 'state'
>;

export function projectOrg2(
    projects: readonly ProjectSeedFields[],
): ProjectSeedFields {
    return {
        ...projects[0]!,
        id: secondOrganizationProjectId,
        title: 'Wayne R&D Portfolio',
    };
}

// Every Stark project lands in STARK_ORGANIZATION; the lone
// org-2 override (secondOrganizationProjectId) lands in
// ORGANIZATION_TWO. The ONE construction both pass 1 (this
// file's buildMockDataInvocations) and pass 2
// (mock-data.ts's postProjectDocumentOp loop) consume, so
// neither can drift from the other by hand-editing a second
// ternary.
export function projectOrganizationFor(
    project: ProjectSeedFields,
): Id {
    return project.id === secondOrganizationProjectId
        ? ORGANIZATION_TWO
        : STARK_ORGANIZATION;
}

// The ScoreSeedProject view buildSeedScoreRows needs per
// project — id, organization_id, start_date, state — resolved
// PURELY from the SAME projectGenesis / projectOrganizationFor
// / buildProjects / projectOrg2 both pass 1 (this file) and
// pass 2 (mock-data.ts) already share, so a future project
// addition can never drift the two callers apart.
export function buildScoreSeedProjects():
    readonly ScoreSeedProject[] {
    const projects = buildProjects();
    const projectGenesisById = new Map(
        projectGenesis.map(g => [g.entityId, g]),
    );
    return [...projects, projectOrg2(projects)].map(
        project => ({
            id: project.id,
            organization_id: projectOrganizationFor(project),
            start_date: project.start_date,
            state: projectGenesisById.get(project.id)!.state,
        }),
    );
}

// CREATE reduction rebuilds memberIds from memberEvents
// and drops agentIds. Stamp the authored agentIds onto
// the stored document graph so GET derive matches the
// seed source.
function seedFlowDocumentBody(
    createBody: ReturnType<typeof validateFlowCreateBody>,
    authored: FlowSeed['graph'],
): Record<string, unknown> {
    const document = flowCreateDocumentBody(createBody);
    const reduced = asStoredGraph(
        document['graph'], 'seed reduced graph',
    );
    const source = asStoredGraph(
        authored, 'seed authored graph',
    );
    const agents = new Map(
        source.nodes.map((node) => [node.id, node.agentIds]),
    );
    return {
        ...document,
        graph: storedGraph({
            nodes: reduced.nodes.map((node) => {
                const agentIds = agents.get(node.id);
                return agentIds !== undefined
                    && agentIds.length > 0
                    ? { ...node, agentIds }
                    : node;
            }),
            edges: reduced.edges,
        }),
    };
}

export function flowSeedBody(
    flow: FlowSeed,
    event: StateEntity,
    projectFlow: ProjectFlowEntity,
    flowRelations: FlowGraphRelations,
): Record<string, unknown> {
    const { graph: _graph, id, ...row } = flow;
    const nodeIds = new Set(
        flowRelations.nodes
            .filter(n => n.flow_id === id)
            .map(n => n.id),
    );
    return {
        id,
        flow: {
            ...row, organization_id: STARK_ORGANIZATION,
        },
        projectFlowId: projectFlow.id,
        projectFlow: {
            project_id: projectFlow.project_id,
            flow_id: projectFlow.flow_id,
            at: projectFlow.at,
        },
        initialState: event.state,
        initialStateEventId: event.id,
        initialStateAt: event.at,
        graphDelta: {
            nodes: flowRelations.nodes.filter(
                n => n.flow_id === id,
            ),
            edges: flowRelations.edges.filter(
                e => e.flow_id === id,
            ),
            deletions: [],
            memberEvents: flowRelations.members.filter(
                m => nodeIds.has(m.flow_node_id),
            ),
            attributeEvents:
                flowRelations.attributes.filter(
                    a => nodeIds.has(a.flow_node_id),
                ),
        },
    };
}

// The genesis case of the document PUT flows/:id for
// organization 'BBjWJsjYIDkTRKIIPrzWRw's own flow (Task 6): mirrors
// ideaSeedBody/
// projectSeedBody's shape — the flat entity fields plus the
// lifecycle trio — but for the flows family, which also
// carries the client-authored graph snapshot and the two
// transitional decomposition sidecars (validateFlowDocumentBody).
// This flow has no project_flows join row (org 'BBjWJsjYIDkTRKIIPrzWRw' gets
// a
// flow-free project and a work-order-free flow — no cross-org
// coupling), so it drives through postFlowDocumentOp rather
// than postFlowCreationOp (which requires a join row).
// organization_id rides along as the validator's tolerated-
// but-ignored extra — load-bearing here since the seed drives
// postFlowDocumentOp below the org fence (no scoping wrapper
// to stamp it). A fresh flow starts with an empty graph and
// revives nothing.
export function flowOrg2SeedBody(): Record<string, unknown> {
    return {
        organization_id: ORGANIZATION_TWO,
        name: 'Wayne Onboarding',
        is_locked: false,
        is_auto_layout: true,
        is_auto_fit: true,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state: 'active',
        state_at: MOCK_SEED_TIMESTAMP,
        state_event_id: seedIdentifier(
            'seed-state-flow-org2',
        ),
        graph: { nodes: [], edges: [] },
        graphDelta: {
            nodes: [],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
        revivals: [],
    };
}

// The genesis case of the document PUT work-orders/:id
// (Phase 5 Task 4): the flat entity fields, no `id` (a route
// param, not a body field). organization_id rides along as
// the validator's tolerated-but-ignored extra — load-bearing
// here since the seed drives postWorkOrderDocumentOp below the
// org fence (no scoping wrapper to stamp it). Every seeded work
// order is Stark (finding 7) — hand-authored rows omit
// organization_id entirely (the composition root's own job);
// generated rows already carry it (STARK_ORGANIZATION, set by
// generateFlowWorkload) — either way the merge below re-asserts
// the same value, so ONE construction serves both sources.
export function workOrderDocumentSeedBody(
    row: Omit<WorkOrderEntity, 'organization_id'>,
): Record<string, unknown> {
    const { id: _id, ...fields } = row;
    return { ...fields, organization_id: STARK_ORGANIZATION };
}

// The genesis case of the document PUT
// flows/:id/work-orders/:woid (Phase 5 Task 4): the flat join
// fields, no `id` (a route param, not a body field) — the SAME
// three keys (flow_id, work_order_id, at) the live :woid PUT's
// validateFlowWorkOrderEntity accepts.
export function flowWorkOrderJoinSeedBody(
    row: FlowWorkOrderEntity,
): Record<string, unknown> {
    const { id: _id, ...fields } = row;
    return { ...fields };
}

// The live POST work-orders/:id/transition body this SAME
// historical event would have carried: 1:1 field mapping, no
// invention. Split: WO01's two value-bearing events (Review 6
// + Complete 1) emit the NEW instance-head shape (set from
// seedSetFor; fv row ids retire); every other transition keeps
// the LEGACY fieldValues body forever (event fidelity; empty
// bags on pure moves). release is null — traces never released
// claims (zero seeded claim events).
export function transitionSeedBody(
    event: StateEntity,
): Record<string, unknown> {
    const set = seedSetFor(event.id);
    if (set.length > 0) {
        return {
            transitionEventId: event.id,
            targetState: event.state,
            instance_id: SEED_INSTANCE_ID,
            record_type_id: SEED_RECORD_TYPE_ID,
            set,
            release: null,
            transitionAt: event.at,
        };
    }
    return {
        transitionEventId: event.id,
        targetState: event.state,
        fieldValues: seedFieldValuesFor(event.id),
        release: null,
        transitionAt: event.at,
    };
}

// New-shape set rows: attribute_id + value only (no fv row
// id). Source rows stay in mockStateFieldValues for one
// construction voice with the legacy map.
export function seedSetFor(
    stateEventId: Id,
): { attribute_id: string; value: string }[] {
    return mockStateFieldValues
        .filter((fv) => fv.state_event_id === stateEventId)
        .map((fv) => ({
            attribute_id: fv.attribute_id,
            value: fv.value,
        }));
}

function seedFieldValuesFor(
    stateEventId: Id,
): Record<string, unknown>[] {
    return mockStateFieldValues
        .filter((fv) => fv.state_event_id === stateEventId)
        .map((fv) => ({
            id: fv.id,
            fields: {
                state_event_id: fv.state_event_id,
                attribute_id: fv.attribute_id,
                value: fv.value,
            },
        }));
}

// The genesis case of the document PUT
// flows/:id/records/:frid (Phase 6 Task 5): the flat join
// fields, no `id` (a route param, not a body field) — the SAME
// three keys (flow_id, record_id, at) the live :frid PUT's
// validateFlowRecordEntity accepts.
export function flowRecordJoinSeedBody(
    row: FlowRecordEntity,
): Record<string, unknown> {
    const { id: _id, ...fields } = row;
    return { ...fields };
}

// Every seeded flow-record join binds within one org (mirrors
// mockFlowRecords' own comment: flowOrganization ===
// recordOrganization keeps the binding visible behind the org
// fence). Only 'seed-flow-org2' sits in org 'BBjWJsjYIDkTRKIIPrzWRw'; every
// other
// seeded flow is Stark — mirrors projectOrganizationFor's own
// single-override shape above.
export function flowRecordOrganizationFor(
    join: FlowRecordEntity,
): Id {
    return join.flow_id === seedIdentifier('seed-flow-org2')
        ? ORGANIZATION_TWO
        : STARK_ORGANIZATION;
}

export function aiMemberSeedBody(
    m: AIMemberEntity,
): Record<string, unknown> {
    const { id: _id, ...detail } = m;
    return {
        id: m.id,
        detail,
        initialState: 'active',
        initialStateEventId: seedIdentifier(
            `seed-member-${m.id}-active`,
        ),
        initialStateAt: MOCK_SEED_TIMESTAMP,
    };
}

// The wire body a live PUT memberships/:id would carry for this
// SAME write: {organization_id, identity_id, type, at} — the
// membershipDocumentEntityOf precedent (api/routes.ts), the ONE
// shape every seeded membership row (human, AI, bootstrap)
// shares. Hoisted so pass 1 (this file) and pass 2
// (mock-data.ts) share the SAME construction — the
// aiMemberSeedBody precedent, generalized
// to the roster membership entity. `type` is required: writers
// pass it explicitly (no schema default).
export function membershipSeedBody(
    organizationId: Id,
    identityId: Id,
    type: 'admin' | 'member',
): Record<string, unknown> {
    return {
        organization_id: organizationId,
        identity_id: identityId,
        type,
        at: MOCK_SEED_TIMESTAMP,
    };
}

export function seatSeedBody(
    type: 'admin' | 'member',
    at: string = MOCK_SEED_TIMESTAMP,
): Record<string, unknown> {
    return { type, at };
}

export function identityPersonSeedBody(
    member: SeedHumanMember,
): Record<string, unknown> {
    return identityDocumentBodyOf('person', {
        title: member.title,
        department: member.department,
        strengths: member.strengths,
        team_dimensions: member.team_dimensions,
    });
}

export function bootstrapCurrentIdentityBody():
    Record<string, unknown> {
    return identityDocumentBodyOf('person', {
        title: 'Admin',
        department: 'Product',
        strengths: [
            'Strategic Planning',
            'Data Analysis',
            'Stakeholder Management',
        ],
        team_dimensions: {
            driver: 80,
            analytical: 80,
            expressive: 80,
            amiable: 80,
        },
    });
}

// The wire body a live PUT role-grants/:id would carry for this
// SAME write: {organization_id, identity_id, role, action,
// by_member_id, at} — the ONE shape every seeded role grant
// (the two `current` admin grants, one per-member grant, and
// bootstrap's own) shares. Hoisted (Phase 10 Task 6) so pass 1
// (this file) and pass 2 (mock-data.ts) share the SAME
// construction — the membershipSeedBody precedent above, for the
// role ledger.
export function roleGrantSeedBody(
    organizationId: Id, identityId: Id, role: string,
): Record<string, unknown> {
    return {
        organization_id: organizationId,
        identity_id: identityId,
        role,
        action: 'granted',
        by_member_id: SYSTEM_MEMBER_ID,
        at: MOCK_SEED_TIMESTAMP,
    };
}

// The wire body a live PUT identities/:id/credentials/:cid would
// carry for this SAME write: {identity_id, kind, status, secret,
// at} — the ONE shape every seeded credential (12 human
// passwords + the system client secret, both mock-data and
// bootstrap) shares. Hoisted (Phase 10 Task 6) so
// formSeedCredentialMessagePairs (this file) and
// postSeedCredentialsIn (mock-data.ts) share the SAME
// construction — the
// membershipSeedBody precedent above, for the credential ledger.
// `secret` is the POST-HASH value only — the plaintext never
// reaches this construction (scripture: We guard the
// threshold of trust).
export function identityCredentialSeedBody(
    identityId: Id, kind: IdentityCredentialKind, secret: string,
): Record<string, unknown> {
    return {
        identity_id: identityId,
        kind,
        status: 'set',
        secret,
        at: MOCK_SEED_TIMESTAMP,
    };
}

// The wire body a live PUT identities/:id/default-organization
// would carry: { organization_id }.
export function defaultOrganizationSeedBody(
    organizationId: Id,
): Record<string, unknown> {
    return { organization_id: organizationId };
}

export function recordSeedBody(
    r: Omit<RecordEntity, 'organization_id' | 'state'>,
    index: number,
    state: RecordState,
    attributes: readonly Omit<
        RecordAttributeEntity, 'organization_id'
    >[],
): Record<string, unknown> {
    const organization = assignOrganization(index);
    return {
        kind: 'create',
        id: r.id,
        record: {
            organization_id: organization,
            name: r.name,
            description: r.description,
            position: r.position,
        },
        attributes: attributes.map(a => ({
            id: a.id,
            record_id: a.record_id,
            organization_id: organization,
            name: a.name,
            attribute_type: a.attribute_type,
            sort_order: a.sort_order,
            options: a.options,
            constraints: a.constraints,
        })),
        initialState: state,
    };
}

interface ObjectiveSeed {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly description: string;
}

// The create body for POST /objectives — objective row,
// first revision, and the initial state. The initial state
// folds onto the document message pair via
// objectiveDocumentBodyOf; pair count is unchanged — only
// body bytes grow.
export function objectiveSeedBody(
    seed: ObjectiveSeed,
    organization: Id,
    memberId: Id,
): Record<string, unknown> {
    return {
        id: seed.id,
        objective: {
            organization_id: organization,
            position: seed.position,
        },
        revisionId: seedIdentifier(
            `${seed.id}:${MOCK_SEED_TIMESTAMP}`,
        ),
        revision: {
            objective_id: seed.id,
            name: seed.name,
            description: seed.description,
            member_id: memberId,
            at: MOCK_SEED_TIMESTAMP,
        },
        initialState: 'active',
    };
}

// Org 'BBjWJsjYIDkTRKIIPrzWRw' owns one objective so each org owns at least
// one —
// mirrors the STARK OBJECTIVE_SEEDS shape without a seed entry.
// Exported so mock-data.ts's pass-2 write uses this SAME
// literal rather than a second, independently maintained copy.
export const ORGANIZATION_TWO_OBJECTIVE: ObjectiveSeed = {
    id: seedIdentifier('seed-objective-org2'),
    position: 0,
    name: 'Wayne demo objective',
    description: 'Second-org demo objective.',
};

// The bootstrap membership's own id — exported so pass 1 (this
// file) and pass 2 (mock-data.ts's postBootstrapIn) compare
// against the SAME string rather than each re-typing it, the
// secondOrganizationProjectId precedent above.
export const bootstrapMembershipId = 'bootstrap-membership-current';

// The bootstrap role grant's own id — the SAME
// bootstrapMembershipId precedent above, for the admin grant
// Task 6 re-points onto postRoleGrantDocumentOp.
export const bootstrapRoleGrantId = 'bootstrap-role-current-admin';

// Every member's PRIMARY organization: 'XXZruirZyAOoRpNxaDnpSA' orders Stark
// first (alongside org Two, in postMockDataLoadIn's own
// membership loop); every other human has exactly one, via
// assignOrganization. The identity_default_organizations seed
// (Task 8) needs this SAME "first org" value the membership
// loop's own `organizations[0]` already resolves to — hoisted so
// neither site can silently drift from the other.
export function memberPrimaryOrganization(
    memberId: Id, index: number,
): Id {
    return memberId === 'XXZruirZyAOoRpNxaDnpSA'
        ? STARK_ORGANIZATION
        : assignOrganization(index);
}

export function bootstrapCurrentMemberBody(
    initialStateAt: string,
): Record<string, unknown> {
    return {
        id: 'XXZruirZyAOoRpNxaDnpSA',
        detail: {
            title: 'Admin',
            department: 'Product',
            strengths: [
                'Strategic Planning',
                'Data Analysis',
                'Stakeholder Management',
            ],
            team_dimensions: {
                driver: 80,
                analytical: 80,
                expressive: 80,
                amiable: 80,
            },
        },
        initialState: 'active',
        initialStateEventId: seedIdentifier(
            'bootstrap-current-active',
        ),
        initialStateAt,
    };
}

// The bootstrap XeNICvLNKhXddnTKnszfpQ's PII facet, split into its own
// PUT identities/:id/pii write (Phase 10 Task 2's intake
// decomposition) — the SAME fields bootstrapCurrentMemberBody
// once embedded in its own `pii` key. The ONE construction both
// pass 1 (this file's invocation body) and pass 2 (mock-data.ts's
// postIdentityPiiDocumentOp call) share.
export function bootstrapCurrentMemberPiiBody():
    Record<string, unknown> {
    return {
        name: 'Tony Stark',
        email: 'demo@example.com',
        phone: '+1 (555) 123-4567',
        bio: 'Passionate about building'
            + ' products that solve'
            + ' real problems.',
    };
}

// ---- pass 1: the op-invocation list + pair formation ----

export function seedMessagePairKey(
    routePattern: string, id: string,
): string {
    return routePattern + ':' + id;
}

interface MockDataInvocation {
    readonly key: string;
    readonly routePattern: string;
    // Present for a document-class genesis PUT AND for an
    // operation-shaped POST at an id-carrying pattern: the path
    // value for each ':'-prefixed route segment, in pattern
    // order — one entry for 'ideas/:id' (Phase 2 Task 3), two
    // for 'ideas/:id/submissions/:sid' (Phase 2 Task 4b: the
    // idea id, then the submission id). Absent for the five bare
    // collection-POST creates, which keep forming a POST at the
    // bare pattern exactly as before.
    readonly idParams?: readonly Id[];
    // An operation-shaped POST at an id-carrying pattern
    // (work-orders/:id/transition): idParams fill the :id
    // slots for the path (name stays '' — pathAndNameOf
    // keys on the LAST segment), but the method is POST and
    // the response is the op's own {status: 204} spec.
    readonly op?: true;
    readonly organization: Id | undefined;
    readonly requesterIdentityId: Id;
    readonly body: Record<string, unknown>;
    // The simulated operation this pair belongs to. Pairs
    // one operation writes share its one id (Decision 2).
    readonly operation: string;
}

// Dependency-ordered (matches postMockDataLoadIn's write order):
// memberships + human-members, ideas, organizations (Phase 12
// Task 3), idea-submissions, projects, flows, work-orders,
// flow-work-orders, the work-order historical traces as
// work-orders/:id/transition ops (states-document retirement
// Task 12; field values fold into those bodies), memberships
// + ai-members, the system member's own document, records,
// flow-records, objectives. A dropped or reordered invocation
// here is caught by tests/mock-data-pairs.test.ts's pinned
// invocation count.
export function buildMockDataInvocations():
    readonly MockDataInvocation[] {
    const members = buildMembers();
    const ideaGenesisById = new Map(
        ideaGenesis.map(g => [g.entityId, g]),
    );
    const ideas = buildIdeas();
    const projects = buildProjects();
    const projectGenesisById = new Map(
        projectGenesis.map(g => [g.entityId, g]),
    );
    const mockFlows = buildFlows();
    const flowRelations = buildFlowGraphRelations(
        mockFlows, MOCK_SEED_TIMESTAMP,
    );
    const flowStateEventByFlowId = new Map(
        flowStateEvents.map(e => [e.entity_id, e]),
    );
    const aiMembers = buildAiMembers();
    const mockRecords = buildRecords();
    const mockRecordAttributes = buildRecordAttributes();
    const recordGenesisById = new Map(
        recordGenesis.map(g => [g.entityId, g]),
    );
    const pools = humanMemberPoolsByOrganization(members);
    const workOrders = buildWorkOrders();
    const flowWorkOrderJoins = buildFlowWorkOrderJoins();
    const workOrderStateEvents = buildWorkOrderStateEvents();
    const leadToCloseWorkload = buildLeadToCloseWorkload();
    // First-occurrence-wins: the WO's first seeded states event's
    // member_id (the flows genesis-member precedent), read off
    // the SAME two state-event arrays mock-data.ts's historical-
    // trace carve-out still writes directly. Empirically verified
    // (lens 4): all 145 work orders carry at least one event, and
    // first-in-array-order equals earliest-by-`at` for every one —
    // the lookup is unambiguous.
    const workOrderFirstEventMemberId = new Map<Id, Id>();
    for (const event of [
        ...workOrderStateEvents,
        ...leadToCloseWorkload.stateEvents,
    ]) {
        if (!workOrderFirstEventMemberId.has(event.entity_id)) {
            workOrderFirstEventMemberId.set(
                event.entity_id, event.member_id,
            );
        }
    }

    const invocations: MockDataInvocation[] = [];

    members.forEach((member, index) => {
        // Task 5: 'XXZruirZyAOoRpNxaDnpSA' (the admin) joins BOTH orgs; every
        // other human is single-org via assignOrganization — the
        // SAME per-member partition postMockDataLoadIn's own
        // membership loop uses (mock-data.ts). Each row folds in
        // its OWN document message pair, closed through
        // postMembershipDocumentOp, ordered before the
        // human-member triple below — the SAME write order
        // postMockDataLoadIn uses (memberships land before the
        // member they join is created).
        const organizations = member.id === 'XXZruirZyAOoRpNxaDnpSA'
            ? [STARK_ORGANIZATION, ORGANIZATION_TWO]
            : [assignOrganization(index)];
        organizations.forEach((organization, n) => {
            const type = member.id === 'XXZruirZyAOoRpNxaDnpSA'
                ? 'admin' as const
                : 'member' as const;
            const seatKey = seedMessagePairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                member.id + '-' + n,
            );
            invocations.push({
                key: seatKey,
                routePattern:
                    ORGANIZATION_MEMBER_DETAIL_PATTERN,
                idParams: [organization, member.id],
                organization,
                requesterIdentityId: SYSTEM_MEMBER_ID,
                body: seatSeedBody(type),
                operation: seatKey,
            });
        });
        const identityKey = seedMessagePairKey(
            'identities/:id', member.id,
        );
        invocations.push({
            key: identityKey,
            routePattern: 'identities/:id',
            idParams: [member.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: identityPersonSeedBody(member),
            operation: identityKey,
        });
        // Phase 10 Task 2: the PII facet's own document
        // message pair, closing the intake decomposition's
        // seed side — its own document (identities/:id/pii),
        // formed the SAME way
        // every other per-member invocation above is, over the
        // SAME body humanMemberPiiSeedBody hands the actual write
        // (mock-data.ts) so the two can never drift. ORDERING:
        // the rehearsal writes this PII in its first wave and
        // the credential documents in its last.
        const piiKey = seedMessagePairKey(
            'identities/:id/pii', member.id,
        );
        invocations.push({
            key: piiKey,
            routePattern: 'identities/:id/pii',
            idParams: [member.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: humanMemberPiiSeedBody(member),
            operation: piiKey,
        });
    });
    // The unaffiliated identity
    // (buildUnaffiliatedIdentity): identity + PII
    // documents only — NO membership and NO
    // default-organization invocation; the empty
    // membership ledger IS the point (TEST-PLAN
    // B25–B29). Its credential is hashed first, in
    // hashSeedCredentials, before pass 1, like every
    // human's.
    // Its invitation is granted through the live
    // postOrganizationInvitationGrant in pass 2
    // (mock-data.ts) — the invitations side channel has
    // no WRITE_RESPONSE_SPECS entry, so it cannot ride
    // formSeedMessagePair.
    const unaffiliated = buildUnaffiliatedIdentity();
    const unaffiliatedIdentityKey = seedMessagePairKey(
        'identities/:id', unaffiliated.id,
    );
    invocations.push({
        key: unaffiliatedIdentityKey,
        routePattern: 'identities/:id',
        idParams: [unaffiliated.id],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: identityPersonSeedBody(unaffiliated),
        operation: unaffiliatedIdentityKey,
    });
    const unaffiliatedPiiKey = seedMessagePairKey(
        'identities/:id/pii', unaffiliated.id,
    );
    invocations.push({
        key: unaffiliatedPiiKey,
        routePattern: 'identities/:id/pii',
        idParams: [unaffiliated.id],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: humanMemberPiiSeedBody(unaffiliated),
        operation: unaffiliatedPiiKey,
    });
    // The system identity's OWN identities/:id document
    // message pair — the last raw identities.put site the
    // mock-data seed still held for the system actor (the
    // human-member loop above forms this SAME pair per human
    // member already; the ai-members loop below forms its
    // OWN, per member).
    const systemIdentityKey = seedMessagePairKey(
        'identities/:id', SYSTEM_MEMBER_ID,
    );
    invocations.push({
        key: systemIdentityKey,
        routePattern: 'identities/:id',
        idParams: [SYSTEM_MEMBER_ID],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: identityDocumentBodyOf('service'),
        operation: systemIdentityKey,
    });
    // Role grants retired: membership `type` seeds the
    // privilege (admin for current, member otherwise) and mint
    // bakes claim roles from those memberships.
    const ideaIndexById = new Map(
        ideas.map((idea, i) => [idea.id, i]),
    );
    ideas.forEach((idea, i) => {
        const genesis = ideaGenesisById.get(idea.id)!;
        const key = seedMessagePairKey('ideas', idea.id);
        invocations.push({
            key,
            routePattern: 'organizations/:id/ideas/:id',
            idParams: [assignOrganization(i), idea.id],
            organization: assignOrganization(i),
            requesterIdentityId: genesis.memberId,
            body: ideaSeedBody(idea, genesis.state, i),
            operation: key,
        });
    });
    // Phase 12 Task 3 / Phase Final Task 2: the two seeded
    // organizations form their OWN organizations/:id document
    // message pairs (ROW half stripped — message-plane only).
    const starkOrganizationKey = seedMessagePairKey(
        'organizations/:id', STARK_ORGANIZATION,
    );
    invocations.push({
        key: starkOrganizationKey,
        routePattern: 'organizations/:id',
        idParams: [STARK_ORGANIZATION],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: seededOrganizationBody(STARK_ORGANIZATION),
        operation: starkOrganizationKey,
    });
    const org2OrganizationKey = seedMessagePairKey(
        'organizations/:id', ORGANIZATION_TWO,
    );
    invocations.push({
        key: org2OrganizationKey,
        routePattern: 'organizations/:id',
        idParams: [ORGANIZATION_TWO],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: seededOrganizationBody(ORGANIZATION_TWO),
        operation: org2OrganizationKey,
    });
    for (const submission of buildIdeaSubmissions()) {
        const ideaIndex = ideaIndexById.get(submission.idea_id)!;
        const key = seedMessagePairKey(
            'idea-submissions', submission.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/ideas/:id/submissions/:sid',
            idParams: [
                assignOrganization(ideaIndex),
                submission.idea_id, submission.id,
            ],
            organization: assignOrganization(ideaIndex),
            requesterIdentityId: submission.member_id,
            body: ideaSubmissionSeedBody(submission),
            operation: key,
        });
    }
    for (const project of [...projects, projectOrg2(projects)]) {
        const genesis = projectGenesisById.get(project.id)!;
        const organization = projectOrganizationFor(project);
        const key = seedMessagePairKey('projects', project.id);
        invocations.push({
            key,
            routePattern: 'organizations/:id/projects/:id',
            idParams: [organization, project.id],
            organization,
            requesterIdentityId: genesis.memberId,
            body: projectSeedBody(
                project, genesis.state, organization,
            ),
            operation: key,
        });
    }
    for (const flow of mockFlows) {
        const event = flowStateEventByFlowId.get(flow.id)!;
        const projectFlow = mockProjectFlows.find(
            pf => pf.flow_id === flow.id,
        )!;
        const createBody = flowSeedBody(
            flow, event, projectFlow, flowRelations,
        );
        const flowOperation = seedMessagePairKey(
            'flows', flow.id,
        );
        invocations.push({
            key: flowOperation,
            routePattern: 'organizations/:id/flows/',
            idParams: [STARK_ORGANIZATION],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: createBody,
            operation: flowOperation,
        });
        // Task 5: create appends THREE pairs — the operation
        // message pair above, plus a document message pair
        // (at the flow's own document) and a join pair (at the
        // project_flows document), each keyed by its OWN
        // deterministic invocation entry, mirroring the
        // idea-submissions two-idParams precedent. The
        // document body is built through
        // flowCreateDocumentBody — the SAME construction
        // api/routes.ts's POST /flows handler uses — never a
        // second, hand-rolled copy.
        const b = validateFlowCreateBody(createBody);
        invocations.push({
            key: seedMessagePairKey('flows/:id', flow.id),
            routePattern: 'organizations/:id/flows/:id',
            idParams: [STARK_ORGANIZATION, flow.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: seedFlowDocumentBody(b, flow.graph),
            operation: flowOperation,
        });
        invocations.push({
            key: seedMessagePairKey(
                'projects/:id/flows/:pfid', projectFlow.id,
            ),
            routePattern:
                'organizations/:id/projects/:id/flows/:pfid',
            idParams: [
                STARK_ORGANIZATION,
                projectFlow.project_id, projectFlow.id,
            ],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: b.projectFlow,
            operation: flowOperation,
        });
    }
    // Task 6: the fifth seeded flow — organization
    // 'BBjWJsjYIDkTRKIIPrzWRw's
    // own —
    // has no project_flows join row, so it drives through
    // postFlowDocumentOp's genesis document PUT instead of the
    // four-above's postFlowCreationOp.
    const flowOrg2Key = seedMessagePairKey(
        'flows/:id', seedIdentifier('seed-flow-org2'),
    );
    invocations.push({
        key: flowOrg2Key,
        routePattern: 'organizations/:id/flows/:id',
        idParams: [
            ORGANIZATION_TWO,
            seedIdentifier('seed-flow-org2'),
        ],
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: flowOrg2SeedBody(),
        operation: flowOrg2Key,
    });
    // Phase 5 Task 4: the entity/join gap closed — one document
    // message pair per seeded work order (hand-authored +
    // generated) and one join pair per seeded
    // flow-work-order join, mirroring the flows family's
    // document-genesis shape. The work-order
    // HISTORICAL TRACES (states events + state_field_values) stay
    // a direct WRITE — Path A, the fingerprint-critical invariant
    // (op-replay would rearrange the pinned states fingerprint) —
    // but the carve-out that once left them PAIR-less is CLOSED
    // below (Phase 11 Task 3): each trace event and field value
    // now forms its OWN message pair beside the untouched row.
    for (
        const wo of [
            ...workOrders, ...leadToCloseWorkload.workOrders,
        ]
    ) {
        const key = seedMessagePairKey('work-orders/:id', wo.id);
        invocations.push({
            key,
            routePattern:
                'organizations/:id/work-orders/:id',
            idParams: [STARK_ORGANIZATION, wo.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId:
                workOrderFirstEventMemberId.get(wo.id)!,
            body: workOrderDocumentSeedBody(wo),
            operation: key,
        });
    }
    for (
        const join of [
            ...flowWorkOrderJoins,
            ...leadToCloseWorkload.flowWorkOrders,
        ]
    ) {
        const key = seedMessagePairKey(
            'flows/:id/work-orders/:woid', join.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/flows/:id/work-orders/:woid',
            idParams: [
                STARK_ORGANIZATION, join.flow_id, join.id,
            ],
            organization: STARK_ORGANIZATION,
            // The SAME member as the join's own work order's
            // document message pair — the requesting identity
            // is who brought the work order into being, not a
            // second, independently-picked author.
            requesterIdentityId: workOrderFirstEventMemberId.get(
                join.work_order_id,
            )!,
            body: flowWorkOrderJoinSeedBody(join),
            operation: key,
        });
    }
    // States-document retirement: every trace event (212 hand-
    // authored + 649 generated = 861) reshapes 1:1 into a
    // work-orders/:id/transition op-shaped pair — the LIVE op
    // shape, nothing invented: transitionEventId = the event's
    // own id, transitionAt = its at, targetState = its node
    // state, requester = the event's OWN member. NOT creation
    // ops: the creation gate's exact-3 'claimed'-slot
    // semantics do not match historical traces (zero seeded
    // claim events; the in-flight fixtures are 2- and
    // 3-event). WO01's two value-bearing events leave this
    // loop: formInstanceChainSeedInput carries them to the
    // rehearsal's organization-scoped transition op, so they
    // are not double-appended.
    const traceEvents = [
        ...workOrderStateEvents,
        ...leadToCloseWorkload.stateEvents,
    ];
    for (const event of traceEvents) {
        if (
            VALUE_BEARING_TRANSITION_EVENT_IDS.has(
                event.id,
            )
        ) {
            continue;
        }
        const key = seedMessagePairKey(
            'work-orders/:id/transition', event.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/work-orders/:id/transition',
            idParams: [STARK_ORGANIZATION, event.entity_id],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: transitionSeedBody(event),
            operation: key,
        });
    }
    for (const m of aiMembers) {
        const { id: _id, ...fields } = m;
        const key = seedMessagePairKey('ai-agents/:id', m.id);
        invocations.push({
            key,
            routePattern: 'ai-agents/:id',
            idParams: [m.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: fields,
            operation: key,
        });
    }
    mockRecords.forEach((r, i) => {
        const genesis = recordGenesisById.get(r.id)!;
        const attributes = mockRecordAttributes.filter(
            a => a.record_id === r.id,
        );
        const organization = assignOrganization(i);
        const createBody = recordSeedBody(
            r, i, genesis.state, attributes,
        );
        // Task 23: record document/op invocations ride the
        // nested record-types patterns (same storage documents
        // as the retired flat alias window; counts unchanged).
        const recordOperation = seedMessagePairKey(
            RECORD_TYPES_COLLECTION_PATTERN, r.id,
        );
        invocations.push({
            key: recordOperation,
            routePattern: RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organization],
            op: true,
            organization,
            requesterIdentityId: genesis.memberId,
            body: createBody,
            operation: recordOperation,
        });
        // Phase 6 Task 4: create appends the document message
        // pair (at the type's own nested document) and one
        // attribute-PUT pair per seeded attribute, each keyed
        // by its OWN deterministic invocation entry — the
        // flows document + join precedent above, generalized
        // from fixed cardinality to 1+1+N. Bodies via the
        // shared BODY builders (api/routes.ts) — never a
        // second, hand-rolled copy. Every seeded attribute
        // is genesis, so no
        // attribute-DELETE invocation exists here (the seed
        // never removes an attribute it just created).
        const b = validateRecordWriteBody(createBody);
        invocations.push({
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN, r.id,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organization, r.id],
            organization,
            requesterIdentityId: genesis.memberId,
            body: recordDocumentBodyOf(b),
            operation: recordOperation,
        });
        for (const a of attributes) {
            // Task 8: attributes store under their type
            // prefix; bodies drop record_id and stamp ACL.
            invocations.push({
                key: seedMessagePairKey(
                    ATTRIBUTE_DETAIL_PATTERN, a.id,
                ),
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
                idParams: [organization, r.id, a.id],
                organization,
                requesterIdentityId: genesis.memberId,
                body: recordAttributeDocumentBodyOf(
                    a as unknown as Record<string, unknown>,
                ),
                operation: recordOperation,
            });
        }
    });
    // Phase 6 Task 5: the flow_records seed gap closed — one
    // join pair per seeded flow-record binding, mirroring the
    // flow-work-order joins' shape above. The requesting
    // identity is the bound RECORD's own genesis memberId —
    // the same identity that seeded the record itself (verified
    // by content: every recordGenesis row above is authored
    // by SYSTEM_MEMBER_ID), not a second, independently-picked
    // author.
    for (const join of mockFlowRecords) {
        const key = seedMessagePairKey(
            'flows/:id/records/:frid', join.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/flows/:id/records/:frid',
            idParams: [
                flowRecordOrganizationFor(join),
                join.flow_id, join.id,
            ],
            organization: flowRecordOrganizationFor(join),
            requesterIdentityId: recordGenesisById
                .get(join.record_id)!.memberId,
            body: flowRecordJoinSeedBody(join),
            operation: key,
        });
    }
    for (const seed of OBJECTIVE_SEEDS) {
        const memberId = pickHumanMember(
            pools, STARK_ORGANIZATION,
            `${seed.id}:revision`,
        );
        const createBody = objectiveSeedBody(
            seed, STARK_ORGANIZATION, memberId,
        );
        const objectiveOperation = seedMessagePairKey(
            'objectives', seed.id,
        );
        invocations.push({
            key: objectiveOperation,
            routePattern: 'organizations/:id/objectives/',
            idParams: [STARK_ORGANIZATION],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: createBody,
            operation: objectiveOperation,
        });
        // Task 3: create appends the document message pair
        // (at the objective's own document) and the revision
        // pair (at its first revision's own document), each
        // keyed by its OWN deterministic invocation entry —
        // the flows document + join precedent, objectives'
        // own fixed 1+1+1. Bodies via the shared BODY builders
        // (api/routes.ts) — never a second, hand-rolled copy.
        // The SAME member authors all three invocations (the
        // revision author).
        const b = validateObjectiveCreateBody(createBody);
        invocations.push({
            key: seedMessagePairKey('objectives/:id', seed.id),
            routePattern: 'organizations/:id/objectives/:id',
            idParams: [STARK_ORGANIZATION, seed.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: objectiveDocumentBodyOf(b),
            operation: objectiveOperation,
        });
        invocations.push({
            key: seedMessagePairKey(
                'objectives/:id/revisions/:rid', b.revisionId,
            ),
            routePattern:
                'organizations/:id/objectives/:id'
                + '/revisions/:rid',
            idParams: [
                STARK_ORGANIZATION, seed.id, b.revisionId,
            ],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: objectiveRevisionBodyOf(b),
            operation: objectiveOperation,
        });
    }
    const org2CreateBody = objectiveSeedBody(
        ORGANIZATION_TWO_OBJECTIVE,
        ORGANIZATION_TWO, SYSTEM_MEMBER_ID,
    );
    const org2ObjectiveOperation = seedMessagePairKey(
        'objectives', ORGANIZATION_TWO_OBJECTIVE.id,
    );
    invocations.push({
        key: org2ObjectiveOperation,
        routePattern: 'organizations/:id/objectives/',
        idParams: [ORGANIZATION_TWO],
        op: true,
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: org2CreateBody,
        operation: org2ObjectiveOperation,
    });
    const org2 = validateObjectiveCreateBody(org2CreateBody);
    invocations.push({
        key: seedMessagePairKey(
            'objectives/:id', ORGANIZATION_TWO_OBJECTIVE.id,
        ),
        routePattern: 'organizations/:id/objectives/:id',
        idParams: [
            ORGANIZATION_TWO,
            ORGANIZATION_TWO_OBJECTIVE.id,
        ],
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: objectiveDocumentBodyOf(org2),
        operation: org2ObjectiveOperation,
    });
    invocations.push({
        key: seedMessagePairKey(
            'objectives/:id/revisions/:rid', org2.revisionId,
        ),
        routePattern:
            'organizations/:id/objectives/:id'
            + '/revisions/:rid',
        idParams: [
            ORGANIZATION_TWO,
            ORGANIZATION_TWO_OBJECTIVE.id, org2.revisionId,
        ],
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: objectiveRevisionBodyOf(org2),
        operation: org2ObjectiveOperation,
    });
    // Phase 7 Task 5: the scores half of the seed deferral closes
    // LAST, landing WHOLE — baselines AND actuals, one document
    // message pair per seeded row, from the SAME
    // buildSeedScoreRows output mock-data.ts's pass-2 write
    // drives through postBaselineScoreDocumentOp /
    // postActualScoreDocumentOp.
    // `pools` is the SAME pre-tx pool the objectives loop above
    // draws from — every scored project is STARK by construction
    // (the lone org-2 project is seeded 'submitted', so it never
    // reaches the scoring loop), but the organization is still
    // looked up per row's own project rather than hardcoded, so
    // a future org-2 score would surface at the correct document.
    const scoreProjects = buildScoreSeedProjects();
    const scoreProjectOrganizationById = new Map(
        scoreProjects.map(p => [p.id, p.organization_id]),
    );
    const scoreRows = buildSeedScoreRows(scoreProjects, pools);
    for (const row of scoreRows.baselines) {
        const key = seedMessagePairKey(
            'projects/:id/objective-baseline-scores/:sid',
            row.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/projects/:id'
                + '/objective-baseline-scores/:sid',
            idParams: [
                scoreProjectOrganizationById.get(
                    row.fields.project_id,
                )!,
                row.fields.project_id, row.id,
            ],
            organization: scoreProjectOrganizationById.get(
                row.fields.project_id,
            )!,
            requesterIdentityId: row.fields.member_id,
            body: row.fields,
            operation: key,
        });
    }
    for (const row of scoreRows.actuals) {
        const key = seedMessagePairKey(
            'projects/:id/objective-actual-scores/:sid',
            row.id,
        );
        invocations.push({
            key,
            routePattern:
                'organizations/:id/projects/:id'
                + '/objective-actual-scores/:sid',
            idParams: [
                scoreProjectOrganizationById.get(
                    row.fields.project_id,
                )!,
                row.fields.project_id, row.id,
            ],
            organization: scoreProjectOrganizationById.get(
                row.fields.project_id,
            )!,
            requesterIdentityId: row.fields.member_id,
            body: row.fields,
            operation: key,
        });
    }
    return invocations;
}

// Bare collection-POST creates (no `:id` segment) keep the
// bare pattern — pathAndNameOf derives the empty name and
// createdEntityName (message-pair.ts's CREATE_BODY_ID_FIELDS)
// overrides it to the created entity's own id. Document-class
// genesis PUTs (ideas/:id, ideas/:id/submissions/:sid, …)
// carry idParams and the id-tailed document is built directly
// — pathAndNameOf derives the real name from the path
// segment itself. Operation-shaped POSTs at id-carrying
// patterns (work-orders/:id/transition, op: true) also carry
// idParams for the path, but form as POST with {status:
// 204} — name stays '' because pathAndNameOf keys on the
// LAST segment.
// The seed's request id is its operation's id. Pass 1 mints
// no request id, and the landing drops the line (Decision
// 3).
export async function formSeedMessagePair(
    inv: MockDataInvocation, requestAt: string,
    operationId: string,
): Promise<MessagePair> {
    const idParams = inv.idParams;
    const routeSegments = inv.routePattern.split('/');
    let paramIndex = 0;
    const pathSegments = idParams === undefined
        ? routeSegments
        : routeSegments.map((segment) =>
            segment.startsWith(':')
                ? idParams[paramIndex++]!
                : segment);
    const method = inv.op === true || idParams === undefined
        ? 'POST'
        : 'PUT';
    // Every bare collection-POST family here is a create route,
    // all {status: 204} in WRITE_RESPONSE_SPECS (routes.ts) — no
    // successBody. An op-shaped POST at an id-carrying pattern
    // (op: true) is the same 204/no-body voice. A document-class
    // genesis PUT reads its OWN spec from the same table
    // (documentSeedResponse) so a seeded pair's stored response
    // can never drift from what the live gate would have stored
    // for the identical request.
    const response =
        inv.op === true || idParams === undefined
            ? { status: HTTP_NO_CONTENT, body: undefined }
            : documentSeedResponse(
                inv, routeSegments, pathSegments,
            );
    return formWriteMessagePair({
        method,
        pathname: '/' + pathSegments.join('/'),
        routePattern: inv.routePattern,
        routeSegments,
        pathSegments,
        // The seed carries no real HTTP request — no bearer to
        // redact, no content-type to hoist. Honest about the
        // below-gate carve-out rather than synthesizing a fake
        // bearer (AGENTS.md's named carve-out).
        headerFields: [
            {
                name: OPERATION_ID_HEADER,
                value: operationId,
            },
        ],
        body: inv.body,
        requesterIdentityId: inv.requesterIdentityId,
        requestAt,
        organization: inv.organization,
        responseBody: response.body,
        operationId,
        requestId: operationId,
        // Fresh database: every seed pair is genesis.
    });
}

// The response side of a document-class genesis seed write: the
// SAME per-pattern spec the live gate reads (WRITE_RESPONSE_
// SPECS, api/routes.ts) — one voice, so a seed pair's stored
// response can never drift from what the gate would have stored
// for the identical request. `params` mirrors matchRoute's own
// extraction (routes.ts): the path segment at each `:`-prefixed
// route segment, in order. Every document-class invocation here
// forms a PUT (formSeedMessagePair's own method === 'PUT' when idParams
// is defined and op is not set), so a PerVerbWriteResponseSpec
// entry (Task 4: ai-members/:id, human-members/:id) resolves
// through its OWN `put` slot — the writeResponseSpecFor
// precedent (api/api.ts), narrowed to the one verb this
// function ever sees.
function documentSeedResponse(
    inv: MockDataInvocation,
    routeSegments: readonly string[],
    pathSegments: readonly string[],
): { readonly status: number; readonly body: unknown } {
    const entry = WRITE_RESPONSE_SPECS[inv.routePattern];
    const spec = entry === undefined || 'status' in entry
        ? entry
        : entry.put;
    if (spec === undefined) {
        throw new Error(
            'no per-write response spec for seeded document'
            + ' route: ' + inv.routePattern,
        );
    }
    const params = routeSegments
        .map((segment, i) =>
            segment.startsWith(':') ? pathSegments[i] : undefined)
        .filter((value): value is string => value !== undefined);
    return {
        status: spec.status,
        body: spec.successBody?.(
            params, inv.body, inv.requesterIdentityId,
            inv.organization,
        ),
    };
}

// The default-organization side channel's own pair former:
// mirrors identityDefaultOrganizationRequest's formWriteMessagePair
// (api/organization-requests.ts) — a singleton document at
// /identities/:id/default-organization/ (name '').
export async function formDefaultOrganizationSeedMessagePair(
    identityId: Id,
    organizationId: Id,
    requestAt: string,
    operationId: string,
): Promise<MessagePair> {
    const pathSegments = [
        'identities', identityId, 'default-organization',
    ];
    return formWriteMessagePair({
        method: 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: 'identities/:id/default-organization',
        routeSegments: [
            'identities', ':id', 'default-organization',
        ],
        pathSegments,
        headerFields: [
            {
                name: OPERATION_ID_HEADER,
                value: operationId,
            },
        ],
        body: defaultOrganizationSeedBody(organizationId),
        requesterIdentityId: identityId,
        requestAt,
        organization: undefined,
        responseBody: undefined,
        operationId,
        requestId: operationId,
    });
}

// The seeded pending invitation as the organization-scoped
// grant route receives it: the Stark admin invites the
// unaffiliated identity by email (Decision 8).
export interface InvitationGrantSeedInput {
    readonly organization: Id;
    readonly granterId: Id;
    readonly body: Record<string, unknown>;
    readonly requestAt: string;
    readonly operationId: string;
    readonly received: ReceivedRequest;
}

export function formInvitationGrantSeedInput(
    requestAt: string,
): InvitationGrantSeedInput {
    const operationId = generateIdentifier();
    const target = '/organizations/' + STARK_ORGANIZATION
        + '/invitations/';
    const body = {
        email: buildUnaffiliatedIdentity().email,
        invitationId: UNAFFILIATED_INVITATION_ID,
        grantEventId: UNAFFILIATED_INVITATION_GRANT_EVENT_ID,
        grantAt: MOCK_SEED_TIMESTAMP,
    };
    const model = buildRequestModel({
        method: 'POST',
        target,
        fields: [{
            name: OPERATION_ID_HEADER,
            value: operationId,
        }],
        body,
    });
    if (model.body === undefined) {
        throw new Error('seed invitation formed no body');
    }
    return {
        organization: STARK_ORGANIZATION,
        granterId: 'XXZruirZyAOoRpNxaDnpSA',
        body,
        requestAt,
        operationId,
        received: {
            target,
            headerFields: model.fields,
            bodyBytes: model.body.asBytes(),
            requestId: operationId,
        },
    };
}

// A value-bearing transition: its event and the id pass 1
// minted. Its POST is formed in the rehearsal, once the
// head it latches has landed (Decision 8).
export interface InstanceTransitionSeedInput {
    readonly event: StateEntity;
    readonly operationId: string;
}

export interface InstanceChainSeedInput {
    readonly create: MessagePair;
    readonly binding: MessagePair;
    readonly review: InstanceTransitionSeedInput;
    readonly complete: InstanceTransitionSeedInput;
}

const INSTANCE_PATH_SEGMENTS = [
    'organizations', STARK_ORGANIZATION,
    'record-types', SEED_RECORD_TYPE_ID,
    'instances', SEED_INSTANCE_ID,
];
const TRANSITION_ROUTE =
    'organizations/:id/work-orders/:id/transition';

// The WO01 chain as the app writes it: a PATCH create,
// the binding PUT, then two value-bearing transitions.
export async function formInstanceChainSeedInput(
    requestAt: string,
): Promise<InstanceChainSeedInput> {
    const events = buildWorkOrderStateEvents();
    const eventOf = (id: string): StateEntity => {
        const event = events.find((e) => e.id === id);
        if (event === undefined) {
            throw new Error('no seeded event ' + id);
        }
        return event;
    };
    const createBody = { set: [] };
    const entry = WRITE_RESPONSE_SPECS[INSTANCE_DETAIL_PATTERN];
    if (entry === undefined || 'status' in entry
        || entry.patch === undefined) {
        throw new Error('no PATCH spec for the seed instance');
    }
    const createOperationId = generateIdentifier();
    const create = await formWriteMessagePair({
        method: 'PATCH',
        pathname: '/' + INSTANCE_PATH_SEGMENTS.join('/'),
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: INSTANCE_DETAIL_PATTERN.split('/'),
        pathSegments: INSTANCE_PATH_SEGMENTS,
        headerFields: [],
        body: createBody,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: STARK_ORGANIZATION,
        responseBody: entry.patch.successBody?.(
            [
                STARK_ORGANIZATION, SEED_RECORD_TYPE_ID,
                SEED_INSTANCE_ID,
            ],
            createBody,
            SYSTEM_MEMBER_ID,
            STARK_ORGANIZATION,
        ),
        operationId: createOperationId,
        requestId: createOperationId,
    });
    const bindingOperationId = generateIdentifier();
    const bindingSegments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', WO01_ID, 'binding',
    ];
    const binding = await formWriteMessagePair({
        method: 'PUT',
        pathname: '/' + bindingSegments.join('/'),
        routePattern:
            'organizations/:id/work-orders/:id/binding',
        routeSegments: [
            'organizations', ':id',
            'work-orders', ':id', 'binding',
        ],
        pathSegments: bindingSegments,
        headerFields: [],
        body: {
            instance_id: SEED_INSTANCE_ID,
            record_type_id: SEED_RECORD_TYPE_ID,
        },
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt,
        organization: STARK_ORGANIZATION,
        responseBody: undefined,
        operationId: bindingOperationId,
        requestId: bindingOperationId,
    });
    return {
        create,
        binding,
        review: {
            event: eventOf(WO01_REVIEW_EVENT_ID),
            operationId: generateIdentifier(),
        },
        complete: {
            event: eventOf(WO01_COMPLETE_EVENT_ID),
            operationId: generateIdentifier(),
        },
    };
}

// The transition's POST, formed after the head it latches
// lands: a client reads the etag, then sends If-Match.
export async function formInstanceTransitionSeedPair(
    input: InstanceTransitionSeedInput,
    headMessagePairId: string,
    requestAt: string,
): Promise<MessagePair> {
    const segments = [
        'organizations', STARK_ORGANIZATION,
        'work-orders', WO01_ID, 'transition',
    ];
    return formWriteMessagePair({
        method: 'POST',
        pathname: '/' + segments.join('/'),
        routePattern: TRANSITION_ROUTE,
        routeSegments: TRANSITION_ROUTE.split('/'),
        pathSegments: segments,
        headerFields: [{
            name: IF_MATCH_HEADER,
            value: strongEtagOf(headMessagePairId),
        }],
        body: transitionSeedBody(input.event),
        requesterIdentityId: input.event.member_id,
        requestAt,
        organization: STARK_ORGANIZATION,
        responseBody: undefined,
        operationId: input.operationId,
        requestId: input.operationId,
    });
}

// Pass 1 for postMockDataLoad: every op-invocation's pair,
// formed before the rehearsal's writes. `requestAt` is
// minted once by the caller (the seed's arrival moment) and
// shared by every pair this seed forms. The instance chain
// forms apart, in formInstanceChainSeedInput, with the same
// requestAt.
export async function formMockDataMessagePairs(
    requestAt: string,
): Promise<ReadonlyMap<string, MessagePair>> {
    const messagePairs = new Map<string, MessagePair>();
    const operationIds = new Map<string, string>();
    for (const inv of buildMockDataInvocations()) {
        let operationId = operationIds.get(inv.operation);
        if (operationId === undefined) {
            operationId = generateIdentifier();
            operationIds.set(inv.operation, operationId);
        }
        messagePairs.set(
            inv.key,
            await formSeedMessagePair(
                inv, requestAt, operationId,
            ),
        );
    }
    // One default-organization document per seeded human.
    for (const [index, member] of buildMembers().entries()) {
        messagePairs.set(
            seedMessagePairKey(
                'identities/:id/default-organization',
                member.id,
            ),
            await formDefaultOrganizationSeedMessagePair(
                member.id,
                memberPrimaryOrganization(member.id, index),
                requestAt,
                generateIdentifier(),
            ),
        );
    }
    return messagePairs;
}

// Pass 1 for the credential documents, called by BOTH seed
// paths (rehearseMockData / rehearseBootstrap, mock-data.ts):
// the 13 (mock-data) / 2 (bootstrap) identity-credential
// document message pairs, formed from their OWN post-hash
// bodies. The secrets are hashed first, in
// hashSeedCredentials, before pass 1; these pairs form
// here, beside formMockDataMessagePairs /
// formBootstrapMessagePair, not inside either.
// `requestAt` is the seed's shared arrival moment, minted
// once by the caller — the SAME
// pattern every other pass 1 shares. Calls the SAME formSeedMessagePair
// every other family here does — untouched — so a seeded
// credential pair can never drift from the shape the live PUT
// identities/:id/credentials/:cid would have formed for an
// identical request.
export async function formSeedCredentialMessagePairs(
    planned: readonly {
        readonly id: Id;
        readonly identityId: Id;
        readonly secret: string;
    }[],
    systemCredential: {
        readonly id: Id;
        readonly secret: string;
    },
    requestAt: string,
): Promise<ReadonlyMap<string, MessagePair>> {
    const messagePairs = new Map<string, MessagePair>();
    for (const cred of planned) {
        const key = seedMessagePairKey(
            'identities/:id/credentials/:cid', cred.id,
        );
        messagePairs.set(key, await formSeedMessagePair(
            {
                key,
                routePattern: 'identities/:id/credentials/:cid',
                idParams: [cred.identityId, cred.id],
                organization: undefined,
                requesterIdentityId: SYSTEM_MEMBER_ID,
                body: identityCredentialSeedBody(
                    cred.identityId, 'password', cred.secret,
                ),
                operation: key,
            },
            requestAt,
            generateIdentifier(),
        ));
    }
    const systemKey = seedMessagePairKey(
        'identities/:id/credentials/:cid', systemCredential.id,
    );
    messagePairs.set(systemKey, await formSeedMessagePair(
        {
            key: systemKey,
            routePattern: 'identities/:id/credentials/:cid',
            idParams: [SYSTEM_MEMBER_ID, systemCredential.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: identityCredentialSeedBody(
                SYSTEM_MEMBER_ID, 'client_secret',
                systemCredential.secret,
            ),
            operation: systemKey,
        },
        requestAt,
        generateIdentifier(),
    ));
    return messagePairs;
}

// Pass 1 for postBootstrap: the lone 'XXZruirZyAOoRpNxaDnpSA' human-member
// create. Its body embeds nowUtc() (bootstrap has no fixed
// seed timestamp), so it is minted ONCE here and returned
// alongside the bundle it was hashed from — postBootstrapIn
// (pass 2) writes this SAME body, never a second nowUtc() call,
// so no stored pair ever drifts from what was actually written.
// Task 5: ALSO forms bootstrap's own membership pair (its lone
// 'XXZruirZyAOoRpNxaDnpSA' membership). Phase 10 Task 2: ALSO
// forms the current member's PII document message pair
// (identities/:id/pii), the SAME facet-split every other
// seeded human now carries. Phase 10 Task 5: the
// human-member bundle grows from 1+1+1 to 1+1+1+1 — the
// current member's own identities/:id document message pair,
// the SAME fourth invocation the mock-data seed's own
// human-members loop now forms per member. Phase 10 Task 6:
// ALSO forms the system member's OWN identities/:id
// document message pair. The credential pairs stay OUTSIDE
// this function — formSeedCredentialMessagePairs forms
// them, for both seed paths, from the hashes
// hashSeedCredentials computed first.
export async function formBootstrapMessagePair(
    requestAt: string,
): Promise<{
    readonly identityMessagePair: MessagePair;
    readonly seatMessagePair: MessagePair;
    readonly piiMessagePair: MessagePair;
    readonly systemIdentityMessagePair: MessagePair;
    readonly defaultOrganizationMessagePair: MessagePair;
    readonly organizationMessagePair: MessagePair;
}> {
    const identityKey = seedMessagePairKey(
        'identities/:id',
        'XXZruirZyAOoRpNxaDnpSA',
    );
    const identityMessagePair = await formSeedMessagePair(
        {
            key: identityKey,
            routePattern: 'identities/:id',
            idParams: ['XXZruirZyAOoRpNxaDnpSA'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
            operation: identityKey,
        },
        requestAt,
        generateIdentifier(),
    );
    const seatKey = seedMessagePairKey(
        ORGANIZATION_MEMBER_DETAIL_PATTERN,
        'current-0',
    );
    const seatMessagePair = await formSeedMessagePair(
        {
            key: seatKey,
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [STARK_ORGANIZATION, 'XXZruirZyAOoRpNxaDnpSA'],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
            operation: seatKey,
        },
        requestAt,
        generateIdentifier(),
    );
    const piiKey = seedMessagePairKey(
        'identities/:id/pii',
        'XXZruirZyAOoRpNxaDnpSA',
    );
    const piiMessagePair = await formSeedMessagePair(
        {
            key: piiKey,
            routePattern: 'identities/:id/pii',
            idParams: ['XXZruirZyAOoRpNxaDnpSA'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentMemberPiiBody(),
            operation: piiKey,
        },
        requestAt,
        generateIdentifier(),
    );
    const systemIdentityKey = seedMessagePairKey(
        'identities/:id', SYSTEM_MEMBER_ID,
    );
    const systemIdentityMessagePair = await formSeedMessagePair(
        {
            key: systemIdentityKey,
            routePattern: 'identities/:id',
            idParams: [SYSTEM_MEMBER_ID],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: identityDocumentBodyOf('service'),
            operation: systemIdentityKey,
        },
        requestAt,
        generateIdentifier(),
    );
    const defaultOrganizationMessagePair =
        await formDefaultOrganizationSeedMessagePair(
            'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION, requestAt,
            generateIdentifier(),
        );
    const organizationKey = seedMessagePairKey(
        'organizations/:id', STARK_ORGANIZATION,
    );
    const organizationMessagePair = await formSeedMessagePair(
        {
            key: organizationKey,
            routePattern: 'organizations/:id',
            idParams: [STARK_ORGANIZATION],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seededOrganizationBody(STARK_ORGANIZATION),
            operation: organizationKey,
        },
        requestAt,
        generateIdentifier(),
    );
    return {
        identityMessagePair,
        seatMessagePair,
        piiMessagePair,
        systemIdentityMessagePair,
        defaultOrganizationMessagePair,
        organizationMessagePair,
    };
}
