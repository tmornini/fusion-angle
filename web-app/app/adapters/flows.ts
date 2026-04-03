import {
    GET, POST, PUT, DELETE,
} from '../../../api/api';
import type {
    FlowEntity,
    WfNodeEntity,
    WfEdgeEntity,
    WfFieldEntity,
    ProjectEntity,
    ProjectFlowEntity,
    WfFlowNodeEntity,
    WfNodeEdgeEntity,
    WfNodeFieldEntity,
} from '../../../api/types';
import {
    nowUtc,
    toBool,
    jsonArrayField,
} from '../../../api/types';
import { parseJson } from './helpers';
import type {
    UndoStep,
} from '../flow-undo';

const DEFAULT_START_NAME = 'New';
const DEFAULT_COMPLETE_NAME = 'Complete';
const DEFAULT_START_X = -300;
const DEFAULT_START_Y = 0;
const DEFAULT_COMPLETE_X = 300;
const DEFAULT_COMPLETE_Y = 200;

export interface FlowListItem {
    id: string;
    name: string;
    description: string;
    nodeCount: number;
    edgeCount: number;
}

export interface FlowSummary
    extends FlowListItem {
    projectName: string | null;
}

export interface GraphField {
    id: string;
    name: string;
    fieldType: string;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

export interface GraphNode {
    id: string;
    name: string;
    description: string;
    positionX: number;
    positionY: number;
    isStart: boolean;
    isComplete: boolean;
    fields: GraphField[];
}

export interface GraphEdge {
    id: string;
    name: string;
    description: string;
    fromNodeId: string;
    toNodeId: string;
}

export interface FlowGraph {
    id: string;
    name: string;
    description: string;
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export async function getFlows(
): Promise<FlowSummary[]> {
    const [
        flows, projectFlows,
        projects, flowNodes,
        nodeEdges,
    ] = await Promise.all([
        GET<FlowEntity[]>(
            'flows',
        ),
        GET<ProjectFlowEntity[]>(
            'project-flows',
        ),
        GET<ProjectEntity[]>('projects'),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
    ]);

    const projectMap = new Map(
        projects.map(p => [p.id, p.title]),
    );

    const projectByFlow = new Map<
        string, string | null
    >();
    for (const pw of projectFlows) {
        projectByFlow.set(
            pw.flow_id,
            projectMap.get(
                pw.project_id,
            ) ?? null,
        );
    }

    const nodeIdsByFlow = new Map<
        string, Set<string>
    >();
    for (const wf of flows) {
        nodeIdsByFlow.set(
            wf.id, new Set(),
        );
    }
    for (const wn of flowNodes) {
        nodeIdsByFlow
            .get(wn.flow_id)
            ?.add(wn.node_id);
    }

    const edgeCountByFlow = new Map<
        string, number
    >();
    for (const wf of flows) {
        const nodeIds =
            nodeIdsByFlow.get(wf.id)!;
        let count = 0;
        for (const ne of nodeEdges) {
            if (
                nodeIds.has(
                    ne.from_node_id,
                )
                || nodeIds.has(
                    ne.to_node_id,
                )
            ) {
                count++;
            }
        }
        edgeCountByFlow.set(
            wf.id, count,
        );
    }

    return flows.map(wf => ({
        id: wf.id,
        name: wf.name,
        description: wf.description,
        projectName:
            projectByFlow.get(wf.id)
                ?? null,
        nodeCount:
            nodeIdsByFlow
                .get(wf.id)!.size,
        edgeCount:
            edgeCountByFlow
                .get(wf.id)!,
    }));
}

export async function getFlowsByProject(
    projectId: string,
): Promise<FlowListItem[]> {
    const [
        projectFlows, flows,
        flowNodes, nodeEdges,
    ] = await Promise.all([
        GET<ProjectFlowEntity[]>(
            'project-flows',
        ),
        GET<FlowEntity[]>(
            'flows',
        ),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
    ]);

    const flowIds = new Set(
        projectFlows
            .filter(
                pw =>
                    pw.project_id
                        === projectId,
            )
            .map(pw => pw.flow_id),
    );

    const flowMap = new Map(
        flows.map(w => [w.id, w]),
    );

    const nodeIdsByFlow = new Map<
        string, Set<string>
    >();
    for (const wfId of flowIds) {
        nodeIdsByFlow.set(
            wfId, new Set(),
        );
    }
    for (const wn of flowNodes) {
        nodeIdsByFlow
            .get(wn.flow_id)
            ?.add(wn.node_id);
    }

    const edgeCountByFlow = new Map<
        string, number
    >();
    for (const wfId of flowIds) {
        const nodeIds =
            nodeIdsByFlow.get(wfId)!;
        let count = 0;
        for (const ne of nodeEdges) {
            if (
                nodeIds.has(
                    ne.from_node_id,
                )
                || nodeIds.has(
                    ne.to_node_id,
                )
            ) {
                count++;
            }
        }
        edgeCountByFlow.set(
            wfId, count,
        );
    }

    const result: FlowListItem[] = [];
    for (const wfId of flowIds) {
        const wf = flowMap.get(wfId);
        if (!wf) continue;
        result.push({
            id: wf.id,
            name: wf.name,
            description: wf.description,
            nodeCount:
                nodeIdsByFlow
                    .get(wfId)!.size,
            edgeCount:
                edgeCountByFlow
                    .get(wfId)!,
        });
    }
    return result;
}

export async function getFlowGraph(
    flowId: string,
): Promise<FlowGraph | null> {
    const flow =
        await GET<FlowEntity | null>(
            `flows/${flowId}`,
        );
    if (!flow) return null;

    const [
        allFlowNodes, allNodeEdges,
        allNodes, allEdges,
        allFields, allNodeFields,
    ] = await Promise.all([
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
        GET<WfNodeEntity[]>('wf-nodes'),
        GET<WfEdgeEntity[]>('wf-edges'),
        GET<WfFieldEntity[]>('wf-fields'),
        GET<WfNodeFieldEntity[]>(
            'wf-node-fields',
        ),
    ]);

    const nodeIds = new Set(
        allFlowNodes
            .filter(
                wn =>
                    wn.flow_id
                        === flowId,
            )
            .map(wn => wn.node_id),
    );

    const nodeMap = new Map(
        allNodes.map(n => [n.id, n]),
    );
    const edgeMap = new Map(
        allEdges.map(e => [e.id, e]),
    );
    const fieldMap = new Map(
        allFields.map(f => [f.id, f]),
    );

    const fieldsByNodeId = new Map<
        string, GraphField[]
    >();
    for (const nodeId of nodeIds) {
        fieldsByNodeId.set(nodeId, []);
    }
    for (const nf of allNodeFields) {
        if (!nodeIds.has(nf.node_id))
            continue;
        const field =
            fieldMap.get(nf.field_id);
        if (!field) continue;
        fieldsByNodeId.get(nf.node_id)!
            .push({
                id: field.id,
                name: field.name,
                fieldType: field.field_type,
                sortOrder: field.sort_order,
                isRequired:
                    toBool(field.is_required),
                options: parseJson<string[]>(
                    field.options, [],
                ),
            });
    }

    const nodes: GraphNode[] = [];
    for (const nodeId of nodeIds) {
        const node = nodeMap.get(nodeId);
        if (!node) continue;
        const fields =
            fieldsByNodeId.get(nodeId)!;
        fields.sort(
            (a, b) =>
                a.sortOrder - b.sortOrder,
        );
        nodes.push({
            id: node.id,
            name: node.name,
            description: node.description,
            positionX: node.position_x,
            positionY: node.position_y,
            isStart:
                toBool(node.is_start),
            isComplete:
                toBool(node.is_complete),
            fields,
        });
    }

    const edges: GraphEdge[] = [];
    for (const ne of allNodeEdges) {
        if (
            !nodeIds.has(ne.from_node_id)
            && !nodeIds.has(ne.to_node_id)
        ) continue;
        const edge =
            edgeMap.get(ne.wf_edge_id);
        if (!edge) continue;
        edges.push({
            id: edge.id,
            name: edge.name,
            description: edge.description,
            fromNodeId: ne.from_node_id,
            toNodeId: ne.to_node_id,
        });
    }

    return {
        id: flow.id,
        name: flow.name,
        description: flow.description,
        nodes,
        edges,
    };
}

export interface FlowCreationContext {
    flowId: string;
    projectId: string;
    name: string;
    description: string;
}

export interface NodeAdditionContext {
    nodeId: string;
    flowNodeId: string;
    flowId: string;
    name: string;
    positionX: number;
    positionY: number;
}

export interface EdgeConnectionContext {
    edgeId: string;
    nodeEdgeId: string;
    name: string;
    fromNodeId: string;
    toNodeId: string;
}

export interface FieldAdditionContext {
    fieldId: string;
    nodeFieldId: string;
    nodeId: string;
    name: string;
    fieldType: string;
    sortOrder: number;
    isRequired: boolean;
    options: string[];
}

export async function postFlowCreation(
    ctx: FlowCreationContext,
): Promise<void> {
    const startNodeId =
        crypto.randomUUID();
    const completeNodeId =
        crypto.randomUUID();
    const now = nowUtc();

    await POST<void>('flows', {
        id: ctx.flowId,
        name: ctx.name,
        description: ctx.description,
        created_at: now,
        updated_at: now,
    });

    await Promise.all([
        POST<void>('wf-nodes', {
            id: startNodeId,
            name: DEFAULT_START_NAME,
            description: '',
            position_x: DEFAULT_START_X,
            position_y: DEFAULT_START_Y,
            is_start: 1,
            is_complete: 0,
            created_at: now,
        }),
        POST<void>('wf-nodes', {
            id: completeNodeId,
            name: DEFAULT_COMPLETE_NAME,
            description: '',
            position_x: DEFAULT_COMPLETE_X,
            position_y: DEFAULT_COMPLETE_Y,
            is_start: 0,
            is_complete: 1,
            created_at: now,
        }),
    ]);

    await Promise.all([
        POST<void>('project-flows', {
            id: crypto.randomUUID(),
            project_id: ctx.projectId,
            flow_id: ctx.flowId,
            created_at: now,
        }),
        POST<void>('wf-flow-nodes', {
            id: crypto.randomUUID(),
            flow_id: ctx.flowId,
            node_id: startNodeId,
            created_at: now,
        }),
        POST<void>('wf-flow-nodes', {
            id: crypto.randomUUID(),
            flow_id: ctx.flowId,
            node_id: completeNodeId,
            created_at: now,
        }),
    ]);
}

export async function postNodeAddition(
    ctx: NodeAdditionContext,
): Promise<void> {
    const now = nowUtc();

    await POST<void>('wf-nodes', {
        id: ctx.nodeId,
        name: ctx.name,
        description: '',
        position_x: ctx.positionX,
        position_y: ctx.positionY,
        is_start: 0,
        is_complete: 0,
        created_at: now,
    });

    await POST<void>(
        'wf-flow-nodes',
        {
            id: ctx.flowNodeId,
            flow_id: ctx.flowId,
            node_id: ctx.nodeId,
            created_at: now,
        },
    );
}

export async function postEdgeConnection(
    ctx: EdgeConnectionContext,
): Promise<void> {
    const now = nowUtc();

    await POST<void>('wf-edges', {
        id: ctx.edgeId,
        name: ctx.name,
        description: '',
        created_at: now,
    });

    await POST<void>('wf-node-edges', {
        id: ctx.nodeEdgeId,
        wf_edge_id: ctx.edgeId,
        from_node_id: ctx.fromNodeId,
        to_node_id: ctx.toNodeId,
        created_at: now,
    });
}

export async function postFieldAddition(
    ctx: FieldAdditionContext,
): Promise<void> {
    const now = nowUtc();

    await POST<void>('wf-fields', {
        id: ctx.fieldId,
        name: ctx.name,
        field_type: ctx.fieldType,
        sort_order: ctx.sortOrder,
        is_required:
            ctx.isRequired ? 1 : 0,
        options:
            jsonArrayField(ctx.options),
        created_at: now,
    });

    await POST<void>('wf-node-fields', {
        id: ctx.nodeFieldId,
        node_id: ctx.nodeId,
        field_id: ctx.fieldId,
        created_at: now,
    });
}

export async function putFlow(
    id: string,
    fields: {
        name?: string;
        description?: string;
    },
): Promise<void> {
    await PUT(`flows/${id}`, {
        ...fields,
        updated_at: nowUtc(),
    });
}

export async function putNode(
    id: string,
    fields: {
        name?: string;
        description?: string;
        position_x?: number;
        position_y?: number;
    },
): Promise<void> {
    await PUT(`wf-nodes/${id}`, fields);
}

export async function putWfEdge(
    id: string,
    fields: {
        name?: string;
        description?: string;
    },
): Promise<void> {
    await PUT(`wf-edges/${id}`, fields);
}

export async function putField(
    id: string,
    fields: {
        name?: string;
        field_type?: string;
        sort_order?: number;
        is_required?: boolean;
        options?: string[];
    },
): Promise<void> {
    const body: Record<string, unknown> =
        {};
    if (fields.name !== undefined)
        body.name = fields.name;
    if (fields.field_type !== undefined)
        body.field_type = fields.field_type;
    if (fields.sort_order !== undefined)
        body.sort_order = fields.sort_order;
    if (fields.is_required !== undefined)
        body.is_required =
            fields.is_required ? 1 : 0;
    if (fields.options !== undefined)
        body.options =
            jsonArrayField(fields.options);
    await PUT(`wf-fields/${id}`, body);
}

export async function deleteNode(
    nodeId: string,
    flowId: string,
): Promise<void> {
    const [nodeEdges, flowNodes] =
        await Promise.all([
            GET<WfNodeEdgeEntity[]>(
                'wf-node-edges',
            ),
            GET<WfFlowNodeEntity[]>(
                'wf-flow-nodes',
            ),
        ]);

    const affectedEdges = nodeEdges.filter(
        ne =>
            ne.from_node_id === nodeId
            || ne.to_node_id === nodeId,
    );

    const flowNodeLink =
        flowNodes.find(
            wn =>
                wn.flow_id
                    === flowId
                && wn.node_id === nodeId,
        );

    const deletePromises: Promise<void>[] =
        [];

    for (const ne of affectedEdges) {
        deletePromises.push(
            DELETE(
                `wf-node-edges/${ne.id}`,
            ),
        );
        deletePromises.push(
            DELETE(
                `wf-edges/${ne.wf_edge_id}`,
            ),
        );
    }

    if (flowNodeLink) {
        deletePromises.push(
            DELETE(
                'wf-flow-nodes/'
                + flowNodeLink.id,
            ),
        );
    }

    deletePromises.push(
        DELETE(`wf-nodes/${nodeId}`),
    );

    await Promise.all(deletePromises);
}

export async function deleteEdge(
    edgeId: string,
): Promise<void> {
    const nodeEdges =
        await GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        );

    const link = nodeEdges.find(
        ne => ne.wf_edge_id === edgeId,
    );

    const deletePromises: Promise<void>[] =
        [DELETE(`wf-edges/${edgeId}`)];

    if (link) {
        deletePromises.push(
            DELETE(
                `wf-node-edges/${link.id}`,
            ),
        );
    }

    await Promise.all(deletePromises);
}

export async function deleteField(
    fieldId: string,
    nodeId: string,
): Promise<void> {
    const nodeFields =
        await GET<WfNodeFieldEntity[]>(
            'wf-node-fields',
        );

    const link = nodeFields.find(
        nf =>
            nf.field_id === fieldId
            && nf.node_id === nodeId,
    );

    const deletePromises: Promise<void>[] =
        [DELETE(`wf-fields/${fieldId}`)];

    if (link) {
        deletePromises.push(
            DELETE(
                `wf-node-fields/${link.id}`,
            ),
        );
    }

    await Promise.all(deletePromises);
}

export interface NodeDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
    removedEdgeIds: string[];
}

export async function deleteNodeCapture(
    nodeId: string,
    flowId: string,
): Promise<NodeDeletionCapture> {
    const [
        nodeEdges, flowNodes,
        allNodes, allEdges,
    ] = await Promise.all([
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEntity[]>('wf-nodes'),
        GET<WfEdgeEntity[]>('wf-edges'),
    ]);

    const node = allNodes.find(
        n => n.id === nodeId,
    );
    const flowNodeLink = flowNodes.find(
        wn =>
            wn.flow_id === flowId
            && wn.node_id === nodeId,
    );
    const affected = nodeEdges.filter(
        ne =>
            ne.from_node_id === nodeId
            || ne.to_node_id === nodeId,
    );

    const restoreSteps: UndoStep[] = [];
    const deleteSteps: UndoStep[] = [];
    const removedEdgeIds: string[] = [];

    if (node) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-nodes',
            body: { ...node },
        });
    }
    if (flowNodeLink) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-flow-nodes',
            body: { ...flowNodeLink },
        });
    }

    for (const ne of affected) {
        const edge = allEdges.find(
            e => e.id === ne.wf_edge_id,
        );
        if (edge) {
            restoreSteps.push({
                op: 'post',
                resource: 'wf-edges',
                body: { ...edge },
            });
            removedEdgeIds.push(edge.id);
        }
        restoreSteps.push({
            op: 'post',
            resource: 'wf-node-edges',
            body: { ...ne },
        });
        deleteSteps.push({
            op: 'delete',
            resource:
                `wf-node-edges/${ne.id}`,
        });
        deleteSteps.push({
            op: 'delete',
            resource:
                'wf-edges/'
                + ne.wf_edge_id,
        });
    }

    if (flowNodeLink) {
        deleteSteps.push({
            op: 'delete',
            resource:
                'wf-flow-nodes/'
                + flowNodeLink.id,
        });
    }
    deleteSteps.push({
        op: 'delete',
        resource: `wf-nodes/${nodeId}`,
    });

    await executeUndoSteps(deleteSteps);
    return {
        restoreSteps,
        deleteSteps,
        removedEdgeIds,
    };
}

export interface EdgeDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
}

export async function deleteEdgeCapture(
    edgeId: string,
): Promise<EdgeDeletionCapture> {
    const [nodeEdges, allEdges] =
        await Promise.all([
            GET<WfNodeEdgeEntity[]>(
                'wf-node-edges',
            ),
            GET<WfEdgeEntity[]>('wf-edges'),
        ]);

    const edge = allEdges.find(
        e => e.id === edgeId,
    );
    const link = nodeEdges.find(
        ne => ne.wf_edge_id === edgeId,
    );

    const restoreSteps: UndoStep[] = [];
    const deleteSteps: UndoStep[] = [];

    if (edge) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-edges',
            body: { ...edge },
        });
    }
    if (link) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-node-edges',
            body: { ...link },
        });
        deleteSteps.push({
            op: 'delete',
            resource:
                `wf-node-edges/${link.id}`,
        });
    }
    deleteSteps.push({
        op: 'delete',
        resource: `wf-edges/${edgeId}`,
    });

    await executeUndoSteps(deleteSteps);
    return { restoreSteps, deleteSteps };
}

export interface FieldDeletionCapture {
    restoreSteps: UndoStep[];
    deleteSteps: UndoStep[];
}

export async function deleteFieldCapture(
    fieldId: string,
    nodeId: string,
): Promise<FieldDeletionCapture> {
    const [nodeFields, allFields] =
        await Promise.all([
            GET<WfNodeFieldEntity[]>(
                'wf-node-fields',
            ),
            GET<WfFieldEntity[]>(
                'wf-fields',
            ),
        ]);

    const field = allFields.find(
        f => f.id === fieldId,
    );
    const link = nodeFields.find(
        nf =>
            nf.field_id === fieldId
            && nf.node_id === nodeId,
    );

    const restoreSteps: UndoStep[] = [];
    const deleteSteps: UndoStep[] = [];

    if (field) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-fields',
            body: { ...field },
        });
    }
    if (link) {
        restoreSteps.push({
            op: 'post',
            resource: 'wf-node-fields',
            body: { ...link },
        });
        deleteSteps.push({
            op: 'delete',
            resource:
                `wf-node-fields/${link.id}`,
        });
    }
    deleteSteps.push({
        op: 'delete',
        resource: `wf-fields/${fieldId}`,
    });

    await executeUndoSteps(deleteSteps);
    return { restoreSteps, deleteSteps };
}

export async function executeUndoSteps(
    steps: UndoStep[],
): Promise<void> {
    for (const step of steps) {
        switch (step.op) {
            case 'post':
                await POST<void>(
                    step.resource,
                    step.body,
                );
                break;
            case 'put':
                await PUT(
                    step.resource,
                    step.body,
                );
                break;
            case 'delete':
                await DELETE(step.resource);
                break;
        }
    }
}
