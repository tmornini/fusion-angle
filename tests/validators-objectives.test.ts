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
    const v = validateObjectiveEntity({ position: 0 });
    assert.equal(v.position, 0);
});

test('validateObjectiveEntity rejects non-integer position',
    () => {
        assert.throws(
            () => validateObjectiveEntity({ position: 1.5 }),
            /non-negative integer for Objective\.position/,
        );
    });

test('validateObjectiveEntity rejects negative position',
    () => {
        assert.throws(
            () => validateObjectiveEntity({ position: -1 }),
            /non-negative integer for Objective\.position/,
        );
    });

test('validateObjectiveRevisionEntity accepts valid', () => {
    const v = validateObjectiveRevisionEntity({
        objective_id: 'o1',
        name: 'Revenue',
        description: 'Top line',
        revised_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.name, 'Revenue');
});

test('validateObjectiveRevisionEntity rejects empty name',
    () => {
        assert.throws(
            () => validateObjectiveRevisionEntity({
                objective_id: 'o1',
                name: '',
                description: 'd',
                revised_at: '2026-05-14T00:00:00.000Z',
            }),
            /ObjectiveRevision\.name must be non-empty/,
        );
    });

test('validateBaselineScoreEntity accepts 0', () => {
    const v = validateBaselineScoreEntity({
        project_id: 'p1',
        objective_id: 'o1',
        score: 0,
        scored_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.score, 0);
});

test('validateBaselineScoreEntity accepts -100 and +100',
    () => {
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: -100,
                scored_at: '2026-05-14T00:00:00.000Z',
            }).score,
            -100,
        );
        assert.equal(
            validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: 100,
                scored_at: '2026-05-14T00:00:00.000Z',
            }).score,
            100,
        );
    });

test('validateBaselineScoreEntity rejects out-of-range',
    () => {
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: 101,
                scored_at: '2026-05-14T00:00:00.000Z',
            }),
            /\[-100, \+100\]/,
        );
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: -101,
                scored_at: '2026-05-14T00:00:00.000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateBaselineScoreEntity rejects non-integer',
    () => {
        assert.throws(
            () => validateBaselineScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: 12.5,
                scored_at: '2026-05-14T00:00:00.000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateActualScoreEntity accepts -50', () => {
    const v = validateActualScoreEntity({
        project_id: 'p1', objective_id: 'o1',
        score: -50,
        scored_at: '2026-05-14T00:00:00.000Z',
    });
    assert.equal(v.score, -50);
});

test('validateActualScoreEntity rejects out-of-range',
    () => {
        assert.throws(
            () => validateActualScoreEntity({
                project_id: 'p1', objective_id: 'o1',
                score: 200,
                scored_at: '2026-05-14T00:00:00.000Z',
            }),
            /\[-100, \+100\]/,
        );
    });

test('validateProjectEntity ignores legacy impact fields',
    () => {
        const baseValid = {
            title: 't',
            description: 'd',
            progress: 0,
            start_date: '2026-05-14T00:00:00.000Z',
            target_end_date: '2026-05-14T00:00:00.000Z',
            estimated_duration: 0,
            actual_duration: 0,
            estimated_cost: 0,
            actual_cost: 0,
            position: 0,
            business_context: '{}',
            timeline_label: 'q1',
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
