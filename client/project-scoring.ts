import type {
    Id,
    ObjectiveEntity,
    ObjectiveId,
    ProjectEntity,
    ProjectObjectiveBaselineScoreEntity,
    ProjectObjectiveActualScoreEntity,
} from '../shared/types.ts';
import {
    nowUtc,
    projectStateIsApproved,
    assertProjectState,
} from '../shared/types.ts';
import {
    organizationItem,
    type RequestContext,
} from './shared.ts';
import {
    getObjectives,
} from './objectives.ts';
import {
    getProjectEntities,
} from './projects.ts';
import {
    getCurrentHumanMember,
} from './members.ts';
import {
    createSubscriptionChannel,
} from './channels.ts';
import {
    generateIdentifier,
} from '../shared/identifier.ts';

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
// see — reassembled from the nested per-project collections.
// Callers pass the projects list they already hold.
export async function getAllBaselineScores(
    ctx: RequestContext,
    projects: readonly { readonly id: Id }[],
): Promise<ObjectiveScore[]> {
    const perProject = await Promise.all(
        projects.map(p =>
            getBaselineScoresForProject(ctx, p.id)),
    );
    return perProject.flat();
}

// The actual scores across EVERY project — same per-project
// reassembly as the baselines above.
export async function getAllActualScores(
    ctx: RequestContext,
    projects: readonly { readonly id: Id }[],
): Promise<ObjectiveScore[]> {
    const perProject = await Promise.all(
        projects.map(p =>
            getActualScoresForProject(ctx, p.id)),
    );
    return perProject.flat();
}

export interface DashboardScoringBundle {
    readonly projects: ProjectEntity[];
    readonly objectives: ObjectiveEntity[];
    readonly baselineScores: ObjectiveScore[];
    readonly actualScores: ObjectiveScore[];
}

export function startDashboardScoringReads(
    ctx: RequestContext,
): {
    readonly bundleP: Promise<DashboardScoringBundle>;
    readonly objectivesP: Promise<ObjectiveEntity[]>;
} {
    const projectsP = getProjectEntities(ctx);
    const objectivesP = getObjectives(ctx);
    const bundleP = (async () => {
        const projects = await projectsP;
        const [
            baselineScores,
            actualScores,
            objectives,
        ] = await Promise.all([
            getAllBaselineScores(ctx, projects),
            getAllActualScores(ctx, projects),
            objectivesP,
        ]);
        return {
            projects, objectives,
            baselineScores, actualScores,
        };
    })();
    return { bundleP, objectivesP };
}

export async function getDashboardScoringBundle(
    ctx: RequestContext,
): Promise<DashboardScoringBundle> {
    return startDashboardScoringReads(ctx).bundleP;
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

export function getObjectiveScoringInputs(
    bundle: DashboardScoringBundle,
): ObjectiveScoringInputs {
    const activeObjectives = bundle.objectives
        .filter(o => o.state === 'active')
        .sort((a, b) => a.position - b.position);
    const approvedProjectIds = new Set(
        bundle.projects
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
        baselineScores: bundle.baselineScores,
        actualScores: bundle.actualScores,
    };
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
    // Fresh base62 name per PUT; shared `at` minted once
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
