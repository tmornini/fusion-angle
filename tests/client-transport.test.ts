import {
    assertEquals,
    assertRejects,
    assertStrictEquals,
} from '@std/assert';
import { createHttpFacade } from '../client/http-facade.ts';
import { RequestError } from '../shared/http-errors.ts';
import { joinParts } from '../shared/http-message/multipart.ts';

const NO_SESSION = {
    runSingleFlightRefresh: () => Promise.resolve(null),
    putSessionToken: () => {},
    navigateToAuth: () => {},
};

function scripted(
    answer: () => Response,
): typeof fetch {
    return () => Promise.resolve(answer());
}

Deno.test('a document read is the whole message', async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response('{"id":"a","name":"Zoë"}', {
            status: 200,
            headers: {
                'content-type': 'application/json',
                etag: '"HeadHeadHeadHeadHeadHQ"',
                'operation-id': 'OpOpOpOpOpOpOpOpOpOpOQ',
            },
        })))(NO_SESSION);
    const message = await facade.GET<{ id: string, name: string }>(
        'ideas/a', 'token',
    );
    assertStrictEquals(message.query('status').toNumber(), 200);
    assertStrictEquals(
        message.query('header.etag').toText(),
        '"HeadHeadHeadHeadHeadHQ"',
    );
    assertStrictEquals(
        message.query('header.operation-id').toText(),
        'OpOpOpOpOpOpOpOpOpOpOQ',
    );
    assertEquals(
        message.body().toValue(), { id: 'a', name: 'Zoë' },
    );
});

Deno.test('the transport holds octets, not text', async () => {
    const bytes = new Uint8Array([0x7b, 0x22, 0x61, 0x22, 0x3a,
        0x22, 0xc3, 0xa9, 0x22, 0x7d]); // {"a":"é"}
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response(bytes, {
            headers: { 'content-type': 'application/json' },
        })))(NO_SESSION);
    const message = await facade.GET('x', 'token');
    assertEquals(message.body().toBytes(), bytes);
});

Deno.test('a proxy-coded response still reads its value',
async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response('{"a":1}', {
            headers: {
                'content-type': 'application/json',
                'content-encoding': 'gzip',
                'content-length': '27',
            },
        })))(NO_SESSION);
    const message = await facade.GET<{ a: number }>('x', 't');
    assertEquals(message.body().toValue(), { a: 1 });
    assertStrictEquals(
        message.query('header.content-encoding').exists(),
        false,
    );
    assertStrictEquals(
        message.query('header.content-length').exists(),
        false,
    );
});

Deno.test('a collection read splits its parts', async () => {
    const part = (id: string) => 'HTTP/1.1 200 \r\n'
        + 'content-length: 10\r\n'
        + 'content-type: application/json\r\n'
        + 'etag: "' + id + '"\r\n'
        + '\r\n{"id":"' + id + '"}';
    const boundary = '0e2c7a44-8f6b-4c1e-9d3a-2b5f7e9c1a00';
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response(joinParts([part('a'), part('b')], boundary), {
            headers: {
                'content-type':
                    'multipart/mixed; boundary=' + boundary,
            },
        })))(NO_SESSION);
    const parts = await facade.GETCollection<{ id: string }>(
        'ideas/', 't',
    );
    assertEquals(
        parts.map((p) => p.body().toValue().id), ['a', 'b'],
    );
    assertEquals(
        parts.map((p) => p.query('header.etag').toText()),
        ['"a"', '"b"'],
    );
});

Deno.test('an empty collection is no parts', async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response(null, { status: 204 })))(NO_SESSION);
    assertEquals(await facade.GETCollection('ideas/', 't'), []);
});

// A part is framed by its content-length in octets; a body
// decoded as text before the split would count 'é' once
// and misframe every part after it.
Deno.test('a part keeps its non-ASCII octets', async () => {
    const body = '{"name":"Zoë"}';
    const octets = new TextEncoder().encode(body).byteLength;
    const part = 'HTTP/1.1 200 \r\n'
        + 'content-length: ' + octets + '\r\n'
        + 'content-type: application/json\r\n'
        + '\r\n' + body;
    const boundary = '0e2c7a44-8f6b-4c1e-9d3a-2b5f7e9c1a00';
    const facade = createHttpFacade('http://x', scripted(() =>
        new Response(joinParts([part, part], boundary), {
            headers: {
                'content-type':
                    'multipart/mixed; boundary=' + boundary,
            },
        })))(NO_SESSION);
    const parts = await facade.GETCollection<{ name: string }>(
        'identities/', 't',
    );
    assertEquals(
        parts.map((p) => p.body().toValue().name), ['Zoë', 'Zoë'],
    );
});

Deno.test('a refusal still throws with its status',
async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        Response.json(
            { error: 'If-Match does not match' },
            { status: 412 },
        )))(NO_SESSION);
    const error = await assertRejects(
        () => facade.PUT('ideas/a', {}, 't'),
        RequestError,
        'If-Match does not match',
    );
    assertStrictEquals(error.status, 412);
});

Deno.test('an unauthenticated POST answers whatever it was'
    + ' answered', async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        Response.json({ error: 'invalid_grant' }, {
            status: 401,
            headers: { 'authentication-info': 'x="y"' },
        })))(NO_SESSION);
    const message = await facade.POSTUnauthenticated(
        'authentication/token', { grant_type: 'refresh' },
    );
    assertStrictEquals(message.query('status').toNumber(), 401);
});

Deno.test('an error carries the response it was answered',
async () => {
    const facade = createHttpFacade('http://x', scripted(() =>
        Response.json(
            { error: 'If-Match does not match' },
            { status: 412, headers: { etag: '"NewHead"' } },
        )))(NO_SESSION);
    const error = await assertRejects(
        () => facade.PUT('ideas/a', {}, 't'),
        RequestError,
        'If-Match does not match',
    );
    assertStrictEquals(
        error.response.query('header.etag').toText(),
        '"NewHead"',
    );
    assertStrictEquals(
        error.response.query('status').toNumber(), 412,
    );
});
