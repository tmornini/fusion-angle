import { assert, assertMatch, assertNotMatch } from '@std/assert';
import * as icons from '../web-app/app/icons.ts';
import type { IconFn } from '../web-app/app/icons.ts';

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

Deno.test('product chrome says Fusion Angle', () => {
    for (const path of FILES) {
        const src = Deno.readTextFileSync(path);
        assertMatch(
            src,
            /Fusion Angle/,
            path + ' must say Fusion Angle',
        );
        assertNotMatch(
            src,
            /Fusion AI/,
            path + ' must not say Fusion AI',
        );
    }
});

Deno.test('design-system card heading is Fusion Angle Card',
() => {
    const src = Deno.readTextFileSync(
        'web-app/design-system/index.ts',
    );
    assertMatch(src, /Fusion Angle Card/);
    assertNotMatch(src, /Fusion Card/);
});

const SVG_PATH_DATA =
    /^[MmZzLlHhVvCcSsQqTtAa0-9 .,eE+\-\s]+$/;

function pathData(markup: string): string[] {
    return [...markup.matchAll(/\bd="([^"]*)"/g)]
        .map(m => m[1]!);
}

Deno.test('chrome and icon path data are SVG grammar', () => {
    let count = 0;
    for (const path of FILES) {
        if (!path.endsWith('.html')) continue;
        for (const d of pathData(
            Deno.readTextFileSync(path),
        )) {
            count += 1;
            assertMatch(
                d, SVG_PATH_DATA, path + ' path d ' + d,
            );
        }
    }
    for (const [name, fn] of Object.entries(icons)) {
        if (
            typeof fn !== 'function'
            || !name.startsWith('icon')
            || name === 'icon'
        ) continue;
        const markup = (fn as IconFn)(
            icons.ICON_SIZE.base, '',
        ).toString();
        for (const d of pathData(markup)) {
            count += 1;
            assertMatch(
                d, SVG_PATH_DATA, name + ' path d ' + d,
            );
        }
    }
    assert(count >= 60);
});
