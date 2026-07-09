import type {
    FlowWithGraph,
    FlowNodeEntity,
    FlowEdgeEntity,
    FlowNodeMemberEntity,
    FlowNodeAttributeEntity,
} from '../types.ts';
import {
    jsonObjectField,
    DEFAULT_LOCK_TIMEOUT,
} from '../types.ts';
import {
    validateStoredGraphJson,
} from '../validators.ts';
import {
    l2cFlowId,
    buildLeadToCloseNodes,
    buildLeadToCloseEdges,
} from './lead-to-close-flow.ts';

// A build-time flow seed: the storage row's scalar fields PLUS
// the AUTHORED graph literal. `graph` is NOT a stored column
// (flows.graph is retired) — it is the seed input from which the
// relation rows are derived (buildFlowGraphRelations) and the
// work-order snapshots are taken. The composition root stores
// only the scalar fields and discards the literal. `hasUndoHistory`
// (Phase 14 Task 8) is COMPUTED at derivation time from this
// flow's own document-pair count, never stored or seeded — every
// freshly-seeded flow gets exactly one genesis document pair
// (seed-message-pairs.ts), so it derives to `false` regardless of
// what a seed literal might have said.
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
            id: 'h5mErVBQhwdMKwi1co30jB',
            name: 'Customer Onboarding',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'lzkYvFNCEHARBQmZ4YHAn4',
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
                        id: 'KoWNvvHG8d3TLAVN5nrWGX',
                        name:
                            'Data Capture',
                                    positionX: 260,
                        positionY: 140,
                        isCreate: false,
                        isArchive: false,
                        taskInstructions: '',
                        memberIds: [
                            'WxQn4LVWb76YkmqK5B0EPp',
                            'current',
                        ],
                        attributes: [
                            {
                                attribute_id:
                                    '5JZ0LeKdPCa4QMtg1RsF1M',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'nplTIh0qXNtAyoWSwRaBYe',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'kzHpMw9f1thq79VoBYeIX3',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'QsmqiOmPtoMLGpSjHOqdHA',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    '0TyjQRcygn3DIyXTe6x1F6',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    '8Z62tcRHBpwCRH1kBffx0G',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'aR8nKpQ9wEzVxL3CmBdYTf',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'mBrOOvQtZTTKb5TTnXvzXo',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'y9DiJ5QHNB5ho3K1n9myMc',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'wDcQp0cIycrtWXEde6IsB1',
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
                                    '5JZ0LeKdPCa4QMtg1RsF1M',
                                mode:
                                    'readonly',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'nplTIh0qXNtAyoWSwRaBYe',
                                mode:
                                    'readonly',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'AdQlKf43JV6yrhQbyskDkR',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                        ],
                    },
                    {
                        id: '8jSnGiQ4Hedb2G75Y5aT7O',
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
                        id: 'QExPxoB0w8pQzQZYa0xuoI',
                        name: 'begin',
                                    fromNodeId:
                            'lzkYvFNCEHARBQmZ4YHAn4',
                        toNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                    },
                    {
                        id: 'JOMWSa11urO1R4X2o7r6B9',
                        name: 'submit',
                                    fromNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                        toNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                    },
                    {
                        id: '7nRuNX7Hg9y6GFYWJrVBCH',
                        name:
                            'needs revision',
                                    fromNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                        toNodeId:
                            'KoWNvvHG8d3TLAVN5nrWGX',
                    },
                    {
                        id: '3EET89t3L1FrCQe2kFJVl5',
                        name: 'approve',
                                    fromNodeId:
                            'wDcQp0cIycrtWXEde6IsB1',
                        toNodeId:
                            '8jSnGiQ4Hedb2G75Y5aT7O',
                    },
                ],
            }),
        },
        {
            id: 'E2BnBlZyrriqsQYkmS4usb',
            name: 'Fusion Flow',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'N8iGVHrr3iv0OCqICw2oWo',
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
                        id: 'nKbwVydJZixw20nvP2XqfF',
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
                        id: 'aTGimTZZDvMb7iD9GuUbSG',
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
                        id: '6KXcks9x9Tl54iNGWQoXNN',
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
                                    'pBA01Pr0j3ctBr13fNm3T1',
                                mode:
                                    'editable',
                                isRequired:
                                    true,
                            },
                            {
                                attribute_id:
                                    'pBA02Pr0j3ctBr13fDsc02',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'HmpBNWHjANtDY4qtKZENOE',
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
                        id: 'q1OZ85FQGwEbtIbFQo8H5o',
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
                                    'pBA03Pr0j3ctBr13fPry03',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                            {
                                attribute_id:
                                    'pBA04Pr0j3ctBr13fApr04',
                                mode:
                                    'editable',
                                isRequired:
                                    false,
                            },
                        ],
                    },
                    {
                        id: 'Yt5GGbxJqVG5Ws4NrGWzDD',
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
                        id: 'm3sZ3Jk4ketOK9M9GD6qS1',
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
                        id: 'D5DUyVr3Azc8zfbqgMovTr',
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
                        id: '1TKczWqL7gndPvMGFxYWGI',
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
                        id: 'Woly7CQBAkkGpe3A21lXoz',
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
                        id: 'DOj4MO3NnhgCDKllZnxDWT',
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
                        id: 'Liv4abswHyIMx4kJz6dTFo',
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
                        id: 'yFZAcQT3sWkhyH0zB80nzH',
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
                        id: '9bPFthPRyPtvfXKti5Qtfo',
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
                        id: 'bNGKd3eRcKynXWfJRLPlx1',
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
                        id: 'Bxkqmeb8izINPj8fmDFh0s',
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
                        id: 'IwXZhOjZKETjhF6g9OJmeQ',
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
                        id: 'ZZScPB9Tsbybx2PZXhJjRi',
                        name: 'Create Idea',
                                    fromNodeId:
                            'N8iGVHrr3iv0OCqICw2oWo',
                        toNodeId:
                            'aTGimTZZDvMb7iD9GuUbSG',
                    },
                    {
                        id: '7XqroCtAynDGgi5Cm5VWae',
                        name:
                            'Create Title',
                                    fromNodeId:
                            'aTGimTZZDvMb7iD9GuUbSG',
                        toNodeId:
                            '6KXcks9x9Tl54iNGWQoXNN',
                    },
                    {
                        id: 'OB2L6yx8cOP91ulckc65md',
                        name: 'submit',
                                    fromNodeId:
                            '6KXcks9x9Tl54iNGWQoXNN',
                        toNodeId:
                            'HmpBNWHjANtDY4qtKZENOE',
                    },
                    {
                        id: 'bkx8cmU6yHT1YpjhTP3Rvm',
                        name:
                            'describe'
                            + ' solution',
                                    fromNodeId:
                            'HmpBNWHjANtDY4qtKZENOE',
                        toNodeId:
                            'q1OZ85FQGwEbtIbFQo8H5o',
                    },
                    {
                        id: 'RqvW7TTPDBfupjFFxdeznR',
                        name: 'Describe',
                                    fromNodeId:
                            'q1OZ85FQGwEbtIbFQo8H5o',
                        toNodeId:
                            'Yt5GGbxJqVG5Ws4NrGWzDD',
                    },
                    {
                        id: '4M5lJHKqGzId1jwsI14QZi',
                        name:
                            'Define'
                            + ' & Measure',
                                    fromNodeId:
                            'Yt5GGbxJqVG5Ws4NrGWzDD',
                        toNodeId:
                            'm3sZ3Jk4ketOK9M9GD6qS1',
                    },
                    {
                        id: 'UT7eoykdOetOZeCopKfefM',
                        name:
                            'Click on field',
                                    fromNodeId:
                            'm3sZ3Jk4ketOK9M9GD6qS1',
                        toNodeId:
                            'Woly7CQBAkkGpe3A21lXoz',
                    },
                    {
                        id: 'TTSKHNukJrKUYDvx5f1fsu',
                        name: 'Define',
                                    fromNodeId:
                            'Woly7CQBAkkGpe3A21lXoz',
                        toNodeId:
                            'DOj4MO3NnhgCDKllZnxDWT',
                    },
                    {
                        id: 'NmnbQwAHCgTmPKdWmI3Hfm',
                        name: 'Estimate',
                                    fromNodeId:
                            'DOj4MO3NnhgCDKllZnxDWT',
                        toNodeId:
                            'D5DUyVr3Azc8zfbqgMovTr',
                    },
                    {
                        id: 'K9anHKnA8oQnPxzcgocMmj',
                        name: 'Estimate',
                                    fromNodeId:
                            'D5DUyVr3Azc8zfbqgMovTr',
                        toNodeId:
                            '1TKczWqL7gndPvMGFxYWGI',
                    },
                    {
                        id: '9gfjcvJO0ZapJqovdeaKPX',
                        name: 'Estimate',
                                    fromNodeId:
                            '1TKczWqL7gndPvMGFxYWGI',
                        toNodeId:
                            'Liv4abswHyIMx4kJz6dTFo',
                    },
                    {
                        id: 'm3tfkY46Fa0pELrQ5h7IO2',
                        name: 'Submit',
                                    fromNodeId:
                            'Liv4abswHyIMx4kJz6dTFo',
                        toNodeId:
                            'yFZAcQT3sWkhyH0zB80nzH',
                    },
                    {
                        id: 'xHsuRI5N8KY0EFUVMPtSqo',
                        name: 'Review',
                                    fromNodeId:
                            'yFZAcQT3sWkhyH0zB80nzH',
                        toNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                    },
                    {
                        id: '483GMjR0CxRWqzmqeusZDi',
                        name: 'Select',
                                    fromNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                        toNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                    },
                    {
                        id: '1uOW9HWwpQ5UHz30pSE8sh',
                        name: 'Decline',
                                    fromNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                        toNodeId:
                            '9bPFthPRyPtvfXKti5Qtfo',
                    },
                    {
                        id: 'SOLWdDhsGPdfiYHzqIYneC',
                        name: 'Review',
                                    fromNodeId:
                            'bNGKd3eRcKynXWfJRLPlx1',
                        toNodeId:
                            'IwXZhOjZKETjhF6g9OJmeQ',
                    },
                    {
                        id: 'M9YyQWNFvu9mDWamXMvoRJ',
                        name: 'Approve',
                                    fromNodeId:
                            'IwXZhOjZKETjhF6g9OJmeQ',
                        toNodeId:
                            'Bxkqmeb8izINPj8fmDFh0s',
                    },
                    {
                        id: 'hniGGFLzDWLJDYi6Kvhbcz',
                        name: 'Released',
                                    fromNodeId:
                            'Bxkqmeb8izINPj8fmDFh0s',
                        toNodeId:
                            'nKbwVydJZixw20nvP2XqfF',
                    },
                ],
            }),
        },
        {
            id: '7COt7Kf4OaOBg6AjaNO04s',
            name:
                'Layout Test: Proposal Review Cycle',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout: DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: [
                    {
                        id: 'qfuFbfKwwlpKAewu3Uujb7',
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
                        id: 'M3HcytVGj8JNjrFS0AyVfA',
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
                        id: 'T6I6dn4MKD50QZXlvxIm9I',
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
                        id: 'OHPERFEO1EMfDoGZnccF5F',
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
                        id: 'NHIpcNdKKV4gbT4QOkkXEO',
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
                        id: '4z9uXoChh9HjMTEHfZQhAk',
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
                        id: 'zO7tsd7ndwm2uQDwS30EzR',
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
                        id: '32hICE8mCh9Ch0CMYyjEXR',
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
                        id: 'WwjEFe4v1am6etJDQqg0mi',
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
                        id: 'PU9ueWLOmK247RFNDwuh4R',
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
                        id: 'ybr0XraIXnlbOhYRmBnkz6',
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
                        id: 'qSJo6DFKY52Y0815TFax01',
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
                        id: 'rWdJ5vz4hm9dLVhBYROSoK',
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
                        id: '4zi5yzNsiA89SzrcEityhr',
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
                        id: '8yXx35sqhjAb3lfkSWbsG2',
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
                        id: 'HJBEhUvJ4rA9x8y3s2iVKZ',
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
                        id: '9r0eSQ4ndyaRoYbKTTDpW2',
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
                        id: 'd7PuQ9Zy29gFyzGPN4RpB3',
                        name: 'begin',
                                    fromNodeId:
                            'qfuFbfKwwlpKAewu3Uujb7',
                        toNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                    },
                    {
                        id: 'hsx6jDHfnhYjAyt38lhE55',
                        name: 'ready',
                                    fromNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                        toNodeId:
                            'T6I6dn4MKD50QZXlvxIm9I',
                    },
                    {
                        id: 'Ipx62MKIlQyFnGJ9QGYIFc',
                        name: 'submitted',
                                    fromNodeId:
                            'T6I6dn4MKD50QZXlvxIm9I',
                        toNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                    },
                    {
                        id: 'tdwLKK3AkUQ7ktWGtrtFvN',
                        name: 'quick',
                                    fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            'NHIpcNdKKV4gbT4QOkkXEO',
                    },
                    {
                        id: 'dD0IU0SRzeefvOwpCNralx',
                        name: 'standard',
                                    fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            '4z9uXoChh9HjMTEHfZQhAk',
                    },
                    {
                        id: 'GeTN4gJRAjQMT7I8SiIBWm',
                        name: 'deep',
                                    fromNodeId:
                            'OHPERFEO1EMfDoGZnccF5F',
                        toNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                    },
                    {
                        id: 'fesMrzvcP7sjL4NukvoOgL',
                        name: 'panel A',
                                    fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            '32hICE8mCh9Ch0CMYyjEXR',
                    },
                    {
                        id: 'XbZxNKiFmWRM7958GGtzaQ',
                        name: 'panel B',
                                    fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'WwjEFe4v1am6etJDQqg0mi',
                    },
                    {
                        id: 'VHwKGtKxu4SxHw7XeQa7QQ',
                        name: 'panel C',
                                    fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'PU9ueWLOmK247RFNDwuh4R',
                    },
                    {
                        id: 'mHXz4czc4mmYXFDlAx6a6c',
                        name: 'panel D',
                                    fromNodeId:
                            'zO7tsd7ndwm2uQDwS30EzR',
                        toNodeId:
                            'ybr0XraIXnlbOhYRmBnkz6',
                    },
                    {
                        id: 'H3YmWhVQiXvOpkTGBGHZ3M',
                        name: 'A done',
                                    fromNodeId:
                            '32hICE8mCh9Ch0CMYyjEXR',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: '6mi4SitxXSt2cqN4Fi6j9i',
                        name: 'B done',
                                    fromNodeId:
                            'WwjEFe4v1am6etJDQqg0mi',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'vBNJ1EpY3GAnUli7yqgQuy',
                        name: 'C done',
                                    fromNodeId:
                            'PU9ueWLOmK247RFNDwuh4R',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'v5zoVkTe9K1YfBbPmYiFwY',
                        name: 'D done',
                                    fromNodeId:
                            'ybr0XraIXnlbOhYRmBnkz6',
                        toNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                    },
                    {
                        id: 'ycnonq2kyeYWBSyfbkJsw8',
                        name: 'to decision',
                                    fromNodeId:
                            'NHIpcNdKKV4gbT4QOkkXEO',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'uYtL09fL3FAXnH5zk5wb3g',
                        name: 'to decision',
                                    fromNodeId:
                            '4z9uXoChh9HjMTEHfZQhAk',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'R6kZDZixNfCpz0a3DfE8ti',
                        name: 'synthesized',
                                    fromNodeId:
                            'qSJo6DFKY52Y0815TFax01',
                        toNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                    },
                    {
                        id: 'fUwITjW5uJkLFGZ4oPmVv0',
                        name: 'approve',
                                    fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            '4zi5yzNsiA89SzrcEityhr',
                    },
                    {
                        id: 'iEsz7rc6GfplC6wWzHJvK2',
                        name: 'revise',
                                    fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            '8yXx35sqhjAb3lfkSWbsG2',
                    },
                    {
                        id: '6iEoMDVIbOoniZ1bxgV3HA',
                        name: 'reject',
                                    fromNodeId:
                            'rWdJ5vz4hm9dLVhBYROSoK',
                        toNodeId:
                            'HJBEhUvJ4rA9x8y3s2iVKZ',
                    },
                    {
                        id: 'rrAD5jbsCqKxnrJXkROXKr',
                        name: 'done',
                                    fromNodeId:
                            '4zi5yzNsiA89SzrcEityhr',
                        toNodeId:
                            '9r0eSQ4ndyaRoYbKTTDpW2',
                    },
                    {
                        id: 'gS7JmZcHknZ06T41zSTtYt',
                        name: 'done',
                                    fromNodeId:
                            'HJBEhUvJ4rA9x8y3s2iVKZ',
                        toNodeId:
                            '9r0eSQ4ndyaRoYbKTTDpW2',
                    },
                    {
                        id: 'sfrAXlOXTtoqUuNQCwTbet',
                        name: 'back to draft',
                                    fromNodeId:
                            '8yXx35sqhjAb3lfkSWbsG2',
                        toNodeId:
                            'M3HcytVGj8JNjrFS0AyVfA',
                    },
                ],
            }),
        },
        {
            id: l2cFlowId,
            name: 'Lead-to-Close',
            is_locked: false,
            is_auto_layout: true,
            is_auto_fit: true,
            lock_timeout:
                DEFAULT_LOCK_TIMEOUT,
            graph: jsonObjectField({
                nodes: leadToCloseNodes,
                edges: leadToCloseEdges,
            }),
        },
    ];
}

// The four relation row-sets a flow's authored graph literal
// decomposes into — the normalized graph truth (F-131). Derived
// FROM the build-time literal through validateStoredGraphJson;
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
        const graph = validateStoredGraphJson(
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
                    id: 'seed-fnm-' + node.id
                        + '-' + memberId,
                    flow_node_id: node.id,
                    member_id: memberId,
                    action: 'added',
                    at,
                });
            }
            for (const attribute of node.attributes) {
                attributes.push({
                    id: 'seed-fna-' + node.id
                        + '-' + attribute.attributeId,
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
