import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(
    'web-app/app/styles/pages-flow-detail.css',
    'utf8',
);

function ruleAfter(needle: string): string {
    const i = src.indexOf(needle);
    assert.ok(i >= 0, needle);
    const open = src.indexOf('{', i);
    const close = src.indexOf('}', open);
    assert.ok(open >= 0 && close > open);
    return src.slice(open, close);
}

test(
    'flow-detail html/body do not clip fixed toasts',
    () => {
        const body = ruleAfter(
            'html[data-page="flow-detail"] body',
        );
        assert.equal(
            body.includes('overflow: hidden'),
            false,
        );
    },
);

test(
    'flow-detail page-root clips the designer, '
    + 'not the viewport',
    () => {
        const root = ruleAfter(
            'html[data-page="flow-detail"] #page-root',
        );
        assert.ok(root.includes('overflow: hidden'));
    },
);
