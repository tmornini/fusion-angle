import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    generateMermaid,
    mermaidIdOf,
} from '../web-app/app/mermaid-generate.ts';
import {
    parseMermaid,
} from '../web-app/app/mermaid-parse.ts';
import {
    encodeIdentifier,
    generateIdentifier,
} from '../shared/identifier.ts';

const minimalGraph = {
    id: 'ZOousbbnzpqlxJExVAruYQ',
    name: 'Flow',
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
    const id = generateIdentifier();
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id,
                name: 'Begin',
                positionX: 0,
                positionY: 0,
                isCreate: true,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.ok(result.includes(
        mermaidIdOf(id) + '([Begin])',
    ));
});

test('generateMermaid emits complete with triple parens', () => {
    const id = generateIdentifier();
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id,
                name: 'Archive',
                positionX: 0,
                positionY: 0,
                isCreate: false,
                isArchive: true,
                memberIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.ok(result.includes(
        mermaidIdOf(id) + '(((Archive)))',
    ));
});

test('generateMermaid mermaid ids are injective', () => {
    const dashBytes = new Uint8Array(16);
    dashBytes[0] = 62 << 2;
    const underBytes = new Uint8Array(16);
    underBytes[0] = 63 << 2;
    const dashId = encodeIdentifier(dashBytes);
    const underId = encodeIdentifier(underBytes);
    let diffs = 0;
    for (let i = 0; i < dashId.length; i++) {
        if (dashId[i] !== underId[i]) {
            diffs += 1;
            assert.equal(dashId[i], '-');
            assert.equal(underId[i], '_');
        }
    }
    assert.equal(diffs, 1);
    assert.notEqual(
        mermaidIdOf(dashId),
        mermaidIdOf(underId),
    );
    assert.match(
        mermaidIdOf(dashId),
        /^[0-9a-f]{32}$/,
    );
    assert.match(
        mermaidIdOf(underId),
        /^[0-9a-f]{32}$/,
    );
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: dashId,
                name: 'Dash',
                positionX: 0,
                positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
            {
                id: underId,
                name: 'Under',
                positionX: 0,
                positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
        ],
    } as never);
    const dashHex = mermaidIdOf(dashId);
    const underHex = mermaidIdOf(underId);
    assert.ok(result.includes(dashHex + '[Dash]'));
    assert.ok(
        result.includes(underHex + '[Under]'),
    );
    assert.ok(!result.includes(dashId));
    assert.ok(!result.includes(underId));
});

test('generateMermaid emits labeled edges', () => {
    const fromId = generateIdentifier();
    const toId = generateIdentifier();
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: fromId, name: 'A',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
            {
                id: toId, name: 'B',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg',
                fromNodeId: fromId,
                toNodeId: toId, name: 'go',
            },
        ],
    } as never);
    assert.ok(result.includes(
        mermaidIdOf(fromId)
            + ' -->|go| '
            + mermaidIdOf(toId),
    ));
});

test('generateMermaid emits unlabeled edges', () => {
    const fromId = generateIdentifier();
    const toId = generateIdentifier();
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id: fromId, name: 'A',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
            {
                id: toId, name: 'B',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg',
                fromNodeId: fromId,
                toNodeId: toId, name: '',
            },
        ],
    } as never);
    assert.ok(result.includes(
        mermaidIdOf(fromId)
            + ' --> '
            + mermaidIdOf(toId),
    ));
    assert.doesNotMatch(result, /\|/);
});

test('generateMermaid quotes labels with special chars', () => {
    const id = generateIdentifier();
    const result = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id,
                name: 'Has [bracket]',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
        ],
    } as never);
    assert.ok(result.includes(
        mermaidIdOf(id)
            + '["Has [bracket]"]',
    ));
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
    const startId = generateIdentifier();
    const midId = generateIdentifier();
    const endId = generateIdentifier();
    const original = {
        ...minimalGraph,
        nodes: [
            {
                id: startId, name: 'Create',
                positionX: 0, positionY: 0,
                isCreate: true,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
            {
                id: midId, name: 'Middle',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: false,
                memberIds: [],
                attributes: [],
            },
            {
                id: endId, name: 'Archive',
                positionX: 0, positionY: 0,
                isCreate: false,
                isArchive: true,
                memberIds: [],
                attributes: [],
            },
        ],
        edges: [
            {
                id: 'YiJPbufDpkyrZcZCYbUJpg',
                fromNodeId: startId,
                toNodeId: midId, name: '',
            },
            {
                id: generateIdentifier(),
                fromNodeId: midId,
                toNodeId: endId, name: 'done',
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

// Mermaid is topology only: node task
// instructions deliberately do NOT round-trip.
// Pin it so a future reader does not "fix" it.
test('mermaid drops node task instructions', () => {
    const id = generateIdentifier();
    const text = generateMermaid({
        ...minimalGraph,
        nodes: [
            {
                id, name: 'Create',
                positionX: 0, positionY: 0,
                isCreate: true,
                isArchive: false,
                memberIds: [],
                attributes: [],
                taskInstructions:
                    'SECRET INSTRUCTIONS',
            },
        ],
        edges: [],
    } as never);
    assert.ok(
        !text.includes('SECRET INSTRUCTIONS'),
    );
});

test('parseMermaid throws on an unsupported diagram type', () => {
    assert.throws(
        () => parseMermaid('sequenceDiagram\n  A->>B: hi'),
        /Unsupported mermaid diagram/,
    );
});

test('parseMermaid parses a state diagram pseudo-states',
() => {
    const result = parseMermaid(
        'stateDiagram-v2\n'
        + '[*] --> Active\n'
        + 'Active --> [*]',
    );
    // [*] resolves to Create/Archive pseudo nodes.
    const names = result.nodes.map(n => n.name);
    assert.ok(names.includes('Active'));
    assert.ok(names.includes('Create'));
    assert.ok(names.includes('Archive'));
    assert.equal(result.edges.length, 2);
});

test('parseMermaid keeps edge label begin', () => {
    const text = [
        'flowchart LR',
        '  s([Create])',
        '  a[Capture]',
        '  e(((Archive)))',
        '  s -->|begin| a',
        '  a -->|submit| e',
    ].join('\n');
    const parsed = parseMermaid(text);
    assert.equal(parsed.edges.length, 2);
    assert.equal(
        parsed.edges[0]?.name, 'begin',
    );
    assert.equal(
        parsed.edges[1]?.name, 'submit',
    );
});

test(
    'generateMermaid round-trip keeps begin',
    () => {
        const startId = generateIdentifier();
        const midId = generateIdentifier();
        const endId = generateIdentifier();
        const original = {
            ...minimalGraph,
            nodes: [
                {
                    id: startId, name: 'Create',
                    positionX: 0, positionY: 0,
                    isCreate: true,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                },
                {
                    id: midId, name: 'Capture',
                    positionX: 0, positionY: 0,
                    isCreate: false,
                    isArchive: false,
                    memberIds: [],
                    attributes: [],
                },
                {
                    id: endId, name: 'Archive',
                    positionX: 0, positionY: 0,
                    isCreate: false,
                    isArchive: true,
                    memberIds: [],
                    attributes: [],
                },
            ],
            edges: [
                {
                    id: generateIdentifier(),
                    fromNodeId: startId,
                    toNodeId: midId,
                    name: 'begin',
                },
                {
                    id: generateIdentifier(),
                    fromNodeId: midId,
                    toNodeId: endId,
                    name: 'submit',
                },
            ],
        } as never;
        const text = generateMermaid(original);
        const parsed = parseMermaid(text);
        assert.equal(parsed.edges.length, 2);
        const names = parsed.edges
            .map(e => e.name)
            .sort();
        assert.deepEqual(
            names, ['begin', 'submit'],
        );
    },
);
