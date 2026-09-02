import { assertMatch, assertNotMatch, assertStrictEquals } from '@std/assert';
import { existsSync } from '@std/fs';

Deno.test('mark.png is committed under assets', () => {
    assertStrictEquals(
        existsSync('web-app/assets/mark.png'),
        true,
    );
});

Deno.test('iconLogo is the PNG mark, not the atom',
() => {
    const src = Deno.readTextFileSync(
        'web-app/app/icons.ts',
    );
    assertMatch(src, /mark\.png/);
    assertMatch(src, /brand-mark/);
    assertNotMatch(src, /logo-orbital/);
    assertNotMatch(src, /logo-nucleus/);
});

Deno.test('sidebars use the PNG mark', () => {
    for (const path of [
        'web-app/app/component-sidebar.html',
        'web-app/app/component-mobile-sidebar.html',
    ] as const) {
        const src = Deno.readTextFileSync(path);
        assertMatch(src, /mark\.png/);
        assertMatch(src, /brand-mark/);
        assertNotMatch(src, /logo-orbital/);
        assertNotMatch(src, /logo-nucleus/);
    }
});

Deno.test('brand CSS inverts the mark in light theme',
() => {
    const src = Deno.readTextFileSync(
        'web-app/app/styles/components-brand.css',
    );
    assertMatch(src, /\.brand-mark/);
    assertMatch(src, /invert\(1\)/);
    assertNotMatch(src, /logo-orbital/);
    assertNotMatch(src, /logo-nucleus/);
});

Deno.test('favicon.svg embeds the PNG and inverts in light',
() => {
    const src = Deno.readTextFileSync(
        'web-app/assets/favicon.svg',
    );
    assertMatch(src, /mark\.png/);
    assertMatch(
        src,
        /prefers-color-scheme:\s*light/,
    );
    assertMatch(src, /invert\(1\)/);
    assertNotMatch(src, /logo-orbital/);
    assertNotMatch(src, /orbital/);
    assertNotMatch(src, /nucleus/);
});

Deno.test('build copies mark.png next to the favicons', () => {
    const src = Deno.readTextFileSync('build-lib');
    assertMatch(
        src,
        /cp web-app\/assets\/mark\.png/,
    );
});

Deno.test('server declares image/png for .png', () => {
    const src = Deno.readTextFileSync(
        'server/http-server.ts',
    );
    assertMatch(src, /'\.png': 'image\/png'/);
});

Deno.test('auth branding does not invert the mark',
() => {
    const src = Deno.readTextFileSync(
        'web-app/app/styles/components-brand.css',
    );
    assertMatch(
        src,
        /html:not\(\[data-theme="dark"\]\) \.auth-branding \.brand-mark/,
    );
    assertMatch(src, /filter:\s*none/);
});
