import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type {
    Id, MessagePairEntity, StateEntity,
} from '../shared/types.ts';
import type { MessagePair } from './message-pair.ts';
import { canonicalPath } from './message-pair.ts';
import { familyRegistration } from './family-registry.ts';
import { missedReadError } from './derive-states.ts';
import {
    documentMessagePairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    bodyOf,
    headDocumentOf,
    documentIsTombstone,
    type DerivedDocument,
} from './derive-documents.ts';
import type {
    Route,
    GetHandler,
    PutHandler,
    WriteResponseSpec,
} from './routes.ts';
import { liveHeadId, messageStore } from
    './message-store.ts';
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
    // HTTP nest. Storage prefix is still
    // /${family}/ under the fenced organization.
    readonly httpNest: 'global' | 'organization';
    // A 'state' family carries domain `state` in every
    // document body; a head whose state is `deleted` is a
    // tombstone. A 'stateless' family carries entity fields
    // only; its lifecycle, if any, lives in operation-path
    // event pairs, never the document.
    readonly lifecycle: 'state' | 'stateless';
    // The identifier the wire 404 body speaks —
    // EntityNotFoundError's table. Family name for ideas/
    // projects/flows; 'work_orders' for work-orders (the
    // first family whose storage table name differs from its
    // family name).
    readonly notFoundTable: string;
    // Validates the full wire document (entity + state [+
    // family extras]); throws ValidationError.
    readonly validateDocument:
        (body: Record<string, unknown>) => unknown;
    // The family's decompose op (old-plane rows + pair). The
    // fenced organization is for a family whose version
    // carries it; the others ignore it.
    readonly documentOp: (
        db: DbAdapter, id: Id,
        body: Record<string, unknown>, actor: Id,
        messagePair: MessagePair | undefined,
        organization: Id | undefined,
    ) => Promise<unknown>;
    // Head-pair body -> wire entity (id + organization_id
    // stamped by the caller). A 'state' family's mapper reads
    // `state` from the body like every other field.
    readonly entityOf: (
        document: DerivedDocument,
        organization: Id,
    ) => object;
}

// The per-family wiring table — grown family by family (ideas,
// projects, flows, work-orders, records, record-attributes) —
// never consulted through anything but documentFamilyWiring: the
// gate (api.ts) treats membership here as "this route is
// served via documentPutHandler". Exported (a mutable table,
// like FAMILY_REGISTRY) so tests can register a SYNTHETIC
// family for the duration of a test.
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

// Live document ids at a global-plane family prefix.
// Used by the flow write-path graph law to tell AI
// member ids from person members and to confirm an
// agentId names a live /ai-agents document.
export async function liveGlobalDocumentIds(
    db: DbAdapter,
    family: string,
): Promise<Set<string>> {
    const prefix = canonicalPath(
        undefined, '/' + family + '/',
    );
    const live = await messageStore(db).getCollection(
        prefix,
    );
    return new Set(live.map(liveHeadId));
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

// The generic per-id read: the live PUT head at this
// document. No head is a miss. For a 'state' family a head
// whose body says `deleted` is a miss too. Both take the
// throwDocumentMiss ladder, so 403 and 404 are unchanged.
async function derivedDocumentEntity(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<unknown> {
    const prefix = canonicalPath(
        organization, '/' + wiring.family + '/',
    );
    const head = await messageStore(db).getDocumentHead(
        prefix, id,
    );
    if (head === null) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    const document = headDocumentOf(head);
    if (
        wiring.lifecycle === 'state'
        && documentIsTombstone(document)
    ) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    return wiring.entityOf(document, organization);
}

function collectionSegments(
    wiring: DocumentFamilyWiring,
): string[] {
    if (wiring.httpNest === 'organization') {
        return [
            'organizations', ':id',
            wiring.family, '',
        ];
    }
    return [wiring.family, ''];
}

function entitySegments(
    wiring: DocumentFamilyWiring,
): string[] {
    if (wiring.httpNest === 'organization') {
        return [
            'organizations', ':id',
            wiring.family, ':id',
        ];
    }
    return [wiring.family, ':id'];
}

export function entityIdParam(
    wiring: DocumentFamilyWiring,
    params: string[],
): string {
    const index =
        wiring.httpNest === 'organization' ? 1 : 0;
    return param(params, index);
}

export function documentGetHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    return (db, params, _actor, organization) =>
        derivedDocumentEntity(
            wiring, db, requireOrganization(organization),
            entityIdParam(wiring, params),
        );
}

// Live PUT pair id at this document — the store's document
// head read (`messageStore(db).getDocumentHead`). A DELETE head or
// virgin document is undefined.
export async function documentHeadMessagePairId(
    db: DbAdapter,
    path: string,
    id: Id,
): Promise<string | undefined> {
    const stored = await messageStore(db).getDocumentHead(
        path, id,
    );
    return stored?.id;
}

// The route body is plain dispatch to the documentOp for
// every conditional: the gate refuses by form before this
// handler runs, and the statement judges the latch, so
// documentPutHandler carries no conditional branch of its
// own.
export function documentPutHandler(
    wiring: DocumentFamilyWiring,
): PutHandler {
    return (db, params, body, actor, messagePair, organization) =>
        wiring.documentOp(
            db, entityIdParam(wiring, params),
            body, actor, messagePair, organization,
        );
}

export function documentEntityRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: entitySegments(wiring),
        get: documentGetHandler(wiring),
        put: documentPutHandler(wiring),
    };
}

// GET <family>/:id/versions/: wrap a family derive*StateHistory
// (ASC StateEntity[]) with (at, id) DESC so index 0 is
// current, and empty → missedReadError (403 foreign / 404
// absent) using the family's table name for an honest body.
// Does NOT change the derive's own ASC for other callers.
// Task 9 replaces the StateEntity[] list with entityOf
// snapshots. Stateless families already return entityOf.
export type DocumentStateHistoryDerive = (
    db: DbAdapter,
    organization: Id,
    entityId: Id,
) => Promise<StateEntity[]>;

export function documentStateHistoryHandler(
    wiring: DocumentFamilyWiring,
    deriveFn: DocumentStateHistoryDerive,
    tableName: string,
): GetHandler {
    return async (db, params, _actor, organization) => {
        const org = requireOrganization(organization);
        const id = entityIdParam(wiring, params);
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

// Find the pair at this document whose id is the advertised
// ETag. A foreign or absent pair is simply not in the
// collection — the caller's missedReadError ladder answers.
export async function lookupStoredRevision(
    db: DbAdapter,
    prefix: string,
    id: Id,
    etag: string,
): Promise<MessagePairEntity | undefined> {
    const messagePairs = await messageStore(db).getDocumentHistory(
        prefix, id,
    );
    return messagePairs.find(
        (row) => row.id === etag,
    );
}

export async function storedRevisionDocument(
    db: DbAdapter,
    prefix: string,
    id: Id,
    etag: string,
): Promise<DerivedDocument | undefined> {
    const found = await lookupStoredRevision(
        db, prefix, id, etag,
    );
    if (
        found === undefined
        || found.method !== PUT_METHOD
    ) {
        return undefined;
    }
    return {
        name: id,
        messagePairId: found.id,
        method: found.method,
        body: bodyOf(found.request),
    };
}

export async function versionSnapshotsAt(
    db: DbAdapter,
    prefix: string,
    id: Id,
    toEntity: (document: DerivedDocument) => object,
): Promise<Record<string, unknown>[]> {
    const stored = await messageStore(db).getDocumentHistory(
        prefix, id,
    );
    const messagePairs = documentMessagePairsAt(
        stored, prefix,
    ).filter((messagePair) => messagePair.name === id);
    const snapshots: Record<string, unknown>[] = [];
    for (const messagePair of messagePairs.toReversed()) {
        if (messagePair.method !== PUT_METHOD) continue;
        snapshots.push({
            ...toEntity({
                name: id,
                messagePairId: messagePair.id,
                method: messagePair.method,
                body: messagePair.body,
            }),
            etag: messagePair.id,
            at: messagePair.at,
            member_id: messagePair.requesterIdentityId,
        });
    }
    return snapshots;
}

async function documentStateHistoryAt(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<StateEntity[]> {
    const prefix = canonicalPath(
        organization, '/' + wiring.family + '/',
    );
    const stored = await messageStore(db).getDocumentHistory(
        prefix, id,
    );
    return stateHistoryFrom(
        documentLifecycleEvents(
            documentMessagePairsAt(
                stored, prefix,
            ).filter((messagePair) => messagePair.name === id),
        ),
        id,
    );
}

async function serveDocumentRevision(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
    etag: string,
): Promise<unknown> {
    const prefix = canonicalPath(
        organization, '/' + wiring.family + '/',
    );
    const found = await lookupStoredRevision(
        db, prefix, id, etag,
    );
    if (
        found === undefined
        || found.method !== PUT_METHOD
    ) {
        throw await throwDocumentMiss(
            wiring, db, organization, id,
        );
    }
    const body = bodyOf(found.request);
    const document: DerivedDocument = {
        name: id,
        messagePairId: found.id,
        method: found.method,
        body,
    };
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
            entityIdParam(wiring, params),
            param(params, params.length - 1),
        );
}

export function documentVersionListHandler(
    wiring: DocumentFamilyWiring,
): GetHandler {
    // Flow keeps StateEntity[] (deferred). The other
    // five wirings (identities, ai-agents, ideas,
    // projects, objectives) return entityOf snapshots
    // stamped with the pair facts (etag, at, member_id) —
    // beyond, not identical to, GET collection / GET :id.
    if (wiring.family === 'flows') {
        return documentStateHistoryHandler(
            wiring,
            (db, organization, id) =>
                documentStateHistoryAt(
                    wiring, db, organization, id,
                ),
            wiring.notFoundTable,
        );
    }
    return async (db, params, _actor, organization) => {
        const org = requireOrganization(organization);
        const id = entityIdParam(wiring, params);
        const prefix = canonicalPath(
            org, '/' + wiring.family + '/',
        );
        const snapshots = await versionSnapshotsAt(
            db, prefix, id,
            (document) => wiring.entityOf(document, org),
        );
        if (snapshots.length === 0) {
            throw await throwDocumentMiss(
                wiring, db, org, id,
            );
        }
        return snapshots;
    };
}

export function documentVersionListRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [
            ...entitySegments(wiring),
            'versions', '',
        ],
        get: documentVersionListHandler(wiring),
    };
}

export function documentVersionRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: [
            ...entitySegments(wiring),
            'versions', ':etag',
        ],
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
        const prefix = canonicalPath(
            organizationId, '/' + wiring.family + '/',
        );
        const heads =
            await db.messagePairs.getCollectionHeadPairs(
                prefix,
            );
        // Oldest live head (response_at, id) first. A 'state'
        // tombstone is omitted.
        const rows: unknown[] = [];
        for (const head of heads) {
            const document = headDocumentOf(head);
            if (
                wiring.lifecycle === 'state'
                && documentIsTombstone(document)
            ) continue;
            rows.push(wiring.entityOf(document, organizationId));
        }
        return rows;
    };
}

export function documentCollectionRoute(
    wiring: DocumentFamilyWiring,
): Route {
    return {
        segments: collectionSegments(wiring),
        get: documentCollectionGetHandler(wiring),
    };
}

// Stream families: the stored PUT body is the family's own
// entityOf over the incoming body — the same object GET
// reads from the head. Flows keeps flowStoredEntityOf.
const STREAM_FAMILIES: ReadonlySet<string> = new Set([
    'ideas',
    'projects',
    'objectives',
    'identities',
    'ai-agents',
]);

const ID_PATTERN_SUFFIX = '/:id';

const ORGANIZATION_NEST_PREFIX = 'organizations/:id/';

export function idFamilyOf(
    pattern: string,
): string | undefined {
    if (!pattern.endsWith(ID_PATTERN_SUFFIX)) {
        return undefined;
    }
    const rest = pattern.slice(
        0, -ID_PATTERN_SUFFIX.length,
    );
    if (rest.startsWith(ORGANIZATION_NEST_PREFIX)) {
        const family = rest.slice(
            ORGANIZATION_NEST_PREFIX.length,
        );
        if (family.includes('/')) return undefined;
        return family;
    }
    if (rest.includes('/')) return undefined;
    return rest;
}

function documentFromBody(
    id: Id,
    body: Record<string, unknown>,
): DerivedDocument {
    return {
        name: id,
        messagePairId: id,
        method: PUT_METHOD,
        body,
    };
}

// The registration-first consult (Phase 8 Task 3, the first
// global-plane families: identities/ai-agents,
// organizationNested:false) — mirrors canonicalPath's own
// registration-first pattern (message-pair.ts): a family's
// registration decides whether organization_id belongs on the
// wire response AT ALL, never a blanket stamp. One clause
// overstates the mirror: their UNREGISTERED-family fallbacks
// point opposite ways — this consult defaults to STAMPING
// organization_id, while canonicalPath defaults per its
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
// Stream families emit wiring.entityOf over the incoming
// body (id first, as GET does) instead of the entity-only
// echo — live writes included, the same object GET reads
// from the head.
// Flows emits flowStoredEntityOf over the incoming body.
export function documentWriteResponseSpec(
    wiring: DocumentFamilyWiring,
): WriteResponseSpec {
    const organizationNested =
        familyRegistration(wiring.family)?.organizationNested
            !== false;
    return {
        conditional: 'optional',
        successBody: (params, body, _actor, organization) => {
            const raw = withoutId(body ?? {});
            const doc = wiring.validateDocument(raw) as {
                entity: Record<string, unknown>;
            };
            const id = entityIdParam(wiring, params);
            if (STREAM_FAMILIES.has(wiring.family)) {
                return wiring.entityOf(
                    documentFromBody(id, raw),
                    organization ?? '',
                );
            }
            if (wiring.family === 'flows') {
                return flowStoredEntityOf(
                    documentFromBody(id, raw),
                    organization ?? '',
                );
            }
            return organizationNested
                ? {
                    id,
                    organization_id: organization,
                    ...doc.entity,
                }
                : {
                    id,
                    ...doc.entity,
                };
        },
    };
}
