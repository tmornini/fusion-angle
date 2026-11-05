import {
    assert,
    assertEquals,
    assertMatch,
    assertNotMatch,
    assertStrictEquals,
} from '@std/assert';
import { route, routes } from '../api/routes.ts';
import { STATUS_DOCUMENTS } from
    '../api/http-status-documents.ts';
import { API_ELEVATION_SVG } from
    '../web-app/api-documentation/elevation.ts';
import {
    API_DOC_ROOMS,
    API_DOC_STATUSES,
} from '../web-app/api-documentation/rooms.ts';
import {
    exampleBodyFor,
    generateAll,
    roomHashOf,
    roomPathOf,
    statusCodesFor,
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

Deno.test('the map names /invitations/ as backing',
() => {
    const svg = svgOf(routes);
    assertMatch(svg, /\/invitations\//);
    assertMatch(svg, /backing/);
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

// The statuses a GET room links, read from its page.
function getStatusesOf(
    rooms: ReadonlyMap<string, string>,
    uri: string,
): string[] {
    const row = routes.find((r) => uriOf(r) === uri);
    assert(row, uri);
    const html = rooms.get(roomPathOf('get', row.segments));
    assert(html, uri);
    return [...html.matchAll(/statuses\/(\d+)\//g)]
        .map((match) => match[1]!);
}

Deno.test('a GET of a document that can be deleted'
    + ' lists 410', () => {
    const rooms = generateAll();
    for (const uri of [
        '/organizations/:id/ideas/:id',
        '/organizations/:id/flows/:id',
        '/organizations/:organization-id/record-types/'
            + ':record-type-id',
        '/identities/:id/pii',
    ]) {
        assert(getStatusesOf(rooms, uri).includes('410'), uri);
    }
    for (const uri of [
        '/identities/:id',
        '/organizations/:id',
        '/organizations/:id/ideas/',
        '/organizations/:id/invitations/:membership-id',
    ]) {
        assert(
            !getStatusesOf(rooms, uri).includes('410'), uri,
        );
    }
});

Deno.test('a GET of a selected collection lists 204',
() => {
    const rooms = generateAll();
    for (const uri of [
        '/identities/',
        '/identities/:id/invitations/',
        '/organizations/:id/ideas/',
        '/organizations/:id/invitations/',
    ]) {
        assert(getStatusesOf(rooms, uri).includes('204'), uri);
    }
    for (const uri of [
        '/identities/:id',
    ]) {
        assert(
            !getStatusesOf(rooms, uri).includes('204'), uri,
        );
    }
});

Deno.test('every status a room lists has its page', () => {
    const pages = new Set(
        STATUS_DOCUMENTS.map((doc) => String(doc.code)),
    );
    for (const room of API_DOC_ROOMS) {
        for (const status of room.statuses) {
            assert(pages.has(status), room.hash + ' ' + status);
        }
    }
});

Deno.test('a GET room names Operation-ID on every request',
() => {
    const html = verbRoomHtml(
        'get', '/identities/', ['200'], 'none',
    );
    assertMatch(html, /Operation-ID: on every request/);
    assertNotMatch(html, /Operation-ID: on writes/);
});

function roomHtmlOf(
    rooms: ReadonlyMap<string, string>,
    verb: string,
    uri: string,
): string | undefined {
    const row = routes.find(
        (candidate) => uriOf(candidate) === uri,
    );
    assert(row, uri);
    return rooms.get(roomPathOf(verb, row.segments));
}

function statusesOf(
    rooms: ReadonlyMap<string, string>,
    verb: string,
    uri: string,
): string[] {
    const html = roomHtmlOf(rooms, verb, uri);
    assert(html, verb + ' ' + uri);
    return [...html.matchAll(/statuses\/(\d+)\//g)]
        .map((match) => match[1]!);
}

const MEMBERSHIP_ITEMS = [
    '/organizations/:id/invitations/:membership-id',
    '/identities/:id/invitations/:membership-id',
];

const PAIR_LINES = [
    'last-modified: on 2xx',
    'requester-identity-id: on 2xx',
    'response-at: on 2xx',
];

function responseHeaderBlock(html: string): string {
    const at = html.indexOf('<h2>Response headers</h2>');
    if (at < 0) return '';
    const status = html.indexOf('<h2>Status</h2>', at);
    return html.slice(
        at, status < 0 ? html.length : status,
    );
}

Deno.test('invitation views list 400, and the identity'
    + ' view lists the fence 403', () => {
    const rooms = generateAll();
    for (const uri of [
        '/identities/:id/invitations/',
        '/organizations/:id/invitations/',
    ]) {
        const codes = statusesOf(rooms, 'get', uri);
        assert(codes.includes('400'), uri);
        assert(codes.includes('403'), uri);
    }
});

Deno.test('a membership item lists 405 and no DELETE'
    + ' room, and its writes list 409', () => {
    const rooms = generateAll();
    for (const uri of MEMBERSHIP_ITEMS) {
        const row = routes.find(
            (candidate) => uriOf(candidate) === uri,
        );
        assert(row, uri);
        assertStrictEquals(
            rooms.get(
                roomPathOf('delete', row.segments),
            ),
            undefined,
            uri,
        );
        const got = statusesOf(rooms, 'get', uri);
        assert(got.includes('405'), uri);
        assert(!got.includes('410'), uri);
        assert(!got.includes('409'), uri);
        const put = statusesOf(rooms, 'put', uri);
        assert(put.includes('405'), uri);
        assert(put.includes('409'), uri);
    }
    const grant = statusesOf(
        rooms, 'post',
        '/organizations/:id/invitations/',
    );
    assert(grant.includes('409'));
    assert(!grant.includes('405'));
});

Deno.test('a stored pair\'s 2xx names the three lines'
    + ' as response headers', () => {
    const rooms = generateAll();
    const carries = [
        ['get', '/identities/:id'],
        ['get', '/organizations/:id/ideas/:id'
            + '/versions/:etag'],
        ['get', '/organizations/:id/work-orders/:id'
            + '/versions/:etag'],
        ['put', '/identities/:id'],
        ['get', '/organizations/:id/invitations'
            + '/:membership-id'],
        ['put', '/identities/:id/invitations'
            + '/:membership-id'],
        ['post', '/organizations/:id/invitations/'],
        ['post', '/authentication/token'],
        ['post', '/authentication/authorize'],
        ['delete', '/identities/:id/pii'],
    ] as const;
    for (const [verb, uri] of carries) {
        const html = roomHtmlOf(rooms, verb, uri);
        assert(html, verb + ' ' + uri);
        const block = responseHeaderBlock(html);
        assert(block !== '', verb + ' ' + uri);
        let at = 0;
        for (const line of PAIR_LINES) {
            const next = block.indexOf(line);
            assert(next >= at, verb + ' ' + line);
            at = next + line.length;
        }
        const request = html.slice(0, html.indexOf(block));
        assert(
            !request.includes('last-modified'),
            verb + ' ' + uri,
        );
    }
    const omits = [
        ['get', '/identities/'],
        ['get', '/identities/:id/invitations/'],
        ['get', '/organizations/:id/ideas/'],
        ['get', '/organizations/:id/ideas/:id/versions/'],
    ] as const;
    for (const [verb, uri] of omits) {
        const html = roomHtmlOf(rooms, verb, uri);
        assert(html, verb + ' ' + uri);
        assert(
            !html.includes('last-modified'),
            verb + ' ' + uri,
        );
        assert(
            !html.includes('Response headers'),
            verb + ' ' + uri,
        );
    }
});

Deno.test('a created answer is 201, and memberships'
    + ' name the body the handler validates', () => {
    const rooms = generateAll();
    const createdOnly = [
        '/identities/',
        '/organizations/:id/flows/',
        '/organizations/:id/work-orders/',
        '/organizations/:id/objectives/',
        '/organizations/:id/memberships/',
    ];
    for (const uri of createdOnly) {
        const codes = statusesOf(rooms, 'post', uri);
        assert(
            codes.includes('201'),
            uri + ' ' + codes.join(','),
        );
        assert(
            !codes.includes('200'),
            uri + ' ' + codes.join(','),
        );
    }
    const createdAndOk = [
        '/organizations/:id/invitations/',
        '/organizations/:organization-id/'
            + 'record-types/',
    ];
    for (const uri of createdAndOk) {
        const codes = statusesOf(rooms, 'post', uri);
        assert(
            codes.includes('200') && codes.includes('201'),
            uri + ' ' + codes.join(','),
        );
    }
    const membership = roomHtmlOf(
        rooms, 'post',
        '/organizations/:id/memberships/',
    );
    assert(membership);
    assert(membership.includes('"kind": "human"'));
    assert(
        statusesOf(
            rooms, 'post',
            '/organizations/:id/memberships/',
        ).includes('400'),
    );
    assert(!membership.includes('no gate validator'));
    for (const uri of [
        '/identities/:id/tokens/:jti/rotation',
        '/identities/:id/tokens/:jti/revocation',
    ]) {
        const html = roomHtmlOf(rooms, 'post', uri);
        assert(html, uri);
        assert(html.includes('<!-- no gate validator -->'));
        assert(!html.includes('yet'));
        assert(
            statusesOf(rooms, 'post', uri).includes('200'),
            uri,
        );
    }
});

Deno.test('a QUERY room takes q and answers as a collection',
() => {
    const uri = '/organizations/:id/work-orders/';
    const row = route(uri.slice(1), {
        selectMatching: async () => ({
            kind: 'collection',
            heads: [],
            lifecycle: 'state',
            reader: { sees: 'whole' },
        }),
    });
    const statuses = statusCodesFor(row, 'query');
    assertEquals(statuses, ['200', '204', '400', '401', '403', '415']);
    const body = exampleBodyFor(uri, 'query');
    assertEquals(JSON.parse(body), { q: 'approval' });
    const html = verbRoomHtml('query', uri, statuses, body);
    assertMatch(html, /<title>QUERY \/api\/organizations/);
    assert(html.includes('Authorization: Bearer'));
    assert(!html.includes('Response headers'));
    assert(!html.includes('If-Match'));
});

// A QUERY reads as its GET does, so its room names the
// storage field the GET's view selects on.
Deno.test('the memberships QUERY room names the GET\'s storage'
    + ' field', () => {
    const rooms = generateAll();
    const uri = '/organizations/:id/memberships/';
    const storageOf = (verb: string): string => {
        const html = roomHtmlOf(rooms, verb, uri);
        assert(html, verb + ' ' + uri);
        const at = html.indexOf('<h2>Storage</h2>');
        assert(at >= 0, verb + ' ' + uri);
        return html.slice(at, html.indexOf('</ul>', at));
    };
    assertStrictEquals(storageOf('query'), storageOf('get'));
    assertMatch(
        storageOf('query'),
        /\/invitations\/ selects on organization_id/,
    );
});
