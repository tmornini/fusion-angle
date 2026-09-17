import {
    assert,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { routes } from '../api/routes.ts';
import { STATUS_DOCUMENTS } from
    '../api/http-status-documents.ts';
import { API_ELEVATION_SVG } from
    '../web-app/api-documentation/elevation.ts';
import {
    API_DOC_ROOMS,
    API_DOC_STATUSES,
} from '../web-app/api-documentation/rooms.ts';
import {
    generateAll,
    roomHashOf,
    roomPathOf,
    svgOf,
    verbRoomHtml,
} from '../web-app/app/generate-api-documentation.ts';
import { offeredVerbs, uriOf } from
    '../api/route-surface.ts';

Deno.test('test validate runs generate-api-documentation'
    + ' --check', () => {
    const src = Deno.readTextFileSync('test');
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

Deno.test('roomHashOf drops the html leaf', () => {
    const row = routes.find((r) =>
        uriOf(r) === '/identities/');
    assert(row);
    assertStrictEquals(
        roomHashOf('get', row.segments),
        'get/identities',
    );
    assertStrictEquals(
        roomPathOf('get', row.segments),
        'get/identities/index.html',
    );
});

Deno.test('filled GET circle hrefs the identities hash',
() => {
    const svg = svgOf(routes);
    assertMatch(svg, /href="#get\/identities"/);
    assertNotMatch(
        svg, /href="get\/identities\/index.html"/,
    );
});

Deno.test('generateAll emits catalog and elevation',
() => {
    const next = generateAll();
    assert(next.has('rooms.ts'));
    assert(next.has('elevation.ts'));
    assert(next.has('API.svg'));
    assertStrictEquals(
        next.get('API.svg'),
        svgOf(routes),
    );
});

Deno.test('compose skips TypeScript sources', () => {
    const src = Deno.readTextFileSync(
        'web-app/app/compose.ts',
    );
    assertMatch(src, /name\.endsWith\('\.ts'\)/);
});

Deno.test('elevation module matches svgOf', () => {
    assertStrictEquals(
        API_ELEVATION_SVG, svgOf(routes),
    );
});

Deno.test('every offered verb has a catalog room',
() => {
    const hashes = new Set(
        API_DOC_ROOMS.map((room) => room.hash),
    );
    for (const row of routes) {
        for (const verb of offeredVerbs(row)) {
            const hash = roomHashOf(
                verb, row.segments,
            );
            assert(hashes.has(hash), hash);
            const room = API_DOC_ROOMS.find(
                (entry) => entry.hash === hash,
            );
            assert(room);
            assertStrictEquals(
                room.hash, hash,
            );
        }
    }
});

Deno.test('every status document has a catalog status',
() => {
    const hashes = new Set(
        API_DOC_STATUSES.map((row) => row.hash),
    );
    for (const doc of STATUS_DOCUMENTS) {
        const hash = 'statuses/' + String(doc.code);
        assert(hashes.has(hash), hash);
    }
});
