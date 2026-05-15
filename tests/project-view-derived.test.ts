import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    Project,
    ProjectView,
} from '../web-app/app/adapters/projects.ts';
import type {
    Objective,
    ProjectObjectiveBaselineScore,
    ProjectObjectiveActualScore,
} from '../api/types.ts';

function makeView(): ProjectView {
    return new ProjectView(new Project({
        id: 'p1', status: 'approved', title: 't',
        description: 'd', progress: 0,
        start_date: '2026-05-14T00:00:00.000Z',
        target_end_date: '2026-05-14T00:00:00.000Z',
        estimated_duration: 0, actual_duration: 0,
        estimated_cost: 0, actual_cost: 0,
        position: 0, business_context: '{}',
        timeline_label: 'q1',
    }));
}

const T1 = '2026-05-14T00:00:00.000Z';
const T2 = '2026-05-15T00:00:00.000Z';

const activeOne: Objective[] = [
    { id: 'o1', position: 0 },
];
const activeTwo: Objective[] = [
    { id: 'o1', position: 0 },
    { id: 'o2', position: 1 },
];
const baselineO1: ProjectObjectiveBaselineScore[] = [
    { id: 'b1', project_id: 'p1', objective_id: 'o1',
      score: 50, scored_at: T1 },
];

test('isBaselineScored true when every active obj has row',
    () => {
        const v = makeView();
        assert.equal(
            v.isBaselineScored(activeOne, baselineO1),
            true,
        );
    });

test('isBaselineScored false when missing one', () => {
    const v = makeView();
    assert.equal(
        v.isBaselineScored(activeTwo, baselineO1),
        false,
    );
});

test('baselineTotal averages latest per pair', () => {
    const v = makeView();
    const score = v.baselineTotal([
        { id: 'b1', project_id: 'p1', objective_id: 'o1',
          score: 50, scored_at: T1 },
        { id: 'b2', project_id: 'p1', objective_id: 'o1',
          score: 60, scored_at: T2 },
        { id: 'b3', project_id: 'p1', objective_id: 'o2',
          score: -20, scored_at: T1 },
    ]);
    assert.equal(score, 20); // (60 + -20) / 2
});

test('baselineTotal throws when no rows', () => {
    const v = makeView();
    assert.throws(() => v.baselineTotal([]));
});

test('actualTotal throws when not fully actual-scored',
    () => {
        const v = makeView();
        assert.throws(
            () => v.actualTotal(baselineO1, []),
        );
    });

test('actualTotal averages over baselined objectives',
    () => {
        const v = makeView();
        const score = v.actualTotal(
            baselineO1,
            [{
                id: 'a1', project_id: 'p1',
                objective_id: 'o1',
                score: 40, scored_at: T2,
            }],
        );
        assert.equal(score, 40);
    });
