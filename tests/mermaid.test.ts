import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    generateMermaid,
} from '../web-app/app/mermaid-generate.ts';
import {
    parseMermaid,
} from '../web-app/app/mermaid-parse.ts';

const minimalGraph = {
    id: 'f1',
    name: 'Flow',
    description: '',
    isLocked: false,
    isAutoLayout: true,
    isAutoFit: true,
    lockTimeout: 0,
    nodes: [],
    edges: [],
} as const;

test('generateMermaid emits flowchart LR header', () => {
    const result = generateMermaid(
        minimalGraph as never,
    );
    assert.equal(
        result.split('\n')[0],
        'flowchart LR',
    );
});

test('generateMermaid emits start with stadium brackets', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'n1',
                name: 'Begin',
                description: '',
                positionX: 0,
                positionY: 0,
                isCreate: true,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.match(result, /n1\(\[Begin\]\)/);
});

test('generateMermaid emits complete with triple parens', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'n2',
                name: 'Archive',
                description: '',
                positionX: 0,
                positionY: 0,
                isCreate: false,
                isArchive: true,
                workerIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.match(result, /n2\(\(\(Archive\)\)\)/);
});

test('generateMermaid sanitizes dashes in IDs', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'a-b-c',
                name: 'X',
                description: '',
                positionX: 0,
                positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.match(result, /a_b_c\[X\]/);
    assert.doesNotMatch(result, /a-b-c/);
});

test('generateMermaid emits labeled edges', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'a', name: 'A',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
            {
                id: 'b', name: 'B',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'e1', fromNodeId: 'a',
                toNodeId: 'b', name: 'go',
            },
        ],
    } as never);
    assert.match(
        result,
        /a -->\|go\| b/,
    );
});

test('generateMermaid emits unlabeled edges', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'a', name: 'A',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
            {
                id: 'b', name: 'B',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'e1', fromNodeId: 'a',
                toNodeId: 'b', name: '',
            },
        ],
    } as never);
    assert.match(result, /a --> b/);
    assert.doesNotMatch(result, /\|/);
});

test('generateMermaid quotes labels with special chars', () => {
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: 'n1',
                name: 'Has [bracket]',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.match(
        result,
        /n1\["Has \[bracket\]"\]/,
    );
});

test('parseMermaid extracts simple flowchart', () => {
    const text = [
        'flowchart LR',
        '  a[Alpha]',
        '  b[Beta]',
        '  a --> b',
    ].join('\n');
    const parsed = parseMermaid(text);
    assert.equal(parsed.nodes.length, 2);
    assert.equal(parsed.edges.length, 1);
    assert.equal(
        parsed.nodes[0]?.name, 'Alpha',
    );
    assert.equal(
        parsed.edges[0]?.fromId, 'a',
    );
    assert.equal(
        parsed.edges[0]?.toId, 'b',
    );
});

test('parseMermaid recognizes start and complete', () => {
    const text = [
        'flowchart LR',
        '  s([Start])',
        '  e(((End)))',
    ].join('\n');
    const parsed = parseMermaid(text);
    const start = parsed.nodes.find(
        n => n.isCreate,
    );
    const end = parsed.nodes.find(
        n => n.isArchive,
    );
    assert.equal(start?.name, 'Start');
    assert.equal(end?.name, 'End');
});

test('parseMermaid extracts labeled edges', () => {
    const text = [
        'flowchart LR',
        '  a[A]',
        '  b[B]',
        '  a -->|approved| b',
    ].join('\n');
    const parsed = parseMermaid(text);
    assert.equal(
        parsed.edges[0]?.name, 'approved',
    );
});

test('mermaid round-trip preserves structure', () => {
    const original = {
        ...minimalGraph,
        nodes: [
            {
                id: 's', name: 'Create',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: true,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
            {
                id: 'm', name: 'Middle',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                workerIds: [],
                attributes: [],
            },
            {
                id: 'e', name: 'Archive',
                description: '',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: true,
                workerIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'e1', fromNodeId: 's',
                toNodeId: 'm', name: '',
            },
            {
                id: 'e2', fromNodeId: 'm',
                toNodeId: 'e', name: 'done',
            },
        ],
    } as never;
    const text = generateMermaid(original);
    const parsed = parseMermaid(text);
    assert.equal(parsed.nodes.length, 3);
    assert.equal(parsed.edges.length, 2);
    assert.equal(
        parsed.nodes.filter(n => n.isCreate).length,
        1,
    );
    assert.equal(
        parsed.nodes.filter(n => n.isArchive).length,
        1,
    );
    assert.equal(
        parsed.edges[1]?.name, 'done',
    );
});
