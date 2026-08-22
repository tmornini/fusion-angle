import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    Project,
    ProjectView,
} from '../web-app/app/adapters/projects.ts';
import type {
    ObjectiveEntity,
} from '../api/types.ts';

function makeProject(): Project {
    return new Project({
        id: 'pnXmXrxOWayANgDLdCjuBw', title: 't',
        description: 'd', progress: 0,
        start_date: '2026-05-14',
        target_end_date: '2026-05-14',
        estimated_cost: 0, actual_cost: 0,
        position: 0,
    }, {
        state: 'approved',
        stateAt: '2026-01-01T00:00:00.000000Z',
        stateEventId: 'ev-p1',
    });
}

const T1 = '2026-05-14T00:00:00.000000Z';
const T2 = '2026-05-15T00:00:00.000000Z';

const oneObjective: ObjectiveEntity[] = [
    { id: 'ohqxgUBEaFQwYbXsonRPmg', position: 0 },
];
const twoObjectives: ObjectiveEntity[] = [
    { id: 'ohqxgUBEaFQwYbXsonRPmg', position: 0 },
    { id: 'o2', position: 1 },
];

test(
    'impactBaselineMean returns null with no scores',
    () => {
        const v = new ProjectView(
            makeProject(),
            oneObjective,
            [],
            [],
        );
        assert.equal(v.impactBaselineMean(), null);
    },
);

test(
    'impactBaselineMean returns score for single objective',
    () => {
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50, at: T1 },
        ];
        const v = new ProjectView(
            makeProject(),
            oneObjective,
            baseline,
            [],
        );
        assert.equal(v.impactBaselineMean(), 50);
    },
);

test(
    'impactBaselineMean takes latest score per objective',
    () => {
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50, at: T1 },
            { id: 'b2', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 60, at: T2 },
        ];
        const v = new ProjectView(
            makeProject(),
            oneObjective,
            baseline,
            [],
        );
        assert.equal(v.impactBaselineMean(), 60);
    },
);

test(
    'impactBaselineMean weights by position',
    () => {
        // ohqxgUBEaFQwYbXsonRPmg at position 0 (weight 1.0), o2 at
        // position 1 (weight 0.95).
        // weighted sum = 60*1.0 + 40*0.95 = 98
        // weight total = 1.95
        // mean = 98 / 1.95 = 50.26 -> round = 50
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'o2',
              score: 40, at: T1 },
            { id: 'b2', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 60, at: T1 },
        ];
        const v = new ProjectView(
            makeProject(),
            twoObjectives,
            baseline,
            [],
        );
        assert.equal(v.impactBaselineMean(), 50);
    },
);

test(
    'impactActualMean is null when not fully scored',
    () => {
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50, at: T1 },
            { id: 'b2', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'o2',
              score: 40, at: T1 },
        ];
        const actual = [
            { id: 'UQTJZvCoKlFjEoDlDUwekw'
                , projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 45, at: T2 },
        ];
        const v = new ProjectView(
            makeProject(),
            twoObjectives,
            baseline,
            actual,
        );
        assert.equal(v.impactActualMean(), null);
    },
);

test(
    'impactActualMean weights actuals when fully scored',
    () => {
        // baselined ohqxgUBEaFQwYbXsonRPmg, o2 → both must have actuals.
        // ohqxgUBEaFQwYbXsonRPmg actual 30, o2 actual 50:
        // weighted = 30*1.0 + 50*0.95 = 77.5
        // total = 1.95 → 39.74 -> round = 40
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50, at: T1 },
            { id: 'b2', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'o2',
              score: 40, at: T1 },
        ];
        const actual = [
            { id: 'UQTJZvCoKlFjEoDlDUwekw'
                , projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'o2',
              score: 50, at: T2 },
            { id: 'UZgNCkZlSJcSaAmAJuSkcw'
                , projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 30, at: T2 },
        ];
        const v = new ProjectView(
            makeProject(),
            twoObjectives,
            baseline,
            actual,
        );
        assert.equal(v.impactActualMean(), 40);
    },
);

test(
    'impactActualMean ignores actuals for un-baselined objs',
    () => {
        // Only ohqxgUBEaFQwYbXsonRPmg baselined. Actuals for
        // ohqxgUBEaFQwYbXsonRPmg and o2.
        // Result should consider only ohqxgUBEaFQwYbXsonRPmg actual.
        const baseline = [
            { id: 'b1', projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50, at: T1 },
        ];
        const actual = [
            { id: 'UQTJZvCoKlFjEoDlDUwekw'
                , projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 70, at: T2 },
            { id: 'UZgNCkZlSJcSaAmAJuSkcw'
                , projectId: 'pnXmXrxOWayANgDLdCjuBw',
              objectiveId: 'o2',
              score: 999, at: T2 },
        ];
        const v = new ProjectView(
            makeProject(),
            twoObjectives,
            baseline,
            actual,
        );
        assert.equal(v.impactActualMean(), 70);
    },
);
