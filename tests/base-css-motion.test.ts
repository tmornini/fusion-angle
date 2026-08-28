import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
    'web-app/app/styles/base.css',
    'utf8',
);

test(
    'reduced motion names page-content view '
    + 'transitions so fade-in-up cannot win',
    () => {
        const media = src.indexOf(
            '@media (prefers-reduced-motion: reduce) {',
        );
        assert.ok(media >= 0);
        const close = src.indexOf('\n}', media);
        assert.ok(close > media);
        const block = src.slice(media, close);
        assert.ok(
            block.includes(
                '::view-transition-old(page-content)',
            ),
        );
        assert.ok(
            block.includes(
                '::view-transition-new(page-content)',
            ),
        );
        assert.ok(block.includes('animation: none;'));
    },
);
