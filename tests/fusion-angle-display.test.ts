import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FILES = [
    'web-app/index.html',
    'web-app/landing/index.html',
    'web-app/landing/index.ts',
    'web-app/auth/index.html',
    'web-app/auth/index.ts',
    'web-app/not-found/index.html',
    'web-app/app/components-layout.html',
    'web-app/app/component-sidebar.html',
    'web-app/app/component-mobile-header.html',
    'web-app/app/component-mobile-sidebar.html',
    'web-app/design-system/index.ts',
] as const;

test('product chrome says Fusion Angle', () => {
    for (const path of FILES) {
        const src = readFileSync(path, 'utf8');
        assert.match(
            src,
            /Fusion Angle/,
            path + ' must say Fusion Angle',
        );
        assert.doesNotMatch(
            src,
            /Fusion AI/,
            path + ' must not say Fusion AI',
        );
    }
});

test('design-system card heading is Fusion Angle Card',
() => {
    const src = readFileSync(
        'web-app/design-system/index.ts',
        'utf8',
    );
    assert.match(src, /Fusion Angle Card/);
    assert.doesNotMatch(src, /Fusion Card/);
});
