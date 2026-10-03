import {
    assert,
    assertMatch,
    assertNotMatch,
} from '@std/assert';
import type {
    ApiDocRoom,
    ApiDocStatus,
} from '../web-app/api-documentation/rooms.ts';
import {
    roomHtml,
    statusHtml,
    unknownHtml,
} from '../web-app/api-documentation/presenter.ts';

const room: ApiDocRoom = {
    hash: 'get/identities',
    verb: 'GET',
    uri: '/api/identities/',
    body: 'none',
    headers: [
        'Authorization: Bearer …',
        'Operation-ID: on writes',
    ],
    responseHeaders: [],
    statuses: ['401', '404'],
};

const status: ApiDocStatus = {
    hash: 'statuses/401',
    code: '401',
    body: '{\n  "error": "invalid_token"\n}',
};

Deno.test('roomHtml paints heading body headers statuses',
() => {
    const markup = roomHtml(room).toString();
    assertMatch(markup, /<h1[^>]*>GET \/api\/identities\//);
    assertMatch(markup, /<pre[^>]*>none<\/pre>/);
    assertMatch(markup, /Authorization: Bearer …/);
    assertMatch(
        markup, /href="#statuses\/401"/,
    );
    assertMatch(
        markup, /href="#statuses\/404"/,
    );
    assertNotMatch(markup, /style=/);
    assertNotMatch(
        markup, /statuses\/401\//,
    );
});

Deno.test('statusHtml paints code and body', () => {
    const markup = statusHtml(status).toString();
    assertMatch(markup, /<h1[^>]*>401<\/h1>/);
    assertMatch(markup, /invalid_token/);
    assertNotMatch(markup, /style=/);
});

Deno.test('roomHtml paints response headers apart'
    + ' from the request', () => {
    const markup = roomHtml({
        ...room,
        responseHeaders: [
            'last-modified: on 2xx',
            'requester-identity-id: on 2xx',
            'response-at: on 2xx',
        ],
    }).toString();
    const requestAt = markup.indexOf('Headers</h2>');
    const responseAt = markup.indexOf(
        'Response headers</h2>',
    );
    assert(requestAt >= 0);
    assert(responseAt > requestAt);
    assertNotMatch(
        markup.slice(0, responseAt),
        /last-modified/,
    );
    assertMatch(markup, /requester-identity-id: on 2xx/);
    assertMatch(markup, /response-at: on 2xx/);
});

Deno.test('unknownHtml names the miss', () => {
    const markup = unknownHtml('not-a-room').toString();
    assert(markup.length > 0);
    assertMatch(markup, /Not a room/);
    assertMatch(markup, /not-a-room/);
    assertNotMatch(markup, /data-api-docs-back/);
    assertNotMatch(markup, /style=/);
});
