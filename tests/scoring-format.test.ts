import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
    latestPerPair,
    formatSigned,
    toneForScore,
} from '../web-app/app/scoring-format.ts';

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
