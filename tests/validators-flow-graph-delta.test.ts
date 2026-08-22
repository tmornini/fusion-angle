import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateFlowGraphDelta,
} from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const FLOW_ID = 'aEsGMmBEFaVdWihhHXwCbw';
const NODE_ID = generateIdentifier();
const NODE_ID_B = generateIdentifier();
const EDGE_ID = 'YiJPbufDpkyrZcZCYbUJpg';
const DELETION_EVENT_ID = generateIdentifier();
const MEMBER_EVENT_ID = generateIdentifier();
const ATTR_EVENT_ID = generateIdentifier();

// A minimal well-formed delta
function makeDelta(): Record<string, unknown> {
    return {
        nodes: [],
        edges: [],
        deletions: [],
        memberEvents: [],
        attributeEvents: [],
    };
}

// ── top-level shape ───────────

test('well-formed empty delta round-trips', () => {
    const result = validateFlowGraphDelta(makeDelta());
    assert.equal(result.nodes.length, 0);
    assert.equal(result.edges.length, 0);
    assert.equal(result.deletions.length, 0);
    assert.equal(result.memberEvents.length, 0);
    assert.equal(result.attributeEvents.length, 0);
});

test('unknown top-level key throws ValidationError', () => {
    assert.throws(
        () => validateFlowGraphDelta(
            { ...makeDelta(), extra: true },
        ),
        ValidationError,
    );
});

test('missing top-level key throws ValidationError', () => {
    const { nodes: _n, ...rest } = makeDelta();
    assert.throws(
        () => validateFlowGraphDelta(rest),
        ValidationError,
    );
});

// ── node elements ─────────────

function makeNode(
    id = NODE_ID,
): Record<string, unknown> {
    return {
        id,
        flow_id: FLOW_ID,
        name: 'Draft',
        position_x: 0,
        position_y: 0,
        is_create: false,
        is_archive: false,
        task_instructions: '',
        at: AT,
    };
}

test('well-formed node round-trips', () => {
    const delta = {
        ...makeDelta(),
        nodes: [makeNode()],
    };
    const result = validateFlowGraphDelta(delta);
    assert.equal(result.nodes.length, 1);
    assert.equal(result.nodes[0]!.id, NODE_ID);
    assert.equal(result.nodes[0]!.flow_id, FLOW_ID);
});

test('node with markup id throws ValidationError', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            nodes: [makeNode('<svg>')],
        }),
        ValidationError,
    );
});

test('node with bad at throws ValidationError', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            nodes: [{ ...makeNode(), at: '2026-01-01' }],
        }),
        ValidationError,
    );
});

// ── edge elements ─────────────

function makeEdge(): Record<string, unknown> {
    return {
        id: EDGE_ID,
        flow_id: FLOW_ID,
        name: 'next',
        from_node_id: NODE_ID,
        to_node_id: NODE_ID_B,
        at: AT,
    };
}

test('well-formed edge round-trips', () => {
    const delta = {
        ...makeDelta(),
        edges: [makeEdge()],
    };
    const result = validateFlowGraphDelta(delta);
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0]!.id, EDGE_ID);
    assert.equal(result.edges[0]!.from_node_id, NODE_ID);
});

test('edge with markup to_node_id throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            edges: [{ ...makeEdge(), to_node_id: '<script>' }],
        }),
        ValidationError,
    );
});

// ── deletion elements ─────────

function makeDeletion(): Record<string, unknown> {
    return {
        eventId: DELETION_EVENT_ID,
        entityId: NODE_ID,
        at: AT,
    };
}

test('well-formed deletion round-trips', () => {
    const delta = {
        ...makeDelta(),
        deletions: [makeDeletion()],
    };
    const result = validateFlowGraphDelta(delta);
    assert.equal(result.deletions.length, 1);
    assert.equal(
        result.deletions[0]!.eventId, DELETION_EVENT_ID,
    );
    assert.equal(result.deletions[0]!.entityId, NODE_ID);
    assert.equal(result.deletions[0]!.at, AT);
});

test('deletion with empty eventId throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            deletions: [{ ...makeDeletion(), eventId: '' }],
        }),
        ValidationError,
    );
});

test('deletion with markup entityId throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            deletions: [
                { ...makeDeletion(), entityId: '<svg>' },
            ],
        }),
        ValidationError,
    );
});

test('deletion with bad at throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            deletions: [
                { ...makeDeletion(), at: '2026-01-01' },
            ],
        }),
        ValidationError,
    );
});

// ── member event elements ─────────────

function makeMemberEvent(): Record<string, unknown> {
    return {
        id: MEMBER_EVENT_ID,
        flow_node_id: NODE_ID,
        member_id: 'mFNSxZqywTSMXhgUTdTqtA',
        action: 'added',
        at: AT,
    };
}

test('well-formed memberEvent round-trips', () => {
    const delta = {
        ...makeDelta(),
        memberEvents: [makeMemberEvent()],
    };
    const result = validateFlowGraphDelta(delta);
    assert.equal(result.memberEvents.length, 1);
    assert.equal(
        result.memberEvents[0]!.id, MEMBER_EVENT_ID,
    );
    assert.equal(
        result.memberEvents[0]!.flow_node_id, NODE_ID,
    );
    assert.equal(
        result.memberEvents[0]!.member_id, 'mFNSxZqywTSMXhgUTdTqtA',
    );
    assert.equal(
        result.memberEvents[0]!.action, 'added',
    );
});

test('memberEvent empty id throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            memberEvents: [
                { ...makeMemberEvent(), id: '' },
            ],
        }),
        ValidationError,
    );
});

test('memberEvent markup flow_node_id throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            memberEvents: [
                {
                    ...makeMemberEvent(),
                    flow_node_id: '<svg>',
                },
            ],
        }),
        ValidationError,
    );
});

// ── attribute event elements ──────────

function makeAttrEvent(): Record<string, unknown> {
    return {
        id: ATTR_EVENT_ID,
        flow_node_id: NODE_ID,
        attribute_id: 'UQTJZvCoKlFjEoDlDUwekw',
        mode: 'editable',
        is_required: false,
        action: 'added',
        at: AT,
    };
}

test('well-formed attributeEvent round-trips', () => {
    const delta = {
        ...makeDelta(),
        attributeEvents: [makeAttrEvent()],
    };
    const result = validateFlowGraphDelta(delta);
    assert.equal(result.attributeEvents.length, 1);
    assert.equal(
        result.attributeEvents[0]!.id, ATTR_EVENT_ID,
    );
    assert.equal(
        result.attributeEvents[0]!.attribute_id, 'UQTJZvCoKlFjEoDlDUwekw',
    );
    assert.equal(
        result.attributeEvents[0]!.mode, 'editable',
    );
});

test('attributeEvent empty id throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            attributeEvents: [
                { ...makeAttrEvent(), id: '' },
            ],
        }),
        ValidationError,
    );
});

test('attributeEvent unknown mode throws', () => {
    assert.throws(
        () => validateFlowGraphDelta({
            ...makeDelta(),
            attributeEvents: [
                { ...makeAttrEvent(), mode: 'hidden' },
            ],
        }),
        ValidationError,
    );
});
