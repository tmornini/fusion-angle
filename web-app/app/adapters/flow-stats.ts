import type { Id } from '../../../api/types.ts';
import type { FlowGraph } from './flow-queries.ts';
import type {
    RequestContext,
} from './shared.ts';
import {
    buildFlowStats,
    type FlowStatsInput,
    type FlowStatsModel,
} from '../flow-stats-aggregate.ts';
import { getFlowGraph } from './flow-queries.ts';
import {
    getWorkOrderRows,
    getWorkOrderTransitionRows,
    getFlowWorkOrderRows,
} from './work-orders-queries.ts';
import { getPersonMap } from './people.ts';
import {
    getRoleMap,
    getRoleMembershipRows,
} from './roles.ts';
import {
    getCrewMap,
    getMembersOfCrew,
} from './crews.ts';
import { getModelMap } from './models.ts';

export async function getFlowStats(
    ctx: RequestContext,
    flowId: string,
): Promise<{
    model: FlowStatsModel;
    graph: FlowGraph;
}> {
    const [
        graph,
        allWorkOrders,
        allTransitions,
        fwoRows,
        personMap,
        roleMap,
        crewMap,
        modelMap,
        roleMemRows,
    ] = await Promise.all([
        getFlowGraph(ctx, flowId),
        getWorkOrderRows(ctx),
        getWorkOrderTransitionRows(ctx),
        getFlowWorkOrderRows(ctx),
        getPersonMap(ctx),
        getRoleMap(ctx),
        getCrewMap(ctx),
        getModelMap(ctx),
        getRoleMembershipRows(ctx),
    ]);

    const woIds = new Set(
        fwoRows
            .filter(r => r.flow_id === flowId)
            .map(r => r.work_order_id),
    );
    const workOrders =
        allWorkOrders.filter(w => woIds.has(w.id));
    const transitions =
        allTransitions.filter(
            t => woIds.has(t.work_order_id),
        );

    // Mirrors workbox visibility-scope construction
    // (presenters/workbox-inbox.ts buildVisibilityScope).
    const roleMemberSetByRoleId =
        new Map<Id, Set<Id>>();
    for (const m of roleMemRows) {
        const s =
            roleMemberSetByRoleId.get(m.role_id)
            ?? new Set<Id>();
        s.add(m.person_id);
        roleMemberSetByRoleId.set(m.role_id, s);
    }
    const crewMemberSetByCrewId =
        new Map<Id, Set<Id>>();
    for (const crewId of crewMap.keys()) {
        crewMemberSetByCrewId.set(
            crewId,
            await getMembersOfCrew(ctx, crewId),
        );
    }

    const personNameById = new Map<Id, string>();
    for (const [id, p] of personMap) {
        personNameById.set(id, p.fullName());
    }
    const modelNameById = new Map<Id, string>();
    for (const [id, m] of modelMap) {
        modelNameById.set(id, m.nameText());
    }
    const roleNameById = new Map<Id, string>();
    for (const [id, r] of roleMap) {
        roleNameById.set(id, r.nameText());
    }
    const crewNameById = new Map<Id, string>();
    for (const [id, c] of crewMap) {
        crewNameById.set(id, c.nameText());
    }

    const input: FlowStatsInput = {
        nodes: graph.nodes,
        edges: graph.edges,
        workOrders,
        transitions,
        nowMs: Date.now(),
        windowDays: 90,
        roleMemberSetByRoleId,
        crewMemberSetByCrewId,
        personNameById,
        modelNameById,
        roleNameById,
        crewNameById,
    };
    return { model: buildFlowStats(input), graph };
}
