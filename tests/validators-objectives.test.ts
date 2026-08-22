import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateProjectEntity,
} from '../api/validators.ts';

test('validateObjectiveEntity accepts valid', () => {
    const v = validateObjectiveEntity({
        organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: 0,
    });
    assert.equal(v.position, 0);
});

test('validateObjectiveEntity accepts fractional position',
    () => {
        const v = validateObjectiveEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: 1.5,
        });
        assert.equal(v.position, 1.5);
    });

test('validateObjectiveEntity accepts negative position',
    () => {
        const v = validateObjectiveEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: -1,
        });
        assert.equal(v.position, -1);
    });

test('validateObjectiveRevisionEntity accepts valid', () => {
    const v = validateObjectiveRevisionEntity({
        objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        name: 'Revenue',
        description: 'Top line',
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assert.equal(v.name, 'Revenue');
});

test('validateObjectiveRevisionEntity rejects empty name',
    () => {
        assert.throws(
            () => validateObjectiveRevisionEntity({
                objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                name: '',
                description: 'd',
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            /ObjectiveRevision\.name must be non-empty/,
        );
    });

test('validateBaselineScoreEntity accepts 0', () => {
    const v = validateBaselineScoreEntity({
        project_id: 'pnXmXrxOWayANgDLdCjuBw',
        objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        score: 0,
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assert.equal(v.score, 0);
});

test('validateBaselineScoreEntity accepts -100 and +100',
    () => {
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: -100,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }).score,
            -100,
        );
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 100,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }).score,
            100,
        );
    });

test('validateBaselineScoreEntity rejects out-of-range',
    () => {
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 101,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            /\[-100, \+100\]/,
        );
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: -101,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateBaselineScoreEntity rejects non-integer',
    () => {
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 12.5,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateActualScoreEntity accepts -50', () => {
    const v = validateActualScoreEntity({
        project_id: 'pnXmXrxOWayANgDLdCjuBw'
            , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        score: -50,
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assert.equal(v.score, -50);
});

test('validateActualScoreEntity rejects out-of-range',
    () => {
        assert.throws(
            () => validateActualScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 200,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateProjectEntity ignores legacy impact fields',
    () => {
        const baseValid = {
            organization_id: 'AjdvjuECVZEgZoFajaIEkg',
            title: 't',
            description: 'd',
            progress: 0,
            start_date: '2026-05-14',
            target_end_date: '2026-05-14',
            estimated_cost: 0,
            actual_cost: 0,
            position: 0,
        };
        const v = validateProjectEntity(baseValid);
        assert.equal(
            'estimated_impact' in (v as object),
            false,
        );
        assert.equal(
            'actual_impact' in (v as object),
            false,
        );
    });
