import type {
    WorkOrderEntity,
    FlowWorkOrderEntity,
    StateEntity,
    GraphNode,
    GraphEdge,
    Id,
} from '../types.ts';
import {
    DEFAULT_LOCK_TIMEOUT,
    MS_PER_DAY,
    SECONDS_PER_HOUR,
    MS_PER_SECOND,
} from '../types.ts';
import {
    mulberry32,
    b62Id,
    seedIdentifier,
    pickWeighted,
    sampleUniform,
    sampleLogNormal,
    isoFromMs,
} from './seed-kit.ts';

const MS_PER_HOUR =
    SECONDS_PER_HOUR * MS_PER_SECOND;
const CREATE_DWELL_MS = 1000;

export interface FlowSeedSpec {
    readonly flowId: Id;
    readonly name: string;
    readonly nodes: readonly GraphNode[];
    readonly edges: readonly GraphEdge[];
    readonly creator: GraphNode;
    readonly archive: GraphNode;
}

export interface PathProfile {
    readonly nodeIds: readonly Id[];
    readonly edgeIds: readonly Id[];
    readonly weight: number;
}

export interface SojournProfile {
    readonly meanHoursByNodeId:
        ReadonlyMap<Id, number>;
    readonly sigmaByNodeId:
        ReadonlyMap<Id, number>;
}

export interface MemberSkill {
    readonly byMemberAndNode:
        ReadonlyMap<
            Id,
            ReadonlyMap<Id, number>
        >;
    readonly jitterPct: number;
}

export interface GeneratedFlowData {
    readonly workOrders:
        readonly WorkOrderEntity[];
    readonly flowWorkOrders:
        readonly FlowWorkOrderEntity[];
    readonly stateEvents:
        readonly StateEntity[];
}

export function generateFlowWorkload(args: {
    readonly flow: FlowSeedSpec;
    readonly paths: readonly PathProfile[];
    readonly sojourn: SojournProfile;
    readonly skill: MemberSkill;
    readonly totalWorkOrders: number;
    readonly oldestDaysAgo: number;
    readonly newestDaysAgo: number;
    readonly seed: number;
    readonly organizationId: Id;
    readonly nowMs: number;
}): GeneratedFlowData {
    const {
        flow, paths, sojourn, skill,
        totalWorkOrders, oldestDaysAgo,
        newestDaysAgo, seed,
        organizationId, nowMs,
    } = args;

    const rng = mulberry32(seed);
    const nodeById = new Map(
        flow.nodes.map(n => [n.id, n]),
    );
    const creatorId = flow.creator.id;
    const archiveId = flow.archive.id;

    const frozenFlowGraph = {
        name: flow.name,
        lockTimeout: DEFAULT_LOCK_TIMEOUT,
        nodes: flow.nodes,
        edges: flow.edges,
    };

    const workOrders: WorkOrderEntity[] = [];
    const flowWorkOrders:
        FlowWorkOrderEntity[] = [];
    const stateEvents: StateEntity[] = [];

    for (let i = 0; i < totalWorkOrders; i++) {
        const woId = seedIdentifier(b62Id(rng, 22));
        const displayId = b62Id(rng, 8);
        const path = pickWeighted(
            rng, paths, p => p.weight,
        );
        const N = path.nodeIds.length;

        const createdAtDaysAgo = sampleUniform(
            rng, newestDaysAgo, oldestDaysAgo,
        );
        const createdAtMs =
            nowMs - createdAtDaysAgo * MS_PER_DAY;
        let cursorMs = createdAtMs;

        // One record per WORKING step of the path
        // (nodeIds[1..N-2]): who works it and for how
        // long, complete at construction. The creator
        // and archive gateways take no member and no
        // dwell, so they have no record at all — the
        // absence of a row, not a null slot. A path
        // index j maps to workingSteps[j - 1] (the
        // creator precedes the working run).
        const workingSteps: {
            member: Id;
            sojournMs: number;
        }[] = [];
        for (const nid of path.nodeIds) {
            if (
                nid === creatorId
                || nid === archiveId
            ) {
                continue;
            }
            const node = nodeById.get(nid)!;
            const member = pickWeighted(
                rng, node.memberIds, () => 1,
            );
            const mean =
                sojourn.meanHoursByNodeId
                    .get(nid)!;
            const sigma =
                sojourn.sigmaByNodeId
                    .get(nid)!;
            const sk = skill.byMemberAndNode
                .get(member)!.get(nid)!;
            const jit = sampleUniform(
                rng,
                1 - skill.jitterPct,
                1 + skill.jitterPct,
            );
            const hours = sampleLogNormal(
                rng, mean, sigma,
            ) * sk * jit;
            workingSteps.push({
                member,
                sojournMs: hours * MS_PER_HOUR,
            });
        }

        // The member who takes the WO into the
        // first working node also stamps the
        // Create-entry and Create-exit state
        // events.
        const creatorPerson =
            workingSteps[0]!.member;

        stateEvents.push({
            id: seedIdentifier(b62Id(rng, 22)),
            entity_id: woId,
            state: path.nodeIds[0]!,
            member_id: creatorPerson,
            at: isoFromMs(cursorMs),
        });

        if (N >= 2) {
            cursorMs += CREATE_DWELL_MS;
            stateEvents.push({
                id: seedIdentifier(b62Id(rng, 22)),
                entity_id: woId,
                state: path.nodeIds[1]!,
                member_id: creatorPerson,
                at: isoFromMs(cursorMs),
            });
        }

        for (let j = 2; j < N; j++) {
            const prior = workingSteps[j - 2]!;
            cursorMs += prior.sojournMs;
            // Clamp long-tail sojourns that
            // would overrun today, so no
            // event is future-dated.
            if (cursorMs >= nowMs) {
                cursorMs = nowMs
                    - (N - j) * MS_PER_SECOND;
            }
            stateEvents.push({
                id: seedIdentifier(b62Id(rng, 22)),
                entity_id: woId,
                state: path.nodeIds[j]!,
                member_id: prior.member,
                at: isoFromMs(cursorMs),
            });
        }

        workOrders.push({
            id: woId,
            organization_id: organizationId,
            display_id: displayId,
            flow_graph: frozenFlowGraph,
            position: i + 1,
        });
        flowWorkOrders.push({
            id: seedIdentifier(b62Id(rng, 22)),
            flow_id: flow.flowId,
            work_order_id: woId,
            at:
                isoFromMs(createdAtMs),
        });
    }

    return {
        workOrders,
        flowWorkOrders,
        stateEvents,
    };
}
