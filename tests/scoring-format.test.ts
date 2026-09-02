import { assertStrictEquals, assertThrows } from '@std/assert';
import {
    latestPerPair,
    weightedMeanByPosition,
    formatSigned,
    toneForScore,
} from '../web-app/app/scoring-format.ts';
import type { ObjectiveId } from '../api/types.ts';
import { generateIdentifier } from '../shared/identifier.ts';

Deno.test('latestPerPair keeps the latest by at',
    () => {
        const rows = [
            { id: generateIdentifier(),
              projectId: 'pnXmXrxOWayANgDLdCjuBw'
                , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 50,
              at: '2026-05-14T00:00:00.000000Z' },
            { id: generateIdentifier(),
              projectId: 'pnXmXrxOWayANgDLdCjuBw'
                , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 60,
              at: '2026-05-15T00:00:00.000000Z' },
            { id: generateIdentifier(),
              projectId: 'pnXmXrxOWayANgDLdCjuBw', objectiveId: 'o2',
              score: -20,
              at: '2026-05-14T00:00:00.000000Z' },
            { id: generateIdentifier(),
              projectId: 'prBESZPjJDiuXCeZLmbiVw'
                , objectiveId: 'ohqxgUBEaFQwYbXsonRPmg',
              score: 10,
              at: '2026-05-14T00:00:00.000000Z' },
        ];
        const latest = latestPerPair(rows);
        assertStrictEquals(latest.length, 3);
        const byKey = new Map(
            latest.map(r =>
                [r.projectId + ':'
                    + r.objectiveId, r.score]),
        );
        assertStrictEquals(byKey.get(
            'pnXmXrxOWayANgDLdCjuBw:ohqxgUBEaFQwYbXsonRPmg',
        ), 60);
        assertStrictEquals(byKey.get('pnXmXrxOWayANgDLdCjuBw:o2'), -20);
        assertStrictEquals(byKey.get(
            'prBESZPjJDiuXCeZLmbiVw:ohqxgUBEaFQwYbXsonRPmg',
        ), 10);
    });

Deno.test('formatSigned emits + for positive', () => {
    assertStrictEquals(formatSigned(42), '+42');
});

Deno.test('formatSigned emits − for negative (U+2212)', () => {
    assertStrictEquals(formatSigned(-10), '−10');
});

Deno.test('formatSigned emits 0 for zero', () => {
    assertStrictEquals(formatSigned(0), '0');
});

Deno.test('toneForScore maps to canonical tone vocabulary', () => {
    assertStrictEquals(toneForScore(1), 'success');
    assertStrictEquals(toneForScore(-1), 'error');
    assertStrictEquals(toneForScore(0), 'muted');
});

const positions = new Map<ObjectiveId, number>([
    ['ohqxgUBEaFQwYbXsonRPmg' as ObjectiveId, 0],
    ['o2' as ObjectiveId, 1],
    ['o3' as ObjectiveId, 2],
]);

Deno.test(
    'weightedMeanByPosition returns null for empty input',
    () => {
        assertStrictEquals(
            weightedMeanByPosition([], positions),
            null,
        );
    },
);

Deno.test(
    'weightedMeanByPosition returns the score for one item',
    () => {
        assertStrictEquals(
            weightedMeanByPosition(
                [{ objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' as ObjectiveId,
                   score: 42 }],
                positions,
            ),
            42,
        );
    },
);

Deno.test(
    'weightedMeanByPosition applies 0.95 decay by position',
    () => {
        // ohqxgUBEaFQwYbXsonRPmg (pos 0, w=1.0) + o2 (pos 1, w=0.95)
        // weightedSum = 60*1.0 + 40*0.95 = 98
        // weightTotal = 1.95
        // mean = 98 / 1.95 = 50.256 → round = 50
        const result = weightedMeanByPosition(
            [
                { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' as ObjectiveId,
                  score: 60 },
                { objectiveId: 'o2' as ObjectiveId,
                  score: 40 },
            ],
            positions,
        );
        assertStrictEquals(result, 50);
    },
);

Deno.test(
    'weightedMeanByPosition sorts unordered input by position',
    () => {
        // Input reverse order; helper sorts by position
        // and applies weights. Same result as ordered.
        const result = weightedMeanByPosition(
            [
                { objectiveId: 'o2' as ObjectiveId,
                  score: 40 },
                { objectiveId: 'ohqxgUBEaFQwYbXsonRPmg' as ObjectiveId,
                  score: 60 },
            ],
            positions,
        );
        assertStrictEquals(result, 50);
    },
);

Deno.test(
    'weightedMeanByPosition throws on unknown objectiveId',
    () => {
        assertThrows(
            () => weightedMeanByPosition(
                [{ objectiveId:
                    'unknown' as ObjectiveId,
                   score: 5 }],
                positions,
            ),
            Error, 'missing position for objective',
        );
    },
);
