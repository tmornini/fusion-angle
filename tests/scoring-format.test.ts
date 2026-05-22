import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    latestPerPair,
    weightedMeanByPosition,
    formatSigned,
    toneForScore,
} from '../web-app/app/scoring-format.ts';
import type { ObjectiveId } from '../api/types.ts';

test('latestPerPair keeps the latest by at',
    () => {
        const rows = [
            { project_id: 'p1', objective_id: 'o1',
              score: 50,
              at: '2026-05-14T00:00:00.000Z' },
            { project_id: 'p1', objective_id: 'o1',
              score: 60,
              at: '2026-05-15T00:00:00.000Z' },
            { project_id: 'p1', objective_id: 'o2',
              score: -20,
              at: '2026-05-14T00:00:00.000Z' },
            { project_id: 'p2', objective_id: 'o1',
              score: 10,
              at: '2026-05-14T00:00:00.000Z' },
        ];
        const latest = latestPerPair(rows);
        assert.equal(latest.length, 3);
        const byKey = new Map(
            latest.map(r =>
                [r.project_id + ':'
                    + r.objective_id, r.score]),
        );
        assert.equal(byKey.get('p1:o1'), 60);
        assert.equal(byKey.get('p1:o2'), -20);
        assert.equal(byKey.get('p2:o1'), 10);
    });

test('formatSigned emits + for positive', () => {
    assert.equal(formatSigned(42), '+42');
});

test('formatSigned emits − for negative (U+2212)', () => {
    assert.equal(formatSigned(-10), '−10');
});

test('formatSigned emits 0 for zero', () => {
    assert.equal(formatSigned(0), '0');
});

test('toneForScore maps to canonical tone vocabulary', () => {
    assert.equal(toneForScore(1), 'success');
    assert.equal(toneForScore(-1), 'error');
    assert.equal(toneForScore(0), 'muted');
});

const positions = new Map<ObjectiveId, number>([
    ['o1' as ObjectiveId, 0],
    ['o2' as ObjectiveId, 1],
    ['o3' as ObjectiveId, 2],
]);

test(
    'weightedMeanByPosition returns null for empty input',
    () => {
        assert.equal(
            weightedMeanByPosition([], positions),
            null,
        );
    },
);

test(
    'weightedMeanByPosition returns the score for one item',
    () => {
        assert.equal(
            weightedMeanByPosition(
                [{ objective_id: 'o1' as ObjectiveId,
                   score: 42 }],
                positions,
            ),
            42,
        );
    },
);

test(
    'weightedMeanByPosition applies 0.95 decay by position',
    () => {
        // o1 (pos 0, w=1.0) + o2 (pos 1, w=0.95)
        // weightedSum = 60*1.0 + 40*0.95 = 98
        // weightTotal = 1.95
        // mean = 98 / 1.95 = 50.256 → round = 50
        const result = weightedMeanByPosition(
            [
                { objective_id: 'o1' as ObjectiveId,
                  score: 60 },
                { objective_id: 'o2' as ObjectiveId,
                  score: 40 },
            ],
            positions,
        );
        assert.equal(result, 50);
    },
);

test(
    'weightedMeanByPosition sorts unordered input by position',
    () => {
        // Input reverse order; helper sorts by position
        // and applies weights. Same result as ordered.
        const result = weightedMeanByPosition(
            [
                { objective_id: 'o2' as ObjectiveId,
                  score: 40 },
                { objective_id: 'o1' as ObjectiveId,
                  score: 60 },
            ],
            positions,
        );
        assert.equal(result, 50);
    },
);

test(
    'weightedMeanByPosition throws on unknown objective_id',
    () => {
        assert.throws(
            () => weightedMeanByPosition(
                [{ objective_id:
                    'unknown' as ObjectiveId,
                   score: 5 }],
                positions,
            ),
            /missing position for objective/,
        );
    },
);
