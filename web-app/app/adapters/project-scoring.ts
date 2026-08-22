import type {
    Id,
    ObjectiveEntity,
    ObjectiveId,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
} from '../../../api/types.ts';
import {
    nowUtc,
    projectStateIsApproved,
    assertProjectState,
} from '../../../api/types.ts';
import {
    filterByField,
    organizationItem,
    type RequestContext,
} from './shared.ts';
import {
    getActiveObjectives,
    getObjectives,
} from './objectives.ts';
import {
    getProjectEntities,
} from './projects.ts';
import {
    getCurrentHumanMember,
} from './members.ts';
import {
    latestPerPair,
    weightedMeanByPosition,
} from '../scoring-format.ts';
import {
    createSubscriptionChannel,
} from '../channels.ts';
import {
    generateIdentifier,
} from '../../../shared/identifier.ts';

const projectScoreChanges =
    createSubscriptionChannel();

export function subscribeProjectScoreChanges(
    fn: () => void,
): () => void {
    return projectScoreChanges.subscribe(fn);
}

export function notifyProjectScoreChange(): void {
    projectScoreChanges.notify();
}

// The camelCase domain shape for a scored objective. The
// adapter is the divorce point: storage rows (snake_case)
// are mapped here so the shared scoring utils and every
// presenter speak one idiom. Baseline and actual share it.
export interface ObjectiveScore {
    id: string;
    projectId: Id;
    objectiveId: ObjectiveId;
    memberId: Id;
    score: number;
    at: string;
}

function toObjectiveScore(
    r: ProjectObjectiveBaselineScoreEntity
        | ProjectObjectiveActualScoreEntity,
): ObjectiveScore {
    return {
        id: r.id,
        projectId: r.project_id,
        objectiveId: r.objective_id,
        memberId: r.member_id,
        score: r.score,
        at: r.at,
    };
}

// The baseline scores for ONE project — the server filters the
// nested collection to the parent project, so no client filter
// is needed.
export async function getBaselineScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ObjectiveScore[]> {
    const rows = await ctx.GET<
        ProjectObjectiveBaselineScoreEntity[]
    >(
        organizationItem(ctx, 'projects', projectId)
            + '/objective-baseline-scores/',
    );
    return rows.map(toObjectiveScore);
}

// The actual scores for ONE project — same server-side filter.
export async function getActualScoresForProject(
    ctx: RequestContext,
    projectId: Id,
): Promise<ObjectiveScore[]> {
    const rows = await ctx.GET<
        ProjectObjectiveActualScoreEntity[]
    >(
        organizationItem(ctx, 'projects', projectId)
            + '/objective-actual-scores/',
    );
    return rows.map(toObjectiveScore);
}

// The baseline scores across EVERY project the caller's org can
// see — reassembled from the nested per-project collections. The
// projects list is org-scoped; each project's baseline scores
// are fetched in parallel and concatenated.
async function getAllBaselineScores(
    ctx: RequestContext,
): Promise<ObjectiveScore[]> {
    const projects = await getProjectEntities(ctx);
    const perProject = await Promise.all(
        projects.map(p =>
            getBaselineScoresForProject(ctx, p.id)),
    );
    return perProject.flat();
}

// The actual scores across EVERY project — same per-project
// reassembly as the baselines above.
async function getAllActualScores(
    ctx: RequestContext,
): Promise<ObjectiveScore[]> {
    const projects = await getProjectEntities(ctx);
    const perProject = await Promise.all(
        projects.map(p =>
            getActualScoresForProject(ctx, p.id)),
    );
    return perProject.flat();
}

export async function getProjectScoring(
    ctx: RequestContext,
    projectId: Id,
): Promise<{
    baseline: ObjectiveScore[];
    actual: ObjectiveScore[];
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

export async function getPortfolioImpactSummary(
    ctx: RequestContext,
): Promise<{
    baselineMean: number | undefined;
    actualMean: number | undefined;
    projectCount: number;
    actualCount: number;
}> {
    // Approved filter reads the project GET row trio —
    // no second hop to the states log.
    const [
        objectives,
        projectRows,
        allBaseline,
        allActual,
    ] = await Promise.all([
        getObjectives(ctx),
        getProjectEntities(ctx),
        getAllBaselineScores(ctx),
        getAllActualScores(ctx),
    ]);
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

// The one read-set behind the dashboard's objective
// widgets. Fetched ONCE per render and handed to the pure
// builders below — the aggregates and trendlines consume
// the same five logical reads, so fetching per-builder
// repeated every read and its auth/ledger derivation.
export interface ObjectiveScoringInputs {
    activeObjectives: ObjectiveEntity[];
    approvedProjectIds: Set<Id>;
    baselineScores: ObjectiveScore[];
    actualScores: ObjectiveScore[];
}

export async function getObjectiveScoringInputs(
    ctx: RequestContext,
): Promise<ObjectiveScoringInputs> {
    // Approved filter reads the project GET row trio —
    // no second hop to the states log.
    const [
        activeObjectives,
        projectRows,
        baselineScores,
        actualScores,
    ] = await Promise.all([
        getActiveObjectives(ctx),
        getProjectEntities(ctx),
        getAllBaselineScores(ctx),
        getAllActualScores(ctx),
    ]);
    const approvedProjectIds = new Set(
        projectRows
            .filter(p =>
                projectStateIsApproved(
                    assertProjectState(
                        p.state,
                        'project ' + p.id,
                    ),
                ),
            )
            .map(p => p.id),
    );
    return {
        activeObjectives,
        approvedProjectIds,
        baselineScores,
        actualScores,
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

export async function postProjectBaselineScoring(
    ctx: RequestContext,
    projectId: Id,
    scores: Array<{
        objectiveId: ObjectiveId;
        score: number;
    }>,
): Promise<void> {
    const at = nowUtc();
    const member = await getCurrentHumanMember(ctx);
    // Fresh base62 address per PUT; shared `at` minted once
    // before the member await (position unchanged).
    await Promise.all(scores.map(s =>
        ctx.PUT(
            organizationItem(ctx, 'projects', projectId)
            + '/objective-baseline-scores/'
            + generateIdentifier(),
            {
                project_id: projectId,
                objective_id: s.objectiveId,
                score: s.score,
                member_id: member.id,
                at,
            },
        ),
    ));
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
    const member = await getCurrentHumanMember(ctx);
    await Promise.all(scores.map(s =>
        ctx.PUT(
            organizationItem(ctx, 'projects', projectId)
            + '/objective-actual-scores/'
            + generateIdentifier(),
            {
                project_id: projectId,
                objective_id: s.objectiveId,
                score: s.score,
                member_id: member.id,
                at,
            },
        ),
    ));
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
        getProjectEntities(ctx),
        getAllBaselineScores(ctx),
        getAllActualScores(ctx),
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
