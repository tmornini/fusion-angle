import type { DbAdapter } from './db.ts';
import type {
    Id, IdentityTokenEntity, MessagePairEntity,
} from '../shared/types.ts';
import {
    generateIdentifier,
    isIdentifier,
} from '../shared/identifier.ts';
import { pathAndNameOf } from './path-and-name.ts';
import type { PathAndName } from './path-and-name.ts';
import {
    buildRequestModel,
    buildResponseModel,
    storedWire,
    requestMessageHash,
} from './message-form.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import type { FieldLine } from '../shared/http-message/types.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import {
    mergeSecret,
    secretBytes as secretOfLines,
    splitCredentials,
} from '../shared/http-message/credentials.ts';
import {
    familyRegistration,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
} from './family-registry.ts';
import {
    HTTP_OK, HTTP_CREATED, HTTP_NO_CONTENT,
    errorJson,
} from '../shared/http-errors.ts';
import type { NotificationEvent } from
    '../shared/notifications.ts';
import { Octets } from
    '../shared/http-message/octets.ts';
import type {
    Attempt,
    Outcome,
    StatementAnswer,
    StatementBind,
} from '../shared/ledger-statement.ts';
import {
    refusalOf,
} from '../shared/ledger-statement.ts';
import {
    SuccessionConflict,
    runLedgerStatement,
} from './ledger-statement.ts';
import { DATE_PLACEHOLDER } from './ledger-root.ts';
import { notifyPayload } from './advisory-lock.ts';

// The shadow-ledger message pair: one `message_pairs` put. Formed
// pre-tx — crypto, hashing, and timers never run
// inside an open transaction (AGENTS.md § Transaction
// bodies await only row ops). Then appended as the LAST
// act of the domain write's own transaction.
export interface MessagePair {
    readonly id: Id;
    // The ARRIVAL stamp: minted at gate entry (the first act
    // of handleRequest) and stored in the requests row's `at`
    // column — the column name stays `at` on BOTH tables
    // (author: "at" is the perfect name); requestAt is
    // in-memory plumbing only. The response row's `at` is NOT
    // carried here — it is minted inside appendMessagePairOnce, as
    // late as a same-tx write permits. Envelope only (S1): body
    // timestamps belong to the message's creator.
    readonly requestAt: string;
    readonly path: string;
    readonly name: string;
    readonly requesterIdentityId: Id;
    readonly requestMessage: string;   // serializeWire
    readonly requestHash: string;
    readonly secret: Uint8Array;
    readonly responseStatus: number;
    readonly responseMessage: string;
    readonly responseHash: string;
    readonly method: string;
    readonly operationId: string;
    readonly requestId: string;
    // A document create: no head, so the statement is
    // genesis rather than blind.
    readonly genesis?: true;
    // Pre-tx lock-head pair id, latched when If-Match
    // matches the advertised ETag. In-tx re-query only.
    readonly latchedHeadMessagePairId?: string;
    // A latched OPERATION's pin: the head of the PARENT
    // document this operation acts on, not of this pair's
    // own document. coordinateWrite never reads it — its
    // latch is same-document by definition — the handler
    // re-verifies it in-tx against the document.
    readonly pinnedDocumentMessagePairId?: string;
}

// The gate's seed for the two /authentication/* grant routes
// (Task 3, C1 discharge): everything WriteMessagePairInput needs
// EXCEPT the requester identity and the response side. Both
// routes are bearerExempt, so the generic pair block never
// forms a WriteMessagePairInput for them (api.ts) — the gate instead
// assembles this seed once, and the grant itself (the only
// place that can resolve the requester identity — a code's
// issuer, a verified token's subject — and the response body)
// completes it into a MessagePair via formAuthMessagePair, pre-tx.
export interface AuthMessagePairSeed {
    readonly requestAt: string;
    readonly headerFields: readonly FieldLine[];
    readonly bodyBytes: Uint8Array;
    readonly method: string;
    readonly pathname: string;
    readonly routePattern: string;
    readonly routeSegments: readonly string[];
    readonly pathSegments: readonly string[];
    readonly operationId: string;
    readonly requestId: string;
}

// The bytes and headers of the request the api was handed.
// The answering row stores these. A synthesized pair does not.
export interface ReceivedRequest {
    readonly target: string;
    readonly headerFields: readonly FieldLine[];
    readonly bodyBytes: Uint8Array;
    readonly requestId: string;
}

export interface WriteMessagePairInput {
    readonly method: string;
    readonly pathname: string;
    readonly routePattern: string;
    readonly routeSegments: readonly string[];
    readonly pathSegments: readonly string[];
    readonly headerFields: readonly FieldLine[];
    readonly body: Record<string, unknown> | undefined;
    readonly requesterIdentityId: Id;
    // Minted at gate entry, before auth/body-parse — as early
    // as the request is observable.
    readonly requestAt: string;
    // The VERIFIED fence organization for organization-owned
    // families; undefined for the global plane. Decides the
    // canonical organization-nested prefix — see
    // canonicalPath.
    readonly organization: Id | undefined;
    // Present only for the answering row: the body bytes the
    // gate read. Synthesized pairs omit it and build a request
    // from `body`.
    readonly bodyBytes?: Uint8Array;
    readonly responseBody: unknown | undefined;
    // Lines formed onto the response before the split.
    // Absent: the response carries no extra line.
    readonly responseFields?: readonly FieldLine[];
    // Absent: DELETE stores 204 and every other verb
    // stores 201. Auth doors pass 200.
    readonly responseStatus?: number;
    readonly latchedHeadMessagePairId?: string;
    readonly pinnedDocumentMessagePairId?: string;
    // Required on every formed pair. Public writes supply
    // the hoisted Operation-ID; seed and inner PUTs pass
    // the envelope id here. Never minted for a public write.
    readonly operationId: string;
    // The id the server minted for this request. Missing throws.
    readonly requestId: string;
    readonly genesis?: true;
    // The stored request is zero bytes. buildRequestModel
    // is not called. Callers that received a request leave
    // this unset.
    readonly emptyRequest?: true;
}

// Fallback for first path segments that are organization-
// nested but not yet registered in family-registry.ts. A
// registered family answers ONLY from its registration — its
// entry here is deleted, never kept as a parallel truth. The
// states/:id document retirement emptied this set; the
// mechanism stays for any future un-registered nested segment.
const ORGANIZATION_NESTED_FIRST_SEGMENTS: ReadonlySet<string> =
    new Set([
    ]);

// The tier rule, exported so gate, seed, and derivations share
// ONE prefix voice. A registered family's organizationNested
// slot decides first; the literal set above is the fallback
// for every not-yet-registered first segment.
export function canonicalPath(
    organization: Id | undefined,
    flatPrefix: string,
): string {
    const first = flatPrefix.split('/')[1] ?? '';
    const registered = familyRegistration(first);
    const nested = registered !== undefined
        ? registered.organizationNested
        : ORGANIZATION_NESTED_FIRST_SEGMENTS
            .has(first);
    if (organization !== undefined && nested) {
        return '/organizations/' + organization
            + flatPrefix;
    }
    return flatPrefix;
}

export const OPERATION_ID_HEADER = 'operation-id';

function headerFieldsWithOperationId(
    fields: readonly FieldLine[],
    operationId: string,
): FieldLine[] {
    if (fields.some((f) => f.name === OPERATION_ID_HEADER)) {
        return [...fields];
    }
    return [
        ...fields,
        { name: OPERATION_ID_HEADER, value: operationId },
    ];
}

// The stored (path, name) of a write, in ONE place for the
// gate (api.ts's head read, DELETE table, and locks) and the
// former: the route splitter, then the canonical
// organization prefix, then the two named overrides — a
// create-shaped collection POST names its created entity
// (createdEntityName), and PII names its singleton. PII is
// the one route whose literal last segment is a document
// name, not an operation (spec 2026-09-15 exact-read folds
// § 3): `path = /identities/<id>/`, `name = pii`, the same
// pathname as its URL. pathAndNameOf keeps its literal-tail
// rule — widening it would rename every operation
// (transition, rotation, acceptance).
const PII_ROUTE_PATTERN = 'identities/:id/pii';
const PII_DOCUMENT_NAME = 'pii';

export function storedPathAndNameOf(input: {
    readonly routePattern: string;
    readonly routeSegments: readonly string[];
    readonly pathSegments: readonly string[];
    readonly organization: Id | undefined;
    readonly body: Record<string, unknown> | undefined;
}): PathAndName {
    if (input.routePattern === PII_ROUTE_PATTERN) {
        return {
            path: canonicalPath(
                input.organization,
                '/' + input.pathSegments.slice(0, -1).join('/')
                    + '/',
            ),
            name: PII_DOCUMENT_NAME,
        };
    }
    const pathAndName = pathAndNameOf(
        input.routeSegments, input.pathSegments,
    );
    const createdId = createdEntityName(
        input.routePattern, input.body,
    );
    return {
        path: canonicalPath(input.organization, pathAndName.path),
        name: createdId ?? pathAndName.name,
    };
}

function receivedRequestWire(
    method: string,
    target: string,
    fields: readonly FieldLine[],
    bodyBytes: Uint8Array,
): string {
    return storedWire({
        startLine: {
            kind: 'request',
            method,
            target,
            version: 'HTTP/1.1',
        },
        fields,
        body: bodyBytes.byteLength > 0
            ? Octets.fromBytes(bodyBytes)
            : undefined,
        trailer: undefined,
    });
}

export async function formWriteMessagePair(
    input: WriteMessagePairInput,
): Promise<MessagePair> {
    if (!isIdentifier(input.operationId)) {
        throw new Error(
            'operationId must be a 22-character'
                + ' identifier',
        );
    }
    if (
        input.requestId === undefined
        || input.requestId === ''
    ) {
        throw new Error('requestId is required');
    }
    const id = generateIdentifier();
    const { path, name } = storedPathAndNameOf(input);
    const headerFields = headerFieldsWithOperationId(
        input.headerFields, input.operationId,
    );
    const requestSplit = splitCredentials(headerFields);
    const requestMessage = input.emptyRequest === true
        ? ''
        : input.bodyBytes !== undefined
            ? receivedRequestWire(
                input.method,
                input.pathname,
                requestSplit.kept,
                input.bodyBytes,
            )
            : storedWire(buildRequestModel({
                method: input.method,
                target: input.pathname,
                fields: requestSplit.kept,
                body: input.body,
            }));
    const storedStatus = input.method === 'DELETE'
        ? HTTP_NO_CONTENT
        : (input.responseStatus ?? HTTP_CREATED);
    const responseLines: FieldLine[] = [
        { name: 'date', value: DATE_PLACEHOLDER },
        { name: 'etag', value: strongEtagOf(id) },
        {
            name: 'operation-id',
            value: input.operationId,
        },
        { name: 'request-id', value: input.requestId },
    ];
    if (input.responseFields !== undefined) {
        for (const field of input.responseFields) {
            responseLines.push(field);
        }
    }
    const responseSplit = splitCredentials(responseLines);
    const responseModel = buildResponseModel({
        status: storedStatus,
        fields: responseSplit.kept,
        body: input.method === 'DELETE'
            ? undefined
            : input.responseBody,
    });
    const responseMessage = storedWire(responseModel);
    const secret = secretOfLines([
        ...requestSplit.hoisted,
        ...responseSplit.hoisted,
    ]);
    return {
        id,
        requestAt: input.requestAt,
        path,
        name,
        requesterIdentityId: input.requesterIdentityId,
        requestMessage,
        requestHash: await requestMessageHash(requestMessage),
        secret,
        responseStatus: storedStatus,
        responseMessage,
        responseHash: await requestMessageHash(responseMessage),
        method: input.method,
        operationId: input.operationId,
        requestId: input.requestId,
        ...(input.genesis === true
            ? { genesis: true as const }
            : {}),
        ...(input.latchedHeadMessagePairId !== undefined
            ? { latchedHeadMessagePairId: input.latchedHeadMessagePairId }
            : {}),
        ...(input.pinnedDocumentMessagePairId !== undefined
            ? {
                pinnedDocumentMessagePairId:
                    input.pinnedDocumentMessagePairId,
            }
            : {}),
    };
}

// Complete an AuthMessagePairSeed into a MessagePair for a grant's own
// response: an operation document (name '', global plane — see
// canonicalPath with organization undefined), never a
// head-read. The two /authentication/* routes are the only
// callers; each grant calls this pre-tx, once its own domain
// read has resolved the requester identity and its response
// body is fully known.
export async function formAuthMessagePair(
    seed: AuthMessagePairSeed,
    body: Record<string, unknown>,
    requesterIdentityId: Id,
    responseBody: unknown,
    operationId: string,
    requestId: string,
    responseFields?: readonly FieldLine[],
): Promise<MessagePair> {
    return formWriteMessagePair({
        ...seed,
        body,
        requesterIdentityId,
        organization: undefined,
        responseBody,
        operationId,
        requestId,
        responseStatus: HTTP_OK,
        ...(responseFields !== undefined
            ? { responseFields }
            : {}),
    });
}

// The literal 'identities/:id/tokens/:jti' route pattern: the
// wired PUT's own document family and response spec (routes.ts,
// WRITE_RESPONSE_SPECS['identities/:id/tokens/:jti']), reused
// byte-for-byte by every synthesized identity_tokens row-write
// pair (Phase 13 Task 5, Gate 7) — one derivation later serves
// fixture pairs, real PUT pairs, and these synthesized
// grant/rotation/revocation pairs uniformly. Kept as a literal
// here rather than imported from routes.ts: routes.ts imports
// FROM message-pair.ts (formWriteMessagePair), never the
// reverse — the import graph stays acyclic (see
// formDocumentMessagePairFor's own comment, routes.ts).
const TOKEN_EVENT_ROUTE_PATTERN = 'identities/:id/tokens/:jti';
const TOKEN_EVENT_ROUTE_SEGMENTS: readonly string[] =
    TOKEN_EVENT_ROUTE_PATTERN.split('/');

// Synthesizes ONE token event pair at the jti's own
// document — `name` is always the jti. The SAME document,
// method, and response shape a real PUT
// identities/:id/tokens/:jti stores; the response `id` is
// the name (identityTokenEntityOf: GET wins). Formed PRE-TX
// — crypto, hashing, and timers never run inside an open
// transaction. requesterIdentityId is the event's OWN
// identity_id — the named convention for a write with no
// authenticated actor in view at this depth. A jti is an
// identifier, not a bearer secret.
export async function formTokenEventMessagePair(
    name: Id,
    event: Omit<IdentityTokenEntity, 'id'>,
    operationId: string,
    requestId: string,
): Promise<MessagePair> {
    const pathSegments = [
        TOKEN_EVENT_ROUTE_SEGMENTS[0]!,
        event.identity_id,
        TOKEN_EVENT_ROUTE_SEGMENTS[2]!,
        name,
    ];
    const body = event as unknown as Record<string, unknown>;
    return formWriteMessagePair({
        method: 'PUT',
        pathname: '/' + pathSegments.join('/'),
        routePattern: TOKEN_EVENT_ROUTE_PATTERN,
        routeSegments: TOKEN_EVENT_ROUTE_SEGMENTS,
        pathSegments,
        headerFields: [],
        body,
        requesterIdentityId: event.identity_id,
        requestAt: event.at,
        organization: undefined,
        responseBody: {
            ...validateIdentityTokenEntity(body),
            id: name,
        },
        operationId,
        requestId,
    });
}

// The head of a document: its latest PUT or DELETE, or
// null. A DELETE head is a gone document, not a miss.
export async function documentHeadAt(
    db: DbAdapter,
    path: string,
    name: string,
): Promise<{
    readonly id: string;
    readonly method: string;
} | null> {
    return db.messagePairs.getHead(path, name);
}

// The wire rendering of a stored envelope stamp: IMF-fixdate
// seconds (new Date(at).toUTCString()) — a presentation
// transform; the column keeps microseconds.
export function httpDateOf(at: string): string {
    return new Date(at).toUTCString();
}

// Locked PUT and PATCH concurrency dialect: If-Match carries
// the strong ETag. Not a credential — stored verbatim so two
// writes differing only in If-Match are different messages
// for replay identity.
export const IF_MATCH_HEADER = 'if-match';

// Parse a wire If-Match into the unquoted validator.
// ETag is the message-pair identifier. Anything else —
// 64-hex, `*`, weak, lists, unquoted — yields undefined;
// the caller answers 400.
export function parseIfMatch(
    header: string,
): string | undefined {
    if (
        header.length < 2
        || header[0] !== '"'
        || header[header.length - 1] !== '"'
    ) {
        return undefined;
    }
    const inner = header.slice(1, -1);
    if (!isIdentifier(inner)) {
        return undefined;
    }
    return inner;
}

// Recover the client's If-Match target from a formed wire
// pair's request message (hoisted into the hash). This is
// the gate-verified latch for the in-tx head re-read —
// never re-derive a live head and treat it as the echo.
export function ifMatchFromMessage(
    message: string,
): string | undefined {
    const model = parseWire(message);
    const field = model.fields.find(
        (line) => line.name === IF_MATCH_HEADER,
    );
    if (field === undefined) return undefined;
    return parseIfMatch(field.value);
}

export function ifMatchFromMessagePair(
    messagePair: MessagePair,
): string | undefined {
    return ifMatchFromMessage(messagePair.requestMessage);
}

// Raw If-Match header value from a formed pair —
// undefined means ABSENT. Callers that must speak the
// 428-vs-400 ladder themselves (transition op) need
// absent distinguished from malformed;
// ifMatchFromMessagePair conflates them.
export function rawIfMatchFromMessagePair(
    messagePair: MessagePair,
): string | undefined {
    const model = parseWire(messagePair.requestMessage);
    const field = model.fields.find(
        (line) => line.name === IF_MATCH_HEADER,
    );
    return field?.value;
}

// Strong wire ETag: quotes the validator token.
export function strongEtagOf(tag: string): string {
    return '"' + tag + '"';
}

// Attach the strong ETag header; returns the same Response.
export function attachEtag(
    response: Response, tag: string,
): Response {
    response.headers.set('ETag', strongEtagOf(tag));
    return response;
}

// Attach IMF-fixdate Date from an RFC-3339 zulu `at`.
export function attachDate(
    response: Response, at: string,
): Response {
    response.headers.set('Date', httpDateOf(at));
    return response;
}

export function requestTarget(request: Request): string {
    const url = new URL(request.url);
    return url.pathname + url.search;
}

// Every header the request carries. Names are already
// lower-case, one line per name. set-cookie stays its
// own lines: the Headers iterator would join them.
export function requestHeaderFields(
    request: Request,
): FieldLine[] {
    const fields: FieldLine[] = [];
    request.headers.forEach((value, name) => {
        if (name === 'set-cookie') return;
        fields.push({ name, value });
    });
    const cookies = typeof request.headers.getSetCookie
        === 'function'
        ? request.headers.getSetCookie()
        : [];
    for (const value of cookies) {
        fields.push({ name: 'set-cookie', value });
    }
    return fields;
}

// The stored bytes, parsed and returned unchanged.
export function responseFromStored(
    stored: MessagePairEntity,
): Response {
    return responseFromLatin1(stored.response);
}

export function responseFromHead(
    wire: string,
    requestId: string,
): Response {
    const model = parseWire(wire);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line',
        );
    }
    const headers = new Headers();
    let wroteRequestId = false;
    for (const field of model.fields) {
        if (field.name === 'date') continue;
        if (field.name === 'request-id') {
            if (wroteRequestId) continue;
            headers.append('request-id', requestId);
            wroteRequestId = true;
            continue;
        }
        headers.append(field.name, field.value);
    }
    if (!wroteRequestId) {
        headers.append('request-id', requestId);
    }
    const body = HttpMessage.fromModel(model).body();
    if (!body.exists()) {
        return new Response(null, {
            status: HTTP_OK,
            headers,
        });
    }
    return new Response(body.toText(), {
        status: HTTP_OK,
        headers,
    });
}

export function responseFromLatin1(
    wire: string,
): Response {
    const model = parseWire(wire);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line',
        );
    }
    const headers = new Headers();
    for (const field of model.fields) {
        headers.append(field.name, field.value);
    }
    const status = model.startLine.status;
    const body = HttpMessage.fromModel(model).body();
    if (!body.exists()) {
        return new Response(null, { status, headers });
    }
    return new Response(body.toText(), {
        status,
        headers,
    });
}

// Stream a stored PUT as this caller's GET: same body
// octets, Date replaced with now, no Operation-ID.
// ETag names the stored pair.
export function streamGetFromStored(
    stored: MessagePairEntity,
    at: string,
): Response {
    const model = parseWire(stored.response);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line: '
            + stored.id,
        );
    }
    const headers = new Headers();
    headers.set('Date', httpDateOf(at));
    const storedBody = HttpMessage.fromModel(model).body();
    if (storedBody.exists()) {
        headers.set('Content-Type', 'application/json');
    }
    const response = storedBody.exists()
        ? new Response(storedBody.toText(), {
            status: HTTP_OK,
            headers,
        })
        : new Response(null, {
            status: HTTP_OK,
            headers,
        });
    return attachEtag(response, stored.id);
}

// The pre-store body of a just-formed pair's own response
// message — a handler that must act on a value the gate's
// successBody resolver already minted (token rotation's
// pre-minted jti) reads it back HERE rather than deriving a
// second, possibly divergent, value. The pair IS the response.
export function messagePairResponseBody(
    messagePair: MessagePair,
): Record<string, unknown> | undefined {
    return responseRecordOf(messagePair.responseMessage);
}

export function responseBodyText(
    message: string,
): string {
    const model = parseWire(message);
    const body = HttpMessage.fromModel(model).body();
    return body.exists() ? body.toText() : '';
}

export function responseRecordOf(
    message: string,
): Record<string, unknown> | undefined {
    const text = responseBodyText(message);
    return text === ''
        ? undefined
        : JSON.parse(text) as Record<string, unknown>;
}

// One statement for the rows of one write. Salts and
// the notify payload are minted here, outside the
// statement. A blind refusal runs the statement again,
// up to three times. Postgres ignores `now`.
export type WriteRow = {
    readonly id: string,
    readonly operationId: string,
    readonly path: string,
    readonly name: string,
    readonly requesterIdentityId: string,
    readonly method: string,
    readonly request: Uint8Array,
    readonly requestSalt?: Uint8Array,
    readonly secret: Uint8Array,
    readonly response: Uint8Array,
    readonly responseSalt?: Uint8Array,
    readonly ifMatch: string | null,
};

export type WriteAnswer = {
    readonly response: Response,
    readonly outcome: Outcome | 'refused',
    readonly answeredId: string | null,
    readonly bells: readonly string[],
    readonly rows: readonly StatementAnswer[],
};

const answers = new WeakMap<MessagePair, WriteAnswer>();
const ownWires = new WeakMap<MessagePair, Response>();

export function writeAnswerOf(
    pair: MessagePair,
): WriteAnswer | undefined {
    return answers.get(pair);
}

export function ownWireOf(
    pair: MessagePair,
): Response | undefined {
    return ownWires.get(pair);
}

export function attemptFor(
    pairs: readonly MessagePair[],
): Attempt {
    if (pairs.length !== 1) return 'composed';
    const pair = pairs[0]!;
    if (pair.genesis === true) return 'genesis';
    if (pair.latchedHeadMessagePairId !== undefined) {
        return 'in-order';
    }
    if (pair.pinnedDocumentMessagePairId !== undefined) {
        return 'blind';
    }
    if (ifMatchFromMessagePair(pair) !== undefined) {
        return 'in-order';
    }
    return 'blind';
}

export async function runWrite(
    adapter: DbAdapter,
    attempt: Attempt,
    rows: readonly (WriteRow | MessagePair)[],
    now?: string,
): Promise<WriteAnswer> {
    if (rows.length === 0) {
        throw new Error(
            'ledger statement requires a row',
        );
    }
    const binds = rows.map((row) => bindOf(attempt, row));
    const pairs = rows.filter(
        (row): row is MessagePair =>
            'requestMessage' in row,
    );
    let conflicts = 0;
    const document = refusalDocument(rows);
    for (;;) {
        try {
            const stated = await runLedgerStatement(
                adapter, attempt, binds, now,
            );
            const answer = answerOf(
                rows, stated, document,
            );
            for (const pair of pairs) {
                answers.set(pair, answer);
                ownWires.set(
                    pair,
                    wireForPair(pair, stated, answer),
                );
            }
            return answer;
        } catch (error) {
            if (!(error instanceof SuccessionConflict)) {
                throw error;
            }
            conflicts += 1;
            const refusal = refusalOf(
                attempt,
                conflicts,
                document.path,
                document.name,
            );
            if (refusal === 'retry') continue;
            const answer: WriteAnswer = {
                response: errorJson(
                    refusal.error, refusal.status,
                ),
                outcome: 'refused',
                answeredId: null,
                bells: [],
                rows: [],
            };
            for (const pair of pairs) {
                answers.set(pair, answer);
                ownWires.set(pair, answer.response);
            }
            return answer;
        }
    }
}

function wireForPair(
    pair: MessagePair,
    stated: readonly StatementAnswer[],
    answer: WriteAnswer,
): Response {
    if (answer.outcome !== 'land') return answer.response;
    const row = stated.find((item) => item.id === pair.id);
    if (row === undefined) return answer.response;
    const stored = latin1(row.response);
    return responseFromLatin1(
        mergeSecret(stored, secretBytes(pair)),
    );
}

function refusalDocument(
    rows: readonly (WriteRow | MessagePair)[],
): { path: string, name: string } {
    for (const row of rows) {
        if (row.method === 'PUT' || row.method === 'DELETE') {
            return { path: row.path, name: row.name };
        }
    }
    const first = rows[0]!;
    return { path: first.path, name: first.name };
}

function bindOf(
    attempt: Attempt,
    row: WriteRow | MessagePair,
): StatementBind {
    const request = requestBytes(row);
    const response = responseBytes(row);
    const split = splitDate(response);
    const secret = secretBytes(row);
    return {
        id: row.id,
        operationId: row.operationId,
        path: row.path,
        name: row.name,
        requesterIdentityId: row.requesterIdentityId,
        method: row.method,
        request,
        requestSalt: saltOf(requestSaltOf(row)),
        secret,
        responsePrefix: split.prefix,
        responseSuffix: split.suffix,
        responseSalt: saltOf(responseSaltOf(row)),
        ifMatch: ifMatchOf(attempt, row),
        notify: notifyPayload(eventForMessagePair({
            path: row.path,
            requesterIdentityId: row.requesterIdentityId,
        })),
    };
}

function currentRequestId(
    source: WriteRow | MessagePair,
    ownResponse: Uint8Array,
): string {
    if ('requestMessage' in source) {
        return source.requestId;
    }
    const model = parseWire(latin1(ownResponse));
    for (const field of model.fields) {
        if (field.name === 'request-id') {
            return field.value;
        }
    }
    return '';
}

function answerOf(
    rows: readonly (WriteRow | MessagePair)[],
    stated: readonly StatementAnswer[],
    document: { path: string, name: string },
): WriteAnswer {
    const outcome = stated[0]!.outcome;
    if (outcome === 'stale') {
        return {
            response: errorJson(
                'If-Match does not match the current'
                    + ' document at '
                    + document.path + document.name,
                412,
            ),
            outcome,
            answeredId: null,
            bells: [],
            rows: stated,
        };
    }
    const index = answerIndex(rows, stated, outcome);
    const row = stated[index]!;
    if (outcome === 'matched') {
        if (row.headResponse === null) {
            throw new Error('matched row has no head');
        }
        return {
            response: responseFromHead(
                latin1(row.headResponse),
                currentRequestId(
                    rows[index]!,
                    row.response,
                ),
            ),
            outcome,
            answeredId: row.headId,
            bells: [],
            rows: stated,
        };
    }
    const bells: string[] = [];
    for (let i = 0; i < stated.length; i++) {
        if (!stated[i]!.inserted) continue;
        const source = rows[i]!;
        bells.push(notifyPayload(eventForMessagePair({
            path: source.path,
            requesterIdentityId: source.requesterIdentityId,
        })));
    }
    return {
        response: responseFromLatin1(mergeSecret(
            latin1(row.response),
            secretBytes(rows[index]!),
        )),
        outcome,
        answeredId: row.id,
        bells,
        rows: stated,
    };
}

function answerIndex(
    rows: readonly { method: string }[],
    stated: readonly StatementAnswer[],
    outcome: Outcome,
): number {
    if (rows.length === 1) return 0;
    if (outcome === 'matched') {
        for (let i = 0; i < rows.length; i++) {
            const method = rows[i]!.method;
            if (
                (method === 'PUT' || method === 'DELETE')
                && stated[i]!.headResponse !== null
            ) {
                return i;
            }
        }
    }
    for (let i = 0; i < rows.length; i++) {
        const method = rows[i]!.method;
        if (method === 'PUT' || method === 'DELETE') {
            return i;
        }
    }
    return 0;
}

function requestBytes(
    row: WriteRow | MessagePair,
): Uint8Array {
    if ('requestMessage' in row) {
        return Octets.fromLatin1(
            row.requestMessage,
        ).asBytes();
    }
    return row.request;
}

function responseBytes(
    row: WriteRow | MessagePair,
): Uint8Array {
    if (
        'response' in row
        && row.response instanceof Uint8Array
    ) {
        return row.response;
    }
    return Octets.fromLatin1(
        (row as MessagePair).responseMessage,
    ).asBytes();
}

function secretBytes(
    row: WriteRow | MessagePair,
): Uint8Array {
    if (
        'secret' in row
        && row.secret instanceof Uint8Array
    ) {
        return row.secret;
    }
    return new Uint8Array(0);
}

function requestSaltOf(
    row: WriteRow | MessagePair,
): Uint8Array | undefined {
    if ('requestSalt' in row) return row.requestSalt;
    return undefined;
}

function responseSaltOf(
    row: WriteRow | MessagePair,
): Uint8Array | undefined {
    if ('responseSalt' in row) return row.responseSalt;
    return undefined;
}

function saltOf(supplied: Uint8Array | undefined): Uint8Array {
    if (supplied !== undefined) return supplied;
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return salt;
}

function ifMatchOf(
    attempt: Attempt,
    row: WriteRow | MessagePair,
): string | null {
    if (attempt === 'blind' || attempt === 'genesis') {
        return null;
    }
    if ('requestMessage' in row) {
        const pair = row;
        // A composed POST carries the client's If-Match
        // for the document the handler latches. That
        // header is not a latch against this row's head.
        if (
            attempt === 'composed'
            && pair.method === 'POST'
        ) {
            return null;
        }
        if (pair.latchedHeadMessagePairId !== undefined) {
            return pair.latchedHeadMessagePairId;
        }
        if (pair.pinnedDocumentMessagePairId !== undefined) {
            return null;
        }
        // A zero-byte request has no If-Match line.
        if (pair.requestMessage === '') return null;
        return ifMatchFromMessagePair(pair) ?? null;
    }
    if (
        attempt === 'composed'
        && row.method === 'POST'
    ) {
        return null;
    }
    return row.ifMatch;
}

function splitDate(
    message: Uint8Array,
): { prefix: Uint8Array, suffix: Uint8Array } {
    const text = latin1(message);
    const headerEnd = text.indexOf('\r\n\r\n');
    const header = headerEnd < 0
        ? text
        : text.slice(0, headerEnd);
    const mark = '\r\ndate: ';
    const at = header.indexOf(mark);
    if (at < 0 || header.length < at + mark.length + 29) {
        throw new Error('response has no date value');
    }
    const valueAt = at + mark.length;
    return {
        prefix: message.slice(0, valueAt),
        suffix: message.slice(valueAt + 29),
    };
}

function latin1(bytes: Uint8Array): string {
    return Octets.fromBytes(bytes).toLatin1();
}

export function eventForMessagePair(
    messagePair: {
        readonly path: string,
        readonly requesterIdentityId: string,
    },
): NotificationEvent {
    const parts = messagePair.path
        .split('/')
        .filter((part) => part !== '');
    const organizationIds =
        parts[0] === 'organizations'
            && parts[1] !== undefined
            ? [parts[1]]
            : [];
    return {
        kind: 'scoped',
        organizationIds,
        identityIds: [messagePair.requesterIdentityId],
    };
}

// The create-document override table: which body field names
// the created entity for create-shaped collection POSTs. Grown
// family by family in Tasks 2-5. A registered family (family-
// registry.ts) answers ONLY from its own createBodyIdField —
// its entry here is deleted, never kept as a parallel truth.
// Identities' own entry retired here (Phase 10 Task 4): the
// twelfth registered family now answers ONLY from its own
// family-registry.ts createBodyIdField. 'invitations' is the
// ONE entry this table keeps PERMANENTLY — the invitations side
// channel is never a family-registry.ts registrant (it has no
// organization-nesting tier, no concurrency class, no document
// of its own to register), so this literal table stays
// its one consult forever, not a waypoint to registration.
const CREATE_BODY_ID_FIELDS: Record<string, string> = {
    // Not gate-dispatched (the invitations side channel forms
    // its own pair directly in invitations-domain.ts) but reuses
    // this SAME override table so createdEntityName serves both
    // callers with one voice.
    'invitations': 'invitationId',
    // Nested composed POST (Task 9): pattern is not a bare
    // family name, so the registry consult never fires — body
    // `id` collapses the operation message pair onto the
    // type's name (same supersession collapse the retired
    // flat POST /records used).
    [RECORD_TYPES_COLLECTION_PATTERN]: 'id',
};

export function createdEntityName(
    routePattern: string,
    body: Record<string, unknown> | undefined,
): string | undefined {
    // A registered family's createBodyIdField serves a bare
    // collection-POST create route whose pattern IS the family
    // name. Ideas registered this slot in Task 1 for its own
    // POST /ideas, which Phase 2 Task 3 (R1) retired — genesis
    // folded into the document-class PUT ideas/:id, whose name
    // pathAndNameOf already derives from the path segment, so
    // this lookup never fires for ideas today. Projects (second
    // family) registers the same inert slot: it has NO bare
    // collection POST at all, so the registry consult here never
    // fires for it either — the route-pattern==family-name
    // coincidence remains unexercised by both registered
    // families. Flows (third family, Phase 4 Task 1) is the
    // first to exercise it: POST flows is a live bare
    // collection-POST create route whose pattern is literally
    // 'flows', so the registry consult now FIRES for real — the
    // coincidence is no longer theoretical. Work-orders (fourth
    // family, Phase 5 Task 1) is the second: POST work-orders is
    // also a live bare collection-POST create route whose
    // pattern is literally 'work-orders', so the coincidence now
    // fires for TWO live routes. Flat POST records retired
    // (Task 23); nested collection POST rides
    // CREATE_BODY_ID_FIELDS above. Identities (twelfth
    // family, Phase 10 Task 4) is the third live bare
    // collection-POST create route whose pattern is literally
    // 'identities' — the SAME slot the literal table above used
    // to answer, now answered from the registry instead.
    // Falls back to the literal table for every not-yet-
    // registered pattern.
    const stripped = routePattern.endsWith('/')
        ? routePattern.slice(0, -1)
        : routePattern;
    const family = stripped.startsWith('organizations/:id/')
        && !stripped.slice('organizations/:id/'.length)
            .includes('/')
        ? stripped.slice('organizations/:id/'.length)
        : stripped;
    const registered = familyRegistration(family);
    const field = registered !== undefined
        ? registered.createBodyIdField
        : CREATE_BODY_ID_FIELDS[routePattern];
    if (field === undefined || body === undefined) {
        return undefined;
    }
    const value = body[field];
    return typeof value === 'string' && value !== ''
        ? value : undefined;
}

// A latched operation is a sub-resource write that REVERTS or
// REPLACES the document it hangs off — it names the head it
// intends to act on, exactly as a locked PUT names the head it
// intends to overwrite. Without the echo the server would act
// on whatever its own pre-transaction resolution happened to
// read, so the same request would 412 or succeed by scheduling
// alone — a verdict the caller can neither predict nor retry
// into. The latch target is the PARENT document: the
// route's segments minus its trailing literal.
export const LATCHED_OPERATION_ROUTE_PATTERNS:
    Set<string> = new Set([
        'organizations/:id/flows/:id/undo',
    ]);

// The coverage gate: pairs, wire headers, and the idempotency
// fast-path fire ONLY for wired route patterns. Seeded with the
// ideas patterns in Task 1; every Task 2/3 family commit
// extends it; the Task 6 exit test asserts it covers every
// write route — so no intermediate commit ever advertises an
// ETag it did not store.
export const MESSAGE_PAIR_WIRED_ROUTE_PATTERNS: Set<string> = new Set([
    'organizations/:id/ideas/:id',
    'organizations/:id/ideas/:id/conversion',
    'organizations/:id/ideas/:id/submissions/:sid',
    'organizations/:id/projects/:id',
    'organizations/:id/projects/:id/flows/:pfid',
    'organizations/:id/flows/',
    'organizations/:id/flows/:id',
    'organizations/:id/flows/:id/undo',
    // flows/:id/versions[+/:vid] RETIRED (Phase 15 Task 7).
    'organizations/:id/flows/:id/tags/:name',
    'organizations/:id/work-orders/',
    'organizations/:id/work-orders/:id',
    'organizations/:id/work-orders/:id/claim',
    'organizations/:id/work-orders/:id/transition',
    'organizations/:id/work-orders/:id/binding',
    'organizations/:id/flows/:id/work-orders/:woid',
    // Flat records + record-attributes retired (Task 23).
    'organizations/:id/flows/:id/records/:frid',
    'organizations/:id/objectives/',
    'organizations/:id/objectives/:id',
    'organizations/:id/objectives/:id/revisions/:rid',
    'organizations/:id/projects/:id'
        + '/objective-baseline-scores/:sid',
    'organizations/:id/projects/:id'
        + '/objective-actual-scores/:sid',
    'ai-agents/:id',
    'identities/',
    'identities/:id',
    'identities/:id/pii',
    'identities/:id/credentials/:cid',
    'identities/:id/registration',
    'identities/:id/default-organization',
    'identities/:id/tokens/:jti',
    'identities/:id/token-revocations/:rid',
    'identities/:id/tokens/:jti/rotation',
    'identities/:id/tokens/:jti/revocation',
    'organizations/:id',
    'identities/:id/providers/:eid',
    // Nested record-types collection POST (Task 9) + detail
    // PUT/DELETE (Task 3).
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    // Nested attributes detail (Task 7): admin PUT/DELETE.
    ATTRIBUTE_DETAIL_PATTERN,
    // Nested instances detail: PATCH create/update +
    // DELETE (MESSAGE_PAIR_WIRED only — R10 keeps DOCUMENT_CLASS
    // clear). Public PUT is 405 (Task 20).
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    // states/:id/field-values/:fvid RETIRED from live wire
    // (Phase 15 Task 7); seed still forms pairs at that
    // document via formSeedMessagePair + WRITE_RESPONSE_SPECS.
]);

// Route patterns wired for pair STORAGE (MESSAGE_PAIR_WIRED_
// ROUTE_PATTERNS above) whose gate dispatch must NEVER take the
// pre-tx idempotency fast path (getPairByRequestHash in api.ts) —
// a byte-identical resend still re-enters the handler instead
// of returning the first call's cached response. Membership
// here is a promise: the route's OWN domain guard already
// prevents a double-success on two identical requests, so the
// fast path would be redundant at best — at worst it would
// SERVE STALE TRUTH the domain guard exists to prevent.
// rotation's guard is the 409 reuse check (rotateRefreshJti):
// a resent rotation of an already-rotated-away jti must fail
// again, not silently replay the first success. The two
// /authentication/* grant routes join this set for a related
// reason: a stored authorize response holds a LIVE single-use
// code (replay re-hands a possibly-spent credential and locks
// out identical re-logins); a stored token response replayed
// hands back stale/revoked tokens AND bypasses the rotation
// reuse-detection and code double-spend guards, which only
// fire when the handler re-runs. Auth pairs are also keyed by
// id (appendMessagePairAlways), not hash, so two identical logins each
// land — message_hash is no longer per-call-unique on these
// routes. Grown family by family; never remove a pattern
// without re-deriving why its domain guard still makes the
// fast path safe to skip.
export const REPLAY_EXEMPT_ROUTE_PATTERNS: Set<string> =
    new Set([
        'identities/:id/tokens/:jti/rotation',
        'authentication/token',
        'authentication/authorize',
    ]);

// The head-read class, PER ROUTE PATTERN — never inferred from
// a request's own name. A document is revisited
// (create then update, or repeated PUT) and takes a pre-tx
// head-read; an operation document (name always '') and an
// event-append document (a fresh, client-minted id every write,
// e.g. states/:id) never head-read, even though an event-
// append name is never ''. Grown family by family alongside
// MESSAGE_PAIR_WIRED_ROUTE_PATTERNS.
export const DOCUMENT_CLASS_ROUTE_PATTERNS: Set<string> =
    new Set([
        'organizations/:id/ideas/:id',
        'organizations/:id/ideas/:id/submissions/:sid',
        'organizations/:id/projects/:id',
        'organizations/:id/projects/:id/flows/:pfid',
        'organizations/:id/flows/',
        'organizations/:id/flows/:id',
        // flows/:id/versions/:vid RETIRED (Phase 15 Task 7).
        // SIMPLE class (Phase 14 Task 9, gate 8): the locked
        // class 'flows' itself rides is structurally MOOT here —
        // api.ts's isLockedWrite is routePattern ===
        // documentEntityPattern(wiring), which for flows is
        // organizations/:id/flows/:id — a tags document
        // never equals that, so registering tags here
        // safely opts that document into the ordinary
        // head-read, never the locked four-outcome table.
        'organizations/:id/flows/:id/tags/:name',
        'organizations/:id/work-orders/',
        'organizations/:id/work-orders/:id',
        'organizations/:id/work-orders/:id/claim',
        'organizations/:id/flows/:id/work-orders/:woid',
        // Flat records + record-attributes retired (Task 23).
        'organizations/:id/flows/:id/records/:frid',
        'organizations/:id/objectives/',
        'organizations/:id/objectives/:id',
        'organizations/:id/objectives/:id/revisions/:rid',
        'organizations/:id/projects/:id'
            + '/objective-baseline-scores/:sid',
        'organizations/:id/projects/:id'
            + '/objective-actual-scores/:sid',
        'ai-agents/:id',
        'identities/',
        'identities/:id',
        'identities/:id/pii',
        'identities/:id/credentials/:cid',
        'identities/:id/registration',
        'identities/:id/default-organization',
        'organizations/:id',
        // Nested record-types collection POST (Task 9): same
        // head-read class as flat `records` so op + document
        // share the supersession chain at the type name.
        RECORD_TYPES_COLLECTION_PATTERN,
        // Nested record-types detail (Task 3): simple class —
        // no If-Match required on types.
        RECORD_TYPE_DETAIL_PATTERN,
        // Nested attributes detail (Task 7): simple class —
        // attributes never join the If-Match dialect.
        ATTRIBUTE_DETAIL_PATTERN,
        ORGANIZATION_MEMBER_DETAIL_PATTERN,
        // states/:id/field-values/:fvid RETIRED from live wire
        // (Phase 15 Task 7); seed still forms pairs at that
        // document via formSeedMessagePair + WRITE_RESPONSE_SPECS.
    ]);
