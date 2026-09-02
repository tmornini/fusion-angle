import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { routes } from '../api/routes.ts';
import {
    roomPathOf,
    svgOf,
    verbRoomHtml,
} from '../web-app/app/generate-api-documentation.ts';
import { offeredVerbs, uriOf } from
    '../api/route-surface.ts';

Deno.test('validate runs generate-api-documentation'
    + ' --check', () => {
    const src = Deno.readTextFileSync('validate');
    assertMatch(
        src,
        /generate-api-documentation --check/,
    );
    assertNotMatch(src, /API-TREE\.md/);
});

Deno.test('a known collection is drawn with /',
() => {
    const svg = svgOf(routes);
    assertMatch(svg, /\/api\/identities\//);
    assertNotMatch(
        svg, /\/invitations\/sent/,
    );
});

Deno.test('filled GET circle hrefs the identities'
    + ' collection room', () => {
    const row = routes.find((r) =>
        uriOf(r) === '/identities/');
    assert(row);
    assert(offeredVerbs(row).includes('get'));
    assertStrictEquals(
        roomPathOf('get', row.segments),
        'get/identities/index.html',
    );
});

Deno.test('two 401 links share statuses/401/',
() => {
    const html = verbRoomHtml(
        'get', '/identities/', ['401', '404'],
        'none',
    );
    assertMatch(
        html, /href="..\/..\/statuses\/401\/"/,
    );
});

Deno.test('svg draws the /api/ wire prefix',
() => {
    const svg = svgOf(routes);
    assertMatch(svg, /\/api\/identities\//);
    assertMatch(
        svg, /\/api\/authentication\/token/,
    );
});

Deno.test('rooms stay a page tree, not an /api/ folder',
() => {
    const row = routes.find((r) =>
        uriOf(r) === '/identities/');
    assert(row);
    assertStrictEquals(
        roomPathOf('get', row.segments),
        'get/identities/index.html',
    );
});

Deno.test('verb room title is the wire URI',
() => {
    const html = verbRoomHtml(
        'get', '/identities/', ['401', '404'],
        'none',
    );
    assertMatch(html, /GET \/api\/identities\//);
    assertMatch(
        html, /href="..\/..\/statuses\/401\/"/,
    );
});
