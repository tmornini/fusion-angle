import { assert } from '@std/assert';

const src = Deno.readTextFileSync(
    'web-app/app/styles/base.css',
);

Deno.test(
    'reduced motion names page-content view '
    + 'transitions so fade-in-up cannot win',
    () => {
        const media = src.indexOf(
            '@media (prefers-reduced-motion: reduce) {',
        );
        assert(media >= 0);
        const close = src.indexOf('\n}', media);
        assert(close > media);
        const block = src.slice(media, close);
        assert(
            block.includes(
                '::view-transition-old(page-content)',
            ),
        );
        assert(
            block.includes(
                '::view-transition-new(page-content)',
            ),
        );
        assert(block.includes('animation: none;'));
    },
);
