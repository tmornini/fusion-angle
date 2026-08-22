// Pre-tx pair formation for both seed paths (postMockDataLoad,
// postBootstrap in ../mock-data.ts). formWritePair's hashing is
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
// own phrasing) — one document pair per seeded row, closed
// through postBaselineScoreDocumentOp / postActualScoreDocumentOp.
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
// pair, closed through postMembershipDocumentOp. Leftover
// members/:id parent documents are gone from the seed.
// Bootstrap's membership forms this SAME pair via
// formBootstrapMessagePair. NO whole-slice seed
// deferral remains; the work-order historical traces stay the
// one NAMED direct-write carve-out above. The human-member
// create-time bundle widens once more, human-only (Phase 10 Task
// 5): a fourth invocation forms the identities/:id document pair
// — a human member's own identity row, which an AI member never
// has (finding 10), so the ai-members loop below stays a triple.
// Bootstrap's lone 'XXZruirZyAOoRpNxaDnpSA' human-member create forms this
// SAME
// quadruple via formBootstrapMessagePair. Phase 10 Task 6 closes
// the identity spine's remaining raw writes: each seeded AI
// member and the system member ALSO form their OWN identities/:id
// document pair (a standalone invocation — neither create-time
// bundle above ever carried one, so this widens no triple/
// quadruple), and each seeded role grant forms its OWN
// role-grants/:id document pair. Every invocation here (as
// always) forms through the SAME formSeedPair pipeline, UNTOUCHED
// — formSeedPair is genesis by construction. The
// 12 identity-credential document pairs (11 human passwords + the
// system client secret) are the ONE exception: a credential's
// hashed secret is unknown until PBKDF2 resolves inside
// seedHumanCredentials (api/mock-data.ts), which runs AFTER this
// file's shared pre-tx pass already completed — so those 12 pairs
// are formed by seedHumanCredentials' OWN local pass-1/pass-2
// split, calling formSeedPair directly (formSeedCredentialPairs,
// below) rather than riding buildMockDataInvocations /
// formBootstrapMessagePair.
//
// Phase 11 Task 3 closed the historical-trace carve-out
// itself (the work-order deferral's last piece, named above):
// every trace event formed its own message pair through the
// SAME formSeedPair pipeline every family above already rides.
// States-address retirement Task 12 reshapes those 861 traces
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
// organizations/:id document pair, the SAME per-family
// onboarding playbook every prior family already rode. Phase
// Final Task 2 strips the organizations ROW half — pairs alone
// remain. Bootstrap's own lone STARK_ORGANIZATION pair mirrors
// this via formBootstrapMessagePair below.

import type {
    Id,
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
} from '../types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    SYSTEM_MEMBER_ID,
    storedGraph,
} from '../types.ts';
import {
    formWritePair,
    OPERATION_ID_HEADER,
} from '../message-pair.ts';
import type { MessagePair } from '../message-pair.ts';
import {
    generateIdentifier,
} from '../../shared/identifier.ts';
import {
    HTTP_NO_CONTENT,
    HTTP_OK,
} from '../http-errors.ts';
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
    asStoredGraph,
    validateFlowCreateBody,
    validateRecordWriteBody,
    validateObjectiveCreateBody,
} from '../validators.ts';
import {
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
} from '../family-registry.ts';
import {
    mergeInstanceValues,
} from '../derive-record-instances.ts';
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
import { buildMembers } from './members.ts';
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

// One state event per seeded idea — the creation moment of
// each idea on the states log, doubling as postIdeaDocumentOp's
// genesis-state input.
export const ideaStateEvents: StateEntity[] = [
    {
        id: 'qsmyPbkaUgaWdrMXqSjoKw',
        entity_id: 'YvOylAxOjQcgmNmsSoVBPQ',
        state: 'in_review',
        member_id: 'MQFcPtrZPIGjMCRAXtZUnA',
        at: daysFromNow(-75, 9, 30),
    },
    {
        id: 'uumGafmpNksyqbIylOBVHA',
        entity_id: 'WurwPqXxGtLhRAoCEcPzfQ',
        state: 'approved',
        member_id: 'VvzFEpfYONDAsCCwNlIFCQ',
        at: daysFromNow(-70, 9, 0),
    },
    {
        id: 'nMUREhBfGuUoGoBYGdomHw',
        entity_id: 'yrDiezFyhDHGgXzGeIWoSQ',
        state: 'active',
        member_id: 'CJrglMsNBxOWWfbihHQSeg',
        at: daysFromNow(-65, 9, 0),
    },
    {
        id: 'FGHwVyemAMHQwocmsPhoQA',
        entity_id: 'pYmalQFqpoXdbpYAJfOswA',
        state: 'in_review',
        member_id: 'jrMOZzVdWXvLgMpcHoyBTw',
        at: daysFromNow(-55, 9, 0),
    },
    {
        id: 'EyIVnDozimafEKMIoWBGmw',
        entity_id: 'RAHAvUqwVABJnzTniWhUTQ',
        state: 'active',
        member_id: 'RPzLGrWcstxLaHoBcViPLQ',
        at: daysFromNow(-50, 9, 0),
    },
    {
        id: 'SybZHKZVpQTaNphnAoeEDw',
        entity_id: 'IjrYiSuRyjkQaqiRLhadAg',
        state: 'sent_back',
        member_id: 'zyGBRshxOnKHUfcyFRqowg',
        at: daysFromNow(-45, 9, 0),
    },
    {
        id: 'dYrdYYDGrEAmVRZqHzcusw',
        entity_id: 'MmMKBsQBLxNfbMAOlAaKkQ',
        state: 'in_review',
        member_id: 'MQFcPtrZPIGjMCRAXtZUnA',
        at: daysFromNow(-75, 10, 0),
    },
    {
        id: 'JoKIkijcCGJaSVAiVcyabA',
        entity_id: 'QtpzfPiJsMdmoDpPaHvtVQ',
        state: 'in_review',
        member_id: 'SsVAZghfSzMZRZmxNKIizw',
        at: daysFromNow(-35, 9, 0),
    },
    {
        id: 'CCxJyXOAOnFKfaatOVIBJA',
        entity_id: 'eizcntIrQMWrajcGkQZvUA',
        state: 'in_review',
        member_id: 'CJrglMsNBxOWWfbihHQSeg',
        at: daysFromNow(-30, 9, 0),
    },
    {
        id: 'xtwxaKPVjEpchKhgkbWVzw',
        entity_id: 'AzSBhumyEAkdkFSUBaJrpA',
        state: 'in_review',
        member_id: 'jrMOZzVdWXvLgMpcHoyBTw',
        at: daysFromNow(-25, 9, 0),
    },
    {
        id: 'OHpSABWAwjJOyTuaFeAxBg',
        entity_id: 'PkrEwSLQlrldLRwlAMVhRA',
        state: 'in_review',
        member_id: 'RPzLGrWcstxLaHoBcViPLQ',
        at: daysFromNow(-20, 9, 0),
    },
];

// One state event per seeded project (including the org-2
// override's own event) — the creation moment of each project
// on the states log, doubling as postProjectDocumentOp's
// genesis-state input.
export const projectStateEvents: StateEntity[] = [
    {
        // 'submitted' so the scoring loop skips this
        // org-'BBjWJsjYIDkTRKIIPrzWRw'
        // project — no cross-org score against org-'AjdvjuECVZEgZoFajaIEkg'
        // objectives.
        id: seedIdentifier('seed-state-project-org2'),
        entity_id: seedIdentifier('seed-project-org2'),
        state: 'submitted',
        member_id: SYSTEM_MEMBER_ID,
        at: MOCK_SEED_TIMESTAMP,
    },
    {
        id: 'pSe01Cu5tSegmAi5pEv01',
        entity_id: 'wqGTTFdYUGnmBxWCppmkOQ',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-60, 9, 0),
    },
    {
        id: 'pSe02Aut0Rep0rtComp02',
        entity_id: 'kAxUZTXdcMCAttuoyCdSYA',
        state: 'archived',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-110, 9, 0),
    },
    {
        id: 'pSe03SalesP1p3App03Z',
        entity_id: l2cProjectId,
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-55, 9, 0),
    },
    {
        id: 'pSe04PredMa1ntRev04AB',
        entity_id: 'ORXAfsQvNowpmJfBwQAtWg',
        state: 'under_review',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-18, 9, 0),
    },
    {
        id: 'pSe05RtAna1ytComp05CD',
        entity_id: 'OTmPQEfeyDzqGNOmlFSUMw',
        state: 'archived',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-95, 9, 0),
    },
    {
        id: 'pSe06SmInvOptSnt06EF',
        entity_id: 'OXxlaOFaAWfVofOqOHeTrQ',
        state: 'sent_back',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-38, 9, 0),
    },
    {
        id: 'pSe07Empl0yTraRev07GH',
        entity_id: 'ObmAspkIgRMWsTRDWpkSUw',
        state: 'under_review',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-12, 9, 0),
    },
    {
        id: 'pSe08CustSuppApp08IJ',
        entity_id: 'OfgrTrJuepfpmOSjtBhrYA',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-48, 9, 0),
    },
    {
        id: 'pSe09C0mp1AudApp09KL',
        entity_id: 'OjDbHdsCibzUBZCSRSqucw',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-72, 9, 0),
    },
    {
        id: 'pSe10MlRgD1s4App10MN',
        entity_id: 'OmGoTHQFHRevqlrGWPgtKA',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-82, 9, 0),
    },
    {
        id: 'pSe11V0iceField11OPQ',
        entity_id: 'OtSStAjEiIerCMcUwNgMbQ',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-40, 9, 0),
    },
    {
        id: 'pSe12CarbF00tCmp12RS',
        entity_id: 'OvIEhORMAYZxBcQZKkgkow',
        state: 'archived',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-120, 9, 0),
    },
    {
        id: 'pSe13W0rk4rcRev13TU',
        entity_id: 'OvJSmafViYCdfyAIdgzJTQ',
        state: 'under_review',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-22, 9, 0),
    },
    {
        id: 'pSe14SmartD0cAp14VWX',
        entity_id: 'PGtnaoTOuWCcbADPrancjA',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-65, 9, 0),
    },
    {
        id: 'pSe15Inv3st0rAp15YZA',
        entity_id: 'PIImLccwpnfvbBBMsIKoMA',
        state: 'approved',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-58, 9, 0),
    },
    {
        id: 'pSe16MktSentSubmt16BC',
        entity_id: 'PIfhHMLQQxTxKFDdabXbOw',
        state: 'submitted',
        member_id: SYSTEM_MEMBER_ID,
        at: daysFromNow(-5, 9, 0),
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

// One state event per seeded Record — the creation moment of
// each Record on the states log, doubling as postRecordWriteOp's
// initial-state input.
export const recordStateEvents: StateEntity[] = [
    {
        id: 'rRUEoKtGRZWwFoRtqQCICQ',
        entity_id: customerProfileRecordId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
    },
    {
        id: 'rSQsPfJUwbWduxxswfPuqg',
        entity_id: projectBriefRecordId,
        state: 'active',
        member_id: SYSTEM_MEMBER_ID,
        at: wfTimestamp,
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
// seed transitions (formInstanceChainPairs + transitionSeedBody
// value-branch). Dropped from the op-driven loop to avoid
// double-append.
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
// both formWritePair (here) and the actual write (mock-data.ts).

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
// Phase 2 Task 3): the flat entity fields plus the lifecycle
// trio, no `id` (a route param, not a body field) and no
// `idea`/`initialState*` wrapper. organization_id rides along
// as the validator's tolerated-but-ignored extra — load-bearing
// here since the seed drives postIdeaDocumentOp below the org
// fence (no scoping wrapper to stamp it).
export function ideaSeedBody(
    idea: Omit<
        IdeaEntity,
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
    event: StateEntity,
    index: number,
): Record<string, unknown> {
    const { id: _id, ...ideaFields } = idea;
    return {
        ...ideaFields,
        organization_id: assignOrganization(index),
        state: event.state,
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
// ideaSeedBody exactly): the flat entity fields plus the
// lifecycle trio, no `id` (a route param, not a body field).
// organization_id rides along as the validator's tolerated-but-
// ignored extra — load-bearing here since the seed drives
// postProjectDocumentOp below the org fence (no scoping wrapper
// to stamp it). Unlike ideas, every Stark project shares one
// org, so `organization` is passed straight through rather than
// derived from an index.
export function projectSeedBody(
    project: Omit<
        ProjectEntity,
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
    event: StateEntity,
    organization: Id,
): Record<string, unknown> {
    const { id: _id, ...projectFields } = project;
    return {
        ...projectFields,
        organization_id: organization,
        state: event.state,
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
    ProjectEntity,
    | 'organization_id'
    | 'state'
    | 'state_at'
    | 'state_event_id'
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
// PURELY from the SAME projectStateEvents / projectOrganizationFor
// / buildProjects / projectOrg2 both pass 1 (this file) and
// pass 2 (mock-data.ts) already share, so a future project
// addition can never drift the two callers apart. State comes
// from projectStateEvents (never a stored row column — the
// states log is the sole source of entity state), the SAME
// lookup postMockDataLoadIn used pre-hoist.
export function buildScoreSeedProjects():
    readonly ScoreSeedProject[] {
    const projects = buildProjects();
    const projectStateEventById = new Map(
        projectStateEvents.map(e => [e.entity_id, e]),
    );
    return [...projects, projectOrg2(projects)].map(
        project => ({
            id: project.id,
            organization_id: projectOrganizationFor(project),
            start_date: project.start_date,
            state: projectStateEventById.get(project.id)!.state,
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
// at} — the ONE shape every seeded credential (11 human
// passwords + the system client secret, both mock-data and
// bootstrap) shares. Hoisted (Phase 10 Task 6) so
// formSeedCredentialPairs (this file) and seedHumanCredentials
// (mock-data.ts) share the SAME construction — the
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
    r: Omit<
        RecordEntity,
        | 'organization_id'
        | 'state'
        | 'state_at'
        | 'state_event_id'
    >,
    index: number,
    event: StateEntity,
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
        initialState: event.state,
        initialStateEventId: event.id,
        initialStateAt: event.at,
    };
}

interface ObjectiveSeed {
    readonly id: string;
    readonly position: number;
    readonly name: string;
    readonly description: string;
}

// The create body for POST /objectives — objective row,
// first revision, and the genesis lifecycle trio. The trio
// folds onto the document pair via objectiveDocumentBodyOf
// (states-address retirement); pair count is unchanged —
// only body bytes grow. Genesis event id mirrors
// aiMemberSeedBody's seed-member-${id}-active pattern.
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
        initialStateEventId: seedIdentifier(
            `seed-objective-${seed.id}-active`,
        ),
        initialStateAt: MOCK_SEED_TIMESTAMP,
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

export function seedPairKey(
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
    // slots for the ADDRESS (uriId stays '' — messageAddress
    // keys on the LAST segment), but the method is POST and
    // the response is the op's own {status: 204} spec.
    readonly op?: true;
    readonly organization: Id | undefined;
    readonly requesterIdentityId: Id;
    readonly body: Record<string, unknown>;
}

// Dependency-ordered (matches postMockDataLoadIn's write order):
// memberships + human-members, ideas, organizations (Phase 12
// Task 3), idea-submissions, projects, flows, work-orders,
// flow-work-orders, the work-order historical traces as
// work-orders/:id/transition ops (states-address retirement
// Task 12; field values fold into those bodies), memberships
// + ai-members, the system member's own document, records,
// flow-records, objectives. A dropped or reordered invocation
// here is caught by tests/mock-data-pairs.test.ts's pinned
// invocation count.
export function buildMockDataInvocations():
    readonly MockDataInvocation[] {
    const members = buildMembers();
    const ideaStateEventById = new Map(
        ideaStateEvents.map(e => [e.entity_id, e]),
    );
    const ideas = buildIdeas();
    const projects = buildProjects();
    const projectStateEventById = new Map(
        projectStateEvents.map(e => [e.entity_id, e]),
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
    const recordStateEventByRecordId = new Map(
        recordStateEvents.map(e => [e.entity_id, e]),
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
        // its OWN document pair, closed through
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
            invocations.push({
                key: seedPairKey(
                    ORGANIZATION_MEMBER_DETAIL_PATTERN,
                    member.id + '-' + n,
                ),
                routePattern:
                    ORGANIZATION_MEMBER_DETAIL_PATTERN,
                idParams: [organization, member.id],
                organization,
                requesterIdentityId: SYSTEM_MEMBER_ID,
                body: seatSeedBody(type),
            });
        });
        invocations.push({
            key: seedPairKey('identities/:id', member.id),
            routePattern: 'identities/:id',
            idParams: [member.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: identityPersonSeedBody(member),
        });
        // Phase 10 Task 2: the PII facet's own document pair,
        // closing the intake decomposition's seed side — its own
        // address (identities/:id/pii), formed the SAME way
        // every other per-member invocation above is, over the
        // SAME body humanMemberPiiSeedBody hands the actual write
        // (mock-data.ts) so the two can never drift. ORDERING
        // (verification finding): mock-data.ts nests this
        // invocation's write inside the SAME outer TABLE_NAMES
        // transaction the human-members create already spans, so
        // it commits BEFORE seedHumanCredentials' pii-presence
        // filter runs.
        invocations.push({
            key: seedPairKey('identities/:id/pii', member.id),
            routePattern: 'identities/:id/pii',
            idParams: [member.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: humanMemberPiiSeedBody(member),
        });
    });
    // The system identity's OWN identities/:id document
    // pair — the last raw identities.put site the mock-data seed
    // still held for the system actor (the human-member loop
    // above forms this SAME pair per human member already; the
    // ai-members loop below forms its OWN, per member).
    invocations.push({
        key: seedPairKey('identities/:id', SYSTEM_MEMBER_ID),
        routePattern: 'identities/:id',
        idParams: [SYSTEM_MEMBER_ID],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: identityDocumentBodyOf('service'),
    });
    // Role grants retired: membership `type` seeds the
    // privilege (admin for current, member otherwise) and mint
    // bakes claim roles from those memberships.
    const ideaIndexById = new Map(
        ideas.map((idea, i) => [idea.id, i]),
    );
    ideas.forEach((idea, i) => {
        const event = ideaStateEventById.get(idea.id)!;
        invocations.push({
            key: seedPairKey('ideas', idea.id),
            routePattern: 'organizations/:id/ideas/:id',
            idParams: [assignOrganization(i), idea.id],
            organization: assignOrganization(i),
            requesterIdentityId: event.member_id,
            body: ideaSeedBody(idea, event, i),
        });
    });
    // Phase 12 Task 3 / Phase Final Task 2: the two seeded
    // organizations form their OWN organizations/:id document
    // pairs (ROW half stripped — pair-plane only).
    invocations.push({
        key: seedPairKey('organizations/:id', STARK_ORGANIZATION),
        routePattern: 'organizations/:id',
        idParams: [STARK_ORGANIZATION],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: organizationSeedBody(
            'Stark Industries', 'acmecorp.com',
            daysFromNow(300, 0, 0),
        ),
    });
    invocations.push({
        key: seedPairKey('organizations/:id', ORGANIZATION_TWO),
        routePattern: 'organizations/:id',
        idParams: [ORGANIZATION_TWO],
        organization: undefined,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: organizationSeedBody(
            'Wayne Enterprises', 'wayne.example.com',
            daysFromNow(200, 0, 0),
        ),
    });
    for (const submission of buildIdeaSubmissions()) {
        const ideaIndex = ideaIndexById.get(submission.idea_id)!;
        invocations.push({
            key: seedPairKey('idea-submissions', submission.id),
            routePattern:
                'organizations/:id/ideas/:id/submissions/:sid',
            idParams: [
                assignOrganization(ideaIndex),
                submission.idea_id, submission.id,
            ],
            organization: assignOrganization(ideaIndex),
            requesterIdentityId: submission.member_id,
            body: ideaSubmissionSeedBody(submission),
        });
    }
    for (const project of [...projects, projectOrg2(projects)]) {
        const event = projectStateEventById.get(project.id)!;
        const organization = projectOrganizationFor(project);
        invocations.push({
            key: seedPairKey('projects', project.id),
            routePattern: 'organizations/:id/projects/:id',
            idParams: [organization, project.id],
            organization,
            requesterIdentityId: event.member_id,
            body: projectSeedBody(project, event, organization),
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
        invocations.push({
            key: seedPairKey('flows', flow.id),
            routePattern: 'organizations/:id/flows/',
            idParams: [STARK_ORGANIZATION],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: createBody,
        });
        // Task 5: create appends THREE pairs — the operation
        // pair above, plus a document pair (at the flow's own
        // address) and a join pair (at the project_flows
        // address), each keyed by its OWN deterministic
        // invocation entry, mirroring the idea-submissions
        // two-idParams precedent. The document body is built
        // through flowCreateDocumentBody — the SAME construction
        // api/routes.ts's POST /flows handler uses — never a
        // second, hand-rolled copy.
        const b = validateFlowCreateBody(createBody);
        invocations.push({
            key: seedPairKey('flows/:id', flow.id),
            routePattern: 'organizations/:id/flows/:id',
            idParams: [STARK_ORGANIZATION, flow.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: seedFlowDocumentBody(b, flow.graph),
        });
        invocations.push({
            key: seedPairKey(
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
        });
    }
    // Task 6: the fifth seeded flow — organization
    // 'BBjWJsjYIDkTRKIIPrzWRw's
    // own —
    // has no project_flows join row, so it drives through
    // postFlowDocumentOp's genesis document PUT instead of the
    // four-above's postFlowCreationOp.
    invocations.push({
        key: seedPairKey(
            'flows/:id', seedIdentifier('seed-flow-org2'),
        ),
        routePattern: 'organizations/:id/flows/:id',
        idParams: [
            ORGANIZATION_TWO,
            seedIdentifier('seed-flow-org2'),
        ],
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: flowOrg2SeedBody(),
    });
    // Phase 5 Task 4: the entity/join gap closed — one document
    // pair per seeded work order (hand-authored + generated) and
    // one join pair per seeded flow-work-order join, mirroring
    // the flows family's document-genesis shape. The work-order
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
        invocations.push({
            key: seedPairKey('work-orders/:id', wo.id),
            routePattern:
                'organizations/:id/work-orders/:id',
            idParams: [STARK_ORGANIZATION, wo.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId:
                workOrderFirstEventMemberId.get(wo.id)!,
            body: workOrderDocumentSeedBody(wo),
        });
    }
    for (
        const join of [
            ...flowWorkOrderJoins,
            ...leadToCloseWorkload.flowWorkOrders,
        ]
    ) {
        invocations.push({
            key: seedPairKey(
                'flows/:id/work-orders/:woid', join.id,
            ),
            routePattern:
                'organizations/:id/flows/:id/work-orders/:woid',
            idParams: [
                STARK_ORGANIZATION, join.flow_id, join.id,
            ],
            organization: STARK_ORGANIZATION,
            // The SAME member as the join's own work order's
            // document pair — the requesting identity is who
            // brought the work order into being, not a second,
            // independently-picked author.
            requesterIdentityId: workOrderFirstEventMemberId.get(
                join.work_order_id,
            )!,
            body: flowWorkOrderJoinSeedBody(join),
        });
    }
    // States-address retirement: every trace event (212 hand-
    // authored + 649 generated = 861) reshapes 1:1 into a
    // work-orders/:id/transition op-shaped pair — the LIVE op
    // shape, nothing invented: transitionEventId = the event's
    // own id, transitionAt = its at, targetState = its node
    // state, requester = the event's OWN member. NOT creation
    // ops: the creation gate's exact-3 'claimed'-slot
    // semantics do not match historical traces (zero seeded
    // claim events; the in-flight fixtures are 2- and
    // 3-event). WO-instance SoT Task 6: WO01's two value-
    // bearing events leave this loop — formInstanceChainPairs
    // forms their NEW-shape ops + revision pairs (and the
    // instance genesis + binding) so they are not double-
    // appended.
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
        invocations.push({
            key: seedPairKey(
                'work-orders/:id/transition', event.id,
            ),
            routePattern:
                'organizations/:id/work-orders/:id/transition',
            idParams: [STARK_ORGANIZATION, event.entity_id],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: event.member_id,
            body: transitionSeedBody(event),
        });
    }
    for (const m of aiMembers) {
        const { id: _id, ...fields } = m;
        invocations.push({
            key: seedPairKey('ai-agents/:id', m.id),
            routePattern: 'ai-agents/:id',
            idParams: [m.id],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: fields,
        });
    }
    mockRecords.forEach((r, i) => {
        const event = recordStateEventByRecordId.get(r.id)!;
        const attributes = mockRecordAttributes.filter(
            a => a.record_id === r.id,
        );
        const organization = assignOrganization(i);
        const createBody = recordSeedBody(
            r, i, event, attributes,
        );
        // Task 23: record document/op invocations ride the
        // nested record-types patterns (same storage addresses
        // as the retired flat alias window; counts unchanged).
        invocations.push({
            key: seedPairKey(
                RECORD_TYPES_COLLECTION_PATTERN, r.id,
            ),
            routePattern: RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organization],
            op: true,
            organization,
            requesterIdentityId: event.member_id,
            body: createBody,
        });
        // Phase 6 Task 4: create appends the document pair (at
        // the type's own nested address) and one attribute-PUT
        // pair per seeded attribute, each keyed by its OWN
        // deterministic invocation entry — the flows document +
        // join precedent above, generalized from fixed
        // cardinality to 1+1+N. Bodies via the shared BODY
        // builders (api/routes.ts) — never a second, hand-rolled
        // copy. Every seeded attribute is genesis, so no
        // attribute-DELETE invocation exists here (the seed
        // never removes an attribute it just created).
        const b = validateRecordWriteBody(createBody);
        invocations.push({
            key: seedPairKey(
                RECORD_TYPE_DETAIL_PATTERN, r.id,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organization, r.id],
            organization,
            requesterIdentityId: event.member_id,
            body: recordDocumentBodyOf(b),
        });
        for (const a of attributes) {
            // Task 8: attributes store under their type
            // prefix; bodies drop record_id and stamp ACL.
            invocations.push({
                key: seedPairKey(
                    ATTRIBUTE_DETAIL_PATTERN, a.id,
                ),
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
                idParams: [organization, r.id, a.id],
                organization,
                requesterIdentityId: event.member_id,
                body: recordAttributeDocumentBodyOf(
                    a as unknown as Record<string, unknown>,
                ),
            });
        }
    });
    // Phase 6 Task 5: the flow_records seed gap closed — one
    // join pair per seeded flow-record binding, mirroring the
    // flow-work-order joins' shape above. The requesting
    // identity is the bound RECORD's own state-event member —
    // the same identity that seeded the record itself (verified
    // by content: every recordStateEvents row above is authored
    // by SYSTEM_MEMBER_ID), not a second, independently-picked
    // author.
    for (const join of mockFlowRecords) {
        invocations.push({
            key: seedPairKey(
                'flows/:id/records/:frid', join.id,
            ),
            routePattern:
                'organizations/:id/flows/:id/records/:frid',
            idParams: [
                flowRecordOrganizationFor(join),
                join.flow_id, join.id,
            ],
            organization: flowRecordOrganizationFor(join),
            requesterIdentityId: recordStateEventByRecordId
                .get(join.record_id)!.member_id,
            body: flowRecordJoinSeedBody(join),
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
        invocations.push({
            key: seedPairKey('objectives', seed.id),
            routePattern: 'organizations/:id/objectives/',
            idParams: [STARK_ORGANIZATION],
            op: true,
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: createBody,
        });
        // Task 3: create appends the document pair (at the
        // objective's own address) and the revision pair (at
        // its first revision's own address), each keyed by its
        // OWN deterministic invocation entry — the flows
        // document + join precedent, objectives' own fixed
        // 1+1+1. Bodies via the shared BODY builders
        // (api/routes.ts) — never a second, hand-rolled copy.
        // The SAME member authors all three invocations (the
        // revision author).
        const b = validateObjectiveCreateBody(createBody);
        invocations.push({
            key: seedPairKey('objectives/:id', seed.id),
            routePattern: 'organizations/:id/objectives/:id',
            idParams: [STARK_ORGANIZATION, seed.id],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: memberId,
            body: objectiveDocumentBodyOf(b),
        });
        invocations.push({
            key: seedPairKey(
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
        });
    }
    const org2CreateBody = objectiveSeedBody(
        ORGANIZATION_TWO_OBJECTIVE,
        ORGANIZATION_TWO, SYSTEM_MEMBER_ID,
    );
    invocations.push({
        key: seedPairKey(
            'objectives', ORGANIZATION_TWO_OBJECTIVE.id,
        ),
        routePattern: 'organizations/:id/objectives/',
        idParams: [ORGANIZATION_TWO],
        op: true,
        organization: ORGANIZATION_TWO,
        requesterIdentityId: SYSTEM_MEMBER_ID,
        body: org2CreateBody,
    });
    const org2 = validateObjectiveCreateBody(org2CreateBody);
    invocations.push({
        key: seedPairKey(
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
    });
    invocations.push({
        key: seedPairKey(
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
    });
    // Phase 7 Task 5: the scores half of the seed deferral closes
    // LAST, landing WHOLE — baselines AND actuals, one document
    // pair per seeded row, from the SAME buildSeedScoreRows
    // output mock-data.ts's pass-2 write drives through
    // postBaselineScoreDocumentOp / postActualScoreDocumentOp.
    // `pools` is the SAME pre-tx pool the objectives loop above
    // draws from — every scored project is STARK by construction
    // (the lone org-2 project is seeded 'submitted', so it never
    // reaches the scoring loop), but the organization is still
    // looked up per row's own project rather than hardcoded, so
    // a future org-2 score would surface at the correct address.
    const scoreProjects = buildScoreSeedProjects();
    const scoreProjectOrganizationById = new Map(
        scoreProjects.map(p => [p.id, p.organization_id]),
    );
    const scoreRows = buildSeedScoreRows(scoreProjects, pools);
    for (const row of scoreRows.baselines) {
        invocations.push({
            key: seedPairKey(
                'projects/:id/objective-baseline-scores/:sid',
                row.id,
            ),
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
        });
    }
    for (const row of scoreRows.actuals) {
        invocations.push({
            key: seedPairKey(
                'projects/:id/objective-actual-scores/:sid',
                row.id,
            ),
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
        });
    }
    return invocations;
}

// Bare collection-POST creates (no `:id` segment) keep the
// bare pattern — messageAddress derives the empty uriId and
// createdEntityUriId (message-pair.ts's CREATE_BODY_ID_FIELDS)
// overrides it to the created entity's own id. Document-class
// genesis PUTs (ideas/:id, ideas/:id/submissions/:sid, …)
// carry idParams and the id-tailed address is built directly
// — messageAddress derives the real uriId from the path
// segment itself. Operation-shaped POSTs at id-carrying
// patterns (work-orders/:id/transition, op: true) also carry
// idParams for the ADDRESS, but form as POST with {status:
// 204} — uriId stays '' because messageAddress keys on the
// LAST segment.
export async function formSeedPair(
    inv: MockDataInvocation, requestAt: string,
    operationId?: string,
): Promise<MessagePair> {
    const envelopeId = operationId
        ?? generateIdentifier();
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
    return formWritePair({
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
                value: envelopeId,
            },
        ],
        body: inv.body,
        requesterIdentityId: inv.requesterIdentityId,
        requestAt,
        organization: inv.organization,
        responseStatus: response.status,
        responseBody: response.body,
        operationId: envelopeId,
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
// forms a PUT (formSeedPair's own method === 'PUT' when idParams
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
// mirrors identityDefaultOrganizationRequest's formWritePair
// (api/organization-requests.ts) — a singleton document at
// /identities/:id/default-organization/ (uriId '').
export async function formDefaultOrganizationSeedPair(
    identityId: Id,
    organizationId: Id,
    requestAt: string,
): Promise<MessagePair> {
    const pathSegments = [
        'identities', identityId, 'default-organization',
    ];
    const operationId = generateIdentifier();
    return formWritePair({
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
        responseStatus: HTTP_NO_CONTENT,
        responseBody: undefined,
        operationId,
    });
}

// The instance chain cannot ride formSeedPair: its
// revisions share an address and its head depends on
// (at, id) order — so this pass mints DISTINCT
// ascending requestAt values (a named deviation from
// the seed's shared-arrival-moment covenant) and forms
// sequentially. headerFields stays [] for every link
// — the seed's no-bearer carve-out extends to If-Match
// on seed revision pairs (never hoist If-Match onto
// synthetic revisions; the wire op pair's hoisted
// If-Match is what makes resends distinct messages on
// the live path).
export async function formInstanceChainPairs():
    Promise<ReadonlyMap<string, MessagePair>>
{
    const events = buildWorkOrderStateEvents();
    const review = events.find(
        (event) => event.id === WO01_REVIEW_EVENT_ID,
    )!;
    const complete = events.find(
        (event) => event.id === WO01_COMPLETE_EVENT_ID,
    )!;
    // Review at minus one hour — genesis + binding share
    // this hour; instance revision requestAt values stay
    // strictly ascending with their parent transitions.
    const genesisAt = daysFromNow(-13, 13, 30);
    const reviewAt = review.at;
    const completeAt = complete.at;
    const org = STARK_ORGANIZATION;
    const typeId = SEED_RECORD_TYPE_ID;
    const instanceId = SEED_INSTANCE_ID;
    const woId = review.entity_id;
    const instanceRouteSegments =
        INSTANCE_DETAIL_PATTERN.split('/');
    const instancePathSegments = [
        'organizations', org,
        'record-types', typeId,
        'instances', instanceId,
    ];
    const instancePathname =
        '/' + instancePathSegments.join('/');

    // Document-plane genesis: the inner PUT a public
    // PATCH create would store. Seed writes this one
    // pair only (1498).
    const genesisId = generateIdentifier();
    const genesis = await formWritePair({
        method: 'PUT',
        pathname: instancePathname,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: instanceRouteSegments,
        pathSegments: instancePathSegments,
        headerFields: [],
        body: { values: [] },
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: genesisAt,
        organization: org,
        responseStatus: HTTP_OK,
        responseBody: { values: [] },
        operationId: genesisId,
    });

    const bindingId = generateIdentifier();
    const binding = await formWritePair({
        method: 'PUT',
        pathname:
            '/organizations/' + org
            + '/work-orders/' + woId + '/binding',
        routePattern:
            'organizations/:id/work-orders/:id/binding',
        routeSegments: [
            'organizations', ':id',
            'work-orders', ':id', 'binding',
        ],
        pathSegments: [
            'organizations', org,
            'work-orders', woId, 'binding',
        ],
        headerFields: [],
        body: {
            instance_id: instanceId,
            record_type_id: typeId,
        },
        requesterIdentityId: SYSTEM_MEMBER_ID,
        requestAt: genesisAt,
        organization: org,
        responseStatus: HTTP_NO_CONTENT,
        responseBody: undefined,
        operationId: bindingId,
    });

    const reviewOpId = generateIdentifier();
    const reviewOp = await formWritePair({
        method: 'POST',
        pathname:
            '/organizations/' + org
            + '/work-orders/' + woId + '/transition',
        routePattern:
            'organizations/:id/work-orders/:id/transition',
        routeSegments: [
            'organizations', ':id',
            'work-orders', ':id', 'transition',
        ],
        pathSegments: [
            'organizations', org,
            'work-orders', woId, 'transition',
        ],
        headerFields: [],
        body: transitionSeedBody(review),
        requesterIdentityId: review.member_id,
        requestAt: reviewAt,
        organization: org,
        responseStatus: HTTP_NO_CONTENT,
        responseBody: undefined,
        operationId: reviewOpId,
    });

    const reviewSet = seedSetFor(review.id);
    const reviewValues = mergeInstanceValues(
        [], { set: reviewSet },
    );
    const reviewRevision = await formWritePair({
        method: 'PUT',
        pathname: instancePathname,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: instanceRouteSegments,
        pathSegments: instancePathSegments,
        headerFields: [],
        body: { values: reviewValues },
        requesterIdentityId: review.member_id,
        requestAt: reviewAt,
        organization: org,
        responseStatus: HTTP_OK,
        responseBody: {},
        operationId: reviewOpId,
    });

    const completeOpId = generateIdentifier();
    const completeOp = await formWritePair({
        method: 'POST',
        pathname:
            '/organizations/' + org
            + '/work-orders/' + woId + '/transition',
        routePattern:
            'organizations/:id/work-orders/:id/transition',
        routeSegments: [
            'organizations', ':id',
            'work-orders', ':id', 'transition',
        ],
        pathSegments: [
            'organizations', org,
            'work-orders', woId, 'transition',
        ],
        headerFields: [],
        body: transitionSeedBody(complete),
        requesterIdentityId: complete.member_id,
        requestAt: completeAt,
        organization: org,
        responseStatus: HTTP_NO_CONTENT,
        responseBody: undefined,
        operationId: completeOpId,
    });

    const completeSet = seedSetFor(complete.id);
    const completeValues = mergeInstanceValues(
        reviewValues, { set: completeSet },
    );
    const completeRevision = await formWritePair({
        method: 'PUT',
        pathname: instancePathname,
        routePattern: INSTANCE_DETAIL_PATTERN,
        routeSegments: instanceRouteSegments,
        pathSegments: instancePathSegments,
        headerFields: [],
        body: { values: completeValues },
        requesterIdentityId: complete.member_id,
        requestAt: completeAt,
        organization: org,
        responseStatus: HTTP_OK,
        responseBody: {},
        operationId: completeOpId,
    });

    const pairs = new Map<string, MessagePair>();
    pairs.set(
        seedPairKey(
            INSTANCE_DETAIL_PATTERN, instanceId,
        ),
        genesis,
    );
    pairs.set(
        seedPairKey(
            'work-orders/:id/binding', woId,
        ),
        binding,
    );
    pairs.set(
        seedPairKey(
            'work-orders/:id/transition', review.id,
        ),
        reviewOp,
    );
    pairs.set(
        seedPairKey(
            INSTANCE_DETAIL_PATTERN,
            instanceId + '-review',
        ),
        reviewRevision,
    );
    pairs.set(
        seedPairKey(
            'work-orders/:id/transition',
            complete.id,
        ),
        completeOp,
    );
    pairs.set(
        seedPairKey(
            INSTANCE_DETAIL_PATTERN,
            instanceId + '-complete',
        ),
        completeRevision,
    );
    return pairs;
}

// Pass 1 for postMockDataLoad: every op-invocation's pair,
// formed BEFORE the seed's transaction opens. `requestAt` is
// minted once by the caller (the seed's arrival moment) and
// shared by every pair this seed forms — except the instance
// chain (formInstanceChainPairs), which mints its own
// ascending requestAt values so instance-head order is
// deterministic.
export async function formMockDataMessagePairs(
    requestAt: string,
): Promise<ReadonlyMap<string, MessagePair>> {
    const pairs = new Map<string, MessagePair>();
    for (const inv of buildMockDataInvocations()) {
        pairs.set(inv.key, await formSeedPair(inv, requestAt));
    }
    // One default-organization document per seeded human.
    for (const [index, member] of buildMembers().entries()) {
        pairs.set(
            seedPairKey(
                'identities/:id/default-organization',
                member.id,
            ),
            await formDefaultOrganizationSeedPair(
                member.id,
                memberPrimaryOrganization(member.id, index),
                requestAt,
            ),
        );
    }
    // WO-instance SoT Task 6: instance genesis + binding +
    // Review/Complete new-shape ops and revision pairs.
    for (const [key, pair] of
        await formInstanceChainPairs()
    ) {
        pairs.set(key, pair);
    }
    return pairs;
}

// Pass 1 for seedHumanCredentials (mock-data.ts), called for
// BOTH seed paths: the 12 (mock-data) / 2 (bootstrap) identity-
// credential document pairs, formed from their OWN post-hash
// bodies — content unknown until PBKDF2 resolves inside
// seedHumanCredentials, which runs AFTER formMockDataMessagePairs
// / formBootstrapMessagePair above already completed, so these
// pairs can never join either. `requestAt` is minted once by the
// caller, this credential batch's own arrival moment — the SAME
// pattern every other pass 1 shares. Calls the SAME formSeedPair
// every other family here does — untouched — so a seeded
// credential pair can never drift from the shape the live PUT
// identities/:id/credentials/:cid would have formed for an
// identical request.
export async function formSeedCredentialPairs(
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
    const pairs = new Map<string, MessagePair>();
    for (const cred of planned) {
        const key = seedPairKey(
            'identities/:id/credentials/:cid', cred.id,
        );
        pairs.set(key, await formSeedPair(
            {
                key,
                routePattern: 'identities/:id/credentials/:cid',
                idParams: [cred.identityId, cred.id],
                organization: undefined,
                requesterIdentityId: SYSTEM_MEMBER_ID,
                body: identityCredentialSeedBody(
                    cred.identityId, 'password', cred.secret,
                ),
            },
            requestAt,
        ));
    }
    const systemKey = seedPairKey(
        'identities/:id/credentials/:cid', systemCredential.id,
    );
    pairs.set(systemKey, await formSeedPair(
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
        },
        requestAt,
    ));
    return pairs;
}

// Pass 1 for postBootstrap: the lone 'XXZruirZyAOoRpNxaDnpSA' human-member
// create. Its body embeds nowUtc() (bootstrap has no fixed
// seed timestamp), so it is minted ONCE here and returned
// alongside the bundle it was hashed from — postBootstrapIn
// (pass 2) writes this SAME body, never a second nowUtc() call,
// so no stored pair ever drifts from what was actually written.
// Task 5: ALSO forms bootstrap's own membership pair (its lone
// 'XXZruirZyAOoRpNxaDnpSA' membership). Phase 10 Task 2: ALSO
// forms the current member's PII document pair
// (identities/:id/pii), the SAME facet-split every other
// seeded human now carries. Phase 10 Task 5: the
// human-member bundle grows from 1+1+1 to 1+1+1+1 — the
// current member's own identities/:id document pair, the
// SAME fourth invocation the mock-data seed's own
// human-members loop now forms per member. Phase 10 Task 6:
// ALSO forms the system member's OWN identities/:id
// document pair. The credential pairs stay OUTSIDE this
// function — seedHumanCredentials' own local
// pass-1/pass-2 split (formSeedCredentialPairs) forms
// them, for both seed paths.
export async function formBootstrapMessagePair(
    requestAt: string,
): Promise<{
    readonly identityPair: MessagePair;
    readonly seatPair: MessagePair;
    readonly piiPair: MessagePair;
    readonly systemIdentityPair: MessagePair;
    readonly defaultOrganizationPair: MessagePair;
    readonly organizationPair: MessagePair;
}> {
    const identityPair = await formSeedPair(
        {
            key: seedPairKey('identities/:id', 'XXZruirZyAOoRpNxaDnpSA'),
            routePattern: 'identities/:id',
            idParams: ['XXZruirZyAOoRpNxaDnpSA'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
        },
        requestAt,
    );
    const seatPair = await formSeedPair(
        {
            key: seedPairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                'current-0',
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [STARK_ORGANIZATION, 'XXZruirZyAOoRpNxaDnpSA'],
            organization: STARK_ORGANIZATION,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
        },
        requestAt,
    );
    const piiPair = await formSeedPair(
        {
            key: seedPairKey('identities/:id/pii', 'XXZruirZyAOoRpNxaDnpSA'),
            routePattern: 'identities/:id/pii',
            idParams: ['XXZruirZyAOoRpNxaDnpSA'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentMemberPiiBody(),
        },
        requestAt,
    );
    const systemIdentityPair = await formSeedPair(
        {
            key: seedPairKey('identities/:id', SYSTEM_MEMBER_ID),
            routePattern: 'identities/:id',
            idParams: [SYSTEM_MEMBER_ID],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: identityDocumentBodyOf('service'),
        },
        requestAt,
    );
    const defaultOrganizationPair =
        await formDefaultOrganizationSeedPair(
            'XXZruirZyAOoRpNxaDnpSA', STARK_ORGANIZATION, requestAt,
        );
    const organizationPair = await formSeedPair(
        {
            key: seedPairKey('organizations/:id', STARK_ORGANIZATION),
            routePattern: 'organizations/:id',
            idParams: [STARK_ORGANIZATION],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: organizationSeedBody(
                'Stark Industries', 'acmecorp.com',
                daysFromNow(300, 0, 0),
            ),
        },
        requestAt,
    );
    return {
        identityPair,
        seatPair,
        piiPair,
        systemIdentityPair,
        defaultOrganizationPair,
        organizationPair,
    };
}
