import type {
    GraphNode,
    GraphEdge,
    Id,
} from '../types.ts';
import type {
    PathProfile,
    SojournProfile,
    MemberSkill,
    FlowSeedSpec,
    GeneratedFlowData,
} from './flow-workload.ts';
import { generateFlowWorkload } from './flow-workload.ts';
import { now } from './seed-kit.ts';
import { STARK_ORGANIZATION } from './seed-constants.ts';

// Stable ids for the seeded Lead-to-Close flow: its flow and
// project-flow binding, its 7 graph nodes, and its 9 graph
// edges. Shared across the graph, the workload
// paths/sojourn/skill/spec, the flow-record binding, the
// project-flow row, and the state events — so all are exported.
export const l2cFlowId = 'MGyGuArZJPfgCbqlioUzAg';
export const l2cProjectFlowId =
    'MEIbHewtNdwhWIOldsGJMg';

export const l2cCreateNodeId =
    'LULEVQHnhsbbJgXQzelYUg';
export const l2cTriageNodeId =
    'LagDAIHptwHSdzatVfndXQ';
export const l2cDiscoveryNodeId =
    'LkkPVSPgROtWXDFHociakw';
export const l2cQualifNodeId =
    'LsvHYspKZtOQKIatSBNdSA';
export const l2cProposalNodeId =
    'LyVIxfOCfbeensszUYVBbg';
export const l2cNegotNodeId =
    'LyniommwflehGKEnawZDnQ';
export const l2cArchiveNodeId =
    'LytKSQluQvgtOQMhybpCTw';

export const l2cStartEdgeId =
    'KgGvBCeCPzmpntgQaegnOw';
export const l2cQualifyEdgeId =
    'KhsWtmlqxPuZtujWmKbQJQ';
export const l2cDisqualifyEdgeId =
    'KrwXzSpsTTRmpBaKFsMyQQ';
export const l2cPromisingEdgeId =
    'KwaDgfDDjJVBijMZmsbMgg';
export const l2cGoEdgeId =
    'LDlikeVTvFowleEnoVzWyw';
export const l2cNeedsInfoEdgeId =
    'LEBeFlHkwUOjPTNqtodlrg';
export const l2cSubmitEdgeId =
    'LFXIHSHIURSmeBOWJZeuNQ';
export const l2cWonEdgeId =
    'LGtgdtlSPfnJGhVXmcJvEA';
export const l2cReviseEdgeId =
    'LUChiVyQrBtmmDQYTFjBog';

// The members participating in the Lead-to-Close flow,
// referenced by the graph nodes' memberIds (person
// identities), agentIds (Claude), and the workload skill
// matrix.
export const memberSarah = 'MQFcPtrZPIGjMCRAXtZUnA';
export const memberMarcus =
    'SsVAZghfSzMZRZmxNKIizw';
export const memberJessica = 'zyGBRshxOnKHUfcyFRqowg';
export const memberLisa = 'RPzLGrWcstxLaHoBcViPLQ';
export const memberClaude = 'MNwbRSuoYKwmVvCyxZCdwA';

export function buildLeadToCloseNodes(): GraphNode[] {
    return [
        {
            id: l2cCreateNodeId,
            name: 'Create',
            positionX: 40,
            positionY: 30,
            isCreate: true,
            isArchive: false,
            memberIds: [],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cTriageNodeId,
            name: 'Inbound Triage',
            positionX: 220,
            positionY: 100,
            isCreate: false,
            isArchive: false,
            memberIds: [memberLisa],
            agentIds: [memberClaude],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cDiscoveryNodeId,
            name: 'Discovery Call',
            positionX: 400,
            positionY: 180,
            isCreate: false,
            isArchive: false,
            memberIds: [
                memberSarah, memberMarcus,
            ],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cQualifNodeId,
            name: 'Qualification',
            positionX: 580,
            positionY: 260,
            isCreate: false,
            isArchive: false,
            memberIds: [
                memberSarah, memberMarcus,
            ],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cProposalNodeId,
            name: 'Proposal Drafting',
            positionX: 760,
            positionY: 340,
            isCreate: false,
            isArchive: false,
            memberIds: [
                memberJessica, memberSarah,
            ],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cNegotNodeId,
            name: 'Negotiation',
            positionX: 940,
            positionY: 420,
            isCreate: false,
            isArchive: false,
            memberIds: [memberSarah],
            attributes: [],
            taskInstructions: '',
        },
        {
            id: l2cArchiveNodeId,
            name: 'Archive',
            positionX: 1120,
            positionY: 500,
            isCreate: false,
            isArchive: true,
            memberIds: [],
            attributes: [],
            taskInstructions: '',
        },
    ];
}

export function buildLeadToCloseEdges(): GraphEdge[] {
    return [
        {
            id: l2cStartEdgeId,
            name: 'start',
            fromNodeId: l2cCreateNodeId,
            toNodeId: l2cTriageNodeId,
        },
        {
            id: l2cQualifyEdgeId,
            name: 'qualify',
            fromNodeId: l2cTriageNodeId,
            toNodeId: l2cDiscoveryNodeId,
        },
        {
            id: l2cDisqualifyEdgeId,
            name: 'disqualify',
            fromNodeId: l2cTriageNodeId,
            toNodeId: l2cArchiveNodeId,
        },
        {
            id: l2cPromisingEdgeId,
            name: 'promising',
            fromNodeId: l2cDiscoveryNodeId,
            toNodeId: l2cQualifNodeId,
        },
        {
            id: l2cGoEdgeId,
            name: 'go',
            fromNodeId: l2cQualifNodeId,
            toNodeId: l2cProposalNodeId,
        },
        {
            id: l2cNeedsInfoEdgeId,
            name: 'needs info',
            fromNodeId: l2cQualifNodeId,
            toNodeId: l2cDiscoveryNodeId,
        },
        {
            id: l2cSubmitEdgeId,
            name: 'submit',
            fromNodeId: l2cProposalNodeId,
            toNodeId: l2cNegotNodeId,
        },
        {
            id: l2cWonEdgeId,
            name: 'won',
            fromNodeId: l2cNegotNodeId,
            toNodeId: l2cArchiveNodeId,
        },
        {
            id: l2cReviseEdgeId,
            name: 'revise terms',
            fromNodeId: l2cNegotNodeId,
            toNodeId: l2cProposalNodeId,
        },
    ];
}

export function buildLeadToClosePaths(): PathProfile[] {
    return [
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.45,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cDisqualifyEdgeId,
            ],
            weight: 0.20,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cNeedsInfoEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.15,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
                l2cArchiveNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
                l2cReviseEdgeId,
                l2cSubmitEdgeId,
                l2cWonEdgeId,
            ],
            weight: 0.12,
        },
        {
            nodeIds: [
                l2cCreateNodeId,
                l2cTriageNodeId,
                l2cDiscoveryNodeId,
                l2cQualifNodeId,
                l2cProposalNodeId,
                l2cNegotNodeId,
            ],
            edgeIds: [
                l2cStartEdgeId,
                l2cQualifyEdgeId,
                l2cPromisingEdgeId,
                l2cGoEdgeId,
                l2cSubmitEdgeId,
            ],
            weight: 0.08,
        },
    ];
}

// The generated (PRNG) work-order slice of Lead-to-Close's
// demo data — moved verbatim out of postMockDataLoadIn
// (mock-data.ts) so this file's pass-1 invocation list
// (seed-message-pairs.ts) can call it too. generateFlowWorkload
// is a pure function of its args (a fixed `now` literal from
// seed-kit; a seeded mulberry32 PRNG; zero Math.random/Date.now),
// so a second call from pass 1 is provably byte-identical to
// this one — an ACCESS requirement, not a determinism fix.
export function buildLeadToCloseWorkload(): GeneratedFlowData {
    const leadToCloseNodes = buildLeadToCloseNodes();
    const leadToCloseEdges = buildLeadToCloseEdges();
    const leadToClosePaths = buildLeadToClosePaths();

    const leadToCloseSojourn: SojournProfile = {
        meanHoursByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 8],
                [l2cDiscoveryNodeId, 36],
                [l2cQualifNodeId, 22 * 24],
                [l2cProposalNodeId, 24],
                [l2cNegotNodeId, 24],
            ]),
        sigmaByNodeId:
            new Map<Id, number>([
                [l2cTriageNodeId, 0.5],
                [l2cDiscoveryNodeId, 0.5],
                [l2cQualifNodeId, 1.4],
                [l2cProposalNodeId, 0.5],
                [l2cNegotNodeId, 0.5],
            ]),
    };

    const leadToCloseSkill: MemberSkill = {
        byMemberAndNode: new Map<
            Id, ReadonlyMap<Id, number>
        >([
            [memberSarah, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 0.75],
                [l2cQualifNodeId, 0.55],
                [l2cProposalNodeId, 0.80],
                [l2cNegotNodeId, 0.70],
            ])],
            [memberMarcus, new Map<
                Id, number
            >([
                [l2cDiscoveryNodeId, 1.10],
                [l2cQualifNodeId, 1.10],
            ])],
            [memberJessica, new Map<
                Id, number
            >([
                [l2cProposalNodeId, 0.85],
            ])],
            [memberLisa, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.90],
            ])],
            [memberClaude, new Map<
                Id, number
            >([
                [l2cTriageNodeId, 0.60],
            ])],
        ]),
        jitterPct: 0.15,
    };

    const leadToCloseSpec: FlowSeedSpec = {
        flowId: l2cFlowId,
        name: 'Lead-to-Close',
        nodes: leadToCloseNodes,
        edges: leadToCloseEdges,
        creator: leadToCloseNodes[0]!,
        archive: leadToCloseNodes[6]!,
    };

    return generateFlowWorkload({
        flow: leadToCloseSpec,
        paths: leadToClosePaths,
        sojourn: leadToCloseSojourn,
        skill: leadToCloseSkill,
        totalWorkOrders: 100,
        oldestDaysAgo: 80,
        newestDaysAgo: 5,
        seed: 0xC0DEF00D,
        organizationId: STARK_ORGANIZATION,
        nowMs: now.getTime(),
    });
}
