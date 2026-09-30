// tests/http-multipart.test.ts
import {
    assertEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import {
    boundaryOf,
    joinParts,
    splitParts,
} from '../shared/http-message/multipart.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { HttpMessageError } from
    '../shared/http-message/types.ts';

// A UUID that begins with a digit: RFC 9651 would read
// it as a number (finding 19).
const BOUNDARY = '0e2c7a44-8f6b-4c1e-9d3a-2b5f7e9c1a00';
const TYPE = 'multipart/mixed; boundary=' + BOUNDARY;

function latin1(text: string): string {
    let out = '';
    for (const byte of new TextEncoder().encode(text)) {
        out += String.fromCharCode(byte);
    }
    return out;
}

function part(body: string): string {
    const octets = latin1(body);
    return 'HTTP/1.1 200 \r\n'
        + 'content-length: ' + octets.length + '\r\n'
        + 'content-type: application/json\r\n'
        + 'etag: "a"\r\n'
        + '\r\n' + octets;
}

Deno.test('a joined body splits back into its parts', () => {
    const parts = [part('{"id":"a"}'), part('{"id":"b"}')];
    assertEquals(
        splitParts(TYPE, joinParts(parts, BOUNDARY)),
        parts,
    );
});

Deno.test('the joined body is framed as the spec shows',
() => {
    const one = part('{}');
    assertStrictEquals(
        joinParts([one], BOUNDARY),
        '--' + BOUNDARY + '\r\n'
            + 'content-type: application/http;'
            + ' msgtype=response\r\n'
            + '\r\n'
            + one + '\r\n'
            + '--' + BOUNDARY + '--',
    );
});

Deno.test('a non-ASCII body keeps its octets', () => {
    const parts = [part('{"name":"Zoë — ok"}')];
    const [only] = splitParts(
        TYPE, joinParts(parts, BOUNDARY),
    );
    assertStrictEquals(
        HttpMessage.fromWire<{ name: string }>(only!)
            .body().toValue().name,
        'Zoë — ok',
    );
});

Deno.test('a body holding the boundary does not split',
() => {
    const hostile = part(
        '{"text":"\\r\\n--' + BOUNDARY + '--"}',
    );
    const raw = part('');
    const inner = '\r\n--' + BOUNDARY + '--\r\n';
    const bodyWithDelimiter = raw.replace(
        'content-length: 0', 'content-length: '
            + inner.length,
    ) + inner;
    const parts = [hostile, bodyWithDelimiter, part('{}')];
    assertEquals(
        splitParts(TYPE, joinParts(parts, BOUNDARY)),
        parts,
    );
});

Deno.test('a part with no content-length has no body',
() => {
    const empty = 'HTTP/1.1 204 \r\netag: "a"\r\n\r\n';
    assertEquals(
        splitParts(TYPE, joinParts([empty], BOUNDARY)),
        [empty],
    );
});

Deno.test('the boundary reader takes a quoted boundary',
() => {
    assertStrictEquals(
        boundaryOf('multipart/mixed; boundary="'
            + BOUNDARY + '"'),
        BOUNDARY,
    );
    assertStrictEquals(boundaryOf(TYPE), BOUNDARY);
});

Deno.test('the joiner refuses what it cannot frame', () => {
    assertThrows(
        () => joinParts([], BOUNDARY),
        HttpMessageError,
        'at least one part',
    );
    assertThrows(
        () => joinParts([part('{}')], 'has space'),
        HttpMessageError,
        'invalid multipart boundary',
    );
    assertThrows(
        () => joinParts([part('{}')], 'x'.repeat(71)),
        HttpMessageError,
        'invalid multipart boundary',
    );
});

Deno.test('the splitter refuses every malformed shape',
() => {
    const good = joinParts([part('{}')], BOUNDARY);
    const refusals: readonly [string, string, string][] = [
        ['text/plain', good, 'not multipart/mixed'],
        ['multipart/mixed', good, 'has no boundary'],
        [TYPE, 'preamble\r\n' + good, 'opening delimiter'],
        [TYPE, good.slice(0, -2), 'closing delimiter'],
        [TYPE, good + 'trailing', 'after the closing'],
        [TYPE, good.replace('content-length: 2',
            'content-length: 99'), 'runs past the body'],
        [TYPE, good.replace('msgtype=response',
            'msgtype=request'), 'not an HTTP response part'],
        [TYPE, good.replace('content-length: 2',
            'content-length: 1'), 'delimiter'],
    ];
    for (const [type, body, message] of refusals) {
        assertThrows(
            () => splitParts(type, body),
            HttpMessageError,
            message,
        );
    }
});
