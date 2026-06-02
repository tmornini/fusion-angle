import type {
    FlowEntity,
    Id,
} from '../../../api/types.ts';
import {
    asBoolean,
    validateStoredGraphJson,
} from '../../../api/validators.ts';
import type { RequestContext } from './shared.ts';
import { shouldShowMemberHazard } from '../flow-graph.ts';
import type { ValidationResult } from './validation.ts';

export type FlowProblem =
    | { kind: 'zero_members'; nodeId: Id }
    | { kind: 'dead_end'; nodeId: Id };

export type FlowReadiness = ValidationResult<FlowProblem>;

export function validateFlowForCreation(
    flow: FlowEntity,
): FlowReadiness {
    const graph = validateStoredGraphJson(
        flow.graph, 'flow.graph',
    );
    const problems: FlowProblem[] = [];
    for (const node of graph.nodes) {
        if (node.isCreate || node.isArchive) {
            continue;
        }
        const level = shouldShowMemberHazard(
            node, graph.edges,
        );
        if (level !== 'danger') continue;
        if (node.memberIds.length === 0) {
            problems.push({
                kind: 'zero_members',
                nodeId: node.id,
            });
            continue;
        }
        problems.push({
            kind: 'dead_end',
            nodeId: node.id,
        });
    }
    return {
        ready: problems.length === 0,
        problems,
    };
}

export function formatFlowProblem(
    problem: FlowProblem,
): string {
    if (problem.kind === 'zero_members') {
        return 'zero members on node '
            + problem.nodeId;
    }
    return 'dead end at node ' + problem.nodeId;
}

export interface FlowPickerEntry {
    id: Id;
    name: string;
    problemCount?: number;
}

export interface FlowsForCreation {
    ready: FlowPickerEntry[];
    notReady: FlowPickerEntry[];
}

export async function getFlowsForCreation(
    ctx: RequestContext,
): Promise<FlowsForCreation> {
    const flows = await ctx.GET<FlowEntity[]>(
        'flows',
    );
    const ready: FlowPickerEntry[] = [];
    const notReady: FlowPickerEntry[] = [];
    for (const flow of flows) {
        const isLocked = asBoolean(
            flow.is_locked, 'is_locked',
        );
        if (isLocked) continue;
        const readiness =
            validateFlowForCreation(flow);
        if (readiness.ready) {
            ready.push({
                id: flow.id,
                name: flow.name,
            });
            continue;
        }
        notReady.push({
            id: flow.id,
            name: flow.name,
            problemCount: readiness.problems.length,
        });
    }
    return { ready, notReady };
}
