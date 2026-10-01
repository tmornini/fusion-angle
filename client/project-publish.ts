import type {
    ObjectiveEntity,
    ObjectiveId,
    ProjectEntity,
} from '../shared/types.ts';
import type { HttpMessage } from
    '../shared/http-message/http-message.ts';
import type { RequestContext } from './request-context.ts';
import type { ValidationResult } from './validation.ts';
import { getActiveObjectives } from './objectives.ts';
import {
    getProjectScoring,
    type ObjectiveScore,
} from './project-scoring.ts';
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
        objectiveId: ObjectiveId;
        at: string;
    }>,
): Set<ObjectiveId> {
    const map = new Map<ObjectiveId, string>();
    for (const r of rows) {
        const prev = map.get(r.objectiveId);
        if (!prev || r.at > prev) {
            map.set(r.objectiveId, r.at);
        }
    }
    return new Set(map.keys());
}

export function validateProjectForApproval(
    activeObjectives: HttpMessage<ObjectiveEntity>[],
    baselineScores: ObjectiveScore[],
): ValidationResult<ProjectProblem> {
    const scored = latestPerObjective(baselineScores);
    const problems: ProjectProblem[] = [];
    for (const message of activeObjectives) {
        const obj = message.body().toValue();
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
    baselineScores: ObjectiveScore[],
    actualScores: ObjectiveScore[],
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

// The page holds the project, so its read retires; the
// objectives and scores are read here because their bodies
// decide whether the transition may go.
export async function postProjectApproval(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
): Promise<HttpMessage<ProjectEntity>> {
    const [active, scoring] = await Promise.all([
        getActiveObjectives(ctx),
        getProjectScoring(ctx, held.body().toValue().id),
    ]);
    const v = validateProjectForApproval(
        active, scoring.baseline,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    return await postProjectStateChange(ctx, held, 'approved');
}

export async function postProjectArchival(
    ctx: RequestContext,
    held: HttpMessage<ProjectEntity>,
): Promise<HttpMessage<ProjectEntity>> {
    const scoring = await getProjectScoring(
        ctx, held.body().toValue().id,
    );
    const v = validateProjectForArchival(
        scoring.baseline, scoring.actual,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    return await postProjectStateChange(ctx, held, 'archived');
}
