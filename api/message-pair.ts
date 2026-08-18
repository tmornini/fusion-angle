import type { DbAdapter } from './db.ts';
import type {
    Id, IdentityTokenEntity, ResponseEntity,
} from './types.ts';
import { nowUtc } from './types.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { messageAddress } from './message-address.ts';
import { messageStore } from './message-store.ts';
import {
    buildRequestModel,
    buildResponseModel,
    storedWire,
    requestMessageHash,
    documentVersion,
    bodyOctetsOf,
    HEX64,
} from './message-form.ts';
import { validateIdentityTokenEntity } from './validators.ts';
import type { FieldLine } from '../shared/http-message/types.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseWire } from '../shared/http-message/wire-codec.ts';
import { REQUEST_ID_HEADER } from './request-context.ts';
import {
    familyRegistration,
    RECORD_TYPES_COLLECTION_PATTERN,
    RECORD_TYPE_DETAIL_PATTERN,
    ATTRIBUTE_DETAIL_PATTERN,
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
} from './family-registry.ts';
import {
    HTTP_OK, HTTP_CREATED, HTTP_NO_CONTENT, HTTP_BAD_REQUEST,
    HTTP_PRECONDITION_FAILED, ApiError,
} from './http-errors.ts';
import type { NotificationEvent } from
    './notifications.ts';

// The shadow-ledger message pair: one row in `requests`, one
// in `responses`, sharing `id`. Formed pre-tx (all crypto and
// address resolution happen before a transaction opens — the
// IndexedDB auto-commit constraint bars awaiting anything but
// row ops inside `db.transaction`), then appended as the LAST
// act of the domain write's own transaction.
export interface MessagePair {
    readonly id: Id;
    // The ARRIVAL stamp: minted at gate entry (the first act
    // of handleRequest) and stored in the requests row's `at`
    // column — the column name stays `at` on BOTH tables
    // (author: "at" is the perfect name); requestAt is
    // in-memory plumbing only. The response row's `at` is NOT
    // carried here — it is minted inside appendMessagePair, as
    // late as a same-tx write permits. Envelope only (S1): body
    // timestamps belong to the message's creator.
    readonly requestAt: string;
    readonly uriCollection: string;
    readonly uriId: string;
    readonly requesterIdentityId: Id;
    readonly requestMessage: string;   // serializeWire
    readonly requestHash: string;
    readonly responseStatus: number;
    readonly responseMessage: string;
    readonly responseEtag: string;
    readonly responseHash: string;
    readonly method: string;
    readonly operationId: string;
    // Pre-tx lock-head pair id, latched when If-Match
    // matches the advertised ETag. In-tx re-query only.
    readonly latchedHeadPairId?: string;
}

// The gate's seed for the two /authentication/* grant routes
// (Task 3, C1 discharge): everything WritePairInput needs
// EXCEPT the requester identity and the response side. Both
// routes are bearerExempt, so the generic pair block never
// forms a WritePairInput for them (api.ts) — the gate instead
// assembles this seed once, and the grant itself (the only
// place that can resolve the requester identity — a code's
// issuer, a verified token's subject — and the response body)
// completes it into a MessagePair via formAuthPair, pre-tx.
export interface AuthPairSeed {
    readonly requestAt: string;
    readonly headerFields: readonly FieldLine[];
    readonly method: string;
    readonly pathname: string;
    readonly routePattern: string;
    readonly routeSegments: readonly string[];
    readonly pathSegments: readonly string[];
}

export interface WritePairInput {
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
    // canonicalUriCollection.
    readonly organization: Id | undefined;
    readonly responseStatus: number;
    readonly responseBody: unknown | undefined;
    // 64-hex advertised ETag this later write is matching.
    // Omitted on genesis / unconditional writes.
    readonly matchedEtag?: string;
    readonly latchedHeadPairId?: string;
    // Required on every formed pair. Public writes supply
    // the hoisted Operation-ID; seed and inner PUTs pass
    // the envelope id here. Never minted for a public write.
    readonly operationId: string;
}

const RESPONSE_ID_FIELD = 'response-id';

// Fallback for first path segments that are organization-
// nested but not yet registered in family-registry.ts. A
// registered family answers ONLY from its registration — its
// entry here is deleted, never kept as a parallel truth. The
// states/:id address retirement emptied this set; the
// mechanism stays for any future un-registered nested segment.
const ORGANIZATION_NESTED_FIRST_SEGMENTS: ReadonlySet<string> =
    new Set([
    ]);

// The tier rule, exported so gate, seed, and derivations share
// ONE prefix voice. A registered family's organizationNested
// slot decides first; the literal set above is the fallback
// for every not-yet-registered first segment.
export function canonicalUriCollection(
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

export function requireOperationId(
    request: Request,
    method: string,
    bearerExempt: boolean,
): Response | undefined {
    if (bearerExempt) return undefined;
    if (
        method === 'GET' || method === 'HEAD'
    ) {
        return undefined;
    }
    const value = request.headers.get(
        OPERATION_ID_HEADER,
    );
    if (value === null || value === '') {
        return Response.json(
            {
                error: 'Operation-ID is required on '
                    + method,
            },
            { status: HTTP_BAD_REQUEST },
        );
    }
    if (!/^[0-9A-Za-z]{22}$/.test(value)) {
        return Response.json(
            {
                error: 'Operation-ID must be a 22-'
                    + 'character id',
            },
            { status: HTTP_BAD_REQUEST },
        );
    }
    return undefined;
}

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

export async function formWritePair(
    input: WritePairInput,
): Promise<MessagePair> {
    if (!/^[0-9A-Za-z]{22}$/.test(input.operationId)) {
        throw new Error(
            'operationId must be a 22-character id',
        );
    }
    const id = generateCryptoSafeBase62();
    const address = messageAddress(
        input.routeSegments, input.pathSegments,
    );
    const uriCollection = canonicalUriCollection(
        input.organization, address.uriCollection,
    );
    const createdId = createdEntityUriId(
        input.routePattern, input.body,
    );
    const uriId = createdId ?? address.uriId;
    const headerFields = headerFieldsWithOperationId(
        input.headerFields, input.operationId,
    );
    const requestModel = buildRequestModel({
        method: input.method,
        target: input.pathname,
        fields: headerFields,
        body: input.body,
    });
    const responseFields = [
        { name: RESPONSE_ID_FIELD, value: id },
    ];
    const responseModel = buildResponseModel({
        status: input.responseStatus,
        fields: responseFields,
        body: input.responseBody,
    });
    const requestMessage = storedWire(requestModel);
    const responseMessage = storedWire(responseModel);
    const version = input.method === 'DELETE'
        ? await requestMessageHash(responseMessage)
        : await documentVersion(
            bodyOctetsOf(responseModel),
            input.matchedEtag,
        );
    return {
        id,
        requestAt: input.requestAt,
        uriCollection,
        uriId,
        requesterIdentityId: input.requesterIdentityId,
        requestMessage,
        requestHash: await requestMessageHash(requestMessage),
        responseStatus: input.responseStatus,
        responseMessage,
        responseEtag: version,
        responseHash: await requestMessageHash(responseMessage),
        method: input.method,
        operationId: input.operationId,
        ...(input.latchedHeadPairId !== undefined
            ? { latchedHeadPairId: input.latchedHeadPairId }
            : {}),
    };
}

// Complete an AuthPairSeed into a MessagePair for a grant's own
// response: operation-addressed (uriId '', global plane — see
// canonicalUriCollection with organization undefined), never a
// head-read. The two /authentication/* routes are the only
// callers; each grant calls this pre-tx, once its own domain
// read has resolved the requester identity and its response
// body is fully known.
export async function formAuthPair(
    seed: AuthPairSeed,
    body: Record<string, unknown>,
    requesterIdentityId: Id,
    responseStatus: number,
    responseBody: unknown,
    operationId?: string,
): Promise<MessagePair> {
    const hoisted = seed.headerFields.find(
        (f) => f.name === OPERATION_ID_HEADER,
    )?.value;
    return formWritePair({
        ...seed,
        body,
        requesterIdentityId,
        organization: undefined,
        responseStatus,
        responseBody,
        operationId: operationId
            ?? hoisted
            ?? generateCryptoSafeBase62(),
    });
}

// The literal 'identities/:id/tokens/:tid' route pattern: the
// wired PUT's own address family and response spec (routes.ts,
// WRITE_RESPONSE_SPECS['identities/:id/tokens/:tid']), reused
// byte-for-byte by every synthesized identity_tokens row-write
// pair (Phase 13 Task 5, Gate 7) — one derivation later serves
// fixture pairs, real PUT pairs, and these synthesized
// grant/rotation/revocation pairs uniformly. Kept as a literal
// here rather than imported from routes.ts: routes.ts imports
// FROM message-pair.ts (formWritePair, headPairIdAt), never the
// reverse — the import graph stays acyclic (see
// formDocumentPairFor's own comment, routes.ts).
const TOKEN_EVENT_ROUTE_PATTERN = 'identities/:id/tokens/:tid';
const TOKEN_EVENT_ROUTE_SEGMENTS: readonly string[] =
    TOKEN_EVENT_ROUTE_PATTERN.split('/');

// Synthesizes ONE identity_tokens row's event pair — the SAME
// address, method, and response shape a real PUT
// identities/:id/tokens/:tid would store for that exact row
// (identityTokenEntityOf: jti, identity_id, action, chain_id,
// at, id — GET wins). Formed PRE-TX like every other pair
// (formWritePair's own crypto never runs inside an open
// transaction — the auto-commit constraint). EVENT-APPEND, like
// every identity_tokens row: identities/:id/tokens/:tid
// carries no DOCUMENT_CLASS_ROUTE_PATTERNS entry — no
// head-read. requesterIdentityId is the event's OWN
// identity_id (the affected identity) — the NAMED convention
// for a write with no authenticated actor in view at this
// depth (an internal grant, a rotation, a chain revocation).
// jti is an identifier, not a bearer secret — stored
// plaintext as the live wired PUT's own pairs already do.
export async function formTokenEventPair(
    id: Id,
    event: Omit<IdentityTokenEntity, 'id'>,
    operationId: string,
): Promise<MessagePair> {
    const pathSegments = [
        TOKEN_EVENT_ROUTE_SEGMENTS[0]!,
        event.identity_id,
        TOKEN_EVENT_ROUTE_SEGMENTS[2]!,
        id,
    ];
    const body = event as unknown as Record<string, unknown>;
    return formWritePair({
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
        responseStatus: HTTP_OK,
        responseBody: {
            ...validateIdentityTokenEntity(body),
            id,
        },
        operationId,
    });
}

// Live PUT pair id at the address. POST/PATCH are not
// heads. DELETE head and a virgin address are undefined.
export async function headPairIdAt(
    db: DbAdapter,
    uriCollection: string,
    uriId: string,
): Promise<string | undefined> {
    const stored = await messageStore(db).get(
        uriCollection, uriId,
    );
    return stored?.id;
}

// Latest PUT or DELETE at the address. Virgin is undefined.
// DELETE head is a gone document, not a miss.
export async function documentHeadAt(
    db: DbAdapter,
    uriCollection: string,
    uriId: string,
): Promise<{ id: string; method: string } | undefined> {
    const pairs = await messageStore(db).getPairs(
        uriCollection, uriId,
    );
    let head: {
        at: string;
        id: string;
        method: string;
    } | undefined;
    for (const pair of pairs) {
        const method = pair.request.method;
        if (method !== 'PUT' && method !== 'DELETE') {
            continue;
        }
        const at = pair.response.at;
        const id = pair.response.id;
        if (
            head === undefined
            || at > head.at
            || (at === head.at && id > head.id)
        ) {
            head = { at, id, method };
        }
    }
    if (head === undefined) return undefined;
    return { id: head.id, method: head.method };
}

// Pre-tx idempotency fast-path: the stored response message
// for a byte-identical resend, or undefined. ALSO the post-
// dispatch source of every wire response header — the stored
// row is the one truth the wire renders.
export async function storedResponseFor(
    db: DbAdapter,
    requestHash: string,
): Promise<ResponseEntity | undefined> {
    const prior = await db.requests
        .getAllWhere('message_hash', requestHash);
    const first = prior[0];
    if (first === undefined) return undefined;
    return await db.responses.getById(first.id);
}

// The wire rendering of a stored envelope stamp: IMF-fixdate
// seconds (new Date(at).toUTCString()) — a presentation
// transform; the column keeps microseconds.
export function httpDateOf(at: string): string {
    return new Date(at).toUTCString();
}

// Locked PUT and PATCH concurrency dialect: If-Match carries
// the strong ETag (quoted 64-hex documentVersion). Not a
// credential — stored verbatim so two writes differing only
// in If-Match are different messages for replay identity.
export const IF_MATCH_HEADER = 'if-match';

export { HEX64 } from './message-form.ts';

// Parse a wire If-Match value into the unquoted 64-hex
// tag. Accepts exactly one strong etag (`"<hex64>"`).
// Anything else — `*`, weak, lists, unquoted, pair id —
// yields undefined; the caller answers 400.
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
    if (!HEX64.test(inner)) return undefined;
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

export function ifMatchFromPair(
    pair: MessagePair,
): string | undefined {
    return ifMatchFromMessage(pair.requestMessage);
}

// Raw If-Match header value from a formed pair —
// undefined means ABSENT. Callers that must speak the
// 428-vs-400 ladder themselves (transition op) need
// absent distinguished from malformed;
// ifMatchFromPair conflates them.
export function rawIfMatchFromPair(
    pair: MessagePair,
): string | undefined {
    const model = parseWire(pair.requestMessage);
    const field = model.fields.find(
        (line) => line.name === IF_MATCH_HEADER,
    );
    return field?.value;
}

// Strong wire ETag: quotes a 64-hex version token.
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

// The header fields worth storing in a pair's request message:
// enumerated explicitly (never hoisted blindly). Stored
// verbatim, including `authorization`.
const HOISTED_HEADER_NAMES: readonly string[] = [
    'authorization', 'content-type', 'idempotency-key',
    REQUEST_ID_HEADER, IF_MATCH_HEADER, OPERATION_ID_HEADER,
];

export function hoistedHeaderFields(request: Request): FieldLine[] {
    const fields: FieldLine[] = [];
    for (const name of HOISTED_HEADER_NAMES) {
        const value = request.headers.get(name);
        if (value !== null) {
            fields.push({ name, value });
        }
    }
    return fields;
}

// The one wire-header voice for both a fresh write and a
// byte-identical replay — both render from the STORED row,
// never the in-memory pair, so a concurrent-replay's surviving
// original pair is what the wire advertises either way.
export function wireHeadersFor(stored: ResponseEntity): HeadersInit {
    const headers: Record<string, string> = {
        'Date': httpDateOf(stored.at),
        'Response-ID': stored.id,
        'Operation-ID': stored.operation_id,
    };
    return headers;
}

// Rebuild the wire Response from a stored response row's
// serializeWire message — the one reconstruction path shared
// by a fresh write's success return and an idempotent replay's
// early return.
export function responseFromStored(stored: ResponseEntity): Response {
    const model = parseWire(stored.message);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line: '
            + stored.id,
        );
    }
    const init = {
        status: model.startLine.status,
        headers: wireHeadersFor(stored),
    };
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? Response.json(JSON.parse(body.toText()), init)
        : new Response(null, init);
}

// Stream a stored PUT as this caller's GET: same body
// octets, Date replaced with now, no Operation-ID.
// ETag and Response-ID are projection headers.
export function streamGetFromStored(
    stored: ResponseEntity,
    at: string,
): Response {
    const model = parseWire(stored.message);
    if (model.startLine.kind !== 'response') {
        throw new Error(
            'stored response message has no status line: '
            + stored.id,
        );
    }
    const headers = new Headers();
    headers.set('Date', httpDateOf(at));
    headers.set('Response-ID', stored.id);
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
    return attachEtag(response, stored.version);
}

// Send-time status: 201 if this request appended a pair
// (PUT/PATCH/POST), 200 if it stored nothing, DELETE 204.
// Stored start-line stays GET-shaped 200 / DELETE 204.
// Operation-ID is added here (wireHeadersFor), never stored
// on the GET-shaped blob.
export function sendWriteResponse(
    stored: ResponseEntity,
    method: string,
    appended: boolean,
): Response {
    const rendered = responseFromStored(stored);
    const status = method === 'DELETE'
        ? HTTP_NO_CONTENT
        : appended ? HTTP_CREATED : HTTP_OK;
    if (status === rendered.status) return rendered;
    return new Response(rendered.body, {
        status,
        headers: rendered.headers,
    });
}

// The pre-store body of a just-formed pair's own response
// message — a handler that must act on a value the gate's
// successBody resolver already minted (token rotation's
// pre-minted jti) reads it back HERE rather than deriving a
// second, possibly divergent, value. The pair IS the response.
export function pairResponseBody(
    pair: MessagePair,
): Record<string, unknown> | undefined {
    const model = parseWire(pair.responseMessage);
    const body = HttpMessage.fromModel(model).body();
    return body.exists()
        ? JSON.parse(body.toText()) as Record<string, unknown>
        : undefined;
}

// The wire response for a wired write, rebuilt from the stored
// row the transaction just appended — crashes loud if the pair
// somehow never landed (a wiring bug, never a normal path). The
// shared post-write voice for both side channels
// (invitations-domain.ts, organization-requests.ts) — the
// generic gate inlines the same shape at its own call sites
// (api.ts) since it also folds in postWriteNotification between
// the lookup and the response there.
export async function storedPairResponse(
    adapter: DbAdapter,
    requestHash: string,
    opName: string,
    method: string,
): Promise<Response> {
    const stored = await storedResponseFor(adapter, requestHash);
    if (stored === undefined) {
        throw new Error(
            opName + ' stored no pair for a wired write',
        );
    }
    return sendWriteResponse(stored, method, true);
}

// In-tx put by pair id (row ops only, no crypto): writes both
// rows keyed by pair.id. Idempotent by id — a second put of the
// same pair overwrites the same slots. Auth grant pairs use this
// path so two byte-identical logins each land (their ids differ);
// hash-keyed appendMessagePair would drop the second.
// The view parameter is DbAdapter, NOT GuardedDbAdapter: route
// handlers receive DbAdapter and their transaction callbacks are
// typed (view: DbAdapter) — the fence spends the guard before
// handlers run. The put needs only EntityStore put, on the plain
// contract; GuardedDbAdapter widens cleanly to DbAdapter, so the
// invitations/auth call sites (which hold ctx.base) work
// unchanged.
export async function putMessagePair(
    view: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    await coordinateWrite(view, pair, false);
    await writePairRows(view, pair);
    await notifyWrite(view, pair);
}

// In-tx append (row ops only, no crypto): skips silently if a
// request with the same hash is already stored (the concurrent
// -retry guard); otherwise puts both rows via writePairRows.
export async function appendMessagePair(
    view: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    await coordinateWrite(view, pair, true);
    const replay = await view.requests
        .getAllWhere('message_hash', pair.requestHash);
    if (replay.length > 0) return;
    await writePairRows(view, pair);
    await notifyWrite(view, pair);
}

async function writePairRows(
    view: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    await view.requests.put(pair.id, {
        uri_collection: pair.uriCollection,
        uri_id: pair.uriId,
        at: pair.requestAt,
        requester_identity_id: pair.requesterIdentityId,
        message_hash: pair.requestHash,
        message: pair.requestMessage,
        method: pair.method,
        operation_id: pair.operationId,
    });
    // The response row's `at` — SAME column name as the
    // requests row, per the author — is minted HERE, as late
    // as a same-tx write permits. nowUtc() is synchronous: no
    // await, so the auto-commit constraint (which bars only
    // awaited promises) is not in play.
    await view.responses.put(pair.id, {
        uri_collection: pair.uriCollection,
        uri_id: pair.uriId,
        at: nowUtc(),
        version: pair.responseEtag,
        message: pair.responseMessage,
        operation_id: pair.operationId,
    });
}

// Lock order: dedup if hash-deduped, address if
// gated, then FOR UPDATE + a new latest SELECT.
async function coordinateWrite(
    view: DbAdapter,
    pair: MessagePair,
    hashDeduped: boolean,
): Promise<void> {
    const locks = view.writeLocks;
    if (locks === undefined) return;
    if (hashDeduped) {
        await locks.lockDedup(pair.requestHash);
    }
    const gated = isGatedAddress(pair.uriCollection);
    if (gated) {
        await locks.lockAddress(
            pair.uriCollection, pair.uriId,
        );
    }
    const latched = pair.latchedHeadPairId;
    if (latched !== undefined) {
        await locks.lockHead(latched);
        const latest = await locks.latestPutDelete(
            pair.uriCollection, pair.uriId,
        );
        if (latest === null || latest.id !== latched) {
            throw new ApiError(
                'If-Match does not match the current'
                + ' document at '
                + pair.uriCollection + pair.uriId,
                HTTP_PRECONDITION_FAILED,
            );
        }
        return;
    }
    if (!gated) return;
    const latest = await locks.latestPutDelete(
        pair.uriCollection, pair.uriId,
    );
    if (latest !== null && latest.method === 'PUT') {
        throw new ApiError(
            'If-Match does not match the current'
            + ' document at '
            + pair.uriCollection + pair.uriId,
            HTTP_PRECONDITION_FAILED,
        );
    }
}

async function notifyWrite(
    view: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    const notify = view.writeLocks?.notify;
    if (notify === undefined) return;
    await notify(eventForPair(pair));
}

function eventForPair(
    pair: MessagePair,
): NotificationEvent {
    const parts = pair.uriCollection
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
        identityIds: [pair.requesterIdentityId],
    };
}

function isGatedAddress(collection: string): boolean {
    const parts = collection
        .split('/')
        .filter((part) => part !== '');
    const family = parts[0] === 'organizations'
        ? (parts[2] ?? '')
        : (parts[0] ?? '');
    const concurrency = familyRegistration(family)
        ?.concurrency;
    return concurrency === 'locked'
        || concurrency === 'create-only';
}

// The create-address override table: which body field names
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
// address of its own to register), so this literal table stays
// its one consult forever, not a waypoint to registration.
const CREATE_BODY_ID_FIELDS: Record<string, string> = {
    // Not gate-dispatched (the invitations side channel forms
    // its own pair directly in invitations-domain.ts) but reuses
    // this SAME override table so createdEntityUriId serves both
    // callers with one voice.
    'invitations': 'invitationId',
    // Nested composed POST (Task 9): pattern is not a bare
    // family name, so the registry consult never fires — body
    // `id` collapses the operation pair onto the type's uri_id
    // (same supersession collapse the retired flat POST
    // /records used).
    [RECORD_TYPES_COLLECTION_PATTERN]: 'id',
};

export function createdEntityUriId(
    routePattern: string,
    body: Record<string, unknown> | undefined,
): string | undefined {
    // A registered family's createBodyIdField serves a bare
    // collection-POST create route whose pattern IS the family
    // name. Ideas registered this slot in Task 1 for its own
    // POST /ideas, which Phase 2 Task 3 (R1) retired — genesis
    // folded into the document-class PUT ideas/:id, whose uriId
    // messageAddress already derives from the path segment, so
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
    const registered = familyRegistration(routePattern);
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

// The coverage gate: pairs, wire headers, and the idempotency
// fast-path fire ONLY for wired route patterns. Seeded with the
// ideas patterns in Task 1; every Task 2/3 family commit
// extends it; the Task 6 exit test asserts it covers every
// write route — so no intermediate commit ever advertises a
// Response-ID it did not store.
export const PAIR_WIRED_ROUTE_PATTERNS: Set<string> = new Set([
    'ideas/:id',
    'ideas/:id/conversion',
    'ideas/:id/submissions/:sid',
    'projects/:id',
    'projects/:id/flows/:pfid',
    'flows',
    'flows/:id',
    'flows/:id/undo',
    // flows/:id/versions[+/:vid] RETIRED (Phase 15 Task 7).
    'flows/:id/tags/:name',
    'work-orders',
    'work-orders/:id',
    'work-orders/:id/claim',
    'work-orders/:id/transition',
    'work-orders/:id/binding',
    'flows/:id/work-orders/:woid',
    // Flat records + record-attributes retired (Task 23).
    'flows/:id/records/:frid',
    'objectives',
    'objectives/:id',
    'objectives/:id/revisions/:rid',
    'projects/:id/objective-baseline-scores/:sid',
    'projects/:id/objective-actual-scores/:sid',
    'ai-agents/:id',
    'identities',
    'identities/:id',
    'identities/:id/pii',
    'identities/:id/credentials/:cid',
    'identities/:id/registration',
    'identities/:id/tokens/:tid',
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
    // DELETE (PAIR_WIRED only — R10 keeps DOCUMENT_CLASS
    // clear). Public PUT is 405 (Task 20).
    INSTANCE_DETAIL_PATTERN,
    ORGANIZATION_MEMBER_DETAIL_PATTERN,
    // states/:id/field-values/:fvid RETIRED from live wire
    // (Phase 15 Task 7); seed still forms pairs at that
    // address via formSeedPair + WRITE_RESPONSE_SPECS.
]);

// Route patterns wired for pair STORAGE (PAIR_WIRED_ROUTE_
// PATTERNS above) whose gate dispatch must NEVER take the
// pre-tx idempotency fast path (storedResponseFor in api.ts) —
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
// id (putMessagePair), not hash, so two identical logins each
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
// a request's own uriId. A document address is revisited
// (create then update, or repeated PUT) and takes a pre-tx
// head-read; an operation address (uriId always '') and an
// event-append address (a fresh, client-minted id every write,
// e.g. states/:id) never head-read, even though an event-
// append uriId is never ''. Grown family by family alongside
// PAIR_WIRED_ROUTE_PATTERNS.
// 'identities/:id/pii' is RETIRED here (Phase 10 Task 3): the
// /pii address is the message plane's sanctioned hard-delete
// zone (api/pii-hard-delete.ts) — CHAINLESS by construction, so
// this Set's pre-tx head-read must never run for it. It stays
// wired for pair STORAGE in PAIR_WIRED_ROUTE_PATTERNS above.
export const DOCUMENT_CLASS_ROUTE_PATTERNS: Set<string> =
    new Set([
        'ideas/:id',
        'ideas/:id/submissions/:sid',
        'projects/:id',
        'projects/:id/flows/:pfid',
        'flows',
        'flows/:id',
        // flows/:id/versions/:vid RETIRED (Phase 15 Task 7).
        // SIMPLE class (Phase 14 Task 9, gate 8): the locked
        // class 'flows' itself rides is structurally MOOT here —
        // api.ts's isLockedWrite exact-matches routePattern ===
        // family + '/:id', and a 4-segment pattern never
        // equals 'flows/:id' — so registering tags here safely
        // opts that address into the ordinary head-read,
        // never the locked four-outcome table.
        'flows/:id/tags/:name',
        'work-orders',
        'work-orders/:id',
        'work-orders/:id/claim',
        'flows/:id/work-orders/:woid',
        // Flat records + record-attributes retired (Task 23).
        'flows/:id/records/:frid',
        'objectives',
        'objectives/:id',
        'objectives/:id/revisions/:rid',
        'projects/:id/objective-baseline-scores/:sid',
        'projects/:id/objective-actual-scores/:sid',
        'ai-agents/:id',
        'identities',
        'identities/:id',
        'identities/:id/credentials/:cid',
        'identities/:id/registration',
        'organizations/:id',
        // Nested record-types collection POST (Task 9): same
        // head-read class as flat `records` so op + document
        // share the supersession chain at the type uri_id.
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
        // address via formSeedPair + WRITE_RESPONSE_SPECS.
    ]);
