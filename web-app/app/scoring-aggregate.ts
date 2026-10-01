import type { Id, ObjectiveId } from '../../shared/types.ts';
import {
    assertProjectState,
    projectStateIsApproved,
} from '../../shared/types.ts';
import {
    filterByField,
    type RequestContext,
} from '../../client/request-context.ts';
import {
    getAllActualScores,
    getAllBaselineScores,
    type DashboardScoringBundle,
    type ObjectiveScoringInputs,
} from '../../client/project-scoring.ts';
import {
    getActiveObjectives,
    getObjectives,
} from '../../client/objectives.ts';
import { getProjectEntities } from '../../client/projects.ts';
import {
    latestPerPair,
    weightedMeanByPosition,
} from './scoring-format.ts';

function meanOrUndefined(
    xs: number[],
): number | undefined {
    if (xs.length === 0) return undefined;
    const sum = xs.reduce((a, b) => a + b, 0);
    return Math.round(sum / xs.length);
}

function groupByProject<T extends {
    projectId: string;
}>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const r of rows) {
        const list = map.get(r.projectId);
        if (list) {
            list.push(r);
        } else {
            map.set(r.projectId, [r]);
        }
    }
    return map;
}

export function getPortfolioImpactSummary(
    bundle: DashboardScoringBundle,
): {
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
} {
    const objectives = bundle.objectives;
    const projectRows = bundle.projects;
    const allBaseline = bundle.baselineScores;
    const allActual = bundle.actualScores;
    const approved = projectRows.filter(p =>
        projectStateIsApproved(
            assertProjectState(
                p.state, 'project ' + p.id,
            ),
        ),
    );
    const posByObj = new Map<ObjectiveId, number>(
        objectives.map(o => [o.id, o.position]),
    );
    const baselineByProject = groupByProject(allBaseline);
    const actualByProject = groupByProject(allActual);

    const baselineMeansPerProject: number[] = [];
    const actualMeansPerProject: number[] = [];

    for (const p of approved) {
        const latestB = latestPerPair(
            baselineByProject.get(p.id) ?? [],
        );
        const m = weightedMeanByPosition(
            latestB, posByObj,
        );
        if (m !== null) {
            baselineMeansPerProject.push(m);
        }
        const latestA = latestPerPair(
            actualByProject.get(p.id) ?? [],
        );
        const actualedObjs = new Set(
            latestA.map(r => r.objectiveId),
        );
        const fullyActualed = latestB.every(b =>
            actualedObjs.has(b.objectiveId),
        );
        if (fullyActualed && latestB.length > 0) {
            const baselinedIds = new Set(
                latestB.map(b => b.objectiveId),
            );
            const am = weightedMeanByPosition(
                latestA.filter(
                    a => baselinedIds.has(
                        a.objectiveId,
                    ),
                ),
                posByObj,
            );
            if (am !== null) {
                actualMeansPerProject.push(am);
            }
        }
    }

    return {
        baselineMean: meanOrUndefined(
            baselineMeansPerProject,
        ),
        actualMean: meanOrUndefined(
            actualMeansPerProject,
        ),
        projectCount: baselineMeansPerProject.length,
        actualCount: actualMeansPerProject.length,
    };
}

export function buildObjectiveAggregates(
    inputs: ObjectiveScoringInputs,
): Array<{
    objectiveId: ObjectiveId;
    baselineMean: number | undefined;
    latestActualMean: number | undefined;
    projectsBaselineScored: number;
    projectsActualScored: number;
}> {
    const approvedIds =
        inputs.approvedProjectIds;
    const latestB = latestPerPair(
        inputs.baselineScores.filter(
            b => approvedIds.has(b.projectId),
        ),
    );
    const latestA = latestPerPair(
        inputs.actualScores.filter(
            a => approvedIds.has(a.projectId),
        ),
    );

    const result = [];
    for (const obj of inputs.activeObjectives) {
        const baselineScores =
            filterByField(latestB, 'objectiveId', obj.id)
                .map(r => r.score);
        const actualScores =
            filterByField(latestA, 'objectiveId', obj.id)
                .map(r => r.score);

        result.push({
            objectiveId: obj.id,
            baselineMean: meanOrUndefined(baselineScores),
            latestActualMean: meanOrUndefined(actualScores),
            projectsBaselineScored: baselineScores.length,
            projectsActualScored: actualScores.length,
        });
    }
    return result;
}

export interface TrendPoint {
    at: string;
    value: number;
}

// Returns each objective's score trend: the first point
// is its baseline (the starting reference mean, dated to
// the last baseline edit); the rest are measured means,
// one per distinct actual-score timestamp, in order.
export function buildObjectiveTrendlines(
    inputs: ObjectiveScoringInputs,
): Map<ObjectiveId, TrendPoint[]> {
    const approvedIds =
        inputs.approvedProjectIds;
    const latestBaselineForApproved = latestPerPair(
        inputs.baselineScores.filter(
            b => approvedIds.has(b.projectId),
        ),
    );
    const approvedActuals =
        inputs.actualScores.filter(
            a => approvedIds.has(a.projectId),
        );

    const result = new Map<ObjectiveId, TrendPoint[]>();

    for (const obj of inputs.activeObjectives) {
        const baselineRows = filterByField(
            latestBaselineForApproved, 'objectiveId', obj.id,
        );
        const baselineMean = meanOrUndefined(
            baselineRows.map(r => r.score),
        );
        if (baselineMean === undefined) {
            result.set(obj.id, []);
            continue;
        }
        const baselineAt = baselineRows.reduce(
            (max, r) => (r.at > max ? r.at : max),
            baselineRows[0]!.at,
        );
        const points: TrendPoint[] = [
            { at: baselineAt, value: baselineMean },
        ];
        const actualsForObj =
            filterByField(approvedActuals, 'objectiveId', obj.id)
                .slice()
                .sort((a, b) => a.at.localeCompare(b.at));
        const runningLatest = new Map<string, number>();
        let pendingAt: string | undefined = undefined;
        for (const row of actualsForObj) {
            if (pendingAt !== undefined
                && row.at !== pendingAt) {
                const m = meanOrUndefined(
                    Array.from(runningLatest.values()),
                );
                if (m !== undefined) {
                    points.push({ at: pendingAt, value: m });
                }
            }
            runningLatest.set(row.projectId, row.score);
            pendingAt = row.at;
        }
        if (pendingAt !== undefined) {
            const m = meanOrUndefined(
                Array.from(runningLatest.values()),
            );
            if (m !== undefined) {
                points.push({ at: pendingAt, value: m });
            }
        }
        result.set(obj.id, points);
    }
    return result;
}

export async function getProjectsScoreColumn(
    ctx: RequestContext,
): Promise<Array<{
    projectId: Id;
    baselineAvg: number | undefined;
    latestActualAvg: number | undefined;
    baselineCount: number;
    totalActiveObjectives: number;
}>> {
    const [
        activeObjs,
        objectives,
        projectMessages,
    ] = await Promise.all([
        getActiveObjectives(ctx),
        getObjectives(ctx),
        getProjectEntities(ctx),
    ]);
    const projectRows = projectMessages.map(
        (m) => m.body().toValue(),
    );
    const [allBaseline, allActual] = await Promise.all([
        getAllBaselineScores(ctx, projectRows),
        getAllActualScores(ctx, projectRows),
    ]);
    const totalActive = activeObjs.length;
    const posByObj = new Map<ObjectiveId, number>(
        objectives.map(o => [o.id, o.position]),
    );
    const baselineByProject = groupByProject(allBaseline);
    const actualByProject = groupByProject(allActual);

    const out = [];
    for (const p of projectRows) {
        const latestB = latestPerPair(
            baselineByProject.get(p.id) ?? [],
        );
        const latestA = latestPerPair(
            actualByProject.get(p.id) ?? [],
        );
        const baselinedIds = new Set(
            latestB.map(b => b.objectiveId),
        );
        const actualedIds = new Set(
            latestA.map(a => a.objectiveId),
        );
        const fullyActualed = latestB.length > 0
            && Array.from(baselinedIds).every(
                id => actualedIds.has(id),
            );
        out.push({
            projectId: p.id,
            baselineAvg: weightedMeanByPosition(
                latestB, posByObj,
            ) ?? undefined,
            latestActualAvg: fullyActualed
                ? weightedMeanByPosition(
                    latestA.filter(
                        a => baselinedIds.has(
                            a.objectiveId,
                        ),
                    ),
                    posByObj,
                ) ?? undefined
                : undefined,
            baselineCount: latestB.length,
            totalActiveObjectives: totalActive,
        });
    }
    return out;
}
