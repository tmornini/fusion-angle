import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id, StateEntity, RequestEntity, ResponseEntity,
} from './types.ts';
import {
    pickString,
    validateRecordDocumentBody,
} from './validators.ts';
import type { MessagePair } from './message-pair.ts';
import { canonicalUriCollection } from './message-pair.ts';
import {
    familyRegistration,
    RECORD_TYPE_DETAIL_PATTERN,
} from './family-registry.ts';
import { missedReadError } from './derive-states.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    currentLifecycleEvent,
    DELETED_STATE,
    requestBodyOf,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';
import type {
    Route,
    GetHandler,
    PutHandler,
    WriteResponseSpec,
} from './routes.ts';
import { HTTP_OK } from './http-errors.ts';
import { liveHeadId, messageStore } from
    './message-store.ts';
import {
    recordTypeEntityOf,
    recordTypesUriPrefix,
} from './derive-record-types.ts';
import { flowStoredEntityOf } from './derive-flows.ts';

// param/requireOrganization/withoutId live HERE, not in
// routes.ts, so this module has NO runtime (value) dependency on
// routes.ts — only the type-only import above, which
// `--strip-types` erases entirely, so it never enters the
// runtime module graph. routes.ts imports them back (a one-way
// dependency): it needs the generic constructors below plus
// registerDocumentFamilyWiring, so SOMETHING must break the
// cycle, and these three small, self-contained request helpers
// (no dependency on routes.ts's own route table) are the
// smallest thing that can move. This is load-bearing: routes.ts
// calls registerDocumentFamilyWiring at ITS OWN module scope
// (below), which requires this module to be fully evaluated
// first — true only because this module no longer has a value
// import that could pause ITS evaluation partway through waiting
// on routes.ts.

export function param(
    params: string[],
    index: number,
): string {
    const value = params[index];
    if (value === undefined || value === '') {
        throw new Error(
            'Missing route param at index '
            + index,
        );
    }
    return value;
}

// The fence organization a ledger-derived, org-owned GET
// handler requires: the verified token claim the gate resolved,
// never the path. Its absence is a wiring bug — a bearer-exempt
// or global route reaching a handler that must derive org-
// scoped state — never a valid contingency, so this crashes
// loud rather than deriving cross-tenant or falling back to an
// empty read.
export function requireOrganization(
    organization: Id | undefined,
): Id {
    if (organization === undefined) {
        throw new Error(
            'organization-owned read dispatched with no'
            + ' fence organization',
        );
    }
    return organization;
}

// Strip `id` from the request body before
// passing to entity validators. `id` is a
// routing/storage key, not a body field;
// validators enforce the exact body key set.
export function withoutId(
    body: Record<string, unknown>,
): Record<string, unknown> {
    const { id: _id, ...rest } = body;
    return rest;
}

// The generic verb-class components (spec verb-class addendum):
// by the third registered family, the hand-written per-family
// route scaffolding (a GET deriving the head document, a PUT
// dispatching to the family's own decompose op, a
// WRITE_RESPONSE_SPECS entry re-deriving the same successBody)
// is ONE shape, parameterized by exactly three per-family
// facts — never grown beyond them without a fourth family's
// evidence.
export interface DocumentFamilyWiring {
    readonly family: string;
    // Fourth-family evidence (work-orders): 'trio' families
    // carry the Decision 7 lifecycle trio in every document
    // body and get the lifecycle walk + DELETED filter;
    // 'stateless' families carry entity fields only and skip
    // both (their lifecycle, if any, lives in operation-
    // addressed event pairs, never the document address).
    readonly lifecycle: 'trio' | 'stateless';
    // The identifier the wire 404 body speaks —
    // EntityNotFoundError's table. Family name for ideas/
    // projects/flows; 'work_orders' for work-orders (the
    // first family whose storage table name differs from its
    // family name).
    readonly notFoundTable: string;
    // Validates the full wire document (entity + trio [+ family
    // extras]); throws ValidationError.
    readonly validateDocument:
        (body: Record<string, unknown>) => unknown;
    // The family's decompose op (old-plane rows + pair).
    readonly documentOp: (
        db: DbAdapter, id: Id,
        body: Record<string, unknown>, actor: Id,
        pair?: MessagePair,
    ) => Promise<unknown>;
    // Head-pair body -> wire entity (id + organization_id
    // stamped by the caller). Trio families that embed the
    // lifecycle-current event (ideas, projects, records,
    // objectives, members) receive `current` after the
    // DELETED filter; other families accept and ignore the
    // optional third argument.
    readonly entityOf: (
        document: DerivedDocument,
        organization: Id,
        current?: StateEntity,
    ) => unknown;
}

// The per-family wiring table — grown family by family (ideas,
// projects, flows, work-orders, records, record-attributes) —
// never consulted through anything but documentFamilyWiring: the
// gate's locked/simple keying (api.ts) treats membership here,
// ANDed with a 'locked' registration, as "this route is served
// via documentPutHandler" — never a blanket family-registry or
// DOCUMENT_CLASS_ROUTE_PATTERNS consult, so an unregistered-here
// family never rides the locked arm no matter what
// family-registry.ts declares. Exported (a mutable table, like
// FAMILY_REGISTRY) so the locked-arm's own tests can register a
// SYNTHETIC family for the duration of a test — flows is the
// live family that rides the locked arm today (registered here
// AND 'locked' in family-registry.ts); every other registered
// family is 'simple'.
export const DOCUMENT_FAMILY_WIRINGS:
    Record<string, DocumentFamilyWiring> = {};

// The ONE place a family's wiring row is written. routes.ts
// builds each row from ITS OWN local bindings (the ops, the
// validators, the entity mappers all live there) and calls this
// at module scope, once, right after defining the row — this
// module never constructs ideas/projects' own rows itself, and
// (per the comment above) has no runtime import of routes.ts to
// race against, only the erased type-only import of the Route
// family of types the generic constructors below need. A future
// family (Task 3's flows row) registers the same way, beside
// ITS OWN ops.
export function registerDocumentFamilyWiring(
    wiring: DocumentFamilyWiring,
): void {
    DOCUMENT_FAMILY_WIRINGS[wiring.family] = wiring;
}

export function documentFamilyWiring(
    family: string,
): DocumentFamilyWiring | undefined {
    return DOCUMENT_FAMILY_WIRINGS[family];
}

// Organization-nested miss path: probe global existence so a
// foreign id 403s and a genuine absence 404s. Global-plane
// families (members, identities, …) stay EntityNotFoundError
// only — they must not probe.
export async function throwDocumentMiss(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<never> {
    const nested =
        familyRegistration(wiring.family)?.organizationNested
            !== false;
    if (!nested) {
        throw new EntityNotFoundError(wiring.notFoundTable, id);
    }
    throw await missedReadError(
        db, id, organization, wiring.notFoundTable,
    );
}

// The generic per-id derivation: store.getPairs at this
// address, reduce to the head document (deriveDocumentsAt),
// and — for a 'trio' family ONLY — walk the lifecycle
// history over those same pairs to 404 a lifecycle-deleted
// document too. A 'stateless' family's document body carries
// no trio, so its ONLY tombstone signal is a DELETE-method
// head — already 404-absent via deriveDocumentsAt. Soft-
// deleted foreign docs miss the caller prefix and 403 via
// the global probe.
async function derivedDocumentEntity(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<unknown> {
    const prefix = canonicalUriCollection(
        organization, '/' + wiring.family + '/',
    );
    const stored = await messageStore(db).getPairs(
        prefix, id,
    );
    const requests = stored.map((pair) => pair.request);
    const responses = stored.map((pair) => pair.response);
    const document = deriveDocumentsAt(
        requests, responses, prefix,
    ).get(id);
    if (document === undefined) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    if (wiring.lifecycle === 'trio') {
        const pairs = documentPairsAt(requests, responses, prefix)
            .filter((pair) => pair.uriId === id);
        const history = stateHistoryFrom(
            documentLifecycleEvents(pairs), id,
        );
        if (currentDocumentState(history) === DELETED_STATE) {
            throw await throwDocumentMiss(
                wiring, db, organization, id,
            );
        }
        // After DELETED filter history is non-empty for every
        // live trio document (genesis always mints an event).
        const current = currentLifecycleEvent(history)!;
        return wiring.entityOf(
            document, organization, current,
        );
    }
    return wiring.entityOf(document, organization);
}

export function documentGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return (db, params, _actor, organization) =>
        derivedDocumentEntity(
            wiring, db, requireOrganization(organization),
            param(params, 0),
        );
}

// Live PUT pair id at this address — store.get, the same
// live-document reduction headPairIdAt now uses. A DELETE
// head or virgin address is undefined.
export async function documentHeadPairId(
    db: DbAdapter,
    uriCollection: string,
    id: Id,
): Promise<string | undefined> {
    const stored = await messageStore(db).get(
        uriCollection, id,
    );
    return stored?.id;
}

// The route body is UNCHANGED dispatch to the documentOp for
// BOTH concurrency classes — the locked/simple divide is
// resolved entirely upstream, at the gate (api.ts's four-outcome
// table decides genesis/412 BEFORE this handler ever
// runs), so documentPutHandler carries no concurrency branch of
// its own.
export function documentPutHandler(
    wiring: DocumentFamilyWiring,
): PutHandler {
    return (db, params, body, actor, pair) =>
        wiring.documentOp(
            db, param(params, 0), body, actor, pair,
        );
}

export function documentEntityRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [wiring.family, ':id'],
        get: documentGetHandler(wiring),
        put: documentPutHandler(wiring),
    };
}

// GET <family>/:id/versions: wrap a family derive*StateHistory
// (ASC StateEntity[]) with (at, id) DESC so index 0 is
// current, and empty → missedReadError (403 foreign / 404
// absent) using the family's table name for an honest body.
// Does NOT change the derive's own ASC for other callers.
export type DocumentStateHistoryDerive = (
    db: DbAdapter,
    organization: Id,
    entityId: Id,
) => Promise<StateEntity[]>;

export function documentStateHistoryHandler(
    deriveFn: DocumentStateHistoryDerive,
    tableName: string,
): GetHandler {
    return async (db, params, _actor, organization) => {
        const org = requireOrganization(organization);
        const id = param(params, 0);
        const history = await deriveFn(db, org, id);
        if (history.length === 0) {
            throw await missedReadError(
                db, id, org, tableName,
            );
        }
        return history.toReversed();
    };
}

const PUT_METHOD = 'PUT';

// Lookup by version column at this collection + id.
// 0 → undefined. 1 → that row. N → latest (at, id).
export async function lookupStoredRevision(
    db: DbAdapter,
    prefix: string,
    id: Id,
    version: string,
): Promise<{
    request: RequestEntity;
    response: ResponseEntity;
} | undefined> {
    const store = messageStore(db);
    const response = await store.getByVersion(
        prefix, id, version,
    );
    if (response === undefined) return undefined;
    const pair = (await store.getPairs(prefix, id)).find(
        (entry) => entry.response.id === response.id,
    );
    if (pair === undefined) return undefined;
    return {
        request: pair.request,
        response: pair.response,
    };
}

async function serveDocumentRevision(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
    version: string,
): Promise<unknown> {
    const prefix = canonicalUriCollection(
        organization, '/' + wiring.family + '/',
    );
    const found = await lookupStoredRevision(
        db, prefix, id, version,
    );
    if (
        found === undefined
        || found.request.method !== PUT_METHOD
    ) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    const body = requestBodyOf(found.request.message);
    const document: DerivedDocument = {
        uriId: id,
        pairId: found.response.id,
        method: found.request.method,
        body,
    };
    if (wiring.lifecycle === 'trio') {
        const current: StateEntity = {
            id: pickString(body, 'state_event_id'),
            entity_id: id,
            state: pickString(body, 'state'),
            member_id: found.request.requester_identity_id,
            at: pickString(body, 'state_at'),
            version: found.response.version,
        };
        return wiring.entityOf(
            document, organization, current,
        );
    }
    return wiring.entityOf(document, organization);
}

export function documentVersionGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return (db, params, _actor, organization) =>
        serveDocumentRevision(
            wiring,
            db,
            requireOrganization(organization),
            param(params, 0),
            param(params, 1),
        );
}

export function documentVersionRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [wiring.family, ':id', 'versions', ':version'],
        get: documentVersionGetHandler(wiring),
    };
}

// The generic per-family list derivation, split out from
// documentCollectionRoute below (mirroring documentGetHandler/
// documentEntityRoute's own split) so a caller needing the bare
// GetHandler value — routes.ts's route('flows', {...}), which
// pairs this get with its own hand-written post — has one typed
// exactly `GetHandler`, not `GetHandler | undefined` off a
// constructed Route's optional field.
export function documentCollectionGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return async (db, _params, _actor, organization) => {
        const organizationId = requireOrganization(
            organization,
        );
        const prefix = canonicalUriCollection(
            organizationId, '/' + wiring.family + '/',
        );
        const store = messageStore(db);
        const live = await store.getCollection(prefix);
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_collection', prefix),
            db.responses.getAllWhere('uri_collection', prefix),
        ]);
        const documents = deriveDocumentsAt(
            requests, responses, prefix,
        );
        // The per-document history walk (and its DELETED
        // filter) runs for a 'trio' family ONLY — same gate as
        // derivedDocumentEntity above, same reason: a
        // 'stateless' body carries no trio to walk, and a
        // DELETE head is already absent from `documents`.
        const pairsById = new Map<Id, DocumentPair[]>();
        if (wiring.lifecycle === 'trio') {
            for (const pair of documentPairsAt(
                requests, responses, prefix,
            )) {
                const list = pairsById.get(pair.uriId);
                if (list === undefined) {
                    pairsById.set(pair.uriId, [pair]);
                } else {
                    list.push(pair);
                }
            }
        }
        const byId = new Map<Id, unknown>();
        for (const [id, document] of documents) {
            if (wiring.lifecycle === 'trio') {
                const history = stateHistoryFrom(
                    documentLifecycleEvents(
                        pairsById.get(id) ?? [],
                    ),
                    id,
                );
                if (
                    currentDocumentState(history)
                        === DELETED_STATE
                ) continue;
                const current =
                    currentLifecycleEvent(history)!;
                byId.set(
                    id,
                    wiring.entityOf(
                        document, organizationId, current,
                    ),
                );
                continue;
            }
            byId.set(
                id,
                wiring.entityOf(document, organizationId),
            );
        }
        // Oldest live head (at, id) first — getCollection
        // order. Bodies match GET :id (entityOf), not the
        // stored PUT echo. Trio-deleted heads are omitted.
        const rows: unknown[] = [];
        for (const entity of live) {
            const row = byId.get(liveHeadId(entity));
            if (row !== undefined) rows.push(row);
        }
        return rows;
    };
}

export function documentCollectionRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [wiring.family],
        get: documentCollectionGetHandler(wiring),
    };
}

// G1 trio families: stored PUT = today's GET derive
// (wiring.entityOf over the chain, trio included). G2
// flows: flowEntityOf minus hasUndoHistory. G3 stateless:
// wiring.entityOf over the incoming body (no trio walk).
const STREAM_TRIO_FAMILIES: ReadonlySet<string> = new Set([
    'ideas',
    'projects',
    'objectives',
    'members',
]);

const STREAM_STATELESS_FAMILIES: ReadonlySet<string> =
    new Set([
        'ai-members',
        'human-members',
        'identities',
        'memberships',
    ]);

const ID_PATTERN_SUFFIX = '/:id';

// Arrival-last sentinel so this write is the newest link
// in the lifecycle walk (first-occurrence-wins by
// state_event_id; current is (state_at, id)).
const INCOMING_PAIR_AT = '9999-12-31T23:59:59.999999Z';
const INCOMING_PAIR_ID = '\uffff';

function idFamilyOf(pattern: string): string | undefined {
    if (!pattern.endsWith(ID_PATTERN_SUFFIX)) {
        return undefined;
    }
    const family = pattern.slice(
        0, -ID_PATTERN_SUFFIX.length,
    );
    if (family.includes('/')) return undefined;
    return family;
}

function trioCurrentFromBody(
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
): StateEntity {
    return {
        id: pickString(body, 'state_event_id'),
        entity_id: id,
        state: pickString(body, 'state'),
        member_id: actor,
        at: pickString(body, 'state_at'),
    };
}

function trioDocumentFromBody(
    id: Id,
    body: Record<string, unknown>,
): DerivedDocument {
    return {
        uriId: id,
        pairId: id,
        method: PUT_METHOD,
        body,
    };
}

export async function streamedTrioEntityOf(
    db: DbAdapter,
    prefix: string,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    organization: Id,
    entityOf: DocumentFamilyWiring['entityOf'],
): Promise<unknown> {
    const raw = withoutId(body);
    const stored = await messageStore(db).getPairs(
        prefix, id,
    );
    const existing = documentPairsAt(
        stored.map((pair) => pair.request),
        stored.map((pair) => pair.response),
        prefix,
    );
    const incoming: DocumentPair = {
        id: INCOMING_PAIR_ID,
        at: INCOMING_PAIR_AT,
        uriId: id,
        method: PUT_METHOD,
        body: raw,
        requesterIdentityId: actor,
        version: '',
    };
    const history = stateHistoryFrom(
        documentLifecycleEvents([...existing, incoming]),
        id,
    );
    const document = trioDocumentFromBody(id, raw);
    const current = currentLifecycleEvent(history)!;
    return entityOf(document, organization, current);
}

async function streamedTrioWriteBody(
    db: DbAdapter,
    wiring: DocumentFamilyWiring,
    id: Id,
    body: Record<string, unknown>,
    actor: Id,
    organization: Id,
): Promise<unknown> {
    const raw = withoutId(body);
    wiring.validateDocument(raw);
    const prefix = canonicalUriCollection(
        organization,
        '/' + wiring.family + '/',
    );
    return streamedTrioEntityOf(
        db, prefix, id, raw, actor, organization,
        wiring.entityOf,
    );
}

// Live G1 write body: mapper over the chain including this
// write. Undefined means the caller uses successBody.
export async function resolveStreamedTrioWriteBody(
    db: DbAdapter,
    routePattern: string,
    params: string[],
    body: Record<string, unknown> | undefined,
    actor: Id,
    organization: Id | undefined,
): Promise<unknown | undefined> {
    if (body === undefined) return undefined;
    if (routePattern === RECORD_TYPE_DETAIL_PATTERN) {
        const org = param(params, 0);
        const id = param(params, 1);
        validateRecordDocumentBody(withoutId(body));
        return streamedTrioEntityOf(
            db,
            recordTypesUriPrefix(org),
            id,
            body,
            actor,
            org,
            (document, organization, current) =>
                recordTypeEntityOf(
                    document, organization, current!,
                ),
        );
    }
    const family = idFamilyOf(routePattern);
    if (
        family === undefined
        || !STREAM_TRIO_FAMILIES.has(family)
    ) {
        return undefined;
    }
    const wiring = documentFamilyWiring(family);
    if (wiring === undefined) return undefined;
    return streamedTrioWriteBody(
        db,
        wiring,
        param(params, 0),
        body,
        actor,
        organization ?? '',
    );
}

// The registration-first consult (Phase 8 Task 3, the first
// global-plane families: members/ai-members/human-members,
// organizationNested:false) — mirrors canonicalUriCollection's own
// registration-first pattern (message-pair.ts): a family's
// registration decides whether organization_id belongs on the
// wire response AT ALL, never a blanket stamp. One clause
// overstates the mirror: their UNREGISTERED-family fallbacks
// point opposite ways — this consult defaults to STAMPING
// organization_id, while canonicalUriCollection defaults per its
// own tier rule instead (dead code today — every wired family
// is registered). For the eight org-nested families registered
// before this task, the stamp below was a no-op — their
// entities already carry organization_id, so the spread
// overwrote the stamp with the SAME value the fence resolved
// (Step 0(a) of the task that added this consult re-confirmed
// key-set/value equality against today's hand-written bodies).
// But for a organizationNested: false family, the entity
// carries NO such field, so the unconditional stamp was a
// wire-visible EXTRA KEY with no hand-written counterpart —
// this consult omits the line entirely for that class instead
// of spreading over it.
//
// G1 trio families emit wiring.entityOf (id first, trio last
// as GET does) instead of the entity-only echo. Live writes
// prefer resolveStreamedTrioWriteBody (chain-current trio).
// G2 flows emit flowEntityOf minus hasUndoHistory.
// G3 stateless families emit wiring.entityOf (GET derive).
export function documentWriteResponseSpec(
    wiring: DocumentFamilyWiring,
): WriteResponseSpec {
    const organizationNested =
        familyRegistration(wiring.family)?.organizationNested
            !== false;
    const streamTrio = STREAM_TRIO_FAMILIES.has(
        wiring.family,
    );
    const streamStateless = STREAM_STATELESS_FAMILIES.has(
        wiring.family,
    );
    return {
        status: HTTP_OK,
        successBody: (params, body, actor, organization) => {
            const raw = withoutId(body ?? {});
            const doc = wiring.validateDocument(raw) as {
                entity: Record<string, unknown>;
            };
            if (streamTrio) {
                const id = param(params, 0);
                return wiring.entityOf(
                    trioDocumentFromBody(id, raw),
                    organization ?? '',
                    trioCurrentFromBody(id, raw, actor),
                );
            }
            if (wiring.family === 'flows') {
                return flowStoredEntityOf(
                    trioDocumentFromBody(
                        param(params, 0), raw,
                    ),
                    organization ?? '',
                );
            }
            if (streamStateless) {
                return wiring.entityOf(
                    trioDocumentFromBody(
                        param(params, 0), raw,
                    ),
                    organization ?? '',
                );
            }
            return organizationNested
                ? {
                    id: param(params, 0),
                    organization_id: organization,
                    ...doc.entity,
                }
                : {
                    id: param(params, 0),
                    ...doc.entity,
                };
        },
    };
}
