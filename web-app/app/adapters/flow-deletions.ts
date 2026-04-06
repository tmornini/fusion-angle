import {
    GET, DELETE,
} from '../../../api/api';
import type {
    WfNodeEntity,
    WfEdgeEntity,
    WfFieldEntity,
    WfFlowNodeEntity,
    WfNodeEdgeEntity,
    WfNodeFieldEntity,
} from '../../../api/types';
import type {
    UndoStep,
} from '../flow-undo';
import {
    executeUndoSteps,
} from './flow-undo-adapter';

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
        nodeFields, allFields,
    ] = await Promise.all([
        GET<WfNodeEdgeEntity[]>(
            'wf-node-edges',
        ),
        GET<WfFlowNodeEntity[]>(
            'wf-flow-nodes',
        ),
        GET<WfNodeEntity[]>('wf-nodes'),
        GET<WfEdgeEntity[]>('wf-edges'),
        GET<WfNodeFieldEntity[]>(
            'wf-node-fields',
        ),
        GET<WfFieldEntity[]>('wf-fields'),
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
    const affectedFields =
        nodeFields.filter(
            nf => nf.node_id === nodeId,
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

    for (const nf of affectedFields) {
        const field = allFields.find(
            f => f.id === nf.field_id,
        );
        if (field) {
            restoreSteps.push({
                op: 'post',
                resource: 'wf-fields',
                body: { ...field },
            });
        }
        restoreSteps.push({
            op: 'post',
            resource: 'wf-node-fields',
            body: { ...nf },
        });
        deleteSteps.push({
            op: 'delete',
            resource:
                `wf-node-fields/${nf.id}`,
        });
        if (field) {
            deleteSteps.push({
                op: 'delete',
                resource:
                    `wf-fields/${field.id}`,
            });
        }
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
