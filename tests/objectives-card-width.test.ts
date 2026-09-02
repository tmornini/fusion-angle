import { assert } from '@std/assert';

// C4 / K27 covenant: the Objectives box is one gauge
// column wide on desktop and full-width only under
// 768px. The TEST-PLAN copy states it; this pin keeps
// the CSS honest.

Deno.test('the Objectives card is one gauge column wide',
() => {
    const src = Deno.readTextFileSync(
        'web-app/app/styles/components-metrics.css',
    );
    const rule = '.objective-aggregates-card {\n'
        + '    width:'
        + ' calc((100% - 2 * var(--space-6)) / 3);';
    assert(src.includes(rule));
});

Deno.test('the Objectives card is full-width under 768px',
() => {
    const src = Deno.readTextFileSync(
        'web-app/app/styles/responsive.css',
    );
    const media = src.indexOf(
        '@media (max-width: 767px) {',
    );
    const auto = src.indexOf(
        '.objective-aggregates-card'
        + ' { width: auto; }',
    );
    const close = src.indexOf('\n}', media);
    assert(media >= 0);
    assert(auto > media);
    assert(auto < close);
});
