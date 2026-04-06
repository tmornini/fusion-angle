import {
    POST, PUT,
} from '../../../api/api';
import {
    nowUtc,
    jsonArrayField,
} from '../../../api/types';

const DEFAULT_START_NAME = 'New';
const DEFAULT_COMPLETE_NAME = 'Complete';
const DEFAULT_START_X = -300;
const DEFAULT_START_Y = 0;
const DEFAULT_COMPLETE_X = 300;
const DEFAULT_COMPLETE_Y = 200;

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
