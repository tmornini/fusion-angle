import {
    assert,
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
import {
    DEFAULT_LOCK_TIMEOUT,
    nowUtc,
} from '../api/types.ts';
import {
    sha256Bytes,
    sha256HexOfBytes,
} from '../shared/digest.ts';
import { bytesToBase64Url } from
    '../shared/base64url.ts';
import { testHashPassword } from './mock-seed.ts';
import {
    seedClientRegistration,
    seedIdentityCredential,
    seedPersonIdentity,
} from './identity-fixtures.ts';
import { seedRootAdmin } from
    './root-admin-fixture.ts';
import { makeAssertionSigner } from
    './client-assertion-fixtures.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';
import {
    apiRequest,
    framedRequest,
} from './http-fixtures.ts';
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

function latestPutResponse(
    rows: readonly {
        id: string,
        name: string,
        method: string,
        response: string,
        response_at: string,
    }[],
    name: string,
): string {
    let best: {
        id: string,
        response: string,
        response_at: string,
    } | undefined;
    for (const row of rows) {
        if (row.name !== name || row.method !== 'PUT') {
            continue;
        }
        if (
            best === undefined
            || row.response_at > best.response_at
            || (
                row.response_at === best.response_at
                && row.id > best.id
            )
        ) {
            best = row;
        }
    }
    if (best === undefined) {
        throw new Error('no stored PUT');
    }
    return best.response;
}

function startLine(response: string): string {
    return response.slice(0, 13);
}

function storedStatus(response: string): number {
    return Number(response.slice(9, 12));
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
        const stored = latestPutResponse(
            await db.messagePairs.getAll(),
            'XufQcWIKhZshfJYOVNeUSw',
        );
        assertStrictEquals(
            startLine(stored), 'HTTP/1.1 201 ',
        );
        assertStrictEquals(
            again.status, storedStatus(stored),
        );
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
    'a genesis PUT stores 201 and a live PUT'
        + ' stores 200',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const id = generateIdentifier();
        const path = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + id;
        const created = await handleRequest(db, req(
            'PUT', path, token,
            ideaDocument('Fresh', 'active'),
        ));
        const createdBytes = latestPutResponse(
            await db.messagePairs.getAll(), id,
        );
        assertStrictEquals(created.status, 201);
        assertStrictEquals(
            startLine(createdBytes),
            'HTTP/1.1 201 ',
        );
        assertStrictEquals(
            created.status,
            storedStatus(createdBytes),
        );
        const edited = await handleRequest(db, req(
            'PUT', path, token,
            ideaDocument('Edited', 'active'),
        ));
        const editedBytes = latestPutResponse(
            await db.messagePairs.getAll(), id,
        );
        assertStrictEquals(edited.status, 200);
        assertStrictEquals(
            startLine(editedBytes),
            'HTTP/1.1 200 ',
        );
        assertStrictEquals(
            edited.status,
            storedStatus(editedBytes),
        );
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

function probeWrite(name: string) {
    return {
        method: 'PUT',
        pathname: '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + name,
        routePattern: 'organizations/:id/ideas/:id',
        routeSegments: [
            'organizations', ':id', 'ideas', ':id',
        ],
        pathSegments: [
            'organizations',
            'AjdvjuECVZEgZoFajaIEkg',
            'ideas',
            name,
        ],
        headerFields: [] as {
            readonly name: string,
            readonly value: string,
        }[],
        body: undefined,
        requesterIdentityId: 'XXZruirZyAOoRpNxaDnpSA',
        requestAt: nowUtc(),
        organization: 'AjdvjuECVZEgZoFajaIEkg',
        responseBody: undefined,
        operationId: generateIdentifier(),
        requestId: generateIdentifier(),
    };
}

Deno.test(
    'an authenticated PUT hoists the bearer'
        + ' into secret',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const operationId = generateIdentifier();
        const id = generateIdentifier();
        const raw = '{"title":"t","position":1,'
            + '"problem_statement":"p",'
            + '"target_users":"u",'
            + '"proposed_solution":"s",'
            + '"expected_outcome":"o",'
            + '"success_metrics":"m",'
            + '"state":"active"}';
        const target = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + id;
        const response = await handleRequest(
            db, receivedRequest(
                'PUT', target, token, operationId, raw,
            ),
        );
        await response.text();
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.name === id);
        if (stored === undefined) {
            throw new Error('document was not stored');
        }
        const bearer = 'authorization: Bearer '
            + token + '\r\n\r\n';
        assertStrictEquals(stored.secret, bearer);
        assertStrictEquals(
            stored.request.includes('authorization:'),
            false,
        );
        assertStrictEquals(
            stored.request.includes(token),
            false,
        );
        assertStrictEquals(
            stored.secret_hash,
            await sha256HexOfBytes(
                Octets.fromLatin1(bearer).asBytes(),
            ),
        );
        const secret = Octets.fromLatin1(
            stored.secret,
        ).asBytes();
        const merged = mergeSecret(
            stored.request, secret,
        );
        const model = parseWire(stored.request);
        assertStrictEquals(
            merged,
            serializeWire({
                ...model,
                fields: [
                    ...model.fields,
                    {
                        name: 'authorization',
                        value: 'Bearer ' + token,
                    },
                ],
            }),
        );
        assertStrictEquals(
            response.headers.get('authorization'),
            null,
        );
    },
);

Deno.test(
    'response credential lines hoist into'
        + ' the secret block',
    async () => {
        const info = 'code="c"';
        const cookie = 'refresh_token=r; HttpOnly';
        const pair = await formWriteMessagePair({
            ...probeWrite(generateIdentifier()),
            responseFields: [
                { name: 'set-cookie', value: cookie },
                {
                    name: 'authentication-info',
                    value: info,
                },
            ],
        });
        assertStrictEquals(
            pair.responseMessage.includes('set-cookie'),
            false,
        );
        assertStrictEquals(
            pair.responseMessage.includes(
                'authentication-info',
            ),
            false,
        );
        assertStrictEquals(
            pair.requestMessage.includes('set-cookie'),
            false,
        );
        assertStrictEquals(
            new TextDecoder().decode(pair.secret),
            '\r\nauthentication-info: ' + info + '\r\n'
                + 'set-cookie: ' + cookie + '\r\n',
        );
    },
);

Deno.test(
    'a pair with no credential line stores'
        + ' an empty secret',
    async () => {
        const db = memoryDbAdapter();
        await db.postSchemaCreation();
        const pair = await formWriteMessagePair(
            probeWrite(generateIdentifier()),
        );
        assertStrictEquals(pair.secret.byteLength, 0);
        await runWrite(
            db, attemptFor([pair]), [pair],
        );
        const stored = (await db.messagePairs.getAll())
            .find((row) => row.id === pair.id);
        if (stored === undefined) {
            throw new Error('pair was not stored');
        }
        assertStrictEquals(stored.secret, '');
        assertStrictEquals(
            stored.secret_hash, EMPTY_SHA256,
        );
    },
);

function flowDocument(
    name: string,
    state: string,
    stateEventId: string,
    stateAt: string,
) {
    return {
        name,
        is_locked: false,
        is_auto_layout: false,
        is_auto_fit: false,
        lock_timeout: DEFAULT_LOCK_TIMEOUT,
        state,
        state_at: stateAt,
        state_event_id: stateEventId,
        graph: { nodes: [], edges: [] },
        graphDelta: {
            nodes: [],
            edges: [],
            deletions: [],
            memberEvents: [],
            attributeEvents: [],
        },
        revivals: [],
    };
}

Deno.test(
    'a second PUT with the same body answers'
        + ' this transmission',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const id = generateIdentifier();
        const path = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/ideas/'
            + id;
        const body = ideaDocument('Same', 'active');
        const firstOperation = generateIdentifier();
        const first = await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path,
                token,
                body,
                operationId: firstOperation,
            }),
        );
        const firstRequestId = first.headers.get(
            'request-id',
        );
        const headEtag = first.headers.get('etag');
        await first.text();
        if (
            firstRequestId === null
            || headEtag === null
        ) {
            throw new Error(
                'head answer omitted an id',
            );
        }
        assertStrictEquals(first.status, 201);
        assertStrictEquals(
            first.headers.get('operation-id'),
            firstOperation,
        );
        const before = (
            await db.messagePairs.getAll()
        ).length;
        const secondOperation = generateIdentifier();
        const second = await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path,
                token,
                body,
                operationId: secondOperation,
            }),
        );
        const secondRequestId = second.headers.get(
            'request-id',
        );
        await second.text();
        assertStrictEquals(second.status, 200);
        assertStrictEquals(
            secondRequestId !== null
                && isIdentifier(secondRequestId),
            true,
        );
        assertNotStrictEquals(
            secondRequestId, firstRequestId,
        );
        assertStrictEquals(
            second.headers.get('date'), null,
        );
        assertStrictEquals(
            second.headers.get('etag'), headEtag,
        );
        assertStrictEquals(
            second.headers.get('operation-id'),
            firstOperation,
        );
        assertNotStrictEquals(
            second.headers.get('operation-id'),
            secondOperation,
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
    },
);

Deno.test(
    'a resent latch answers 412 when the body'
        + ' equals the head',
    async () => {
        const db = memoryDbAdapter();
        await seedAdminSchema(db);
        const token = await organizationToken();
        const id = generateIdentifier();
        const path = '/organizations/'
            + 'AjdvjuECVZEgZoFajaIEkg/flows/'
            + id;
        const first = await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path,
                token,
                body: flowDocument(
                    'Original',
                    'active',
                    generateIdentifier(),
                    '2026-01-01T00:00:00.000000Z',
                ),
            }),
        );
        const firstEtag = first.headers.get('etag');
        await first.text();
        if (firstEtag === null) {
            throw new Error(
                'head answer omitted an etag',
            );
        }
        assertStrictEquals(first.status, 201);
        const head = flowDocument(
            'Renamed',
            'updated',
            generateIdentifier(),
            '2026-01-01T00:00:01.000000Z',
        );
        const second = await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path,
                token,
                body: head,
                headers: { 'if-match': firstEtag },
            }),
        );
        const secondEtag = second.headers.get('etag');
        await second.text();
        assertStrictEquals(second.status, 200);
        assertNotStrictEquals(secondEtag, firstEtag);
        const before = (
            await db.messagePairs.getAll()
        ).length;
        const third = await handleRequest(
            db, apiRequest({
                method: 'PUT',
                path,
                token,
                body: head,
                headers: { 'if-match': firstEtag },
            }),
        );
        const error = await third.json() as {
            error: string,
        };
        assertStrictEquals(third.status, 412);
        assertStrictEquals(
            error.error,
            'If-Match does not match the current'
                + ' document at ' + path,
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            before,
        );
    },
);

const DOOR_PASSWORD = 'hunter2-s3cret';
const DOOR_IDENTITY = 'XXZruirZyAOoRpNxaDnpSA';
const DOOR_ORGANIZATION = 'AjdvjuECVZEgZoFajaIEkg';
const SECRET_BODY_NAMES = [
    'username',
    'password',
    'code',
    'code_verifier',
    'refresh_token',
    'subject_token',
    'actor_token',
    'client_assertion',
] as const;

async function passwordDoorDb() {
    const db = memoryDbAdapter();
    await db.postSchemaCreation();
    await seedPersonIdentity(db, DOOR_IDENTITY, {
        name: 'Demo',
        email: 'demo@example.com',
        phone: '555-0100',
        bio: 'demo user',
    });
    await seedIdentityCredential(
        db, DOOR_IDENTITY, 'WeXjAaAxGSpLpamfEuvcww', {
            identity_id: DOOR_IDENTITY,
            kind: 'password',
            status: 'set',
            secret: await testHashPassword(DOOR_PASSWORD),
            at: '2026-06-03T00:00:00.000000Z',
        },
    );
    return db;
}

function basicHeader(
    userId: string,
    password: string,
): string {
    const bytes = new TextEncoder().encode(
        userId + ':' + password,
    );
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return 'Basic ' + btoa(binary);
}

function doorRequest(
    path: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
): Request {
    const raw = JSON.stringify(body);
    return framedRequest('http://localhost' + path, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...headers,
        },
        body: raw,
    });
}

function quotedParam(
    header: string | null,
    name: string,
): string {
    if (header === null) {
        throw new Error(name + ' header is absent');
    }
    const prefix = name + '="';
    const at = header.indexOf(prefix);
    if (at < 0) {
        throw new Error(name + ' param is absent');
    }
    const end = header.indexOf('"', at + prefix.length);
    if (end < 0) {
        throw new Error(name + ' param is open');
    }
    return header.slice(at + prefix.length, end);
}

function requestBodyRecord(
    wire: string,
): Record<string, unknown> {
    const text = wireBody(wire);
    if (text === '') return {};
    return JSON.parse(text) as Record<string, unknown>;
}

function bodyHoldsSecret(wire: string): boolean {
    const body = requestBodyRecord(wire);
    for (const name of SECRET_BODY_NAMES) {
        if (name in body) return true;
    }
    return false;
}

Deno.test(
    'a door body secret rides its line'
        + ' and lands nothing',
    async () => {
        const db = await passwordDoorDb();
        const authorize = {
            method: 'password',
            client_id: 'web',
            code_challenge: 'abc',
            code_challenge_method: 'S256',
        };
        const cases: readonly (readonly [
            string,
            string,
            string,
            Record<string, unknown>,
        ])[] = [
            [
                'username',
                'Authorization',
                '/authentication/authorize',
                {
                    ...authorize,
                    username: 'demo@example.com',
                },
            ],
            [
                'password',
                'Authorization',
                '/authentication/authorize',
                {
                    ...authorize,
                    password: DOOR_PASSWORD,
                },
            ],
            [
                'code',
                'Authorization',
                '/authentication/token',
                {
                    grant_type: 'authorization_code',
                    client_id: 'web',
                    code: 'issued-code',
                },
            ],
            [
                'code_verifier',
                'Authorization',
                '/authentication/token',
                {
                    grant_type: 'authorization_code',
                    client_id: 'web',
                    code_verifier: 'verifier',
                },
            ],
            [
                'refresh_token',
                'Cookie',
                '/authentication/token',
                {
                    grant_type: 'refresh',
                    refresh_token: 'refresh-value',
                },
            ],
            [
                'subject_token',
                'Authorization',
                '/authentication/token',
                {
                    grant_type: 'token-exchange',
                    organization: DOOR_ORGANIZATION,
                    subject_token: 'subject',
                },
            ],
            [
                'actor_token',
                'Authorization',
                '/authentication/token',
                {
                    grant_type: 'token-exchange',
                    organization: DOOR_ORGANIZATION,
                    actor_token: 'actor',
                },
            ],
            [
                'client_assertion',
                'Authorization',
                '/authentication/token',
                {
                    grant_type: 'client_credentials',
                    client_id: 'web',
                    client_assertion: 'assertion',
                },
            ],
        ];
        for (const [name, line, path, body] of cases) {
            const before = (
                await db.messagePairs.getAll()
            ).length;
            const response = await handleRequest(
                db, doorRequest(path, body, {}),
            );
            const error = await response.json() as {
                error: string,
            };
            assertStrictEquals(response.status, 400);
            assertStrictEquals(
                error.error,
                name + ' rides the ' + line + ' line',
            );
            assertStrictEquals(
                (await db.messagePairs.getAll()).length,
                before,
            );
        }
    },
);

Deno.test(
    'doors present credentials on lines',
    async () => {
        const db = await passwordDoorDb();
        await seedRootAdmin(db);
        const verifier = 'pkce-verifier-ledger';
        const challenge = bytesToBase64Url(
            await sha256Bytes(verifier),
        );
        const authorized = await handleRequest(
            db, doorRequest(
                '/authentication/authorize',
                {
                    method: 'password',
                    client_id: 'web',
                    code_challenge: challenge,
                    code_challenge_method: 'S256',
                },
                {
                    authorization: basicHeader(
                        'demo@example.com',
                        DOOR_PASSWORD,
                    ),
                },
            ),
        );
        const authorizedText = await authorized.text();
        assertStrictEquals(authorized.status, 200);
        assertStrictEquals(authorizedText, '');
        const code = quotedParam(
            authorized.headers.get(
                'authentication-info',
            ),
            'code',
        );
        assert(code.length > 0);
        const authorizeRow = (
            await db.messagePairs.getAll()
        ).find((row) =>
            row.path === '/authentication/authorize/'
        );
        if (authorizeRow === undefined) {
            throw new Error('authorize pair absent');
        }
        assertStrictEquals(
            bodyHoldsSecret(authorizeRow.request),
            false,
        );
        assertStrictEquals(
            authorizeRow.response.includes(code),
            false,
        );
        assertStrictEquals(
            authorizeRow.secret.includes(
                'code="' + code + '"',
            ),
            true,
        );
        const granted = await handleRequest(
            db, doorRequest(
                '/authentication/token',
                {
                    grant_type: 'authorization_code',
                    client_id: 'web',
                },
                {
                    authorization: basicHeader(
                        code, verifier,
                    ),
                },
            ),
        );
        const grantBody = await granted.json() as {
            access_token?: string,
            token_type?: string,
            expires_in?: number,
        };
        assertStrictEquals(granted.status, 200);
        assertStrictEquals(
            grantBody.access_token, undefined,
        );
        assertStrictEquals(
            grantBody.token_type, 'Bearer',
        );
        assertStrictEquals(
            typeof grantBody.expires_in, 'number',
        );
        const access = quotedParam(
            granted.headers.get('authentication-info'),
            'access_token',
        );
        assert(access.length > 0);
        const cookie = granted.headers.get('set-cookie')
            ?? granted.headers.getSetCookie().join('\n');
        assert(cookie.includes('refresh_token='));
        const tokenRow = (
            await db.messagePairs.getAll()
        ).find((row) =>
            row.path === '/authentication/token/'
        );
        if (tokenRow === undefined) {
            throw new Error('token pair absent');
        }
        assertStrictEquals(
            bodyHoldsSecret(tokenRow.request), false,
        );
        assertStrictEquals(
            tokenRow.response.includes('set-cookie'),
            false,
        );
        assertStrictEquals(
            tokenRow.response.includes(access),
            false,
        );
        assertStrictEquals(
            tokenRow.secret.includes('set-cookie:'),
            true,
        );
        assertStrictEquals(
            tokenRow.secret.includes(access),
            true,
        );
        const refreshValue = /refresh_token=([^;]+)/
            .exec(cookie)?.[1];
        if (refreshValue === undefined) {
            throw new Error('refresh cookie absent');
        }
        const refreshed = await handleRequest(
            db, doorRequest(
                '/authentication/token',
                { grant_type: 'refresh' },
                {
                    cookie: 'refresh_token='
                        + refreshValue,
                },
            ),
        );
        await refreshed.text();
        assertStrictEquals(refreshed.status, 200);
        const beforeBody = (
            await db.messagePairs.getAll()
        ).length;
        const bodyRefresh = await handleRequest(
            db, doorRequest(
                '/authentication/token',
                {
                    grant_type: 'refresh',
                    refresh_token: refreshValue,
                },
                {
                    cookie: 'refresh_token='
                        + refreshValue,
                },
            ),
        );
        const bodyError = await bodyRefresh.json() as {
            error: string,
        };
        assertStrictEquals(bodyRefresh.status, 400);
        assertStrictEquals(
            bodyError.error,
            'refresh_token rides the Cookie line',
        );
        assertStrictEquals(
            (await db.messagePairs.getAll()).length,
            beforeBody,
        );
        const exchanged = await handleRequest(
            db, doorRequest(
                '/authentication/token',
                {
                    grant_type: 'token-exchange',
                    organization: DOOR_ORGANIZATION,
                },
                { authorization: 'Bearer ' + access },
            ),
        );
        await exchanged.text();
        assertStrictEquals(exchanged.status, 200);
        const signer = await makeAssertionSigner(
            'ES256',
        );
        const now = Math.floor(Date.now() / 1000);
        const clientId = 'uYaHKbNeVUcsFjuooOjMew';
        const assertion = await signer.sign({
            iss: clientId,
            sub: clientId,
            aud: 'fusion-angle',
            exp: now + 300,
            iat: now,
            jti: 'assert-door-lines-1',
        });
        await seedClientRegistration(db, clientId, {
            grant_types: 'client_credentials',
            redirect_uris: '',
            jwks: signer.jwks,
            aud: 'fusion-angle',
            status: 'active',
        });
        const client = await handleRequest(
            db, doorRequest(
                '/authentication/token',
                {
                    grant_type: 'client_credentials',
                    client_id: clientId,
                },
                {
                    authorization: 'Bearer ' + assertion,
                },
            ),
        );
        await client.text();
        assertStrictEquals(client.status, 200);
    },
);
