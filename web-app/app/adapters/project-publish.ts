import type {
    ProjectEntity,
    Id,
    Objective,
    ObjectiveId,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import type { ValidationResult } from './validation.ts';
import { getActiveObjectives } from './objectives.ts';
import { getProjectScoring } from './project-scoring.ts';
import {
    postProjectStateChange,
} from './projects.ts';

export type ProjectProblem =
    | { kind: 'baseline_unscored';
        objectiveId: ObjectiveId }
    | { kind: 'actual_unscored';
        objectiveId: ObjectiveId };

function latestPerObjective(
    rows: Array<{
        objective_id: ObjectiveId;
        at: string;
    }>,
): Set<ObjectiveId> {
    const map = new Map<ObjectiveId, string>();
    for (const r of rows) {
        const prev = map.get(r.objective_id);
        if (!prev || r.at > prev) {
            map.set(r.objective_id, r.at);
        }
    }
    return new Set(map.keys());
}

export function validateProjectForApproval(
    project: ProjectEntity,
    activeObjectives: Objective[],
    baselineScores: ProjectObjectiveBaselineScore[],
): ValidationResult<ProjectProblem> {
    const scored = latestPerObjective(baselineScores);
    const problems: ProjectProblem[] = [];
    for (const obj of activeObjectives) {
        if (!scored.has(obj.id)) {
            problems.push({
                kind: 'baseline_unscored',
                objectiveId: obj.id,
            });
        }
    }
    return {
        ready: problems.length === 0,
        problems,
    };
}

export function validateProjectForArchival(
    project: ProjectEntity,
    baselineScores: ProjectObjectiveBaselineScore[],
    actualScores: ProjectObjectiveActualScore[],
): ValidationResult<ProjectProblem> {
    const baselined =
        latestPerObjective(baselineScores);
    const actualed = latestPerObjective(actualScores);
    const problems: ProjectProblem[] = [];
    for (const objId of baselined) {
        if (!actualed.has(objId)) {
            problems.push({
                kind: 'actual_unscored',
                objectiveId: objId,
            });
        }
    }
    return {
        ready: problems.length === 0,
        problems,
    };
}

export class ProjectNotReadyError extends Error {
    readonly problems: ProjectProblem[];
    constructor(problems: ProjectProblem[]) {
        super('project not ready: '
            + problems.map(p => p.kind).join(', '));
        this.problems = problems;
    }
}

export async function postProjectApproval(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const [active, scoring] = await Promise.all([
        getActiveObjectives(ctx),
        getProjectScoring(ctx, projectId),
    ]);
    const v = validateProjectForApproval(
        project, active, scoring.baseline,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    await postProjectStateChange(
        ctx, projectId, 'approved',
    );
}

export async function postProjectArchival(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const project = await ctx.GET<ProjectEntity>(
        `projects/${projectId}`,
    );
    const scoring = await getProjectScoring(
        ctx, projectId,
    );
    const v = validateProjectForArchival(
        project, scoring.baseline, scoring.actual,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    await postProjectStateChange(
        ctx, projectId, 'archived',
    );
}
