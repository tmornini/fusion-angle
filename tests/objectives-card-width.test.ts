import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// C4 / K27 covenant: the Objectives box is one gauge
// column wide on desktop and full-width only under
// 768px. The TEST-PLAN copy states it; this pin keeps
// the CSS honest.

test('the Objectives card is one gauge column wide',
() => {
    const src = readFileSync(
        'web-app/app/styles/components-metrics.css',
        'utf8',
    );
    const rule = '.objective-aggregates-card {\n'
        + '    width:'
        + ' calc((100% - 2 * var(--space-6)) / 3);';
    assert.ok(src.includes(rule));
});

test('the Objectives card is full-width under 768px',
() => {
    const src = readFileSync(
        'web-app/app/styles/responsive.css',
        'utf8',
    );
    const media = src.indexOf(
        '@media (max-width: 767px) {',
    );
    const auto = src.indexOf(
        '.objective-aggregates-card'
        + ' { width: auto; }',
    );
    const close = src.indexOf('\n}', media);
    assert.ok(media >= 0);
    assert.ok(auto > media);
    assert.ok(auto < close);
});
