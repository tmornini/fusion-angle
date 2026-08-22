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
    type StateEntity,
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
import { appendMessagePair } from
    './message-pair.ts';
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
} from './mock-data/seed-message-pairs.ts';
import { daysFromNow } from
    './mock-data/seed-kit.ts';
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
import { buildFlowGraphRelations } from
    './mock-data/flows.ts';
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
    'f-node-create': 'UlwhAnqPkssQBaKWPOjPHw',
    'f-node-capture': 'joVDOAiJZVtgnElmOCAyAA',
    'f-node-review': 'LVryuKRUgVkuTdVeKYqDcw',
    'f-node-archive': 'vTGKwITZylFuMNKCyFXwYQ',
    'f-edge-begin': 'GBBcWwzkxjRAjeNPlXcODg',
    'f-edge-submit': 'IWbtNQySXwOtbJbHKFQSEw',
    'f-edge-approve': 'DBacZPqqChMYfkjjqSRZog',
    'f-project-flow': 'LBcldHIXITLfvljfXpefog',
    'f-state-flow': 'wXEqVCZvISuDsLdNNCWLeQ',
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
    'f2-attr-1': 'YErPUsjpzqQjteXbusYqiQ',
    'f2-attr-2': 'mxyQyZkqIyMjiQINxMcJpg',
    'f2-state-record-customer': 'lnyXdDKmWojVxcxTfFnvjg',
    'f2-flow': 'DccQFYFgizAgqBvhRHkgew',
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
    'fs-node-create': 'KRUlvITqCzLbngoRcKaTAQ',
    'fs-node-capture': 'QYypRkKLzMGbSGxotgIxNQ',
    'fs-node-review': 'jVhhOAhaHKPbIJuhwYjDSg',
    'fs-node-archive': 'wTmRlODxPuAbOTylkfZDNQ',
    'fs-edge-begin': 'AdVOtqtQSKfGZGtaYLfdPw',
    'fs-edge-submit': 'ItZFnpoyOndFMUIYeAOIhg',
    'fs-edge-approve': 'uCdEHZjvudxpNyqyUtQKtA',
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
    'r-attr-1': 'nIvyKEMWevzIynfqPKHkbA',
    'r-attr-2': 'dqyTeecJBQmttvQWXErnRg',
    'r-state-record-customer': 'pAdySOwTblAIOGayXpfKSA',
    'r-flow': 'woyUPAYCghVYHwkFAUEZEQ',
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
    'sv-project-approved-2-state': 'PUdAQZLiCBAGdLAsCKTWWg'
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
        identities: [unseated, member],
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
                        attribute_id: sliceEntityId(
                            'f2-node-capture-attr-text',
                        ),
                        mode: 'editable',
                        isRequired: true,
                    },
                    {
                        attribute_id: sliceEntityId(
                            'f2-node-capture-attr-select',
                        ),
                        mode: 'editable',
                        isRequired: true,
                    },
                ],
            },
            {
                id: archiveNodeId,
                name: 'Archive',
                positionX: 480,
                positionY: 250,
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
                id: sliceEntityId(
                    'f2-edge-capture-archive',
                ),
                name: 'archive',
                fromNodeId: captureNodeId,
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
    return {
        flowId, body: flowBody, operation, document,
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
    readonly transitionBody: Record<string, unknown>;
    readonly transitionMessagePair: MessagePair;
};

type GardenWrites = {
    readonly ideas: readonly GardenIdea[];
    readonly projects: readonly GardenProject[];
    readonly objectives: readonly GardenObjective[];
    readonly record: GardenRecord;
    readonly flow: GardenFlow;
    readonly workOrders: readonly GardenWorkOrder[];
};

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
    for (const state of IDEA_GARDEN_STATES) {
        const id = sliceEntityId(token + '-idea-' + state);
        const body: Record<string, unknown> = {
            ...ideaFields,
            title: ideaTitle + ' (' + state + ')',
            organization_id: organizationId,
            state,
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
    const attributeRows = [
        {
            id: sliceEntityId(token + '-attr-1'),
            record_id: recordId,
            organization_id: organizationId,
            name: 'Company Name',
            attribute_type: 'text',
            sort_order: 1,
            options: [] as string[],
            constraints: [] as unknown[],
        },
        {
            id: sliceEntityId(token + '-attr-2'),
            record_id: recordId,
            organization_id: organizationId,
            name: 'Contact Email',
            attribute_type: 'text',
            sort_order: 2,
            options: [] as string[],
            constraints: [] as unknown[],
        },
    ];
    const recordBody: Record<string, unknown> = {
        kind: 'create',
        id: recordId,
        record: {
            organization_id: organizationId,
            name: profile.name,
            description: profile.description,
            position: profile.position,
        },
        attributes: attributeRows,
        initialState: 'active',
        initialStateEventId:
            sliceEntityId(
            token + '-state-record-customer'),
        initialStateAt: requestAt,
    };
    const validatedRecord =
        validateRecordWriteBody(recordBody);
    const recordOperationMessagePair = await formSeedMessagePair(
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
            body: recordBody,
        },
        requestAt,
    );
    const recordDocumentMessagePair = await formSeedMessagePair(
        {
            key: seedMessagePairKey(
                RECORD_TYPE_DETAIL_PATTERN, recordId,
            ),
            routePattern: RECORD_TYPE_DETAIL_PATTERN,
            idParams: [organizationId, recordId],
            organization: organizationId,
            requesterIdentityId: adminId,
            body: recordDocumentBodyOf(
                validatedRecord,
            ),
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
                routePattern: ATTRIBUTE_DETAIL_PATTERN,
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
    const flowId = sliceEntityId(token + '-flow');
    const createNodeId = sliceEntityId(token + '-node-create');
    const captureNodeId = sliceEntityId(
        token + '-node-capture');
    const reviewNodeId = sliceEntityId(token + '-node-review');
    const archiveNodeId = sliceEntityId(
        token + '-node-archive');
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
                attributes: [],
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
                attributes: [],
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
        ],
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
    for (const spec of WORK_ORDER_GARDEN) {
        const id = sliceEntityId(
            token + '-wo-' + spec.suffix);
        const body: Record<string, unknown> = {
            display_id: token + spec.position,
            flow_graph: frozenGraph,
            position: spec.position,
            organization_id: organizationId,
        };
        const messagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'work-orders/:id', id,
                ),
                routePattern:
                    'organizations/:id/work-orders/:id',
                idParams: [organizationId, id],
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
        const joinMessagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'flows/:id/work-orders/:woid',
                    joinId,
                ),
                routePattern:
                    'organizations/:id/flows/:id'
                    + '/work-orders/:woid',
                idParams: [
                    organizationId, flowId, joinId,
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
        const transitionBody: Record<string, unknown> = {
            transitionEventId,
            targetState: parkId,
            fieldValues: [],
            release: null,
            transitionAt: requestAt,
        };
        const transitionMessagePair = await formSeedMessagePair(
            {
                key: seedMessagePairKey(
                    'work-orders/:id/transition',
                    transitionEventId,
                ),
                routePattern:
                    'organizations/:id/work-orders/:id'
                    + '/transition',
                idParams: [organizationId, id],
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
            transitionBody,
            transitionMessagePair,
        });
    }
    return {
        ideas,
        projects,
        objectives,
        record: {
            body: recordBody,
            messagePairs: {
                operation: recordOperationMessagePair,
                document: recordDocumentMessagePair,
                attributePuts,
                attributeDeletes: [],
            },
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
        ...garden.workOrders.map((workOrder) =>
            postWorkOrderTransitionOp(
                adapter,
                workOrder.id,
                workOrder.transitionBody,
                SYSTEM_MEMBER_ID,
                undefined,
                [],
                workOrder.transitionMessagePair,
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
    const formed: TenantAdminMessagePairs[] = [];
    const extras: ExtraWrites[] = [];
    const gardens: GardenWrites[] = [];
    const f2Flows: F2FlowWrites[] = [];
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
            for (const extra of f2Flows) {
                await appendMessagePair(
                    view, extra.operation,
                );
                await appendMessagePair(
                    view, extra.document,
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
