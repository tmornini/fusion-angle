import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateFlowGraphDelta,
} from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';

const AT = '2026-01-01T00:00:00.000000Z';

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
    id = 'n1',
): Record<string, unknown> {
    return {
        id,
        flow_id: 'flow-1',
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
    assert.equal(result.nodes[0]!.id, 'n1');
    assert.equal(result.nodes[0]!.flow_id, 'flow-1');
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
        id: 'e1',
        flow_id: 'flow-1',
        name: 'next',
        from_node_id: 'n1',
        to_node_id: 'n2',
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
    assert.equal(result.edges[0]!.id, 'e1');
    assert.equal(result.edges[0]!.from_node_id, 'n1');
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
        eventId: 'ev-abc123',
        entityId: 'n1',
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
    assert.equal(result.deletions[0]!.eventId, 'ev-abc123');
    assert.equal(result.deletions[0]!.entityId, 'n1');
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
        id: 'mev-1',
        flow_node_id: 'n1',
        member_id: 'm1',
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
    assert.equal(result.memberEvents[0]!.id, 'mev-1');
    assert.equal(
        result.memberEvents[0]!.flow_node_id, 'n1',
    );
    assert.equal(
        result.memberEvents[0]!.member_id, 'm1',
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
        id: 'aev-1',
        flow_node_id: 'n1',
        attribute_id: 'a1',
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
    assert.equal(result.attributeEvents[0]!.id, 'aev-1');
    assert.equal(
        result.attributeEvents[0]!.attribute_id, 'a1',
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
