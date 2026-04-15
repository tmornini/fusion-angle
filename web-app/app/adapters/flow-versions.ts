import {
    GET, PUT, POST, DELETE,
} from '../../../api/api';
import type {
    FlowEntity,
    FlowVersionEntity,
    JsonObjectField,
} from '../../../api/types';
import { nowUtc } from '../../../api/types';

export interface FlowVersion {
    id: string;
    flowId: string;
    name: string;
    description: string;
    lockTimeout: number;
    graph: JsonObjectField;
    createdAt: string;
}

export const FLOW_VERSION_CAP = 10;

function toFlowVersion(
    row: FlowVersionEntity,
): FlowVersion {
    return {
        id: row.id,
        flowId: row.flow_id,
        name: row.name,
        description: row.description,
        lockTimeout: row.lock_timeout,
        graph: row.graph,
        createdAt: row.created_at,
    };
}

function compareRows(
    a: FlowVersionEntity,
    b: FlowVersionEntity,
): number {
    if (a.created_at < b.created_at) return -1;
    if (a.created_at > b.created_at) return 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

export async function postFlowVersion(
    flowId: string,
): Promise<void> {
    const flow = await GET<FlowEntity>(
        'flows/' + flowId,
    );
    await PUT<void>('flow-versions', {
        id: crypto.randomUUID(),
        flow_id: flowId,
        name: flow.name,
        description: flow.description,
        lock_timeout: flow.lock_timeout,
        graph: flow.graph,
        created_at: nowUtc(),
    });
    const all = await GET<FlowVersionEntity[]>(
        'flow-versions',
    );
    const mine = all
        .filter(v => v.flow_id === flowId)
        .sort(compareRows);
    const excess = mine.length - FLOW_VERSION_CAP;
    for (let i = 0; i < excess; i++) {
        await DELETE(
            'flow-versions/' + mine[i]!.id,
        );
    }
}

export async function getFlowVersions(
    flowId: string,
): Promise<FlowVersion[]> {
    const all = await GET<FlowVersionEntity[]>(
        'flow-versions',
    );
    return all
        .filter(v => v.flow_id === flowId)
        .sort((a, b) => -compareRows(a, b))
        .map(toFlowVersion);
}

export async function getLatestFlowVersion(
    flowId: string,
): Promise<FlowVersion | null> {
    const versions = await getFlowVersions(flowId);
    return versions[0] ?? null;
}

export async function deleteFlowVersion(
    versionId: string,
): Promise<void> {
    await DELETE('flow-versions/' + versionId);
}

export async function putFlowFromVersion(
    version: FlowVersion,
): Promise<void> {
    await PUT('flows/' + version.flowId, {
        name: version.name,
        description: version.description,
        lock_timeout: version.lockTimeout,
        graph: version.graph,
        updated_at: nowUtc(),
    });
}
