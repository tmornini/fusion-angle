// Slice credential-reveal type for the test-plan seeder.
// AA reuses bootstrap; every other section gets one
// organization plus an admin. B, G, and SV add extra
// identities (G also a second organization). Form pairs
// outside the transaction; write them inside it.

import {
    TABLE_NAMES,
    type DbAdapter,
} from './db.ts';
import {
    nowUtc,
    SYSTEM_MEMBER_ID,
    DEFAULT_LOCK_TIMEOUT,
    MS_PER_DAY,
    MS_PER_SECOND,
    DEFAULT_ATTRIBUTE_ACL_ROLES,
    type StateEntity,
    type GraphNode,
    type GraphEdge,
} from './types.ts';
import {
    postIdentityDocumentOp,
    postIdentityPiiDocumentOp,
    postMembershipDocumentOp,
    postFlowDocumentOp,
    postAiAgentDocumentOp,
    postIdeaDocumentOp,
    postIdeaSubmissionOp,
    postProjectDocumentOp,
    postRecordWriteOp,
    postObjectiveCreationOp,
    postFlowCreationOp,
    postWorkOrderDocumentOp,
    postWorkOrderTransitionOp,
    postFlowWorkOrderDocumentOp,
    postFlowRecordDocumentOp,
    postWorkOrderBindingOp,
    postBaselineScoreDocumentOp,
    postActualScoreDocumentOp,
    recordDocumentBodyOf,
    recordAttributeDocumentBodyOf,
    objectiveDocumentBodyOf,
    objectiveRevisionBodyOf,
    flowCreateDocumentBody,
    type RecordWriteMessagePairs,
    type ObjectiveCreationMessagePairs,
    type FlowCreationMessagePairs,
} from './routes.ts';
import type { MessagePair } from
    './message-pair.ts';
import {
    appendMessagePair,
    formWriteMessagePair,
} from './message-pair.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';
import {
    HTTP_OK,
    HTTP_NO_CONTENT,
} from './http-errors.ts';
import {
    formBootstrapMessagePair,
    formDefaultOrganizationSeedMessagePair,
    formSeedMessagePair,
    seedMessagePairKey,
    organizationSeedBody,
    seatSeedBody,
    bootstrapCurrentIdentityBody,
    flowOrg2SeedBody,
    projectSeedBody,
    objectiveSeedBody,
    flowWorkOrderJoinSeedBody,
    flowRecordJoinSeedBody,
} from './mock-data/seed-message-pairs.ts';
import {
    daysFromNow,
    isoFromMs,
    deterministicScore,
    pickHumanMember,
} from './mock-data/seed-kit.ts';
import { seedHashKey } from
    './mock-data/seed-hash-preimage.ts';
import { STARK_ORGANIZATION } from
    './mock-data/seed-constants.ts';
import {
    postBootstrapIn,
    seedHumanCredentials,
    type SeededCredentials,
} from './mock-data.ts';
import {
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
} from './family-registry.ts';
import { buildAiMembers } from
    './mock-data/ai-members.ts';
import { buildIdeas } from
    './mock-data/ideas.ts';
import { buildProjects } from
    './mock-data/projects.ts';
import { OBJECTIVE_SEEDS } from
    './mock-data/objectives.ts';
import { buildRecords } from
    './mock-data/records.ts';
import {
    buildFlows,
    buildFlowGraphRelations,
} from './mock-data/flows.ts';
import {
    generateFlowWorkload,
    type FlowSeedSpec,
    type PathProfile,
    type SojournProfile,
    type MemberSkill,
} from './mock-data/flow-workload.ts';
import {
    validateObjectiveCreateBody,
    validateRecordWriteBody,
    validateFlowCreateBody,
} from './validators.ts';

export type TestPlanSliceReveal = {
    readonly section: string;
    readonly organizationId: string;
    readonly organizationName: string;
    readonly adminUsername: string;
    readonly adminPassword: string;
    readonly secondOrganizationId?: string;
    readonly secondOrganizationName?: string;
    readonly seatUsername?: string;
    readonly seatPassword?: string;
    readonly unseatedUsername?: string;
    readonly unseatedPassword?: string;
    readonly memberUsername?: string;
    readonly memberPassword?: string;
    readonly erasableUsername?: string;
    readonly erasablePassword?: string;
    readonly flowId?: string;
};

export const PARALLEL_SECTIONS = [
    'AA', 'B', 'C', 'D', 'E', 'F', 'F2',
    'FS', 'G', 'H', 'I', 'K', 'R', 'SV',
] as const;

export type ParallelSection =
    typeof PARALLEL_SECTIONS[number];

export function sectionToken(
    section: ParallelSection,
): string {
    return section.toLowerCase();
}

type Hasher = (
    plaintext: string,
) => Promise<string>;

const STARK_NAME = 'Stark Industries';

type TenantAdminMessagePairs = {
    readonly organizationId: string;
    readonly adminId: string;
    readonly email: string;
    readonly requestAt: string;
    readonly piiBody: Record<string, unknown>;
    readonly organizationMessagePair: MessagePair;
    readonly identityMessagePair: MessagePair;
    readonly piiMessagePair: MessagePair;
    readonly seatMessagePair: MessagePair;
    readonly defaultOrganizationMessagePair: MessagePair;
};

function tenantAdminPiiBody(
    name: string,
    email: string,
): Record<string, unknown> {
    return {
        name,
        email,
        phone: '+1 (555) 000-0000',
        bio: 'Test-plan section admin.',
    };
}

const SLICE_ENTITY_IDS: Readonly<
    Record<string, string>
> = {
    'aa-org': 'pIkKmoeZHZMquyqxPUpWVQ',
    'aa-admin': 'dISiDlJnfvFRleEiNkLOpQ',
    'aa-idea-active': 'TBdNsIpyJsuWXBMweRmzKg',
    'aa-idea-in_review': 'KYroiFTiZJseQQpiAAJBtQ',
    'aa-idea-sent_back': 'wzoLqktSxARIsSQPImonRg',
    'aa-idea-approved': 'oWFMLJNNJfJMPOCMnfvTlw',
    'aa-project-submitted': 'aPsUeYnGBSNeQDbVryjKoQ',
    'aa-project-approved': 'BWhZGvswUWKnmAgincYDjw',
    'aa-project-approved-2': 'pmZPZbiGbAxbJEHBAguCrg',
    'aa-obj-1': 'MyTPImFQcUPVAGaRnrexjw',
    'aa-obj-2': 'smsNJAQYuoluqfQfmErCew',
    'aa-obj-3': 'tkznlrWkXWJpaAJWMbHyLw',
    'aa-obj-4': 'eLcefwLNZKRanLkxKCvAnA',
    'aa-record-customer': 'nbVVZabdDBQlDtspwUAVNA',
    'aa-attr-1': 'cxNzttibtFvlWVOqwNxnYg',
    'aa-attr-2': 'dSbcrUIZTpJuBJzPxrfrRA',
    'aa-attr-3': 'kWpAaAttrPhoneSeedIdZg',
    'aa-state-record-customer': 'OlBcqVcxakMASmTOZNWsww',
    'aa-flow': 'tDRyatMpIeXmrmVGYxRMlg',
    'aa-node-create': 'YZqteEBJUhWMPcMFkqNjnA',
    'aa-node-capture': 'IlgKpzslsnZTgUUibNPbgg',
    'aa-node-review': 'qljWqsVbCUiHsQBHxzGjCg',
    'aa-node-archive': 'qDFRPwiKvrrQRmZdIuCaWA',
    'aa-edge-begin': 'odZujHuyLyhTmeVUgGfrPw',
    'aa-edge-submit': 'GSsZyMVrkszvNCEWqwHqTg',
    'aa-edge-approve': 'wXtxcGdCrIcxrwLEwbbsDw',
    'aa-project-flow': 'nWuqOsIANXvmJpCedmkLwA',
    'aa-state-flow': 'QprvkeEBUSiWJeqROUcLOA',
    'aa-wo-capture': 'tyOMRHNlYoyflOrtNDZdbQ',
    'aa-wo-review': 'ybdlQXRNySxElKtQsYCYeA',
    'aa-wo-archive': 'IDWgaKACflhQBTMjHgPYsA',
    'aa-wo-capture-move': 'apiWxvgADUZAfTCOSuaSFw',
    'aa-wo-review-move': 'vywcZuTckgNqaLJzkFGfwg',
    'aa-wo-archive-move': 'DPVTsvrEBiHvmxJoBISGbQ',
    'b-org': 'KimZVSllwzsOFQRzABLAFw',
    'b-admin': 'JbaPyILUCkLRVIVxJlHMSg',
    'b-idea-active': 'EJrpMfFOlnQtlkfbHlXNcw',
    'b-idea-in_review': 'xcZupnbDmmWHSpQgsgUrGw',
    'b-idea-sent_back': 'UEVeFtKRtHcrAwtWGGYUlg',
    'b-idea-approved': 'eNvPVqZQbbdKNocvJNAXvw',
    'b-project-submitted': 'QqPqWqJhsqZLUHvcdPdMVw',
    'b-project-approved': 'sKklgNwPuWAoJFjrjvBvAA',
    'b-project-approved-2': 'xhqjEvpFbyfpkkPtACdMLA',
    'b-obj-1': 'wdQEqkyCqEHnqYBydQpsWQ',
    'b-obj-2': 'kdNYJzVfZGsugBPwAMJAxw',
    'b-obj-3': 'tFjAryipXWvaviHzfNvhKQ',
    'b-obj-4': 'ydOOsHHUsUsdcjApodxHwg',
    'b-record-customer': 'OWijooyTMywZggIbCMRavQ',
    'b-attr-1': 'tohvoeouiGIhqvElesljyw',
    'b-attr-2': 'KORdJfuCsHjlpmSQzWpSpw',
    'b-state-record-customer': 'leLLfdnAzDgxBzwbAjADDA',
    'b-flow': 'UXOPfjdZZohCcyCLlQWnuQ',
    'b-node-create': 'lYwUphTKpDrVBapuffNifQ',
    'b-node-capture': 'GwHcMWpaCSGKdIGFtwASoA',
    'b-node-review': 'SkkTBYoORudlrknmOWdCyA',
    'b-node-archive': 'AhXlrhNOVTIlyMvpFdhmXA',
    'b-edge-begin': 'nQldXetcsRiFhbeSqBgCHg',
    'b-edge-submit': 'yAeThKEXWIucbhaNLFueGQ',
    'b-edge-approve': 'tNWMijExGLyYwYdabWoZvA',
    'b-project-flow': 'uSKBRIGgCzWRMFUzxaOPmg',
    'b-state-flow': 'RRWnKatGWKoknDbRAmzvOA',
    'b-wo-capture': 'nrJqCoLdPruUsZlJWYEAaQ',
    'b-wo-review': 'mEsUypeeKHSiymcygvnUlw',
    'b-wo-archive': 'tEavUntSfcznMwThZcEdeQ',
    'b-wo-capture-move': 'qjJTjTtNURgWLNneLmserg',
    'b-wo-review-move': 'tWwCdFQImzbQWKLOekkkQA',
    'b-wo-archive-move': 'PInIVGISLvTaCLWWuAOZZw',
    'c-org': 'UDPqeviQQcaxOUrvpkOejQ',
    'c-admin': 'rgrOKkoZRGtCKXoZCKwkTw',
    'c-idea-active': 'mYDXLRNzutXaXCUZkTLiYA',
    'c-idea-in_review': 'vKAdUjWhMFoLiFqgJGTIdw',
    'c-idea-sent_back': 'AawuLlRyaxZUYzeKGgMuTw',
    'c-idea-approved': 'QKfYzzLSHCXWORvqimZeug',
    'c-idea-active-submission': 'wOBTZC-Vn7GRNJ_y-VodQQ',
    'c-idea-in_review-submission': 'H3OKnysC1p66onTEKNdJ-g',
    'c-idea-sent_back-submission': 'zj2NKyW7yhGeXzyVM_lIvQ',
    'c-idea-approved-submission': '6aBI2B6YGddcsus2Lfhvdg',
    'c-project-submitted': 'nQXpeKvMYDSbyVWBbZIJNA',
    'c-project-approved': 'skPDGElmJJdAdYITVWNHcg',
    'c-project-approved-2': 'JoYLAWWIeCVSzCQWRGLVww',
    'c-obj-1': 'pnYrkmIPDIdqxqREMwTuDg',
    'c-obj-2': 'OGikUXudaQzCfboTTUXONw',
    'c-obj-3': 'stuiIssRZyaIVHzGyIGCBw',
    'c-obj-4': 'vYSFlEjXVtzrSBsAEDaIHQ',
    'c-record-customer': 'NqvEMOSINeuMAtbyQxmskQ',
    'c-attr-1': 'cKoOBXxadFfRUzFCouUNHQ',
    'c-attr-2': 'xNXoGMjCgYkFgSHylrrnvQ',
    'c-state-record-customer': 'rpgPxnrYlfBQcoQsjyKIiQ',
    'c-flow': 'wGFoZKHuJIhDNkuFtafOVw',
    'c-flow-record': 'mYgImTkt_AtV2LrJ1sPmew',
    'c-node-create': 'VOvZGYNDScsZkzLaIcYeLQ',
    'c-node-capture': 'zbFAvlwrMvHAZlMRuPHJng',
    'c-node-review': 'COZlWfLvbhNbTmiNphBSHg',
    'c-node-archive': 'guXZUMyEOcjvExZguPSMRg',
    'c-edge-begin': 'arRpRuEYXaLtQqjGAIGqIg',
    'c-edge-submit': 'rtkLmNmmRWRMqACLAOWYbg',
    'c-edge-approve': 'oMvhqoZPSaCHeYkVKuWZEA',
    'c-project-flow': 'hGZNrChuDKomEdNgOpwBTg',
    'c-state-flow': 'LcUYRIEYOesgVREGVszbXg',
    'c-wo-capture': 'GEQtfApYgLgwOtjGOsOWQA',
    'c-wo-review': 'dmQEgqjuWCPhzoIaNhkdZQ',
    'c-wo-archive': 'BOgLdJDhOSTiiIYTlUojew',
    'c-wo-capture-move': 'cBJzNvNKLsCYmdqZQTiQTA',
    'c-wo-review-move': 'VcwmLRLazHybVJcPAxGXig',
    'c-wo-archive-move': 'PPAaGaCozURziXUgetHzMw',
    'd-org': 'awIQEalaPzqtPJUXERwTLw',
    'd-admin': 'PVNrLzrfvTzAwGkxEOvTdw',
    'd-idea-active': 'JNsKAOqCHVVqcJMLdBCzrg',
    'd-idea-in_review': 'FQqRjwrXVfCXFrzAdfGGJg',
    'd-idea-sent_back': 'QZyoamhqqrJUGyKlETHSCA',
    'd-idea-approved': 'rJVaWbzcBhcYPqEsFpKgOA',
    'd-idea-active-submission': 'BuxlcYyfIkXk6ZWYmobvww',
    'd-idea-in_review-submission': 'cK6oLgyjN_yX87fh4Odr3g',
    'd-idea-sent_back-submission': '2-iBj4cvvJD0DIOeUkQyEw',
    'd-idea-approved-submission': 'WpglrEJPmlj2NpO4Qh3pDw',
    'd-project-submitted': 'KNzsXuHnXjbJSXwAEguWfw',
    'd-project-approved': 'rakYaiIbLJAhvSfhfqQZlQ',
    'd-project-approved-2': 'SqNxjcBlrbfmmdPbxYimpg',
    'd-obj-1': 'ERKTwqaOZDMpjoBegKAEyg',
    'd-obj-2': 'fEMiLSsOHeeroEXvcmlQiQ',
    'd-obj-3': 'bEkzgDMmknLDbAmgrDXLcw',
    'd-obj-4': 'fDpTbgeVnTBbgiWgzPGfiw',
    'd-record-customer': 'ltsneqmKbbbYioiqDMHaMw',
    'd-attr-1': 'YZzuQVghYsMQpegcjzklIA',
    'd-attr-2': 'ozydrOWHXZrZPJAQptHwrQ',
    'd-state-record-customer': 'rlAWvPiEfgBjDtydoXxQDw',
    'd-flow': 'UgQvGSOzRwAGysXHQfZPCg',
    'd-flow-record': 'nOIYYiLPQ6ki2E3kLWzJqQ',
    'd-node-create': 'vArHIbnQwQmROVYGygqIHA',
    'd-node-capture': 'ZaApzKSTovzCKivtrHbiEw',
    'd-node-review': 'ZJlbmGQBfiJOfIOQWRPwKw',
    'd-node-archive': 'HZbONvLhEUZWYkyXbabDGg',
    'd-edge-begin': 'CLrlHoCRpAEVUkyuraisLw',
    'd-edge-submit': 'thpwOjOUrtjnoPOaUhsmGw',
    'd-edge-approve': 'CdPfPQIpnEisUxonuclHxw',
    'd-project-flow': 'DZkJPdRBXHnrrXFLxTDeFA',
    'd-state-flow': 'WXaPxBdEbMDDqOOJSYcSdg',
    'd-wo-capture': 'MAAPjqIHTSzQSHVukUKcnw',
    'd-wo-review': 'SbzycBYGIVdcviNBbhovfQ',
    'd-wo-archive': 'CMaVMfsHDyzHIEDXsYMvuw',
    'd-wo-capture-move': 'iGUYIVjjpuUrrLotUinDyw',
    'd-wo-review-move': 'xIbMAlDcgXImQUoBINApFA',
    'd-wo-archive-move': 'vOpRxbNIfuGXzvafULwEMQ',
    'e-org': 'IuiEymgiMNesHqWrYzoupg',
    'e-admin': 'VhtqMAOlJREIqexMYxwZOQ',
    'e-idea-active': 'BfIALWEgMdeBYpcpfVhzrw',
    'e-idea-in_review': 'AkXMklIskznhkiLYBrhLHQ',
    'e-idea-sent_back': 'CRAjZgtoKIofBruaUDWIlQ',
    'e-idea-approved': 'rWHlwkUZurkxHmbGweYvxw',
    'e-idea-active-submission': 'efje7lqI_mFsIvtcfbUF9A',
    'e-idea-in_review-submission': 'Ufigs3kAv6TuXQ3ip-cOFA',
    'e-idea-sent_back-submission': '_Cq1L999C3A4bORu1TmSZg',
    'e-idea-approved-submission': 'MpE2m39VpzVLSB2ITqEDuQ',
    'e-project-submitted': 'TmkurVxwWDUjGhgjvUnVIA',
    'e-project-approved': 'oGEBUpeSRIcOArpvKjAfkQ',
    'e-project-approved-2': 'uUicHreJEefHETeiuWJhcQ',
    'e-obj-1': 'rENgePZQGzAFrUEJMvnygA',
    'e-obj-2': 'guVotQNMraqgEDeyUJCWNw',
    'e-obj-3': 'wwhzNJccxNXjFRaStKKNnw',
    'e-obj-4': 'SApjXOgJeecxpRVXhMmuGQ',
    'e-record-customer': 'oltTTJynJVzlvGvUcecWuA',
    'e-attr-1': 'LsZDxvRffygwenfWxkgCUw',
    'e-attr-2': 'POolfJPMtENAIloFzGNnvg',
    'e-state-record-customer': 'PDHSUSnzFoTcdyXZBbxWWQ',
    'e-flow': 'iaLNFiscTqqcDmAlALPbOw',
    'e-flow-record': '9rHRouE6MKL_PFReiXoLwg',
    'e-node-create': 'XjxsYNrgybpgkiWBavvNbQ',
    'e-node-capture': 'svIbPlhAzRJPGYDMNPlDQA',
    'e-node-review': 'vhIaJtmJbKJVZFtWeGVasA',
    'e-node-archive': 'MUebpZrzmTQTMkgHruTJFg',
    'e-edge-begin': 'DNrKkVAprqBewzuWFMCQqA',
    'e-edge-submit': 'DbrkiRHhAhUcfgTrxZJCRA',
    'e-edge-approve': 'ZpLXhibDgjOgCbQpbzBGvQ',
    'e-project-flow': 'lFVzQiEJsYYCgIuBRAOLLw',
    'e-state-flow': 'WfIUUyzGpJYxGLEaNAYdUg',
    'e-wo-capture': 'yZoNxZOGAobIHxEkxytlcQ',
    'e-wo-review': 'eSsDbRirlIcFupXUCDWjrA',
    'e-wo-archive': 'RtKotJiYhLfaATzyPLAMqA',
    'e-wo-capture-move': 'MbhzVgShDqUlpLBULMHRxA',
    'e-wo-review-move': 'SPyrSrrrKHdouQWLYgiHTw',
    'e-wo-archive-move': 'HaqUsFjVoSCXfxgtccIXAg',
    'f-org': 'HnaaDDEIAzvTpTZzDLxwow',
    'f-admin': 'filDOGmwcxtlYjNqiNTFeg',
    'f-idea-active': 'LbuxXoZGIBrOiQksRZJBhA',
    'f-idea-in_review': 'PdJUyRINPYaYvLiqdRlarA',
    'f-idea-sent_back': 'YbajiKGBHvZgPSnlNPmgqw',
    'f-idea-approved': 'hlTnSoHDnweVMoHgVnlBaw',
    'f-idea-active-submission': 'zeyns2rTOIERuvyYqi93rQ',
    'f-idea-in_review-submission': 'ePnd30rnnRkhsrENpk-6gA',
    'f-idea-sent_back-submission': 'T-c8PAUI0szvWznxShaMVA',
    'f-idea-approved-submission': 'BzoTuEUck3mfl5PGmlysKQ',
    'f-project-submitted': 'ApUhMPPylRMGLnVIMunOnQ',
    'f-project-approved': 'rNCXPDcoUFRptifYcNWYpw',
    'f-project-approved-2': 'ktwdMAbuSHCcFmDKDwLrDw',
    'f-obj-1': 'jCHBiugZxpXDDAgbJxDGnA',
    'f-obj-2': 'mdEaNUwfCxwsJcQWGUnrZQ',
    'f-obj-3': 'NIbpyCjJpZwgkGFgSWbMTg',
    'f-obj-4': 'qhWgaotVWzbfWVibuJJRXQ',
    'f-record-customer': 'KSOBFwEWEAiYDqQPCKSfdA',
    'f-attr-1': 'azPhzEoiGiuzYOKQGggkgQ',
    'f-attr-2': 'XzsBTUrqoijPRVPskGmYbA',
    'f-state-record-customer': 'MfeoyMCsGYmicGSkZuxbew',
    'f-flow': 'WGrawvQlBCEtOwQaDfNYzg',
    'f-flow-record': 'dldB6BJT-hmWC6RV_uxupQ',
    'f-node-create': 'UlwhAnqPkssQBaKWPOjPHw',
    'f-node-capture': 'joVDOAiJZVtgnElmOCAyAA',
    'f-node-review': 'LVryuKRUgVkuTdVeKYqDcw',
    'f-node-archive': 'vTGKwITZylFuMNKCyFXwYQ',
    'f-edge-begin': 'GBBcWwzkxjRAjeNPlXcODg',
    'f-edge-submit': 'IWbtNQySXwOtbJbHKFQSEw',
    'f-edge-approve': 'DBacZPqqChMYfkjjqSRZog',
    'f-project-flow': 'LBcldHIXITLfvljfXpefog',
    'f-state-flow': 'wXEqVCZvISuDsLdNNCWLeQ',
    'f-layout-flow': 'bjwmUYT-PowOqpyLivLrgQ',
    'f-layout-project-flow': 'Tw3ysK1fsVQV28ORCYx40g',
    'f-layout-state': 'OTUsms6qK3oiqFXHnntnqw',
    'f-wo-capture': 'PrfmrgcRHkNLhzlhPoPVUg',
    'f-wo-review': 'WOJPFOKFmWASZROqIiiCig',
    'f-wo-archive': 'VnmXenQTOeGhKheRJEvFQA',
    'f-wo-capture-move': 'hVrwCPqWKeUHsiBXMmhGcQ',
    'f-wo-review-move': 'gscDMrbcATQVdzXOXjpDag',
    'f-wo-archive-move': 'utHKBlWksCwDvedKNAlceQ',
    'f2-org': 'YbTDlTvOzvkCjjPaIGeQCw',
    'f2-admin': 'xaLPEsKuiAJXlaNLnHLVkw',
    'f2-idea-active': 'ROviknftHNANsZMrhRtATQ',
    'f2-idea-in_review': 'GVFEJpKIBvOGZoNouogjTA',
    'f2-idea-sent_back': 'KoMJnbZMcAOMJeCVNdesGg',
    'f2-idea-approved': 'MxXMUsTQREaqpMPHwGAphA',
    'f2-project-submitted': 'metJwyIStvriygkCQdkTfA',
    'f2-project-approved': 'hDVAYRpFxiuCsRsiotPWww',
    'f2-project-approved-2': 'XxATszJyajREePphmJzQxg',
    'f2-obj-1': 'qWYWPVTzffLmhlRZvfVeeQ',
    'f2-obj-2': 'ylpwVUqnmahURwRtpjszAQ',
    'f2-obj-3': 'GJEWXzgtkzGQmJavYYYjFw',
    'f2-obj-4': 'hxhFEGMmvzDrJpSlkmQdPQ',
    'f2-record-customer': 'ShEwahhRZEafyzmgXqfciQ',
    'f2-instance-1': 'x_l0LSw4ud2zRD1Z0OLMIg',
    'f2-attr-1': 'YErPUsjpzqQjteXbusYqiQ',
    'f2-attr-2': 'mxyQyZkqIyMjiQINxMcJpg',
    'f2-state-record-customer': 'lnyXdDKmWojVxcxTfFnvjg',
    'f2-flow': 'DccQFYFgizAgqBvhRHkgew',
    'f2-flow-record': 'T-R_lfaxzn4C_TQF_Ua5OQ',
    'f2-node-create': 'meDWiMTCzPAPaOykaGdmWQ',
    'f2-node-capture': 'gERGOBxsTCVinbjnNxFayw',
    'f2-node-review': 'vzttFjxTEgpNmfyyrKusNw',
    'f2-node-archive': 'uuuTtohLKSFkfslRCQuPZg',
    'f2-edge-begin': 'nBTaOvBuUzsCMvOLOWqHrQ',
    'f2-edge-submit': 'FPkWtsaHGXddJVKpPDaRnA',
    'f2-edge-approve': 'SEjfnAIqgAgGukqncOiooA',
    'f2-node-capture-attr-text': 'dL4p4z_U-8XNsYJp-H94xw',
    'f2-node-capture-attr-select': 'o1yYjA882AU1i4TyB3a40A',
    'f2-edge-capture-archive': 'KmbpGLs7xhDmJhwwqtEtKQ',
    'f2-project-flow': 'DwppKTRaYbyjeAvtIHwbrg',
    'f2-state-flow': 'wBQxSNLEXSWbbSOpOMflHQ',
    'f2-wo-capture': 'oLSsqdIHyZrxtdYMwsalPA',
    'f2-wo-review': 'wqPiLLdRTwAjqWZjvImEpQ',
    'f2-wo-archive': 'dXOOKlSzOJyFBvDouYHcFA',
    'f2-wo-capture-move': 'MjmZVNlbEJgbhIjdSheqeA',
    'f2-wo-review-move': 'QmEQljgzjOljAxWoMQtWyw',
    'f2-wo-archive-move': 'IoeAvZCClizGdtQHtrcsEQ',
    'fs-org': 'PaZyGJschXoHklvGOKaSXw',
    'fs-admin': 'WxXaodvJSfkEjgtLcoIAHw',
    'fs-idea-active': 'eTUToxRWkZLqzazRknqxyQ',
    'fs-idea-in_review': 'TBHQuCnGLYRguJVHlcAPmA',
    'fs-idea-sent_back': 'PsrszcUKKUtEyMAATUjUOA',
    'fs-idea-approved': 'zYRdPmRsZkzkaYLCOlKTHg',
    'fs-idea-active-submission': 'G1IWGr0vBKSfjzZ34rrLgw',
    'fs-idea-in_review-submission': 'ui76pIWMxXFVgRRR2LQuDA',
    'fs-idea-sent_back-submission': 'TrD8X5aq7BvciVgOV04BrA',
    'fs-idea-approved-submission': 'FNGZGUXcTWh1bKEuvWD7LQ',
    'fs-project-submitted': 'KRJkyBIyhtgslHqtyzETyw',
    'fs-project-approved': 'LjaFVOqibIJXtkncrlJBlw',
    'fs-project-approved-2': 'KRRxaqYrtCItTpUHEzzZlQ',
    'fs-obj-1': 'mZMeEdzmvvVkcyIFmuzOag',
    'fs-obj-2': 'oOvRnUPmxzmkBakuijPOCg',
    'fs-obj-3': 'aOcoHMKcHlSXeoNZcYAoGw',
    'fs-obj-4': 'OSXcitRfJxwOWVJXmhXUmw',
    'fs-record-customer': 'NraSKZbEBDQvmgbWtWzTjg',
    'fs-attr-1': 'GoTuKNlmKPmCozkOQqusyg',
    'fs-attr-2': 'SSzlwaLazYbrbVTxBoEPrg',
    'fs-state-record-customer': 'bKxhTVKnzuDKMgEwORgacg',
    'fs-flow': 'zFkTGJvfUppRCCdJvFszcg',
    'fs-flow-record': '_hrSZwgy2Nwwjg8H5sVMRw',
    'fs-node-create': 'KRUlvITqCzLbngoRcKaTAQ',
    'fs-node-capture': 'QYypRkKLzMGbSGxotgIxNQ',
    'fs-node-review': 'jVhhOAhaHKPbIJuhwYjDSg',
    'fs-node-archive': 'wTmRlODxPuAbOTylkfZDNQ',
    'fs-edge-begin': 'AdVOtqtQSKfGZGtaYLfdPw',
    'fs-edge-submit': 'ItZFnpoyOndFMUIYeAOIhg',
    'fs-edge-approve': 'uCdEHZjvudxpNyqyUtQKtA',
    'fs-edge-revise': 'k3-rt2yDSOovQkFMqRlZgw',
    'fs-project-flow': 'etPELgkwzjYWnosrKJZWpg',
    'fs-state-flow': 'MbLBcUlBjgnUYOsLraNUNg',
    'fs-wo-capture': 'fTsrGwymzlLKIKnTPKvkEQ',
    'fs-wo-review': 'hdaUcpzJpWFeeYMzuIJSVw',
    'fs-wo-archive': 'YAmKFSHvzqFEztADuqZqJg',
    'fs-wo-capture-move': 'UMOMLVPXMmwpVGLPaUrgEA',
    'fs-wo-review-move': 'PxrsDoRSFVJyvPEUtcihbg',
    'fs-wo-archive-move': 'yFZJuUZhsLwQdJhyAqxlaw',
    'g-org': 'wxOovfCwcKNldjMnmAkuCQ',
    'g-admin': 'kHaSgLhnsobjMXxNLEzpBw',
    'g-erasable': 'qbtQzOgP8OTJSr9Idicllg',
    'g-idea-active': 'LHTpPuJQpgwmykSTlDezAg',
    'g-idea-in_review': 'MGctitcHoekEYcGdDcSUvQ',
    'g-idea-sent_back': 'mVhTQMpsOwBYEUWrpZLahA',
    'g-idea-approved': 'aNXrWWjugZpaABsjogeRJw',
    'g-project-submitted': 'tLUKhztHHdPnykWQIEhtZw',
    'g-project-approved': 'sGYvynSwYUWCoENhxXwwTA',
    'g-project-approved-2': 'eyFErnGwPwqXrCwufQCvZg',
    'g-obj-1': 'GElPCmItNRvYJYvPsDwHkw',
    'g-obj-2': 'eQPiIXIHVyNmVkJreaqqxw',
    'g-obj-3': 'LzRSaxBuFPlhxPAUdGzIMg',
    'g-obj-4': 'pKwNBybsKbPdLjpigrMakA',
    'g-record-customer': 'fIIVLzRrRqWMuIKsGpTgpQ',
    'g-attr-1': 'ogmxMGsFyRaRgkYZoBiHbQ',
    'g-attr-2': 'FnPYpeWfhXoymLRhkBxQCg',
    'g-state-record-customer': 'PzckmcTqryfhbtVgGKmcsg',
    'g-flow': 'gEhRUDIhkmdVxrwOPhNBiA',
    'g-node-create': 'bVErVCQjdmbSGvZybxBjPA',
    'g-node-capture': 'xkebgRgzyWcncrRESmMULg',
    'g-node-review': 'AzWRboKLBybtauTdeLlOLQ',
    'g-node-archive': 'LPlgkxIDhYxYdIbygljfWw',
    'g-edge-begin': 'nnIODXjeVoFBVysNfxDazw',
    'g-edge-submit': 'DWazojgdJiAZiXrpYnftEQ',
    'g-edge-approve': 'UWvGGmcrRwzOCSYMQriueA',
    'g-project-flow': 'oPQHCMaEWhSKEqyUpvBGmw',
    'g-state-flow': 'hfbzstxNktHjJRZCJZTenA',
    'g-wo-capture': 'LEBCOeMgysLkASBbmHMyIA',
    'g-wo-review': 'YUehbqrUJVEiZTKmFwAYUg',
    'g-wo-archive': 'outnWONMucepvFuGYFgxxg',
    'g-wo-capture-move': 'YClMotnhvUyzOKxLVFlRZw',
    'g-wo-review-move': 'AdhAFAeApOMpawcYjfHsKA',
    'g-wo-archive-move': 'rJkxGdjBVrvkjaCngfvZpg',
    'h-org': 'LiWELcsIlmmwrpkHwtITIA',
    'h-admin': 'PLJUlcSlswqOmpGbwDzwZw',
    'h-idea-active': 'GehEFaGCqmqkAJYozyykpg',
    'h-idea-in_review': 'NPdZHZCUKggQQjKPKmeZPQ',
    'h-idea-sent_back': 'HAsBazcnfsipHxhHnJRShg',
    'h-idea-approved': 'sTTBWiJomNUZGDjTeSxIjQ',
    'h-project-submitted': 'aGQkWCzaUWvRDnEBcaZzzw',
    'h-project-approved': 'iXUEWNjNEXhrSOZCpzGVkA',
    'h-project-approved-2': 'ceASjkMRvdGADMFoSgGqHw',
    'h-obj-1': 'feVFgGVDjdjzIUJmFulakg',
    'h-obj-2': 'IejpeWqOZueoecDjoCbExA',
    'h-obj-3': 'wLGENTAmQSqpxhczPFRpOQ',
    'h-obj-4': 'UMHXmuDxaMFwYcsnmszUYw',
    'h-record-customer': 'WCJrkgUVdmuOOtJougqCrQ',
    'h-attr-1': 'toKfaSwZHIlDzGlDQbtGdA',
    'h-attr-2': 'sTStQinOgCyDSqPYkpyHNQ',
    'h-state-record-customer': 'vonlwGtVAmltTwnAAjpZww',
    'h-flow': 'KdaUvgreSoKtJChAfEyCpA',
    'h-node-create': 'jtAYhwimgiNtMdThSlWQAQ',
    'h-node-capture': 'kAKqMpczBNNJEFwukittTA',
    'h-node-review': 'rPmPWoxenZVjUicDXDkgkQ',
    'h-node-archive': 'YqiNHwHjwiSUNSwidvegHA',
    'h-edge-begin': 'PseICgHWCSHMqrasVMTHwQ',
    'h-edge-submit': 'KAuqtMNYvJTtroyaDwoHpw',
    'h-edge-approve': 'pQVbNGYpZTmZVFKVvJUrkw',
    'h-project-flow': 'rPwfrvhRPAtDQSjmWcFjzw',
    'h-state-flow': 'jHeXLJySjUwlmzIwLrzuEQ',
    'h-wo-capture': 'YQqYPnqrhUxrDYUTDaCbhQ',
    'h-wo-review': 'wLELYXpvCHIeyVRtqGoXVg',
    'h-wo-archive': 'RqIJHTImCFOnrKDAJOLDJg',
    'h-wo-capture-move': 'SNOXNUQIZhXSPXURBEOfMw',
    'h-wo-review-move': 'yxblcmaKhbFxeKLiNwwZOw',
    'h-wo-archive-move': 'FXBmdAKYnzkaoBAhynZBcA',
    'i-org': 'MKmTOEpQTLEoKsYLTSFPXQ',
    'i-admin': 'RlVXjLbPPTsOimpvwqwLsA',
    'i-idea-active': 'rjlLdGCcBuOpKYZNXhdvMg',
    'i-idea-in_review': 'UVjxUdANhxHweLHupBNMfQ',
    'i-idea-sent_back': 'lavJFfVPWUawXNmMybpdGg',
    'i-idea-approved': 'PxstVVYLDvmwIEAhJAhXwQ',
    'i-project-submitted': 'WjkquEmLBsSdJUfUnoNXhg',
    'i-project-approved': 'bmAqrrrKZwJMzPzATiPxQA',
    'i-project-approved-2': 'zzluLcEOsVDYQCDtbhlVSw',
    'i-obj-1': 'shtRWUAhKBuYiwBSjXOpUA',
    'i-obj-2': 'gHaLKrEomVMkGGleEHxwdw',
    'i-obj-3': 'qVQPguSGjgetfCUBdBLefQ',
    'i-obj-4': 'paPaiJiCCtCGOkCgZMMWdg',
    'i-record-customer': 'kKqHbxmKCxHiUOjZBwazNQ',
    'i-attr-1': 'lXLLZFdJCzdHvMswiRWWQg',
    'i-attr-2': 'SrMzBeRmSlghsEPGEMvRYw',
    'i-state-record-customer': 'fpEyAQDqgtCFkuiANGsRGQ',
    'i-flow': 'XpUsrMfAIMRHwkjGONVPeg',
    'i-node-create': 'XLbgLyyvHZKwyyLpnmKZuQ',
    'i-node-capture': 'nZiBvCFSbKbDjfJcztOFCQ',
    'i-node-review': 'jPqgslrdvTBacBWACuyMOg',
    'i-node-archive': 'vFZfFQEGWhpJoXItEDeeEQ',
    'i-edge-begin': 'JAsHYjxlofcuQWJIgXaklw',
    'i-edge-submit': 'YApJpbxKvpKwycCqoTAbeA',
    'i-edge-approve': 'mdcITCSWpBiGscTStiDKiw',
    'i-project-flow': 'qxMrBjLWeEKnFFbLjlaGng',
    'i-state-flow': 'ayEANMOGHHdOrxTJIFiCwQ',
    'i-wo-capture': 'KMRsEUwlMEgHAVbcotXTYw',
    'i-wo-review': 'WzgLRaUoiDIcACiJrDQXtA',
    'i-wo-archive': 'EIjrPZpcUEGWlfWexBbsBQ',
    'i-wo-capture-move': 'ysUNddcLoKeOTsVZnVnWjA',
    'i-wo-review-move': 'rbaGUBLjFcpZfEpLAQsbvQ',
    'i-wo-archive-move': 'YyLyAqlclXWaNAPULBELAQ',
    'k-org': 'hiAguMgaZhKsTyVFLFxdig',
    'k-admin': 'JfHbTXkOyLzJSNWFWFGrMg',
    'k-idea-active': 'wzSXrKhOSQdIiNKtqxxtHw',
    'k-idea-in_review': 'zcnjiUCwsijdNtgVJnyxeA',
    'k-idea-sent_back': 'OmrBjXExMatzWNNJLvfEHA',
    'k-idea-approved': 'LHxdLOPzEtHwPnNJTqRMGw',
    'k-idea-active-submission': '-lkidKwbns-b8iacRpNWZg',
    'k-idea-in_review-submission': 'EYMK3ZEX4Ue5YVvpcsXX4w',
    'k-idea-sent_back-submission': 'kMEtwfnnQl3JLG4am2xoqA',
    'k-idea-approved-submission': 'sRC-nTKUbtMbVqm8OR04JA',
    'k-project-submitted': 'PUsJipQoPeOXZYbvjrxRYA',
    'k-project-approved': 'aiuWSWEDxpQtocOmEhREig',
    'k-project-approved-2': 'MDaWSsFjBtixOMAkPTArgw',
    'k-obj-1': 'TPvhenONWoZHuenvmDnmRA',
    'k-obj-2': 'zstobkLDYwgbXzQdpwioFA',
    'k-obj-3': 'EElVrvvnEMpKqZykKDiuzw',
    'k-obj-4': 'EfFPOLsanHRxxrRqBtFjQQ',
    'k-record-customer': 'jJUXauIwMbWUJuJeHXWyhw',
    'k-attr-1': 'fxMMTgnXVFrCrepmxleQpg',
    'k-attr-2': 'czuxJBVggLcKkJSPkLbZMQ',
    'k-state-record-customer': 'PpTgnhjiIgWVPOkfKAcazA',
    'k-flow': 'KLmPzgUDqnlEfkDSIZnTqg',
    'k-flow-record': 'thCp5woj-unXfr4jxJsUcw',
    'k-node-create': 'THtUTDrIWcEdlAwJgjvzyw',
    'k-node-capture': 'yyIZUPVeYThRDRAhqrpEfQ',
    'k-node-review': 'icFCNQEmjzyjwhgOJdxYRg',
    'k-node-archive': 'pGovEGUKVORtfTZCHARMUg',
    'k-edge-begin': 'eJOkYbhwbldoLCSBEntMQA',
    'k-edge-submit': 'mgopZOhilKRfFhMNLwUumQ',
    'k-edge-approve': 'rfToMcWLHpPiidvfzYfUMA',
    'k-project-flow': 'eQiRXiHFJuMliPCCtDElwg',
    'k-state-flow': 'XRZCTxzgfGuZsPBxGwiWZQ',
    'k-wo-capture': 'svGNuEBKCMkjBZWBbXcjng',
    'k-wo-review': 'jFJXsYkvXVhjwbbNeVmvMQ',
    'k-wo-archive': 'sfCmmCtuqOAULmDpYmutww',
    'k-wo-capture-move': 'bRfUDjGueJpLAJuWZzxBRA',
    'k-wo-review-move': 'JIDiLeIJxlKWmwqAyiKvwg',
    'k-wo-archive-move': 'quOEWgCEqofdoGcWdbAedg',
    'r-org': 'BzNcjJwZLCEodbofraIVaA',
    'r-admin': 'zuIFDMrBwxTWqLJpRrQWog',
    'r-idea-active': 'xMHKBRmBECZaEmSERjXzMw',
    'r-idea-in_review': 'gVYYDerOlcyAdyoFJXUVaw',
    'r-idea-sent_back': 'YiAwBoWYyaiALGKTvokFIg',
    'r-idea-approved': 'UwVUFzneUubUBqqaXcwNow',
    'r-idea-active-submission': 'fImPHFkwz6F4e6vVj4jbUg',
    'r-idea-in_review-submission': '8LA31IvKumaVpLfxo4Y38w',
    'r-idea-sent_back-submission': 'UhfWKRJtf9YNgTQ4z-jBQw',
    'r-idea-approved-submission': 'UXH2RjJ6C9IYaD1S65Hckw',
    'r-project-submitted': 'NPZZkgeCsDHgQvSumUvwyQ',
    'r-project-approved': 'qUfonSjpXWhaiIdZHjxoaQ',
    'r-project-approved-2': 'ZUaYUFklHVnRnLMwteKiYQ',
    'r-obj-1': 'STLnfNyJSKfQZmqQVDgjVA',
    'r-obj-2': 'XrgWaZvsqfrFuqWwMcGPXg',
    'r-obj-3': 'jVrJWdqovgipwOfeVfEOrw',
    'r-obj-4': 'iJVjJKUZfrTwxbxGReVupQ',
    'r-record-customer': 'NlTUsuvZqqNpXXDvtZORJg',
    'r-instance-1': '8fHkocPt8auDVdchSHxgMg',
    'r-attr-1': 'nIvyKEMWevzIynfqPKHkbA',
    'r-attr-2': 'dqyTeecJBQmttvQWXErnRg',
    'r-state-record-customer': 'pAdySOwTblAIOGayXpfKSA',
    'r-flow': 'woyUPAYCghVYHwkFAUEZEQ',
    'r-flow-record': 'SUn6E2xm_GnhV4Jpb_DqFg',
    'r-node-create': 'iZmbcpBGnOexjJdnUFtALA',
    'r-node-capture': 'mUApBGklrQKzvoBaxlRalw',
    'r-node-review': 'CihiRQzXuHILZTTKOpAgag',
    'r-node-archive': 'GKCappCPnzygmFaLnhPcOA',
    'r-edge-begin': 'tjQRCMbGNNeDffOptbtZqw',
    'r-edge-submit': 'QCQbDtLwCmnITslYwAqmSg',
    'r-edge-approve': 'sMeRwGHMNFvqIHcAJwRPNA',
    'r-project-flow': 'jFgJKiCyisocZTmPfcKCPw',
    'r-state-flow': 'TKfYaPhktGYrZNPAbnAIfQ',
    'r-wo-capture': 'OHhiyKjotLzPfKIKlTMCOg',
    'r-wo-review': 'oAlkoPujLPUkLoTVTXNSwg',
    'r-wo-archive': 'KuTZZjgDftzjmvvCltMkAA',
    'r-wo-capture-move': 'uWTNopQBCaIMxmJlsFWaJA',
    'r-wo-review-move': 'LRPrEiOANEzQxSPZcCMSIA',
    'r-wo-archive-move': 'XVSvgJYmsIZjEEkiSIwFZg',
    'r-member': 'GIo3puu_xoFWELY0Dsdklg',
    'r-record-review': 'YibTo-BhicvsQvsyJxaW_A',
    'r-state-record-review': 'EKEYE6Rc0Pxwaf0aXWyttQ',
    'r-attr-review-notes': 'k6_pWZzmIyk1Z2nTGjW7lQ',
    'r-attr-review-limit': 'IZz4eActXfrcP9kHSnCbqQ',
    'sv-org': 'gXKZHmZgcbfwQYiYhEQDug',
    'sv-admin': 'hPrdaZfedPOJYevSaGziHw',
    'sv-idea-active': 'wmRZaGDtUSWNiHXkRtNEaw',
    'sv-idea-in_review': 'VYkBekVqLcThVicOYKavxw',
    'sv-idea-sent_back': 'YSJfpGAURcQSzUriTXoNFQ',
    'sv-idea-approved': 'wKzUCwbYYMGqXKGBkcPOYQ',
    'sv-project-submitted': 'cxteqEVfPKIHJbejdMGiKg',
    'sv-project-approved': 'SYHlqlwIMByzTjdOQtthBg',
    'sv-project-approved-2': 'QLIfwcxVJKDAKiHKDfnYHg',
    'sv-obj-1': 'xdBYhCPAWxyDGvAcDqUqRQ',
    'sv-obj-2': 'hxTcfABePuHwIesNwTaaUw',
    'sv-obj-3': 'AASFZlHQWfSACqfEYmRdUA',
    'sv-obj-4': 'WdJUECTNJSqtbnOhCHgkHA',
    'sv-record-customer': 'tiCTXTJpucfZnFmVhCnxNQ',
    'sv-attr-1': 'rfjHNZVPxJTXVGqjdUOadw',
    'sv-attr-2': 'OVhTCkAgqemnHjwuyCzXXQ',
    'sv-state-record-customer': 'LfJTBBhUomIoYqHovgvGyg',
    'sv-flow': 'iIJEMvSRyXNRKCGyznqzKg',
    'sv-node-create': 'ooyusqKcASwwiFdUVSeZDA',
    'sv-node-capture': 'FOTkmfXreojfFnVFsMVjjQ',
    'sv-node-review': 'LqFfkqAiIoSsYCvAfoMRzg',
    'sv-node-archive': 'FtJYuxvWjXELQauJyqccTA',
    'sv-edge-begin': 'DhkrzvCMWyuRSiFrhLALag',
    'sv-edge-submit': 'HuHFVmFwIKPFyqXiOOPakw',
    'sv-edge-approve': 'qmOVFjBxLDHFvAiwNgYsxw',
    'sv-project-flow': 'sOtmunTjyTxVmXAodhjuiQ',
    'sv-state-flow': 'BZwnnLBsjRPSSFLzXMoAjQ',
    'sv-wo-capture': 'MEsFDqNoTJENaBnUGYwuKg',
    'sv-wo-review': 'TmlpSqmoAHvTRcfXbSxuEQ',
    'sv-wo-archive': 'XsgMKRoBlSNjQbtWuFoEog',
    'sv-wo-capture-move': 'mCNFKpGTDVysUSOQMHelDw',
    'sv-wo-review-move': 'UqWpSqnWTXLnfNEJywaZaQ',
    'sv-wo-archive-move': 'SUpDapOXlRpurVoHVfnNwA',
    'g-org-2': 'WlkfISpndVJfICRnWksipQ',
    'g-ai': 'NAWwhciBiPVcuqxjPhXwYA',
    'aa-project-submitted-state': 'TmbwzmMOyZTUZlDmxsptLQ',
    'aa-project-approved-state': 'pESwjYZlpOKtCfLKpGxLSw',
    'aa-project-approved-2-state': 'lNkxGTHMpZDysWQHzaFLpg',
    'b-project-submitted-state': 'ocufoWzLvfKNzEYiucdWlQ',
    'b-project-approved-state': 'HYSWdLUAUWqXbewpKVcLBQ',
    'b-project-approved-2-state': 'ZHiCwsFHpBhetUJLYbPhgA',
    'c-project-submitted-state': 'lFeSdSVRYYABtVtxVxVXWA',
    'c-project-approved-state': 'tmpUrNWAjViGNrBycHNUdw',
    'c-project-approved-2-state': 'psTaMMjrwPawYPoKVOZrWg',
    'd-project-submitted-state': 'ssvAAVJbPitNDVWlBVVGXg',
    'd-project-approved-state': 'BKDkbYJAeAFWwUiQgptGlQ',
    'd-project-approved-2-state': 'mzOpWXYdUFnalfaYwlDVlA',
    'e-project-submitted-state': 'xxvsxkSMOocjMRcIKZxNdA',
    'e-project-approved-state': 'bYSdHQqJMFMGnSxDRxDsIA',
    'e-project-approved-2-state': 'PpUcbCyWNOZewUxLSgxHyQ',
    'f-project-submitted-state': 'ZgztRdROQRqNZONLZeMFcg',
    'f-project-approved-state': 'ymoLkrVjPxObAizwbOJKUQ',
    'f-project-approved-2-state': 'uTAFrWXkOJimtjJrIEuypw',
    'f2-project-submitted-state': 'NkkwxHaABLcBYuEIVEXzgQ',
    'f2-project-approved-state': 'mOUdeMjkrzVOkrGTeyZahg',
    'f2-project-approved-2-state': 'hmLasBawRWsTYHaVOBOdwg',
    'fs-project-submitted-state': 'dBFarZGIylbgfJqzGUWzpw',
    'fs-project-approved-state': 'ZmnazvvKUFjAiHuXCcLayw',
    'fs-project-approved-2-state': 'yluFZOqUskxIxbDBMNgUlQ',
    'g-project-submitted-state': 'kTkMIcAOyrcSosYCYmNgdw',
    'g-project-approved-state': 'cdXozzKWLQMNCetkBTpDDA',
    'g-project-approved-2-state': 'iUOInITSSnCDlGdhxnbnXQ',
    'h-project-submitted-state': 'DlniBnzuZKLGUTRrcKhdbw',
    'h-project-approved-state': 'VFWrxbHsOrDNVxELUbSRhQ',
    'h-project-approved-2-state': 'uQJIPNXNvzsgkdACjiTtQA',
    'i-project-submitted-state': 'pFniAMyKkdchaxwOIpTzFQ',
    'i-project-approved-state': 'FPPXbRAFTvmxxZgrGouUEg',
    'i-project-approved-2-state': 'ZOpxNxMfXlTZlCTdJbvnGQ',
    'k-project-submitted-state': 'bIQfXXqfbMpDeBTlDfYDhA',
    'k-project-approved-state': 'CncNbMCOqKJLVLFddEGjcw',
    'k-project-approved-2-state': 'yBaQpUcjvckgFFJKVQqMHQ',
    'r-project-submitted-state': 'iZHMvKifqiulQHmABULFuQ',
    'r-project-approved-state': 'GOFgsNHVXxTGgyTsjLmLXw',
    'r-project-approved-2-state': 'FLhvamGQwczgjLSVQNvpDA',
    'sv-project-submitted-state': 'UgYEsWGUZozEatoKTnjwLg',
    'sv-project-approved-state': 'ZpvzzOazViNSjrLxSBFkrQ',
    'sv-project-approved-2-state': 'PUdAQZLiCBAGdLAsCKTWWg',
    'k-project-under-review': 'u5uYKcFeIzTHEurdXwtpWg',
    'k-project-under-review-2': '6T7eX-dXSmMtOGsKbOYNTQ',
    'k-project-under-review-state':
        'zQ6r2665iF_DuYIxVoP7wA',
    'k-project-under-review-2-state':
        'q4QUZSNifnMC38cHVJUO2Q'
};

export function sliceEntityId(
    composed: string,
): string {
    const id = SLICE_ENTITY_IDS[composed];
    if (id === undefined) {
        throw new Error(
            'no slice id for ' + composed,
        );
    }
    return id;
}

async function formTenantAdminMessagePairs(
    section: ParallelSection,
    requestAt: string,
): Promise<TenantAdminMessagePairs> {
    const token = sectionToken(section);
    const organizationId = sliceEntityId(
        token + '-org');
    const adminId = sliceEntityId(
        token + '-admin');
    const email = token
        + '-admin@test-plan.example';
    const piiBody = tenantAdminPiiBody(
        section + ' Admin',
        email,
    );
    const organizationMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'organizations/:id',
                organizationId,
            ),
            routePattern: 'organizations/:id',
            idParams: [organizationId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: organizationSeedBody(
                STARK_NAME,
                token + '.test-plan.example',
                daysFromNow(300, 0, 0),
            ),
        },
        requestAt,
    );
    const identityMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'identities/:id', adminId,
            ),
            routePattern: 'identities/:id',
            idParams: [adminId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
        },
        requestAt,
    );
    const piiMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'identities/:id/pii', adminId,
            ),
            routePattern: 'identities/:id/pii',
            idParams: [adminId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: piiBody,
        },
        requestAt,
    );
    const seatMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                adminId,
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [organizationId, adminId],
            organization: organizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
        },
        requestAt,
    );
    const defaultOrganizationMessagePair =
        await formDefaultOrganizationSeedMessagePair(
            adminId, organizationId, requestAt,
        );
    return {
        organizationId,
        adminId,
        email,
        requestAt,
        piiBody,
        organizationMessagePair,
        identityMessagePair,
        piiMessagePair,
        seatMessagePair,
        defaultOrganizationMessagePair,
    };
}

async function writeTenantAdmin(
    adapter: DbAdapter,
    formed: TenantAdminMessagePairs,
): Promise<void> {
    await Promise.all([
        appendMessagePair(
            adapter, formed.organizationMessagePair,
        ),
        postIdentityDocumentOp(
            adapter,
            formed.adminId,
            bootstrapCurrentIdentityBody(),
            SYSTEM_MEMBER_ID,
            formed.identityMessagePair,
        ),
        postIdentityPiiDocumentOp(
            adapter,
            formed.adminId,
            formed.piiBody,
            SYSTEM_MEMBER_ID,
            formed.piiMessagePair,
        ),
        postMembershipDocumentOp(
            adapter,
            formed.adminId,
            seatSeedBody(
                'admin', formed.requestAt,
            ),
            SYSTEM_MEMBER_ID,
            formed.seatMessagePair,
        ),
        appendMessagePair(
            adapter,
            formed.defaultOrganizationMessagePair,
        ),
    ]);
}

type ExtraIdentity = {
    readonly identityId: string;
    readonly requestAt: string;
    readonly piiBody: Record<string, unknown>;
    readonly identityMessagePair: MessagePair;
    readonly piiMessagePair: MessagePair;
    readonly seatMessagePair?: MessagePair;
};

type ExtraWrites = {
    readonly identities: readonly ExtraIdentity[];
    readonly organizationMessagePair?: MessagePair;
    readonly extraAdminSeat?: {
        readonly identityId: string;
        readonly requestAt: string;
        readonly messagePair: MessagePair;
    };
    readonly flow?: {
        readonly id: string;
        readonly body: Record<string, unknown>;
        readonly messagePair: MessagePair;
    };
    readonly ai?: {
        readonly id: string;
        readonly body: Record<string, unknown>;
        readonly messagePair: MessagePair;
    };
};

async function formExtraIdentity(
    identityId: string,
    name: string,
    email: string,
    requestAt: string,
    seatOrganizationId?: string,
): Promise<ExtraIdentity> {
    const piiBody = tenantAdminPiiBody(name, email);
    const identityMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'identities/:id', identityId,
            ),
            routePattern: 'identities/:id',
            idParams: [identityId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: bootstrapCurrentIdentityBody(),
        },
        requestAt,
    );
    const piiMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'identities/:id/pii', identityId,
            ),
            routePattern: 'identities/:id/pii',
            idParams: [identityId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: piiBody,
        },
        requestAt,
    );
    if (seatOrganizationId === undefined) {
        return {
            identityId,
            requestAt,
            piiBody,
            identityMessagePair,
            piiMessagePair,
        };
    }
    const seatMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                identityId,
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [
                seatOrganizationId, identityId,
            ],
            organization: seatOrganizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('member', requestAt),
        },
        requestAt,
    );
    return {
        identityId,
        requestAt,
        piiBody,
        identityMessagePair,
        piiMessagePair,
        seatMessagePair,
    };
}

async function formBExtras(
    organizationId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const identity = await formExtraIdentity(
        'VbxXtvAkgQzhoXQZkbnHVg',
        'B Member',
        'b-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const flowBody = {
        ...flowOrg2SeedBody(),
        organization_id: organizationId,
        name: 'B Return Flow',
    };
    const flowMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows/:id', 'UXOPfjdZZohCcyCLlQWnuQ'),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, 'UXOPfjdZZohCcyCLlQWnuQ'],
            organization: organizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: flowBody,
        },
        requestAt,
    );
    return {
        identities: [identity],
        flow: {
            id: 'UXOPfjdZZohCcyCLlQWnuQ',
            body: flowBody,
            messagePair: flowMessagePair,
        },
    };
}

async function formGExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const secondOrganizationId = 'WlkfISpndVJfICRnWksipQ';
    const organizationMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'organizations/:id',
                secondOrganizationId,
            ),
            routePattern: 'organizations/:id',
            idParams: [secondOrganizationId],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: organizationSeedBody(
                'Wayne Enterprises',
                'g2.test-plan.example',
                daysFromNow(300, 0, 0),
            ),
        },
        requestAt,
    );
    const extraAdminSeatMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
                adminId + '-1',
            ),
            routePattern:
                ORGANIZATION_MEMBER_DETAIL_PATTERN,
            idParams: [
                secondOrganizationId, adminId,
            ],
            organization: secondOrganizationId,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: seatSeedBody('admin', requestAt),
        },
        requestAt,
    );
    const unseated = await formExtraIdentity(
        'dtmZgnDBlVcoyjxKzlaKgA',
        'G Unseated',
        'g-unseated@test-plan.example',
        requestAt,
    );
    const member = await formExtraIdentity(
        'dmGzDTZwsyIYCQhhRISXrw',
        'G Member',
        'g-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const erasable = await formExtraIdentity(
        'qbtQzOgP8OTJSr9Idicllg',
        'G Erasable',
        'g-erasable@test-plan.example',
        requestAt,
        organizationId,
    );
    const firstAi = buildAiMembers()[0]!;
    const aiBody: Record<string, unknown> = {
        name: firstAi.name,
        description: firstAi.description,
        skill_focus: firstAi.skill_focus,
        model: firstAi.model,
    };
    const aiMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'ai-agents/:id',
                'NAWwhciBiPVcuqxjPhXwYA',
            ),
            routePattern: 'ai-agents/:id',
            idParams: ['NAWwhciBiPVcuqxjPhXwYA'],
            organization: undefined,
            requesterIdentityId: SYSTEM_MEMBER_ID,
            body: aiBody,
        },
        requestAt,
    );
    return {
        identities: [unseated, member, erasable],
        organizationMessagePair,
        extraAdminSeat: {
            identityId: adminId,
            requestAt,
            messagePair: extraAdminSeatMessagePair,
        },
        ai: {
            id: 'NAWwhciBiPVcuqxjPhXwYA',
            body: aiBody,
            messagePair: aiMessagePair,
        },
    };
}

async function formSvExtras(
    organizationId: string,
    requestAt: string,
): Promise<ExtraWrites> {
    const identity = await formExtraIdentity(
        'uVgzITlKxKcWZtGSPzmsqA',
        'SV Member',
        'sv-member@test-plan.example',
        requestAt,
        organizationId,
    );
    return { identities: [identity] };
}

type F2FlowWrites = {
    readonly flowId: string;
    readonly body: Record<string, unknown>;
    readonly operation: MessagePair;
    readonly document: MessagePair;
    readonly recordBody: Record<string, unknown>;
    readonly recordMessagePairs: RecordWriteMessagePairs;
    readonly bindingId: string;
    readonly bindingBody: Record<string, unknown>;
    readonly bindingMessagePair: MessagePair;
    readonly instanceMessagePair: MessagePair;
};

async function formF2Extras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<F2FlowWrites> {
    const token = 'f2';
    const flowId = sliceEntityId(token + '-flow');
    const createNodeId = sliceEntityId(
        token + '-node-create',
    );
    const captureNodeId = sliceEntityId(
        token + '-node-capture',
    );
    const archiveNodeId = sliceEntityId(
        token + '-node-archive',
    );
    const reviewNodeId = sliceEntityId(
        token + '-node-review',
    );
    const recordId = sliceEntityId(
        token + '-record-customer',
    );
    const attr1Id = sliceEntityId(token + '-attr-1');
    const attr2Id = sliceEntityId(token + '-attr-2');
    const bindingId = sliceEntityId(
        token + '-flow-record',
    );
    const profile = buildRecords()[0]!;
    const formedRecord =
        await formRecordBindingMessagePairs({
            organizationId,
            adminId,
            requestAt,
            recordId,
            attributes: [
                {
                    id: attr1Id,
                    name: 'Company Name',
                    attribute_type: 'text',
                    sort_order: 1,
                    options: [],
                    constraints: [],
                },
                {
                    id: attr2Id,
                    name: 'Industry',
                    attribute_type: 'select',
                    sort_order: 2,
                    options: ['Technology'],
                    constraints: [],
                },
            ],
            flowId,
            bindingId,
            recordName: profile.name,
            recordDescription: profile.description,
            recordPosition: profile.position,
            initialStateEventId: sliceEntityId(
                token + '-state-record-customer',
            ),
        });
    const graph: Record<string, unknown> = {
        nodes: [
            {
                id: createNodeId,
                name: 'Create',
                positionX: 40,
                positionY: 30,
                isCreate: true,
                isArchive: false,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
            {
                id: captureNodeId,
                name: 'Capture',
                positionX: 260,
                positionY: 140,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [
                    {
                        attribute_id: attr1Id,
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attribute_id: attr2Id,
                        mode: 'editable',
                        isRequired: true,
                    },
                ],
            },
            {
                id: reviewNodeId,
                name: 'Review',
                positionX: 480,
                positionY: 250,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [
                    {
                        attribute_id: attr1Id,
                        mode: 'readonly',
                        isRequired: false,
                    },
                    {
                        attribute_id: attr2Id,
                        mode: 'readonly',
                        isRequired: false,
                    },
                ],
            },
            {
                id: archiveNodeId,
                name: 'Archive',
                positionX: 680,
                positionY: 370,
                isCreate: false,
                isArchive: true,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: sliceEntityId(
                    token + '-edge-begin',
                ),
                name: 'begin',
                fromNodeId: createNodeId,
                toNodeId: captureNodeId,
            },
            {
                id: sliceEntityId(token + '-edge-submit'),
                name: 'submit',
                fromNodeId: captureNodeId,
                toNodeId: reviewNodeId,
            },
            {
                id: sliceEntityId(token + '-edge-approve'),
                name: 'approve',
                fromNodeId: reviewNodeId,
                toNodeId: archiveNodeId,
            },
        ],
    };
    const relations = buildFlowGraphRelations(
        [{ id: flowId, graph }],
        requestAt,
    );
    const nodeIds = new Set(
        relations.nodes.map((n) => n.id),
    );
    const flowBody: Record<string, unknown> = {
        id: flowId,
        flow: {
            organization_id: organizationId,
            name: 'WB Test Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId: sliceEntityId(
            token + '-project-flow',
        ),
        projectFlow: {
            project_id: sliceEntityId(
                token + '-project-approved',
            ),
            flow_id: flowId,
            at: requestAt,
        },
        initialState: 'active',
        initialStateEventId: sliceEntityId(
            token + '-state-flow',
        ),
        initialStateAt: requestAt,
        graphDelta: {
            nodes: relations.nodes,
            edges: relations.edges,
            deletions: [],
            memberEvents: relations.members.filter(
                (row) => nodeIds.has(
                    row.flow_node_id,
                ),
            ),
            attributeEvents:
                relations.attributes.filter(
                    (row) => nodeIds.has(
                        row.flow_node_id,
                    ),
                ),
        },
    };
    const validated =
        validateFlowCreateBody(flowBody);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows', flowId),
            routePattern:
                'organizations/:id/flows/',
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowBody,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows/:id', flowId),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, flowId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowCreateDocumentBody(
                validated,
            ),
        },
        requestAt,
    );
    const instanceId = sliceEntityId(
        token + '-instance-1',
    );
    const instanceRouteSegments =
        INSTANCE_DETAIL_PATTERN.split('/');
    const instancePathSegments = [
        'organizations', organizationId,
        'record-types', recordId,
        'instances', instanceId,
    ];
    const instanceMessagePair =
        await formWriteMessagePair({
            method: 'PUT',
            pathname: '/'
                + instancePathSegments.join('/'),
            routePattern:
                INSTANCE_DETAIL_PATTERN,
            routeSegments: instanceRouteSegments,
            pathSegments: instancePathSegments,
            headerFields: [],
            body: { values: [] },
            requesterIdentityId: adminId,
            requestAt,
            organization: organizationId,
            responseStatus: HTTP_OK,
            responseBody: { values: [] },
            operationId: generateIdentifier(),
        });
    return {
        flowId, body: flowBody, operation, document,
        recordBody: formedRecord.body,
        recordMessagePairs: formedRecord.messagePairs,
        bindingId,
        bindingBody: formedRecord.bindingBody,
        bindingMessagePair:
            formedRecord.bindingMessagePair,
        instanceMessagePair,
    };
}

type FFlowWrites = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: FlowCreationMessagePairs;
};

type CScoreFields = {
    readonly project_id: string;
    readonly objective_id: string;
    readonly score: number;
    readonly member_id: string;
    readonly at: string;
};

type CScoreRow = {
    readonly id: string;
    readonly fields: CScoreFields;
    readonly messagePair: MessagePair;
};

type CScoreWrites = {
    readonly baselines: readonly CScoreRow[];
    readonly actuals: readonly CScoreRow[];
};

async function formCExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<CScoreWrites> {
    const projectTemplate = buildProjects()[0]!;
    const projects = [
        sliceEntityId('c-project-approved'),
        sliceEntityId('c-project-approved-2'),
    ].map((id) => ({
        id,
        organization_id: organizationId,
        start_date: projectTemplate.start_date,
        state: 'approved',
    }));
    const pools = new Map([
        [organizationId, [adminId]],
    ]);
    const objectives = OBJECTIVE_SEEDS.map(
        (_, i) => ({
            id: sliceEntityId(
                'c-obj-' + (i + 1)),
        }),
    );
    const baselines: CScoreRow[] = [];
    const actuals: CScoreRow[] = [];
    for (const p of projects) {
        const baselineCoverage =
            objectives.length;
        const baselineStart =
            new Date(p.start_date).getTime();
        const baselineMin = 0;
        for (let i = 0; i < baselineCoverage; i++) {
            const obj = objectives[i]!;
            const score = deterministicScore(
                seedHashKey(p.id) + ':'
                    + seedHashKey(obj.id)
                    + ':baseline',
                baselineMin,
                100,
            );
            const scoredAt = isoFromMs(
                baselineStart + i * 1000,
            );
            const fields = {
                project_id: p.id,
                objective_id: obj.id,
                score,
                member_id: pickHumanMember(
                    pools, p.organization_id,
                    seedHashKey(p.id) + ':'
                        + seedHashKey(obj.id)
                        + ':baseline',
                ),
                at: scoredAt,
            };
            const id = `${p.id}:${obj.id}:${scoredAt}`;
            const messagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'projects/:id/'
                                + 'objective-baseline'
                                + '-scores/:sid',
                            id,
                        ),
                        routePattern:
                            'organizations/:id'
                                + '/projects/:id'
                                + '/objective-baseline'
                                + '-scores/:sid',
                        idParams: [
                            organizationId,
                            p.id,
                            id,
                        ],
                        organization:
                            organizationId,
                        requesterIdentityId:
                            fields.member_id,
                        body: fields,
                    },
                    requestAt,
                );
            baselines.push({
                id, fields, messagePair,
            });
        }
        const minActuals = 1;
        const baseActualTime =
            baselineStart + MS_PER_DAY;
        for (
            let i = 0; i < objectives.length; i++
        ) {
            const obj = objectives[i]!;
            const nActuals =
                minActuals
                + deterministicScore(
                    seedHashKey(p.id) + ':'
                        + seedHashKey(obj.id)
                        + ':nactual',
                    0,
                    2,
                );
            for (let k = 0; k < nActuals; k++) {
                const score = deterministicScore(
                    seedHashKey(p.id) + ':'
                        + seedHashKey(obj.id)
                        + ':actual:' + k,
                    -100,
                    100,
                );
                const scoredAt = isoFromMs(
                    baseActualTime
                        + (i * 10 + k) * 1000,
                );
                const fields = {
                    project_id: p.id,
                    objective_id: obj.id,
                    score,
                    member_id: pickHumanMember(
                        pools, p.organization_id,
                        seedHashKey(p.id) + ':'
                            + seedHashKey(obj.id)
                            + ':actual:' + k,
                    ),
                    at: scoredAt,
                };
                const id =
                    `${p.id}:${obj.id}:${scoredAt}`;
                const messagePair =
                    await formSeedMessagePair(
                        {
                            key: seedMessagePairKey(
                                'projects/:id/'
                                    + 'objective-actual'
                                    + '-scores/:sid',
                                id,
                            ),
                            routePattern:
                                'organizations/:id'
                                    + '/projects/:id'
                                    + '/objective-actual'
                                    + '-scores/:sid',
                            idParams: [
                                organizationId,
                                p.id,
                                id,
                            ],
                            organization:
                                organizationId,
                            requesterIdentityId:
                                fields.member_id,
                            body: fields,
                        },
                        requestAt,
                    );
                actuals.push({
                    id, fields, messagePair,
                });
            }
        }
    }
    return { baselines, actuals };
}

type KReviewWrites = {
    readonly projects: readonly GardenProject[];
    readonly baselines: readonly CScoreRow[];
};

const K_UNDER_REVIEW_HIGH_SCORE = 90;
const K_UNDER_REVIEW_LOW_SCORE = 10;
const K_APPROVED_BASELINE_SCORE = 50;

async function formKExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<KReviewWrites> {
    const projectTemplate = buildProjects()[0]!;
    const reviews = [
        {
            suffix: 'under-review',
            score: K_UNDER_REVIEW_HIGH_SCORE,
        },
        {
            suffix: 'under-review-2',
            score: K_UNDER_REVIEW_LOW_SCORE,
        },
    ] as const;
    const objectives = OBJECTIVE_SEEDS.map(
        (_, i) => ({
            id: sliceEntityId('k-obj-' + (i + 1)),
        }),
    );
    const projects: GardenProject[] = [];
    const baselines: CScoreRow[] = [];
    let projectPosition = PROJECT_GARDEN.length + 1;
    for (const review of reviews) {
        const id = sliceEntityId(
            'k-project-' + review.suffix,
        );
        const project = {
            ...projectTemplate,
            id,
            title: projectTemplate.title
                + ' (' + review.suffix + ')',
            position: projectPosition,
        };
        projectPosition += 1;
        const event: StateEntity = {
            id: sliceEntityId(
                'k-project-' + review.suffix + '-state',
            ),
            entity_id: id,
            member_id: adminId,
            at: requestAt,
            state: 'under_review',
        };
        const body = projectSeedBody(
            project, event, organizationId,
        );
        const messagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey('projects', id),
                routePattern:
                    'organizations/:id/projects/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        projects.push({ id, body, messagePair });
        const baselineStart =
            new Date(project.start_date).getTime();
        for (let i = 0; i < objectives.length; i++) {
            const obj = objectives[i]!;
            const scoredAt = isoFromMs(
                baselineStart + i * MS_PER_SECOND,
            );
            const fields = {
                project_id: id,
                objective_id: obj.id,
                score: review.score,
                member_id: adminId,
                at: scoredAt,
            };
            const scoreId =
                `${id}:${obj.id}:${scoredAt}`;
            const scoreMessagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'projects/:id/'
                                + 'objective-baseline'
                                + '-scores/:sid',
                            scoreId,
                        ),
                        routePattern:
                            'organizations/:id'
                                + '/projects/:id'
                                + '/objective-baseline'
                                + '-scores/:sid',
                        idParams: [
                            organizationId,
                            id,
                            scoreId,
                        ],
                        organization:
                            organizationId,
                        requesterIdentityId: adminId,
                        body: fields,
                    },
                    requestAt,
                );
            baselines.push({
                id: scoreId,
                fields,
                messagePair: scoreMessagePair,
            });
        }
    }
    const approvedId = sliceEntityId('k-project-approved');
    const approvedStart =
        new Date(projectTemplate.start_date).getTime();
    for (let i = 0; i < objectives.length; i++) {
        const obj = objectives[i]!;
        const scoredAt = isoFromMs(
            approvedStart + i * MS_PER_SECOND,
        );
        const fields = {
            project_id: approvedId,
            objective_id: obj.id,
            score: K_APPROVED_BASELINE_SCORE,
            member_id: adminId,
            at: scoredAt,
        };
        const scoreId =
            `${approvedId}:${obj.id}:${scoredAt}`;
        const scoreMessagePair =
            await formSeedMessagePair(
                {
                    key: seedMessagePairKey(
                        'projects/:id/'
                            + 'objective-baseline'
                            + '-scores/:sid',
                        scoreId,
                    ),
                    routePattern:
                        'organizations/:id'
                            + '/projects/:id'
                            + '/objective-baseline'
                            + '-scores/:sid',
                    idParams: [
                        organizationId,
                        approvedId,
                        scoreId,
                    ],
                    organization: organizationId,
                    requesterIdentityId: adminId,
                    body: fields,
                },
                requestAt,
            );
        baselines.push({
            id: scoreId,
            fields,
            messagePair: scoreMessagePair,
        });
    }
    return { projects, baselines };
}

type RExtras = {
    readonly member: ExtraIdentity;
    readonly record: {
        readonly body: Record<string, unknown>;
        readonly messagePairs:
            RecordWriteMessagePairs;
    };
    readonly attributePuts: readonly MessagePair[];
    readonly instanceMessagePair: MessagePair;
    readonly binding: {
        readonly organizationId: string;
        readonly workOrderId: string;
        readonly body: Record<string, unknown>;
        readonly messagePair: MessagePair;
    };
};

// The R21 subject: a second R record type carrying two
// explicit-ACL attributes, seeded as an operator would
// write it today — create an empty type, PUT an
// attribute, PUT an attribute (three operation ids).
// Roles are spelled, never stamped. Customer Profile
// cannot host this: R16–R20 edit it, and the composed
// edit path is R21's very subject.
async function formRExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<RExtras> {
    const member = await formExtraIdentity(
        sliceEntityId('r-member'),
        'R Member',
        'r-member@test-plan.example',
        requestAt,
        organizationId,
    );
    const recordId =
        sliceEntityId('r-record-review');
    const body: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: 'Account Review',
            description:
                'ACL projection subject (R21);'
                + ' no case edits it.',
            position: 2,
        },
        attributes: [],
        initialState: 'active',
        initialStateEventId:
            sliceEntityId('r-state-record-review'),
        initialStateAt: requestAt,
    };
    const validated = validateRecordWriteBody(body);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(validated),
        },
        requestAt,
    );
    const attributeRows = [
        {
            id: sliceEntityId(
                'r-attr-review-notes',
            ),
            body: {
                name: 'Owner Notes',
                attribute_type: 'text',
                sort_order: 1,
                options: [],
                constraints: [],
                read_roles: [
                    ...DEFAULT_ATTRIBUTE_ACL_ROLES,
                ],
                write_roles: ['admin'],
            },
        },
        {
            id: sliceEntityId(
                'r-attr-review-limit',
            ),
            body: {
                name: 'Credit Limit',
                attribute_type: 'text',
                sort_order: 2,
                options: [],
                constraints: [],
                read_roles: ['admin'],
                write_roles: ['admin'],
            },
        },
    ];
    const attributePuts: MessagePair[] = [];
    for (const row of attributeRows) {
        attributePuts.push(
            await formSeedMessagePair(
                {
                    key: seedMessagePairKey(
                        ATTRIBUTE_DETAIL_PATTERN,
                        row.id,
                    ),
                    routePattern:
                        ATTRIBUTE_DETAIL_PATTERN,
                    idParams: [
                        organizationId,
                        recordId,
                        row.id,
                    ],
                    organization: organizationId,
                    requesterIdentityId: adminId,
                    body: row.body,
                },
                requestAt,
            ),
        );
    }
    // The R14 subject: #r1 binds to this empty Customer
    // Profile instance. Unbound, the Data Capture inputs
    // are disabled (WB10b) and a value-bearing submit
    // 400s — the F2 genesis shape, one operation id.
    const instanceId = sliceEntityId('r-instance-1');
    const customerRecordId = sliceEntityId(
        'r-record-customer',
    );
    const instanceRouteSegments =
        INSTANCE_DETAIL_PATTERN.split('/');
    const instancePathSegments = [
        'organizations', organizationId,
        'record-types', customerRecordId,
        'instances', instanceId,
    ];
    const instanceMessagePair =
        await formWriteMessagePair({
            method: 'PUT',
            pathname: '/'
                + instancePathSegments.join('/'),
            routePattern:
                INSTANCE_DETAIL_PATTERN,
            routeSegments: instanceRouteSegments,
            pathSegments: instancePathSegments,
            headerFields: [],
            body: { values: [] },
            requesterIdentityId: adminId,
            requestAt,
            organization: organizationId,
            responseStatus: HTTP_OK,
            responseBody: { values: [] },
            operationId: generateIdentifier(),
        });
    // Bound through the route's own op so the seed
    // cannot drift from the gate (the mock's shape).
    const workOrderId = sliceEntityId('r-wo-capture');
    const bindingBody: Record<string, unknown> = {
        instance_id: instanceId,
        record_type_id: customerRecordId,
    };
    const bindingMessagePair =
        await formWriteMessagePair({
            method: 'PUT',
            pathname:
                '/organizations/' + organizationId
                + '/work-orders/' + workOrderId
                + '/binding',
            routePattern:
                'organizations/:id/work-orders/:id'
                + '/binding',
            routeSegments: [
                'organizations', ':id',
                'work-orders', ':id', 'binding',
            ],
            pathSegments: [
                'organizations', organizationId,
                'work-orders', workOrderId, 'binding',
            ],
            headerFields: [],
            body: bindingBody,
            requesterIdentityId: adminId,
            requestAt,
            organization: organizationId,
            responseStatus: HTTP_NO_CONTENT,
            responseBody: undefined,
            operationId: generateIdentifier(),
        });
    return {
        member,
        record: {
            body,
            messagePairs: {
                operation,
                document,
                attributePuts: [],
                attributeDeletes: [],
            },
        },
        attributePuts,
        instanceMessagePair,
        binding: {
            organizationId,
            workOrderId,
            body: bindingBody,
            messagePair: bindingMessagePair,
        },
    };
}

type AaRecordWrites = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: RecordWriteMessagePairs;
};

// AA33/AA34's fixture: the Customer Profile record
// with three text attributes, so the flow-state
// Attributes picker has options once AA33 binds the
// record via the designer header's "Record:" dropdown.
// No flow binding — AA's flow is minted in the UI at
// AA26, so its id does not exist at seed time.
async function formAaRecord(
    requestAt: string,
): Promise<AaRecordWrites> {
    const organizationId = STARK_ORGANIZATION;
    const adminId = 'XXZruirZyAOoRpNxaDnpSA';
    const recordId =
        sliceEntityId('aa-record-customer');
    const attributeRows = [
        {
            id: sliceEntityId('aa-attr-1'),
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
        {
            id: sliceEntityId('aa-attr-2'),
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
        {
            id: sliceEntityId('aa-attr-3'),
            name: 'Contact Phone',
            attribute_type: 'text',
            sort_order: 3,
            options: [],
            constraints: [],
            record_id: recordId,
            organization_id: organizationId,
        },
    ];
    const body: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: 'Customer Profile',
            description:
                'AA33/AA34 attribute-picker'
                + ' fixture; no case edits it.',
            position: 1,
        },
        attributes: attributeRows,
        initialState: 'active',
        initialStateEventId: sliceEntityId(
            'aa-state-record-customer',
        ),
        initialStateAt: requestAt,
    };
    const validated = validateRecordWriteBody(body);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN,
                recordId,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(validated),
        },
        requestAt,
    );
    const attributePuts: MessagePair[] = [];
    for (const attribute of attributeRows) {
        attributePuts.push(await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    ATTRIBUTE_DETAIL_PATTERN,
                    attribute.id,
                ),
                routePattern:
                    ATTRIBUTE_DETAIL_PATTERN,
                idParams: [
                    organizationId,
                    recordId,
                    attribute.id,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: recordAttributeDocumentBodyOf(
                    attribute as unknown as
                        Record<string, unknown>,
                ),
            },
            requestAt,
        ));
    }
    return {
        body,
        messagePairs: {
            operation,
            document,
            attributePuts,
            attributeDeletes: [],
        },
    };
}

async function formFExtras(
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<FFlowWrites> {
    const layout = buildFlows().find((flow) =>
        flow.name
            === 'Layout Test: Proposal Review Cycle',
    );
    if (layout === undefined) {
        throw new Error(
            'no Layout Test flow in buildFlows',
        );
    }
    const flowId = sliceEntityId('f-layout-flow');
    const projectId = sliceEntityId(
        'f-project-approved-2',
    );
    const projectFlowId = sliceEntityId(
        'f-layout-project-flow',
    );
    const relations = buildFlowGraphRelations(
        [{ id: flowId, graph: layout.graph }],
        requestAt,
    );
    const nodeIds = new Set(
        relations.nodes.map((node) => node.id),
    );
    const flowBody: Record<string, unknown> = {
        id: flowId,
        flow: {
            organization_id: organizationId,
            name: layout.name,
            is_locked: layout.is_locked,
            is_auto_layout: layout.is_auto_layout,
            is_auto_fit: layout.is_auto_fit,
            lock_timeout: layout.lock_timeout,
        },
        projectFlowId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: requestAt,
        },
        initialState: 'active',
        initialStateEventId: sliceEntityId(
            'f-layout-state',
        ),
        initialStateAt: requestAt,
        graphDelta: {
            nodes: relations.nodes,
            edges: relations.edges,
            deletions: [],
            memberEvents: relations.members.filter(
                (row) => nodeIds.has(
                    row.flow_node_id,
                ),
            ),
            attributeEvents:
                relations.attributes.filter(
                    (row) => nodeIds.has(
                        row.flow_node_id,
                    ),
                ),
        },
    };
    const validated =
        validateFlowCreateBody(flowBody);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows', flowId),
            routePattern:
                'organizations/:id/flows/',
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowBody,
        },
        requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'flows/:id', flowId,
            ),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, flowId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowCreateDocumentBody(
                validated,
            ),
        },
        requestAt,
    );
    const join = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'projects/:id/flows/:pfid',
                projectFlowId,
            ),
            routePattern:
                'organizations/:id/projects/:id'
                + '/flows/:pfid',
            idParams: [
                organizationId,
                projectId,
                projectFlowId,
            ],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: validated.projectFlow,
        },
        requestAt,
    );
    return {
        body: flowBody,
        messagePairs: { operation, document, join },
    };
}

async function writeExtraIdentity(
    adapter: DbAdapter,
    formed: ExtraIdentity,
): Promise<void> {
    const writes: Promise<unknown>[] = [
        postIdentityDocumentOp(
            adapter,
            formed.identityId,
            bootstrapCurrentIdentityBody(),
            SYSTEM_MEMBER_ID,
            formed.identityMessagePair,
        ),
        postIdentityPiiDocumentOp(
            adapter,
            formed.identityId,
            formed.piiBody,
            SYSTEM_MEMBER_ID,
            formed.piiMessagePair,
        ),
    ];
    if (formed.seatMessagePair !== undefined) {
        writes.push(postMembershipDocumentOp(
            adapter,
            formed.identityId,
            seatSeedBody('member', formed.requestAt),
            SYSTEM_MEMBER_ID,
            formed.seatMessagePair,
        ));
    }
    await Promise.all(writes);
}

async function writeExtras(
    adapter: DbAdapter,
    extras: ExtraWrites,
): Promise<void> {
    const writes: Promise<unknown>[] =
        extras.identities.map((identity) =>
            writeExtraIdentity(adapter, identity),
        );
    if (extras.organizationMessagePair !== undefined) {
        writes.push(appendMessagePair(
            adapter, extras.organizationMessagePair,
        ));
    }
    if (extras.extraAdminSeat !== undefined) {
        writes.push(postMembershipDocumentOp(
            adapter,
            extras.extraAdminSeat.identityId,
            seatSeedBody(
                'admin',
                extras.extraAdminSeat.requestAt,
            ),
            SYSTEM_MEMBER_ID,
            extras.extraAdminSeat.messagePair,
        ));
    }
    if (extras.flow !== undefined) {
        writes.push(postFlowDocumentOp(
            adapter,
            extras.flow.id,
            extras.flow.body,
            SYSTEM_MEMBER_ID,
            extras.flow.messagePair,
        ));
    }
    if (extras.ai !== undefined) {
        writes.push(postAiAgentDocumentOp(
            adapter,
            extras.ai.id,
            extras.ai.body,
            SYSTEM_MEMBER_ID,
            extras.ai.messagePair,
        ));
    }
    await Promise.all(writes);
}

const GARDEN_SECTIONS = [
    'C', 'D', 'E', 'F', 'FS', 'K', 'R',
] as const;

const IDEA_GARDEN_STATES = [
    'active',
    'in_review',
    'sent_back',
    'approved',
] as const;

const PROJECT_GARDEN = [
    { suffix: 'submitted', state: 'submitted' },
    { suffix: 'approved', state: 'approved' },
    { suffix: 'approved-2', state: 'approved' },
] as const;

const WORK_ORDER_GARDEN = [
    { suffix: 'capture', node: 'capture', position: 1 },
    { suffix: 'review', node: 'review', position: 2 },
    { suffix: 'archive', node: 'archive', position: 3 },
] as const;

const FS_WORKLOAD_SEED = 0x4653;
const FS_OLDEST_DAYS_AGO = 20;
const FS_NEWEST_DAYS_AGO = 3;
const FS_WORK_ORDER_COUNT = 12;

type GardenIdea = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly messagePair: MessagePair;
    readonly submissionId: string;
    readonly submissionBody:
        Record<string, unknown>;
    readonly submissionMessagePair: MessagePair;
};

type GardenProject = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly messagePair: MessagePair;
};

type GardenObjective = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: ObjectiveCreationMessagePairs;
};

type GardenRecord = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: RecordWriteMessagePairs;
    readonly bindingId: string;
    readonly bindingBody: Record<string, unknown>;
    readonly bindingMessagePair: MessagePair;
};

type GardenFlow = {
    readonly body: Record<string, unknown>;
    readonly messagePairs: FlowCreationMessagePairs;
};

type GardenWorkOrder = {
    readonly id: string;
    readonly body: Record<string, unknown>;
    readonly messagePair: MessagePair;
    readonly joinId: string;
    readonly joinBody: Record<string, unknown>;
    readonly joinMessagePair: MessagePair;
    readonly transitions: readonly {
        readonly body: Record<string, unknown>;
        readonly messagePair: MessagePair;
    }[];
};

type GardenWrites = {
    readonly ideas: readonly GardenIdea[];
    readonly projects: readonly GardenProject[];
    readonly objectives: readonly GardenObjective[];
    readonly record: GardenRecord;
    readonly flow: GardenFlow;
    readonly workOrders: readonly GardenWorkOrder[];
};

async function formRecordBindingMessagePairs(
    args: {
        readonly organizationId: string;
        readonly adminId: string;
        readonly requestAt: string;
        readonly recordId: string;
        readonly attributes: readonly {
            readonly id: string;
            readonly name: string;
            readonly attribute_type: string;
            readonly sort_order: number;
            readonly options: readonly string[];
            readonly constraints: readonly unknown[];
        }[];
        readonly flowId: string;
        readonly bindingId: string;
        readonly recordName: string;
        readonly recordDescription: string;
        readonly recordPosition: number;
        readonly initialStateEventId: string;
    },
): Promise<{
    readonly body: Record<string, unknown>;
    readonly messagePairs: RecordWriteMessagePairs;
    readonly bindingBody: Record<string, unknown>;
    readonly bindingMessagePair: MessagePair;
}> {
    const attributeRows = args.attributes.map(
        (attribute) => ({
            ...attribute,
            record_id: args.recordId,
            organization_id: args.organizationId,
        }),
    );
    const body: Record<string, unknown> = {
        kind: 'create',
        id: args.recordId,
        record: {
            organization_id: args.organizationId,
            name: args.recordName,
            description: args.recordDescription,
            position: args.recordPosition,
        },
        attributes: attributeRows,
        initialState: 'active',
        initialStateEventId: args.initialStateEventId,
        initialStateAt: args.requestAt,
    };
    const validated = validateRecordWriteBody(body);
    const operation = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPES_COLLECTION_PATTERN,
                args.recordId,
            ),
            routePattern:
                RECORD_TYPES_COLLECTION_PATTERN,
            idParams: [args.organizationId],
            op: true,
            organization: args.organizationId,
            requesterIdentityId: args.adminId,
            body,
        },
        args.requestAt,
    );
    const document = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN,
                args.recordId,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [
                args.organizationId, args.recordId,
            ],
            organization: args.organizationId,
            requesterIdentityId: args.adminId,
            body: recordDocumentBodyOf(validated),
        },
        args.requestAt,
    );
    const attributePuts: MessagePair[] = [];
    for (const attribute of attributeRows) {
        attributePuts.push(await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    ATTRIBUTE_DETAIL_PATTERN,
                    attribute.id,
                ),
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
                idParams: [
                    args.organizationId,
                    args.recordId,
                    attribute.id,
                ],
                organization: args.organizationId,
                requesterIdentityId: args.adminId,
                body: recordAttributeDocumentBodyOf(
                    attribute as unknown as
                        Record<string, unknown>,
                ),
            },
            args.requestAt,
        ));
    }
    const bindingBody = flowRecordJoinSeedBody({
        id: args.bindingId,
        flow_id: args.flowId,
        record_id: args.recordId,
        at: args.requestAt,
    });
    const bindingMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'flows/:id/records/:frid',
                args.bindingId,
            ),
            routePattern:
                'organizations/:id/flows/:id'
                + '/records/:frid',
            idParams: [
                args.organizationId,
                args.flowId,
                args.bindingId,
            ],
            organization: args.organizationId,
            requesterIdentityId: args.adminId,
            body: bindingBody,
        },
        args.requestAt,
    );
    return {
        body,
        messagePairs: {
            operation,
            document,
            attributePuts,
            attributeDeletes: [],
        },
        bindingBody,
        bindingMessagePair,
    };
}

async function formGarden(
    token: string,
    organizationId: string,
    adminId: string,
    requestAt: string,
): Promise<GardenWrites> {
    const ideaTemplate = buildIdeas()[0]!;
    const {
        id: _ideaId,
        title: ideaTitle,
        ...ideaFields
    } = ideaTemplate;
    const ideas: GardenIdea[] = [];
    for (const [i, state] of IDEA_GARDEN_STATES.entries()) {
        const id = sliceEntityId(token + '-idea-' + state);
        const body: Record<string, unknown> = {
            ...ideaFields,
            title: ideaTitle + ' (' + state + ')',
            organization_id: organizationId,
            state,
            position: i + 1,
        };
        const messagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey('ideas', id),
                routePattern:
                    'organizations/:id/ideas/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        const submissionId = sliceEntityId(
            token + '-idea-' + state + '-submission',
        );
        const submissionBody = {
            idea_id: id,
            member_id: adminId,
            at: requestAt,
        };
        const submissionMessagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'idea-submissions', submissionId,
                ),
                routePattern:
                    'organizations/:id/ideas/:id'
                    + '/submissions/:sid',
                idParams: [
                    organizationId, id, submissionId,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: submissionBody,
            },
            requestAt,
        );
        ideas.push({
            id, body, messagePair,
            submissionId, submissionBody,
            submissionMessagePair,
        });
    }
    const projectTemplate = buildProjects()[0]!;
    const projects: GardenProject[] = [];
    let projectPosition = 1;
    for (const spec of PROJECT_GARDEN) {
        const id = sliceEntityId(
            token + '-project-' + spec.suffix);
        const project = {
            ...projectTemplate,
            id,
            title: projectTemplate.title
                + ' (' + spec.suffix + ')',
            position: projectPosition,
        };
        projectPosition += 1;
        const event: StateEntity = {
            id: sliceEntityId(
                token + '-project-' + spec.suffix + '-state'),
            entity_id: id,
            member_id: adminId,
            at: requestAt,
            state: spec.state,
        };
        const body = projectSeedBody(
            project, event, organizationId,
        );
        const messagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey('projects', id),
                routePattern:
                    'organizations/:id/projects/:id',
                idParams: [organizationId, id],
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        projects.push({ id, body, messagePair });
    }
    const objectives: GardenObjective[] = [];
    for (let i = 0; i < OBJECTIVE_SEEDS.length; i++) {
        const source = OBJECTIVE_SEEDS[i]!;
        const seed = {
            ...source,
            id: sliceEntityId(
            token + '-obj-' + (i + 1)),
        };
        const body = objectiveSeedBody(
            seed, organizationId, adminId,
        );
        const validated =
            validateObjectiveCreateBody(body);
        const operation = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'objectives', seed.id,
                ),
                routePattern:
                    'organizations/:id/objectives/',
                idParams: [organizationId],
                op: true,
                organization: organizationId,
                requesterIdentityId: adminId,
                body,
            },
            requestAt,
        );
        const document = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'objectives/:id', seed.id,
                ),
                routePattern:
                    'organizations/:id/objectives/:id',
                idParams: [
                    organizationId, seed.id,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: objectiveDocumentBodyOf(
                    validated,
                ),
            },
            requestAt,
        );
        const revision = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'objectives/:id/revisions/:rid',
                    validated.revisionId,
                ),
                routePattern:
                    'organizations/:id/objectives/:id'
                    + '/revisions/:rid',
                idParams: [
                    organizationId,
                    seed.id,
                    validated.revisionId,
                ],
                organization: organizationId,
                requesterIdentityId: adminId,
                body: objectiveRevisionBodyOf(
                    validated,
                ),
            },
            requestAt,
        );
        objectives.push({
            body,
            messagePairs: {
                operation, document, revision,
            },
        });
    }
    const profile = buildRecords()[0]!;
    const recordId = sliceEntityId(
        token + '-record-customer');
    const attr1Id = sliceEntityId(token + '-attr-1');
    const attr2Id = sliceEntityId(token + '-attr-2');
    const flowId = sliceEntityId(token + '-flow');
    const bindingId = sliceEntityId(
        token + '-flow-record');
    const formedRecord =
        await formRecordBindingMessagePairs({
            organizationId,
            adminId,
            requestAt,
            recordId,
            attributes: [
                {
                    id: attr1Id,
                    name: 'Company Name',
                    attribute_type: 'text',
                    sort_order: 1,
                    options: [],
                    constraints: [],
                },
                {
                    id: attr2Id,
                    name: 'Contact Email',
                    attribute_type: 'text',
                    sort_order: 2,
                    options: [],
                    constraints: [],
                },
            ],
            flowId,
            bindingId,
            recordName: profile.name,
            recordDescription: profile.description,
            recordPosition: profile.position,
            initialStateEventId: sliceEntityId(
                token + '-state-record-customer'),
        });
    const createNodeId = sliceEntityId(token + '-node-create');
    const captureNodeId = sliceEntityId(
        token + '-node-capture');
    const reviewNodeId = sliceEntityId(token + '-node-review');
    const archiveNodeId = sliceEntityId(
        token + '-node-archive');
    const graphEdges: Record<string, unknown>[] = [
        {
            id: sliceEntityId(token + '-edge-begin'),
            name: 'begin',
            fromNodeId: createNodeId,
            toNodeId: captureNodeId,
        },
        {
            id: sliceEntityId(token + '-edge-submit'),
            name: 'submit',
            fromNodeId: captureNodeId,
            toNodeId: reviewNodeId,
        },
        {
            id: sliceEntityId(
                token + '-edge-approve'),
            name: 'approve',
            fromNodeId: reviewNodeId,
            toNodeId: archiveNodeId,
        },
    ];
    if (token === 'fs') {
        graphEdges.push({
            id: sliceEntityId('fs-edge-revise'),
            name: 'needs revision',
            fromNodeId: reviewNodeId,
            toNodeId: captureNodeId,
        });
    }
    const graph: Record<string, unknown> = {
        nodes: [
            {
                id: createNodeId,
                name: 'Create',
                positionX: 40,
                positionY: 30,
                isCreate: true,
                isArchive: false,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
            {
                id: captureNodeId,
                name: 'Data Capture',
                positionX: 260,
                positionY: 140,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [
                    {
                        attribute_id: attr1Id,
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attribute_id: attr2Id,
                        mode: 'editable',
                        isRequired: true,
                    },
                ],
            },
            {
                id: reviewNodeId,
                name: 'Review',
                positionX: 480,
                positionY: 250,
                isCreate: false,
                isArchive: false,
                taskInstructions: '',
                memberIds: [adminId],
                attributes: [
                    {
                        attribute_id: attr1Id,
                        mode: 'readonly',
                        isRequired: false,
                    },
                    {
                        attribute_id: attr2Id,
                        mode: 'readonly',
                        isRequired: false,
                    },
                ],
            },
            {
                id: archiveNodeId,
                name: 'Archive',
                positionX: 680,
                positionY: 370,
                isCreate: false,
                isArchive: true,
                taskInstructions: '',
                memberIds: [],
                attributes: [],
            },
        ],
        edges: graphEdges,
    };
    const relations = buildFlowGraphRelations(
        [{ id: flowId, graph }],
        requestAt,
    );
    const projectId = sliceEntityId(
        token + '-project-approved');
    const projectFlowId = sliceEntityId(
        token + '-project-flow');
    const nodeIds = new Set(
        relations.nodes.map((node) => node.id),
    );
    const flowBody: Record<string, unknown> = {
        id: flowId,
        flow: {
            organization_id: organizationId,
            name: 'Customer Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
        },
        projectFlowId,
        projectFlow: {
            project_id: projectId,
            flow_id: flowId,
            at: requestAt,
        },
        initialState: 'active',
        initialStateEventId: sliceEntityId(token + '-state-flow'),
        initialStateAt: requestAt,
        graphDelta: {
            nodes: relations.nodes,
            edges: relations.edges,
            deletions: [],
            memberEvents: relations.members.filter(
                (row) => nodeIds.has(row.flow_node_id),
            ),
            attributeEvents: relations.attributes.filter(
                (row) => nodeIds.has(row.flow_node_id),
            ),
        },
    };
    const validatedFlow =
        validateFlowCreateBody(flowBody);
    const flowOperationMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows', flowId),
            routePattern: 'organizations/:id/flows/',
            idParams: [organizationId],
            op: true,
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowBody,
        },
        requestAt,
    );
    const flowDocumentMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey('flows/:id', flowId),
            routePattern:
                'organizations/:id/flows/:id',
            idParams: [organizationId, flowId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: flowCreateDocumentBody(
                validatedFlow,
            ),
        },
        requestAt,
    );
    const flowJoinMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                'projects/:id/flows/:pfid',
                projectFlowId,
            ),
            routePattern:
                'organizations/:id/projects/:id'
                + '/flows/:pfid',
            idParams: [
                organizationId,
                projectId,
                projectFlowId,
            ],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: validatedFlow.projectFlow,
        },
        requestAt,
    );
    const frozenGraph: Record<string, unknown> = {
        name: 'Customer Onboarding',
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: graph['nodes'],
        edges: graph['edges'],
    };
    const parkNodeId: Record<string, string> = {
        capture: captureNodeId,
        review: reviewNodeId,
        archive: archiveNodeId,
    };
    const workOrders: GardenWorkOrder[] = [];
    if (token === 'fs') {
        const nodes = graph['nodes'] as GraphNode[];
        const edges = graph['edges'] as GraphEdge[];
        const beginId = sliceEntityId(
            token + '-edge-begin');
        const submitId = sliceEntityId(
            token + '-edge-submit');
        const approveId = sliceEntityId(
            token + '-edge-approve');
        const reviseId = sliceEntityId(
            'fs-edge-revise');
        const paths: readonly PathProfile[] = [
            {
                nodeIds: [
                    createNodeId, captureNodeId,
                    reviewNodeId, archiveNodeId,
                ],
                edgeIds: [
                    beginId, submitId, approveId,
                ],
                weight: 0.7,
            },
            {
                nodeIds: [
                    createNodeId, captureNodeId,
                    reviewNodeId, captureNodeId,
                    reviewNodeId, archiveNodeId,
                ],
                edgeIds: [
                    beginId, submitId, reviseId,
                    submitId, approveId,
                ],
                weight: 0.15,
            },
            {
                nodeIds: [
                    createNodeId, captureNodeId,
                    reviewNodeId,
                ],
                edgeIds: [beginId, submitId],
                weight: 0.15,
            },
        ];
        const sojourn: SojournProfile = {
            meanHoursByNodeId: new Map([
                [captureNodeId, 72],
                [reviewNodeId, 18],
            ]),
            sigmaByNodeId: new Map([
                [captureNodeId, 0.8],
                [reviewNodeId, 0.5],
            ]),
        };
        const skill: MemberSkill = {
            byMemberAndNode: new Map([
                [adminId, new Map([
                    [captureNodeId, 1.0],
                    [reviewNodeId, 1.0],
                ])],
            ]),
            jitterPct: 0.15,
        };
        const flowSpec: FlowSeedSpec = {
            flowId,
            name: 'Customer Onboarding',
            nodes,
            edges,
            creator: nodes[0]!,
            archive: nodes[3]!,
        };
        const generated = generateFlowWorkload({
            flow: flowSpec,
            paths,
            sojourn,
            skill,
            totalWorkOrders: FS_WORK_ORDER_COUNT,
            oldestDaysAgo: FS_OLDEST_DAYS_AGO,
            newestDaysAgo: FS_NEWEST_DAYS_AGO,
            seed: FS_WORKLOAD_SEED,
            organizationId,
            nowMs: Date.parse(requestAt),
        });
        for (const wo of generated.workOrders) {
            const { id: woId, ...woFields } = wo;
            const body: Record<string, unknown> = {
                ...woFields,
            };
            const messagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'work-orders/:id', woId,
                        ),
                        routePattern:
                            'organizations/:id'
                            + '/work-orders/:id',
                        idParams: [
                            organizationId, woId,
                        ],
                        organization: organizationId,
                        requesterIdentityId: adminId,
                        body,
                    },
                    requestAt,
                );
            const join = generated.flowWorkOrders.find(
                (row) => row.work_order_id === woId,
            )!;
            const joinBody =
                flowWorkOrderJoinSeedBody(join);
            const joinMessagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'flows/:id/work-orders/:woid',
                            join.id,
                        ),
                        routePattern:
                            'organizations/:id/flows/:id'
                            + '/work-orders/:woid',
                        idParams: [
                            organizationId,
                            flowId,
                            join.id,
                        ],
                        organization: organizationId,
                        requesterIdentityId: adminId,
                        body: joinBody,
                    },
                    requestAt,
                );
            const transitions: {
                readonly body:
                    Record<string, unknown>;
                readonly messagePair: MessagePair;
            }[] = [];
            const events = generated.stateEvents.filter(
                (event) => event.entity_id === woId,
            );
            for (const event of events) {
                const transitionBody: Record<
                    string, unknown
                > = {
                    transitionEventId: event.id,
                    targetState: event.state,
                    fieldValues: [],
                    release: null,
                    transitionAt: event.at,
                };
                const transitionMessagePair =
                    await formSeedMessagePair(
                        {
                            key: seedMessagePairKey(
                                'work-orders/:id'
                                + '/transition',
                                event.id,
                            ),
                            routePattern:
                                'organizations/:id'
                                + '/work-orders/:id'
                                + '/transition',
                            idParams: [
                                organizationId, woId,
                            ],
                            op: true,
                            organization:
                                organizationId,
                            requesterIdentityId:
                                adminId,
                            body: transitionBody,
                        },
                        requestAt,
                    );
                transitions.push({
                    body: transitionBody,
                    messagePair:
                        transitionMessagePair,
                });
            }
            workOrders.push({
                id: woId,
                body,
                messagePair,
                joinId: join.id,
                joinBody,
                joinMessagePair,
                transitions,
            });
        }
    } else {
        for (const spec of WORK_ORDER_GARDEN) {
            const id = sliceEntityId(
                token + '-wo-' + spec.suffix);
            const body: Record<string, unknown> = {
                display_id: token + spec.position,
                flow_graph: frozenGraph,
                position: spec.position,
                organization_id: organizationId,
            };
            const messagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'work-orders/:id', id,
                        ),
                        routePattern:
                            'organizations/:id'
                            + '/work-orders/:id',
                        idParams: [
                            organizationId, id,
                        ],
                        organization: organizationId,
                        requesterIdentityId: adminId,
                        body,
                    },
                    requestAt,
                );
            const joinId = id;
            const joinBody = flowWorkOrderJoinSeedBody({
                id: joinId,
                flow_id: flowId,
                work_order_id: id,
                at: requestAt,
            });
            const joinMessagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'flows/:id/work-orders/:woid',
                            joinId,
                        ),
                        routePattern:
                            'organizations/:id/flows/:id'
                            + '/work-orders/:woid',
                        idParams: [
                            organizationId,
                            flowId,
                            joinId,
                        ],
                        organization: organizationId,
                        requesterIdentityId: adminId,
                        body: joinBody,
                    },
                    requestAt,
                );
            const parkId = parkNodeId[spec.node]!;
            const transitionEventId =
                sliceEntityId(
                    token + '-wo-' + spec.suffix
                    + '-move');
            const transitionBody: Record<
                string, unknown
            > = {
                transitionEventId,
                targetState: parkId,
                fieldValues: [],
                release: null,
                transitionAt: requestAt,
            };
            const transitionMessagePair =
                await formSeedMessagePair(
                    {
                        key: seedMessagePairKey(
                            'work-orders/:id/transition',
                            transitionEventId,
                        ),
                        routePattern:
                            'organizations/:id'
                            + '/work-orders/:id'
                            + '/transition',
                        idParams: [
                            organizationId, id,
                        ],
                        op: true,
                        organization: organizationId,
                        requesterIdentityId: adminId,
                        body: transitionBody,
                    },
                    requestAt,
                );
            workOrders.push({
                id,
                body,
                messagePair,
                joinId,
                joinBody,
                joinMessagePair,
                transitions: [{
                    body: transitionBody,
                    messagePair:
                        transitionMessagePair,
                }],
            });
        }
    }
    return {
        ideas,
        projects,
        objectives,
        record: {
            body: formedRecord.body,
            messagePairs: formedRecord.messagePairs,
            bindingId,
            bindingBody: formedRecord.bindingBody,
            bindingMessagePair:
                formedRecord.bindingMessagePair,
        },
        flow: {
            body: flowBody,
            messagePairs: {
                operation: flowOperationMessagePair,
                document: flowDocumentMessagePair,
                join: flowJoinMessagePair,
            },
        },
        workOrders,
    };
}

async function writeGarden(
    adapter: DbAdapter,
    garden: GardenWrites,
): Promise<void> {
    await Promise.all([
        ...garden.ideas.map((idea) =>
            postIdeaDocumentOp(
                adapter,
                idea.id,
                idea.body,
                SYSTEM_MEMBER_ID,
                idea.messagePair,
            ),
        ),
        ...garden.ideas.map((idea) =>
            postIdeaSubmissionOp(
                adapter,
                idea.submissionId,
                idea.submissionBody,
                idea.submissionMessagePair,
            ),
        ),
        ...garden.projects.map((project) =>
            postProjectDocumentOp(
                adapter,
                project.id,
                project.body,
                SYSTEM_MEMBER_ID,
                project.messagePair,
            ),
        ),
        ...garden.objectives.map((objective) =>
            postObjectiveCreationOp(
                adapter,
                objective.body,
                objective.messagePairs,
            ),
        ),
        postRecordWriteOp(
            adapter,
            garden.record.body,
            SYSTEM_MEMBER_ID,
            garden.record.messagePairs,
        ),
        postFlowRecordDocumentOp(
            adapter,
            garden.record.bindingId,
            garden.record.bindingBody,
            SYSTEM_MEMBER_ID,
            garden.record.bindingMessagePair,
        ),
        postFlowCreationOp(
            adapter,
            garden.flow.body,
            SYSTEM_MEMBER_ID,
            garden.flow.messagePairs,
        ),
        ...garden.workOrders.map((workOrder) =>
            postWorkOrderDocumentOp(
                adapter,
                workOrder.id,
                workOrder.body,
                SYSTEM_MEMBER_ID,
                workOrder.messagePair,
            ),
        ),
        ...garden.workOrders.map((workOrder) =>
            postFlowWorkOrderDocumentOp(
                adapter,
                workOrder.joinId,
                workOrder.joinBody,
                SYSTEM_MEMBER_ID,
                workOrder.joinMessagePair,
            ),
        ),
        ...garden.workOrders.flatMap((workOrder) =>
            workOrder.transitions.map((row) =>
                postWorkOrderTransitionOp(
                    adapter,
                    workOrder.id,
                    row.body,
                    SYSTEM_MEMBER_ID,
                    undefined,
                    [],
                    row.messagePair,
                ),
            ),
        ),
    ]);
}

function passwordFor(
    passwords: Map<string, string>,
    username: string | undefined,
): string | undefined {
    if (username === undefined) {
        return undefined;
    }
    const password = passwords.get(username);
    if (password === undefined) {
        throw new Error(
            'seed formed no password for '
                + username,
        );
    }
    return password;
}

function fillPasswords(
    reveals: readonly TestPlanSliceReveal[],
    creds: SeededCredentials,
): TestPlanSliceReveal[] {
    const passwords = new Map<string, string>();
    for (const identity of creds.identities) {
        passwords.set(
            identity.username, identity.password,
        );
    }
    return reveals.map((row) => {
        const adminPassword = passwords.get(
            row.adminUsername,
        );
        if (adminPassword === undefined) {
            throw new Error(
                'seed formed no password for '
                    + row.adminUsername,
            );
        }
        const seatPassword = passwordFor(
            passwords, row.seatUsername,
        );
        const unseatedPassword = passwordFor(
            passwords, row.unseatedUsername,
        );
        const memberPassword = passwordFor(
            passwords, row.memberUsername,
        );
        const erasablePassword = passwordFor(
            passwords, row.erasableUsername,
        );
        return {
            ...row,
            adminPassword,
            ...(seatPassword === undefined
                ? {}
                : { seatPassword }),
            ...(unseatedPassword === undefined
                ? {}
                : { unseatedPassword }),
            ...(memberPassword === undefined
                ? {}
                : { memberPassword }),
            ...(erasablePassword === undefined
                ? {}
                : { erasablePassword }),
        };
    });
}

export async function postTestPlanSlices(
    adapter: DbAdapter,
    options?: { readonly hashPassword?: Hasher },
): Promise<readonly TestPlanSliceReveal[]> {
    const requestAt = nowUtc();
    await adapter.ensureTables(TABLE_NAMES);
    const bootstrap =
        await formBootstrapMessagePair(
            requestAt,
        );
    const recipients: Array<{
        readonly identityId: string;
        readonly email: string;
    }> = [{
        identityId: 'XXZruirZyAOoRpNxaDnpSA',
        email: 'demo@example.com',
    }];
    const reveals: TestPlanSliceReveal[] = [{
        section: 'AA',
        organizationId: STARK_ORGANIZATION,
        organizationName: STARK_NAME,
        adminUsername: 'demo@example.com',
        adminPassword: '',
    }];
    const aaRecord = await formAaRecord(requestAt);
    const formed: TenantAdminMessagePairs[] = [];
    const extras: ExtraWrites[] = [];
    const gardens: GardenWrites[] = [];
    const f2Flows: F2FlowWrites[] = [];
    const fFlows: FFlowWrites[] = [];
    const cScores: CScoreWrites[] = [];
    const kReviews: KReviewWrites[] = [];
    const rSubjects: RExtras[] = [];
    for (const section of PARALLEL_SECTIONS) {
        if (section === 'AA') continue;
        const slice = await formTenantAdminMessagePairs(
            section, requestAt,
        );
        formed.push(slice);
        recipients.push({
            identityId: slice.adminId,
            email: slice.email,
        });
        let reveal: TestPlanSliceReveal = {
            section,
            organizationId: slice.organizationId,
            organizationName: STARK_NAME,
            adminUsername: slice.email,
            adminPassword: '',
        };
        if (section === 'B') {
            extras.push(await formBExtras(
                slice.organizationId, requestAt,
            ));
            recipients.push({
                identityId: 'VbxXtvAkgQzhoXQZkbnHVg',
                email:
                    'b-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                seatUsername:
                    'b-member@test-plan.example',
                seatPassword: '',
                flowId: 'UXOPfjdZZohCcyCLlQWnuQ',
            };
        } else if (section === 'G') {
            extras.push(await formGExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
            recipients.push({
                identityId: 'dtmZgnDBlVcoyjxKzlaKgA',
                email:
                    'g-unseated@test-plan.example',
            });
            recipients.push({
                identityId: 'dmGzDTZwsyIYCQhhRISXrw',
                email:
                    'g-member@test-plan.example',
            });
            recipients.push({
                identityId: 'qbtQzOgP8OTJSr9Idicllg',
                email:
                    'g-erasable@test-plan.example',
            });
            reveal = {
                ...reveal,
                secondOrganizationId: 'WlkfISpndVJfICRnWksipQ',
                secondOrganizationName:
                    'Wayne Enterprises',
                unseatedUsername:
                    'g-unseated@test-plan.example',
                unseatedPassword: '',
                memberUsername:
                    'g-member@test-plan.example',
                memberPassword: '',
                erasableUsername:
                    'g-erasable@test-plan.example',
                erasablePassword: '',
            };
        } else if (section === 'SV') {
            extras.push(await formSvExtras(
                slice.organizationId, requestAt,
            ));
            recipients.push({
                identityId: 'uVgzITlKxKcWZtGSPzmsqA',
                email:
                    'sv-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                seatUsername:
                    'sv-member@test-plan.example',
                seatPassword: '',
            };
        } else if (section === 'C') {
            cScores.push(await formCExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
        } else if (section === 'K') {
            kReviews.push(await formKExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
        } else if (section === 'R') {
            const extra = await formRExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            );
            rSubjects.push(extra);
            extras.push({
                identities: [extra.member],
            });
            recipients.push({
                identityId:
                    sliceEntityId('r-member'),
                email:
                    'r-member@test-plan.example',
            });
            reveal = {
                ...reveal,
                memberUsername:
                    'r-member@test-plan.example',
                memberPassword: '',
            };
        } else if (section === 'F') {
            fFlows.push(await formFExtras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
        } else if (section === 'F2') {
            const extra = await formF2Extras(
                slice.organizationId,
                slice.adminId,
                requestAt,
            );
            f2Flows.push(extra);
            reveal = {
                ...reveal,
                flowId: extra.flowId,
            };
        }
        if ((GARDEN_SECTIONS as readonly string[])
            .includes(section)) {
            gardens.push(await formGarden(
                sectionToken(section),
                slice.organizationId,
                slice.adminId,
                requestAt,
            ));
        }
        reveals.push(reveal);
    }
    await adapter.transaction(
        TABLE_NAMES,
        async (view) => {
            await postBootstrapIn(
                view,
                bootstrap.identityMessagePair,
                bootstrap.seatMessagePair,
                bootstrap.piiMessagePair,
                bootstrap.systemIdentityMessagePair,
                bootstrap.defaultOrganizationMessagePair,
                bootstrap.organizationMessagePair,
            );
            await postRecordWriteOp(
                view,
                aaRecord.body,
                SYSTEM_MEMBER_ID,
                aaRecord.messagePairs,
            );
            await Promise.all(
                formed.map((slice) =>
                    writeTenantAdmin(view, slice),
                ),
            );
            await Promise.all(
                extras.map((extra) =>
                    writeExtras(view, extra),
                ),
            );
            await Promise.all(
                gardens.map((garden) =>
                    writeGarden(view, garden),
                ),
            );
            await Promise.all(
                fFlows.map((extra) =>
                    postFlowCreationOp(
                        view,
                        extra.body,
                        SYSTEM_MEMBER_ID,
                        extra.messagePairs,
                    ),
                ),
            );
            await Promise.all(
                cScores.flatMap((extra) => [
                    ...extra.baselines.map((row) =>
                        postBaselineScoreDocumentOp(
                            view,
                            row.id,
                            row.fields,
                            row.fields.member_id,
                            row.messagePair,
                        )),
                    ...extra.actuals.map((row) =>
                        postActualScoreDocumentOp(
                            view,
                            row.id,
                            row.fields,
                            row.fields.member_id,
                            row.messagePair,
                        )),
                ]),
            );
            await Promise.all(
                kReviews.flatMap((extra) =>
                    extra.projects.map((project) =>
                        postProjectDocumentOp(
                            view,
                            project.id,
                            project.body,
                            SYSTEM_MEMBER_ID,
                            project.messagePair,
                        )),
                ),
            );
            await Promise.all(
                kReviews.flatMap((extra) =>
                    extra.baselines.map((row) =>
                        postBaselineScoreDocumentOp(
                            view,
                            row.id,
                            row.fields,
                            row.fields.member_id,
                            row.messagePair,
                        )),
                ),
            );
            for (const extra of f2Flows) {
                await appendMessagePair(
                    view, extra.operation,
                );
                await appendMessagePair(
                    view, extra.document,
                );
                await postRecordWriteOp(
                    view,
                    extra.recordBody,
                    SYSTEM_MEMBER_ID,
                    extra.recordMessagePairs,
                );
                await postFlowRecordDocumentOp(
                    view,
                    extra.bindingId,
                    extra.bindingBody,
                    SYSTEM_MEMBER_ID,
                    extra.bindingMessagePair,
                );
                await appendMessagePair(
                    view, extra.instanceMessagePair,
                );
            }
            for (const extra of rSubjects) {
                await postRecordWriteOp(
                    view,
                    extra.record.body,
                    SYSTEM_MEMBER_ID,
                    extra.record.messagePairs,
                );
                for (
                    const pair
                    of extra.attributePuts
                ) {
                    await appendMessagePair(
                        view, pair,
                    );
                }
                await appendMessagePair(
                    view, extra.instanceMessagePair,
                );
                await postWorkOrderBindingOp(
                    view,
                    extra.binding.workOrderId,
                    extra.binding.body,
                    SYSTEM_MEMBER_ID,
                    extra.binding.organizationId,
                    extra.binding.messagePair,
                );
            }
        },
    );
    const creds = await seedHumanCredentials(
        adapter,
        recipients,
        options?.hashPassword,
    );
    const filled = fillPasswords(reveals, creds);
    await adapter.postSchemaCreation();
    return filled;
}
