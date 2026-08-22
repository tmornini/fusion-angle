import type {
    FlowWithGraph,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
} from '../types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
} from '../types.ts';
import {
    asStoredGraph,
} from '../validators.ts';
import {
    l2cFlowId,
    buildLeadToCloseNodes,
    buildLeadToCloseEdges,
} from './lead-to-close-flow.ts';
import { seedIdentifier } from './seed-kit.ts';

// A build-time flow seed: the storage row's scalar fields PLUS
// the AUTHORED graph literal. `graph` is NOT a stored column
// (flows.graph is retired) — it is the seed input from which the
// relation rows are derived (buildFlowGraphRelations) and the
// work-order snapshots are taken. The composition root stores
// only the scalar fields and discards the literal. `hasUndoHistory`
// (Phase 14 Task 8) is COMPUTED at derivation time from this
// flow's own document-message-pair count, never stored or
// seeded — every freshly-seeded flow gets exactly one genesis
// document message pair (seed-message-pairs.ts), so it derives
// to `false` regardless of what a seed literal might have said.
export type FlowSeed = Omit<
    FlowWithGraph, 'organization_id' | 'hasUndoHistory'
>;

// The five seeded flows and their inline graph definitions.
// The Lead-to-Close graph reuses the extracted lead-to-close
// node and edge builders. Fixed data; the composition root
// assigns organization_id at write time.
export function buildFlows(): FlowSeed[] {
    const leadToCloseNodes = buildLeadToCloseNodes();
    const leadToCloseEdges = buildLeadToCloseEdges();
    return [
        {
            id: 'esKujtyQFYUJaVSXWwavzA',
            name: 'Customer Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: {
                nodes: [
                    {
                        id: 'laXQcGGyWrbEiExtgkyCcw',
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
                        id: 'KWpWgeKhKyoyBDEymUgcmg',
                        name:
                            'Data Capture',
                                    positionX: 260,
                        positionY: 140,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [
                            'SsVAZghfSzMZRZmxNKIizw',
                            'XXZruirZyAOoRpNxaDnpSA',
                        ],
                        attributes: [
                            {
                                attribute_id:
                                    'CPJmMPXRaBIiNdGBofUPVg',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'oeqelDVElwxHYWkWRVTCYw',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'kxbdVhmkaEzkJvghWKFzkw',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'QHzHnEAmqGSgiEfkXoWMTw',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'AXxvHyKNpNYXYKOorywqRQ',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'DfkwfBiyfyCyRHvsHnDiqQ',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'UflxQeBtbrxfofrceJgVaA',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'nHzjBAeemLwpexXjdPBZHQ',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'zCttybnQPmYzJGmvOxWwBQ',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'xmghdGZDgLKilxByetrBoA',
                        name: 'Review',
                                    positionX: 480,
                        positionY: 250,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [
                            {
                                attribute_id:
                                    'CPJmMPXRaBIiNdGBofUPVg',
                                mode:
                                    'readonly',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'oeqelDVElwxHYWkWRVTCYw',
                                mode:
                                    'readonly',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'ElVKgkCreTEHQXJZPBJDKw',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                        ],
                    },
                    {
                        id: 'DkyhupXfDAcrWBojIzHlRQ',
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
                        id: 'PuLOAtGBPYhsnldPEyGaQw',
                        name: 'begin',
                                    fromNodeId:
                            'laXQcGGyWrbEiExtgkyCcw',
                        toNodeId:
                            'KWpWgeKhKyoyBDEymUgcmg',
                    },
                    {
                        id: 'JZJrLAteZStrqAvzZiamtA',
                        name: 'submit',
                                    fromNodeId:
                            'KWpWgeKhKyoyBDEymUgcmg',
                        toNodeId:
                            'xmghdGZDgLKilxByetrBoA',
                    },
                    {
                        id: 'DYcnMktqUpTdZuEBnLBppw',
                        name:
                            'needs revision',
                                    fromNodeId:
                            'xmghdGZDgLKilxByetrBoA',
                        toNodeId:
                            'KWpWgeKhKyoyBDEymUgcmg',
                    },
                    {
                        id: 'BQCWYtMcBEfKIkKBTFuVDA',
                        name: 'approve',
                                    fromNodeId:
                            'xmghdGZDgLKilxByetrBoA',
                        toNodeId:
                            'DkyhupXfDAcrWBojIzHlRQ',
                    },
                ],
            },
        },
        {
            id: 'GgfDbXOJUvvaCekCTcvhuw',
            name: 'Fusion Angle Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: {
                nodes: [
                    {
                        id: 'NYBDAIztIktgyeRonMNDVA',
                        name: 'Create',
                                    positionX: -702,
                        positionY: -236,
                        isCreate: true,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'nvYQsuyNZiXQwZkXziakpg',
                        name: 'Archive',
                                    positionX: 436,
                        positionY: 358,
                        isCreate: false,
                        isArchive: true,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'UjGhAbLBMZiVYoNTIpsxOw',
                        name: 'Ideas',
                                    positionX: -406,
                        positionY: -234,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'CkHuxmFoicZSKktpBjneQw',
                        name:
                            'Describe problem',
                                    positionX: -82,
                        positionY: -230,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [
                            {
                                attribute_id:
                                    'ptlpsUrQssxuTLkouUAnNw',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'pwQZmLdIOBjDnVpDmmujbw',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'IsRAivknyoyfmbcCZjuVBw',
                        name: 'Who Benefits',
                                    positionX: 187,
                        positionY: -232,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'qlLaFtVhSDnDKodahIPxlA',
                        name: 'Solution',
                                    positionX: 527,
                        positionY: -231,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [
                            {
                                attribute_id:
                                    'pwjGSoPQMbsjmEJLDAgbaA',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'qDgLYtdgNBjEEoPqCoMATg',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'TaUqYMjXHfqhHNPcdpWLIw',
                        name: 'Outcome',
                                    positionX: 525,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'mMQKSVSJlekhbuXzsxsudw',
                        name: 'Edit Idea',
                                    positionX: 189,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'GPYtBNvOiUqvWVFqIyOBVA',
                        name: 'Cost',
                                    positionX: -409,
                        positionY: 22,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'AyJygNtqSPuayooRqOJBwg',
                        name: 'Impact',
                                    positionX: -411,
                        positionY: 141,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'SrEmQKwUVTfGNndtAMxLrA',
                        name: 'Category',
                                    positionX: -143,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'GYZhSglofqvZTiYzBCGjGw',
                        name: 'Time',
                                    positionX: -408,
                        positionY: -108,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'MSQSsxyYmOJMqzWjLxHBiw',
                        name: 'Idea',
                                    positionX: -412,
                        positionY: 278,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'zGHsUMZEvMfSzFrauBghLg',
                        name: 'Idea',
                                    positionX: -140,
                        positionY: -3,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'EGfkcbLephJtgaWLrTamOA',
                        name:
                            'Review Queue',
                                    positionX: 188,
                        positionY: -7,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'WGdQUVyBEHCSEYKShdcZRA',
                        name:
                            'Approval Detail',
                                    positionX: 450,
                        positionY: 81,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'FHxCElVIzQJRSSypTLqqUQ',
                        name:
                            'Ideas approve',
                                    positionX: 143,
                        positionY: 274,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'JRwwQolZMzAiHXbqbZSZVg',
                        name:
                            'Approval Detail',
                                    positionX: 448,
                        positionY: 214,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                ],
                edges: [
                    {
                        id: 'UGFXSeVXWVkIRUyCjURDKA',
                        name: 'Create Idea',
                                    fromNodeId:
                            'NYBDAIztIktgyeRonMNDVA',
                        toNodeId:
                            'UjGhAbLBMZiVYoNTIpsxOw',
                    },
                    {
                        id: 'DKUqNOzbZsgGleQYrfEcdg',
                        name:
                            'Create Title',
                                    fromNodeId:
                            'UjGhAbLBMZiVYoNTIpsxOw',
                        toNodeId:
                            'CkHuxmFoicZSKktpBjneQw',
                    },
                    {
                        id: 'OCWetQuGjPeOqIbajVasKg',
                        name: 'submit',
                                    fromNodeId:
                            'CkHuxmFoicZSKktpBjneQw',
                        toNodeId:
                            'IsRAivknyoyfmbcCZjuVBw',
                    },
                    {
                        id: 'WOduUWLIbQzXGeMpxpwcUw',
                        name:
                            'describe'
                            + ' solution',
                                    fromNodeId:
                            'IsRAivknyoyfmbcCZjuVBw',
                        toNodeId:
                            'qlLaFtVhSDnDKodahIPxlA',
                    },
                    {
                        id: 'QdoBbRvBAFbmMBqeJeObsA',
                        name: 'Describe',
                                    fromNodeId:
                            'qlLaFtVhSDnDKodahIPxlA',
                        toNodeId:
                            'TaUqYMjXHfqhHNPcdpWLIw',
                    },
                    {
                        id: 'BnZJxoFyXjjwZsnDuqZLkQ',
                        name:
                            'Define'
                            + ' & Measure',
                                    fromNodeId:
                            'TaUqYMjXHfqhHNPcdpWLIw',
                        toNodeId:
                            'mMQKSVSJlekhbuXzsxsudw',
                    },
                    {
                        id: 'RcyHCtuDebnRPDFlYrhfhA',
                        name:
                            'Click on field',
                                    fromNodeId:
                            'mMQKSVSJlekhbuXzsxsudw',
                        toNodeId:
                            'SrEmQKwUVTfGNndtAMxLrA',
                    },
                    {
                        id: 'RMeekEQiEMTDjBMitUlmlA',
                        name: 'Define',
                                    fromNodeId:
                            'SrEmQKwUVTfGNndtAMxLrA',
                        toNodeId:
                            'GYZhSglofqvZTiYzBCGjGw',
                    },
                    {
                        id: 'NzpapTItVOGFJHNmyVaCrg',
                        name: 'Estimate',
                                    fromNodeId:
                            'GYZhSglofqvZTiYzBCGjGw',
                        toNodeId:
                            'GPYtBNvOiUqvWVFqIyOBVA',
                    },
                    {
                        id: 'JuqtIlgjPDHWujEYZOzwrg',
                        name: 'Estimate',
                                    fromNodeId:
                            'GPYtBNvOiUqvWVFqIyOBVA',
                        toNodeId:
                            'AyJygNtqSPuayooRqOJBwg',
                    },
                    {
                        id: 'EMzPoxjuSkTSQNvLzzkOgA',
                        name: 'Estimate',
                                    fromNodeId:
                            'AyJygNtqSPuayooRqOJBwg',
                        toNodeId:
                            'MSQSsxyYmOJMqzWjLxHBiw',
                    },
                    {
                        id: 'mtTJAhgSLRJbaBaDNoAaNw',
                        name: 'Submit',
                                    fromNodeId:
                            'MSQSsxyYmOJMqzWjLxHBiw',
                        toNodeId:
                            'zGHsUMZEvMfSzFrauBghLg',
                    },
                    {
                        id: 'yxImzWVDsFMngOCsPfSYeQ',
                        name: 'Review',
                                    fromNodeId:
                            'zGHsUMZEvMfSzFrauBghLg',
                        toNodeId:
                            'EGfkcbLephJtgaWLrTamOA',
                    },
                    {
                        id: 'BkKLiCzjLSvxMEvOOKuAdw',
                        name: 'Select',
                                    fromNodeId:
                            'EGfkcbLephJtgaWLrTamOA',
                        toNodeId:
                            'WGdQUVyBEHCSEYKShdcZRA',
                    },
                    {
                        id: 'BALQYnGVHVzklVgntpydsQ',
                        name: 'Decline',
                                    fromNodeId:
                            'WGdQUVyBEHCSEYKShdcZRA',
                        toNodeId:
                            'EGfkcbLephJtgaWLrTamOA',
                    },
                    {
                        id: 'QgXroXwAQnwoRTVoaWwCMw',
                        name: 'Review',
                                    fromNodeId:
                            'WGdQUVyBEHCSEYKShdcZRA',
                        toNodeId:
                            'JRwwQolZMzAiHXbqbZSZVg',
                    },
                    {
                        id: 'MiGdIEIvmUQLgNTyHxBQiQ',
                        name: 'Approve',
                                    fromNodeId:
                            'JRwwQolZMzAiHXbqbZSZVg',
                        toNodeId:
                            'FHxCElVIzQJRSSypTLqqUQ',
                    },
                    {
                        id: 'fevkMUKXdxDolijYEpflFg',
                        name: 'Released',
                                    fromNodeId:
                            'FHxCElVIzQJRSSypTLqqUQ',
                        toNodeId:
                            'nvYQsuyNZiXQwZkXziakpg',
                    },
                ],
            },
        },
        {
            id: 'DDUhYDIRInXtIrRraxcyHQ',
            name:
                'Layout Test: Proposal Review Cycle',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: {
                nodes: [
                    {
                        id: 'rLwBHMzOGoGQzUcRgYwSMQ',
                        name: 'Create',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: true,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'MelwPladvnAMEuMwjUiRfg',
                        name: 'Draft',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'RCkRIKgSrRXeLFJFIIEWvw',
                        name: 'Submit',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'ODtydttdBiCPLFyxqvJsSg',
                        name: 'Triage',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'NlcdFRgrFGDkHirNJrjVXw',
                        name: 'Quick Review',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'CGJGvTHcUqNYlEILWXigEw',
                        name: 'Standard Review',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'zmrGttanQsUWprQCreAueA',
                        name: 'Deep Review',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'BMNsHyzKcWmSacYSNjrIYA',
                        name: 'Panel A',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'SrOmrYwRBnvEAYdJjRyfow',
                        name: 'Panel B',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'PViEiUEdiLPehXXidtHGlQ',
                        name: 'Panel C',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'zJFfSLLrNyxaXVZpVcbkag',
                        name: 'Panel D',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'rGpurISMLNYcpIpGnQhxkg',
                        name: 'Consolidate',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'rTMOibpdwsbFUfauowfyPg',
                        name: 'Decision',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'CHekPYKmopdmcKTuHxquaw',
                        name: 'Approved',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'DyyunbBYDwJxrTOhvRhYYw',
                        name: 'Revise',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'IXSVdcSYnDzUcIgRhwNQjA',
                        name: 'Rejected',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                    {
                        id: 'EaERqxsxebTdSPoZvihWjg',
                        name: 'Archive',
                                    positionX: 0,
                        positionY: 0,
                        isCreate: false,
                        isArchive: true,
                        taskInstructions: '',
                        memberIds: [],
                        attributes: [],
                    },
                ],
                edges: [
                    {
                        id: 'XjAshGwTqQAngtfRxvrShw',
                        name: 'begin',
                                    fromNodeId:
                            'rLwBHMzOGoGQzUcRgYwSMQ',
                        toNodeId:
                            'MelwPladvnAMEuMwjUiRfg',
                    },
                    {
                        id: 'fgsvDpAsADaXaYyTeiLrUw',
                        name: 'ready',
                                    fromNodeId:
                            'MelwPladvnAMEuMwjUiRfg',
                        toNodeId:
                            'RCkRIKgSrRXeLFJFIIEWvw',
                    },
                    {
                        id: 'JOfnHnYoCcwVOixtCHBEWQ',
                        name: 'submitted',
                                    fromNodeId:
                            'RCkRIKgSrRXeLFJFIIEWvw',
                        toNodeId:
                            'ODtydttdBiCPLFyxqvJsSg',
                    },
                    {
                        id: 'vCCQutzMhHehRmwlkObmbw',
                        name: 'quick',
                                    fromNodeId:
                            'ODtydttdBiCPLFyxqvJsSg',
                        toNodeId:
                            'NlcdFRgrFGDkHirNJrjVXw',
                    },
                    {
                        id: 'XjEVXSteWyKjhYUSCRALyA',
                        name: 'standard',
                                    fromNodeId:
                            'ODtydttdBiCPLFyxqvJsSg',
                        toNodeId:
                            'CGJGvTHcUqNYlEILWXigEw',
                    },
                    {
                        id: 'IGXMIrAkQQXWRLPOexhUpQ',
                        name: 'deep',
                                    fromNodeId:
                            'ODtydttdBiCPLFyxqvJsSg',
                        toNodeId:
                            'zmrGttanQsUWprQCreAueA',
                    },
                    {
                        id: 'ZkxuoYWTJKofFnqpqCqUzQ',
                        name: 'panel A',
                                    fromNodeId:
                            'zmrGttanQsUWprQCreAueA',
                        toNodeId:
                            'BMNsHyzKcWmSacYSNjrIYA',
                    },
                    {
                        id: 'SzVrKdbMvCPcDiMKdjJRhQ',
                        name: 'panel B',
                                    fromNodeId:
                            'zmrGttanQsUWprQCreAueA',
                        toNodeId:
                            'SrOmrYwRBnvEAYdJjRyfow',
                    },
                    {
                        id: 'SMrRQCHsFyChWLNfgpzrhA',
                        name: 'panel C',
                                    fromNodeId:
                            'zmrGttanQsUWprQCreAueA',
                        toNodeId:
                            'PViEiUEdiLPehXXidtHGlQ',
                    },
                    {
                        id: 'nOeAvHzaGUlFEdzhazDVhw',
                        name: 'panel D',
                                    fromNodeId:
                            'zmrGttanQsUWprQCreAueA',
                        toNodeId:
                            'zJFfSLLrNyxaXVZpVcbkag',
                    },
                    {
                        id: 'IQzMZJxpVZrFjFgWZBrkhg',
                        name: 'A done',
                                    fromNodeId:
                            'BMNsHyzKcWmSacYSNjrIYA',
                        toNodeId:
                            'rGpurISMLNYcpIpGnQhxkg',
                    },
                    {
                        id: 'CyQmAWXPPmZWvNHbYGHbng',
                        name: 'B done',
                                    fromNodeId:
                            'SrOmrYwRBnvEAYdJjRyfow',
                        toNodeId:
                            'rGpurISMLNYcpIpGnQhxkg',
                    },
                    {
                        id: 'xFqTjHvdkLNALVuauVioJg',
                        name: 'C done',
                                    fromNodeId:
                            'PViEiUEdiLPehXXidtHGlQ',
                        toNodeId:
                            'rGpurISMLNYcpIpGnQhxkg',
                    },
                    {
                        id: 'xElhLFOdmawOqiSykyvuFg',
                        name: 'D done',
                                    fromNodeId:
                            'zJFfSLLrNyxaXVZpVcbkag',
                        toNodeId:
                            'rGpurISMLNYcpIpGnQhxkg',
                    },
                    {
                        id: 'zKjsuXPmNyQNEcmJoVuAgQ',
                        name: 'to decision',
                                    fromNodeId:
                            'NlcdFRgrFGDkHirNJrjVXw',
                        toNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                    },
                    {
                        id: 'wwTAnfPutLlMxxBtaUphoQ',
                        name: 'to decision',
                                    fromNodeId:
                            'CGJGvTHcUqNYlEILWXigEw',
                        toNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                    },
                    {
                        id: 'QNhrSKfcsKFXFlECUZhyLg',
                        name: 'synthesized',
                                    fromNodeId:
                            'rGpurISMLNYcpIpGnQhxkg',
                        toNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                    },
                    {
                        id: 'ZjLKMAcMolimouzQXSsirw',
                        name: 'approve',
                                    fromNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                        toNodeId:
                            'CHekPYKmopdmcKTuHxquaw',
                    },
                    {
                        id: 'gGKAWsrpUNFVigtlJQxCYA',
                        name: 'revise',
                                    fromNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                        toNodeId:
                            'DyyunbBYDwJxrTOhvRhYYw',
                    },
                    {
                        id: 'CnajzBgxkLqFfJlqlbHbdQ',
                        name: 'reject',
                                    fromNodeId:
                            'rTMOibpdwsbFUfauowfyPg',
                        toNodeId:
                            'IXSVdcSYnDzUcIgRhwNQjA',
                    },
                    {
                        id: 'shVAtzMOVrQNifyLsaIiEA',
                        name: 'done',
                                    fromNodeId:
                            'CHekPYKmopdmcKTuHxquaw',
                        toNodeId:
                            'EaERqxsxebTdSPoZvihWjg',
                    },
                    {
                        id: 'eNprVEJFPGJdYRhnKNxVsg',
                        name: 'done',
                                    fromNodeId:
                            'IXSVdcSYnDzUcIgRhwNQjA',
                        toNodeId:
                            'EaERqxsxebTdSPoZvihWjg',
                    },
                    {
                        id: 'txieWmAdbSTRDAZIghdvag',
                        name: 'back to draft',
                                    fromNodeId:
                            'DyyunbBYDwJxrTOhvRhYYw',
                        toNodeId:
                            'MelwPladvnAMEuMwjUiRfg',
                    },
                ],
            },
        },
        {
            id: l2cFlowId,
            name: 'Lead-to-Close',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: {
                nodes: leadToCloseNodes,
                edges: leadToCloseEdges,
            },
        },
    ];
}

// The four relation row-sets a flow's authored graph literal
// decomposes into — the normalized graph truth (F-131). Derived
// FROM the build-time literal through asStoredGraph;
// reassembleStoredGraph is the inverse at the read seam.
export interface FlowGraphRelations {
    nodes: FlowNodeEntity[];
    edges: FlowEdgeEntity[];
    members: FlowNodeMemberEntity[];
    attributes: FlowNodeAttributeEntity[];
}

// Decompose each seeded flow's graph blob into its relations.
// Node/edge ids ARE the canvas ids (the real FK targets); each
// ledger row takes a deterministic seed id and the shared
// moment of union `at`. Members and attributes seed as 'added'
// — the dual-seed records unions, never dissolutions.
export function buildFlowGraphRelations(
    flows: readonly Pick<FlowSeed, 'id' | 'graph'>[],
    at: string,
): FlowGraphRelations {
    const nodes: FlowNodeEntity[] = [];
    const edges: FlowEdgeEntity[] = [];
    const members: FlowNodeMemberEntity[] = [];
    const attributes: FlowNodeAttributeEntity[] = [];
    for (const flow of flows) {
        const graph = asStoredGraph(
            flow.graph, 'seed flow ' + flow.id + ' graph',
        );
        for (const node of graph.nodes) {
            nodes.push({
                id: node.id,
                flow_id: flow.id,
                name: node.name,
                position_x: node.positionX,
                position_y: node.positionY,
                is_create: node.isCreate,
                is_archive: node.isArchive,
                task_instructions: node.taskInstructions,
                at,
            });
            for (const memberId of node.memberIds) {
                members.push({
                    id: seedIdentifier(
                        'seed-fnm-' + node.id
                            + '-' + memberId,
                    ),
                    flow_node_id: node.id,
                    member_id: memberId,
                    action: 'added',
                    at,
                });
            }
            for (const attribute of node.attributes) {
                attributes.push({
                    id: seedIdentifier(
                        'seed-fna-' + node.id
                            + '-' + attribute.attributeId,
                    ),
                    flow_node_id: node.id,
                    attribute_id: attribute.attributeId,
                    mode: attribute.mode,
                    is_required: attribute.isRequired,
                    action: 'added',
                    at,
                });
            }
        }
        for (const edge of graph.edges) {
            edges.push({
                id: edge.id,
                flow_id: flow.id,
                name: edge.name,
                from_node_id: edge.fromNodeId,
                to_node_id: edge.toNodeId,
                at,
            });
        }
    }
    return { nodes, edges, members, attributes };
}
