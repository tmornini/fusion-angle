import type {
    Id,
    ObjectiveEntity,
    ObjectiveId,
} from '../../../api/types.ts';
import type { RequestContext } from './shared.ts';
import { getProjectEntity } from './projects.ts';
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
    activeObjectives: ObjectiveEntity[],
    baselineScores: ObjectiveScore[],
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

export async function postProjectApproval(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const [entity, active, scoring] =
        await Promise.all([
            getProjectEntity(ctx, projectId),
            getActiveObjectives(ctx),
            getProjectScoring(ctx, projectId),
        ]);
    const {
        id: _id,
        organization_id: _org,
        state: _state,
        state_at: _stateAt,
        state_event_id: _stateEventId,
        ...fields
    } = entity;
    void _state;
    void _stateAt;
    void _stateEventId;
    const v = validateProjectForApproval(
        active, scoring.baseline,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    await postProjectStateChange(
        ctx, projectId, fields, 'approved',
    );
}

export async function postProjectArchival(
    ctx: RequestContext,
    projectId: Id,
): Promise<void> {
    const [entity, scoring] = await Promise.all([
        getProjectEntity(ctx, projectId),
        getProjectScoring(ctx, projectId),
    ]);
    const {
        id: _id,
        organization_id: _org,
        state: _state,
        state_at: _stateAt,
        state_event_id: _stateEventId,
        ...fields
    } = entity;
    void _state;
    void _stateAt;
    void _stateEventId;
    const v = validateProjectForArchival(
        scoring.baseline, scoring.actual,
    );
    if (!v.ready) {
        throw new ProjectNotReadyError(v.problems);
    }
    await postProjectStateChange(
        ctx, projectId, fields, 'archived',
    );
}
