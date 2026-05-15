import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

test('project.ts no longer references impact pts', () => {
    const src = readFileSync(
        'web-app/app/presenters/project.ts', 'utf8',
    );
    assert.ok(!src.includes('impactBaseline'));
    assert.ok(!src.includes('impactCurrent'));
    assert.ok(!src.toLowerCase().includes(' pts'));
});

test('project-detail.ts no longer references impact metric',
    () => {
        const src = readFileSync(
            'web-app/app/presenters/project-detail.ts',
            'utf8',
        );
        assert.ok(!src.includes('impactBaseline'));
        assert.ok(!src.includes('impactCurrent'));
    });
