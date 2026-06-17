import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    validateFlowNodeEntity,
    validateFlowEdgeEntity,
    validateFlowNodeMemberEntity,
    validateFlowNodeAttributeEntity,
} from '../api/validators.ts';
import { ValidationError } from '../api/types.ts';

const AT = '2026-01-01T00:00:00.000000Z';

const nodeBody = () => ({
    flow_id: 'f1', name: 'Draft',
    position_x: 12, position_y: 34,
    is_create: true, is_archive: false,
    task_instructions: '', at: AT,
});

const edgeBody = () => ({
    flow_id: 'f1', name: 'next',
    from_node_id: 'n1', to_node_id: 'n2', at: AT,
});

const memberBody = () => ({
    flow_node_id: 'n1', member_id: 'm1',
    action: 'added', at: AT,
});

const attrBody = () => ({
    flow_node_id: 'n1', attribute_id: 'a1',
    mode: 'editable', is_required: true,
    action: 'added', at: AT,
});

// ── flow_nodes ──

test('validateFlowNodeEntity accepts a valid body', () => {
    assert.deepEqual(validateFlowNodeEntity(nodeBody()), {
        flow_id: 'f1', name: 'Draft',
        position_x: 12, position_y: 34,
        is_create: true, is_archive: false,
        task_instructions: '', at: AT,
    });
});

test('validateFlowNodeEntity rejects an extra key', () => {
    assert.throws(
        () => validateFlowNodeEntity(
            { ...nodeBody(), graph: '{}' }),
        ValidationError);
});

test('validateFlowNodeEntity rejects a non-zulu at', () => {
    assert.throws(
        () => validateFlowNodeEntity(
            { ...nodeBody(), at: '2026-01-01' }),
        ValidationError);
});

// ── flow_edges ──

test('validateFlowEdgeEntity accepts a valid body', () => {
    assert.deepEqual(validateFlowEdgeEntity(edgeBody()), {
        flow_id: 'f1', name: 'next',
        from_node_id: 'n1', to_node_id: 'n2', at: AT,
    });
});

test('validateFlowEdgeEntity rejects a markup node ref',
() => {
    assert.throws(
        () => validateFlowEdgeEntity(
            { ...edgeBody(), to_node_id: '<svg>' }),
        ValidationError);
});

// ── flow_node_members ──

test('validateFlowNodeMemberEntity accepts a valid body',
() => {
    assert.deepEqual(
        validateFlowNodeMemberEntity(memberBody()), {
            flow_node_id: 'n1', member_id: 'm1',
            action: 'added', at: AT,
        });
});

test('validateFlowNodeMemberEntity rejects unknown action',
() => {
    assert.throws(
        () => validateFlowNodeMemberEntity(
            { ...memberBody(), action: 'deleted' }),
        ValidationError);
});

// ── flow_node_attributes ──

test('validateFlowNodeAttributeEntity accepts a valid body',
() => {
    assert.deepEqual(
        validateFlowNodeAttributeEntity(attrBody()), {
            flow_node_id: 'n1', attribute_id: 'a1',
            mode: 'editable', is_required: true,
            action: 'added', at: AT,
        });
});

test('validateFlowNodeAttributeEntity rejects unknown mode',
() => {
    assert.throws(
        () => validateFlowNodeAttributeEntity(
            { ...attrBody(), mode: 'hidden' }),
        ValidationError);
});

test('validateFlowNodeAttributeEntity rejects a missing key',
() => {
    const { is_required: _drop, ...rest } = attrBody();
    assert.throws(
        () => validateFlowNodeAttributeEntity(rest),
        ValidationError);
});
