import {
    assertNotStrictEquals,
    assertStrictEquals,
    assertThrows,
} from '@std/assert';
import type { DbAdapter } from '../api/db.ts';
import { handleRequest } from '../api/api.ts';
import { memoryDbAdapter } from '../api/db-memory.ts';
import {
    incomingContext,
    REQUEST_ID_HEADER,
} from '../api/request-context.ts';
import {
    mergeSecret,
    REQUEST_CREDENTIAL_NAMES,
    RESPONSE_CREDENTIAL_NAMES,
    secretBytes,
    splitCredentials,
} from '../shared/http-message/credentials.ts';
import { HttpMessage } from
    '../shared/http-message/http-message.ts';
import { parseJson } from
    '../shared/http-message/json-codec.ts';
import { defaultBodyRegistry } from
    '../shared/http-message/media-registry.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import { parseWire, serializeWire } from
    '../shared/http-message/wire-codec.ts';
import { HttpMessageError } from
    '../shared/http-message/types.ts';
import {
    attemptFor,
    documentHeadAt,
    formTokenEventMessagePair,
    formWriteMessagePair,
    runWrite,
} from '../api/message-pair.ts';
import { nowUtc } from '../api/types.ts';
import { sha256HexOfBytes } from '../shared/digest.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';
import { apiRequest } from './http-fixtures.ts';
import { organizationToken } from './token-fixtures.ts';
import { seedAdminSchema } from './test-fixtures.ts';

function ideaDocument(title: string, state: string) {
    return {
        title,
        position: 1,
        problem_statement: 'p',
        target_users: 't',
        proposed_solution: 's',
        expected_outcome: 'o',
        success_metrics: 'm',
        state,
    };
}

function req(
    method: string,
    path: string,
    token: string,
    body?: unknown,
): Request {
    return apiRequest({ method, path, token, body });
}

// ideas/:id has no DELETE route. The head is planted
// as a successor of the live PUT, not a second genesis.
async function plantDelete(
    db: DbAdapter,
    pathname: string,
): Promise<void> {
    const pathSegments = pathname
        .replace(/^\/+/, '')
        .split('/');
    const organization = pathSegments[1];
    if (
        pathSegments.length !== 4
        || organization === undefined
    ) {
        throw new Error('not an idea document path');
    }
    const messagePair = await formWriteMessagePair({
        method: 'DELETE',
        pathname,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments,
        headerFields: [],
        body: undefined,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: nowUtc(),
        organization,
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    });
    await runWrite(
        db,
        attemptFor([messagePair]),
        [messagePair],
    );
}

Deno.test(
    'a document PUT after a DELETE lands 201',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const path = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + 'XufQcWIKhZshfJYOVNeUSw';
        const first = await handleRequest(db, req(
            'PUT', path, token,
            ideaDocument('Fresh', 'active'),
        ));
        assertStrictEquals(first.status, 201);
        await plantDelete(db, path);
        const gone = await documentHeadAt(
            db,
            '/organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/ideas/',
            'XufQcWIKhZshfJYOVNeUSw',
        );
        assertStrictEquals(gone?.method, 'DELETE');
        const again = await handleRequest(db, req(
            'PUT', path, token,
            ideaDocument('Back', 'active'),
        ));
        assertStrictEquals(again.status, 201);
        const head = await documentHeadAt(
            db,
            '/organizations/AjdvjuECVZEgZoFajaIEkg'
                + '/ideas/',
            'XufQcWIKhZshfJYOVNeUSw',
        );
        assertStrictEquals(head?.method, 'PUT');
    },
);

Deno.test(
    'canonical form joins, spares set-cookie,'
    + ' and keeps content-length',
    () => {
        const model = parseWire(
            'HTTP/1.0 201 \r\n'
            + 'Set-Cookie: a=1\r\n'
            + 'X-Trace: two\r\n'
            + 'X-Trace: one\r\n'
            + 'Set-Cookie: b=2\r\n'
            + 'Content-Length: 5\r\n'
            + '\r\n'
            + 'hello',
        );
        const wire = serializeWire(model);
        assertStrictEquals(
            wire,
            'HTTP/1.1 201 \r\n'
            + 'content-length: 5\r\n'
            + 'set-cookie: a=1\r\n'
            + 'set-cookie: b=2\r\n'
            + 'x-trace: two, one\r\n'
            + '\r\n'
            + 'hello',
        );
    },
);

Deno.test(
    'parse refuses a content-length mismatch',
    () => {
        assertThrows(
            () => parseWire(
                'HTTP/1.1 200 \r\n'
                + 'content-length: 2\r\n'
                + '\r\n'
                + 'hello',
            ),
            HttpMessageError,
        );
    },
);

Deno.test(
    'JSON parse refuses content-length 2 for hello',
    () => {
        assertThrows(
            () => parseJson(
                '{"method":"POST","target":"/",'
                + '"version":"HTTP/1.1",'
                + '"header":[["content-length","2"]],'
                + '"body":"aGVsbG8="}',
                defaultBodyRegistry(),
            ),
            HttpMessageError,
        );
    },
);

Deno.test(
    're-encoded JSON body stores its own length',
    () => {
        const model = parseJson(
            '{"version":"HTTP/1.1","status":200,'
            + '"reason":"","header":['
            + '["content-type","application/json"],'
            + '["content-length","8"]],'
            + '"body":{"a": 1}}',
            defaultBodyRegistry(),
        );
        const length = model.fields.find(
            (field) => field.name === 'content-length',
        );
        assertStrictEquals(length?.value, '7');
        assertStrictEquals(
            model.body?.toLatin1(),
            '{"a":1}',
        );
    },
);

Deno.test(
    'JSON drops transfer-encoding and keeps length',
    () => {
        const json = HttpMessage.fromJson(
            '{"version":"HTTP/1.1","status":200,'
            + '"reason":"OK","header":['
            + '["transfer-encoding","chunked"],'
            + '["content-length","5"]],'
            + '"body":"aGVsbG8="}',
        ).toJson();
        assertStrictEquals(
            JSON.stringify(JSON.parse(json).header),
            '[["content-length","5"]]',
        );
    },
);

Deno.test(
    'withBody on a trailer message length-frames',
    () => {
        const replaced = HttpMessage.fromWire(
            'HTTP/1.1 200 \r\n'
            + 'transfer-encoding: chunked\r\n'
            + '\r\n'
            + '1\r\nZ\r\n'
            + '0\r\n'
            + 'x-sum: z\r\n'
            + '\r\n',
        ).withBody('text/plain', 'Z');
        assertStrictEquals(
            replaced.toWire(),
            'HTTP/1.1 200 \r\n'
            + 'content-length: 1\r\n'
            + 'content-type: text/plain\r\n'
            + '\r\n'
            + 'Z',
        );
        assertStrictEquals(
            replaced.query('trailer.x-sum').exists(),
            false,
        );
    },
);

Deno.test(
    'length-framed wire ignores a trailer',
    () => {
        assertStrictEquals(
            serializeWire({
                startLine: {
                    kind: 'response',
                    version: 'HTTP/1.0',
                    status: 200,
                    reason: '',
                },
                fields: [
                    {
                        name: 'content-length',
                        value: '1',
                    },
                ],
                body: Octets.fromLatin1('Z'),
                trailer: [
                    { name: 'x-sum', value: 'z' },
                ],
            }),
            'HTTP/1.1 200 \r\n'
            + 'content-length: 1\r\n'
            + '\r\n'
            + 'Z',
        );
    },
);

Deno.test(
    'decoded chunked body has no content-length',
    () => {
        const decoded = HttpMessage.fromWire(
            'POST / HTTP/1.1\r\n'
            + 'transfer-encoding: chunked\r\n'
            + '\r\n'
            + '5\r\nhello\r\n'
            + '0\r\n\r\n',
        );
        assertStrictEquals(
            decoded.query(
                'header.content-length',
            ).exists(),
            false,
        );
    },
);

Deno.test(
    'query does not invent transfer-encoding',
    () => {
        const trailed = HttpMessage.fromWire(
            'HTTP/1.1 200 \r\n'
            + 'transfer-encoding: chunked\r\n'
            + '\r\n'
            + '5\r\nhello\r\n'
            + '0\r\n'
            + 'x-sum: z\r\n'
            + '\r\n',
        );
        assertStrictEquals(
            trailed.query(
                'header.transfer-encoding',
            ).exists(),
            false,
        );
    },
);

Deno.test(
    'deleting content-length removes the query',
    () => {
        const stripped = HttpMessage.fromWire(
            'HTTP/1.1 200 \r\n'
            + 'content-length: 2\r\n'
            + '\r\n'
            + 'hi',
        ).withFieldDeleted('content-length');
        assertStrictEquals(
            stripped.query(
                'header.content-length',
            ).exists(),
            false,
        );
    },
);

Deno.test(
    'content-length 0 stores an empty body',
    () => {
        const empty = parseJson(
            '{"version":"HTTP/1.1","status":200,'
            + '"reason":"","header":['
            + '["content-length","0"]]}',
            defaultBodyRegistry(),
        );
        assertStrictEquals(
            empty.body?.byteLength() ?? -1,
            0,
        );
        const absent = parseJson(
            '{"version":"HTTP/1.1","status":204,'
            + '"reason":"","header":[]}',
            defaultBodyRegistry(),
        );
        assertStrictEquals(absent.body, undefined);
    },
);

Deno.test(
    'JSON projection rewrites a stale length',
    () => {
        const json = HttpMessage.fromWire(
            'HTTP/1.1 200 \r\n'
            + 'content-type: application/json\r\n'
            + 'content-length: 8\r\n'
            + '\r\n'
            + '{"a": 1}',
        ).toJson();
        const root = JSON.parse(json);
        assertStrictEquals(
            JSON.stringify(root.header),
            '[["content-length","7"],'
            + '["content-type","application/json"]]',
        );
        assertStrictEquals(
            JSON.stringify(root.body),
            '{"a":1}',
        );
    },
);

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb924'
    + '27ae41e4649b934ca495991b7852b855';

const FOUR_NAMES = [
    'authentication-info',
    'authorization',
    'cookie',
    'set-cookie',
];

Deno.test(
    'credential lines split into a secret and merge back',
    async () => {
        assertStrictEquals(
            REQUEST_CREDENTIAL_NAMES.join(','),
            'authorization,proxy-authorization,cookie',
        );
        assertStrictEquals(
            RESPONSE_CREDENTIAL_NAMES.join(','),
            'set-cookie,authentication-info,'
                + 'proxy-authentication-info',
        );
        const proxy = splitCredentials([
            {
                name: 'proxy-authorization',
                value: 'Basic p',
            },
            {
                name: 'proxy-authentication-info',
                value: 'a=1',
            },
            { name: 'accept', value: 'text/plain' },
        ]);
        assertStrictEquals(proxy.kept.length, 1);
        assertStrictEquals(
            proxy.kept[0]?.name,
            'accept',
        );
        assertStrictEquals(proxy.hoisted.length, 2);

        const requestWire = 'POST /token HTTP/1.0\r\n'
            + 'Cookie: refresh_token=r\r\n'
            + 'Content-Type: text/plain\r\n'
            + 'Authorization: Basic abc\r\n'
            + 'Content-Length: 2\r\n'
            + '\r\n'
            + 'hi';
        const responseWire = 'HTTP/1.0 200 OK\r\n'
            + 'Content-Type: text/plain\r\n'
            + 'Set-Cookie: refresh_token=r; HttpOnly\r\n'
            + 'Authentication-Info: code="c"\r\n'
            + '\r\n';
        const request = parseWire(requestWire);
        const response = parseWire(responseWire);
        const requestSplit = splitCredentials(
            request.fields,
        );
        const responseSplit = splitCredentials(
            response.fields,
        );
        const keptRequest = serializeWire({
            ...request,
            fields: requestSplit.kept,
        });
        const keptResponse = serializeWire({
            ...response,
            fields: responseSplit.kept,
        });
        for (const name of FOUR_NAMES) {
            assertStrictEquals(
                keptRequest.includes(name),
                false,
            );
            assertStrictEquals(
                keptResponse.includes(name),
                false,
            );
        }
        const secret = secretBytes([
            ...requestSplit.hoisted,
            ...responseSplit.hoisted,
        ]);
        assertStrictEquals(
            new TextDecoder().decode(secret),
            'authorization: Basic abc\r\n'
                + 'cookie: refresh_token=r\r\n'
                + '\r\n'
                + 'authentication-info: code="c"\r\n'
                + 'set-cookie: refresh_token=r; HttpOnly\r\n',
        );
        assertStrictEquals(
            new TextDecoder().decode(secretBytes([{
                name: 'authorization',
                value: 'Basic abc',
            }])),
            'authorization: Basic abc\r\n\r\n',
        );
        assertStrictEquals(
            new TextDecoder().decode(secretBytes([{
                name: 'set-cookie',
                value: 'a=1',
            }])),
            '\r\nset-cookie: a=1\r\n',
        );
        assertStrictEquals(
            mergeSecret(keptRequest, secret),
            serializeWire(request),
        );
        assertStrictEquals(
            mergeSecret(keptResponse, secret),
            serializeWire(response),
        );

        const bare = parseWire(
            'GET / HTTP/1.1\r\n'
                + 'accept: text/plain\r\n'
                + '\r\n',
        );
        const empty = secretBytes(
            splitCredentials(bare.fields).hoisted,
        );
        assertStrictEquals(empty.length, 0);
        assertStrictEquals(
            await sha256HexOfBytes(empty),
            EMPTY_SHA256,
        );

        assertStrictEquals(
            mergeSecret(
                keptRequest,
                secretBytes([{
                    name: 'set-cookie',
                    value: 'refresh_token=r; HttpOnly',
                }]),
            ),
            keptRequest,
        );
        assertStrictEquals(
            mergeSecret(
                keptResponse,
                secretBytes([{
                    name: 'authorization',
                    value: 'Basic abc',
                }]),
            ),
            keptResponse,
        );
        const raw = (text: string): Uint8Array =>
            new TextEncoder().encode(text);
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('authorization: Basic abc\r\n'),
        ));
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('set-cookie: a=1'),
        ));
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('\r\nauthorization: Basic abc\r\n'),
        ));
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('set-cookie: a=1\r\n\r\n'),
        ));
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('x-trace: no\r\n\r\n'),
        ));
        assertThrows(() => mergeSecret(
            keptRequest,
            raw('nocolon\r\n\r\n'),
        ));
    },
);

const LENGTH_REQUIRED =
    'A request body requires Content-Length';

async function gateOutcome(request: Request): Promise<{
    readonly status: number;
    readonly error: string;
    readonly requestId: string | null;
    readonly landed: boolean;
}> {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    const before = (await db.messagePairs.getAll()).length;
    const response = await handleRequest(db, request);
    const body = await response.json() as {
        error?: string;
    };
    const after = (await db.messagePairs.getAll()).length;
    return {
        status: response.status,
        error: body.error ?? '',
        requestId: response.headers.get('request-id'),
        landed: after !== before,
    };
}

function byteCount(text: string): string {
    return String(
        new TextEncoder().encode(text).byteLength,
    );
}

Deno.test(
    'transfer-encoding answers 411 and lands nothing',
    async () => {
        const body = '{"a":1}';
        const outcome = await gateOutcome(new Request(
            'http://localhost/authentication/token',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': byteCount(body),
                    'transfer-encoding': 'chunked',
                    'operation-id': generateIdentifier(),
                },
                body,
            },
        ));
        assertStrictEquals(outcome.status, 411);
        assertStrictEquals(outcome.error, LENGTH_REQUIRED);
        assertStrictEquals(
            isIdentifier(outcome.requestId ?? ''),
            true,
        );
        assertStrictEquals(outcome.landed, false);
    },
);

Deno.test(
    'a body without content-length answers 411',
    async () => {
        const outcome = await gateOutcome(new Request(
            'http://localhost/authentication/token',
            {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'operation-id': generateIdentifier(),
                },
                body: '{"a":1}',
            },
        ));
        assertStrictEquals(outcome.status, 411);
        assertStrictEquals(outcome.error, LENGTH_REQUIRED);
        assertStrictEquals(outcome.landed, false);
    },
);

Deno.test(
    'a mismatched content-length answers 400',
    async () => {
        const outcome = await gateOutcome(new Request(
            'http://localhost/authentication/token',
            {
                method: 'POST',
                headers: {
                    'content-length': '1',
                    'operation-id': generateIdentifier(),
                },
                body: '{"a":1}',
            },
        ));
        assertStrictEquals(outcome.status, 400);
        assertStrictEquals(
            outcome.error,
            'Content-Length does not match the body',
        );
        assertStrictEquals(outcome.landed, false);
    },
);

Deno.test(
    'GET without Operation-ID is required',
    async () => {
        const token = await organizationToken();
        const outcome = await gateOutcome(new Request(
            'http://localhost/organizations/'
                + 'AjdvjuECVZEgZoFajaIEkg/ideas/',
            {
                headers: {
                    authorization: 'Bearer ' + token,
                },
            },
        ));
        assertStrictEquals(outcome.status, 400);
        assertStrictEquals(
            outcome.error,
            'Operation-ID is required',
        );
        assertStrictEquals(outcome.landed, false);
    },
);

Deno.test(
    'each door without Operation-ID is required',
    async () => {
        for (const path of [
            '/authentication/authorize',
            '/authentication/token',
        ]) {
            const outcome = await gateOutcome(new Request(
                'http://localhost' + path,
                { method: 'POST' },
            ));
            assertStrictEquals(outcome.status, 400);
            assertStrictEquals(
                outcome.error,
                'Operation-ID is required',
            );
            assertStrictEquals(outcome.landed, false);
        }
    },
);

Deno.test(
    'a carried request-id is 400 and lands nothing',
    async () => {
        const token = await organizationToken();
        const carried = generateIdentifier();
        const operationId = generateIdentifier();
        const ideas = 'http://localhost/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/';
        const requests = [
            new Request(ideas, {
                headers: {
                    authorization: 'Bearer ' + token,
                    'operation-id': operationId,
                    [REQUEST_ID_HEADER]: carried,
                },
            }),
            new Request(
                'http://localhost/authentication/authorize',
                {
                    method: 'POST',
                    headers: {
                        'operation-id': operationId,
                        [REQUEST_ID_HEADER]: carried,
                    },
                },
            ),
            new Request(
                'http://localhost/authentication/token',
                {
                    method: 'POST',
                    headers: {
                        'operation-id': operationId,
                        [REQUEST_ID_HEADER]: carried,
                    },
                },
            ),
            new Request(ideas, {
                headers: {
                    'operation-id': operationId,
                    [REQUEST_ID_HEADER]: carried,
                },
            }),
        ];
        for (const request of requests) {
            const outcome = await gateOutcome(request);
            assertStrictEquals(outcome.status, 400);
            assertStrictEquals(
                outcome.error,
                'Request-ID is minted by the server',
            );
            assertStrictEquals(outcome.landed, false);
            assertNotStrictEquals(
                outcome.requestId, carried,
            );
        }
    },
);

Deno.test(
    'incomingContext mints past a carried request-id',
    async () => {
        const db = memoryDbAdapter();
        const carried = generateIdentifier();
        const ctx = await incomingContext(
            db,
            new Request('http://localhost/ideas/', {
                headers: {
                    [REQUEST_ID_HEADER]: carried,
                },
            }),
        );
        assertStrictEquals(
            isIdentifier(ctx.requestId), true,
        );
        assertNotStrictEquals(ctx.requestId, carried);
    },
);

function wireBody(wire: string): string {
    const mark = '\r\n\r\n';
    const at = wire.indexOf(mark);
    return at === -1 ? '' : wire.slice(at + mark.length);
}

function receivedRequest(
    method: string,
    target: string,
    token: string,
    operationId: string,
    raw: string,
): Request {
    const length = String(
        new TextEncoder().encode(raw).byteLength,
    );
    return new Request('http://localhost' + target, {
        method,
        headers: {
            authorization: 'Bearer ' + token,
            'content-type': 'application/json',
            'content-length': length,
            'operation-id': operationId,
            'x-trace': 'kept',
        },
        body: raw,
    });
}

Deno.test(
    'a received document keeps its body bytes'
        + ' and both ids',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const operationId = generateIdentifier();
        const id = generateIdentifier();
        const raw = '{"title":"t","position":'
            + '9007199254740993,'
            + '"problem_statement":"p",'
            + '"target_users":"u",'
            + '"proposed_solution":"s",'
            + '"expected_outcome":"o",'
            + '"success_metrics":"m",'
            + '"state":"active"}';
        const target = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + id + '?kept=1';
        const length = String(
            new TextEncoder().encode(raw).byteLength,
        );
        const response = await handleRequest(
            db, receivedRequest(
                'PUT', target, token, operationId, raw,
            ),
        );
        await response.text();
        const requestId = response.headers.get(
            'request-id',
        );
        assertStrictEquals(response.status, 201);
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.name === id);
        if (stored === undefined) {
            throw new Error('document was not stored');
        }
        const request = stored.request;
        assertStrictEquals(wireBody(request), raw);
        assertStrictEquals(
            request.includes(
                'PUT ' + target + ' HTTP/1.1',
            ),
            true,
        );
        assertStrictEquals(
            request.includes(
                'content-length: ' + length,
            ),
            true,
        );
        assertStrictEquals(
            request.includes('x-trace: kept'),
            true,
        );
        const wire = stored.response;
        assertStrictEquals(
            wire.includes(
                'operation-id: ' + operationId,
            ),
            true,
        );
        assertStrictEquals(
            wire.includes('request-id: ' + requestId),
            true,
        );
        assertStrictEquals(wire.includes('etag: '), true);
        assertStrictEquals(
            wire.includes('response-id:'),
            false,
        );
    },
);

Deno.test(
    'a received body keeps digits past 2^53',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const operationId = generateIdentifier();
        const id = generateIdentifier();
        const raw =
            '{"n":9007199254740993,"z":1,"a":2}';
        const target = '/identities/'
            + 'XXZruirZyAOoRpNxaDnpSA/tokens/'
            + id + '/revocation?kept=1';
        const length = String(
            new TextEncoder().encode(raw).byteLength,
        );
        const response = await handleRequest(
            db, receivedRequest(
                'POST', target, token,
                operationId, raw,
            ),
        );
        await response.text();
        const requestId = response.headers.get(
            'request-id',
        );
        assertStrictEquals(response.status, 201);
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.request.includes(id));
        if (stored === undefined) {
            throw new Error('revocation was not stored');
        }
        const request = stored.request;
        assertStrictEquals(wireBody(request), raw);
        assertStrictEquals(
            request.includes(
                'POST ' + target + ' HTTP/1.1',
            ),
            true,
        );
        assertStrictEquals(
            request.includes(
                'content-length: ' + length,
            ),
            true,
        );
        assertStrictEquals(
            request.includes('x-trace: kept'),
            true,
        );
        const wire = stored.response;
        assertStrictEquals(
            wire.includes(
                'operation-id: ' + operationId,
            ),
            true,
        );
        assertStrictEquals(
            wire.includes('request-id: ' + requestId),
            true,
        );
        assertStrictEquals(
            wire.includes('response-id:'),
            false,
        );
    },
);

Deno.test(
    'one request\'s answering row keeps the'
        + ' received body and both ids',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const operationId = generateIdentifier();
        const id = generateIdentifier();
        const raw = '{"kind": "person","id": "'
            + id + '"}';
        const target = '/identities/?kept=1';
        const before = new Set(
            (await db.messagePairs.getAll())
                .map((row) => row.id),
        );
        const response = await handleRequest(
            db, receivedRequest(
                'POST', target, token, operationId, raw,
            ),
        );
        await response.text();
        const requestId = response.headers.get(
            'request-id',
        );
        assertStrictEquals(response.status, 201);
        const fresh = (await db.messagePairs.getAll())
            .filter((row) => !before.has(row.id));
        assertStrictEquals(fresh.length, 2);
        const etag = response.headers.get('etag');
        const answering = fresh.find(
            (row) => '"'+ row.id + '"' === etag,
        );
        if (answering === undefined) {
            throw new Error('answering row missing');
        }
        assertStrictEquals(
            wireBody(answering.request), raw,
        );
        for (const row of fresh) {
            assertStrictEquals(
                row.response.includes(
                    'operation-id: ' + operationId,
                ),
                true,
            );
            assertStrictEquals(
                row.response.includes(
                    'request-id: ' + requestId,
                ),
                true,
            );
            assertStrictEquals(
                row.response.includes('response-id:'),
                false,
            );
        }
        const sibling = fresh.find(
            (row) => row.id !== answering.id,
        );
        if (sibling === undefined) {
            throw new Error('sibling row missing');
        }
        assertStrictEquals(
            wireBody(sibling.request) === raw,
            false,
        );
    },
);

Deno.test(
    'a token event stores the ids it was given',
    async () => {
        const operationId = generateIdentifier();
        const requestId = generateIdentifier();
        const name = generateIdentifier();
        const messagePair =
            await formTokenEventMessagePair(
                name,
                {
                    jti: name,
                    identity_id: 'XXZruirZyAOoRpNxaDnpSA',
                    action: 'issued',
                    chain_id: generateIdentifier(),
                    at: '2026-01-01T00:00:00.000000Z',
                },
                operationId,
                requestId,
            );
        const wire = messagePair.responseMessage;
        assertStrictEquals(
            wire.includes(
                'operation-id: ' + operationId,
            ),
            true,
        );
        assertStrictEquals(
            wire.includes('request-id: ' + requestId),
            true,
        );
    },
);
