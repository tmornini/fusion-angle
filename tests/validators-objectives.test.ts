import { assertStrictEquals, assertThrows } from '@std/assert';
import {
    validateObjectiveEntity,
    validateObjectiveRevisionEntity,
    validateBaselineScoreEntity,
    validateActualScoreEntity,
    validateProjectEntity,
} from '../api/validators.ts';

Deno.test('validateObjectiveEntity accepts valid', () => {
    const v = validateObjectiveEntity({
        organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: 0,
    });
    assertStrictEquals(v.position, 0);
});

Deno.test('validateObjectiveEntity accepts fractional position',
    () => {
        const v = validateObjectiveEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: 1.5,
        });
        assertStrictEquals(v.position, 1.5);
    });

Deno.test('validateObjectiveEntity accepts negative position',
    () => {
        const v = validateObjectiveEntity({
            organization_id: 'AjdvjuECVZEgZoFajaIEkg', position: -1,
        });
        assertStrictEquals(v.position, -1);
    });

Deno.test('validateObjectiveRevisionEntity accepts valid', () => {
    const v = validateObjectiveRevisionEntity({
        objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        name: 'Revenue',
        description: 'Top line',
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assertStrictEquals(v.name, 'Revenue');
});

Deno.test('validateObjectiveRevisionEntity rejects empty name',
    () => {
        assertThrows(
            () => validateObjectiveRevisionEntity({
                objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                name: '',
                description: 'd',
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            Error, 'ObjectiveRevision.name must be non-empty',
        );
    });

Deno.test('validateBaselineScoreEntity accepts 0', () => {
    const v = validateBaselineScoreEntity({
        project_id: 'pnXmXrxOWayANgDLdCjuBw',
        objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        score: 0,
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assertStrictEquals(v.score, 0);
});

Deno.test('validateBaselineScoreEntity accepts -100 and +100',
    () => {
        assertStrictEquals(
            validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: -100,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }).score,
            -100,
        );
        assertStrictEquals(
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

Deno.test('validateBaselineScoreEntity rejects out-of-range',
    () => {
        assertThrows(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 101,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            Error, '[-100, +100]',
        );
        assertThrows(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: -101,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            Error, '[-100, +100]',
        );
    });

Deno.test('validateBaselineScoreEntity rejects non-integer',
    () => {
        assertThrows(
            () => validateBaselineScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 12.5,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            Error, '[-100, +100]',
        );
    });

Deno.test('validateActualScoreEntity accepts -50', () => {
    const v = validateActualScoreEntity({
        project_id: 'pnXmXrxOWayANgDLdCjuBw'
            , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
        score: -50,
        member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
        at: '2026-05-14T00:00:00.000000Z',
    });
    assertStrictEquals(v.score, -50);
});

Deno.test('validateActualScoreEntity rejects out-of-range',
    () => {
        assertThrows(
            () => validateActualScoreEntity({
                project_id: 'pnXmXrxOWayANgDLdCjuBw'
                    , objective_id: 'ohqxgUBEaFQwYbXsonRPmg',
                score: 200,
                member_id: 'xdaJyuuPyHfffCGLhqDrOQ',
                at: '2026-05-14T00:00:00.000000Z',
            }),
            Error, '[-100, +100]',
        );
    });

Deno.test('validateProjectEntity ignores legacy impact fields',
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
        assertStrictEquals(
            'estimated_impact' in (v as object),
            false,
        );
        assertStrictEquals(
            'actual_impact' in (v as object),
            false,
        );
    });
