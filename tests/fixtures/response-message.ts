import { HttpMessage } from
    '../../shared/http-message/http-message.ts';
import { Octets } from '../../shared/http-message/octets.ts';

// A JSON response message, for a test that stands in for
// a transport or hands a presenter what a verb returns.
export function responseMessage<T>(
    body: T,
    lines: Readonly<Record<string, string>> = {},
    status = 200,
): HttpMessage<T> {
    const octets = Octets.fromBytes(
        new TextEncoder().encode(JSON.stringify(body)),
    );
    return HttpMessage.fromModel<T>({
        startLine: {
            kind: 'response', version: 'HTTP/1.1',
            status, reason: '',
        },
        fields: [
            { name: 'content-length',
                value: String(octets.byteLength()) },
            { name: 'content-type', value: 'application/json' },
            ...Object.entries(lines).map(
                ([name, value]) => ({ name, value }),
            ),
        ],
        body: octets,
        trailer: undefined,
    });
}
