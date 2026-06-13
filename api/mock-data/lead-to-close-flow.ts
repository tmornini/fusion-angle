import type { GraphNode, GraphEdge } from '../types.ts';
import type { PathProfile } from './flow-workload.ts';

// Stable ids for the seeded Lead-to-Close flow: its flow and
// project-flow binding, its 7 graph nodes, and its 9 graph
// edges. Shared across the graph, the workload
// paths/sojourn/skill/spec, the flow-record binding, the
// project-flow row, and the state events — so all are exported.
export const l2cFlowId = 'L2cfL3adt0Cl0s3FzMxR02';
export const l2cProjectFlowId =
    'L2cPF01Pr0jL3adt0Cl001';

export const l2cCreateNodeId =
    'L2cN01Cr3atL3adClsXY02';
export const l2cTriageNodeId =
    'L2cN02Tr1agL3adClsAB03';
export const l2cDiscoveryNodeId =
    'L2cN03D1scvL3adClsCD04';
export const l2cQualifNodeId =
    'L2cN04Qu41fL3adClsEF05';
export const l2cProposalNodeId =
    'L2cN05Pr0psL3adClsGH06';
export const l2cNegotNodeId =
    'L2cN06N3g0tL3adClsIJ07';
export const l2cArchiveNodeId =
    'L2cN07Cl0sdL3adClsKL08';

export const l2cStartEdgeId =
    'L2cE01CreatTr1agL2cZ01';
export const l2cQualifyEdgeId =
    'L2cE02Tr1agD1scvL2cY02';
export const l2cDisqualifyEdgeId =
    'L2cE03Tr1agCl0sdL2cX03';
export const l2cPromisingEdgeId =
    'L2cE04D1scvQu41fL2cW04';
export const l2cGoEdgeId =
    'L2cE05Qu41fPr0psL2cV05';
export const l2cNeedsInfoEdgeId =
    'L2cE06Qu41fD1scvL2cU06';
export const l2cSubmitEdgeId =
    'L2cE07Pr0psN3g0tL2cT07';
export const l2cWonEdgeId =
    'L2cE08N3g0tCl0sdL2cS08';
export const l2cReviseEdgeId =
    'L2cE09N3g0tPr0psL2cR09';

// The members participating in the Lead-to-Close flow,
// referenced by the graph nodes' memberIds and the workload
// skill matrix.
export const memberSarah = 'LhfaUUf4IumVsCSGB4xjdK';
export const memberMarcus =
    'WxQn4LVWb76YkmqK5B0EPp';
export const memberJessica = 'zyTbfbjcGEfbpCsNTP0XjX';
export const memberLisa = 'Trf1Up2jMsPhEnjbW4Ji1n';
export const memberClaude = 'LdoTR1fnyYpS1jPzEs57ek';

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
            memberIds: [
                memberLisa, memberClaude,
            ],
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
