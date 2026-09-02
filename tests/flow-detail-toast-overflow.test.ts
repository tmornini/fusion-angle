import { assert, assertStrictEquals } from '@std/assert';

const src = Deno.readTextFileSync(
    'web-app/app/styles/pages-flow-detail.css',
);

function ruleAfter(needle: string): string {
    const i = src.indexOf(needle);
    assert(i >= 0, needle);
    const open = src.indexOf('{', i);
    const close = src.indexOf('}', open);
    assert(open >= 0 && close > open);
    return src.slice(open, close);
}

Deno.test(
    'flow-detail html/body do not clip fixed toasts',
    () => {
        const body = ruleAfter(
            'html[data-page="flow-detail"] body',
        );
        assertStrictEquals(
            body.includes('overflow: hidden'),
            false,
        );
    },
);

Deno.test(
    'flow-detail page-root clips the designer, '
    + 'not the viewport',
    () => {
        const root = ruleAfter(
            'html[data-page="flow-detail"] #page-root',
        );
        assert(root.includes('overflow: hidden'));
    },
);
