import type { DbAdapter } from './db.ts';
import type { Id, ResponseEntity } from './types.ts';
import { nowUtc } from './types.ts';
import {
    generateCryptoSafeBase62,
} from '../shared/crypto-safe-base62.ts';
import { latestByKey } from '../shared/ledger-reduction.ts';
import { messageAddress } from './message-address.ts';
import {
    buildRequestModel,
    buildResponseModel,
    canonicalJson,
    messageHashOf,
    bodyEtagOf,
} from './message-form.ts';
import {
    redactHeaderCredentials,
    redactAuthenticationRequest,
    redactAuthenticationResponse,
} from './message-redaction.ts';
import type { FieldLine } from '../shared/http-message/types.ts';
import { HttpMessage } from '../shared/http-message/http-message.ts';
import { parseJson } from '../shared/http-message/json-codec.ts';
import {
    defaultBodyRegistry,
} from '../shared/http-message/media-registry.ts';
import { REQUEST_ID_HEADER } from './request-context.ts';
import { familyRegistration } from './family-registry.ts';

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
    readonly uriPrefix: string;
    readonly uriId: string;
    readonly requesterIdentityId: Id;
    readonly requestMessage: string;   // canonical, redacted
    readonly requestHash: string;
    readonly responseStatus: number;
    readonly responseMessage: string;
    readonly responseEtag: string;
    readonly responseHash: string;
    readonly supersedes?: string;      // absent == genesis
    // The locked-class sibling of supersedes (spec §The two
    // PUT classes): the verified If-Response-ID echo, carried
    // forward as PROVENANCE rather than displacement — mutually
    // exclusive with supersedes (a locked non-genesis write sets
    // follows and never supersedes; a simple write sets
    // supersedes and never follows). Absent == genesis, exactly
    // like supersedes.
    readonly follows?: string;
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
    // canonicalUriPrefix.
    readonly organization: Id | undefined;
    readonly responseStatus: number;
    readonly responseBody: unknown | undefined;
    readonly headPairId: string | undefined;
    // The locked-class counterpart of headPairId: the verified
    // If-Response-ID echo, set by the caller ONLY when the gate's
    // four-outcome table (api.ts) resolved the write as a
    // matching-echo non-genesis locked write — mutually
    // exclusive with headPairId (a caller passes one or the
    // other, never both). Optional so every existing simple-
    // family call site keeps compiling unchanged.
    readonly follows?: string;
}

const SUPERSEDES_FIELD = 'supersedes';
const FOLLOWS_FIELD = 'follows';
const RESPONSE_ID_FIELD = 'response-id';

// One entry per FIRST PATH SEGMENT — note the multi-word nouns
// whose segment diverges from the table-name root:
// 'record-attributes' is a separate first segment from
// 'records' yet is genuinely organization-owned (organization-
// scoped store, organization_id index). Audit any new write
// route's first segment against the org-scoped adapter before
// trusting this set. A registered family (family-registry.ts)
// answers ONLY from its registration — its entry here is
// deleted, never kept as a parallel truth.
const ORGANIZATION_NESTED_FIRST_SEGMENTS: ReadonlySet<string> =
    new Set([
        'work-orders',
        'records', 'record-attributes', 'objectives',
        'memberships', 'states',
    ]);

// The tier rule, exported so gate, seed, and derivations share
// ONE prefix voice. A registered family's organizationNested
// slot decides first; the literal set above is the fallback
// for every not-yet-registered first segment.
export function canonicalUriPrefix(
    organization: Id | undefined,
    flatPrefix: string,
): string {
    const first = flatPrefix.split('/')[1] ?? '';
    const registered = familyRegistration(first);
    const nested = registered !== undefined
        ? registered.organizationNested
        : ORGANIZATION_NESTED_FIRST_SEGMENTS.has(first);
    if (organization !== undefined && nested) {
        return '/organizations/' + organization
            + flatPrefix;
    }
    return flatPrefix;
}

export async function formWritePair(
    input: WritePairInput,
): Promise<MessagePair> {
    const id = generateCryptoSafeBase62();
    const address = messageAddress(
        input.routeSegments, input.pathSegments,
    );
    const uriPrefix = canonicalUriPrefix(
        input.organization, address.uriPrefix,
    );
    const createdId = createdEntityUriId(
        input.routePattern, input.body,
    );
    const uriId = createdId ?? address.uriId;
    const requestModel =
        await redactAuthenticationRequest(
            input.routePattern,
            await redactHeaderCredentials(
                buildRequestModel({
                    method: input.method,
                    target: input.pathname,
                    fields: input.headerFields,
                    body: input.body,
                }),
            ),
        );
    const responseFields = [
        { name: RESPONSE_ID_FIELD, value: id },
        ...(input.headPairId === undefined ? [] : [{
            name: SUPERSEDES_FIELD,
            value: input.headPairId,
        }]),
        ...(input.follows === undefined ? [] : [{
            name: FOLLOWS_FIELD,
            value: input.follows,
        }]),
    ];
    const responseModel =
        await redactAuthenticationResponse(
            input.routePattern,
            buildResponseModel({
                status: input.responseStatus,
                fields: responseFields,
                body: input.responseBody,
            }),
        );
    const requestMessage = canonicalJson(requestModel);
    const responseMessage = canonicalJson(responseModel);
    return {
        id,
        requestAt: input.requestAt,
        uriPrefix,
        uriId,
        requesterIdentityId: input.requesterIdentityId,
        requestMessage,
        requestHash: await messageHashOf(requestMessage),
        responseStatus: input.responseStatus,
        responseMessage,
        responseEtag: await bodyEtagOf(responseModel),
        responseHash: await messageHashOf(responseMessage),
        ...(input.headPairId === undefined
            ? {} : { supersedes: input.headPairId }),
        ...(input.follows === undefined
            ? {} : { follows: input.follows }),
    };
}

// Complete an AuthPairSeed into a MessagePair for a grant's own
// response: operation-addressed (uriId '', global plane — see
// canonicalUriPrefix with organization undefined), never a
// head-read, so it never chains (no Supersedes). The two
// /authentication/* routes are the only callers; each grant
// calls this pre-tx, once its own domain read has resolved the
// requester identity and its response body is fully known.
export async function formAuthPair(
    seed: AuthPairSeed,
    body: Record<string, unknown>,
    requesterIdentityId: Id,
    responseStatus: number,
    responseBody: unknown,
): Promise<MessagePair> {
    return formWritePair({
        ...seed,
        body,
        requesterIdentityId,
        organization: undefined,
        responseStatus,
        responseBody,
        headPairId: undefined,
    });
}

// Pre-tx head-read: latest response pair id at the address, by
// the (at, id) reduction — provenance source for Supersedes.
// Returns undefined when the address is virgin.
export async function headPairIdAt(
    db: DbAdapter,
    uriPrefix: string,
    uriId: string,
): Promise<string | undefined> {
    const rows = await db.responses
        .getAllWhere('uri_id', uriId);
    const atAddress = rows.filter(
        (row) => row.uri_prefix === uriPrefix,
    );
    return latestByKey(atAddress, () => 'head')
        .get('head')?.id;
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

// The locked-class request header: the client's claimed current
// head, echoed back so a byte-identical resend is a different
// message from a genuinely stale one (a different echo hashes
// differently — spec §The two PUT classes). Exported so api.ts
// reads the SAME header name the hash covers.
export const IF_RESPONSE_ID_HEADER = 'if-response-id';

// The header fields worth storing in a pair's request message:
// enumerated explicitly (never hoisted blindly). `authorization`
// is redacted downstream (message-redaction.ts); the rest are
// stored verbatim.
const HOISTED_HEADER_NAMES: readonly string[] = [
    'authorization', 'content-type', 'idempotency-key',
    REQUEST_ID_HEADER, IF_RESPONSE_ID_HEADER,
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
    };
    if (stored.supersedes !== undefined) {
        headers['Supersedes'] = stored.supersedes;
    }
    if (stored.follows !== undefined) {
        headers['Follows'] = stored.follows;
    }
    return headers;
}

// Rebuild the wire Response from a stored response row's
// canonical message — the one reconstruction path shared by a
// fresh write's success return and an idempotent replay's early
// return.
export function responseFromStored(stored: ResponseEntity): Response {
    const model = parseJson(
        stored.message, defaultBodyRegistry(),
    );
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

// The pre-store body of a just-formed pair's own response
// message — a handler that must act on a value the gate's
// successBody resolver already minted (token rotation's
// pre-minted jti) reads it back HERE rather than deriving a
// second, possibly divergent, value. The pair IS the response.
export function pairResponseBody(
    pair: MessagePair,
): Record<string, unknown> | undefined {
    const model = parseJson(
        pair.responseMessage, defaultBodyRegistry(),
    );
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
    adapter: DbAdapter, requestHash: string, opName: string,
): Promise<Response> {
    const stored = await storedResponseFor(adapter, requestHash);
    if (stored === undefined) {
        throw new Error(
            opName + ' stored no pair for a wired write',
        );
    }
    return responseFromStored(stored);
}

// In-tx append (row ops only, no crypto): skips silently if a
// request with the same hash is already stored (the concurrent
// -retry guard); otherwise puts both rows. The view parameter
// is DbAdapter, NOT GuardedDbAdapter: route handlers receive
// DbAdapter and their transaction callbacks are typed
// (view: DbAdapter) — the fence spends the guard before
// handlers run. The append needs only EntityStore
// getAllWhere/put, both on the plain contract; GuardedDbAdapter
// widens cleanly to DbAdapter, so the invitations/auth call
// sites (which hold ctx.base) work unchanged.
export async function appendMessagePair(
    view: DbAdapter,
    pair: MessagePair,
): Promise<void> {
    const replay = await view.requests
        .getAllWhere('message_hash', pair.requestHash);
    if (replay.length > 0) return;
    await view.requests.put(pair.id, {
        uri_prefix: pair.uriPrefix,
        uri_id: pair.uriId,
        at: pair.requestAt,
        requester_identity_id: pair.requesterIdentityId,
        message_hash: pair.requestHash,
        message: pair.requestMessage,
    });
    // The response row's `at` — SAME column name as the
    // requests row, per the author — is minted HERE, as late
    // as a same-tx write permits. nowUtc() is synchronous: no
    // await, so the auto-commit constraint (which bars only
    // awaited promises) is not in play.
    await view.responses.put(pair.id, {
        uri_prefix: pair.uriPrefix,
        uri_id: pair.uriId,
        at: nowUtc(),
        status: pair.responseStatus,
        etag: pair.responseEtag,
        message_hash: pair.responseHash,
        message: pair.responseMessage,
        ...(pair.supersedes === undefined
            ? {} : { supersedes: pair.supersedes }),
        ...(pair.follows === undefined
            ? {} : { follows: pair.follows }),
    });
}

// The create-address override table: which body field names
// the created entity for create-shaped collection POSTs. Grown
// family by family in Tasks 2-5. A registered family (family-
// registry.ts) answers ONLY from its own createBodyIdField —
// its entry here is deleted, never kept as a parallel truth.
const CREATE_BODY_ID_FIELDS: Record<string, string> = {
    'work-orders': 'id',
    'records': 'id',
    'objectives': 'id',
    'ai-members': 'id',
    'human-members': 'id',
    'identities': 'id',
    // Not gate-dispatched (the invitations side channel forms
    // its own pair directly in invitations-domain.ts) but reuses
    // this SAME override table so createdEntityUriId serves both
    // callers with one voice.
    'invitations': 'invitationId',
};

export function createdEntityUriId(
    routePattern: string,
    body: Record<string, unknown> | undefined,
): string | undefined {
    // A registered family's createBodyIdField serves a bare
    // collection-POST create route whose pattern IS the family
    // name (e.g. 'records' below, still an unregistered
    // literal). Ideas registered this slot in Task 1 for its own
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
    // coincidence is no longer theoretical. Falls back to the
    // literal table for every not-yet-registered pattern.
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
    'members/:id',
    'ideas/:id',
    'ideas/:id/conversion',
    'ideas/:id/submissions/:sid',
    'states/:id',
    'projects/:id',
    'projects/:id/flows/:pfid',
    'flows',
    'flows/:id',
    'flows/:id/undo',
    'flows/:id/versions',
    'flows/:id/versions/:vid',
    'work-orders',
    'work-orders/:id',
    'work-orders/:id/claim',
    'work-orders/:id/transition',
    'flows/:id/work-orders/:woid',
    'records',
    'records/:id',
    'record-attributes/:id',
    'flows/:id/records/:frid',
    'objectives',
    'objectives/:id',
    'objectives/:id/revisions/:rid',
    'projects/:id/objective-baseline-scores/:sid',
    'projects/:id/objective-actual-scores/:sid',
    'ai-members',
    'ai-members/:id',
    'human-members',
    'human-members/:id',
    'identities',
    'identities/:id',
    'identities/:id/pii',
    'identities/:id/credentials/:cid',
    'memberships/:id',
    'identity-tokens/:id',
    'identity-token-revocations/:id',
    'identity-tokens/:jti/rotation',
    'identity-tokens/:jti/revocation',
    'organizations/:id',
    'role-grants/:id',
    'identity-providers/:id',
    'states/:id/field-values/:fvid',
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
// /authentication/* grant routes join this set in Task 3 for a
// DIFFERENT reason — their stored request/response rows are
// redacted (message-redaction.ts strips the token material),
// so the redacted stored body must never be handed back as a
// live wire response. Grown family by family; never remove a
// pattern without re-deriving why its domain guard (or
// redaction) still makes the fast path safe to skip.
export const REPLAY_EXEMPT_ROUTE_PATTERNS: Set<string> =
    new Set([
        'identity-tokens/:jti/rotation',
        'authentication/token',
        'authentication/authorize',
    ]);

// The head-read class, PER ROUTE PATTERN — never inferred from
// a request's own uriId. A document address is revisited
// (create then update, or repeated PUT) and forms a Supersedes
// chain via a pre-tx head-read; an operation address (uriId
// always '') and an event-append address (a fresh, client-
// minted id every write, e.g. states/:id) never chain, even
// though an event-append uriId is never ''. Grown family by
// family alongside PAIR_WIRED_ROUTE_PATTERNS.
export const DOCUMENT_CLASS_ROUTE_PATTERNS: Set<string> =
    new Set([
        'members/:id',
        'ideas/:id',
        'ideas/:id/submissions/:sid',
        'projects/:id',
        'projects/:id/flows/:pfid',
        'flows',
        'flows/:id',
        'flows/:id/versions/:vid',
        'work-orders',
        'work-orders/:id',
        'flows/:id/work-orders/:woid',
        'records',
        'records/:id',
        'record-attributes/:id',
        'flows/:id/records/:frid',
        'objectives',
        'objectives/:id',
        'objectives/:id/revisions/:rid',
        'projects/:id/objective-baseline-scores/:sid',
        'projects/:id/objective-actual-scores/:sid',
        'ai-members',
        'ai-members/:id',
        'human-members',
        'human-members/:id',
        'identities',
        'identities/:id',
        'identities/:id/pii',
        'identities/:id/credentials/:cid',
        'memberships/:id',
        'organizations/:id',
        'states/:id/field-values/:fvid',
    ]);
