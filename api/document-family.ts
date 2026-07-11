import type { DbAdapter } from './db.ts';
import { EntityNotFoundError } from './db.ts';
import type { Id } from './types.ts';
import type { MessagePair } from './message-pair.ts';
import { canonicalUriPrefix } from './message-pair.ts';
import { familyRegistration } from './family-registry.ts';
import { missedReadError } from './derive-states.ts';
import {
    deriveDocumentsAt,
    documentPairsAt,
    documentLifecycleEvents,
    stateHistoryFrom,
    currentDocumentState,
    byIdAscending,
    DELETED_STATE,
    type DerivedDocument,
    type DocumentPair,
} from './derive-documents.ts';
import type {
    Route,
    GetHandler,
    PutHandler,
    WriteResponseSpec,
} from './routes.ts';

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
    // stamped by the caller).
    readonly entityOf: (
        document: DerivedDocument, organization: Id,
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
async function throwDocumentMiss(
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

// The generic per-id derivation: fetch the family's prefix ONCE,
// reduce to the head document (deriveDocumentsAt), and — for a
// 'trio' family ONLY — walk the lifecycle history
// (documentLifecycleEvents/stateHistoryFrom/currentDocumentState)
// over the SAME pairs to 404 a lifecycle-deleted document too,
// matching what deriveIdea/deriveProject compute. A 'stateless'
// family's document body carries no trio
// (documentLifecycleEvents' pickString would throw on its
// absence), so its ONLY tombstone signal is a DELETE-method head
// — already 404-absent via deriveDocumentsAt above, needing no
// further walk. Soft-deleted foreign docs miss the caller
// prefix and 403 via the global probe.
async function derivedDocumentEntity(
    wiring: DocumentFamilyWiring,
    db: DbAdapter,
    organization: Id,
    id: Id,
): Promise<unknown> {
    const prefix = canonicalUriPrefix(
        organization, '/' + wiring.family + '/',
    );
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', prefix),
        db.responses.getAllWhere('uri_prefix', prefix),
    ]);
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

// The document's own head pair id — DerivedDocument.pairId,
// "the advertisable Response-ID" (derive-documents.ts) — over
// the SAME (requests, responses) fetch and the SAME reduction
// (deriveDocumentsAt) derivedDocumentEntity runs to build the
// entity. Mirrors headPairIdAt's own (db, uriPrefix, uriId)
// shape (message-pair.ts) so a caller already holding a
// family-prefixed uriPrefix swaps the source with no other
// change, but computes the DOCUMENT head (2xx PUT/DELETE pairs
// only) rather than headPairIdAt's LOCK head (any method, any
// status) — a locked family's GET Response-ID attach (api.ts)
// is the one caller: a document-class address (design decision
// 6) exposes only PUT at flows/:id, so the two reductions agree
// in practice (pinned by a test), but this is now ONE mechanism
// computing the concept, not two independently-maintained ones.
export async function documentHeadPairId(
    db: DbAdapter,
    uriPrefix: string,
    id: Id,
): Promise<string | undefined> {
    const [requests, responses] = await Promise.all([
        db.requests.getAllWhere('uri_prefix', uriPrefix),
        db.responses.getAllWhere('uri_prefix', uriPrefix),
    ]);
    return deriveDocumentsAt(requests, responses, uriPrefix)
        .get(id)?.pairId;
}

// The route body is UNCHANGED dispatch to the documentOp for
// BOTH concurrency classes — the locked/simple divide is
// resolved entirely upstream, at the gate (api.ts's four-outcome
// table decides follows/supersedes/412 BEFORE this handler ever
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
        const prefix = canonicalUriPrefix(
            organizationId, '/' + wiring.family + '/',
        );
        const [requests, responses] = await Promise.all([
            db.requests.getAllWhere('uri_prefix', prefix),
            db.responses.getAllWhere('uri_prefix', prefix),
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
        const rows: { id: Id }[] = [];
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
            }
            rows.push(
                wiring.entityOf(
                    document, organizationId,
                ) as { id: Id },
            );
        }
        return rows.sort(byIdAscending);
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

// The registration-first consult (Phase 8 Task 3, the first
// global-plane families: members/ai-members/human-members,
// organizationNested:false) — mirrors canonicalUriPrefix's own
// registration-first pattern (message-pair.ts): a family's
// registration decides whether organization_id belongs on the
// wire response AT ALL, never a blanket stamp. One clause
// overstates the mirror: their UNREGISTERED-family fallbacks
// point opposite ways — this consult defaults to STAMPING
// organization_id, while canonicalUriPrefix defaults per its
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
export function documentWriteResponseSpec(
    wiring: DocumentFamilyWiring,
): WriteResponseSpec {
    const organizationNested =
        familyRegistration(wiring.family)?.organizationNested
            !== false;
    return {
        status: 200,
        successBody: (params, body, _actor, organization) => {
            const doc = wiring.validateDocument(
                withoutId(body ?? {}),
            ) as { entity: Record<string, unknown> };
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
