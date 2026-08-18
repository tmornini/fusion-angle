import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { routes } from '../api/routes.ts';
import {
    roomPathOf,
    svgOf,
    verbRoomHtml,
} from '../web-app/app/generate-api-documentation.ts';
import { offeredVerbs, uriOf } from
    '../api/route-surface.ts';

test('validate runs generate-api-documentation'
    + ' --check', () => {
    const src = readFileSync('validate', 'utf8');
    assert.match(
        src,
        /generate-api-documentation --check/,
    );
    assert.doesNotMatch(src, /API-TREE\.md/);
});

test('a known collection is drawn with /',
() => {
    const svg = svgOf(routes);
    assert.match(svg, /\/api\/identities\//);
    assert.doesNotMatch(
        svg, /\/invitations\/sent/,
    );
});

test('filled GET circle hrefs the identities'
    + ' collection room', () => {
    const row = routes.find((r) =>
        uriOf(r) === '/identities/');
    assert.ok(row);
    assert.ok(offeredVerbs(row).includes('get'));
    assert.equal(
        roomPathOf('get', row.segments),
        'get/identities/index.html',
    );
});

test('two 401 links share statuses/401/',
() => {
    const html = verbRoomHtml(
        'get', '/identities/', ['401', '404'],
        'none',
    );
    assert.match(
        html, /href="..\/..\/statuses\/401\/"/,
    );
});

test('svg draws the /api/ wire prefix',
() => {
    const svg = svgOf(routes);
    assert.match(svg, /\/api\/identities\//);
    assert.match(
        svg, /\/api\/authentication\/token/,
    );
});

test('rooms stay a page tree, not an /api/ folder',
() => {
    const row = routes.find((r) =>
        uriOf(r) === '/identities/');
    assert.ok(row);
    assert.equal(
        roomPathOf('get', row.segments),
        'get/identities/index.html',
    );
});

test('verb room title is the wire URI',
() => {
    const html = verbRoomHtml(
        'get', '/identities/', ['401', '404'],
        'none',
    );
    assert.match(html, /GET \/api\/identities\//);
    assert.match(
        html, /href="..\/..\/statuses\/401\/"/,
    );
});
