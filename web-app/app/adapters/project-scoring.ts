import type {
    Id,
    ObjectiveId,
    ProjectEntity,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import {
    nowUtc,
    projectStateIsApproved,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import {
    getActiveObjectives,
    getObjectives,
} from './objectives.ts';
import {
    getProjectStates,
} from './state-events.ts';
import {
    latestPerPair,
    weightedMeanByPosition,
} from '../scoring-format.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateCryptoSafeBase62,
} from './crypto-safe-base62.ts';

const projectScoreChanges =
    createSubscriptionChannel([
        'project_objective_baseline_scores',
        'project_objective_actual_scores',
    ]);

export function subscribeProjectScoreChanges(
    fn: () => void,
): () => void {
    return projectScoreChanges.subscribe(fn);
}

export function notifyProjectScoreChange(): void {
    projectScoreChanges.notify();
}

export async function getBaselineScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectObjectiveBaselineScore[]> {
    const all = await ctx.GET<
        ProjectObjectiveBaselineScore[]
    >('project-objective-baseline-scores');
    return all.filter(
        r => r.project_id === projectId,
    );
}

export async function getActualScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ProjectObjectiveActualScore[]> {
    const all = await ctx.GET<
        ProjectObjectiveActualScore[]
    >('project-objective-actual-scores');
    return all.filter(
        r => r.project_id === projectId,
    );
}

export async function getProjectScoring(
    ctx: RequestContext,
    projectId: Id,
): Promise<{
    baseline: ProjectObjectiveBaselineScore[];
    actual: ProjectObjectiveActualScore[];
}> {
    const [baseline, actual] = await Promise.all([
        getBaselineScoresForProject(ctx, projectId),
        getActualScoresForProject(ctx, projectId),
    ]);
    return { baseline, actual };
}

function meanOrUndefined(
    xs: number[],
): number | undefined {
    if (xs.length === 0) return undefined;
    const sum = xs.reduce((a, b) => a + b, 0);
    return Math.round(sum / xs.length);
}

function groupByProject<T extends {
    project_id: string;
}>(rows: T[]): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const r of rows) {
        const list = map.get(r.project_id);
        if (list) {
            list.push(r);
        } else {
            map.set(r.project_id, [r]);
        }
    }
    return map;
}

export async function getPortfolioImpactSummary(
    ctx: RequestContext,
): Promise<{
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
}> {
    const [
        objectives,
        projectRows,
        projectStates,
        allBaseline,
        allActual,
    ] = await Promise.all([
        getObjectives(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
        getProjectStates(ctx),
        ctx.GET<ProjectObjectiveBaselineScore[]>(
            'project-objective-baseline-scores',
        ),
        ctx.GET<ProjectObjectiveActualScore[]>(
            'project-objective-actual-scores',
        ),
    ]);
    const approved = projectRows.filter(p => {
        const s = projectStates.get(p.id);
        return s !== undefined
            && projectStateIsApproved(s);
    });
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
            latestA.map(r => r.objective_id),
        );
        const fullyActualed = latestB.every(b =>
            actualedObjs.has(b.objective_id),
        );
        if (fullyActualed && latestB.length > 0) {
            const baselinedIds = new Set(
                latestB.map(b => b.objective_id),
            );
            const am = weightedMeanByPosition(
                latestA.filter(
                    a => baselinedIds.has(
                        a.objective_id,
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

export async function getObjectiveAggregates(
    ctx: RequestContext,
): Promise<Array<{
    objectiveId: ObjectiveId;
    baselineMean: number | undefined;
    latestActualMean: number | undefined;
    projectsBaselineScored: number;
    projectsActualScored: number;
}>> {
    const [
        activeObjs,
        projectRows,
        projectStates,
        allBaseline,
        allActual,
    ] = await Promise.all([
        getActiveObjectives(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
        getProjectStates(ctx),
        ctx.GET<ProjectObjectiveBaselineScore[]>(
            'project-objective-baseline-scores',
        ),
        ctx.GET<ProjectObjectiveActualScore[]>(
            'project-objective-actual-scores',
        ),
    ]);
    const approved = projectRows.filter(p => {
        const s = projectStates.get(p.id);
        return s !== undefined
            && projectStateIsApproved(s);
    });
    const approvedIds = new Set(approved.map(p => p.id));
    const latestB = latestPerPair(
        allBaseline.filter(
            b => approvedIds.has(b.project_id),
        ),
    );
    const latestA = latestPerPair(
        allActual.filter(
            a => approvedIds.has(a.project_id),
        ),
    );

    const result = [];
    for (const obj of activeObjs) {
        const baselineScores =
            latestB
                .filter(r => r.objective_id === obj.id)
                .map(r => r.score);
        const actualScores =
            latestA
                .filter(r => r.objective_id === obj.id)
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

export async function postProjectBaselineScoring(
    ctx: RequestContext,
    projectId: Id,
    scores: Array<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
): Promise<void> {
    const at = nowUtc();
    const ops = scores.map(s => ({
        method: 'put' as const,
        resource:
            `project-objective-baseline-scores/`
            + generateCryptoSafeBase62(),
        body: {
            project_id: projectId,
            objective_id: s.objectiveId,
            score: s.score,
            at,
        },
    }));
    await ctx.commit({ ops });
    notifyProjectScoreChange();
}

export async function postProjectActualMeasurement(
    ctx: RequestContext,
    projectId: Id,
    scores: Array<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
): Promise<void> {
    const at = nowUtc();
    const ops = scores.map(s => ({
        method: 'put' as const,
        resource:
            `project-objective-actual-scores/`
            + generateCryptoSafeBase62(),
        body: {
            project_id: projectId,
            objective_id: s.objectiveId,
            score: s.score,
            at,
        },
    }));
    await ctx.commit({ ops });
    notifyProjectScoreChange();
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
        projectRows,
        allBaseline,
        allActual,
    ] = await Promise.all([
        getActiveObjectives(ctx),
        getObjectives(ctx),
        ctx.GET<ProjectEntity[]>('projects'),
        ctx.GET<ProjectObjectiveBaselineScore[]>(
            'project-objective-baseline-scores',
        ),
        ctx.GET<ProjectObjectiveActualScore[]>(
            'project-objective-actual-scores',
        ),
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
            latestB.map(b => b.objective_id),
        );
        const actualedIds = new Set(
            latestA.map(a => a.objective_id),
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
                            a.objective_id,
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
