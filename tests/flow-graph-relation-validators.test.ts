import { assertEquals, assertThrows } from '@std/assert';
import {
    validateFlowNodeEntity,
    validateFlowEdgeEntity,
    validateFlowNodeMemberEntity,
    validateFlowNodeAttributeEntity,
} from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';
import { generateIdentifier } from
    '../shared/identifier.ts';

const AT = '2026-01-01T00:00:00.000000Z';
const NODE_1 = generateIdentifier();
const NODE_2 = generateIdentifier();

const nodeBody = () => ({
    flow_id: 'ZOousbbnzpqlxJExVAruYQ', name: 'Draft',
    position_x: 12, position_y: 34,
    is_create: true, is_archive: false,
    task_instructions: '', at: AT,
});

const edgeBody = () => ({
    flow_id: 'ZOousbbnzpqlxJExVAruYQ', name: 'next',
    from_node_id: NODE_1, to_node_id: NODE_2, at: AT,
});

const memberBody = () => ({
    flow_node_id: NODE_1, member_id: 'mFNSxZqywTSMXhgUTdTqtA',
    action: 'added', at: AT,
});

const attrBody = () => ({
    flow_node_id: NODE_1, attribute_id: 'UQTJZvCoKlFjEoDlDUwekw',
    mode: 'editable', is_required: true,
    action: 'added', at: AT,
});

// ── flow_nodes ──

Deno.test('validateFlowNodeEntity accepts a valid body', () => {
    assertEquals(validateFlowNodeEntity(nodeBody()), {
        flow_id: 'ZOousbbnzpqlxJExVAruYQ', name: 'Draft',
        position_x: 12, position_y: 34,
        is_create: true, is_archive: false,
        task_instructions: '', at: AT,
    });
});

Deno.test('validateFlowNodeEntity rejects an extra key', () => {
    assertThrows(
        () => validateFlowNodeEntity(
            { ...nodeBody(), graph: '{}' }),
        ValidationError);
});

Deno.test('validateFlowNodeEntity rejects a non-zulu at', () => {
    assertThrows(
        () => validateFlowNodeEntity(
            { ...nodeBody(), at: '2026-01-01' }),
        ValidationError);
});

// ── flow_edges ──

Deno.test('validateFlowEdgeEntity accepts a valid body', () => {
    assertEquals(validateFlowEdgeEntity(edgeBody()), {
        flow_id: 'ZOousbbnzpqlxJExVAruYQ', name: 'next',
        from_node_id: NODE_1, to_node_id: NODE_2, at: AT,
    });
});

Deno.test('validateFlowEdgeEntity rejects a markup node ref',
() => {
    assertThrows(
        () => validateFlowEdgeEntity(
            { ...edgeBody(), to_node_id: '<svg>' }),
        ValidationError);
});

// ── flow_node_members ──

Deno.test('validateFlowNodeMemberEntity accepts a valid body',
() => {
    assertEquals(
        validateFlowNodeMemberEntity(memberBody()), {
            flow_node_id: NODE_1, member_id: 'mFNSxZqywTSMXhgUTdTqtA',
            action: 'added', at: AT,
        });
});

Deno.test('validateFlowNodeMemberEntity rejects unknown action',
() => {
    assertThrows(
        () => validateFlowNodeMemberEntity(
            { ...memberBody(), action: 'deleted' }),
        ValidationError);
});

// ── flow_node_attributes ──

Deno.test('validateFlowNodeAttributeEntity accepts a valid body',
() => {
    assertEquals(
        validateFlowNodeAttributeEntity(attrBody()), {
            flow_node_id: NODE_1, attribute_id: 'UQTJZvCoKlFjEoDlDUwekw',
            mode: 'editable', is_required: true,
            action: 'added', at: AT,
        });
});

Deno.test('validateFlowNodeAttributeEntity rejects unknown mode',
() => {
    assertThrows(
        () => validateFlowNodeAttributeEntity(
            { ...attrBody(), mode: 'hidden' }),
        ValidationError);
});

Deno.test('validateFlowNodeAttributeEntity rejects a missing key',
() => {
    const { is_required: _drop, ...rest } = attrBody();
    assertThrows(
        () => validateFlowNodeAttributeEntity(rest),
        ValidationError);
});
