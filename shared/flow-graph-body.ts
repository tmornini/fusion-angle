import type {
    GraphEdge,
    GraphNode,
    MemberId,
    NodeAttribute,
    StoredGraph,
    WorkOrderFlowGraph,
} from './types.ts';
import { ValidationError } from './types.ts';
import {
    asArray,
    asBoolean,
    asIdentifier,
    asNumber,
    asObject,
    asString,
} from './json-assert.ts';

const NODE_ATTRIBUTE_MODES:
    readonly ('editable' | 'readonly')[]
    = ['editable', 'readonly'];

function asNodeAttribute(
    value: unknown,
    label: string,
): NodeAttribute {
    const obj = asObject(value, label);
    const mode = asString(
        obj['mode'], label + '.mode',
    );
    if (
        !(NODE_ATTRIBUTE_MODES as
            readonly string[]).includes(mode)
    ) {
        throw new ValidationError(
            "expected 'editable' or 'readonly'"
            + ' for ' + label + '.mode, got '
            + mode,
        );
    }
    return {
        attributeId: asIdentifier(
            obj['attribute_id'],
            label + '.attribute_id',
        ),
        mode: mode as
            ('editable' | 'readonly'),
        isRequired: asBoolean(
            obj['isRequired'],
            label + '.isRequired',
        ),
    };
}

export function asMemberIds(
    value: unknown,
    label: string,
): MemberId[] {
    const arr = asArray(value, label);
    return arr.map((v, i) =>
        asIdentifier(
            v,
            label + '[' + i + ']',
        ),
    );
}

function asGraphNode(
    value: unknown,
    label: string,
): GraphNode {
    const obj = asObject(value, label);
    const attrsArr = asArray(
        obj['attributes'],
        label + '.attributes',
    );
    const memberIds = asMemberIds(
        obj['memberIds'],
        label + '.memberIds',
    );
    const agentIdsRaw = obj['agentIds'];
    const agentIds = agentIdsRaw === undefined
        ? undefined
        : asMemberIds(
            agentIdsRaw,
            label + '.agentIds',
        );
    return {
        id: asIdentifier(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        positionX: asNumber(
            obj['positionX'],
            label + '.positionX',
        ),
        positionY: asNumber(
            obj['positionY'],
            label + '.positionY',
        ),
        isCreate: asBoolean(
            obj['isCreate'],
            label + '.isCreate',
        ),
        isArchive: asBoolean(
            obj['isArchive'],
            label + '.isArchive',
        ),
        memberIds,
        ...(agentIds === undefined
            ? {}
            : { agentIds }),
        attributes: attrsArr.map((a, i) =>
            asNodeAttribute(
                a,
                label + '.attributes['
                    + i + ']',
            ),
        ),
        taskInstructions: asString(
            obj['taskInstructions'],
            label + '.taskInstructions',
        ),
    };
}

function asGraphEdge(
    value: unknown,
    label: string,
): GraphEdge {
    const obj = asObject(value, label);
    return {
        id: asIdentifier(
            obj['id'], label + '.id',
        ),
        name: asString(
            obj['name'], label + '.name',
        ),
        fromNodeId: asIdentifier(
            obj['fromNodeId'],
            label + '.fromNodeId',
        ),
        toNodeId: asIdentifier(
            obj['toNodeId'],
            label + '.toNodeId',
        ),
    };
}

export function asStoredGraph(
    value: unknown,
    label: string,
): StoredGraph {
    const obj = asObject(value, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

export function asWorkOrderFlowGraph(
    value: unknown,
    label: string,
): WorkOrderFlowGraph {
    const obj = asObject(value, label);
    const nodesArr = asArray(
        obj['nodes'],
        label + '.nodes',
    );
    const edgesArr = asArray(
        obj['edges'],
        label + '.edges',
    );
    return {
        name: asString(
            obj['name'], label + '.name',
        ),
        lockTimeout: asNumber(
            obj['lockTimeout'],
            label + '.lockTimeout',
        ),
        nodes: nodesArr.map((n, i) =>
            asGraphNode(
                n,
                label + '.nodes['
                    + i + ']',
            ),
        ),
        edges: edgesArr.map((e, i) =>
            asGraphEdge(
                e,
                label + '.edges['
                    + i + ']',
            ),
        ),
    };
}

// ── Flow graph delta ─────────────────
//
// FlowGraphDelta is the wire shape the client sends when
// saving a normalised graph: upsert rows for every working
// node/edge, deletion tombstones for removed ones, and
// append-only ledger events for member/attribute changes.
// The row body interfaces mirror the entity interfaces but
// carry `id` (the stable canvas id) because the client
// supplies it (same precedent as postFlowCreation).

export interface FlowNodeRowBody {
    readonly id: string;
    readonly flow_id: string;
    readonly name: string;
    readonly position_x: number;
    readonly position_y: number;
    readonly is_create: boolean;
    readonly is_archive: boolean;
    readonly task_instructions: string;
    readonly at: string;
}

export interface FlowEdgeRowBody {
    readonly id: string;
    readonly flow_id: string;
    readonly name: string;
    readonly from_node_id: string;
    readonly to_node_id: string;
    readonly at: string;
}

export interface GraphDeletion {
    readonly eventId: string;
    readonly entityId: string;
    readonly at: string;
}

// A revival has the SAME triple shape as a deletion — a
// client-minted eventId, the entity being re-introduced, and
// the moment. The undo/redo bodies carry these to post a
// non-'deleted' 'restored' event that supersedes a prior
// tombstone, so a node/edge the user deleted reappears in
// reads when the deletion is reverted.
export type GraphRevival = GraphDeletion;

export interface FlowNodeMemberRowBody {
    readonly id: string;
    readonly flow_node_id: string;
    readonly member_id: string;
    readonly action: 'added' | 'removed';
    readonly at: string;
}

export interface FlowNodeAttributeRowBody {
    readonly id: string;
    readonly flow_node_id: string;
    readonly attribute_id: string;
    readonly mode: 'editable' | 'readonly';
    readonly is_required: boolean;
    readonly action: 'added' | 'removed';
    readonly at: string;
}

export interface FlowGraphDelta {
    readonly nodes: FlowNodeRowBody[];
    readonly edges: FlowEdgeRowBody[];
    readonly deletions: GraphDeletion[];
    readonly memberEvents: FlowNodeMemberRowBody[];
    readonly attributeEvents: FlowNodeAttributeRowBody[];
}
